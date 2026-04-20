import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas import (
    DiarizationResponse,
    ProcessingMetaOut,
    SegmentOut,
    SoundEventOut,
    SpeakerMatchOut,
    UtteranceOut,
)
from app.services.diarization_service import diarize_file

router = APIRouter()
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.post("/diarize", response_model=DiarizationResponse)
async def diarize_audio(file: UploadFile = File(...)) -> DiarizationResponse:
    allowed_types = {
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/x-m4a",
        "audio/aac",
        "audio/ogg",
        "audio/webm",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Upload a valid audio file.",
        )

    suffix = Path(file.filename or "input.wav").suffix or ".wav"
    with tempfile.TemporaryDirectory() as tmp_dir:
        src_path = os.path.join(tmp_dir, f"upload{suffix}")

        with open(src_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if os.path.getsize(src_path) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Audio file is too large. Please upload a file up to 25MB.",
            )

        try:
            result = diarize_file(src_path)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Diarization failed: {exc}") from exc

    response_segments = [
        SegmentOut(
            start=seg["start"],
            end=seg["end"],
            speaker=seg["speaker"],
            speaker_display=seg.get("speaker_display", seg["speaker"]),
            speaker_confidence=float(seg.get("speaker_confidence", 0.0)),
        )
        for seg in result["segments"]
    ]
    response_utterances = [
        UtteranceOut(
            start=entry["start"],
            end=entry["end"],
            speaker=entry["speaker"],
            speaker_display=entry.get("speaker_display", entry["speaker"]),
            speaker_confidence=float(entry.get("speaker_confidence", 0.0)),
            text=entry["text"],
        )
        for entry in result["utterances"]
    ]
    response_sounds = [
        SoundEventOut(
            start=entry["start"],
            end=entry["end"],
            label=entry["label"],
            category=entry["category"],
            distance=entry["distance"],
            intensity=entry["intensity"],
            confidence=entry["confidence"],
        )
        for entry in result["sounds"]
    ]

    speaker_matches = [
        SpeakerMatchOut(
            speaker=item["speaker"],
            display_name=item["display_name"],
            confidence=float(item.get("confidence", 0.0)),
            matched=bool(item.get("matched", False)),
        )
        for item in result.get("speaker_matches", [])
    ]

    return DiarizationResponse(
        total_speakers=result["total_speakers"],
        segments=response_segments,
        speaker_labels=result["speaker_labels"],
        speaker_matches=speaker_matches,
        utterances=response_utterances,
        sounds=response_sounds,
        processing=ProcessingMetaOut(**result["processing"]),
    )
