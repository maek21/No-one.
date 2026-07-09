import { useEffect, useRef, useState, useMemo } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import { audioPlayer } from '../../services/AudioPlayer'
import { Spring } from '../../utils/spring'
import GlassSurface from '../GlassSurface'
import WaveBar from '../wave/WaveBar'
import { useSyncedLyrics } from '../../hooks/useSyncedLyrics'
import { playlistsApi } from '../../api/client'
import { EditPlaylistPanel } from './EditPlaylistPanel'

const SIZES = {
  idle: { w: 570, h: 90 },
  dragging: { w: 630, h: 105 },
  importing: { w: 720, h: 135 },
  compact: { w: 840, h: 100 },
  expanded: { w: 840, h: 200 },
  lyrics: { w: 840, h: 340 },
  editing: { w: 720, h: 260 },
}

export function DynamicIsland() {
  const islandState = useAppStore((s) => s.islandState)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const dragActive = useAppStore((s) => s.dragActive)
  const nowPlaying = useAppStore((s) => s.nowPlaying)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const currentTime = useAppStore((s) => s.currentTime)
  const duration = useAppStore((s) => s.duration)
  const importProgress = useAppStore((s) => s.importProgress)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const lyricsVisible = useAppStore((s) => s.lyricsVisible)
  const lyricsFullscreen = useAppStore((s) => s.lyricsFullscreen)
  const setLyricsFullscreen = useAppStore((s) => s.setLyricsFullscreen)
  const glassSettings = useAppStore((s) => s.glassSettings)
  const dragProximity = useAppStore((s) => s.dragProximity)
  const dragCursorX = useAppStore((s) => s.dragCursorX)
  const setLyricsVisible = useAppStore((s) => s.setLyricsVisible)
  const syncedLyricsRaw = useAppStore((s) => s.syncedLyricsRaw)
  const setSyncedLyricsRaw = useAppStore((s) => s.setSyncedLyricsRaw)
  const palette = useAppStore((s) => s.palette)
  const editingPlaylist = useAppStore((s) => s.editingPlaylist)
  const setEditingPlaylist = useAppStore((s) => s.setEditingPlaylist)
  const updatePlaylist = useAppStore((s) => s.updatePlaylist)
  const removePlaylist = useAppStore((s) => s.removePlaylist)

  const { lines: parsedLines, currentIndex } = useSyncedLyrics(syncedLyricsRaw)

  const [pos, setPos] = useState({ x: 0, y: 20, w: 570, h: 90 })
  const [hovered, setHovered] = useState(false)
  const [contentOpacity, setContentOpacity] = useState(1)
  const prevStateRef = useRef('idle')
  const springW = useRef(new Spring(SIZES.idle.w, 0.25, 0.45))
  const springH = useRef(new Spring(SIZES.idle.h, 0.25, 0.45))
  const springContent = useRef(new Spring(1, 0.3, 0.5))

  // Phase 5: accent color from artwork palette (stable across renders)
  const accentColor = useMemo(() => {
    const p = palette || (nowPlaying?.palette as any)
    if (!p) return '#ffffff'
    return p.accent || p.primary || (Array.isArray(p) ? p[0] : '#ffffff')
  }, [palette, nowPlaying?.palette])

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '')
    return {
      r: parseInt(clean.slice(0, 2), 16) || 255,
      g: parseInt(clean.slice(2, 4), 16) || 255,
      b: parseInt(clean.slice(4, 6), 16) || 255,
    }
  }

  const accentRgb = useMemo(() => hexToRgb(accentColor), [accentColor])

  useEffect(() => {
    if (!nowPlaying?.id) { setSyncedLyricsRaw(''); return }
    setSyncedLyricsRaw('')
    api.getLyrics(nowPlaying.id).then((data: any) => {
      setSyncedLyricsRaw(data?.synced || data?.plain || '')
    }).catch(() => setSyncedLyricsRaw(''))
  }, [nowPlaying?.id])

  useEffect(() => {
    let raf: number
    const tick = () => {
      const currentState = islandState === 'editing' ? 'editing' :
        dragActive ? 'dragging' :
        islandState === 'importing' ? 'importing' :
        islandState === 'playing' && lyricsVisible ? 'lyrics' :
        islandState === 'playing' && hovered ? 'expanded' :
        islandState === 'playing' ? 'compact' : 'idle'

      const wasSmall = ['idle', 'dragging'].includes(prevStateRef.current)
      const isGrowing = ['compact', 'expanded', 'lyrics'].includes(currentState)
      const stiffness = (isGrowing && wasSmall) ? 0.18 : 0.28
      const damping = (isGrowing && wasSmall) ? 0.5 : 0.4
      springW.current.stiffness = stiffness
      springW.current.damping = damping
      springH.current.stiffness = stiffness
      springH.current.damping = damping

      let target = SIZES[currentState as keyof typeof SIZES] || SIZES.idle

      let stretchW = 0
      if (dragProximity > 0 && !dragActive) {
        stretchW = dragProximity * 60
      }

      springW.current.setValue(target.w + stretchW)
      springH.current.setValue(target.h)
      const w = springW.current.update()
      const h = springH.current.update()

      const moving = Math.abs(springW.current.velocity) > 1 || Math.abs(springH.current.velocity) > 1
      springContent.current.setValue(moving ? 0.6 : 1)
      setContentOpacity(springContent.current.update())

      const x = (window.innerWidth - w) / 2
      setPos({ x, y: 20, w, h })
      raf = requestAnimationFrame(tick)
    }
    prevStateRef.current = islandState === 'editing' ? 'editing' :
      dragActive ? 'dragging' :
      islandState === 'importing' ? 'importing' :
      islandState === 'playing' && lyricsVisible ? 'lyrics' :
      islandState === 'playing' && hovered ? 'expanded' :
      islandState === 'playing' ? 'compact' : 'idle'
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [islandState, dragActive, lyricsVisible, hovered, dragProximity])

  const { x, y, w, h } = pos
  const isCompact = islandState === 'playing' && !hovered && !lyricsVisible

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) { audioPlayer.pause(); setIsPlaying(false) }
    else { audioPlayer.resume(); setIsPlaying(true) }
  }

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cur = audioPlayer.audio?.currentTime || 0
    if (cur > 3) { audioPlayer.seek(0); return }
    const { queue, queueIndex: qi } = useAppStore.getState()
    const pi = Math.max(0, qi - 1)
    if (pi !== qi) {
      const t = queue[pi]
      useAppStore.getState().setQueue(queue, pi)
      audioPlayer.play(api.getStreamUrl(t.id)).then((ok) => useAppStore.getState().setIsPlaying(ok))
    }
  }

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const { queue, queueIndex: qi } = useAppStore.getState()
    const ni = qi + 1
    if (ni < queue.length) {
      const t = queue[ni]
      useAppStore.getState().setQueue(queue, ni)
      audioPlayer.play(api.getStreamUrl(t.id)).then((ok) => useAppStore.getState().setIsPlaying(ok))
    }
  }

  const glassBtn = {
    background: 'none', border: 'none', borderRadius: 8, width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    padding: 0, color: '#fff', pointerEvents: 'auto' as const,
  }

