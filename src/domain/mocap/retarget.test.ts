import { describe, expect, test } from 'bun:test'
import type { Quat, Vec3 } from '@/domain/animator/clip'
import { BONE_SPECS, ROOT_BONE, boneKey } from '@/domain/animator/rig'
import { LM, LANDMARK_COUNT, type RawLandmark, toModelSpace } from '@/domain/mocap/landmarks'
import { unit, sub, rotate } from '@/domain/mocap/maths'
import { type SkeletonBone, place, skeletonOf } from '@/domain/mocap/skeleton'
import { retarget } from '@/domain/mocap/retarget'

/**
 * Retargeting, checked against the skeleton it will actually drive.
 *
 * The dummy is read out of `Dummy.glb` the same way `rig.test.ts` reads it -
 * the JSON chunk of the binary, no loader - so these are assertions about the
 * model that ships, not about a skeleton invented to make the maths look good.
 * That matters more here than anywhere else in this feature: every bone in the
 * pack rests at some angle of its own, the legs rest pointing *down* their own
 * flipped `+Y`, and a swing that ignored that would look almost right and be
 * wrong by a hundred and eighty degrees on four bones.
 */
async function dummySkeleton() {
  const bytes = new Uint8Array(await Bun.file('public/xo/pda/dummy/Dummy.glb').arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
  const nodes: { name: string; children?: number[]; translation?: Vec3; rotation?: Quat }[] =
    json.nodes

  const parentOf = new Map<number, number>()
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parentOf.set(child, index)
  })

  const wanted = (name: string) => name === ROOT_BONE || Boolean(BONE_SPECS[name])

  const bones: SkeletonBone[] = []
  nodes.forEach((node, index) => {
    const name = boneKey(node.name)
    if (!wanted(name)) return
    // The nearest ancestor that is also a bone: `root` hangs off `Rig_Medium`,
    // which is a container and not part of any pose.
    let parent: string | null = null
    for (let at = parentOf.get(index); at !== undefined; at = parentOf.get(at)) {
      const candidate = boneKey(nodes[at].name)
      if (wanted(candidate)) {
        parent = candidate
        break
      }
    }
    bones.push({
      name,
      parent,
      rest: node.rotation ?? [0, 0, 0, 1],
      offset: node.translation ?? [0, 0, 0],
    })
  })

  return skeletonOf(bones)
}

/**
 * A person, given in the dummy's own axes and handed back in the camera's.
 *
 * Writing the fixtures the way the model is built - `+Y` up, `+X` the person's
 * own left - and inverting on the way out is what keeps a test about a raised
 * left arm readable as a raised left arm. The inversion is `toModelSpace`'s,
 * backwards; if that mapping is ever wrong these tests go on passing, which is
 * why the direction of the mapping itself is asserted separately below.
 */
function frameOf(joints: Partial<Record<keyof typeof LM, Vec3>>, hidden: (keyof typeof LM)[] = []) {
  const raw: RawLandmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }))
  for (const [name, point] of Object.entries(joints) as [keyof typeof LM, Vec3][]) {
    raw[LM[name]] = {
      x: point[0],
      y: -point[1],
      z: -point[2],
      visibility: hidden.includes(name) ? 0.1 : 1,
    }
  }
  return toModelSpace(raw)
}

/** Somebody standing still, arms hanging. */
const STANDING: Record<keyof typeof LM, Vec3> = {
  nose: [0, 0.78, 0.1],
  earL: [0.08, 0.75, 0],
  earR: [-0.08, 0.75, 0],
  shoulderL: [0.2, 0.55, 0],
  shoulderR: [-0.2, 0.55, 0],
  elbowL: [0.22, 0.3, 0],
  elbowR: [-0.22, 0.3, 0],
  wristL: [0.24, 0.05, 0],
  wristR: [-0.24, 0.05, 0],
  indexL: [0.25, -0.05, 0],
  indexR: [-0.25, -0.05, 0],
  hipL: [0.1, 0, 0],
  hipR: [-0.1, 0, 0],
  kneeL: [0.1, -0.45, 0],
  kneeR: [-0.1, -0.45, 0],
  ankleL: [0.1, -0.9, 0],
  ankleR: [-0.1, -0.9, 0],
  footL: [0.1, -0.95, 0.15],
  footR: [-0.1, -0.95, 0.15],
}

function posed(frame: ReturnType<typeof frameOf>, skeleton: Awaited<ReturnType<typeof dummySkeleton>>) {
  const pose = retarget(frame, skeleton)
  return { pose, world: place(skeleton, pose.bones, pose.root) }
}

/** Which way a bone points, in the model's space, once it has been placed. */
function heading(world: Record<string, { quat: Quat; pos: Vec3 }>, bone: string): Vec3 {
  return rotate(world[bone].quat, [0, 1, 0])
}

describe('the camera axes', () => {
  test('the person’s left stays the dummy’s left', () => {
    // A left wrist is photographed on the right of the frame - positive x -
    // and the dummy's own left is positive X. So x passes through, and this is
    // the assertion that says so: get it wrong and every capture comes out
    // mirrored, which is invisible until somebody animates a wave.
    const frame = toModelSpace([{ x: 0.5, y: 0.25, z: -0.75 }])
    expect(frame.points[0]).toEqual([0.5, -0.25, 0.75])
  })

  test('a landmark with no visibility field counts as seen', () => {
    expect(toModelSpace([{ x: 0, y: 0, z: 0 }]).visible[0]).toBe(1)
  })
})

