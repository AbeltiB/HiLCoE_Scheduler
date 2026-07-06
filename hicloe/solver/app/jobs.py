"""Minimal in-process job registry. One solver container = one registry;
jobs also persist their result on the web-app side (ScheduleVersion), so this
only needs to survive the polling window."""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

from .contract import SolveRequest, SolveResponse
from .model import solve

_executor = ThreadPoolExecutor(max_workers=2)  # CP-SAT is multi-threaded itself
_lock = threading.Lock()
_jobs: dict[str, "Job"] = {}
TTL_SECONDS = 3600


@dataclass
class Job:
    id: str
    status: str = "QUEUED"  # QUEUED | RUNNING | DONE
    submitted_at: float = field(default_factory=time.monotonic)
    result: Optional[SolveResponse] = None


def submit(req: SolveRequest) -> Job:
    job = Job(id=req.job_id or str(uuid.uuid4()))
    with _lock:
        _gc()
        _jobs[job.id] = job

    def run() -> None:
        with _lock:
            job.status = "RUNNING"
        result = solve(req)  # never raises; returns status=ERROR instead
        with _lock:
            job.result = result
            job.status = "DONE"

    _executor.submit(run)
    return job


def get(job_id: str) -> Optional[Job]:
    with _lock:
        return _jobs.get(job_id)


def _gc() -> None:
    cutoff = time.monotonic() - TTL_SECONDS
    for jid in [j for j, job in _jobs.items() if job.submitted_at < cutoff]:
        del _jobs[jid]
