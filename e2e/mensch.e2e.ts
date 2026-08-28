/**
 * Three people at one table, in three browsers, against the real database.
 *
 * ---------------------------------------------------------------------------
 * The check nothing else in this repo can make
 * ---------------------------------------------------------------------------
 * Every rule of this game is asserted headlessly in `packages/xp/src/xps.test.ts`
 * - the six to come out, the exact roll home, the knock-backs, the win - and
 * every one of those runs the *engine* with no client around it. `xp:shot` draws
 * the document without a runtime. Neither can see the two things that have
 * actually gone wrong here so far, and both were found by a human looking at a
 * screenshot: 176 mark frames drawn over the board, and a flag that counted
 * anything that touched it.
 *
 * So this asserts the things only a running client can answer:
 *
 *   - three players in one room get **three different seats**, which is the
 *     whole of `assign: 'order'` and cannot be tested from one process;
 *   - the level draws at all, with nothing on the console;
 *   - a roll reaches the table and comes back a number **everybody can see** -
 *     the arbiter's, over the network, in the HUD.
 *
 * ---------------------------------------------------------------------------
 * Local only, and deliberately not on CI
 * ---------------------------------------------------------------------------
 * It needs a Supabase, a dev server and three Chromiums. A CI job that needs all
 * three is a job that goes red for reasons that are never the code, and this
 * repo already has one check that must stay trustworthy. Run it by hand:
 *
 *     bun run dev                # in another terminal: app + local Supabase
 *     bun run xp:e2e
 *     HEADED=1 bun run xp:e2e    # three windows you can watch it in
 *
 * ⚠️ **Check nothing else is already running a dev server.** Three `next dev`
 * processes across concurrent sessions took a warm page to eighty seconds on
 * this machine, which looks exactly like the app being broken and is not.
 */
import { expect, test, type Locator } from '@playwright/test'
import { arbiterView, freshRoom, openPlayer, type Player } from './players'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * What a readout says, in the case the document wrote it in.
 *
 * `innerText` is the *rendered* text, and the HUD draws these `uppercase` - so a
 * phase called `roll` reads back as `ROLL` and every comparison against the
 * document's own word is quietly false. It cost this file a run in which the
 * loop pressed *end my turn* on every pass, which cleared the die each time, so
 * a turn that was working perfectly looked like a die that never landed.
 */
const reads = async (readout: Locator) => (await readout.innerText()).trim().toLowerCase()

/**
 * How long anything here may take before it counts as broken.
 *
 * Five minutes, which is absurd for a click and right for this: a cold Next
 * route compiles, three browsers each fetch a board's worth of models, a
 * presence channel has to find all three, and the machine this runs on may have
 * several dev servers on it - ten, once, which took a single run to seven
 * minutes and made every assertion in it look like a defect.
 *
 * It only ever costs time on a *failing* run. Everything below polls, so a
 * healthy table settles in seconds and the patience is never spent.
 */
const PATIENCE = 300_000

/** A first breath after the third browser arrives, before anything is asked. */
const SETTLE = 5_000

test.describe.configure({ mode: 'serial' })

