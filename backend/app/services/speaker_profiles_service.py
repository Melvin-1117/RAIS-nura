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


def register_profile(name: str, audio_path: str) -> Dict[str, Any]:
    embedding, duration_seconds = extract_embedding(audio_path)
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
    max_seconds = 15.0
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
            os.remove(temp_path)
        except OSError:
            pass


def match_speakers(
    diarized_segments: List[Dict[str, Any]],
    audio_path: str,
    confidence_threshold: float = 0.85,
) -> Dict[str, Dict[str, Any]]:
    profiles = _load_profiles()
    if not profiles:
        speakers = sorted(set(seg["speaker"] for seg in diarized_segments))
        return {
            speaker: {
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            }
            for speaker in speakers
        }

    profile_vectors = []
    for profile in profiles:
        emb = profile.get("embedding") or []
        if not emb:
            continue
        profile_vectors.append((profile, torch.tensor(emb, dtype=torch.float32)))

    waveform, sample_rate = torchaudio.load(audio_path)
    if waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != settings.target_sample_rate:
        resampler = torchaudio.transforms.Resample(sample_rate, settings.target_sample_rate)
        waveform = resampler(waveform)
        sample_rate = settings.target_sample_rate

    result: Dict[str, Dict[str, Any]] = {}

    for speaker in sorted(set(seg["speaker"] for seg in diarized_segments)):
        speaker_segments = [seg for seg in diarized_segments if seg["speaker"] == speaker]
        emb = _segment_embedding(waveform, sample_rate, speaker_segments)
        if not emb:
            result[speaker] = {
                "display_name": "Unknown",
                "confidence": 0.0,
                "matched": False,
            }
            continue

        speaker_vec = torch.tensor(emb, dtype=torch.float32)
        best_name = None
        best_similarity = -1.0

        for profile, profile_vec in profile_vectors:
            sim = _cosine_similarity(speaker_vec, profile_vec)
            if sim > best_similarity:
                best_similarity = sim
                best_name = profile.get("name")

        # Map cosine similarity from [-1, 1] to [0, 1].
        confidence = max(0.0, min(1.0, (best_similarity + 1.0) / 2.0))
        matched = best_name is not None and confidence >= confidence_threshold

        if matched:
            result[speaker] = {
                "display_name": str(best_name),
                "confidence": round(confidence, 3),
                "matched": True,
            }
        else:
            result[speaker] = {
                "display_name": "Unknown",
                "confidence": round(confidence, 3),
                "matched": False,
            }

    return result
