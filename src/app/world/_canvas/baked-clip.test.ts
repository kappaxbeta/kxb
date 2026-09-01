import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { toClip, toLayered } from '@/app/world/_canvas/baked-clip'
import { lead } from '@/app/world/lounge/_canvas/lead'
import type { BakedClip } from '@/domain/animator/clip'

/**
 * What a clip does to the walk underneath it.
 *
 * Run against a real `AnimationMixer` and a real bone tree rather than by
 * reading `blendMode` back off the clip, because the blend mode is a means: the
 * fact worth pinning is whether the legs are still walking while the arms do
 * whatever the clip says. A test that only checked the flag would have passed
 * on the day the flag was right and the gait was never played at all.
 *
 * The bone names are the *loaded* ones - `upperarml`, not `upperarm.l`. See
 * `boneKey`: `GLTFLoader` strips the dot, every lookup in the app is by the
 * stripped name, and a fixture written the way the file spells it matches
 * nothing in `ALL_SPECS` and quietly tests the wrong thing.
 */

const q = (angle: number) => {
  const out = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)
  return [out.x, out.y, out.z, out.w]
}

/** Rest, a turn, rest - enough for a track to be a track. */
const SWING = [...q(0), ...q(1.1), ...q(0)]

const baked = (bones: string[]): BakedClip => ({
  name: 'authored',
  duration: 1,
  times: [0, 0.5, 1],
  bones: Object.fromEntries(bones.map((bone) => [bone, SWING])),
  root: [0, 0, 0, 0, 0, 0, 0, 0, 0],
})

function body() {
  const top = new THREE.Object3D()
  const root = new THREE.Object3D()
  root.name = 'root'
  top.add(root)
  const nodes: Record<string, THREE.Object3D> = {}
  for (const name of ['hips', 'spine', 'upperarml', 'lowerarml', 'handl', 'upperlegl']) {
    const node = new THREE.Object3D()
    node.name = name
    root.add(node)
    nodes[name] = node
  }
  return { top, nodes }
}

/** The pack's own walk: legs, and nothing else. */
function walk() {
  const times = new Float32Array([0, 0.5, 1])
  return new THREE.AnimationClip('Walking_A', 1, [
    new THREE.QuaternionKeyframeTrack('upperlegl.quaternion', times, new Float32Array(SWING)),
  ])
}

const turned = (node: THREE.Object3D) => 2 * Math.acos(Math.min(1, Math.abs(node.quaternion.w)))

/**
 * A second of the body, played exactly the way `SkinModel` plays one.
 *
 * `walking` is the fact the whole file is about: whether the gait action was
 * built and led at all. It is null when the clip replaced it.
 */
function play(clip: THREE.AnimationClip) {
  const { top, nodes } = body()
  const mixer = new THREE.AnimationMixer(top)
  const playing: { current: THREE.AnimationAction | null } = { current: null }

  const layered = clip.blendMode === THREE.AdditiveAnimationBlendMode
  const gait = layered ? mixer.clipAction(walk()) : null
  if (gait) lead(gait, playing, 0.2)

  const extra = mixer.clipAction(clip, top)
  if (layered) extra.reset().fadeIn(0.2).play()
  else lead(extra, playing, 0.2)

  let arm = 0
  for (let frame = 0; frame < 90; frame += 1) {
    mixer.update(1 / 60)
    arm = Math.max(arm, turned(nodes.upperarml))
  }
  return { walking: gait !== null, arm }
}

const ARM_ONLY = ['upperarml', 'lowerarml', 'handl']
/** Arms, torso and legs - what the pose editor produces most of the time. */
const WHOLE_BODY = ['upperarml', 'spine', 'upperlegl']
const PEEP = ['body', 'tail', 'leg-front-left']

describe('a clip a room plays', () => {
  test('an arm-only clip rides over the walk', () => {
    expect(play(toClip(baked(ARM_ONLY)))).toMatchObject({ walking: true })
  })

  test('and a whole-body one stops it, because a sit-down has to', () => {
    expect(play(toClip(baked(WHOLE_BODY))).walking).toBe(false)
  })
})

