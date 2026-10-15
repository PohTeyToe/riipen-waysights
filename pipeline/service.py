"""The service the Zoho button calls. Runs locally; not hosted anywhere.

    ENRICH_SHARED_SECRET=... uvicorn pipeline.service:app --port 8000

POST /enrich      {"account_id", "website"} -> 202 {"job_id", "status": "queued"}
GET  /jobs/{id}   -> {"job_id", "account_id", "status", ...}

Status: queued, running, done, needs_review, failed.
Rate rule: one run per Account per 24 hours, plus the fetcher's 2 s per host.
"""
from __future__ import annotations

import hmac
import os
import threading
import time
import uuid

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import summarize
from .allowlist import APPROVED, CONTEXT, is_allowed
from .fetch import Fetcher, HostClock, RunLog
from .run import CACHE, enrich, load_seed

RUN_EVERY_S = 24 * 3600

app = FastAPI(title="Enrich Account (demo service)")
clock = HostClock()
jobs: dict[str, dict] = {}
last_run: dict[str, float] = {}
lock = threading.Lock()


class EnrichRequest(BaseModel):
    account_id: str
    website: str


def check_secret(given: str | None) -> None:
    expected = os.environ.get("ENRICH_SHARED_SECRET", "")
    if not expected or not given or not hmac.compare_digest(given, expected):
        raise HTTPException(401, "missing or wrong X-Enrich-Secret")


def approved_slug(website: str) -> str | None:
    return next((slug for slug, sites in APPROVED.items() if is_allowed(website, sites[:1])), None)


def run_job(job_id: str, row: dict) -> None:
    job = jobs[job_id]
    job["status"] = "running"
    try:
        seed = load_seed()
        context = summarize.load_context(Fetcher(CONTEXT, RunLog("context"), clock, budget=10, cache_dir=CACHE))
        result = enrich(row, seed, clock, context, cached=False)
        job.update(status=result["status"], proposed=result["proposed"], questions=result["questions"],
                   writeback=result["writeback"])
    except Exception as e:  # the job reports failure; the service keeps running
        job.update(status="failed", error=f"{e.__class__.__name__}: {e}")
    job["finished_at"] = time.time()


@app.post("/enrich", status_code=202)
def start(req: EnrichRequest, background: BackgroundTasks, x_enrich_secret: str | None = Header(None)) -> dict:
    check_secret(x_enrich_secret)
    slug = approved_slug(req.website)
    if not slug:
        raise HTTPException(422, "website is not on the approved list")
    row = next((r for r in load_seed()["accounts"] if r["crm_id"] == req.account_id and r["slug"] == slug), None)
    if not row:
        raise HTTPException(404, "unknown account")
    with lock:
        since = time.time() - last_run.get(req.account_id, 0)
        if since < RUN_EVERY_S:
            raise HTTPException(429, f"one run per Account per day; try again in {int(RUN_EVERY_S - since)} s")
        last_run[req.account_id] = time.time()
        job_id = uuid.uuid4().hex
        jobs[job_id] = {"job_id": job_id, "account_id": req.account_id, "status": "queued", "queued_at": time.time()}
    background.add_task(run_job, job_id, row)
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def status(job_id: str, x_enrich_secret: str | None = Header(None)) -> dict:
    check_secret(x_enrich_secret)
    if job_id not in jobs:
        raise HTTPException(404, "unknown job")
    return jobs[job_id]
