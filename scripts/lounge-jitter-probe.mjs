/**
 * Is the local view steadier standing still than it is walking?
 *
 *     BASE=http://localhost:3200 node scripts/lounge-jitter-probe.mjs
 *     HEADED=1 node scripts/lounge-jitter-probe.mjs
 *
 * Reported as "the lobby jitters a bit more now when moving", which is a
 * complaint about *your own* view rather than about anybody else's body - so
 * this measures the one thing that describes: the spread of frame intervals.
 *
 * Two conditions on one machine, deliberately, because an absolute number from a
 * headless SwiftShader context on a loaded laptop says nothing about a real
 * client's GPU. What survives that is the *comparison*: if standing still is
 * even and walking is not, the cost is something walking does - a re-render per
 * step, a rebuild per block crossed - rather than the fill rate the scene
 * already had. See `lounge-is-fill-rate-bound`.
 *
 * Uses the demo lounge, which is the same scene with no session to mint.
 *
 * ---------------------------------------------------------------------------
 * Run it headful, or it measures nothing
 * ---------------------------------------------------------------------------
 * `HEADED=1`. Headless is SwiftShader, which rasterises on the CPU, and this
 * scene is fill-rate bound - see `lounge-is-fill-rate-bound`. Measured that way
 * on a busy machine it reports **2fps in both conditions**, where a 30ms
 * difference between standing and walking is indistinguishable from the noise
 * in a 520ms frame. The comparison only survives on a real GPU, which means a
 * window on somebody's desk and a machine with nothing else running on it.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Frame intervals over `ms`, as the numbers that describe a stutter. */
const SAMPLE = `(ms) => new Promise((resolve) => {
  const gaps = []
  let last = performance.now()
  const started = last
  const tick = () => {
    const now = performance.now()
    gaps.push(now - last)
    last = now
    if (now - started < ms) requestAnimationFrame(tick)
    else {
      const sorted = [...gaps].sort((a, b) => a - b)
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
      resolve({
        frames: gaps.length,
        fps: Math.round((gaps.length * 1000) / (now - started)),
        p50: Math.round(at(0.5)),
        p95: Math.round(at(0.95)),
        worst: Math.round(sorted[sorted.length - 1] ?? 0),
      })
    }
  }
  requestAnimationFrame(tick)
})`

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
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.waitForSelector('canvas', { timeout: 180_000 })
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

  await page.evaluate(() => {
    for (const one of document.querySelectorAll('button')) {
      const text = one.textContent ?? ''
      const label = one.getAttribute('aria-label') ?? ''
      if (/verstanden|accept|got it/i.test(text)) one.click()
      if (/close block picker|hide this/i.test(label)) one.click()
    }
  })
  await wait(600)
  await page.evaluate(() => {
    const tap = [...document.querySelectorAll('button')].find((one) =>
      /tap to enter|enter/i.test(one.textContent ?? ''),
    )
    tap?.click()
  })
  await wait(1500)

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

  // Warm, so the first sample is not measuring the last of the loading.
  await page.evaluate(`(${SAMPLE})(2000)`)

  const still = await page.evaluate(`(${SAMPLE})(6000)`)
  console.log('standing still:', JSON.stringify(still))

  await page.keyboard.down('KeyW')
  const walking = await page.evaluate(`(${SAMPLE})(6000)`)
  await page.keyboard.up('KeyW')
  console.log('walking      :', JSON.stringify(walking))

  await wait(1500)
  const after = await page.evaluate(`(${SAMPLE})(6000)`)
  console.log('still again  :', JSON.stringify(after))

  console.log('problems:', problems.slice(0, 8))

  if (process.env.HEADED === '1') await wait(15_000)
  await context.close()
  await browser.close()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
