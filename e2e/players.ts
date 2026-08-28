/**
 * Real signed-in players, in real browsers, against the real local database.
 *
 * The shared half of the e2e specs. Provenance: `scripts/xp-two-players.mjs`,
 * which found two bugs nothing else could reach and whose hard-won details are
 * all reproduced here - the session minting, the cookie chunking, and the four
 * Chrome flags. It stays where it is: it is a *probe*, run by hand with output
 * you read, and this is an assertion you can leave running.
 *
 * ---------------------------------------------------------------------------
 * One browser per player, and that is not a detail
 * ---------------------------------------------------------------------------
 * A background *tab* is `document.hidden`, so `requestAnimationFrame` never
 * fires in it, so the frame loop that joins the room never runs. The first
 * version of the probe used tabs and the second player silently never arrived.
 * Playwright's contexts do not help either - they share a browser, and it is the
 * browser that decides nobody is looking.
 *
 * The flags matter for the same reason and are quieter about it: presence still
 * reports the player, because a roster needs no frames, but they send no
 * position samples - so everything looks connected and the table looks empty.
 *
 * ---------------------------------------------------------------------------
 * Why the session is minted rather than logged in
 * ---------------------------------------------------------------------------
 * `mensch` declares `needs: ["identity"]`, so the page refuses outright without
 * one - there is no anonymous path to the thing under test. Signing in through
 * a UI would make every spec here a test of the login form as well, and the form
 * is not what is being checked. `/auth/v1/signup` with no credentials is the
 * same door `enterAsGuest` uses, so these are real accounts by the same route
 * real players take.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * From the working directory rather than from `import.meta.url`.
 *
 * Not a style choice: this project has no `"type": "module"`, so Playwright
 * transpiles these to CommonJS - and a single `import.meta` in the file flips
 * the loader's mind about which it is, which comes out as `exports is not
 * defined` on line 3 and looks like a broken import. Playwright runs from the
 * project root, so `cwd` is the same answer with none of that.
 */
const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')

function fromEnv(key: string): string {
  const line = env.split('\n').find((one) => one.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} is not in .env.local`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}

const SUPABASE = fromEnv('NEXT_PUBLIC_SUPABASE_URL')
const ANON = fromEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const REF = new URL(SUPABASE).hostname.split('.')[0]

/** The cookie is chunked past this, which `@supabase/ssr` does and reads back. */
const CHUNK = 3180

interface Session {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: number
  user: { id: string }
}

async function mint(): Promise<Session> {
  const response = await fetch(`${SUPABASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  })
  if (!response.ok) {
    throw new Error(
      `signup failed: ${response.status}. Is the local Supabase up? \`bun run dev\` starts it.`,
    )
  }
  return response.json() as Promise<Session>
}

function cookiesFor(session: Session, origin: string) {
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
  const url = new URL(origin)
  const parts =
    value.length <= CHUNK
      ? [{ name: key, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, at) => ({
          name: `${key}.${at}`,
          value: value.slice(at * CHUNK, (at + 1) * CHUNK),
        }))
  return parts.map((one) => ({ ...one, domain: url.hostname, path: '/' }))
}

export interface Player {
  name: string
  id: string
  /**
   * Closed by the spec, and it has to be the *context* rather than the browser.
   *
   * Playwright writes a recording when the context closes. Closing only the
   * browser left a truncated file that ffmpeg refused - which looks like a
   * broken encoder and is a missing `close`.
   */
  context: BrowserContext
  /**
   * This player's own access token, for asking the server what *they* may see.
   *
   * The board is a canvas, so "did this reach the other clients" has no DOM to
   * assert on. The guarantee underneath it does: the arbiter's view is redacted
   * per caller, so calling it with somebody else's token is exactly the question
   * "can this player see that" - asked of the server that answers it in play.
   */
  token: string
  page: Page
  browser: Browser
  /** Everything the page complained about, so a spec can assert none of it. */
  problems: string[]
}

/**
 * What a spec needs beyond a browser in a room.
 */
