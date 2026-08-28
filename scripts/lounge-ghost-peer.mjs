/**
 * One real browser, one fake peer on the wire.
 *
 *     node scripts/lounge-ghost-peer.mjs
 *     HEADED=1 node scripts/lounge-ghost-peer.mjs
 *
 * A probe for the two halves of a hit, asked separately - which is the whole
 * reason it is not `faces-two-browsers.mjs` with a dash bolted on. A second
 * headless scene costs a browser, a GPU context and two minutes, and it can only
 * ever answer "did anything happen". This joins the room from node instead:
 *
 *   - The ghost broadcasts `move` from three blocks in front of the player, so
 *     there is a body to charge at. If the player's HUD shows a hit mark, the
 *     *sending* half works - the sweep was judged and a `hit` went out.
 *   - The ghost listens for that `hit`, so we see the packet itself.
 *   - The ghost then sends a `hit` back, addressed to the player. If the HEALTH
 *     readout drops, the *receiving* half works.
 *
 * Whichever half is broken, this says which.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = 'http://localhost:3000'
const SLUG = process.env.SLUG ?? 'alpha'
const TENANT = process.env.TENANT ?? '1ead3467-af3e-4c9b-9a22-3c01e380fe74'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
/**
 * What the player joins as.
 *
 * `admin` can flip the room to battle mode from the HUD, which is what makes the
 * probe self-contained. `member` is the interesting comparison: the same hit,
 * the same wire, one fewer grant on the person receiving it.
 */
