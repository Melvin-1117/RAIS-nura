import os
import tempfile
import time
import gc
import math
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional

import httpx
import torch
import torchaudio
from pyannote.audio import Pipeline

from app.settings import settings

_pipeline = None
_local_asr_pipeline = None

# Keep CPU memory/threads predictable on developer machines.
try:
    torch.set_num_threads(max(1, int(settings.torch_num_threads)))
    torch.set_num_interop_threads(1)
except Exception:
    pass


def _maybe_release_models() -> None:
    global _pipeline, _local_asr_pipeline

    if not settings.release_models_after_request:
        return

    _pipeline = None
    _local_asr_pipeline = None

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    gc.collect()


def _finalize_result(result: Dict[str, Any]) -> Dict[str, Any]:
    return result


def _merge_adjacent_speaker_segments(
    segments: List[Dict[str, Any]],
    max_gap_seconds: float = 0.35,
) -> List[Dict[str, Any]]:
    if not segments:
        return []

    merged = [dict(segments[0])]
    for current in segments[1:]:
        last = merged[-1]
        same_speaker = current["speaker"] == last["speaker"]
        close_gap = (float(current["start"]) - float(last["end"])) <= max_gap_seconds

        if same_speaker and close_gap:
            last["end"] = round(max(float(last["end"]), float(current["end"])), 2)
            continue

        merged.append(dict(current))

    return merged


def _collapse_short_speaker_fragments(
    segments: List[Dict[str, Any]],
    min_total_seconds: float = 2.2,
) -> List[Dict[str, Any]]:
    if not segments:
        return []

    totals: Dict[str, float] = defaultdict(float)
    for segment in segments:
        totals[segment["speaker"]] += max(0.0, float(segment["end"]) - float(segment["start"]))

    short_speakers = {speaker for speaker, total in totals.items() if total < min_total_seconds}
    if not short_speakers:
        return segments

    dominant_speaker = max(totals.items(), key=lambda item: item[1])[0]
    rewritten: List[Dict[str, Any]] = []

    for index, segment in enumerate(segments):
        speaker = segment["speaker"]
        if speaker not in short_speakers:
            rewritten.append(dict(segment))
            continue

        # Reassign tiny speaker fragments to the nearest non-short neighboring speaker.
        replacement = None
        for left in range(index - 1, -1, -1):
            if segments[left]["speaker"] not in short_speakers:
                replacement = segments[left]["speaker"]
                break
        if replacement is None:
            for right in range(index + 1, len(segments)):
                if segments[right]["speaker"] not in short_speakers:
                    replacement = segments[right]["speaker"]
                    break
        if replacement is None:
            replacement = dominant_speaker

        rewritten.append({**segment, "speaker": replacement})

    return _merge_adjacent_speaker_segments(rewritten)


def _get_pipeline() -> Pipeline:
    global _pipeline

    if not settings.enable_pyannote_diarization:
        raise RuntimeError("Pyannote diarization is disabled by low-memory configuration.")

    if _pipeline is None:
        if not settings.hf_token:
            raise RuntimeError(
                "Missing Hugging Face token. Set HF_TOKEN in backend/.env before running diarization."
            )

        # PyTorch >=2.6 switched default torch.load(weights_only=True), which
        # breaks some pyannote checkpoints. Disable it for this trusted load.
        os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

        # PyTorch >=2.6 defaults to weights_only=True and may block legacy globals
        # used in pyannote checkpoints. Explicitly allow trusted TorchVersion.
        if hasattr(torch, "serialization") and hasattr(torch.serialization, "add_safe_globals"):
            torch.serialization.add_safe_globals([torch.torch_version.TorchVersion])

        _pipeline = Pipeline.from_pretrained(
            settings.pyannote_model,
            use_auth_token=settings.hf_token,
        )

        if torch.cuda.is_available():
            _pipeline.to(torch.device("cuda"))

    return _pipeline


