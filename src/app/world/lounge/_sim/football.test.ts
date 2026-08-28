import { describe, expect, test } from 'bun:test'
import {
  type Ball,
  BALL_CATCHUP,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  BALL_SNAP,
  BALL_STUCK_MS,
  ballAcked,
  ballAgrees,
  ballAt,
  ballClientKey,
  type BallClient,
  ballOwner,
  bodyVelocity,
  CONTACT_DISTANCE,
  DEFAULT_GOAL_HEIGHT,
  DEFAULT_GOAL_WIDTH,
  drawnBall,
  type Goal,
  goalCentre,
  goalCrossed,
  goalsReady,
  kickoffSpot,
  MIN_DRIBBLE_SPEED,
  noStuckWatch,
  PUSH_REACH,
  PUSH_TRANSFER,
  reckonBall,
  reconcileBall,
  scoringSide,
  stepBall,
  strike,
  type Striker,
  watchStuck,
} from '@/app/world/lounge/_sim/football'
import { DASH_SPEED } from '@/app/world/lounge/_sim/combat'
import { EYE_HEIGHT, type SolidTest, type Vec3 } from '@/app/world/lounge/_sim/physics'
import { PITCH_WIDTH, planPitch } from '@/domain/lounge/pitch'

/** A frame at 60fps. */
const FRAME = 1 / 60

const EMPTY: SolidTest = () => false

/** A wall of blocks along x=2, i.e. cells [2,3) in x. */
const WALL_AT_X2: SolidTest = (x) => x === 2

function run(ball: Parameters<typeof stepBall>[0]['ball'], overrides: Partial<Parameters<typeof stepBall>[0]> = {}) {
  return stepBall({ ball, delta: FRAME, isSolid: EMPTY, ...overrides })
}

/** An eye position, since that is what the scene and the wire deal in. */
function eyeAt(x: number, feet: number, z: number): Vec3 {
  return { x, y: feet + EYE_HEIGHT, z }
}

/** A goal across Z, so the ball travels along Z to score. */
function goalAcrossZ(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    kind: 'red',
    x: 0,
    y: 0,
    z: 10,
    width: DEFAULT_GOAL_WIDTH,
    height: DEFAULT_GOAL_HEIGHT,
    facing: 0,
    ...overrides,
  }
}

describe('the ball', () => {
  test('falls when nothing holds it up', () => {
    const result = run(ballAt({ x: 0, y: 10, z: 0 }), { floorY: -Infinity })
    expect(result.vy).toBeLessThan(0)
    expect(result.y).toBeLessThan(10)
  })

  test('rests on the world floor rather than sinking through it', () => {
    let ball = ballAt({ x: 0, y: 4, z: 0 })
    for (let i = 0; i < 600; i++) ball = run(ball)

    expect(ball.y).toBeCloseTo(BALL_RADIUS, 5)
    expect(ball.vy).toBe(0)
  })

  test('bounces off the floor, lower each time', () => {
    // Dropped from a height, the first bounce must come back up but not as far.
    let ball = { ...ballAt({ x: 0, y: 6, z: 0 }), vy: 0 }
    let rising = 0
    let peak = 0
    for (let i = 0; i < 240; i++) {
      const next = run(ball)
      if (ball.vy <= 0 && next.vy > 0) rising++
      if (rising > 0) peak = Math.max(peak, next.y)
      ball = next
    }

    expect(rising).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(BALL_RADIUS)
    expect(peak).toBeLessThan(6)
  })

  test('reflects off a wall instead of passing through it', () => {
    // Stepped until it actually reaches the wall - one frame at this speed only
    // covers a third of a block, so a single step proves nothing either way.
    let ball = { ...ballAt({ x: 0, y: 5, z: 0 }), vx: 20 }
    let deepest = ball.x
    for (let i = 0; i < 120 && ball.vx > 0; i++) {
      ball = run(ball, { isSolid: WALL_AT_X2 })
      deepest = Math.max(deepest, ball.x)
    }

    // Came back the way it came, and never got into the cell the wall fills.
    expect(ball.vx).toBeLessThan(0)
    expect(deepest).toBeLessThan(2)
  })

  test('a rolling ball eventually stops', () => {
    let ball = { ...ballAt({ x: 0, y: BALL_RADIUS, z: 0 }), vx: 12 }
    for (let i = 0; i < 1200; i++) ball = run(ball)

    expect(ball.vx).toBe(0)
    expect(ball.vz).toBe(0)
  })

  test('speed is capped', () => {
    // A dash arrives at 26 blocks a second; times the transfer that is well past
    // the ceiling, and the ceiling has to win.
    const struck = strike(ballAt({ x: 0.8, y: 1, z: 0 }), body(-0.1, 0.3, 0, 100, 0))!
    expect(Math.hypot(struck.vx, struck.vy, struck.vz)).toBeLessThanOrEqual(
      BALL_MAX_SPEED + 1e-9,
    )
  })
})

