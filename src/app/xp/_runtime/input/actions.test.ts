/**
 * A press is an edge, and both ways of losing one are silent.
 *
 * Reading the key down each frame fires sixty times a second; reading only
 * `keydown` fires again on the operating system's autorepeat. Neither throws,
 * neither shows up in a type, and both read as "the level is buggy" rather than
 * as "the host is wrong" - so nearly every test here is about how many times
 * something happened, not whether it did.
 */
import { describe, expect, test } from 'bun:test'
import { emptyWorld, fire, type Blueprint } from '@kxb/xp/engine'
import { HOLD_AFTER, pressBuffer } from '@/app/xp/_runtime/input/actions'

const KEYS = [
  { key: 'KeyE', does: 'grab' },
  { key: 'KeyQ', does: 'open the hatch' },
]

describe('a bound key emits the name the level gave it', () => {
  test('the does name, not the code', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
    presses.up('KeyE', HOLD_AFTER + 1)
    expect(presses.down('KeyQ')).toEqual({ does: 'open the hatch', on: 'pressed' })
  })

  test('a key the level did not bind emits nothing', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyZ')).toBeUndefined()
    // And movement is not something a document may bind, so it never arrives
    // here - but if it did, it is not bound and so is not an action.
    expect(presses.down('KeyW')).toBeUndefined()
  })

  test('a document that binds nothing emits nothing, ever', () => {
    const presses = pressBuffer([])
    expect(presses.down('KeyE')).toBeUndefined()
  })
})

describe('once per press', () => {
  /**
   * The bug this module exists for. Leaning on a key must not fire the action
   * for as long as it is held - a `pressed` trigger that spends ammunition
   * would empty the clip in a frame.
   */
  test('holding a key emits once, not once a frame', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
    expect(presses.down('KeyE')).toBeUndefined()
    expect(presses.down('KeyE')).toBeUndefined()
  })

  test('and again after it is let go', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
    // Let go *slowly*, or the tap latches and the next press is the release
    // it withheld - see `HOLD_AFTER`.
    presses.up('KeyE', HOLD_AFTER + 1)
    expect(presses.down('KeyE', false, HOLD_AFTER + 1)).toEqual({ does: 'grab', on: 'pressed' })
  })

  /**
   * The operating system's autorepeat, which arrives half a second in and is
   * otherwise indistinguishable from a very fast player.
   */
  test('an autorepeat is refused even on the first report', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE', true)).toBeUndefined()
  })

  test('two different keys do not block one another', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
    expect(presses.down('KeyQ')).toEqual({ does: 'open the hatch', on: 'pressed' })
    // Still held, so still silent.
    expect(presses.down('KeyE')).toBeUndefined()
  })

  test('letting go of one does not re-arm the other', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyE')
    presses.down('KeyQ')
    presses.up('KeyE', HOLD_AFTER + 1)
    expect(presses.down('KeyQ')).toBeUndefined()
    expect(presses.down('KeyE', false, HOLD_AFTER + 1)).toEqual({ does: 'grab', on: 'pressed' })
  })

  test('letting go of a key that was never down is harmless', () => {
    const presses = pressBuffer(KEYS)
    // Let go *slowly*, or the tap latches and the next press is the release
    // it withheld - see `HOLD_AFTER`.
    presses.up('KeyE', HOLD_AFTER + 1)
    expect(presses.down('KeyE', false, HOLD_AFTER + 1)).toEqual({ does: 'grab', on: 'pressed' })
  })
})

describe('losing focus mid-press', () => {
  /**
   * Alt-tab while holding a bound key and the `keyup` never arrives, so the key
   * is still "down" when you come back - and the next press is swallowed as a
   * repeat. `./player` has the same guard for movement, where the symptom is
   * that you are still walking; here the symptom is an action that is dead
   * until you press something else, which is harder to explain.
   */
  test('clearing re-arms everything', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyE')
    presses.down('KeyQ')
    presses.clear()
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
    expect(presses.down('KeyQ')).toEqual({ does: 'open the hatch', on: 'pressed' })
  })

  test('clearing an idle buffer changes nothing', () => {
    const presses = pressBuffer(KEYS)
    presses.clear()
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
  })
})

