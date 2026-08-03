import math
import os
from typing import Any, Dict, List, Literal, Tuple, Optional
import numpy as np

# Distance tiers
DistanceTier = Literal["Near", "Mid", "Far"]
NEAR_LABEL: DistanceTier = "Near"
MID_LABEL: DistanceTier = "Mid"
FAR_LABEL: DistanceTier = "Far"

# Named Feature Weight Constants
WEIGHT_RMS: float = 0.50
WEIGHT_ROLLOFF: float = 0.30
WEIGHT_REVERB: float = 0.20

# Short Segment (<0.5s) Fallback Weights (reverb weight zeroed out)
MIN_REVERB_DURATION_SECONDS: float = 0.50
WEIGHT_SHORT_RMS: float = 0.625
WEIGHT_SHORT_ROLLOFF: float = 0.375
WEIGHT_SHORT_REVERB: float = 0.0

# Distance Score Bin Thresholds
THRESHOLD_NEAR: float = 0.60  # Score >= 0.60 -> Near (<1m)
THRESHOLD_MID: float = 0.22   # 0.22 <= Score < 0.60 -> Mid (1-5m), Score < 0.22 -> Far (>5m)

# Reference acoustic normalization bounds
REFERENCE_MAX_RMS: float = 0.15
HIGH_FREQ_CUTOFF_HZ: float = 4000.0


def compute_rms_energy(segment_samples: np.ndarray) -> float:
    """Compute normalized RMS energy in [0.0, 1.0] scale."""
    if len(segment_samples) == 0:
        return 0.0
    rms = float(np.sqrt(np.mean(np.square(segment_samples))) + 1e-8)
    if rms < 0.003:
        return 0.0
    return float(min(1.0, max(0.0, (rms - 0.003) / 0.12)))


def compute_hf_attenuation(segment_samples: np.ndarray, sr: int = 16000) -> float:
    """
    Compute high-frequency loss above 4kHz relative to total spectrum.
    Returns attenuation score in [0.0, 1.0] where 1.0 = heavy HF attenuation (Far).
    """
    if len(segment_samples) < 16 or sr <= 0:
        return 0.5

    fft_mag = np.abs(np.fft.rfft(segment_samples))
    freqs = np.fft.rfftfreq(len(segment_samples), 1.0 / sr)
    total_energy = np.sum(fft_mag) + 1e-8

    hf_energy = np.sum(fft_mag[freqs >= HIGH_FREQ_CUTOFF_HZ])
    hf_ratio = float(hf_energy / total_energy)

    # Neutral 0.5 attenuation if high-frequency energy ratio is minimal (< 0.01)
    if hf_ratio < 0.01:
        return 0.50

    # Proximity high freq ratio: >= 0.25 is Near (hf_attenuation = 0.0)
    attenuation_score = float(max(0.0, min(1.0, 1.0 - (hf_ratio / 0.25))))
    return attenuation_score


def compute_reverb_tail_rt60(segment_samples: np.ndarray, sr: int = 16000) -> float:
    """
    Approximates reverb decay tail in [0.0, 1.0] scale.
    Longer decay tail relative to peak -> higher reverb score -> Far distance.
    """
    if len(segment_samples) < int(sr * MIN_REVERB_DURATION_SECONDS):
        return 0.0

    envelope = np.abs(segment_samples)
    peak = float(np.max(envelope)) if len(envelope) > 0 else 0.0
    if peak <= 1e-6:
        return 0.0

    threshold = peak * 0.25
    active_indices = np.where(envelope >= threshold)[0]
    if len(active_indices) < 2:
        return 0.0

    decay_span_samples = int(active_indices[-1] - active_indices[0])
    decay_time_seconds = decay_span_samples / float(sr)

    # Map decay duration (0.0s to 0.8s) to [0.0, 1.0]
    reverb_score = float(min(1.0, max(0.0, decay_time_seconds / 0.60)))
    return reverb_score


