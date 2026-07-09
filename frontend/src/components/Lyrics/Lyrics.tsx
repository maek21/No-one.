import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../../store'
import { useSyncedLyrics } from '../../hooks/useSyncedLyrics'

export function LyricsView() {
  const nowPlaying = useAppStore((s) => s.nowPlaying)
  const syncedLyricsRaw = useAppStore((s) => s.syncedLyricsRaw)
  const palette = useAppStore((s) => s.palette)
  const scrollDelay = useAppStore((s) => s.lyricsAutoScrollDelay)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastUserScroll = useRef(0)
  const isUserScrolling = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>()

  const { lines, currentIndex } = useSyncedLyrics(syncedLyricsRaw)

  const accentColor = useMemo(() => {
    const p = palette || (nowPlaying?.palette as any)
    if (!p) return '#ffffff'
    return p.accent || p.primary || (Array.isArray(p) ? p[0] : '#ffffff')
  }, [palette, nowPlaying?.palette])

  const doScroll = useCallback(() => {
    if (!scrollRef.current || currentIndex < 0) return
    const el = scrollRef.current.children[currentIndex] as HTMLElement
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  // Scroll to current line with delay after user interaction
  useEffect(() => {
    if (isUserScrolling.current) {
      clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        isUserScrolling.current = false
        doScroll()
      }, scrollDelay)
      return
    }
    const timer = setTimeout(doScroll, 80)
    return () => clearTimeout(timer)
  }, [currentIndex, doScroll, scrollDelay])

  const handleScroll = useCallback(() => {
    lastUserScroll.current = Date.now()
    isUserScrolling.current = true
  }, [])

  if (!nowPlaying) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        Select a track with lyrics
      </div>
    )
  }

  return (
    <div style={{
      padding: '100px 0 80px',
      height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.15)',
        padding: '4px 12px', borderRadius: 6,
        marginBottom: 8,
      }}>
        Auto-scroll: {isUserScrolling.current ? `waiting ${scrollDelay/1000}s` : 'synced'}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'auto', maxWidth: 600, width: '100%',
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '0 24px',
        }}
      >
        {lines.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 14, paddingTop: 40 }}>
            No lyrics found for this track
          </div>
        ) : (
          lines.map((line: any, i: number) => {
            const isCurrent = i === currentIndex
            const isPast = i < currentIndex
            return (
              <div key={i} style={{
                fontSize: isCurrent ? 22 : isPast ? 14 : 14,
                fontWeight: isCurrent ? 700 : 400,
                color: isCurrent ? accentColor : isPast ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)',
                textAlign: 'center',
                lineHeight: 1.4,
                padding: '4px 0',
                transition: 'all 0.2s ease',
                textShadow: isCurrent ? `0 0 20px ${accentColor}40` : 'none',
              }}>
                {line.text || '‎'}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}