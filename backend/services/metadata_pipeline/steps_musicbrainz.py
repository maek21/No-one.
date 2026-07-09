"""MusicBrainz pipeline steps — metadata lookup and artwork fetching"""

import asyncio
import re
from typing import Optional
from pathlib import Path
from urllib.parse import urlencode
from loguru import logger

import httpx

from .pipeline import PipelineStep, TrackContext, AlbumContext


MB_API = "https://musicbrainz.org/ws/2"
CAA_URL = "https://coverartarchive.org/release/{release_id}/front-250"
USER_AGENT = "NO-ONE/0.1.0 (https://github.com/no-one)"


_mb_cache: dict[str, Optional[dict]] = {}


async def _mb_get(path: str, params: dict) -> Optional[dict]:
    """Async MusicBrainz API GET with in-memory cache"""
    from urllib.parse import urlencode
    cache_key = f"{path}?{urlencode(params)}"
    if cache_key in _mb_cache:
        return _mb_cache[cache_key]

    params["fmt"] = "json"
    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{MB_API}/{path}", params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                _mb_cache[cache_key] = data
                return data
    except Exception as e:
        logger.debug(f"MusicBrainz API error ({path}): {e}")
    _mb_cache[cache_key] = None
    return None


# ── Step 3: MusicBrainz metadata lookup ──────────────────────────────

class MusicBrainzLookupStep(PipelineStep):
    """Look up track metadata on MusicBrainz by artist + title"""

    name = "musicbrainz_lookup"
    description = "Query MusicBrainz for missing/improved metadata"

    def should_run(self, ctx: TrackContext) -> bool:
        return (
            ctx.artist is not None
            and ctx.title is not None
            and (
                ctx.source_album in (None, "folder", "filename")
                or ctx.source_genre in (None, "folder", "filename")
                or ctx.source_year in (None, "folder", "filename")
                or ctx.source_artwork in (None, "folder", "filename")
            )
        )

    async def run_track(self, ctx: TrackContext) -> bool:
        changed = False

        result = await _mb_get("recording/", {
            "query": f'artist:"{ctx.artist}" AND recording:"{ctx.title}"',
            "limit": 5,
        })
        if not result:
            # Retry with simpler query
            result = await _mb_get("recording/", {
                "query": f'artist:{ctx.artist} AND recording:{ctx.title}',
                "limit": 5,
            })
        if not result:
            return False

        recordings = result.get("recordings", [])
        if not recordings:
            return False

        best = recordings[0]

        # Extract release info
        releases = best.get("releases", [])
        if not releases:
            return False

        release = releases[0]
        release_id = release.get("id")

        if not ctx.album and release.get("title"):
            ctx.album = release["title"]
            ctx.source_album = "musicbrainz"
            changed = True

        if not ctx.album_artist and release.get("artist-credit"):
            artists = " & ".join(
                ac.get("artist", {}).get("name", "")
                for ac in release.get("artist-credit", [])
                if isinstance(ac, dict)
            )
            if artists:
                ctx.album_artist = artists
                ctx.source_album_artist = "musicbrainz"
                changed = True

        # Year from release date
        date_str = release.get("date", "")
        if not ctx.year and date_str:
            m = re.match(r"(\d{4})", date_str)
            if m:
                ctx.year = int(m.group(1))
                ctx.source_year = "musicbrainz"
                changed = True

        # Genre — MusicBrainz doesn't return genres directly in search.
        # Tags are available on the recording entity.
        tags = best.get("tags", [])
        if not ctx.genre and tags:
            genre_tags = [t["name"] for t in tags if t.get("name")]
            if genre_tags:
                ctx.genre = genre_tags[0]
                ctx.source_genre = "musicbrainz"
                changed = True

        # Store release_id for artwork step
        if release_id:
            ctx.mb_release_id = release_id

        if changed:
            await asyncio.sleep(1)  # MusicBrainz rate limit

        return changed


# ── Step 4: Cover Art Archive ─────────────────────────────────────────

class CoverArtArchiveStep(PipelineStep):
    """Download cover art from Cover Art Archive using MusicBrainz release ID"""

    name = "cover_art_archive"
    description = "Fetch album artwork from Cover Art Archive"

    def should_run(self, ctx: TrackContext) -> bool:
        return False

    def should_run_album(self, ctx: AlbumContext) -> bool:
        return (
            ctx.mb_release_id is not None
            and ctx.source_artwork in (None, "tag")
            and not ctx.artwork_path
        )

    async def _fetch(self, release_id: str, album_id: str) -> Optional[str]:
        import httpx
        cache_dir = Path(__file__).parent.parent.parent / "cache" / "artwork"
        cache_dir.mkdir(parents=True, exist_ok=True)
        dest = cache_dir / f"mb_{album_id}.jpg"
        if dest.exists():
            return str(dest)

        url = CAA_URL.format(release_id=release_id)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    dest.write_bytes(resp.content)
                    logger.info(f"[{self.name}] Downloaded artwork: {dest}")
                    return str(dest)
                # Try full-size fallback
                fallback_url = f"https://coverartarchive.org/release/{release_id}/front"
                resp = await client.get(fallback_url)
                if resp.status_code == 200:
                    dest.write_bytes(resp.content)
                    logger.info(f"[{self.name}] Downloaded artwork (full): {dest}")
                    return str(dest)
        except Exception as e:
            logger.warning(f"[{self.name}] Failed for release {release_id}: {e}")
        return None

    async def run_album(self, ctx: AlbumContext) -> bool:
        path = await self._fetch(ctx.mb_release_id, ctx.id)
        if path:
            ctx.artwork_path = path
            ctx.source_artwork = "coverartarchive"
            return True
        return False
