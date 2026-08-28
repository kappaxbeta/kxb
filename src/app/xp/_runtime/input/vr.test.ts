import { describe, expect, test } from 'bun:test'
import {
  bindingsFor,
  fitsOnAHeadset,
  NO_VR_INPUT,
  pressesFrom,
  readPads,
  rigSpot,
  SNAP_AT,
  SNAP_DEGREES,
  snapTurn,
  VR_JUMP,
  type Pad,
  type VrButton,
} from '@/app/xp/_runtime/input/vr'
import { DEAD_ZONE, NO_PUSH, pushFrom, stickAt } from '@/app/xp/_runtime/input/touch'
import { EYE_HEIGHT } from '@kxb/xp/engine'

/**
 * Where a document's keys land on a headset.
 *
 * Checked without one, because the arithmetic is the part that goes wrong: five
 * bindings, four face buttons, and a fifth that has to be *reported* rather than
 * quietly dropped. None of that needs hardware, and the hardware is exactly
 * where it would be most expensive to discover.
 */

const key = (does: string) => ({ key: `Key${does[0].toUpperCase()}`, does })

describe('the five-into-four problem', () => {
  test('a pair of controllers has exactly four face buttons', () => {
    /**
     * The number the whole file turns on: A and B on the right hand, X and Y on
     * the left. A document may bind five keys, so one cannot be reached, and
     * everything below is about saying so rather than hiding it.
     *
     * Asserted by handing it five and counting rather than against
     * `MAX_PLAYER_KEYS`, which `@kxb/xp` does not export yet - asked for, and
     * worth having, since the day that limit changes this file should fail
     * rather than quietly become wrong in a new way.
     */
    const layout = bindingsFor(['a', 'b', 'c', 'd', 'e'].map(key))
    expect(layout.bound).toHaveLength(4)
  })

  test('four bindings all get a face button', () => {
    const layout = bindingsFor([key('grab'), key('use'), key('shoot'), key('wave')])
    expect(layout.bound.map((b) => b.button)).toEqual(['a', 'b', 'x', 'y'])
    expect(layout.unreachable).toEqual([])
  })

  test('and a fifth is reported rather than silently lost', () => {
    /**
     * The failure this exists to prevent. Spilling the fifth onto a grip and
     * saying nothing is the tempting version, and it is the same class of bug as
     * a rules field nobody reads: an author binds it, believes it, and finds out
     * from somebody wearing the headset.
     */
    const layout = bindingsFor([
      key('grab'),
      key('use'),
      key('shoot'),
      key('wave'),
      key('point'),
    ])
    expect(layout.bound).toHaveLength(4)
    expect(layout.unreachable).toEqual(['point'])
    expect(fitsOnAHeadset([key('a'), key('b'), key('c'), key('d'), key('e')])).toBe(false)
  })

  test('a document that binds nothing fits trivially', () => {
    expect(fitsOnAHeadset([])).toBe(true)
    expect(bindingsFor([])).toEqual({ bound: [], unreachable: [] })
  })
})

describe('jump', () => {
  test('is on the right trigger, not a face button', () => {
    /**
     * The user's decision, and the reason is worth keeping: it is the input a
     * hand finds without looking, and moving it off the face buttons leaves all
     * four for what the level actually binds. Jump is the one action *every* XP
     * has, so it gets the input that needs no learning.
     */
    expect(VR_JUMP).toBe('triggerR')
  })

  test('and no document binding can take it', () => {
    // Face buttons only, so five bindings can never reach a trigger - the same
    // guarantee `RESERVED_KEYS` gives on a keyboard, arrived at by construction
    // rather than by a list.
    const layout = bindingsFor([key('a'), key('b'), key('c'), key('d'), key('e')])
    expect(layout.bound.map((b) => b.button)).not.toContain(VR_JUMP)
  })

  test('and the left trigger stays free', () => {
    // Deliberately unbound. A free input is worth more than a fifth binding
    // nobody asked for, and it is where a grab goes when something needs one.
    const layout = bindingsFor([key('a'), key('b'), key('c'), key('d'), key('e')])
    expect(layout.bound.map((b) => b.button)).not.toContain('triggerL')
  })
})

