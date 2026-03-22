import json
import os
from typing import Literal

Category = Literal["Natural", "Artificial", "Human Activity", "Music", "Animal"]
ALL_CATEGORIES: list[Category] = [
    "Natural", "Artificial", "Human Activity", "Music", "Animal"
]
DEFAULT_CATEGORY: Category = "Artificial"

_MAP_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "yamnet_category_map.json"
)


def _load_map() -> dict[str, str]:
    with open(_MAP_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


_category_map: dict[str, str] = _load_map()


def get_category(label: str) -> Category:
    """Return the domain category for a YAMNet label. Defaults to Artificial."""
    return _category_map.get(label, DEFAULT_CATEGORY)


def enrich_events(frames: list[dict]) -> list[dict]:
    """
    Attach a 'category' field to each raw YAMNet frame event.

    Input:
      [{ "label": str, "score": float, "startSec": float, "endSec": float }]
    Output:
      same shape + "category": Category on each item
    """
    return [
        {**frame, "category": get_category(frame["label"])}
        for frame in frames
    ]


def group_by_category(enriched_frames: list[dict]) -> dict[str, list[dict]]:
    """
    Group enriched frames by category. Always returns all 5 keys.
    """
    groups: dict[str, list[dict]] = {cat: [] for cat in ALL_CATEGORIES}
    for frame in enriched_frames:
        cat = frame.get("category", DEFAULT_CATEGORY)
        if cat in groups:
            groups[cat].append(frame)
        else:
            groups[DEFAULT_CATEGORY].append(frame)
    return groups


def build_categorized_response(sound_events_json: dict) -> dict:
    """
    Takes the full sound_events.json dict produced by M4 and returns the
    enriched, grouped structure consumed by the frontend.

    Input shape (from M4):
      {
        "frames": [{ "label", "score", "startSec", "endSec" }],
        "summary": [{ "label", "meanScore" }]
      }

    Output shape:
      {
        "frames": [{ "label", "score", "startSec", "endSec", "category" }],
        "byCategory": {
          "Natural": [...], "Artificial": [...], "Human Activity": [...],
          "Music": [...], "Animal": [...]
        },
        "summary": [{ "label", "meanScore", "category" }]
      }
    """
    raw_frames = sound_events_json.get("frames", [])
    raw_summary = sound_events_json.get("summary", [])

    enriched = enrich_events(raw_frames)
    grouped = group_by_category(enriched)
    enriched_summary = [
        {**item, "category": get_category(item["label"])}
        for item in raw_summary
    ]

    return {
        "frames": enriched,
        "byCategory": grouped,
        "summary": enriched_summary,
    }
