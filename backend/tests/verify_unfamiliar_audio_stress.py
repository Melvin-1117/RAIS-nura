"""
PART 2 — Stress-Test M5/M6/M7 Against Unfamiliar Audio
=======================================================
Generates NEW audio samples that were NOT used in the original test fixtures
or eval scripts, runs them through the real pipeline services, and reports
accuracy without changing any thresholds or scoring logic.

Category      | Existing test sounds            | NEW challenge sounds (this script)
--------------+---------------------------------+-----------------------------------------
M5 (classify) | rain, dog, cough, music, fan    | siren, thunder, keyboard, applause, creek
M6 (distance) | pure sine tones at 0.15/0.05/   | mixed tones + attenuation simulation,
              | 0.01 amplitude                  | pink noise with reverb-like convolution
M7 (intensity)| 3-segment quiet/med/loud sine   | abrupt multi-event recording with
              | wave at 0.02/0.06/0.12          | very quiet whisper + sharp transients

Usage:
    cd backend
    python tests/verify_unfamiliar_audio_stress.py
"""

import os
import sys
import tempfile
import time
import numpy as np

try:
    import soundfile as sf
except ImportError:
    print("soundfile not installed — pip install soundfile")
    sys.exit(1)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.distance_estimator import estimate_distance_for_event, FAR_LABEL, MID_LABEL, NEAR_LABEL, THRESHOLD_MID, THRESHOLD_NEAR
from app.services.intensity_analyzer import (
    INTENSITY_HIGH_LABEL, INTENSITY_LOW_LABEL, INTENSITY_MID_LABEL,
    analyze_event_intensity, enrich_events_with_intensity,
)
from app.services.sound_categorizer import categorize_background_stream


# ---------------------------------------------------------------------------
# Audio synthesis helpers — all NEW sounds not in the existing test fixtures
# ---------------------------------------------------------------------------

def _write_temp_wav(data: np.ndarray, sr: int = 16000) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, data.astype(np.float32), sr)
    tmp.close()
    return tmp.name


