/**
 * Two signed-in players, in one room, in two real browsers.
 *
 * The thing every other check in this repo cannot do. `bun test` is pure,
 * `xp:shot` draws a document without a runtime, and `xp:arbiter` calls the
 * server's rules directly - none of them runs the *client*, so none of them can
 * see a panel that renders and then clears itself.
 *
 * Two bugs came out of the first run and neither was reachable any other way:
 * `xp_arbiter_view` never returned the open vote (so the panel vanished on the
 * next poll and nobody else ever saw one), and the deadline was written in a
 * format `Date.parse` reads as NaN (so the countdown sat at zero and the
 * auto-close scheduled nothing).
 *
 * ---------------------------------------------------------------------------
 * Not wired into package.json, deliberately
 * ---------------------------------------------------------------------------
 * It needs `puppeteer-core` and a Chrome on disk, neither of which is a
 * dependency of this project, and a `bun run` entry that fails on a fresh
 * checkout is worse than a file with instructions at the top.
 *
 *   npm i puppeteer-core            # anywhere; run it from there
 *   bun run dev                     # this needs a real app, not a fixture
 *   node scripts/xp-two-players.mjs [base] [xpId]
 *
 * ⚠️ **Check nothing else is already running one.** Three `next dev` processes
 * across concurrent sessions took a *warm* page to eighty seconds on this
 * machine and the harness timed out on `goto` - which looks exactly like the
 * app being broken and is not. `ps aux | grep 'next dev'` first, and stop yours
 * afterwards.
 *
 * ---------------------------------------------------------------------------
 * Driving the camera: `movementX`, dispatched by hand
 * ---------------------------------------------------------------------------
 * Under pointer lock the camera is drei's `PointerLockControls`, which turns on
 * `event.movementX` - and puppeteer's synthesised mouse moves do not carry one,
 * so `mouse.move` does nothing at all. This does:
 *
 *   await page.evaluate(() =>
 *     document.dispatchEvent(new MouseEvent('mousemove', { movementX: 131 })))
 *
 * 0.002 radians per unit is drei's own factor, so 131 is about fifteen degrees.
 * Proved by screenshotting either side of a sweep and comparing: the pictures
 * differ. Clicking to take the lock first is required, and
 * `document.pointerLockElement !== null` is how to know it worked.
 *
 * ---------------------------------------------------------------------------
 * Shooting somebody: solved, and moved to a spec
 * ---------------------------------------------------------------------------
 * This file got a shot to land once — 100 health to 75, exactly the document's
 * damage, through the ray, the peer hitbox, the claim and the verdict — and
 * then could not land a *kill*, because four hits by nudging blind is luck.
 * The note here used to say what it needed, and it needed one thing: **a
 * bearing**. The readout reported where you were standing and not which way you
 * were pointing, so there was nothing to aim with.
 *
 * It reports both now (`?debug=1`, `SceneDebug`), and the whole of it lives in
 * `e2e/shooter.e2e.ts`: `aimAt` turns somebody until the readout says they are
 * looking at a spot, four hits take a body down at twenty-five each, and the
 * scoreboard draws it on both screens. Five checks, about a minute, repeatable.
 *
 * Two claims that were in this paragraph and were wrong, recorded so nobody
 * re-derives them:
 *
 *   - **"Twenty-four rounds and no refill."** There are eleven ammunition boxes
 *     on the floor of that level, twelve rounds each, back fifteen seconds after
 *     they are taken. They landed three days before this note was written.
 *   - **"Both players arrive at the same spawn facing the same way."** The level
 *     has had team spawn marks since before that too, and which side the room
 *     gives you varies between runs — which is exactly why the spec reads both
 *     positions and turns rather than assuming a geometry.
 *
 * What is still true and worth keeping: **only Chrome takes a pointer lock
 * headless**. Chromium refuses it outright, `PointerLockControls` turns nothing
 * without one, and the fire handler ignores every click while
 * `pointerLockElement` is null — so in Chromium a shooter probe has no aim and
 * no trigger, and looks like a level with a broken gun.
 *
 * ---------------------------------------------------------------------------
 * One browser per player, and that is not a detail
 * ---------------------------------------------------------------------------
 * A background *tab* is `document.hidden`, so `requestAnimationFrame` never
 * fires in it - the same thing that stops any of this rendering in the Claude
 * pane. The first version used two tabs in one browser and the second player
 * silently never joined the match, because the frame loop that joins was in a
 * page nobody was looking at.
 */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const XP = process.argv[3] ?? 'shooter'
