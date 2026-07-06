"""HiLCoE Scheduler — solver service.

Endpoints:
  GET  /health          liveness
  POST /precheck        synchronous sanity report for a payload
  POST /solve           synchronous solve (small payloads / tests)
  POST /jobs            asynchronous solve -> {job_id}
  GET  /jobs/{job_id}   poll job status/result
"""
from fastapi import FastAPI, HTTPException

from .contract import CONTRACT_VERSION, PrecheckReport, SolveRequest, SolveResponse
from .model import solve
from .precheck import precheck
from . import jobs

app = FastAPI(title="HiLCoE Scheduler Solver", version=CONTRACT_VERSION)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "contract_version": CONTRACT_VERSION}


@app.post("/precheck", response_model=PrecheckReport)
def do_precheck(req: SolveRequest) -> PrecheckReport:
    return precheck(req)


@app.post("/solve", response_model=SolveResponse)
def do_solve(req: SolveRequest) -> SolveResponse:
    return solve(req)


@app.post("/jobs")
def submit_job(req: SolveRequest) -> dict:
    job = jobs.submit(req)
    return {"job_id": job.id, "status": job.status}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job id (results expire after 1h)")
    return {
        "job_id": job.id,
        "status": job.status,
        "result": job.result.model_dump() if job.result else None,
    }
