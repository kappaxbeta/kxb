/**
 * Two real browsers, two real cameras, one lounge.
 *
 *     node scripts/faces-two-browsers.mjs          # headless
 *     HEADED=1 node scripts/faces-two-browsers.mjs # watch it
 *
 * A probe, run by hand with output you read, in the shape `scripts/`
 * already uses for `xp-two-players.mjs`. It turns the `faces` flag on for this
 * machine, mints two accounts into a local space, and puts a camera in front of
 * each of them - which is the only way to find out whether a picture actually
 * crosses between two browsers, since one tab cannot be both ends of a call.
 *
 * It wants a quiet machine. Two headless SwiftShader contexts and a dev server
 * is already most of a laptop; with anything else running, the scene does not
 * finish loading inside the timeouts and the run tells you nothing.
 *
 * Chrome rather than Chromium because only Chrome takes a pointer lock
 * headless, and without the lock nobody can walk - see e2e/players.ts. The two
 * fake-device flags give each browser a synthetic camera and answer the
 * permission prompt for it, which is the only way a headless run can have a
 * picture at all.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const SLUG = process.env.SLUG ?? 'alpha'
const TENANT = process.env.TENANT ?? '1ead3467-af3e-4c9b-9a22-3c01e380fe74'
const OUT = process.env.OUT ?? '.'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const env = readFileSync('.env.local', 'utf8')
const fromEnv = (key) => {
  const line = env.split('\n').find((one) => one.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} missing`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}
const SUPABASE = fromEnv('NEXT_PUBLIC_SUPABASE_URL')
const ANON = fromEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const REF = new URL(SUPABASE).hostname.split('.')[0]
const CHUNK = 3180

function sql(statement) {
  return execFileSync('docker', [
    'exec', 'supabase_db_unkown.t', 'psql', '-U', 'postgres', '-d', 'postgres',
    '-t', '-A', '-c', statement,
  ]).toString().trim()
}

async function mint() {
  const response = await fetch(`${SUPABASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  })
  if (!response.ok) throw new Error(`signup ${response.status}`)
  return response.json()
}

function cookiesFor(session) {
  const payload = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  const value = `base64-${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  const key = `sb-${REF}-auth-token`
  const parts =
    value.length <= CHUNK
      ? [{ name: key, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, at) => ({
          name: `${key}.${at}`,
          value: value.slice(at * CHUNK, (at + 1) * CHUNK),
        }))
  return parts.map((one) => ({ ...one, domain: 'localhost', path: '/' }))
}

async function open(label, session) {
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
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } })
  await context.grantPermissions(['camera', 'microphone'], { origin: BASE })

  /**
   * Open mic, chosen before the page loads.
   *
   * The default is push-to-talk, which is right for people and useless here:
   * asserting that audio crossed would mean holding a key for the length of a
   * negotiation. The preference is per device and lives in localStorage, so
   * writing it in an init script is the same act as choosing it at the door.
   */
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('unkown.voice', 'open')
    } catch {
      // A context that refuses storage falls back to push-to-talk, and the
      // audio assertion below will say so rather than hanging.
    }
  })
  await context.addCookies(cookiesFor(session))
  const page = await context.newPage()
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${label}: ${message.text()}`)
    if (message.text().startsWith('[faces]')) console.log(`${label} ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`))
  return { label, browser, context, page, problems, id: session.user.id }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A screenshot through CDP rather than Playwright's.
 *
 * `page.screenshot` waits for the page to hold still, and this page is a canvas
 * drawing sixty times a second - it never does, so the call sits there until it
 * times out. `Page.captureScreenshot` takes whatever is on the screen now,
 * which is the only question being asked.
 */
async function shoot(player, path) {
  const cdp = await player.context.newCDPSession(player.page)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data, 'base64'))
  await cdp.detach()
  console.log(`${player.label} shot ->`, path)
}

async function enter(player) {
  // Generous: the first hit on a dev server compiles the route, and this scene
  // is a large one.
  await player.page.goto(`${BASE}/t/${SLUG}/lounge`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await player.page.waitForSelector('canvas', { timeout: 120_000 })
  await wait(6000)

  // The cookie banner and the controls panel both sit over the world, and a
  // click meant for the floor lands on whichever of them is in the way.
  await player.page.evaluate(() => {
    const consent = [...document.querySelectorAll('button')].find((one) =>
      /verstanden|accept|got it/i.test(one.textContent ?? ''),
    )
    consent?.click()
    const close = [...document.querySelectorAll('button')].find((one) =>
      /close controls|steuerung schlie/i.test(one.getAttribute('aria-label') ?? ''),
    )
    close?.click()
  })
  await wait(800)

  // The entry gate: a click on the world takes the pointer lock.
  await player.page.mouse.click(650, 300)
  await wait(2500)

  // The controls panel comes back when the player enters, so it is closed
  // *after* the click rather than before it. By its own X rather than by H -
  // H is a toggle, and pressing it on a closed panel opens one.
  await player.page.evaluate(() => {
    const close = [...document.querySelectorAll('button')].find((one) =>
      /close controls|steuerung schlie/i.test(one.getAttribute('aria-label') ?? ''),
    )
    close?.click()
  })
  await wait(600)
  // Closing it drops the pointer lock, so the world needs one more click.
  await player.page.mouse.click(650, 300)
  await wait(1500)
  console.log(
    `${player.label} locked:`,
    await player.page.evaluate(() => Boolean(document.pointerLockElement)),
  )
}

async function camera(player) {
  const pressed = await player.page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((one) =>
      /face|camera|kamera|gesicht/i.test(
        `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`,
      ),
    )
    if (!button) return null
    button.click()
    return button.getAttribute('aria-label')
  })
  console.log(`${player.label} pressed:`, pressed)
  return pressed
}

async function faces(player) {
  return player.page.evaluate(() => document.querySelectorAll('video').length)
}

/**
 * How many voices this page is playing.
 *
 * `<audio>` elements, because that is what `peer-voice` parks in the document
 * to keep the WebAudio graph fed - one per peer being heard. Our own microphone
 * makes none: it goes onto the wire and is never played back locally, which is
 * the difference between a voice chat and a feedback loop.
 */
async function voices(player) {
  return player.page.evaluate(() => document.querySelectorAll('audio').length)
}

/** Press the microphone switch, the same way `camera` presses its own. */
async function mic(player) {
  const pressed = await player.page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((one) =>
      /microphone|mikrofon|be heard|h\u00f6ren/i.test(
        `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`,
      ),
    )
    if (!button) return null
    button.click()
    return button.getAttribute('aria-label')
  })
  console.log(`${player.label} mic:`, pressed)
  return pressed
}

const main = async () => {
  // The flag, for this machine only.
  sql(`insert into feature_flags (key, enabled, label) values ('faces', true, 'Faces in the lounge')
       on conflict (key) do update set enabled = true`)

  const [oneSession, twoSession] = await Promise.all([mint(), mint()])
  const joined = [oneSession.user.id, twoSession.user.id]
  for (const id of joined) {
    sql(`insert into tenant_members (tenant_id, user_id, role, joined_at)
         values ('${TENANT}', '${id}', 'member', now())
         on conflict do nothing`)
  }
  console.log('players:', joined.join(' '))

  /**
   * Put the two of them back out again, whatever happens next.
   *
   * Not tidiness. Every run used to leave two members behind, and `seat_limit`
   * is a real flag: at sixty-nine members the space was over its cap, being
   * over the cap shelves people, and the *second* player of every pair was the
   * one shelved. Which reads exactly like a scene that will not load - a
   * 120-second timeout waiting for a canvas that was never going to come - and
   * cost most of a morning to see. A probe that grows the space it measures
   * eventually measures the growing.
   */
  const leave = () => {
    for (const id of joined) {
      sql(`delete from tenant_members
           where tenant_id = '${TENANT}' and user_id = '${id}'`)
    }
  }
  process.on('exit', leave)

  const one = await open('one', oneSession)
  const two = await open('two', twoSession)

  await enter(one)
  await enter(two)

  console.log('peers seen by one:', await one.page.evaluate(() => document.body.innerText.slice(0, 400)))

  await camera(one)
  await camera(two)
  await mic(one)
  await mic(two)
  // Generous: a link that has to be rebuilt once waits on the watchdog, and on
  // a busy machine the first negotiation is not instant either.
  await wait(20_000)

  console.log('videos in one:', await faces(one), 'videos in two:', await faces(two))

  for (const player of [one, two]) {
    const state = await player.page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((one) =>
        /face|camera|kamera|gesicht/i.test(
          `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`,
        ),
      )
      return {
        cameraOn: button?.getAttribute('aria-pressed'),
        // Every video on the page: our own, plus one per face that reached us.
        videos: [...document.querySelectorAll('video')].map((video) => ({
          w: video.videoWidth,
          h: video.videoHeight,
          playing: !video.paused,
        })),
      }
    })
    console.log(player.label, JSON.stringify(state))
  }

  // They spawn on the same paving, which puts one camera inside the other
  // body. Back player one off until there is a person to look at.
  await one.page.keyboard.down('KeyS')
  await wait(1600)
  await one.page.keyboard.up('KeyS')
  await wait(3000)

  console.log('videos after backing off:', await faces(one), await faces(two))
  console.log('voices heard:', await voices(one), await voices(two))

  for (const player of [one, two]) await shoot(player, `${OUT}/faces-${player.label}.png`)

  console.log('problems:', [...one.problems, ...two.problems].slice(0, 12))

  if (process.env.HEADED === '1') await wait(20_000)
  await one.context.close(); await one.browser.close()
  await two.context.close(); await two.browser.close()
}

/** Smaller than a real window: the lounge is fill-rate bound, and two of these
 *  are rendering on the CPU at once. */

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
