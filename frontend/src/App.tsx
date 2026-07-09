import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from './store'
import { api } from './api'
import { audioPlayer } from './services/AudioPlayer'
import { AmbientCanvas } from './components/Ambient/AmbientCanvas'
import { DynamicIsland } from './components/DynamicIsland/DynamicIsland'
import { Library } from './components/Library/Library'
import { TabBar } from './components/TabBar/TabBar'
import { LyricsView } from './components/Lyrics/Lyrics'
import { QueueView } from './components/Queue/Queue'
import { SettingsView } from './components/Settings/Settings'
import { PlaylistsView } from './components/Playlists/PlaylistsView'
import { useWebSocket } from './hooks/useWebSocket'
import type { ViewId } from './components/TabBar/TabBar'
import type { QueueTrack } from './types/models'

function App() {
  const setConnected = useAppStore((s) => s.setConnected)
  const setDragActive = useAppStore((s) => s.setDragActive)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setImporting = useAppStore((s) => s.setImporting)
  const setCurrentTime = useAppStore((s) => s.setCurrentTime)
  const setDuration = useAppStore((s) => s.setDuration)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const setQueue = useAppStore((s) => s.setQueue)
  const setAudioAnalysis = useAppStore((s) => s.setAudioAnalysis)
  const setDragProximity = useAppStore((s) => s.setDragProximity)
  const setPalette = useAppStore((s) => s.setPalette)
  const isImporting = useAppStore((s) => s.isImporting)
  const lyricsFullscreen = useAppStore((s) => s.lyricsFullscreen)
  const lyricsVisible = useAppStore((s) => s.lyricsVisible)
  const nowPlaying = useAppStore((s) => s.nowPlaying)
  const parsedLines = useAppStore((s) => s.syncedLyricsRaw)
  const { connected } = useWebSocket()

  const setGlassSettings = useAppStore((s) => s.setGlassSettings)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeView, setActiveView] = useState<ViewId>('library')
  const [folderInput, setFolderInput] = useState<string>('')
  const [showFolderInput, setShowFolderInput] = useState<boolean>(false)

  const makeQueueTracks = useCallback((data: any): QueueTrack[] => {
    if (!data || !data.tracks) return []
    const globalArtwork = data.type === 'artist' ? null : data.artwork
    return data.tracks.map((t: any) => ({
      id: t.id,
      title: t.title || 'Unknown',
      artist: t.artist || 'Unknown Artist',
      duration: t.duration || 0,
      artwork: t.artwork || globalArtwork || null,
      palette: data.palette || null,
      source: t.source || data.source || undefined,
    }))
  }, [])

  // ── Track change → extract palette from artwork ──
  useEffect(() => {
    if (!nowPlaying?.id || !nowPlaying?.artwork) return

    // If the track already has a palette in the queue track, use it
    if (nowPlaying.palette) {
      const p = nowPlaying.palette as any
      if (p.accent) {
        const arr = [p.primary, p.accent, p.secondary, p.shadow, p.highlight, p.ambient].filter(Boolean)
        setPalette(arr.length ? arr : null)
        return
      }
    }

    // Otherwise fetch from backend
    let cancelled = false
    const controller = new AbortController()
    fetch(`/api/library/tracks/${nowPlaying.id}/palette`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error(); return res.json() })
      .then((pal: any) => {
        if (cancelled) return
        const arr = [pal.primary, pal.accent, pal.secondary, pal.shadow, pal.highlight, pal.ambient].filter(Boolean)
        if (arr.length) setPalette(arr)
      })
      .catch(() => {
        if (!cancelled) setPalette(null)
      })

    return () => { cancelled = true; controller.abort() }
  }, [nowPlaying?.id, nowPlaying?.artwork, nowPlaying?.palette])

  // ── Audio callbacks ──
  useEffect(() => {
    audioPlayer.onTimeUpdate = ({ currentTime, duration }: { currentTime: number; duration: number }) => {
      setCurrentTime(currentTime)
      setDuration(duration)
    }
    audioPlayer.onAudioData = (data: any) => {
      setAudioAnalysis(data)
    }
    audioPlayer.onEnded = () => {
      const { queue, queueIndex } = useAppStore.getState()
      const nextIdx = queueIndex + 1
      if (nextIdx < queue.length) {
        const track = queue[nextIdx]
        useAppStore.getState().setQueue(queue, nextIdx)
        const url = api.getStreamUrl(track.id)
        audioPlayer.play(url).then((ok: boolean) => {
          useAppStore.getState().setIsPlaying(ok)
        })
      } else {
        useAppStore.getState().setIsPlaying(false)
      }
    }
  }, [setCurrentTime, setDuration, setAudioAnalysis])

  // ── Backend connection ──
  useEffect(() => {
    const check = async () => setConnected(await api.checkHealth())
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [setConnected])

  // ── Load glass settings from backend (after connected) ──
  useEffect(() => {
    if (!connected) return
    let cancelled = false
    api.getSettings().then((data: any) => {
      if (cancelled || !data.glass) return
      setGlassSettings(data.glass)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [connected, setGlassSettings])

  // ── Drag/drop for DynamicIsland ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }

    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      try {
        const raw = e.dataTransfer?.getData('application/json')
        if (!raw) return
        const data = JSON.parse(raw)

        // If editing a playlist, don't play — EditPlaylistPanel handles its own drop
        if (useAppStore.getState().editingPlaylist) return

        if (data.type === 'playlist') {
          const [plRes, tracksRes] = await Promise.all([
            fetch(`/api/playlists/${data.playlistId}`),
            fetch(`/api/playlists/${data.playlistId}/tracks`),
          ])
          const pl = await plRes.json()
          const tracks: any[] = await tracksRes.json()
          if (tracks.length === 0) return
          const paletteColors = [pl.palette_primary, pl.palette_accent, pl.palette_secondary].filter(Boolean)
          const queue = tracks.map((t: any) => ({
            id: t.track_id,
            title: t.title,
            artist: t.artist || 'Unknown Artist',
            duration: t.duration || 0,
            artwork: t.artwork || pl.artwork_path || null,
            palette: null,
          }))

          setQueue(queue, 0)
          setPalette(paletteColors.length ? paletteColors : null)
          setIslandState('playing')
          setCurrentTime(0)
          setDuration(queue[0]?.duration || 0)
          const url = api.getStreamUrl(queue[0].id)
          const ok = await audioPlayer.play(url)
          setIsPlaying(ok)
          return
        }

        if (data.type === 'track' || data.type === 'album' || data.type === 'artist') {
          const tracks = data.tracks || []
          if (tracks.length === 0) return
          const startIndex = data.startIndex || 0
          const queue = makeQueueTracks(data)
          setQueue(queue, startIndex)
          if (data.palette) {
            setPalette(Array.isArray(data.palette) ? data.palette : data.palette)
          }
          setIslandState('playing')
          setCurrentTime(0)
          setDuration(queue[startIndex]?.duration || 0)
          const url = api.getStreamUrl(queue[startIndex].id)
          const ok = await audioPlayer.play(url)
          setIsPlaying(ok)
        }
      } catch (err) {
        console.error('Drop error:', err)
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [setQueue, setIslandState, setCurrentTime, setDuration, setIsPlaying, setPalette, makeQueueTracks])

  // ── Drag state for import + proximity ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let dragCount = 0
    const onEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCount++
      if (e.dataTransfer?.types.includes('Files')) {
        setDragActive(true)
      }
    }
    const onLeave = () => {
      dragCount--
      if (dragCount <= 0) { dragCount = 0; setDragActive(false); setDragProximity(0, 0) }
    }
    const onDropFiles = (e: DragEvent) => {
      dragCount = 0; setDragActive(false); setDragProximity(0, 0)
      if (window.electronAPI) {
        window.electronAPI.selectFolder().then((path) => {
          if (path) api.startImport(path).catch(console.error)
        })
      } else {
        setFolderInput('')
        setShowFolderInput(true)
      }
    }

    const onDragOver = (e: DragEvent) => {
      const islandEl = document.getElementById('dynamic-island-glass')
      if (!islandEl) return
      const rect = islandEl.getBoundingClientRect()
      const cx = e.clientX
      const cy = e.clientY
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = cx - centerX
      const dy = cy - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = 350
      const prox = Math.max(0, 1 - dist / maxDist)
      setDragProximity(prox, cx)
    }

    el.addEventListener('dragenter', onEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onLeave)
    el.addEventListener('drop', onDropFiles)
    return () => {
      el.removeEventListener('dragenter', onEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onLeave)
      el.removeEventListener('drop', onDropFiles)
    }
  }, [setDragActive, setDragProximity])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          const st = useAppStore.getState()
          if (st.isPlaying) { audioPlayer.pause(); st.setIsPlaying(false) }
          else { audioPlayer.resume(); st.setIsPlaying(true) }
          break
        case 'ArrowLeft': {
          const st = useAppStore.getState()
          const cur = audioPlayer.audio?.currentTime || 0
          if (cur > 3) { audioPlayer.seek(0); break }
          const pi = Math.max(0, st.queueIndex - 1)
          if (pi !== st.queueIndex) {
            const t = st.queue[pi]
            st.setQueue(st.queue, pi)
            audioPlayer.play(api.getStreamUrl(t.id)).then((ok) => useAppStore.getState().setIsPlaying(ok))
          }
          break
        }
        case 'ArrowRight': {
          const st = useAppStore.getState()
          const ni = st.queueIndex + 1
          if (ni < st.queue.length) {
            const t = st.queue[ni]
            st.setQueue(st.queue, ni)
            audioPlayer.play(api.getStreamUrl(t.id)).then((ok) => useAppStore.getState().setIsPlaying(ok))
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={containerRef} className="app">
      {/* Layer 0: Ambient — near-black idle, soft glow on playback */}
      <AmbientCanvas />

      {/* Layer 1: Content — scrollable, fills screen */}
      <main className="app-main">
        {activeView === 'library' && <Library />}
        {activeView === 'playlists' && <PlaylistsView />}
        {activeView === 'lyrics' && <LyricsView />}
        {activeView === 'queue' && <QueueView />}
        {activeView === 'settings' && <SettingsView />}
      </main>

      {/* Layer 2: Dynamic Island — fixed top center */}
      <DynamicIsland />

      {/* Layer 3: Tab Bar — fixed bottom center */}
      <TabBar activeView={activeView} onViewChange={setActiveView} />

      {/* Notifications */}
      {isImporting && (
        <div className="import-overlay">
          <p>Importing music...</p>
        </div>
      )}
      {!connected && (
        <div className="connection-status">Connecting to backend...</div>
      )}

      {/* Folder input modal (web dev fallback) */}
      {showFolderInput && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        }} onClick={() => setShowFolderInput(false)}>
          <div style={{
            background: '#1a1a1a', borderRadius: 16, padding: 24, width: 420,
            border: '1px solid rgba(255,255,255,0.1)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              Import music folder
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              Enter the full path to your music folder
            </p>
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="C:\Users\...\Music"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
                fontSize: 14, outline: 'none', marginBottom: 16,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderInput) {
                  setShowFolderInput(false)
                  api.startImport(folderInput).catch(console.error)
                }
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFolderInput(false)} style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
                fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => {
                if (folderInput) {
                  setShowFolderInput(false)
                  api.startImport(folderInput).catch(console.error)
                }
              }} style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: '#ffffff', color: '#000000',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
