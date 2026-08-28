import { describe, expect, test } from 'bun:test'
import {
  CONTROLS_SECONDS,
  controlLines,
  followYaw,
  hudLines,
  PANEL_DISTANCE,
  PANEL_DROP,
  panelSpot,
} from '@/app/xp/_runtime/input/vr-hud'
import { VR_JUMP } from '@/app/xp/_runtime/input/vr'
import type { Match } from '@/app/xp/_runtime/match/match'
import type { Run } from '@/app/xp/_runtime/match/race'

/**
 * The HUD you can only see with a headset on.
 *
 * Which is why every one of these exists. A headset cannot be put inside
 * `bun test`, the Browser pane never issues a frame, and the failure mode of the
 * comfort arithmetic is *somebody feeling ill* - the most expensive possible
 * place to find out you got a sign wrong. So the two things that can be wrong
 * without anybody noticing until then - where the panel goes, and whether it
 * agrees with the controllers - are checked here.
 */

const still = { vitals: {}, match: null, run: null, downFor: null, said: [] }

/** A match, as `stepMatch` really produces one. */
const match = (over: Partial<Match> = {}): Match => ({
  phase: 'playing',
  score: 0,
  elapsed: 0,
  remaining: null,
  ending: null,
  ends: 0,
  ...over,
})

/** A run, as `stepRun` really produces one. */
const run = (over: Partial<Run> = {}): Run => ({
  phase: 'waiting',
  time: 0,
  best: null,
  finishes: 0,
  ...over,
})

describe('where the panel goes', () => {
  test('in front of the wearer, not behind them', () => {
    /**
     * The sign that matters, and it is the one three.js and this document
     * disagree about: a camera at yaw 0 looks down **-z** while `Mark.facing`
     * and `./spawn` use +z. Get it backwards and the panel is two metres behind
     * somebody's head, which is indistinguishable from a panel that never
     * mounted - and in a headset there is no console to check.
     */
    const spot = panelSpot({ x: 0, y: 1.6, z: 0 }, 0)
    expect(spot.z).toBeCloseTo(-PANEL_DISTANCE, 5)
    expect(spot.x).toBeCloseTo(0, 5)
  })

  test('and it goes round with the wearer', () => {
    // A quarter turn left puts it on -x, still two metres out. Checked at a
    // right angle rather than an arbitrary one so a transposed sin/cos cannot
    // pass by symmetry.
    const spot = panelSpot({ x: 0, y: 1.6, z: 0 }, Math.PI / 2)
    expect(spot.x).toBeCloseTo(-PANEL_DISTANCE, 5)
    expect(spot.z).toBeCloseTo(0, 5)
  })

  test('below eye level, because the middle of the view is the game', () => {
    expect(panelSpot({ x: 0, y: 1.6, z: 0 }, 0).y).toBeCloseTo(1.6 - PANEL_DROP, 5)
  })

  test('far enough out that the eyes can focus on it', () => {
    /**
     * A virtual surface closer than about a metre asks the eyes to converge
     * harder than they focus, which is the reliable way to give somebody a
     * headache. Asserted as a floor rather than an exact number: the value is a
     * judgement, the limit is not.
     */
    expect(PANEL_DISTANCE).toBeGreaterThanOrEqual(1.5)
  })

  test('a glance is left behind, which is the whole point', () => {
    /**
     * The property the time constant exists for, at the timescale of an actual
     * glance. Look away for a tenth of a second and the panel must still be
     * mostly where it was, or it is the head-welded rectangle this file opens by
     * explaining why not to build.
     */
    const glance = followYaw(0, 1, 0.1)
    expect(glance).toBeLessThan(0.4)
  })

  test('it follows the wearer round, but never instantly', () => {
    /**
     * The whole comfort argument in one test. A panel welded to the head fights
     * every vestibular cue the wearer has - so after a single frame of a 90°
     * turn the panel must have moved *some* way and must still be well short.
     * A `followYaw` that returned `head` would pass "moved" and fail this.
     */
    const after = followYaw(0, Math.PI / 2, 1 / 90)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(Math.PI / 8)
  })

  test('and it does catch up if you stay turned', () => {
    /**
     * The other half: lagging is the point, never arriving is a bug.
     *
     * The tolerance is a degree rather than a hundredth of a radian, and that is
     * a statement about exponential settling rather than a loosened test: it
     * approaches without reaching, so any threshold here is really a claim about
     * *how long* until the gap stops being perceptible. A degree, within a
     * second, is well under that.
     */
    const turnedFor = (seconds: number) => {
      let yaw = 0
      for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 90) {
        yaw = followYaw(yaw, Math.PI / 2, 1 / 90)
      }
      return yaw
    }
    expect(turnedFor(1) / (Math.PI / 2)).toBeGreaterThan(0.85)
    expect(Math.abs(turnedFor(2) - Math.PI / 2)).toBeLessThan(Math.PI / 180)
  })

  test('turning past north takes the short way', () => {
    /**
     * `lerpAngle`'s bug, in radians. A wearer who turns from just left of north
     * to just right of it should not watch the panel travel the long way round -
     * which in a headset is a rectangle sweeping past your face for no reason.
     */
    const panel = 0.1
    const head = Math.PI * 2 - 0.1
    const after = followYaw(panel, head, 1 / 90)
    expect(after).toBeLessThan(panel)
  })

  test('the same drift at 72 and at 120 frames a second', () => {
    /**
     * Headsets do not agree on a frame rate and a single headset does not agree
     * with itself - they throttle when they get warm. A fixed fraction per frame
     * would make the panel settle differently from one minute to the next on the
     * same hardware.
     */
    const settle = (step: number) => {
      let yaw = 0
      for (let elapsed = 0; elapsed < 0.5; elapsed += step) yaw = followYaw(yaw, 1, step)
      return yaw
    }
    expect(Math.abs(settle(1 / 72) - settle(1 / 120))).toBeLessThan(0.02)
  })

  test('a frame with no time in it does not move the panel', () => {
    expect(followYaw(0.3, 2, 0)).toBe(0.3)
  })
})

