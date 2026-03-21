# M5 - Sound Categorization

## Goal
Categorize background sound events into domain groups.

## Target Categories
- Natural
- Artificial
- Human Activity
- Music
- Animal

## Current Implementation Mapping
- Sound event shaping: `backend/app/services/diarization_service.py`
- UI cards: `frontend/src/components/SoundCategoryCard.tsx`

## Acceptance Checklist
- [ ] Event labels include timestamps
- [ ] Every event has one valid category
- [ ] Results grouped by category in UI

## Status
- Partial. Heuristic categories implemented; model-based classification pending.
