import { describe, expect, test } from 'bun:test'
import {
  addActor,
  addCamera,
  addMovie,
  importPlace,
  dropEntityKey,
  dropFraming,
  editing,
  moveActorsAt,
  dropAction,
  duplicateEntity,
  putAction,
  putCut,
  putEntityKey,
  putEntityKeys,
  putFraming,
  removeCamera,
  removeEntity,
  removeMovie,
  renameCamera,
  setEntity,
  setKeyEase,
  setMovie,
  startMovie,
  type EditState,
} from './edit'
import { MAIN_SCENE, parseXp, XP_FORMAT, type XpDocument } from './format'

/**
 * The writers a timeline panel calls.
 *
 * Most of these are ordinary. The ones that are not are the three standing
 * behind the format's own strictness: `readTimeline` refuses a track naming a
 * body that is not there, so renaming an actor, deleting one, or deleting a
 * camera all have a second half they cannot skip. Skipping any of them produces
 * a document that saves and then will not re-open, with an error pointing at a
 * name the author has already changed - which is why each has a test of its own.
 */

const base = (): XpDocument => {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    blueprints: { crate: { model: 'proto/Box_A', props: { angle: 0 } } },
    entities: [
      { blueprint: 'crate', name: 'box', x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
      { blueprint: 'crate', name: 'lid', x: 0, y: 1, z: 0, rotation: 0, scale: 1, parent: 'box' },
    ],
    world: { floorY: 0, placements: [], marks: [] },
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
  return parsed.document
}

/** A state with a movie already started and one key on `box`. */
const keyed = (): EditState => {
  const started = startMovie(editing(base()))!
  return putEntityKey(started, 'box', 'x', { t: 1, value: 4, ease: 'linear' })!
}

/** Whether what the editor is holding would survive being saved and re-opened. */
const reopens = (state: EditState) => parseXp(JSON.parse(JSON.stringify(state.document))).ok

describe('starting and stopping', () => {
  test('a place becomes a shot, and a second press does not wipe it', () => {
    const one = startMovie(editing(base()))
    expect(one).not.toBe(null)
    expect(one!.document.timeline!.cameras).toHaveLength(1)
    expect(startMovie(one!)).toBe(null)
  })

  test('and stops being one, taking the keys with it', () => {
    const gone = removeMovie(keyed())
    expect(gone!.document.timeline).toBe(undefined)
  })

  test('a document with no movie round trips without growing one', () => {
    expect('timeline' in base()).toBe(false)
  })
})

describe('the numbers on a movie', () => {
  test('a duration and a rate are clamped rather than refused', () => {
    const wild = setMovie(startMovie(editing(base()))!, { duration: -5, fps: 9000 })
    expect(wild!.document.timeline!.duration).toBeGreaterThan(0)
    expect(wild!.document.timeline!.fps).toBeLessThanOrEqual(60)
  })

  test('a backdrop from somewhere else is refused while the author is looking at it', () => {
    const started = startMovie(editing(base()))!
    expect(setMovie(started, { backdrop: { kind: 'image', image: 'https://elsewhere/x.png' } })).toBe(null)
    expect(setMovie(started, { backdrop: { kind: 'image', image: '/bg.png' } })).not.toBe(null)
  })

  test('an image backdrop with no picture is refused', () => {
    expect(setMovie(startMovie(editing(base()))!, { backdrop: { kind: 'image' } })).toBe(null)
  })

  test('nothing changing is not an undo step', () => {
    const started = startMovie(editing(base()))!
    expect(setMovie(started, { duration: started.document.timeline!.duration })).toBe(null)
  })
})

describe('keys', () => {
  test('land on the body, and re-opening the file finds them', () => {
    const state = keyed()
    expect(state.document.timeline!.tracks.box!.x).toHaveLength(1)
    expect(reopens(state)).toBe(true)
  })

  test('replace one at the same instant rather than stacking', () => {
    const twice = putEntityKey(keyed(), 'box', 'x', { t: 1.005, value: 9, ease: 'hold' })!
    expect(twice.document.timeline!.tracks.box!.x).toHaveLength(1)
    expect(twice.document.timeline!.tracks.box!.x![0]!.value).toBe(9)
  })

  test('a declared blueprint property is keyable even when the entity never overrode it', () => {
    const state = putEntityKey(keyed(), 'box', 'prop:angle', { t: 0, value: 90, ease: 'linear' })
    expect(state).not.toBe(null)
    expect(reopens(state!)).toBe(true)
  })

  test('a property nothing holds is refused', () => {
    expect(putEntityKey(keyed(), 'box', 'prop:mood', { t: 0, value: 1, ease: 'hold' })).toBe(null)
    expect(putEntityKey(keyed(), 'box', 'mood', { t: 0, value: 1, ease: 'hold' })).toBe(null)
  })

  test('a body that is not here is refused', () => {
    expect(putEntityKey(keyed(), 'ghost', 'x', { t: 0, value: 1, ease: 'hold' })).toBe(null)
  })

  test('dropping the last key drops the property, and then the node', () => {
    const empty = dropEntityKey(keyed(), 'box', 'x', 0)!
    expect('box' in empty.document.timeline!.tracks).toBe(false)
  })
})

describe('a rename, and a delete', () => {
  test('renaming a keyed body takes its keys with it', () => {
    // Without this the file saves and will not re-open, and the error names a
    // name the author has already changed.
    const renamed = setEntity(keyed(), 0, { name: 'crate' })!
    expect('box' in renamed.document.timeline!.tracks).toBe(false)
    expect(renamed.document.timeline!.tracks.crate!.x).toHaveLength(1)
    expect(reopens(renamed)).toBe(true)
  })

  test('and its cues', () => {
    const cued = putAction(keyed(), { kind: 'play', t: 0, duration: 1, entity: 'box', clip: 'wave', loop: false })!
    const renamed = setEntity(cued, 0, { name: 'crate' })!
    expect(renamed.document.timeline!.actions[0]!.entity).toBe('crate')
    expect(reopens(renamed)).toBe(true)
  })

  test('clearing a name is a delete as far as the timeline is concerned', () => {
    const nameless = setEntity(keyed(), 0, { name: undefined })
    if (nameless) {
      expect('box' in nameless.document.timeline!.tracks).toBe(false)
      expect(reopens(nameless)).toBe(true)
    }
  })

  test('deleting a keyed body takes its keys, and its orphaned children too', () => {
    const both = putEntityKey(keyed(), 'lid', 'y', { t: 0, value: 3, ease: 'linear' })!
    const gone = removeEntity(both, 0)!
    expect(Object.keys(gone.document.timeline!.tracks)).toEqual([])
    expect(reopens(gone)).toBe(true)
  })

  test('renaming something with no keys changes nothing about the timeline', () => {
    const state = keyed()
    const renamed = setEntity(state, 1, { name: 'top' })!
    expect(renamed.document.timeline!.tracks.box!.x).toHaveLength(1)
  })
})

describe('cameras', () => {
  const two = () => addCamera(keyed(), { position: [1, 2, 3], target: [0, 0, 0], fov: 40 })!

  test('a second one is added with a name of its own', () => {
    const { state, name } = two()
    expect(state.document.timeline!.cameras).toHaveLength(2)
    expect(name).not.toBe(state.document.timeline!.cameras[0]!.name)
    expect(reopens(state)).toBe(true)
  })

  test('pressing add four times means four cameras, not three and an error', () => {
    let state = keyed()
    for (let n = 0; n < 4; n += 1) {
      state = addCamera(state, { position: [n, 2, 3], target: [0, 0, 0], fov: 40 })!.state
    }
    expect(new Set(state.document.timeline!.cameras.map((one) => one.name)).size).toBe(5)
  })

  test('removing one takes every cut that named it', () => {
    // A cut naming a camera that is gone is a document the parser refuses, and
    // nothing in the panel would connect the two.
    const { state, name } = two()
    const cut = putCut(state, { t: 2, camera: name })!
    const gone = removeCamera(cut, name)!
    expect(gone.document.timeline!.cuts).toEqual([])
    expect(reopens(gone)).toBe(true)
  })

  test('renaming one renames its cuts', () => {
    const { state, name } = two()
    const cut = putCut(state, { t: 2, camera: name })!
    const renamed = renameCamera(cut, name, 'close')!
    expect(renamed.document.timeline!.cuts[0]!.camera).toBe('close')
    expect(reopens(renamed)).toBe(true)
  })

  test('the last camera cannot go - a movie without one is not a movie', () => {
    expect(removeCamera(keyed(), 'main')).toBe(null)
  })

  test('a name already taken is refused', () => {
    const { state, name } = two()
    expect(renameCamera(state, name, 'main')).toBe(null)
  })

  test('a framing replaces one at the same instant, and the last one cannot be dropped', () => {
    const moved = putFraming(keyed(), 'main', { t: 0, position: [9, 9, 9], target: [0, 0, 0], fov: 20 })!
    expect(moved.document.timeline!.cameras[0]!.keys).toHaveLength(1)
    expect(moved.document.timeline!.cameras[0]!.keys[0]!.fov).toBe(20)
    expect(dropFraming(moved, 'main', 0)).toBe(null)
  })

  test('a second framing makes it a move, and can be dropped again', () => {
    const path = putFraming(keyed(), 'main', { t: 3, position: [1, 1, 1], target: [0, 0, 0], fov: 40 })!
    expect(path.document.timeline!.cameras[0]!.keys).toHaveLength(2)
    expect(dropFraming(path, 'main', 1)).not.toBe(null)
  })

  test('a cut naming a camera that is not there is refused', () => {
    expect(putCut(keyed(), { t: 1, camera: 'nope' })).toBe(null)
  })
})

describe('cues', () => {
  test('a body is told to play a clip, and the file re-opens', () => {
    const cued = putAction(keyed(), { kind: 'play', t: 1, duration: 1, entity: 'box', clip: 'wave', loop: false })!
    expect(cued.document.timeline!.actions).toHaveLength(1)
    expect(reopens(cued)).toBe(true)
  })

  test('one per body per instant', () => {
    const once = putAction(keyed(), { kind: 'play', t: 1, duration: 1, entity: 'box', clip: 'wave', loop: false })!
    const twice = putAction(once, { kind: 'play', t: 1.005, duration: 1, entity: 'box', clip: 'jump', loop: false })!
    expect(twice.document.timeline!.actions).toHaveLength(1)
    const played = twice.document.timeline!.actions[0]!
    expect(played.kind === 'play' && played.clip).toBe('jump')
  })

  test('but two bodies at one instant is two cues', () => {
    const once = putAction(keyed(), { kind: 'play', t: 1, duration: 1, entity: 'box', clip: 'wave', loop: false })!
    const both = putAction(once, { kind: 'play', t: 1, duration: 1, entity: 'lid', clip: 'wave', loop: false })!
    expect(both.document.timeline!.actions).toHaveLength(2)
  })

  test('a body that is not here is refused, and a cue can be dropped', () => {
    expect(putAction(keyed(), { kind: 'play', t: 0, duration: 1, entity: 'ghost', clip: 'wave', loop: false })).toBe(null)
    const cued = putAction(keyed(), { kind: 'play', t: 0, duration: 1, entity: 'box', clip: 'wave', loop: false })!
    expect(dropAction(cued, 0)!.document.timeline!.actions).toEqual([])
  })
})

describe('a scene can be the movie instead of the root', () => {
  test('and the two do not reach each other', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      blueprints: { crate: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'crate', name: 'box', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
      world: { floorY: 0, placements: [], marks: [] },
      scenes: {
        cutscene: {
          world: { floorY: 0, placements: [], marks: [] },
          entities: [{ blueprint: 'crate', name: 'hero', x: 0, y: 0, z: 0, rotation: 0, scale: 1 }],
        },
      },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const started = startMovie(editing(parsed.document), 'cutscene')!
    expect(started.document.timeline).toBe(undefined)

    // The root's actor is not addressable from the cutscene's timeline.
    expect(putEntityKey(started, 'box', 'x', { t: 0, value: 1, ease: 'hold' }, 'cutscene')).toBe(null)
    const keyed_ = putEntityKey(started, 'hero', 'x', { t: 0, value: 1, ease: 'hold' }, 'cutscene')!
    expect(reopens(keyed_)).toBe(true)
  })

  test('a door is not a place and refuses a movie', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      entities: [],
      world: { floorY: 0, placements: [], marks: [] },
      scenes: { away: 'some-other-xp' },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(startMovie(editing(parsed.document), 'away')).toBe(null)
  })
})

