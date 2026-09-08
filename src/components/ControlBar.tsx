import { Check, ChevronDown, Copy, Download, Image as ImageIcon, Pipette, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { BACKGROUNDS, PADDING_PRESETS, RATIOS, isValidHex, normalizeHex, type Frame, type RatioId } from '@/render/post'

type Props = {
  frame: Frame
  onChange: <K extends keyof Frame>(key: K, value: Frame[K]) => void
  kind: 'image' | 'video' | null
  filename: string
  size: { w: number; h: number }
  busy: boolean
  progress: number
  copied: boolean
  canRecord: boolean
  onPick: () => void
  onRemove: () => void
  onMatch: () => void
  onReset: () => void
  onExport: () => void
  onCopy: () => void
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</label>
        <span className="font-heading text-[11px] tabular-nums text-foreground/70">{value}</span>
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md py-1.5 text-left text-xs text-foreground transition-colors hover:text-foreground/80"
    >
      {label}
      <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}>
        <span
          className={cn(
            'absolute top-0.5 size-3 rounded-full bg-card transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

export function ControlBar({
  frame,
  onChange,
  kind,
  filename,
  size,
  busy,
  progress,
  copied,
  canRecord,
  onPick,
  onRemove,
  onMatch,
  onReset,
  onExport,
  onCopy,
}: Props) {
  const hasMedia = kind !== null
  const isVideo = kind === 'video'

  return (
    <aside className="pointer-events-auto flex max-h-full w-[268px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/85 shadow-lg backdrop-blur-xl">
      {/* Aspect ratio sits at the top: it decides the shape everything else
          works inside. */}
      <header className="space-y-2.5 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <label htmlFor="ratio" className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Aspect ratio
          </label>
          <Button variant="ghost" size="icon" title="Reset to defaults" aria-label="Reset to defaults" onClick={onReset}>
            <RotateCcw size={14} />
          </Button>
        </div>
        <div className="relative">
          <select
            id="ratio"
            value={frame.ratio}
            onChange={(e) => onChange('ratio', e.target.value as RatioId)}
            className="h-9 w-full appearance-none rounded-md border border-input bg-card px-3 pr-8 font-heading text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {RATIOS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute top-2.5 right-3 text-muted-foreground" />
        </div>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {size.w} × {size.h} px · {frame.exportScale}× = {size.w * frame.exportScale} × {size.h * frame.exportScale}
        </p>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Media */}
        {hasMedia ? (
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
              {filename}
            </span>
            <Button variant="outline" size="icon" title="Replace" aria-label="Replace media" onClick={onPick}>
              <ImageIcon size={14} />
            </Button>
            <Button variant="ghost" size="icon" title="Remove" aria-label="Remove media" onClick={onRemove}>
              <Trash2 size={14} />
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={onPick}>
            <Upload size={14} /> Add screenshot or video
          </Button>
        )}

        {/* Whitespace — the main dial. */}
        <Row label="Whitespace" value={`${frame.padding} px`}>
          <Slider
            aria-label="Whitespace"
            min={0}
            max={240}
            step={4}
            value={[frame.padding]}
            onValueChange={([v]) => onChange('padding', v)}
          />
          <div className="flex gap-1">
            {PADDING_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange('padding', p)}
                className={cn(
                  'flex-1 rounded-md py-1 font-heading text-[11px] tabular-nums transition-colors',
                  frame.padding === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {p === 0 ? 'Bleed' : p}
              </button>
            ))}
          </div>
        </Row>

        {/* Background */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Background</label>
            <button
              type="button"
              onClick={onMatch}
              disabled={!hasMedia}
              title="Match the media's edge colour"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Pipette size={11} /> Match
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BACKGROUNDS.map((bg) => {
              const active = frame.background.toUpperCase() === bg.value.toUpperCase()
              return (
                <button
                  key={bg.value}
                  type="button"
                  title={bg.name}
                  aria-label={bg.name}
                  aria-pressed={active}
                  onClick={() => onChange('background', bg.value)}
                  style={{ background: bg.value }}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md ring-1 ring-white/15 transition-transform hover:scale-105',
                    active && 'ring-2 ring-ring',
                  )}
                >
                  {active && <Check size={12} className="text-black/70 mix-blend-difference" />}
                </button>
              )
            })}
          </div>
          <Input
            value={frame.background}
            spellCheck={false}
            aria-label="Background hex"
            className="h-8 font-heading text-[11px] uppercase"
            onChange={(e) => {
              const v = e.target.value
              onChange('background', isValidHex(v) ? normalizeHex(v) : v)
            }}
          />
        </div>

        <Row label={isVideo ? 'Video size' : 'Screenshot size'} value={`${Math.round(frame.zoom * 100)}%`}>
          <Slider
            aria-label="Media size"
            min={25}
            max={200}
            step={1}
            value={[Math.round(frame.zoom * 100)]}
            onValueChange={([v]) => onChange('zoom', v / 100)}
          />
        </Row>

        <Row label="Corner radius" value={`${frame.radius} px`}>
          <Slider
            aria-label="Corner radius"
            min={0}
            max={64}
            step={1}
            value={[frame.radius]}
            onValueChange={([v]) => onChange('radius', v)}
          />
        </Row>

        <div className="border-t border-border pt-3">
          <Toggle label="Drop shadow" checked={frame.shadow} onChange={(v) => onChange('shadow', v)} />
        </div>
      </div>

      <footer className="space-y-2 border-t border-border px-4 py-3">
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange('exportScale', s)}
              className={cn(
                'flex-1 rounded-md py-1 font-heading text-[11px] transition-colors',
                frame.exportScale === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
        <Button className="w-full" disabled={!hasMedia || busy || (isVideo && !canRecord)} onClick={onExport}>
          <Download size={14} />
          {busy && isVideo
            ? `Recording… ${Math.round(progress * 100)}%`
            : busy
              ? 'Exporting…'
              : isVideo
                ? 'Export video'
                : 'Download PNG'}
        </Button>
        {isVideo ? (
          <p className="text-center text-[11px] leading-4 text-muted-foreground">
            {canRecord
              ? 'Recorded in real time — a 30s clip takes 30s.'
              : 'This browser can’t record video. Use Chrome.'}
          </p>
        ) : (
          <Button variant="outline" className="w-full" disabled={!hasMedia || busy} onClick={onCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy image'}
          </Button>
        )}
      </footer>
    </aside>
  )
}
