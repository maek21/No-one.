"""Metadata Pipeline — progressive metadata enrichment pipeline"""

from dataclasses import dataclass, field
from typing import Optional
from loguru import logger


@dataclass
class TrackContext:
    """Mutable context for a track being enriched"""
    id: str
    path: str
    artist: Optional[str] = None
    album: Optional[str] = None
    title: Optional[str] = None
    album_artist: Optional[str] = None
    genre: Optional[str] = None
    year: Optional[int] = None
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    duration: Optional[float] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    mb_release_id: Optional[str] = None

    source_title: Optional[str] = None
    source_artist: Optional[str] = None
    source_album: Optional[str] = None
    source_album_artist: Optional[str] = None
    source_genre: Optional[str] = None
    source_year: Optional[str] = None
    source_track_number: Optional[str] = None
    source_disc_number: Optional[str] = None
    source_duration: Optional[str] = None
    source_bpm: Optional[str] = None
    source_key: Optional[str] = None
    source_artwork: Optional[str] = None


@dataclass
class AlbumContext:
    """Mutable context for an album being enriched"""
    id: str
    title: Optional[str] = None
    artist: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    artwork_path: Optional[str] = None
    mb_release_id: Optional[str] = None
    mb_recording_id: Optional[str] = None

    source_title: Optional[str] = None
    source_artist: Optional[str] = None
    source_year: Optional[str] = None
    source_genre: Optional[str] = None
    source_artwork: Optional[str] = None


class PipelineStep:
    """Base class for a pipeline step"""

    name: str = "base"
    description: str = ""

    def should_run(self, ctx: TrackContext) -> bool:
        """Return True if this step should run for this track"""
        return False

    async def run_track(self, ctx: TrackContext) -> bool:
        """Enrich a single track. Return True if any field changed."""
        return False

    def should_run_album(self, ctx: AlbumContext) -> bool:
        """Return True if this step should run for this album"""
        return False

    async def run_album(self, ctx: AlbumContext) -> bool:
        """Enrich a single album. Return True if any field changed."""
        return False


class MetadataPipeline:
    """Orchestrates sequential metadata enrichment steps"""

    def __init__(self):
        self._steps: list[PipelineStep] = []

    def register(self, step: PipelineStep):
        self._steps.append(step)
        logger.info(f"[Pipeline] Registered step: {step.name}")
        return self

    async def run_for_track(self, ctx: TrackContext) -> TrackContext:
        """Run all registered steps for a single track"""
        for step in self._steps:
            if step.should_run(ctx):
                try:
                    changed = await step.run_track(ctx)
                    if changed:
                        logger.debug(f"[Pipeline] Step '{step.name}' enriched track {ctx.id}")
                except Exception as e:
                    logger.warning(f"[Pipeline] Step '{step.name}' failed for track {ctx.id}: {e}")
        return ctx

    async def run_for_album(self, ctx: AlbumContext) -> AlbumContext:
        """Run all registered steps for a single album"""
        for step in self._steps:
            if step.should_run_album(ctx):
                try:
                    changed = await step.run_album(ctx)
                    if changed:
                        logger.debug(f"[Pipeline] Step '{step.name}' enriched album {ctx.id}")
                except Exception as e:
                    logger.warning(f"[Pipeline] Step '{step.name}' failed for album {ctx.id}: {e}")
        return ctx

    async def run_on_all_tracks(self, db):
        """Run pipeline on all tracks that need enrichment (bulk)"""
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import AsyncSession
        from db.models import Track, Album

        result = await db.execute(select(Track))
        tracks = result.scalars().all()
        enriched = 0

        for track in tracks:
            ctx = TrackContext(
                id=track.id,
                path=track.path,
                artist=track.artist,
                album=track.album,
                title=track.title,
                album_artist=track.album_artist,
                genre=track.genre,
                year=track.year,
                track_number=track.track_number,
                disc_number=track.disc_number,
                duration=track.duration,
                bpm=track.bpm,
                key=track.key,
                source_title=track.source_title,
                source_artist=track.source_artist,
                source_album=track.source_album,
                source_album_artist=track.source_album_artist,
                source_genre=track.source_genre,
                source_year=track.source_year,
                source_track_number=track.source_track_number,
                source_disc_number=track.source_disc_number,
                source_duration=track.source_duration,
                source_bpm=track.source_bpm,
                source_key=track.source_key,
                source_artwork=track.source_artwork,
                mb_release_id=track.mb_release_id,
            )
            old_ctx = TrackContext(
                **{k: getattr(ctx, k) for k in ctx.__dataclass_fields__}
            )
            await self.run_for_track(ctx)

            # Write back any changes
            changed = False
            for fld in ctx.__dataclass_fields__:
                old_val = getattr(old_ctx, fld)
                new_val = getattr(ctx, fld)
                if old_val != new_val:
                    setattr(track, fld, new_val)
                    changed = True

            if changed:
                enriched += 1

        # Propagate mb_release_id from tracks to albums
        album_release_map: dict[str, str] = {}
        for track in tracks:
            if track.mb_release_id and track.album:
                album_release_map.setdefault(track.album, track.mb_release_id)

        # Process albums
        result = await db.execute(select(Album))
        albums = result.scalars().all()

        for album in albums:
            actx = AlbumContext(
                id=album.id,
                title=album.title,
                artist=album.artist,
                year=album.year,
                genre=album.genre,
                artwork_path=album.artwork_path,
                mb_release_id=album.mb_release_id or album_release_map.get(album.title),
                mb_recording_id=album.mb_recording_id,
                source_title=album.source_title,
                source_artist=album.source_artist,
                source_year=album.source_year,
                source_genre=album.source_genre,
                source_artwork=album.source_artwork,
            )
            old_actx = AlbumContext(
                **{k: getattr(actx, k) for k in actx.__dataclass_fields__}
            )
            await self.run_for_album(actx)

            changed = False
            for fld in actx.__dataclass_fields__:
                if getattr(old_actx, fld) != getattr(actx, fld):
                    setattr(album, fld, getattr(actx, fld))
                    changed = True

        await db.commit()
        logger.info(f"[Pipeline] Bulk enrichment: {enriched} tracks updated")
        return enriched
