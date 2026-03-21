from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    hf_token: str = ""
    pyannote_model: str = "pyannote/speaker-diarization-3.1"
    target_sample_rate: int = 16000
    assemblyai_api_key: str = ""
    assemblyai_base_url: str = "https://api.assemblyai.com/v2"
    assemblyai_poll_attempts: int = 90
    assemblyai_poll_interval_seconds: float = 2.0
    whisper_api_key: str = ""
    whisper_api_base_url: str = "https://api.openai.com/v1"
    whisper_model: str = "whisper-1"
    whisper_timeout_seconds: float = 180.0
    local_asr_model: str = "distil-whisper/distil-large-v3"
    local_asr_chunk_length_seconds: int = 8
    local_asr_batch_size: int = 8
    prefer_local_asr_for_alignment: bool = True
    torch_num_threads: int = 2
    release_models_after_request: bool = True
    enable_pyannote_diarization: bool = False
    enable_local_asr_fallback: bool = False

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, env_file_encoding="utf-8")


settings = Settings()
