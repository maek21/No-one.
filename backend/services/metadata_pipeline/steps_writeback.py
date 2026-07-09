"""Step 9: Write enriched metadata back to file tags using Mutagen"""

from pathlib import Path
from loguru import logger

from .pipeline import PipelineStep, TrackContext, AlbumContext


_ENRICHED_SOURCES = {"musicbrainz", "filename", "folder"}


class TagWritebackStep(PipelineStep):
    """Write enriched metadata back to the audio file's tags"""

    name = "tag_writeback"
    description = "Persist enriched metadata to file tags"

    def should_run(self, ctx: TrackContext) -> bool:
        # Run if any source is from enrichment (not original tag)
        for fld in ctx.__dataclass_fields__:
            if fld.startswith("source_") and fld != "source_artwork":
                val = getattr(ctx, fld)
                if val in _ENRICHED_SOURCES:
                    return True
        return False

    async def run_track(self, ctx: TrackContext) -> bool:
        from mutagen import File as MutagenFile
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, TPE2, TCON, TDRC, TRCK, TPOS
        from mutagen.mp3 import MP3
        from mutagen.flac import FLAC
        from mutagen.mp4 import MP4

        path = Path(ctx.path)
        if not path.exists():
            return False

        try:
            audio = MutagenFile(str(path))
            if audio is None:
                return False
        except Exception as e:
            logger.warning(f"[{self.name}] Cannot open {ctx.path}: {e}")
            return False

        changes = 0

        def set_id3(frame_id: str, value: str):
            nonlocal changes
            if not value:
                return
            try:
                if isinstance(audio, MP3):
                    if audio.tags is None:
                        audio.add_tags()
                    audio.tags.add(getattr(__import__("mutagen.id3", fromlist=[frame_id]), frame_id)(encoding=3, text=value))
                elif isinstance(audio, FLAC):
                    tag_key = {
                        "TIT2": "title", "TPE1": "artist", "TALB": "album",
                        "TPE2": "albumartist", "TCON": "genre",
                    }.get(frame_id, frame_id.lower())
                    audio[tag_key] = value
                elif isinstance(audio, MP4):
                    tag_key = {
                        "TIT2": "\xa9nam", "TPE1": "\xa9ART", "TALB": "\xa9alb",
                        "TPE2": "aART", "TCON": "\xa9gen",
                    }.get(frame_id)
                    if tag_key:
                        audio[tag_key] = [value]
                changes += 1
            except Exception as e:
                logger.debug(f"[{self.name}] Failed to set tag {frame_id}: {e}")

        # Map enriched fields to ID3 frames
        if ctx.source_title in _ENRICHED_SOURCES and ctx.title:
            set_id3("TIT2", ctx.title)
        if ctx.source_artist in _ENRICHED_SOURCES and ctx.artist:
            set_id3("TPE1", ctx.artist)
        if ctx.source_album in _ENRICHED_SOURCES and ctx.album:
            set_id3("TALB", ctx.album)
        if ctx.source_album_artist in _ENRICHED_SOURCES and ctx.album_artist:
            set_id3("TPE2", ctx.album_artist)
        if ctx.source_genre in _ENRICHED_SOURCES and ctx.genre:
            set_id3("TCON", ctx.genre)
        if ctx.source_year in _ENRICHED_SOURCES and ctx.year:
            set_id3("TDRC", str(ctx.year))
        if ctx.source_track_number in _ENRICHED_SOURCES and ctx.track_number:
            set_id3("TRCK", f"{ctx.track_number:02d}")

        if changes > 0:
            try:
                audio.save()
                logger.info(f"[{self.name}] Wrote {changes} tags to {ctx.path}")
                return True
            except Exception as e:
                logger.warning(f"[{self.name}] Failed to save {ctx.path}: {e}")

        return False