export interface Opening {
  /**
   * Use the Chrome on this machine rather than Playwright's Chromium.
   *
   * **Only Chrome takes a pointer lock headless.** Chromium refuses it outright
   * - `The root document of this element is not valid for pointer lock` on the
   * page's own console - and `PointerLockControls` turns nothing when it is not
   * locked, so the camera cannot be aimed and `mousedown` is not a shot either:
   * the fire handler ignores every click while `document.pointerLockElement` is
   * null, deliberately, so that the click which *takes* the lock is not a round
   * fired into whatever was under the cursor.
   *
   * Which makes this the difference between a spec that can play a shooter and
   * one that can only walk around in it. Off by default, because everything
   * else here works in Chromium and depending on a browser somebody installed
   * is worth doing only where it buys something.
   */
  chrome?: boolean
  /**
   * Open the level with `?debug=1`, so the readout card is in the DOM.
   *
   * Where you are standing and which way you are pointing, which is otherwise
   * unanswerable from outside the canvas - the level is one WebGL context and
   * has no DOM for a coordinate. The card is closed until something clicks its
   * heading; `readout()` below does that for you.
   */
  debug?: boolean
}

/** Chrome, where a Mac puts it. */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * Open one player: their own browser, their own account, the same room.
 *
 * SwiftShader because CI machines and this one both lack a GPU worth trusting,
 * and because a WebGL context that silently falls back to nothing looks exactly
 * like a level that failed to load.
 */
