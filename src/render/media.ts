import type { Media } from './post'

// A loaded file, plus whatever the frame needs to draw and release it. Videos
// keep their element around: the preview draws its current frame, and the
// export records it playing.
export type LoadedMedia = Media & {
  /** The <video> element, when kind === 'video'. */
  video?: HTMLVideoElement
  release: () => void
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export function isSupported(type: string): boolean {
  return IMAGE_TYPES.includes(type) || VIDEO_TYPES.includes(type)
}

export async function loadMedia(file: File): Promise<LoadedMedia> {
  if (VIDEO_TYPES.includes(file.type)) return await loadVideo(file)
  const bitmap = await createImageBitmap(file)
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    kind: 'image',
    release: () => bitmap.close(),
  }
}

async function loadVideo(file: File): Promise<LoadedMedia> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.loop = true
  video.playsInline = true
  // Needed for captureStream() on export, and it keeps seeking cheap.
  video.preload = 'auto'
  // A fully detached element doesn't reliably decode frames, so park it
  // off-screen rather than out of the document. Not display:none, which stops
  // rendering altogether.
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.append(video)
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('video decode failed'))
    })
  } catch (e) {
    video.remove()
    URL.revokeObjectURL(url)
    throw e
  }
  return {
    source: video,
    width: video.videoWidth,
    height: video.videoHeight,
    kind: 'video',
    video,
    release: () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      URL.revokeObjectURL(url)
    },
  }
}
