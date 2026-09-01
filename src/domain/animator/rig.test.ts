import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import {
  ALL_SPECS,
  BONE_SPECS,
  DUMMY_BONES,
  groupsIn,
  isPartial,
  PEEP_BONES,
  ROOT_BONE,
  boneKey,
} from '@/domain/animator/rig'

/**
 * The rig description, checked against the model it describes.
 *
 * This exists because of a bug that cost a screenshot to find. Every lookup in
 * the editor is by bone name, and `GLTFLoader` renames as it loads - it strips
 * the characters reserved by three's track syntax, and `.` is one of them, so
 * `upperarm.l` in the file arrives as `upperarml`. A name written the way the
 * file spells it therefore resolves to nothing, silently: no error, no missing
 * model, just a handle that never finds a bone, stays at its unscaled size and
 * sits at the origin. Sixteen of those overlap into one grey ball in the middle
 * of the floor.
 *
 * Nothing about that is visible from reading the code, and it is only visible
 * on screen if you happen to look. So it is asserted here instead, against the
 * bytes of the actual file.
 */

const GLB = 'public/xo/pda/dummy/Dummy.glb'

/**
 * The node table out of a `.glb`, without a loader.
 *
 * A binary glTF is a twelve byte header and then length-prefixed chunks, the
 * first of which is the JSON. Reading it by hand rather than through
 * `GLTFLoader` keeps this a test of the file, and keeps a renderer, a DOM and
 * an image decoder out of a test that is about a list of strings.
 */
async function nodesIn(path: string): Promise<{ name?: string }[]> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  expect(view.getUint32(0, true)).toBe(0x46546c67) // "glTF"

  const length = view.getUint32(12, true)
  expect(view.getUint32(16, true)).toBe(0x4e4f534a) // "JSON"

  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))).nodes
}

describe('boneKey', () => {
  test('drops the dot, which is the whole reason this exists', () => {
    expect(boneKey('upperarm.l')).toBe('upperarml')
  })

  test('leaves a name with nothing reserved in it alone', () => {
    expect(boneKey('hips')).toBe('hips')
  })

  test('matches what three does to the rest of the reserved set', () => {
    expect(boneKey('a[0].b:c/d e')).toBe('a0bcd_e')
  })
})

describe('the dummy', () => {
  test('every bone described here is in the file under its `glb` name', async () => {
    const names = new Set((await nodesIn(GLB)).map((node) => node.name))
    for (const spec of DUMMY_BONES) expect(names).toContain(spec.glb)
    expect(names).toContain(ROOT_BONE)
  })

  test('`name` is what the loader will call it, not what the file does', async () => {
    for (const spec of DUMMY_BONES) expect(spec.name).toBe(boneKey(spec.glb))
    // Sixteen of the twenty-one carry a dot. If this ever drops to zero the
    // model has been re-exported with different naming and the note at the top
    // of `rig.ts` needs re-reading before anything is trusted.
    expect(DUMMY_BONES.filter((spec) => spec.name !== spec.glb)).toHaveLength(16)
  })

  test('the index is keyed by the loaded name, which is what the solver looks up', () => {
    expect(BONE_SPECS['upperarml']).toBeDefined()
    expect(BONE_SPECS['upperarm.l']).toBeUndefined()
  })

  test('no two bones collide once the reserved characters are gone', () => {
    expect(new Set(DUMMY_BONES.map((spec) => spec.name)).size).toBe(DUMMY_BONES.length)
  })

  test('the root is a real node and is not one of the handles', async () => {
    expect((await nodesIn(GLB)).some((node) => node.name === ROOT_BONE)).toBe(true)
    expect(DUMMY_BONES.map((spec) => spec.name)).not.toContain(ROOT_BONE)
  })

  test('every hinge names an axis the bone does not point down', () => {
    // Bones in this pack run along their own +Y, so a hinge about Y would be a
    // joint that only twists - never what a knee or an elbow is.
    for (const spec of DUMMY_BONES) {
      if (spec.hinge) expect(['x', 'z']).toContain(spec.hinge.axis)
    }
  })

  test('a chain never reaches past the root', () => {
    // `hand` is the deepest handle at reach 3: wrist, forearm, upper arm. One
    // more would be the chest, and the reach on the torso bones is what keeps
    // a hand drag out of the spine.
    for (const spec of DUMMY_BONES) expect(spec.reach).toBeLessThanOrEqual(3)
  })
})

