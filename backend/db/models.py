"""Database models"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from db.database import Base


class Track(Base):
    """Track model"""
    __tablename__ = "tracks"
    
    id = Column(String, primary_key=True)
    path = Column(String, unique=True, nullable=False, index=True)
    
    # Metadata
    title = Column(String, nullable=False)
    artist = Column(String, index=True)
    album = Column(String, index=True)
    album_artist = Column(String, index=True)
    genre = Column(String, index=True)
    year = Column(Integer)
    track_number = Column(Integer)
    disc_number = Column(Integer)
    duration = Column(Float)  # seconds
    
    # File info
    file_size = Column(Integer)
    format = Column(String)
    bitrate = Column(Integer)
    sample_rate = Column(Integer)
    
    # Data provenance (source_* — where each metadata field came from)
    source_title = Column(String)
    source_artist = Column(String)
    source_album = Column(String)
    source_album_artist = Column(String)
    source_genre = Column(String)
    source_year = Column(String)
    source_track_number = Column(String)
    source_disc_number = Column(String)
    source_duration = Column(String)
    source_bpm = Column(String)
    source_key = Column(String)
    source_artwork = Column(String)

    # MusicBrainz identifiers
    mb_release_id = Column(String, index=True)

    # Analysis
    bpm = Column(Float)
    key = Column(String)
    energy = Column(Float)
    loudness = Column(Float)
    
    # Timestamps
    added_at = Column(DateTime, server_default=func.now())
    modified_at = Column(DateTime, onupdate=func.now())
    last_played_at = Column(DateTime)
    
    # Relations
    play_count = Column(Integer, default=0)
    is_favorite = Column(Boolean, default=False)


class Album(Base):
    """Album model"""
    __tablename__ = "albums"
    
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False, index=True)
    artist = Column(String, index=True)
    year = Column(Integer)
    genre = Column(String)
    
    # Data provenance
    source_title = Column(String)
    source_artist = Column(String)
    source_year = Column(String)
    source_genre = Column(String)
    source_artwork = Column(String)

    # MusicBrainz identifiers
    mb_release_id = Column(String, index=True)
    mb_recording_id = Column(String)

    # Artwork
    artwork_path = Column(String)
    artwork_cached = Column(Boolean, default=False)
    
    # Palette (JSON stored as text)
    palette_primary = Column(String)
    palette_secondary = Column(String)
    palette_accent = Column(String)
    palette_shadow = Column(String)
    palette_highlight = Column(String)
    palette_ambient = Column(String)
    
    # Stats
    track_count = Column(Integer, default=0)
    total_duration = Column(Float)
    
    # Timestamps
    added_at = Column(DateTime, server_default=func.now())


class Artist(Base):
    """Artist model"""
    __tablename__ = "artists"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True, index=True)
    
    # Avatar
    avatar_path = Column(String)
    
    # Stats
    track_count = Column(Integer, default=0)
    album_count = Column(Integer, default=0)
    
    # Timestamps
    added_at = Column(DateTime, server_default=func.now())


class Playlist(Base):
    """Playlist model"""
    __tablename__ = "playlists"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    artwork_path = Column(String)
    
    # Palette
    palette_primary = Column(String)
    palette_secondary = Column(String)
    palette_accent = Column(String)
    palette_shadow = Column(String)
    palette_highlight = Column(String)
    palette_ambient = Column(String)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class PlaylistTrack(Base):
    """Playlist tracks (many-to-many)"""
    __tablename__ = "playlist_tracks"
    
    id = Column(Integer, primary_key=True)
    playlist_id = Column(String, ForeignKey("playlists.id", ondelete="CASCADE"))
    track_id = Column(String, ForeignKey("tracks.id", ondelete="CASCADE"))
    position = Column(Integer, nullable=False)
    
    added_at = Column(DateTime, server_default=func.now())


class PlayHistory(Base):
    """Play history"""
    __tablename__ = "play_history"
    
    id = Column(Integer, primary_key=True)
    track_id = Column(String, ForeignKey("tracks.id", ondelete="CASCADE"))
    played_at = Column(DateTime, server_default=func.now(), index=True)
    duration_played = Column(Float)  # How long was played (seconds)


class ImportJob(Base):
    """Import job tracking"""
    __tablename__ = "import_jobs"
    
    id = Column(String, primary_key=True)
    path = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, scanning, processing, completed, failed
    
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    imported_tracks = Column(Integer, default=0)
    failed_tracks = Column(Integer, default=0)
    
    error_message = Column(Text)
    
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)


class Cache(Base):
    """Cache metadata"""
    __tablename__ = "cache"
    
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class Lyrics(Base):
    """Synced lyrics from LRCLIB"""
    __tablename__ = "lyrics"
    
    id = Column(Integer, primary_key=True)
    track_id = Column(String, ForeignKey("tracks.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    plain_lyrics = Column(Text)
    synced_lyrics = Column(Text)  # [mm:ss.xx] format
    source = Column(String, default="lrclib")
    
    fetched_at = Column(DateTime, server_default=func.now())


class AppSetting(Base):
    """Application settings (key-value store)"""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)  # JSON-encoded
    updated_at = Column(DateTime, onupdate=func.now())


class ListeningPattern(Base):
    """Listening patterns for future AI recommendations"""
    __tablename__ = "listening_patterns"
    
    id = Column(Integer, primary_key=True)
    track_id = Column(String, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    
    hour_of_day = Column(Integer)
    play_duration_pct = Column(Float)  # 0.0 - 1.0
    completed = Column(Boolean, default=False)
    
    recorded_at = Column(DateTime, server_default=func.now())
