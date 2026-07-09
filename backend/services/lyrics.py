"""LRCLIB lyrics fetching service"""

import httpx
import asyncio
from datetime import datetime
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Lyrics, Track


LRCLIB_API = "https://lrclib.net/api/get"


async def fetch_lyrics_from_lrclib(artist: str, track_name: str) -> dict | None:
    """Fetch synced lyrics from LRCLIB API"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(LRCLIB_API, params={
                "artist_name": artist,
                "track_name": track_name,
            })
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "plain": data.get("plainLyrics"),
                    "synced": data.get("syncedLyrics"),
                }
        except Exception as e:
            logger.warning(f"LRCLIB fetch failed for {artist} - {track_name}: {e}")
    return None


async def get_or_fetch_lyrics(track_id: str, db: AsyncSession) -> dict | None:
    """Get lyrics from DB or fetch from LRCLIB"""
    # Check cache
    result = await db.execute(select(Lyrics).where(Lyrics.track_id == track_id))
    cached = result.scalar_one_or_none()
    if cached:
        return {"plain": cached.plain_lyrics, "synced": cached.synced_lyrics}

    # Get track info
    track_result = await db.execute(select(Track).where(Track.id == track_id))
    track = track_result.scalar_one_or_none()
    if not track:
        return None

    # Fetch from LRCLIB
    lyrics_data = await fetch_lyrics_from_lrclib(track.artist or "", track.title or "")
    if not lyrics_data or not lyrics_data.get("plain"):
        return None

    # Save to DB
    lyrics = Lyrics(
        track_id=track_id,
        plain_lyrics=lyrics_data.get("plain", ""),
        synced_lyrics=lyrics_data.get("synced", ""),
        source="lrclib",
        fetched_at=datetime.utcnow(),
    )
    db.add(lyrics)
    await db.commit()

    return {"plain": lyrics_data.get("plain"), "synced": lyrics_data.get("synced")}


async def fetch_all_lyrics(db: AsyncSession, progress_callback=None) -> dict:
    """Batch-fetch lyrics for all tracks without existing lyrics"""
    # Get tracks without lyrics
    subquery = select(Lyrics.track_id)
    result = await db.execute(
        select(Track).where(Track.id.notin_(subquery))
    )
    tracks = result.scalars().all()

    total = len(tracks)
    found = 0
    missing = 0

    for i, track in enumerate(tracks):
        lyrics_data = await fetch_lyrics_from_lrclib(track.artist or "", track.title or "")

        if lyrics_data and lyrics_data.get("plain"):
            lyrics = Lyrics(
                track_id=track.id,
                plain_lyrics=lyrics_data.get("plain", ""),
                synced_lyrics=lyrics_data.get("synced", ""),
                source="lrclib",
                fetched_at=datetime.utcnow(),
            )
            db.add(lyrics)
            found += 1
        else:
            missing += 1

        # Commit in batches of 50
        if (i + 1) % 50 == 0:
            await db.commit()

        if progress_callback:
            await progress_callback(i + 1, total, found, missing)

        # Rate limit: LRCLIB asks for ~1 req/sec
        await asyncio.sleep(0.5)

    await db.commit()
    return {"total": total, "found": found, "missing": missing}
