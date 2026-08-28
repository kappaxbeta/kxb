/**
 * Copied from `src/domain/animator/rig.test.ts`, with the code it guards.
 *
 * The copy is the rule (docs/xp-creator.md §1.2), and a copy of the code
 * without a copy of its tests would be the worst of both: duplicated logic
 * that nothing holds still. See the note at the top of the file it tests.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import {
  BONE_SPECS,
  DUMMY_BONES,
  PEEPZ_BONES,
  RIGS,
  ROOT_BONE,
  boneKey,
  isRigId,
  rigFor,
} from '@/app/xp/_editor/animator/rig'

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
 * The peeps, checked the same way and for a different failure.
 *
 * The dummy's version of this test is about *renaming*: three's loader strips
 * the dots, and a name spelled the way the file spells it resolves to nothing.
 * The peeps carry no reserved characters at all, so that half is trivially
 * satisfied - and the interesting question turns out to be the opposite one.
 *
 * `PEEPZ_BONES` is the **union** of twenty-four animals rather than any one of
 * them. There is no single file to check it against: a fish has no legs, a bunny
 * has no tail, and a table that only listed the parts every animal shares would
 * be a table with `body` in it and nothing else. So what has to hold is a pair
 * of one-way facts - every name here belongs to *some* animal, and every part
 * *any* animal has is named here - and both of them are what breaks silently
 * when the pack is re-exported.
 */
const PEEPZ_DIR = 'public/xp/packs/peepz'

/** Every node name in every animal, which is the set the union has to match. */
async function peepzNodes(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  for (const file of readdirSync(PEEPZ_DIR).filter((name) => name.endsWith('.glb'))) {
    const nodes = await nodesIn(`${PEEPZ_DIR}/${file}`)
    out.set(
      file,
      new Set(nodes.map((node) => node.name).filter((name): name is string => Boolean(name))),
    )
  }
  return out
}

describe('the peeps', () => {
  test('every part described here belongs to at least one animal', async () => {
    const animals = await peepzNodes()
    for (const spec of PEEPZ_BONES) {
      const has = [...animals.values()].some((names) => names.has(spec.glb))
      expect(has).toBe(true)
    }
  })

  test('and every part any animal has is described here', async () => {
    /**
     * `Group` is the exception, and it is not a part.
     *
     * Five of the twenty-four hang an unnamed accessory mesh under the body - a
     * beak, a shell, a snout - exported as a node three's own loader would call
     * `Group`. It is drawn and never animated: no clip in any of the files has a
     * channel on it. A handle there would be a dot on a fox's nose that turns a
     * fox's nose.
     */
    const known = new Set([...PEEPZ_BONES.map((spec) => spec.glb), ROOT_BONE, 'Group'])
    for (const [file, names] of await peepzNodes()) {
      for (const name of names) {
        // The scene root is the file's own name - `animal-fox` - and is the
        // parent of `root` rather than a part of the animal.
        if (name === file.replace('.glb', '')) continue
        expect({ file, name, known: known.has(name) }).toEqual({ file, name, known: true })
      }
    }
  })

  test('the root is a real node in every animal, and is not one of the handles', async () => {
    for (const names of (await peepzNodes()).values()) expect(names).toContain(ROOT_BONE)
    expect(PEEPZ_BONES.map((spec) => spec.name)).not.toContain(ROOT_BONE)
  })

  test('nothing is renamed on the way in, unlike the dummy', () => {
    // No dots, no brackets, no spaces - so `name` and `glb` are the same string
    // for all eight. Asserted rather than assumed, because the day a re-export
    // introduces one, every lookup for that part silently stops resolving.
    for (const spec of PEEPZ_BONES) expect(spec.name).toBe(spec.glb)
  })

  test('the limbs swivel and the body translates, which is the whole difference', () => {
    // One handle that moves the animal, seven that turn on the spot. If `body`
    // ever grew a `swivel` the drag would stop sliding the root and a peep
    // could not be moved at all; if a leg ever lost one it would be a dot you
    // can grab that does nothing, because its parent is the root and the solver
    // refuses to turn that.
    const translates = PEEPZ_BONES.filter((spec) => spec.reach === 0 && !spec.swivel)
    expect(translates.map((spec) => spec.name)).toEqual(['body'])
    expect(PEEPZ_BONES.filter((spec) => spec.swivel)).toHaveLength(7)
  })

  test('no peep part can be pinned, because nothing about a peep hangs off the body', () => {
    // The legs are children of `root`, not of `body`, so lowering the body does
    // not move them and there is no crouch to re-solve. A pin would be a tick
    // box that never did anything.
    expect(PEEPZ_BONES.filter((spec) => spec.pinnable)).toHaveLength(0)
  })
})

describe('the rig table', () => {
  test('each rig is filed under its own id, so a pack resolves straight to one', () => {
    for (const [id, rig] of Object.entries(RIGS)) expect(rig.id).toBe(id as typeof rig.id)
  })

  test('every group a rig lists is a group its bones are actually in', () => {
    for (const rig of Object.values(RIGS)) {
      const used = new Set(rig.bones.map((spec) => spec.group))
      expect([...rig.groups].sort()).toEqual([...used].sort())
    }
  })

  test('a name from a file we do not ship opens as the dummy rather than throwing', () => {
    // `parseDoc` hands this whatever a `.json` said, and a `.json` can say
    // anything. An unopenable file is a worse answer than one that opens on the
    // wrong body and can be switched.
    expect(rigFor(undefined).id).toBe('dummy')
    expect(rigFor('gerbil').id).toBe('dummy')
    expect(isRigId('peepz')).toBe(true)
    expect(isRigId('gerbil')).toBe(false)
  })
})
