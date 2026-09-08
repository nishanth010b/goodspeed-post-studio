import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { ControlBar } from '@/components/ControlBar'
import { clearShot, loadFrame, loadShot, saveFrame, saveShot } from '@/lib/persist'
import { cn, debounce } from '@/lib/utils'
import { DEFAULT_FRAME, drawFrame, frameSize, sampleEdgeColor, type Frame } from '@/render/post'

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
const MAX_BYTES = 40 * 1024 * 1024

// The export is capped so a 3x export of a huge retina grab can't blow past
// the browser canvas limit (~16k px) or hang the tab.
const MAX_EXPORT_PX = 12000

const persistFrame = debounce((frame: Frame) => void saveFrame(frame), 250)

export default function App() {
  const [frame, setFrame] = useState<Frame>(DEFAULT_FRAME)
  const [shot, setShot] = useState<ImageBitmap | null>(null)
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Guards against an older, slower decode landing after a newer one.
  const loadVersion = useRef(0)

  const size = frameSize(frame, shot)

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
    if (!ACCEPT.includes(file.type)) {
      setError('That file type won’t work — use a PNG, JPG, WebP or AVIF screenshot.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That image is over 40 MB. Export a smaller screenshot and try again.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      if (version !== loadVersion.current) {
        bitmap.close()
        return
      }
      setShot((prev) => {
        prev?.close()
        return bitmap
      })
      setFilename(file.name)
      if (opts?.persist !== false) void saveShot(file, file.name)
    } catch {
      if (version === loadVersion.current) setError('That image couldn’t be read. Try re-exporting it.')
    }
  }, [])

  // Restore whatever was open last, then start rendering.
  useEffect(() => {
    void (async () => {
      const [savedFrame, savedShot] = await Promise.all([loadFrame(), loadShot()])
      setFrame(savedFrame)
      if (savedShot) {
        const file = new File([savedShot.blob], savedShot.name, { type: savedShot.blob.type })
        await accept(file, { persist: false })
      }
      setReady(true)
    })()
  }, [accept])

  // Paste straight from a screenshot tool — the fastest path in practice.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        void accept(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept])

  // Preview renders at 1x through the same function as the export.
  useEffect(() => {
    if (canvasRef.current) drawFrame(canvasRef.current, frame, shot, 1)
  }, [frame, shot])

  const render = useCallback(async (): Promise<Blob> => {
    const scale = Math.min(frame.exportScale, MAX_EXPORT_PX / Math.max(size.w, size.h))
    const out = document.createElement('canvas')
    drawFrame(out, frame, shot, scale)
    return await new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
    })
  }, [frame, shot, size.w, size.h])

  async function download() {
    if (!shot || busy) return
    setBusy(true)
    setError('')
    try {
      const blob = await render()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stem = filename.replace(/\.[^.]+$/, '') || 'post'
      a.href = url
      a.download = `goodspeed-${stem}-${size.w * frame.exportScale}w.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('Export didn’t finish. Try a lower export scale.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!shot || busy) return
    setBusy(true)
    setError('')
    try {
      const blob = await render()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Copying didn’t work in this browser — use Download PNG instead.')
    } finally {
      setBusy(false)
    }
  }

  function remove() {
    loadVersion.current++
    setShot((prev) => {
      prev?.close()
      return null
    })
    setFilename('')
    void clearShot()
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
          Screenshots stay in this browser &middot; nothing is uploaded
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
            onClick={() => !shot && fileRef.current?.click()}
            aria-label={shot ? 'Post preview' : 'Add a screenshot'}
            className={cn(
              // No corner rounding here: the exported PNG has square corners,
              // so the preview shouldn't imply otherwise.
              'relative block max-h-full shrink-0 overflow-hidden bg-transparent p-0 ring-1 ring-border transition-opacity',
              !ready && 'opacity-0',
              !shot && 'cursor-pointer',
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
            hasShot={!!shot}
            filename={filename}
            size={size}
            busy={busy}
            copied={copied}
            onPick={() => fileRef.current?.click()}
            onRemove={remove}
            onMatch={() => shot && update('background', sampleEdgeColor(shot))}
            onReset={reset}
            onDownload={() => void download()}
            onCopy={() => void copy()}
          />
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-ring px-6 py-4 font-heading text-sm">
              <Upload size={16} /> Drop the screenshot
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-destructive/40 bg-card px-4 py-2.5 text-xs shadow-lg"
          >
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
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
        aria-label="Choose a screenshot"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void accept(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