export async function openPlayer(
  name: string,
  base: string,
  room: string,
  xp: string,
  opening: Opening = {},
) {
  const browser = await chromium.launch({
    ...(opening.chrome ? { executablePath: CHROME } : {}),
    /**
     * Watchable, with `HEADED=1`.
     *
     *     HEADED=1 bun run xp:e2e
     *
     * Three windows open and play the game in front of you, which is a different
     * thing from the assertions passing and is worth having: every bug this file
     * has found so far was *visible* first and only then expressible - a die that
     * came back a second after every move, a turn that would not start, a cursor
     * that never reached a piece. A run you can watch is how the next one gets
     * noticed.
     *
     * `SLOW` puts a pause between actions so a press is something you can see
     * rather than a frame you miss. It costs nothing when headless because
     * nobody is looking.
     */
    headless: process.env.HEADED !== '1',
    ...(process.env.HEADED === '1' ? { slowMo: Number(process.env.SLOW ?? 250) } : {}),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      // A page Chrome decides nobody is looking at stops getting frames, and one
      // browser per player is not enough on its own to stop it.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  })
  const session = await mint()
  /**
   * Three windows that do not sit on top of each other, when somebody is watching.
   *
   * Smaller and offset per player, because three 1280-wide windows stacked at
   * the origin is one window as far as anybody can tell - and the whole point of
   * a headed run is seeing all three at once.
   */
  const headed = process.env.HEADED === '1'
  const size = headed ? { width: 720, height: 540 } : { width: 1280, height: 800 }
  /**
   * `VIDEO=1` records what each player saw, into `e2e/video/`.
   *
   * Because "does it feel right" is not a question an assertion can answer, and
   * it is the one that matters most for a game. The clip is written when the
   * context closes, so every spec has to shut its players down - which they do
   * in a `finally`.
   */
  const context = await browser.newContext({
    viewport: size,
    ...(process.env.VIDEO === '1'
      ? { recordVideo: { dir: 'e2e/video', size } }
      : {}),
  })
  await context.addCookies(cookiesFor(session, base))

  const page = await context.newPage()
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 300)}`)
  })

  const query = `?room=${room}${opening.debug ? '&debug=1' : ''}`
  await page.goto(`${base}/xp/${xp}${query}`, { waitUntil: 'load', timeout: 180_000 })
  return {
    name,
    id: session.user.id,
    token: session.access_token,
    context,
    page,
    browser,
    problems,
  } satisfies Player
}

/** A room nobody else is in, so two runs at once cannot seat each other. */
export function freshRoom(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * The arbiter's view, as one particular player sees it.
 *
 * The same RPC the running client polls, called with that player's own token so
 * the server redacts it the same way. Used where the thing under test is shared
 * state rather than something drawn - a piece is pixels, and "everybody agrees
 * it moved" is a fact about the table.
 */
export async function arbiterView(player: Player, room: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${SUPABASE}/rest/v1/rpc/xp_arbiter_view`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      authorization: `Bearer ${player.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_instance: room }),
  })
  if (!response.ok) throw new Error(`view failed for ${player.name}: ${response.status}`)
  return response.json() as Promise<Record<string, unknown>>
}

/**
 * Where a player is standing and which way they are pointing.
 *
 * The one thing about a running level that has no DOM: everything a spec can
 * normally read - the phase, the seat, the score, health, ammunition - is HUD
 * text, and a coordinate is not. `?debug=1` puts the readout card on the page
 * (`Opening.debug`), and this opens it and reads it.
 *
 * `facing` is in the document's own degrees: zero looks along `+z`, the way a
 * mark faces. So a bearing read back here and a `facing` typed into a spawn
 * mean the same thing, which is what makes it usable for aiming.
 *
 * Null when the card is not there, which is the honest answer to "did you open
 * this player with `debug: true`".
 */
export async function readout(
  player: Player,
): Promise<{ x: number; y: number; z: number; facing: number } | null> {
  /*
   * Opened through the DOM rather than with the mouse, on the rare page where
   * it is not already open.
   *
   * `?debug=1` starts it open, so this is usually a no-op. When it is not, a
   * real click is the wrong tool twice over: once the pointer is locked the
   * canvas takes every click, and a click that *did* reach the page would be a
   * round fired at whatever was in front of the player. `element.click()`
   * dispatches a `click` and no `mousedown`, and the fire handler listens for
   * the latter.
   */
  const heading = player.page.getByRole('button', { name: /Debug/i }).first()
  if ((await heading.count()) === 0) return null
  if ((await heading.getAttribute('aria-expanded')) !== 'true') {
    await heading.evaluate((element: HTMLElement) => element.click())
    await player.page.waitForTimeout(150)
  }

  const text = (await player.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const at = text.match(/at (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/)
  const facing = text.match(/facing (-?\d+)°/)
  if (!at || !facing) return null

  return { x: Number(at[1]), y: Number(at[2]), z: Number(at[3]), facing: Number(facing[1]) }
}

/**
 * Turn a player until they are pointing at a spot, and say what they ended on.
 *
 * ---------------------------------------------------------------------------
 * Closed on the readout rather than computed once
 * ---------------------------------------------------------------------------
 * The arithmetic is a single line - `PointerLockControls` turns the camera by
 * `movementX * 0.002` radians and `facing` is that rotation plus a half turn -
 * so a spec *could* work out one number and dispatch it. It should not. Its
 * pointer speed is a default somebody may change, the readout is rounded to
 * whole degrees, and a shot fired at a bearing nobody checked is a miss that
 * reads as the gun being broken. Turning a bit and looking again costs three
 * round trips and cannot be quietly wrong.
 *
 * Which also means this is the first thing that depends on the bearing being on
 * the readout at all. Before that a probe could only sweep and hope, and the
 * note at the top of `scripts/xp-two-players.mjs` said so in as many words.
 *
 * `movementX`, dispatched by hand: under pointer lock the camera is drei's
 * `PointerLockControls`, which reads that property, and a synthesised
 * `mouse.move` does not carry one - so `page.mouse` turns nothing at all.
 */
export async function aimAt(
  player: Player,
  spot: { x: number; z: number },
  /** Degrees. One is well inside the width of a body at any range worth firing at. */
  tolerance = 1,
): Promise<number | null> {
  /** drei's own factor, and the reason this loops rather than trusting it. */
  const RADIANS_PER_UNIT = 0.002

  for (let tries = 0; tries < 8; tries++) {
    const here = await readout(player)
    if (!here) return null

    // The document's convention, which is what `facing` is in: zero along +z.
    const wanted = (Math.atan2(spot.x - here.x, spot.z - here.z) * 180) / Math.PI
    // The short way round, so aiming at something behind you does not spin
    // three quarters of a turn to get there.
    const off = ((((wanted - here.facing) % 360) + 540) % 360) - 180
    if (Math.abs(off) <= tolerance) return here.facing

    // Turning right lowers the bearing, hence the sign. See the note above for
    // why this is a nudge and not the answer.
    const movementX = Math.round((-off * Math.PI) / 180 / RADIANS_PER_UNIT)
    await player.page.evaluate((by) => {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: by }))
    }, movementX)

    /**
     * Wait for the *readout* to move, not for a stopwatch.
     *
     * The number on the card is several steps behind the camera: the frame loop
     * reports a position a few times a second, that lands in React state, an
     * effect publishes it to the store, and the card re-renders off the store.
     * Under software rendering on a busy level that round trip is comfortably
     * longer than any fixed pause worth writing.
     *
     * A fixed one turned this loop into an overshoot machine, which is worth
     * describing because it looks nothing like a timing bug: every pass read the
     * *previous* bearing, decided it had not moved, and nudged again for the
     * same error - so three passes applied three corrections for one, and the
     * aim sailed past the target and oscillated. It ended 9.8 degrees off, which
     * reads as bad arithmetic rather than as a stale read.
     */
    for (let settling = 0; settling < 40; settling++) {
      await player.page.waitForTimeout(100)
      const now = await readout(player)
      if (now && now.facing !== here.facing) break
    }
  }

  return (await readout(player))?.facing ?? null
}
