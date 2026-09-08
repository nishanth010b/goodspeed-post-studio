import { get, set, del } from 'idb-keyval'
import { DEFAULT_FRAME, type Frame } from '@/render/post'

// No accounts and no backend: the screenshot and its settings live in this
// browser only, so a refresh or a closed tab doesn't lose the work in progress.

const FRAME_KEY = 'gs-post-frame'
const SHOT_KEY = 'gs-post-shot'

type SavedShot = { blob: Blob; name: string }

export async function loadFrame(): Promise<Frame> {
  const saved = await get<Partial<Frame>>(FRAME_KEY).catch(() => undefined)
  // Merge over defaults so a frame saved by an older build still opens.
  return { ...DEFAULT_FRAME, ...saved }
}

export async function saveFrame(frame: Frame): Promise<void> {
  await set(FRAME_KEY, frame).catch(() => {})
}

export async function loadShot(): Promise<SavedShot | undefined> {
  return await get<SavedShot>(SHOT_KEY).catch(() => undefined)
}

export async function saveShot(blob: Blob, name: string): Promise<void> {
  await set(SHOT_KEY, { blob, name } satisfies SavedShot).catch(() => {})
}

export async function clearShot(): Promise<void> {
  await del(SHOT_KEY).catch(() => {})
}