describe('a duplicate binding the parser would have refused', () => {
  /**
   * `parseXp` refuses a document that binds one key twice, so this can only
   * arrive from a caller that skipped it. First wins, matching the order
   * ./controls lists them in - the failure worth avoiding is the panel and the
   * world disagreeing about what E does, not which of the two is chosen.
   */
  test('the first one wins, as the panel shows', () => {
    const presses = pressBuffer([
      { key: 'KeyE', does: 'grab' },
      { key: 'KeyE', does: 'shoot' },
    ])
    expect(presses.down('KeyE')).toEqual({ does: 'grab', on: 'pressed' })
  })
})

/**
 * The half a unit test of the buffer cannot reach: that the name it produces is
 * the name `fire` matches on.
 *
 * The drain itself lives in a `useFrame` in ./simulation, and the Browser pane
 * issues no frames, so it cannot be watched anywhere. What *can* be pinned down
 * is the contract either side of it - a press produces a `does`, and `fire` with
 * that `does` as `clock.key` runs the level's rule and nothing else's. If those
 * two agree, the only thing left between them is the loop.
 */
describe('the name a press produces is the name a rule listens for', () => {
  /**
   * A real `Blueprint`, not a shape that merely satisfies `fire`.
   *
   * Typed rather than cast, and it earned its keep immediately: bun's runner
   * does not typecheck, so a fixture missing `collider`, `tags`, `props` and
   * `sockets` passed here and failed only under `bunx tsc`. A cast would have
   * hidden exactly the mismatch a host most wants to know about.
   */
  const BLUEPRINTS: Readonly<Record<string, Blueprint>> = {
    lever: {
      model: 'proto/Box_A',
      collider: 'none',
      tags: [],
      props: {},
      sockets: {},
      triggers: [
        { on: 'pressed', key: 'grab', do: [{ op: 'emit', event: 'grabbed' }] },
        { on: 'pressed', key: 'open the hatch', do: [{ op: 'emit', event: 'hatch' }] },
      ],
    },
  }

  function lever() {
    const world = emptyWorld()
    world.alive.add(1)
    world.blueprint.set(1, 'lever')
    return world
  }

  test('a press fires the rule that named it, and only that one', () => {
    const presses = pressBuffer(KEYS)
    const edge = presses.down('KeyE')
    expect(edge).toEqual({ does: 'grab', on: 'pressed' })

    const effects = fire(lever(), BLUEPRINTS, 1, 'pressed', null, { key: edge?.does })
    expect(effects).toEqual([{ kind: 'emit', event: 'grabbed', from: 1 }])
  })

  test('the other binding fires the other rule', () => {
    const presses = pressBuffer(KEYS)
    const effects = fire(lever(), BLUEPRINTS, 1, 'pressed', null, {
      key: presses.down('KeyQ')?.does,
    })
    expect(effects).toEqual([{ kind: 'emit', event: 'hatch', from: 1 }])
  })

  /**
   * The bug that would make all five bindings one binding. `fire` compares the
   * trigger's own `key`, so a name nothing listens for is simply a press the
   * level does not care about - not an error, and not everything at once.
   */
  test('a name no rule listens for does nothing at all', () => {
    expect(fire(lever(), BLUEPRINTS, 1, 'pressed', null, { key: 'dance' })).toEqual([])
  })

  /**
   * And the shape of the mistake worth guarding: passing no key. Every
   * `pressed` rule would match a trigger whose `key` was also undefined - which
   * is why the format refuses a `pressed` with no key, and why the host must
   * never call `fire` without one.
   */
  test('no key fires nothing, rather than everything', () => {
    expect(fire(lever(), BLUEPRINTS, 1, 'pressed', null, {})).toEqual([])
  })
})

