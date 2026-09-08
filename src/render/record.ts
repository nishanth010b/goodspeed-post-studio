import { drawFrame, type Frame } from './post'
import type { LoadedMedia } from './media'

// Exporting a framed video means re-recording it: the video plays once through
// while every frame is composited onto a canvas, and MediaRecorder encodes the
// canvas stream. That runs in real time — a 30s clip takes 30s — so the caller
// reports progress.

// MP4/H.264 is what LinkedIn and X want; WebM is the fallback where Chrome
// wasn't built with the MP4 encoder.
const CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
]

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export function extensionFor(mime: string): string {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm'
}

const FPS = 30

/** Roughly 0.12 bits per pixel per frame, clamped to something sane. */
function bitrateFor(w: number, h: number): number {
  return Math.min(40_000_000, Math.max(4_000_000, Math.round(w * h * FPS * 0.12)))
}

export async function recordFrame(
  frame: Frame,
  media: LoadedMedia,
  scale: number,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; mime: string }> {
  const video = media.video
  if (!video) throw new Error('not a video')
  const mime = pickMimeType()
  if (!mime) throw new Error('recording unsupported')

  const canvas = document.createElement('canvas')
  const { w, h } = drawFrame(canvas, frame, media, scale)

  const stream = canvas.captureStream(FPS)
  // Carry the clip's own audio through, when it has any. captureStream on a
  // media element isn't in lib.dom yet.
  const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream
  for (const track of capture?.call(video).getAudioTracks() ?? []) stream.addTrack(track)

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitrateFor(w, h),
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('recording failed'))
  })

  const wasLooping = video.loop
  const wasMuted = video.muted
  video.loop = false
  video.muted = true
  video.pause()
  video.currentTime = 0
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2 && video.currentTime === 0) resolve()
    else video.onseeked = () => resolve()
  })

  let raf = 0
  const tick = () => {
    drawFrame(canvas, frame, media, scale)
    if (video.duration) onProgress(Math.min(1, video.currentTime / video.duration))
    raf = requestAnimationFrame(tick)
  }

  try {
    recorder.start(1000)
    tick()
    await video.play()
    await new Promise<void>((resolve, reject) => {
      video.onended = () => resolve()
      video.onerror = () => reject(new Error('playback failed'))
    })
    // One last composite so the closing frame always lands in the file.
    drawFrame(canvas, frame, media, scale)
    recorder.stop()
    await finished
  } finally {
    cancelAnimationFrame(raf)
    video.onended = null
    video.onseeked = null
    video.onerror = null
    for (const track of stream.getTracks()) track.stop()
    video.loop = wasLooping
    video.muted = wasMuted
    video.currentTime = 0
    onProgress(0)
  }

  return { blob: new Blob(chunks, { type: mime }), mime }
}
