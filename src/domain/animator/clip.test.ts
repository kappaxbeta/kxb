import { describe, expect, test } from 'bun:test'
import {
  type AnimationDoc,
  type Pose,
  type Quat,
  bake,
  emptyDoc,
  keyAt,
  moveKey,
  parseAnyDoc,
  parseDoc,
  putKey,
  removeKey,
  rootMoves,
  samplePose,
  setDuration,
  setEase,
  setFps,
  slerp,
  snapTime,
  trimPose,
} from '@/domain/animator/clip'
import { ALL_SPECS, groupsIn, isPartial } from '@/domain/animator/rig'

const REST: Pose = {
  root: [0, 0, 0],
  bones: { hips: [0, 0, 0, 1], 'lowerarm.r': [0, 0, 0, 1], head: [0, 0, 0, 1] },
}

/** A quarter turn about Y, as a quaternion. */
const TURNED: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2]

const posed = (patch: Record<string, Quat> = {}, root: Pose['root'] = [0, 0, 0]): Pose => ({
  root,
  bones: { ...REST.bones, ...patch },
})

describe('keys', () => {
  test('a new document has one key holding the rest pose', () => {
    const doc = emptyDoc(REST)
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].time).toBe(0)
    expect(doc.keys[0].pose).toEqual(REST)
  })

  test('the pose is copied in, not referenced', () => {
    const rest = posed()
    const doc = putKey(emptyDoc(REST), 1, rest)
    rest.bones.head = TURNED
    expect(doc.keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('keying the same frame twice replaces rather than stacks', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = putKey(doc, 1, posed({ head: [0, 0, 0, 1] }))
    expect(doc.keys).toHaveLength(2)
    expect(doc.keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('re-keying a frame keeps the ease that was already on it', () => {
    let doc = putKey(emptyDoc(REST), 1, posed())
    doc = setEase(doc, 1, 'hold')
    doc = putKey(doc, 1, posed({ head: TURNED }))
    expect(doc.keys[1].ease).toBe('hold')
  })

  test('keys stay sorted however they are added', () => {
    let doc = emptyDoc(REST)
    for (const time of [2, 0.5, 1.25]) doc = putKey(doc, time, posed())
    expect(doc.keys.map((key) => key.time)).toEqual([0, 0.5, 1.25, 2])
  })

  test('a key past the end lengthens the clip', () => {
    const doc = putKey(emptyDoc(REST), 5, posed())
    expect(doc.duration).toBe(5)
  })

  test('times land on frame boundaries', () => {
    const doc = putKey(emptyDoc(REST), 1.011, posed())
    // 24fps: the nearest frame to 1.011s is frame 24, which is 1s exactly.
    expect(doc.keys[1].time).toBe(1)
    expect(snapTime(1.011, 24)).toBe(1)
  })

  test('the last key cannot be deleted', () => {
    const doc = removeKey(emptyDoc(REST), 0)
    expect(doc.keys).toHaveLength(1)
  })

  test('deleting takes the key on that frame', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = removeKey(doc, 1)
    expect(doc.keys.map((key) => key.time)).toEqual([0])
  })

  test('a key dragged onto another takes its place', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = moveKey(doc, 1, 0)
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].pose.bones.head).toEqual(TURNED)
  })

  test('a key dragged to a free frame keeps its pose and re-sorts', () => {
    let doc = putKey(emptyDoc(REST), 0.5, posed({ head: TURNED }))
    doc = putKey(doc, 1, posed())
    doc = moveKey(doc, 0.5, 1.5)
    expect(doc.keys.map((key) => key.time)).toEqual([0, 1, 1.5])
    expect(doc.keys[2].pose.bones.head).toEqual(TURNED)
  })

  test('keyAt is frame-exact rather than nearest', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    expect(keyAt(doc, 1)).toBe(1)
    expect(keyAt(doc, 1 + 1 / 24)).toBe(-1)
  })
})

