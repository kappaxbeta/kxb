import { describe, expect, test } from 'bun:test'
import {
  DOUBLE_JUMP_AIRTIME,
  DOUBLE_JUMP_PEAK,
  JUMP_AIRTIME,
  JUMP_PEAK,
} from '@/domain/lounge/jump'
import { type Action, jumpLength, newAction, talkDuration } from '@/domain/studio/action'
import { sampleKeys } from '@/domain/studio/keys'
import { DEFAULT_SCENE } from '@/domain/studio/scene'
import {
  DEFAULT_ACTOR,
  DEFAULT_SHOT,
  decodeShot,
  dialogue,
  encodeShot,
  parseShot,
  sceneAt,
  type ShotSpec,
  shotFromScene,
} from '@/domain/studio/shot'
import { speechBlips, voiceFor } from '@/domain/studio/voice'

/**
 * What a shot means, checked without a GPU.
 *
 * More load-bearing than the still studio's tests. A composed still can at
 * least be eyeballed in the viewport, but playback cannot be watched anywhere
 * that is available here - the studio is behind an admin check, and the preview
 * pane that could otherwise drive it never runs an animation loop, so a scene
 * sampled at t = 4 is a thing only a test ever sees.
 *
 * So these cover the sampling itself rather than only the codec: where a peep
 * is, which clip they are in, which way they face, whether their feet keep up
 * with the ground, what they are saying, and where the camera is pointing.
 */

/** A shot with one actor doing whatever is handed in. */
function one(actions: Action[], overrides: Partial<ShotSpec> = {}): ShotSpec {
  return {
    ...DEFAULT_SHOT,
    duration: 10,
    cast: [
      {
        ...DEFAULT_ACTOR,
        avatar: 'fox',
        x: 0,
        z: 0,
        // Deliberately not the angle the walks below imply, so the tests can
        // tell "faces the way they are going" from "faces where they were put".
        rotation: -30,
        actions,
      },
    ],
    camera: [DEFAULT_SHOT.camera[0]],
    ...overrides,
  }
}

/** Four blocks along +x, over two seconds from t = 1: two blocks a second. */
const walk: Action[] = [{ kind: 'move', t: 1, duration: 2, x: 4, z: 0 }]

const only = (shot: ShotSpec, t: number) => sceneAt(shot, t).peeps[0]

// ---------------------------------------------------------------------------

describe('an actor moving', () => {
  test('is at the destination when the move ends', () => {
    const shot = one(walk)
    expect(only(shot, 1).x).toBeCloseTo(0)
    expect(only(shot, 3).x).toBeCloseTo(4)
  })

  test('is halfway along at halfway through', () => {
    expect(only(one(walk), 2).x).toBeCloseTo(2)
  })

  test('holds still before the move starts and after it ends', () => {
    const shot = one(walk)
    expect(only(shot, 0).x).toBeCloseTo(0)
    expect(only(shot, -5).x).toBeCloseTo(0)
    expect(only(shot, 9).x).toBeCloseTo(4)
    expect(only(shot, 500).x).toBeCloseTo(4)
  })

  test('stands where it was put when it never moves', () => {
    const shot = one([], { cast: [{ ...DEFAULT_ACTOR, x: 2, z: -1 }] })
    for (const t of [0, 1, 5, 20]) {
      expect(only(shot, t).x).toBeCloseTo(2)
      expect(only(shot, t).z).toBeCloseTo(-1)
    }
  })

  test('starts each move from wherever the last one finished', () => {
    // The whole reason a move stores only a destination: a list of them reads
    // as directions, and no leg has to repeat where the previous one ended.
    const shot = one([
      { kind: 'move', t: 0, duration: 2, x: 4, z: 0 },
      { kind: 'move', t: 4, duration: 2, x: 4, z: 6 },
    ])
    expect(only(shot, 3).x).toBeCloseTo(4)
    expect(only(shot, 5).z).toBeCloseTo(3)
    expect(only(shot, 6).x).toBeCloseTo(4)
    expect(only(shot, 6).z).toBeCloseTo(6)
  })
})

describe('the clip, which is derived and never authored', () => {
  test('is idle while standing, walk while walking, run while running', () => {
    expect(only(one(walk), 0.5).clip).toBe('idle')
    expect(only(one(walk), 2).clip).toBe('walk')
    // The same four blocks in a quarter of the time is a run.
    const dash = one([{ kind: 'move', t: 1, duration: 0.5, x: 4, z: 0 }])
    expect(only(dash, 1.2).clip).toBe('run')
  })

  test('is idle again once the move is over', () => {
    expect(only(one(walk), 6).clip).toBe('idle')
  })

  test('does not flicker near the walk/run boundary within one move', () => {
    // One constant-speed move must give one clip for its whole length, however
    // close to a threshold it sits - the speed comes off the action, not off a
    // difference between samples.
    const shot = one([{ kind: 'move', t: 0, duration: 2, x: 4.8, z: 0 }])
    const clips = new Set([0.1, 0.5, 1, 1.5, 1.9].map((t) => only(shot, t).clip))
    expect(clips.size).toBe(1)
  })

  test('is the dance clip for as long as a dance lasts, and not after', () => {
    const shot = one([{ kind: 'dance', t: 2, duration: 3 }])
    expect(only(shot, 1.9).clip).toBe('idle')
    expect(only(shot, 3).clip).toBe('dance')
    expect(only(shot, 5.1).clip).toBe('idle')
  })

  test('starts the dance clip at its own beginning rather than mid-phrase', () => {
    const shot = one([{ kind: 'dance', t: 4, duration: 3 }])
    expect(only(shot, 4).time).toBeCloseTo(0)
    expect(only(shot, 5).time).toBeCloseTo(1)
  })
})

