import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  easeSpeed,
  HYSTERESIS,
  motionFor,
  poseFor,
  rateFor,
  RUN_ABOVE,
  STILL,
  type Motion,
} from '@/app/xp/_runtime/body/motion'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'
import { SPRINT_PACE, WALK_PACE } from '@kxb/xp/engine'

/**
 * What a body is doing, checked without watching it.
 *
 * Every assertion here is about something a screenshot cannot show. A single
 * frame cannot tell you whether the walk is *flickering* into a run, whether the
 * feet are skating, or whether a landing is restarting sixty times a second -
 * and the Browser pane never gives you even the one frame.
 */

const walking = { speed: WALK_PACE, grounded: true, velocityY: 0 }
const sprinting = { speed: SPRINT_PACE, grounded: true, velocityY: 0 }
const standing = { speed: 0, grounded: true, velocityY: 0 }

/** Every state a body can be in, so a new one cannot be added untested. */
/**
 * Every motion, and the type is what says so.
 *
 * It was a hand-written array with `satisfies readonly Motion[]`, which only
 * checks that each entry *is* a motion - never that every motion is an entry.
 * So `hit` was added to the union and both sweeps below quietly skipped it: the
 * one that proves a clip exists in the pack, and the one that proves a moving
 * motion loops. A clip name that does not resolve is a body standing in its bind
 * pose with nothing in any console, which is the exact failure those two exist
 * to catch, and they would have missed it.
 *
 * `Record<Motion, true>` is the version that cannot be forgotten - leave one out
 * and this does not compile.
 */
const MOTIONS = Object.keys({
  idle: true,
  walk: true,
  run: true,
  air: true,
  land: true,
  dead: true,
  dance: true,
  shoot: true,
  hit: true,
  attack: true,
} satisfies Record<Motion, true>) as readonly Motion[]

describe('what a body is doing', () => {
  test('standing still is idle, and leaning on a wall still counts', () => {
    /**
     * A body resting against a wall reports a fraction of a cell a second from
     * the collision slide. A walk cycle playing at a fiftieth speed because
     * somebody is leaning on a doorframe is worse than an idle, which is why the
     * threshold is not zero.
     */
    expect(motionFor(standing, 'idle')).toBe('idle')
    expect(motionFor({ ...standing, speed: STILL / 2 }, 'idle')).toBe('idle')
  })

  test('walking pace walks and sprint pace runs', () => {
    expect(motionFor(walking, 'idle')).toBe('walk')
    expect(motionFor(sprinting, 'walk')).toBe('run')
  })

  test('off the ground beats everything, including having just landed', () => {
    /**
     * A body that leaves the ground on the frame it touched it - bouncing down a
     * staircase, or spending the second jump - is in the air. Playing a landing
     * while rising is the one combination that reads as a bug rather than a
     * compromise.
     */
    expect(motionFor({ ...sprinting, grounded: false, velocityY: 6 }, 'land')).toBe('air')
    expect(motionFor({ ...standing, grounded: false, velocityY: -6 }, 'idle')).toBe('air')
  })
})

