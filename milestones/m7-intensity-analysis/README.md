# M7 - Sound Intensity Analysis

## Goal
Label event loudness as Low, Medium, or High.

## Current Implementation Mapping
- Intensity heuristic: `_energy_to_intensity` in `backend/app/services/diarization_service.py`
- UI bar: `frontend/src/components/IntensityBar.tsx`

## Acceptance Checklist
- [ ] Each sound has intensity label
- [ ] Relative loudness is visually represented
- [ ] Dominant sounds stand out from low-level background

## Status
- Partial. Heuristic RMS-like approximation exists; calibrated normalization pending.
