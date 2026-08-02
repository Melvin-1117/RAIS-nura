import json
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import torch
import torchaudio

from app.settings import settings

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
PROFILES_FILE = DATA_DIR / "speaker_profiles.json"


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILES_FILE.exists():
        PROFILES_FILE.write_text("[]", encoding="utf-8")


def _load_profiles() -> List[Dict[str, Any]]:
    _ensure_store()
    try:
        payload = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
    except Exception:
        payload = []
    if not isinstance(payload, list):
        return []
    return payload


def _save_profiles(profiles: List[Dict[str, Any]]) -> None:
    _ensure_store()
    PROFILES_FILE.write_text(json.dumps(profiles, indent=2), encoding="utf-8")


def _l2_normalize(vec: torch.Tensor) -> torch.Tensor:
    norm = torch.norm(vec, p=2)
    if float(norm) <= 1e-8:
        return vec
    return vec / norm


def extract_embedding(audio_path: str) -> Tuple[List[float], float]:
    waveform, sample_rate = torchaudio.load(audio_path)
    if waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != settings.target_sample_rate:
        resampler = torchaudio.transforms.Resample(sample_rate, settings.target_sample_rate)
        waveform = resampler(waveform)
        sample_rate = settings.target_sample_rate

    duration_seconds = float(waveform.shape[1]) / float(sample_rate)

    mfcc = torchaudio.transforms.MFCC(
        sample_rate=sample_rate,
        n_mfcc=40,
        melkwargs={"n_fft": 1024, "hop_length": 256, "n_mels": 64},
    )(waveform)

    mean_vec = mfcc.mean(dim=2).squeeze(0)
    std_vec = mfcc.std(dim=2).squeeze(0)
    feature = torch.cat([mean_vec, std_vec], dim=0)
    feature = _l2_normalize(feature).to(torch.float32)
    return feature.tolist(), round(duration_seconds, 2)


def register_profile(name: str, audio_path: str, min_duration_seconds: float = 30.0) -> Dict[str, Any]:
    embedding, duration_seconds = extract_embedding(audio_path)
    if duration_seconds < min_duration_seconds:
        raise ValueError(
            f"Voice sample must be at least {int(min_duration_seconds)} seconds long for reliable recognition (provided {duration_seconds}s)."
        )

    profiles = _load_profiles()

    record = {
        "id": str(uuid.uuid4()),
        "name": name.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sample_duration_seconds": duration_seconds,
        "embedding": embedding,
    }

    profiles.append(record)
    _save_profiles(profiles)

    return {
        "id": record["id"],
        "name": record["name"],
        "created_at": record["created_at"],
        "sample_duration_seconds": record["sample_duration_seconds"],
    }


def list_profiles() -> List[Dict[str, Any]]:
    profiles = _load_profiles()
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "created_at": item["created_at"],
            "sample_duration_seconds": float(item.get("sample_duration_seconds", 0.0)),
        }
        for item in profiles
    ]


def delete_profile(profile_id: str) -> bool:
    profiles = _load_profiles()
    kept = [item for item in profiles if item.get("id") != profile_id]
    if len(kept) == len(profiles):
        return False
    _save_profiles(kept)
    return True


def _cosine_similarity(a: torch.Tensor, b: torch.Tensor) -> float:
    denom = float(torch.norm(a, p=2) * torch.norm(b, p=2))
    if denom <= 1e-8:
        return 0.0
    return float(torch.dot(a, b) / denom)


def _segment_embedding(
    waveform: torch.Tensor,
    sample_rate: int,
    segments: List[Dict[str, Any]],
) -> List[float]:
    _ensure_store()
    if not segments:
        return []

    chunks: List[torch.Tensor] = []
    max_seconds = 30.0
    consumed = 0.0

    for segment in sorted(segments, key=lambda item: float(item["start"])):
        start = max(0.0, float(segment["start"]))
        end = max(start, float(segment["end"]))
        if end <= start:
            continue

        take = min(end - start, max_seconds - consumed)
        if take <= 0:
            break

        start_idx = int(start * sample_rate)
        end_idx = int((start + take) * sample_rate)
        if end_idx <= start_idx:
            continue

        chunks.append(waveform[:, start_idx:end_idx])
        consumed += take

        if consumed >= max_seconds:
            break

    if not chunks:
        return []

    merged = torch.cat(chunks, dim=1)
    temp_path = DATA_DIR / f"_tmp_{uuid.uuid4().hex}.wav"
    try:
        torchaudio.save(str(temp_path), merged, sample_rate)
        embedding, _ = extract_embedding(str(temp_path))
        return embedding
    finally:
        try:
            if temp_path.exists():
                os.remove(temp_path)
        except OSError:
            pass


