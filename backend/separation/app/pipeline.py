from __future__ import annotations

import csv
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import soundfile as sf
import torch
import torchaudio

# Lazy globals to keep startup fast and avoid hard-failing when optional deps are missing.
_demucs_model = None
_yamnet_model = None
_yamnet_labels: List[str] = []
_tf = None
_tf_hub = None


def _coarse_category(label: str) -> str:
    value = label.lower()
    if any(token in value for token in ["speech", "conversation", "laughter", "cough", "sneeze"]):
        return "Human Activity"
    if any(token in value for token in ["music", "instrument", "song"]):
        return "Music"
    if any(token in value for token in ["dog", "cat", "bird", "animal", "insect"]):
        return "Animal"
    if any(token in value for token in ["wind", "rain", "thunder", "water", "fire"]):
        return "Natural"
    return "Artificial"


def _energy_to_distance(energy: float) -> str:
    if energy >= 0.35:
        return "Near"
    if energy >= 0.16:
        return "Mid"
    return "Far"


def _energy_to_intensity(energy: float) -> str:
    if energy >= 0.42:
        return "High"
    if energy >= 0.18:
        return "Medium"
    return "Low"


def _ensure_demucs_model() -> Any:
    global _demucs_model
    if _demucs_model is not None:
        return _demucs_model

    from demucs.pretrained import get_model  # type: ignore[import-not-found]

    _demucs_model = get_model("htdemucs")
    _demucs_model.cpu()
    _demucs_model.eval()
    return _demucs_model


def _ensure_yamnet_model() -> Tuple[Any, List[str], Any]:
    global _yamnet_model, _yamnet_labels, _tf, _tf_hub
    if _yamnet_model is not None and _yamnet_labels and _tf is not None:
        return _yamnet_model, _yamnet_labels, _tf

    import tensorflow as tf  # type: ignore
    import tensorflow_hub as hub  # type: ignore

    _tf = tf
    _tf_hub = hub
    _yamnet_model = hub.load("https://tfhub.dev/google/yamnet/1")

    class_map_csv = _yamnet_model.class_map_path().numpy().decode("utf-8")
    labels: List[str] = []
    with tf.io.gfile.GFile(class_map_csv) as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            labels.append(row["display_name"])

    _yamnet_labels = labels
    return _yamnet_model, _yamnet_labels, _tf


def preprocess_audio(input_path: str, output_sr: int = 16000) -> Dict[str, Any]:
    waveform, sample_rate = torchaudio.load(input_path)
    if waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != output_sr:
        resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=output_sr)
        waveform = resampler(waveform)

    processed = tempfile.NamedTemporaryFile(suffix="_m4_input.wav", delete=False)
    processed.close()
    torchaudio.save(processed.name, waveform, output_sr)

    duration_seconds = float(waveform.shape[1]) / float(output_sr)
    return {
        "path": processed.name,
        "duration_seconds": round(duration_seconds, 2),
        "source_sample_rate": int(sample_rate),
        "output_sample_rate": int(output_sr),
    }


def separate_with_demucs(processed_path: str, output_dir: str) -> Dict[str, Any]:
    model = _ensure_demucs_model()
    waveform, sr = torchaudio.load(processed_path)

    # Demucs expects 44.1k and stereo.
    target_sr = int(getattr(model, "samplerate", 44100))
    if sr != target_sr:
        waveform = torchaudio.transforms.Resample(sr, target_sr)(waveform)
        sr = target_sr

    if waveform.size(0) == 1:
        waveform = waveform.repeat(2, 1)

    from demucs.apply import apply_model  # type: ignore[import-not-found]

    with torch.no_grad():
        separated = apply_model(model, waveform.unsqueeze(0), device="cpu", progress=False)[0]

    sources = list(getattr(model, "sources", ["drums", "bass", "other", "vocals"]))
    source_map = {name: separated[index] for index, name in enumerate(sources)}

    vocals = source_map.get("vocals")
    if vocals is None:
        raise RuntimeError("Demucs output did not include vocals source")

    background_sources = [value for key, value in source_map.items() if key != "vocals"]
    background = torch.stack(background_sources, dim=0).sum(dim=0) if background_sources else torch.zeros_like(vocals)

    vocals_mono = vocals.mean(dim=0, keepdim=True)
    background_mono = background.mean(dim=0, keepdim=True)

    vocals_out = Path(output_dir) / "vocals.wav"
    bg_out = Path(output_dir) / "background.wav"

    torchaudio.save(str(vocals_out), vocals_mono, sr)
    torchaudio.save(str(bg_out), background_mono, sr)

    total_energy = float(torch.sqrt(torch.mean(torch.square(waveform.mean(dim=0, keepdim=True))))) + 1e-6
    vocals_energy = float(torch.sqrt(torch.mean(torch.square(vocals_mono))))
    bg_energy = float(torch.sqrt(torch.mean(torch.square(background_mono))))

    return {
        "vocals_path": str(vocals_out),
        "background_path": str(bg_out),
        "sample_rate": int(sr),
        "speech_energy_ratio": round(min(1.0, vocals_energy / total_energy), 3),
        "background_energy_ratio": round(min(1.0, bg_energy / total_energy), 3),
    }