describe('the band, which is the whole reason this is a state machine', () => {
  test('a speed sitting on the boundary does not flicker', () => {
    /**
     * The bug this exists for, and it is invisible in a screenshot: a player
     * holding a corner or brushing a wall sits within a hair of the walk/run
     * boundary, and a bare threshold snaps the body between two clips several
     * times a second. That reads as a broken model rather than as a speed.
     *
     * Driven here as an actual wobble rather than asserted as a property,
     * because the wobble is the thing that used to break it.
     */
    let motion: Motion = 'walk'
    const seen = new Set<Motion>()

    for (let i = 0; i < 40; i++) {
      // A tenth of a cell a second either side of the line, sixty times a second.
      const speed = RUN_ABOVE + (i % 2 === 0 ? 0.1 : -0.1)
      motion = motionFor({ speed, grounded: true, velocityY: 0 }, motion)
      seen.add(motion)
    }

    expect([...seen]).toEqual(['walk'])
  })

  test('both real paces sit clear of the band, on their own side', () => {
    /**
     * The bug the first draft had, and the reason the boundary is the midpoint
     * rather than `WALK_PACE + 1`: that put walking pace *inside* the band, so a
     * body that had been running and slowed to a walk stayed in the run clip
     * forever. Whichever motion you were in, the controller's own two paces have
     * to be unambiguous.
     */
    for (const was of ['walk', 'run'] as const) {
      expect(motionFor(walking, was)).toBe('walk')
      expect(motionFor(sprinting, was)).toBe('run')
    }
  })

  test('but a real change of pace still changes the clip', () => {
    /**
     * The other half of the pair. Without it the test above passes for a state
     * machine that never changes its mind at all, which would be a body that
     * walks at sprint pace forever.
     */
    expect(motionFor(sprinting, 'walk')).toBe('run')
    expect(motionFor(walking, 'run')).toBe('walk')
  })

  test('entering a run costs more than leaving it', () => {
    // The asymmetry *is* the hysteresis. A speed that would start a run from a
    // walk must not be one that also ends a run from a run.
    const justOver = RUN_ABOVE + HYSTERESIS / 2
    expect(motionFor({ speed: justOver, grounded: true, velocityY: 0 }, 'walk')).toBe('walk')
    expect(motionFor({ speed: justOver, grounded: true, velocityY: 0 }, 'run')).toBe('run')
  })
})

describe('landing', () => {
  test('is entered from the air and only from the air', () => {
    expect(motionFor(standing, 'air')).toBe('land')
  })

  test('and does not restart itself every frame', () => {
    /**
     * A body standing still after a jump would otherwise re-enter `land` on
     * every frame and never reach idle - a landing animation stuck on a loop,
     * which is precisely what a one-shot clip must not do.
     */
    let motion = motionFor(standing, 'air')
    expect(motion).toBe('land')
    motion = motionFor(standing, motion)
    expect(motion).toBe('idle')
  })

  test('and running out of a landing goes straight to running', () => {
    // Landing at speed is the normal case on a course, not the exception.
    expect(motionFor(sprinting, 'land')).toBe('run')
  })
})

