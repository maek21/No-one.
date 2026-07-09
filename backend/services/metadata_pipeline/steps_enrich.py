"""Steps 6-8: Discogs, Last.fm, and artwork upscale"""

import asyncio
import re
from pathlib import Path
from typing import Optional
from loguru import logger

import httpx
from PIL import Image, ImageFilter

from .pipeline import PipelineStep, TrackContext, AlbumContext
from api.settings import get_api_key


# ── Step 6: Discogs metadata ─────────────────────────────────────────

DISCOGS_API = "https://api.discogs.com"
_discogs_cache: dict[str, Optional[dict]] = {}


async def _discogs_get(path: str, params: dict | None = None) -> Optional[dict]:
    token = get_api_key("discogs_token")
    if not token:
        return None
    cache_key = f"{path}?{params!r}"
    if cache_key in _discogs_cache:
        return _discogs_cache[cache_key]

    headers = {
        "User-Agent": "NO-ONE/0.1.0",
        "Authorization": f"Discogs token={token}",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{DISCOGS_API}/{path}", params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                _discogs_cache[cache_key] = data
                return data
            if resp.status_code == 429:
                logger.warning("[Discogs] Rate limited, waiting 2s")
                await asyncio.sleep(2)
                return await _discogs_get(path, params)
    except Exception as e:
        logger.debug(f"Discogs API error ({path}): {e}")
    _discogs_cache[cache_key] = None
    return None


class DiscogsLookupStep(PipelineStep):
    """Look up album metadata on Discogs by artist + album"""

    name = "discogs_lookup"
    description = "Query Discogs for genre, year, and release metadata"

    def should_run(self, ctx: TrackContext) -> bool:
        return bool(get_api_key("discogs_token")) and (
            ctx.source_genre in (None, "tag", "filename", "folder", "musicbrainz")
            or ctx.source_year in (None, "tag", "filename", "folder", "musicbrainz")
        )

    def should_run_album(self, ctx: AlbumContext) -> bool:
        return bool(get_api_key("discogs_token")) and (
            ctx.source_genre in (None, "tag", "filename", "folder", "musicbrainz")
            or ctx.source_year in (None, "tag", "filename", "folder", "musicbrainz")
            or not ctx.artwork_path
        ) and ctx.artist and ctx.title

    async def run_album(self, ctx: AlbumContext) -> bool:
        result = await _discogs_get("database/search", {
            "q": f'{ctx.artist} {ctx.title}',
            "type": "master",
            "per_page": 3,
        })
        if not result or not result.get("results"):
            return False

        best = result["results"][0]
        changed = False

        # Year
        year = best.get("year")
        if year and not ctx.year:
            ctx.year = int(year)
            ctx.source_year = "discogs"
            changed = True

        # Genre
        genres = best.get("genre", [])
        if genres and not ctx.genre:
            ctx.genre = genres[0]
            ctx.source_genre = "discogs"
            changed = True

        # Style as sub-genre
        styles = best.get("style", [])
        if styles and not ctx.genre:
            ctx.genre = styles[0]
            ctx.source_genre = "discogs"
            changed = True

        # Artwork — Discogs thumbnails are low-res, skip if we have artwork
        if not ctx.artwork_path:
            thumb = best.get("cover_image")
            if thumb and "spacer.gif" not in thumb:
                import httpx as _httpx
                cache_dir = Path(__file__).parent.parent.parent / "cache" / "artwork"
                cache_dir.mkdir(parents=True, exist_ok=True)
                dest = cache_dir / f"discogs_{ctx.id}.jpg"
                if not dest.exists():
                    try:
                        async with _httpx.AsyncClient(timeout=15) as client:
                            resp = await client.get(thumb)
                            if resp.status_code == 200:
                                dest.write_bytes(resp.content)
                                ctx.artwork_path = str(dest)
                                ctx.source_artwork = "discogs"
                                changed = True
                    except Exception as e:
                        logger.warning(f"[{self.name}] Artwork download failed: {e}")

        return changed

    async def run_track(self, ctx: TrackContext) -> bool:
        return False  # Handled at album level


# ── Step 7: Last.fm enrichment ───────────────────────────────────────

LASTFM_API = "https://ws.audioscrobbler.com/2.0"
_lastfm_cache: dict[str, Optional[dict]] = {}


async def _lastfm_get(method: str, params: dict) -> Optional[dict]:
    key = get_api_key("lastfm_api_key")
    if not key:
        return None
    params.update({"method": method, "api_key": key, "format": "json"})
    cache_key = f"{method}?{sorted(params.items())!r}"
    if cache_key in _lastfm_cache:
        return _lastfm_cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(LASTFM_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                _lastfm_cache[cache_key] = data
                return data
    except Exception as e:
        logger.debug(f"Last.fm API error ({method}): {e}")
    _lastfm_cache[cache_key] = None
    return None


class LastfmEnrichStep(PipelineStep):
    """Fetch tags, similar artists, and genre hints from Last.fm"""

    name = "lastfm_enrich"
    description = "Get genre tags and related artists from Last.fm"

    def should_run(self, ctx: TrackContext) -> bool:
        return bool(get_api_key("lastfm_api_key")) and ctx.source_genre in (None, "tag", "filename", "folder", "musicbrainz", "discogs")

    async def run_track(self, ctx: TrackContext) -> bool:
        if not ctx.artist or not ctx.title:
            return False

        result = await _lastfm_get("track.getInfo", {
            "artist": ctx.artist,
            "track": ctx.title,
        })
        if not result or "track" not in result:
            return False

        track_data = result["track"]
        toptags = track_data.get("toptags", {}).get("tag", [])
        changed = False

        if toptags and not ctx.genre:
            # Pick first meaningful tag (skip "seen live", format names)
            skip_tags = {"seen live", "electronic", "rock", "pop", "hip-hop", "r&b", "jazz", "classical"}
            for tag in toptags:
                name = tag.get("name", "").strip()
                if name and name.lower() not in skip_tags:
                    ctx.genre = name
                    ctx.source_genre = "lastfm"
                    changed = True
                    break

        return changed


# ── Step 8: Artwork upscale ──────────────────────────────────────────

class ArtworkUpscaleStep(PipelineStep):
    """Upscale small album artwork using PIL LANCZOS + smart sharpen"""

    name = "artwork_upscale"
    description = "Upscale artwork under 300px to 600px with sharpening"

    MIN_SIZE = 600
    TARGET_SIZE = 600

    def should_run_album(self, ctx: AlbumContext) -> bool:
        return bool(ctx.artwork_path)

    async def run_album(self, ctx: AlbumContext) -> bool:
        path = Path(ctx.artwork_path)
        if not path.exists():
            return False

        try:
            img = Image.open(str(path))
            w, h = img.size

            # Only upscale if below threshold
            if w >= self.MIN_SIZE and h >= self.MIN_SIZE:
                return False

            scale = self.TARGET_SIZE / max(w, h)
            new_w = int(w * scale)
            new_h = int(h * scale)

            img = img.resize((new_w, new_h), Image.LANCZOS)

            # Smart sharpen: slight unsharp mask
            img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=30, threshold=3))

            # Save over original
            img.save(str(path), quality=92)
            logger.info(f"[{self.name}] Upscaled {path.name} {w}x{h} → {new_w}x{new_h}")
            return True

        except Exception as e:
            logger.warning(f"[{self.name}] Failed for {ctx.artwork_path}: {e}")
            return False

    def should_run(self, ctx: TrackContext) -> bool:
        return False
