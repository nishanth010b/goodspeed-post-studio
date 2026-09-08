// Seeded monochrome grain, matching the noise baked into the hx brand
// gradient assets (measured: sigma ~4/255, r-g-b correlation 1.0 -> mono).
// Seeded so re-exporting an unchanged thumbnail is pixel-identical.

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TILE = 256
const tileCache = new Map<number, HTMLCanvasElement>()

// White/black speckles with alpha proportional to |delta| approximate
// symmetric +-delta noise over mid-tone backgrounds; exact symmetry doesn't
// matter at these amplitudes.
export function getNoiseTile(sigma: number): HTMLCanvasElement {
  const key = Math.round(sigma * 100)
  let tile = tileCache.get(key)
  if (tile) return tile
  tile = document.createElement('canvas')
  tile.width = TILE
  tile.height = TILE
  const ctx = tile.getContext('2d')!
  const img = ctx.createImageData(TILE, TILE)
  const rnd = mulberry32(0x9e3779b9)
  for (let i = 0; i < TILE * TILE; i++) {
    // Box-Muller gaussian
    const u = Math.max(rnd(), 1e-9)
    const v = rnd()
    const delta = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma
    const o = i * 4
    const white = delta > 0
    img.data[o] = img.data[o + 1] = img.data[o + 2] = white ? 255 : 0
    img.data[o + 3] = Math.min(255, Math.round((Math.abs(delta) / 127) * 255))
  }
  ctx.putImageData(img, 0, 0)
  tileCache.set(key, tile)
  return tile
}
