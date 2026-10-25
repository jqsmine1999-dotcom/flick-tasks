// Records a scripted demo of the app as an iPhone-sized frame sequence.
//   node scripts/record-demo.mjs <outDir>
// Needs the dev server on :5173 (CF_REMOTE=1 for real Workers AI).
// Frames are captured with the Chrome DevTools screencast and encoded by scripts/encode.swift.
//
// The screencast only delivers CSS-pixel frames, so instead of deviceScaleFactor the
// window is iPhone-pixel sized and the page is rendered with `zoom: 3`. Rendering uses the
// Metal GPU; software rendering manages ~2fps at this size. Under zoom, pointer deltas
// act like phone CSS pixels, so drag distances below are what a finger would travel.
import { chromium } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? 'media/frames'
const BASE = 'http://localhost:5173'
const W = 390
const H = 844
const DPR = 3

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({
  viewport: { width: W * DPR, height: H * DPR },
  deviceScaleFactor: 1,
  hasTouch: true,
  locale: 'ja-JP',
})
await context.route(`${BASE}/`, async (route) => {
  const res = await route.fetch()
  const body = (await res.text()).replace('<html lang="ja">', `<html lang="ja" style="zoom:${DPR}">`)
  await route.fulfill({ response: res, body })
})

// Start from an empty account every time.
const setup = await context.newPage()
await setup.goto(`${BASE}/auth/dev?name=Flick`)
await setup.request.delete(`${BASE}/api/me`)
await setup.goto(`${BASE}/auth/dev?name=Flick`)
await setup.evaluate(() => localStorage.clear())
await setup.close()

const page = await context.newPage()
// Hold the first API answers briefly so the full-screen skeleton is visible.
let held = 0
await page.route('**/api/me', async (route) => {
  if (held++ === 0) await page.waitForTimeout(1100)
  await route.continue()
})

const cdp = await context.newCDPSession(page)
const frames = []
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `f${String(frames.length).padStart(5, '0')}.jpg`
  writeFileSync(join(outDir, file), Buffer.from(data, 'base64'))
  frames.push({ file, t: metadata.timestamp })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 })

const wait = (ms) => page.waitForTimeout(ms)
const center = async (locator) => {
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
async function tap(locator) {
  const { x, y } = await center(locator)
  await page.mouse.move(x, y)
  await wait(120)
  await page.mouse.down()
  await wait(90)
  await page.mouse.up()
}
/** A finger flick: short hold, then an accelerating swipe. */
async function flick(card, dir) {
  const { x, y } = await center(card.locator('.card'))
  const sx = x + (dir === 'right' ? -150 : 150)
  await page.mouse.move(sx, y)
  await wait(150)
  await page.mouse.down()
  await wait(110)
  const dist = 230
  const steps = 14
  for (let i = 1; i <= steps; i++) {
    const p = i / steps
    await page.mouse.move(sx + (dir === 'right' ? 1 : -1) * dist * p * p, y + p * 3)
    await wait(16)
  }
  await page.mouse.up()
}
const type = (text, delay) => page.keyboard.type(text, { delay })
const task = (title) => page.getByTestId('task').filter({ hasText: title }).first()

// --- Scene 1: open → skeleton → type immediately
await page.goto(BASE)
await page.getByTestId('composer').waitFor()
await wait(500)
await type('牛乳を買う', 140)
await wait(250)
await page.keyboard.press('Enter')
await wait(600)
await type('企画書を仕上げる', 120)
await page.keyboard.press('Enter')
await wait(600)
await type('ジムに行く', 130)
await page.keyboard.press('Enter')
await wait(1400)

// --- Scene 2: flick right → doing
await flick(task('企画書を仕上げる'), 'right')
await wait(1600)

// --- Scene 3: doing → done
await tap(page.getByTestId('tab-doing'))
await wait(1000)
await flick(page.getByTestId('list-doing').getByTestId('task').first(), 'right')
await wait(900)
await tap(page.getByTestId('tab-done'))
await wait(1700)

// --- Scene 4: AI split
await tap(page.getByTestId('tab-todo'))
await wait(700)
await tap(page.getByTestId('composer'))
await type('来週の出張準備。新幹線とホテルを予約して、部長に日程をメールで共有。資料も印刷しておく', 55)
await wait(700)
await tap(page.getByTestId('ai'))
await page.getByTestId('task').nth(4).waitFor({ timeout: 30000 })
await wait(2400)

// --- Scene 5: tap a card → sheet
await tap(task('ホテル'))
await wait(1600)
await tap(page.getByTestId('scrim'))
await wait(1000)

// --- Scene 6: flick left → delete → undo
await flick(task('ジムに行く'), 'left')
await wait(1300)
await tap(page.getByTestId('toast-action'))
await wait(2200)

await cdp.send('Page.stopScreencast')
await wait(300)
writeFileSync(join(outDir, 'frames.json'), JSON.stringify(frames))
console.log(`${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)}s`)
await browser.close()
