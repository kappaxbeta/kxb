/**
 * What a key's wait does, asked without a browser or a keyboard.
 *
 * The whole reason `coolingLeft` is a function of three numbers: a cooldown is a
 * thing you notice by pressing a button twice and waiting, which is the one kind
 * of question a screenshot cannot answer and a test can ask a hundred times.
 *
 * The property worth guarding above all the others is the last one here - the
 * gate and the ring are read from the *same* answer, so "the button says ready
 * and the press is refused" is not a state this module can produce.
 */
import { describe, expect, test } from 'bun:test'
import { cooldownsOf, coolingFraction, coolingLeft, throughCooling } from './cooldowns'
import { MAX_KEY_COOLDOWN, parseXp, XP_FORMAT } from '../document/format'

describe('what is left of a wait', () => {
  test('the whole of it on the frame the key fired', () => {
    // Pressed at 10 with a three second wait: ready at 13, nothing spent yet.
    expect(coolingLeft(13, 10, 3)).toBe(3)
  })

  test('it runs down as the clock moves', () => {
    expect(coolingLeft(13, 11.5, 3)).toBe(1.5)
    expect(coolingLeft(13, 12.9, 3)).toBeCloseTo(0.1, 6)
  })

  test('zero the moment it is up, and zero forever after', () => {
    /**
     * The clamp that matters most. A gate written against a raw subtraction
     * would go negative and a test for `!== 0` would refuse the key for the rest
     * of the session - so the floor is what makes "ready" a state you can reach
     * rather than a moment you can miss between two frames.
     */
    expect(coolingLeft(13, 13, 3)).toBe(0)
    expect(coolingLeft(13, 400, 3)).toBe(0)
  })

  test('never more than the wait itself, however the clocks disagree', () => {
    // A deadline further off than the whole cooldown can only mean the two ends
    // came off different clocks. A full ring is the honest way to be wrong.
    expect(coolingLeft(99, 10, 3)).toBe(3)
  })

  test('a key with no wait on it is never cooling', () => {
    expect(coolingLeft(0, 0, 0)).toBe(0)
    expect(coolingLeft(13, 10, 0)).toBe(0)
  })
})

describe('the fraction a ring is drawn from', () => {
  test('one when it just fired, zero when it is ready', () => {
    expect(coolingFraction(13, 10, 3)).toBe(1)
    expect(coolingFraction(13, 13, 3)).toBe(0)
  })

  test('half way through is a half', () => {
    expect(coolingFraction(13, 11.5, 3)).toBeCloseTo(0.5, 6)
  })

  test('a key with no wait draws nothing rather than dividing by zero', () => {
    // So a caller may ask about every binding it has and draw most of them as
    // empty, which is what both button rows do.
    expect(coolingFraction(0, 10, 0)).toBe(0)
    expect(Number.isFinite(coolingFraction(5, 10, 0))).toBe(true)
  })

  test('it never leaves nought-to-one, whatever the clocks say', () => {
    for (const [readyAt, now] of [[99, 10], [13, 400], [0, 0]] as const) {
      const share = coolingFraction(readyAt, now, 3)
      expect(share).toBeGreaterThanOrEqual(0)
      expect(share).toBeLessThanOrEqual(1)
    }
  })
})

describe('which of a document’s keys have a wait', () => {
  test('the ones that asked for one, by the name they emit', () => {
    const waits = cooldownsOf([
      { key: 'KeyE', does: 'kick' },
      { key: 'KeyQ', does: 'dash', cooldown: 3 },
    ])
    // Keyed by `does`, because that is what everything downstream of a keystroke
    // deals in - a rule, a phone's button, a headset with no key codes at all.
    expect(waits.get('dash')).toBe(3)
    expect(waits.has('kick')).toBe(false)
    expect(waits.size).toBe(1)
  })

  test('a level that asks for none hands back nothing at all', () => {
    /**
     * The property the whole mechanism rests on: every document written before
     * this field existed produces an empty map, and the host skips the gate and
     * the publish entirely on `size`. Which is what makes this safe to add to a
     * format with levels already in the world.
     */
    expect(cooldownsOf([{ key: 'KeyE', does: 'kick' }]).size).toBe(0)
    expect(cooldownsOf([]).size).toBe(0)
    expect(cooldownsOf(undefined).size).toBe(0)
  })

  test('a nonsense wait is left out rather than trusted', () => {
    // The parser refuses these, so they can only arrive from a caller that
    // skipped it - and a zero or a negative in the map would be a key whose ring
    // divides by nothing.
    const waits = cooldownsOf([
      { key: 'KeyQ', does: 'dash', cooldown: 0 },
      { key: 'KeyF', does: 'flap', cooldown: -2 },
    ])
    expect(waits.size).toBe(0)
  })
})

