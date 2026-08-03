import os
import tempfile
import time
import gc
import math
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import httpx
import torch
import torchaudio
import huggingface_hub

# Compatibility patch for huggingface_hub >=0.23 where use_auth_token was renamed to token
_orig_hf_hub_download = huggingface_hub.hf_hub_download
def _patched_hf_hub_download(*args, **kwargs):
    if "use_auth_token" in kwargs:
        token_val = kwargs.pop("use_auth_token")
        if token_val and "token" not in kwargs:
            kwargs["token"] = token_val
    return _orig_hf_hub_download(*args, **kwargs)
huggingface_hub.hf_hub_download = _patched_hf_hub_download

from pyannote.audio import Pipeline

from app.settings import settings
from app.services.speaker_profiles_service import match_speakers

_pipeline = None
_local_asr_pipeline = None
_faster_whisper_model = None

# Keep CPU memory/threads predictable on developer machines.
try:
    torch.set_num_threads(max(1, int(settings.torch_num_threads)))
    torch.set_num_interop_threads(1)
except Exception:
    pass


def _maybe_release_models() -> None:
    global _pipeline, _local_asr_pipeline, _faster_whisper_model

    if not settings.release_models_after_request:
        return

    _pipeline = None
    _local_asr_pipeline = None
    _faster_whisper_model = None

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    gc.collect()


def _allow_whisper_fallback() -> bool:
    return True


def _sep_fields(sep: Dict[str, Any]) -> Dict[str, Any]:
    """Return the three separation-related processing fields."""
    return {
        "separation_confirmed": bool(sep.get("separation_confirmed", False)),
        "speech_energy_ratio": float(sep.get("speech_energy_ratio", 0.0)),
        "background_energy_ratio": float(sep.get("background_energy_ratio", 0.0)),
    }


def _merge_adjacent_speaker_segments(
    segments: List[Dict[str, Any]],
    max_gap_seconds: Optional[float] = None,
) -> List[Dict[str, Any]]:
    if not segments:
        return []

    threshold = (
        float(max_gap_seconds)
        if max_gap_seconds is not None
        else float(settings.speaker_merge_max_gap_seconds)
    )

    merged = [dict(segments[0])]
    for current in segments[1:]:
        last = merged[-1]
        same_speaker = current["speaker"] == last["speaker"]
        close_gap = (float(current["start"]) - float(last["end"])) <= threshold

        if same_speaker and close_gap:
            last["end"] = round(max(float(last["end"]), float(current["end"])), 2)
            continue

        merged.append(dict(current))

    return merged