describe('which way an actor faces', () => {
  test('follows the direction of travel while moving', () => {
    // Walking along +x with z unchanged is atan2(4, 0) - a quarter turn.
    expect(only(one(walk), 2).rotation).toBeCloseTo(90)
  })

  test('keeps the authored angle while standing still', () => {
    expect(only(one([]), 3).rotation).toBeCloseTo(-30)
  })

  test('holds the authored angle once the walk is over, not the travel angle', () => {
    expect(only(one(walk), 8).rotation).toBeCloseTo(-30)
  })

  test('turns to the angle a turn names, and stays there', () => {
    const shot = one([{ kind: 'turn', t: 2, duration: 1, rotation: 90 }])
    expect(only(shot, 1.9).rotation).toBeCloseTo(-30)
    expect(only(shot, 3.5).rotation).toBeCloseTo(90)
    expect(only(shot, 9).rotation).toBeCloseTo(90)
  })

  test('takes a turn the short way round rather than the long way', () => {
    // 170 to -170 is twenty degrees over the back, not three hundred and forty
    // the other way. Sampled in the middle, which is where the two disagree.
    const turn: Action[] = [{ kind: 'turn', t: 0, duration: 2, rotation: -170 }]
    const shot = one(turn, { cast: [{ ...DEFAULT_ACTOR, rotation: 170, actions: turn }] })
    expect(only(shot, 1).rotation).toBeCloseTo(180)
  })

  test('lets a shake wobble the head without losing where it points', () => {
    const shot = one([{ kind: 'shake', t: 2, duration: 1 }])
    const angles: number[] = []
    for (let t = 2; t < 3; t += 0.05) angles.push(only(shot, t).rotation)
    // It swings both ways about the authored angle, and comes back to it.
    expect(Math.max(...angles)).toBeGreaterThan(-30)
    expect(Math.min(...angles)).toBeLessThan(-30)
    expect(only(shot, 3.5).rotation).toBeCloseTo(-30)
  })
})

describe('landing a blow, which the pack has no clip for', () => {
  test('leans forward through a kick and comes back upright', () => {
    const shot = one([{ kind: 'kick', t: 2, duration: 0.5 }])
    expect(only(shot, 1.99).tilt).toBeCloseTo(0)
    expect(only(shot, 2.25).tilt).toBeGreaterThan(10)
    expect(only(shot, 2.6).tilt).toBeCloseTo(0)
  })

  test('lunges along the way the body is pointing, not along +x', () => {
    // Facing 90° is +x; facing 0° is +z. The same kick has to go two different
    // ways, or every contact in the studio happens due east.
    const kick: Action[] = [{ kind: 'kick', t: 2, duration: 0.5 }]
    const east = one(kick, { cast: [{ ...DEFAULT_ACTOR, rotation: 90, actions: kick }] })
    const north = one(kick, { cast: [{ ...DEFAULT_ACTOR, rotation: 0, actions: kick }] })
    expect(only(east, 2.25).x).toBeGreaterThan(0.1)
    expect(only(east, 2.25).z).toBeCloseTo(0, 1)
    expect(only(north, 2.25).z).toBeGreaterThan(0.1)
    expect(only(north, 2.25).x).toBeCloseTo(0, 1)
  })

  test('is back exactly where it started once the swing is over', () => {
    const shot = one([{ kind: 'hit', t: 2, duration: 0.5 }])
    expect(only(shot, 3).x).toBeCloseTo(0)
    expect(only(shot, 3).z).toBeCloseTo(0)
    expect(only(shot, 3).tilt).toBeCloseTo(0)
  })
})

describe('talking', () => {
  const line = 'We built the whole place ourselves.'
  const shot = () => one([{ kind: 'talk', t: 2, duration: 3, text: line }])

  test('says nothing before and after the clip', () => {
    expect(only(shot(), 1.9).say).toBeNull()
    expect(only(shot(), 5.1).say).toBeNull()
  })

  test('holds the line for exactly as long as the clip is', () => {
    expect(only(shot(), 2).say).toBe(line)
    expect(only(shot(), 4.99).say).toBe(line)
  })

  test('collects every line in the shot, in order, with who says it', () => {
    const two: ShotSpec = {
      ...DEFAULT_SHOT,
      cast: [
        { ...DEFAULT_ACTOR, avatar: 'fox', actions: [{ kind: 'talk', t: 4, duration: 1, text: 'Second' }] },
        { ...DEFAULT_ACTOR, avatar: 'panda', actions: [{ kind: 'talk', t: 1, duration: 1, text: 'First' }] },
      ],
    }
    expect(dialogue(two).map((entry) => entry.text)).toEqual(['First', 'Second'])
    expect(dialogue(two)[0].avatar).toBe('panda')
  })

  test('gives a longer line a longer default beat', () => {
    expect(talkDuration('Hi!')).toBeLessThan(talkDuration(line))
  })
})

