# M6 - Sound Distance Estimation

## Goal
Estimate distance class per sound event: Near, Mid, Far.

## Current Implementation Mapping
- Distance heuristic: `_energy_to_distance` in `backend/app/services/diarization_service.py`
- UI badge: `frontend/src/components/DistanceBadge.tsx`

## Acceptance Checklist
- [ ] Every sound event has distance class
- [ ] Distance labels rendered next to sounds
- [ ] Edge cases produce deterministic fallback values

## Status
- Partial. Energy heuristic exists; multi-feature RT60/roll-off scoring pending.