describe('lines', () => {
  test('a body says something, and the file re-opens', () => {
    const said = putAction(keyed(), { kind: 'say', t: 1, duration: 2, entity: 'box', text: 'Hallo' })!
    const spoken = said.document.timeline!.actions[0]!
    expect(spoken.kind === 'say' && spoken.text).toBe('Hallo')
    expect(reopens(said)).toBe(true)
  })

  test('one per body per instant', () => {
    const once = putAction(keyed(), { kind: 'say', t: 1, duration: 2, entity: 'box', text: 'one' })!
    const twice = putAction(once, { kind: 'say', t: 1.005, duration: 2, entity: 'box', text: 'two' })!
    expect(twice.document.timeline!.actions).toHaveLength(1)
    const latest = twice.document.timeline!.actions[0]!
    expect(latest.kind === 'say' && latest.text).toBe('two')
  })

  test('an empty line is refused, and a line can be dropped', () => {
    expect(putAction(keyed(), { kind: 'say', t: 0, duration: 2, entity: 'box', text: '   ' })).toBe(null)
    const said = putAction(keyed(), { kind: 'say', t: 0, duration: 2, entity: 'box', text: 'hi' })!
    expect(dropAction(said, 0)!.document.timeline!.actions).toEqual([])
  })

  test('renaming a body carries its lines, the way it carries its keys', () => {
    // The third thing keyed by a body's name, and the one most likely to be
    // forgotten when a fourth is added.
    const said = putAction(keyed(), { kind: 'say', t: 0, duration: 2, entity: 'box', text: 'hi' })!
    const renamed = setEntity(said, 0, { name: 'crate' })!
    expect(renamed.document.timeline!.actions[0]!.entity).toBe('crate')
    expect(reopens(renamed)).toBe(true)
  })

  test('deleting a body takes its lines with it', () => {
    const said = putAction(keyed(), { kind: 'say', t: 0, duration: 2, entity: 'box', text: 'hi' })!
    const gone = removeEntity(said, 0)!
    expect(gone.document.timeline!.actions).toEqual([])
    expect(reopens(gone)).toBe(true)
  })
})

