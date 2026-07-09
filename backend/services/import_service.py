"""Import service - orchestrates scanning, metadata extraction, and database import"""

import asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from loguru import logger

from services.scanner import LibraryScanner
from services.metadata import MetadataExtractor
from services.artwork import ArtworkExtractor
from services.analysis import audio_analyzer
from services.metadata_pipeline import pipeline as metadata_pipeline
from db.models import Track, Album, Artist, ImportJob
from websocket.manager import ws_manager


class ImportService:
    """Handles music library import process"""
    
    def __init__(self):
        self.scanner = LibraryScanner()
        self.metadata_extractor = MetadataExtractor()
        self.artwork_extractor = ArtworkExtractor()
        self._active_jobs = {}
    
    async def start_import(
        self,
        folder_path: str,
        db: AsyncSession,
        options: dict = None
    ) -> str:
        """
        Start import job
        
        Returns: job_id
        """
        job_id = str(uuid.uuid4())
        
        # Create import job record
        import_job = ImportJob(
            id=job_id,
            path=folder_path,
            status='pending'
        )
        
        db.add(import_job)
        await db.commit()
        
        # Start import in background
        asyncio.create_task(self._run_import(job_id, folder_path, db, options or {}))
        
        logger.info(f"Import job {job_id} started for {folder_path}")
        return job_id
    
    async def _run_import(
        self,
        job_id: str,
        folder_path: str,
        db: AsyncSession,
        options: dict
    ):
        """Run import process"""
        try:
            # Update job status
            await self._update_job_status(db, job_id, 'scanning')
            
            # Step 1: Scan for audio files
            logger.info(f"[{job_id}] Scanning folder...")
            audio_files = await asyncio.to_thread(self.scanner.scan_folder, folder_path)
            
            if not audio_files:
                await self._update_job_status(
                    db, job_id, 'failed',
                    error="No audio files found"
                )
                return
            
            # Update job with total files
            await self._update_job(db, job_id, {
                'status': 'processing',
                'total_files': len(audio_files)
            })
            
            await ws_manager.emit('import:progress', {
                'job_id': job_id,
                'status': 'processing',
                'total_files': len(audio_files),
                'processed_files': 0
            })
            
            # Step 2: Process each file
            imported_tracks = 0
            failed_tracks = 0
            albums_dict = {}  # Track unique albums
            artists_dict = {}  # Track unique artists
            
            for i, file_path in enumerate(audio_files):
                try:
                    # Extract metadata
                    metadata = await asyncio.to_thread(
                        self.metadata_extractor.extract,
                        file_path
                    )
                    
                    if not metadata:
                        failed_tracks += 1
                        continue
                    
                    # Check if track already exists
                    existing = await db.get(Track, metadata['id'])
                    if existing:
                        logger.info(f"Track already exists: {file_path}")
                        continue
                    
                    # Create track
                    track = Track(
                        id=metadata['id'],
                        path=metadata['path'],
                        title=metadata.get('title'),
                        artist=metadata.get('artist'),
                        album=metadata.get('album'),
                        album_artist=metadata.get('album_artist'),
                        genre=metadata.get('genre'),
                        year=metadata.get('year'),
                        track_number=metadata.get('track_number'),
                        disc_number=metadata.get('disc_number'),
                        duration=metadata.get('duration'),
                        file_size=metadata.get('file_size'),
                        format=metadata.get('format'),
                        bitrate=metadata.get('bitrate'),
                        sample_rate=metadata.get('sample_rate'),
                        # Data provenance
                        source_title=metadata.get('source_title'),
                        source_artist=metadata.get('source_artist'),
                        source_album=metadata.get('source_album'),
                        source_album_artist=metadata.get('source_album_artist'),
                        source_genre=metadata.get('source_genre'),
                        source_year=metadata.get('source_year'),
                        source_track_number=metadata.get('source_track_number'),
                        source_disc_number=metadata.get('source_disc_number'),
                        source_duration=metadata.get('source_duration'),
                        source_artwork=metadata.get('source_artwork'),
                    )
                    
                    db.add(track)
                    imported_tracks += 1
                    
                    # Track album for later processing
                    if metadata.get('album'):
                        album_key = f"{metadata.get('album_artist') or metadata.get('artist')}|||{metadata.get('album')}"
                        if album_key not in albums_dict:
                            albums_dict[album_key] = {
                                'title': metadata.get('album'),
                                'artist': metadata.get('album_artist') or metadata.get('artist'),
                                'year': metadata.get('year'),
                                'genre': metadata.get('genre'),
                                'file_path': file_path if metadata.get('has_artwork') else None
                            }
                    
                    # Track artist
                    if metadata.get('artist'):
                        artists_dict[metadata.get('artist')] = True
                    if metadata.get('album_artist'):
                        artists_dict[metadata.get('album_artist')] = True
                    
                    # Emit progress
                    if (i + 1) % 10 == 0 or (i + 1) == len(audio_files):
                        await self._update_job(db, job_id, {
                            'processed_files': i + 1,
                            'imported_tracks': imported_tracks,
                            'failed_tracks': failed_tracks
                        })
                        
                        await ws_manager.emit('import:progress', {
                            'job_id': job_id,
                            'status': 'processing',
                            'total_files': len(audio_files),
                            'processed_files': i + 1,
                            'imported_tracks': imported_tracks,
                            'failed_tracks': failed_tracks
                        })
                
                except Exception as e:
                    logger.error(f"Error processing {file_path}: {e}")
                    failed_tracks += 1
            
            # Step 3: Process albums (extract artwork, generate palettes)
            logger.info(f"[{job_id}] Processing {len(albums_dict)} albums...")
            
            for album_key, album_data in albums_dict.items():
                try:
                    album_id = uuid.uuid4().hex
                    
                    # Extract artwork if available
                    artwork_path = None
                    palette = None
                    
                    if album_data['file_path']:
                        artwork_path = await asyncio.to_thread(
                            self.artwork_extractor.extract_artwork,
                            album_data['file_path']
                        )
                        
                        if artwork_path:
                            palette = await asyncio.to_thread(
                                self.artwork_extractor.generate_palette,
                                artwork_path
                            )
                    
                    # Check if album exists
                    album = Album(
                        id=album_id,
                        title=album_data['title'],
                        artist=album_data['artist'],
                        year=album_data['year'],
                        genre=album_data['genre'],
                        source_title='tag' if album_data['title'] else None,
                        source_artist='tag' if album_data['artist'] else None,
                        source_year='tag' if album_data['year'] else None,
                        source_genre='tag' if album_data['genre'] else None,
                        source_artwork='embedded' if artwork_path else None,
                        artwork_path=artwork_path,
                        artwork_cached=artwork_path is not None,
                        palette_primary=palette.get('primary') if palette else None,
                        palette_secondary=palette.get('secondary') if palette else None,
                        palette_accent=palette.get('accent') if palette else None,
                        palette_shadow=palette.get('shadow') if palette else None,
                        palette_highlight=palette.get('highlight') if palette else None,
                        palette_ambient=palette.get('ambient') if palette else None
                    )
                    
                    db.add(album)
                
                except Exception as e:
                    logger.error(f"Error processing album {album_key}: {e}")
            
            # Step 4: Process artists
            for artist_name in artists_dict.keys():
                if ',' in artist_name:
                    logger.info(f"[Import] Skipping compound artist: {artist_name}")
                    continue
                try:
                    # Check if artist already exists
                    existing = await db.execute(
                        select(Artist).where(Artist.name == artist_name)
                    )
                    artist = existing.scalar_one_or_none()

                    if artist:
                        # Update counts — new tracks were added
                        track_result = await db.execute(
                            select(func.count(Track.id)).where(
                                (Track.artist == artist_name) | (Track.album_artist == artist_name)
                            )
                        )
                        album_result = await db.execute(
                            select(func.count(Album.id)).where(Album.artist == artist_name)
                        )
                        artist.track_count = track_result.scalar() or 0
                        artist.album_count = album_result.scalar() or 0
                        logger.debug(f"[Import] Updated artist '{artist_name}': {artist.track_count} tracks, {artist.album_count} albums")
                    else:
                        artist_id = uuid.uuid4().hex
                        # Count tracks and albums for this artist
                        track_result = await db.execute(
                            select(func.count(Track.id)).where(
                                (Track.artist == artist_name) | (Track.album_artist == artist_name)
                            )
                        )
                        album_result = await db.execute(
                            select(func.count(Album.id)).where(Album.artist == artist_name)
                        )
                        artist = Artist(
                            id=artist_id,
                            name=artist_name,
                            track_count=track_result.scalar() or 0,
                            album_count=album_result.scalar() or 0,
                        )
                        db.add(artist)

                    await db.flush()

                    # Fetch artist avatar in background only if missing
                    if not artist.avatar_path:
                        from services.artist_art import ArtistAvatarFetcher
                        asyncio.create_task(self._fetch_artist_avatar(artist.id, artist_name))
                except Exception as e:
                    logger.error(f"Error processing artist {artist_name}: {e}")
            
            # Commit all changes
            await db.commit()
            
            # Step 5: Run metadata enrichment pipeline (folder inference, filename parse, local artwork)
            asyncio.create_task(self._run_metadata_pipeline_background(job_id))

            # Step 6: Analyze all imported tracks in background
            asyncio.create_task(self._analyze_tracks_background(job_id))
            
            # Update job as completed
            await self._update_job(db, job_id, {
                'status': 'completed',
                'completed_at': datetime.utcnow()
            })
            
            await ws_manager.emit('import:complete', {
                'job_id': job_id,
                'imported_tracks': imported_tracks,
                'failed_tracks': failed_tracks,
                'albums': len(albums_dict),
                'artists': len(artists_dict)
            })
            
            # Notify library updated
            await ws_manager.emit('library:updated', {})
            
            # Auto-fetch lyrics for imported tracks (background)
            asyncio.create_task(self._fetch_lyrics_background(job_id))
            
            logger.info(f"[{job_id}] Import completed: {imported_tracks} tracks, {len(albums_dict)} albums, {len(artists_dict)} artists")
        
        except Exception as e:
            logger.error(f"[{job_id}] Import failed: {e}")
            await self._update_job_status(
                db, job_id, 'failed',
                error=str(e)
            )
            
            await ws_manager.emit('import:error', {
                'job_id': job_id,
                'error': str(e)
            })
    
    async def _run_metadata_pipeline_background(self, job_id: str):
        """Run metadata enrichment pipeline on newly imported tracks"""
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            try:
                from db.models import Track, Album
                from sqlalchemy import select

                import_job = await db.get(ImportJob, job_id)
                if not import_job:
                    return

                enriched = await metadata_pipeline.run_on_all_tracks(db)

                await ws_manager.emit('pipeline:complete', {
                    'job_id': job_id,
                    'enriched': enriched,
                })
                logger.info(f"[{job_id}] Pipeline: {enriched} tracks enriched")
            except Exception as e:
                logger.error(f"[{job_id}] Pipeline failed: {e}")

    async def _analyze_tracks_background(self, job_id: str):
        """Analyze newly imported tracks in background"""
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            try:
                import_job = await db.get(ImportJob, job_id)
                if not import_job:
                    return

                analyzed = 0
                failed = 0

                result = await db.execute(select(Track))
                tracks = result.scalars().all()

                for track in tracks:
                    if track.bpm is not None:
                        continue  # Already analyzed

                    analysis = await asyncio.to_thread(audio_analyzer.analyze, track.path)
                    if analysis:
                        track.bpm = analysis.get('bpm')
                        track.key = analysis.get('key')
                        track.energy = analysis.get('energy')
                        track.loudness = analysis.get('loudness')
                        analyzed += 1
                    else:
                        failed += 1

                await db.commit()

                await ws_manager.emit('analysis:complete', {
                    'job_id': job_id,
                    'analyzed': analyzed,
                    'failed': failed,
                })
                logger.info(f"[{job_id}] Analysis: {analyzed} analyzed, {failed} failed")
            except Exception as e:
                logger.error(f"[{job_id}] Analysis failed: {e}")

    async def _fetch_lyrics_background(self, job_id: str):
        """Fetch lyrics for newly imported tracks in background"""
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            try:
                from services.lyrics import fetch_all_lyrics
                async def on_progress(current, total, found, missing):
                    await ws_manager.emit('lyrics:progress', {
                        'job_id': job_id,
                        'current': current,
                        'total': total,
                        'found': found,
                        'missing': missing
                    })
                result = await fetch_all_lyrics(db, on_progress)
                await ws_manager.emit('lyrics:complete', {
                    'job_id': job_id,
                    **result
                })
                logger.info(f"[{job_id}] Lyrics fetch: {result['found']} found, {result['missing']} missing")
            except Exception as e:
                logger.error(f"Lyrics fetch failed: {e}")
    
    async def _update_job_status(
        self,
        db: AsyncSession,
        job_id: str,
        status: str,
        error: str = None
    ):
        """Update job status"""
        await self._update_job(db, job_id, {
            'status': status,
            'error_message': error
        })
    
    async def _update_job(
        self,
        db: AsyncSession,
        job_id: str,
        updates: dict
    ):
        """Update job with partial data"""
        job = await db.get(ImportJob, job_id)
        if job:
            for key, value in updates.items():
                setattr(job, key, value)
            await db.commit()
    
    async def get_job_status(self, job_id: str, db: AsyncSession) -> Optional[dict]:
        """Get import job status"""
        job = await db.get(ImportJob, job_id)
        
        if not job:
            return None
        
        return {
            'job_id': job.id,
            'path': job.path,
            'status': job.status,
            'total_files': job.total_files,
            'processed_files': job.processed_files,
            'imported_tracks': job.imported_tracks,
            'failed_tracks': job.failed_tracks,
            'error_message': job.error_message,
            'started_at': job.started_at.isoformat() if job.started_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None
        }


    async def import_single(self, file_path: str, db: AsyncSession) -> Optional[str]:
        """Import (or re-import) a single audio file.

        Returns: track_id if successful, None otherwise.
        """
        try:
            metadata = await asyncio.to_thread(self.metadata_extractor.extract, file_path)
            if not metadata:
                logger.warning(f"[SingleImport] Failed to extract metadata: {file_path}")
                return None

            # Check if track already exists (by path), update if so
            existing = await db.execute(
                select(Track).where(Track.path == metadata['path'])
            )
            existing_track = existing.scalar_one_or_none()

            if existing_track:
                # Update metadata
                for key, value in metadata.items():
                    if hasattr(existing_track, key) and key not in ('id', 'path'):
                        setattr(existing_track, key, value)
                track_id = existing_track.id
                logger.info(f"[SingleImport] Updated track: {file_path}")
            else:
                track = Track(
                    id=metadata['id'],
                    path=metadata['path'],
                    title=metadata.get('title'),
                    artist=metadata.get('artist'),
                    album=metadata.get('album'),
                    album_artist=metadata.get('album_artist'),
                    genre=metadata.get('genre'),
                    year=metadata.get('year'),
                    track_number=metadata.get('track_number'),
                    disc_number=metadata.get('disc_number'),
                    duration=metadata.get('duration'),
                    file_size=metadata.get('file_size'),
                    format=metadata.get('format'),
                    bitrate=metadata.get('bitrate'),
                    sample_rate=metadata.get('sample_rate'),
                    # Data provenance
                    source_title=metadata.get('source_title'),
                    source_artist=metadata.get('source_artist'),
                    source_album=metadata.get('source_album'),
                    source_album_artist=metadata.get('source_album_artist'),
                    source_genre=metadata.get('source_genre'),
                    source_year=metadata.get('source_year'),
                    source_track_number=metadata.get('source_track_number'),
                    source_disc_number=metadata.get('source_disc_number'),
                    source_duration=metadata.get('source_duration'),
                    source_artwork=metadata.get('source_artwork'),
                )
                db.add(track)
                track_id = track.id
                logger.info(f"[SingleImport] Imported new track: {file_path}")

            # Analyze in background (fire and forget)
            asyncio.create_task(self._analyze_single(track_id, file_path, db))

            await db.commit()

            # Emit library update
            await ws_manager.emit('library:updated', {})
            return track_id

        except Exception as e:
            logger.error(f"[SingleImport] Failed: {file_path}: {e}")
            return None

    async def _analyze_single(self, track_id: str, file_path: str, db: AsyncSession):
        """Analyze a single track after import"""
        try:
            analysis = await asyncio.to_thread(audio_analyzer.analyze, file_path)
            if analysis:
                result = await db.execute(select(Track).where(Track.id == track_id))
                track = result.scalar_one_or_none()
                if track:
                    track.bpm = analysis.get('bpm')
                    track.key = analysis.get('key')
                    track.energy = analysis.get('energy')
                    track.loudness = analysis.get('loudness')
                    await db.commit()
                    logger.info(f"[SingleImport] Analysis complete: {file_path}")
        except Exception as e:
            logger.error(f"[SingleImport] Analysis failed: {file_path}: {e}")

    async def delete_track(self, file_path: str, db: AsyncSession) -> bool:
        """Delete a track from the database.

        Returns: True if deleted, False if not found.
        """
        try:
            result = await db.execute(select(Track).where(Track.path == file_path))
            track = result.scalar_one_or_none()

            if not track:
                logger.warning(f"[Delete] Track not found: {file_path}")
                return False

            await db.delete(track)
            await db.commit()

            await ws_manager.emit('library:updated', {})
            logger.info(f"[Delete] Removed track: {file_path}")
            return True

        except Exception as e:
            logger.error(f"[Delete] Failed: {file_path}: {e}")
            return False

    async def _fetch_artist_avatar(self, artist_id: str, artist_name: str):
        """Background task to fetch and save artist avatar from Deezer"""
        try:
            from services.artist_art import ArtistAvatarFetcher
            fetcher = ArtistAvatarFetcher()
            path = await fetcher.fetch_avatar(artist_name, artist_id)
            if path:
                from db.database import AsyncSessionLocal
                from sqlalchemy import select
                from db.models import Artist
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(Artist).where(Artist.id == artist_id))
                    artist = result.scalar_one_or_none()
                    if artist:
                        artist.avatar_path = path
                        await db.commit()
                        logger.info(f"[Avatar] Saved for '{artist_name}'")
        except Exception as e:
            logger.warning(f"[Avatar] Failed for '{artist_name}': {e}")


# Global instance
import_service = ImportService()
