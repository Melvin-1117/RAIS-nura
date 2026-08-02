import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas import SpeakerProfileOut
from app.services.speaker_profiles_service import (
    delete_profile,
    list_profiles,
    register_profile,
)

router = APIRouter()
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@router.get("/speaker-profiles", response_model=list[SpeakerProfileOut])
async def get_speaker_profiles() -> list[SpeakerProfileOut]:
    return [SpeakerProfileOut(**item) for item in list_profiles()]


@router.post("/speaker-profiles", response_model=SpeakerProfileOut)
async def create_speaker_profile(
    name: str = Form(...),
    file: UploadFile = File(...),
) -> SpeakerProfileOut:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Speaker name is required")

    suffix = Path(file.filename or "sample.wav").suffix or ".wav"
    with tempfile.TemporaryDirectory() as tmp_dir:
        src_path = os.path.join(tmp_dir, f"sample{suffix}")

        with open(src_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if os.path.getsize(src_path) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="Sample file is too large (max 20MB)")

        try:
            created = register_profile(name=name, audio_path=src_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Profile registration failed: {exc}") from exc


    return SpeakerProfileOut(**created)


@router.delete("/speaker-profiles/{profile_id}")
async def remove_speaker_profile(profile_id: str) -> dict:
    deleted = delete_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Speaker profile not found")

    return {"status": "deleted", "id": profile_id}
