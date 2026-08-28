import { describe, expect, test } from 'bun:test'
import {
  CAMERA_KINDS,
  cameraFor,
  cameraOf,
  cameraProblems,
  DEFAULT_CAMERA,
  describeCameraKind,
  isCameraKind,
  isDefaultCamera,
  type XpCamera,
} from './camera'
import { parseXp, XP_FORMAT } from '../document/format'

/**
 * Where the world is watched from.
 *
 * Mostly about refusal, like ./capabilities.test.ts and ./rules.test.ts, and for
 * one extra reason here: three of the four fields mean nothing without the
 * fourth, and a setting that does nothing is the thing this project keeps
 * deciding not to ship.
 */

function doc(overrides: Record<string, unknown> = {}) {
  return {
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  }
}

const problemsOf = (raw: unknown) => {
  const result = parseXp(raw)
  return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
}

describe('the vocabulary', () => {
  test('three kinds, each with a line explaining it', () => {
    expect([...CAMERA_KINDS]).toEqual(['follow', 'side', 'fixed'])
    for (const kind of CAMERA_KINDS) expect(describeCameraKind(kind).length).toBeGreaterThan(10)
  })

  test('an invented kind is not one', () => {
    expect(isCameraKind('side')).toBe(true)
    expect(isCameraKind('fixed')).toBe(true)
    expect(isCameraKind('isometric')).toBe(false)
  })
})

describe('a setting that would do nothing is refused', () => {
  test('a field belonging to another kind is refused, and told where it belongs', () => {
    /**
     * The whole reason this check exists, and it is not strictness for its own
     * sake: a setting that does nothing is a setting an author believes in.
     *
     * The refusal names the kind the field *does* belong to, because "span does
     * nothing here" leaves somebody guessing and "span is a side camera's" does
     * not - and a camera whose kind was changed half way through is exactly how
     * a stray field gets left behind.
     */
    expect(cameraProblems({ kind: 'follow', span: 12 })).toEqual([
      '"span" only means something for a side camera',
    ])
    expect(cameraProblems({ kind: 'follow', axis: 'x', distance: 4, span: 12 })).toHaveLength(3)
    // A field on two kinds says both, rather than picking one.
    expect(cameraProblems({ kind: 'side', fov: 60 })).toEqual([
      '"fov" only means something for a follow or fixed camera',
    ])
  })

  test('the default check is a sweep now, and the comment says why', () => {
    /**
     * This used to be provable: nothing could sit beside `follow`, so "is this
     * the default" was "is it `follow`". A shoulder offset is a real thing to
     * want on a follow camera, so that guarantee is gone - and the test below
     * is what replaces it rather than a claim that it still holds.
     */
    expect(isDefaultCamera(DEFAULT_CAMERA)).toBe(true)
    expect(isDefaultCamera({ kind: 'follow' })).toBe(true)
    expect(isDefaultCamera({ kind: 'side' })).toBe(false)
    // The case the old one-liner would have got wrong.
    expect(isDefaultCamera({ kind: 'follow', beside: 1.2 })).toBe(false)
    expect(isDefaultCamera({ kind: 'follow', far: 900 })).toBe(false)
  })

  test('a camera standing nowhere, or inside the player, is refused', () => {
    // Zero puts it inside the body looking at the inside of a face; negative
    // puts it behind the level looking away from it.
    expect(cameraProblems({ kind: 'side', distance: 0 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'side', distance: -8 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'side', distance: 24 })).toEqual([])
  })

  test('a span of zero would divide by nothing, and a huge one is orbit', () => {
    expect(cameraProblems({ kind: 'side', span: 0 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'side', span: 9_000 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'side', span: 20 })).toEqual([])
  })

  test('a bare side camera is fine, because every field has a default', () => {
    expect(cameraProblems({ kind: 'side' })).toEqual([])
  })
})