/** A body at these feet coordinates, moving at this horizontal velocity. */
function body(x: number, feet: number, z: number, vx: number, vz: number): Striker {
  return { position: eyeAt(x, feet, z), vx, vz }
}

describe('touching it', () => {
  const ball = ballAt({ x: 0, y: 1, z: 0 })

  test('nobody out of reach touches it', () => {
    expect(strike(ball, body(PUSH_REACH + 1, 0, 0, 5, 0))).toBeNull()
  })

  test('standing still beside it leaves it alone', () => {
    // In reach but not overlapping, and not moving: no kick, no separation.
    expect(strike(ball, body(-0.8, 0.3, 0, 0, 0))).toBeNull()
  })

  test('speed in, speed out: a slow walk dribbles, a run drives', () => {
    const walked = strike(ball, body(-0.8, 0.3, 0, 4, 0))!
    const ran = strike(ball, body(-0.8, 0.3, 0, 10, 0))!

    expect(walked.vx).toBeCloseTo(4 * PUSH_TRANSFER, 1)
    expect(ran.vx).toBeCloseTo(10 * PUSH_TRANSFER, 1)
    expect(ran.vx).toBeGreaterThan(walked.vx)
    // And both lift it a little, so a shot can climb into a goal's height.
    expect(walked.vy).toBeGreaterThan(0)
  })

  test('a crawl still moves it a visible step', () => {
    // The floor under the proportional rule: crawl x transfer would be a ball
    // that trickles and stops, which reads as the touch not registering.
    const nudged = strike(ball, body(-0.8, 0.3, 0, 0.5, 0))!
    expect(Math.hypot(nudged.vx, nudged.vz)).toBeGreaterThanOrEqual(MIN_DRIBBLE_SPEED)
  })

  test('an off-centre touch at a run still carries the ball forward', () => {
    /**
     * The dribble steer. The body runs along +x with the ball half a block off to
     * the side, so the raw contact normal points mostly sideways - the un-steered
     * model squirts the ball out of the lane you are running in, or worse,
     * backwards. Bent toward the travel heading it must come out going forward.
     */
    const beside = ballAt({ x: 0, y: 1, z: 0.45 })
    const struck = strike(beside, body(-0.5, 0.3, 0, 8, 0))!

    expect(struck.vx).toBeGreaterThan(0)
    // Forwards more than sideways: this is a dribble, not a deflection.
    expect(struck.vx).toBeGreaterThan(Math.abs(struck.vz))
  })

  test('chasing your own shot cannot slow it down', () => {
    // Ball already flying +x faster than the body runs: the contact must not
    // replace a fast escape with a slower kick.
    const flying = { ...ballAt({ x: 0.8, y: 1, z: 0 }), vx: 20 }
    expect(strike(flying, body(0, 0.3, 0, 8, 0))).toBeNull()
  })

  test('running away from it never drags it after you', () => {
    expect(strike(ball, body(-0.8, 0.3, 0, -10, 0))).toBeNull()
  })

  test('a glancing touch deflects a rolling ball instead of resetting it', () => {
    // Ball rolling across the body's front (+z); body approaches along x. The
    // tangential component has to survive the contact.
    const rolling = { ...ballAt({ x: 0, y: 1, z: 0 }), vz: 6 }
    const struck = strike(rolling, body(-0.8, 0.3, 0, 5, 0))!
    expect(struck.vz).toBeGreaterThan(4)
    expect(struck.vx).toBeGreaterThan(0)
  })

  test('standing inside it pushes the ball out, kick or no kick', () => {
    // Overlapping and motionless: the ball may not share the space, but no
    // velocity is invented for it either.
    const struck = strike(ball, body(-0.4, 0.3, 0, 0, 0))!
    const distance = Math.hypot(struck.x - -0.4, struck.z - 0)
    expect(distance).toBeCloseTo(CONTACT_DISTANCE, 5)
    expect(struck.vx).toBe(0)
    expect(struck.vz).toBe(0)
  })

  test('somebody on a ledge well above it cannot nudge it', () => {
    expect(strike(ball, body(0.5, 6, 0, 8, 0))).toBeNull()
  })

  test('standing exactly on it pops it upward rather than nowhere', () => {
    const struck = strike(ball, body(0, 0.4, 0, 0, 0))!
    expect(struck.vx).toBe(0)
    expect(struck.vz).toBe(0)
    expect(struck.vy).toBeGreaterThan(0)
  })

  test('a touch cannot flatten a shot that was already rising faster', () => {
    const rising = { ...ballAt({ x: 0, y: 1, z: 0 }), vy: 30 }
    expect(strike(rising, body(-0.8, 0.3, 0, 5, 0))!.vy).toBe(30)
  })

  test('walking behind it for two seconds is a dribble, not a rally', () => {
    /**
     * The whole point of the model, run end to end: contact, step, repeat, with
     * the body walking a straight line at a steady 6 blocks a second. The ball
     * has to end up *ahead* of the body - never behind it, which is what the
     * un-steered normal used to do - and within dribbling range, not fired to
     * the horizon by the first touch and never seen again.
     */
    const speed = 6
    let walker = body(-1, 0.3, 0, speed, 0)
    let rolling = ballAt({ x: 0, y: BALL_RADIUS, z: 0 })

    for (let i = 0; i < 120; i++) {
      const struck = strike(rolling, walker)
      if (struck) rolling = struck
      rolling = stepBall({ ball: rolling, delta: FRAME, isSolid: EMPTY })
      walker = body(walker.position.x + speed * FRAME, 0.3, 0, speed, 0)
    }

    const lead = rolling.x - walker.position.x
    expect(lead).toBeGreaterThan(0)
    expect(lead).toBeLessThan(8)
    // And it stayed in the lane: a straight dribble does not wander sideways.
    expect(Math.abs(rolling.z)).toBeLessThan(1)
  })
})

