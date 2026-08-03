# M8 - Real-Time Audio Intelligence

## Goal
Process microphone audio in near real time and update dashboard continuously.

## Current Implementation Mapping
- Live dashboard UI: `frontend/src/screens/LiveDashboardScreen.tsx`
- Live transcription hook: `frontend/src/hooks/useTranscription.ts`
- Live service client: `frontend/src/services/liveTranscriptionClient.ts`

## Acceptance Checklist
- [x] Start/stop live session
- [x] Chunked microphone processing
- [x] Live transcript updates with speaker labels
- [x] Background sounds, distance, and intensity update with low latency (<500ms target)

## Status
- Fully implemented and verified.
