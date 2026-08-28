/**
 * Two players walking through one door, in two real browsers.
 *
 * The check S1 exists for. The scene is part of the Realtime topic
 * (`<roomId>/<scene>`), so a door is a thing every client in the room has to
 * agree on *at the same moment* - and the failure it guards against is quiet
 * rather than loud: one client changes topic, the other does not, both keep
 * rendering happily, and the two of them are in a room with nobody in it.
 * Nothing in `bun test` can see that, because none of it runs two clients.
 *
 * What it asserts, and why each one is needed:
 *
 *   1. **Both see one other person** before anything happens. Without this the
 *      rest proves nothing - two people who were never in the same topic will
 *      also "agree" after a door.
 *   2. **Both are looking at the cellar** afterwards, read off the HUD's own
 *      count of what is in front of you: nine placements in the lobby, four in
 *      the cellar.
 *   3. **Both still see one other person.** This is the whole of it. The
 *      counts moving proves each client swapped its world; the peer count
 *      surviving proves they swapped to the *same topic*, because presence on
 *      `<room>/cellar` is the only way to still be counted.
 *
 * ---------------------------------------------------------------------------
 * How to run it
 * ---------------------------------------------------------------------------
 * Like `./xp-two-players.mjs`, which this is a sibling of and which carries the
 * long version of every mechanical note below - one browser per player (a
 * background tab gets no `requestAnimationFrame`, so the second player silently
 * never joins), a hand-built Supabase cookie, and Chrome on SwiftShader.
 *
 *   npm i puppeteer-core            # anywhere; NODE_PATH at that node_modules
 *   bun run dev                     # a real app, not a fixture
 *   node scripts/xp-two-rooms.mjs [base] [xpId]
 *
 * ⚠️ Check nothing else is already running a dev server. Several `next dev`
 * across concurrent sessions takes a warm page to eighty seconds, and a timeout
 * on `goto` looks exactly like the app being broken.
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const XP = process.argv[3] ?? 'two-rooms'
const ROOM = `rooms-${Date.now()}`

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
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      // A page Chrome decides nobody is looking at stops getting frames, and
      // one browser per player is not enough on its own to prevent it.
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
  /**
   * `domcontentloaded`, not `networkidle2`.
   *
   * A dev server never goes idle - HMR holds a socket open, and once the level
   * is up so does Realtime - so waiting for two quiet seconds of network is
   * waiting for something that will not happen. What is actually being waited
   * for is the level, so that is what is waited for: the HUD prints its count
   * of what is in the room, and it prints it once there is a room.
   */
  await page.goto(`${BASE}/xp/${XP}?room=${ROOM}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  })
  await page.waitForFunction(() => /\d+ placements/.test(document.body.innerText), {
    timeout: 180_000,
    polling: 500,
  })
  return { label, page, errors, id: session.user.id }
}

/**
 * What the HUD says about where somebody is standing.
 *
 * Read off the rendered text rather than out of React, because the point of
 * this file is to check what a person would actually see. `placements` is the
 * count of what is in the room in front of you - nine in the lobby, four in the
 * cellar - and `others` is presence on the scene topic.
 */
async function where(who) {
  return who.page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ')
    return {
      placements: Number(text.match(/(\d+) placements/)?.[1] ?? -1),
      entities: Number(text.match(/(\d+) entities/)?.[1] ?? -1),
      others: Number(text.match(/(\d+) other/)?.[1] ?? 0),
      // Three bare numbers on their own line - see `readout` in ../_runtime/hud.
      at: text.match(/(-?\d+\.\d) (-?\d+\.\d) (-?\d+\.\d)/)?.slice(1).join(' ') ?? null,
    }
  })
}

const ana = await open('ana')
const bo = await open('bo')

console.log(`room ${ROOM}`)
console.log(`ana ${ana.id}`)
console.log(`bo  ${bo.id}`)

/**
 * Waited for rather than slept through.
 *
 * Twelve seconds was not enough on a machine running three dev servers, and a
 * fixed sleep that is sometimes too short is a check that sometimes passes for
 * the wrong reason - the first assertion below would read "0 others" and call
 * it a room. Presence is the thing being waited for, so that is what is polled.
 */
for (const who of [ana, bo]) {
  await who.page.waitForFunction(() => /\d+ other/.test(document.body.innerText), {
    timeout: 90_000,
    polling: 500,
  })
}

const before = { ana: await where(ana), bo: await where(bo) }
console.log(`\nbefore  ana ${JSON.stringify(before.ana)}`)
console.log(`before  bo  ${JSON.stringify(before.bo)}`)
for (const who of [ana, bo]) {
  if (who.errors.length) console.log(`${who.label} errors:\n  ${who.errors.slice(0, 6).join('\n  ')}`)
}

/**
 * Ana walks onto the pad, and only Ana.
 *
 * Held for a minute, and that is not padding. Chrome on SwiftShader renders
 * few enough frames that the controller integrates about an eighth of a cell a
 * second, so crossing four cells is forty seconds of walking - and a run that
 * gave up after two would report "did not reach the cellar", which reads
 * exactly like the door being broken.
 *
 * The lock is checked rather than assumed, for the same reason: without it the
 * keys go nowhere, and that failure is indistinguishable from the feature not
 * working.
 */
await ana.page.bringToFront()
await ana.page.mouse.click(640, 400)
await new Promise((wake) => setTimeout(wake, 800))
const locked = await ana.page.evaluate(() => document.pointerLockElement !== null)
console.log(`ana has the controls: ${locked}`)

let last = (await where(ana)).at
await ana.page.keyboard.down('KeyW')
for (let tick = 0; tick < 14; tick += 1) {
  await new Promise((wake) => setTimeout(wake, 5000))
  const step = await where(ana)
  console.log(`  ana ${step.at} (${step.placements} placements)`)
  if (step.placements === 4) break
  /**
   * Taking the controls again when nothing moved.
   *
   * The lock is reported as taken and the keys still go nowhere often enough to
   * matter - a click that landed while the canvas was still mounting, most
   * likely. Retrying is cheap and the alternative is a run that reports the
   * door as broken because nobody ever walked to it.
   */
  if (step.at === last && tick > 0) {
    await ana.page.keyboard.up('KeyW')
    await ana.page.mouse.click(640, 400)
    await ana.page.keyboard.down('KeyW')
  }
  last = step.at
}
await ana.page.keyboard.up('KeyW')

// The door, the broadcast, the other client adopting it, and two topic joins.
await new Promise((wake) => setTimeout(wake, 6000))

const after = { ana: await where(ana), bo: await where(bo) }
console.log(`\nafter   ana ${JSON.stringify(after.ana)}`)
console.log(`after   bo  ${JSON.stringify(after.bo)}`)

const checks = [
  ['both were in one room to start with', before.ana.others === 1 && before.bo.others === 1],
  /**
   * Named, because without it the run passes for the wrong reason. A pad whose
   * box happens to cover the spawn sends everybody down on the first frame, and
   * then "both are in the cellar" is true and proves nothing about doors.
   */
  ['and both started in the lobby', before.ana.placements === 9 && before.bo.placements === 9],
  ['ana is in the cellar', after.ana.placements === 4],
  ['bo came too', after.bo.placements === 4],
  ['and they can still see each other', after.ana.others === 1 && after.bo.others === 1],
]
console.log('')
for (const [what, ok] of checks) console.log(`${ok ? 'yes' : 'NO '} - ${what}`)

/**
 * Into the OS temp directory, not the repo.
 *
 * The first version wrote them beside `package.json` and another lane's `git
 * add` swept two binaries into a commit about something else. A probe leaves
 * nothing behind in a tree several sessions are staging out of.
 */
const shots = `${tmpdir()}/xp-two-rooms`
mkdirSync(shots, { recursive: true })
await ana.page.screenshot({ path: `${shots}/ana.png` })
await bo.page.screenshot({ path: `${shots}/bo.png` })
console.log(`\nscreenshots in ${shots}`)
for (const browser of browsers) await browser.close()

process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
