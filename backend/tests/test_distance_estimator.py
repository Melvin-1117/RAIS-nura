import os
import sys
import numpy as np
import soundfile as sf
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.distance_estimator import (
    FAR_LABEL,
    MID_LABEL,
    MIN_REVERB_DURATION_SECONDS,
    NEAR_LABEL,
    THRESHOLD_MID,
    THRESHOLD_NEAR,
    WEIGHT_REVERB,
    WEIGHT_ROLLOFF,
    WEIGHT_RMS,
    WEIGHT_SHORT_REVERB,
    compute_hf_attenuation,
    compute_reverb_tail_rt60,
    compute_rms_energy,
    enrich_events_with_distance,
    estimate_distance_for_event,
)


def generate_synthetic_audio(
    duration: float = 2.0,
    amplitude: float = 0.12,
    freq_cutoff: float = 2000.0,
    sr: int = 16000,
) -> np.ndarray:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Generate tone with controlled amplitude
    tone = amplitude * np.sin(2 * np.pi * freq_cutoff * t)
    return tone.astype(np.float32)


def test_named_constants():
    """Verify named constants for feature weights and score thresholds."""
    assert WEIGHT_RMS == 0.50
    assert WEIGHT_ROLLOFF == 0.30
    assert WEIGHT_REVERB == 0.20

    assert WEIGHT_SHORT_REVERB == 0.0
    assert MIN_REVERB_DURATION_SECONDS == 0.50

    assert THRESHOLD_NEAR == 0.60
    assert THRESHOLD_MID == 0.22


def test_near_distance_scoring():
    """High RMS energy + clear high-frequencies should score Near (<1m)."""
    sr = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # High amplitude tone (0.15) with high frequency components (>4kHz)
    high_energy_signal = 0.15 * (np.sin(2 * np.pi * 1000 * t) + np.sin(2 * np.pi * 5000 * t))

    label, score = estimate_distance_for_event(high_energy_signal, sr=sr, duration_seconds=duration)
    assert label == NEAR_LABEL
    assert score >= THRESHOLD_NEAR


def test_far_distance_scoring():
    """Low RMS energy + low-frequency dominance (HF attenuation) should score Far (>5m)."""
    sr = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Low amplitude tone (0.01) with low frequency dominance (300Hz)
    low_energy_signal = 0.01 * np.sin(2 * np.pi * 300 * t)

    label, score = estimate_distance_for_event(low_energy_signal, sr=sr, duration_seconds=duration)
    assert label == FAR_LABEL
    assert score < THRESHOLD_MID


def test_short_segment_fallback():
    """For short segments (<0.5s), reverb weight should be zeroed out to prevent RT60 noise."""
    sr = 16000
    duration = 0.3  # Short segment (< 0.5s)
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    short_signal = 0.12 * np.sin(2 * np.pi * 1000 * t)

    label, score = estimate_distance_for_event(short_signal, sr=sr, duration_seconds=duration)
    assert label in [NEAR_LABEL, MID_LABEL, FAR_LABEL]
    assert 0.0 <= score <= 1.0


def test_enrich_events_with_distance():
    """Verify enrich_events_with_distance adds distance and distance_score to sound event dicts."""
    events = [
        {"label": "Rain", "category": "Natural", "confidence": 0.85, "start": 0.0, "end": 2.0},
        {"label": "Dog", "category": "Animal", "confidence": 0.80, "start": 3.0, "end": 4.5},
    ]

    # Create temporary background WAV file
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sr = 16000
    t = np.linspace(0, 5.0, sr * 5, endpoint=False)
    audio_data = 0.10 * np.sin(2 * np.pi * 1000 * t)
    sf.write(temp_wav.name, audio_data.astype(np.float32), sr)
    temp_wav.close()

    try:
        enriched = enrich_events_with_distance(events, temp_wav.name)
        assert len(enriched) == 2
        for ev in enriched:
            assert "distance" in ev
            assert ev["distance"] in [NEAR_LABEL, MID_LABEL, FAR_LABEL]
            assert "distance_score" in ev
            assert isinstance(ev["distance_score"], float)
    finally:
        if os.path.exists(temp_wav.name):
            os.remove(temp_wav.name)


if __name__ == "__main__":
    print("Running Milestone 6 Sound Distance Estimation Test Suite...")
    test_named_constants()
    print("[OK] test_named_constants passed")

    test_near_distance_scoring()
    print("[OK] test_near_distance_scoring passed")

    test_far_distance_scoring()
    print("[OK] test_far_distance_scoring passed")

    test_short_segment_fallback()
    print("[OK] test_short_segment_fallback passed")

    test_enrich_events_with_distance()
    print("[OK] test_enrich_events_with_distance passed")

    print("\nALL MILESTONE 6 DISTANCE ESTIMATION TESTS PASSED SUCCESSFULLY!")