describe('scoring', () => {
  test('a ball driven through the mouth counts', () => {
    const goal = goalAcrossZ()
    // Straight down the middle of the goal's width, at its mid height.
    const centre = goalCentre(goal)
    expect(
      goalCrossed({ x: centre.x, y: centre.y, z: 9 }, { x: centre.x, y: centre.y, z: 11 }, goal),
    ).toBe(true)
  })

  test('a shot wide of the post does not', () => {
    const goal = goalAcrossZ()
    const centre = goalCentre(goal)
    const wide = centre.x + DEFAULT_GOAL_WIDTH / 2 + 0.5
    expect(goalCrossed({ x: wide, y: 1, z: 9 }, { x: wide, y: 1, z: 11 }, goal)).toBe(false)
  })

  test('a shot over the bar does not', () => {
    const goal = goalAcrossZ()
    const centre = goalCentre(goal)
    const over = DEFAULT_GOAL_HEIGHT + 1
    expect(
      goalCrossed({ x: centre.x, y: over, z: 9 }, { x: centre.x, y: over, z: 11 }, goal),
    ).toBe(false)
  })

  test('a shot fast enough to clear the plane in one frame still counts', () => {
    // The whole reason the test is swept: at 34 blocks a second on a long frame
    // the ball is behind the goal by the time anybody looks at it.
    const goal = goalAcrossZ()
    const centre = goalCentre(goal)
    expect(
      goalCrossed({ x: centre.x, y: centre.y, z: 4 }, { x: centre.x, y: centre.y, z: 16 }, goal),
    ).toBe(true)
  })

  test('a ball resting on the plane does not score every frame', () => {
    const goal = goalAcrossZ()
    const centre = goalCentre(goal)
    const spot = { x: centre.x, y: centre.y, z: centre.z }
    expect(goalCrossed(spot, spot, goal)).toBe(false)
  })

  test('walking it in from behind still counts', () => {
    const goal = goalAcrossZ()
    const centre = goalCentre(goal)
    expect(
      goalCrossed({ x: centre.x, y: centre.y, z: 11 }, { x: centre.x, y: centre.y, z: 9 }, goal),
    ).toBe(true)
  })

  test('a ball crossing the goal line beside the goal does not count', () => {
    // Same depth, far off to the side: the plane is a rectangle, not a line
    // across the whole world.
    const goal = goalAcrossZ()
    expect(goalCrossed({ x: 40, y: 1, z: 9 }, { x: 40, y: 1, z: 11 }, goal)).toBe(false)
  })

  test('the point goes to the other side', () => {
    expect(scoringSide(goalAcrossZ({ kind: 'red' }))).toBe('blue')
    expect(scoringSide(goalAcrossZ({ kind: 'blue' }))).toBe('red')
  })
})