describe('the clips, and how fast they play', () => {
  test('every motion names a clip, and only the landing is a one-shot', () => {
    // An armed idle is a one-shot too - it raises and holds - so the unarmed
    // list below is checked against the unarmed pose only.
    // Every gesture is one, necessarily: a punch that looped would be a body
    // swinging until something else happened to it.
    const oneShots = ['land', 'dead', 'shoot', 'hit', 'attack']
    for (const motion of MOTIONS) {
      expect(poseFor(motion).clip.length).toBeGreaterThan(2)
      expect(poseFor(motion).loop).toBe(!oneShots.includes(motion))
      // An armed body is still a body: whatever it swaps for a *moving* motion
      // has to loop the same way, or a walk would stop on its first frame.
      // Idle is deliberately not in that set - see the armed-idle test below.
      if (motion !== 'idle') expect(poseFor(motion, true).loop).toBe(poseFor(motion).loop)
    }
  })

  test('the feet do not skate: pace decides the playback rate', () => {
    /**
     * The single most recognisable sign of an animation bolted on rather than
     * driven. A walk cycle authored at one pace and played at a fixed rate while
     * the body moves at another slides the feet along the floor.
     */
    expect(rateFor('walk', WALK_PACE)).toBeCloseTo(1, 6)
    expect(rateFor('run', SPRINT_PACE)).toBeCloseTo(1, 6)
    expect(rateFor('walk', WALK_PACE / 2)).toBeLessThan(1)
  })

  /**
   * The touch stick's whole range, not just the keyboard's one speed.
   *
   * The stick is analog and squared - the first half of the throw is for
   * aiming - so on a phone nearly all walking happens well under `WALK_PACE`.
   * The floor used to sit at 0.55, which pinned every one of those speeds to
   * the same stride and slid the feet: the walking speed and the animation
   * were not in sync, and only on phones, because keys never produce a speed
   * the floor could catch.
   */
  test('a half-pace touch walk plays exactly in step', () => {
    expect(rateFor('walk', WALK_PACE / 2)).toBeCloseTo(0.5, 6)
    expect(rateFor('walk', WALK_PACE * 0.3)).toBeCloseTo(0.3, 6)
  })

  test('but not so slowly that the body looks broken', () => {
    // The fix has a limit: a body barely off the dead zone wants a slow walk
    // and a little skating, not legs moving so slowly it reads as a stall.
    expect(rateFor('walk', 0.2)).toBeGreaterThanOrEqual(0.3)
    expect(rateFor('run', SPRINT_PACE * 4)).toBeLessThan(2)
  })

  test('being dead is handed in, never inferred', () => {
    /**
     * A corpse and somebody standing still report the same speed and the same
     * footing, so no amount of looking at movement can tell them apart. The
     * caller knows; this decides the other five. A state machine that returned
     * `dead` would be guessing, and would guess wrong every time somebody stood
     * still.
     */
    for (const was of ['idle', 'walk', 'run', 'air', 'land', 'dead'] as const) {
      expect(motionFor(standing, was)).not.toBe('dead')
      expect(motionFor(sprinting, was)).not.toBe('dead')
    }
  })

  test('a clip with no pace behind it plays at its own speed', () => {
    // Idle, air and landing are not driven by how fast anybody is going.
    expect(rateFor('idle', 0)).toBe(1)
    expect(rateFor('air', 12)).toBe(1)
    expect(rateFor('land', 12)).toBe(1)
  })
})

describe('the clips it names are really in the pack', () => {
  /**
   * The one thing about animation that *can* be checked without watching it.
   *
   * A clip name that does not resolve is not an error anywhere - three.js is
   * handed nothing, the mixer plays nothing, and the body stands in its bind
   * pose looking like a shop dummy. There is no exception, no warning and
   * nothing in a console. So the names are checked against the files rather than
   * trusted, which turns a silent T-pose into a failing test.
   *
   * It also pins the pack itself: renaming a file, or a pack update that renames
   * `Idle_A`, fails here instead of on somebody's screen.
   */
  const GLBS = path.join(
    import.meta.dir, '..', '..', '..', '..', '..',
    'public', 'xp', 'packs', 'animation', 'Rig_Medium',
  )

  /** The clip names inside a .glb, read out of its JSON chunk. */
  const clipsIn = (file: string): string[] => {
    const buffer = readFileSync(path.join(GLBS, file))
    const length = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'))
    return (json.animations ?? []).map((clip: { name: string }) => clip.name)
  }

  /**
   * What a body can play, from the generated list rather than from a copy.
   *
   * This used to name the three source files itself, which made it a **fourth**
   * place holding that list - beside `SOURCES` in ./skinned, the generator that
   * reads it, and the file the generator writes. Adding the melee file to the
   * runtime therefore failed here, on a clip that was genuinely available, for
   * no reason except that this line had not been edited too.
   *
   * `clips.generated.ts` is produced by `bun run xp:clips` *from* `SOURCES`, so
   * reading it means this test asks the runtime what it loads. That the
   * generated list is not itself stale is ./clips.test's job, which compares it
   * against the files the script reads.
   */
  const available = new Set<string>(CLIPS)

  test('every motion resolves to a clip that exists', () => {
    for (const motion of MOTIONS) {
      for (const armed of [false, true]) {
        const { clip } = poseFor(motion, armed)
        // Both hands' worth. A clip named here and absent from the pack is a
        // body frozen in its last pose - silent, and exactly what this catches.
        expect({ motion, armed, has: available.has(clip) }).toEqual({ motion, armed, has: true })
      }
    }
  })

  test('and the dummy is the skeleton those clips were authored for', () => {
    /**
     * The check §F asks for - "a clip on the wrong rig is a body folded inside
     * out" - and the answer that made this a day rather than a fortnight. The
     * dummy is skinned and its joints are `Rig_Medium`'s, name for name, so
     * three.js binds every track by name with no retargeting step at all.
     *
     * If somebody swaps the body model for one with a different skeleton, this
     * is what says so.
     */
    const skinOf = (file: string) => {
      const buffer = readFileSync(file)
      const length = buffer.readUInt32LE(12)
      const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'))
      const joints: number[] = json.skins?.[0]?.joints ?? []
      return new Set(joints.map((i: number) => json.nodes[i].name as string))
    }

    const rig = skinOf(path.join(GLBS, 'Rig_Medium_MovementBasic.glb'))
    const dummy = skinOf(
      path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'packs', 'dummy', 'Dummy.glb'),
    )

    expect(rig.size).toBeGreaterThan(20)
    expect([...rig].filter((bone) => !dummy.has(bone))).toEqual([])
  })
})

