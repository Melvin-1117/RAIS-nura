import asyncio
import json
import os
import tempfile
import time
import wave
from typing import Any, Dict, List, Optional
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.diarization_service import _get_local_asr_pipeline
from app.services.distance_estimator import estimate_distance_for_event
from app.services.intensity_analyzer import analyze_event_intensity, compute_segment_rms
from app.services.sound_categorizer import get_category, predict_yamnet_sounds

router = APIRouter()


def _detect_speaker_activity(pcm_float32: np.ndarray, sr: int = 16000) -> List[str]:
    """
    Lightweight speaker-activity detector for live streaming path.
    Avoids full Pyannote diarization to maintain sub-500ms latency.
    Attempts matching against enrolled speaker profiles (M3) or defaults to 'Speaker A'.
    """
    rms = float(np.sqrt(np.mean(np.square(pcm_float32))) + 1e-8)
    if rms < 0.01:
        return []

    try:
        from app.services.speaker_profiles_service import match_speaker_from_samples
        matched_name = match_speaker_from_samples(pcm_float32, sr=sr)
        if matched_name:
            return [matched_name]
    except Exception:
        pass

    return ["Speaker A"]


def _process_audio_chunk(
    raw_bytes: bytes,
    chunk_id: int,
    start_time: float,
) -> Optional[Dict[str, Any]]:
    """
    Runs lightweight per-chunk real-time pipeline:
    1. Whisper ASR transcription delta
    2. Lightweight VAD / active speaker detection
    3. Direct raw-chunk sound categorization (no Demucs pass per PRD M8 tradeoff)
    4. M6 distance & M7 intensity feature scoring
    """
    if not raw_bytes or len(raw_bytes) < 3200:
        return None

    try:
        pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
        pcm_float32 = pcm_int16.astype(np.float32) / 32768.0

        # Skip near-silent audio chunks (< 0.005 RMS)
        chunk_rms = compute_segment_rms(pcm_float32)
        if chunk_rms < 0.005:
            return None

        # Chunk intensity percentage for animated live VU meter
        _, chunk_intensity_pct = analyze_event_intensity(chunk_rms, session_peak_rms=0.15)

        # 1. Write chunk to temp WAV for local Whisper ASR model
        text = ""
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        os.close(tmp_fd)
        try:
            with wave.open(tmp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(raw_bytes)

            asr = _get_local_asr_pipeline()
            output = asr(
                tmp_path,
                return_timestamps=False,
                generate_kwargs={"task": "transcribe"},
            )
            text = str(output.get("text") or "").strip()
        except Exception as asr_err:
            print(f"[Live ASR Error] {asr_err}")
            text = ""
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        # 2. Lightweight Speaker Activity
        active_speakers = _detect_speaker_activity(pcm_float32) if text else []
        if not active_speakers and chunk_rms > 0.03:
            active_speakers = ["Speaker A"]

        # 3. Direct Raw-Chunk Sound Categorization
        # TRADEOFF NOTE (per PRD M8 Hackathon Strategy): Sound categorization runs directly
        # on raw chunk samples without Demucs separation to achieve sub-500ms real-time latency.
        sound_events = []
        raw_events = predict_yamnet_sounds(pcm_float32, sr=16000, frame_duration_sec=1.0)
        for ev in raw_events:
            label = ev.get("label", "Background Noise")
            conf = float(ev.get("confidence", 0.5))

            # Apply M5 confidence threshold (<0.4 -> "Unknown Sound")
            if conf < 0.4:
                label = "Unknown Sound"
                cat = "Unclassified"
            else:
                cat = get_category(label) or "Artificial"

            # M6 Distance Estimation
            dist_label, dist_score = estimate_distance_for_event(pcm_float32, sr=16000)

            # M7 Loudness Intensity
            intensity_tier, intensity_pct = analyze_event_intensity(chunk_rms, session_peak_rms=0.15)

            sound_events.append(
                {
                    "label": label,
                    "category": cat,
                    "confidence": conf,
                    "start": round(ev.get("start", 0.0), 1),
                    "end": round(ev.get("end", 1.0), 1),
                    "distance": dist_label,
                    "distance_score": dist_score,
                    "intensity": intensity_tier,
                    "intensity_pct": intensity_pct,
                }
            )

        elapsed = round(time.time() - start_time, 2)

        # Skip pushing update if nothing detected in this chunk
        if not text and not sound_events:
            return None

        return {
            "chunk_id": chunk_id,
            "timestamp": elapsed,
            "transcript_delta": text,
            "active_speakers": active_speakers,
            "sound_events": sound_events,
            "intensity_pct": chunk_intensity_pct,
            "connection_state": "connected",
            # Backwards compatibility fields for existing frontend listeners
            "message_type": "FinalTranscript",
            "text": text,
            "audio_start": max(0.0, elapsed - 2.0),
            "audio_end": elapsed,
            "confidence": 0.90,
            "speaker": active_speakers[0] if active_speakers else "Speaker A",
        }

    except Exception as exc:
        print(f"[Live Chunk Processing Error] {exc}")
        return None


@router.websocket("/live/ws")
async def websocket_live_transcription(websocket: WebSocket) -> None:
    await websocket.accept()

    accumulated_bytes = bytearray()
    start_timestamp = time.time()
    chunk_counter = 0

    # 2-3s Window Buffer Target: 64,000 bytes (2.0 seconds of 16kHz 16-bit PCM mono)
    BUFFER_TARGET_BYTES = 64000

    try:
        while True:
            data = await websocket.receive_bytes()
            if not data:
                continue

            accumulated_bytes.extend(data)

            if len(accumulated_bytes) >= BUFFER_TARGET_BYTES:
                chunk_bytes = bytes(accumulated_bytes)
                accumulated_bytes.clear()
                chunk_counter += 1

                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    _process_audio_chunk,
                    chunk_bytes,
                    chunk_counter,
                    start_timestamp,
                )

                if result:
                    await websocket.send_json(result)

    except WebSocketDisconnect:
        print("[Live WS] Client disconnected cleanly")
    except Exception as exc:
        print(f"[Live WS ERROR] {exc}")
        try:
            await websocket.send_json(
                {
                    "message_type": "Error",
                    "error": str(exc),
                    "connection_state": "error",
                }
            )
        except Exception:
            pass
    finally:
        accumulated_bytes.clear()
