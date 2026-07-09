"""Lyrics API endpoints"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import Lyrics
from services.lyrics import get_or_fetch_lyrics, fetch_all_lyrics

router = APIRouter()

# Batch fetch status
_fetch_status = {"running": False, "total": 0, "found": 0, "missing": 0, "current": 0}


@router.get("/{track_id}")
async def get_lyrics(track_id: str, db: AsyncSession = Depends(get_db)):
    """Get synced lyrics for a track"""
    result = await get_or_fetch_lyrics(track_id, db)
    if not result:
        raise HTTPException(status_code=404, detail="Lyrics not found")
    return result


@router.post("/fetch-all")
async def start_batch_fetch(db: AsyncSession = Depends(get_db)):
    """Start batch lyrics fetch for entire library"""
    if _fetch_status["running"]:
        raise HTTPException(status_code=409, detail="Batch fetch already in progress")

    _fetch_status.update({"running": True, "total": 0, "found": 0, "missing": 0, "current": 0})

    async def on_progress(current, total, found, missing):
        _fetch_status.update(current=current, total=total, found=found, missing=missing)

    import asyncio
    asyncio.create_task(_run_batch(db, on_progress))
    return {"status": "started"}


async def _run_batch(db, progress_callback):
    global _fetch_status
    try:
        result = await fetch_all_lyrics(db, progress_callback)
        _fetch_status.update(running=False, **result)
    except Exception as e:
        _fetch_status.update(running=False, error=str(e))


@router.get("/status/batch")
async def batch_status():
    """Get batch fetch status"""
    return _fetch_status
