"""
God's Eye — FastAPI backend

Endpoints:
  GET  /health                  — liveness probe
  GET  /api/metadata            — returns metadata.json from Supabase Storage
  POST /api/upload              — accepts a .nakama-0 file, runs ETL, uploads to Supabase
  GET  /api/moments             — list all saved moments from Supabase Postgres
  POST /api/moments             — create a saved moment
  DELETE /api/moments/{id}      — delete a saved moment by UUID

All Supabase interactions use the service-role key (server-side only).
CORS is enabled for all origins to support Vercel frontend.
"""

import logging
import os
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from etl import run_etl

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = "parquets"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="God's Eye API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _supabase_headers(*, content_type: Optional[str] = None) -> dict:
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def _check_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Supabase credentials not configured on server.",
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class MomentCreate(BaseModel):
    label: str = ""
    map: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    match_id: Optional[str] = None
    player_id: Optional[str] = None
    scrubber_time: int = 0
    saved_at: int = 0


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/metadata")
async def get_metadata() -> Any:
    """Proxy metadata.json from Supabase Storage."""
    _check_config()
    url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/metadata.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="metadata.json not found in storage")
    return resp.json()


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    date: str = Form(..., description="ISO date the file belongs to, e.g. 2026-02-15"),
) -> dict:
    """
    Accept a .nakama-0 Parquet file, run ETL, and store results in Supabase Storage.

    Form fields:
      file   — the .nakama-0 file
      date   — YYYY-MM-DD date string
    """
    _check_config()

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = await run_etl(
            raw_bytes=raw_bytes,
            filename=file.filename or "unknown.nakama-0",
            date_str=date,
            supabase_url=SUPABASE_URL,
            service_key=SUPABASE_SERVICE_KEY,
            bucket=BUCKET,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("ETL failed for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"ETL error: {exc}") from exc

    return result


@app.get("/api/moments")
async def list_moments() -> list:
    """Return all saved moments, newest first."""
    _check_config()
    url = f"{SUPABASE_URL}/rest/v1/saved_moments?select=*&order=saved_at.desc"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=_supabase_headers(), timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@app.post("/api/moments", status_code=201)
async def create_moment(body: MomentCreate) -> dict:
    """Persist a new saved moment."""
    _check_config()
    url = f"{SUPABASE_URL}/rest/v1/saved_moments"
    headers = _supabase_headers(content_type="application/json")
    headers["Prefer"] = "return=representation"

    payload = body.model_dump()
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    rows = resp.json()
    return rows[0] if rows else {}


@app.delete("/api/moments/{moment_id}", status_code=204)
async def delete_moment(moment_id: UUID) -> None:
    """Delete a saved moment by UUID."""
    _check_config()
    url = f"{SUPABASE_URL}/rest/v1/saved_moments?id=eq.{moment_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_supabase_headers(), timeout=15)
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
