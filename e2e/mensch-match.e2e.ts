/**
 * A turn of mensch, taken by hand, in a browser.
 *
 * ---------------------------------------------------------------------------
 * What this used to be, and why it is not that any more
 * ---------------------------------------------------------------------------
 * It played a whole game to the end, on a loop of *press to roll, press to
 * move*, and it could not finish. Four hundred turns and not one piece got
 * home: the ring stayed where you left it, a piece it moved left it, and
 * nothing could ever select that piece again. Every rule was correct.
 *
 * The answer was not a better cursor. Nothing moves a piece for you now - you
 * walk over, pick it up, carry it, put it down on a field, and say you are
 * done - so there is no loop for a test to drive to a win, because the game
 * deliberately has no autopilot. *"We don't automate the set of the figures. It
 * keeps a charm to it like in the real world."*
 *
 * So this proves the turn instead, which is the thing that was actually broken:
 * a roll, a piece in a hand, a walk with it, a field it lands on that the whole
 * table can name, and a turn handed on because somebody said so.
 *
 *     bun run dev
 *     bun run xp:e2e -- e2e/mensch-match.e2e.ts
 *     HEADED=1 SLOW=60 bun run xp:e2e -- e2e/mensch-match.e2e.ts   # watch it
 *     VIDEO=1 bun run xp:e2e -- e2e/mensch-match.e2e.ts            # film it
 *
 * ---------------------------------------------------------------------------
 * One player, and that is still not a shortcut
 * ---------------------------------------------------------------------------
 * Nothing calls `turn_start`, so the arbiter never refuses an out-of-turn roll -
 * a real gap, written down as one. Until it closes, one player can take a whole
 * turn on their own, and one browser is the cheapest way to assert the shape of
 * it. The three-browser file beside this one is what proves the table agrees.
 */
import { expect, test, type Locator } from '@playwright/test'
import { arbiterView, freshRoom, openPlayer } from './players'

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


/** Generous: every step here is a round trip to the arbiter or a frame loop. */
const A_TURN = 4 * 60_000

test.describe('a turn, taken by hand', () => {
  test.setTimeout(A_TURN)

  test('roll, pick a piece up, carry it to a field, and hand the turn on', async () => {
    const room = freshRoom()
    const player = await openPlayer('solo', BASE, room, 'mensch')

    try {
      await player.page.bringToFront()
      const phase = player.page.getByTestId('phase')
      const roll = player.page.getByTestId('tally-roll')
      await expect(phase, 'the level never started its round').toHaveText(/seats|roll|move/, {
        timeout: 120_000,
      })

      /**
       * Sitting down, which is the first thing a game of this asks for.
       *
       * `assign: 'claim'` deals nobody a colour: you arrive in the middle of the
       * board and take the corner you walk to. Four directions tried in turn
       * because a spec has no idea which way the camera is facing, and any of
       * the four is a seat when you are the only person at the table.
       */
      for (const towards of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
        if ((await reads(phase)) !== 'seats') break
        await player.page.keyboard.down('ShiftLeft')
        await player.page.keyboard.down(towards)
        // Thirteen metres from the middle to a corner, at the pace a body walks,
        // and generous with it: a laptop running three of these is a slow frame
        // loop, and a spec that gives up one step short reads as a broken game.
        for (let tries = 0; tries < 40 && (await reads(phase)) === 'seats'; tries++) {
          await player.page.waitForTimeout(500)
          await player.page.keyboard.press('KeyQ')
        }
        await player.page.keyboard.up(towards)
        await player.page.keyboard.up('ShiftLeft')
      }
      await expect(phase, 'never found a chair to sit in').not.toHaveText('seats', {
        timeout: 30_000,
      })

      /**
       * Roll until a number lands, and hand the turn on if one did not.
       *
       * Not a retry around a flaky assertion - it is how the turn reads when you
       * are the one taking it. A roll is a round trip, so a press that arrives
       * before this client has finished joining is simply not heard, and the way
       * out of a `move` phase with nothing to move is the same key a player
       * would reach for: the one that says *I am done*.
       */
      const face = async () => await reads(roll)
      for (let tries = 0; tries < 20 && !/^[1-6]$/.test(await face()); tries++) {
        const now = await reads(phase)
        if (now === 'over') break
        await player.page.keyboard.press(now === 'roll' ? 'KeyR' : 'KeyF')
        await player.page.waitForTimeout(3_000)
      }
      await expect(roll, 'the die never landed on anything').toHaveText(/^[1-6]$/)
      await expect(phase, 'a number landed and the turn did not move on').toHaveText('move')

      /**
       * Hold, walk, let go - which is the whole move, and the walk is the point.
       *
       * A pick-up and a put-down with nothing in between would land the piece
       * back on the field it started on, and the assertion below would pass
       * without the interesting half having happened. Holding a direction for a
       * moment is how far a person moves a piece.
       *
       * `down` and `up` rather than two `press` calls, because that is now
       * literally the rule: `pressed` picks the piece up and `released` puts it
       * down, so the key is held for exactly as long as the piece is in hand.
       */
      await player.page.keyboard.down('KeyE')
      await player.page.waitForTimeout(300)
      await player.page.keyboard.down('KeyW')
      await player.page.waitForTimeout(900)
      await player.page.keyboard.up('KeyW')
      await player.page.waitForTimeout(300)
      await player.page.keyboard.up('KeyE')

      /**
       * The move, read back from the server that owns it.
       *
       * There is no DOM for *the piece is on blue-4* and a screenshot cannot
       * answer it either - the aiming ring pulses, so two shots of one board
       * differ whatever happened. `mark` is the field by name, which is exactly
       * what the arbiter records and what every other client is handed.
       */
      await expect
        .poll(async () => (await arbiterView(player, room)).move ?? null, {
          timeout: 30_000,
          message: 'the piece was put down and the table never heard about it',
        })
        .toMatchObject({ id: expect.any(Number), mark: expect.any(String) })

      // And the turn ends because somebody says it does. Nothing in the level
      // knows a carry is finished - that is the thing only a person can know.
      await player.page.keyboard.press('KeyF')
      await expect(phase, 'the turn never went back to the die').toHaveText('roll', {
        timeout: 60_000,
      })
      await expect(roll, 'the next player inherited the last one\'s number').toHaveText('0')

      expect(player.problems, 'the level complained on the way').toEqual([])
    } finally {
      // The context first: it is what flushes a recording.
      await player.context.close()
      await player.browser.close()
    }
  })
})
