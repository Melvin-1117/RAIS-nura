import json
from pathlib import Path
from app.services.diarization_service import diarize_file

sample_dir = Path(r"c:/Users/anton/nura_hackathon/sample")
files = sorted([p for p in sample_dir.iterdir() if p.is_file() and p.suffix.lower() in {".wav", ".mp3", ".m4a"}])

rows = []
for path in files:
    result = diarize_file(str(path))
    utterances = result.get("utterances", [])
    non_empty = sum(1 for u in utterances if str(u.get("text", "")).strip())
    rows.append({
        "file": path.name,
        "mode": result.get("processing", {}).get("transcript_mode"),
        "total_speakers": result.get("total_speakers"),
        "speaker_labels": result.get("speaker_labels", []),
        "segments": len(result.get("segments", [])),
        "utterances": len(utterances),
        "non_empty_utterances": non_empty,
        "first_utterance": (utterances[0]["text"] if utterances else "")[:180],
    })

print(json.dumps(rows, ensure_ascii=False, indent=2))