const ROLE = process.env.ROLE ?? 'admin'

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
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(`${SUPABASE}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    })
    if (response.ok) {
      const session = await response.json()
      if (session?.access_token) return session
    }
    await wait(5000)
  }
  throw new Error('signup kept failing')
}

/**
 * A second token, minted *after* the membership row exists.
 *
 * The role rides in the JWT, so a token issued a moment before the insert is a
 * token that says "nobody to this space" for its whole life - and an anonymous
 * session with no role is not a stranger, it is a guest whose visit ended, so
 * `requireTenant` sends it to `/g/left`. Which reads as "the lounge would not
 * load" and has nothing to do with the lounge. See `src/lib/tenant.ts`.
 */
async function refresh(session) {
  const response = await fetch(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  if (!response.ok) return session
  const next = await response.json()
  return next?.access_token ? { ...next, user: next.user ?? session.user } : session
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  let player = await mint()
  let ghost = await mint()
  const joined = [player.user.id, ghost.user.id]
  /**
   * The player joins as an admin, the ghost as a member.
   *
   * Not vanity: the mode switch in the HUD is `hasRole(['owner', 'admin'])`, and
   * a probe that cannot turn battle mode on is a probe that can only ever report
   * that a dash in a creative room does nothing - which is the design.
   */
  sql(`insert into tenant_members (tenant_id, user_id, role, joined_at)
       values ('${TENANT}', '${player.user.id}', '${ROLE}', now())
       on conflict (tenant_id, user_id) do update set role = '${ROLE}'`)
  sql(`insert into tenant_members (tenant_id, user_id, role, joined_at)
       values ('${TENANT}', '${ghost.user.id}', 'member', now())
       on conflict do nothing`)
  process.on('exit', () => {
    for (const id of joined) {
      sql(`delete from tenant_members where tenant_id = '${TENANT}' and user_id = '${id}'`)
    }
  })
  player = await refresh(player)
  ghost = await refresh(ghost)
  console.log('player:', player.user.id)
  console.log('ghost :', ghost.user.id)

  // --- the ghost -----------------------------------------------------------

  const supabase = createClient(SUPABASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${ghost.access_token}` } },
  })
  supabase.realtime.setAuth(ghost.access_token)

  const topic = `lounge:${TENANT}`
  const channel = supabase.channel(topic, {
    config: { private: true, presence: { key: ghost.user.id } },
  })

  let pose = null
  const hits = []
  const heard = new Map()
  let sequence = 1

  channel
    .on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload?.u === player.user.id) pose = payload
    })
    .on('broadcast', { event: 'hit' }, ({ payload }) => {
      hits.push(payload)
      console.log('ghost heard hit:', JSON.stringify(payload))
    })
    .on('broadcast', { event: 'push' }, ({ payload }) => {
      console.log('ghost heard push:', JSON.stringify(payload))
    })
    .on('broadcast', { event: '*' }, ({ event }) => {
      heard.set(event, (heard.get(event) ?? 0) + 1)
    })
    .on('presence', { event: 'sync' }, () => {
      console.log('ghost roster:', JSON.stringify(Object.keys(channel.presenceState())))
    })

  await new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      console.log('ghost channel:', status)
      if (status === 'SUBSCRIBED') {
        channel.track({
          userId: ghost.user.id,
          name: 'Ghost',
          avatar: 'penguin',
          conn: 'ghost-1',
          perf: false,
          face: false,
        }).then((outcome) => console.log('ghost track:', outcome))
        resolve()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status))
    })
  })

  /** Three blocks along whatever the player is facing, restated at `SEND_HZ`. */
  const AHEAD = 3
  let ghostPose = { x: 0, y: 2, z: 0 }
  const stepping = setInterval(() => {
    if (pose) {
      ghostPose = {
        x: pose.x + AHEAD * Math.sin(pose.r),
        y: pose.y,
        z: pose.z + AHEAD * Math.cos(pose.r),
      }
    }
    void channel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        u: ghost.user.id,
        x: ghostPose.x,
        y: ghostPose.y,
        z: ghostPose.z,
        // Facing the player, so the body is not standing with its back turned.
        r: pose ? pose.r + Math.PI : 0,
        d: false,
        t: performance.now(),
        h: 100,
      },
    })
  }, 125)

  // --- the player ----------------------------------------------------------

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
  await context.addCookies(cookiesFor(player))
  const page = await context.newPage()
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))

  await page.goto(`${BASE}/t/${SLUG}/lounge`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  })
  console.log('landed on:', page.url())
  await page.waitForSelector('canvas', { timeout: 180_000 })
  /*
   * And wait for it to be a real size.
   *
   * A fresh <canvas> is 300x150 until R3F measures its container, and on a busy
   * machine that can be seconds after the element appears. Clicking the middle
   * of a 300x150 canvas takes a pointer lock on nothing useful - or on a panel
   * over it - and every reading after that is about a player who never entered.
   */
  for (let attempt = 0; attempt < 60; attempt++) {
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
  await wait(8000)

  await page.evaluate(() => {
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
  /**
   * The middle of the biggest canvas on the page, measured rather than guessed.
   *
   * `page.mouse.click(650, 300)` is what the faces probe does and it is a
   * coin toss: the rail and the block picker both sit over the world, and a
   * click that lands on either of them takes no pointer lock - which reads
   * downstream as "the dash does nothing" for a reason that has nothing to do
   * with the dash. Playwright's own `boundingBox` is no good here either; it
   * waits for a canvas to be *visible* and times out while one is behind a
   * panel.
   */
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
  let spot = await middle()
  console.log('canvas middle:', JSON.stringify(spot))
  await page.mouse.click(spot.x, spot.y)
  await wait(2500)
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('button')].find((one) =>
      /close controls|steuerung schlie/i.test(one.getAttribute('aria-label') ?? ''),
    )
    close?.click()
  })
  await wait(600)
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.evaluate(() => Boolean(document.pointerLockElement))) break
    await page.evaluate(() => {
      for (const one of document.querySelectorAll('button')) {
        const label = one.getAttribute('aria-label') ?? ''
        if (/close controls|steuerung schlie|close block picker|block-auswahl/i.test(label)) {
          one.click()
        }
      }
    })
    await wait(600)
    spot = await middle()
    await page.mouse.click(spot.x, spot.y)
    await wait(1800)
  }
  console.log('locked:', await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].map((canvas, at) => {
      const rect = canvas.getBoundingClientRect()
      return {
        at,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        locked: document.pointerLockElement === canvas,
      }
    })
    return JSON.stringify({
      any: Boolean(document.pointerLockElement),
      on: document.pointerLockElement?.tagName ?? null,
      canvases,
    })
  }))

  /**
   * The combat readouts only. `document.body.innerText` here is mostly the rail
   * and the block picker, and neither says anything about a fight.
   */
  const readout = () =>
    page.evaluate(() => {
      const lines = []
      for (const node of document.querySelectorAll('.playing div')) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (/^Health\d/.test(text) || /^−\d+%/.test(text) || /^-\d+%/.test(text)) {
          lines.push(text.slice(0, 60))
        }
      }
      const mode =
        [...document.querySelectorAll('.playing span')]
          .map((one) => (one.textContent ?? '').trim())
          .find((text) => /Battle|Creative|Kampf|Kreativ/.test(text)) ?? '?'
      const down = /went down|umgefallen|ausgeschieden/i.test(
        document.querySelector('.playing')?.textContent ?? '',
      )
      const combat = lines.length ? [...new Set(lines)].join(' / ') : '(no health readout)'
      return `[${mode}]${down ? '[down]' : ''} ${combat}`
    })

  /** The room's mode, which decides whether a dash is anything at all. */
  const setBattle = async () => {
    const pressed = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((one) =>
        /switch to battle|auf kampf/i.test(one.getAttribute('aria-label') ?? ''),
      )
      if (!button) return null
      button.click()
      return button.getAttribute('aria-label')
    })
    return pressed
  }
  const setCreative = async () => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((one) =>
        /switch to creative|auf kreativ/i.test(one.getAttribute('aria-label') ?? ''),
      )
      button?.click()
    })
  }

  console.log('pose seen by ghost:', JSON.stringify(pose))
  console.log('ghost heard:', JSON.stringify([...heard]))
  /*
   * Can this body walk at all?
   *
   * Asked before anything about the dash, because the dash lives inside the
   * walking branch of the character controller - the one guarded on
   * `WALK_DIR.lengthSq() > 1e-6` - and a camera left staring at the floor by the
   * entry descent skips the whole thing. A probe that cannot tell "the dash is
   * broken" from "this body never walked" is not measuring the dash.
   */
  const walked = { from: pose ? { x: pose.x, z: pose.z } : null }
  await page.keyboard.down('KeyW')
  await wait(1400)
  await page.keyboard.up('KeyW')
  await wait(900)
  console.log('walk test:', JSON.stringify({ from: walked.from, to: pose ? { x: pose.x, z: pose.z } : null }))

  // And level the look, in case the entry left it pointing somewhere the walk
  // branch cannot use.
  await page.mouse.move(300, 300)
  await page.mouse.move(320, 300)
  await wait(600)

  console.log('role:', ROLE, 'switched to battle:', ROLE === 'admin' ? await setBattle() : '(not allowed to)')
  await wait(3000)
  console.log('before:', await readout())

  // --- half one: does our charge land on them? -----------------------------

  /*
   * How fast is this scene actually running?
   *
   * Without it a null result means nothing: a headless SwiftShader lounge on a
   * loaded machine can be under one frame a second, and everything about a dash
   * - the request being consumed, the sweep, the judge - happens in the frame
   * loop. "No hit" at 0.5fps is not evidence of a broken dash.
   */
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

  /** Press, then watch for the cooldown to appear at all. */
  const swing = async (label) => {
    await page.keyboard.press('KeyF')
    let sawCharging = false
    for (let at = 0; at < 60; at++) {
      const text = await readout()
      if (/charging|lädt|ladt/i.test(text)) sawCharging = true
      await wait(100)
    }
    console.log(`${label}: charged=${sawCharging} hud=${await readout()}`)
  }

  for (let attempt = 0; attempt < 3; attempt++) await swing(`swing ${attempt}`)

  /*
   * And again without the keyboard, in case the press never reached the window.
   * See `measure-drawn-position-not-physics`: dispatching the event is the way
   * to be sure the listener is the thing being tested.
   */
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true })),
    )
    let sawCharging = false
    for (let at = 0; at < 40; at++) {
      if (/charging|lädt/i.test(await readout())) sawCharging = true
      await wait(100)
    }
    console.log(`dispatched swing ${attempt}: charged=${sawCharging}`)
  }
  console.log('hits the ghost heard:', hits.length)
  console.log('ghost heard:', JSON.stringify([...heard]))
  console.log('pose seen by ghost:', JSON.stringify(pose))

  // --- half two: does their claim land on us? ------------------------------

  /**
   * A claim from the ghost, at whatever place in its sequence we say.
   *
   * `s` is the argument because the interesting cases are all about it: the
   * sequencer in `world/reliable` holds a message that arrives early, and drops
   * one that arrives behind the mark as a duplicate. Both are silent, and both
   * look from the inside exactly like "the hit mark appeared and their bar did
   * not move".
   */
  const claim = async (at, label, session = 'ghost-1') => {
    const before = await readout()
    void channel.send({
      type: 'broadcast',
      event: 'hit',
      payload: {
        i: randomUUID(),
        f: ghost.user.id,
        t: player.user.id,
        d: 10,
        s: at,
        c: session,
      },
    })
    await wait(2500)
    const after = await readout()
    console.log(`${label} (s=${at}): ${before}  ->  ${after}`)
    return before !== after
  }

  console.log('--- in sequence ---')
  await claim(sequence++, 'first')
  await claim(sequence++, 'next')

  /*
   * A hole in front of it. `GAP_GRACE_MS` is a second, after which the stream is
   * supposed to step over the missing number and hand this one on - so a claim
   * that never lands here is one the sequencer swallowed.
   */
  console.log('--- one skipped ---')
  sequence += 1
  await claim(sequence++, 'after a gap')

  /*
   * And behind the mark, which is what a sender that restarted its counter looks
   * like from here - a remounted <Multiplayer>, a fresh outbox at one, and a
   * receiver still expecting the number it was on.
   */
  /*
   * Behind the mark, from the session that got there. Still a duplicate, still
   * dropped - that rule is what makes a resend everybody hears harmless.
   */
  console.log('--- behind the mark, same session ---')
  await claim(1, 'same session')

  /*
   * And behind the mark from a *new* session, which is what a remounted client
   * actually looks like: a fresh outbox at one and a fresh connection. This is
   * the case that used to be swallowed for the rest of the session.
   */
  console.log('--- behind the mark, new session ---')
  await claim(1, 'restarted sender', 'ghost-2')

  // The space is left the way it was found - the mode is a workspace setting,
  // not a thing this probe gets to decide.
  if (ROLE === 'admin') {
    await setCreative()
    await wait(1500)
  }

  console.log('problems:', problems.slice(0, 10))

  clearInterval(stepping)
  if (process.env.HEADED === '1') await wait(15_000)
  await context.close()
  await browser.close()
  await supabase.removeChannel(channel)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
