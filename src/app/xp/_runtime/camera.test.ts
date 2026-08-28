import { describe, expect, test } from 'bun:test'
import {
  easedChase,
  facingFrom,
  fixedCamera,
  followSettings,
  lensSettings,
  movementBasis,
  orthoZoom,
  sideCamera,
  sideSettings,
  yawFor,
} from '@/app/xp/_runtime/camera'
import {
  DEFAULT_BEHIND,
  DEFAULT_DISTANCE,
  DEFAULT_FAR,
  DEFAULT_FOV,
  DEFAULT_SPAN,
  type XpCamera,
} from '@kxb/xp'

/**
 * Which way is forward, checked without walking.
 *
 * This is the half of the camera block that can be proved, and it is the half
 * that breaks: a wrong basis does not throw, it makes `W` walk into the screen
 * and `D` walk left, and the person playing concludes the game is broken rather
 * than the camera. The Browser pane never fires a frame, so it is this or
 * finding out from somebody trying to play it.
 */

const FOLLOW: XpCamera = { kind: 'follow' }
const SIDE_X: XpCamera = { kind: 'side', axis: 'x' }
const SIDE_Z: XpCamera = { kind: 'side', axis: 'z' }

describe('a camera behind the body', () => {
  test('forward is where you are looking, unchanged from before the block existed', () => {
    const basis = movementBasis(FOLLOW, { x: 0, z: -1 })
    expect(basis.forwardX).toBeCloseTo(0, 9)
    expect(basis.forwardZ).toBeCloseTo(-1, 9)
  })

  test('right is forward turned a quarter, not forward negated', () => {
    /**
     * `forward × up`, which for a flat forward is `(-z, 0, x)`. The mistake this
     * catches is using `(z, 0, -x)` - the other quarter turn - which swaps `A`
     * and `D` and is invisible in any test that only checks they are opposite.
     */
    const basis = movementBasis(FOLLOW, { x: 0, z: -1 })
    expect(basis.rightX).toBeCloseTo(1, 9)
    expect(basis.rightZ).toBeCloseTo(0, 9)
  })

  test('a look direction of any length gives a unit basis', () => {
    // Otherwise walking speed depends on how the caller happened to scale the
    // vector, which is a bug that only shows up as "movement feels wrong here".
    const basis = movementBasis(FOLLOW, { x: 30, z: 40 })
    expect(Math.hypot(basis.forwardX, basis.forwardZ)).toBeCloseTo(1, 9)
    expect(Math.hypot(basis.rightX, basis.rightZ)).toBeCloseTo(1, 9)
  })

  test('a camera pointing straight at the floor still has a direction', () => {
    // Looking exactly down flattens to a zero-length heading. North is as good
    // an answer as any and better than dividing by zero and walking to NaN.
    const basis = movementBasis(FOLLOW, { x: 0, z: 0 })
    expect(Number.isFinite(basis.forwardX)).toBe(true)
    expect(Math.hypot(basis.forwardX, basis.forwardZ)).toBeCloseTo(1, 9)
  })
})

describe('a camera beside the level', () => {
  test('the mouse cannot change which way D goes', () => {
    /**
     * The whole point of the block. Whatever the camera is looking at - and
     * `PointerLockControls` is still turning it - the basis is nailed to the
     * world axis the level runs along.
     */
    for (const look of [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: -0.7, z: 0.7 }]) {
      expect(movementBasis(SIDE_X, look)).toEqual({
        forwardX: 0,
        forwardZ: 0,
        rightX: 1,
        rightZ: 0,
      })
    }
  })

  test('D goes right on screen, for both axes', () => {
    /**
     * The bug this exists to prevent is a platformer whose `D` walks you left,
     * which is worse than not shipping one. For an `x` level the camera stands
     * off along +z looking back, so screen-right is +x. For a `z` level it
     * stands off along +x, and screen-right is -z.
     */
    expect(movementBasis(SIDE_X, { x: 0, z: -1 })).toMatchObject({ rightX: 1, rightZ: 0 })
    expect(movementBasis(SIDE_Z, { x: 0, z: -1 })).toMatchObject({ rightX: 0, rightZ: -1 })
  })

  test('W and S do nothing, which is a decision rather than an omission', () => {
    /**
     * The alternative is letting them move along the camera's own axis, which
     * walks the player out of the plane the level is built on and behind the
     * scenery. A 2D platformer you can step into the background of is a 2D
     * platformer with an invisible third dimension of bugs.
     */
    const basis = movementBasis(SIDE_X, { x: 0, z: -1 })
    expect(basis.forwardX).toBe(0)
    expect(basis.forwardZ).toBe(0)
  })

  test('the basis is perpendicular to the axis the camera stands off', () => {
    // Stated as a relationship rather than as two literals, so it still holds if
    // the standing-off side is ever flipped.
    for (const camera of [SIDE_X, SIDE_Z]) {
      const basis = movementBasis(camera, { x: 0, z: -1 })
      const { position, target } = sideCamera(camera, { x: 0, y: 0, z: 0 })
      const offX = position.x - target.x
      const offZ = position.z - target.z
      // Dot product of "which way the camera looks" and "which way D walks".
      expect(basis.rightX * offX + basis.rightZ * offZ).toBeCloseTo(0, 9)
    }
  })
})

