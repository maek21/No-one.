"""Configuration settings for NO-ONE backend"""

from pydantic_settings import BaseSettings
from pathlib import Path
import sys


def _get_base_dir() -> Path:
    """Get the base directory for data storage (DB, cache, artwork)"""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(".")


class Settings(BaseSettings):
    """Application settings"""

    # Application
    app_name: str = "NO-ONE"
    app_version: str = "0.1.0"
    debug: bool = True

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Database
    database_url: str = ""

    # Paths
    cache_dir: str = ""
    artwork_cache_dir: str = ""
    waveform_cache_dir: str = ""

    # Audio
    default_volume: float = 0.7
    sample_rate: int = 44100
    buffer_size: int = 4096

    # Third-party API keys (set in .env)
    discogs_token: str = ""
    lastfm_api_key: str = ""

    # Import
    supported_formats: list[str] = [
        ".mp3", ".flac", ".wav", ".m4a", ".aac",
        ".ogg", ".opus", ".wma", ".ape", ".wv"
    ]

    class Config:
        env_file = ".env"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        base = _get_base_dir()
        self.cache_dir = str(base / "cache")
        self.artwork_cache_dir = str(base / "cache" / "artwork")
        self.waveform_cache_dir = str(base / "cache" / "waveforms")
        if not self.database_url:
            db_path = Path(self.cache_dir) / "no-one.db"
            self.database_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"


# Global settings instance
settings = Settings()

# Ensure cache directories exist
Path(settings.cache_dir).mkdir(exist_ok=True)
Path(settings.artwork_cache_dir).mkdir(parents=True, exist_ok=True)
Path(settings.waveform_cache_dir).mkdir(parents=True, exist_ok=True)
