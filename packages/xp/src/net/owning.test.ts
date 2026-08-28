/**
 * The elected tier, asked without a network.
 *
 * Everything here is a function from a roster or a packet to an answer, which
 * is the whole reason the election has no protocol in it: if two clients can
 * disagree about who owns the ball, they disagree *here*, in a pure function
 * that can be called twice with two different points of view.
 */
import { describe, expect, test } from 'bun:test'
import {
  applyShove,
  Balls,
  bodiesOf,
  claiming,
  heldAfter,
  heldBy,
  ownerOf,
  ownsBodies,
  readBodies,
  readClaim,
  readShove,
  resolve,
  type Claim,
  type Held,
} from './owning'
import { push, stepBodies, velocityOf } from '../world/bodies'
import { emptyWorld, type EntityId, type EntityWorld } from '../world/entities'
import type { Blueprint, BodySpec } from '../document/blueprints'

const FRAME = 1 / 60

function blueprint(body?: BodySpec): Blueprint {
  return {
    model: 'proto/crate',
    collider: { w: 1, h: 1, d: 1 },
    tags: [],
    props: {},
    sockets: {},
    triggers: [],
    ...(body ? { body } : {}),
  }
}

function oneBody(at: { x: number; y: number; z: number }, body: BodySpec = {}) {
  const world = emptyWorld()
  const id = 1 as EntityId
  world.alive.add(id)
  world.blueprint.set(id, 'thing')
  world.position.set(id, { ...at })
  world.box.set(id, {
    minX: at.x - 0.5,
    maxX: at.x + 0.5,
    minY: at.y,
    maxY: at.y + 1,
    minZ: at.z - 0.5,
    maxZ: at.z + 0.5,
  })
  return { world, blueprints: { thing: blueprint(body) }, id }
}

describe('the election', () => {
  test('the lowest id owns it, whoever is asking', () => {
    // The property the whole thing rests on: three clients, three points of
    // view, one answer. Nobody sends anything to find this out.
    expect(ownsBodies('a', ['b', 'c'])).toBe(true)
    expect(ownsBodies('b', ['a', 'c'])).toBe(false)
    expect(ownsBodies('c', ['a', 'b'])).toBe(false)
  })

  test('alone in the room, you own it', () => {
    // Not a special case in the code, and the reason this is safe to switch on
    // everywhere: a level played by one person behaves as it always did.
    expect(ownsBodies('anybody', [])).toBe(true)
  })

  test('the owner leaving hands it to the next one, with nobody deciding', () => {
    const room = ['a', 'b', 'c']
    expect(ownerOf(room)).toBe('a')
    expect(ownerOf(room.filter((id) => id !== 'a'))).toBe('b')
    expect(ownerOf(room.filter((id) => id !== 'a' && id !== 'b'))).toBe('c')
  })

  test('an empty room owns nothing, and a nameless client is never the owner', () => {
    expect(ownerOf([])).toBeNull()
    expect(ownsBodies('', ['b'])).toBe(false)
  })
})

