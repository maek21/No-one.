import { useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../../store'
import { playlistsApi } from '../../api/client'
import { api } from '../../api'
import { audioPlayer } from '../../services/AudioPlayer'
import type { Playlist, Track } from '../../types/models'
import './PlaylistsView.css'

export function PlaylistsView() {
  const playlists = useAppStore((s) => s.playlists)
  const setPlaylists = useAppStore((s) => s.setPlaylists)
  const addPlaylist = useAppStore((s) => s.addPlaylist)
  const setEditingPlaylist = useAppStore((s) => s.setEditingPlaylist)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setQueue = useAppStore((s) => s.setQueue)
  const setPalette = useAppStore((s) => s.setPalette)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const setCurrentTime = useAppStore((s) => s.setCurrentTime)
  const setDuration = useAppStore((s) => s.setDuration)
  const tracksCacheRef = useRef<Record<string, Track[]>>({})

  useEffect(() => {
    playlistsApi.getAll().then((res: { data: Playlist[] }) => setPlaylists(res.data)).catch((err: unknown) => console.error(err))
  }, [setPlaylists])

  const playPlaylist = useCallback(async (pl: Playlist) => {
    try {
      let tracks = tracksCacheRef.current[pl.id]
      if (!tracks) {
        const res = await playlistsApi.getTracks(pl.id)
        tracks = res.data as (Track & { artwork?: string })[]
        tracksCacheRef.current[pl.id] = tracks
      }
      if (!tracks || tracks.length === 0) return

      const paletteColors = [pl.palette_primary, pl.palette_accent, pl.palette_secondary].filter(Boolean)
      const queue = tracks.map((t: any) => ({
        id: t.track_id || t.id,
        title: t.title || 'Unknown',
        artist: t.artist || 'Unknown Artist',
        duration: t.duration || 0,
        artwork: t.artwork || pl.artwork_path || null,
        palette: null,
      }))
      setQueue(queue, 0)
      setPalette(paletteColors.length ? paletteColors : null)
      setIslandState('playing')
      setCurrentTime(0)
      setDuration(queue[0].duration || 0)
      const url = api.getStreamUrl(queue[0].id)
      const ok = await audioPlayer.play(url)
      setIsPlaying(ok)
    } catch (err) {
      console.error('Failed to play playlist', err)
    }
  }, [setQueue, setPalette, setIslandState, setCurrentTime, setDuration, setIsPlaying])

  const handleCreate = async () => {
    try {
      const res = await playlistsApi.create(`Playlist ${playlists.length + 1}`)
      const pl = res.data
      addPlaylist(pl)
      setEditingPlaylist(pl)
      setIslandState('editing')
    } catch (err) {
      console.error('Failed to create playlist', err)
    }
  }

  const handleEdit = (pl: any) => {
    setEditingPlaylist(pl)
    setIslandState('editing')
  }

  const handleDragStart = (e: React.DragEvent, pl: any) => {
    const dragData = { type: 'playlist', playlistId: pl.id, playlistName: pl.name }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
  }

  if (playlists.length === 0) {
    return (
      <div className="playlists-view">
        <div className="playlists-empty">
          <div className="playlists-empty-title">No playlists yet</div>
          <div className="playlists-empty-sub">Create one to organize your music</div>
          <button className="playlists-create-btn" onClick={handleCreate}>+ New Playlist</button>
        </div>
      </div>
    )
  }

  return (
    <div className="playlists-view">
      <div className="playlists-header">
        <h2 className="playlists-title">Playlists</h2>
        <button className="playlists-add-btn" onClick={handleCreate} title="New Playlist">+</button>
      </div>
      <div className="playlists-grid">
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="playlist-card"
            onClick={() => handleEdit(pl)}
            draggable
            onDragStart={(e) => handleDragStart(e, pl)}
          >
            <div className="playlist-card-art">
              {pl.artwork_path ? (
                <img src={pl.artwork_path} alt={pl.name} />
              ) : (
                <div className="playlist-card-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
              <button
                className="playlist-play-btn"
                onClick={(e) => { e.stopPropagation(); playPlaylist(pl) }}
                title="Play"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
            <div className="playlist-card-info">
              <div className="playlist-card-name">{pl.name}</div>
              <div className="playlist-card-count">{pl.track_count} tracks</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}