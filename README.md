# Goodspeed Post Studio

An internal tool for turning a designer's screenshot or screen recording into a
Goodspeed social post. Drop the file in, set the whitespace, export. That's the
whole job.

Built to the same shape as [hx-thumbnail-tool](https://github.com/nishanth010b/hx-thumbnail-tool)
— same Vite + React + Tailwind 4 + shadcn (`base-luma`, neutral) setup and the same
dark theme — but where the hx tool composes fixed-size thumbnails from templates,
this one frames a single screenshot or video.

## Using it

```bash
npm install
npm run dev
```

Then: **paste** a screenshot (⌘V), drop a file on the canvas, or click to browse.
Adjust on the right, hit **Download PNG** / **Export video**.

Takes PNG, JPG, WebP and AVIF images, and MP4, MOV and WebM video.

Nothing is uploaded. The file and your settings live in this browser's IndexedDB,
so closing the tab and coming back leaves the work where it was.

## How the frame works

Every post frame in the [Figma reference](https://www.figma.com/design/N8Y2DPaR2yIKtaqSsySgkw/Goodspeed-Marketing?node-id=2279-402)
is the same recipe: the media sitting on a flat ground, centred, with whitespace
around it. The frames are all different sizes (1001×848, 1080×612, 960×461…)
because the canvas hugs the media rather than fitting a platform format.

That's the **Auto** ratio here — **canvas = media × zoom + whitespace on all sides**
— so a wide dashboard grab and a tall phone grab both come out looking deliberate.
Pick a fixed ratio instead and the canvas locks to that shape by growing its short
axis; the media keeps its own proportions and is never cropped, and the whitespace
never drops below the padding. A 640×360 clip at 100px padding is 840×560 on Auto,
840×840 on 1:1, 840×1494 on 9:16.

| Control | What it does |
|---|---|
| Aspect ratio | `Auto` hugs the media. `1:1`, `4:3`, `3:2`, `16:9`, `4:5`, `9:16` lock the canvas shape. |
| Whitespace | Minimum padding on all four sides. `Bleed` (0) crops nothing and adds nothing — on Auto, the media *is* the post. Presets are the values used in Figma: 0 / 40 / 80 / 100. |
| Background | The ground colour, measured off the Figma frames. `Match` averages the media's outer edge so the frame blends into whatever the mockup already sits on. Or type a hex. |
| Screenshot / video size | Scales the media; on Auto the canvas grows and shrinks with it. |
| Corner radius | Rounds the media itself. Figma leaves this at 0 — the source mockups usually have their own corners. |
| Drop shadow | A barely-there lift, green-tinted per brand. Off by default. |
| 1× / 2× / 3× | Export multiplier. 2× is the default; exports are capped at 12000 px on the long edge. |

## Video export

Framing a video means re-recording it: the clip plays once through while every
frame is composited onto the canvas, and `MediaRecorder` encodes the canvas
stream. So **export runs in real time** — a 30s clip takes 30s — and the button
shows progress while it does.

Output is MP4/H.264 with the clip's own audio track carried through, which is what
LinkedIn and X want; it falls back to WebM/VP9 where Chrome wasn't built with the
MP4 encoder, and the button says so if neither is available. Frame dimensions are
always even, since H.264 requires it.

Chrome logs an advisory during MP4 recording (`When using "avc1"… consider
switching to "avc3"`). It's benign — the exported files decode clean under
`ffmpeg` with the expected frame count — and `avc1` is kept because it's the more
compatible of the two for platform transcoders.

The preview and the export run through the same `drawFrame` — the preview *is* the
output at 1×, so there's no separate render path to drift.

## Layout

```
src/
  render/
    post.ts     frame model + the single draw function (preview and export)
    media.ts    loads a file into a bitmap or an off-screen <video>
    record.ts   real-time canvas recording for video export
  components/
    ControlBar.tsx   the floating right-hand bar
    ui/              button, input, slider (shadcn)
  lib/
    persist.ts  IndexedDB: current file + settings
  App.tsx       workspace, drop/paste handling, export
scripts/
  qa.mjs        image path in real Chrome: presets, swatches, PNG export
  qa-video.mjs  video path: ratio maths, live preview, a real recording export
```

## QA

```bash
npm run dev
npm run qa       path/to/screenshot.png   # writes qa-out/
npm run qa:video path/to/clip.mp4         # needs ffprobe on PATH
```

Both load a fixture through the real file input and report any console errors.
`qa` walks the whitespace presets and background swatches and downloads a PNG;
`qa:video` walks the ratio dropdown, checks the preview is actually advancing
frames, then does a real recording export and probes the file with `ffprobe`.
Set `QA_OUT` to change the output directory.