describe('ownership follows the ball', () => {
  const ROOM = ['a', 'b', 'c']

  test('the floor is still the lowest id, so one person alone is unchanged', () => {
    expect(heldBy(ROOM)).toEqual({ owner: 'a', seq: 0 })
    expect(heldBy(['solo'])).toEqual({ owner: 'solo', seq: 0 })
    expect(heldBy([])).toEqual({ owner: null, seq: 0 })
  })

  test('touching it takes it, from whoever had it', () => {
    /**
     * The report this exists for: *"when someone in the middle take it over its
     * so possible also in the middle"*.
     *
     * The lowest id owned the ball for the whole match, so in a two-player game
     * one player's touches were resolved locally on the true positions and the
     * other's were the owner **guessing** from an avatar box a quarter of a
     * second old. Which of the two you were was decided by a string comparison.
     */
    const held = heldBy(ROOM)
    expect(held.owner).toBe('a')

    const claim = claiming(held, 'c')!
    expect(claim).toEqual({ who: 'c', seq: 1 })
    expect(resolve(held, claim, ROOM).owner).toBe('c')
  })

  test('the owner does not claim what it already has', () => {
    expect(claiming({ owner: 'a', seq: 3 }, 'a')).toBeNull()
    // And a client with no id has not joined and may not claim.
    expect(claiming({ owner: 'a', seq: 3 }, '')).toBeNull()
  })

  test('two people on the ball at once land on one owner, in either order', () => {
    /**
     * The property the whole protocol rests on, and the one a computed election
     * cannot have: **order independence**. Two claims at the same seq is a race,
     * and every receiver has to break it the same way however the two packets
     * happen to be ordered on its own socket - otherwise the two ends of the
     * pitch disagree about who is simulating the ball and neither ever finds out.
     */
    const held = heldBy(ROOM)
    const fromB: Claim = { who: 'b', seq: 1 }
    const fromC: Claim = { who: 'c', seq: 1 }

    const bThenC = resolve(resolve(held, fromB, ROOM), fromC, ROOM)
    const cThenB = resolve(resolve(held, fromC, ROOM), fromB, ROOM)
    expect(bThenC).toEqual(cThenB)
    // The lower id, which is the one ordering every client already agrees on.
    expect(bThenC.owner).toBe('b')
  })

  test('a duplicate or a reordered claim changes nothing', () => {
    const one = resolve(heldBy(ROOM), { who: 'c', seq: 1 }, ROOM)
    expect(resolve(one, { who: 'c', seq: 1 }, ROOM)).toEqual(one)
    // Behind what we hold: a packet that took the long way round.
    expect(resolve({ owner: 'c', seq: 4 }, { who: 'b', seq: 2 }, ROOM).owner).toBe('c')
  })

  test('a claim from somebody who is not in the room is refused', () => {
    // Not paranoia about a hostile client - the ordinary case of a claim landing
    // just after its sender's presence left, which would hand the ball to nobody.
    expect(resolve(heldBy(ROOM), { who: 'gone', seq: 9 }, ROOM).owner).toBe('a')
    expect(resolve(heldBy(ROOM), { who: 'c', seq: 1.5 }, ROOM).owner).toBe('a')
  })

  test('the owner leaving hands it on, and outranks a claim it had in flight', () => {
    const held: Held = { owner: 'c', seq: 4 }
    const after = heldAfter(held, ['a', 'b'])
    expect(after).toEqual({ owner: 'a', seq: 5 })
    // The stale claim the departing owner sent on its way out cannot win.
    expect(resolve(after, { who: 'c', seq: 5 }, ['a', 'b']).owner).toBe('a')
    // And a leave that was not the owner's changes nothing at all.
    expect(heldAfter({ owner: 'a', seq: 5 }, ['a', 'b'])).toEqual({ owner: 'a', seq: 5 })
  })

  test('three clients each see the same owner after the same three claims', () => {
    /**
     * The end-to-end shape of it: a possession changing hands twice, replayed
     * from three points of view with the packets in three different orders.
     */
    const claims: Claim[] = [
      { who: 'b', seq: 1 },
      { who: 'c', seq: 2 },
      { who: 'a', seq: 3 },
    ]
    const orders = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
    ]
    const answers = orders.map((order) =>
      order.reduce<Held>((held, i) => resolve(held, claims[i]!, ROOM), heldBy(ROOM)),
    )
    expect(answers.map((one) => one.owner)).toEqual(['a', 'a', 'a'])
  })

  test('a claim off the wire is checked like every other packet', () => {
    expect(readClaim({ who: 'a', seq: 2 })).toEqual({ who: 'a', seq: 2 })
    expect(readClaim({ who: '', seq: 2 })).toBeNull()
    expect(readClaim({ who: 'a', seq: 'soon' })).toBeNull()
    expect(readClaim({ who: 'a' })).toBeNull()
    expect(readClaim(null)).toBeNull()
  })
})

