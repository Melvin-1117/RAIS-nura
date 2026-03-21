# M3 - Speaker Recognition

## Goal
Map diarized speakers to known speaker profiles.

## Current Implementation Mapping
- Profile screen: `frontend/src/screens/SpeakerProfilesScreen.tsx`
- Profile types: `frontend/src/types/profiles.ts`

## Acceptance Checklist
- [ ] Add/remove known speakers
- [ ] Persist speaker profiles locally
- [ ] Match unknown diarized speakers with similarity threshold
- [ ] Display confidence score and fallback to Unknown

## Status
- In progress. UI scaffolding exists; matching pipeline needs full implementation.