describe('tap twice, or hold - the same key does both', () => {
  /**
   * *"Can you make it so you press E once and then once to release, not E while
   * keeping it - but it is a good mechanic to have."*
   *
   * Both, and no document knows the difference. Holding is the one that lets
   * you feel what you are carrying across a board; tapping is what most people
   * reach for. The decision is here rather than in a level because it is a fact
   * about keystrokes: a trigger reading `on: 'released'` should not have to know
   * whether somebody was holding the key or tapped it a minute ago.
   */
  test('a quick tap picks up and withholds the release', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE', false, 0)).toEqual({ does: 'grab', on: 'pressed' })
    // Under the threshold: this did not mean *put it down*, it meant *I have
    // picked this up*.
    expect(presses.up('KeyE', 100)).toBeUndefined()
  })

  test('and the next tap is the release it withheld', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyE', false, 0)
    presses.up('KeyE', 100)
    expect(presses.down('KeyE', false, 5_000)).toEqual({ does: 'grab', on: 'released' })
  })

  test('and the tap after that picks up again', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyE', false, 0)
    presses.up('KeyE', 100)
    presses.down('KeyE', false, 5_000)
    presses.up('KeyE', 5_100)
    expect(presses.down('KeyE', false, 9_000)).toEqual({ does: 'grab', on: 'pressed' })
  })

  test('a key held past the threshold releases when it is let go', () => {
    const presses = pressBuffer(KEYS)
    expect(presses.down('KeyE', false, 0)).toEqual({ does: 'grab', on: 'pressed' })
    expect(presses.up('KeyE', HOLD_AFTER + 1)).toEqual({ does: 'grab', on: 'released' })
  })

  test('and it leaves nothing owed, so the next press is a press', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyE', false, 0)
    presses.up('KeyE', HOLD_AFTER + 1)
    expect(presses.down('KeyE', false, 9_000)).toEqual({ does: 'grab', on: 'pressed' })
  })

  test('a blur lets go of a tapped key too', () => {
    // Coming back to the tab still holding a piece you cannot see yourself
    // holding is worse than dropping it where it was.
    const presses = pressBuffer(KEYS)
    presses.down('KeyE', false, 0)
    presses.up('KeyE', 100)
    expect(presses.clear()).toEqual(['grab'])
  })
})

describe('and only for an action the level can hear a release of', () => {
  /**
   * *"The mobile button for roll seems not to work right."*
   *
   * The latch above is the whole of carrying something, and it is a debt: a
   * quick tap withholds its release and the next tap pays it. That is right for
   * `use`, which has an `on: 'released'` rule to pay it *to*. It is nothing but
   * cost for `roll`, which has only a press - so the die threw on the first tap,
   * spent the second settling up, threw on the third.
   *
   * It was the same on a keyboard and hidden there, because a key held past
   * `HOLD_AFTER` releases honestly and a keyboard is where people lean on keys.
   * On glass there is no leaning: every action is a circle, and a circle you
   * tap. Half the taps did nothing.
   *
   * So the buffer is told which actions latch, and the thing that knows is the
   * document - `releasedKeys` in `@kxb/xp` reads it off the triggers, and both
   * the keyboard and the thumb are built from the same answer.
   */
  const LATCHES = new Set(['grab'])

  test('an action with no release rule releases the moment the finger lifts', () => {
    const presses = pressBuffer(KEYS, LATCHES)
    expect(presses.down('KeyQ', false, 0)).toEqual({ does: 'open the hatch', on: 'pressed' })
    expect(presses.up('KeyQ', 100)).toEqual({ does: 'open the hatch', on: 'released' })
  })

  test('so every tap of it is a press, not every other one', () => {
    const presses = pressBuffer(KEYS, LATCHES)
    for (const at of [0, 1_000, 2_000]) {
      expect(presses.down('KeyQ', false, at)).toEqual({ does: 'open the hatch', on: 'pressed' })
      presses.up('KeyQ', at + 100)
    }
  })

  test('and one that does keeps both gestures', () => {
    const presses = pressBuffer(KEYS, LATCHES)
    presses.down('KeyE', false, 0)
    expect(presses.up('KeyE', 100)).toBeUndefined()
    expect(presses.down('KeyE', false, 5_000)).toEqual({ does: 'grab', on: 'released' })
  })

  test('an unlatched key owes nothing, so a blur has nothing to let go of', () => {
    const presses = pressBuffer(KEYS, LATCHES)
    presses.down('KeyQ', false, 0)
    presses.up('KeyQ', 100)
    expect(presses.clear()).toEqual([])
  })

  test('told nothing, everything latches - which is what every caller did before', () => {
    const presses = pressBuffer(KEYS)
    presses.down('KeyQ', false, 0)
    expect(presses.up('KeyQ', 100)).toBeUndefined()
  })
})