describe('taking the bodies over', () => {
  test('a new owner carries on from the last thing the old one said', () => {
    /**
     * The handover bug this closes, and it only became a *visible* one when
     * ownership started following the ball: a follower's own rows hold an
     * interpolated position and **no velocity**, because `place` deletes it. So a
     * client that stopped following and started integrating dropped the ball
     * where it was drawn and rolled it from a standstill - the ball stopping dead
     * the instant somebody touched it, on every touch.
     */
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 })
    const balls = new Balls()
    balls.remember({ b: [{ i: id, x: 9, y: 1, z: 3, dx: 12, dy: 0, dz: -4 }] }, 1000)

    // A follower's world, as `place` leaves it: drawn somewhere, at rest.
    balls.place(world, 1000)
    expect(velocityOf(world, id)).toEqual({ x: 0, y: 0, z: 0 })

    balls.remember({ b: [{ i: id, x: 10, y: 1, z: 2.6, dx: 11.5, dy: 0, dz: -3.8 }] }, 1125)
    expect(balls.adopt(world)).toBe(1)

    // The newest sample, not the interpolated one: integrating wants the
    // freshest state there is, which is the opposite of what drawing wants.
    expect(world.position.get(id)).toEqual({ x: 10, y: 1, z: 2.6 })
    expect(velocityOf(world, id)).toEqual({ x: 11.5, y: 0, z: -3.8 })
    // And nothing is left to be drawn from - this client integrates now.
    expect(balls.knows(id)).toBe(false)
  })

  test('taking over having heard nothing keeps what the document said', () => {
    const { world, id } = oneBody({ x: 4, y: 1, z: 4 })
    const balls = new Balls()
    expect(balls.adopt(world)).toBe(0)
    expect(world.position.get(id)).toEqual({ x: 4, y: 1, z: 4 })
  })

  test('a settled body is adopted as settled, not as a row of zeros', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 })
    const balls = new Balls()
    balls.remember({ b: [{ i: id, x: 6, y: 1, z: 6, dx: 0, dy: 0, dz: 0 }] }, 1000)
    balls.adopt(world)
    // Absent is what at rest means everywhere else in the engine; a zero row
    // would make `bodiesOf` send a resting ball eight times a second forever.
    expect(world.velocity.has(id)).toBe(false)
    expect(bodiesOf(world, blueprints).b).toHaveLength(0)
  })

  test('a follower believes one owner at a time', () => {
    /**
     * The half round trip after a claim, where the **old owner is still
     * sending** because it has not heard yet. A buffer that took both would
     * interpolate between two machines' idea of one ball.
     */
    const { world, id } = oneBody({ x: 0.5, y: 1, z: 0.5 })
    const balls = new Balls()
    balls.remember({ b: [{ i: id, x: 2, y: 1, z: 0, dx: 0, dy: 0, dz: 0 }] }, 1000, 'c', 'c')
    balls.remember({ b: [{ i: id, x: 30, y: 1, z: 0, dx: 0, dy: 0, dz: 0 }] }, 1010, 'a', 'c')
    expect(balls.held(id)).toBe(1)
    expect(balls.at(id, 1000 + 250)!.x).toBe(2)
    void world
  })
})