describe('where a side-on camera stands', () => {
  test('off the other axis, at the distance the document asked for', () => {
    const at = { x: 5, y: 3, z: -2 }
    expect(sideCamera({ kind: 'side', axis: 'x', distance: 30 }, at).position).toEqual({
      x: 5,
      y: 3,
      z: 28,
    })
    expect(sideCamera({ kind: 'side', axis: 'z', distance: 30 }, at).position).toEqual({
      x: 35,
      y: 3,
      z: -2,
    })
  })

  test('level with the player, never above', () => {
    /**
     * A platformer's camera is a window that slides. Any tilt turns the flat
     * plane the level is built on into a shallow perspective, and two platforms
     * at the same height stop looking like it - which is the one thing somebody
     * lining up a jump is reading.
     */
    const at = { x: 5, y: 3, z: -2 }
    const { position, target } = sideCamera(SIDE_X, at)
    expect(position.y).toBe(at.y)
    expect(target.y).toBe(at.y)
  })

  test('and it looks straight through the player', () => {
    const at = { x: 5, y: 3, z: -2 }
    expect(sideCamera(SIDE_X, at).target).toEqual(at)
  })

  test('a bare side camera uses the defaults rather than sitting at the origin', () => {
    expect(sideSettings({ kind: 'side' })).toEqual({
      axis: 'x',
      distance: DEFAULT_DISTANCE,
      span: DEFAULT_SPAN,
    })
    expect(sideCamera({ kind: 'side' }, { x: 0, y: 0, z: 0 }).position.z).toBe(DEFAULT_DISTANCE)
  })
})

describe('framing', () => {
  test('the zoom frames exactly the span the document asked for', () => {
    // R3F builds an orthographic frustum in pixels, so zoom is pixels per world
    // unit: 800 pixels of canvas showing 20 cells is 40 pixels a cell.
    expect(orthoZoom({ kind: 'side', span: 20 }, 800)).toBe(40)
  })

  test('height decides the framing, so width follows the window', () => {
    /**
     * Worth pinning because it is what a level author has to know: a wide screen
     * shows *more* of the level across and exactly the same amount up. A phone
     * shows less across, not less up. Lay the legs out to fit the span
     * vertically and it frames on anything.
     */
    const camera: XpCamera = { kind: 'side', span: 20 }
    expect(orthoZoom(camera, 800)).toBe(orthoZoom(camera, 800))
    expect(orthoZoom(camera, 400)).toBe(orthoZoom(camera, 800) / 2)
  })

  test('a canvas with no height yet does not divide the world by zero', () => {
    // Happens for a frame during layout, and a NaN zoom is a black screen with
    // no error in it.
    expect(Number.isFinite(orthoZoom({ kind: 'side' }, 0))).toBe(true)
  })
})