def _preprocess_audio_to_wav_16k_mono(input_path: str) -> Dict:
    waveform, sample_rate = torchaudio.load(input_path)

    # Convert to mono by averaging channels when needed.
    if waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != settings.target_sample_rate:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sample_rate,
            new_freq=settings.target_sample_rate,
        )
        waveform = resampler(waveform)

    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    temp_wav.close()

    torchaudio.save(temp_wav.name, waveform, settings.target_sample_rate)
    duration_seconds = float(waveform.shape[1]) / float(settings.target_sample_rate)
    del waveform
    gc.collect()

    return {
        "path": temp_wav.name,
        "duration_seconds": round(duration_seconds, 2),
        "source_sample_rate": sample_rate,
        "output_sample_rate": settings.target_sample_rate,
    }


def _energy_to_distance(energy: float) -> str:
    if energy >= 0.2:
        return "Near"
    if energy >= 0.08:
        return "Mid"
    return "Far"


def _energy_to_intensity(energy: float) -> str:
    if energy >= 0.3:
        return "High"
    if energy >= 0.12:
        return "Medium"
    return "Low"


def _mock_sound_label(index: int, energy: float) -> Dict:
    catalog = [
        ("fan hum", "Artificial"),
        ("keyboard click", "Artificial"),
        ("rain", "Natural"),
        ("cough", "Human Activity"),
        ("music bed", "Music"),
        ("bird chirp", "Animal"),
    ]
    base = catalog[index % len(catalog)]
    if energy > 0.35:
        return {"label": "speech bleed", "category": "Human Activity"}
    return {"label": base[0], "category": base[1]}


def _build_sound_events(segments: List[Dict], duration_seconds: float) -> List[Dict]:
    if duration_seconds <= 0:
        return []

    events: List[Dict] = []
    fallback_windows = segments if segments else [{"start": 0.0, "end": min(duration_seconds, 2.5), "speaker": "Ambient"}]

    for index, segment in enumerate(fallback_windows):
        seg_duration = max(0.1, float(segment["end"]) - float(segment["start"]))
        pseudo_energy = min(0.5, 0.05 + (seg_duration / 10.0) + (index % 4) * 0.04)
        label_info = _mock_sound_label(index, pseudo_energy)
        confidence = round(min(0.95, 0.45 + pseudo_energy), 2)

        events.append(
            {
                "start": round(float(segment["start"]), 2),
                "end": round(float(segment["end"]), 2),
                "label": label_info["label"],
                "category": label_info["category"],
                "distance": _energy_to_distance(pseudo_energy),
                "intensity": _energy_to_intensity(pseudo_energy),
                "confidence": confidence,
            }
        )

    return events


def _transcribe_with_whisper(audio_path: str) -> Dict[str, Any]:
    if not settings.whisper_api_key:
        return {"segments": [], "text": ""}

    base_url = settings.whisper_api_base_url.rstrip("/")
    endpoint = f"{base_url}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.whisper_api_key}"}

    with open(audio_path, "rb") as file_stream:
        files = {
            "file": (os.path.basename(audio_path), file_stream, "audio/wav"),
        }
        data = {
            "model": settings.whisper_model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "segment",
        }

        response = httpx.post(
            endpoint,
            headers=headers,
            files=files,
            data=data,
            timeout=settings.whisper_timeout_seconds,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Whisper API request failed ({response.status_code}): {response.text[:300]}"
        )

    payload = response.json()
    segments = payload.get("segments") or []
    text = str(payload.get("text") or "").strip()

    normalized_segments: List[Dict[str, Any]] = []
    for segment in segments:
        seg_text = str(segment.get("text") or "").strip()
        if not seg_text:
            continue

        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        if end <= start:
            end = start + 0.4

        normalized_segments.append(
            {
                "start": round(start, 2),
                "end": round(end, 2),
                "text": seg_text,
            }
        )

    return {"segments": normalized_segments, "text": text}


