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
- Model-based event classification and category mapping: backend/separation/app/pipeline.py
- Sounds grouping and rendering: frontend/src/screens/ResultsScreen.tsx
- UI cards: frontend/src/components/SoundCategoryCard.tsx

## Acceptance Checklist
- [x] Event labels include timestamps
- [x] Every event has one valid category
- [x] Results grouped by category in UI

## Status
- Completed. Model-based YAMNet classification is active in the M4 separation pipeline and surfaced in grouped M5 UI cards.
