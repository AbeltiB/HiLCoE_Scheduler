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

from .logging_config import logger
from .contract import SolveRequest, SolveResponse
from .model import solve

_executor = ThreadPoolExecutor(max_workers=2)  # CP-SAT is multi-threaded itself
_lock = threading.Lock()
_jobs: dict[str, "Job"] = {}
TTL_SECONDS = 3600
GC_INTERVAL_SECONDS = 60


class JobConflictError(Exception):
    """Raised when a job_id is resubmitted while still in flight."""


@dataclass
class Job:
    id: str
    status: str = "QUEUED"  # QUEUED | RUNNING | DONE
    submitted_at: float = field(default_factory=time.monotonic)
    result: Optional[SolveResponse] = None


def submit(req: SolveRequest, request_id: Optional[str] = None) -> Job:
    job = Job(id=req.job_id or str(uuid.uuid4()))
    with _lock:
        _gc()
        existing = _jobs.get(job.id)
        if existing is not None and existing.status in ("QUEUED", "RUNNING"):
            # Without this check a resubmitted job_id silently replaces the
            # dict entry the original caller is polling, orphaning the
            # in-flight future and its eventual result.
            raise JobConflictError(f"job_id {job.id!r} is already {existing.status}")
        _jobs[job.id] = job

    def run() -> None:
        with _lock:
            job.status = "RUNNING"
        logger.info("job.running", extra={"request_id": request_id, "job_id": job.id})
        start = time.monotonic()
        result = solve(req)  # never raises; returns status=ERROR instead
        with _lock:
            job.result = result
            job.status = "DONE"
        logger.info(
            "job.done",
            extra={
                "request_id": request_id,
                "job_id": job.id,
                "outcome": result.status,
                "duration_ms": int((time.monotonic() - start) * 1000),
            },
        )

    _executor.submit(run)
    return job


def get(job_id: str) -> Optional[Job]:
    with _lock:
        return _jobs.get(job_id)


def _gc() -> None:
    cutoff = time.monotonic() - TTL_SECONDS
    expired = [j for j, job in _jobs.items() if job.submitted_at < cutoff]
    for jid in expired:
        del _jobs[jid]
    if expired:
        logger.info("job.gc", extra={"outcome": f"expired={len(expired)}"})


def _gc_loop() -> None:
    # Previously _gc() only ran opportunistically inside submit(), so the
    # advertised "results kept 1h" wasn't actually time-bounded — memory was
    # bounded by "how many jobs ran during the last burst," not by a clock.
    # This makes it a real, proactive TTL regardless of submission traffic.
    while True:
        time.sleep(GC_INTERVAL_SECONDS)
        with _lock:
            _gc()


threading.Thread(target=_gc_loop, daemon=True, name="job-gc").start()
