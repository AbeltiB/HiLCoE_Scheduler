"""HiLCoE Scheduler — solver service.

Endpoints:
  GET  /health          liveness
  POST /precheck        synchronous sanity report for a payload
  POST /solve           synchronous solve (small payloads / tests)
  POST /jobs            asynchronous solve -> {job_id}
  GET  /jobs/{job_id}   poll job status/result
"""
import os
import secrets
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .logging_config import configure_logging, logger
from .contract import CONTRACT_VERSION, PrecheckReport, SolveRequest, SolveResponse
from .model import solve
from .precheck import precheck
from . import jobs

configure_logging()

# "Internal-only, never expose via Caddy" was previously just a Dockerfile
# comment — a deployment convention, not something the service itself
# enforced. Every request (except the liveness check) must now present the
# shared secret the web app is configured with.
SOLVER_SHARED_SECRET = os.environ.get("SOLVER_SHARED_SECRET")
if not SOLVER_SHARED_SECRET:
    raise RuntimeError("SOLVER_SHARED_SECRET environment variable must be set")

app = FastAPI(title="HiLCoE Scheduler Solver", version=CONTRACT_VERSION)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

    if request.url.path != "/health":
        token = request.headers.get("x-solver-token")
        if not token or not secrets.compare_digest(token, SOLVER_SHARED_SECRET):
            logger.info(
                "request.unauthorized",
                extra={"request_id": request_id, "route": request.url.path, "method": request.method},
            )
            return JSONResponse({"detail": "Invalid or missing X-Solver-Token"}, status_code=401)

    start = time.monotonic()
    response = await call_next(request)
    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "route": request.url.path,
            "method": request.method,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    response.headers["X-Request-Id"] = request_id
    return response


@app.get("/health")
def health() -> dict:
    return {"ok": True, "contract_version": CONTRACT_VERSION}


@app.post("/precheck", response_model=PrecheckReport)
def do_precheck(req: SolveRequest, request: Request) -> PrecheckReport:
    request_id = request.headers.get("x-request-id")
    report = precheck(req)
    logger.info(
        "precheck.completed",
        extra={"request_id": request_id, "job_id": req.job_id, "outcome": "ok" if report.ok else "issues"},
    )
    return report


@app.post("/solve", response_model=SolveResponse)
def do_solve(req: SolveRequest, request: Request) -> SolveResponse:
    request_id = request.headers.get("x-request-id")
    logger.info("solve.received", extra={"request_id": request_id, "job_id": req.job_id})
    result = solve(req)
    logger.info(
        "solve.completed",
        extra={"request_id": request_id, "job_id": req.job_id, "outcome": result.status},
    )
    return result


@app.post("/jobs")
def submit_job(req: SolveRequest, request: Request) -> dict:
    request_id = request.headers.get("x-request-id")
    try:
        job = jobs.submit(req, request_id=request_id)
    except jobs.JobConflictError as e:
        logger.info("job.submit_conflict", extra={"request_id": request_id, "job_id": req.job_id})
        raise HTTPException(409, str(e)) from e
    logger.info("job.submitted", extra={"request_id": request_id, "job_id": job.id})
    return {"job_id": job.id, "status": job.status}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request) -> dict:
    request_id = request.headers.get("x-request-id")
    job = jobs.get(job_id)
    if not job:
        logger.info("job.poll_unknown", extra={"request_id": request_id, "job_id": job_id})
        raise HTTPException(404, "Unknown job id (results expire after 1h)")
    logger.info(
        "job.polled",
        extra={"request_id": request_id, "job_id": job_id, "outcome": job.status},
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "result": job.result.model_dump() if job.result else None,
    }