describe('the grid', () => {
  test('changing the frame rate keeps the timing in seconds', () => {
    let doc = putKey(emptyDoc(REST), 1, posed())
    doc = setFps(doc, 12)
    expect(doc.fps).toBe(12)
    expect(doc.keys.map((key) => key.time)).toEqual([0, 1])
  })

  test('two keys that collide on a coarser grid become one', () => {
    let doc = emptyDoc(REST)
    doc = putKey(doc, 1 / 24, posed({ head: TURNED }))
    doc = setFps(doc, 6)
    // A 24fps frame 1 is 0.0417s, which on a 6fps grid is frame 0 - where the
    // key at zero already is. The last one written wins.
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].pose.bones.head).toEqual(TURNED)
  })

  test('shortening the clip keeps the keys past the end', () => {
    let doc = putKey(emptyDoc(REST), 3, posed())
    doc = setDuration(doc, 1)
    expect(doc.duration).toBe(1)
    expect(doc.keys).toHaveLength(2)
  })
})

describe('sampling', () => {
  test('holds before the first key and after the last', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    expect(samplePose(doc, -5).bones.head).toEqual([0, 0, 0, 1])
    expect(samplePose(doc, 99).bones.head).toEqual(TURNED)
  })

  test('a linear blend is halfway at the midpoint', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = setEase(doc, 0, 'linear')
    const half = samplePose(doc, 0.5).bones.head
    // Half of a quarter turn about Y is an eighth of a turn: 22.5 degrees.
    const angle = 2 * Math.acos(half[3])
    expect(angle).toBeCloseTo(Math.PI / 4, 5)
  })

  test('a hold does not move until the next key', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = setEase(doc, 0, 'hold')
    expect(samplePose(doc, 0.99).bones.head).toEqual([0, 0, 0, 1])
    expect(samplePose(doc, 1).bones.head).toEqual(TURNED)
  })

  test('a smooth ease is still halfway at the midpoint but slower at the ends', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    const at = (time: number) => 2 * Math.acos(samplePose(doc, time).bones.head[3])
    expect(at(0.5)).toBeCloseTo(Math.PI / 4, 5)
    expect(at(0.1)).toBeLessThan(at(0.5) * 0.2)
  })

  test('the root position interpolates', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({}, [0, 2, 0]))
    doc = setEase(doc, 0, 'linear')
    expect(samplePose(doc, 0.5).root[1]).toBeCloseTo(1, 6)
  })

  test('a bone missing from a key falls back to the rest pose', () => {
    const doc: AnimationDoc = {
      ...emptyDoc(REST),
      keys: [{ time: 0, ease: 'linear', pose: { root: [0, 0, 0], bones: {} } }],
    }
    expect(samplePose(doc, 0, REST).bones.head).toEqual([0, 0, 0, 1])
  })
})

describe('slerp', () => {
  test('takes the short way round', () => {
    // q and -q are the same rotation. Blending towards the negated copy must
    // not go the long way about.
    const negated: Quat = [-TURNED[0], -TURNED[1], -TURNED[2], -TURNED[3]]
    const half = slerp([0, 0, 0, 1], negated, 0.5)
    expect(2 * Math.acos(Math.abs(half[3]))).toBeCloseTo(Math.PI / 4, 5)
  })

  test('stays unit length for nearly identical rotations', () => {
    const nudged: Quat = [0, 0.0001, 0, Math.sqrt(1 - 0.0001 ** 2)]
    const half = slerp([0, 0, 0, 1], nudged, 0.5)
    expect(Math.hypot(...half)).toBeCloseTo(1, 9)
  })
})

describe('baking', () => {
  test('produces one sample per frame, inclusive of the end', () => {
    const doc = setDuration(emptyDoc(REST), 1)
    const baked = bake(doc, REST)
    expect(baked.times).toHaveLength(25)
    expect(baked.times[24]).toBe(1)
  })

  test('drops bones that never move', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    const baked = bake(doc, REST)
    expect(Object.keys(baked.bones)).toEqual(['head'])
  })

  test('a smooth ease survives as samples', () => {
    const doc = putKey(setDuration(emptyDoc(REST), 1), 1, posed({ head: TURNED }))
    const baked = bake(doc, REST)
    const w = (frame: number) => baked.bones.head[frame * 4 + 3]
    // Frame 2 of 24 has barely left the first key; a linear blend would be a
    // twelfth of the way there already.
    expect(2 * Math.acos(w(2))).toBeLessThan((Math.PI / 2) * (2 / 24))
  })

  test('a still root is reported as still', () => {
    expect(rootMoves(bake(emptyDoc(REST), REST))).toBe(false)
    expect(rootMoves(bake(putKey(emptyDoc(REST), 1, posed({}, [0, 1, 0])), REST))).toBe(true)
  })
})

