import os
import sys
import numpy as np
import soundfile as sf
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.intensity_analyzer import (
    INTENSITY_HIGH_LABEL,
    INTENSITY_HIGH_THRESHOLD,
    INTENSITY_LOW_LABEL,
    INTENSITY_LOW_THRESHOLD,
    INTENSITY_MID_LABEL,
    analyze_event_intensity,
    compute_segment_rms,
    compute_session_peak_rms,
    enrich_events_with_intensity,
)


def test_named_constants():
    """Verify named constants for loudness intensity thresholds."""
    assert INTENSITY_LOW_THRESHOLD == 30.0
    assert INTENSITY_HIGH_THRESHOLD == 70.0

    assert INTENSITY_LOW_LABEL == "Low"
    assert INTENSITY_MID_LABEL == "Medium"
    assert INTENSITY_HIGH_LABEL == "High"


def test_analyze_event_intensity_tiers():
    """Verify relative percentage normalization and threshold tier mapping."""
    session_peak = 0.10

    # High intensity (> 70%)
    tier_high, pct_high = analyze_event_intensity(0.08, session_peak)
    assert tier_high == INTENSITY_HIGH_LABEL
    assert pct_high == 80.0

    # Medium intensity (30% - 70%)
    tier_mid, pct_mid = analyze_event_intensity(0.05, session_peak)
    assert tier_mid == INTENSITY_MID_LABEL
    assert pct_mid == 50.0

    # Low intensity (< 30%)
    tier_low, pct_low = analyze_event_intensity(0.02, session_peak)
    assert tier_low == INTENSITY_LOW_LABEL
    assert pct_low == 20.0


def test_single_event_edge_case():
    """EDGE CASE: Single sound event (n=1) normalizes to 100% of max ('High')."""
    session_peak = 0.05
    tier, pct = analyze_event_intensity(0.05, session_peak)
    assert tier == INTENSITY_HIGH_LABEL
    assert pct == 100.0


def test_session_peak_rms_and_enrichment():
    """Verify session-level peak RMS computation and event enrichment."""
    sr = 16000
    t = np.linspace(0, 4.0, sr * 4, endpoint=False)

    # 0s-2s quiet segment (amplitude 0.02), 2s-4s loud segment (amplitude 0.12)
    audio_data = np.where(t < 2.0, 0.02 * np.sin(2 * np.pi * 500 * t), 0.12 * np.sin(2 * np.pi * 500 * t))

    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(temp_wav.name, audio_data.astype(np.float32), sr)
    temp_wav.close()

    try:
        # Session peak RMS should equal the loud segment RMS (~0.084)
        peak_rms = compute_session_peak_rms(temp_wav.name)
        assert peak_rms > 0.05

        events = [
            {"label": "Quiet Hiss", "category": "Artificial", "confidence": 0.80, "start": 0.0, "end": 1.5},
            {"label": "Loud Siren", "category": "Artificial", "confidence": 0.90, "start": 2.2, "end": 3.8},
        ]

        enriched = enrich_events_with_intensity(events, temp_wav.name)
        assert len(enriched) == 2

        # Quiet event -> Low or Medium intensity
        assert enriched[0]["intensity_pct"] < enriched[1]["intensity_pct"]
        assert enriched[0]["intensity"] in [INTENSITY_LOW_LABEL, INTENSITY_MID_LABEL]

        # Loud event -> High intensity
        assert enriched[1]["intensity"] == INTENSITY_HIGH_LABEL
        assert enriched[1]["intensity_pct"] > INTENSITY_HIGH_THRESHOLD

    finally:
        if os.path.exists(temp_wav.name):
            os.remove(temp_wav.name)


if __name__ == "__main__":
    print("Running Milestone 7 Sound Intensity Analysis Test Suite...")
    test_named_constants()
    print("[OK] test_named_constants passed")

    test_analyze_event_intensity_tiers()
    print("[OK] test_analyze_event_intensity_tiers passed")

    test_single_event_edge_case()
    print("[OK] test_single_event_edge_case passed")

    test_session_peak_rms_and_enrichment()
    print("[OK] test_session_peak_rms_and_enrichment passed")

    print("\nALL MILESTONE 7 INTENSITY ANALYSIS TESTS PASSED SUCCESSFULLY!")
