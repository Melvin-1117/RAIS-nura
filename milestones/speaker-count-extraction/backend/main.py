from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import diarization, speaker_profiles
from app.settings import ENV_FILE_PATH, settings

app = FastAPI(
    title="Real-Time Audio Intelligence API",
    description="Milestone 1: Speaker Count Extraction using pyannote.audio",
    version="0.1.0",
)

# For hackathon demos, allow all origins. Tighten this in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(diarization.router, prefix="/api", tags=["diarization"])
app.include_router(speaker_profiles.router, prefix="/api", tags=["speaker-profiles"])


@app.on_event("startup")
async def log_runtime_configuration() -> None:
    print("\n=== Backend Configuration Summary ===")
    print(f"ENV file path: {ENV_FILE_PATH}")
    print(f"HF_TOKEN: {'SET' if settings.hf_token else 'UNSET'}")
    print(f"WHISPER_API_KEY: {'SET' if settings.whisper_api_key else 'UNSET'}")
    print(f"WHISPER_API_BASE_URL: {settings.whisper_api_base_url}")
    print(f"Enable pyannote diarization: {settings.enable_pyannote_diarization}")
    print(f"Enable local ASR fallback: {settings.enable_local_asr_fallback}")
    print(f"Enable sound separation: {settings.enable_sound_separation}")
    print(f"Local ASR model: {settings.local_asr_model}")
    print(f"Local ASR chunk seconds: {settings.local_asr_chunk_length_seconds}")
    print("====================================\n")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