describe('which hand gets what', () => {
  test('the first binding is the one a right hand reaches first', () => {
    /**
     * Right hand before left, lower button before upper. The first thing a
     * document binds is the thing it most wants reached, so it gets the button
     * people press without looking.
     */
    expect(bindingsFor([key('grab')]).bound).toEqual([{ button: 'a', does: 'grab' }])
    expect(bindingsFor([key('grab'), key('use')]).bound[1].button).toBe('b')
  })

  test('the document’s order is preserved, not sorted', () => {
    // An author's order is a statement about importance. Sorting by name would
    // move a binding to a different finger because somebody renamed it.
    const layout = bindingsFor([key('zeta'), key('alpha')])
    expect(layout.bound.map((b) => b.does)).toEqual(['zeta', 'alpha'])
  })
})

/**
 * Moving, in a headset.
 *
 * None of this can be checked with a headset on inside `bun test`, and all of it
 * is the kind of thing that is wrong by a sign or by one index and looks like
 * something else entirely: a stick that walks you backwards, a grip that jumps,
 * a wearer standing three metres above the floor. Each of those reads as "VR is
 * broken" rather than as the one-character mistake it is.
 */

const pad = (handedness: string, over: Partial<Pad> = {}): Pad => ({
  handedness,
  // Four axes: touchpad then stick. The stick is 2 and 3, which is the single
  // most common thing to get wrong and presents as a stick that does nothing.
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 6 }, () => ({ pressed: false })),
  ...over,
})

const withButton = (handedness: string, index: number): Pad => {
  const buttons = Array.from({ length: 6 }, () => ({ pressed: false }))
  buttons[index] = { pressed: true }
  return pad(handedness, { buttons })
}

describe('the rig', () => {
  test('outside a session it goes where the eye goes', () => {
    // The camera sits at the rig's origin, so they are the same point.
    expect(rigSpot({ x: 3, y: 5, z: -2 }, false)).toEqual({ x: 3, y: 5, z: -2 })
  })

  test('inside one it goes to the feet, because the headset supplies the head', () => {
    /**
     * The bug this exists to prevent, and it has a precedent: `sampleAt` in
     * `presence` had every other player standing a body-height in the air for
     * exactly this reason - a position that is an eye used where a position that
     * is feet was wanted.
     *
     * `local-floor` puts the pose origin on the floor of the wearer's real room
     * and the pose already carries how tall they are. A rig at eye height stacks
     * one head on another.
     */
    const spot = rigSpot({ x: 3, y: 5, z: -2 }, true)
    expect(spot.y).toBe(5 - EYE_HEIGHT)
    expect({ x: spot.x, z: spot.z }).toEqual({ x: 3, z: -2 })
  })
})

