"""
Lightweight in-process job store for tracking async conversion jobs.
Jobs live only for the process lifetime — no persistence needed.
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class Job:
    id: str
    status: str           # queued | running | done | failed
    stage: str            # human-readable current stage
    progress: float       # 0.0 – 1.0
    error: Optional[str] = None
    result: Optional[dict] = field(default=None)

    def to_dict(self) -> dict:
        return asdict(self)


_store: dict[str, Job] = {}
_lock = threading.Lock()


def create() -> Job:
    j = Job(id=uuid.uuid4().hex, status="queued", stage="Queued", progress=0.0)
    with _lock:
        _store[j.id] = j
    return j


def get(job_id: str) -> Optional[Job]:
    return _store.get(job_id)


def update(job_id: str, **kwargs) -> None:
    with _lock:
        j = _store.get(job_id)
        if j:
            for k, v in kwargs.items():
                setattr(j, k, v)