def _collapse_short_speaker_fragments(
    segments: List[Dict[str, Any]],
    min_total_seconds: Optional[float] = None,
) -> List[Dict[str, Any]]:
    if not segments:
        return []

    threshold = (
        float(min_total_seconds)
        if min_total_seconds is not None
        else float(settings.short_speaker_threshold_seconds)
    )

    totals: Dict[str, float] = defaultdict(float)
    for segment in segments:
        totals[segment["speaker"]] += max(0.0, float(segment["end"]) - float(segment["start"]))

    short_speakers = {speaker for speaker, total in totals.items() if total < threshold}
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
    overall_energy_rms = float(torch.sqrt(torch.mean(torch.square(waveform)))) if waveform.numel() else 0.0
    overall_intensity = _energy_to_intensity(overall_energy_rms)
    del waveform
    gc.collect()

    return {
        "path": temp_wav.name,
        "duration_seconds": round(duration_seconds, 2),
        "source_sample_rate": sample_rate,
        "output_sample_rate": settings.target_sample_rate,
        "overall_energy_rms": round(overall_energy_rms, 4),
        "overall_intensity": overall_intensity,
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


def _separate_speech_and_background(processed_path: str) -> Dict[str, Any]:
    with torch.inference_mode():
        waveform, sr = torchaudio.load(processed_path)
        if waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        speech = torchaudio.functional.highpass_biquad(waveform, sample_rate=sr, cutoff_freq=120)
        speech = torchaudio.functional.lowpass_biquad(speech, sample_rate=sr, cutoff_freq=4200)
        background = waveform - speech

    speech_path = tempfile.NamedTemporaryFile(suffix="_speech.wav", delete=False)
    speech_path.close()
    background_path = tempfile.NamedTemporaryFile(suffix="_background.wav", delete=False)
    background_path.close()

    torchaudio.save(speech_path.name, speech, sr)
    torchaudio.save(background_path.name, background, sr)

    total_energy = float(torch.sqrt(torch.mean(torch.square(waveform)))) + 1e-6
    speech_energy = float(torch.sqrt(torch.mean(torch.square(speech))))
    bg_energy = float(torch.sqrt(torch.mean(torch.square(background))))

    del waveform
    del speech
    del background
    gc.collect()

    return {
        "speech_path": speech_path.name,
        "background_path": background_path.name,
        "speech_energy_ratio": round(min(1.0, speech_energy / total_energy), 3),
        "background_energy_ratio": round(min(1.0, bg_energy / total_energy), 3),
    }


def _classify_sound_event(rms: float, centroid: float, zcr: float, duration: float) -> Dict[str, str]:
    from app.services.sound_categorizer import get_category

    # Acoustic heuristics determine label; category is resolved via YAMNet map.
    if duration < 0.45 and rms > 0.16:
        label = "cough"
    elif centroid > 2200 and zcr > 0.12:
        label = "bird chirp"
    elif 900 <= centroid <= 2600 and rms > 0.09:
        label = "music"
    elif centroid < 500 and zcr < 0.05:
        label = "fan hum"
    elif zcr > 0.1 and rms < 0.12:
        label = "rain"
    else:
        label = "ambient noise"
    return {"label": label, "category": get_category(label)}


def _estimate_reverb_tail(envelope: torch.Tensor) -> float:
    peak = float(torch.max(envelope)) if envelope.numel() else 0.0
    if peak <= 1e-8:
        return 0.0
    threshold = peak * 0.25
    idx = torch.nonzero(envelope >= threshold).flatten()
    if idx.numel() == 0:
        return 0.0
    span = int(idx[-1] - idx[0])
    return max(0.0, span / 16000.0)


def _build_sound_events(
    background_path: str, duration_seconds: float, separation_status: str = "completed"
) -> List[Dict]:
    from app.services.sound_categorizer import categorize_background_stream

    result = categorize_background_stream(
        background_audio_path=background_path,
        separation_status=separation_status,
        duration_seconds=duration_seconds,
    )
    return result.get("sound_events", [])


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
    with torch.inference_mode():
        waveform, sample_rate = torchaudio.load(audio_path)
        if waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        audio_input = {
            "array": waveform.squeeze(0).numpy(),
            "sampling_rate": sample_rate,
        }

        generate_kwargs: Dict[str, Any] = {
            "task": "transcribe",
            "num_beams": max(1, int(settings.local_asr_num_beams)),
        }
        if settings.local_asr_language:
            generate_kwargs["language"] = settings.local_asr_language

        output = asr(
            audio_input,
            return_timestamps="word",
            chunk_length_s=settings.local_asr_chunk_length_seconds,
            batch_size=settings.local_asr_batch_size,
            generate_kwargs=generate_kwargs,
        )

    del waveform
    del audio_input
    gc.collect()

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


def _get_faster_whisper_model():
    global _faster_whisper_model
    if _faster_whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            _faster_whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        except Exception as exc:
            print(f"[faster-whisper Init ERROR] {exc}")
            _faster_whisper_model = None
    return _faster_whisper_model


def _resolve_overlapping_speech(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Handle edge case: Overlapping speech (two speakers detected in the same window).
    Assign to whichever speaker has the larger overlap in that segment.
    """
    if not segments:
        return []

    sorted_segs = sorted(segments, key=lambda x: (x["start"], x["end"]))
    resolved: List[Dict[str, Any]] = []

    for seg in sorted_segs:
        start = float(seg["start"])
        end = float(seg["end"])
        speaker = seg["speaker"]

        if start >= end:
            continue

        if not resolved:
            resolved.append(dict(seg))
            continue

        prev = resolved[-1]
        prev_start = float(prev["start"])
        prev_end = float(prev["end"])
        prev_speaker = prev["speaker"]

        overlap_start = max(start, prev_start)
        overlap_end = min(end, prev_end)
        overlap_len = max(0.0, overlap_end - overlap_start)

        if overlap_len > 0 and prev_speaker != speaker:
            prev_dur = prev_end - prev_start
            curr_dur = end - start

            if curr_dur > prev_dur:
                prev["end"] = round(overlap_start, 2)
            else:
                start = round(overlap_end, 2)
                if start >= end:
                    continue
                seg = {**seg, "start": start}

        resolved.append(dict(seg))

    return [s for s in resolved if float(s["end"]) > float(s["start"])]


def _get_faster_whisper_model():
    global _faster_whisper_model

    if _faster_whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if torch.cuda.is_available() else "int8"
            _faster_whisper_model = WhisperModel("tiny", device=device, compute_type=compute_type)
        except Exception as exc:
            print(f"[faster-whisper model load warning]: {exc}")
            _faster_whisper_model = None

    return _faster_whisper_model


def _transcribe_speaker_segments_faster_whisper(
    audio_path: str,
    segments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Slices audio region for each speaker segment identified by Pyannote/VAD and runs
    faster-whisper (CTranslate2) transcription on that slice.
    """
    model = _get_faster_whisper_model()
    if not model or not segments:
        return []

    resolved_segments = _resolve_overlapping_speech(segments)

    try:
        waveform, sr = torchaudio.load(audio_path)
        if waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
    except Exception as exc:
        print(f"[faster-whisper torchaudio load error]: {exc}")
        return []

    total_samples = waveform.size(1)
    utterances: List[Dict[str, Any]] = []

    for seg in resolved_segments:
        start_sec = max(0.0, float(seg["start"]))
        end_sec = float(seg["end"])
        duration = end_sec - start_sec

        if duration <= 0.0:
            continue

        start_frame = int(start_sec * sr)
        num_frames = max(1, int(duration * sr))
        if start_frame >= total_samples:
            continue
        end_frame = min(total_samples, start_frame + num_frames)

        slice_waveform = waveform[:, start_frame:end_frame]
        if slice_waveform.numel() == 0:
            continue

        with tempfile.NamedTemporaryFile(suffix="_slice.wav", delete=False) as tmp_slice:
            slice_path = tmp_slice.name

        try:
            torchaudio.save(slice_path, slice_waveform, sr)
            whisper_segments, _ = model.transcribe(
                slice_path,
                beam_size=3,
                word_timestamps=False,
                vad_filter=False,  # Retain short speech slices (<0.5s)
            )
            text_chunks = [s.text.strip() for s in whisper_segments if s.text and s.text.strip()]
            text = " ".join(text_chunks).strip()

            # Handle edge case: silence-only gaps between utterances — omit empty entries
            if not text:
                continue

            utterances.append({
                "speaker": seg["speaker"],
                "text": text,
                "start": round(start_sec, 2),
                "end": round(end_sec, 2),
            })
        except Exception as exc:
            print(f"[Slice Transcription Error {start_sec}-{end_sec}s]: {exc}")
        finally:
            if os.path.exists(slice_path):
                try:
                    os.remove(slice_path)
                except OSError:
                    pass

    # Sort final utterances array by `start` ascending
    utterances.sort(key=lambda u: (u["start"], u["end"]))
    return utterances


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
        if best_speaker is not None and (
            best_overlap >= float(settings.attach_min_overlap_seconds)
            or overlap_ratio >= float(settings.attach_min_overlap_ratio)
        ):
            return best_speaker

        # Fallback to nearest segment to avoid dropping chunks in sparse/gappy diarization.
        if nearest_speaker is not None and nearest_distance <= float(settings.attach_nearest_max_distance_seconds):
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


def _should_redistribute_text(
    utterances: List[Dict[str, Any]],
    speaker_labels: List[str],
    transcript_segments: List[Dict[str, Any]],
) -> bool:
    if not transcript_segments or not speaker_labels:
        return False

    if not utterances:
        return True

    # If diarization found multiple speakers but attribution only maps to one,
    # treat it as coarse alignment and rebalance text across diarized segments.
    unique_speakers = {str(item.get("speaker", "")).strip() for item in utterances if item.get("speaker")}
    unique_speakers.discard("")
    if len(speaker_labels) > 1 and len(unique_speakers) <= 1:
        return True

    if len(transcript_segments) <= 1 and len(speaker_labels) > 1 and len(utterances) <= 2:
        return True

    return False


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

        segments.append(
            {
                "start": start,
                "end": end,
                "speaker": "Speaker 1",
                "speaker_display": "Unknown",
                "speaker_confidence": 0.0,
            }
        )
        utterances.append(
            {
                "start": start,
                "end": end,
                "speaker": "Speaker 1",
                "speaker_display": "Unknown",
                "speaker_confidence": 0.0,
                "text": text,
            }
        )

    if not segments:
        segments = [
            {
                "start": 0.0,
                "end": max(0.1, duration_seconds),
                "speaker": "Speaker 1",
                "speaker_display": "Unknown",
                "speaker_confidence": 0.0,
            }
        ]
        utterances = [
            {
                "start": 0.0,
                "end": max(0.1, duration_seconds),
                "speaker": "Speaker 1",
                "speaker_display": "Unknown",
                "speaker_confidence": 0.0,
                "text": "Speech detected but no timestamped Whisper segments were returned.",
            }
        ]

    return {
        "total_speakers": 1,
        "segments": segments,
        "speaker_labels": ["Speaker 1"],
        "speaker_matches": [
            {
                "speaker": "Speaker 1",
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            }
        ],
        "utterances": utterances,
        "sounds": [],
        "processing": {
            "duration_seconds": processed_audio["duration_seconds"],
            "source_sample_rate": processed_audio["source_sample_rate"],
            "output_sample_rate": processed_audio["output_sample_rate"],
            "transcript_mode": transcript_mode,
            "overall_energy_rms": processed_audio["overall_energy_rms"],
            "overall_intensity": processed_audio["overall_intensity"],
        },
    }


def _segments_too_sparse(segments: List[Dict[str, Any]], duration_seconds: float) -> bool:
    if not segments:
        return True

    # Expect roughly one timestamped chunk per 8-12 seconds for readable alignment.
    baseline_expected = max(4, int(duration_seconds / 12.0))
    threshold_ratio = min(1.0, max(0.1, float(settings.sparse_transcript_ratio_threshold)))
    min_expected = max(1, int(math.ceil(baseline_expected * threshold_ratio)))
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
        "speaker_display": "Unknown",
        "speaker_confidence": 0.0,
    }

    return {
        "total_speakers": 1,
        "segments": [segment],
        "speaker_labels": ["Speaker 1"],
        "speaker_matches": [
            {
                "speaker": "Speaker 1",
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            }
        ],
        "utterances": [
            {
                "start": segment["start"],
                "end": segment["end"],
                "speaker": "Speaker 1",
                "speaker_display": "Unknown",
                "speaker_confidence": 0.0,
                "text": message,
            }
        ],
        "sounds": [],
        "processing": {
            "duration_seconds": processed_audio["duration_seconds"],
            "source_sample_rate": processed_audio["source_sample_rate"],
            "output_sample_rate": processed_audio["output_sample_rate"],
            "transcript_mode": transcript_mode,
            "overall_energy_rms": processed_audio["overall_energy_rms"],
            "overall_intensity": processed_audio["overall_intensity"],
        },
    }


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
                "speaker_display": speaker_name,
                "speaker_confidence": 1.0,
                "text": str(item.get("text", "")).strip() or "(no transcribed text)",
            }
        )

    normalized_segments.sort(key=lambda value: value["start"])
    normalized_utterances.sort(key=lambda value: value["start"])

    merge_gap = float(settings.speaker_merge_max_gap_seconds)

    # Merge consecutive same-speaker segments.
    merged_segments: List[Dict[str, Any]] = []
    for seg in normalized_segments:
        if merged_segments and seg["speaker"] == merged_segments[-1]["speaker"] and (float(seg["start"]) - float(merged_segments[-1]["end"])) <= merge_gap:
            merged_segments[-1]["end"] = round(max(float(merged_segments[-1]["end"]), float(seg["end"])), 2)
        else:
            merged_segments.append(dict(seg))

    # Merge consecutive same-speaker utterances.
    merged_utterances: List[Dict[str, Any]] = []
    for utt in normalized_utterances:
        if merged_utterances and utt["speaker"] == merged_utterances[-1]["speaker"] and (float(utt["start"]) - float(merged_utterances[-1]["end"])) <= merge_gap:
            merged_utterances[-1]["end"] = round(max(float(merged_utterances[-1]["end"]), float(utt["end"])), 2)
            merged_utterances[-1]["text"] = f"{merged_utterances[-1]['text']} {utt['text']}".strip()
        else:
            merged_utterances.append(dict(utt))

    return {
        "segments": merged_segments,
        "utterances": merged_utterances,
        "speaker_labels": sorted(set(seg["speaker"] for seg in merged_segments)),
    }