test.describe('three at one table', () => {
  let players: Player[] = []
  let room = ''

  test.beforeAll(async () => {
    room = freshRoom()
    // Opened one at a time rather than in parallel: `assign: 'order'` seats by
    // sorted account id, so the *order* does not matter - but three cold page
    // loads at once on one machine is how the dev server times out.
    for (const name of ['ana', 'bo', 'cy']) {
      players.push(await openPlayer(name, BASE, room, 'mensch'))
    }
    await players[0].page.waitForTimeout(SETTLE)
  })

  test.afterAll(async () => {
    for (const player of players) {
      await player.context.close()
      await player.browser.close()
    }
    players = []
  })

  test('every one of them gets a level rather than a refusal', async () => {
    for (const player of players) {
      // The page says so in words when it will not open - `needs: identity`
      // renders "Not here" rather than a canvas - so this catches a broken
      // session before anything downstream reports something stranger.
      await expect(player.page.locator('canvas')).toHaveCount(1)
    }
  })

  test('and nothing on any of their consoles', async () => {
    for (const player of players) {
      expect(player.problems, `${player.name} complained`).toEqual([])
    }
  })

  /**
   * The assertion this file exists for, and no single process can make it.
   *
   * `assign: 'order'` deals a colour per account, sorted, so three people in one
   * room get three *different* ones. That is a claim about three clients that
   * have never spoken to each other agreeing, and it is exactly what a hash
   * could not do - three browsers were once dealt blue, blue and green, which is
   * what killed the derivation this replaced.
   *
   * ---------------------------------------------------------------------------
   * What used to be here, and why it is not
   * ---------------------------------------------------------------------------
   * A walk. This spec spent a while written against `assign: 'claim'` - nobody
   * dealt anything, everybody arrived in the middle of the board and took the
   * chair they walked to - and that design **never landed**: the document on
   * disk has said `order` and started in `roll` throughout. So the test held a
   * direction for fifteen seconds waiting for a `seats` phase that does not
   * exist, pressed a `KeyQ` bound to nothing, and passed by being skipped.
   *
   * It is worth saying plainly rather than deleting quietly, because the walk is
   * a better *game* than being dealt a colour and somebody may well build it:
   * if `claim` arrives, this is the test that changes back.
   */
  test('three players in one room are dealt three different colours', async () => {
    const seats = await Promise.all(players.map((one) => reads(one.page.getByTestId('seat'))))
    const said = players.map((one, at) => `${one.name}=${seats[at] || 'none'}`).join(' ')

    expect(seats.filter((one) => one.length > 0).length, `not everybody was seated: ${said}`).toBe(3)
    expect(new Set(seats).size, `a chair is shared: ${said}`).toBe(3)
    // And the chairs are the document's own colours, not something invented.
    for (const seat of seats) {
      expect(['blue', 'red', 'green', 'yellow'].some((one) => seat.includes(one))).toBe(true)
    }
  })

  test('and every one of them opens on the first phase, ready to roll', async () => {
    // `roll` is `flow.start`. Being dealt a colour is not a phase - nobody
    // chooses anything - so the level is playable the moment it draws.
    for (const player of players) {
      await expect(player.page.getByTestId('phase'), `${player.name} is not ready`).toHaveText(
        'roll',
        { timeout: PATIENCE },
      )
    }
  })

  test('a roll reaches the table and comes back a number', async () => {
    /**
     * The whole server-authority chain in one keystroke: the press fires a rule,
     * the rule asks the arbiter, `xp_arbitrate` rolls with the database's own
     * `random()`, records it, and the answer lands in the level's data and on
     * the screen. A client that rolled for itself would pass this too - which is
     * why the *next* test is the one that matters.
     */
    const roller = players[0]
    await roller.page.bringToFront()
    await roller.page.keyboard.press('KeyR')

    const roll = roller.page.getByTestId('tally-roll')
    await expect(roll).toHaveText(/^[1-6]$/, { timeout: PATIENCE })
  })

  /**
   * The one this spec was written to prove, and it took two wrong answers.
   *
   * **First guess:** the level's data was written on a timer and read once, at
   * open, so `space` kept half its promise. Real, and fixed, and it changed
   * nothing here. **Second:** `xpStore` wants a UUID and `/xp/mensch` is a
   * slug, so a builtin has no store at all - the roll was never written
   * anywhere for anybody to read.
   *
   * The channel is the arbiter, which is where the original code comment said
   * it was. It decided the roll and handed it back to the roller only, on the
   * argument that the level's `data` is "where it is already stored" - true for
   * one client out of four. It records the face now and `xp_arbiter_view`
   * returns it, beside the turn, for the same stated reason: those are the two
   * facts a board game draws every frame.
   *
   * The wait is real. The poll runs about once a second, so the other two are
   * up to a second behind the press.
   */
  test('and the number everybody sees is the same number', async () => {
    const faces = await Promise.all(
      players.map(async (player) => {
        const roll = player.page.getByTestId('tally-roll')
        await expect(roll).toHaveText(/^[1-6]$/, { timeout: PATIENCE })
        return roll.innerText()
      }),
    )
    expect(new Set(faces).size, `the table disagrees: ${faces.join(', ')}`).toBe(1)
  })


  /**
   * A move one player makes is a fact the whole table can read.
   *
   * ---------------------------------------------------------------------------
   * The question the tests above made unavoidable
   * ---------------------------------------------------------------------------
   * They prove the *table* agrees - three seats, one die, one number - and none
   * of them proved the **board** did. Every client spawns the sixteen pieces
   * from the same document and then ran its own world from there, because
   * `WorldShare` carries despawns, held things, health, clips and motions and no
   * positions at all. A piece that moved on one screen moved on no other.
   *
   * The fix was not a bigger share. A board game is a deterministic machine
   * driven by facts the table already agrees on, so the move became one of them:
   * the arbiter records it in four fields, and four is enough because an entity
   * id is the document's own order and therefore the same number everywhere.
   *
   * ---------------------------------------------------------------------------
   * Asserted through the server, because a piece is pixels
   * ---------------------------------------------------------------------------
   * There is no DOM for "the piece is on blue-0", and a screenshot cannot answer
   * it either - the aiming ring pulses, so two shots of the same board differ by
   * a few pixels whatever happened. What *is* checkable is the guarantee
   * underneath: the arbiter's view is redacted per caller, so asking it with a
   * different player's token is precisely "can they see this", put to the server
   * that answers it in play. The client-side apply is then a poll and a
   * `position.set`.
   *
   * ---------------------------------------------------------------------------
   * And a move is now two presses rather than one
   * ---------------------------------------------------------------------------
   * The loop below used to hunt for a six and then check whether the arbiter had
   * recorded anything, because a move was `advance` and most rolls could not use
   * one. Nothing computes a move now - you pick a piece up and you put it down -
   * so the move this asserts is the drop, it needs no particular number, and it
   * happens on the first try.
   *
   * ---------------------------------------------------------------------------
   * Three bugs on the way here, and none of them was the channel
   * ---------------------------------------------------------------------------
   * **The die came back a second after every move.** The roller applies its own
   * face from the arbiter's direct reply, which carries no counter, so the next
   * poll read it as news and wrote it back over the `setProp dice 0` that
   * spending it had just done. Four turns with the readout never changing.
   *
   * **The turn deadlocked when the arbiter was slow.** The flow left `roll` on
   * the press rather than on the number landing, so the level sat in `move` with
   * nothing to spend and no way back.
   *
   * **And nobody arrived on a piece.** `arrivalSpot` spread people over a grid
   * around their mark so two at one mark do not stand inside each other - but a
   * mark that names a team is a *seat*, one each, so the grid was solving a
   * collision that cannot happen and putting every player a cell past the reach
   * of a press. It cost this test a search it kept losing and it cost every real
   * player their first turn.
   */
  test('a move one player makes is a fact the whole table can read', async () => {
    const mover = players[0]
    await mover.page.bringToFront()
    const roll = mover.page.getByTestId('tally-roll')

    /**
     * Driven off the phase the level is in, rather than off a guess at timings.
     *
     * Every earlier version of this loop pressed and then waited a while, and it
     * kept stalling with three browsers on one machine: the press of `roll`
     * arrived while the level was still in `move`, `allow` dropped it - correctly
     * - and nothing in the DOM could say that had happened, so the test looked
     * like a broken game.
     *
     * The phase is on screen now, for a player's sake as much as this one's: in
     * a turn-based game the question between actions is "what am I meant to do",
     * and `allow` answers it only by a button quietly not working. Waiting for it
     * turns a race into a handshake.
     */
    const phase = mover.page.getByTestId('phase')
    const inPhase = async (name: string) =>
      expect(phase, `never reached the ${name} phase`).toHaveText(name, { timeout: 60_000 })

    /**
     * Whatever phase the level is in, do that phase's action.
     *
     * Rather than "roll, then move", which assumed the table was between turns -
     * and it is not: the test above this one already rolled, in the same browser,
     * so this arrives mid-turn. The first version sat waiting sixty seconds for a
     * `roll` phase that had already been left, which the readout said in one word
     * the moment it existed.
     *
     * You cannot re-roll, either: `flow` enters `move` the moment a number lands
     * and `roll` is not among that phase's `allow`. Reading the phase and acting
     * on it is also just how you play.
     */
    // Into a turn, from wherever the tests above left the table.
    for (let turns = 0; turns < 4 && (await reads(phase)) !== 'move'; turns++) {
      if ((await reads(phase)) === 'roll') {
        await mover.page.keyboard.press('KeyR')
        // The level leaves `roll` when the number lands rather than when the key
        // goes down, because a roll is a round trip.
        await inPhase('move')
      }
    }
    await inPhase('move')
    // The number is advice and nothing spends it, so this is read rather than
    // waited on - it is here because a turn with no roll in it is not a turn.
    await expect(roll).not.toHaveText('0', { timeout: 30_000 })

    // Up, then down. The second press is the move: `drop` puts the piece where
    // the hand is, the runtime snaps it to the nearest field, and that field's
    // name is the whole of what the table is told.
    await mover.page.keyboard.press('KeyE')
    await mover.page.keyboard.press('KeyE')

    await expect
      .poll(async () => (await arbiterView(mover, room)).move ?? null, {
        timeout: PATIENCE,
        message: 'the drop never reached the arbiter',
      })
      .toMatchObject({ id: expect.any(Number), mark: expect.any(String) })

    for (const watcher of players.slice(1)) {
      await expect
        .poll(async () => (await arbiterView(watcher, room)).move ?? null, {
          timeout: PATIENCE,
          message: `${watcher.name} could not see the move`,
        })
        .toMatchObject({ id: expect.any(Number), mark: expect.any(String) })
    }
  })
})
