import os
import sys
import time
import numpy as np
import soundfile as sf
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.intensity_analyzer import (
    INTENSITY_HIGH_LABEL,
    INTENSITY_LOW_LABEL,
    INTENSITY_MID_LABEL,
    analyze_event_intensity,
    enrich_events_with_intensity,
)


def generate_varied_volume_recording(duration: float = 6.0, sr: int = 16000) -> str:
    """Generate audio recording with 3 distinct segments: Quiet (<30%), Medium (30-70%), Loud (>70%)."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # Segment 1 (0s-2s): Quiet background noise (amplitude 0.02) -> ~16.7% of peak -> Low
    # Segment 2 (2s-4s): Medium hum (amplitude 0.06)          -> ~50.0% of peak -> Medium
    # Segment 3 (4s-6s): Loud siren (amplitude 0.12)          -> 100.0% of peak -> High
    seg1 = 0.02 * np.random.normal(0, 1, int(sr * 2.0))
    seg2 = 0.06 * np.sin(2 * np.pi * 440 * t[int(sr * 2.0):int(sr * 4.0)])
    seg3 = 0.12 * np.sin(2 * np.pi * 1000 * t[int(sr * 4.0):])

    audio_data = np.concatenate([seg1, seg2, seg3])

    temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(temp_file.name, audio_data.astype(np.float32), sr)
    temp_file.close()
    return temp_file.name


def run_intensity_evaluation():
    print("=" * 65)
    print("MILESTONE 7 SOUND INTENSITY ANALYSIS WORKING SCORE EVALUATION")
    print("=" * 65)

    wav_file = generate_varied_volume_recording(duration=6.0)

    test_events = [
        {"label": "Subtle Hiss", "category": "Artificial", "confidence": 0.80, "start": 0.2, "end": 1.8, "expected_intensity": INTENSITY_LOW_LABEL},
        {"label": "Medium Hum", "category": "Artificial", "confidence": 0.85, "start": 2.2, "end": 3.8, "expected_intensity": INTENSITY_MID_LABEL},
        {"label": "Loud Siren", "category": "Artificial", "confidence": 0.92, "start": 4.2, "end": 5.8, "expected_intensity": INTENSITY_HIGH_LABEL},
    ]

    total_evals = len(test_events)
    correct_predictions = 0
    processing_times = []

    print(f"\n1. Evaluating Relative Loudness Intensity over Varied Volume Audio Stream...\n")

    try:
        start_t = time.time()
        enriched_events = enrich_events_with_intensity(test_events, wav_file)
        proc_time = (time.time() - start_t) * 1000
        processing_times.append(proc_time)

        for ev in enriched_events:
            expected = ev["expected_intensity"]
            predicted = ev["intensity"]
            pct = ev["intensity_pct"]

            is_correct = (predicted == expected)
            if is_correct:
                correct_predictions += 1
                status = "[PASS]"
            else:
                status = "[FAIL]"

            print(f" {status} Event '{ev['label']}': Expected {expected} -> Predicted {predicted} ({pct:.1f}% of session peak RMS)")

    finally:
        if os.path.exists(wav_file):
            os.remove(wav_file)

    # Real Audio Evaluation if sample/audio data exists
    real_sample_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample", "audio data", "jackhammer.wav"))
    if os.path.exists(real_sample_path):
        print("\n2. Evaluating Real-World Sample Audio ('jackhammer.wav')...\n")
        real_events = [{"label": "Jackhammer", "category": "Artificial", "confidence": 0.88, "start": 0.5, "end": 2.5}]
        enriched_real = enrich_events_with_intensity(real_events, real_sample_path)
        for ev in enriched_real:
            print(f"   • Real Sample 'jackhammer.wav': Loudness Intensity = {ev['intensity']} ({ev['intensity_pct']:.1f}% of session peak RMS)")

    accuracy_score = (correct_predictions / total_evals) * 100
    avg_latency = np.mean(processing_times) if processing_times else 0.0

    print("\n" + "=" * 65)
    print("FINAL WORKING SCORE SUMMARY")
    print("=" * 65)
    print(f" Overall Intensity Analysis Working Score:       {accuracy_score:.1f}%")
    print(f" PRD Target Requirement (> 80%):                  {'MET (Exceeds Target)' if accuracy_score >= 80 else 'NOT MET'}")
    print(f" Average Session Intensity Latency:               {avg_latency:.2f} ms")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    run_intensity_evaluation()
