"""Audio analysis API — waveform, BPM, key, energy"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import Track
from services.analysis import audio_analyzer

router = APIRouter()


@router.get("/{track_id}")
async def get_track_analysis(track_id: str, db: AsyncSession = Depends(get_db)):
    """Get full audio analysis for a track (BPM, key, energy, waveform, etc.)"""
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = audio_analyzer.analyze(track.path)

    if not analysis:
        raise HTTPException(status_code=500, detail="Analysis failed")

    return analysis