describe('which way a spawn faces', () => {
  /** Three's camera looks down -z; this is what a yaw about Y does to that. */
  const forward = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })

  test('a facing of 90 points along +x, the way a mark at 90 does', () => {
    /**
     * The bug this file's `yawFor` exists for, and it is worth stating as the
     * symptom: `ladder-run` spawns at `facing: 90` and its course runs along
     * +x, and the camera was looking along **-x**. Three solid cells in front,
     * the whole level behind, and a black screen on load.
     *
     * The document's convention is the mark's - `marks.tsx` turns a frame about
     * Y so its local +z becomes `(sin θ, 0, cos θ)`, `race.ts` crosses that
     * plane along the same normal, `spawn.ts` lays arrivals out against it.
     * Three's camera looks down -z, so a bare `rotation.y = θ` is the exact
     * opposite every time.
     */
    const at90 = forward(yawFor(90))
    expect(at90.x).toBeCloseTo(1, 6)
    expect(at90.z).toBeCloseTo(0, 6)

    const at0 = forward(yawFor(0))
    expect(at0.z).toBeCloseTo(1, 6)
  })

  test('and it round-trips through the heading the controller reports', () => {
    /**
     * The half that makes this provable rather than asserted. `track` reports
     * `atan2(forward.x, forward.z)` - which was *already* the document's
     * convention, and is why nothing downstream was wrong and the bug survived:
     * the body, the wire and every peer's rotation always agreed. Only the line
     * that placed the camera disagreed.
     *
     * Testing the pair against each other is the only way to catch a convention
     * that is consistently wrong, because every individual piece looks right.
     */
    for (const facing of [0, 45, 90, 180, 270, 359]) {
      const f = forward(yawFor(facing))
      expect((facingFrom(f.x, f.z) + 360) % 360).toBeCloseTo(facing % 360, 4)
    }
  })
})

/**
 * A camera nailed to one spot.
 *
 * Two shots in one kind, and the difference is whether the document typed any
 * angles: absent watches the player, given stares. Both are tested against a
 * *target* rather than a rotation, because that is what this returns - see the
 * note in `fixedCamera` about the 180-degree trap it therefore avoids.
 */
