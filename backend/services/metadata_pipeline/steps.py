"""Pipeline steps for metadata enrichment"""

import re
from pathlib import Path
from typing import Optional
from loguru import logger

from .pipeline import PipelineStep, TrackContext, AlbumContext


COVER_FILENAMES = {
    "cover", "front", "folder", "album", "artwork",
    "cover_art", "albumart", "AlbumArt",
}
COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ── Step 0: Infer album/artist from folder structure ──────────────────

class FolderInferenceStep(PipelineStep):
    """Infer album/artist/title from the file's directory structure"""

    name = "folder_inference"
    description = "Parse parent folder names to fill missing album/artist"

    def should_run(self, ctx: TrackContext) -> bool:
        return not ctx.album or not ctx.artist

    async def run_track(self, ctx: TrackContext) -> bool:
        path = Path(ctx.path)
        changed = False

        parent = path.parent
        grandparent = parent.parent

        if not ctx.album and parent.name and parent.name != ".":
            ctx.album = parent.name
            ctx.source_album = "folder"
            changed = True
            logger.debug(f"[{self.name}] Inferred album '{ctx.album}' from folder")

        if not ctx.artist and grandparent.name and grandparent.name != ".":
            ctx.artist = grandparent.name
            ctx.source_artist = "folder"
            changed = True
            logger.debug(f"[{self.name}] Inferred artist '{ctx.artist}' from folder")

        return changed


# ── Step 1: Parse filename for metadata ───────────────────────────────

_FILENAME_PATTERNS = [
    # 01 - Title.mp3
    re.compile(r"^\s*(\d{1,3})\s*[-–—.]\s*(.+)$"),
    # 01. Title.mp3
    re.compile(r"^\s*(\d{1,3})\.\s*(.+)$"),
    # Artist - Album - 01 Title.mp3
    re.compile(r"^\s*(.+)\s*[-–—]\s*(.+)\s*[-–—]\s*(\d{1,3})[-–—\s]*(.+)$"),
    # Artist - 01 - Title.mp3
    re.compile(r"^\s*(.+)\s*[-–—]\s*(\d{1,3})\s*[-–—]\s*(.+)$"),
    # Track_Number Title.mp3
    re.compile(r"^(\d{1,3})[-–—\s]+(.+)$"),
    # Artist - Title (no track number)
    re.compile(r"^\s*(.+)\s*[-–—]\s*(.+)$"),
]


class FilenameParseStep(PipelineStep):
    """Parse track number and title from filename when tags are missing"""

    name = "filename_parse"
    description = "Extract track number and title from filename patterns"

    def should_run(self, ctx: TrackContext) -> bool:
        return ctx.source_title in (None, "filename")

    async def run_track(self, ctx: TrackContext) -> bool:
        path = Path(ctx.path)
        stem = path.stem
        changed = False

        def set_title_if_missing(title_str: str | None) -> bool:
            nonlocal changed
            if title_str and (not ctx.title or ctx.source_title in (None, "filename")):
                ctx.title = title_str.strip()
                ctx.source_title = "filename"
                changed = True
                return True
            return False

        for pattern in _FILENAME_PATTERNS:
            m = pattern.match(stem)
            if not m:
                continue

            groups = m.groups()

            if len(groups) == 4:
                # Artist - Album - 01 Title
                artist, album, tnum, title = groups
                if not ctx.artist and artist:
                    ctx.artist = artist.strip()
                    ctx.source_artist = "filename"
                    changed = True
                if not ctx.album and album:
                    ctx.album = album.strip()
                    ctx.source_album = "filename"
                    changed = True
                if tnum:
                    try:
                        ctx.track_number = int(tnum)
                        ctx.source_track_number = "filename"
                        changed = True
                    except ValueError:
                        pass
                set_title_if_missing(title)
                break

            elif len(groups) == 3:
                # Artist - 01 - Title  or  Artist - Title - Album?
                artist, num_or_title, title_or_album = groups
                if num_or_title and num_or_title.strip().isdigit():
                    # Artist - 01 - Title
                    if not ctx.artist and artist:
                        ctx.artist = artist.strip()
                        ctx.source_artist = "filename"
                        changed = True
                    try:
                        ctx.track_number = int(num_or_title)
                        ctx.source_track_number = "filename"
                        changed = True
                    except ValueError:
                        pass
                    set_title_if_missing(title_or_album)
                else:
                    if not ctx.artist and artist:
                        ctx.artist = artist.strip()
                        ctx.source_artist = "filename"
                        changed = True
                    if not ctx.album and num_or_title:
                        ctx.album = num_or_title.strip()
                        ctx.source_album = "filename"
                        changed = True
                    set_title_if_missing(title_or_album)
                break

            elif len(groups) == 2:
                tnum_or_artist, title_or_artist = groups
                if tnum_or_artist and tnum_or_artist.strip().isdigit():
                    # 01 - Title
                    try:
                        ctx.track_number = int(tnum_or_artist)
                        ctx.source_track_number = "filename"
                        changed = True
                    except ValueError:
                        pass
                    set_title_if_missing(title_or_artist)
                else:
                    # Artist - Title
                    if not ctx.artist and tnum_or_artist:
                        ctx.artist = tnum_or_artist.strip()
                        ctx.source_artist = "filename"
                        changed = True
                    set_title_if_missing(title_or_artist)
                break

        # If still missing title, use stem
        if not ctx.title:
            ctx.title = stem
            ctx.source_title = "filename"
            changed = True

        # Clean up parentheses suffixes like (CD1) etc.
        if ctx.title:
            cleaned = re.sub(r"\s*\(.*?\)\s*$", "", ctx.title)
            if cleaned != ctx.title:
                ctx.title = cleaned.strip()
                changed = True

        return changed


# ── Step 2: Local artwork search ──────────────────────────────────────

class LocalArtworkStep(PipelineStep):
    """Search for album art images in the track/album's directory"""

    name = "local_artwork"
    description = "Find cover art images in the same folder as audio files"

    def should_run(self, ctx: TrackContext) -> bool:
        return ctx.source_artwork in (None, "tag")  # prefer embedded over local

    def should_run_album(self, ctx: AlbumContext) -> bool:
        return ctx.source_artwork in (None, "tag") and not ctx.artwork_path

    def _find_artwork(self, folder: Path) -> Optional[str]:
        if not folder.exists():
            return None
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() in COVER_EXTENSIONS and f.stem.lower() in COVER_FILENAMES:
                return str(f)
        # Also accept any image if no named cover found
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() in COVER_EXTENSIONS:
                return str(f)
        return None

    async def run_track(self, ctx: TrackContext) -> bool:
        folder = Path(ctx.path).parent
        found = self._find_artwork(folder)
        if found:
            ctx.source_artwork = "local_folder"
            logger.debug(f"[{self.name}] Found artwork for track {ctx.id}: {found}")
            return True
        return False

    async def run_album(self, ctx: AlbumContext) -> bool:
        # We need to know the album folder. Look it up by tracks.
        # For now, skip — handled at track level or orchestration.
        return False