/**
 * Smoothing the speed the animation is driven by.
 *
 * The failure being prevented is specific and was reported from a real match:
 * bodies over the network "keep lagging". The positions are fine - `Crowd`
 * interpolates them - and it is the *derivative* that is not, because a value
 * interpolated between 8 Hz samples has a piecewise-constant slope with a step
 * at every packet and a hole at every dropped one.
 *
 * These feed `easeSpeed` the shape a real network produces and assert the legs
 * never see it. Every one of them fails against the raw measurement, which is
 * the only reason they are worth having.
 */
describe('easeSpeed', () => {
  /** Sixty frames a second, which is what the numbers below are in. */
  const FRAME = 1 / 60

  test('a gap in the packets does not stop the feet', () => {
    /**
     * The exact shape of the bug that was reported from a live match. A body
     * running at 9 has a packet go missing, so the buffer holds the last sample
     * and the position stops changing for eight frames.
     *
     * The measurement taken from that is zero, and zero is `motionFor` deciding
     * the body is idle - a runner who stands to attention mid-stride. The point
     * of passing `null` is that a frozen position is an *absence* of information
     * rather than a measurement of stillness.
     */
    let eased = 9
    for (let frame = 0; frame < 8; frame++) eased = easeSpeed(eased, null, FRAME)

    expect(eased).toBe(9)
    expect(motionFor({ speed: eased, grounded: true, velocityY: 0 }, 'run')).toBe('run')
    // And what deriving a number from the frozen position would have said.
    expect(motionFor({ speed: 0, grounded: true, velocityY: 0 }, 'run')).toBe('idle')
  })

  test('and the catch-up spike afterwards is not a sprint', () => {
    /**
     * The other half of the same dropped packet: the frame the buffer picks up
     * again, the drawn position covers the whole gap at once, which differentiates
     * to something like 60 cells a second. Unclamped and unsmoothed that latches
     * a run out of one bad frame.
     */
    const eased = easeSpeed(4, 67, FRAME)
    expect(eased).toBeLessThan(RUN_ABOVE)
    // Still moving, though - the frame is noisy, not meaningless.
    expect(eased).toBeGreaterThan(4)
  })

  test('nothing goes faster than a sprint', () => {
    // A teleport is not a gait, and the fastest clip is already playing.
    expect(easeSpeed(SPRINT_PACE, 500, 10)).toBeCloseTo(SPRINT_PACE, 5)
  })

  test('somebody who really stops does stop', () => {
    /**
     * The cost of all of the above, bounded. A body still sending packets from
     * the same spot is genuinely standing still - `settled` is false, the
     * measurement is real - and smoothing that outlived the halt would be
     * moonwalking, which is a worse artefact than the one being fixed.
     */
    let eased = 9
    for (let frame = 0; frame * FRAME < 0.25; frame++) eased = easeSpeed(eased, 0, FRAME)
    expect(eased).toBeLessThan(STILL)
  })

  test('the same gait at 60 and at 144 frames a second', () => {
    /**
     * Why it is `1 - e^(-dt/T)` and not a fixed fraction per frame. A body must
     * not walk differently because somebody has a better monitor, and the naive
     * `previous + (measured - previous) * 0.1` does exactly that.
     */
    const settle = (step: number) => {
      let eased = 0
      for (let elapsed = 0; elapsed < 0.25; elapsed += step) eased = easeSpeed(eased, 9, step)
      return eased
    }
    expect(Math.abs(settle(1 / 60) - settle(1 / 144))).toBeLessThan(0.15)
  })

  test('a frame with no time in it changes nothing', () => {
    // Two `useFrame` callbacks in the same tick, or a delta clamped to zero.
    // Neither is a reason for the legs to move.
    expect(easeSpeed(7, 0, 0)).toBe(7)
  })
})


