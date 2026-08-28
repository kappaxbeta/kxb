/**
 * The XP touch controls, driven by a pointer that says it is coarse.
 *
 * Not a test - a probe, run by hand with output you read:
 *
 *     bun run scripts/xp-touch-probe.ts
 *
 * The arithmetic is unit-tested in `src/app/xp/_runtime/input/touch.test.ts`.
 * What cannot be tested there is the wiring, which is where this looks:
 *
 * 1. that a coarse pointer gets the stick at all,
 * 2. that a *sideways* push on it turns instead of stepping sideways, with
 *    nothing stored - the phone default that this exists to check. Proved by
 *    contrast: the same push with `unkown.camera = 'free'` seeded does walk
 *    sideways, so "it did not move" cannot be a level that refuses to move,
 * 3. and that running is a reach *past* the drawn ring rather than the end of
 *    the walk, latch and all.
 *
 * Two notes that cost an hour each. The stick goes in the **right** corner
 * (`unkown.hand = 'left'`), because `?debug=1` opens its card bottom-left, over
 * the stick, and takes every pointer event aimed at it. And the card's `facing`
 * is the **body**, which eases toward where it is going - during a turn on the
 * spot it lags the camera badly, so the thing to read off a sideways push is
 * that the *position* does not change, not how far the number swung.
 */
import { chromium, type Page } from '@playwright/test'

const URL = process.env.URL ?? 'http://localhost:3000/xp/first-room?debug=1'

/** The HUD's own `RADIUS`. Full deflection, and what the reaches below are of. */
const RADIUS = 52

async function open(camera: 'unset' | 'free') {
  const browser = await chromium.launch({
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
  const context = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  // The two doors in front of a fresh profile, opened before the page loads:
  // the cookie note and the hand gate both sit over the stick.
  await context.addInitScript(
    ([mode]) => {
      localStorage.setItem('cookie-consent', 'true')
      localStorage.setItem('unkown.hand', 'left')
      if (mode === 'free') localStorage.setItem('unkown.camera', 'free')
    },
    [camera],
  )
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('  console.error:', message.text().slice(0, 200))
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  return { browser, page }
}

function readouts(page: Page) {
  const cell = async (label: string) => {
    const row = page.locator('dt', { hasText: new RegExp(`^${label}$`) })
    if ((await row.count()) === 0) return null
    return (await row.first().locator('xpath=following-sibling::dd[1]').innerText()).trim()
  }
  return {
    at: () => cell('at'),
    facing: () => cell('facing'),
    ring: async () => (await page.locator('.hud-stick').first().getAttribute('class')) ?? '',
  }
}

/** Where the stick is, once the level has drawn one. */
async function findStick(page: Page) {
  await page.waitForSelector('.hud-stick', { timeout: 60_000 })
  const box = await page.locator('.hud-stick').first().boundingBox()
  if (!box) throw new Error('the stick has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, ring: box.width }
}

async function main() {
  /* ---------------------------------------------------------------------
   * 1 & 2: nothing stored, which is what a phone arrives with
   * ------------------------------------------------------------------- */
  console.log('--- with nothing stored (a phone as it comes) ---')
  const first = await open('unset')
  const page = first.page
  const read = readouts(page)

  console.log('pointer: coarse ->', await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
  const stick = await findStick(page)
  console.log('the stick is drawn ·', Math.round(stick.ring), 'px ring at', Math.round(stick.x), Math.round(stick.y))

  // The card's rows only appear once somebody is standing up in the level.
  for (let tries = 0; tries < 80 && (await read.facing()) === null; tries += 1) {
    await page.waitForTimeout(250)
  }
  const before = { at: await read.at(), facing: await read.facing() }
  console.log('standing at', before.at, 'facing', before.facing)

  console.log('\npushing the stick sideways for three seconds:')
  await page.mouse.move(stick.x, stick.y)
  await page.mouse.down()
  await page.mouse.move(stick.x + 40, stick.y, { steps: 4 })
  for (let tick = 0; tick < 10; tick += 1) {
    await page.waitForTimeout(300)
    console.log('  at', await read.at(), '· facing', await read.facing())
  }
  const turned = { at: await read.at(), facing: await read.facing() }
  await page.mouse.up()
  console.log(turned.at === before.at ? '  -> did not step sideways' : '  -> WALKED sideways')
  console.log(turned.facing === before.facing ? '  -> did not turn' : '  -> turned')

  /* ---------------------------------------------------------------------
   * 3: and where running starts
   * ------------------------------------------------------------------- */
  console.log('\nand forward, at four depths:')
  const running = async () => (await read.ring()).includes('hud-stick-run')
  await page.mouse.move(stick.x, stick.y)
  await page.mouse.down()
  for (const [reach, note] of [
    [1.0, 'full deflection - the walk, exactly as W is'],
    [1.2, 'a thumb slipped a little past the rim - still a walk'],
    // 1.5 rather than 1.4 on the nose: the threshold *is* 1.4, and a probe that
    // asks for exactly it is asking a rounding question rather than a control
    // one - Playwright moves the pointer in whole pixels.
    [1.5, 'a deliberate stretch past the drawn ring - a run'],
    [1.25, 'and back inside, which the latch holds through'],
    [0.8, 'and properly back - a walk again'],
  ] as const) {
    await page.mouse.move(stick.x, stick.y - RADIUS * reach, { steps: 4 })
    await page.waitForTimeout(700)
    console.log(`  ${String(Math.round(RADIUS * reach)).padStart(3)}px (${reach}×): running ${await running()}   ${note}`)
    // Taken *while* the thumb is out there, because the thing worth looking at
    // is the ring's colour and it goes out the moment the stick is let go.
    if (reach === 1.5) await page.screenshot({ path: process.env.SHOT ?? '/tmp/xp-touch.png' })
  }
  await page.mouse.up()
  await first.browser.close()

  /* ---------------------------------------------------------------------
   * The contrast: the same push, with `free` stored
   * ------------------------------------------------------------------- */
  console.log('\n--- with `free` stored, which is what the default replaced ---')
  const second = await open('free')
  const other = readouts(second.page)
  const stick2 = await findStick(second.page)
  for (let tries = 0; tries < 80 && (await other.facing()) === null; tries += 1) {
    await second.page.waitForTimeout(250)
  }
  const from = await other.at()
  console.log('standing at', from)
  await second.page.mouse.move(stick2.x, stick2.y)
  await second.page.mouse.down()
  await second.page.mouse.move(stick2.x + 40, stick2.y, { steps: 4 })
  for (let tick = 0; tick < 10; tick += 1) {
    await second.page.waitForTimeout(300)
    console.log('  at', await other.at(), '· facing', await other.facing())
  }
  const to = await other.at()
  await second.page.mouse.up()
  console.log(to === from ? '  -> did not step sideways' : '  -> WALKED sideways (a strafe, as free means)')
  await second.browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