describe('what the owner sends', () => {
  test('only what is moving, and nothing at all once it settles', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 4, z: 0.5 })
    expect(bodiesOf(world, blueprints).b).toHaveLength(0)

    push(world, blueprints, id, 6, 0, 0)
    expect(bodiesOf(world, blueprints).b).toHaveLength(1)

    for (let i = 0; i < 400; i += 1) {
      stepBodies({ world, blueprints, delta: FRAME, isSolid: (_x, y) => y === 0 })
    }
    // At rest is absent, and the receiver reaches the same conclusion by
    // simulating the same rules - so a settled level sends nothing forever.
    expect(bodiesOf(world, blueprints).b).toHaveLength(0)
  })

  test('a settled body is left out of the tick, and put in the greeting', () => {
    /**
     * The newcomer hole, and the reason the two calls differ.
     *
     * Leaving the settled ones out is what makes this affordable - a level of
     * stopped toys sends nothing forever. But somebody who has just arrived has
     * an empty buffer, so the only thing they can draw is wherever their own
     * copy of the document put the ball; if nothing moves again, they draw that
     * forever. Reported as the ball still being "on the start" for a new
     * player.
     */
    const { world, blueprints, id } = oneBody({ x: 4, y: 1, z: 2 })
    expect(bodiesOf(world, blueprints).b).toHaveLength(0)

    const greeting = bodiesOf(world, blueprints, true).b
    expect(greeting).toHaveLength(1)
    expect(greeting[0]!.x).toBeCloseTo(4, 5)
    expect(greeting[0]!.z).toBeCloseTo(2, 5)
    // At rest, and said so - the receiver stops it rather than carrying it on.
    expect(greeting[0]!.dx).toBe(0)
  })

  test('a greeting puts a newcomer’s ball where the owner has it', () => {
    // End to end: the owner's ball has been moved and has stopped; a client
    // that has heard nothing is holding the document's spawn position.
    const owner = oneBody({ x: 9, y: 1, z: 0 })
    const newcomer = oneBody({ x: 0, y: 1, z: 0 })
    const balls = new Balls(250)
    balls.remember(readBodies(JSON.parse(JSON.stringify(bodiesOf(owner.world, owner.blueprints, true))))!, 1000)
    balls.place(newcomer.world, 1500)
    expect(newcomer.world.position.get(newcomer.id)!.x).toBeCloseTo(9, 1)
  })

  test('scenery is never in the packet', () => {
    const world = emptyWorld()
    const id = 1 as EntityId
    world.alive.add(id)
    world.blueprint.set(id, 'wall')
    world.position.set(id, { x: 0, y: 0, z: 0 })
    world.velocity.set(id, { x: 5, y: 0, z: 0 })
    expect(bodiesOf(world, { wall: blueprint() }).b).toHaveLength(0)
  })

  test('the velocity travels with the position', () => {
    // The field that makes eight packets a second enough: without it a receiver
    // can do nothing between two of them but wait.
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 4, z: 0.5 })
    push(world, blueprints, id, 6, 0, -3)
    const [sample] = bodiesOf(world, blueprints).b
    expect(sample!.dx).toBeCloseTo(6, 1)
    expect(sample!.dz).toBeCloseTo(-3, 1)
  })

  test('two packets describing the same world are the same packet', () => {
    // Sorted, so a Map rehashing does not put a message on the wire.
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 4, z: 0.5 })
    const other = 7 as EntityId
    world.alive.add(other)
    world.blueprint.set(other, 'thing')
    world.position.set(other, { x: 3, y: 4, z: 0 })

    push(world, blueprints, other, 1, 0, 0)
    push(world, blueprints, id, 1, 0, 0)
    expect(bodiesOf(world, blueprints).b.map((one) => one.i)).toEqual([1, 7])
  })
})

