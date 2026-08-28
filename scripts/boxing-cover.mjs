/**
 * The store's picture of the boxing cartridge.
 *
 *     node scripts/boxing-cover.mjs
 *
 * ---------------------------------------------------------------------------
 * Why this is not `bun run xp:shot`
 * ---------------------------------------------------------------------------
 * That rasteriser draws a document's *world* - it walks the placements and
 * renders them offscreen. A cartridge has no world, so it would produce a
 * correct picture of nothing.
 *
 * The rule the store cares about is the one in `domain/xps/catalogue.ts`: **the
 * picture came out of the level**, because a store card must not advertise a
 * room the XP does not have. That rule is kept here by the only means available
 * for a game whose world is code - play it, and photograph it.
 *
 * Two pages, because one fighter alone is a boxer waiting in an empty ring, and
 * the foreground is handed back and forth because a hidden tab gets no frames
 * at all. Both of those are explained at length in `boxing-probe.mjs`.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? 'public/xp/shots/boxing.png'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  mkdirSync('public/xp/shots', { recursive: true })
  mkdirSync('test-results/boxing', { recursive: true })

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
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

  // 2x, because a store card is drawn at a few hundred pixels on a retina
  // screen and a soft cover is the one thing a shop window cannot have.
  const context = await browser.newContext({
    viewport: { width: 960, height: 720 },
    deviceScaleFactor: 2,
  })

  const room = `cover${Date.now() % 9999}`
  const open = async () => {
    const page = await context.newPage()
    await page.goto(`${BASE}/xp/boxing?room=${room}`, {
      waitUntil: 'domcontentloaded',
      timeout: 240_000,
    })
    await page.waitForSelector('canvas', { timeout: 120_000 })
    return page
  }

  const one = await open()
  const two = await open()

  const share = async (ms) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
      await one.bringToFront()
      await wait(220)
      await two.bringToFront()
      await wait(220)
    }
    await one.bringToFront()
  }

  // Past the walkout and into the round.
  await share(7000)

  // Close the distance, so the cover shows a fight rather than two people
  // standing at opposite ends of a ring.
  await one.keyboard.down('d')
  await share(1600)
  await one.keyboard.up('d')

  // Both throwing, caught mid-exchange.
  await two.bringToFront()
  await two.keyboard.press('l')
  await one.bringToFront()
  await one.keyboard.press('k')
  await wait(110)

  /**
   * Everything that is not the game, hidden.
   *
   * The app's own chrome - a cookie banner, a contact bubble, the HUD - is not
   * part of the level and has no business in a store card. Removed in the page
   * rather than cropped out, because the banner sits over the ring and a crop
   * would take the fighters with it.
   */
  await one.evaluate(() => {
    for (const node of document.querySelectorAll('body > *')) {
      if (!node.querySelector('canvas')) node.style.display = 'none'
    }
    for (const selector of ['[data-gap]', '.boxing-touch']) {
      const node = document.querySelector(selector)
      if (node) node.style.display = 'none'
    }
  })

  const raw = 'test-results/boxing/cover-raw.png'
  await one.screenshot({ path: raw })
  await browser.close()

  const meta = await sharp(raw).metadata()
  const width = meta.width
  const height = Math.round((width * 9) / 16)
  // Cropped from above the middle: the mat fills the lower third of the frame,
  // so a centred 16:9 slice is mostly canvas with the fighters at the top edge.
  await sharp(raw)
    .extract({ left: 0, top: Math.round(meta.height * 0.14), width, height })
    .resize(1280, 720)
    .png()
    .toFile(OUT)

  console.log(`${OUT}  1280x720`)
}

main().catch((reason) => {
  console.error(reason)
  process.exit(1)
})
