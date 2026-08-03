import math
import os
from typing import Any, Dict, List, Literal, Tuple, Optional
import numpy as np

# Perceived Loudness Tiers
IntensityTier = Literal["Low", "Medium", "High"]
INTENSITY_LOW_LABEL: IntensityTier = "Low"
INTENSITY_MID_LABEL: IntensityTier = "Medium"
INTENSITY_HIGH_LABEL: IntensityTier = "High"

# Named Threshold Constants (% of session peak RMS)
INTENSITY_LOW_THRESHOLD: float = 30.0   # intensity_pct < 30.0% -> Low
INTENSITY_HIGH_THRESHOLD: float = 70.0  # intensity_pct > 70.0% -> High, 30.0-70.0% -> Medium


def compute_segment_rms(segment_samples: np.ndarray) -> float:
    """Compute raw RMS amplitude over an event audio segment."""
    if len(segment_samples) == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(segment_samples))) + 1e-8)


def compute_session_peak_rms(
    background_audio_path: str,
    window_seconds: float = 0.5,
) -> float:
    """
    Computes the peak RMS energy across all windows in the entire background audio stream
    for a session. This serves as the relative max reference denominator (R_max) for M7.

    Session-level reference max is computed ONCE per session and reused across all events
    in that recording for consistent relative loudness scaling.
    """
    if not background_audio_path or not os.path.exists(background_audio_path):
        return 0.10  # Fallback default baseline

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
            return 0.10

    if len(samples) == 0 or sr <= 0:
        return 0.10

    win_len = int(sr * window_seconds)
    if win_len <= 0 or len(samples) < win_len:
        return compute_segment_rms(samples)

    max_rms = 0.0
    for start in range(0, len(samples) - win_len + 1, win_len // 2):
        window = samples[start : start + win_len]
        win_rms = compute_segment_rms(window)
        if win_rms > max_rms:
            max_rms = win_rms

    return max(1e-4, max_rms)


def analyze_event_intensity(
    event_rms: float,
    session_peak_rms: float,
) -> Tuple[IntensityTier, float]:
    """
    Normalizes event RMS amplitude relative to the session's peak RMS background level.

    Formula: intensity_pct = min(100.0, (event_rms / session_peak_rms) * 100.0)

    EDGE CASES DESIGN NOTE (per PRD):
    1. Uniformly quiet recording: All sound events will still be normalized relative to
       the session peak RMS, spreading them across Low/Medium/High relative to that recording.
    2. Single sound event (n=1): With only one event, it will normalize to 100.0% of max
       and be labeled 'High' regardless of its absolute dB volume. This is a known
       property of relative scaling.
    """
    if session_peak_rms <= 1e-8:
        return INTENSITY_MID_LABEL, 50.0

    raw_ratio = event_rms / session_peak_rms
    intensity_pct = round(min(100.0, max(0.0, raw_ratio * 100.0)), 1)

    if intensity_pct > INTENSITY_HIGH_THRESHOLD:
        tier = INTENSITY_HIGH_LABEL
    elif intensity_pct >= INTENSITY_LOW_THRESHOLD:
        tier = INTENSITY_MID_LABEL
    else:
        tier = INTENSITY_LOW_LABEL

    return tier, intensity_pct


def enrich_events_with_intensity(
    sound_events: List[Dict[str, Any]],
    background_audio_path: str,
) -> List[Dict[str, Any]]:
    """
    Enriches each sound event from M5/M6 with 'intensity' (Low/Medium/High)
    and 'intensity_pct' (0.0 to 100.0%) computed relative to the session peak RMS.
    """
    if not sound_events:
        return []

    # Compute session-level peak RMS reference ONCE per recording
    session_peak_rms = compute_session_peak_rms(background_audio_path)

    samples = None
    sr = 16000

    if background_audio_path and os.path.exists(background_audio_path):
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
                samples = None

    total_samples = len(samples) if samples is not None else 0
    enriched_events = []

    for ev in sound_events:
        start_sec = float(ev.get("start", 0.0))
        end_sec = float(ev.get("end", start_sec + 1.0))

        if samples is not None and total_samples > 0:
            start_idx = max(0, int(start_sec * sr))
            end_idx = min(total_samples, int(end_sec * sr))

            if end_idx > start_idx:
                segment = samples[start_idx:end_idx]
                event_rms = compute_segment_rms(segment)
            else:
                event_rms = session_peak_rms * 0.5
        else:
            # Fallback estimation if audio file unreadable
            conf = float(ev.get("confidence", 0.7))
            event_rms = session_peak_rms * conf

        tier, intensity_pct = analyze_event_intensity(event_rms, session_peak_rms)

        enriched_events.append(
            {
                **ev,
                "intensity": tier,
                "intensity_pct": intensity_pct,
            }
        )

    return enriched_events
