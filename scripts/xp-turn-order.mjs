/**
 * Two players at a board, and the turn between them.
 *
 * The sibling of `xp-two-players.mjs` and for the same reason: `bun test` is
 * pure and the SQL checks call `xp_arbitrate` directly, so neither can see the
 * half of a turn that lives in a client — a `turn` the view carries, a line in
 * the HUD, and a refusal that has to be *said* rather than swallowed.
 *
 * What it asks, in order:
 *
 *   1. A room taking no turns says nothing about any.
 *   2. A `use` press on a piece ends in `pass`, which **seats the table** - the
 *      whole of 20261107000000, and what `mensch` could never do before it.
 *   3. The other player, once they are playing too, reads the same table.
 *   4. The player whose turn it is not is refused, in the HUD, during play.
 *
 *   npm i puppeteer-core            # anywhere; run it from there
 *   node scripts/xp-turn-order.mjs [base] [xpId]
 *
 * ⚠️ Read the header of `xp-two-players.mjs` first. Everything it says about
 * one browser per player, about background tabs having no frame loop, and about
 * concurrent dev servers making a warm page look broken, applies here unchanged.
 *
 * ---------------------------------------------------------------------------
 * What it got to, and where it stopped
 * ---------------------------------------------------------------------------
 * **1 and 2 are proved.** A room with nobody passing says nothing about turns,
 * and one `E` at the seat put *your turn* on the screen in a room of one and
 * `<somebody>'s turn` in a room of two - which is the whole chain: the press
 * reaches the piece, `pass` reaches the arbiter, the table seats itself, and the
 * answer comes back far enough to be drawn.
 *
 * **3 is the one still open**, and the obstacle is this harness rather than the
 * level: the pointer lock follows the window the operating system has fronted,
 * so the second browser cannot hold one while the first is playing, and a client
 * that never took the pointer is not a client whose screen proves anything. Hand
 * it back and forth, as this does now - on a quiet machine. On a loaded one the
 * lock is refused and `Runtime.callFunctionOn` times out mid-check, which looks
 * exactly like a level that ignores every key and is not.
 */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const XP = process.argv[3] ?? 'mensch'
const ROOM = `turn-${Date.now()}`

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

const browsers = []
async function open(label) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    /**
     * Thirty seconds is not enough on a machine running the dev server, and the
     * failure is a `Runtime.callFunctionOn timed out` in the middle of a check
     * that was going to pass. Two SwiftShader browsers and a `next dev` share
     * one laptop; a frame loop that stalls for a moment is this harness's
     * ordinary weather rather than a bug in the level.
     */
    protocolTimeout: 180_000,
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

const text = (who) =>
  who.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim())

const wait = (ms) => new Promise((wake) => setTimeout(wake, ms))

const ana = await open('ana')
const bo = await open('bo')

console.log(`room ${ROOM}`)
console.log(`ana  ${ana.id}`)
console.log(`bo   ${bo.id}`)

// Long enough for both sockets to find each other and the arbiter poll to run.
await wait(12_000)

console.log('\n--- 1. nobody is taking turns yet')
for (const who of [ana, bo]) {
  const seen = await text(who)
  console.log(`${who.label}: turn line? ${/turn/i.test(seen)} | ${seen.slice(0, 160)}`)
}

/**
 * The pointer, and only one browser can have it.
 *
 * Keys reach the level while it holds the pointer, which is what *click to
 * look* in the corner says - and the lock follows the window the operating
 * system has fronted, so two browsers cannot both hold one. That is why this
 * hands the pointer back and forth rather than locking both at the start, and
 * why a run where nobody clicked reads as a level that ignores every key.
 */
async function take(who) {
  await who.page.bringToFront()
  for (let tries = 0; tries < 5; tries += 1) {
    await who.page.mouse.click(640, 400)
    await wait(700)
    if (await who.page.evaluate(() => document.pointerLockElement !== null)) return true
  }
  return false
}

const turnLine = async (who) => {
  const seen = await text(who)
  return seen.match(/(your turn|[^ ]+'s turn)/i)?.[0] ?? null
}

console.log('\n--- 2. ana presses use: the piece moves and the table is seated')
console.log(`ana has the pointer: ${await take(ana)}`)
/**
 * A press, and two and a half seconds.
 *
 * `mensch` is `{ on: 'pressed', key: 'use', within: 2 }` on each piece, so the
 * input is the use key and not a click, and the answer is a round trip: the
 * piece moves on this frame and *whose turn it is* comes back from the arbiter.
 * A check a few hundred milliseconds later reads a HUD telling the truth about
 * a question nobody has answered yet.
 */
await ana.page.keyboard.press('KeyE')
await wait(2500)
console.log(`ana: ${(await turnLine(ana)) ?? 'no turn line'}`)

console.log('\n--- 3. bo takes the pointer, and reads the same table')
console.log(`bo has the pointer: ${await take(bo)}`)
await wait(3000)
console.log(`bo: ${(await turnLine(bo)) ?? 'no turn line'}`)

console.log('\n--- 4. ana presses again, out of turn, and is told so where she is playing')
await take(ana)
await ana.page.keyboard.press('KeyE')
await wait(2500)
const after = await text(ana)
console.log(`ana: refused? ${/not your turn/i.test(after)} | ${(await turnLine(ana)) ?? 'no turn line'}`)
console.log(`   ${after.slice(0, 200)}`)

for (const who of [ana, bo]) {
  if (who.errors.length) console.log(`\n${who.label} errors:\n  ${who.errors.slice(0, 6).join('\n  ')}`)
}

for (const browser of browsers) await browser.close()
