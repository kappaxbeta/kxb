import { describe, expect, test } from 'bun:test'
import {
  addSequence,
  addTake,
  copyTake,
  dropTake,
  editing,
  moveTake,
  removeMovie,
  removeScene,
  removeSequence,
  renameSequence,
  setMovie,
  setTake,
  shotsIn,
  startMovie,
  type EditState,
} from './edit'
import { parseXp, XP_FORMAT, type XpDocument } from './format'
import { cuedAt, restingAt, sequenceLength, takeLength, takeStarts, type XpSequence } from './movie'

/**
 * The composing side: shots cut together, trimmed and retimed.
 *
 * `cuedAt` is the whole of playback, scrubbing and export, exactly as `stageAt`
 * is for one shot - so the three cannot disagree about which frame belongs
 * where. Everything below is a question about that mapping or about the writers
 * that stand behind the parser's refusals.
 */

const seq = (takes: XpSequence['takes']): XpSequence => ({ takes })

const base = (): XpDocument => {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    blueprints: { crate: { model: 'proto/Box_A' } },
    entities: [{ blueprint: 'crate', name: 'box', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
    world: { floorY: 0, placements: [], marks: [] },
    scenes: {
      two: {
        world: { floorY: 0, placements: [], marks: [] },
        entities: [{ blueprint: 'crate', name: 'hero', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
      },
    },
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
  return parsed.document
}

/** Both places are shots, and there is one empty cut. */
const cut = (): { state: EditState; id: string } => {
  let state = startMovie(editing(base()))!
  state = setMovie(state, { duration: 4 })!
  state = startMovie(state, 'two')!
  state = setMovie(state, { duration: 6 }, 'two')!
  return addSequence(state)!
}

const reopens = (state: EditState) => parseXp(JSON.parse(JSON.stringify(state.document))).ok

describe('the mapping from a cut to a shot', () => {
  test('a take occupies its trimmed length, divided by its speed', () => {
    expect(takeLength({ scene: 'main', from: 1, to: 5, speed: 1 })).toBe(4)
    expect(takeLength({ scene: 'main', from: 1, to: 5, speed: 2 })).toBe(2)
    expect(takeLength({ scene: 'main', from: 1, to: 5, speed: 0.5 })).toBe(8)
  })

  test('the takes start where the ones before them ended', () => {
    const cut_ = seq([
      { scene: 'main', from: 0, to: 2, speed: 1 },
      { scene: 'two', from: 0, to: 3, speed: 1 },
    ])
    expect(takeStarts(cut_)).toEqual([0, 2])
    expect(sequenceLength(cut_)).toBe(5)
  })

  test('a moment resolves to a shot and a moment inside it', () => {
    const cut_ = seq([
      { scene: 'main', from: 0, to: 2, speed: 1 },
      { scene: 'two', from: 1, to: 4, speed: 1 },
    ])
    expect(cuedAt(cut_, 0.5)).toMatchObject({ index: 0, local: 0.5 })
    // Two seconds in is the start of the second take, which is trimmed to begin
    // one second into its own shot.
    expect(cuedAt(cut_, 2)).toMatchObject({ index: 1, local: 1 })
    expect(cuedAt(cut_, 3)).toMatchObject({ index: 1, local: 2 })
  })

  test('the trim is read on the shot own clock, so speed does not move it', () => {
    const fast = seq([{ scene: 'main', from: 2, to: 6, speed: 2 }])
    expect(cuedAt(fast, 0)!.local).toBe(2)
    // Two seconds of cut is four seconds of shot at double speed.
    expect(cuedAt(fast, 1.99)!.local).toBeCloseTo(5.98)
    expect(sequenceLength(fast)).toBe(2)
  })

  test('past the end is nothing rather than the last frame held', () => {
    // A cut has a length. Asking for a frame outside it is a question with no
    // answer, and the caller draws black - which is what the end of a film is.
    const cut_ = seq([{ scene: 'main', from: 0, to: 2, speed: 1 }])
    expect(cuedAt(cut_, 2)).toBe(null)
    expect(cuedAt(cut_, -1)).toBe(null)
  })

  test('a zero-length take is stepped over rather than dividing by nothing', () => {
    const mid = seq([
      { scene: 'main', from: 1, to: 1, speed: 1 },
      { scene: 'two', from: 0, to: 2, speed: 1 },
    ])
    expect(cuedAt(mid, 0)).toMatchObject({ index: 1 })
  })

  test('an empty cut has nothing at any moment', () => {
    expect(cuedAt(seq([]), 0)).toBe(null)
    expect(sequenceLength(seq([]))).toBe(0)
  })
})

/**
 * The parked playhead, which wants the opposite of what the projector wants.
 *
 * `cuedAt`'s null past the end is what *ends* a film in the runtime, and must
 * stay. An editor left holding that null has to draw something anyway, and what
 * it drew was the last take at `local: 0` - so every cut that played to the end
 * finished by showing the first frame of its final shot. Which reads as a loop
 * rather than as an ending, and is the sort of thing that looks like the
 * playhead being broken rather than the fallback being wrong.
 */
describe('where a parked playhead rests', () => {
  const cut_ = seq([
    { scene: 'main', from: 0, to: 2, speed: 1 },
    { scene: 'two', from: 1, to: 4, speed: 1 },
  ])

  test('inside the cut it is exactly cuedAt', () => {
    for (const t of [0, 0.5, 1.999, 2, 3, 4.999]) {
      expect(restingAt(cut_, t)).toEqual(cuedAt(cut_, t)!)
    }
  })

  test('past the end it is the last frame there is, not the first', () => {
    // `to`, because the trim is inclusive of the moment it names and a shot's
    // last frame is the one the author trimmed *to*.
    expect(restingAt(cut_, 5)).toMatchObject({ index: 1, local: 4 })
    expect(restingAt(cut_, 900)).toMatchObject({ index: 1, local: 4 })
  })

  test('before the start it is the first frame there is', () => {
    expect(restingAt(cut_, -1)).toMatchObject({ index: 0, local: 0 })
  })

  test('a trailing take nobody can see is stepped over at both ends', () => {
    // A take dragged to zero length is one somebody is in the middle of making,
    // and resting on it would park the picture on a frame the cut never shows.
    const trailing = seq([
      { scene: 'main', from: 0, to: 2, speed: 1 },
      { scene: 'two', from: 3, to: 3, speed: 1 },
    ])
    expect(restingAt(trailing, 99)).toMatchObject({ index: 0, local: 2 })
  })

  test('an empty cut still has no frame, because there is none', () => {
    expect(restingAt(seq([]), 0)).toBe(null)
    expect(restingAt(seq([]), 99)).toBe(null)
  })
})

describe('composing', () => {
  test('a document with no cuts does not grow the block', () => {
    expect('sequences' in base()).toBe(false)
  })

  test('a shot is added whole, and its length comes from its own timeline', () => {
    const { state, id } = cut()
    const with_ = addTake(state, id, 'two')!
    expect(with_.document.sequences![id]!.takes[0]).toMatchObject({ scene: 'two', from: 0, to: 6 })
    expect(reopens(with_)).toBe(true)
  })

  test('the same shot may be used twice, trimmed differently', () => {
    const { state, id } = cut()
    let next = addTake(state, id, 'main')!
    next = addTake(next, id, 'main')!
    next = setTake(next, id, 1, { from: 2, to: 3 })!
    expect(next.document.sequences![id]!.takes).toHaveLength(2)
    expect(next.document.sequences![id]!.takes[0]!.to).toBe(4)
    expect(next.document.sequences![id]!.takes[1]!.from).toBe(2)
    expect(reopens(next)).toBe(true)
  })

  test('a place that is not a shot cannot be a take', () => {
    const plain = addSequence(editing(base()))!
    expect(addTake(plain.state, plain.id, 'two')).toBe(null)
  })

  test('the handles are clamped rather than crossed', () => {
    // A drag that stops at the limit is the right feedback; the parser refuses a
    // crossed pair, which is guarding against a hand-edited file, not a mouse.
    const { state, id } = cut()
    const one = addTake(state, id, 'main')!
    const dragged = setTake(one, id, 0, { from: 99 })!
    const take = dragged.document.sequences![id]!.takes[0]!
    expect(take.from).toBeLessThan(take.to)
    expect(reopens(dragged)).toBe(true)
  })

  test('a trim cannot reach past the end of the shot it is of', () => {
    const { state, id } = cut()
    // Trimmed in first, or dragging out changes nothing and is not an edit.
    const one = setTake(addTake(state, id, 'main')!, id, 0, { to: 2 })!
    const dragged = setTake(one, id, 0, { to: 99 })!
    // `main` is four seconds long.
    expect(dragged.document.sequences![id]!.takes[0]!.to).toBe(4)
  })

  test('speed is clamped to something a scrubber can show', () => {
    const { state, id } = cut()
    const one = addTake(state, id, 'main')!
    expect(setTake(one, id, 0, { speed: 500 })!.document.sequences![id]!.takes[0]!.speed).toBeLessThanOrEqual(8)
    expect(setTake(one, id, 0, { speed: 0 })!.document.sequences![id]!.takes[0]!.speed).toBeGreaterThan(0)
  })

  test('takes reorder, and drop', () => {
    const { state, id } = cut()
    let next = addTake(state, id, 'main')!
    next = addTake(next, id, 'two')!
    next = moveTake(next, id, 1, 0)!
    expect(next.document.sequences![id]!.takes[0]!.scene).toBe('two')
    next = dropTake(next, id, 0)!
    expect(next.document.sequences![id]!.takes).toHaveLength(1)
  })

  test('a shot goes in where it is asked for, not only at the end', () => {
    // A composer that can only append is one where putting a shot in the middle
    // means appending it and pressing `earlier` until it arrives.
    const { state, id } = cut()
    let next = addTake(state, id, 'main')!
    next = addTake(next, id, 'two')!
    next = addTake(next, id, 'two', 1)!
    expect(next.document.sequences![id]!.takes.map((take) => take.scene)).toEqual([
      'main',
      'two',
      'two',
    ])
  })

  test('a take copies itself, trims and all, right after the original', () => {
    /*
      The gesture `Take`'s own note is written around: *"a shot used twice at
      different lengths is what an edit is"*. By hand it was `addTake`, which
      lands the shot whole, and then retyping both trims onto it.
    */
    const { state, id } = cut()
    let next = addTake(state, id, 'main')!
    next = setTake(next, id, 0, { from: 1, to: 3, speed: 2 })!
    next = addTake(next, id, 'two')!
    next = copyTake(next, id, 0)!

    const takes = next.document.sequences![id]!.takes
    expect(takes.map((take) => take.scene)).toEqual(['main', 'main', 'two'])
    expect(takes[1]).toEqual({ scene: 'main', from: 1, to: 3, speed: 2 })
    // A copy is a new object, or trimming one end would trim both.
    expect(takes[1]).not.toBe(takes[0])
    expect(reopens(next)).toBe(true)
  })

  test('copying nothing is nothing', () => {
    const { state, id } = cut()
    expect(copyTake(state, id, 0)).toBe(null)
    expect(copyTake(addTake(state, id, 'main')!, 'nope', 0)).toBe(null)
  })

  test('a cut is named, and removing the last one takes the block away', () => {
    const { state, id } = cut()
    const named = renameSequence(state, id, 'The opening')!
    expect(named.document.sequences![id]!.name).toBe('The opening')
    expect(removeSequence(named, id)!.document.sequences).toBe(undefined)
  })

  test('shotsIn lists the root first', () => {
    expect(shotsIn(cut().state.document)).toEqual(['main', 'two'])
    expect(shotsIn(base())).toEqual([])
  })
})

describe('a shot that stops being one', () => {
  test('takes its takes out of every cut', () => {
    // Otherwise the cut saves and will not re-open, with the error naming a
    // scene the author was deliberately finished with.
    const { state, id } = cut()
    const with_ = addTake(addTake(state, id, 'main')!, id, 'two')!
    const gone = removeMovie(with_, 'two')!
    expect(gone.document.sequences![id]!.takes).toHaveLength(1)
    expect(gone.document.sequences![id]!.takes[0]!.scene).toBe('main')
    expect(reopens(gone)).toBe(true)
  })

  test('and so does a scene that is deleted outright', () => {
    const { state, id } = cut()
    const with_ = addTake(state, id, 'two')!
    const gone = removeScene(with_, 'two')!
    expect(gone.document.sequences![id]!.takes).toEqual([])
    expect(reopens(gone)).toBe(true)
  })

  test('the root losing its timeline is the same case', () => {
    const { state, id } = cut()
    const with_ = addTake(state, id, 'main')!
    const gone = removeMovie(with_)!
    expect(gone.document.sequences![id]!.takes).toEqual([])
    expect(reopens(gone)).toBe(true)
  })
})
