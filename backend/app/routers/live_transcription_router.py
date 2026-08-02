import asyncio
import json
import tempfile
import time
import wave
from typing import Any, Dict, Optional

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.diarization_service import _get_local_asr_pipeline
from app.services.sound_categorizer import categorize_sound

router = APIRouter()


def _estimate_intensity(pcm_array: np.ndarray) -> str:
    if pcm_array.size == 0:
        return "Low"
    rms = float(np.sqrt(np.mean(np.square(pcm_array))))
    if rms > 0.15:
        return "High"
    elif rms > 0.04:
        return "Medium"
    return "Low"


@router.websocket("/live/ws")
async def websocket_live_transcription(websocket: WebSocket) -> None:
    await websocket.accept()

    accumulated_bytes = bytearray()
    start_timestamp = time.time()

    try:
        while True:
            data = await websocket.receive_bytes()
            if not data:
                continue

            accumulated_bytes.extend(data)

            # Process every time accumulated buffer exceeds ~1 second of 16kHz 16-bit mono audio (32000 bytes)
            if len(accumulated_bytes) >= 32000:
                chunk = bytes(accumulated_bytes)
                accumulated_bytes.clear()

                # Run local transcription asynchronously in background thread
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, _process_audio_chunk, chunk, start_timestamp)

                if result:
                    await websocket.send_json(result)

    except WebSocketDisconnect:
        print("[Live WS] Client disconnected")
    except Exception as exc:
        print(f"[Live WS ERROR] {exc}")
        try:
            await websocket.send_json({"message_type": "Error", "error": str(exc)})
        except Exception:
            pass


def _process_audio_chunk(raw_bytes: bytes, start_time: float) -> Optional[Dict[str, Any]]:
    if not raw_bytes or len(raw_bytes) < 3200:
        return None

    try:
        # Interpret raw 16-bit PCM 16kHz mono audio
        pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
        pcm_float32 = pcm_int16.astype(np.float32) / 32768.0

        intensity = _estimate_intensity(pcm_float32)

        # Skip near-silent audio chunks (< 0.005 RMS)
        rms = float(np.sqrt(np.mean(np.square(pcm_float32))))
        if rms < 0.005:
            return None

        # Write chunk to temp WAV for local Whisper ASR model
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            with wave.open(tmp.name, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(raw_bytes)
            tmp.flush()

            asr = _get_local_asr_pipeline()
            output = asr(
                tmp.name,
                return_timestamps=False,
                generate_kwargs={"task": "transcribe"},
            )

            text = str(output.get("text") or "").strip()
            if not text:
                return None

            elapsed = time.time() - start_time
            category = categorize_sound("speech" if len(text) > 3 else "hum")

            return {
                "message_type": "FinalTranscript",
                "text": text,
                "audio_start": max(0.0, elapsed - 2.0),
                "audio_end": elapsed,
                "confidence": 0.90,
                "speaker": "Speaker A",
                "intensity": intensity,
                "sound_category": category,
            }
    except Exception as exc:
        print(f"[Chunk processing error] {exc}")
        return None
