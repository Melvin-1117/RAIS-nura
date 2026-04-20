# M2 - Speaker-wise Speech Extraction

## Goal
Show a timestamped transcript attributed to each speaker.

## Current Implementation Mapping
- Transcript data model: `backend/app/schemas.py`
- Utterance generation: `backend/app/services/diarization_service.py`
- Transcript UI: `frontend/src/components/TranscriptBubble.tsx`
- Results screen: `frontend/src/screens/ResultsScreen.tsx`

## Acceptance Checklist
- [ ] Utterances are time-sorted
- [ ] Speaker label and timestamps visible
- [ ] Speaker colors stay consistent across utterances
- [ ] Scrollable transcript view works for long files
