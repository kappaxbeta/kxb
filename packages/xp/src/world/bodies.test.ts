/**
 * What a body does, asked without a browser.
 *
 * The whole reason `stepBodies` is a pure function: the Browser pane never
 * fires a frame, so "does a dropped ball come to rest on the floor" cannot be
 * watched and can be simulated. Nearly every case here runs a few hundred
 * frames and asks where the thing ended up, which is the question a player
 * would ask by looking.
 */
import { describe, expect, test } from 'bun:test'
import {
  BOUNCE_FLOOR,
  bodyOf,
  MAX_BODY_SPEED,
  MIN_APPROACH,
  MIN_DRIBBLE_SPEED,
  push,
  PUSH_CARRY,
  REST_SPEED,
  shoverBox,
  stepBodies,
  velocityOf,
  type BodyInput,
} from './bodies'
import { emptyWorld, PLAYER_ID, type EntityId, type EntityWorld } from './entities'
import type { Blueprint, BodySpec } from '../document/blueprints'
import { EYE_HEIGHT, GRAVITY, SPRINT_PACE, WALK_PACE } from './physics'

/** A frame at 60fps, the same one `physics.test.ts` runs at. */
const FRAME = 1 / 60

/** One solid layer filling cell y=0, so the standable surface is y=1. */
const FLOOR: BodyInput['isSolid'] = (_x, y) => y === 0

const EMPTY: BodyInput['isSolid'] = () => false

/** The floor, plus a wall of blocks at x=3 reaching up four cells. */
const FLOOR_AND_WALL: BodyInput['isSolid'] = (x, y) =>
  y === 0 || (x === 3 && y >= 1 && y <= 4)

/**
 * A crate, with its box written down rather than measured.
 *
 * `collider: 'auto'` opens the catalogue and would make every case here depend
 * on the exact glTF of a model we ship - and worse, `entityBox` answers null
 * for a model it cannot find, which silently swaps the whole fixture for the
 * half-metre fallback. One cell each way, stated, so what is being tested is
 * the integration and the resolution.
 */
function blueprint(body?: BodySpec, collider: Blueprint['collider'] = { w: 1, h: 1, d: 1 }): Blueprint {
  return {
    model: 'proto/crate',
    collider,
    tags: [],
    props: {},
    sockets: {},
    triggers: [],
    ...(body ? { body } : {}),
  }
}

/**
 * A world with one thing in it, at a position, sized half a cell each way.
 *
 * The box is written by hand rather than measured off a model, because
 * `entityBox` opens the catalogue and what is being tested here is the
 * integration and the resolution, not the geometry of a crate we ship.
 */
function oneBody(
  at: { x: number; y: number; z: number },
  body?: BodySpec,
  half = 0.5,
): { world: EntityWorld; blueprints: Record<string, Blueprint>; id: EntityId } {
  const world = emptyWorld()
  const id = 1 as EntityId
  world.alive.add(id)
  world.blueprint.set(id, 'thing')
  world.position.set(id, { ...at })
  world.box.set(id, {
    minX: at.x - half,
    maxX: at.x + half,
    minY: at.y,
    maxY: at.y + half * 2,
    minZ: at.z - half,
    maxZ: at.z + half,
  })
  return { world, blueprints: { thing: blueprint(body) }, id }
}

function run(
  world: EntityWorld,
  blueprints: Record<string, Blueprint>,
  frames: number,
  overrides: Partial<BodyInput> = {},
) {
  let contacts: ReturnType<typeof stepBodies> = []
  for (let i = 0; i < frames; i += 1) {
    contacts = stepBodies({
      world,
      blueprints,
      delta: FRAME,
      isSolid: FLOOR,
      ...overrides,
    })
  }
  return contacts
}

