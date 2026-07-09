export interface RGB {
  r: number
  g: number
  b: number
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

export function paletteToArray(palette: { primary: string; secondary: string; accent: string; shadow: string; highlight: string; ambient: string }): number[] {
  const colors = ['primary', 'secondary', 'accent', 'shadow', 'highlight', 'ambient'] as const
  const arr: number[] = []
  for (const key of colors) {
    const rgb = hexToRGB(palette[key])
    arr.push(rgb.r, rgb.g, rgb.b)
  }
  return arr
}