/**
 * The peep, checked against a peep the same way.
 *
 * The animals ship *unskinned* - seven nodes with a mesh on most of them,
 * turned rather than deformed - which is a rig as far as this editor is
 * concerned: a pose here is a root translation plus a quaternion per named
 * node, and three.js binds a quaternion track to a node by name whether or not
 * the node is a `Bone`.
 *
 * The fox stands in for the pack. They share one rig under one set of names, so
 * a clip keyed against the fox plays on the penguin.
 */
const PEEP_GLB = 'public/xo/peeps/animal-fox.glb'

/**
 * Whether the animal is on disk, because in one checkout it is not.
 *
 * The community repository ships no model kits by design - see its
 * docs/assets.md - and its CI skips the suites that read one by listing them.
 * The dummy is the exception: it is *generated* there, so everything in this
 * file that only needs a rig runs and passes, and listing the whole file would
 * throw those away to spare the two tests below.
 *
 * So the two that need the fox say so themselves, and the file keeps earning
 * its place in both trees. Fetch the packs and they run here as they always
 * have.
 */
const HAS_PEEP = existsSync(PEEP_GLB)

describe('the peep rig', () => {
  test.skipIf(!HAS_PEEP)('every handle names a node the file actually has', async () => {
    const names = new Set((await nodesIn(PEEP_GLB)).map((node) => node.name))
    for (const spec of PEEP_BONES) expect(names).toContain(spec.name)
  })

  test.skipIf(!HAS_PEEP)('its root is called `root`, which is why nothing needed a second word', async () => {
    // Luck rather than design, and worth a test: `ROOT_BONE` is the one name
    // the whole editor hardcodes, and the peep happens to spell it the same.
    expect((await nodesIn(PEEP_GLB)).some((node) => node.name === ROOT_BONE)).toBe(true)
  })

  test('is four legs, a body and a tail - and no arms to wave with', () => {
    expect(PEEP_BONES.filter((spec) => spec.group === 'legs')).toHaveLength(4)
    expect(PEEP_BONES.some((spec) => spec.group === 'arms')).toBe(false)
  })

  test('every limb is one bone, so no chain has a plane to get wrong', () => {
    for (const spec of PEEP_BONES) {
      expect(spec.reach).toBe(1)
      expect(spec.hinge).toBeUndefined()
    }
  })
})

describe('which parts of a body a clip touches', () => {
  test('a wave is arms', () => {
    // The *loaded* names, which is what a baked clip's tracks are keyed by.
    expect([...groupsIn(['upperarmr', 'lowerarmr', 'handr'], ALL_SPECS)]).toEqual(['arms'])
  })

  test('a bone no rig here knows counts as nothing', () => {
    // A clip from a pack we later drop, or a rig somebody imported. Reading it
    // as "touches nothing" is what stops it being trimmed or mislabelled.
    expect(groupsIn(['tentacle'], ALL_SPECS).size).toBe(0)
  })

  test('both rigs answer from one map, because their names never collide', () => {
    expect([...groupsIn(['leg-front-left', 'body'], ALL_SPECS)].sort()).toEqual([
      'legs',
      'torso',
    ])
    expect([...groupsIn(['hips'], ALL_SPECS)]).toEqual(['torso'])
  })

  test('no name means two different parts on the two bodies', () => {
    for (const spec of PEEP_BONES) {
      const other = BONE_SPECS[spec.name]
      if (other) expect(other.group).toBe(spec.group)
    }
  })
})

describe('whether a clip plays over the walk or instead of it', () => {
  test('leaving a part of the body alone makes it a layer', () => {
    expect(isPartial(groupsIn(['handr'], ALL_SPECS))).toBe(true)
    expect(isPartial(groupsIn(['handr', 'hips'], ALL_SPECS))).toBe(true)
  })

  test('a whole-body animation replaces the gait', () => {
    expect(isPartial(groupsIn(['handr', 'hips', 'footl'], ALL_SPECS))).toBe(false)
  })

  test('a clip that drives nothing is not a layer over anything', () => {
    // Every track dropped, or every bone unknown. Playing it additively would
    // be adding nothing to something, which is a frame's work for no picture.
    expect(isPartial(groupsIn([], ALL_SPECS))).toBe(false)
  })
})