describe('retargeting the dummy', () => {
  test('points each limb along the line between its landmarks', async () => {
    const skeleton = await dummySkeleton()
    // A T-pose: both arms straight out sideways, which is the pose with the
    // least room to be accidentally right.
    const { world } = posed(
      frameOf({
        ...STANDING,
        elbowL: [0.45, 0.55, 0],
        wristL: [0.7, 0.55, 0],
        indexL: [0.8, 0.55, 0],
        elbowR: [-0.45, 0.55, 0],
        wristR: [-0.7, 0.55, 0],
        indexR: [-0.8, 0.55, 0],
      }),
      skeleton,
    )

    for (const [bone, expected] of [
      ['upperarml', [1, 0, 0]],
      ['lowerarml', [1, 0, 0]],
      ['upperarmr', [-1, 0, 0]],
      ['lowerarmr', [-1, 0, 0]],
    ] as [string, Vec3][]) {
      const aim = heading(world, bone)
      for (const axis of [0, 1, 2]) expect(aim[axis]).toBeCloseTo(expected[axis], 3)
    }
  })

  test('one arm up moves the arm on that side and leaves the other hanging', async () => {
    const skeleton = await dummySkeleton()
    const { world } = posed(
      frameOf({
        ...STANDING,
        elbowL: [0.25, 0.8, 0],
        wristL: [0.28, 1.05, 0],
        indexL: [0.29, 1.15, 0],
      }),
      skeleton,
    )

    expect(heading(world, 'upperarml')[1]).toBeGreaterThan(0.8)
    expect(heading(world, 'upperarmr')[1]).toBeLessThan(-0.8)
  })

  test('legs fold forwards into a crouch and the feet stay on the floor', async () => {
    const skeleton = await dummySkeleton()
    const standing = posed(frameOf(STANDING), skeleton)
    const crouched = posed(
      frameOf({
        ...STANDING,
        // Knees forward and up, ankles under the hips: a squat.
        kneeL: [0.12, -0.35, 0.3],
        kneeR: [-0.12, -0.35, 0.3],
        ankleL: [0.12, -0.7, 0.05],
        ankleR: [-0.12, -0.7, 0.05],
        footL: [0.12, -0.75, 0.2],
        footR: [-0.12, -0.75, 0.2],
      }),
      skeleton,
    )

    const floor = (world: Record<string, { pos: Vec3 }>) =>
      Math.min(world.toesl.pos[1], world.toesr.pos[1], world.footl.pos[1], world.footr.pos[1])

    expect(floor(crouched.world)).toBeCloseTo(floor(standing.world), 6)
    // ...and the hips are lower than they were, which is what makes it a
    // crouch rather than a figure sinking through the ground.
    expect(crouched.world.hips.pos[1]).toBeLessThan(standing.world.hips.pos[1] - 0.05)
  })

  test('turning the body turns the hips and the chest with it', async () => {
    const skeleton = await dummySkeleton()
    // The same person, rotated a quarter turn about Y: their left hip is now
    // towards the camera.
    const turn = (point: Vec3): Vec3 => [point[2], point[1], -point[0]]
    const turned = Object.fromEntries(
      Object.entries(STANDING).map(([name, point]) => [name, turn(point)]),
    ) as Record<keyof typeof LM, Vec3>

    const { world } = posed(frameOf(turned), skeleton)
    // The dummy's front is `+Z`. A quarter turn puts it on `-X`... or `+X`,
    // depending which way round the turn went: what matters is that the chest
    // no longer faces the camera and the hips agree with it.
    const front = rotate(world.chest.quat, [0, 0, 1])
    expect(Math.abs(front[0])).toBeGreaterThan(0.9)
    expect(rotate(world.hips.quat, [0, 0, 1])[0]).toBeCloseTo(front[0], 2)
  })

  test('a limb the model cannot see is left at rest', async () => {
    const skeleton = await dummySkeleton()
    const { pose } = posed(frameOf({ ...STANDING, elbowL: [0.45, 0.55, 0] }, ['elbowL']), skeleton)
    expect(pose.bones.upperarml).toEqual(skeleton.bones.upperarml.rest)
  })

  test('keys every bone the rig has, and never the root', async () => {
    const skeleton = await dummySkeleton()
    const { pose } = posed(frameOf(STANDING), skeleton)
    for (const bone of Object.keys(BONE_SPECS)) expect(pose.bones[bone]).toBeDefined()
    expect(pose.bones[ROOT_BONE]).toBeUndefined()
    for (const quat of Object.values(pose.bones)) {
      expect(Number.isFinite(quat[0] + quat[1] + quat[2] + quat[3])).toBe(true)
    }
  })

  test('a frame of nothing but zeroes poses nobody', async () => {
    const skeleton = await dummySkeleton()
    const { pose } = posed(frameOf({}), skeleton)
    expect(pose.bones.upperarml).toEqual(skeleton.bones.upperarml.rest)
    expect(pose.root[1]).toBeCloseTo(0, 6)
  })
})

describe('maths', () => {
  test('unit says no rather than guessing at a zero-length vector', () => {
    expect(unit(sub([1, 2, 3], [1, 2, 3]))).toBeNull()
  })
})
