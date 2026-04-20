# M8 - Real-Time Audio Intelligence

## Goal
Process microphone audio in near real time and update dashboard continuously.

## Current Implementation Mapping
- Live dashboard UI: `frontend/src/screens/LiveDashboardScreen.tsx`
- Live transcription hook: `frontend/src/hooks/useTranscription.ts`
- Live service client: `frontend/src/services/assemblyai.ts`

## Acceptance Checklist
- [ ] Start/stop live session
- [ ] Chunked microphone processing
- [ ] Live transcript updates with speaker labels
- [ ] Background sounds, distance, and intensity update with low latency

## Status
- In progress. Core scaffolding exists; production-grade low-latency stream pipeline pending.