describe('the voice, which is a schedule and not a sound', () => {
  test('gives each animal its own pitch, and the same one every time', () => {
    expect(voiceFor('fox')).toEqual(voiceFor('fox'))
    expect(voiceFor('fox').pitch).not.toBe(voiceFor('penguin').pitch)
  })

  test('makes one blip per letter and none for the spaces', () => {
    const blips = speechBlips('ab cd', voiceFor('fox'), 10)
    expect(blips).toHaveLength(4)
  })

  test('never runs a line past the bubble holding it', () => {
    const long = 'A very long line indeed, far more than a second of talking.'
    const blips = speechBlips(long, voiceFor('fox'), 1)
    const last = blips[blips.length - 1]
    expect(last.at + last.duration).toBeLessThanOrEqual(1.001)
  })

  test('leaves a short line alone rather than stretching it to fill', () => {
    const brief = speechBlips('Hey', voiceFor('fox'), 30)
    expect(brief[brief.length - 1].at).toBeLessThan(1)
  })

  test('says nothing at all for a line with no letters in it', () => {
    expect(speechBlips('...!?', voiceFor('fox'), 3)).toHaveLength(0)
  })
})

describe('clip time, which is what stops the feet sliding', () => {
  test('advances with distance rather than with the clock', () => {
    const shot = one(walk)
    expect(only(shot, 2).time).toBeCloseTo(2 / DEFAULT_ACTOR.stride)
    // Sampled just inside the end rather than at it: on the last instant the
    // peep has already stopped, and a stopped peep is on the idle clip, whose
    // time is measured in seconds rather than in blocks.
    expect(only(shot, 2.999).time).toBeCloseTo(3.998 / DEFAULT_ACTOR.stride, 2)
    expect(only(shot, 3).clip).toBe('idle')
  })

  test('takes twice the steps for twice the ground', () => {
    const slow = only(one(walk), 2).time
    const fast = only(one([{ kind: 'move', t: 1, duration: 2, x: 8, z: 0 }]), 2).time
    expect(fast).toBeCloseTo(slow * 2)
  })

  test('is continuous across the corner between two moves', () => {
    // The reason distance is walked from the top of the shot rather than
    // measured within the current move: sampling per-move restarts the cycle at
    // every corner, which is a peep re-planting its feet at each one.
    const shot = one([
      { kind: 'move', t: 0, duration: 2, x: 3, z: 0 },
      { kind: 'move', t: 2, duration: 1, x: 3, z: 4 },
    ])
    const before = only(shot, 1.99).time
    const after = only(shot, 2.01).time
    expect(Math.abs(after - before)).toBeLessThan(0.1)
    expect(after).toBeGreaterThan(before)
  })

  test('never divides by a zeroed stride', () => {
    const shot = one(walk, { cast: [{ ...DEFAULT_ACTOR, stride: 0, actions: walk }] })
    expect(Number.isFinite(only(shot, 2).time)).toBe(true)
  })
})

describe('emotes', () => {
  const shot = () =>
    one([
      { kind: 'emote', t: 2, duration: 3, emote: 5 },
      { kind: 'emote', t: 6, duration: 3, emote: 11 },
    ])

  test('are absent before they fire', () => {
    expect(only(shot(), 1.9).emote).toBeNull()
  })

  test('are up for as long as the clip says', () => {
    expect(only(shot(), 2).emote).toBe(5)
    expect(only(shot(), 4.9).emote).toBe(5)
    expect(only(shot(), 5.1).emote).toBeNull()
  })

  test('let a later one replace one still on screen', () => {
    const overlapping = one([
      { kind: 'emote', t: 2, duration: 3, emote: 5 },
      { kind: 'emote', t: 3, duration: 3, emote: 11 },
    ])
    expect(only(overlapping, 3.5).emote).toBe(11)
  })
})

