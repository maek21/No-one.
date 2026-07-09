import sqlite3
conn = sqlite3.connect("cache/no-one.db")
c = conn.execute("""
    SELECT COUNT(*) FROM tracks 
    WHERE artist IS NOT NULL AND title IS NOT NULL
    AND (source_album IS NULL OR source_album IN ('folder','filename')
         OR source_genre IS NULL OR source_genre IN ('folder','filename')
         OR source_year IS NULL OR source_year IN ('folder','filename')
         OR source_artwork IS NULL OR source_artwork IN ('folder','filename'))
""")
print(f"Would trigger MusicBrainz step: {c.fetchone()[0]}")

c = conn.execute("SELECT COUNT(*) FROM tracks WHERE source_album = 'tag'")
print(f"source_album=tag: {c.fetchone()[0]}")

c = conn.execute("SELECT COUNT(*) FROM tracks WHERE source_artwork IS NULL")
print(f"source_artwork=NULL: {c.fetchone()[0]}")

c = conn.execute("SELECT COUNT(*) FROM tracks WHERE source_genre IS NULL")
print(f"source_genre=NULL: {c.fetchone()[0]}")

c = conn.execute("SELECT COUNT(*) FROM tracks WHERE source_year IS NULL")
print(f"source_year=NULL: {c.fetchone()[0]}")

# Also show some examples
c = conn.execute("""
    SELECT title, artist, source_album, source_genre, source_year, source_artwork
    FROM tracks 
    WHERE artist IS NOT NULL AND title IS NOT NULL
    AND (source_album IS NULL OR source_genre IS NULL OR source_year IS NULL)
    LIMIT 5
""")
for row in c.fetchall():
    print(f"  {row[0]} | {row[1]} | alb={row[2]} gen={row[3]} yr={row[4]} art={row[5]}")
conn.close()