describe('a clip a mirror plays', () => {
  test('an arm-only clip is left exactly as it was', () => {
    const clip = baked(ARM_ONLY)
    expect(toLayered(clip).tracks.length).toBe(toClip(clip).tracks.length)
  })

  test('a whole-body one is cut to its arms and rides over the walk', () => {
    const played = play(toLayered(baked(WHOLE_BODY)))
    expect(played.walking).toBe(true)
    // Cut down, not silenced: the arms are the half worth keeping.
    expect(played.arm).toBeGreaterThan(0.5)
  })

  test('so the walk is still the thing driving the legs', () => {
    const { top, nodes } = body()
    const mixer = new THREE.AnimationMixer(top)
    mixer.clipAction(walk()).play()
    mixer.clipAction(toLayered(baked(WHOLE_BODY)), top).play()

    let leg = 0
    for (let frame = 0; frame < 90; frame += 1) {
      mixer.update(1 / 60)
      leg = Math.max(leg, turned(nodes.upperlegl))
    }
    expect(leg).toBeGreaterThan(0.5)
  })

  test('a clip with no arm tracks is handed back whole', () => {
    // Every peep clip: an animal has legs, a body and a tail and no arms group
    // at all, so there is nothing to cut down to - and it was already layering.
    const clip = baked(PEEP)
    expect(toLayered(clip).tracks.length).toBe(toClip(clip).tracks.length)
  })

  test('and a layer never moves the body, whatever the clip did', () => {
    const hopping: BakedClip = { ...baked(WHOLE_BODY), root: [0, 0, 0, 0, 0.4, 0, 0, 0, 0] }
    expect(toClip(hopping).tracks.some((track) => track.name.endsWith('.position'))).toBe(true)
    expect(toLayered(hopping).tracks.some((track) => track.name.endsWith('.position'))).toBe(false)
  })
})

describe('a pose set at frame one and held', () => {
  /** A quarter turn about Z, in every frame of a three-frame clip. */
  const ROLLED = [0, 0, 0.7071, 0.7071, 0, 0, 0.7071, 0.7071, 0, 0, 0.7071, 0.7071]

  /** Arms only, so it layers - a whole-body clip is never made additive. */
  const held = (rest?: BakedClip['rest']): BakedClip => ({
    name: 'held',
    duration: 1,
    times: [0, 0.5, 1],
    bones: Object.fromEntries(ARM_ONLY.map((bone) => [bone, [...ROLLED]])),
    root: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ...(rest ? { rest } : {}),
  })

  /** The rest pose the animator would have measured it from: every bone straight. */
  const straight: BakedClip['rest'] = {
    root: [0, 0, 0],
    bones: Object.fromEntries(ARM_ONLY.map((bone) => [bone, [0, 0, 0, 1]])),
  }

  /** How far the first frame of a track is from doing nothing at all. */
  const firstDelta = (clip: THREE.AnimationClip, bone: string): number => {
    const track = clip.tracks.find((one) => one.name === `${bone}.quaternion`)
    if (!track) return 0
    const q = new THREE.Quaternion(
      track.values[0],
      track.values[1],
      track.values[2],
      track.values[3],
    )
    return q.angleTo(new THREE.Quaternion())
  }

  test('keeps its angle when the clip says what it was measured from', () => {
    // The bug: subtracted against its own first frame, a held roll becomes a
    // delta of nothing and the clip plays with no roll in it at all.
    expect(firstDelta(toClip(held(straight)), 'upperarml')).toBeGreaterThan(1)
  })

  test('and is still flattened when it does not, which is what old clips do', () => {
    // Deliberate: a clip saved before the rest was recorded plays exactly as it
    // always has rather than changing under somebody. Re-saving it is the fix.
    // Flattened to nothing a hundredth the size of the angle above, rather
    // than to exactly nothing: 0.7071 is not quite unit length, so subtracting
    // it from itself leaves half a degree of rounding behind.
    expect(firstDelta(toClip(held()), 'upperarml')).toBeLessThan(0.05)
  })

  test('a clip that does move is additive either way', () => {
    // The reference only decides what zero is, so a clip that swings still
    // swings - this is what stops the fix from being "make nothing additive".
    const swinging = toClip({ ...baked(ARM_ONLY), rest: straight })
    expect(swinging.blendMode).toBe(THREE.AdditiveAnimationBlendMode)
  })
})
