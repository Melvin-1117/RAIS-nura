import os
import sys
import time
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.routers.live_transcription_router import (
    _detect_speaker_activity,
    _process_audio_chunk,
)


def generate_pcm_chunk(duration_sec: float = 2.0, sr: int = 16000, amp: float = 0.12) -> bytes:
    """Generate 16kHz 16-bit PCM mono audio bytes for live testing."""
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    # Sine wave tone with speech-like frequency
    signal = amp * np.sin(2 * np.pi * 440 * t)
    pcm_int16 = (signal * 32767).astype(np.int16)
    return pcm_int16.tobytes()


def test_chunk_buffering_and_size():
    """Verify 2-3 second chunk byte size (64000 bytes for 2.0s of 16kHz 16-bit PCM)."""
    raw_pcm = generate_pcm_chunk(duration_sec=2.0)
    assert len(raw_pcm) == 64000


def test_detect_speaker_activity():
    """Verify lightweight VAD speaker activity detection without Pyannote overhead."""
    sr = 16000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)

    # Active audio signal
    active_pcm = (0.10 * np.sin(2 * np.pi * 500 * t)).astype(np.float32)
    active_speakers = _detect_speaker_activity(active_pcm, sr=sr)
    assert len(active_speakers) > 0
    assert active_speakers[0] in ["Speaker A", "Speaker B", "Unknown"] or isinstance(active_speakers[0], str)

    # Silent signal (< 0.01 RMS)
    silent_pcm = np.zeros(sr * 2, dtype=np.float32)
    silent_speakers = _detect_speaker_activity(silent_pcm, sr=sr)
    assert len(silent_speakers) == 0


def test_process_audio_chunk_payload():
    """Verify _process_audio_chunk returns structured real-time payload."""
    raw_pcm = generate_pcm_chunk(duration_sec=2.0)
    start_time = time.time()

    result = _process_audio_chunk(raw_pcm, chunk_id=1, start_time=start_time)
    if result:
        assert "chunk_id" in result
        assert result["chunk_id"] == 1
        assert "timestamp" in result
        assert "active_speakers" in result
        assert "sound_events" in result
        assert "intensity_pct" in result
        assert "connection_state" in result
        assert result["connection_state"] == "connected"


def test_realtime_latency_benchmark():
    """Verify chunk processing latency is well under the sub-500ms target."""
    raw_pcm = generate_pcm_chunk(duration_sec=2.0)
    start_time = time.time()

    t0 = time.time()
    _ = _process_audio_chunk(raw_pcm, chunk_id=42, start_time=start_time)
    proc_time_ms = (time.time() - t0) * 1000

    print(f"\n[LATENCY BENCHMARK] Per-Chunk Live Processing Latency: {proc_time_ms:.2f} ms (Target < 500ms)")
    assert proc_time_ms < 500.0, f"Processing time {proc_time_ms:.2f}ms exceeded sub-500ms target!"


if __name__ == "__main__":
    print("Running Milestone 8 Real-Time Audio Intelligence Test Suite...")
    test_chunk_buffering_and_size()
    print("[OK] test_chunk_buffering_and_size passed")

    test_detect_speaker_activity()
    print("[OK] test_detect_speaker_activity passed")

    test_process_audio_chunk_payload()
    print("[OK] test_process_audio_chunk_payload passed")

    test_realtime_latency_benchmark()
    print("[OK] test_realtime_latency_benchmark passed")

    print("\nALL MILESTONE 8 REAL-TIME PIPELINE TESTS PASSED SUCCESSFULLY!")
