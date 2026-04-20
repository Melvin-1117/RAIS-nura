from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class SoundEventOut(BaseModel):
    start: float = Field(..., description="Event start in seconds")
    end: float = Field(..., description="Event end in seconds")
    label: str = Field(..., description="YAMNet class label")
    category: str = Field(..., description="Coarse category")
    distance: Literal["Near", "Mid", "Far"]
    intensity: Literal["Low", "Medium", "High"]
    confidence: float = Field(..., ge=0.0, le=1.0)


class SeparationMetaOut(BaseModel):
    duration_seconds: float
    source_sample_rate: int
    output_sample_rate: int
    speech_energy_ratio: float
    background_energy_ratio: float


class SeparationResultOut(BaseModel):
    vocals_url: str
    background_url: str
    sounds: List[SoundEventOut]
    processing: SeparationMetaOut


class SeparationJobCreateOut(BaseModel):
    job_id: str
    status: str


class SeparationJobStatusOut(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    progress: int = Field(..., ge=0, le=100)
    stage: str
    error: Optional[str] = None
    result: Optional[SeparationResultOut] = None