describe('what the panel says', () => {
  test('nothing at all in a level with nothing to report', () => {
    // A walking-about level has no score, no clock and no health. An empty panel
    // is the right answer: the alternative is a rectangle of zeroes hanging in
    // front of somebody who is looking at a world.
    expect(hudLines(still)).toEqual([])
  })

  test('being down is first and loudest', () => {
    /**
     * It is the only line that answers "why can I not do anything", and in a
     * headset there is nowhere else to find out. It outranks the score, which
     * is the other thing that would want to be loud.
     */
    const lines = hudLines({ ...still, downFor: 3, match: match({ score: 1, remaining: 30 }) })
    expect(lines[0]).toEqual({ text: 'DOWN 3', tone: 'loud' })
    expect(lines.filter((line) => line.tone === 'loud')).toHaveLength(1)
  })

  test('the score is loud when nothing is louder', () => {
    const lines = hudLines({ ...still, match: match({ score: 3, remaining: 30 }) })
    expect(lines[0]).toEqual({ text: 'SCORE 3', tone: 'loud' })
  })

  test('the clock is hidden once the whistle has gone', () => {
    /**
     * The user's own rule about the DOM HUD - "not when it's ended" - and it is
     * not less true in a headset. A countdown on a finished match is a number
     * with nothing behind it.
     */
    const lines = hudLines({ ...still, match: match({ score: 3, remaining: 0, phase: 'over' }) })
    expect(lines.map((line) => line.text)).toContain('FULL TIME')
    expect(lines.some((line) => line.text.includes(':'))).toBe(false)
  })

  test('and the run clock only while the run is on', () => {
    expect(hudLines({ ...still, run: run({ time: 12.5, phase: 'waiting' }) })).toEqual([])
    expect(hudLines({ ...still, run: run({ time: 12.5, phase: 'running' }) })[0].text).toBe('12.50')
  })

  test('health and ammunition share a line', () => {
    // Two short numbers on one line rather than two lines. Every line on this
    // panel is a line of world the wearer cannot see through.
    const lines = hudLines({ ...still, vitals: { hp: 80, ammo: 12 } })
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toContain('HP 80')
    expect(lines[0].text).toContain('AMMO 12')
  })

  test('and a level that counts neither says neither', () => {
    expect(hudLines({ ...still, vitals: {} })).toEqual([])
  })

  test('only the newest thing that happened', () => {
    /**
     * The DOM HUD fades five of them. Five lines of history in front of
     * somebody's eyes is a wall, and the thing you missed in a headset is
     * almost always the thing that just happened.
     */
    const said = [1, 2, 3].map((id) => ({ id, text: `line ${id}` }))
    const lines = hudLines({ ...still, said })
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('line 3')
  })
})