def match_speakers(
    diarized_segments: List[Dict[str, Any]],
    audio_path: str,
    confidence_threshold: float = 0.85,
) -> Dict[str, Dict[str, Any]]:
    profiles = _load_profiles()
    all_speakers = sorted(set(seg["speaker"] for seg in diarized_segments))

    # Edge case 5b: No profiles enrolled yet — skip matching entirely, all utterances stay with generic labels
    if not profiles:
        return {
            speaker: {
                "speaker_name": "Unknown Speaker",
                "display_name": "Unknown",
                "confidence": None,
                "matched": False,
            }
            for speaker in all_speakers
        }

    profile_vectors = []
    for profile in profiles:
        emb = profile.get("embedding") or []
        if not emb:
            continue
        profile_vectors.append((profile, torch.tensor(emb, dtype=torch.float32)))

    if not profile_vectors:
        return {
            speaker: {
                "speaker_name": "Unknown Speaker",
                "display_name": "Unknown",
                "confidence": None,
                "matched": False,
            }
            for speaker in all_speakers
        }

    waveform, sample_rate = torchaudio.load(audio_path)
    if waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != settings.target_sample_rate:
        resampler = torchaudio.transforms.Resample(sample_rate, settings.target_sample_rate)
        waveform = resampler(waveform)
        sample_rate = settings.target_sample_rate

    # Aggregate MFCC feature vector per diarization speaker ID across all their segments
    speaker_vectors: Dict[str, torch.Tensor] = {}
    best_raw_similarities: Dict[str, float] = {}

    for speaker in all_speakers:
        speaker_segments = [seg for seg in diarized_segments if seg["speaker"] == speaker]
        emb = _segment_embedding(waveform, sample_rate, speaker_segments)
        if emb:
            speaker_vectors[speaker] = torch.tensor(emb, dtype=torch.float32)

    # Collect candidate matches (similarity, speaker_id, profile_name)
    candidate_matches: List[Tuple[float, str, str]] = []
    for speaker, speaker_vec in speaker_vectors.items():
        best_sim = -1.0
        for profile, profile_vec in profile_vectors:
            sim = _cosine_similarity(speaker_vec, profile_vec)

            if sim > best_sim:
                best_sim = sim

            if sim >= confidence_threshold:
                candidate_matches.append((sim, speaker, str(profile.get("name", ""))))

        best_raw_similarities[speaker] = best_sim

    # Sort candidate matches by similarity descending
    candidate_matches.sort(key=lambda item: item[0], reverse=True)

    assigned_speakers: Dict[str, Tuple[str, float]] = {}
    assigned_profiles: set = set()

    # Edge case 5a: Greedy 1-to-1 assignment so multiple diarized speakers don't match the same profile
    for sim, speaker, prof_name in candidate_matches:
        if speaker not in assigned_speakers and prof_name not in assigned_profiles:
            assigned_speakers[speaker] = (prof_name, round(sim, 2))
            assigned_profiles.add(prof_name)

    result: Dict[str, Dict[str, Any]] = {}
    for speaker in all_speakers:
        if speaker in assigned_speakers:
            prof_name, conf = assigned_speakers[speaker]
            result[speaker] = {
                "speaker_name": prof_name,
                "display_name": prof_name,
                "confidence": conf,
                "matched": True,
            }
        else:
            raw_sim = best_raw_similarities.get(speaker, 0.0)
            result[speaker] = {
                "speaker_name": "Unknown Speaker",
                "display_name": "Unknown",
                "confidence": round(raw_sim, 2) if raw_sim > 0 else None,
                "matched": False,
            }

    return result

