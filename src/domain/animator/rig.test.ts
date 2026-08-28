import { describe, expect, test } from 'bun:test'
import { BONE_SPECS, DUMMY_BONES, ROOT_BONE, boneKey } from '@/domain/animator/rig'

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