describe('the controls card', () => {
  const key = (does: string) => ({ key: `Key${does[0].toUpperCase()}`, does })

  test('it is built from the bindings rather than written out beside them', () => {
    /**
     * The reason this is derived. A card listing the mapping separately is a
     * second copy of it, and the first thing anybody would notice is that the
     * two disagreed - while wearing a headset, with no way to check which was
     * right. So the card names the same button `bindingsFor` chose.
     */
    const lines = controlLines([key('grab'), key('use')])
    const grab = lines.find((line) => line.text.includes('grab'))
    expect(grab?.text).toContain('A (right)')
    expect(lines.find((line) => line.text.includes('use'))?.text).toContain('B (right)')
  })

  test('jump is on the card and on the trigger', () => {
    // Reserved, so it is never in the document's keys and would be missing
    // from any card built only from them - which is the one binding somebody
    // definitely needs on their first ten seconds in a headset.
    const lines = controlLines([])
    expect(lines.some((line) => line.text.includes('jump'))).toBe(true)
    expect(VR_JUMP).toBe('triggerR')
    expect(lines.find((line) => line.text.includes('jump'))?.text).toContain('trigger')
  })

  test('and so is moving, which no document binds', () => {
    expect(controlLines([]).some((line) => line.text.includes('thumbstick'))).toBe(true)
  })

  test('a binding with nowhere to go is on the card too', () => {
    /**
     * `./vr` returns `unreachable` specifically so a caller can *say so*, and
     * says in as many words that silently dropping it is worse than missing it.
     * This is the caller. A headset is exactly where somebody would otherwise
     * spend a match pressing four buttons looking for a fifth.
     */
    const lines = controlLines(['a', 'b', 'c', 'd', 'point'].map(key))
    const missing = lines.find((line) => line.text.startsWith('point'))
    expect(missing).toBeDefined()
    expect(missing?.tone).toBe('quiet')
  })

  test('it is up long enough to read and gone before it is in the way', () => {
    // Seven-odd short lines. No dismiss button, deliberately: which button
    // dismisses it is the thing the card is there to explain.
    expect(CONTROLS_SECONDS).toBeGreaterThanOrEqual(5)
    expect(CONTROLS_SECONDS).toBeLessThanOrEqual(12)
  })

  test('exactly one line asks to be looked at first', () => {
    const loud = controlLines([key('grab')]).filter((line) => line.tone === 'loud')
    expect(loud).toHaveLength(1)
  })
})

describe('the level\'s own numbers, in a headset', () => {
  const bare = { vitals: {}, match: null, run: null, downFor: null, said: [] }

  test('a labelled field reaches the panel at all, which it never used to', () => {
    // There is no DOM in a headset, so the HUD that draws these on the page is
    // not a surface a player wearing one has. A die roll nobody can see is a
    // die roll they are playing without.
    const lines = hudLines({ ...bare, tally: [{ label: 'roll', value: 4 }] })
    expect(lines.map((line) => line.text)).toContain('ROLL 4')
  })

  test('the first one is the loud one, and only the first', () => {
    const lines = hudLines({
      ...bare,
      tally: [
        { label: 'roll', value: 4 },
        { label: 'blue home', value: 2 },
      ],
    })
    expect(lines.filter((line) => line.tone === 'loud')).toHaveLength(1)
    expect(lines.find((line) => line.tone === 'loud')?.text).toBe('ROLL 4')
  })

  test('being down outranks it, because at most one thing may be large', () => {
    const lines = hudLines({ ...bare, downFor: 3, tally: [{ label: 'roll', value: 4 }] })
    expect(lines.filter((line) => line.tone === 'loud').map((line) => line.text)).toEqual([
      'DOWN 3',
    ])
  })

  test('a level with no data adds no lines', () => {
    expect(hudLines(bare)).toEqual(hudLines({ ...bare, tally: [] }))
  })
})

describe('who you are and what you are doing, in a headset', () => {
  const bare = { vitals: {}, match: null, run: null, downFor: null, said: [] }

  test('the seat and the phase arrive as one line', () => {
    // Two lines would cost twice as much world on a panel two metres from
    // somebody's face, and they are read together anyway.
    const lines = hudLines({ ...bare, seat: 'blue', phase: 'roll' })
    expect(lines.map((line) => line.text)).toContain('BLUE  ·  ROLL')
  })

  test('and quietly, because they are context rather than news', () => {
    const line = hudLines({ ...bare, seat: 'blue', phase: 'roll' })[0]
    expect(line.tone).toBe('quiet')
  })

  test('either on its own is still a line', () => {
    expect(hudLines({ ...bare, seat: 'red' })[0]?.text).toBe('RED')
    expect(hudLines({ ...bare, phase: 'over' })[0]?.text).toBe('OVER')
  })

  test('and a level with neither adds nothing', () => {
    expect(hudLines(bare)).toEqual(hudLines({ ...bare, seat: undefined, phase: null }))
  })
})
