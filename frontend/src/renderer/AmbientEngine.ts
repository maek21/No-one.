export class AmbientEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null = null
  private animationId: number | null = null
  private isRunning = false
  private time = 0
  private _palette: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
  private _hasColor = false
  private _bass = 0
  private _energy = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  setPalette(colors: number[]) {
    if (colors && colors.length >= 3) {
      this._palette = { r: colors[0], g: colors[1], b: colors[2] }
      this._hasColor = true
    } else {
      this._hasColor = false
    }
  }

  setAudio(bass: number, energy: number) {
    this._bass = bass
    this._energy = energy
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.render()
  }

  stop() {
    this.isRunning = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  destroy() {
    this.stop()
    this.ctx = null
  }

  private render = () => {
    if (!this.isRunning) return

    this.time += 0.016
    const ctx = this.canvas.getContext('2d')
    if (!ctx) { this.isRunning = false; return }
    this.ctx = ctx

    const w = window.innerWidth
    const h = window.innerHeight

    ctx.clearRect(0, 0, w, h)

    if (!this._hasColor) {
      this.animationId = requestAnimationFrame(this.render)
      return
    }

    const { r, g, b } = this._palette
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 0.12)
    const pulse = 0.4 + 0.6 * (this._bass * 0.6 + this._energy * 0.4)
    const alpha = 0.05 * breathe * pulse

    const gradient = ctx.createRadialGradient(w / 2, h * 0.65, 0, w / 2, h * 0.65, Math.max(w, h) * 0.55)
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)
    gradient.addColorStop(0.3, `rgba(${r},${g},${b},${alpha * 0.6})`)
    gradient.addColorStop(1, `rgba(0,0,0,0)`)

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    this.animationId = requestAnimationFrame(this.render)
  }
}