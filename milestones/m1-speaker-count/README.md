# M1 - Speaker Count Extraction

## Goal
Process recorded audio and return the number of distinct speakers.

## Inputs
- Supported formats: `.mp3`, `.wav`, `.m4a`
- Max size: 25 MB

## API Contract
- Endpoint: `POST /api/diarize`
- Required payload: multipart `file`
- Key outputs:
  - `total_speakers`
  - `speaker_labels`
  - `processing.duration_seconds`

## Current Implementation Mapping
- Backend endpoint: `backend/app/routers/diarization.py`
- Core processing: `backend/app/services/diarization_service.py`
- Frontend upload flow: `frontend/src/screens/HomeScreen.tsx`
- API client: `frontend/src/services/api.ts`

## Acceptance Checklist
- [ ] File upload works from app
- [ ] API returns non-error response for valid audio
- [ ] `total_speakers` is shown in results
- [ ] Silence/low-speech case handled gracefully

## Notes
- If `HF_TOKEN` is missing, backend supports fallback modes:
  - `transcript_mode=whisper_only_no_diarization` when Whisper segments are available.
  - `transcript_mode=whisper_error_no_diarization` when Whisper request fails.
