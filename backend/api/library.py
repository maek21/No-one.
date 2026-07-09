"""Library API endpoints"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from pydantic import BaseModel

from db.database import get_db, AsyncSessionLocal
from db.models import Track, Album, Artist
from services.watcher import library_watcher
from services.import_service import import_service
from services.artwork import ArtworkExtractor
from websocket.manager import ws_manager

router = APIRouter()


# Response models
class TrackResponse(BaseModel):
    id: str
    path: str
    title: str
    artist: str | None
    album: str | None
    duration: float | None
    track_number: int | None
    is_favorite: bool
    artwork: str | None = None
    
    class Config:
        from_attributes = True


class AlbumResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    year: int | None
    track_count: int
    artwork_path: str | None
    palette_primary: str | None
    palette_secondary: str | None
    palette_accent: str | None
    
    class Config:
        from_attributes = True


class ArtistResponse(BaseModel):
    id: str
    name: str
    track_count: int
    album_count: int
    avatar_path: str | None = None
    
    class Config:
        from_attributes = True


@router.get("/tracks", response_model=List[TrackResponse])
async def get_tracks(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get all tracks"""
    result = await db.execute(
        select(Track).limit(limit).offset(offset)
    )
    tracks = result.scalars().all()
    return tracks


@router.get("/albums", response_model=List[AlbumResponse])
async def get_albums(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get all albums"""
    result = await db.execute(
        select(Album).limit(limit).offset(offset)
    )
    albums = result.scalars().all()
    
    # Convert paths to web URLs
    for album in albums:
        if album.artwork_path and album.artwork_path.startswith('cache'):
            # Convert Windows path to web path
            album.artwork_path = f"http://localhost:8000/{album.artwork_path.replace(chr(92), '/')}"
    
    return albums


@router.get("/artists", response_model=List[ArtistResponse])
async def get_artists(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get all artists"""
    result = await db.execute(
        select(Artist).limit(limit).offset(offset)
    )
    artists = result.scalars().all()
    for artist in artists:
        if artist.avatar_path and artist.avatar_path.startswith('cache'):
            artist.avatar_path = f"http://localhost:8000/{artist.avatar_path.replace(chr(92), '/')}"
    return artists


@router.get("/artists/{artist_id}/tracks", response_model=List[TrackResponse])
async def get_artist_tracks(
    artist_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all tracks for an artist with artwork from album"""
    artist_result = await db.execute(select(Artist).where(Artist.id == artist_id))
    artist = artist_result.scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    from db.models import Album
    result = await db.execute(
        select(Track, Album)
        .join(Album, Track.album == Album.title, isouter=True)
        .where(Track.artist == artist.name)
        .order_by(Track.album, Track.track_number)
    )
    rows = result.all()

    output = []
    for track, alb in rows:
        artwork = None
        if alb and alb.artwork_path:
            artwork = alb.artwork_path.replace("\\", "/")
            if artwork.startswith("cache/"):
                artwork = f"http://localhost:8000/{artwork}"
        output.append(TrackResponse(
            id=track.id,
            path=track.path,
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration=track.duration,
            track_number=track.track_number,
            is_favorite=track.is_favorite,
            artwork=artwork,
        ))
    return output


@router.get("/albums/{album_id}/tracks", response_model=List[TrackResponse])
async def get_album_tracks(
    album_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get tracks for a specific album.
    First look up the album to get its title, then match tracks by album title.
    """
    album_result = await db.execute(select(Album).where(Album.id == album_id))
    album = album_result.scalar_one_or_none()
    if not album:
        return []

    result = await db.execute(
        select(Track).where(Track.album == album.title).order_by(Track.disc_number, Track.track_number)
    )
    tracks = result.scalars().all()
    return tracks


@router.get("/search")
async def search_library(
    q: str,
    db: AsyncSession = Depends(get_db)
):
    """Search library"""
    search_pattern = f"%{q}%"
    
    # Search tracks
    track_result = await db.execute(
        select(Track).where(
            (Track.title.like(search_pattern)) |
            (Track.artist.like(search_pattern)) |
            (Track.album.like(search_pattern))
        ).limit(20)
    )
    tracks = track_result.scalars().all()
    
    # Search albums
    album_result = await db.execute(
        select(Album).where(
            (Album.title.like(search_pattern)) |
            (Album.artist.like(search_pattern))
        ).limit(10)
    )
    albums = album_result.scalars().all()
    
    # Search artists
    artist_result = await db.execute(
        select(Artist).where(Artist.name.like(search_pattern)).limit(10)
    )
    artists = artist_result.scalars().all()
    
    return {
        "tracks": [TrackResponse.model_validate(t) for t in tracks],
        "albums": [AlbumResponse.model_validate(a) for a in albums],
        "artists": [ArtistResponse.model_validate(a) for a in artists]
    }


@router.get("/tracks/{track_id}/palette")
async def get_track_palette(
    track_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Extract palette from the album artwork associated with this track"""
    result = await db.execute(
        select(Track, Album)
        .join(Album, Track.album == Album.title, isouter=True)
        .where(Track.id == track_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")

    track, album = row
    if not album or not album.artwork_path:
        raise HTTPException(status_code=404, detail="No artwork found for this track")

    extractor = ArtworkExtractor()
    palette = await asyncio.to_thread(extractor.generate_palette, album.artwork_path)
    if not palette:
        raise HTTPException(status_code=500, detail="Failed to extract palette")

    return palette


@router.post("/tracks/{track_id}/favorite")
async def toggle_favorite(
    track_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Toggle track favorite status"""
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    
    track.is_favorite = not track.is_favorite
    await db.commit()
    
    return {"is_favorite": track.is_favorite}


@router.get("/stats")
async def get_library_stats(db: AsyncSession = Depends(get_db)):
    """Get library statistics"""
    from db.models import ImportJob
    from pathlib import Path
    
    track_count = await db.scalar(select(func.count(Track.id)))
    album_count = await db.scalar(select(func.count(Album.id)))
    artist_count = await db.scalar(select(func.count(Artist.id)))
    total_duration = await db.scalar(select(func.sum(Track.duration)))
    total_size = await db.scalar(select(func.sum(Track.file_size)))
    
    # Cache size
    cache_dir = Path(__file__).parent.parent / "cache"
    cache_size = 0
    if cache_dir.exists():
        for f in cache_dir.rglob("*"):
            if f.is_file():
                cache_size += f.stat().st_size
    
    # Last scan
    last_scan = await db.scalar(
        select(func.max(ImportJob.started_at)).where(ImportJob.status == "completed")
    )
    
    return {
        "tracks": track_count or 0,
        "albums": album_count or 0,
        "artists": artist_count or 0,
        "total_duration": total_duration or 0,
        "total_size_bytes": total_size or 0,
        "cache_size_bytes": cache_size,
        "last_scan_at": str(last_scan) if last_scan else None,
    }


# ── Watch API ──

class WatchRequest(BaseModel):
    path: str


@router.post("/watch/start")
async def start_watching(request: WatchRequest):
    """Start watching a directory for changes"""
    if library_watcher.is_watching:
        return {"status": "already_watching", "path": library_watcher.current_path}

    def on_import(file_path: str):
        """Called on filesystem thread — schedule async import"""
        import asyncio
        async def do_import():
            async with AsyncSessionLocal() as db:
                await import_service.import_single(file_path, db)
        asyncio.run_coroutine_threadsafe(do_import(), asyncio.get_event_loop())

    def on_delete(file_path: str):
        """Called on filesystem thread — schedule async delete"""
        import asyncio
        async def do_delete():
            async with AsyncSessionLocal() as db:
                await import_service.delete_track(file_path, db)
        asyncio.run_coroutine_threadsafe(do_delete(), asyncio.get_event_loop())

    library_watcher.watch(request.path, on_import, on_delete)
    return {"status": "watching", "path": request.path}


@router.post("/watch/stop")
async def stop_watching():
    """Stop watching the library directory"""
    if not library_watcher.is_watching:
        return {"status": "not_watching"}
    library_watcher.stop()
    return {"status": "stopped"}


@router.get("/watch/status")
async def watch_status():
    """Get watcher status"""
    return {
        "watching": library_watcher.is_watching,
        "path": library_watcher.current_path,
    }


@router.post("/artists/fetch-avatars")
async def fetch_all_avatars(db: AsyncSession = Depends(get_db)):
    """Fetch avatars for all artists missing them"""
    from services.artist_art import ArtistAvatarFetcher
    result = await db.execute(select(Artist).where(Artist.avatar_path.is_(None)))
    artists = result.scalars().all()
    if not artists:
        return {"status": "no_missing", "count": 0}

    fetcher = ArtistAvatarFetcher()
    fetched = 0
    for artist in artists:
        path = await fetcher.fetch_avatar(artist.name, artist.id)
        if path:
            artist.avatar_path = path
            fetched += 1

    await db.commit()
    return {"status": "ok", "fetched": fetched, "total_missing": len(artists)}