/**
 * Standing about with a gun.
 *
 * Reported as "the weapon is not in the right position". The attachment was
 * never wrong - the gun follows the hand bone faithfully - and the pose was: an
 * unarmed idle hangs the arms at the sides, so a gun held correctly in that hand
 * sits at hip height pointing sideways, which is what the screenshot showed.
 */
describe('an armed body', () => {
  test('aims instead of standing empty-handed', () => {
    expect(poseFor('idle', true).clip).toBe('Ranged_1H_Aiming')
    expect(poseFor('idle', false).clip).toBe('Idle_A')
  })

  test('and raises the weapon once rather than over and over', () => {
    /**
     * `Ranged_1H_Aiming` is a verb, not a noun: it is the act of bringing a
     * weapon up. Looped, the body keeps lifting the gun and never holds it,
     * which is how this was reported.
     *
     * The first version of this test asserted the opposite, on the reasoning
     * that a one-shot would freeze the body. It does freeze it - on the last
     * frame of a raise, which is the aim - and `clampWhenFinished` in ./skinned
     * is what keeps it there.
     */
    expect(poseFor('idle', true).loop).toBe(false)
  })

  test('but walks and runs the same way, because the pack has nothing else', () => {
    /**
     * The honest limit, asserted so nobody has to rediscover it. `CombatRanged`
     * ships `Aiming`, `Reload`, `Shoot` and `Shooting` for one hand - there is no
     * armed walk to name, and naming one that does not exist is a body that
     * silently keeps its last pose.
     */
    for (const motion of ['walk', 'run', 'air', 'land'] as const) {
      expect(poseFor(motion, true)).toEqual(poseFor(motion, false))
    }
  })

  test('and a shot looks the same whether or not anyone told us it was armed', () => {
    // Nothing shoots unarmed, so `armed` is redundant here rather than
    // meaningful - and a recoil that depended on it would be one more way for
    // two sources of the same truth to disagree.
    expect(poseFor('shoot', true)).toEqual(poseFor('shoot', false))
  })
})

/**
 * The same check for the other rig, and it is the check that matters more.
 *
 * The dummy's clips are checked against `clips.generated.ts`, which a script
 * writes from what the runtime loads. A peep has no generated list and needs
 * none: its eight clips are inside its own file, so the file *is* the list -
 * and there are twenty-four files, which is twenty-four chances for one of them
 * to have been exported without a `dance`.
 *
 * A missing name is the same silent failure it is for the dummy: three.js is
 * handed nothing, the mixer plays nothing, and the animal stands in its bind
 * pose. With the difference that it would be one animal out of twenty-four, so
 * nobody would find it by looking.
 */
