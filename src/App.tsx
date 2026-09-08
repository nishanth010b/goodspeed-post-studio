import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { ControlBar } from '@/components/ControlBar'
import { clearMedia, loadFrame, loadSavedMedia, saveFrame, saveMedia } from '@/lib/persist'
import { cn, debounce } from '@/lib/utils'
import { IMAGE_TYPES, VIDEO_TYPES, isSupported, loadMedia, type LoadedMedia } from '@/render/media'
import { DEFAULT_FRAME, drawFrame, frameSize, sampleEdgeColor, type Frame } from '@/render/post'
import { extensionFor, pickMimeType, recordFrame } from '@/render/record'

const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES]
const MAX_BYTES = 500 * 1024 * 1024

// Capped so a 3x export of a huge retina capture can't blow past the browser
// canvas limit (~16k px) or hang the tab.
const MAX_EXPORT_PX = 12000

const persistFrame = debounce((frame: Frame) => void saveFrame(frame), 250)

export default function App() {
  const [frame, setFrame] = useState<Frame>(DEFAULT_FRAME)
  const [media, setMedia] = useState<LoadedMedia | null>(null)
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Guards against an older, slower decode landing after a newer one.
  const loadVersion = useRef(0)
  // The export drives the video itself; the preview loop stands down.
  const recording = useRef(false)

  const size = frameSize(frame, media)
  const canRecord = pickMimeType() !== null

  const update = useCallback(<K extends keyof Frame>(key: K, value: Frame[K]) => {
    setFrame((f) => {
      const next = { ...f, [key]: value }
      persistFrame(next)
      return next
    })
  }, [])

  const accept = useCallback(async (file: File, opts?: { persist?: boolean }) => {
    const version = ++loadVersion.current
    setError('')
    if (!isSupported(file.type)) {
      setError('That file type won’t work — use a PNG, JPG, WebP or AVIF image, or an MP4, MOV or WebM video.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is over 500 MB. Export a smaller version and try again.')
      return
    }
    try {
      const loaded = await loadMedia(file)
      if (version !== loadVersion.current) {
        loaded.release()
        return
      }
      setMedia(loaded)
      setFilename(file.name)
      if (loaded.kind === 'video') void loaded.video?.play().catch(() => {})
      if (opts?.persist !== false) void saveMedia(file, file.name)
    } catch {
      if (version === loadVersion.current) setError('That file couldn’t be read. Try re-exporting it.')
    }
  }, [])

  // Restore whatever was open last, then start rendering.
  useEffect(() => {
    void (async () => {
      const [savedFrame, saved] = await Promise.all([loadFrame(), loadSavedMedia()])
      setFrame(savedFrame)
      if (saved) {
        const file = new File([saved.blob], saved.name, { type: saved.blob.type })
        await accept(file, { persist: false })
      }
      setReady(true)
    })()
  }, [accept])

  // Paste straight from a screenshot tool — the fastest path in practice.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const file = Array.from(e.clipboardData?.files ?? []).find(
        (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
      )
      if (file) {
        e.preventDefault()
        void accept(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept])

  // Preview renders at 1x through the same function as the export. A video
  // needs a frame loop; a still only redraws when something changes.
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    if (media?.kind !== 'video') {
      drawFrame(canvas, frame, media, 1)
      return
    }
    let raf = 0
    const tick = () => {
      if (!recording.current) drawFrame(canvas, frame, media, 1)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [frame, media])

  // Owns the lifetime of the decoded bitmap / video element: whenever `media`
  // is replaced or the app unmounts, the previous one is released here.
  useEffect(() => () => media?.release(), [media])

  function save(blob: Blob, ext: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stem = filename.replace(/\.[^.]+$/, '') || 'post'
    a.href = url
    a.download = `goodspeed-${stem}-${size.w * frame.exportScale}w.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function exportFrame() {
    if (!media || busy) return
    setBusy(true)
    setError('')
    const scale = Math.min(frame.exportScale, MAX_EXPORT_PX / Math.max(size.w, size.h))
    try {
      if (media.kind === 'video') {
        recording.current = true
        const { blob, mime } = await recordFrame(frame, media, scale, setProgress)
        save(blob, extensionFor(mime))
      } else {
        const out = document.createElement('canvas')
        drawFrame(out, frame, media, scale)
        const blob = await new Promise<Blob>((resolve, reject) => {
          out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
        })
        save(blob, 'png')
      }
    } catch {
      setError(
        media.kind === 'video'
          ? 'Recording didn’t finish. Try a lower export scale.'
          : 'Export didn’t finish. Try a lower export scale.',
      )
    } finally {
      recording.current = false
      setProgress(0)
      setBusy(false)
      if (media.kind === 'video') void media.video?.play().catch(() => {})
    }
  }

  async function copy() {
    if (!media || media.kind !== 'image' || busy) return
    setBusy(true)
    setError('')
    try {
      const scale = Math.min(frame.exportScale, MAX_EXPORT_PX / Math.max(size.w, size.h))
      const out = document.createElement('canvas')
      drawFrame(out, frame, media, scale)
      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Copying didn’t work in this browser — use Download instead.')
    } finally {
      setBusy(false)
    }
  }

  function remove() {
    loadVersion.current++
    setMedia(null)
    setFilename('')
    void clearMedia()
  }

  function reset() {
    setFrame(DEFAULT_FRAME)
    void saveFrame(DEFAULT_FRAME)
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <span className="font-heading text-sm font-semibold tracking-tight">goodspeed</span>
        <span className="h-3.5 w-px bg-border" />
        <span className="text-sm text-muted-foreground">Post Studio</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Files stay in this browser &middot; nothing is uploaded
        </span>
      </header>

      <main
        className="relative flex min-h-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) void accept(file)
        }}
      >
        {/* Workspace */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-8 pr-0">
          <button
            type="button"
            onClick={() => !media && fileRef.current?.click()}
            aria-label={media ? 'Post preview' : 'Add a screenshot or video'}
            className={cn(
              // No corner rounding here: the export has square corners, so the
              // preview shouldn't imply otherwise.
              'relative block max-h-full shrink-0 overflow-hidden bg-transparent p-0 ring-1 ring-border transition-opacity',
              !ready && 'opacity-0',
              !media && 'cursor-pointer',
            )}
            style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, ${size.w}px)` }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />
          </button>
        </div>

        {/* Floating control bar */}
        <div className="pointer-events-none flex shrink-0 items-stretch p-4">
          <ControlBar
            frame={frame}
            onChange={update}
            kind={media?.kind ?? null}
            filename={filename}
            size={size}
            busy={busy}
            progress={progress}
            copied={copied}
            canRecord={canRecord}
            onPick={() => fileRef.current?.click()}
            onRemove={remove}
            onMatch={() => media && update('background', sampleEdgeColor(media))}
            onReset={reset}
            onExport={() => void exportFrame()}
            onCopy={() => void copy()}
          />
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-ring px-6 py-4 font-heading text-sm">
              <Upload size={16} /> Drop the screenshot or video
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="absolute bottom-5 left-1/2 z-30 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border border-destructive/40 bg-card px-4 py-2.5 text-xs shadow-lg"
          >
            {error}
            <button
              onClick={() => setError('')}
              aria-label="Dismiss"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT.join(',')}
        className="sr-only"
        aria-label="Choose a screenshot or video"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void accept(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
