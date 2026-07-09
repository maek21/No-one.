"""Playback API endpoints"""

import os
import mimetypes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from db.database import get_db
from db.models import Track

router = APIRouter()

# Track audio stream URL mapping
# Frontend calls GET /api/playback/stream/{track_id} to play audio


@router.api_route("/stream/{track_id}", methods=["GET", "HEAD"])
async def stream_track(track_id: str, db: AsyncSession = Depends(get_db)):
    """Stream audio file for a track"""
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = track.path
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    media_type = mimetypes.guess_type(file_path)[0] or "audio/mpeg"
    # Fix: Chrome requires audio/flac, not audio/x-flac
    if media_type == "audio/x-flac":
        media_type = "audio/flac"
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes"},
    )


class PlayTrackRequest(BaseModel):
    track_id: str


class SeekRequest(BaseModel):
    position: float


class VolumeRequest(BaseModel):
    volume: float


@router.post("/play")
async def play_track(request: PlayTrackRequest):
    return {"status": "playing", "track_id": request.track_id}


@router.post("/pause")
async def pause():
    return {"status": "paused"}


@router.post("/resume")
async def resume():
    return {"status": "playing"}


@router.post("/stop")
async def stop():
    return {"status": "stopped"}


@router.post("/seek")
async def seek(request: SeekRequest):
    return {"position": request.position}


@router.post("/volume")
async def set_volume(request: VolumeRequest):
    if not 0.0 <= request.volume <= 1.0:
        raise HTTPException(status_code=400, detail="Volume must be between 0.0 and 1.0")
    return {"volume": request.volume}


@router.get("/status")
async def get_playback_status():
    return {
        "status": "stopped",
        "current_track": None,
        "position": 0,
        "duration": 0,
        "volume": 0.7
    }
