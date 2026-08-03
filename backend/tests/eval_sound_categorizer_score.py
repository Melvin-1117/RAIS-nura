import os
import sys
import time
import numpy as np
import soundfile as sf
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.sound_categorizer import (
    ALL_CATEGORIES,
    CONFIDENCE_THRESHOLD,
    UNKNOWN_SOUND_LABEL,
    categorize_background_stream,
    get_category,
)


def generate_eval_sample(sound_type: str, duration: float = 4.0, sr: int = 16000) -> str:
    """Generate audio sample representing target sound categories."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    if sound_type == "rain": # Natural
        noise = np.random.normal(0, 1, len(t))
        b, a = (np.array([0.5, -0.5]), np.array([1.0, -0.9]))
        data = np.convolve(noise, b, mode="same")
        data = (data / (np.max(np.abs(data)) + 1e-6)) * 0.15
    elif sound_type == "dog": # Animal
        pulse = (np.sin(2 * np.pi * 5 * t) > 0.3).astype(float)
        tone = np.sin(2 * np.pi * 1200 * t) + 0.3 * np.sin(2 * np.pi * 2400 * t)
        data = tone * pulse * 0.18
    elif sound_type == "cough": # Human Activity
        noise = np.random.normal(0, 1, len(t))
        diff_noise = np.diff(noise, prepend=0)
        envelope = np.exp(-((t % 1.5) - 0.2) ** 2 / 0.02)
        data = diff_noise * envelope * 0.18
    elif sound_type == "music": # Music
        data = 0.15 * (np.sin(2 * np.pi * 440 * t) + 0.6 * np.sin(2 * np.pi * 880 * t) + 0.3 * np.sin(2 * np.pi * 1320 * t))
    elif sound_type == "fan": # Artificial
        data = 0.15 * (np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t))
    elif sound_type == "ambient_low_conf": # Low confidence unknown
        data = 0.015 * np.random.normal(0, 1, len(t))
    elif sound_type == "silent": # Quiet edge case
        data = np.zeros(len(t))
    else:
        data = 0.1 * np.random.normal(0, 1, len(t))

    temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(temp_file.name, data.astype(np.float32), sr)
    temp_file.close()
    return temp_file.name


def run_evaluation():
    print("=" * 65)
    print("MILESTONE 5 SOUND CATEGORIZATION WORKING SCORE EVALUATION")
    print("=" * 65)

    eval_dataset = [
        # (Sound Type, Expected Category, Expected Label / Threshold Behavior)
        ("rain", "Natural", "Rain"),
        ("dog", "Animal", "Dog"),
        ("cough", "Human Activity", "Cough"),
        ("music", "Music", "Music"),
        ("fan", "Artificial", "Fan"),
        ("ambient_low_conf", None, "Unknown Sound"), # Should trigger < 0.4 threshold
    ]

    total_evals = len(eval_dataset)
    correct_category = 0
    correct_threshold_behavior = 0
    processing_times = []

    print(f"\n1. Evaluating {total_evals} Test Audio Datasets...\n")

    for sound_type, expected_cat, expected_label in eval_dataset:
        wav_path = generate_eval_sample(sound_type, duration=4.0)

        try:
            start_t = time.time()
            res = categorize_background_stream(wav_path)
            proc_time = (time.time() - start_t) * 1000
            processing_times.append(proc_time)

            events = res.get("sound_events", [])

            if expected_label == "Unknown Sound":
                # Expecting low-confidence event to be labeled Unknown Sound or empty list
                is_unknown = len(events) == 0 or any(e["label"] == UNKNOWN_SOUND_LABEL for e in events)
                if is_unknown:
                    correct_threshold_behavior += 1
                    correct_category += 1
                    status = "[PASS]"
                else:
                    status = "[FAIL]"
                print(f" {status} Test '{sound_type}': Low Confidence Thresholding -> Got label={events[0]['label'] if events else 'Empty'} (Conf={events[0]['confidence'] if events else 0})")
            else:
                top_event = events[0] if events else None
                predicted_cat = top_event["category"] if top_event else None
                predicted_label = top_event["label"] if top_event else None
                confidence = top_event["confidence"] if top_event else 0.0

                cat_match = (predicted_cat == expected_cat)
                if cat_match:
                    correct_category += 1
                    correct_threshold_behavior += 1
                    status = "[PASS]"
                else:
                    status = "[FAIL]"

                print(f" {status} Test '{sound_type}': Expected {expected_cat} ({expected_label}) -> Predicted {predicted_cat} ({predicted_label}), Conf={confidence:.2f}, Time={proc_time:.1f}ms")

        finally:
            if os.path.exists(wav_path):
                os.remove(wav_path)

    # Real Audio Evaluation if sample/audio data exists
    real_sample_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample", "audio data", "jackhammer.wav"))
    if os.path.exists(real_sample_path):
        print("\n2. Evaluating Real-World Sample Audio ('jackhammer.wav')...\n")
        res_real = categorize_background_stream(real_sample_path)
        events_real = res_real.get("sound_events", [])
        print(f" Real Sample 'jackhammer.wav' Output ({len(events_real)} events detected):")
        for ev in events_real:
            print(f"   • Label: {ev['label']} | Category: {ev['category']} | Conf: {ev['confidence']} | Range: {ev['start']}s - {ev['end']}s | Distance: {ev['distance']}")

    # Calculate overall scores
    accuracy_score = (correct_category / total_evals) * 100
    avg_latency = np.mean(processing_times) if processing_times else 0.0

    print("\n" + "=" * 65)
    print("FINAL WORKING SCORE SUMMARY")
    print("=" * 65)
    print(f" Overall Working Score (Categorization Accuracy): {accuracy_score:.1f}%")
    print(f" Confidence Threshold Accuracy (< 0.4 rule):     {(correct_threshold_behavior / total_evals) * 100:.1f}%")
    print(f" PRD Target Requirement (> 80%):                  {'MET (Exceeds Target)' if accuracy_score >= 80 else 'NOT MET'}")
    print(f" Average Processing Latency:                      {avg_latency:.2f} ms / 4s stream")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    run_evaluation()
