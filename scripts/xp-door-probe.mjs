/**
 * Walk into a door and see whether the room changes.
 *
 *     node scripts/xp-door-probe.mjs                 # two-rooms
 *     XP=first-room node scripts/xp-door-probe.mjs
 *     HEADED=1 node scripts/xp-door-probe.mjs
 *
 * One browser, no session: `/xp/<id>` is the public host, and a level with no
 * `backend.needs` is playable there by anybody. Chrome rather than Chromium
 * because only Chrome takes a pointer lock headless, and without the lock there
 * is no walking - see e2e/players.ts.
 *
 * What it reports, in order, because they fail in that order: is the scene
 * running at all (`fps`), does the body move when W is held, and does anything
 * on screen say the room changed.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const XP = process.env.XP ?? 'two-rooms'
const OUT = process.env.OUT ?? '.'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.HEADED !== '1',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  })
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } })
  const page = await context.newPage()
  const problems = []
  const said = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))

  await page.goto(`${BASE}/xp/${XP}?debug=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  })
  console.log('landed on:', page.url())
  await page.waitForSelector('canvas', { timeout: 180_000 })

  // A fresh <canvas> is 300x150 until R3F measures its container; clicking the
  // middle of that takes a pointer lock on nothing useful.
  for (let attempt = 0; attempt < 90; attempt++) {
    const area = await page.evaluate(() => {
      let biggest = 0
      for (const canvas of document.querySelectorAll('canvas')) {
        const rect = canvas.getBoundingClientRect()
        biggest = Math.max(biggest, rect.width * rect.height)
      }
      return biggest
    })
    if (area > 200_000) break
    await wait(1000)
  }
  await wait(6000)

  const middle = async () => {
    const box = await page.evaluate(() => {
      let best = null
      for (const canvas of document.querySelectorAll('canvas')) {
        const rect = canvas.getBoundingClientRect()
        const area = rect.width * rect.height
        if (!best || area > best.area) {
          best = { area, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        }
      }
      return best
    })
    if (!box) throw new Error('no canvas on the page')
    return box
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.evaluate(() => Boolean(document.pointerLockElement))) break
    const spot = await middle()
    await page.mouse.click(spot.x, spot.y)
    await wait(1800)
  }
  console.log('locked:', await page.evaluate(() => Boolean(document.pointerLockElement)))

  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0
        const started = performance.now()
        const tick = () => {
          frames += 1
          if (performance.now() - started < 3000) requestAnimationFrame(tick)
          else resolve(Math.round((frames * 1000) / (performance.now() - started)))
        }
        requestAnimationFrame(tick)
      }),
  )
  console.log('fps:', fps)

  /** Everything on screen, which for an XP is small enough to read whole. */
  const readout = () =>
    page.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400))

  console.log('at the start:', await readout())

  /*
   * Forward, in bursts, reading between them. The door is a one-cell trigger and
   * a burst that overshoots it in a single frame would be a miss that says
   * nothing about whether the trigger works - hence short holds, many of them.
   */
  for (let step = 0; step < 12; step++) {
    await page.keyboard.down('KeyW')
    await wait(400)
    await page.keyboard.up('KeyW')
    await wait(500)
    const text = await readout()
    said.push(`step ${step}: ${text.slice(0, 200)}`)
    console.log(`step ${step}:`, text.slice(0, 200))
  }

  const cdp = await context.newCDPSession(page)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/xp-door.png`, Buffer.from(data, 'base64'))
  await cdp.detach()
  console.log('shot ->', `${OUT}/xp-door.png`)

  console.log('problems:', problems.slice(0, 10))

  if (process.env.HEADED === '1') await wait(15_000)
  await context.close()
  await browser.close()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