const containerId = 'dynamic-island'

  return (
    <>
      {/* Layer: glass + overlays (z-index 51) */}
      <div id="dynamic-island-glass" style={{
        position: 'fixed', left: x, top: y, width: w, height: h,
        borderRadius: 32, zIndex: 51, pointerEvents: 'none', overflow: 'hidden',
      }}>
        <GlassSurface
          width={w} height={h} borderRadius={32}
          borderWidth={glassSettings.borderWidth}
          brightness={glassSettings.brightness}
          opacity={glassSettings.opacity}
          blur={glassSettings.blur}
          displace={glassSettings.displace}
          backgroundOpacity={glassSettings.backgroundOpacity}
          saturation={glassSettings.saturation}
          distortionScale={glassSettings.distortionScale}
          redOffset={glassSettings.redOffset}
          greenOffset={glassSettings.greenOffset}
          blueOffset={glassSettings.blueOffset}
          xChannel={glassSettings.xChannel as any}
          yChannel={glassSettings.yChannel as any}
          mixBlendMode={glassSettings.mixBlendMode as any}
        >
          <div />
        </GlassSurface>

          {/* Dark overlay — only on glass, behind content */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `rgba(0,0,0,${glassSettings.darkOverlay})`,
            pointerEvents: 'none', zIndex: 1,
          }} />

          {/* Gradient 60%→0% top→bottom */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* Palette accent glow */}
          {nowPlaying && (
            <div style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at 50% 0%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.06) 0%, transparent 70%)`,
              pointerEvents: 'none', zIndex: 3,
            }} />
          )}

          {/* Drag proximity glow */}
          {dragProximity > 0 && (
            <div style={{
              position: 'absolute', inset: -20 - dragProximity * 40,
              borderRadius: '50%',
              background: `radial-gradient(circle at ${(dragCursorX - x) / w * 100}% 50%, rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${dragProximity * 0.08}) 0%, transparent 70%)`,
              pointerEvents: 'none', zIndex: 4,
            }} />
          )}
        </div>

      {/* Layer: content (z-index 52, on top of glass) */}
      <div id={containerId} style={{
        position: 'fixed', left: x, top: y, width: w, height: h,
        borderRadius: 32, zIndex: 52, pointerEvents: 'none', overflow: 'hidden',
      }}>
        <div
          onMouseEnter={() => { if (islandState === 'playing') setHovered(true) }}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'absolute', inset: 0, borderRadius: 32, overflow: 'hidden',
            pointerEvents: 'auto', opacity: contentOpacity,
            transition: 'opacity 0.15s ease',
          }}
        >
          {/* ── Idle state ── */}
          {islandState === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.4)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', letterSpacing: 0.3 }}>Drop your music.</span>
            </div>
          )}

          {/* ── Editing playlist state ── */}
          {islandState === 'editing' && editingPlaylist && (
            <EditPlaylistPanel
              playlist={editingPlaylist}
              onSave={(name: string) => {
                playlistsApi.update(editingPlaylist.id, { name }).then(() => {
                  updatePlaylist(editingPlaylist.id, { name })
                }).catch(console.error)
              }}
              onDelete={() => {
                playlistsApi.delete(editingPlaylist.id).then(() => {
                  removePlaylist(editingPlaylist.id)
                  setEditingPlaylist(null)
                  setIslandState('idle')
                }).catch(console.error)
              }}
              onDone={() => { setEditingPlaylist(null); setIslandState('idle') }}
              playlistId={editingPlaylist.id}
            />
          )}

          {/* ── Compact playing ── */}
          {islandState === 'playing' && nowPlaying && isCompact && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '12px 20px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                {nowPlaying.artwork && (
                  <img src={nowPlaying.artwork} alt="" style={{ width: 50, height: 50, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                        {(nowPlaying.title || 'Unknown').slice(0, 32)}
                      </div>
                      <SourceBadge source={nowPlaying.source} />
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(nowPlaying.artist || '').slice(0, 38)}
                    </div>
                  </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <WaveBar height={28} borderRadius={12} palette={Array.isArray(palette) ? palette : null} />
              </div>
            </div>
          )}

          {/* ── Expanded / Lyrics ── */}
          {islandState === 'playing' && nowPlaying && !isCompact && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px 6px', flexShrink: 0 }}>
                {nowPlaying.artwork && (
                  <img src={nowPlaying.artwork} alt="" style={{
                    width: lyricsVisible ? 56 : 80, height: lyricsVisible ? 56 : 80,
                    borderRadius: lyricsVisible ? 10 : 14, objectFit: 'cover', flexShrink: 0,
                    boxShadow: `0 4px 20px rgba(0,0,0,0.5)`,
                    transition: 'all 0.2s ease',
                  }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: lyricsVisible ? 16 : 18, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                    {(nowPlaying.title || 'Unknown').slice(0, 35)}
                  </div>
                  <div style={{ fontSize: lyricsVisible ? 12 : 13, color: 'rgba(255,255,255,0.5)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(nowPlaying.artist || 'Unknown Artist').slice(0, 40)}
                  </div>
                </div>
              </div>

              {/* Phase 5: lyrics glow uses palette accent */}
              {lyricsVisible && parsedLines.length > 0 && (
                <div style={{ flex: 1, overflow: 'hidden', padding: '4px 40px', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                  <style>{`@keyframes lyricIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                  <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.15)', textAlign: 'center', lineHeight: 1.3, opacity: 0.5 }}>
                    {(parsedLines as any)[Math.max(0, currentIndex - 1)]?.text}
                  </div>
                  <div key={currentIndex} style={{ fontSize: 32, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.3, textShadow: `0 0 30px ${accentColor}`, animation: 'lyricIn 0.15s ease-out' }}>
                    {(parsedLines as any)[currentIndex]?.text || '...'}
                  </div>
                  <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.15)', textAlign: 'center', lineHeight: 1.3, opacity: 0.5 }}>
                    {(parsedLines as any)[Math.min(parsedLines.length - 1, currentIndex + 1)]?.text}
                  </div>
                </div>
              )}

              <div style={{ padding: '0 10px 6px', flexShrink: 0, pointerEvents: 'auto' }}>
                <WaveBar height={44} borderRadius={14} palette={Array.isArray(palette) ? palette : null} />
              </div>

              <div style={{ padding: '0 14px 12px', flexShrink: 0, pointerEvents: 'auto' }}>
                <div style={{
                  position: 'relative', background: 'rgba(15,15,20,0.6)',
                  backdropFilter: 'blur(8px) saturate(1.2)', WebkitBackdropFilter: 'blur(8px) saturate(1.2)',
                  borderRadius: 20, padding: '8px 16px',
                  border: `1px solid rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.1)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button onClick={goPrev} style={{ ...glassBtn }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                    </button>
                    <button onClick={togglePlay} style={{ ...glassBtn, width: 32, height: 32, borderRadius: '50%', background: accentColor + '30' }}>
                      {isPlaying
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button onClick={goNext} style={{ ...glassBtn }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 18l8.5-6L6 6v12zm2 0V6l6.5 6L8 18zm8-12h2v12h-2z" /></svg>
                    </button>
                    <button onClick={() => setLyricsVisible(!lyricsVisible)} style={{ ...glassBtn, opacity: lyricsVisible ? 0.8 : 0.4 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 15h8v1.5H8V15zm0-3h8v1.5H8V12zm0-3h5v1.5H8V9z" /></svg>
                    </button>
                    
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}


function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'tag') return null
  const colors: Record<string, string> = {
    filename: '#f59e0b',
    folder: '#8b5cf6',
    musicbrainz: '#06b6d4',
  }
  return (
    <div style={{
      fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
      padding: '1px 5px', borderRadius: 4,
      background: (colors[source] || '#888') + '30',
      color: colors[source] || '#888',
      border: `1px solid ${(colors[source] || '#888')}40`,
      lineHeight: '14px', flexShrink: 0,
    }}>
      {source === 'filename' ? 'FILE' : source === 'folder' ? 'FOLDER' : source === 'musicbrainz' ? 'MB' : source}
    </div>
  )
}