def classify_background_sounds(background_path: str) -> List[Dict[str, Any]]:
    yamnet, labels, tf = _ensure_yamnet_model()

    waveform, sr = sf.read(background_path, dtype="float32")
    if waveform.ndim > 1:
        waveform = np.mean(waveform, axis=1)

    if sr != 16000:
        tensor = torch.from_numpy(waveform).unsqueeze(0)
        tensor = torchaudio.transforms.Resample(sr, 16000)(tensor)
        waveform = tensor.squeeze(0).numpy()
        sr = 16000

    scores, _, _ = yamnet(tf.convert_to_tensor(waveform))
    score_array = scores.numpy()

    patch_hop_seconds = 0.48
    patch_window_seconds = 0.96

    events: List[Dict[str, Any]] = []
    for patch_index, patch_scores in enumerate(score_array):
        class_index = int(np.argmax(patch_scores))
        confidence = float(patch_scores[class_index])
        if confidence < 0.22:
            continue

        start = round(patch_index * patch_hop_seconds, 2)
        end = round(start + patch_window_seconds, 2)

        s0 = int(start * sr)
        s1 = int(min(len(waveform), end * sr))
        if s1 <= s0:
            continue

        segment = waveform[s0:s1]
        rms = float(np.sqrt(np.mean(np.square(segment))) + 1e-8)
        norm_energy = min(1.0, rms / 0.3)

        label = labels[class_index] if class_index < len(labels) else "Unknown"

        events.append(
            {
                "start": start,
                "end": end,
                "label": label,
                "category": _coarse_category(label),
                "distance": _energy_to_distance(norm_energy),
                "intensity": _energy_to_intensity(norm_energy),
                "confidence": round(confidence, 2),
            }
        )

    # Merge adjacent same-label events for cleaner UI output.
    events.sort(key=lambda item: (item["start"], item["end"]))
    merged: List[Dict[str, Any]] = []
    for event in events:
        if (
            merged
            and merged[-1]["label"] == event["label"]
            and (event["start"] - merged[-1]["end"]) <= 0.2
        ):
            merged[-1]["end"] = event["end"]
            merged[-1]["confidence"] = round(max(merged[-1]["confidence"], event["confidence"]), 2)
            continue
        merged.append(dict(event))

    return merged[:60]


def run_full_pipeline(input_path: str, output_dir: str) -> Dict[str, Any]:
    os.makedirs(output_dir, exist_ok=True)

    processed = preprocess_audio(input_path)
    demucs_out = separate_with_demucs(processed["path"], output_dir)
    sounds = classify_background_sounds(demucs_out["background_path"])

    # Re-encode stems to 16k mono for downstream M2 and simpler mobile upload.
    vocals_wave, vocals_sr = torchaudio.load(demucs_out["vocals_path"])
    bg_wave, bg_sr = torchaudio.load(demucs_out["background_path"])

    if vocals_wave.size(0) > 1:
        vocals_wave = vocals_wave.mean(dim=0, keepdim=True)
    if bg_wave.size(0) > 1:
        bg_wave = bg_wave.mean(dim=0, keepdim=True)

    if vocals_sr != 16000:
        vocals_wave = torchaudio.transforms.Resample(vocals_sr, 16000)(vocals_wave)
    if bg_sr != 16000:
        bg_wave = torchaudio.transforms.Resample(bg_sr, 16000)(bg_wave)

    vocals_16k_path = Path(output_dir) / "vocals_16k.wav"
    background_16k_path = Path(output_dir) / "background_16k.wav"
    torchaudio.save(str(vocals_16k_path), vocals_wave, 16000)
    torchaudio.save(str(background_16k_path), bg_wave, 16000)

    try:
        os.remove(processed["path"])
    except OSError:
        pass

    return {
        "vocals_path": str(vocals_16k_path),
        "background_path": str(background_16k_path),
        "sounds": sounds,
        "processing": {
            "duration_seconds": processed["duration_seconds"],
            "source_sample_rate": processed["source_sample_rate"],
            "output_sample_rate": 16000,
            "speech_energy_ratio": demucs_out["speech_energy_ratio"],
            "background_energy_ratio": demucs_out["background_energy_ratio"],
        },
    }