describe('drawing between the owner’s samples', () => {
  const sample = (i: number, x: number) => ({ i, x, y: 1, z: 0, dx: 0, dy: 0, dz: 0 })

  test('a body is drawn between the two samples that straddle the delay', () => {
    const balls = new Balls(250)
    balls.remember({ b: [sample(1, 0)] }, 1000)
    balls.remember({ b: [sample(1, 10)] }, 1125)
    // A quarter of a second behind, which puts the target halfway between them.
    const at = balls.at(1, 1312.5)
    expect(at!.x).toBeCloseTo(5, 5)
  })

  test('past the end it holds the last thing the owner said', () => {
    // Rather than extrapolating: a guess that runs a ball on through a wall the
    // owner already bounced it off is worse than one that pauses for a frame.
    const balls = new Balls(250)
    balls.remember({ b: [sample(1, 0)] }, 1000)
    balls.remember({ b: [sample(1, 10)] }, 1125)
    expect(balls.at(1, 9999)!.x).toBe(10)
  })

  test('before the first one it is where it was, not sliding in from nowhere', () => {
    const balls = new Balls(250)
    balls.remember({ b: [sample(1, 7)] }, 1000)
    expect(balls.at(1, 1000)!.x).toBe(7)
  })

  test('a sample from before the one it holds is dropped, not sorted in', () => {
    // A buffer that took it would interpolate *backwards* - the ball visibly
    // walks back on itself for as long as the network is unhappy.
    const balls = new Balls(250)
    balls.remember({ b: [sample(1, 0)] }, 1000)
    balls.remember({ b: [sample(1, 10)] }, 1125)
    balls.remember({ b: [sample(1, 99)] }, 1050)
    expect(balls.at(1, 1375)!.x).toBe(10)
  })

  /**
   * The bug that shipped, and the reason it is worth a test of its own.
   *
   * `INTERPOLATION_DELAY` is **250 milliseconds**, and the runtime has two
   * clocks: `performance.now()` in milliseconds, which is what every buffer is
   * stamped with, and `clockNow()` - simulated *seconds* - which is what the
   * rules and the scripts run on. Both are numbers, so handing over the wrong
   * one type-checks perfectly.
   *
   * Stamped in seconds, `now - delay` is about 250 seconds in the past, which
   * is before anything the buffer holds - so it answers with the oldest sample
   * it has ever seen and goes on answering that forever. On screen the ball is
   * pinned to wherever it was when you arrived and slammed back there every
   * frame after the local step moved it, which is exactly what "it teleports
   * over the network" looked like.
   *
   * There is no type that catches this, so there is a test.
   */
  test('a buffer fed seconds instead of milliseconds is caught here', () => {
    const balls = new Balls(250)
    // Three packets a tick apart, as the wire would send them.
    balls.remember({ b: [sample(1, 0)] }, 1000)
    balls.remember({ b: [sample(1, 10)] }, 1125)
    balls.remember({ b: [sample(1, 20)] }, 1250)

    // Read with the same clock: somewhere between the samples, as intended.
    const right = balls.at(1, 1375)!.x
    expect(right).toBeGreaterThan(0)
    expect(right).toBeLessThanOrEqual(20)

    // Read with a *seconds* clock, which is what shipped: stuck on the oldest.
    expect(balls.at(1, 1.375)!.x).toBe(0)
    expect(balls.at(1, 99)!.x).toBe(0)
  })

  test('the buffer is pruned, so a long match does not grow one forever', () => {
    // The same units bug stopped this too: the cutoff is `now - delay * 2`, so
    // in seconds nothing was ever old enough to drop and the buffer grew for as
    // long as the match lasted.
    const balls = new Balls(250)
    for (let i = 0; i < 500; i += 1) balls.remember({ b: [sample(1, i)] }, 1000 + i * 125)
    expect(balls.held(1)).toBeLessThan(10)
  })

  test('nothing heard about is nothing drawn', () => {
    const balls = new Balls(250)
    expect(balls.at(404, 1000)).toBeNull()
    expect(balls.knows(404)).toBe(false)
  })

  test('placing it overwrites rather than nudges, and stops it locally', () => {
    // There is nothing to reconcile: a follower does not simulate these, and a
    // velocity left behind would carry the ball on between packets on top of
    // the interpolation - which is two motions for one ball.
    const { world, id } = oneBody({ x: 0, y: 1, z: 0 })
    world.velocity.set(id, { x: 40, y: 0, z: 0 })
    const balls = new Balls(250)
    balls.remember({ b: [sample(id, 6)] }, 1000)
    balls.place(world, 1500)
    expect(world.position.get(id)!.x).toBe(6)
    expect(world.velocity.has(id)).toBe(false)
  })

  test('it forgets everything when this client takes over the integrating', () => {
    const balls = new Balls(250)
    balls.remember({ b: [sample(1, 6)] }, 1000)
    balls.clear()
    expect(balls.knows(1)).toBe(false)
  })

  test('old samples are dropped, so a long match does not grow a buffer', () => {
    const balls = new Balls(250)
    for (let i = 0; i < 400; i += 1) balls.remember({ b: [sample(1, i)] }, 1000 + i * 125)
    // Still answers, and has not kept four hundred of them.
    expect(balls.at(1, 1000 + 399 * 125)).not.toBeNull()
  })
})