describe('an actor brought into a shot', () => {
  test('arrives with a blueprint and a name', () => {
    const made = addActor(keyed(), 'dummy/Dummy', { x: 1, y: 0, z: 2 })
    expect(made).not.toBe(null)
    expect(made!.state.document.entities.some((one) => one.name === made!.name)).toBe(true)
    expect(reopens(made!.state)).toBe(true)
  })

  test('a second one of the same model reuses the blueprint', () => {
    // A blueprint is a kind of thing. Three foxes should not be three of them.
    const one = addActor(keyed(), 'peepz/fox', { x: 0, y: 0, z: 0 })!
    const before = Object.keys(one.state.document.blueprints).length
    const two = addActor(one.state, 'peepz/fox', { x: 2, y: 0, z: 0 })!
    expect(Object.keys(two.state.document.blueprints).length).toBe(before)
    expect(two.name).not.toBe(one.name)
  })

  test('pressing it four times means four actors', () => {
    let state = keyed()
    const names = new Set<string>()
    for (let n = 0; n < 4; n += 1) {
      const made = addActor(state, 'dummy/Dummy', { x: n, y: 0, z: 0 })!
      state = made.state
      names.add(made.name)
    }
    expect(names.size).toBe(4)
  })

  test('a model nothing ships is refused', () => {
    expect(addActor(keyed(), 'nope/Nothing', { x: 0, y: 0, z: 0 })).toBe(null)
  })
})