def _distribute_text_across_segments(
    segments: List[Dict[str, Any]],
    text: str,
) -> List[Dict[str, Any]]:
    if not segments:
        return []

    clean_text = re.sub(r"\s+", " ", (text or "")).strip()
    if not clean_text:
        return []

    words = clean_text.split(" ")
    segment_count = len(segments)
    chunk_size = max(1, math.ceil(len(words) / segment_count))
    chunks = [
        " ".join(words[i : i + chunk_size]).strip()
        for i in range(0, len(words), chunk_size)
    ]

    if len(chunks) > segment_count:
        head = chunks[: segment_count - 1]
        tail = " ".join(chunks[segment_count - 1 :]).strip()
        chunks = [*head, tail]
    elif len(chunks) < segment_count:
        chunks.extend([""] * (segment_count - len(chunks)))

    utterances: List[Dict[str, Any]] = []
    for segment, chunk in zip(segments, chunks):
        utterances.append(
            {
                "start": float(segment["start"]),
                "end": float(segment["end"]),
                "speaker": segment["speaker"],
                "text": chunk or "Speech detected in this segment.",
            }
        )

    return utterances


def _get_local_asr_pipeline():
    global _local_asr_pipeline

    if not settings.enable_local_asr_fallback:
        raise RuntimeError("Local ASR fallback is disabled by low-memory configuration.")

    if _local_asr_pipeline is None:
        try:
            from transformers import pipeline
        except Exception as exc:
            raise RuntimeError(
                "Local Whisper fallback is unavailable. Install transformers in backend env."
            ) from exc

        device = 0 if torch.cuda.is_available() else -1
        torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        _local_asr_pipeline = pipeline(
            task="automatic-speech-recognition",
            model=settings.local_asr_model,
            device=device,
            torch_dtype=torch_dtype,
        )

    return _local_asr_pipeline


def _transcribe_with_local_whisper(audio_path: str, duration_seconds: float) -> List[Dict[str, Any]]:
    asr = _get_local_asr_pipeline()
    waveform, sample_rate = torchaudio.load(audio_path)
    if waveform.size(0) > 1:
      waveform = waveform.mean(dim=0, keepdim=True)

    audio_input = {
        "array": waveform.squeeze(0).numpy(),
        "sampling_rate": sample_rate,
    }

    output = asr(
        audio_input,
        return_timestamps="word",
        chunk_length_s=settings.local_asr_chunk_length_seconds,
        batch_size=settings.local_asr_batch_size,
    )

    chunks = output.get("chunks") or []
    if chunks:
        segments: List[Dict[str, Any]] = []
        for chunk in chunks:
            text = str(chunk.get("text") or "").strip()
            timestamps = chunk.get("timestamp")
            if not text or not timestamps:
                continue

            start_ts = timestamps[0] if timestamps[0] is not None else 0.0
            end_ts = timestamps[1] if timestamps[1] is not None else start_ts
            start = round(float(start_ts), 2)
            end = round(float(end_ts), 2)
            if end <= start:
                end = round(min(duration_seconds, start + 0.4), 2)

            segments.append({"start": start, "end": end, "text": text})

        if segments:
            return segments

    text = str(output.get("text") or "").strip()
    if not text:
        return []

    return [
        {
            "start": 0.0,
            "end": round(max(0.1, duration_seconds), 2),
            "text": text,
        }
    ]


