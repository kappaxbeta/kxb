import { describe, expect, test } from 'bun:test'
import { clipIsSquare, MAX_XP_CLIPS, type XpClip, withSample, withoutSample, rebased, denser, withSampleEase } from './clips'
import { editing, setClips } from './edit'
import { parseXp, XP_FORMAT } from './format'
import { templateById } from './templates'

/**
 * A clip the level carries itself.
 *
 * Reported as *"you can't save the clip to your document"*, and the animator
 * panel said so too - on the grounds that a document cannot carry its own files.
 * True of a `.glb`, which is bytes. A clip is *numbers*, and a document has
 * carried numbers since it existed.
 */
const WAVE: XpClip = {
  rig: 'dummy',
  duration: 0.5,
  times: [0, 0.25, 0.5],
  bones: {
    // Three samples, four numbers each, in three's x/y/z/w order.
    upperarmr: [0, 0, 0, 1, 0, 0, 0.38, 0.92, 0, 0, 0, 1],
  },
}

const level = (clips: unknown) =>
  parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, placements: [], marks: [] },
    clips,
  })

describe('a clip in a document', () => {
  test('survives the round trip', () => {
    const parsed = level({ wave: WAVE })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.clips!.wave!.times).toEqual([0, 0.25, 0.5])
    expect(parsed.document.clips!.wave!.rig).toBe('dummy')
  })

  test('a track out of step with its own times is refused', () => {
    /**
     * The check that earns its keep, and the one nobody can make by looking. A
     * bone track one sample short binds without complaint and then plays the
     * whole animation a frame out against every other bone, which reads as a
     * body coming apart rather than as a file being wrong - and it is exactly
     * what a hand-edit or a bad merge produces.
     */
    const short = { ...WAVE, bones: { upperarmr: WAVE.bones.upperarmr!.slice(0, 8) } }
    expect(level({ wave: short }).ok).toBe(false)
    expect(clipIsSquare(short as XpClip)).toBe(false)
  })

  test('and so is a root track of the wrong length', () => {
    // Three a sample, not four - a position is not a quaternion.
    expect(level({ wave: { ...WAVE, root: [0, 0, 0, 0, 0, 0] } }).ok).toBe(false)
    expect(level({ wave: { ...WAVE, root: [0, 0, 0, 0, 1, 0, 0, 0, 0] } }).ok).toBe(true)
  })

  test('sample times have to climb', () => {
    // A player walks them in order, so an out-of-order pair is a clip that jumps
    // backwards mid-play with nothing to say why.
    expect(level({ wave: { ...WAVE, times: [0, 0.5, 0.25] } }).ok).toBe(false)
    expect(level({ wave: { ...WAVE, times: [0, 0.25, 0.25] } }).ok).toBe(false)
  })

  test('a rig nobody ships is refused, like a graph naming one', () => {
    expect(level({ wave: { ...WAVE, rig: 'gerbil' } }).ok).toBe(false)
  })

  test('a clip with no tracks is not a clip', () => {
    expect(level({ wave: { ...WAVE, bones: {} } }).ok).toBe(false)
  })
})

/**
 * Writing them, which is one press about a whole library rather than one clip.
 */
