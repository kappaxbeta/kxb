/**
 * A kill, landed on purpose, and the scoreboard moving on both screens.
 *
 * ---------------------------------------------------------------------------
 * The last mile of the deathmatch, and why it took a spec
 * ---------------------------------------------------------------------------
 * Every part of a shot has had a check for a while: `castRay` meets a peer's
 * box in a unit test, `xp_arbitrate` prices a body and awards a point in the
 * arbiter's own tests, and `scripts/xp-two-players.mjs` once got twenty-five
 * health off somebody through the whole chain in two real browsers. What none
 * of them could reach was the **fatal** hit - the fourth one, where the arbiter
 * stops taking health off and starts counting a kill - and therefore the thing
 * that hangs off it: a scoreboard that draws a number nobody has ever seen it
 * draw.
 *
 * That was recorded as needing luck. It does not. It needed three facts:
 *
 * - **Only Chrome takes a pointer lock headless.** Chromium refuses outright,
 *   `PointerLockControls` turns nothing without one, and - the part that makes
 *   it look like a broken gun rather than a browser - the fire handler ignores
 *   every `mousedown` while `pointerLockElement` is null, deliberately, so the
 *   click that takes the lock is not a round fired into the scenery. See
 *   `Opening.chrome`.
 * - **The readout reports a bearing now.** `?debug=1` puts where you are
 *   standing *and which way you are pointing* on the page, so `aimAt` can turn
 *   somebody until they are looking at a spot and check that they got there.
 *   That is the whole of what was missing: a probe that cannot read a heading
 *   can only sweep and hope, which is what the note in `xp-two-players.mjs`
 *   called luck.
 * - **There is ammunition on the floor.** Eleven boxes, twelve rounds each,
 *   back fifteen seconds after they are taken. The same note called the level
 *   twenty-four rounds and no refill; the boxes landed three days before it was
 *   written. Four shots is a kill, so a magazine is six of them.
 *
 * ---------------------------------------------------------------------------
 * Local only, like every spec in here
 * ---------------------------------------------------------------------------
 *     bun run dev                # app + local Supabase, in another terminal
 *     bun run xp:e2e -- e2e/shooter.e2e.ts
 *
 * It needs Chrome installed at the usual place on a Mac, which is the one thing
 * in this folder that is not satisfied by a checkout.
 */
import { expect, test } from '@playwright/test'
import { aimAt, freshRoom, openPlayer, readout, type Player } from './players'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** A first breath after the second browser arrives, before anything is asked. */
const SETTLE = 14_000

/**
 * How long to give the arbiter before calling a shot a miss.
 *
 * Generous, and only ever spent on an actual miss: `fireAt` polls, so a hit that
 * comes back in half a second costs half a second.
 */
const VERDICT = 8_000