describe('jumping', () => {
  const jumper = (air: boolean) => one([{ kind: 'jump', t: 2, duration: jumpLength(air), air }])

  test('is on the floor until the jump fires', () => {
    expect(only(jumper(false), 1.9).y).toBe(0)
    expect(only(jumper(false), 2).y).toBe(0)
  })

  test('is back on the floor after landing', () => {
    expect(only(jumper(false), 2 + JUMP_AIRTIME + 0.01).y).toBe(0)
    expect(only(jumper(false), 6).y).toBe(0)
  })

  test('clears the one block the lounge says it clears', () => {
    // The whole reason the arc reads the character controller's constants: a
    // shot of a jump that does not clear a block is a shot of a different game.
    expect(only(jumper(false), 2 + JUMP_AIRTIME / 2).y).toBeCloseTo(JUMP_PEAK, 3)
    expect(JUMP_PEAK).toBeGreaterThan(1)
  })

  test('goes higher on the second jump than on the first', () => {
    const single = only(jumper(false), 2 + JUMP_AIRTIME / 2).y
    const double = only(jumper(true), 2 + DOUBLE_JUMP_AIRTIME / 2).y
    expect(double).toBeGreaterThan(single)
    expect(DOUBLE_JUMP_PEAK).toBeGreaterThan(JUMP_PEAK)
  })

  test('never dips below the floor on the way through the arc', () => {
    for (const air of [false, true]) {
      const shot = jumper(air)
      for (let t = 1.5; t < 5; t += 0.01) {
        expect(only(shot, t).y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('rises and falls exactly once on a double jump', () => {
    // The air jump fires at the apex of the first, so the arc keeps climbing
    // through it - a peep who visibly dips in the middle has the second impulse
    // firing too late.
    const shot = jumper(true)
    const heights: number[] = []
    for (let t = 2; t < 2 + DOUBLE_JUMP_AIRTIME; t += 0.01) heights.push(only(shot, t).y)

    let turns = 0
    for (let i = 1; i < heights.length - 1; i += 1) {
      const rising = heights[i] > heights[i - 1]
      const stillRising = heights[i + 1] > heights[i]
      if (rising !== stillRising) turns += 1
    }
    expect(turns).toBe(1)
  })

  test('lets an actor jump in the middle of a walk without breaking the walk', () => {
    const shot = one([...walk, { kind: 'jump', t: 2, duration: JUMP_AIRTIME, air: false }])
    const mid = only(shot, 2.2)
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.x).toBeCloseTo(2.4)
    expect(mid.clip).toBe('walk')
  })

  test('takes the later jump when two overlap', () => {
    const shot = one([
      { kind: 'jump', t: 2, duration: JUMP_AIRTIME, air: false },
      { kind: 'jump', t: 2.2, duration: JUMP_AIRTIME, air: false },
    ])
    // 0.05s into the second jump, not 0.25s into the first.
    expect(only(shot, 2.25).y).toBeCloseTo(only(jumper(false), 2.05).y, 5)
  })
})

// ---------------------------------------------------------------------------

describe('keyframes, which override whatever a verb had in mind', () => {
  test('hold the last value past the end, and the node’s own before the start', () => {
    const keys = [
      { t: 2, value: 5, ease: 'linear' as const },
      { t: 4, value: 9, ease: 'linear' as const },
    ]
    expect(sampleKeys(keys, 0, 1.5)).toBe(1.5)
    expect(sampleKeys(keys, 2, 1.5)).toBe(5)
    expect(sampleKeys(keys, 3, 1.5)).toBe(7)
    expect(sampleKeys(keys, 99, 1.5)).toBe(9)
  })

  test('a lone key changes nothing before itself', () => {
    // The platform case: standing at 2, keyed to 3 at 0.3. Before the key the
    // ground value stands; from it, the key does - and keeps doing.
    const keys = [{ t: 0.3, value: 3, ease: 'smooth' as const }]
    expect(sampleKeys(keys, 0, 2)).toBe(2)
    expect(sampleKeys(keys, 0.29, 2)).toBe(2)
    expect(sampleKeys(keys, 0.3, 2)).toBe(3)
    expect(sampleKeys(keys, 8, 2)).toBe(3)
  })

  test('fall back when there is no key at all', () => {
    expect(sampleKeys(undefined, 3, 1.5)).toBe(1.5)
    expect(sampleKeys([], 3, 1.5)).toBe(1.5)
  })

  test('step rather than glide when the key holds', () => {
    const keys = [
      { t: 0, value: 0, ease: 'hold' as const },
      { t: 2, value: 10, ease: 'hold' as const },
    ]
    expect(sampleKeys(keys, 1.99, 0)).toBe(0)
    expect(sampleKeys(keys, 2, 0)).toBe(10)
  })

  test('beat a move that says otherwise', () => {
    const shot = one(walk, {
      cast: [
        {
          ...DEFAULT_ACTOR,
          actions: walk,
          tracks: {
            x: [
              { t: 0, value: -9, ease: 'linear' },
              { t: 10, value: -9, ease: 'linear' },
            ],
          },
        },
      ],
    })
    expect(only(shot, 2).x).toBeCloseTo(-9)
    // And the move still happened underneath: z is untouched, and the clip is
    // still the walking one, because the keys overrode a position and not a verb.
    expect(only(shot, 2).clip).toBe('walk')
  })

  test('move a block that has no verbs of its own', () => {
    const shot: ShotSpec = {
      ...DEFAULT_SHOT,
      blocks: [
        {
          model: 'crate',
          x: 0,
          top: 1,
          z: 0,
          rotation: 0,
          tracks: {
            top: [
              { t: 0, value: 1, ease: 'linear' },
              { t: 4, value: 5, ease: 'linear' },
            ],
          },
        },
      ],
    }
    expect(sceneAt(shot, 2).blocks[0].top).toBeCloseTo(3)
    expect(sceneAt(shot, 2).blocks[0].model).toBe('crate')
  })

  test('dim the rig without the rig knowing about time', () => {
    const shot: ShotSpec = {
      ...DEFAULT_SHOT,
      light: {
        ...DEFAULT_SHOT.light,
        sun: 2,
        tracks: {
          sun: [
            { t: 0, value: 2, ease: 'linear' },
            { t: 4, value: 0, ease: 'linear' },
          ],
        },
      },
    }
    expect(sceneAt(shot, 2).light.sun).toBeCloseTo(1)
  })

  test('never leave a `tracks` field on the scene the renderer is handed', () => {
    const scene = sceneAt(DEFAULT_SHOT, 1)
    for (const block of scene.blocks) expect('tracks' in block).toBe(false)
    expect('tracks' in scene.light).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('sampling is total', () => {
  test('gives a complete scene at any time at all', () => {
    for (const t of [-100, -0.001, 0, 0.5, 8, 1e6, Number.MIN_VALUE]) {
      const scene = sceneAt(DEFAULT_SHOT, t)
      expect(scene.peeps).toHaveLength(DEFAULT_SHOT.cast.length)
      for (const peep of scene.peeps) {
        expect(Number.isFinite(peep.x)).toBe(true)
        expect(Number.isFinite(peep.z)).toBe(true)
        expect(Number.isFinite(peep.time)).toBe(true)
        expect(Number.isFinite(peep.rotation)).toBe(true)
        expect(Number.isFinite(peep.tilt)).toBe(true)
      }
      for (const axis of scene.camera.position) expect(Number.isFinite(axis)).toBe(true)
    }
  })

  test('survives a move of no length instead of returning NaN', () => {
    const shot = one([
      { kind: 'move', t: 0, duration: 0.001, x: 1, z: 0 },
      { kind: 'move', t: 2, duration: 0.001, x: 6, z: 0 },
    ])
    for (const t of [0, 1, 2, 2.5, 3]) {
      expect(Number.isFinite(only(shot, t).x)).toBe(true)
      expect(Number.isFinite(only(shot, t).time)).toBe(true)
    }
  })

  test('a new action of every kind samples cleanly at its own moment', () => {
    // The add buttons build these, so every one of them has to be legal input
    // to the sampler the instant it lands.
    for (const kind of ['move', 'turn', 'jump', 'kick', 'hit', 'shake', 'dance', 'talk', 'emote'] as const) {
      const action = newAction(kind, 2, { x: 1, z: 1, rotation: 45 })
      const peep = only(one([action]), 2.1)
      expect(Number.isFinite(peep.x)).toBe(true)
      expect(Number.isFinite(peep.rotation)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------

describe('the camera', () => {
  test('is locked off when there is one key', () => {
    const shot = one([])
    expect(sceneAt(shot, 0).camera.position).toEqual(DEFAULT_SHOT.camera[0].position)
    expect(sceneAt(shot, 7).camera.position).toEqual(DEFAULT_SHOT.camera[0].position)
  })

  test('passes exactly through its keys', () => {
    const shot = one([], {
      ease: false,
      camera: [
        { t: 0, position: [10, 5, 10], target: [0, 1, 0], fov: 40 },
        { t: 4, position: [2, 2, 2], target: [1, 1, 1], fov: 20 },
      ],
    })
    expect(sceneAt(shot, 0).camera.position[0]).toBeCloseTo(10)
    expect(sceneAt(shot, 4).camera.position[0]).toBeCloseTo(2)
    expect(sceneAt(shot, 4).camera.fov).toBeCloseTo(20)
  })

  test('holds the first and last framing outside the keyed range', () => {
    const shot = one([], {
      camera: [
        { t: 2, position: [10, 5, 10], target: [0, 1, 0], fov: 40 },
        { t: 4, position: [2, 2, 2], target: [0, 1, 0], fov: 20 },
      ],
    })
    expect(sceneAt(shot, 0).camera.position[0]).toBeCloseTo(10)
    expect(sceneAt(shot, 9).camera.position[0]).toBeCloseTo(2)
  })

  test('eases out of a key rather than leaving at full speed', () => {
    const keys: ShotSpec['camera'] = [
      { t: 0, position: [0, 0, 0], target: [0, 0, 0], fov: 40 },
      { t: 4, position: [40, 0, 0], target: [0, 0, 0], fov: 40 },
    ]
    const eased = sceneAt(one([], { ease: true, camera: keys }), 0.4).camera.position[0]
    const linear = sceneAt(one([], { ease: false, camera: keys }), 0.4).camera.position[0]
    expect(eased).toBeLessThan(linear)
  })

  test('interpolates fov without overshooting into a lens nobody asked for', () => {
    const shot = one([], {
      camera: [
        { t: 0, position: [10, 5, 10], target: [0, 1, 0], fov: 20 },
        { t: 2, position: [8, 4, 8], target: [0, 1, 0], fov: 60 },
        { t: 4, position: [6, 3, 6], target: [0, 1, 0], fov: 20 },
      ],
    })
    for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]) {
      const { fov } = sceneAt(shot, t).camera
      expect(fov).toBeGreaterThanOrEqual(20)
      expect(fov).toBeLessThanOrEqual(60)
    }
  })
})

// ---------------------------------------------------------------------------

describe('a round trip', () => {
  test('gives back exactly what went in', () => {
    expect(decodeShot(encodeShot(DEFAULT_SHOT))).toEqual(DEFAULT_SHOT)
  })

  test('keeps keyframes through a link', () => {
    const shot: ShotSpec = {
      ...DEFAULT_SHOT,
      light: {
        ...DEFAULT_SHOT.light,
        tracks: { sun: [{ t: 1, value: 3, ease: 'smooth' }] },
      },
    }
    expect(decodeShot(encodeShot(shot)).light.tracks.sun).toHaveLength(1)
  })

  test('encodes to something a URL, a chat client and a shell leave alone', () => {
    expect(encodeShot(DEFAULT_SHOT)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('carries a set as a reference, so the link stays short', () => {
    // See the same pair in scene.test.ts: a shot with a world in it used to
    // encode to fourteen kilobytes, which is a URL no server accepts.
    const shot: ShotSpec = { ...DEFAULT_SHOT, set: { worldId: '3f7c1c2e-9a4b-4d1e-8c55-1b2a3c4d5e6f' } }
    const encoded = encodeShot(shot)
    expect(decodeShot(encoded).set).toEqual(shot.set)
    expect(encoded.length).toBeLessThan(4_000)
  })

  test('hands the set on to the scene it samples', () => {
    // `sceneAt` is what every renderer draws, so a set that stopped here would
    // be a set nothing ever drew.
    const shot: ShotSpec = { ...DEFAULT_SHOT, set: { worldId: '3f7c1c2e-9a4b-4d1e-8c55-1b2a3c4d5e6f' } }
    expect(sceneAt(shot, 2.5).set).toEqual(shot.set)
  })
})

describe('the glow, which is party mode with a clock', () => {
  const glowing = (mode: 'off' | 'colour' | 'rainbow') =>
    one([], {
      cast: [{ ...DEFAULT_ACTOR, glow: { mode, colour: '#ff3ec8', sparkle: true, strength: 1 } }],
    })

  test('is absent when it is off, which is the default', () => {
    expect(only(glowing('off'), 2).glow).toBeNull()
    expect(only(one([]), 2).glow).toBeNull()
  })

  test('is the chosen colour, and stays it', () => {
    // A fixed hue must not drift with the playhead, or a locked-off colour
    // would be a slow rainbow nobody asked for.
    expect(only(glowing('colour'), 0).glow?.colour).toBe('#ff3ec8')
    expect(only(glowing('colour'), 7).glow?.colour).toBe('#ff3ec8')
  })

  test('a rainbow turns with the playhead rather than with the wall clock', () => {
    // The property the whole module rests on: sampling the same moment twice
    // gives the same colour, so a recording is reproducible.
    const shot = glowing('rainbow')
    expect(only(shot, 1).glow?.colour).toBe(only(shot, 1).glow?.colour)
    expect(only(shot, 1).glow?.colour).not.toBe(only(shot, 2).glow?.colour)
  })

  test('a rainbow comes back round to where it started', () => {
    // Sixty degrees a second, so six seconds is a full turn of the wheel.
    const shot = glowing('rainbow')
    expect(only(shot, 0).glow?.colour).toBe(only(shot, 6).glow?.colour)
  })

  test('always resolves to something a material can take', () => {
    const shot = glowing('rainbow')
    for (let t = -2; t < 12; t += 0.37) {
      expect(only(shot, t).glow?.colour).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  test('survives the round trip through a link', () => {
    const shot = glowing('rainbow')
    expect(decodeShot(encodeShot(shot))).toEqual(shot)
  })

  test('a lifted still keeps its hue rather than starting to cycle', () => {
    const lifted = shotFromScene({
      ...DEFAULT_SCENE,
      peeps: [
        { ...DEFAULT_SCENE.peeps[0], glow: { colour: '#00ff88', sparkle: false, strength: 2 } },
      ],
    })
    expect(lifted.cast[0].glow).toMatchObject({ mode: 'colour', colour: '#00ff88', strength: 2 })
  })
})

describe('the backdrop', () => {
  test('reads a link written when it was just a colour', () => {
    const shot = parseShot({ background: '#ff0000' })
    expect(shot.background).toEqual({ colour: '#ff0000', image: null })
  })

  test('takes a picture of ours', () => {
    expect(parseShot({ background: { colour: '#000000', image: '/bg.png' } }).background.image).toBe(
      '/bg.png',
    )
  })

  test('refuses a picture that would taint the canvas', () => {
    // Every one of these records as a SecurityError at the export rather than
    // as a wrong-looking backdrop, which is why they are refused at the door.
    for (const image of [
      'https://evil.example/x.png',
      '//evil.example/x.png',
      'data:image/png;base64,AAAA',
      'bg.png',
      42,
    ]) {
      expect(parseShot({ background: { colour: '#000000', image } }).background.image).toBeNull()
    }
  })

  test('falls back to the default colour rather than an unpaintable one', () => {
    expect(parseShot({ background: { colour: 'rebeccapurple' } }).background.colour).toBe(
      DEFAULT_SHOT.background.colour,
    )
  })
})

describe('a link that has been damaged', () => {
  test('falls back to the default shot rather than throwing', () => {
    const encoded = encodeShot(DEFAULT_SHOT)
    for (const broken of [
      encoded.slice(0, encoded.length - 12),
      encoded.slice(4),
      'not base64 at all !!',
      '',
      undefined,
    ]) {
      expect(() => decodeShot(broken)).not.toThrow()
    }
  })

  test('drops an action nobody can name', () => {
    const shot = parseShot({
      cast: [{ avatar: 'fox', actions: [{ kind: 'moonwalk', t: 1 }, { kind: 'kick', t: 2, duration: 0.5 }] }],
    })
    expect(shot.cast[0].actions.map((action) => action.kind)).toEqual(['kick'])
  })

  test('drops an emote that points at no emote, and a line with nothing in it', () => {
    const shot = parseShot({
      cast: [
        {
          avatar: 'fox',
          actions: [
            { kind: 'emote', t: 1, duration: 3, emote: 9999 },
            { kind: 'talk', t: 2, duration: 2, text: '   ' },
            { kind: 'emote', t: 3, duration: 3, emote: 3 },
          ],
        },
      ],
    })
    expect(shot.cast[0].actions).toHaveLength(1)
    expect(shot.cast[0].actions[0]).toMatchObject({ kind: 'emote', emote: 3 })
  })

  test('orders actions the author added by scrubbing backwards', () => {
    const shot = parseShot({
      cast: [
        {
          avatar: 'fox',
          actions: [
            { kind: 'kick', t: 4, duration: 0.5 },
            { kind: 'hit', t: 1, duration: 0.5 },
          ],
        },
      ],
    })
    expect(shot.cast[0].actions.map((action) => action.t)).toEqual([1, 4])
  })

  test('gives a jump the length the game says, whatever the link claimed', () => {
    const shot = parseShot({
      cast: [{ avatar: 'fox', actions: [{ kind: 'jump', t: 1, duration: 40, air: false }] }],
    })
    expect(shot.cast[0].actions[0].duration).toBeCloseTo(JUMP_AIRTIME)
  })

  test('drops a keyed property no inspector could edit', () => {
    const shot = parseShot({
      light: { sun: 2, tracks: { sun: [{ t: 0, value: 1 }], nonsense: [{ t: 0, value: 1 }] } },
    })
    expect(Object.keys(shot.light.tracks)).toEqual(['sun'])
  })

  test('never keeps a camera track with no keys in it', () => {
    expect(parseShot({ camera: [] }).camera.length).toBeGreaterThan(0)
  })
})

describe('a link written before actions existed', () => {
  /** Exactly the shape the old document had. */
  const old = {
    cast: [
      {
        avatar: 'fox',
        rotation: -30,
        stride: 1.6,
        path: [
          { t: 1, x: 0, z: 0 },
          { t: 3, x: 4, z: 0 },
        ],
        jumps: [{ t: 2, air: false }],
        emotes: [{ t: 5, emote: 7 }],
      },
    ],
  }

  test('walks the same path it always walked', () => {
    const shot = parseShot(old)
    expect(only(shot, 1).x).toBeCloseTo(0)
    expect(only(shot, 2).x).toBeCloseTo(2)
    expect(only(shot, 3).x).toBeCloseTo(4)
    expect(only(shot, 2).clip).toBe('walk')
  })

  test('keeps the jump and the emote that were on it', () => {
    const shot = parseShot(old)
    expect(only(shot, 2.2).y).toBeGreaterThan(0)
    expect(only(shot, 5.5).emote).toBe(7)
  })

  test('leaves nobody standing at the origin who was not', () => {
    // The old document's home was its first waypoint. Losing that would move
    // every cast member in every bookmarked shot to 0,0.
    expect(only(parseShot(old), 0).x).toBeCloseTo(0)
    const offset = parseShot({ cast: [{ avatar: 'fox', path: [{ t: 0, x: 5, z: -3 }] }] })
    expect(only(offset, 0).x).toBeCloseTo(5)
    expect(only(offset, 0).z).toBeCloseTo(-3)
  })
})

// ---------------------------------------------------------------------------

describe('lifting a still into a shot', () => {
  test('leaves everybody standing where they stood', () => {
    const shot = shotFromScene(DEFAULT_SCENE)
    const back = sceneAt(shot, 0)
    for (const [i, peep] of DEFAULT_SCENE.peeps.entries()) {
      expect(back.peeps[i].x).toBeCloseTo(peep.x)
      expect(back.peeps[i].z).toBeCloseTo(peep.z)
      expect(back.peeps[i].rotation).toBeCloseTo(peep.rotation)
      expect(back.peeps[i].avatar).toBe(peep.avatar)
    }
  })

  test('keeps the framing and the emotes the still was composed with', () => {
    const shot = shotFromScene(DEFAULT_SCENE)
    const back = sceneAt(shot, 0)
    expect(back.camera.position).toEqual(DEFAULT_SCENE.camera.position)
    expect(back.camera.fov).toBe(DEFAULT_SCENE.camera.fov)
    expect(back.peeps.map((peep) => peep.emote)).toEqual(
      DEFAULT_SCENE.peeps.map((peep) => peep.emote),
    )
  })

  test('survives the round trip through a link', () => {
    const shot = shotFromScene(DEFAULT_SCENE)
    expect(decodeShot(encodeShot(shot))).toEqual(shot)
  })
})

/**
 * The rainbow, which is the world's version of the glow above.
 *
 * Same shape of problem and the same answer: a mode in the document, an instant
 * out of `sceneAt`, so what the renderer is handed is where the sweep has got
 * to on this frame and a recording made twice is the same file twice.
 */
describe('the rainbow, which is a mode with a playhead', () => {
  const glass = (fields: Partial<ShotSpec['rainbow']> = {}) =>
    one([], { rainbow: { world: true, props: false, start: 0, speed: 1, ...fields } })

  test('is absent by default, so an old link opens as its author left it', () => {
    expect(sceneAt(one([]), 3).rainbow).toBeNull()
    expect(parseShot({}).rainbow).toEqual({ world: false, props: false, start: 0, speed: 1 })
  })

  test('is absent when neither switch is on, whatever the speed', () => {
    const shot = one([], { rainbow: { world: false, props: false, start: 0, speed: 3 } })
    expect(sceneAt(shot, 4).rainbow).toBeNull()
  })

  test('carries the two switches through to the scene', () => {
    expect(sceneAt(glass({ props: true }), 0).rainbow).toEqual({
      world: true,
      props: true,
      phase: 0,
    })
  })

  test('sweeps with the playhead rather than with the wall clock', () => {
    // The property the whole module rests on. Sampling the same moment twice
    // gives the same phase, which is what makes an export reproducible.
    const shot = glass()
    expect(sceneAt(shot, 2).rainbow?.phase).toBe(sceneAt(shot, 2).rainbow?.phase)
    expect(sceneAt(shot, 2).rainbow?.phase).toBe(2)
    expect(sceneAt(shot, 5).rainbow?.phase).toBe(5)
  })

  test('runs at the speed it was given, and freezes at zero', () => {
    expect(sceneAt(glass({ speed: 2 }), 3).rainbow?.phase).toBe(6)
    // A frozen rainbow is a legitimate shot: the colours sit where they start.
    expect(sceneAt(glass({ speed: 0 }), 3).rainbow?.phase).toBe(0)
    expect(sceneAt(glass({ speed: 0 }), 9).rainbow?.phase).toBe(0)
  })

  test('never sweeps backwards before the shot starts', () => {
    // A camera ease can sample before zero, and a negative phase would run the
    // band the wrong way for the first frames of the file.
    expect(sceneAt(glass(), -2).rainbow?.phase).toBe(0)
  })

  test('survives the round trip through a link', () => {
    const shot = glass({ props: true, speed: 2.5 })
    expect(decodeShot(encodeShot(shot)).rainbow).toEqual(shot.rainbow)
  })

  test('clamps a hand-typed speed rather than dropping the mode', () => {
    expect(parseShot({ rainbow: { world: true, speed: 99 } }).rainbow.speed).toBe(8)
    expect(parseShot({ rainbow: { world: true, speed: -3 } }).rainbow.speed).toBe(0)
    expect(parseShot({ rainbow: { world: true, speed: 'fast' } }).rainbow).toEqual({
      world: true,
      props: false,
      start: 0,
      speed: 1,
    })
  })
})

describe('a still with a rainbow, lifted into a shot', () => {
  const still = {
    ...DEFAULT_SCENE,
    rainbow: { world: true, props: true, phase: 3.5 },
  }

  test('opens on exactly the frame that was composed', () => {
    // The reason the track has a start at all. A lift that always began at zero
    // would open on different colours than the still somebody arranged, which
    // is the arrangement quietly lost.
    expect(sceneAt(shotFromScene(still), 0).rainbow).toEqual(still.rainbow)
  })

  test('stays there rather than starting to sweep', () => {
    // The same decision the glow makes one field up: a lifted colour keeps its
    // hue instead of beginning to cycle. Turning the speed up is a choice.
    const shot = shotFromScene(still)
    expect(sceneAt(shot, 6).rainbow?.phase).toBe(3.5)
  })

  test('a still without one lifts into a shot without one', () => {
    expect(sceneAt(shotFromScene(DEFAULT_SCENE), 2).rainbow).toBeNull()
  })
})