describe('a movie is an empty stage', () => {
  const plain = () => editing(base())

  test('a new one is its own place, not the level with a clock on it', () => {
    // The panel used to invite "turn this level into a film", so the first act
    // of making a movie was committing your level to being one.
    const made = addMovie(plain())!
    expect(made.state.document.timeline).toBe(undefined)
    const scene = made.state.document.scenes![made.name]
    expect(typeof scene === 'object' && scene.timeline).toBeTruthy()
    expect(reopens(made.state)).toBe(true)
  })

  test('and it starts empty, with nothing behind it', () => {
    const made = addMovie(plain())!
    const scene = made.state.document.scenes![made.name]
    if (typeof scene === 'string') throw new Error('a door')
    expect(scene.entities).toEqual([])
    expect(scene.world.placements).toEqual([])
    // No ground: an infinite plane is a horizon in every wide shot, and a film
    // has nobody to fall out of it.
    expect(scene.world.ground).toBe(false)
  })

  test('pressing it three times makes three', () => {
    let state = plain()
    const names = new Set<string>()
    for (let n = 0; n < 3; n += 1) {
      const made = addMovie(state)!
      state = made.state
      names.add(made.name)
    }
    expect(names.size).toBe(3)
    expect(reopens(state)).toBe(true)
  })

  test('a room is imported into it, set and cast together', () => {
    const made = addMovie(plain())!
    const filled = importPlace(made.state, made.name, MAIN_SCENE)!
    const scene = filled.document.scenes![made.name]
    if (typeof scene === 'string') throw new Error('a door')
    expect(scene.entities.map((one) => one.name)).toEqual(['box', 'lid'])
    expect(reopens(filled)).toBe(true)
  })

  test('importing twice renames the newcomers rather than colliding', () => {
    // A duplicate name is refused by the parser, and worse than refused: the
    // keys already written against the first would start applying to whichever
    // the lookup found first.
    const made = addMovie(plain())!
    const once = importPlace(made.state, made.name, MAIN_SCENE)!
    const twice = importPlace(once, made.name, MAIN_SCENE)!
    const scene = twice.document.scenes![made.name]
    if (typeof scene === 'string') throw new Error('a door')
    expect(new Set(scene.entities.map((one) => one.name)).size).toBe(4)
    expect(reopens(twice)).toBe(true)
  })

  test('and a renamed body takes its children with it', () => {
    const made = addMovie(plain())!
    const twice = importPlace(importPlace(made.state, made.name, MAIN_SCENE)!, made.name, MAIN_SCENE)!
    const scene = twice.document.scenes![made.name]
    if (typeof scene === 'string') throw new Error('a door')
    // `lid` hangs off `box`; the second import renamed both, and the second
    // lid must point at the second box rather than at the first.
    const names = scene.entities.map((one) => one.name)
    const second = scene.entities.find((one) => one.name === names[3])
    expect(second?.parent).toBe(names[2])
    expect(reopens(twice)).toBe(true)
  })

  test('a place cannot import itself', () => {
    expect(importPlace(startMovie(plain())!, undefined, MAIN_SCENE)).toBe(null)
  })

  test('the keys already in a movie survive an import', () => {
    const made = addMovie(plain())!
    const filled = importPlace(made.state, made.name, MAIN_SCENE)!
    const keyed_ = putEntityKey(filled, 'box', 'x', { t: 1, value: 3, ease: 'smooth' }, made.name)!
    const again = importPlace(keyed_, made.name, MAIN_SCENE)!
    const scene = again.document.scenes![made.name]
    if (typeof scene === 'string') throw new Error('a door')
    expect(scene.timeline!.tracks.box!.x).toHaveLength(1)
    expect(reopens(again)).toBe(true)
  })
})

