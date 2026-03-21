from typing import List

from pydantic import BaseModel, Field


class SegmentOut(BaseModel):
    start: float = Field(..., description="Segment start time in seconds")
    end: float = Field(..., description="Segment end time in seconds")
    speaker: str = Field(..., description="Normalized speaker label")


class UtteranceOut(BaseModel):
    start: float
    end: float
    speaker: str
    text: str


class SoundEventOut(BaseModel):
    start: float
    end: float
    label: str
    category: str
    distance: str
    intensity: str
    confidence: float


class ProcessingMetaOut(BaseModel):
    duration_seconds: float
    source_sample_rate: int
    output_sample_rate: int
    transcript_mode: str


class DiarizationResponse(BaseModel):
    total_speakers: int
    segments: List[SegmentOut]
    speaker_labels: List[str]
    utterances: List[UtteranceOut]
    sounds: List[SoundEventOut]
    processing: ProcessingMetaOut