def diarize_file(input_path: str) -> Dict:
    processed_audio = _preprocess_audio_to_wav_16k_mono(input_path)
    processed_path = processed_audio["path"]
    m2_audio_path = processed_path
    separation_meta: Dict[str, Any] = {
        "separation_confirmed": False,
        "speech_energy_ratio": 0.0,
        "background_energy_ratio": 0.0,
        "speech_path": "",
        "background_path": "",
    }
    whisper_segments: List[Dict[str, Any]] = []
    whisper_error: str = ""
    diarization_error: str = ""
    local_whisper_segments: List[Dict[str, Any]] = []
    local_whisper_error: str = ""
    whisper_text: str = ""
    diarized_segments: List[Dict[str, Any]] = []
    faster_whisper_utterances: List[Dict[str, Any]] = []
    speaker_match_map: Dict[str, Dict[str, Any]] = {}
    sound_events: List[Dict[str, Any]] = []
    allow_whisper_fallback = _allow_whisper_fallback()

    try:
        if settings.enable_sound_separation:
            try:
                separation_meta = _separate_speech_and_background(processed_path)
                separation_meta["separation_confirmed"] = True
                m2_audio_path = str(separation_meta.get("speech_path") or processed_path)
                sound_events = _build_sound_events(
                    separation_meta["background_path"],
                    float(processed_audio["duration_seconds"]),
                )
            except Exception:
                separation_meta["separation_confirmed"] = False
                m2_audio_path = processed_path

        if allow_whisper_fallback and settings.whisper_api_key:
            try:
                whisper_payload = _transcribe_with_whisper(m2_audio_path)
                whisper_segments = whisper_payload.get("segments") or []
                whisper_text = str(whisper_payload.get("text") or "").strip()
            except Exception as exc:
                whisper_error = str(exc)

        should_try_local = allow_whisper_fallback and settings.enable_local_asr_fallback and not whisper_segments
        if (
            allow_whisper_fallback
            and
            settings.enable_local_asr_fallback
            and settings.prefer_local_asr_for_alignment
            and whisper_segments
            and _segments_too_sparse(whisper_segments, float(processed_audio["duration_seconds"]))
        ):
            should_try_local = True

        if should_try_local:
            try:
                local_whisper_segments = _transcribe_with_local_whisper(
                    m2_audio_path,
                    float(processed_audio["duration_seconds"]),
                )
            except Exception as exc:
                local_whisper_error = str(exc)

        try:
            pipeline = _get_pipeline()
            diarization = pipeline(m2_audio_path)
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

            try:
                faster_whisper_utterances = _transcribe_speaker_segments_faster_whisper(
                    m2_audio_path,
                    diarized_segments,
                )
            except Exception as fw_exc:
                print(f"[faster-whisper segment transcription error]: {fw_exc}")
                faster_whisper_utterances = []

            try:
                speaker_match_map = match_speakers(
                    diarized_segments,
                    m2_audio_path,
                    confidence_threshold=0.85,
                )
            except Exception:
                speaker_match_map = {
                    speaker: {
                        "display_name": "Unknown",
                        "confidence": 0.0,
                        "matched": False,
                    }
                    for speaker in set(seg["speaker"] for seg in diarized_segments)
                }
        except Exception as exc:
            diarization_error = str(exc)
    finally:
        if os.path.exists(processed_path):
            os.remove(processed_path)
        if separation_meta.get("speech_path") and os.path.exists(separation_meta["speech_path"]):
            os.remove(separation_meta["speech_path"])
        if separation_meta.get("background_path") and os.path.exists(separation_meta["background_path"]):
            os.remove(separation_meta["background_path"])
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
        if text:
            transcript_segments = [
                {
                    "start": 0.0,
                    "end": max(0.1, float(processed_audio["duration_seconds"])),
                    "text": text,
                }
            ]
    if diarized_segments:
        for seg in diarized_segments:
            match = speaker_match_map.get(seg["speaker"], {
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            })
            seg["speaker_display"] = match.get("display_name", "Unknown")
            seg["speaker_confidence"] = float(match.get("confidence") or 0.0)

        speaker_labels = sorted(list(set(seg["speaker"] for seg in diarized_segments)))
        if faster_whisper_utterances:
            utterances = faster_whisper_utterances
        else:
            utterances = _attach_whisper_text_to_segments(diarized_segments, transcript_segments)
            if not utterances and whisper_text:
                utterances = _distribute_text_across_segments(diarized_segments, whisper_text)

            if _should_redistribute_text(utterances, speaker_labels, transcript_segments):
                combined_text = " ".join(
                    str(item.get("text", "")).strip()
                    for item in transcript_segments
                    if str(item.get("text", "")).strip()
                ).strip()
                if combined_text:
                    long_segments = [
                        seg for seg in diarized_segments if (float(seg["end"]) - float(seg["start"])) >= 0.35
                    ]
                    target_segments = long_segments or diarized_segments
                    redistributed = _distribute_text_across_segments(target_segments, combined_text)
                    if redistributed:
                        utterances = redistributed

        if not utterances:
            utterances = [
                {
                    "speaker": seg["speaker"],
                    "text": "Speech segment detected.",
                    "start": float(seg["start"]),
                    "end": float(seg["end"]),
                }
                for seg in diarized_segments
            ]

        # Ensure utterances are sorted chronologically by start time ascending
        utterances.sort(key=lambda u: (float(u["start"]), float(u["end"])))

        for utterance in utterances:
            match = speaker_match_map.get(utterance["speaker"], {
                "speaker_name": "Unknown Speaker",
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            })
            utterance["speaker_name"] = match.get("speaker_name", "Unknown Speaker")
            utterance["confidence"] = float(match.get("confidence") or 0.0)
            utterance["speaker_display"] = match.get("display_name", "Unknown")
            utterance["speaker_confidence"] = float(match.get("confidence") or 0.0)

        speaker_matches = [
            {
                "speaker": speaker,
                "display_name": speaker_match_map.get(speaker, {}).get("display_name", "Unknown"),
                "confidence": float(speaker_match_map.get(speaker, {}).get("confidence") or 0.0),
                "matched": bool(speaker_match_map.get(speaker, {}).get("matched", False)),
            }
            for speaker in speaker_labels
        ]

        transcript_mode = "pyannote_only_m1_m2"
        if faster_whisper_utterances:
            transcript_mode = "pyannote_plus_faster_whisper_m2"
        elif transcript_segments is whisper_segments and whisper_segments:
            transcript_mode = "pyannote_plus_whisper_m1_m2"
        elif transcript_segments is local_whisper_segments and local_whisper_segments:
            transcript_mode = "pyannote_plus_local_whisper_m1_m2"

        return {
            "total_speakers": len(speaker_labels),
            "segments": diarized_segments,
            "speaker_labels": speaker_labels,
            "speaker_matches": speaker_matches,
            "utterances": utterances,
            "sounds": sound_events,
            "sound_events": sound_events,
            "processing": {
                "duration_seconds": processed_audio["duration_seconds"],
                "source_sample_rate": processed_audio["source_sample_rate"],
                "output_sample_rate": processed_audio["output_sample_rate"],
                "transcript_mode": transcript_mode,
                "overall_energy_rms": processed_audio["overall_energy_rms"],
                "overall_intensity": processed_audio["overall_intensity"],
                **_sep_fields(separation_meta),
            },
        }

        return {
            "total_speakers": len(speaker_labels),
            "speaker_labels": speaker_labels,
            "speaker_matches": [
                {"speaker": s, "display_name": s, "confidence": 1.0, "matched": True}
                for s in speaker_labels
            ],
            "sounds": sound_events,
            "processing": {
                "duration_seconds": processed_audio["duration_seconds"],
                "source_sample_rate": processed_audio["source_sample_rate"],
                "output_sample_rate": processed_audio["output_sample_rate"],
                "overall_energy_rms": processed_audio["overall_energy_rms"],
                "overall_intensity": processed_audio["overall_intensity"],
                **_sep_fields(separation_meta),
            },
        }

    if whisper_segments:
        result = _build_whisper_only_result(whisper_segments, processed_audio, "whisper_m1_m2")
        result["sounds"] = sound_events
        result["processing"].update(_sep_fields(separation_meta))
        return result

    if whisper_text:
        result = _build_whisper_only_result(
            [{"start": 0.0, "end": max(0.1, float(processed_audio["duration_seconds"])), "text": whisper_text}],
            processed_audio,
            "whisper_text_only_m1_m2",
        )
        result["sounds"] = sound_events
        result["processing"].update(_sep_fields(separation_meta))
        return result

    if local_whisper_segments:
        result = _build_whisper_only_result(local_whisper_segments, processed_audio, "local_whisper_m1_m2")
        result["sounds"] = sound_events
        result["processing"].update(_sep_fields(separation_meta))
        return result

    def _error_result(message: str, mode: str) -> Dict[str, Any]:
        r = _build_no_diarization_placeholder_result(processed_audio, message, mode)
        r["sounds"] = sound_events
        r["processing"].update(_sep_fields(separation_meta))
        return r


    if whisper_error:
        return _error_result("No speech detected in this audio file.", "whisper_error_m1_m2")

    if local_whisper_error:
        return _error_result("No speech detected in this audio file.", "local_whisper_error_m1_m2")

    if diarization_error:
        return _error_result("No speech detected in this audio file.", "diarization_error_m1_m2")

    return _error_result("No speech detected in this audio file.", "no_transcription_provider_m1_m2")