def gen_siren(duration=4.0, sr=16000) -> np.ndarray:
    """Two-tone emergency siren sweep (700–1200 Hz)."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    freq = 700 + 500 * ((t % 1.0) / 1.0)           # linear sweep each second
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return (0.14 * np.sin(phase)).astype(np.float32)


def gen_thunder(duration=4.0, sr=16000) -> np.ndarray:
    """
    Thunder simulation: low-frequency rumble (20–150 Hz) with burst of noise.
    Very different from the 'rain' test fixture (which is filtered noise).
    """
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Main rumble: low-frequency modulated burst
    burst_env = np.exp(-((t - 0.8) ** 2) / 0.3)
    rumble = burst_env * (
        0.20 * np.sin(2 * np.pi * 60 * t) +
        0.10 * np.sin(2 * np.pi * 80 * t) +
        0.08 * np.sin(2 * np.pi * 120 * t)
    )
    # Background fading noise after the crack
    fade = np.exp(-t / 2.0)
    bg = 0.04 * fade * np.random.normal(0, 1, len(t))
    return np.clip(rumble + bg, -1.0, 1.0).astype(np.float32)


def gen_keyboard_typing(duration=4.0, sr=16000) -> np.ndarray:
    """
    Keyboard typing: semi-random short transient clicks at variable intervals.
    High ZCR, moderate amplitude, varied timing — not in any existing fixture.
    """
    data = np.zeros(int(sr * duration), dtype=np.float32)
    rng = np.random.default_rng(42)
    click_times = np.cumsum(rng.uniform(0.12, 0.30, 30))
    click_times = click_times[click_times < duration - 0.05]
    click_dur_samples = int(sr * 0.012)
    click_template = np.hanning(click_dur_samples) * rng.uniform(0.08, 0.14, click_dur_samples)
    for t_click in click_times:
        idx = int(t_click * sr)
        end = min(len(data), idx + click_dur_samples)
        data[idx:end] += click_template[: end - idx]
    return np.clip(data, -1.0, 1.0).astype(np.float32)


def gen_applause(duration=4.0, sr=16000) -> np.ndarray:
    """
    Crowd applause: broadband noise burst with slow amplitude modulation.
    Distinct from 'cough' (short burst) and 'rain' (steady high-freq noise).
    """
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    noise = np.random.normal(0, 1, len(t))
    # Bandpass 1k-5kHz
    from numpy.fft import rfft, irfft, rfftfreq
    F = rfft(noise)
    freqs = rfftfreq(len(noise), 1.0 / sr)
    F[(freqs < 1000) | (freqs > 5000)] = 0
    bp = irfft(F, n=len(noise))
    # Slow modulation (clapping rhythm ~3 Hz)
    mod = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)
    data = (bp * mod * 0.18 / (np.max(np.abs(bp)) + 1e-6)).astype(np.float32)
    return data


def gen_creek(duration=4.0, sr=16000) -> np.ndarray:
    """
    Flowing water creek: broadband gurgle with midrange emphasis (natural).
    More complex than the 'rain' noise fixture (different spectral shape).
    """
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    from numpy.fft import rfft, irfft, rfftfreq
    noise = np.random.normal(0, 1, len(t))
    F = rfft(noise)
    freqs = rfftfreq(len(noise), 1.0 / sr)
    F[freqs < 300] *= 0.2
    F[(freqs >= 300) & (freqs < 3000)] *= 1.5
    F[freqs >= 3000] *= 0.6
    colored = irfft(F, n=len(noise))
    # Slight gurgle AM
    gurg = 0.6 + 0.4 * np.sin(2 * np.pi * 5 * t) * np.sin(2 * np.pi * 2 * t)
    data = (colored * gurg * 0.14 / (np.max(np.abs(colored)) + 1e-6)).astype(np.float32)
    return data


def gen_m6_near_noisy(sr=16000) -> np.ndarray:
    """Near-field signal: high amplitude + rich HF + slight noise floor."""
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    signal = (
        0.12 * np.sin(2 * np.pi * 1200 * t) +
        0.08 * np.sin(2 * np.pi * 4500 * t) +   # HF present
        0.02 * np.random.normal(0, 1, len(t))    # noise floor
    )
    return signal.astype(np.float32)


def gen_m6_mid_attenuated(sr=16000) -> np.ndarray:
    """Mid-field: moderate amplitude, HF partially rolled off."""
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    signal = (
        0.048 * np.sin(2 * np.pi * 1000 * t) +
        0.010 * np.sin(2 * np.pi * 4000 * t)    # partial HF — less than near
    )
    return signal.astype(np.float32)


def gen_m6_far_reverbed(sr=16000) -> np.ndarray:
    """Far-field: very low amplitude, HF heavily attenuated (only lows present)."""
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    signal = 0.009 * np.sin(2 * np.pi * 200 * t)   # low amplitude + low freq only
    return signal.astype(np.float32)


def gen_m7_whisper_then_loud(sr=16000) -> str:
    """
    Very quiet whisper segment (0.005) followed by sharp loud clap (0.22).
    Tests that low-tier events aren't incorrectly elevated and high-tier
    events are correctly flagged at extreme amplitude contrast.
    """
    duration_total = 6.0
    n_total = int(sr * duration_total)
    data = np.zeros(n_total, dtype=np.float32)
    # 0s–2s: near-silent ambient (very quiet whisper)
    data[0 : sr * 2] = 0.005 * np.random.normal(0, 1, sr * 2)
    # 2s–4s: medium hum
    t_mid = np.linspace(0, 2.0, sr * 2, endpoint=False)
    data[sr * 2 : sr * 4] = 0.06 * np.sin(2 * np.pi * 440 * t_mid)
    # 4s–6s: loud sharp transients (claps)
    clap_times = [4.1, 4.4, 4.7, 5.0, 5.3, 5.6]
    clap_dur = int(sr * 0.05)
    clap = np.hanning(clap_dur) * 0.22
    for ct in clap_times:
        idx = int(ct * sr)
        end = min(n_total, idx + clap_dur)
        data[idx:end] += clap[: end - idx]
    data = np.clip(data, -1.0, 1.0).astype(np.float32)
    return _write_temp_wav(data, sr)


# ---------------------------------------------------------------------------
# M5 Stress-Test
# ---------------------------------------------------------------------------

def run_m5_unfamiliar():
    print("=" * 65)
    print("PART 2A — M5 SOUND CATEGORIZATION: UNFAMILIAR AUDIO")
    print("=" * 65)
    print("NOTE: Existing fixtures are rain/dog/cough/music/fan synthesized")
    print("using the same heuristic parameter space as _classify_window_features.")
    print("These NEW samples probe sounds outside those 5 archetypes.\n")

    NEW_CASES = [
        ("siren",           gen_siren,            "Human Activity"),   # nearest match
        ("thunder",         gen_thunder,           "Natural"),
        ("keyboard_typing", gen_keyboard_typing,   "Artificial"),
        ("applause",        gen_applause,          "Human Activity"),
        ("creek",           gen_creek,             "Natural"),
    ]

    total = len(NEW_CASES)
    correct = 0

    for name, gen_fn, expected_cat in NEW_CASES:
        data = gen_fn()
        wav = _write_temp_wav(data)
        try:
            t0 = time.time()
            res = categorize_background_stream(wav)
            elapsed_ms = (time.time() - t0) * 1000
            events = res.get("sound_events", [])
            if events:
                top = events[0]
                pred_cat = top["category"]
                pred_label = top["label"]
                conf = top["confidence"]
                match = pred_cat == expected_cat
                if match:
                    correct += 1
                status = "[PASS]" if match else "[FAIL]"
                print(f"  {status} '{name}': expected={expected_cat}, got={pred_cat} ({pred_label}, conf={conf:.2f}), {elapsed_ms:.1f}ms")
            else:
                print(f"  [FAIL] '{name}': expected={expected_cat}, got=NO EVENTS detected, {elapsed_ms:.1f}ms")
        finally:
            if os.path.exists(wav):
                os.remove(wav)

    accuracy = correct / total * 100
    print(f"\n  Accuracy on UNFAMILIAR audio: {correct}/{total} = {accuracy:.1f}%")
    print(f"  (Existing dev-fixture accuracy was reported as 100% = 5/5)")
    print("=" * 65 + "\n")
    return accuracy


# ---------------------------------------------------------------------------
# M6 Stress-Test
# ---------------------------------------------------------------------------

def run_m6_unfamiliar():
    print("=" * 65)
    print("PART 2B — M6 DISTANCE ESTIMATION: UNFAMILIAR AUDIO")
    print("=" * 65)
    print("NOTE: Existing fixtures are pure sine tones tuned exactly to the")
    print("RMS and HF thresholds. These new signals add noise/mixed content.\n")

    NEW_CASES = [
        ("near_noisy",      gen_m6_near_noisy,      NEAR_LABEL, THRESHOLD_NEAR, 1.0),
        ("mid_attenuated",  gen_m6_mid_attenuated,  MID_LABEL,  THRESHOLD_MID,  THRESHOLD_NEAR),
        ("far_reverbed",    gen_m6_far_reverbed,    FAR_LABEL,  0.0,            THRESHOLD_MID),
    ]

    total = len(NEW_CASES)
    correct = 0

    for name, gen_fn, exp_label, min_score, max_score in NEW_CASES:
        signal = gen_fn()
        t0 = time.time()
        label, score = estimate_distance_for_event(signal, sr=16000, duration_seconds=2.0)
        elapsed_ms = (time.time() - t0) * 1000
        is_label_correct = label == exp_label
        is_score_in_range = min_score <= score <= max_score
        passed = is_label_correct and is_score_in_range
        if passed:
            correct += 1
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} '{name}': expected={exp_label}[{min_score:.2f}–{max_score:.2f}], got={label}(score={score:.2f}), {elapsed_ms:.2f}ms")
        if not is_label_correct:
            print(f"         → Label mismatch: expected {exp_label}, got {label}")
        if not is_score_in_range:
            print(f"         → Score {score:.2f} outside expected range [{min_score:.2f}, {max_score:.2f}]")

    accuracy = correct / total * 100
    print(f"\n  Accuracy on UNFAMILIAR audio: {correct}/{total} = {accuracy:.1f}%")
    print(f"  (Existing dev-fixture accuracy was reported as 100% = 5/5)")
    print("=" * 65 + "\n")
    return accuracy


# ---------------------------------------------------------------------------
# M7 Stress-Test
# ---------------------------------------------------------------------------

def run_m7_unfamiliar():
    print("=" * 65)
    print("PART 2C — M7 INTENSITY ANALYSIS: UNFAMILIAR AUDIO")
    print("=" * 65)
    print("NOTE: Existing fixture uses 3 linearly-scaled sine segments at")
    print("0.02/0.06/0.12 amplitude, perfectly aligned with tier thresholds.")
    print("New fixture uses 0.005 whisper baseline + sharp 0.22 transients.\n")

    wav = gen_m7_whisper_then_loud()
    test_events = [
        {"label": "Whisper Ambient", "category": "Human Activity", "confidence": 0.75, "start": 0.2, "end": 1.8,
         "expected_intensity": INTENSITY_LOW_LABEL},
        {"label": "Medium Hum",      "category": "Artificial",     "confidence": 0.85, "start": 2.2, "end": 3.8,
         "expected_intensity": INTENSITY_MID_LABEL},
        {"label": "Sharp Clap",      "category": "Human Activity", "confidence": 0.90, "start": 4.1, "end": 5.6,
         "expected_intensity": INTENSITY_HIGH_LABEL},
    ]

    total = len(test_events)
    correct = 0

    try:
        t0 = time.time()
        enriched = enrich_events_with_intensity(test_events, wav)
        elapsed_ms = (time.time() - t0) * 1000

        for ev in enriched:
            expected = ev["expected_intensity"]
            predicted = ev["intensity"]
            pct = ev["intensity_pct"]
            passed = predicted == expected
            if passed:
                correct += 1
            status = "[PASS]" if passed else "[FAIL]"
            print(f"  {status} '{ev['label']}': expected={expected}, got={predicted} ({pct:.1f}% of peak)")

        print(f"\n  Batch processing time: {elapsed_ms:.2f} ms")
    finally:
        if os.path.exists(wav):
            os.remove(wav)

    accuracy = correct / total * 100
    print(f"\n  Accuracy on UNFAMILIAR audio: {correct}/{total} = {accuracy:.1f}%")
    print(f"  (Existing dev-fixture accuracy was reported as 100% = 3/3)")
    print("=" * 65 + "\n")
    return accuracy


if __name__ == "__main__":
    a5 = run_m5_unfamiliar()
    a6 = run_m6_unfamiliar()
    a7 = run_m7_unfamiliar()

    print("=" * 65)
    print("STRESS-TEST SUMMARY vs REPORTED DEV-FIXTURE SCORES")
    print("=" * 65)
    print(f"  M5 Sound Categorization : {a5:.1f}%  (dev-fixtures = 100%)")
    print(f"  M6 Distance Estimation  : {a6:.1f}%  (dev-fixtures = 100%)")
    print(f"  M7 Intensity Analysis   : {a7:.1f}%  (dev-fixtures = 100%)")
    print()
    print("  Gaps vs 100% represent real generalization deficit to unfamiliar")
    print("  audio. DO NOT adjust thresholds here — triage as separate task.")
    print("=" * 65)
