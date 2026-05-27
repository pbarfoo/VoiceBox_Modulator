import shutil
import threading
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db, jobs as job_store
from .config import APP_NAME, audio_dir
from .engines import manager, EngineNotReady, EngineParams

app = FastAPI(title=f"{APP_NAME} API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost", "http://tauri.localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": APP_NAME}


# ── engine ──────────────────────────────────────────────────────────────────

@app.get("/engine/status")
def engine_status() -> dict:
    return manager.status()


@app.post("/engine/select")
def engine_select(engine: str = Query("seedvc")) -> dict:
    """Switch the active engine. Unloads the previous one first."""
    try:
        return manager.select_engine(engine)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/engine/load")
def engine_load(model: str = "seedvc") -> dict:
    """Backward-compat alias for /engine/select."""
    try:
        return manager.select_engine(model)
    except ValueError:
        return manager.select_engine("seedvc")


@app.post("/engine/unload")
def engine_unload() -> dict:
    return manager._active.unload()


# ── conversion ───────────────────────────────────────────────────────────────

def _save_upload(upload: UploadFile, prefix: str) -> Path:
    suffix = Path(upload.filename or "audio.wav").suffix or ".wav"
    dest = audio_dir() / f"{prefix}_{uuid.uuid4().hex}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return dest


@app.post("/convert")
async def convert(
    source: UploadFile = File(...),
    target: Optional[UploadFile] = File(None),
    profile_id: Optional[str] = Form(None),
    diffusion_steps: int = Form(25),
    tau: float = Form(0.3),
    f0_up_key: int = Form(0),
) -> dict:
    """Start an async conversion job. Returns a job object immediately."""
    source_path = _save_upload(source, "source")

    profile = None
    if profile_id:
        profile = db.get_profile(profile_id)
        if not profile:
            raise HTTPException(404, "profile not found")
        ref_path = profile["ref_path"]
    elif target is not None:
        ref_path = str(_save_upload(target, "ref"))
    else:
        raise HTTPException(400, "provide either a target sample or a profile_id")

    out_path = audio_dir() / f"out_{uuid.uuid4().hex}.wav"
    params   = EngineParams(diffusion_steps=diffusion_steps, tau=tau, f0_up_key=f0_up_key)
    job      = job_store.create()

    def _run() -> None:
        job_store.update(job.id, status="running", stage="Starting conversion", progress=0.02)
        try:
            def _progress(stage: str, pct: float) -> None:
                job_store.update(job.id, stage=stage, progress=pct)

            manager.convert(
                str(source_path), ref_path, str(out_path),
                params=params, progress_cb=_progress,
            )
            rec = db.add_conversion(
                source_path=str(source_path),
                output_path=str(out_path),
                engine=manager.MODEL_NAME,
                profile_id=profile["id"] if profile else None,
                profile_name=profile["name"] if profile else None,
            )
            job_store.update(job.id, status="done", stage="Complete", progress=1.0, result=rec)
        except EngineNotReady as e:
            job_store.update(job.id, status="failed", stage="Failed", error=str(e))
        except Exception as e:
            job_store.update(job.id, status="failed", stage="Failed", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return job.to_dict()


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    j = job_store.get(job_id)
    if not j:
        raise HTTPException(404, "job not found")
    return j.to_dict()


@app.get("/audio/{conversion_id}")
def get_audio(conversion_id: str):
    for rec in db.list_conversions():
        if rec["id"] == conversion_id:
            p = Path(rec["output_path"])
            if p.exists():
                return FileResponse(p, media_type="audio/wav")
    raise HTTPException(404, "audio not found")


# ── profiles ─────────────────────────────────────────────────────────────────

@app.get("/profiles")
def get_profiles() -> list[dict]:
    return db.list_profiles()


@app.post("/profiles")
async def create_profile(
    name: str = Form(...),
    description: str = Form(""),
    language: str = Form("en"),
    sample: UploadFile = File(...),
) -> dict:
    ref_path = _save_upload(sample, "profile")
    return db.create_profile(name, str(ref_path), description, language)


@app.delete("/profiles/{profile_id}")
def remove_profile(profile_id: str) -> dict:
    db.delete_profile(profile_id)
    return {"deleted": profile_id}


# ── history ───────────────────────────────────────────────────────────────────

@app.get("/history")
def history() -> list[dict]:
    return db.list_conversions()