describe('saving a library into a level', () => {
  const start = () => editing(templateById('room')!.build('level', 'Level'))

  test('the block lands and the document still parses', () => {
    const state = setClips(start(), { wave: WAVE })!
    expect(Object.keys(state.document.clips!)).toEqual(['wave'])
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('an empty collection removes the block rather than writing an empty one', () => {
    /**
     * The editor's one hard property: what it holds is what parses. `parseXp`
     * drops an empty block on the way in, so writing one would leave the panel
     * holding a document a save-and-reopen does not produce.
     */
    const cleared = setClips(setClips(start(), { wave: WAVE })!, {})!
    expect(cleared.document.clips).toBeUndefined()
  })

  test('it is undoable, because it goes through the edit layer like everything else', () => {
    const state = setClips(start(), { wave: WAVE })!
    expect(state.past.length).toBeGreaterThan(0)
  })

  test('a misshapen clip is refused rather than written and refused later', () => {
    // Refused *here*, so the editor never holds a document it cannot save -
    // rather than accepted and discovered on the next parse.
    const short = { ...WAVE, bones: { upperarmr: [0, 0, 0, 1] } }
    expect(setClips(start(), { wave: short })).toBeNull()
  })

  test('a clip with no tracks is refused, which is what a fresh one bakes to', () => {
    /**
     * The bug this was found by. `bake` drops bones that never move - right -
     * so a clip nobody has posed bakes to *zero* tracks, and writing one puts a
     * document in the editor that `readClip` refuses. Pressing Save on a fresh
     * clip did exactly that, and the draft stopped parsing.
     */
    expect(setClips(start(), { blank: { ...WAVE, bones: {} } })).toBeNull()
  })

  test('and more than the level may carry', () => {
    const many: Record<string, XpClip> = {}
    for (let n = 0; n <= MAX_XP_CLIPS; n += 1) many[`clip-${n}`] = WAVE
    expect(setClips(start(), many)).toBeNull()
  })
})

describe('writing a pose into a clip', () => {
  const Q = (x: number) => [x, 0, 0, Math.sqrt(Math.max(0, 1 - x * x))]

  test('a first pose makes a one-sample clip', () => {
    const clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    expect(clip.times).toEqual([0])
    expect(clip.bones.head).toHaveLength(4)
    expect(clipIsSquare(clip)).toBe(true)
    expect(clip.duration).toBe(0)
  })

  test('a second moment makes it an animation, and stays square', () => {
    const one = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    const two = withSample(one, 'dummy', 1.5, { head: Q(0.4) })!
    expect(two.times).toEqual([0, 1.5])
    expect(two.bones.head).toHaveLength(8)
    expect(clipIsSquare(two)).toBe(true)
    expect(two.duration).toBe(1.5)
  })

  test('a bone left out of a pose holds what it had', () => {
    const one = withSample(undefined, 'dummy', 0, { head: Q(0.1), spine: Q(0.2) })!
    const two = withSample(one, 'dummy', 1, { head: Q(0.5) })!
    // spine's second sample repeats its first rather than going missing.
    expect(two.bones.spine!.slice(0, 4)).toEqual(two.bones.spine!.slice(4))
    expect(clipIsSquare(two)).toBe(true)
  })

  test('a bone introduced late is at rest for every earlier sample', () => {
    const one = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    const two = withSample(one, 'dummy', 1, { spine: Q(0.3) })!
    expect(two.bones.spine!.slice(0, 4)).toEqual([0, 0, 0, 1])
    expect(clipIsSquare(two)).toBe(true)
  })

  test('a sample inserted between two others lands in time order', () => {
    let clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    clip = withSample(clip, 'dummy', 2, { head: Q(0.3) })!
    clip = withSample(clip, 'dummy', 1, { head: Q(0.2) })!
    expect(clip.times).toEqual([0, 1, 2])
    // And the middle row is the one just written, not a shifted copy.
    expect(clip.bones.head!.slice(4, 8)).toEqual(Q(0.2))
    expect(clip.bones.head!.slice(8, 12)).toEqual(Q(0.3))
    expect(clipIsSquare(clip)).toBe(true)
  })

  test('writing the same moment twice replaces rather than stacking', () => {
    const one = withSample(undefined, 'dummy', 1, { head: Q(0.1) })!
    const two = withSample(one, 'dummy', 1, { head: Q(0.4) })!
    expect(two.times).toEqual([1])
    expect(two.bones.head).toEqual(Q(0.4))
  })

  test('a clip authored on another rig is refused', () => {
    const one = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    expect(withSample(one, 'peepz', 1, { head: Q(0.2) })).toBe(null)
  })

  test('nonsense is refused rather than written', () => {
    expect(withSample(undefined, 'dummy', -1, { head: Q(0.1) })).toBe(null)
    expect(withSample(undefined, 'dummy', 0, { head: [0, 0, 1] })).toBe(null)
    expect(withSample(undefined, 'dummy', 0, { head: [0, 0, 0, NaN] })).toBe(null)
  })
})

describe('rebasing a clip to zero', () => {
  const Q = (x: number) => [x, 0, 0, Math.sqrt(Math.max(0, 1 - x * x))]

  test('a clip already at zero is handed back untouched', () => {
    const clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    const out = rebased(clip)
    expect(out.start).toBe(0)
    expect(out.clip).toBe(clip)
  })

  test('one that starts late moves to zero and says where it was', () => {
    let clip = withSample(undefined, 'dummy', 2, { head: Q(0.1) })!
    clip = withSample(clip, 'dummy', 3.5, { head: Q(0.3) })!
    const out = rebased(clip)
    expect(out.start).toBe(2)
    expect(out.clip.times).toEqual([0, 1.5])
    expect(out.clip.duration).toBe(1.5)
    // The samples themselves are untouched - only when they happen moved.
    expect(out.clip.bones.head).toEqual(clip.bones.head)
    expect(clipIsSquare(out.clip)).toBe(true)
  })
})

describe('taking a moment out of a clip', () => {
  const Q = (x: number) => [x, 0, 0, Math.sqrt(Math.max(0, 1 - x * x))]
  const three = () => {
    let clip = withSample(undefined, 'dummy', 0, { head: Q(0.1), spine: Q(0.5) })!
    clip = withSample(clip, 'dummy', 1, { head: Q(0.2) })!
    return withSample(clip, 'dummy', 2, { head: Q(0.3) })!
  }

  test('every track loses the same row, so the clip stays square', () => {
    const out = withoutSample(three(), 1)!
    expect(out.times).toEqual([0, 2])
    expect(out.bones.head).toEqual([...Q(0.1), ...Q(0.3)])
    expect(out.bones.spine).toHaveLength(8)
    expect(clipIsSquare(out)).toBe(true)
  })

  test('dropping the last one shortens the clip', () => {
    const out = withoutSample(three(), 2)!
    expect(out.times).toEqual([0, 1])
    expect(out.duration).toBe(1)
  })

  test('the only sample cannot be removed - that is deleting the clip', () => {
    const one = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    expect(withoutSample(one, 0)).toBe(null)
  })

  test('a row nobody is at is refused rather than guessed', () => {
    expect(withoutSample(three(), 9)).toBe(null)
    expect(withoutSample(three(), -1)).toBe(null)
  })
})

describe('filling in an eased segment', () => {
  /** A quarter turn about x, as a quaternion. */
  const turn = (deg: number): number[] => {
    const half = ((deg * Math.PI) / 180) / 2
    return [Math.sin(half), 0, 0, Math.cos(half)]
  }
  const two = (ease: 'hold' | 'linear' | 'smooth'): XpClip => ({
    rig: 'dummy',
    duration: 1,
    times: [0, 1],
    eases: [ease, 'linear'],
    bones: { head: [...turn(0), ...turn(90)] },
  })

  test('a clip with no eases is handed straight back', () => {
    const plain: XpClip = { rig: 'dummy', duration: 1, times: [0, 1], bones: { head: [...turn(0), ...turn(90)] } }
    expect(denser(plain)).toBe(plain)
  })

  test('linear needs nothing added - three already draws a straight line', () => {
    expect(denser(two('linear')).times).toEqual([0, 1])
  })

  test('smooth becomes samples along a curve, and stays square', () => {
    const out = denser(two('smooth'))
    expect(out.times.length).toBeGreaterThan(8)
    expect(clipIsSquare(out)).toBe(true)
    expect(out.times[0]).toBe(0)
    expect(out.times[out.times.length - 1]).toBe(1)
  })

  test('and the curve is a curve: half way through, it is past half way', () => {
    /*
     * The whole point. A smoothstep leaves slowly, so at the midpoint of *time*
     * the body is exactly half way through the turn - but at a quarter of the
     * time it is much less than a quarter through, which is what a straight
     * line would give and what this exists to avoid.
     */
    const out = denser(two('smooth'))
    const angleAt = (t: number) => {
      const row = out.times.findIndex((one) => one >= t - 0.0001)
      const x = out.bones.head![row * 4]!
      return (Math.asin(Math.min(1, x)) * 2 * 180) / Math.PI
    }
    expect(angleAt(0.5)).toBeCloseTo(45, 0)
    expect(angleAt(0.25)).toBeLessThan(45 / 2)
    expect(angleAt(0.75)).toBeGreaterThan(45 + 45 / 2)
  })

  test('hold sits still and then arrives all at once', () => {
    const out = denser(two('hold'))
    expect(out.times).toHaveLength(3)
    // The first two samples are the same pose, right up to the last instant.
    expect(out.bones.head!.slice(0, 4)).toEqual(out.bones.head!.slice(4, 8))
    expect(out.times[1]).toBeCloseTo(0.999, 3)
    expect(clipIsSquare(out)).toBe(true)
  })

  test('the eases are spent, not carried into the result', () => {
    expect(denser(two('smooth')).eases).toBe(undefined)
  })
})

describe('keeping the eases parallel', () => {
  const Q = (x: number) => [x, 0, 0, Math.sqrt(Math.max(0, 1 - x * x))]

  test('a new moment gets an ease of its own, in the right place', () => {
    let clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    clip = withSample(clip, 'dummy', 2, { head: Q(0.3) })!
    clip = withSampleEase(clip, 0, 'hold')!
    // Inserted between them: the hold must stay on the *first* segment.
    clip = withSample(clip, 'dummy', 1, { head: Q(0.2) })!
    expect(clip.eases).toEqual(['hold', 'smooth', 'smooth'])
    expect(clip.eases).toHaveLength(clip.times.length)
  })

  test('removing a moment removes its ease', () => {
    let clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    clip = withSample(clip, 'dummy', 1, { head: Q(0.2) })!
    clip = withSample(clip, 'dummy', 2, { head: Q(0.3) })!
    clip = withSampleEase(clip, 1, 'hold')!
    const out = withoutSample(clip, 1)!
    expect(out.eases).toEqual(['smooth', 'smooth'])
    expect(out.eases).toHaveLength(out.times.length)
  })

  test('setting the ease a moment already has is not a change', () => {
    const clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    expect(withSampleEase(clip, 0, 'smooth')).toBe(null)
    expect(withSampleEase(clip, 9, 'hold')).toBe(null)
  })
})

describe('eases survive a save and a re-open', () => {
  const Q = (x: number) => [x, 0, 0, Math.sqrt(Math.max(0, 1 - x * x))]

  test('a shaped clip round trips, and a mis-counted one is refused', () => {
    let clip = withSample(undefined, 'dummy', 0, { head: Q(0.1) })!
    clip = withSample(clip, 'dummy', 1, { head: Q(0.3) })!
    clip = withSampleEase(clip, 0, 'hold')!

    const doc = setClips(editing(templateById('room')!.build('level', 'Level')), { wave: clip })!.document
    const again = parseXp(JSON.parse(JSON.stringify(doc)))
    expect(again.ok).toBe(true)
    expect(again.ok && again.document.clips!.wave!.eases).toEqual(['hold', 'smooth'])

    // One short is refused rather than repaired: every segment after the gap
    // would be shaped by the wrong instruction, silently.
    const bent = JSON.parse(JSON.stringify(doc))
    bent.clips.wave.eases = ['hold']
    expect(parseXp(bent).ok).toBe(false)
  })
})
