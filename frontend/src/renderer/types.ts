export interface Palette {
  primary: string
  secondary: string
  accent: string
  shadow: string
  highlight: string
  ambient: string
}

export interface RGB {
  r: number
  g: number
  b: number
}

export interface GradientField {
  color: RGB
  centerX: number
  centerY: number
  scale: number
  speed: number
  phase: number
}

export interface BlobUniforms {
  time: number
  resolution: [number, number]
  palette: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]
  blobCenter: [number, number]
  blobRadius: number
  blobIntensity: number
  audioBass: number
  audioMid: number
  audioTreble: number
  audioEnergy: number
}

export interface GradientUniforms {
  time: number
  resolution: [number, number]
  fields: GradientField[]
}

export const DEFAULT_PALETTE: Palette = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#0f3460',
  shadow: '#0a0a0a',
  highlight: '#e94560',
  ambient: '#533483',
}

export function hexToRGB(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { r: 1, g: 0, b: 0 }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  }
}

export function paletteToArray(palette: Palette): number[] {
  const colors = ['primary', 'secondary', 'accent', 'shadow', 'highlight', 'ambient'] as const
  const arr: number[] = []
  for (const key of colors) {
    const rgb = hexToRGB(palette[key])
    arr.push(rgb.r, rgb.g, rgb.b)
  }
  return arr
}