describe('a wait in a document', () => {
  const level = (keys: unknown) => ({
    format: XP_FORMAT,
    id: 'waiting',
    name: 'Waiting',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    player: { keys },
  })

  test('a key may carry one, and it survives the parse', () => {
    const parsed = parseXp(level([{ key: 'KeyQ', does: 'dash', cooldown: 3 }]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.player.keys?.[0]?.cooldown).toBe(3)
  })

  test('a binding without one keeps the two fields it always had', () => {
    // Round-tripping matters here: a level with no waits in it must not gain a
    // field, or every document in the world changes shape the day this shipped.
    const parsed = parseXp(level([{ key: 'KeyE', does: 'kick' }]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.player.keys?.[0]).toEqual({ key: 'KeyE', does: 'kick' })
  })

  test('a slipped decimal is refused rather than played', () => {
    // `3000` is somebody who typed milliseconds, and a key that comes back in
    // fifty minutes would read as a level that is broken rather than strict.
    for (const cooldown of [0, -1, MAX_KEY_COOLDOWN + 1, 3000, 'soon', NaN]) {
      const parsed = parseXp(level([{ key: 'KeyQ', does: 'dash', cooldown }]))
      expect(parsed.ok).toBe(false)
    }
  })
})

/**
 * The gate a press goes through before it may fire anything.
 *
 * Lifted out of the frame callback in the host's simulation.tsx, where it had
 * no test - the only way to exercise a cooldown was to author a level with a
 * wait on a key and press it twice quickly.
 */
describe('throughCooling', () => {
  const none = new Map<string, number>()

  test('a document with no waits passes every press and arms nothing', () => {
    const out = throughCooling({ pressed: ['dash', 'use'], waits: none, readyAt: none, now: 10 })
    expect(out.asked).toEqual(['dash', 'use'])
    expect(out.armed.size).toBe(0)
  })

  test('a key that has never been pressed is ready', () => {
    const out = throughCooling({
      pressed: ['dash'],
      waits: new Map([['dash', 2]]),
      readyAt: none,
      now: 0,
    })
    expect(out.asked).toEqual(['dash'])
    expect(out.armed.get('dash')).toBe(2)
  })

  test('and is armed for its wait from the moment it got through', () => {
    const out = throughCooling({
      pressed: ['dash'],
      waits: new Map([['dash', 2]]),
      readyAt: none,
      now: 7.5,
    })
    expect(out.armed.get('dash')).toBe(9.5)
  })

  test('a key still cooling is dropped, not queued', () => {
    const out = throughCooling({
      pressed: ['dash'],
      waits: new Map([['dash', 2]]),
      readyAt: new Map([['dash', 5]]),
      now: 4.9,
    })
    expect(out.asked).toEqual([])
    expect(out.armed.size).toBe(0)
  })

  test('and is through the moment its wait is up', () => {
    const out = throughCooling({
      pressed: ['dash'],
      waits: new Map([['dash', 2]]),
      readyAt: new Map([['dash', 5]]),
      now: 5,
    })
    expect(out.asked).toEqual(['dash'])
    expect(out.armed.get('dash')).toBe(7)
  })

  /**
   * A cooling key must not hold up the others. Two hands, two keys, and one of
   * them on a wait is the ordinary case rather than an edge.
   */
  test('one key cooling does not stop another', () => {
    const out = throughCooling({
      pressed: ['dash', 'use'],
      waits: new Map([['dash', 2]]),
      readyAt: new Map([['dash', 5]]),
      now: 1,
    })
    expect(out.asked).toEqual(['use'])
  })

  test('a key with no wait of its own is never armed', () => {
    const out = throughCooling({
      pressed: ['use'],
      waits: new Map([['dash', 2]]),
      readyAt: none,
      now: 3,
    })
    expect(out.asked).toEqual(['use'])
    expect(out.armed.has('use')).toBe(false)
  })

  /** The caller's maps are the caller's; this only reports. */
  test('nothing handed in is written to', () => {
    const readyAt = new Map([['dash', 1]])
    const waits = new Map([['dash', 2]])
    throughCooling({ pressed: ['dash'], waits, readyAt, now: 9 })
    expect(readyAt.get('dash')).toBe(1)
    expect(waits.get('dash')).toBe(2)
  })

  test('the same key pressed twice in one frame is armed once, from that frame', () => {
    const out = throughCooling({
      pressed: ['dash', 'dash'],
      waits: new Map([['dash', 2]]),
      readyAt: none,
      now: 4,
    })
    expect(out.asked).toEqual(['dash', 'dash'])
    expect(out.armed.get('dash')).toBe(6)
  })
})
