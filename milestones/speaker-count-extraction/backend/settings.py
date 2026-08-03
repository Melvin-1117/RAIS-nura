from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    hf_token: str = ""
    pyannote_model: str = "pyannote/speaker-diarization-3.1"
    target_sample_rate: int = 16000
    whisper_api_key: str = ""
    whisper_api_base_url: str = "https://api.openai.com/v1"
    whisper_model: str = "whisper-1"
    whisper_timeout_seconds: float = 180.0
    local_asr_model: str = "distil-whisper/distil-large-v3"
    local_asr_chunk_length_seconds: int = 10
    local_asr_batch_size: int = 2
    local_asr_num_beams: int = 5
    local_asr_language: str = ""
    prefer_local_asr_for_alignment: bool = True
    enable_sound_separation: bool = True
    short_speaker_threshold_seconds: float = 0.3
    speaker_merge_max_gap_seconds: float = 0.10
    attach_min_overlap_seconds: float = 0.3
    attach_min_overlap_ratio: float = 0.4
    attach_nearest_max_distance_seconds: float = 1.2
    sparse_transcript_ratio_threshold: float = 0.5
    torch_num_threads: int = 2
    release_models_after_request: bool = True
    enable_pyannote_diarization: bool = False
    enable_local_asr_fallback: bool = False

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, env_file_encoding="utf-8")


settings = Settings()