describe('reading it off a document', () => {
  test('a document with no camera block is follow, not broken', () => {
    const parsed = parseXp(doc())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(cameraOf(parsed.document)).toEqual({ kind: 'follow' })
  })

  test('and does not grow one when somebody opens and saves it', () => {
    // The editor writes the parsed document straight back out, so materialising
    // the default would put a block into every file anybody opened.
    const parsed = parseXp(doc())
    if (!parsed.ok) return
    expect(parsed.document.camera).toBeUndefined()
    expect('camera' in parsed.document).toBe(false)
  })

  test('what a side-on document says is what comes back', () => {
    const parsed = parseXp(
      doc({ camera: { kind: 'side', axis: 'z', distance: 30, span: 16 } }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.camera).toEqual({ kind: 'side', axis: 'z', distance: 30, span: 16 })
  })

  test('a kind this build has never heard of is refused, not ignored', () => {
    expect(problemsOf(doc({ camera: { kind: 'isometric' } }))).toEqual([
      `camera.kind: must be one of ${CAMERA_KINDS.join(', ')}`,
    ])
  })

  test('an axis that is not an axis says so', () => {
    expect(problemsOf(doc({ camera: { kind: 'side', axis: 'y' } }))).toEqual([
      'camera.axis: must be one of x, z',
    ])
  })

  test('a follow camera carrying side-on settings is refused by the author', () => {
    // In the editor, at save, rather than by a player wondering why the span
    // they set does nothing.
    expect(problemsOf(doc({ camera: { kind: 'follow', span: 12 } }))).toEqual([
      'camera: "span" only means something for a side camera',
    ])
  })

  /**
   * The read side of the same trap, and it has caught a real one before.
   *
   * `respawn` was added to `XpRules`, validated, accepted by the editor, and
   * **silently dropped by the parser**, which read the other numbers by hand and
   * had never heard of it. The sweep above guards whether a field survives a
   * *save*; this guards whether it survives being read back at all.
   */
  test('every field survives the parser, not just the type', () => {
    for (const camera of [
      { kind: 'fixed', x: 10, y: 8, z: -4, yaw: 90, pitch: -20, fov: 60, far: 900 },
      { kind: 'follow', behind: 6, above: 2, beside: 1.5, fov: 50, far: 250 },
      { kind: 'side', axis: 'z', distance: 30, span: 16, far: 600 },
    ] as const) {
      const parsed = parseXp(doc({ camera }))
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) continue
      expect(parsed.document.camera).toEqual(camera)
    }
  })

  test('a fixed camera missing a coordinate is refused by its author', () => {
    // In the editor, at save, rather than by a player looking at the inside of
    // the floor - which is where the origin is in most levels.
    expect(problemsOf(doc({ camera: { kind: 'fixed', x: 1, z: 2 } }))).toEqual([
      'camera: a fixed camera needs x, y and z - there is nowhere sensible to default it to',
    ])
  })

  test('every optional field is accounted for, so the next one is not forgotten', () => {
    /**
     * The same sweep `rules.test.ts` has. `cameraProblems` makes the current
     * check provable, but a field added later that *does* apply to `follow`
     * would reopen exactly the hole `isDefaultRules` fell into - so this fails
     * if one arrives without `isDefaultCamera` learning about it.
     */
    const everything: Required<XpCamera> = {
      kind: 'side',
      axis: 'z',
      distance: 30,
      span: 16,
      x: 4,
      y: 6,
      z: 8,
      // Neither of these two is a number like the rest of them, which is the
      // case this sweep is most likely to be forgotten for.
      at: { x: 0, y: 1, z: 0 },
      seats: { blue: { x: 1, y: 2, z: 3 } },
      yaw: 90,
      pitch: -20,
      behind: 6,
      above: 2,
      beside: 1.5,
      fov: 60,
      far: 900,
    }
    for (const key of Object.keys(everything) as (keyof XpCamera)[]) {
      if (key === 'kind') continue
      const camera = { kind: 'follow', [key]: everything[key] } as XpCamera
      // Either it is refused outright, or it must not count as the default.
      expect(cameraProblems(camera).length > 0 || !isDefaultCamera(camera)).toBe(true)
    }
  })
})

/**
 * A camera nailed to one spot, which is the third kind.
 *
 * The interesting half is what *absent* means: a fixed camera with no angles
 * watches the player, which is the shot somebody actually wants when they put a
 * camera in the corner of a room.
 */
describe('a fixed camera', () => {
  const AT = { kind: 'fixed', x: 10, y: 8, z: -4 } as const

  test('needs somewhere to stand, and there is no sensible default', () => {
    expect(cameraProblems({ kind: 'fixed' })).toHaveLength(1)
    // Two of three is the typo this catches - the origin is inside the floor of
    // most levels, so a partly-placed camera would read as a level that failed.
    expect(cameraProblems({ kind: 'fixed', x: 1, y: 2 })).toHaveLength(1)
    expect(cameraProblems(AT)).toEqual([])
  })

  test('aimed or watching, but never half of each', () => {
    expect(cameraProblems({ ...AT, yaw: 90, pitch: -15 })).toEqual([])
    expect(cameraProblems({ ...AT, yaw: 90 })).toHaveLength(1)
    expect(cameraProblems({ ...AT, pitch: -15 })).toHaveLength(1)
  })

  test('and a pitch past straight up or down is a typo', () => {
    expect(cameraProblems({ ...AT, yaw: 0, pitch: -90 })).toEqual([])
    expect(cameraProblems({ ...AT, yaw: 0, pitch: 91 })).toHaveLength(1)
  })

  test('side-on settings do not belong on one', () => {
    expect(cameraProblems({ ...AT, span: 20 })).toHaveLength(1)
  })
})

