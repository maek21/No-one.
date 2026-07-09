"""Migration 003: Add source_* columns to Track and Album"""

import sqlite3
from pathlib import Path

DB_PATH = Path("./cache/no-one.db")

SOURCE_COLUMNS_TRACK = [
    "source_title", "source_artist", "source_album", "source_album_artist",
    "source_genre", "source_year", "source_track_number", "source_disc_number",
    "source_duration", "source_bpm", "source_key", "source_artwork",
]

SOURCE_COLUMNS_ALBUM = [
    "source_title", "source_artist", "source_year", "source_genre", "source_artwork",
]


def run():
    if not DB_PATH.exists():
        print("DB not found, skipping migration")
        return

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.execute("PRAGMA table_info(tracks)")
    existing = {row[1] for row in cursor.fetchall()}

    for col in SOURCE_COLUMNS_TRACK:
        if col not in existing:
            conn.execute(f"ALTER TABLE tracks ADD COLUMN {col} TEXT")

    cursor = conn.execute("PRAGMA table_info(albums)")
    existing = {row[1] for row in cursor.fetchall()}

    for col in SOURCE_COLUMNS_ALBUM:
        if col not in existing:
            conn.execute(f"ALTER TABLE albums ADD COLUMN {col} TEXT")

    conn.commit()
    conn.close()
    print("Migration 003 applied successfully")


if __name__ == "__main__":
    run()