describe('bodyOf', () => {
  test('scenery is not a body', () => {
    expect(bodyOf(blueprint())).toBeNull()
    expect(bodyOf(undefined)).toBeNull()
  })

  test('an empty block means "this falls", with every default', () => {
    const spec = bodyOf(blueprint({}))
    expect(spec).not.toBeNull()
    expect(spec?.gravity).toBe(1)
    expect(spec?.bounce).toBe(0)
    expect(spec?.mass).toBe(1)
  })

  test('a mass of zero is refused rather than dividing by it', () => {
    // The parser catches this; a document built in memory does not go through
    // the parser, and a crate sent to infinity is worse than one that ignores
    // an impossible number.
    expect(bodyOf(blueprint({ mass: 0 }))?.mass).toBe(1)
  })
})

describe('falling', () => {
  test('a body dropped above the floor lands on it and stays', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 }, {})
    run(world, blueprints, 240)
    const at = world.position.get(id)
    expect(at?.y).toBeCloseTo(1, 2)
    // And it has stopped: the row is deleted rather than left holding zeros.
    expect(world.velocity.has(id)).toBe(false)
  })

  test('scenery does not fall', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 })
    run(world, blueprints, 120)
    expect(world.position.get(id)?.y).toBe(6)
  })

  test('gravity 0 floats and a negative one rises', () => {
    const floats = oneBody({ x: 0.5, y: 6, z: 0.5 }, { gravity: 0 })
    run(floats.world, floats.blueprints, 120)
    expect(floats.world.position.get(floats.id)?.y).toBeCloseTo(6, 5)

    const balloon = oneBody({ x: 0.5, y: 6, z: 0.5 }, { gravity: -0.5 })
    run(balloon.world, balloon.blueprints, 60)
    expect(balloon.world.position.get(balloon.id)!.y).toBeGreaterThan(6)
  })

  test('a fall accelerates at the world gravity it is handed', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 100, z: 0.5 }, {})
    run(world, blueprints, 30, { isSolid: EMPTY })
    // Half a second of it, near enough - the integration is a frame behind a
    // closed form and this is checking the constant, not the integrator.
    expect(velocityOf(world, id).y).toBeCloseTo(-GRAVITY * 0.5, 1)
  })

  test('a landing is a contact with the level, not with an entity', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 2, z: 0.5 }, {})
    let landed: ReturnType<typeof stepBodies> = []
    for (let i = 0; i < 120; i += 1) {
      const contacts = stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
      if (contacts.length > 0 && landed.length === 0) landed = contacts
    }
    expect(landed).toHaveLength(1)
    expect(landed[0]!.id).toBe(id)
    expect(landed[0]!.other).toBeNull()
    expect(landed[0]!.speed).toBeGreaterThan(0)
  })

  test('a thing at rest reports no contact at all', () => {
    // The drone this guards against: a body lying on the floor re-reporting a
    // landing sixty times a second would fire a `hit` rule sixty times a second.
    const { world, blueprints } = oneBody({ x: 0.5, y: 1, z: 0.5 }, {})
    run(world, blueprints, 60)
    const contacts = stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
    expect(contacts).toHaveLength(0)
  })

  test('it lands on the surface a half-height tile actually reaches', () => {
    // The half-cell `Solids.topOf` exists for: a platformer floor 0.5 tall
    // fills its whole cell, and a ball resting on the cell hangs over the tile.
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 5, z: 0.5 }, {})
    run(world, blueprints, 200, { topOf: (_x, y) => y + 0.5 })
    expect(world.position.get(id)?.y).toBeCloseTo(0.5, 2)
  })

  test('floorY catches a body in a level with no geometry laid yet', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 }, {})
    run(world, blueprints, 240, { isSolid: EMPTY, floorY: 2 })
    expect(world.position.get(id)?.y).toBeCloseTo(2, 2)
  })
})

