"""Settings API — persisted to database"""

import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from db.database import get_db
from db.models import AppSetting

router = APIRouter()

DEFAULT_SETTINGS = {
    "volume": 0.7,
    "repeat_mode": "none",
    "shuffle": False,
    "theme": "auto",
    "discogs_token": "",
    "lastfm_api_key": "",
}

# Global cache for API keys (updated on PATCH, read by pipeline steps)
_api_keys: dict[str, str] = {}


def get_api_key(name: str) -> str:
    return _api_keys.get(name, "")


def _refresh_api_keys(settings: dict):
    _api_keys["discogs_token"] = settings.get("discogs_token", "")
    _api_keys["lastfm_api_key"] = settings.get("lastfm_api_key", "")


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get all application settings from DB"""
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()

    # Merge with defaults (DB value overrides default)
    settings = dict(DEFAULT_SETTINGS)
    for row in rows:
        try:
            settings[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            settings[row.key] = row.value

    _refresh_api_keys(settings)
    return settings


@router.patch("/")
async def update_settings(payload: dict, db: AsyncSession = Depends(get_db)):
    """Update application settings (persists to DB)"""
    now = datetime.utcnow()

    for key, value in payload.items():
        # Upsert: insert or update existing row
        existing = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = existing.scalar_one_or_none()

        if row:
            row.value = json.dumps(value)
            row.updated_at = now
        else:
            row = AppSetting(
                key=key,
                value=json.dumps(value),
                updated_at=now,
            )
            db.add(row)

    await db.commit()

    # Return full settings after update
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    settings = dict(DEFAULT_SETTINGS)
    for row in rows:
        try:
            settings[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            settings[row.key] = row.value

    _refresh_api_keys(settings)
    return settings