describe('a fixed camera', () => {
  const AT = { x: 2, y: 1.7, z: -3 }

  test('stands exactly where the document put it', () => {
    const { position } = fixedCamera({ kind: 'fixed', x: 10, y: 8, z: -4 }, AT)
    expect(position).toEqual({ x: 10, y: 8, z: -4 })
  })

  test('with no angles it watches the player, which is the shot it is for', () => {
    const { target } = fixedCamera({ kind: 'fixed', x: 10, y: 8, z: -4 }, AT)
    expect(target).toEqual(AT)
  })

  test('and follows them, rather than being aimed once at where they started', () => {
    const camera: XpCamera = { kind: 'fixed', x: 10, y: 8, z: -4 }
    const first = fixedCamera(camera, { x: 0, y: 1.7, z: 0 })
    const later = fixedCamera(camera, { x: 9, y: 1.7, z: 6 })
    expect(first.target).not.toEqual(later.target)
    expect(later.target).toEqual({ x: 9, y: 1.7, z: 6 })
  })

  test('given both angles it stares that way instead', () => {
    // Yaw zero is +z, the document's own convention - the same one a mark's
    // `facing` uses, so a camera and a spawn pointing "the same way" agree.
    const { position, target } = fixedCamera(
      { kind: 'fixed', x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      AT,
    )
    expect(position).toEqual({ x: 0, y: 0, z: 0 })
    expect(target.z).toBeCloseTo(1, 6)
    expect(target.x).toBeCloseTo(0, 6)
    expect(target.y).toBeCloseTo(0, 6)
  })

  test('and a quarter turn looks along +x, not -x', () => {
    // The direction the mark convention gives. Getting this backwards is the
    // bug that opened `ladder-run` on a black screen, one file over.
    const { target } = fixedCamera({ kind: 'fixed', x: 0, y: 0, z: 0, yaw: 90, pitch: 0 }, AT)
    expect(target.x).toBeCloseTo(1, 6)
    expect(target.z).toBeCloseTo(0, 6)
  })

  test('pitch is positive upwards, the way anybody says it out loud', () => {
    const up = fixedCamera({ kind: 'fixed', x: 0, y: 0, z: 0, yaw: 0, pitch: 45 }, AT)
    expect(up.target.y).toBeGreaterThan(0)
    const down = fixedCamera({ kind: 'fixed', x: 0, y: 0, z: 0, yaw: 0, pitch: -45 }, AT)
    expect(down.target.y).toBeLessThan(0)
  })

  test('with no anchor its keys read as a follow camera\'s do', () => {
    // The fallback, and it is the honest one: a caller with no document to hand
    // - the course pilot - has no spot the shot was framed for, and the camera's
    // own heading is the only reading there is.
    const look = { x: 0, z: -1 }
    expect(movementBasis({ kind: 'fixed', x: 1, y: 2, z: 3 }, look)).toEqual(
      movementBasis({ kind: 'follow' }, look),
    )
  })

  /**
   * The bug this pair exists for, in the words it was reported in: *"when you go
   * on the edge of the gamefield, the controls rotate you"*.
   *
   * A watching camera's heading is the line to whoever it is watching, so read
   * as a basis it turns every time they take a step - and swings through a half
   * turn as they pass underneath it, which is exactly what the outside of a
   * board is. The anchor is the fix: the shot's heading, not the lens's.
   */
  test('anchored, the keys do not turn as the player walks', () => {
    // Mensch's blue chair: the lens four cells out on the floor and seventeen
    // up, so a step sideways used to be a visible swing.
    const camera: XpCamera = { kind: 'fixed', x: 0, y: 19, z: 17 }
    const seat = { x: 0, y: 1, z: 12.8 }
    const atSeat = movementBasis(camera, { x: 0, z: -1 }, seat)
    // Where they have walked to - and what the lens is now looking along, which
    // is what this used to be handed.
    const away = movementBasis(camera, { x: -12, z: -5 }, seat)
    expect(away).toEqual(atSeat)
    expect(atSeat.forwardZ).toBeCloseTo(-1, 9)
    expect(atSeat.forwardX).toBeCloseTo(0, 9)
  })

  test('and every seat gets the basis its own chair sees', () => {
    // The whole of what `camera.seats` is for: green sits a quarter turn round
    // the table, so green's `W` goes towards the board along -x rather than -z.
    const green = movementBasis({ kind: 'fixed', x: 17, y: 19, z: 0 }, { x: 0, z: -1 }, {
      x: 12.8,
      y: 1,
      z: 0,
    })
    expect(green.forwardX).toBeCloseTo(-1, 9)
    expect(green.forwardZ).toBeCloseTo(0, 9)
  })

  /**
   * The third aim, and the one a table needs.
   *
   * `mensch`'s four chairs all look at the middle of the board, which is a thing
   * a `yaw` cannot say - blue's chair and green's are a quarter turn apart and
   * name the same spot. So the document names the *spot*, and every seat gets it.
   */
  test('aimed at a spot it stares there, whoever is playing and wherever they walk', () => {
    // Blue's chair, as the document has it.
    const chair: XpCamera = { kind: 'fixed', x: 0, y: 22, z: 20, at: { x: 0, y: 1, z: 0 } }

    const sat = fixedCamera(chair, { x: 0, y: 2.7, z: 12.8 })
    // The far side of the board, and past the lens on the way - the two places
    // that used to swing the shot forty-five degrees and a half turn.
    const walked = fixedCamera(chair, { x: 9, y: 2.7, z: -14 })
    expect(sat).toEqual(walked)
    expect(sat.target).toEqual({ x: 0, y: 1, z: 0 })
  })

  test('and its keys are that same line, so they do not turn either', () => {
    const chair: XpCamera = { kind: 'fixed', x: 0, y: 22, z: 20, at: { x: 0, y: 1, z: 0 } }
    // The anchor is beside the point once a spot is named, which is worth
    // pinning: both of these have to be the walk towards the middle.
    const sat = movementBasis(chair, { x: 0, z: -1 }, { x: 0, y: 1, z: 12.8 })
    const walked = movementBasis(chair, { x: 1, z: 0.6 }, { x: 9, y: 1, z: -14 })
    expect(sat).toEqual(walked)
    expect(sat.forwardZ).toBeCloseTo(-1, 9)

    // And green, a quarter turn round the table, walks at the middle along -x.
    const green: XpCamera = { kind: 'fixed', x: 20, y: 22, z: 0, at: { x: 0, y: 1, z: 0 } }
    expect(movementBasis(green, { x: 0, z: -1 }).forwardX).toBeCloseTo(-1, 9)
  })

  test('a document that aimed its camera keeps the aim, anchor or no anchor', () => {
    // The stare is the shot, so the anchor must not overrule it - which is why
    // this goes through `fixedCamera` rather than subtracting two spots here.
    const staring: XpCamera = { kind: 'fixed', x: 0, y: 8, z: 0, yaw: 90, pitch: -30 }
    const basis = movementBasis(staring, { x: 0, z: -1 }, { x: -5, y: 1, z: 0 })
    expect(basis.forwardX).toBeCloseTo(1, 6)
    expect(basis.forwardZ).toBeCloseTo(0, 6)
  })
})

/**
 * The three numbers that frame a chase camera, and the two that describe a lens.
 *
 * Absent has to be exactly what every document already had, or the format
 * change reframes every level ever built.
 */
describe('what a document leaves out', () => {
  test('an unframed follow camera is the four metres it always was', () => {
    expect(followSettings({ kind: 'follow' })).toEqual({
      behind: DEFAULT_BEHIND,
      above: 0,
      beside: 0,
    })
  })

  test('and what it does say is what comes back', () => {
    expect(followSettings({ kind: 'follow', behind: 6, above: 2, beside: -0.8 })).toEqual({
      behind: 6,
      above: 2,
      beside: -0.8,
    })
  })

  test('the lens falls back to the two the scene used to hardcode', () => {
    expect(lensSettings({ kind: 'follow' })).toEqual({ fov: DEFAULT_FOV, far: DEFAULT_FAR })
    expect(lensSettings({ kind: 'follow', fov: 50, far: 250 })).toEqual({ fov: 50, far: 250 })
  })

  test('a side camera has a far plane and no lens to be wide', () => {
    // `fov` is refused on `side` by the parser, so absent is the only value it
    // can have there - and three ignores it on an orthographic camera anyway.
    expect(lensSettings({ kind: 'side', far: 600 }).far).toBe(600)
  })
})

/**
 * The camera that stopped flickering when you walk sideways.
 *
 * `chaseDistance` casts one ray straight back and answers where it stops, which
 * is correct and unusable raw: strafing past a crate sweeps that ray on and off
 * the geometry, the number alternates between four cells and one, and the
 * camera snaps back and forth once a frame. Reported as *it jitters a bit when
 * you strafe*.
 */
describe('how far back the chase camera actually sits', () => {
  test('coming in is instant, because a frame outside a wall is a frame of wall', () => {
    // No easing on the way in, at any frame length. This is the assertion that
    // says the fix did not trade a jitter for a clip.
    expect(easedChase(4, 1, 1 / 60)).toBe(1)
    expect(easedChase(4, 1, 10)).toBe(1)
    expect(easedChase(4, 0, 1 / 240)).toBe(0)
  })

  test('going out is eased, so a ray that keeps losing a post reads as a drift', () => {
    const after = easedChase(1, 4, 1 / 60)
    expect(after).toBeGreaterThan(1)
    expect(after).toBeLessThan(4)
  })

  test('and it gets there, rather than easing towards it for ever', () => {
    const march = (frames: number) => {
      let held = 1
      for (let frame = 0; frame < frames; frame++) held = easedChase(held, 4, 1 / 60)
      return held
    }
    /*
     * The measured curve, which is not the one the first comment claimed.
     *
     * `CHASE_EASE` is a rate, so this is an exponential. From one cell towards
     * four: about seven tenths of the gap closed in a fifth of a second, and
     * about nineteen twentieths in half. The note beside the constant says those
     * numbers because this test is where they came from.
     */
    expect(march(12)).toBeGreaterThan(3)
    expect(march(30)).toBeGreaterThan(3.85)
  })

  /**
   * The property that makes this frame-rate independent, and the reason it is a
   * fraction of the gap per *second* rather than a step per frame.
   *
   * A constant step per frame is a camera that moves twice as fast on a machine
   * drawing twice as often - which is the class of bug that only shows up on
   * somebody else's laptop.
   */
  test('the same walk looks the same at thirty frames and at a hundred and forty-four', () => {
    const march = (frames: number, delta: number) => {
      let held = 1
      for (let frame = 0; frame < frames; frame++) held = easedChase(held, 4, delta)
      return held
    }
    // Half a second, three ways.
    expect(march(15, 1 / 30)).toBeCloseTo(march(72, 1 / 144), 1)
    expect(march(30, 1 / 60)).toBeCloseTo(march(72, 1 / 144), 1)
  })

  test('a frame so long it would overshoot arrives instead', () => {
    // The clamp. Without it a backgrounded tab's one enormous delta sends the
    // camera past the wall it was easing towards.
    expect(easedChase(1, 4, 10)).toBe(4)
  })

  test('nothing to do is nothing done', () => {
    expect(easedChase(4, 4, 1 / 60)).toBe(4)
  })
})
