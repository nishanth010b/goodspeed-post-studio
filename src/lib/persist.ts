import { get, set, del } from 'idb-keyval'
import { DEFAULT_FRAME, type Frame } from '@/render/post'

// No accounts and no backend: the file and its settings live in this browser
// only, so a refresh or a closed tab doesn't lose the work in progress.

const FRAME_KEY = 'gs-post-frame'
const MEDIA_KEY = 'gs-post-media'

type SavedMedia = { blob: Blob; name: string }

export async function loadFrame(): Promise<Frame> {
  const saved = await get<Partial<Frame>>(FRAME_KEY).catch(() => undefined)
  // Merge over defaults so a frame saved by an older build still opens.
  return { ...DEFAULT_FRAME, ...saved }
}

export async function saveFrame(frame: Frame): Promise<void> {
  await set(FRAME_KEY, frame).catch(() => {})
}

export async function loadSavedMedia(): Promise<SavedMedia | undefined> {
  return await get<SavedMedia>(MEDIA_KEY).catch(() => undefined)
}

export async function saveMedia(blob: Blob, name: string): Promise<void> {
  await set(MEDIA_KEY, { blob, name } satisfies SavedMedia).catch(() => {})
}

export async function clearMedia(): Promise<void> {
  await del(MEDIA_KEY).catch(() => {})
}
