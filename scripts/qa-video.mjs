// Loads a video, checks the frame maths and the ratio dropdown, then does a
// real recording export and probes the resulting file with ffprobe.
import puppeteer from 'puppeteer-core'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = process.env.QA_OUT ?? 'qa-out'
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const client = await page.createCDPSession()
await client.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: OUT, eventsEnabled: true })
await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas')

await (await page.$('input[type=file]')).uploadFile(process.argv[2])
await page.waitForFunction(() => !document.querySelector('[aria-label="Add a screenshot or video"]'), { timeout: 8000 })
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: `${OUT}/v1-video-auto.png` })

const sizeOf = () => page.$eval('header p.tabular-nums', (el) => el.textContent)
const results = { auto: await sizeOf() }

// Walk the ratio dropdown.
for (const id of ['1:1', '4:3', '16:9', '9:16']) {
  await page.select('#ratio', id)
  await new Promise((r) => setTimeout(r, 250))
  results[id] = await sizeOf()
  await page.screenshot({ path: `${OUT}/v2-ratio-${id.replace(':', 'x')}.png` })
}

// Confirm the preview is actually advancing frames, not frozen on frame 0.
await page.select('#ratio', 'auto')
const advancing = await page.evaluate(async () => {
  const c = document.querySelector('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const snap = () => ctx.getImageData(c.width / 2, c.height / 2, 8, 8).data.join()
  const a = snap()
  await new Promise((r) => setTimeout(r, 600))
  return a !== snap()
})

// Real export: 1x to keep the QA run quick.
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '1×').click())
const done = new Promise((res) => client.on('Browser.downloadProgress', (e) => e.state === 'completed' && res(e.guid)))
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Export video')).click())
await new Promise((r) => setTimeout(r, 1200))
await page.screenshot({ path: `${OUT}/v3-recording.png` })
const guid = await Promise.race([done, new Promise((_, rj) => setTimeout(() => rj(new Error('record timeout')), 60000))])

const path = `${OUT}/${guid}`
const bytes = readFileSync(path).length
const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', path], { encoding: 'utf8' }),
)
const streams = probe.streams.map((s) => ({ type: s.codec_type, codec: s.codec_name, w: s.width, h: s.height }))
console.log(JSON.stringify({ results, previewAdvancing: advancing, exported: { bytes, format: probe.format.format_name, duration: +probe.format.duration, streams }, errors }, null, 2))
writeFileSync(`${OUT}/exported.${probe.format.format_name.includes('mp4') ? 'mp4' : 'webm'}`, readFileSync(path))
await browser.close()