describe('the sticks', () => {
  test('the left one moves and the right one turns', () => {
    /**
     * Not a preference. It is what every headset game does, and somebody who has
     * played one should not have to discover that this one is the other way
     * round.
     */
    const moving = readPads([pad('left', { axes: [0, 0, 1, 0] })])
    expect(moving.push.inputX).toBeCloseTo(1, 5)
    expect(moving.turn).toBe(0)

    const turning = readPads([pad('right', { axes: [0, 0, 1, 0] })])
    expect(turning.turn).toBeCloseTo(1, 5)
    expect(turning.push).toEqual(NO_PUSH)
  })

  test('pushing the stick away from you walks you forward', () => {
    /**
     * The sign, and it was wrong in the first draft of this file in a way the
     * first draft of this *test* agreed with - which is the whole argument for
     * checking it against `./touch` rather than against my own reasoning.
     *
     * `inputZ` is not a world axis. It is "+1 forward, exactly as `W` produces",
     * so forward is **positive** here even though forward is -z out in the
     * scene. A gamepad reports "away from me" as -1, and `pushFrom` does the one
     * negation in the whole path.
     */
    expect(readPads([pad('left', { axes: [0, 0, 0, -1] })]).push.inputZ).toBeGreaterThan(0)
    expect(readPads([pad('left', { axes: [0, 0, 0, 1] })]).push.inputZ).toBeLessThan(0)
  })

  test('and it agrees with a thumb on glass, by construction', () => {
    /**
     * The two input paths, asserted equal rather than assumed. A stick pushed
     * fully away and a thumb dragged to the top of the ring are the same
     * gesture, and this is what stops them becoming two answers to it.
     */
    expect(readPads([pad('left', { axes: [0, 0, 0, -1] })]).push).toEqual(
      pushFrom(stickAt(0, -1, 1)),
    )
  })

  test('the stick is axes 2 and 3, not 0 and 1', () => {
    // 0 and 1 are the touchpad under `xr-standard`. Reading those gives a stick
    // that does nothing at all, which looks like broken hardware.
    expect(readPads([pad('left', { axes: [1, 1, 0, 0] })]).push).toEqual(NO_PUSH)
  })

  test('a resting thumb is neither a walk nor a spin', () => {
    // `./touch`'s dead zone, inherited rather than chosen again - and applied to
    // turning too, or a controller put down slowly rotates the world.
    expect(readPads([pad('left', { axes: [0, 0, DEAD_ZONE / 2, 0] })]).push).toEqual(NO_PUSH)
    expect(readPads([pad('right', { axes: [0, 0, DEAD_ZONE / 2, 0] })]).turn).toBe(0)
  })

  test('and pushing it right to the edge is a run', () => {
    expect(readPads([pad('left', { axes: [0, 0, 0, -1] })]).push.sprint).toBe(true)
    expect(readPads([pad('left', { axes: [0, 0, 0, -0.5] })]).push.sprint).toBe(false)
  })

  test('no controllers is standing still, not a crash', () => {
    // A session can report a frame before the controllers are tracked, and a
    // headset put down mid-match reports none at all.
    expect(readPads([])).toEqual(NO_VR_INPUT)
    expect(readPads([null, undefined])).toEqual(NO_VR_INPUT)
  })
})

describe('the buttons', () => {
  test('jump is the right trigger and nothing else', () => {
    /**
     * The user's decision, checked at the layer that reads hardware rather than
     * only at the layer that names it. `VR_JUMP` saying `triggerR` and the pad
     * reader jumping on a grip would be two files agreeing in the abstract and
     * disagreeing in the hand.
     */
    expect(readPads([withButton('right', 0)]).jump).toBe(true)
    expect(readPads([withButton('left', 0)]).jump).toBe(false)
    for (const index of [1, 4, 5]) {
      expect({ index, jump: readPads([withButton('right', index)]).jump }).toEqual({
        index,
        jump: false,
      })
    }
  })

  test('the left trigger is a binding, not a second jump', () => {
    // Deliberately free - see the note at the top. It reports itself so that
    // when something needs a "use", the input is already there.
    expect(readPads([withButton('left', 0)]).down).toEqual(['triggerL'])
  })

  test('the face buttons are the ones bindingsFor hands out', () => {
    /**
     * The two halves meeting. `bindingsFor` promises a document's first binding
     * lands on A; this is where A is actually read, and if the hands were
     * swapped here the promise would be kept in the abstract and broken in the
     * hand.
     */
    expect(readPads([withButton('right', 4)]).down).toEqual(['a'])
    expect(readPads([withButton('right', 5)]).down).toEqual(['b'])
    expect(readPads([withButton('left', 4)]).down).toEqual(['x'])
    expect(readPads([withButton('left', 5)]).down).toEqual(['y'])

    const layout = bindingsFor([{ key: 'KeyE', does: 'grab' }])
    expect(readPads([withButton('right', 4)]).down).toContain(layout.bound[0].button)
  })

  test('both hands at once, which is the normal case', () => {
    const both = readPads([withButton('right', 4), withButton('left', 5)])
    expect([...both.down].sort()).toEqual(['a', 'y'])
  })
})

