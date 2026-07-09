import sqlite3
conn = sqlite3.connect("cache/no-one.db")
tracks = conn.execute("SELECT COUNT(*) FROM tracks WHERE mb_release_id IS NOT NULL").fetchone()[0]
albums = conn.execute("SELECT COUNT(*) FROM albums WHERE mb_release_id IS NOT NULL").fetchone()[0]
print(f"tracks with mb_release_id: {tracks}")
print(f"albums with mb_release_id: {albums}")
if tracks > 0:
    for r in conn.execute("SELECT title, mb_release_id FROM tracks WHERE mb_release_id IS NOT NULL LIMIT 5"):
        print(f"  {r[0]}: {r[1]}")
if albums > 0:
    for r in conn.execute("SELECT title, mb_release_id FROM albums WHERE mb_release_id IS NOT NULL LIMIT 5"):
        print(f"  album: {r[0]}: {r[1]}")
conn.close()
