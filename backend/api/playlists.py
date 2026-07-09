"""Playlists API endpoints"""

import uuid
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from pydantic import BaseModel

from db.database import get_db
from db.models import Playlist, PlaylistTrack, Track
from services.artwork import ArtworkExtractor

router = APIRouter()

CACHE_DIR = Path(__file__).parent.parent / "cache" / "playlist_artwork"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class PlaylistResponse(BaseModel):
    id: str
    name: str
    description: str | None
    artwork_path: str | None
    track_count: int
    palette_primary: str | None = None
    palette_accent: str | None = None
    palette_secondary: str | None = None
    palette_shadow: str | None = None
    palette_highlight: str | None = None
    palette_ambient: str | None = None
    created_at: str | None
    updated_at: str | None

    class Config:
        from_attributes = True


class PlaylistTrackResponse(BaseModel):
    id: str
    track_id: str
    title: str
    artist: str | None
    duration: float | None
    position: int
    artwork: str | None = None

    class Config:
        from_attributes = True


class CreatePlaylistPayload(BaseModel):
    name: str
    description: str | None = None


class UpdatePlaylistPayload(BaseModel):
    name: str | None = None
    description: str | None = None
    artwork_path: str | None = None
    palette_primary: str | None = None
    palette_accent: str | None = None
    palette_secondary: str | None = None
    palette_shadow: str | None = None
    palette_highlight: str | None = None
    palette_ambient: str | None = None


class AddTracksPayload(BaseModel):
    track_ids: list[str]
    position: int | None = None


@router.get("/", response_model=List[PlaylistResponse])
async def get_playlists(db: AsyncSession = Depends(get_db)):
    """Get all playlists"""
    result = await db.execute(
        select(Playlist).order_by(Playlist.updated_at.desc())
    )
    playlists = result.scalars().all()

    output = []
    for pl in playlists:
        count_result = await db.execute(
            select(PlaylistTrack).where(PlaylistTrack.playlist_id == pl.id)
        )
        track_count = len(count_result.scalars().all())
        output.append(PlaylistResponse(
            id=pl.id,
            name=pl.name,
            description=pl.description,
            artwork_path=pl.artwork_path,
            track_count=track_count,
            palette_primary=pl.palette_primary,
            palette_accent=pl.palette_accent,
            palette_secondary=pl.palette_secondary,
            palette_shadow=pl.palette_shadow,
            palette_highlight=pl.palette_highlight,
            palette_ambient=pl.palette_ambient,
            created_at=str(pl.created_at) if pl.created_at else None,
            updated_at=str(pl.updated_at) if pl.updated_at else None,
        ))
    return output


