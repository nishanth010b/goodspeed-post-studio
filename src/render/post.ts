import { getNoiseTile } from './noise'

// Every post frame in Figma is the screenshot sitting on a flat ground with a
// noise overlay on top. The canvas hugs the screenshot: size = screenshot
// (scaled) + padding on all sides. Nothing is a fixed format, so a wide
// dashboard grab and a tall phone grab both come out looking deliberate.

export type Frame = {
  /** Ground colour behind the screenshot. */
  background: string
  /** Whitespace around the screenshot, in output px. 0 = full bleed. */
  padding: number
  /** Screenshot scale, 1 = native size. */
  zoom: number
  /** Corner radius on the screenshot itself, in output px. */
  radius: number
  /** Drop shadow under the screenshot. */
  shadow: boolean
  /** Grain over the whole frame, matching the Goodspeed post texture. */
  noise: boolean
  /** Export multiplier applied on top of everything. */
  exportScale: number
}

export const BACKGROUNDS: { name: string; value: string }[] = [
  // Measured off the Figma post frames.
  { name: 'Off-white', value: '#F0F0EF' },
  { name: 'Warm white', value: '#F3F1ED' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  // Goodspeed brand grounds.
  { name: 'Beige', value: '#F9F2ED' },
  { name: 'Beige 2', value: '#EFEBE1' },
  { name: 'Green', value: '#36493C' },
  { name: 'Deep green', value: '#242F28' },
  { name: 'Lime', value: '#C6DD66' },
  { name: 'Aurora', value: '#D7FF36' },
]

export const PADDING_PRESETS = [0, 40, 80, 100]

// Noise sigma measured off the hx/Goodspeed brand assets: ~4/255, monochrome.
const NOISE_SIGMA = 4
const NOISE_TILE = 256

export const DEFAULT_FRAME: Frame = {
  background: '#F0F0EF',
  padding: 100,
  zoom: 1,
  radius: 0,
  shadow: false,
  noise: true,
  exportScale: 2,
}

/** Output pixel size of a frame, before the export multiplier. */
export function frameSize(frame: Frame, image: { width: number; height: number } | null) {
  // With no screenshot yet, stand in a 16:9 plate so the preview has a shape.
  const w = image ? image.width * frame.zoom : 960
  const h = image ? image.height * frame.zoom : 540
  return { w: Math.round(w + frame.padding * 2), h: Math.round(h + frame.padding * 2) }
}

type Drawable = CanvasImageSource & { width: number; height: number }

/**
 * Draws the frame at `S` times its output size. The preview and the export run
 * through this same function, so what they see is what they get.
 */
export function drawFrame(
  canvas: HTMLCanvasElement,
  frame: Frame,
  image: Drawable | null,
  S = 1,
): { w: number; h: number } {
  const size = frameSize(frame, image)
  const w = Math.round(size.w * S)
  const h = Math.round(size.h * S)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  // Default 'low' filtering keeps too much high-frequency detail when a
  // retina screenshot is scaled down.
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = frame.background
  ctx.fillRect(0, 0, w, h)

  if (image) {
    const x = frame.padding * S
    const y = frame.padding * S
    const iw = w - x * 2
    const ih = h - y * 2
    const r = Math.min(frame.radius * S, iw / 2, ih / 2)

    ctx.save()
    if (frame.shadow) {
      // Green-tinted, per the brand — never black.
      ctx.shadowColor = 'rgba(36,47,40,0.18)'
      ctx.shadowBlur = 40 * S
      ctx.shadowOffsetY = 16 * S
      ctx.fillStyle = frame.background
      roundRect(ctx, x, y, iw, ih, r)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    if (r > 0) {
      roundRect(ctx, x, y, iw, ih, r)
      ctx.clip()
    }
    ctx.drawImage(image, x, y, iw, ih)
    ctx.restore()
  } else {
    drawPlaceholder(ctx, w, h, frame, S)
  }

  if (frame.noise) {
    const tile = getNoiseTile(NOISE_SIGMA)
    const pattern = ctx.createPattern(tile, 'repeat')!
    // Scale the grain with the export so a 1x preview and a 2x export show the
    // same texture rather than the export looking twice as fine.
    const m = new DOMMatrix().scaleSelf(S)
    pattern.setTransform(m)
    ctx.save()
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  return { w, h }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, frame: Frame, S: number) {
  const dark = isDark(frame.background)
  const x = Math.max(frame.padding, 40) * S
  const y = Math.max(frame.padding, 40) * S
  ctx.save()
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(36,47,40,0.24)'
  ctx.lineWidth = 2 * S
  ctx.setLineDash([10 * S, 10 * S])
  roundRect(ctx, x, y, w - x * 2, h - y * 2, 12 * S)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(36,47,40,0.5)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `400 ${20 * S}px 'Inter Variable', system-ui, sans-serif`
  ctx.fillText('Drop a screenshot, or paste it', w / 2, h / 2)
  ctx.restore()
}

/** Relative luminance test, for picking readable text over a chosen ground. */
export function isDark(hex: string): boolean {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.35
}

function lin(c: number) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = s.replace(/./g, (c) => c + c)
  const n = Number.parseInt(s.slice(0, 6).padEnd(6, '0'), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim())
}

export function normalizeHex(hex: string): string {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = s.replace(/./g, (c) => c + c)
  return `#${s.toUpperCase()}`
}

/**
 * Averages the screenshot's outer ring so the frame can blend into whatever
 * the designer's mockup already sits on — one click instead of eyedropping.
 */
export function sampleEdgeColor(image: Drawable): string {
  const c = document.createElement('canvas')
  const N = 64
  c.width = N
  c.height = N
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, N, N)
  const { data } = ctx.getImageData(0, 0, N, N)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Outer two-pixel ring of the downscale ~= the screenshot's border.
      if (x > 1 && x < N - 2 && y > 1 && y < N - 2) continue
      const o = (y * N + x) * 4
      if (data[o + 3] < 128) continue
      r += data[o]
      g += data[o + 1]
      b += data[o + 2]
      n++
    }
  }
  if (!n) return DEFAULT_FRAME.background
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()
}

export { NOISE_TILE }