describe('the peeps play what a peep has', () => {
  const PEEPZ = path.join(
    import.meta.dir, '..', '..', '..', '..', '..',
    'public', 'xp', 'packs', 'peepz',
  )

  const namesIn = (file: string): string[] => {
    const buffer = readFileSync(path.join(PEEPZ, file))
    const length = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'))
    return (json.animations ?? []).map((clip: { name: string }) => clip.name)
  }

  const animals = readdirSync(PEEPZ).filter((name) => name.endsWith('.glb'))

  test('every animal ships the same eight clips', () => {
    // The premise the rest of this rests on: one document plays on any of them.
    // If a re-export ever gives one animal seven, a level that swapped a fox for
    // that animal would silently stop moving.
    expect(animals).toHaveLength(24)
    for (const file of animals) {
      expect({ file, clips: namesIn(file).sort() }).toEqual({
        file,
        clips: [
          'dance',
          'eat',
          'gesture-negative',
          'gesture-positive',
          'idle',
          'run',
          'static',
          'walk',
        ],
      })
    }
  })

  test('every motion resolves to a clip a peep actually has', () => {
    const available = new Set(namesIn('animal-fox.glb'))
    for (const motion of MOTIONS) {
      const { clip } = poseFor(motion, false, 'peepz')
      expect({ motion, has: available.has(clip) }).toEqual({ motion, has: true })
    }
  })

  test('and `armed` says nothing, because a peep has no hand', () => {
    // The dummy stands differently holding a gun. A fox does not hold anything -
    // `HANDS` in ./skinned finds no bone on it - so an armed peep is a peep, and
    // a pose table that pretended otherwise would name clips that do not exist.
    for (const motion of MOTIONS) {
      expect(poseFor(motion, true, 'peepz')).toEqual(poseFor(motion, false, 'peepz'))
    }
  })

  test('the missing three land on `static` rather than on the nearest thing that moves', () => {
    // No jump, no landing, no death in the pack. A peep playing `dance` because
    // it fell off a ledge is worse than a peep that holds still, and `static` is
    // the pack's own word for holding still.
    expect(poseFor('air', false, 'peepz').clip).toBe('static')
    expect(poseFor('land', false, 'peepz').clip).toBe('static')
    expect(poseFor('dead', false, 'peepz').clip).toBe('static')
    // Looping only while it is a state a body stays in. A dead peep that looped
    // would be a corpse being re-killed once a second.
    expect(poseFor('air', false, 'peepz').loop).toBe(true)
    expect(poseFor('dead', false, 'peepz').loop).toBe(false)
  })

  test('a peep dances, which is the clip that had nowhere to be reached from', () => {
    /**
     * `KeyG` is reserved by the format so that every XP has a dance, and the
     * controls panel has listed it since before anything played it - so the clip
     * sat in the pack unreachable and the key did nothing. This is the wire that
     * was missing, and the loop is the point: a dance goes on until you walk out
     * of it.
     */
    expect(poseFor('dance', false, 'peepz')).toEqual({ clip: 'dance', loop: true })
  })

  test('a dummy asked to dance stands still, because the rig has no dance', () => {
    // `Rig_Medium` is a combat pack and its nearest moving clip is a body
    // swinging an axe. The same rule the three above follow: a wrong animation
    // is worse than a neutral one.
    expect(poseFor('dance', false, 'dummy').clip).toBe('Idle_A')
    expect(CLIPS).not.toContain('dance')
  })

  test('a dummy clip name never appears in the peep table, or the other way round', () => {
    // The whole reason `AnimationGraph.rig` exists, asserted: not one name is in
    // both vocabularies, so a clip list is only ever true of one of the two.
    const peep = new Set(MOTIONS.map((motion) => poseFor(motion, false, 'peepz').clip))
    const dummy = new Set(
      MOTIONS.flatMap((motion) => [poseFor(motion, false).clip, poseFor(motion, true).clip]),
    )
    for (const name of peep) expect(dummy.has(name)).toBe(false)
  })
})
