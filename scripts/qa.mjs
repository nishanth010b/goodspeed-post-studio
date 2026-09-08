// Drives the tool in a real browser: loads a fixture screenshot, exercises the
// controls, and writes preview shots + an exported PNG for eyeballing.
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = process.env.QA_OUT ?? 'qa-out'
const FIXTURE = process.argv[2]
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas')
await page.screenshot({ path: `${OUT}/01-empty.png` })

// Load the fixture through the real file input.
const input = await page.$('input[type=file]')
await input.uploadFile(FIXTURE)
await page.waitForFunction(() => !document.querySelector('[aria-label="Add a screenshot"]'), { timeout: 5000 })
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: `${OUT}/02-loaded.png` })

// Whitespace presets.
for (const label of ['Bleed', '40', '80']) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l)
    b?.click()
  }, label)
  await new Promise((r) => setTimeout(r, 200))
  await page.screenshot({ path: `${OUT}/03-pad-${label}.png` })
}

// Back to 100, then dark ground + radius + shadow.
await page.evaluate(() => {
  ;[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '100')?.click()
})
await page.evaluate(() => document.querySelector('[aria-label="Black"]')?.click())
await new Promise((r) => setTimeout(r, 200))
await page.screenshot({ path: `${OUT}/04-black.png` })

await page.evaluate(() => document.querySelector('[aria-label="Match"]')?.click())
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Match'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 200))
const bg = await page.$eval('[aria-label="Background hex"]', (el) => el.value)
await page.screenshot({ path: `${OUT}/05-matched.png` })

// Export at 2x and save the actual PNG the team would download.
const b64 = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas')
  return canvas.toDataURL('image/png').split(',')[1]
})
writeFileSync(`${OUT}/06-preview-canvas.png`, Buffer.from(b64, 'base64'))

const size = await page.$eval('header p.tabular-nums, p.tabular-nums', (el) => el.textContent)

console.log(JSON.stringify({ matchedBackground: bg, sizeLine: size, errors }, null, 2))
await browser.close()
