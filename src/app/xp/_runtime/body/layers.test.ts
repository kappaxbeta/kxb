import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { boneOf, gestureOf, UPPER_BODY } from '@/app/xp/_runtime/body/layers'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'

/**
 * The upper-body layer, asked rather than watched.
 *
 * The Browser pane never fires a frame, so "does the punch land on the arms and
 * leave the legs walking" is not a thing a screenshot can answer. What it *is*
 * is two questions a function can: which tracks survive the mask, and whether
 * what comes out is relative to the pose it was authored from.
 */

/** A track per named bone, all holding one rotation, so a mask is countable. */
function clipOver(bones: readonly string[]): THREE.AnimationClip {
  return new THREE.AnimationClip(
    'Test',
    1,
    bones.map(
      (bone) =>
        new THREE.QuaternionKeyframeTrack(
          `${bone}.quaternion`,
          [0, 1],
          // Frame zero is the identity - the rest pose an additive clip is
          // measured against - and frame one is a quarter turn about Y.
          [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
        ),
    ),
  )
}

describe('which bone a track drives', () => {
  test('the split is at the last dot, because a property is one word', () => {
    expect(boneOf('chest.quaternion')).toBe('chest')
    expect(boneOf('upperarmr.position')).toBe('upperarmr')
  })

  test('a morph target belongs to the node it is on', () => {
    // Named `<node>.morphTargetInfluences[0]`, so the last dot is still the one
    // before the property and the head's face is masked with the head.
    expect(boneOf('head.morphTargetInfluences[0]')).toBe('head')
  })

  test('a name with no property at all drives nothing', () => {
    expect(boneOf('chest')).toBeNull()
    expect(boneOf('.quaternion')).toBeNull()
  })
})

describe('masking a gesture to the upper body', () => {
  test('legs are dropped and arms are kept', () => {
    const clip = clipOver(['upperarmr', 'lowerarmr', 'chest', 'upperlegl', 'footl', 'hips'])
    const gesture = gestureOf(clip)!
    expect(gesture.tracks.map((track) => boneOf(track.name)).sort()).toEqual([
      'chest',
      'lowerarmr',
      'upperarmr',
    ])
  })

  test('the hips are not upper body, whatever the animator panel groups them with', () => {
    /**
     * `DUMMY_BONES` puts `hips` in the torso group because it is the handle you
     * drag to make a figure crouch. Here it is the thing a gesture must not
     * touch: a punch that moved the hips would lift a walking body off its feet.
     */
    expect(UPPER_BODY.has('hips')).toBe(false)
    expect(gestureOf(clipOver(['hips']))).toBeNull()
  })

  test('a clip with nothing above the hips is null rather than an empty action', () => {
    // An empty action played at full weight is a body that quietly stops being
    // animated, which is worse than laying nothing over the stance.
    expect(gestureOf(clipOver(['upperlegr', 'lowerlegr', 'footr']))).toBeNull()
  })

  test('the source clip is untouched, because makeClipAdditive mutates', () => {
    /**
     * The bug this prevents is the expensive one: clips are shared between every
     * body in the room, so converting the original would turn the first punch
     * anybody threw into a permanent change to what a walk means.
     */
    const clip = clipOver(['chest', 'footl'])
    const before = (clip.tracks[0] as THREE.QuaternionKeyframeTrack).values.slice()
    gestureOf(clip)
    expect(clip.tracks).toHaveLength(2)
    expect((clip.tracks[0] as THREE.QuaternionKeyframeTrack).values).toEqual(before)
  })

  test('what comes out is relative to its own first frame', () => {
    /**
     * The whole point of the layer. An additive clip starts at the identity, so
     * a gesture adds *nothing* on its first frame and on its last - which is why
     * a finished swing can be held rather than snapped away.
     */
    const gesture = gestureOf(clipOver(['chest']))!
    const values = (gesture.tracks[0] as THREE.QuaternionKeyframeTrack).values
    const first = new THREE.Quaternion(values[0]!, values[1]!, values[2]!, values[3]!)
    expect(first.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 5)

    // And the offset is preserved: a quarter turn in is still a quarter turn out.
    const last = new THREE.Quaternion(values[4]!, values[5]!, values[6]!, values[7]!)
    expect(last.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('the mask against the body it masks', () => {
  /**
   * The joints in a `.glb`, read out of its JSON chunk.
   *
   * Against the model rather than against `domain/animator`'s bone table, and
   * not only because `src/app/xp/` may not import it - the creator owns its own
   * renderer, docs/xp-creator.md §1.3. The model is the better authority
   * anyway: a mask is checked against what three.js will actually bind to, and
   * a rig table is one more thing that could be the stale one.
   *
   * The names here still carry their dots - `upperarm.r` - because `GLTFLoader`
   * is what strips them, and it has not run. That conversion is the same one
   * `boneKey` does and is applied on the way in.
   */
  const jointsIn = (file: string): Set<string> => {
    const buffer = readFileSync(file)
    const length = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'))
    const joints: number[] = json.skins?.[0]?.joints ?? []
    return new Set(joints.map((at: number) => (json.nodes[at].name as string).replaceAll('.', '')))
  }

  const dummy = jointsIn(
    path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'packs', 'dummy', 'Dummy.glb'),
  )

  test('every name in it is a joint the dummy actually has', () => {
    /**
     * A typo here is silent twice over: the track is dropped, the gesture plays
     * on fewer bones than intended, and nothing anywhere errors. The body just
     * swings a bit less than it was authored to.
     */
    expect(dummy.size).toBeGreaterThan(20)
    expect([...UPPER_BODY].filter((bone) => !dummy.has(bone))).toEqual([])
  })

  test('and it stops at the hips: no leg is in it', () => {
    for (const leg of ['upperlegl', 'lowerlegl', 'footl', 'toesl', 'upperlegr', 'lowerlegr', 'footr', 'toesr']) {
      expect({ leg, masked: UPPER_BODY.has(leg) }).toEqual({ leg, masked: false })
    }
  })

  test('and it covers both arms whole, or a punch bends half an elbow', () => {
    for (const arm of ['upperarml', 'lowerarml', 'wristl', 'handl', 'upperarmr', 'lowerarmr', 'wristr', 'handr']) {
      expect({ arm, masked: UPPER_BODY.has(arm) }).toEqual({ arm, masked: true })
    }
  })
})

describe('the clips a swing names', () => {
  test('both are in the files the runtime loads', () => {
    // `poseFor('attack')` names these, and a name outside the generated list is
    // a body that silently keeps its last pose.
    expect(CLIPS).toContain('Melee_Unarmed_Attack_Punch_A')
    expect(CLIPS).toContain('Melee_1H_Attack_Chop')
  })
})