describe('bouncing', () => {
  test('a bouncy body comes back up, and lower each time', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 9, z: 0.5 }, { bounce: 0.7 })
    const peaks: number[] = []
    let rising = false
    for (let i = 0; i < 600; i += 1) {
      stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
      const v = velocityOf(world, id).y
      if (v > 0) rising = true
      else if (rising) {
        rising = false
        peaks.push(world.position.get(id)!.y)
      }
    }
    expect(peaks.length).toBeGreaterThan(2)
    expect(peaks[0]!).toBeGreaterThan(1.5)
    expect(peaks[1]!).toBeLessThan(peaks[0]!)
  })

  test('bouncing settles rather than jittering forever', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 9, z: 0.5 }, { bounce: 0.7 })
    run(world, blueprints, 1200)
    expect(Math.abs(velocityOf(world, id).y)).toBeLessThan(BOUNCE_FLOOR)
    expect(world.position.get(id)?.y).toBeCloseTo(1, 1)
  })

  test('bounce 0 stops dead', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 9, z: 0.5 }, { bounce: 0 })
    run(world, blueprints, 300)
    expect(velocityOf(world, id).y).toBe(0)
  })
})

describe('rolling into things', () => {
  test('a rolled body stops at a wall rather than going through it', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0 })
    push(world, blueprints, id, 20, 0, 0)
    run(world, blueprints, 120, { isSolid: FLOOR_AND_WALL })
    // The wall fills cell x=3, so its face is at x=3 and a half-wide body's
    // centre stops just short of 2.5.
    expect(world.position.get(id)!.x).toBeLessThanOrEqual(2.5)
    expect(world.position.get(id)!.x).toBeGreaterThan(2.3)
  })

  test('friction stops a roll and drag does not', () => {
    const rolling = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 3 })
    push(rolling.world, rolling.blueprints, rolling.id, 10, 0, 0)
    run(rolling.world, rolling.blueprints, 300)
    expect(velocityOf(rolling.world, rolling.id).x).toBe(0)

    const sliding = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0, drag: 0 })
    push(sliding.world, sliding.blueprints, sliding.id, 10, 0, 0)
    run(sliding.world, sliding.blueprints, 300)
    expect(velocityOf(sliding.world, sliding.id).x).toBeCloseTo(10, 5)
  })

  test('a harder push goes further than a softer one, and more than twice as far', () => {
    const distance = (speed: number) => {
      const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 1.4 })
      push(world, blueprints, id, speed, 0, 0)
      run(world, blueprints, 600)
      return world.position.get(id)!.x - 0.5
    }
    const soft = distance(4)
    const hard = distance(8)
    // Fractional decay rather than a subtraction, which is what makes a kick
    // feel like a kick. A linear model would give exactly twice.
    expect(hard).toBeGreaterThan(soft * 2)
  })

  test('a rolling body is not turned by the simulation, because rolling is drawn', () => {
    // `roll` used to spin `world.rotation` here, which is a yaw - a ball
    // twirling on the spot - and which crossed no wire, so only whoever was
    // integrating ever saw it. `Rolling` in `@kxb/xp/drawing` turns the mesh
    // about the axis perpendicular to travel instead, and this asserts the
    // simulation has stopped having an opinion about it.
    const ball = oneBody({ x: 0.5, y: 1, z: 0.5 }, { roll: 90, friction: 1 })
    push(ball.world, ball.blueprints, ball.id, 8, 0, 0)
    run(ball.world, ball.blueprints, 60)
    expect(ball.world.position.get(ball.id)!.x).toBeGreaterThan(0.5)
    expect(ball.world.rotation.get(ball.id) ?? 0).toBe(0)
  })

  test('the box follows the body, so it is bumped into where it is', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0 })
    push(world, blueprints, id, 6, 0, 0)
    run(world, blueprints, 60)
    const at = world.position.get(id)!
    const box = world.box.get(id)!
    // Measured off the model rather than the hand-written box in `oneBody`,
    // which `refresh` has replaced by now - what matters is that it moved with
    // it. A stale box is a crate you bump into where it used to be.
    expect((box.minX + box.maxX) / 2).toBeCloseTo(at.x, 1)
  })
})

