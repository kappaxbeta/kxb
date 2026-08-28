import { describe, expect, test } from 'bun:test'
import { MAX_PLAYER_KEYS } from '@kxb/xp'
import { HOLD_AFTER, type Edge, pressBuffer } from '@/app/xp/_runtime/input/actions'
import { LABEL_MAX, countUp, faceOf, tapsSince, thumbKeys } from '@/app/xp/_runtime/input/touch-keys'

describe('what is written on a button', () => {
  test('a one-word action is that word', () => {
    expect(faceOf('grab')).toBe('GRAB')
  })

  test('a phrase keeps its first word rather than running them together', () => {
    // OPENTH is a word nobody can read; OPEN is the one the author put first.
    expect(faceOf('open the hatch')).toBe('OPEN')
  })

  test('a long word is clipped rather than shrunk', () => {
    expect(faceOf('grapplehook')).toBe('GRAPPL')
    expect(faceOf('grapplehook').length).toBe(LABEL_MAX)
  })

  test('surrounding space is not part of the name', () => {
    expect(faceOf('  shove  ')).toBe('SHOVE')
  })
})

describe('which bindings get a button', () => {
  test('document order is kept, so the card and the thumb agree', () => {
    expect(
      thumbKeys([
        { key: 'KeyE', does: 'grab' },
        { key: 'KeyQ', does: 'drop' },
      ]).map((entry) => entry.does),
    ).toEqual(['grab', 'drop'])
  })

  test('the name the rules listen for is handed back untouched', () => {
    // The label is uppercased for the face of the button; `does` must not be,
    // or nothing the document bound will ever fire.
    const [only] = thumbKeys([{ key: 'KeyE', does: 'open the hatch' }])
    expect(only?.does).toBe('open the hatch')
    expect(only?.label).toBe('OPEN')
    expect(only?.title).toBe('open the hatch')
  })

  test('two keys for one action draw one button', () => {
    expect(thumbKeys([
      { key: 'KeyE', does: 'grab' },
      { key: 'Enter', does: 'grab' },
    ])).toHaveLength(1)
  })

  test('an action with no name gets no button', () => {
    expect(thumbKeys([{ key: 'KeyE', does: '   ' }])).toEqual([])
  })

  test('a document with no keys draws nothing', () => {
    expect(thumbKeys(undefined)).toEqual([])
    expect(thumbKeys([])).toEqual([])
  })

  /**
   * The format refuses a sixth binding, so this can only come from a document
   * that reached the runtime some other way - and the failure worth preventing
   * is a column of buttons covering the screen, not a missing one.
   */
  test('more bindings than the format allows are cut rather than drawn', () => {
    const many = Array.from({ length: MAX_PLAYER_KEYS + 3 }, (_, index) => ({
      key: `Key${index}`,
      does: `act${index}`,
    }))

    expect(thumbKeys(many)).toHaveLength(MAX_PLAYER_KEYS)
  })
})

describe('finding the edge in a counter', () => {
  const GRAB = { does: 'grab', label: 'GRAB', title: 'grab' }
  const DROP = { does: 'drop', label: 'DROP', title: 'drop' }

  test('an untouched counter fires nothing', () => {
    expect(tapsSince({ grab: 3 }, { grab: 3 }, [GRAB])).toEqual([])
  })

  test('one tap fires once', () => {
    expect(tapsSince({ grab: 3 }, { grab: 4 }, [GRAB])).toEqual(['grab'])
  })

  /** The 16ms window a rhythm level lives in. */
  test('two taps between frames fire twice', () => {
    expect(tapsSince({}, { grab: 2 }, [GRAB])).toEqual(['grab', 'grab'])
  })

  test('two actions in one frame fire in draw order', () => {
    expect(tapsSince({}, { drop: 1, grab: 1 }, [GRAB, DROP])).toEqual(['grab', 'drop'])
  })

  test('an action with no button is not fired by its counter', () => {
    // The order list is the authority on what exists - a counter for something
    // that is not drawn is a press nobody could have made.
    expect(tapsSince({}, { ghost: 4 }, [GRAB])).toEqual([])
  })

  test('a counter that went backwards fires nothing rather than negatively', () => {
    expect(tapsSince({ grab: 5 }, { grab: 0 }, [GRAB])).toEqual([])
  })
})