describe('a push from somebody who is not the owner', () => {
  test('it is recorded so the host can send it', () => {
    const { world, blueprints, id } = oneBody({ x: 0, y: 1, z: 0 })
    push(world, blueprints, id, 6, 0, 0)
    expect(world.shoves).toEqual([{ id, dx: 6, dy: 0, dz: 0 }])
  })

  test('what is recorded is what was asked for, before mass', () => {
    // The receiver divides by the mass it reads off its own blueprint, so a
    // client on a stale document pushes at the wrong strength rather than not
    // at all.
    const { world, blueprints, id } = oneBody({ x: 0, y: 1, z: 0 }, { mass: 4 })
    push(world, blueprints, id, 8, 0, 0)
    expect(world.shoves[0]!.dx).toBe(8)
    expect(velocityOf(world, id).x).toBe(2)
  })

  test('the owner applies it through the same physics everybody else gets', () => {
    const { world, blueprints, id } = oneBody({ x: 0, y: 1, z: 0 }, { mass: 4 })
    expect(applyShove(world, blueprints, { i: id, dx: 8, dy: 0, dz: 0 })).toBe(true)
    // Divided by the *receiver's* mass. A client that could bypass this could
    // put the ball in the net from the halfway line.
    expect(velocityOf(world, id).x).toBe(2)
  })

  test('a shove at something this document does not have is refused', () => {
    const { world, blueprints } = oneBody({ x: 0, y: 1, z: 0 })
    expect(applyShove(world, blueprints, { i: 404, dx: 8, dy: 0, dz: 0 })).toBe(false)
  })

  test('pushing scenery records nothing', () => {
    const world = emptyWorld()
    const id = 1 as EntityId
    world.alive.add(id)
    world.blueprint.set(id, 'wall')
    world.position.set(id, { x: 0, y: 0, z: 0 })
    push(world, { wall: blueprint() }, id, 5, 0, 0)
    expect(world.shoves).toHaveLength(0)
  })
})

describe('reading a packet off the wire', () => {
  test('a well-formed one comes through', () => {
    const share = readBodies({ b: [{ i: 3, x: 1, y: 2, z: 3, dx: 4, dy: 5, dz: 6 }] })
    expect(share?.b).toHaveLength(1)
    expect(share?.b[0]!.i).toBe(3)
  })

  test('rubbish is refused rather than reaching the world', () => {
    expect(readBodies(null)).toBeNull()
    expect(readBodies({})).toBeNull()
    expect(readBodies({ b: 'no' })).toBeNull()
    expect(readShove({ i: 1, dx: 'fast' })).toBeNull()
  })

  test('one bad entry drops that entry, not the packet', () => {
    // The alternative is one corrupt body freezing every other body in a level.
    const share = readBodies({
      b: [
        { i: 1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 },
        { i: 2, x: Number.NaN, y: 0, z: 0, dx: 0, dy: 0, dz: 0 },
        { i: 3, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 },
      ],
    })
    expect(share?.b.map((one) => one.i)).toEqual([1, 3])
  })

  test('a NaN can never reach a position', () => {
    // It would propagate through every subsequent frame and could not be traced
    // back to the packet that caused it.
    const { world, id } = oneBody({ x: 0, y: 1, z: 0 })
    const share = readBodies({ b: [{ i: id, x: Number.NaN, y: 1, z: 0, dx: 0, dy: 0, dz: 0 }] })
    const balls = new Balls(250)
    balls.remember(share!, 1000)
    balls.place(world, 1500)
    expect(Number.isFinite(world.position.get(id)!.x)).toBe(true)
  })
})