describe('pushing', () => {
  test('push adds rather than replaces, so a second kick goes faster', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0, drag: 0 })
    push(world, blueprints, id, 5, 0, 0)
    push(world, blueprints, id, 5, 0, 0)
    expect(velocityOf(world, id).x).toBe(10)
  })

  test('mass divides a push', () => {
    const heavy = oneBody({ x: 0.5, y: 1, z: 0.5 }, { mass: 4, friction: 0, drag: 0 })
    push(heavy.world, heavy.blueprints, heavy.id, 8, 0, 0)
    expect(velocityOf(heavy.world, heavy.id).x).toBe(2)
  })

  test('pushing scenery does nothing and says so', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 })
    expect(push(world, blueprints, id, 10, 0, 0)).toBe(false)
    expect(world.velocity.has(id)).toBe(false)
  })

  test('nothing leaves faster than the cap, however hard it is hit', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0, drag: 0 })
    push(world, blueprints, id, 5000, 0, 0)
    expect(velocityOf(world, id).x).toBeCloseTo(MAX_BODY_SPEED, 5)
  })
})

describe('the player pushes things', () => {
  /**
   * The model this whole block was rewritten for, in the words it was
   * specified in: *"normal it should just be pushed with the box, with kick he
   * flys roll forward, and with dash also"*.
   *
   * So there are two separate things to check and they must not be confused.
   * **Pushing** moves a body while the pushing lasts and leaves it nothing, so
   * it is measured in cells travelled. **Impact** leaves the body with speed of
   * its own, so it is measured in what is still happening after contact stops.
   *
   * Before this, contact wrote straight into the velocity, and every touch was
   * an impact: walking past the ball sent it twenty cells - most of the way to
   * the goal, where the level's own rule put it back on the centre spot. Which
   * is what was reported, twice: the ball goes away and jumps back.
   */
  const walkInto = (body: BodySpec, pace: number, frames: number) => {
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, body)
    const from = world.position.get(id)!.x
    let px = 2 - 1.0
    for (let i = 0; i < frames; i += 1) {
      px += pace * FRAME
      stepBodies({
        world,
        blueprints,
        delta: FRAME,
        isSolid: FLOOR,
        shovers: [{ box: shoverBox({ x: px, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: pace * FRAME, dy: 0, dz: 0 }],
      })
    }
    const pushed = world.position.get(id)!.x - from
    // Contact over. Whatever happens now is the body's own.
    for (let i = 0; i < 600; i += 1) {
      stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
    }
    return { pushed, rolled: world.position.get(id)!.x - from - pushed }
  }

  test('walking into something moves it along in front of you', () => {
    const { pushed } = walkInto({ friction: 3 }, WALK_PACE, 60)
    // A second of walking moves it a second of walking, because that is what
    // being pushed by somebody means.
    expect(pushed).toBeCloseTo(WALK_PACE, 0)
  })

  test('and it carries on afterwards, because a touch is a touch', () => {
    /**
     * The model changed here, on the strength of the lounge's own football sim.
     *
     * Contact used to be a push that was *not stored*: the body moved while you
     * leaned on it and stopped dead when you stopped. That is defensible, and
     * it is not football - the ball never ran ahead of you, so a kick had to do
     * all the work, which is what "it should be visible for the eyes, maybe
     * less force, but bit more then pushing it" was describing.
     *
     * The outgoing speed is proportional to your closing speed now, and the
     * body keeps it. See `PUSH_TRANSFER`.
     */
    const { rolled } = walkInto({ friction: 1.2 }, WALK_PACE, 60)
    expect(rolled).toBeGreaterThan(1)
  })

  test('the harder you come in, the faster it leaves', () => {
    // Proportional rather than a fixed tap, which is the whole point: a
    // creeping nudge and a sprint used to fire it off identically.
    const walked = walkInto({ friction: 1.2 }, WALK_PACE, 30)
    const sprinted = walkInto({ friction: 1.2 }, SPRINT_PACE, 30)
    expect(sprinted.pushed + sprinted.rolled).toBeGreaterThan(walked.pushed + walked.rolled)
  })

  test('and never faster than whoever is pushing it', () => {
    /**
     * The report: *"it jumps when I touch it - it should be pushed for me"*.
     *
     * Traced in the running level rather than guessed at. One client, no room,
     * nothing on any wire: a walk into the ball on the centre spot at seven cells
     * a second left it doing **11.76** on the very next frame - `PUSH_TRANSFER`
     * times a walk - so it outran the person who had just touched it and was
     * twenty-one cells away in the net before they had taken four steps.
     *
     * `PUSH_TRANSFER` is a rate and was also being read as a destination. A body
     * you are leaning on cannot end up going faster than you are going, whatever
     * the rate, so the ceiling in `shove` bounds it by your pace.
     *
     * The **whole** of a straight walk in rather than the settled part, because
     * it is the first touch on a resting body that was wrong: the chase tests
     * below already hold the dribble, and they held it while this was broken.
     */
    for (const pace of [WALK_PACE, SPRINT_PACE, 30]) {
      // The reported ball's own numbers - grass, not the block's default.
      const { world, blueprints, id } = oneBody(
        { x: 2, y: 1, z: 0.5 },
        { friction: 0.7, drag: 0.08, bounce: 0.5 },
      )
      let px = 2 - 1.0
      let fastest = 0
      for (let i = 0; i < 90; i += 1) {
        px += pace * FRAME
        stepBodies({
          world,
          blueprints,
          delta: FRAME,
          isSolid: FLOOR,
          shovers: [
            { box: shoverBox({ x: px, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: pace * FRAME, dy: 0, dz: 0 },
          ],
        })
        const v = velocityOf(world, id)
        fastest = Math.max(fastest, Math.hypot(v.x, v.z))
      }
      // What is *stored* is half the pace - see PUSH_CARRY - so easing off
      // leaves the ball a stride ahead instead of ten cells down the pitch.
      // The full-pace feel while leaning is the separation's job, which the
      // walking test above measures as distance covered.
      expect(fastest).toBeLessThanOrEqual(pace * PUSH_CARRY + 0.01)
      // And it does go: a bound that stopped it dead would pass the line above.
      expect(fastest).toBeGreaterThan(pace * PUSH_CARRY * 0.9)
    }
  })

  test('a touch too slow to be a touch imparts nothing', () => {
    // Standing beside it while the interpolation breathes a millimetre a frame
    // must not tap it across the level. It still separates - see MIN_APPROACH.
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, {})
    const crawl = MIN_APPROACH / 2
    for (let i = 0; i < 30; i += 1) {
      stepBodies({
        world,
        blueprints,
        delta: FRAME,
        isSolid: FLOOR,
        shovers: [{ box: shoverBox({ x: 1.2, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: crawl * FRAME, dy: 0, dz: 0 }],
      })
    }
    expect(Math.abs(velocityOf(world, id).x)).toBeLessThan(MIN_DRIBBLE_SPEED)
  })

  test('a dash sends it rolling on afterwards', () => {
    // Several times a sprint for a fifth of a second, which is what `dash`
    // does to a player. The excess over a sprint is what the ball keeps.
    const { rolled } = walkInto({ friction: 1.2 }, 30, 12)
    expect(rolled).toBeGreaterThan(5)
  })

  test('standing still pushes nothing', () => {
    expect(walkInto({}, 0, 60).pushed).toBe(0)
  })

  test('backing away does not drag it after you', () => {
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, {})
    const from = world.position.get(id)!.x
    stepBodies({
      world,
      blueprints,
      delta: FRAME,
      isSolid: FLOOR,
      shovers: [{ box: shoverBox({ x: 1.2, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: -WALK_PACE * FRAME, dy: 0, dz: 0 }],
    })
    expect(world.position.get(id)!.x).toBe(from)
  })

  /**
   * A chase rather than a walk into: the shover runs at whatever it is doing
   * *now*, which is how a person dribbles and is the case a straight line into a
   * stationary body cannot produce.
   *
   * Returns the biggest one-frame change in the body's speed and the band it
   * held, both measured only **after** `settled` - because the opening touch
   * sends it several cells ahead and running that down is a chase rather than a
   * dribble. What is being asked is what the two do once they are travelling
   * together, which is the thing anybody dribbling spends their time looking at.
   */
  const chase = (body: BodySpec, pace: number, frames: number, settled = 300) => {
    const { world, blueprints, id } = oneBody({ x: 0, y: 1, z: 0 }, body)
    const p = { x: 0, y: 1 + EYE_HEIGHT, z: -1.0 }
    let prev = { x: p.x, z: p.z }
    const trail: { x: number; z: number }[] = [{ x: 0, z: 0 }]
    let was = 0
    let jump = 0
    let low = Infinity
    let high = 0

    for (let f = 0; f < frames; f += 1) {
      const at = world.position.get(id)!
      const len = Math.hypot(at.x - p.x, at.z - p.z) || 1
      p.x += ((at.x - p.x) / len) * pace * FRAME
      p.z += ((at.z - p.z) / len) * pace * FRAME
      const dx = p.x - prev.x
      const dz = p.z - prev.z
      prev = { x: p.x, z: p.z }

      stepBodies({
        world,
        blueprints,
        delta: FRAME,
        isSolid: FLOOR,
        shovers: [{ box: shoverBox(p), dx, dy: 0, dz }],
      })

      /**
       * The ball's *travel*, not its stored velocity. What a dribble looks like
       * is where the ball is drawn, and under `PUSH_CARRY` that is the sum of
       * what it keeps and the separation tracking your box - the stored half
       * alone would sit at half your pace by design.
       *
       * Over five frames rather than one, because that is the scale an eye
       * works at: contact makes and breaks on alternate frames as the box and
       * the separation trade places, which is a tenth of a cell of shimmer,
       * while the glitch this chase exists to catch - coast for a second, leap
       * back to full price - is hundreds of frames wide and no window this
       * short can hide it.
       */
      const now = world.position.get(id)!
      trail.push({ x: now.x, z: now.z })
      if (trail.length > 6) trail.shift()
      const tail = trail[0]!
      const speed =
        Math.hypot(now.x - tail.x, now.z - tail.z) / (FRAME * (trail.length - 1) || FRAME)
      if (f > settled) {
        jump = Math.max(jump, Math.abs(speed - was))
        low = Math.min(low, speed)
        high = Math.max(high, speed)
      }
      was = speed
    }
    return { jump, low, high }
  }

  test('dribbling it along does not make it leap', () => {
    /**
     * The report: *"the ball now glitch also when u push the ball to move it,
     * its worse than before"*.
     *
     * Simulated at a walk, the ball left the first touch at 11.9, coasted down to
     * 3.6 as the grass took it, and the frame the player caught it up it went
     * **straight back to 11.9** - eight cells a second appearing between two
     * frames, on a loop, for as long as anybody dribbled. Which on screen is the
     * ball being teleported away from you every couple of seconds.
     *
     * The cause was pricing every touch as though the body were standing still:
     * `approach` was the shover's own pace, so catching up with something already
     * rolling at nearly your speed was charged the full `PUSH_TRANSFER`. It is
     * the closing speed now - see `shove`.
     *
     * **No earlier test in this block could have caught it**, and the reason is
     * worth keeping: they all walk in a straight line at a constant pace, so the
     * body is either at rest or long gone. A jump only exists where a shover is
     * *following* something that is already moving.
     */
    const walk = chase({ friction: 0.7, drag: 0.08, bounce: 0.5 }, WALK_PACE, 600)
    // A frame's grass, near enough, rather than most of a walking pace.
    expect(walk.jump).toBeLessThan(1)
    // And it rides just ahead of you rather than oscillating between a third of
    // your pace and half again over it.
    expect(walk.low).toBeGreaterThan(WALK_PACE * 0.85)
    expect(walk.high).toBeLessThan(WALK_PACE * 1.15)
  })

  test('and a sprint dribble stays with you, never at 1.7 of one', () => {
    /**
     * Under `PUSH_CARRY` a sprint dribble is a run of *taps*: each touch
     * leaves the ball a third of your pace, you close on it, and the
     * separation nudges it on again - so its travel breathes between the tap
     * and the catch-up rather than gliding at your speed. That is what close
     * control looks like. The two things worth holding are that it is
     * *smooth* - no eye-scale leap between one window and the next - and that
     * it is *yours*: it never outruns you, and it keeps moving between taps
     * instead of dying underfoot.
     */
    const sprint = chase({ friction: 0.7, drag: 0.08, bounce: 0.5 }, SPRINT_PACE, 600)
    expect(sprint.jump).toBeLessThan(2)
    expect(sprint.low).toBeGreaterThan(SPRINT_PACE * 0.25)
    expect(sprint.high).toBeLessThan(SPRINT_PACE * 1.15)
  })

  test('a heavy thing barely notices you', () => {
    expect(walkInto({ mass: 20, friction: 3 }, WALK_PACE, 60).pushed).toBeLessThan(
      walkInto({ friction: 3 }, WALK_PACE, 60).pushed / 10,
    )
  })

  test('somebody across the room pushes nothing', () => {
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, {})
    stepBodies({
      world,
      blueprints,
      delta: FRAME,
      isSolid: FLOOR,
      shovers: [{ box: shoverBox({ x: -8, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: 0.2, dy: 0, dz: 0 }],
    })
    expect(velocityOf(world, id).x).toBe(0)
  })

  test('pushing it forward sends it forward, not sideways', () => {
    /**
     * The report this was rebuilt for: *"when u push the ball forward the ball
     * goes sideway"*.
     *
     * Contact used to resolve along the shallowest side of the box, which snaps
     * every push to ±x or ±z - so meeting the ball a hand's width off centre
     * sent it at a right angle to the way you were running. The direction is
     * the *shover's own travel* now, and the box only decides how far apart the
     * two end up.
     *
     * Approached off-centre on purpose, because dead-on is the case that worked
     * before and would pass either way.
     */
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, { friction: 3 })
    const from = { ...world.position.get(id)! }
    let px = 2 - 1.0
    // A third of a cell to the side: close enough to touch, far enough that the
    // shallowest axis is the wrong answer.
    const pz = 0.5 - 0.35
    for (let i = 0; i < 60; i += 1) {
      px += WALK_PACE * FRAME
      stepBodies({
        world,
        blueprints,
        delta: FRAME,
        isSolid: FLOOR,
        shovers: [{ box: shoverBox({ x: px, y: 1 + EYE_HEIGHT, z: pz }), dx: WALK_PACE * FRAME, dy: 0, dz: 0 }],
      })
    }
    const to = world.position.get(id)!
    const forward = to.x - from.x
    const sideways = Math.abs(to.z - from.z)
    expect(forward).toBeGreaterThan(3)
    // Mostly along the way you were going. It was almost entirely across it.
    expect(sideways).toBeLessThan(forward / 3)
  })

  test('standing on top of it does not fire it off sideways', () => {
    /**
     * The picture the report came with: somebody standing *in* the ball.
     *
     * Centre-to-centre was the old way out and it cannot survive this - the two
     * centres nearly coincide, so the direction is whatever the last millimetre
     * of noise says and the ball leaves at speed in a random direction. A box
     * has a nearest way out however deep you are in it.
     */
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, {})
    for (let i = 0; i < 30; i += 1) {
      stepBodies({
        world,
        blueprints,
        delta: FRAME,
        isSolid: FLOOR,
        shovers: [
          { box: shoverBox({ x: 2, y: 1 + EYE_HEIGHT, z: 0.5 }), dx: WALK_PACE * FRAME, dy: 0, dz: 0 },
        ],
      })
    }
    // Nudged out from under them at a walk, not launched.
    const speed = Math.hypot(velocityOf(world, id).x, velocityOf(world, id).z)
    expect(speed).toBeLessThan(WALK_PACE)
  })

  test('a kick still flies, because it is not contact at all', () => {
    // A script's `push` writes into the body's own velocity and never comes
    // through the contact path, so none of the above applies to it.
    const { world, blueprints, id } = oneBody({ x: 2, y: 1, z: 0.5 }, { friction: 1.2 })
    push(world, blueprints, id, 24, 0, 0)
    const from = world.position.get(id)!.x
    for (let i = 0; i < 600; i += 1) {
      stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
    }
    expect(world.position.get(id)!.x - from).toBeGreaterThan(15)
  })
})

describe('bodies and each other', () => {
  test('a rolled body stops on another one and names it in the contact', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0 })
    const crate = 2 as EntityId
    world.alive.add(crate)
    world.blueprint.set(crate, 'thing')
    world.position.set(crate, { x: 4, y: 1, z: 0.5 })
    world.box.set(crate, { minX: 3.5, maxX: 4.5, minY: 1, maxY: 2, minZ: 0, maxZ: 1 })

    push(world, blueprints, id, 12, 0, 0)
    let met: ReturnType<typeof stepBodies> = []
    for (let i = 0; i < 120; i += 1) {
      const contacts = stepBodies({ world, blueprints, delta: FRAME, isSolid: FLOOR })
      for (const contact of contacts) if (contact.other !== null) met = [contact]
    }
    expect(met).toHaveLength(1)
    expect(met[0]!.other).toBe(crate)
    expect(world.position.get(id)!.x).toBeLessThan(3.1)
  })

  test('a colliderless pickup does not stop it', () => {
    // Solidity and triggerability are unrelated: a ball rolls through a coin,
    // and the coin's own `collide` rule still fires from the overlap pass.
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0 })
    const coin = 2 as EntityId
    world.alive.add(coin)
    world.blueprint.set(coin, 'coin')
    world.position.set(coin, { x: 4, y: 1, z: 0.5 })
    blueprints.coin = blueprint(undefined, 'none')

    push(world, blueprints, id, 12, 0, 0)
    run(world, blueprints, 120)
    expect(world.position.get(id)!.x).toBeGreaterThan(4)
  })
})

