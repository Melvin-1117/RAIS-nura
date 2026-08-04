"""
PART 1 - Real End-to-End Latency Benchmark
==========================================
Measures wall-clock time for the non-ASR portion of _process_audio_chunk()
over 10 runs using a realistic 2-second 16kHz 16-bit PCM mono chunk.

The ASR (transformers) step is NOT installed in this environment. The
benchmark therefore times the sub-pipeline that DOES run:
  - RMS silence gate
  - Intensity percentage calculation (M7)
  - YAMNet-heuristic FFT sound classification (M5)
  - Distance estimation (M6)

This is the same code that _process_audio_chunk() exercises when transformers
is available but produces no text (e.g. non-speech input), which is what the
original 7.53ms benchmark measured.

To get a true ASR-inclusive latency, install transformers in the venv and
re-run with a real speech WAV file.

Usage:
    cd backend
    python tests/verify_latency_real_e2e.py
"""

import os
import sys
import time
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.distance_estimator import estimate_distance_for_event
from app.services.intensity_analyzer import analyze_event_intensity, compute_segment_rms
from app.services.sound_categorizer import get_category, predict_yamnet_sounds


def generate_realistic_chunk(duration_sec: float = 2.0, sr: int = 16000) -> bytes:
    """
    Generate a 2-second 16kHz 16-bit PCM chunk with a 440 Hz sine wave at
    amplitude 0.12 - representative of a speech-level signal that WILL pass
    the RMS silence gates (>0.005) and trigger the full pipeline.
    Size: 2.0 x 16000 x 2 bytes = 64,000 bytes (>= BUFFER_TARGET_BYTES).
    """
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    signal = 0.12 * np.sin(2 * np.pi * 440 * t)
    return (signal * 32767).astype(np.int16).tobytes()


def process_chunk_no_asr(raw_bytes: bytes, chunk_id: int, start_time: float):
    """
    Replicate the non-ASR portion of _process_audio_chunk():
    1. RMS gate
    2. Intensity percentage (VU meter)
    3. Sound categorization (M5 YAMNet-heuristic FFT)
    4. Distance estimation (M6)
    5. Intensity tier (M7)
    Returns None if all sound_events are low-confidence (same as real function).
    """
    CONFIDENCE_THRESHOLD = 0.4

    pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
    pcm_float32 = pcm_int16.astype(np.float32) / 32768.0

    chunk_rms = compute_segment_rms(pcm_float32)
    if chunk_rms < 0.005:
        return None

    _, chunk_intensity_pct = analyze_event_intensity(chunk_rms, session_peak_rms=0.15)

    sound_events = []
    raw_events = predict_yamnet_sounds(pcm_float32, sr=16000, frame_duration_sec=1.0)
    for ev in raw_events:
        label = ev.get("label", "Background Noise")
        conf = float(ev.get("confidence", 0.5))
        if conf < CONFIDENCE_THRESHOLD:
            label = "Unknown Sound"
            cat = "Unclassified"
        else:
            cat = get_category(label) or "Artificial"

        dist_label, dist_score = estimate_distance_for_event(pcm_float32, sr=16000)
        intensity_tier, intensity_pct = analyze_event_intensity(chunk_rms, session_peak_rms=0.15)

        sound_events.append({
            "label": label,
            "category": cat,
            "confidence": conf,
            "distance": dist_label,
            "distance_score": dist_score,
            "intensity": intensity_tier,
            "intensity_pct": intensity_pct,
        })

    elapsed = round(time.time() - start_time, 2)
    # Mirroring the real _process_audio_chunk() early-exit when nothing is detected
    if not sound_events:
        return None

    return {
        "chunk_id": chunk_id,
        "timestamp": elapsed,
        "sound_events": sound_events,
        "intensity_pct": chunk_intensity_pct,
        "connection_state": "connected",
    }


def run_benchmark(n_runs: int = 10) -> None:
    print("=" * 65)
    print("REAL E2E LATENCY BENCHMARK (non-ASR path)  Part 1")
    print("=" * 65)
    print("Chunk: 2.0 s x 16 kHz 16-bit PCM mono (64,000 bytes)")
    print(f"Runs : {n_runs}")
    print()
    print("NOTE: ASR (transformers) is NOT installed in this environment.")
    print("This benchmark times: RMS gate + M7 intensity + M5 FFT classify")
    print("                      + M6 distance + M7 intensity tier.")
    print("This is the SAME code path that produced the original 7.53ms result.")
    print("For full ASR timing: install transformers + use real speech audio.")
    print()

    raw_pcm = generate_realistic_chunk()

    latencies_ms = []
    returned_results = []

    for i in range(n_runs):
        chunk_start = time.time()
        t0 = time.time()
        result = process_chunk_no_asr(raw_pcm, chunk_id=i + 1, start_time=chunk_start)
        elapsed_ms = (time.time() - t0) * 1000
        latencies_ms.append(elapsed_ms)
        returned_results.append(result is not None)
        status = "result" if result is not None else "None (low-conf gate)"
        print(f"  Run {i+1:02d}: {elapsed_ms:8.2f} ms  -> {status}")

    print()
    print("-" * 65)
    print(f"  Min   : {min(latencies_ms):.2f} ms")
    print(f"  Max   : {max(latencies_ms):.2f} ms")
    print(f"  Avg   : {sum(latencies_ms)/len(latencies_ms):.2f} ms")
    print(f"  Median: {sorted(latencies_ms)[len(latencies_ms)//2]:.2f} ms")
    print(f"  Runs returning payload: {sum(returned_results)}/{n_runs}")
    print()
    print("TARGET: < 500 ms per chunk (PRD M8 sub-500ms requirement)")
    all_pass = all(ms < 500 for ms in latencies_ms)
    print(f"RESULT: {'ALL RUNS PASS' if all_pass else 'SOME RUNS EXCEEDED 500 ms'}")
    print("=" * 65)


if __name__ == "__main__":
    run_benchmark(n_runs=10)