/**
 * The three numbers that turn the chase camera into a shot.
 *
 * Absent is what every document has today, which is the only thing that must
 * not change: a level that says nothing is framed exactly as it always was.
 */
describe('framing a follow camera', () => {
  test('a shoulder camera is three optional numbers', () => {
    expect(cameraProblems({ kind: 'follow', behind: 3, above: 1.5, beside: 0.8 })).toEqual([])
  })

  test('negative is allowed beside and above, because both are shots', () => {
    // A left-shoulder camera and a low angle are things people compose on
    // purpose, unlike a camera in front of the body.
    expect(cameraProblems({ kind: 'follow', beside: -0.8, above: -1 })).toEqual([])
  })

  test('but not behind, where zero is first person by accident', () => {
    // There is a `view` toggle for first person and it is not a document field.
    expect(cameraProblems({ kind: 'follow', behind: 0 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'follow', behind: -4 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'follow', behind: 999 })).toHaveLength(1)
  })

  test('the lens and the far plane are bounded at both ends', () => {
    expect(cameraProblems({ kind: 'follow', fov: 60, far: 900 })).toEqual([])
    expect(cameraProblems({ kind: 'follow', fov: 5 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'follow', fov: 200 })).toHaveLength(1)
    // A far plane shorter than the level draws the fog running out in mid-air.
    expect(cameraProblems({ kind: 'follow', far: 4 })).toHaveLength(1)
    expect(cameraProblems({ kind: 'follow', far: 99_999 })).toHaveLength(1)
  })

  test('and a side camera keeps its far plane, having no lens', () => {
    expect(cameraProblems({ kind: 'side', far: 600 })).toEqual([])
  })
})

describe('a chair per side', () => {
  const table = {
    kind: 'fixed',
    x: 0,
    y: 19,
    z: 17,
    seats: { blue: { x: 0, y: 19, z: 17 }, red: { x: 0, y: 19, z: -17 } },
  } as const

  test('a player on a side stands at their own seat', () => {
    expect(cameraFor(table, 'red')).toMatchObject({ x: 0, y: 19, z: -17 })
  })

  test('and everything else about the shot is still the document says', () => {
    // A seat is *where you sit*. The lens, the far plane and whether it stares
    // or watches you are about the level, not the chair.
    const aimed = { ...table, fov: 50, far: 200 }
    expect(cameraFor(aimed, 'red')).toMatchObject({ kind: 'fixed', fov: 50, far: 200 })
  })

  test('a side with no chair sits where the block says, not at the origin', () => {
    // The failure worth refusing: a table that added a fourth colour and forgot
    // its seat would otherwise put that player inside the floor.
    expect(cameraFor(table, 'green')).toMatchObject({ x: 0, y: 19, z: 17 })
  })

  test('and so does a player on no side at all', () => {
    expect(cameraFor(table, undefined)).toMatchObject({ x: 0, y: 19, z: 17 })
  })

  test('a camera that is not fixed has no chairs to sit in', () => {
    // `seats` is refused on the other two kinds anyway - this is the guard that
    // means the resolver cannot quietly move a follow camera if one gets in.
    const follow = { kind: 'follow', seats: { red: { x: 9, y: 9, z: 9 } } } as const
    expect(cameraFor(follow, 'red')).toBe(follow)
  })

  test('and a document that puts chairs on one is told which kind they belong to', () => {
    expect(cameraProblems({ kind: 'follow', seats: { red: { x: 1, y: 2, z: 3 } } })).toEqual([
      '"seats" only means something for a fixed camera',
    ])
  })

  /**
   * And every chair looks at the same place, which is the point of `at`.
   *
   * A `yaw` cannot say it: blue's chair and green's are a quarter turn apart and
   * would need different angles to name one middle, while the block has a single
   * `yaw` for the whole document. So the field is a *spot*, shared by every seat
   * for free - which is what makes it one field rather than four.
   */
  test('one spot seats the whole table, which is what an angle could not do', () => {
    const staring = { ...table, at: { x: 0, y: 1, z: 0 } } as const
    for (const team of ['blue', 'red', 'green', undefined] as const) {
      expect(cameraFor(staring, team).at).toEqual({ x: 0, y: 1, z: 0 })
    }
  })

  test('a spot and an angle are two answers, so a document may only give one', () => {
    expect(
      cameraProblems({ kind: 'fixed', x: 0, y: 1, z: 0, at: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }),
    ).toEqual(['a camera looks at "at" or along yaw/pitch, not both - drop one of them'])
  })

  test('and it belongs to a fixed camera, like the chairs it exists for', () => {
    expect(cameraProblems({ kind: 'follow', at: { x: 0, y: 1, z: 0 } })).toEqual([
      '"at" only means something for a fixed camera',
    ])
  })
})