describe('counting one more', () => {
  test('a counter nobody has touched starts at one', () => {
    expect(countUp({}, 'grab')).toEqual({ grab: 1 })
  })

  test('the map is replaced rather than written into', () => {
    const before = { grab: 1 }
    const after = countUp(before, 'grab')

    // The frame loop tells "something happened" from the object no longer being
    // the one it saw last frame, so this identity is the signal itself.
    expect(after).not.toBe(before)
    expect(before).toEqual({ grab: 1 })
    expect(after).toEqual({ grab: 2 })
  })

  test('the other counters are carried over', () => {
    expect(countUp({ grab: 2 }, 'shoot')).toEqual({ grab: 2, shoot: 1 })
  })
})

/**
 * The bug this describes: a level that picks up on `pressed` and puts down on
 * `released` was one-way on a phone. The buttons counted taps and nothing else,
 * so a piece came up off the board and no control on the glass could place it -
 * "i can pick but not place a figure".
 *
 * The fix is not a second button. It is the *keyboard's* buffer, handed the
 * action name where it expects a key code, so both gestures mean on glass what
 * they mean on a keyboard. This walks a thumb through it the way the component
 * does, and reads the tallies back the way the frame loop does.
 */
describe('a thumb on a button, both ends of it', () => {
  const PICK = { does: 'pick', label: 'PICK', title: 'pick' }
  /** What the controls hold: the two tallies, and the buffer that fills them. */
  const thumb = () => {
    const presses = pressBuffer([{ key: PICK.does, does: PICK.does }])
    let taps: Readonly<Record<string, number>> = {}
    let lifts: Readonly<Record<string, number>> = {}

    const bump = (edge: Edge | undefined) => {
      if (!edge) return
      if (edge.on === 'pressed') taps = countUp(taps, edge.does)
      else lifts = countUp(lifts, edge.does)
    }

    return {
      down: (at: number) => bump(presses.down(PICK.does, false, at)),
      up: (at: number) => bump(presses.up(PICK.does, at)),
      /** What the frame loop would fire, given what it saw last time. */
      fired: (seenTaps = {}, seenLifts = {}) => ({
        pressed: tapsSince(seenTaps, taps, [PICK]),
        released: tapsSince(seenLifts, lifts, [PICK]),
      }),
    }
  }

  test('a quick tap picks up and withholds the release', () => {
    const glass = thumb()
    glass.down(0)
    glass.up(50)

    expect(glass.fired()).toEqual({ pressed: ['pick'], released: [] })
  })

  test('tapping again is what puts it down', () => {
    const glass = thumb()
    glass.down(0)
    glass.up(50)
    glass.down(900)
    glass.up(950)

    // One of each, which is the whole of "pick it up, walk, put it down" on a
    // phone - and exactly what a keyboard has done for this since HOLD_AFTER.
    expect(glass.fired()).toEqual({ pressed: ['pick'], released: ['pick'] })
  })

  test('holding and lifting is the other gesture, unchanged', () => {
    const glass = thumb()
    glass.down(0)
    glass.up(HOLD_AFTER + 1)

    expect(glass.fired()).toEqual({ pressed: ['pick'], released: ['pick'] })
  })

  test('a finger the browser takes away still lets go', () => {
    // `onPointerCancel` calls the same `up`: a gesture stolen for a scroll must
    // not leave somebody holding a piece they cannot see themselves holding.
    const glass = thumb()
    glass.down(0)
    glass.up(HOLD_AFTER + 1)

    expect(glass.fired().released).toEqual(['pick'])
  })
})