describe('kickoff', () => {
  test('the ball restarts halfway between the goals', () => {
    const red = goalAcrossZ({ id: 'r', kind: 'red', z: -20 })
    const blue = goalAcrossZ({ id: 'b', kind: 'blue', z: 20 })

    const spot = kickoffSpot([red, blue])
    expect(spot.z).toBeCloseTo((goalCentre(red).z + goalCentre(blue).z) / 2, 5)
    expect(spot.y).toBeGreaterThan(0)
  })

  test('a world with no goals still has somewhere to put the ball', () => {
    expect(kickoffSpot([])).toMatchObject({ x: 0.5, z: 0.5 })
  })

  test('a match needs a goal at each end', () => {
    const red = goalAcrossZ({ kind: 'red' })
    const blue = goalAcrossZ({ id: 'b', kind: 'blue' })

    expect(goalsReady([])).toBe(false)
    expect(goalsReady([red])).toBe(false)
    expect(goalsReady([red, blue])).toBe(true)
  })
})

describe('a ball nobody can reach', () => {
  const wedged = ballAt({ x: 4, y: 1, z: 4 })

  /** Drive the watch through a stretch of frames at a fixed ball position. */
  function hold(ball: Ball | null, ms: number, playing = true, from = noStuckWatch()) {
    let watch = from
    for (let at = 0; at <= ms; at += 100) watch = watchStuck(watch, ball, playing, at)
    return watch
  }

  test('sitting still is not stuck until it has gone on long enough', () => {
    expect(hold(wedged, BALL_STUCK_MS - 1000).stuck).toBe(false)
    expect(hold(wedged, BALL_STUCK_MS + 100).stuck).toBe(true)
  })

  test('a ball that moves resets the clock', () => {
    const nearly = hold(wedged, BALL_STUCK_MS - 500)
    expect(nearly.stuck).toBe(false)

    // A kick, one frame later. The watch starts again from where it landed.
    const kicked = watchStuck(
      nearly,
      { ...wedged, x: wedged.x + 3 },
      true,
      BALL_STUCK_MS - 400,
    )
    expect(kicked.stuck).toBe(false)
    expect(kicked.at).toMatchObject({ x: 7 })

    // And the old clock is gone: another half second does not tip it over.
    expect(hold({ ...wedged, x: 7 }, 500, true, kicked).stuck).toBe(false)
  })

  test('a shiver inside the geometry still counts as stuck', () => {
    // A ball resting in a wall is nudged a fraction every frame by the axis
    // resolution and never sleeps, which is exactly the case this is for.
    let watch = noStuckWatch()
    for (let at = 0; at <= BALL_STUCK_MS + 100; at += 100) {
      watch = watchStuck(watch, { ...wedged, x: 4 + (at % 200) / 10000 }, true, at)
    }
    expect(watch.stuck).toBe(true)
  })

  test('a match that is not running has no stuck ball', () => {
    // Before kickoff, during the pause after a goal, and after the whistle: a
    // still ball is correct, and offering to move it would be noise.
    expect(hold(wedged, BALL_STUCK_MS + 1000, false).stuck).toBe(false)
    expect(hold(null, BALL_STUCK_MS + 1000).stuck).toBe(false)
  })

  test('the whistle clears a warning that was already up', () => {
    const stuck = hold(wedged, BALL_STUCK_MS + 100)
    expect(stuck.stuck).toBe(true)
    expect(watchStuck(stuck, wedged, false, BALL_STUCK_MS + 200).stuck).toBe(false)
  })

  test('a quiet frame allocates nothing', () => {
    // The frame loop runs this sixty times a second on every client in the
    // match, so the common case - nothing has changed - hands the same object
    // back rather than a fresh one.
    const settled = hold(wedged, 1000)
    expect(watchStuck(settled, wedged, true, 1100)).toBe(settled)

    const stuck = hold(wedged, BALL_STUCK_MS + 100)
    expect(watchStuck(stuck, wedged, true, BALL_STUCK_MS + 200)).toBe(stuck)
  })
})