/** The HUD, as numbers. Both are drawn in the corner every level with them has. */
async function vitals(player: Player): Promise<{ hp: number; ammo: number }> {
  const text = (await player.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  return {
    hp: Number(text.match(/hp (\d+)/)?.[1] ?? NaN),
    ammo: Number(text.match(/ammo (\d+)/)?.[1] ?? NaN),
  }
}

/** Everything on this player's screen, flattened, for the board assertions. */
async function screen(player: Player): Promise<string> {
  return (await player.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

/**
 * One round, and then wait for the server to say what it did.
 *
 * Polled rather than paused. A shot is not a local event - the client claims it,
 * `xp_arbitrate` decides, and the verdict comes back on the next poll - and how
 * long that takes depends on the machine: under software rendering on a busy
 * level the whole loop runs at a few frames a second and a fixed pause reads the
 * health *before* the answer arrives. Which does not look like a slow test, it
 * looks like a miss, and the loop below then fires again into a body that was
 * already hit.
 *
 * Returns the health it settled on, and the health it started from, so the
 * caller can say what happened rather than guess.
 */
async function fireAt(shooter: Player, victim: Player): Promise<{ before: number; after: number }> {
  const before = (await vitals(victim)).hp

  await shooter.page.mouse.down()
  await shooter.page.waitForTimeout(80)
  await shooter.page.mouse.up()

  for (let waited = 0; waited < VERDICT; waited += 500) {
    await shooter.page.waitForTimeout(500)
    const now = (await vitals(victim)).hp
    if (now !== before) return { before, after: now }
  }

  // Nothing moved in all that time, which is a miss.
  return { before, after: before }
}

test.describe.configure({ mode: 'serial' })

test.describe('a kill, and the board that draws it', () => {
  let ana: Player
  let bo: Player
  let room = ''

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    room = freshRoom()
    // One at a time: two cold page loads at once on one machine is how the dev
    // server times out, which looks exactly like the app being broken.
    ana = await openPlayer('ana', BASE, room, 'shooter', { chrome: true, debug: true })
    bo = await openPlayer('bo', BASE, room, 'shooter', { chrome: true, debug: true })
    await ana.page.waitForTimeout(SETTLE)
  })

  test.afterAll(async () => {
    for (const player of [ana, bo]) {
      if (!player) continue
      await player.context.close()
      await player.browser.close()
    }
  })

  test('both of them are in the level, with nothing on either console', async () => {
    for (const player of [ana, bo]) {
      await expect(player.page.locator('canvas')).toHaveCount(1)
      expect(player.problems, `${player.name} complained`).toEqual([])
    }
  })

  test('the first click takes the pointer lock rather than firing a round', async () => {
    const before = await vitals(ana)
    await ana.page.locator('canvas').first().click()
    await ana.page.waitForTimeout(1000)

    expect(
      await ana.page.evaluate(() => document.pointerLockElement !== null),
      'no pointer lock - is this Playwright’s Chromium rather than Chrome?',
    ).toBe(true)
    // The round that would otherwise go into whatever was under the cursor.
    expect((await vitals(ana)).ammo).toBe(before.ammo)
  })

  /**
   * She can point at him, and the readout says so.
   *
   * The only check anywhere that the readout reports a *bearing*. The coordinate
   * has been on that card for a while; `facing` is what a level author needs the
   * moment anything is aimed, and without it everything below is a sweep.
   *
   * Nothing here says where either of them is standing. The level is being
   * rebuilt as this is written, and a spec that leant on its spawn marks would
   * break every time somebody moved a wall - so it reads both positions and
   * turns, which is what the readout is for.
   */
  test('ana can turn until she is looking at bo', async () => {
    const there = await readout(bo)
    expect(there, 'bo has no readout - was he opened with debug: true?').not.toBeNull()

    const facing = await aimAt(ana, there!)
    const here = await readout(ana)
    expect(facing).not.toBeNull()
    expect(here).not.toBeNull()

    const wanted = (Math.atan2(there!.x - here!.x, there!.z - here!.z) * 180) / Math.PI
    const off = ((((wanted - facing!) % 360) + 540) % 360) - 180
    expect(Math.abs(off), `ana is ${off.toFixed(1)}° off bo`).toBeLessThan(2)
  })


  /**
   * Four hits take a body down, and the fourth is the one nothing had seen land.
   *
   * Re-aimed before every round rather than fired blind four times: neither of
   * them is nailed down - a respawn moves the target - so a bearing that was
   * right ten seconds ago is a guess. The point of the readout is that it does
   * not have to be one.
   *
   * What is asserted is the arbiter's arithmetic rather than a total. "Health
   * went down by a hundred" and "four separate hits were priced at twenty-five
   * each" are different claims, and only the second says the server is doing the
   * sum - so every health this ever reads has to be a quarter of a body. The
   * victim reads its own health back *from the arbiter*, so these are the
   * server's numbers on the screen of the person who was shot.
   */
  test('four hits take a body down, twenty-five at a time', async () => {
    test.setTimeout(300_000)
    expect((await vitals(bo)).hp).toBe(100)

    const seen = new Set<number>()
    const story: string[] = []
    let landed = 0
    let down = false

    for (let round = 0; round < 12 && !down; round++) {
      const there = await readout(bo)
      if (there) await aimAt(ana, there)

      const { before, after } = await fireAt(ana, bo)
      story.push(`${before}→${after}`)
      if (after === before) continue

      seen.add(after)
      landed++
      // The body goes down and comes back up at a spawn, so the fatal round is
      // the one that either empties this number or puts it back to full.
      if (after === 0 || after > before) down = true
    }

    expect(down, `ana never took bo down: ${story.join(' ')}`).toBe(true)
    expect(landed, `four hits is a body: ${story.join(' ')}`).toBe(4)
    // A quarter of a body each time, whatever order they were seen in.
    expect([...seen].filter((hp) => hp % 25 !== 0), story.join(' ')).toEqual([])
  })


  /**
   * And the board, which is the half of this that only a client can answer.
   *
   * `standings.ts` joins the arbiter's `{id: kills}` to names off the presence
   * roster and sides off the marks, and `Board` draws nothing at all until
   * somebody has a kill - so every screenshot of this level ever taken has had
   * an empty space where this is. It is on **both** screens because a scoreboard
   * only one person can see is a scoreboard that does not work.
   */
  test('and the scoreboard says so, on both screens', async () => {
    for (const player of [ana, bo]) {
      const board = player.page.getByTestId('standings')
      await expect(board, `${player.name} never saw the score`).toBeVisible({ timeout: 60_000 })

      /*
       * A row ending in one, read row by row.
       *
       * Not a pattern over the block's text: the rows are separate paragraphs
       * and their text runs together when it is flattened, so `Someone 1` and
       * `Someone 0` arrive as `Someone 1Someone 0` and a `\b1\b` finds no word
       * boundary between the 1 and the S. Which is a *true* failure message
       * about a false claim, and cost a run to read.
       *
       * Whose row it is and which side they are on are deliberately not checked:
       * the room hands the sides out and this spec does not choose them.
       */
      await expect
        .poll(async () => (await board.locator('p').allInnerTexts()).map((row) => row.trim()), {
          timeout: 60_000,
          message: `${player.name}'s board never showed a kill`,
        })
        .toEqual(expect.arrayContaining([expect.stringMatching(/\s1$/)]))
    }

    // And the shooter's own count, in the corner where the level's name is.
    await expect
      .poll(async () => screen(ana), { timeout: 60_000 })
      .toMatch(/\b1 kills?\b/)
  })
})