def estimate_distance_for_event(
    segment_samples: np.ndarray,
    sr: int = 16000,
    duration_seconds: Optional[float] = None,
) -> Tuple[DistanceTier, float]:
    """
    Computes spatial distance estimate (Near, Mid, Far) and raw distance score
    for a sound event segment audio.
    """
    if len(segment_samples) == 0:
        return MID_LABEL, 0.50

    actual_duration = duration_seconds if duration_seconds is not None else (len(segment_samples) / float(sr))

    # Feature 1: Normalized RMS Energy (Higher -> Near)
    norm_rms = compute_rms_energy(segment_samples)

    # Feature 2: High Frequency Attenuation (Higher attenuation -> Far, so (1 - attenuation) -> Near)
    hf_attenuation = compute_hf_attenuation(segment_samples, sr)
    hf_proximity = 1.0 - hf_attenuation

    # Feature 3: Reverb Decay Tail (Higher reverb -> Far, so (1 - reverb) -> Near)
    # EDGE CASE: Short segment (<0.5s) -> Reverb tail RT60 estimation is unreliable.
    # Fall back to RMS + roll-off only by zeroing reverb weight.
    if actual_duration < MIN_REVERB_DURATION_SECONDS:
        w_rms = WEIGHT_SHORT_RMS
        w_rolloff = WEIGHT_SHORT_ROLLOFF
        w_reverb = WEIGHT_SHORT_REVERB
        reverb_proximity = 0.50
    else:
        w_rms = WEIGHT_RMS
        w_rolloff = WEIGHT_ROLLOFF
        w_reverb = WEIGHT_REVERB
        reverb_score = compute_reverb_tail_rt60(segment_samples, sr)
        reverb_proximity = 1.0 - reverb_score

    # Weighted Proximity Score in [0.0, 1.0] where 1.0 = Very Near, 0.0 = Very Far
    raw_distance_score = float(
        w_rms * norm_rms + w_rolloff * hf_proximity + w_reverb * reverb_proximity
    )
    raw_distance_score = round(max(0.0, min(1.0, raw_distance_score)), 2)

    # Score-to-label threshold mapping
    if raw_distance_score >= THRESHOLD_NEAR:
        label = NEAR_LABEL
    elif raw_distance_score >= THRESHOLD_MID:
        label = MID_LABEL
    else:
        label = FAR_LABEL

    return label, raw_distance_score


def enrich_events_with_distance(
    sound_events: List[Dict[str, Any]],
    background_audio_path: str,
) -> List[Dict[str, Any]]:
    """
    Enriches each sound event from M5 with 'distance' (Near/Mid/Far) and 'distance_score'
    computed from its exact start/end segment in background stream.
    """
    if not sound_events:
        return []

    if not background_audio_path or not os.path.exists(background_audio_path):
        # Fallback if background stream file is not accessible
        enriched = []
        for ev in sound_events:
            conf = ev.get("confidence", 0.5)
            dist_label = NEAR_LABEL if conf >= 0.75 else MID_LABEL if conf >= 0.45 else FAR_LABEL
            enriched.append({**ev, "distance": ev.get("distance") or dist_label, "distance_score": round(conf, 2)})
        return enriched

    try:
        import soundfile as sf
        samples, sr = sf.read(background_audio_path, dtype="float32")
        if samples.ndim > 1:
            samples = np.mean(samples, axis=1)
    except Exception:
        try:
            import torchaudio
            waveform, sr = torchaudio.load(background_audio_path)
            if waveform.size(0) > 1:
                waveform = waveform.mean(dim=0, keepdim=True)
            samples = waveform.squeeze(0).numpy()
        except Exception:
            return sound_events

    total_samples = len(samples)
    enriched_events = []

    for ev in sound_events:
        start_sec = float(ev.get("start", 0.0))
        end_sec = float(ev.get("end", start_sec + 1.0))
        duration = max(0.1, end_sec - start_sec)

        start_idx = max(0, int(start_sec * sr))
        end_idx = min(total_samples, int(end_sec * sr))

        if end_idx > start_idx:
            segment = samples[start_idx:end_idx]
            dist_label, dist_score = estimate_distance_for_event(segment, sr, duration)
        else:
            dist_label, dist_score = MID_LABEL, 0.50

        enriched_events.append(
            {
                **ev,
                "distance": dist_label,
                "distance_score": dist_score,
            }
        )

    return enriched_events
