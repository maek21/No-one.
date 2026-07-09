import { useEffect, useRef } from 'react'
import { AmbientEngine } from '../../renderer/AmbientEngine'
import { useAppStore } from '../../store'

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<AmbientEngine | null>(null)
  const palette = useAppStore((s: any) => s.palette)
  const audioAnalysis = useAppStore((s: any) => s.audioAnalysis)
  const nowPlaying = useAppStore((s: any) => s.nowPlaying)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new AmbientEngine(canvas)
    engineRef.current = engine

    engine.resize()
    engine.start()

    const handleResize = () => engine.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      engine.destroy()
    }
  }, [])

  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return

    const p = palette || (nowPlaying?.palette as any)
    if (!p || !nowPlaying) {
      eng.setPalette([])
      return
    }

    const hex = Array.isArray(p) ? p[0] : (p.accent || p.primary || null)
    if (hex) {
      const clean = hex.replace('#', '')
      eng.setPalette([
        parseInt(clean.slice(0, 2), 16) || 0,
        parseInt(clean.slice(2, 4), 16) || 0,
        parseInt(clean.slice(4, 6), 16) || 0,
      ])
    }
  }, [palette, nowPlaying])

  useEffect(() => {
    if (engineRef.current && audioAnalysis) {
      engineRef.current.setAudio(audioAnalysis.bass, audioAnalysis.energy)
    }
  }, [audioAnalysis])

  return <canvas ref={canvasRef} className="ambient-canvas" />
}