describe('moving several bodies together', () => {
  /** Two named bodies, a movie, and one of them already keyed elsewhere. */
  const pair = () => {
    const started = startMovie(editing(base()))!
    return started
  }

  test('one edit, not one per body', () => {
    // A loop over `moveActorAt` is the obvious build and silently loses all but
    // the last: every call derives its document from the same state.
    const moved = moveActorsAt(pair(), ['box', 'lid'], 0, { x: 3, y: 0, z: 0 })!
    const tracks = moved.document.timeline!.tracks
    expect(tracks.box!.x![0]!.value).toBeCloseTo(3)
    expect(tracks.lid!.x![0]!.value).toBeCloseTo(3)
    expect(reopens(moved)).toBe(true)
  })

  test('each keeps its own offset, because that is what together means', () => {
    // `box` is at 0 and `lid` is at 0 but one cell up; a shift of +3 on x moves
    // both by three rather than putting them in the same place.
    const moved = moveActorsAt(pair(), ['box', 'lid'], 0, { x: 3, y: 1, z: 0 })!
    const tracks = moved.document.timeline!.tracks
    expect(tracks.box!.y![0]!.value).toBeCloseTo(1)
    // `lid` starts at y = 1, so the same shift takes it to 2.
    expect(tracks.lid!.y![0]!.value).toBeCloseTo(2)
  })

  test('a body already keyed at that moment moves from where it is, not from its base', () => {
    // Otherwise dragging a group would collapse it onto everybody's unkeyed
    // poses the moment it was touched.
    const keyed_ = putEntityKey(pair(), 'box', 'x', { t: 0, value: 10, ease: 'smooth' })!
    const moved = moveActorsAt(keyed_, ['box', 'lid'], 0, { x: 2, y: 0, z: 0 })!
    expect(moved.document.timeline!.tracks.box!.x![0]!.value).toBeCloseTo(12)
  })

  test('a name that is not here is skipped rather than refusing the rest', () => {
    const moved = moveActorsAt(pair(), ['box', 'ghost'], 0, { x: 1, y: 0, z: 0 })!
    expect(moved.document.timeline!.tracks.box).toBeTruthy()
    expect(moved.document.timeline!.tracks.ghost).toBeUndefined()
  })

  test('nothing selected is nothing to do', () => {
    expect(moveActorsAt(pair(), [], 0, { x: 1, y: 0, z: 0 })).toBe(null)
    expect(moveActorsAt(pair(), ['ghost'], 0, { x: 1, y: 0, z: 0 })).toBe(null)
  })

  test('a whole drag is one undo step, however many bodies are in it', () => {
    // Marked by the group and the moment, so consecutive frames of one drag
    // replace each other on the stack rather than stacking.
    const once = moveActorsAt(pair(), ['box', 'lid'], 0, { x: 1, y: 0, z: 0 })!
    const twice = moveActorsAt(once, ['box', 'lid'], 0, { x: 2, y: 0, z: 0 })!
    expect(twice.past.length).toBe(once.past.length)
  })
})