describe('two clients, one ball', () => {
  const floor = (_x: number, y: number) => y === 0

  /**
   * The follower does not simulate, so there is nothing to diverge.
   *
   * This is the whole change from the first version of this file, which had
   * every client integrating and the owner's packet correcting them. That was
   * reported from a match as the ball jumping cells, and the arithmetic says
   * why: two clients only agree until one of them resolves a bounce a frame
   * before the other, and at twenty cells a second one tick of disagreement is
   * two and a half cells - past any snap threshold, so the correction stopped
   * easing and teleported.
   */
  test('the follower ends up exactly where the owner put it, a delay behind', () => {
    const owner = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0.4 })
    const follower = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0.4 })
    const balls = new Balls(250)

    push(owner.world, owner.blueprints, owner.id, 18, 0, 0)

    let clock = 0
    const seen: number[] = []
    for (let frame = 0; frame < 600; frame += 1) {
      clock += (FRAME * 1000)
      stepBodies({ world: owner.world, blueprints: owner.blueprints, delta: FRAME, isSolid: floor })
      if (frame % 8 === 0) {
        // Through JSON, because that is what the wire is.
        const packet = readBodies(JSON.parse(JSON.stringify(bodiesOf(owner.world, owner.blueprints))))
        balls.remember(packet!, clock)
        seen.push(clock)
      }
      balls.place(follower.world, clock)
    }

    expect(seen.length).toBeGreaterThan(50)
    // The owner has stopped, and the follower has been handed that same
    // resting position rather than a nearby one it worked out itself. Within a
    // centimetre rather than exactly: the wire rounds to two decimal places,
    // which is the whole of the difference and is deliberate - a millimetre is
    // not worth a byte eight times a second.
    expect(follower.world.position.get(follower.id)!.x).toBeCloseTo(
      owner.world.position.get(owner.id)!.x,
      1,
    )
    // And nothing of its own is carrying it anywhere.
    expect(follower.world.velocity.has(follower.id)).toBe(false)
  })

  test('the ball changes hands mid-roll without stopping or jumping', () => {
    /**
     * The end of the whole change, asked as one question: **a** kicks the ball,
     * **b** runs onto it and claims it, and the ball has to carry on.
     *
     * Every piece is separately tested above; what this asks is that they compose,
     * because the two ways this fails in play are both invisible in the pieces. A
     * new owner that dropped the buffer without adopting would roll the ball from
     * a standstill - the ball stopping dead the instant anybody touches it. One
     * that adopted the *interpolated* position would put it back where it was
     * drawn, a quarter of a second behind, which is a jump backwards.
     */
    const a = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0.4 })
    const b = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0.4 })
    const bBuffer = new Balls(250)

    let held: Held = heldBy(['a', 'b'])
    expect(held.owner).toBe('a')

    push(a.world, a.blueprints, a.id, 18, 0, 0)

    let clock = 0
    const wire = () => readBodies(JSON.parse(JSON.stringify(bodiesOf(a.world, a.blueprints))))!

    // a owns it for half a second, and b watches.
    for (let frame = 0; frame < 30; frame += 1) {
      clock += FRAME * 1000
      stepBodies({ world: a.world, blueprints: a.blueprints, delta: FRAME, isSolid: floor })
      if (frame % 8 === 0) bBuffer.remember(wire(), clock, 'a', held.owner)
      bBuffer.place(b.world, clock)
    }

    const rolling = velocityOf(a.world, a.id).x
    expect(rolling).toBeGreaterThan(8)
    // Drawn a delay behind, which is what following costs and is the point.
    expect(b.world.position.get(b.id)!.x).toBeLessThan(a.world.position.get(a.id)!.x)
    expect(b.world.velocity.has(b.id)).toBe(false)

    // b gets a foot on it.
    const claim = claiming(held, 'b')!
    held = resolve(held, claim, ['a', 'b'])
    expect(held.owner).toBe('b')
    const seeded = bBuffer.adopt(b.world)
    expect(seeded).toBe(1)

    /**
     * Carried on from what a last *said*, not from where b was drawing it and
     * emphatically not from rest.
     *
     * A tick's worth fast rather than exact, and that is the honest answer: the
     * newest sample is up to one send interval old, so it describes a ball the
     * grass has not slowed yet. Bounded on both sides because both directions are
     * bugs - below `rolling` means it adopted something older than the newest
     * sample, and far above it means it adopted from a stale buffer.
     */
    const carried = velocityOf(b.world, b.id).x
    expect(carried).toBeGreaterThanOrEqual(rolling)
    expect(carried).toBeLessThan(rolling * 1.1)
    const took = b.world.position.get(b.id)!.x

    // And b's own integration continues it in the same direction, at speed.
    for (let frame = 0; frame < 30; frame += 1) {
      stepBodies({ world: b.world, blueprints: b.blueprints, delta: FRAME, isSolid: floor })
    }
    const went = b.world.position.get(b.id)!.x - took
    expect(went).toBeGreaterThan(3)
  })

  test('a shove sent on rather than applied twice gets there once', () => {
    // The follower's own script recorded an intent; the owner is handed it and
    // applies it through its own mass. Neither ends up moving twice as fast.
    const owner = oneBody({ x: 0.5, y: 1, z: 0.5 })
    const follower = oneBody({ x: 0.5, y: 1, z: 0.5 })
    push(follower.world, follower.blueprints, follower.id, 12, 0, 0)
    const [intent] = follower.world.shoves
    applyShove(owner.world, owner.blueprints, {
      i: owner.id,
      dx: intent!.dx,
      dy: intent!.dy,
      dz: intent!.dz,
    })
    expect(velocityOf(owner.world, owner.id).x).toBeCloseTo(12, 5)
  })
})

