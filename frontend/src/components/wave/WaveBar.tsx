import { useRef, useLayoutEffect, useMemo } from 'react'
import { audioPlayer } from '../../services/AudioPlayer'
import { useAppStore } from '../../store'

const FALLBACK = ['#f97316', '#7c3aed', '#06b6d4']

interface WaveBarProps {
  height?: number
  borderRadius?: number
  palette?: string[] | null
}

export function WaveBar({ height = 48, borderRadius = 16, palette: paletteProp = null }: WaveBarProps) {
  const nowPlaying = useAppStore((s) => s.nowPlaying)
  const audioAnalysis = useAppStore((s) => s.audioAnalysis)
  const storePalette = useAppStore((s) => s.palette)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const palette = paletteProp || (Array.isArray(storePalette) ? storePalette : null)

  const colors = useMemo(() =>
    (palette && palette.some(Boolean)) ? palette.filter(Boolean) : FALLBACK,
    [palette]
  )

  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf: number

    const draw = () => {
      const W = cv.clientWidth
      const H = cv.clientHeight
      if (W < 1 || H < 1) { raf = requestAnimationFrame(draw); return }

      const dpr = window.devicePixelRatio || 1
      const bw = Math.round(W * dpr)
      const bh = Math.round(H * dpr)
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw
        cv.height = bh
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      const audio = audioPlayer.audio
      const dur = audio?.duration || 0
      const cur = audio?.currentTime || 0
      const prog = dur > 0 ? Math.min(cur / dur, 1) : 0
      const t = performance.now() * 0.001
      const bass = audioAnalysis?.bass || 0
      const energy = audioAnalysis?.energy || 0

      ctx.clearRect(0, 0, W, H)

      const progX = Math.max(0, Math.min(prog, 1)) * W
      const waveAmp = 3 + bass * 10
      const waveFreq = 1.5 + energy * 2

      // Clip to rounded rect
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(0, 0, W, H, Math.min(borderRadius, H / 2))
      ctx.clip()

      for (let i = 0; i < Math.min(colors.length, 3); i++) {
        const fi = colors.length > 1 ? i / (colors.length - 1) : 0.5
        const phase = fi * 2.5

        ctx.beginPath()
        ctx.moveTo(0, H)

        for (let s = 0; s <= progX; s++) {
          const nx = (s / W) * 2 - 1
          const wave = Math.sin(nx * waveFreq + t * 1.2 + phase) * waveAmp
                     + Math.sin(nx * waveFreq * 2.3 - t * 0.9 + phase * 1.7) * waveAmp * 0.4
          const y = H / 2 + wave
          s === 0 ? ctx.moveTo(s, y) : ctx.lineTo(s, y)
        }

        ctx.lineTo(progX, H)
        ctx.closePath()

        ctx.fillStyle = colors[i]
        ctx.globalAlpha = 0.35 + (1 - i / colors.length) * 0.3
        ctx.fill()
      }

      // Liquid surface glow lines
      for (let i = 0; i < Math.min(colors.length, 3); i++) {
        const fi = colors.length > 1 ? i / (colors.length - 1) : 0.5
        const phase = fi * 2.5

        ctx.beginPath()
        for (let s = 0; s <= progX; s++) {
          const nx = (s / W) * 2 - 1
          const wave = Math.sin(nx * waveFreq + t * 1.2 + phase) * waveAmp
                     + Math.sin(nx * waveFreq * 2.3 - t * 0.9 + phase * 1.7) * waveAmp * 0.4
          const y = H / 2 + wave
          s === 0 ? ctx.moveTo(s, y) : ctx.lineTo(s, y)
        }

        ctx.strokeStyle = colors[i]
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.7
        ctx.shadowColor = colors[i]
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Progress dot
      if (prog > 0 && prog < 1) {
        const dotY = H / 2 + (Math.sin(prog * 20 + t * 1.2) * waveAmp * 0.3)
        ctx.beginPath()
        ctx.arc(progX, dotY, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.shadowColor = colors[0] || '#fff'
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.shadowBlur = 0
      }

      ctx.restore()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [colors, borderRadius])

  const handleSeek = (e: React.MouseEvent) => {
    const a = audioPlayer.audio
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    audioPlayer.seek(frac * a.duration)
  }

  if (!nowPlaying) return null

  return (
    <div style={{ width: '100%', height }}>
      <div onClick={handleSeek} style={{ width: '100%', height: '100%', borderRadius, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

export default WaveBar
