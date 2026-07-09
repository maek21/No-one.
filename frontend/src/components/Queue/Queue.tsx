import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import { audioPlayer } from '../../services/AudioPlayer'

export function QueueView() {
  const queue = useAppStore((s) => s.queue)
  const queueIndex = useAppStore((s) => s.queueIndex)
  const removeFromQueue = useAppStore((s) => s.removeFromQueue)
  const clearQueue = useAppStore((s) => s.clearQueue)
  const setQueue = useAppStore((s) => s.setQueue)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const palette = useAppStore((s) => s.palette)
  const accentColor = palette?.accent || '#ffffff'

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const dragNodeRef = useRef<number | null>(null)

  const playTrack = useCallback(async (idx: number) => {
    const t = queue[idx]
    if (!t) return
    setQueue(queue, idx)
    const url = api.getStreamUrl(t.id)
    const ok = await audioPlayer.play(url)
    setIsPlaying(ok)
  }, [queue, setQueue, setIsPlaying])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragNodeRef.current = idx
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setOverIdx(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    const fromIdx = dragNodeRef.current
    if (fromIdx !== null && fromIdx !== toIdx) {
      useAppStore.getState().reorderQueue(fromIdx, toIdx)
    }
    setDragIdx(null)
    setOverIdx(null)
    dragNodeRef.current = null
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
    setOverIdx(null)
    dragNodeRef.current = null
  }, [])

  return (
    <div style={{ padding: '120px 24px 100px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Queue</h2>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '6px 14px', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          >
            Clear
          </button>
        )}
      </div>
      {queue.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Queue is empty — drag tracks here</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {queue.map((track, i) => {
            const isCurrent = i === queueIndex
            const isDragging = dragIdx === i
            const isOver = overIdx === i && dragIdx !== i
            return (
              <div
                key={`${track.id}-${i}`}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                onClick={() => !isCurrent && playTrack(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, cursor: isCurrent ? 'default' : 'pointer',
                  background: isCurrent ? `rgba(255,255,255,0.04)` : 'transparent',
                  border: isOver ? `1px solid ${accentColor}40` : '1px solid transparent',
                  opacity: isDragging ? 0.3 : 1,
                  transition: 'background 0.12s, opacity 0.12s, border 0.12s',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { if (!isCurrent && !isDragging) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = isCurrent ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              >
                <span style={{
                  fontSize: 11, color: isCurrent ? accentColor : 'rgba(255,255,255,0.25)',
                  width: 20, fontWeight: isCurrent ? 600 : 400,
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? accentColor : 'rgba(255,255,255,0.8)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {track.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.artist}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(i) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.2)', fontSize: 16, lineHeight: 1, padding: '0 4px',
                    opacity: isCurrent ? 0.6 : 0.3,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'rgba(255,80,80,0.7)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isCurrent ? '0.6' : '0.3'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
