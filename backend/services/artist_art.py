"""Artist avatar fetcher — Deezer API"""

import hashlib
import logging
from pathlib import Path
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

AVATAR_DIR = Path(__file__).parent.parent / "cache" / "artist_avatars"


class ArtistAvatarFetcher:
    def __init__(self):
        AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    async def fetch_avatar(self, artist_name: str, artist_id: str) -> Optional[str]:
        """
        Fetch artist avatar from Deezer API.
        Returns relative cache path like 'cache/artist_avatars/<id>.jpg' or None.
        """
        avatar_path = AVATAR_DIR / f"{artist_id}.jpg"
        if avatar_path.exists():
            return f"cache/artist_avatars/{artist_id}.jpg"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # Deezer search
                resp = await client.get(
                    "https://api.deezer.com/search/artist",
                    params={"q": artist_name, "limit": 1},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json()
                if not data.get("data"):
                    return None
                deezer_artist = data["data"][0]
                picture_url = deezer_artist.get("picture_medium")
                if not picture_url:
                    return None

                # Download image
                img_resp = await client.get(picture_url)
                if img_resp.status_code != 200:
                    return None

                with open(avatar_path, "wb") as f:
                    f.write(img_resp.content)

                return f"cache/artist_avatars/{artist_id}.jpg"

        except Exception as e:
            logger.warning(f"Failed to fetch avatar for '{artist_name}': {e}")
            return None