describe('the room when somebody arrives', () => {
  test('two clients that each started alone land on one owner', () => {
    /**
     * The bug this is about, and it made multiplayer unplayable rather than
     * merely wrong: every client starts alone and a room of one elects itself,
     * so both people arrive already believing they integrate. `heldAfter` only
     * re-elected when the owner had *left*, found its own owner present, and
     * kept it - on both machines. Each then played with its own copy of the
     * ball and neither ever saw the other's.
     */
    const a = heldBy(['a'])
    const b = heldBy(['b'])
    expect(a.owner).toBe('a')
    expect(b.owner).toBe('b')

    // They meet. Both ask the same question of the same roster and have to come
    // back with the same answer, without a message passing between them.
    const room = ['a', 'b']
    expect(heldAfter(a, room).owner).toBe('a')
    expect(heldAfter(b, room).owner).toBe('a')
  })

  /**
   * The repair for the room that never agreed, rather than for a lost packet.
   *
   * `heldAfter` above settles it *if both clients see the roster change*. What
   * it cannot cover is the pair who each elected themselves and whose rosters
   * arrive a moment apart, or a claim that went missing: nothing else is ever
   * sent about ownership, because a claim only happens when somebody stands on
   * the ball. So the owner repeats itself, and this is what a repeat has to do.
   */
  test('an owner saying so again is a no-op in a room that agrees', () => {
    const room = ['a', 'b']
    const held = { owner: 'b', seq: 4 }
    // The *current* seq, not the next: an assertion rather than a claim.
    expect(resolve(held, { who: 'b', seq: 4 }, room)).toEqual(held)
  })

  test('and it settles two clients who each think they own it', () => {
    const room = ['a', 'b']
    // Both elected themselves on the floor, so both are at seq 0 and neither
    // has any reason to send a claim.
    const onA = { owner: 'a', seq: 0 }
    const onB = { owner: 'b', seq: 0 }

    // Each hears the other assert, and both have to reach the same answer.
    expect(resolve(onA, { who: 'b', seq: 0 }, room).owner).toBe('a')
    expect(resolve(onB, { who: 'a', seq: 0 }, room).owner).toBe('a')
  })

  test('but an assertion never takes the ball off somebody who touched it', () => {
    // The stale owner insisting at its own seq, after a real handover. Whoever
    // is on the ball has the higher number and keeps it.
    const held = { owner: 'b', seq: 5 }
    expect(resolve(held, { who: 'a', seq: 0 }, ['a', 'b'])).toEqual(held)
  })

  test('but a joiner does not take a ball off whoever is standing on it', () => {
    // Past the floor, ownership followed the ball to somebody who touched it.
    // A low id walking in afterwards must not take it back by arriving.
    const held = { owner: 'z', seq: 3 }
    expect(heldAfter(held, ['a', 'z'])).toEqual(held)
  })

  test('and the floor still hands over when its owner leaves', () => {
    const gone = heldAfter({ owner: 'a', seq: 0 }, ['b', 'c'])
    expect(gone.owner).toBe('b')
    // The seq moves, so a claim the departing owner had in flight cannot win.
    expect(gone.seq).toBe(1)
  })
})
