from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.job_store import job_store
from app.pipeline import run_full_pipeline
from app.schemas import (
    SeparationJobCreateOut,
    SeparationJobStatusOut,
    SeparationMetaOut,
    SeparationResultOut,
    SoundEventOut,
)

APP_DIR = Path(__file__).resolve().parent
JOBS_ROOT = APP_DIR / "jobs"
JOBS_ROOT.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

app = FastAPI(
    title="M4 Background Separation API",
    version="0.1.0",
    description="Demucs + YAMNet processing server",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(JOBS_ROOT)), name="media")


def _absolute_to_media_url(path: str) -> str:
    rel = Path(path).resolve().relative_to(JOBS_ROOT.resolve())
    return f"/media/{rel.as_posix()}"


def _to_status_response(request: Request, raw_job) -> SeparationJobStatusOut:
    result_payload = None
    if raw_job.result:
        result_payload = SeparationResultOut(
            vocals_url=str(request.base_url).rstrip("/") + raw_job.result["vocals_url"],
            background_url=str(request.base_url).rstrip("/") + raw_job.result["background_url"],
            sounds=[SoundEventOut(**item) for item in raw_job.result["sounds"]],
            processing=SeparationMetaOut(**raw_job.result["processing"]),
        )

    return SeparationJobStatusOut(
        job_id=raw_job.job_id,
        status=raw_job.status,
        progress=raw_job.progress,
        stage=raw_job.stage,
        error=raw_job.error,
        result=result_payload,
    )


def _process_job(job_id: str, input_path: str, output_dir: str) -> None:
    try:
        job_store.update(job_id, status="running", stage="preprocessing", progress=10)
        job_store.update(job_id, stage="demucs_separation", progress=45)

        pipeline_result = run_full_pipeline(input_path=input_path, output_dir=output_dir)

        job_store.update(job_id, stage="yamnet_classification", progress=80)
        result = {
            "vocals_url": _absolute_to_media_url(pipeline_result["vocals_path"]),
            "background_url": _absolute_to_media_url(pipeline_result["background_path"]),
            "sounds": pipeline_result["sounds"],
            "processing": pipeline_result["processing"],
        }

        job_store.update(
            job_id,
            status="completed",
            stage="completed",
            progress=100,
            result=result,
            error=None,
        )
    except Exception as exc:
        job_store.update(
            job_id,
            status="failed",
            stage="failed",
            progress=100,
            error=str(exc),
        )


def _save_upload(file: UploadFile, output_path: Path) -> None:
    with open(output_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)


@app.post("/api/separation/jobs", response_model=SeparationJobCreateOut)
async def create_separation_job(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> SeparationJobCreateOut:
    del request
    suffix = Path(file.filename or "input.wav").suffix or ".wav"
    allowed = {
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
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    job_id = uuid.uuid4().hex
    job_dir = JOBS_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / f"input{suffix}"
    _save_upload(file, input_path)

    if os.path.getsize(input_path) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Audio file too large. Max 50MB")

    job_store.create(job_id)
    background_tasks.add_task(_process_job, job_id, str(input_path), str(job_dir))

    return SeparationJobCreateOut(job_id=job_id, status="queued")


@app.get("/api/separation/jobs/{job_id}", response_model=SeparationJobStatusOut)
async def get_separation_job_status(job_id: str, request: Request) -> SeparationJobStatusOut:
    raw_job = job_store.get(job_id)
    if not raw_job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_status_response(request, raw_job)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