const ROOM = `probe-${Date.now()}`

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const read = (key) =>
  env
    .split('\n')
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '')

const supabaseUrl = read('NEXT_PUBLIC_SUPABASE_URL')
const anonKey = read('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const ref = new URL(supabaseUrl).hostname.split('.')[0]

/** A real anonymous account, through the same door `enterAsGuest` uses. */
async function mint() {
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  })
  if (!response.ok) throw new Error(`signup failed: ${response.status} ${await response.text()}`)
  return response.json()
}

/** The cookie @supabase/ssr reads, chunked the way it chunks it. */
function cookiesFor(session) {
  const payload = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  const value = 'base64-' + Buffer.from(JSON.stringify(payload)).toString('base64url')
  const key = `sb-${ref}-auth-token`
  if (value.length <= 3180) return [{ name: key, value }]
  const chunks = []
  for (let at = 0; at < value.length; at += 3180) {
    chunks.push({ name: `${key}.${chunks.length}`, value: value.slice(at, at + 3180) })
  }
  return chunks
}

/**
 * One browser per player, not one browser with two tabs.
 *
 * A background tab is `document.hidden`, so `requestAnimationFrame` never fires
 * in it — the same thing that stops the Claude pane rendering any of this. The
 * first attempt used two tabs and the second player simply never joined,
 * because the frame loop that joins is in a page nobody was looking at.
 */
const browsers = []
async function open(label) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      /**
       * A page Chrome decides nobody is looking at stops getting frames, and
       * one browser per player is not enough on its own to prevent it.
       *
       * The symptom is quiet and misleading: presence still says "1 other
       * here", because a roster does not need a frame loop - but the other
       * player sends no position samples, so their body is never drawn and
       * there is nothing in the room to shoot at. Everything looks connected
       * and the level looks empty.
       */
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  })
  browsers.push(browser)
  const session = await mint()
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`)
  })
  await page.setCookie(
    ...cookiesFor(session).map((cookie) => ({ ...cookie, domain: 'localhost', path: '/' })),
  )
  await page.goto(`${BASE}/xp/${XP}?room=${ROOM}`, { waitUntil: 'networkidle2', timeout: 180_000 })
  return { label, page, errors, id: session.user.id }
}

const ana = await open('ana')
const bo = await open('bo')

console.log(`room ${ROOM}`)
console.log(`ana ${ana.id}`)
console.log(`bo  ${bo.id}`)

// Long enough for the sockets to find each other and the arbiter poll to run.
await new Promise((wake) => setTimeout(wake, 12_000))

for (const who of [ana, bo]) {
  const seen = await who.page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  }))
  console.log(`\n${who.label}: ${JSON.stringify(seen)}`)
  if (who.errors.length) console.log(`${who.label} errors:\n  ${who.errors.slice(0, 6).join('\n  ')}`)
}

// --- the vote, driven by keys, which is the whole chain ---------------------

await ana.page.bringToFront()
await ana.page.keyboard.press('KeyB')
await new Promise((wake) => setTimeout(wake, 4000))
console.log(`\nana after B, full text:\n${(await ana.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400)}`)
console.log(`bo after B, full text:\n${(await bo.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400)}`)

await ana.page.keyboard.press('Digit1')
await new Promise((wake) => setTimeout(wake, 1500))
await bo.page.bringToFront()
await bo.page.keyboard.press('Digit1')
await new Promise((wake) => setTimeout(wake, 2500))

console.log(`ana after voting: ${JSON.stringify(await panel(ana))}`)
console.log(`bo  after voting: ${JSON.stringify(await panel(bo))}`)

await ana.page.screenshot({ path: 'ana.png' })
await bo.page.screenshot({ path: 'bo.png' })
for (const browser of browsers) await browser.close()

/** Whatever the vote panel is saying, if anything. */
async function panel(who) {
  return who.page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ')
    const vote = text.match(/vote · \d+s[^♪]*/)
    return { vote: vote?.[0]?.slice(0, 120) ?? null, out: text.includes('watching the rest') }
  })
}