def _segment_overlap(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    start = max(start_a, start_b)
    end = min(end_a, end_b)
    return max(0.0, end - start)


def _attach_whisper_text_to_segments(segments: List[Dict], whisper_segments: List[Dict[str, Any]]) -> List[Dict]:
    if not segments or not whisper_segments:
        return []

    def pick_speaker_for_chunk(chunk_start: float, chunk_end: float) -> Optional[str]:
        best_speaker: Optional[str] = None
        best_overlap = 0.0
        chunk_duration = max(0.2, chunk_end - chunk_start)
        chunk_mid = (chunk_start + chunk_end) / 2.0
        nearest_distance = float("inf")
        nearest_speaker: Optional[str] = None

        for seg in segments:
            seg_start = float(seg["start"])
            seg_end = float(seg["end"])
            overlap = _segment_overlap(seg_start, seg_end, chunk_start, chunk_end)
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = seg["speaker"]

            if chunk_mid < seg_start:
                distance = seg_start - chunk_mid
            elif chunk_mid > seg_end:
                distance = chunk_mid - seg_end
            else:
                distance = 0.0

            if distance < nearest_distance:
                nearest_distance = distance
                nearest_speaker = seg["speaker"]

        overlap_ratio = best_overlap / chunk_duration
        if best_speaker is not None and (best_overlap >= 0.08 or overlap_ratio >= 0.2):
            return best_speaker

        # Fallback to nearest segment only when chunk midpoint is very close.
        if nearest_speaker is not None and nearest_distance <= 0.6:
            return nearest_speaker

        return None

    chunk_utterances: List[Dict[str, Any]] = []
    for chunk in whisper_segments:
        chunk_start = float(chunk.get("start", 0.0))
        chunk_end = float(chunk.get("end", chunk_start))
        if chunk_end <= chunk_start:
            chunk_end = chunk_start + 0.4

        text = str(chunk.get("text", "")).strip()
        if not text:
            continue

        speaker = pick_speaker_for_chunk(chunk_start, chunk_end)
        if speaker is None:
            continue

        chunk_utterances.append(
            {
                "start": round(chunk_start, 2),
                "end": round(chunk_end, 2),
                "speaker": speaker,
                "text": text,
            }
        )

    if not chunk_utterances:
        return []

    chunk_utterances.sort(key=lambda item: item["start"])
    merged: List[Dict[str, Any]] = [dict(chunk_utterances[0])]

    for current in chunk_utterances[1:]:
        last = merged[-1]
        same_speaker = current["speaker"] == last["speaker"]
        close_gap = (float(current["start"]) - float(last["end"])) <= 0.6
        if same_speaker and close_gap:
            last["end"] = round(max(float(last["end"]), float(current["end"])), 2)
            last["text"] = f"{last['text']} {current['text']}".strip()
        else:
            merged.append(dict(current))

    return merged


def _build_whisper_only_result(
    whisper_segments: List[Dict[str, Any]],
    processed_audio: Dict[str, Any],
    transcript_mode: str,
) -> Dict[str, Any]:
    duration_seconds = float(processed_audio["duration_seconds"])

    segments: List[Dict[str, Any]] = []
    utterances: List[Dict[str, Any]] = []

    for chunk in whisper_segments:
        start = round(float(chunk.get("start", 0.0)), 2)
        end = round(float(chunk.get("end", start)), 2)
        if end <= start:
            end = round(min(duration_seconds, start + 0.5), 2)

        text = str(chunk.get("text", "")).strip() or "(no transcribed text)"

        segments.append({"start": start, "end": end, "speaker": "Speaker 1"})
        utterances.append({"start": start, "end": end, "speaker": "Speaker 1", "text": text})

    if not segments:
        segments = [{"start": 0.0, "end": max(0.1, duration_seconds), "speaker": "Speaker 1"}]
        utterances = [
            {
                "start": 0.0,
                "end": max(0.1, duration_seconds),
                "speaker": "Speaker 1",
                "text": "Speech detected but no timestamped Whisper segments were returned.",
            }
        ]

    return {
        "total_speakers": 1,
        "segments": segments,
        "speaker_labels": ["Speaker 1"],
        "utterances": utterances,
        "sounds": [],
        "processing": {
            "duration_seconds": processed_audio["duration_seconds"],
            "source_sample_rate": processed_audio["source_sample_rate"],
            "output_sample_rate": processed_audio["output_sample_rate"],
            "transcript_mode": transcript_mode,
        },
    }


def _segments_too_sparse(segments: List[Dict[str, Any]], duration_seconds: float) -> bool:
    if not segments:
        return True

    # Expect roughly one timestamped chunk per 8-12 seconds for readable alignment.
    min_expected = max(4, int(duration_seconds / 12.0))
    return len(segments) < min_expected


def _build_no_diarization_placeholder_result(
    processed_audio: Dict[str, Any],
    message: str,
    transcript_mode: str,
) -> Dict[str, Any]:
    duration_seconds = float(processed_audio["duration_seconds"])
    segment = {
        "start": 0.0,
        "end": max(0.1, duration_seconds),
        "speaker": "Speaker 1",
    }

    return {
        "total_speakers": 1,
        "segments": [segment],
        "speaker_labels": ["Speaker 1"],
        "utterances": [
            {
                "start": segment["start"],
                "end": segment["end"],
                "speaker": "Speaker 1",
                "text": message,
            }
        ],
        "sounds": [],
        "processing": {
            "duration_seconds": processed_audio["duration_seconds"],
            "source_sample_rate": processed_audio["source_sample_rate"],
            "output_sample_rate": processed_audio["output_sample_rate"],
            "transcript_mode": transcript_mode,
        },
    }


def _normalize_assemblyai_utterances(utterances: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    speaker_name_map: Dict[str, str] = {}
    normalized_segments: List[Dict[str, Any]] = []
    normalized_utterances: List[Dict[str, Any]] = []

    for item in utterances:
        raw_speaker = str(item.get("speaker", "Unknown"))
        if raw_speaker not in speaker_name_map:
            speaker_name_map[raw_speaker] = f"Speaker {len(speaker_name_map) + 1}"

        speaker_name = speaker_name_map[raw_speaker]
        start = round(float(item.get("start", 0.0)) / 1000.0, 2)
        end = round(float(item.get("end", 0.0)) / 1000.0, 2)

        normalized_segments.append({"start": start, "end": end, "speaker": speaker_name})
        normalized_utterances.append(
            {
                "start": start,
                "end": end,
                "speaker": speaker_name,
                "text": str(item.get("text", "")).strip() or "(no transcribed text)",
            }
        )

    normalized_segments.sort(key=lambda value: value["start"])
    normalized_utterances.sort(key=lambda value: value["start"])

    return {
        "segments": normalized_segments,
        "utterances": normalized_utterances,
        "speaker_labels": sorted(set(seg["speaker"] for seg in normalized_segments)),
    }


def _transcribe_with_assemblyai_payload(audio_path: str, speaker_labels: bool) -> Dict[str, Any]:
    if not settings.assemblyai_api_key:
        return {}

    headers = {"authorization": settings.assemblyai_api_key}
    base_url = settings.assemblyai_base_url.rstrip("/")

    with open(audio_path, "rb") as file_stream:
        upload_response = httpx.post(
            f"{base_url}/upload",
            headers=headers,
            content=file_stream,
            timeout=120,
        )
    upload_response.raise_for_status()
    audio_url = upload_response.json().get("upload_url")
    if not audio_url:
        raise RuntimeError("AssemblyAI upload failed: missing upload_url")

    transcript_response = httpx.post(
        f"{base_url}/transcript",
        headers={**headers, "content-type": "application/json"},
        json={"audio_url": audio_url, "speaker_labels": speaker_labels},
        timeout=60,
    )
    transcript_response.raise_for_status()
    transcript_id = transcript_response.json().get("id")
    if not transcript_id:
        raise RuntimeError("AssemblyAI transcript request failed: missing transcript id")

    for _ in range(settings.assemblyai_poll_attempts):
        status_response = httpx.get(
            f"{base_url}/transcript/{transcript_id}",
            headers=headers,
            timeout=30,
        )
        status_response.raise_for_status()
        payload = status_response.json()
        status = payload.get("status")

        if status == "completed":
            return payload
        if status == "error":
            error_message = payload.get("error") or "Unknown AssemblyAI transcript failure"
            raise RuntimeError(f"AssemblyAI transcript failed: {error_message}")

        time.sleep(settings.assemblyai_poll_interval_seconds)

    raise RuntimeError("AssemblyAI transcript polling timed out")


def _transcribe_with_assemblyai(audio_path: str) -> List[Dict[str, Any]]:
    payload = _transcribe_with_assemblyai_payload(audio_path, speaker_labels=True)
    return payload.get("utterances") or []


def _build_assemblyai_transcript_only_result(
    payload: Dict[str, Any],
    processed_audio: Dict[str, Any],
) -> Dict[str, Any]:
    text = str(payload.get("text") or "").strip()
    if not text:
        text = "Speech detected but transcript text was empty."

    duration = max(0.1, float(processed_audio["duration_seconds"]))
    segment = {
        "start": 0.0,
        "end": round(duration, 2),
        "speaker": "Speaker 1",
    }

    utterance = {
        "start": segment["start"],
        "end": segment["end"],
        "speaker": segment["speaker"],
        "text": text,
    }

    return {
        "total_speakers": 1,
        "segments": [segment],
        "speaker_labels": ["Speaker 1"],
        "utterances": [utterance],
        "sounds": [],
        "processing": {
            "duration_seconds": processed_audio["duration_seconds"],
            "source_sample_rate": processed_audio["source_sample_rate"],
            "output_sample_rate": processed_audio["output_sample_rate"],
            "transcript_mode": "assemblyai_transcript_only_m1_m2",
        },
    }


def diarize_file(input_path: str) -> Dict:
    processed_audio = _preprocess_audio_to_wav_16k_mono(input_path)
    processed_path = processed_audio["path"]
    whisper_segments: List[Dict[str, Any]] = []
    whisper_error: str = ""
    assemblyai_error: str = ""
    diarization_error: str = ""
    local_whisper_segments: List[Dict[str, Any]] = []
    local_whisper_error: str = ""
    whisper_text: str = ""
    assemblyai_transcript_only_payload: Dict[str, Any] = {}
    diarized_segments: List[Dict[str, Any]] = []

    try:
        if settings.assemblyai_api_key:
            try:
                assemblyai_utterances = _transcribe_with_assemblyai(processed_path)
                normalized = _normalize_assemblyai_utterances(assemblyai_utterances)

                return _finalize_result({
                    "total_speakers": len(normalized["speaker_labels"]),
                    "segments": normalized["segments"],
                    "speaker_labels": normalized["speaker_labels"],
                    "utterances": normalized["utterances"],
                    "sounds": [],
                    "processing": {
                        "duration_seconds": processed_audio["duration_seconds"],
                        "source_sample_rate": processed_audio["source_sample_rate"],
                        "output_sample_rate": processed_audio["output_sample_rate"],
                        "transcript_mode": "assemblyai_m1_m2",
                    },
                })
            except Exception as exc:
                assemblyai_error = str(exc)
                try:
                    assemblyai_transcript_only_payload = _transcribe_with_assemblyai_payload(
                        processed_path,
                        speaker_labels=False,
                    )
                except Exception:
                    pass

        if settings.whisper_api_key:
            try:
                whisper_payload = _transcribe_with_whisper(processed_path)
                whisper_segments = whisper_payload.get("segments") or []
                whisper_text = str(whisper_payload.get("text") or "").strip()
            except Exception as exc:
                whisper_error = str(exc)

        should_try_local = settings.enable_local_asr_fallback and not whisper_segments
        if (
            settings.enable_local_asr_fallback
            and settings.prefer_local_asr_for_alignment
            and whisper_segments
            and _segments_too_sparse(whisper_segments, float(processed_audio["duration_seconds"]))
        ):
            should_try_local = True

        if should_try_local:
            try:
                local_whisper_segments = _transcribe_with_local_whisper(
                    processed_path,
                    float(processed_audio["duration_seconds"]),
                )
            except Exception as exc:
                local_whisper_error = str(exc)

        try:
            pipeline = _get_pipeline()
            diarization = pipeline(processed_path)
            speaker_name_map: Dict[str, str] = {}

            for turn, _, raw_speaker in diarization.itertracks(yield_label=True):
                if raw_speaker not in speaker_name_map:
                    speaker_name_map[raw_speaker] = f"Speaker {len(speaker_name_map) + 1}"

                diarized_segments.append(
                    {
                        "start": round(float(turn.start), 2),
                        "end": round(float(turn.end), 2),
                        "speaker": speaker_name_map[raw_speaker],
                    }
                )

            diarized_segments.sort(key=lambda item: item["start"])
            diarized_segments = _merge_adjacent_speaker_segments(diarized_segments)
            diarized_segments = _collapse_short_speaker_fragments(diarized_segments)
        except Exception as exc:
            diarization_error = str(exc)
    finally:
        if os.path.exists(processed_path):
            os.remove(processed_path)
        _maybe_release_models()

    transcript_segments: List[Dict[str, Any]] = []
    if whisper_segments and local_whisper_segments:
        if len(local_whisper_segments) >= len(whisper_segments):
            transcript_segments = local_whisper_segments
        else:
            transcript_segments = whisper_segments
    elif whisper_segments:
        transcript_segments = whisper_segments
    elif local_whisper_segments:
        transcript_segments = local_whisper_segments
    elif whisper_text:
        transcript_segments = [
            {
                "start": 0.0,
                "end": max(0.1, float(processed_audio["duration_seconds"])),
                "text": whisper_text,
            }
        ]
    elif assemblyai_transcript_only_payload:
        text = str(assemblyai_transcript_only_payload.get("text") or "").strip()
        if text:
            transcript_segments = [
                {
                    "start": 0.0,
                    "end": max(0.1, float(processed_audio["duration_seconds"])),
                    "text": text,
                }
            ]

    if diarized_segments:
        speaker_labels = sorted(list(set(seg["speaker"] for seg in diarized_segments)))
        utterances = _attach_whisper_text_to_segments(diarized_segments, transcript_segments)
        if not utterances and whisper_text:
            utterances = _distribute_text_across_segments(diarized_segments, whisper_text)
        transcript_mode = "pyannote_only_m1_m2"
        if transcript_segments is whisper_segments and whisper_segments:
            transcript_mode = "pyannote_plus_whisper_m1_m2"
        elif transcript_segments is local_whisper_segments and local_whisper_segments:
            transcript_mode = "pyannote_plus_local_whisper_m1_m2"
        elif assemblyai_transcript_only_payload:
            transcript_mode = "pyannote_plus_assemblyai_text_m1_m2"

        return _finalize_result({
            "total_speakers": len(speaker_labels),
            "segments": diarized_segments,
            "speaker_labels": speaker_labels,
            "utterances": utterances,
            "sounds": [],
            "processing": {
                "duration_seconds": processed_audio["duration_seconds"],
                "source_sample_rate": processed_audio["source_sample_rate"],
                "output_sample_rate": processed_audio["output_sample_rate"],
                "transcript_mode": transcript_mode,
            },
        })

    if assemblyai_transcript_only_payload:
        return _finalize_result(_build_assemblyai_transcript_only_result(
            payload=assemblyai_transcript_only_payload,
            processed_audio=processed_audio,
        ))

    if whisper_segments:
        return _finalize_result(_build_whisper_only_result(
            whisper_segments=whisper_segments,
            processed_audio=processed_audio,
            transcript_mode="whisper_m1_m2",
        ))

    if whisper_text:
        return _finalize_result(_build_whisper_only_result(
            whisper_segments=[
                {
                    "start": 0.0,
                    "end": max(0.1, float(processed_audio["duration_seconds"])),
                    "text": whisper_text,
                }
            ],
            processed_audio=processed_audio,
            transcript_mode="whisper_text_only_m1_m2",
        ))

    if local_whisper_segments:
        return _finalize_result(_build_whisper_only_result(
            whisper_segments=local_whisper_segments,
            processed_audio=processed_audio,
            transcript_mode="local_whisper_m1_m2",
        ))

    if assemblyai_error:
        return _finalize_result(_build_no_diarization_placeholder_result(
            processed_audio=processed_audio,
            message="AssemblyAI transcription failed. Using placeholder transcript.",
            transcript_mode="assemblyai_error_m1_m2",
        ))

    if whisper_error:
        return _finalize_result(_build_no_diarization_placeholder_result(
            processed_audio=processed_audio,
            message="Whisper transcription failed. Using placeholder transcript.",
            transcript_mode="whisper_error_m1_m2",
        ))

    if local_whisper_error:
        return _finalize_result(_build_no_diarization_placeholder_result(
            processed_audio=processed_audio,
            message="Local Whisper fallback failed. Using placeholder transcript.",
            transcript_mode="local_whisper_error_m1_m2",
        ))

    if diarization_error:
        diarization_message = "Diarization failed. Configure HF_TOKEN to enable speaker counting."
        if "disabled by low-memory configuration" in diarization_error.lower():
            diarization_message = (
                "Diarization is disabled by low-memory mode. "
                "Set ENABLE_PYANNOTE_DIARIZATION=true and restart backend."
            )

        return _finalize_result(_build_no_diarization_placeholder_result(
            processed_audio=processed_audio,
            message=diarization_message,
            transcript_mode="diarization_error_m1_m2",
        ))

    return _finalize_result(_build_no_diarization_placeholder_result(
        processed_audio=processed_audio,
        message="No transcription provider configured. Add AssemblyAI or Whisper API key.",
        transcript_mode="no_transcription_provider_m1_m2",
    ))
