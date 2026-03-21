from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import diarization

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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
