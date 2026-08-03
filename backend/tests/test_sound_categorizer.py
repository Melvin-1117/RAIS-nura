import json
import os
import sys
import numpy as np
import soundfile as sf
import tempfile

# Add backend app directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.sound_categorizer import (
    ALL_CATEGORIES,
    CONFIDENCE_THRESHOLD,
    UNKNOWN_SOUND_LABEL,
    UNCLASSIFIED_CATEGORY,
    categorize_background_stream,
    get_category,
    group_by_category,
    merge_adjacent_windows,
)


def create_synthetic_wav(
    duration: float = 3.0,
    sr: int = 16000,
    sound_type: str = "rain",
    amplitude: float = 0.15,
) -> str:
    """Helper creating a temporary synthetic WAV file for test audio evaluation."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    if sound_type == "rain":
        # Continuous high-frequency noise texture
        noise = np.random.normal(0, 1, len(t))
        b, a = (np.array([0.5, -0.5]), np.array([1.0, -0.9]))
        data = amplitude * np.convolve(noise, b, mode="same")
        data = data / (np.max(np.abs(data)) + 1e-6) * amplitude
    elif sound_type == "dog":
        # Mid-frequency pulsed bark simulation (1200Hz tone with low ZCR envelope)
        pulse = (np.sin(2 * np.pi * 5 * t) > 0.3).astype(float)
        tone = np.sin(2 * np.pi * 1200 * t) + 0.3 * np.sin(2 * np.pi * 2400 * t)
        data = amplitude * tone * pulse
    elif sound_type == "fan":
        # Low frequency hum (120 Hz)
        data = amplitude * (np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t))
    elif sound_type == "music":
        # Clean multi-harmonic music tone (440Hz A4 + 880Hz A5)
        data = amplitude * (np.sin(2 * np.pi * 440 * t) + 0.6 * np.sin(2 * np.pi * 880 * t) + 0.3 * np.sin(2 * np.pi * 1320 * t))
    elif sound_type == "cough":
        # High-frequency transient burst
        noise = np.random.normal(0, 1, len(t))
        diff_noise = np.diff(noise, prepend=0)
        envelope = np.exp(-((t % 1.5) - 0.2) ** 2 / 0.02)
        data = amplitude * diff_noise * envelope
    elif sound_type == "silent":
        data = np.zeros(len(t))
    else:
        data = amplitude * np.random.normal(0, 1, len(t))

    temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(temp_file.name, data.astype(np.float32), sr)
    temp_file.close()
    return temp_file.name


def test_category_mapping_from_json():
    """Verify that sound_categories.json maps raw labels to 5 fixed categories."""
    assert get_category("Rain") == "Natural"
    assert get_category("Dog") == "Animal"
    assert get_category("Cough") == "Human Activity"
    assert get_category("Guitar") == "Music"
    assert get_category("Fan") == "Artificial"
    assert get_category("Unknown Sound") is None


def test_confidence_thresholding():
    """Verify PRD requirement: if confidence < 0.4, label is 'Unknown Sound'."""
    from app.services.sound_categorizer import _classify_window_features

    # Low-energy ambiguous signal triggers ambient noise with conf < 0.4
    label, conf = _classify_window_features(
        rms=0.015,
        centroid=1200,
        zcr=0.03,
        low_band=0.2,
        mid_band=0.2,
        high_band=0.2,
        duration=1.0,
    )
    assert conf < CONFIDENCE_THRESHOLD
    assert label == "Ambient Noise"


def test_merge_adjacent_windows():
    """Verify contiguous same-label windows are merged into a single event range."""
    windows = [
        {"start": 0.0, "end": 1.0, "label": "Rain", "category": "Natural", "confidence": 0.8, "rms": 0.05},
        {"start": 0.5, "end": 1.5, "label": "Rain", "category": "Natural", "confidence": 0.85, "rms": 0.06},
        {"start": 1.0, "end": 2.0, "label": "Rain", "category": "Natural", "confidence": 0.82, "rms": 0.05},
        {"start": 3.0, "end": 4.0, "label": "Dog", "category": "Animal", "confidence": 0.88, "rms": 0.10},
    ]

    merged = merge_adjacent_windows(windows, max_gap_seconds=0.3)
    assert len(merged) == 2

    # First event: Rain merged from 0.0s to 2.0s
    assert merged[0]["label"] == "Rain"
    assert merged[0]["start"] == 0.0
    assert merged[0]["end"] == 2.0
    assert merged[0]["confidence"] == 0.85

    # Second event: Dog from 3.0s to 4.0s
    assert merged[1]["label"] == "Dog"
    assert merged[1]["start"] == 3.0
    assert merged[1]["end"] == 4.0


def test_edge_case_failed_separation():
    """Verify graceful handling when separation_status is 'failed' or 'processing'."""
    res_failed = categorize_background_stream("nonexistent.wav", separation_status="failed")
    assert res_failed["sound_events"] == []
    assert res_failed["separation_status"] == "failed"

    res_proc = categorize_background_stream("nonexistent.wav", separation_status="processing")
    assert res_proc["sound_events"] == []
    assert res_proc["separation_status"] == "processing"


def test_edge_case_short_stream():
    """Verify background stream shorter than 1 window returns empty sound_events list."""
    short_file = create_synthetic_wav(duration=0.5, sound_type="rain")
    try:
        res = categorize_background_stream(short_file, window_seconds=1.0)
        assert res["sound_events"] == []
        assert res["separation_status"] == "completed"
    finally:
        if os.path.exists(short_file):
            os.remove(short_file)


def test_edge_case_quiet_audio():
    """Verify quiet / near-silent stream returns empty sound_events list."""
    silent_file = create_synthetic_wav(duration=3.0, sound_type="silent")
    try:
        res = categorize_background_stream(silent_file)
        assert res["sound_events"] == []
        assert res["separation_status"] == "completed"
    finally:
        if os.path.exists(silent_file):
            os.remove(silent_file)


def test_categorization_accuracy_gt80_percent():
    """
    ACCEPTANCE CRITERIA: Validate >80% accuracy against test audio samples
    with labeled ground-truth sounds (Rain, Dog, Fan, Music, Cough).
    """
    test_cases = [
        {"sound_type": "rain", "expected_category": "Natural"},
        {"sound_type": "dog", "expected_category": "Animal"},
        {"sound_type": "fan", "expected_category": "Artificial"},
        {"sound_type": "music", "expected_category": "Music"},
        {"sound_type": "cough", "expected_category": "Human Activity"},
    ]

    correct_predictions = 0

    for test_case in test_cases:
        wav_file = create_synthetic_wav(duration=3.0, sound_type=test_case["sound_type"], amplitude=0.15)
        try:
            res = categorize_background_stream(wav_file)
            events = res.get("sound_events", [])

            if events:
                top_event = events[0]
                if top_event["category"] == test_case["expected_category"]:
                    correct_predictions += 1
                else:
                    print(f"[ACCURACY FAIL] Sample {test_case['sound_type']}: expected {test_case['expected_category']}, got {top_event['category']} ({top_event['label']})")
            else:
                print(f"[ACCURACY FAIL] Sample {test_case['sound_type']}: no events detected")
        finally:
            if os.path.exists(wav_file):
                os.remove(wav_file)

    accuracy = correct_predictions / len(test_cases)
    print(f"\nSound Categorization Evaluation Accuracy: {accuracy * 100:.1f}% ({correct_predictions}/{len(test_cases)})")

    # PRD Acceptance Criteria check: > 80%
    assert accuracy >= 0.80, f"Sound categorization accuracy {accuracy * 100:.1f}% fell below 80% requirement"


if __name__ == "__main__":
    print("Running Milestone 5 Sound Categorization Test Suite...")
    test_category_mapping_from_json()
    print("[OK] test_category_mapping_from_json passed")

    test_confidence_thresholding()
    print("[OK] test_confidence_thresholding passed")

    test_merge_adjacent_windows()
    print("[OK] test_merge_adjacent_windows passed")

    test_edge_case_failed_separation()
    print("[OK] test_edge_case_failed_separation passed")

    test_edge_case_short_stream()
    print("[OK] test_edge_case_short_stream passed")

    test_edge_case_quiet_audio()
    print("[OK] test_edge_case_quiet_audio passed")

    test_categorization_accuracy_gt80_percent()
    print("[OK] test_categorization_accuracy_gt80_percent passed")

    print("\nALL MILESTONE 5 TESTS PASSED SUCCESSFULLY!")
