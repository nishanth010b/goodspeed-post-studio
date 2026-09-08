// Every post frame in Figma is the same recipe: the media sitting on a flat
// ground, centred, with whitespace around it. The canvas hugs the media unless
// a fixed aspect ratio is chosen, in which case the short axis grows to fill it
// — nothing is ever cropped.

export type Media = {
  source: CanvasImageSource
  /** Intrinsic pixel size (videoWidth/videoHeight for a video). */
  width: number
  height: number
  kind: 'image' | 'video'
}

export type RatioId = 'auto' | '1:1' | '4:3' | '3:2' | '16:9' | '4:5' | '9:16'

export type Frame = {
  /** Ground colour behind the media. */
  background: string
  /** Minimum whitespace around the media, in output px. 0 = full bleed. */
  padding: number
  /** Media scale, 1 = native size. */
  zoom: number
  /** Corner radius on the media itself, in output px. */
  radius: number
  /** Soft drop shadow under the media. */
  shadow: boolean
  /** 'auto' hugs the media; anything else locks the canvas shape. */
  ratio: RatioId
  /** Export multiplier applied on top of everything. */
  exportScale: number
}

export const RATIOS: { id: RatioId; label: string; value: number | null }[] = [
  { id: 'auto', label: 'Auto — hug the media', value: null },
  { id: '1:1', label: '1:1 — square', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
  { id: '16:9', label: '16:9 — landscape', value: 16 / 9 },
  { id: '4:5', label: '4:5 — portrait', value: 4 / 5 },
  { id: '9:16', label: '9:16 — vertical', value: 9 / 16 },
]

// Measured off the Figma post frames.
export const BACKGROUNDS: { name: string; value: string }[] = [
  { name: 'Off-white', value: '#F0F0EF' },
  { name: 'Warm white', value: '#F3F1ED' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
]

export const PADDING_PRESETS = [0, 40, 80, 100]

export const DEFAULT_FRAME: Frame = {
  background: '#F0F0EF',
  padding: 100,
  zoom: 1,
  radius: 0,
  shadow: false,
  ratio: 'auto',
  exportScale: 2,
}

function ratioValue(id: RatioId): number | null {
  return RATIOS.find((r) => r.id === id)?.value ?? null
}

// H.264 wants even dimensions, and even sizes keep the centred media on whole
// pixels — so every frame is sized even, image or video.
function even(n: number): number {
  return Math.round(n / 2) * 2
}

/** Output pixel size of a frame, before the export multiplier. */
export function frameSize(frame: Frame, media: Media | null) {
  // With nothing loaded yet, stand in a 16:9 plate so the preview has a shape.
  const mw = media ? media.width * frame.zoom : 960
  const mh = media ? media.height * frame.zoom : 540
  let w = mw + frame.padding * 2
  let h = mh + frame.padding * 2
  const r = ratioValue(frame.ratio)
  if (r) {
    // Grow the short axis only: the media keeps its own proportions and its
    // whitespace never drops below the padding.
    if (w / h < r) w = h * r
    else h = w / r
  }
  return { w: even(w), h: even(h) }
}

/**
 * Draws the frame at `S` times its output size. The preview and the export run
 * through this same function, so what they see is what they get.
 */
export function drawFrame(
  canvas: HTMLCanvasElement,
  frame: Frame,
  media: Media | null,
  S = 1,
): { w: number; h: number } {
  const size = frameSize(frame, media)
  const w = even(size.w * S)
  const h = even(size.h * S)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  // Default 'low' filtering keeps too much high-frequency detail when a retina
  // capture is scaled down.
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = frame.background
  ctx.fillRect(0, 0, w, h)

  if (media) {
    const dw = media.width * frame.zoom * S
    const dh = media.height * frame.zoom * S
    const x = (w - dw) / 2
    const y = (h - dh) / 2
    const r = Math.min(frame.radius * S, dw / 2, dh / 2)

    ctx.save()
    if (frame.shadow) {
      // Barely-there lift: it should read as depth, not as a card.
      ctx.shadowColor = 'rgba(36,47,40,0.07)'
      ctx.shadowBlur = 24 * S
      ctx.shadowOffsetY = 6 * S
      ctx.fillStyle = frame.background
      ctx.beginPath()
      ctx.roundRect(x, y, dw, dh, r)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    if (r > 0) {
      ctx.beginPath()
      ctx.roundRect(x, y, dw, dh, r)
      ctx.clip()
    }
    ctx.drawImage(media.source, x, y, dw, dh)
    ctx.restore()
  } else {
    drawPlaceholder(ctx, w, h, frame, S)
  }

  return { w, h }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, frame: Frame, S: number) {
  const dark = isDark(frame.background)
  const x = Math.max(frame.padding, 40) * S
  const y = Math.max(frame.padding, 40) * S
  ctx.save()
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(36,47,40,0.24)'
  ctx.lineWidth = 2 * S
  ctx.setLineDash([10 * S, 10 * S])
  ctx.beginPath()
  ctx.roundRect(x, y, w - x * 2, h - y * 2, 12 * S)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(36,47,40,0.5)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `400 ${20 * S}px 'Inter Variable', system-ui, sans-serif`
  ctx.fillText('Drop a screenshot or video, or paste it', w / 2, h / 2)
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
 * Averages the media's outer ring so the frame can blend into whatever the
 * designer's mockup already sits on — one click instead of eyedropping.
 */
export function sampleEdgeColor(media: Media): string {
  const c = document.createElement('canvas')
  const N = 64
  c.width = N
  c.height = N
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(media.source, 0, 0, N, N)
  const { data } = ctx.getImageData(0, 0, N, N)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Outer two-pixel ring of the downscale ~= the media's border.
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
