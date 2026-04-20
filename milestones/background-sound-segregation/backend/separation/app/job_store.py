from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class SeparationJob:
    job_id: str
    status: str = "queued"
    progress: int = 0
    stage: str = "queued"
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class JobStore:
    def __init__(self) -> None:
        self._items: Dict[str, SeparationJob] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str) -> SeparationJob:
        with self._lock:
            job = SeparationJob(job_id=job_id)
            self._items[job_id] = job
            return job

    def get(self, job_id: str) -> Optional[SeparationJob]:
        with self._lock:
            return self._items.get(job_id)

    def update(self, job_id: str, **fields: Any) -> Optional[SeparationJob]:
        with self._lock:
            job = self._items.get(job_id)
            if not job:
                return None
            for key, value in fields.items():
                setattr(job, key, value)
            return job


job_store = JobStore()