describe('the file', () => {
  test('round-trips through JSON', () => {
    let doc = putKey(emptyDoc(REST, 'wave'), 1, posed({ head: TURNED }, [0, 0.5, 0]))
    doc = setEase(doc, 1, 'hold')
    expect(parseDoc(JSON.parse(JSON.stringify(doc)), REST)).toEqual(doc)
  })

  test('rubbish opens as an empty clip rather than throwing', () => {
    expect(parseDoc({ keys: 'nope', fps: 'fast' }, REST).keys).toHaveLength(1)
    expect(parseDoc(null, REST).fps).toBe(24)
  })

  test('a bone added to the rig since the file was saved arrives at rest', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    const older = JSON.parse(JSON.stringify(doc))
    for (const key of older.keys) delete key.pose.bones.head
    expect(parseDoc(older, REST).keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('a degenerate quaternion becomes identity rather than NaN', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    const broken = JSON.parse(JSON.stringify(doc))
    broken.keys[1].pose.bones.head = [0, 0, 0, 0]
    expect(parseDoc(broken, REST).keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('the duration never ends up shorter than the last key it kept', () => {
    const parsed = parseDoc({ duration: 0.5, fps: 24, keys: [{ time: 3, pose: { root: [0, 0, 0], bones: {} } }] }, REST)
    expect(parsed.duration).toBe(3)
  })
})

/**
 * What decides whether a clip plays *over* the walk or replaces it.
 *
 * Reported as "walk and dance is not working together", and the machinery is
 * right - which is exactly why it is worth pinning here. A clip layers when it
 * leaves a whole group of the body alone, and `bake` is what decides that: a
 * bone whose rotation never changes is dropped, so a wave arrives with no leg
 * tracks and the mixer has nothing to fight the gait with. Key a single hip
 * sway into the same clip and it touches all three groups, at which point it is
 * a whole-body animation and correctly replaces the walk.
 *
 * The rule is read off the tracks rather than off a switch on purpose - a clip
 * with no leg tracks cannot drive the legs whatever anybody ticked - so this is
 * the test that says an author can still reach both behaviours.
 */
describe('what makes a clip layer', () => {
  /*
    Loaded names, not the ones the GLB spells. three sanitises a node name on
    the way in - `upperarm.r` becomes `upperarmr` - and `boneKey` exists to say
    the same thing, so a pose, a track and a spec all agree. Writing the dotted
    names here looks right and matches nothing, which is worth a comment
    because it is a mistake this test made first.
  */
  const FULL: Pose = {
    root: [0, 0, 0],
    bones: {
      hips: [0, 0, 0, 1],
      upperarmr: [0, 0, 0, 1],
      upperlegl: [0, 0, 0, 1],
    },
  }

  const two = (second: Pose): AnimationDoc => {
    const doc = emptyDoc(FULL)
    return putKey({ ...doc, duration: 1 }, 1, second)
  }

  test('a clip that only moves an arm arrives with only that arm', () => {
    const baked = bake(two({ ...FULL, bones: { ...FULL.bones, upperarmr: TURNED } }), FULL)

    expect(Object.keys(baked.bones)).toEqual(['upperarmr'])
    expect([...groupsIn(Object.keys(baked.bones), ALL_SPECS)]).toEqual(['arms'])
    expect(isPartial(groupsIn(Object.keys(baked.bones), ALL_SPECS))).toBe(true)
  })

  test('arms and torso together still layer - two groups is not three', () => {
    const baked = bake(
      two({ ...FULL, bones: { ...FULL.bones, upperarmr: TURNED, hips: TURNED } }),
      FULL,
    )

    expect(isPartial(groupsIn(Object.keys(baked.bones), ALL_SPECS))).toBe(true)
  })

  test('but one keyed leg makes it a whole-body clip that replaces the gait', () => {
    const baked = bake(
      two({
        ...FULL,
        bones: { ...FULL.bones, upperarmr: TURNED, hips: TURNED, upperlegl: TURNED },
      }),
      FULL,
    )

    expect(isPartial(groupsIn(Object.keys(baked.bones), ALL_SPECS))).toBe(false)
  })

  test('a bone held still through every key is not a track at all', () => {
    const baked = bake(two({ ...FULL, bones: { ...FULL.bones, upperarmr: TURNED } }), FULL)

    expect(baked.bones.hips).toBeUndefined()
    expect(baked.bones.upperlegl).toBeUndefined()
  })
})

describe('a document parsed with no rig to hold it against', () => {
  const TURNED: Quat = [0, 0.7071, 0, 0.7071]

  test('keeps exactly the bones the file names', () => {
    const doc = parseAnyDoc({
      name: 'wave',
      fps: 24,
      duration: 2,
      loop: false,
      keys: [{ time: 0, ease: 'hold', pose: { root: [0, 1, 0], bones: { head: TURNED } } }],
    })
    expect(doc?.name).toBe('wave')
    expect(doc?.loop).toBe(false)
    expect(Object.keys(doc?.keys[0].pose.bones ?? {})).toEqual(['head'])
    expect(doc?.keys[0].pose.root).toEqual([0, 1, 0])
  })

  test('is null for anything without a usable key, rather than a default', () => {
    expect(parseAnyDoc(null)).toBeNull()
    expect(parseAnyDoc('wave')).toBeNull()
    expect(parseAnyDoc({ keys: [] })).toBeNull()
    expect(parseAnyDoc({ keys: [{ time: 0 }] })).toBeNull()
  })

  test('the duration never ends before the last key', () => {
    const doc = parseAnyDoc({
      duration: 1,
      keys: [{ time: 3, pose: { root: [0, 0, 0], bones: {} } }],
    })
    expect(doc?.duration).toBe(3)
  })

  test('a degenerate rotation becomes identity rather than NaN', () => {
    const doc = parseAnyDoc({
      keys: [{ time: 0, pose: { root: [0, 0, 0], bones: { head: [0, 0, 0, 0] } } }],
    })
    expect(doc?.keys[0].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('what it returns is what samplePose already understands', () => {
    const doc = parseAnyDoc({
      fps: 24,
      duration: 1,
      keys: [
        { time: 0, ease: 'linear', pose: { root: [0, 0, 0], bones: { head: [0, 0, 0, 1] } } },
        { time: 1, ease: 'linear', pose: { root: [0, 1, 0], bones: { head: TURNED } } },
      ],
    })
    expect(doc).not.toBeNull()
    expect(samplePose(doc as AnimationDoc, 0.5).root[1]).toBeCloseTo(0.5)
  })
})

describe('trimming a pose for the address bar', () => {
  test('rounds to four places, which is finer than a hand can drag', () => {
    const trimmed = trimPose({
      root: [0.123456789, 1, 0],
      bones: { head: [0.7071067811865476, 0, 0, 0.7071067811865476] },
    })
    expect(trimmed.root[0]).toBe(0.1235)
    expect(trimmed.bones.head[0]).toBe(0.7071)
  })

  test('shortens what a link has to carry', () => {
    const pose = { root: [0.123456789, 0, 0] as [number, number, number], bones: {} }
    expect(JSON.stringify(trimPose(pose)).length).toBeLessThan(JSON.stringify(pose).length)
  })
})

describe('a bone that is posed and then held', () => {
  /** Rolled a quarter turn about Z, and never moved from there. */
  const ROLLED: Quat = [0, 0, 0.7071, 0.7071]
  const REST_HEAD: Pose = { root: [0, 0, 0], bones: { head: [0, 0, 0, 1], hips: [0, 0, 0, 1] } }

  const held: AnimationDoc = {
    version: 1,
    name: 'held',
    fps: 24,
    duration: 1,
    loop: false,
    keys: [
      { time: 0, ease: 'linear', pose: { root: [0, 0, 0], bones: { head: ROLLED, hips: [0, 0, 0, 1] } } },
      { time: 1, ease: 'linear', pose: { root: [0, 0, 0], bones: { head: ROLLED, hips: [0, 0, 0, 1] } } },
    ],
  }

  test('survives the bake, because a held pose is still a pose', () => {
    // Dropping it leaves the player with nothing to bind, so the bone stays at
    // the model's own rest - which is not where it was put.
    const baked = bake(held, REST_HEAD)
    expect(baked.bones.head).toBeDefined()
    expect(baked.bones.head[2]).toBeCloseTo(0.7071)
  })

  test('a bone left at rest for the whole clip is still dropped', () => {
    // The optimisation this protects: 20 of 23 tracks go on a clip that only
    // waves, and a bone nothing touched is a bone the model already places.
    expect(bake(held, REST_HEAD).bones.hips).toBeUndefined()
  })
})
