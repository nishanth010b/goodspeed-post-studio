# Goodspeed Post Studio

An internal tool for turning a designer's screenshot into a Goodspeed social post.
Drop a screenshot in, set the whitespace, download the PNG. That's the whole job.

Built to the same shape as [hx-thumbnail-tool](https://github.com/nishanth010b/hx-thumbnail-tool)
— same Vite + React + Tailwind 4 + shadcn (`base-luma`, neutral) setup and the same
dark theme — but where the hx tool composes fixed-size thumbnails from templates,
this one frames a single screenshot.

## Using it

```bash
npm install
npm run dev
```

Then: **paste** a screenshot (⌘V), drop it on the canvas, or click to browse.
Adjust on the right, hit **Download PNG** or **Copy image**.

Nothing is uploaded. The screenshot and your settings live in this browser's
IndexedDB, so closing the tab and coming back leaves the work where it was.

## How the frame works

Every post frame in the [Figma reference](https://www.figma.com/design/N8Y2DPaR2yIKtaqSsySgkw/Goodspeed-Marketing?node-id=2279-402)
is the same recipe: a screenshot sitting on a flat ground with a grain overlay on
top. The frames are all different sizes (1001×848, 1080×612, 960×461…) because the
canvas hugs the screenshot rather than fitting a platform format. This tool does
the same — **canvas size = screenshot × zoom + whitespace on all sides** — so a wide
dashboard grab and a tall phone grab both come out looking deliberate, and there's
no ratio decision to make.

| Control | What it does |
|---|---|
| Whitespace | Padding on all four sides. `Bleed` (0) crops nothing and adds nothing — the screenshot *is* the post. Presets are the values used in Figma: 0 / 40 / 80 / 100. |
| Background | The ground colour. First four swatches are measured off the Figma frames; the rest are Goodspeed brand grounds. `Match` averages the screenshot's outer edge so the frame blends into whatever the mockup already sits on. Or type a hex. |
| Screenshot size | Scales the screenshot; the canvas grows and shrinks with it. |
| Corner radius | Rounds the screenshot itself. Figma leaves this at 0 — the source mockups usually have their own corners. |
| Drop shadow | Green-tinted, per brand. Off by default. |
| Grain | The noise overlay every Figma frame carries, at the measured amplitude (σ ≈ 4/255, monochrome). On by default. |
| 1× / 2× / 3× | Export multiplier. 2× is the default; exports are capped at 12000 px on the long edge. |

The preview and the export run through the same `drawFrame` — the preview *is* the
output at 1×, so there's no separate render path to drift.

## Layout

```
src/
  render/
    post.ts     frame model + the single draw function (preview and export)
    noise.ts    seeded monochrome grain, lifted from the hx tool
  components/
    ControlBar.tsx   the floating right-hand bar
    ui/              button, input, slider (shadcn)
  lib/
    persist.ts  IndexedDB: current screenshot + settings
  App.tsx       workspace, drop/paste handling, export
scripts/
  qa.mjs        drives the tool in real Chrome and writes screenshots to qa-out/
```

## QA

```bash
npm run dev
npm run qa path/to/screenshot.png   # writes qa-out/
```

Loads a fixture through the real file input, walks the whitespace presets and
background swatches, and reports any console errors. Set `QA_OUT` to change the
output directory.
