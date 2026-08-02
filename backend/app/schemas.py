from typing import List, Optional

from pydantic import BaseModel, Field


class SegmentOut(BaseModel):
    start: float = Field(..., description="Segment start time in seconds")
    end: float = Field(..., description="Segment end time in seconds")
    speaker: str = Field(..., description="Normalized speaker label")
    speaker_display: str = Field(..., description="Resolved speaker name or Unknown label")
    speaker_confidence: float = Field(..., description="Confidence score for speaker recognition")


class UtteranceOut(BaseModel):
    speaker: str = Field(..., description="Original diarization ID (e.g., 'A', 'Speaker 1')")
    speaker_name: str = Field("Unknown Speaker", description="Resolved speaker name or 'Unknown Speaker'")
    confidence: Optional[float] = Field(None, description="Similarity score, or null if unmatched")
    text: str = Field(..., description="Transcribed text for the utterance")
    start: float = Field(..., description="Utterance start time in seconds")
    end: float = Field(..., description="Utterance end time in seconds")
    speaker_display: str = Field("Unknown", description="Resolved speaker display name")
    speaker_confidence: float = Field(0.0, description="Confidence score for speaker recognition")



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
    separation_confirmed: bool = False
    speech_energy_ratio: float = 0.0
    background_energy_ratio: float = 0.0
    overall_energy_rms: float = 0.0
    overall_intensity: str = "Low"


class SpeakerMatchOut(BaseModel):
    speaker: str
    display_name: str
    confidence: float
    matched: bool


class DiarizationResponse(BaseModel):
    total_speakers: int
    segments: List[SegmentOut]
    speaker_labels: List[str]
    speaker_matches: List[SpeakerMatchOut] = []
    utterances: List[UtteranceOut]
    sounds: List[SoundEventOut]
    processing: ProcessingMetaOut


class SpeakerProfileOut(BaseModel):
    id: str
    name: str
    created_at: str
    sample_duration_seconds: float
