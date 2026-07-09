"""Import API endpoints"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from pathlib import Path

from db.database import get_db
from services.import_service import import_service
from services.metadata_pipeline import pipeline as metadata_pipeline

router = APIRouter()


class ImportRequest(BaseModel):
    path: str
    options: dict = {}


class RescanRequest(BaseModel):
    path: str | None = None
    options: dict = {}


@router.post("/start")
async def start_import(
    request: ImportRequest,
    db: AsyncSession = Depends(get_db)
):
    """Start importing music from a folder"""
    
    path = Path(request.path)
    
    if not path.exists():
        raise HTTPException(status_code=400, detail="Path does not exist")
    
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Path must be a directory")
    
    # Start import
    job_id = await import_service.start_import(str(path), db, request.options)
    
    return {
        "status": "started",
        "path": str(path),
        "job_id": job_id
    }


@router.get("/status/{job_id}")
async def get_import_status(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get import job status"""
    status = await import_service.get_job_status(job_id, db)
    
    if not status:
        raise HTTPException(status_code=404, detail="Import job not found")
    
    return status


@router.post("/cancel/{job_id}")
async def cancel_import(job_id: str):
    """Cancel import job"""
    # TODO: Implement cancellation
    return {"status": "cancelled"}


@router.post("/pipeline")
async def trigger_pipeline(db: AsyncSession = Depends(get_db)):
    """Re-run the metadata enrichment pipeline on all tracks"""
    import asyncio
    enriched = await metadata_pipeline.run_on_all_tracks(db)
    return {"status": "completed", "tracks_enriched": enriched}


@router.post("/rescan")
async def rescan_library(payload: RescanRequest, db: AsyncSession = Depends(get_db)):
    """Rescan the library — uses last import path or provided path"""
    from db.models import ImportJob
    from sqlalchemy import select

    path = payload.path
    if not path:
        result = await db.execute(
            select(ImportJob).where(ImportJob.status == "completed")
            .order_by(ImportJob.started_at.desc())
        )
        last_job = result.scalars().first()
        if last_job:
            path = last_job.path
    if not path:
        raise HTTPException(status_code=400, detail="No previous import found. Provide a path.")
    job_id = await import_service.start_import(path, db, {})
    return {"status": "started", "path": path, "job_id": job_id}