describe('what is not stepped', () => {
  test('a thing in somebody’s hands does not fall, and is dropped at rest', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 }, {})
    push(world, blueprints, id, 0, 0, 20)
    world.parent.set(id, { id: PLAYER_ID })
    run(world, blueprints, 60)
    expect(world.position.get(id)?.y).toBe(6)
    // Cleared rather than parked: a ball caught mid-flight and put down falls
    // from rest instead of resuming the throw it was on.
    expect(world.velocity.has(id)).toBe(false)
  })

  test('a body a peer is carrying is left alone too', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 }, {})
    world.heldBy.set(id, 'somebody-else')
    run(world, blueprints, 60)
    expect(world.position.get(id)?.y).toBe(6)
  })

  test('a deactivated body does not quietly keep falling while it is away', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 6, z: 0.5 }, {})
    world.alive.delete(id)
    world.returns.set(id, 10)
    run(world, blueprints, 60)
    expect(world.position.get(id)?.y).toBe(6)
  })

  test('a body spawned inside a wall stays put rather than being relocated', () => {
    const { world, blueprints, id } = oneBody({ x: 3.5, y: 1, z: 0.5 }, { friction: 0 })
    push(world, blueprints, id, 10, 0, 0)
    run(world, blueprints, 30, { isSolid: FLOOR_AND_WALL })
    expect(world.position.get(id)!.x).toBe(3.5)
  })
})

describe('leaving the level', () => {
  test('a body that falls out of the world stops accelerating in the dark', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 0, z: 0.5 }, {})
    run(world, blueprints, 300, { isSolid: EMPTY, below: -2 })
    expect(velocityOf(world, id).y).toBe(0)
  })
})

describe('resting', () => {
  test('a slow crawl on the floor is stopped rather than left creeping', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 1, z: 0.5 }, { friction: 0, drag: 0 })
    push(world, blueprints, id, REST_SPEED / 2, 0, 0)
    run(world, blueprints, 2)
    expect(velocityOf(world, id).x).toBe(0)
  })

  test('the same crawl in mid-air is left alone', () => {
    const { world, blueprints, id } = oneBody({ x: 0.5, y: 20, z: 0.5 }, { gravity: 0, drag: 0 })
    push(world, blueprints, id, REST_SPEED / 2, 0, 0)
    run(world, blueprints, 2, { isSolid: EMPTY })
    expect(velocityOf(world, id).x).toBeGreaterThan(0)
  })
})