describe('duplicating', () => {
  test('brings the children, and re-points their parent at the copy', () => {
    const made = duplicateEntity(editing(base()), 0)!
    const names = made.state.document.entities.map((one) => one.name)
    expect(names).toEqual(['box', 'lid', made.name, 'crate_3'])

    // The copied child hangs off the copied parent, not the original.
    const child = made.state.document.entities.find((one) => one.name === 'crate_3')!
    expect(child.parent).toBe(made.name)
  })

  test('offsets the root and leaves the child where it was', () => {
    const made = duplicateEntity(editing(base()), 0)!
    const root = made.state.document.entities.find((one) => one.name === made.name)!
    const child = made.state.document.entities.find((one) => one.name === 'crate_3')!
    expect(root.x).toBe(1)
    // Relative to its parent, so copying the offset too would move it twice.
    expect(child.x).toBe(0)
    expect(child.y).toBe(1)
  })

  test('a child on its own does not drag its parent along', () => {
    const made = duplicateEntity(editing(base()), 1)!
    expect(made.state.document.entities).toHaveLength(3)
    // Still hanging off the original, which is the only parent it had.
    const copy = made.state.document.entities.find((one) => one.name === made.name)!
    expect(copy.parent).toBe('box')
  })

  test('the copy gets its own keys, and the original keeps hers', () => {
    const made = duplicateEntity(keyed(), 0)!
    const tracks = made.state.document.timeline!.tracks
    expect(tracks.box!.x).toHaveLength(1)
    expect(tracks[made.name]!.x).toHaveLength(1)
    expect(reopens(made.state)).toBe(true)
  })

  test('and its own actions, pointed at itself', () => {
    const acted = putAction(keyed(), {
      kind: 'move',
      entity: 'box',
      t: 0,
      duration: 1,
      x: 3,
      z: 3,
    })!
    const made = duplicateEntity(acted, 0)!
    const mine = made.state.document.timeline!.actions.filter(
      (one) => one.entity === made.name,
    )
    expect(mine).toHaveLength(1)
    expect(made.state.document.timeline!.actions).toHaveLength(2)
    expect(reopens(made.state)).toBe(true)
  })

  test('a pose clip comes with the body, under the copy\'s own name', () => {
    const posed: EditState = {
      ...keyed(),
      document: {
        ...keyed().document,
        clips: {
          'pose-box': { rig: 'dummy', duration: 0, loop: false, times: [0], bones: {} },
        },
      },
    }
    const cued = putAction(posed, {
      kind: 'play',
      entity: 'box',
      t: 0,
      duration: 1,
      clip: 'pose-box',
      loop: false,
    })!
    const made = duplicateEntity(cued, 0)!

    // The clip, so the copy is not standing in the default rig...
    expect(made.state.document.clips!['pose-' + made.name]).toBeDefined()
    // ...and the cue re-pointed at it, rather than at the original's clip.
    const play = made.state.document.timeline!.actions.find(
      (one) => one.entity === made.name && one.kind === 'play',
    )
    expect(play && 'clip' in play ? play.clip : null).toBe('pose-' + made.name)
  })

  test('is one undo step, however many things came with it', () => {
    const before = editing(base())
    const made = duplicateEntity(before, 0)!
    expect(made.state.past).toHaveLength(before.past.length + 1)
  })

  test('an index nobody is at is refused rather than guessed', () => {
    expect(duplicateEntity(editing(base()), 9)).toBe(null)
  })
})