describe('snap turning', () => {
  test('a flick turns you once', () => {
    expect(snapTurn(1, true)).toEqual({ degrees: SNAP_DEGREES, armed: false })
    expect(snapTurn(-1, true)).toEqual({ degrees: -SNAP_DEGREES, armed: false })
  })

  test('holding it does not keep turning you', () => {
    /**
     * The bug the latch exists for, at the rate a headset actually runs. Held
     * over the threshold for a third of a second is thirty frames at 90 Hz, and
     * without this that is thirty snaps - a full turn and a half from one flick
     * nobody thought was long.
     */
    let armed = true
    let total = 0
    for (let frame = 0; frame < 30; frame++) {
      const step = snapTurn(1, armed)
      total += step.degrees
      armed = step.armed
    }
    expect(total).toBe(SNAP_DEGREES)
  })

  test('but letting go and flicking again does', () => {
    // Re-armed by the stick passing back through the middle, not by a timer:
    // a timer would turn you again while you were still holding it.
    const first = snapTurn(1, true)
    const released = snapTurn(0, first.armed)
    expect(released).toEqual({ degrees: 0, armed: true })
    expect(snapTurn(1, released.armed).degrees).toBe(SNAP_DEGREES)
  })

  test('a nudge is not a flick', () => {
    /**
     * Well past the dead zone, because turning is discrete where moving is
     * proportional: a thumb that has drifted enough to walk slowly should not
     * also spin you a twelfth of a circle.
     */
    expect(snapTurn(DEAD_ZONE + 0.05, true).degrees).toBe(0)
    expect(SNAP_AT).toBeGreaterThan(DEAD_ZONE * 2)
  })

  test('and it stays armed while nothing is happening', () => {
    expect(snapTurn(0, true)).toEqual({ degrees: 0, armed: true })
  })
})

describe('a button going down', () => {
  const key = (does: string) => ({ key: `Key${does[0].toUpperCase()}`, does })
  const keys = [key('grab'), key('use')]

  test('fires once, not once a frame', () => {
    /**
     * The whole reason this is a comparison rather than a check. The Gamepad API
     * has no events - a held button reports itself every frame - so at 90 Hz a
     * missing edge means a rule firing ninety times a second while somebody
     * rests a thumb, which nobody diagnoses from the symptom.
     */
    expect(pressesFrom(keys, ['a'], [])).toEqual(['grab'])
    expect(pressesFrom(keys, ['a'], ['a'])).toEqual([])
  })

  test('and again after letting go', () => {
    expect(pressesFrom(keys, [], ['a'])).toEqual([])
    expect(pressesFrom(keys, ['a'], [])).toEqual(['grab'])
  })

  test('the button that acts is the button the card printed', () => {
    /**
     * The promise `bindingsFor` makes, checked where it is kept. The controls
     * card and this both derive from that one function precisely so a card
     * saying A and a game wanting B cannot happen - which is a mistake you would
     * only find out about while wearing a headset.
     */
    const layout = bindingsFor(keys)
    for (const binding of layout.bound) {
      expect(pressesFrom(keys, [binding.button], [])).toEqual([binding.does])
    }
  })

  test('two at once are both reported', () => {
    expect(pressesFrom(keys, ['a', 'b'], []).sort()).toEqual(['grab', 'use'])
  })

  test('a binding with no button never fires', () => {
    // The fifth key, which `bindingsFor` says has nowhere to go. It is reported
    // on the controls card and it is unpressable, and both of those are true.
    const five = ['a', 'b', 'c', 'd', 'e'].map(key)
    const every: VrButton[] = ['a', 'b', 'x', 'y', 'triggerL', 'gripL', 'gripR', 'triggerR']
    expect(pressesFrom(five, every, [])).toHaveLength(4)
  })

  test('a level that binds nothing has nothing to press', () => {
    expect(pressesFrom([], ['a', 'b'], [])).toEqual([])
  })
})