/**
 * What everybody who is *not* stepping the ball draws.
 *
 * The staircase these exist to hold shut: the wire carries twelve balls a
 * second, so a client that only drew what it was told froze for 83ms and then
 * jumped most of a block, over and over. Predicted forward with the owner's own
 * physics and corrected by easing rather than snapping, the same stream of
 * packets has to come out as a ball that rolls.
 */
describe('drawing a ball somebody else is stepping', () => {
  /** A ball rolling along +x, resting on the floor. */
  function rolling(x: number, vx: number): Ball {
    return { ...ballAt({ x, y: BALL_RADIUS, z: 0 }), vx }
  }

  test('with nothing to correct it rolls exactly as the owner rolls it', () => {
    // The claim underneath the whole scheme: the prediction is not an
    // approximation of the owner's physics, it is the same function.
    let drawn = drawnBall(rolling(0, 9))
    let mirror = rolling(0, 9)
    for (let i = 0; i < 10; i++) {
      drawn = reckonBall({ drawn, delta: FRAME, isSolid: EMPTY })
      mirror = stepBall({ ball: mirror, delta: FRAME, isSolid: EMPTY })
    }

    expect(drawn.ball.x).toBeCloseTo(mirror.x, 10)
    expect(drawn.ball.vx).toBeCloseTo(mirror.vx, 10)
  })

  test('a fresh packet takes the velocity but leaves the ball where it is drawn', () => {
    // Where the room has just watched the ball be is not a thing to jump away
    // from. The owner's velocity, on the other hand, is better than any guess.
    const drawn = reconcileBall(drawnBall(rolling(3, 9)), rolling(2.6, -4))

    expect(drawn.ball.x).toBe(3)
    expect(drawn.ball.vx).toBe(-4)
    expect(drawn.error.x).toBeCloseTo(0.4, 10)
  })

  test('the gap closes over the frames that follow', () => {
    // A ball at rest on both sides, so nothing but the correction can move it:
    // half a block out, and within a third of a second it is essentially right.
    let drawn = reconcileBall(drawnBall(rolling(0.5, 0)), rolling(0, 0))
    expect(drawn.ball.x).toBe(0.5)

    let previous = drawn.ball.x
    for (let i = 0; i < 20; i++) {
      drawn = reckonBall({ drawn, delta: FRAME, isSolid: EMPTY })
      // Monotonic: the ball walks in, it never overshoots and comes back.
      expect(drawn.ball.x).toBeLessThan(previous)
      expect(drawn.ball.x).toBeGreaterThanOrEqual(0)
      previous = drawn.ball.x
    }

    expect(drawn.ball.x).toBeLessThan(0.05)
  })

  test('the correction takes the same wall-clock time at any framerate', () => {
    // Framerate independence, checked rather than asserted in a comment: the
    // same tenth of a second in one long frame and in six short ones.
    const once = reckonBall({
      drawn: reconcileBall(drawnBall(rolling(0.3, 0)), rolling(0, 0)),
      delta: 0.1,
      isSolid: EMPTY,
    })

    let many = reconcileBall(drawnBall(rolling(0.3, 0)), rolling(0, 0))
    for (let i = 0; i < 6; i++) {
      many = reckonBall({ drawn: many, delta: 0.1 / 6, isSolid: EMPTY })
    }

    expect(many.ball.x).toBeCloseTo(once.ball.x, 6)
  })

  test('a ball rolling the way the wire says is never snapped, however far ahead', () => {
    /**
     * The other half of the snap rule. Our own touch happens a round trip before
     * the owner's version of it, so a predicted ball runs blocks ahead of the one
     * on the wire - on the same journey, at the same speed, simply earlier. Moving
     * it back is drawing the kick twice, and drag closes the gap unaided: both
     * balls leave one touch and travel one distance, so they stop in one place.
     */
    const ahead = reconcileBall(drawnBall(rolling(9, 13)), rolling(0, 11))

    expect(9).toBeGreaterThan(BALL_SNAP)
    expect(ahead.ball.x).toBe(9)
    expect(ahead.ball.vx).toBe(11)
    expect(ahead.error.x).toBeCloseTo(9, 10)
  })

  test('a big gap is paid back at a walking pace, not thrown back', () => {
    // The cap. Two blocks of error eased at the bare rate is thirty blocks a
    // second of correction, which draws the ball hurling itself backwards.
    const ahead = reconcileBall(drawnBall(rolling(9, 13)), rolling(0, 11))
    const next = reckonBall({ drawn: ahead, delta: FRAME, isSolid: EMPTY })

    const paid = Math.hypot(
      ahead.error.x - next.error.x,
      ahead.error.y - next.error.y,
      ahead.error.z - next.error.z,
    )
    expect(paid).toBeLessThanOrEqual(BALL_CATCHUP * FRAME + 1e-9)
    // And the ball carried on rolling forwards while it paid.
    expect(next.ball.x).toBeGreaterThan(ahead.ball.x)
  })

  test('a gap with no journey behind it is a disagreement, not a lead', () => {
    // A drawn ball at rest claims nothing about where the ball is going, so a
    // wire ball a long way off is the owner knowing something we do not.
    expect(ballAgrees(rolling(0, 0), rolling(9, 12))).toBe(false)
    expect(ballAgrees(rolling(0, 13), rolling(0, 11))).toBe(true)
  })

  test('a teleport is not slid across the pitch', () => {
    /**
     * A kickoff reset, from the receiver's side. Nothing about the ball's own
     * travel connects where it was to the centre spot, so easing would draw it
     * gliding back up the pitch through everybody's legs.
     */
    const spot = rolling(0, 0)
    const drawn = reconcileBall(drawnBall(rolling(20, 14)), spot)

    expect(drawn.ball.x).toBe(0)
    expect(drawn.ball.vx).toBe(0)
    expect(drawn.error).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('a correction never drags the ball into the floor', () => {
    // A landed ball is already as low as the world goes, so the downward half of
    // a vertical correction has nowhere to put it but through the grass.
    const sunk = reckonBall({
      drawn: { ball: rolling(0, 0), error: { x: 0, y: 1, z: 0 } },
      delta: FRAME,
      isSolid: EMPTY,
    })

    expect(sunk.ball.y).toBeGreaterThanOrEqual(BALL_RADIUS)
  })

  test('a touch of our own moves the ball before the owner has heard about it', () => {
    /**
     * Local prediction, end to end, which is what makes a non-owner's own touch
     * feel like a touch instead of a round trip. `strike` *sets* a velocity, so
     * when the owner resolves the same contact from its copy of our body a packet
     * later it arrives at the same answer, and what little difference is left is
     * absorbed by the easing above.
     */
    let drawn = drawnBall(rolling(0, 0))
    const struck = strike(drawn.ball, body(-0.8, 0.3, 0, 8, 0))!
    drawn = reckonBall({ drawn: { ...drawn, ball: struck }, delta: FRAME, isSolid: EMPTY })

    expect(drawn.ball.x).toBeGreaterThan(0)

    // And the owner's own resolution of that contact agrees with ours, rather
    // than doubling it.
    const owned = strike(rolling(0, 0), body(-0.8, 0.3, 0, 8, 0))!
    expect(struck.vx).toBeCloseTo(owned.vx, 10)
  })

  test('a packet from before our touch does not count as having seen it', () => {
    // The ball we are drawing is away down the pitch; the ball on the wire is
    // still sitting where we kicked it from, because our kick has not got there
    // yet. Believing that packet is how a predicted touch gets taken back.
    expect(ballAcked(rolling(0, 13), rolling(0, 0))).toBe(false)
  })

  test('a packet that agrees the ball is going that way settles it', () => {
    // The owner's answer to the same contact: the same direction, a little slower
    // for the drag and the fraction of a second it took to get here.
    expect(ballAcked(rolling(0, 13), rolling(0, 11))).toBe(true)
  })

  test('a packet sending the ball somewhere else has not seen our touch', () => {
    // Somebody else's kick, or nobody's. Either way it is not the one we
    // predicted, and it is worth waiting a moment to find out which.
    expect(ballAcked(rolling(0, 13), { ...rolling(0, 0), vz: 13 })).toBe(false)
    expect(ballAcked(rolling(0, 13), rolling(0, -13))).toBe(false)
  })

  test('a ball we are not predicting anywhere has nothing to wait for', () => {
    // Nothing outstanding: a drawn ball at rest makes no claim the wire can be
    // late in confirming.
    expect(ballAcked(rolling(0, 0), rolling(0, 0))).toBe(true)
    expect(ballAcked(rolling(0, 0), rolling(0, 20))).toBe(true)
  })
})

describe('who steps the ball', () => {
  /** One tab, named after its player, for the cases where tabs are not the point. */
  const one = (userId: string): BallClient => ({ userId, conn: `${userId}-tab` })

  test('everybody picks the same owner from the same roster', () => {
    const roster = [one('c3'), one('a1'), one('b2')]
    expect(ballOwner(roster)).toBe('a1-tab')
    expect(ballOwner([...roster].reverse())).toBe('a1-tab')
  })

  test('an empty room has no owner', () => {
    expect(ballOwner([])).toBeNull()
  })

  test('the owner leaving hands it to the next in order', () => {
    expect(ballOwner([one('c3'), one('b2')])).toBe('b2-tab')
  })

  /**
   * The bug this pair exists for.
   *
   * Presence is keyed by user id, so two tabs of one person are one entry in the
   * roster - and each filters the other's broadcasts out as its own echo. Elected
   * by person alone, both of the lowest player's tabs stepped the ball, neither
   * could see the other, and a goal was reported twice under two ids.
   */
  test('two tabs of the same player elect exactly one of themselves', () => {
    const tabs = [
      { userId: 'a1', conn: 'tab-2' },
      { userId: 'a1', conn: 'tab-1' },
      one('b2'),
    ]
    expect(ballOwner(tabs)).toBe('tab-1')
    expect(ballOwner([...tabs].reverse())).toBe('tab-1')
  })

  test('a second tab cannot take the ball off the room', () => {
    // Ordered by person first, so somebody opening a second tab moves the ball
    // between their own tabs at most - never away from whoever already had it.
    const room = [one('a1'), { userId: 'b2', conn: 'aaa' }, { userId: 'b2', conn: 'zzz' }]
    expect(ballOwner(room)).toBe('a1-tab')
  })

  test('a client from before connections is identified by its player', () => {
    // Mid-deploy: no `conn` in its presence and none on its packets, so both
    // ends have to agree on the user id or the room has two owners for a minute.
    expect(ballOwner([{ userId: 'a1', conn: '' }, one('b2')])).toBe('a1')
    expect(ballClientKey({ userId: 'a1', conn: '' })).toBe('a1')
  })

  test('an entry with no player at all is not a candidate', () => {
    expect(ballOwner([{ userId: '', conn: 'ghost' }, one('b2')])).toBe('b2-tab')
  })
})

/**
 * How a body's movement becomes the momentum the contact model wants.
 *
 * The interesting cases are all about *which* delta is used. Dividing a long
 * frame's travel by the clamped physics step is the bug these exist to hold
 * shut: it reads a hitch as a sprint and fires the ball off the pitch.
 */
describe('what speed a body was moving at', () => {
  test('a walk across one frame is a walking speed', () => {
    const { vx, vz } = bodyVelocity({ x: 0, z: 0 }, { x: 0, z: 5 * FRAME }, FRAME)
    expect(vx).toBeCloseTo(0, 5)
    expect(vz).toBeCloseTo(5, 5)
  })

  test('the first frame of a body it has never seen stands still', () => {
    // No stride to difference. Zero rather than a velocity measured from the
    // origin, which would launch the ball at anybody who just walked in.
    expect(bodyVelocity(undefined, { x: 40, z: 40 }, FRAME)).toEqual({ vx: 0, vz: 0 })
  })

  test('a frame hitch is not a dash', () => {
    // A peer walking at 5 blocks a second through a 200ms stall covers a whole
    // block. Divided by a clamped 1/20s step that reads as 20 blocks a second -
    // a phantom kick. Divided by the time that actually passed, it is a walk.
    const hitch = 0.2
    const { vz } = bodyVelocity({ x: 0, z: 0 }, { x: 0, z: 5 * hitch }, hitch)
    expect(vz).toBeCloseTo(5, 5)
  })

  test('an interpolation snap is capped at a dash rather than believed', () => {
    // Nobody travels faster than a dash, so a huge stride is a body being
    // snapped into place after a hang, not a body that ran there.
    const { vx, vz } = bodyVelocity({ x: 0, z: 0 }, { x: 0, z: 60 }, FRAME)
    expect(Math.hypot(vx, vz)).toBeCloseTo(DASH_SPEED, 5)
    // Capped, not zeroed, and still pointing the way the body went.
    expect(vz).toBeGreaterThan(0)
  })

  test('the cap keeps the direction it was given', () => {
    const { vx, vz } = bodyVelocity({ x: 0, z: 0 }, { x: 30, z: 30 }, FRAME)
    expect(vx).toBeCloseTo(vz, 5)
    expect(Math.hypot(vx, vz)).toBeCloseTo(DASH_SPEED, 5)
  })

  test('a real dash survives untouched', () => {
    const travel = DASH_SPEED * FRAME
    const { vz } = bodyVelocity({ x: 0, z: 0 }, { x: 0, z: travel }, FRAME)
    expect(vz).toBeCloseTo(DASH_SPEED, 5)
  })

  test('two frames on the same clock do not divide by zero', () => {
    const { vx, vz } = bodyVelocity({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)
    expect(Number.isFinite(vx)).toBe(true)
    expect(Number.isFinite(vz)).toBe(true)
    expect(Math.hypot(vx, vz)).toBeLessThanOrEqual(DASH_SPEED + 1e-9)
  })

  test('standing still is standing still, however long the frame', () => {
    expect(bodyVelocity({ x: 3, z: 4 }, { x: 3, z: 4 }, 2)).toEqual({ vx: 0, vz: 0 })
  })
})

/**
 * The pitch template, checked against the goal rules it exists to serve.
 *
 * These moved here from `domain/lounge/pitch.test.ts`. They assert an
 * *agreement* between a plan the domain draws and the goal geometry this file
 * owns, so they need to see both - and the app side is the side allowed to.
 * What stayed behind in the domain test is everything true of the plan alone:
 * that its blocks are known models, that its goals sit on the grass and inside
 * the wall.
 */
describe("the pitch template's goals", () => {
  const plan = planPitch()

  /** The planner has no ids to give out; the action assigns them on the way in. */
  function withIds(): Goal[] {
    return plan.goals.map((goal, index) => ({ ...goal, id: `g${index}` }))
  }

  test('there is one at each end, assigned to a side', () => {
    expect(goalsReady(withIds())).toBe(true)
    expect(plan.goals).toHaveLength(2)
  })

  test('they come out at the size a hand-placed goal starts at', () => {
    for (const goal of plan.goals) {
      expect(goal.width).toBe(DEFAULT_GOAL_WIDTH)
      expect(goal.height).toBe(DEFAULT_GOAL_HEIGHT)
    }
  })

  test('they face each other down the long axis', () => {
    const [red, blue] = withIds()
    expect(red!.kind).toBe('red')
    expect(blue!.kind).toBe('blue')

    /**
     * Equally far from the middle - which is the middle of cell 0, at 0.5, and
     * not the origin. Mirroring about 0 instead would put one goal a block
     * closer to the centre spot than the other, and every kickoff would favour
     * a side.
     */
    const spot = kickoffSpot(withIds())
    expect(Math.abs(goalCentre(red!).z - spot.z)).toBeCloseTo(
      Math.abs(goalCentre(blue!).z - spot.z),
      5,
    )

    // And far enough apart that it is a pitch rather than a corridor.
    expect(Math.abs(goalCentre(red!).z - goalCentre(blue!).z)).toBeGreaterThan(
      PITCH_WIDTH,
    )
  })

  test('both mouths are centred on the same line', () => {
    const [red, blue] = withIds()
    expect(goalCentre(red!).x).toBeCloseTo(goalCentre(blue!).x, 5)
  })

  test('the ball starts on the centre spot', () => {
    const spot = kickoffSpot(withIds())
    // The middle of an odd-spanned pitch is the middle of cell 0.
    expect(spot.x).toBeCloseTo(0.5, 5)
    expect(spot.z).toBeCloseTo(0.5, 5)
  })

  test('a ball driven straight down the pitch from the spot scores', () => {
    // The claim the whole template rests on: goals, halfway line and kickoff
    // agree about where the middle is, so a shot along the centre line goes in.
    const [red, blue] = withIds()
    const spot = kickoffSpot(withIds())
    const height = { ...spot, y: goalCentre(blue!).y }

    expect(goalCrossed(height, { ...height, z: goalCentre(blue!).z + 2 }, blue!)).toBe(
      true,
    )
    expect(goalCrossed(height, { ...height, z: goalCentre(red!).z - 2 }, red!)).toBe(
      true,
    )
  })
})
