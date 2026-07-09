import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import { libraryApi } from '../../api/client'
import { audioPlayer } from '../../services/AudioPlayer'
import type { Album, Track } from '../../types/models'
import './Library.css'

function fmtDur(s: number | null | undefined): string {
  if (!s || !isFinite(s)) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function Library() {
  const albums = useAppStore((s) => s.albums)
  const setAlbums = useAppStore((s) => s.setAlbums)
  const setQueue = useAppStore((s) => s.setQueue)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const setCurrentTime = useAppStore((s) => s.setCurrentTime)
  const setDuration = useAppStore((s) => s.setDuration)
  const setPalette = useAppStore((s) => s.setPalette)

  const [viewMode, setViewMode] = useState<'albums' | 'artists'>('albums')
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null)
  const [albumTracks, setAlbumTracks] = useState<Track[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const tracksCacheRef = useRef<Record<string, Track[]>>({})
  const artistTracksCacheRef = useRef<Record<string, any[]>>({})

  useEffect(() => {
    if (viewMode === 'albums') {
      api.getAlbums(200, 0).then((data: Album[]) => setAlbums(data)).catch(console.error)
    } else {
      libraryApi.getArtists().then((res: any) => setArtists(res.data)).catch(console.error)
    }
  }, [viewMode, setAlbums])

  const handleAlbumClick = useCallback(async (album: Album) => {
    if (expandedAlbum === album.id) {
      setExpandedAlbum(null)
      setAlbumTracks([])
      return
    }
    if (tracksCacheRef.current[album.id]) {
      setAlbumTracks(tracksCacheRef.current[album.id])
    } else {
      try {
        const tracks = await api.getAlbumTracks(album.id) as Track[]
        tracksCacheRef.current[album.id] = tracks || []
        setAlbumTracks(tracks || [])
      } catch {
        setAlbumTracks([])
      }
    }
    setExpandedAlbum(album.id)
  }, [expandedAlbum])

  const playTrack = useCallback(async (
    track: Track,
    tracksList: Track[],
    startIndex: number,
    artwork: string | null,
    palette: any,
  ) => {
    const paletteToStore = palette ? (Array.isArray(palette) ? palette : [palette]) : null
    const queue = tracksList.map((t) => ({
      id: t.id,
      title: t.title || 'Unknown',
      artist: t.artist || 'Unknown Artist',
      duration: t.duration || 0,
      artwork,
      palette: paletteToStore,
    }))
    setQueue(queue, startIndex)
    if (paletteToStore) setPalette(paletteToStore)
    setIslandState('playing')
    setCurrentTime(0)
    setDuration(queue[startIndex].duration || 0)
    const url = api.getStreamUrl(queue[startIndex].id)
    const ok = await audioPlayer.play(url)
    setIsPlaying(ok)
  }, [setQueue, setPalette, setIslandState, setCurrentTime, setDuration, setIsPlaying])

  const handleTrackDragStart = useCallback((
    e: React.DragEvent,
    track: Track,
    tracksList: Track[],
    index: number,
    artwork: string | null,
    palette: any,
  ) => {
    const paletteColors = palette ? (Array.isArray(palette) ? palette : [palette]) : null
    const dragData = {
      type: 'track',
      track: { id: track.id, title: track.title, artist: track.artist, duration: track.duration },
      tracks: tracksList.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration })),
      startIndex: index,
      artwork,
      palette: paletteColors,
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleAlbumDragStart = useCallback(async (e: React.DragEvent, album: Album) => {
    let tracks = tracksCacheRef.current[album.id]
    if (!tracks) {
      try {
        tracks = await api.getAlbumTracks(album.id) as Track[]
        tracksCacheRef.current[album.id] = tracks || []
      } catch {
        tracks = []
      }
    }
    const paletteColors = [album.palette_primary, album.palette_accent, album.palette_secondary].filter(Boolean)
    const dragData = {
      type: 'album',
      tracks: (tracks || []).map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration })),
      startIndex: 0,
      artwork: album.artwork_path || null,
      palette: paletteColors,
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleArtistDragStart = useCallback(async (e: React.DragEvent, artist: any) => {
    let tracks = artistTracksCacheRef.current[artist.id]
    if (!tracks) {
      try {
        const res = await libraryApi.getArtistTracks(artist.id)
        tracks = res.data as any[]
        artistTracksCacheRef.current[artist.id] = tracks || []
      } catch {
        tracks = []
      }
    }
    const dragData = {
      type: 'artist',
      tracks: (tracks || []).map((t: any) => ({
        id: t.id,
        title: t.title || 'Unknown',
        artist: t.artist || 'Unknown Artist',
        duration: t.duration || 0,
        artwork: t.artwork || null,
        source: t.source || undefined,
      })),
      startIndex: 0,
      artwork: null,
      palette: null,
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const playArtist = useCallback(async (artist: any) => {
    try {
      let tracks = artistTracksCacheRef.current[artist.id]
      if (!tracks) {
        const res = await libraryApi.getArtistTracks(artist.id)
        tracks = res.data as any[]
        artistTracksCacheRef.current[artist.id] = tracks || []
      }
      if (!tracks || tracks.length === 0) return
      const queue = tracks.map((t: any) => ({
        id: t.id,
        title: t.title || 'Unknown',
        artist: t.artist || 'Unknown Artist',
        duration: t.duration || 0,
        artwork: t.artwork || null,
        palette: null,
        source: t.source || undefined,
      }))
      setQueue(queue, 0)
      setPalette(null)
      setIslandState('playing')
      setCurrentTime(0)
      setDuration(queue[0].duration || 0)
      const url = api.getStreamUrl(queue[0].id)
      const ok = await audioPlayer.play(url)
      setIsPlaying(ok)
    } catch (err) {
      console.error('Failed to play artist', err)
    }
  }, [setQueue, setPalette, setIslandState, setCurrentTime, setDuration, setIsPlaying])

  if (albums.length === 0 && viewMode === 'albums') {
    return (
      <div className="library-scroll">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <div style={{ fontSize: 32, fontWeight: 300, color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
            Drop your music.
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>
            Drag a folder containing your music library
          </div>
        </div>
      </div>
    )
  }

  if (viewMode === 'artists') {
    return (
      <div className="library-scroll">
        <div className="library-view-toggle">
          <button className={viewMode === 'albums' ? 'active' : ''} onClick={() => setViewMode('albums')}>Albums</button>
          <button className={viewMode === 'artists' ? 'active' : ''} onClick={() => setViewMode('artists')}>Artists</button>
        </div>
        <div className="library-header">
          <h2 className="library-title">Artists</h2>
          <span className="library-count">{artists.length} artists</span>
        </div>
        <div className="artists-grid">
          {artists.map((artist) => (
            <div
              key={artist.id}
              className="artist-card"
              draggable
              onDragStart={(e) => handleArtistDragStart(e, artist)}
              onClick={() => playArtist(artist)}
            >
              <div className="artist-card-avatar">
                {artist.avatar_path ? (
                  <img src={artist.avatar_path} alt={artist.name} />
                ) : (
                  <div className="artist-card-initials">
                    {artist.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="artist-card-info">
                <div className="artist-card-name">{artist.name}</div>
                <div className="artist-card-meta">{artist.track_count} tracks · {artist.album_count} albums</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="library-scroll">
      <div className="library-view-toggle">
        <button className={viewMode === 'albums' ? 'active' : ''} onClick={() => setViewMode('albums')}>Albums</button>
        <button className={viewMode === 'artists' ? 'active' : ''} onClick={() => setViewMode('artists')}>Artists</button>
      </div>
      <div className="library-header">
        <h2 className="library-title">Albums</h2>
        <span className="library-count">{albums.length} albums</span>
      </div>
      <div className="library-grid">
        {albums.map((album) => {
          const isExpanded = expandedAlbum === album.id
          return (
            <div key={album.id} className={isExpanded ? 'album-expanded' : ''}>
              <div
                draggable
                onDragStart={(e) => handleAlbumDragStart(e, album)}
                onClick={() => handleAlbumClick(album)}
                className="album-card"
              >
                <div className="album-card-inner">
                  <div className="album-art">
                    {album.artwork_path ? (
                      <img src={album.artwork_path} alt={album.title} loading="lazy" />
                    ) : (
                      <div className="album-art-placeholder" />
                    )}
                  </div>
                  <div className="album-info">
                    <div className="album-title">{album.title}</div>
                    <div className="album-artist">{album.artist || 'Unknown Artist'}</div>
                    {isExpanded && (
                      <div className="album-track-count">{albumTracks.length} tracks</div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && albumTracks.length > 0 && (
                <div className="track-list">
                  {albumTracks.map((track, idx) => (
                    <div
                      key={track.id}
                      draggable
                      onDragStart={(e) => handleTrackDragStart(e, track, albumTracks, idx, album.artwork_path, [album.palette_primary])}
                      onClick={(e) => { e.stopPropagation(); playTrack(track, albumTracks, idx, album.artwork_path, [album.palette_primary]) }}
                      className="track-row"
                    >
                      <span className="track-number">{idx + 1}</span>
                      <div className="track-meta">
                        <div className="track-title">{track.title || 'Unknown'}</div>
                        <div className="track-artist">{track.artist || ''}</div>
                      </div>
                      <span className="track-duration">{fmtDur(track.duration)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}