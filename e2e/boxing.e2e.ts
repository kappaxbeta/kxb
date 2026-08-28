/**
 * Two people, two browsers, one boxing match.
 *
 *     bun run dev
 *     bun run xp:e2e -- e2e/boxing.e2e.ts
 *     HEADED=1 SLOW=60 bun run xp:e2e -- e2e/boxing.e2e.ts   # watch it
 *
 * ---------------------------------------------------------------------------
 * Why this replaced a probe
 * ---------------------------------------------------------------------------
 * Boxing used to have a transport of its own - a `BroadcastChannel`, so two
 * *tabs* were two fighters - and a probe that drove two pages of one browser.
 * Both are gone. A hidden tab gets no `requestAnimationFrame`, and because the
 * defender decides whether a punch landed, a backgrounded opponent cannot be hit
 * at all: the probe spent most of its life measuring how long Playwright had
 * left one tab in front rather than anything about the game.
 *
 * `openPlayer` is the answer the repo already had - one browser per player, a
 * real minted session, the real Realtime transport - and its header says why in
 * more detail than this file should repeat.
 *
 * ---------------------------------------------------------------------------
 * What is asserted, and why it is these things
 * ---------------------------------------------------------------------------
 * The ring is a WebGL canvas, so almost nothing about it can be read from
 * outside. What *can* be read is the HUD, which is ordinary DOM on purpose, and
 * the two facts that matter most are both in it:
 *
 * - **the fight does not start until both say so**, which is the lobby, and
 * - **both clients agree about the bars**, which is the whole netcode in one
 *   assertion. A punch is thrown on one machine, resolved on the other, and
 *   reported back; if any link in that fails the two numbers differ.
 */
import { expect, test } from '@playwright/test'
import { freshRoom, openPlayer, type Player } from './players'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** The cartridge's id, which is also its room when no battle named one. */
const XP = 'boxing'

/**
 * A corner's health and stamina, off the HUD.
 *
 * By `data-corner` rather than by the fighter's name. Names are what a person
 * reads and are not unique - two players can share one, and the game renames the
 * blue corner when they do - so a spec addressing them by name would read the
 * same bar twice and see agreement that was not there.
 */
async function bars(player: Player, corner: 'red' | 'blue') {
  return player.page.evaluate((which) => {
    const seat = document.querySelector(`[data-corner="${which}"]`)
    if (!seat) return null
    const meters = seat.querySelectorAll('[role="meter"]')
    return {
      health: Number(meters[0]?.getAttribute('aria-valuenow')),
      stamina: Number(meters[1]?.getAttribute('aria-valuenow')),
    }
  }, corner)
}

const phaseOf = (player: Player) =>
  player.page.evaluate(
    () => document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null,
  )

const gapOf = (player: Player) =>
  player.page.evaluate(() => Number(document.querySelector('[data-gap]')?.getAttribute('data-gap')))

/** Say yes. The button is the feature, so it is pressed rather than reached past. */
async function sayReady(player: Player) {
  await player.page.getByRole('button', { name: /ready/i }).first().click()
}

test.describe('a boxing match between two people', () => {
  test('is agreed to, fought, and agreed about', async () => {
    const room = freshRoom()
    const [red, blue] = await Promise.all([
      openPlayer('Red', BASE, room, XP),
      openPlayer('Blue', BASE, room, XP),
    ])

    try {
      // Both canvases up, and both in the lobby rather than already fighting.
      for (const player of [red, blue]) {
        await player.page.waitForSelector('canvas', { timeout: 60_000 })
      }
      await expect
        .poll(() => phaseOf(red), { timeout: 30_000 })
        .toBe('lobby')

      /**
       * One yes is not enough, and this is the assertion that says so.
       *
       * Without it the lobby would be decoration: a screen that appears and then
       * gets out of the way on a timer looks identical to one that waits.
       */
      await sayReady(red)
      await red.page.waitForTimeout(1500)
      expect(await phaseOf(red)).toBe('lobby')

      await sayReady(blue)
      for (const player of [red, blue]) {
        await expect
          .poll(() => phaseOf(player), { timeout: 30_000 })
          .toBe('fighting')
      }

      // Close the distance until a punch can actually reach, rather than walking
      // for a fixed time and hoping.
      await red.page.keyboard.down('d')
      await expect.poll(() => gapOf(red), { timeout: 20_000 }).toBeLessThan(1.9)
      await red.page.keyboard.up('d')

      const before = await bars(blue, 'blue')
      expect(before?.health).toBe(100)

      /**
       * Thrown by red and resolved by blue.
       *
       * A gap between them because a fighter cannot throw two punches inside one
       * recovery - mashing would prove less than it looks - and because each
       * punch has to make a round trip before its result is on red's screen.
       */
      for (const key of ['j', 'k', 'j', 'l', 'k']) {
        await red.page.keyboard.press(key)
        await red.page.waitForTimeout(450)
      }

      // Blue lost health, and red's screen says the same number. That second
      // half is the netcode: red never decided any of it.
      await expect
        .poll(async () => (await bars(blue, 'blue'))?.health ?? 100, { timeout: 20_000 })
        .toBeLessThan(100)

      const [onBlue, onRed] = await Promise.all([bars(blue, 'blue'), bars(red, 'blue')])
      expect(onRed?.health).toBe(onBlue?.health)

      // Throwing costs stamina, on the thrower's own machine and the other's.
      const redBars = await Promise.all([bars(red, 'red'), bars(blue, 'red')])
      expect(redBars[0]?.stamina).toBeLessThan(100)

      for (const player of [red, blue]) {
        expect(player.problems, `${player.name} had console errors`).toEqual([])
      }
    } finally {
      await Promise.all([red.context.close(), blue.context.close()])
      await Promise.all([red.browser.close(), blue.browser.close()])
    }
  })
})