describe('keying several properties at once', () => {
  test('one edit, and every property lands', () => {
    const state = putEntityKeys(startMovie(editing(base()))!, 'box', { x: 3, rotation: 90 }, 1)!
    expect(state.document.timeline!.tracks.box!.x).toHaveLength(1)
    expect(state.document.timeline!.tracks.box!.rotation).toHaveLength(1)
    expect(reopens(state)).toBe(true)
  })

  test('one undo step, not one per property', () => {
    const before = startMovie(editing(base()))!
    const state = putEntityKeys(before, 'box', { x: 3, y: 1, z: 2 }, 1)!
    expect(state.past).toHaveLength(before.past.length + 1)
  })

  test('a property nobody can key is skipped rather than losing the others', () => {
    // The point of the rule: a pad reports both its axes, and one of them being
    // out of range is not a reason to ignore the other.
    const state = putEntityKeys(startMovie(editing(base()))!, 'box', { x: 3, nonsense: 9 }, 1)!
    expect(state.document.timeline!.tracks.box!.x).toHaveLength(1)
    expect('nonsense' in state.document.timeline!.tracks.box!).toBe(false)
  })

  test('nothing keyable at all is refused rather than an empty edit', () => {
    expect(putEntityKeys(startMovie(editing(base()))!, 'box', { nonsense: 9 }, 1)).toBe(null)
  })

  test('a body that is not here is refused', () => {
    expect(putEntityKeys(startMovie(editing(base()))!, 'ghost', { x: 1 }, 1)).toBe(null)
  })

  test('replaces a key already at that instant rather than stacking', () => {
    const once = putEntityKeys(startMovie(editing(base()))!, 'box', { x: 3 }, 1)!
    const twice = putEntityKeys(once, 'box', { x: 5 }, 1)!
    expect(twice.document.timeline!.tracks.box!.x).toHaveLength(1)
    expect(twice.document.timeline!.tracks.box!.x![0]!.value).toBe(5)
  })
})

describe('how a key leaves for the next', () => {
  test('every ease the format has is reachable', () => {
    let state = keyed()
    // `keyed` writes `linear`, so each of these is a real change except that
    // one - which the no-op test below is about.
    for (const ease of ['hold', 'smooth', 'linear'] as const) {
      state = setKeyEase(state, 'box', 'x', 0, ease)!
      expect(state.document.timeline!.tracks.box!.x![0]!.ease).toBe(ease)
    }
    expect(reopens(state)).toBe(true)
  })

  test('hold is what makes a body stay put and then jump', () => {
    const state = setKeyEase(
      putEntityKey(keyed(), 'box', 'x', { t: 2, value: 9, ease: 'smooth' })!,
      'box',
      'x',
      0,
      'hold',
    )!
    const [first, second] = state.document.timeline!.tracks.box!.x!
    expect(first!.ease).toBe('hold')
    // Only the one asked for: the other key keeps what it had.
    expect(second!.ease).toBe('smooth')
    expect(state.document.timeline!.tracks.box!.x).toHaveLength(2)
  })

  test('nothing changing is not an undo step', () => {
    // Pressing the ease a key already has, which is the commonest press of all
    // - it is the one lit in the panel.
    expect(setKeyEase(keyed(), 'box', 'x', 0, 'linear')).toBe(null)
  })

  test('a key nobody is at, and a body that is not here, are refused', () => {
    expect(setKeyEase(keyed(), 'box', 'x', 9, 'hold')).toBe(null)
    expect(setKeyEase(keyed(), 'ghost', 'x', 0, 'hold')).toBe(null)
    expect(setKeyEase(keyed(), 'box', 'rotation', 0, 'hold')).toBe(null)
  })
})