@router.get("/{playlist_id}/tracks", response_model=List[PlaylistTrackResponse])
async def get_playlist_tracks(playlist_id: str, db: AsyncSession = Depends(get_db)):
    """Get tracks for a playlist"""
    playlist = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    if not playlist.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Playlist not found")

    from db.models import Album
    result = await db.execute(
        select(PlaylistTrack, Track, Album)
        .join(Track, PlaylistTrack.track_id == Track.id)
        .join(Album, Track.album == Album.title, isouter=True)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    rows = result.all()

    output = []
    for pt, t, alb in rows:
        artwork = None
        if alb and alb.artwork_path:
            artwork = alb.artwork_path.replace("\\", "/")
            if artwork.startswith("cache/"):
                artwork = f"http://localhost:8000/{artwork}"
        elif playlist.artwork_path:
            artwork = playlist.artwork_path
        output.append(PlaylistTrackResponse(
            id=str(pt.id),
            track_id=t.id,
            title=t.title,
            artist=t.artist,
            duration=t.duration,
            position=pt.position,
            artwork=artwork,
        ))
    return output


@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single playlist by ID"""
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    count_result = await db.execute(
        select(PlaylistTrack).where(PlaylistTrack.playlist_id == pl.id)
    )
    track_count = len(count_result.scalars().all())

    return PlaylistResponse(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        artwork_path=pl.artwork_path,
        track_count=track_count,
        palette_primary=pl.palette_primary,
        palette_accent=pl.palette_accent,
        palette_secondary=pl.palette_secondary,
        palette_shadow=pl.palette_shadow,
        palette_highlight=pl.palette_highlight,
        palette_ambient=pl.palette_ambient,
        created_at=str(pl.created_at) if pl.created_at else None,
        updated_at=str(pl.updated_at) if pl.updated_at else None,
    )


@router.post("/", response_model=PlaylistResponse)
async def create_playlist(payload: CreatePlaylistPayload, db: AsyncSession = Depends(get_db)):
    """Create a new playlist"""
    pl = Playlist(
        id=str(uuid.uuid4()),
        name=payload.name,
        description=payload.description or "",
    )
    db.add(pl)
    await db.commit()
    await db.refresh(pl)
    return PlaylistResponse(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        artwork_path=pl.artwork_path,
        track_count=0,
        palette_primary=pl.palette_primary,
        palette_accent=pl.palette_accent,
        palette_secondary=pl.palette_secondary,
        palette_shadow=pl.palette_shadow,
        palette_highlight=pl.palette_highlight,
        palette_ambient=pl.palette_ambient,
        created_at=str(pl.created_at) if pl.created_at else None,
        updated_at=str(pl.updated_at) if pl.updated_at else None,
    )


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(playlist_id: str, payload: UpdatePlaylistPayload, db: AsyncSession = Depends(get_db)):
    """Update playlist metadata"""
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if payload.name is not None:
        pl.name = payload.name
    if payload.description is not None:
        pl.description = payload.description
    if payload.artwork_path is not None:
        pl.artwork_path = payload.artwork_path
    if payload.palette_primary is not None:
        pl.palette_primary = payload.palette_primary
    if payload.palette_accent is not None:
        pl.palette_accent = payload.palette_accent
    if payload.palette_secondary is not None:
        pl.palette_secondary = payload.palette_secondary
    if payload.palette_shadow is not None:
        pl.palette_shadow = payload.palette_shadow
    if payload.palette_highlight is not None:
        pl.palette_highlight = payload.palette_highlight
    if payload.palette_ambient is not None:
        pl.palette_ambient = payload.palette_ambient

    await db.commit()
    await db.refresh(pl)

    count_result = await db.execute(
        select(PlaylistTrack).where(PlaylistTrack.playlist_id == pl.id)
    )
    track_count = len(count_result.scalars().all())

    return PlaylistResponse(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        artwork_path=pl.artwork_path,
        track_count=track_count,
        palette_primary=pl.palette_primary,
        palette_accent=pl.palette_accent,
        palette_secondary=pl.palette_secondary,
        palette_shadow=pl.palette_shadow,
        palette_highlight=pl.palette_highlight,
        palette_ambient=pl.palette_ambient,
        created_at=str(pl.created_at) if pl.created_at else None,
        updated_at=str(pl.updated_at) if pl.updated_at else None,
    )


@router.post("/{playlist_id}/artwork")
async def upload_playlist_artwork(playlist_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload artwork for a playlist"""
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    ext = Path(file.filename or "image.png").suffix if file.filename else ".png"
    filename = f"{pl.id}{ext}"
    filepath = CACHE_DIR / filename

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    pl.artwork_path = f"cache/playlist_artwork/{filename}"
    await db.commit()
    await db.refresh(pl)

    artwork_path_str = str(filepath)
    try:
        extractor = ArtworkExtractor()
        palette = await asyncio.to_thread(extractor.generate_palette, artwork_path_str)
        if palette:
            for key, col in [("palette_primary", "primary"), ("palette_accent", "accent"),
                             ("palette_secondary", "secondary"), ("palette_shadow", "shadow"),
                             ("palette_highlight", "highlight"), ("palette_ambient", "ambient")]:
                setattr(pl, key, palette.get(col))
            await db.commit()
            await db.refresh(pl)
    except Exception as e:
        logger = __import__('logging').getLogger(__name__)
        logger.warning(f"Could not generate palette for playlist artwork: {e}")

    return {
        "artwork_path": f"http://localhost:8000/{pl.artwork_path}",
        "palette_primary": pl.palette_primary,
        "palette_accent": pl.palette_accent,
        "palette_secondary": pl.palette_secondary,
    }


@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a playlist"""
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    await db.delete(pl)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{playlist_id}/tracks")
async def add_tracks_to_playlist(playlist_id: str, payload: AddTracksPayload, db: AsyncSession = Depends(get_db)):
    """Add tracks to a playlist"""
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Get current max position
    pos_result = await db.execute(
        select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position.desc())
    )
    last_track = pos_result.scalars().first()
    next_pos = payload.position if payload.position is not None else (last_track.position + 1 if last_track else 0)

    for i, tid in enumerate(payload.track_ids):
        pt = PlaylistTrack(
            playlist_id=playlist_id,
            track_id=tid,
            position=next_pos + i,
        )
        db.add(pt)

    await db.commit()
    return {"status": "ok", "added": len(payload.track_ids)}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track_from_playlist(playlist_id: str, track_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a track from a playlist"""
    pt = await db.execute(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == track_id,
        )
    )
    row = pt.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Track not found in playlist")

    await db.delete(row)
    await db.commit()
    return {"status": "deleted"}