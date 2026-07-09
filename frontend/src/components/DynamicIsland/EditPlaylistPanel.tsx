import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '../../store'
import { playlistsApi } from '../../api/client'

interface EditPlaylistPanelProps {
  playlist: { id: string; name: string; artwork_path: string | null; track_count: number }
  onSave: (name: string) => void
  onDelete: () => void
  onDone: () => void
  playlistId: string
}

export function EditPlaylistPanel({ playlist, onSave, onDelete, onDone, playlistId }: EditPlaylistPanelProps) {
  const [name, setName] = useState(playlist.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [artworkSrc, setArtworkSrc] = useState<string | null>(playlist.artwork_path)
  const updatePlaylist = useAppStore((s) => s.updatePlaylist)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = useCallback(() => {
    if (name.trim() && name !== playlist.name) onSave(name.trim())
  }, [name, playlist.name, onSave])

  const uploadArtwork = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/playlists/${playlistId}/artwork`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setArtworkSrc(data.artwork_path || URL.createObjectURL(file))
        updatePlaylist(playlistId, {
          artwork_path: data.artwork_path || null,
          palette_primary: data.palette_primary || null,
          palette_accent: data.palette_accent || null,
          palette_secondary: data.palette_secondary || null,
        })
      }
    } catch (err) {
      console.error('Artwork upload failed', err)
    }
  }, [playlistId, updatePlaylist])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      await uploadArtwork(file)
      return
    }

    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const data = JSON.parse(raw)
      let trackIds: string[] = []

      if (data.type === 'track') {
        trackIds = [data.track.id]
      } else if (data.type === 'album') {
        trackIds = (data.tracks || []).map((t: any) => t.id)
      }

      if (trackIds.length > 0) {
        const res = await playlistsApi.addTracks(playlistId, trackIds)
        if (res.status === 200) {
          updatePlaylist(playlistId, { track_count: playlist.track_count + trackIds.length })
        }
      }
    } catch (err) {
      console.error('Drop to playlist error:', err)
    }
  }, [playlistId, playlist.track_count, updatePlaylist, uploadArtwork])

  const glassBtn: React.CSSProperties = {
    background: 'none', border: 'none', borderRadius: 8, width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    padding: 0, color: '#fff', pointerEvents: 'auto',
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '14px 24px 10px', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
        >
          {artworkSrc ? (
            <img src={artworkSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadArtwork(file)
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 10px', fontSize: 14, color: '#fff',
              outline: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              boxSizing: 'border-box',
            }}
            placeholder="Playlist name"
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
          {playlist.track_count} tracks
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onDone} style={{ ...glassBtn, width: 32, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.1)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        </button>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} style={{ ...glassBtn }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,70,70,0.5)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={onDelete} style={{
              ...glassBtn, width: 24, height: 24, borderRadius: 5, background: 'rgba(255,70,70,0.2)',
              fontSize: 10, fontWeight: 600, color: 'rgba(255,70,70,0.8)',
            }}>Del</button>
            <button onClick={() => setShowDeleteConfirm(false)} style={{
              ...glassBtn, width: 24, height: 24, borderRadius: 5,
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
            }}>No</button>
          </div>
        )}
      </div>

      <div style={{
        flex: 1, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 6,
        background: 'rgba(255,255,255,0.02)',
        fontSize: 11, color: 'rgba(255,255,255,0.2)',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
          <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
        </svg>
        <span>Drop tracks, albums or artwork here</span>
      </div>
    </div>
  )
}