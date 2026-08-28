import { describe, expect, test } from 'bun:test'
import { spawnEntities } from '../world/entities'
import { stepTriggers } from '../rules/triggers'
import {
  addDoor,
  describeDocument,
  removeLanguage,
  setPhrase,
  addPhase,
  addPhaseVerb,
  addStep,
  removeFlow,
  removePhase,
  removePhaseVerb,
  removeStep,
  setFlowStart,
  setFlowWins,
  setPhaseAllow,
  setPhaseWho,
  setFlowRounds,
  setPhaseVerb,
  startFlow,
  addBlueprint,
  addMark,
  addPack,
  addPart,
  addScript,
  addTrigger,
  addVerb,
  at,
  blueprintUsers,
  box,
  canRedo,
  canUndo,
  cellFromHit,
  editing,
  erase,
  eraseStroke,
  line,
  NEW_BLUEPRINT,
  NEW_PART,
  NEW_SCRIPT,
  nextEntityName,
  outline,
  partsOf,
  packUse,
  place,
  redo,
  removeBlueprint,
  removeMark,
  removePack,
  removePart,
  removePlacement,
  removeScript,
  removeTrigger,
  removeVerb,
  renameBlueprint,
  renameDocument,
  renameScript,
  scriptsOf,
  setBlueprint,
  setBlueprintScript,
  setPart,
  setMark,
  setPlacement,
  setPlayerRole,
  setSpawn,
  blueprintFrom,
  addScene,
  MAX_SCENES,
  removeScene,
  renameScene,
  setCamera,
  setRules,
  setTalk,
  setWorld,
  setScript,
  setTrigger,
  setVerb,
  stroke,
  undo,
  UNDO_DEPTH,
  usedBy,
  type EditState,
} from './edit'
import { findModel } from '../assets/catalogue'
import { MAX_DECLARED_PLAYERS, rulesOf } from './rules'
import { parseXp, XP_FORMAT, type XpDocument } from './format'
import { flowProblems, ROUND_AGAIN, RUN_OVER } from './flow'

/**
 * Everything an editor does that is not drawing.
 *
 * The reason this file is worth its length: the editor is the one thing in the
 * repo that cannot be watched while it is developed - a canvas in the Browser
 * pane never gets a frame - so "did that click land on the right cell" has to be
 * answerable by a function or not at all.
 */

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  // The message rather than "fixture": a test whose *setup* is wrong should say
  // which field, or ten minutes go on the assertion underneath it.
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

const start = () => editing(doc())
const WALL = { model: 'proto/Primitive_Wall' }
const count = (state: EditState) => state.document.world.placements.length

describe('putting something down', () => {
  test('a placement lands where it was asked for', () => {
    const state = place(start(), { x: 2, y: 0, z: -3 }, WALL)!
    expect(count(state)).toBe(1)
    expect(at(state.document, { x: 2, y: 0, z: -3 })).toMatchObject({
      model: 'proto/Primitive_Wall',
      rotation: 0,
      scale: 1,
    })
  })

  test('a second one at the same cell replaces the first', () => {
    // By anchor, not by the cells it fills: a wall is four cells wide, so
    // "replace what is here" has two meanings and only one is useful to an
    // editor.
    let state = place(start(), { x: 0, y: 0, z: 0 }, WALL)!
    state = place(state, { x: 0, y: 0, z: 0 }, { model: 'proto/Primitive_Floor' })!
    expect(count(state)).toBe(1)
    expect(at(state.document, { x: 0, y: 0, z: 0 })?.model).toBe('proto/Primitive_Floor')
  })

  test('placing the same thing again is not an edit', () => {
    // Without this, dragging back and forth over one cell fills the undo stack
    // with identical steps.
    const first = place(start(), { x: 0, y: 0, z: 0 }, WALL)!
    expect(place(first, { x: 0, y: 0, z: 0 }, WALL)).toBeNull()
  })

  test('but the same model turned is', () => {
    const first = place(start(), { x: 0, y: 0, z: 0 }, WALL)!
    const turned = place(first, { x: 0, y: 0, z: 0 }, { ...WALL, rotation: 90 })
    expect(turned).not.toBeNull()
    expect(at(turned!.document, { x: 0, y: 0, z: 0 })?.rotation).toBe(90)
  })

  test('a model we do not ship is refused, not thrown at', () => {
    // A person typed it. The answer to a person is a message.
    expect(place(start(), { x: 0, y: 0, z: 0 }, { model: 'proto/Nope' })).toBeNull()
  })

  test('erasing takes it away, and erasing nothing is nothing', () => {
    const state = place(start(), { x: 1, y: 0, z: 1 }, WALL)!
    const gone = erase(state, { x: 1, y: 0, z: 1 })!
    expect(count(gone)).toBe(0)
    expect(erase(gone, { x: 1, y: 0, z: 1 })).toBeNull()
  })
})

describe('a drag is one edit', () => {
  test('a stroke lays down every cell at once', () => {
    const cells = line({ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 0 })
    const state = stroke(start(), cells, WALL)!
    expect(count(state)).toBe(10)
  })

  test('and one undo takes the whole wall back', () => {
    /**
     * The reason `stroke` exists rather than calling `place` per cell: a drag
     * across forty cells would otherwise be forty entries in the undo stack, so
     * undoing a wall means pressing undo forty times.
     */
    const cells = line({ x: 0, y: 0, z: 0 }, { x: 39, y: 0, z: 0 })
    const state = stroke(start(), cells, WALL)!
    expect(count(state)).toBe(40)
    expect(count(undo(state))).toBe(0)
  })

  test('a stroke over identical pieces changes nothing', () => {
    const cells = line({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })
    const first = stroke(start(), cells, WALL)!
    expect(stroke(first, cells, WALL)).toBeNull()
  })

  test('a stroke replaces what it crosses rather than doubling it', () => {
    const first = place(start(), { x: 2, y: 0, z: 0 }, { model: 'proto/Primitive_Floor' })!
    const state = stroke(first, line({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }), WALL)!
    expect(count(state)).toBe(5)
    expect(at(state.document, { x: 2, y: 0, z: 0 })?.model).toBe('proto/Primitive_Wall')
  })

  test('erasing a drag is one edit too', () => {
    const cells = line({ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 0 })
    const laid = stroke(start(), cells, WALL)!
    const cleared = eraseStroke(laid, cells)!
    expect(count(cleared)).toBe(0)
    expect(count(undo(cleared))).toBe(10)
  })

  test('erasing empty air is nothing', () => {
    expect(eraseStroke(start(), [{ x: 0, y: 0, z: 0 }])).toBeNull()
  })
})

describe('what the level is called', () => {
  test('a rename lands, and is undoable like anything else', () => {
    const state = renameDocument(start(), 'Minigolf, at night')!
    expect(state.document.name).toBe('Minigolf, at night')
    expect(undo(state).document.name).toBe('X')
  })

  test('the edges are trimmed, so a stray space is not a new name', () => {
    expect(renameDocument(start(), '  Minigolf  ')!.document.name).toBe('Minigolf')
    expect(renameDocument(start(), '  X ')).toBeNull()
  })

  test('an empty name is refused rather than written', () => {
    // `parseXp` requires one, so clearing the field would produce a document
    // that will not re-open.
    expect(renameDocument(start(), '')).toBeNull()
    expect(renameDocument(start(), '   ')).toBeNull()
  })

  test('and what comes out is a document that opens', () => {
    const state = renameDocument(start(), 'Coliseum')!
    expect(parseXp(state.document).ok).toBe(true)
  })
})

describe('undo', () => {
  test('goes back and forward again', () => {
    let state = place(start(), { x: 0, y: 0, z: 0 }, WALL)!
    state = place(state, { x: 1, y: 0, z: 0 }, WALL)!
    expect(count(state)).toBe(2)

    state = undo(state)
    expect(count(state)).toBe(1)
    state = redo(state)
    expect(count(state)).toBe(2)
  })

  test('undoing past the beginning is a no-op, not a crash', () => {
    const state = start()
    expect(undo(state)).toBe(state)
    expect(redo(state)).toBe(state)
    expect(canUndo(state)).toBe(false)
    expect(canRedo(state)).toBe(false)
  })

  test('a new edit abandons the redo branch', () => {
    /**
     * The standard behaviour and worth pinning: keeping the branch would mean
     * redo sometimes reapplies work that no longer makes sense against the
     * document underneath it.
     */
    let state = place(start(), { x: 0, y: 0, z: 0 }, WALL)!
    state = undo(state)
    expect(canRedo(state)).toBe(true)

    state = place(state, { x: 5, y: 0, z: 5 }, WALL)!
    expect(canRedo(state)).toBe(false)
  })

  test('the stack is bounded, and the oldest step is the one that goes', () => {
    let state = start()
    for (let i = 0; i < UNDO_DEPTH + 20; i++) {
      state = place(state, { x: i, y: 0, z: 0 }, WALL)!
    }
    expect(state.past.length).toBe(UNDO_DEPTH)

    // Undoing everything available leaves the earliest placements standing
    // rather than an empty document - which is the honest meaning of a bounded
    // stack, and better than pretending it goes all the way back.
    for (let i = 0; i < UNDO_DEPTH; i++) state = undo(state)
    expect(count(state)).toBe(20)
  })
})

describe('tools', () => {
  test('a line has no gaps in it, even diagonally', () => {
    // Gaps matter more here than in a paint program: a wall with a hole you
    // cannot see from above is a wall somebody walks through.
    const cells = line({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 3 })
    expect(cells).toHaveLength(6)
    for (let i = 1; i < cells.length; i++) {
      const step =
        Math.abs(cells[i].x - cells[i - 1].x) +
        Math.abs(cells[i].y - cells[i - 1].y) +
        Math.abs(cells[i].z - cells[i - 1].z)
      expect(step).toBeLessThanOrEqual(3)
      expect(step).toBeGreaterThan(0)
    }
  })

  test('a line to itself is one cell', () => {
    expect(line({ x: 2, y: 2, z: 2 }, { x: 2, y: 2, z: 2 })).toEqual([{ x: 2, y: 2, z: 2 }])
  })

  test('a line is the same set drawn either way round', () => {
    const key = (c: { x: number; y: number; z: number }) => `${c.x},${c.y},${c.z}`
    const there = line({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 0 }).map(key).sort()
    const back = line({ x: 4, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }).map(key).sort()
    expect(there).toEqual(back)
  })

  test('a box is filled, and corners may be given in any order', () => {
    expect(box({ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 2 })).toHaveLength(3 * 2 * 3)
    expect(box({ x: 2, y: 1, z: 2 }, { x: 0, y: 0, z: 0 })).toHaveLength(3 * 2 * 3)
  })

  test('an outline is walls, not a volume - and no corner is counted twice', () => {
    // A room is four walls and no ceiling. Drawing it filled and hollowing it
    // out is two operations where one will do.
    const cells = outline({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 })
    expect(cells).toHaveLength(16)

    const keys = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`))
    expect(keys.size).toBe(cells.length)
    // The middle is open.
    expect(keys.has('2,0,2')).toBe(false)
  })

  test('a one-cell outline is one cell', () => {
    expect(outline({ x: 3, y: 0, z: 3 }, { x: 3, y: 0, z: 3 })).toHaveLength(1)
  })
})

describe('where a click lands', () => {
  test('clicking the top of something puts the next one on top', () => {
    // The interaction the lobby already taught people: the highlight sits
    // against the face you are pointing at.
    const cell = cellFromHit({ x: 2.5, y: 1, z: 3.5 }, { x: 0, y: 1, z: 0 })
    expect(cell).toEqual({ x: 2, y: 1, z: 3 })
  })

  test('clicking a side puts one beside it', () => {
    expect(cellFromHit({ x: 3, y: 0.5, z: 1.5 }, { x: 1, y: 0, z: 0 })).toEqual({
      x: 3,
      y: 0,
      z: 1,
    })
  })

  test('with the modifier it targets the block itself, which is what erasing means', () => {
    expect(cellFromHit({ x: 3, y: 0.5, z: 1.5 }, { x: 1, y: 0, z: 0 }, { inside: true })).toEqual({
      x: 2,
      y: 0,
      z: 1,
    })
  })

  test('a normal that came back as 0.9999 still lands on a whole cell', () => {
    // A renderer hands one of these back now and then, and flooring it is a
    // cell in the wrong place - once in a while, unreproducibly.
    expect(cellFromHit({ x: 2.5, y: 1, z: 3.5 }, { x: 0, y: 0.9999, z: 0.0001 })).toEqual({
      x: 2,
      y: 1,
      z: 3,
    })
  })
})

describe('the document stays valid', () => {
  test('an edited document still parses', () => {
    /**
     * The property that matters most and is easiest to lose: an editor that can
     * produce a document its own parser refuses is an editor that can save a
     * file it cannot open.
     */
    let state = start()
    state = stroke(state, box({ x: -3, y: 0, z: -3 }, { x: 3, y: 0, z: 3 }), {
      model: 'proto/Primitive_Floor',
    })!
    state = stroke(state, outline({ x: -3, y: 1, z: -3 }, { x: 3, y: 1, z: 3 }), WALL)!

    const round = parseXp(JSON.parse(JSON.stringify(state.document)))
    expect(round.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

import { addEntity, ENTITY_STEP, removeEntity, rotateEntity, setEntity, snap } from './edit'

/** A kart with a seat, and something to sit in it. */
function withEntities(): EditState {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    blueprints: {
      kart: {
        model: 'proto/Cube_Prototype_Small',
        sockets: { seat: { x: 0, y: 1, z: -0.5 } },
      },
      rider: { model: 'dummy/Dummy', collider: 'none' },
    },
    entities: [
      { blueprint: 'kart', name: 'kart-1', x: 4, y: 0, z: 4 },
      { blueprint: 'rider', name: 'rider-1', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      { blueprint: 'kart', x: 10, y: 0, z: 0 },
    ],
    world: { floorY: 0, placements: [], marks: [] },
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return editing(parsed.document)
}

describe('entities are not on the lattice', () => {
  test('a tenth of a metre is the step', () => {
    // "Just left of the door" is a real requirement and a metre lattice cannot
    // say it. A tenth is fine enough to line a crate up by eye and coarse
    // enough that two crates placed the same way land in the same place.
    expect(snap(2.44)).toBeCloseTo(2.4, 10)
    expect(snap(2.46)).toBeCloseTo(2.5, 10)
    expect(snap(-0.02)).toBe(0)
    expect(ENTITY_STEP).toBe(0.1)
  })

  test('adding one snaps it', () => {
    const state = addEntity(withEntities(), { blueprint: 'kart', x: 1.234, y: 0, z: -5.678 })!
    const added = state.document.entities.at(-1)!
    expect(added.x).toBeCloseTo(1.2, 10)
    expect(added.z).toBeCloseTo(-5.7, 10)
  })

  test('a blueprint that does not exist is refused', () => {
    expect(addEntity(withEntities(), { blueprint: 'hovercraft', x: 0, y: 0, z: 0 })).toBeNull()
  })

  test('moving snaps too, and moving nowhere is not an edit', () => {
    // A gizmo fires a change event per frame while dragged, and a document per
    // frame in the undo stack is an undo button that does nothing perceptible.
    const state = setEntity(withEntities(), 2, { x: 10.02 })
    expect(state).toBeNull()
  })

  test('a sign’s text is a field the guard has to know about too', () => {
    // The same trap `order` was: a field missing from the no-op guard is a
    // field that can never be edited, because every patch to it looks like
    // nothing changed.
    const state = setEntity(withEntities(), 2, { text: 'this way up' })!
    expect(state.document.entities[2].text).toBe('this way up')
    expect(setEntity(state, 2, { text: 'this way up' })).toBeNull()
    expect(setEntity(state, 2, { colour: 0xff0000 })!.document.entities[2].colour).toBe(0xff0000)
    expect(setEntity(state, 2, { background: 0 })!.document.entities[2].background).toBe(0)
  })

  test('scale cannot go to zero', () => {
    const state = setEntity(withEntities(), 2, { scale: 0 })!
    expect(state.document.entities[2].scale).toBeCloseTo(ENTITY_STEP, 10)
  })

  test('rotation wraps rather than growing forever', () => {
    const state = setEntity(withEntities(), 2, { rotation: 450 })!
    expect(state.document.entities[2].rotation).toBe(90)
    const back = setEntity(state, 2, { rotation: -90 })!
    expect(back.document.entities[2].rotation).toBe(270)
  })
})

describe('hanging one entity off another', () => {
  test('a door on a cabinet, by name', () => {
    // The thing the editor could not do until the Scene panel grew the control:
    // `parent` is in the format and nothing could set it.
    const state = setEntity(withEntities(), 2, { parent: 'kart-1' })!
    expect(state.document.entities[2].parent).toBe('kart-1')
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a socket the parent has, and one it does not is still refused by the parser', () => {
    const state = setEntity(withEntities(), 2, { parent: 'kart-1', socket: 'seat' })!
    expect(state.document.entities[2].socket).toBe('seat')
  })

  test('a parent that is not there is refused rather than written', () => {
    // The list in the panel can go stale - an entity renamed under an open
    // inspector - so this is the backstop rather than a guard against typing.
    expect(setEntity(withEntities(), 2, { parent: 'nobody' })).toBeNull()
  })

  test('nothing can hang from itself', () => {
    expect(setEntity(withEntities(), 0, { parent: 'kart-1' })).toBeNull()
  })

  test('and a loop is refused, however long', () => {
    // rider-1 already hangs from kart-1, so kart-1 hanging from rider-1 closes
    // it. A cycle *resolves* - the depth guard in the transform walk stops it -
    // so it produces a position rather than an error, which is the kind of bug
    // an author argues with instead of noticing.
    expect(setEntity(withEntities(), 0, { parent: 'rider-1' })).toBeNull()
  })

  test('clearing the parent clears the socket with it', () => {
    const state = setEntity(withEntities(), 1, { parent: undefined })!
    expect(state.document.entities[1].parent).toBeUndefined()
    expect(state.document.entities[1].socket).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })
})

describe('deleting takes the passengers with it', () => {
  test('removing a kart removes its rider', () => {
    /**
     * Leaving children pointing at a parent that no longer exists is a document
     * the parser refuses and an editor that can produce it - which is the one
     * property that must hold. Detaching them instead is defensible and
     * surprising: deleting a kart should not leave its driver in mid-air.
     */
    const state = removeEntity(withEntities(), 0)!
    expect(state.document.entities).toHaveLength(1)
    expect(state.document.entities[0].blueprint).toBe('kart')
    expect(state.document.entities[0].name).toBeUndefined()
  })

  test('and what is left still parses', () => {
    const state = removeEntity(withEntities(), 0)!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('removing nothing is nothing', () => {
    expect(removeEntity(withEntities(), 99)).toBeNull()
  })
})

describe('the pivot', () => {
  test('about the origin, turning does not move it', () => {
    const state = rotateEntity(withEntities(), 2, 90, 'origin')!
    const entity = state.document.entities[2]
    expect(entity.rotation).toBe(90)
    expect(entity.x).toBe(10)
    expect(entity.z).toBe(0)
  })

  test('about the centre, it spins where it stands', () => {
    /**
     * The model's middle sits off its own origin, so a rotation about the
     * origin carries it in an arc - the "why is it walking away from me" a
     * rotate ring produces when nobody thinks about the pivot.
     *
     * Cube_Prototype_Small is centred in x and z, so this one does not move
     * either way; what the test pins is that the *centre* stays put for a model
     * that is not centred.
     */
    let state = addEntity(withEntities(), { blueprint: 'rider', x: 0, y: 0, z: 0 })
    const index = state!.document.entities.length - 1
    const before = state!.document.entities[index]

    state = rotateEntity(state!, index, 90, 'centre')
    const after = state!.document.entities[index]

    const model = findModel('dummy/Dummy')!
    const centre = (at: { x: number; z: number }, rotation: number) => {
      const cx = model.min.x + model.size.w / 2
      const cz = model.min.z + model.size.d / 2
      const rad = (rotation * Math.PI) / 180
      return {
        x: at.x + cx * Math.cos(rad) + cz * Math.sin(rad),
        z: at.z - cx * Math.sin(rad) + cz * Math.cos(rad),
      }
    }

    const was = centre(before, before.rotation)
    const is = centre(after, after.rotation)
    expect(is.x).toBeCloseTo(was.x, 1)
    expect(is.z).toBeCloseTo(was.z, 1)
    expect(after.rotation).toBe(90)
  })
})

/**
 * Editing a document's scripts.
 *
 * The same argument as everything else in this file: the editor is the one part
 * of this project that cannot be watched while it is built, so "did that button
 * do the right thing" has to be answerable by a function or not at all.
 */
describe('scripts', () => {
  const withScript = () =>
    editing(
      doc({
        scripts: { turret: 'function onTick() {}' },
        blueprints: {
          gun: { model: 'proto/Box_A', script: 'turret' },
          crate: { model: 'proto/Box_A' },
        },
        entities: [{ blueprint: 'gun', x: 0, y: 0, z: 0 }],
      }),
    )

  test('a new script starts from something that compiles and does nothing', () => {
    const next = addScript(editing(doc({})), 'lift')!
    expect(next).not.toBeNull()
    expect(scriptsOf(next.document).lift).toBe(NEW_SCRIPT)
  })

  test('a name the parser would refuse is refused here, before it is typed into', () => {
    expect(addScript(editing(doc({})), 'no spaces')).toBeNull()
    expect(addScript(editing(doc({})), '')).toBeNull()
    expect(addScript(editing(doc({})), '9lives')).not.toBeNull()
  })

  test('a name already taken is refused rather than silently overwriting one', () => {
    expect(addScript(withScript(), 'turret')).toBeNull()
  })

  /**
   * The one that decides whether the panel is usable.
   *
   * A keystroke has to reach the document, because the draft autosaves from
   * there and losing an afternoon to a refresh is the unforgivable bug. One
   * undo step per character is equally unusable, so consecutive edits to one
   * script collapse - and an edit to something *else* in between breaks the
   * run, or undo would swallow the wall you placed halfway through.
   */
  test('typing is one undo step, not one per character', () => {
    let state = withScript()
    const before = state.past.length
    for (const source of ['f', 'fu', 'fun', 'func']) {
      state = setScript(state, 'turret', source)!
    }
    expect(scriptsOf(state.document).turret).toBe('func')
    expect(state.past.length).toBe(before + 1)

    const back = undo(state)
    expect(scriptsOf(back.document).turret).toBe('function onTick() {}')
  })

  test('typing in two different scripts is two steps', () => {
    let state = addScript(withScript(), 'lift', 'a')!
    state = setScript(state, 'turret', 'x')!
    const between = state.past.length
    state = setScript(state, 'lift', 'y')!
    expect(state.past.length).toBe(between + 1)
  })

  test('undoing and typing again starts a new step rather than editing the old one', () => {
    let state = setScript(withScript(), 'turret', 'one')!
    state = undo(state)
    state = setScript(state, 'turret', 'two')!
    expect(undo(state).document.scripts?.turret).toBe('function onTick() {}')
  })

  test('a source longer than the parser accepts is refused', () => {
    expect(setScript(withScript(), 'turret', 'x'.repeat(70_000))).toBeNull()
  })

  /**
   * Deleting a script has to detach it.
   *
   * A blueprint pointing at a script that does not exist is a document the
   * parser refuses, so leaving the reference behind would make "delete this
   * script" produce a level nobody can open - discovered on reload, by which
   * time the undo stack is gone.
   */
  test('deleting a script takes it off whatever was running it', () => {
    const next = removeScript(withScript(), 'turret')!
    expect(next.document.scripts).toBeUndefined()
    expect(next.document.blueprints.gun.script).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('renaming carries the blueprints across', () => {
    const next = renameScript(withScript(), 'turret', 'cannon')!
    expect(next.document.blueprints.gun.script).toBe('cannon')
    expect(scriptsOf(next.document).cannon).toBe('function onTick() {}')
    expect(scriptsOf(next.document).turret).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('renaming onto a name in use is refused', () => {
    const two = addScript(withScript(), 'lift')!
    expect(renameScript(two, 'turret', 'lift')).toBeNull()
  })

  test('attaching and detaching', () => {
    let state = setBlueprintScript(withScript(), 'crate', 'turret')!
    expect(state.document.blueprints.crate.script).toBe('turret')
    expect(usedBy(state.document, 'turret').sort()).toEqual(['crate', 'gun'])

    state = setBlueprintScript(state, 'crate', null)!
    expect(state.document.blueprints.crate.script).toBeUndefined()
    expect(usedBy(state.document, 'turret')).toEqual(['gun'])
  })

  test('attaching a script that does not exist is refused', () => {
    expect(setBlueprintScript(withScript(), 'crate', 'ghost')).toBeNull()
  })

  /**
   * The property that matters most, again: an edited document still parses.
   * Every operation above, in a row, then through the parser.
   */
  test('a document put through all of it still parses', () => {
    let state = withScript()
    state = addScript(state, 'lift')!
    state = setScript(state, 'lift', 'function onTick(dt) { self.y += dt }')!
    state = setBlueprintScript(state, 'crate', 'lift')!
    state = renameScript(state, 'lift', 'riser')!
    state = removeScript(state, 'turret')!

    const again = parseXp(JSON.parse(JSON.stringify(state.document)))
    if (!again.ok) throw new Error(again.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    expect(again.document.blueprints.crate.script).toBe('riser')
    expect(again.document.blueprints.gun.script).toBeUndefined()
  })
})

/**
 * Blueprints - the kinds of thing a level contains.
 *
 * Four different things can point at one, and the fourth is the one that makes
 * this worth a describe of its own: a `spawn` verb inside *another* blueprint's
 * triggers. An entity, the player's body and the player's weapon are all
 * somewhere obvious; that one is three levels down a nested list and is the
 * reference a rename forgets.
 */
describe('blueprints', () => {
  const world = () =>
    editing(
      doc({
        blueprints: {
          crate: { model: 'proto/Box_A' },
          spawner: {
            model: 'proto/Box_A',
            triggers: [{ on: 'enter', do: [{ op: 'spawn', blueprint: 'crate' }] }],
          },
        },
        entities: [{ blueprint: 'crate', name: 'crate_1', x: 0, y: 0, z: 0 }],
      }),
    )

  test('a new one is a floor tile with nothing on it', () => {
    const next = addBlueprint(start(), 'target')!
    expect(next).not.toBeNull()
    expect(next.document.blueprints.target).toEqual(NEW_BLUEPRINT)
  })

  test('a name the parser would trip over is refused before it is typed into', () => {
    expect(addBlueprint(start(), 'no spaces')).toBeNull()
    expect(addBlueprint(start(), '')).toBeNull()
    expect(addBlueprint(start(), 'target-2')).not.toBeNull()
  })

  test('a name already taken is refused rather than silently overwriting one', () => {
    expect(addBlueprint(world(), 'crate')).toBeNull()
  })

  test('a model we do not ship is refused, here and on a change', () => {
    expect(addBlueprint(start(), 'target', { model: 'nope/Nothing' })).toBeNull()
    expect(setBlueprint(world(), 'crate', { model: 'nope/Nothing' })).toBeNull()
  })

  /**
   * The parser wants three positive sides. An editor that let a zero through
   * would be an editor that saves a file it cannot open, which is the property
   * §9 says must hold.
   */
  test('a collider box with a zero side is refused', () => {
    expect(setBlueprint(world(), 'crate', { collider: { w: 1, h: 0, d: 1 } })).toBeNull()
    expect(setBlueprint(world(), 'crate', { collider: { w: 1, h: 2, d: 1 } })).not.toBeNull()
  })

  /**
   * Physics, and the state in between that every other field here lacks.
   *
   * `{}` is a *meaningful* body - it says "this falls", with every default -
   * so unlike `motions`, an empty block cannot be read as "there isn't one".
   * That is why the patch takes `null` to remove it, and why these two cases
   * are worth writing down separately.
   */
  test('a body is added as an empty block and removed with null', () => {
    const on = setBlueprint(world(), 'crate', { body: {} })!
    expect(on.document.blueprints.crate.body).toEqual({})

    const tuned = setBlueprint(on, 'crate', { body: { bounce: 0.5, mass: 3 } })!
    expect(tuned.document.blueprints.crate.body).toEqual({ bounce: 0.5, mass: 3 })

    const off = setBlueprint(tuned, 'crate', { body: null })!
    expect('body' in off.document.blueprints.crate).toBe(false)
  })

  /**
   * The bounds are the parser's, read from the same table, so an edit outside
   * one would be an editor saving a file it cannot open - §9 again. Refused
   * rather than clamped, exactly as a collider box with a zero side is: the
   * panel's own spinners are bounded, so anything arriving out of range came
   * from somewhere that should be told.
   */
  test('a body outside its own bounds is refused', () => {
    // A ball that climbs its own bounce until it leaves the level.
    expect(setBlueprint(world(), 'crate', { body: { bounce: 1.4 } })).toBeNull()
    // A divide by zero on the first shove.
    expect(setBlueprint(world(), 'crate', { body: { mass: 0 } })).toBeNull()
    expect(setBlueprint(world(), 'crate', { body: { bounce: 1, mass: 0.01 } })).not.toBeNull()
  })

  /**
   * What the editor holds has to be what a save-and-reopen produces (§9).
   * `readBlueprint` drops `draw: true`, so a panel writing one would hold a
   * document that differs from its own file the moment it is reloaded.
   */
  test('turning drawing back on removes the field rather than writing true', () => {
    const off = setBlueprint(world(), 'crate', { draw: false })!
    expect(off.document.blueprints.crate.draw).toBe(false)

    const on = setBlueprint(off, 'crate', { draw: true })!
    expect('draw' in on.document.blueprints.crate).toBe(false)
  })

  /**
   * `spin` names a node in the blueprint's own model and a prop that turns
   * it - the same live-value idea `pose`'s note describes for `self.intensity`.
   * It has to survive a save-and-reopen like every other field (§9).
   */
  test('spin round-trips, and clearing it removes the field', () => {
    const set = setBlueprint(world(), 'crate', {
      spin: { node: 'Blade', axis: 'y', prop: 'angle' },
    })!
    expect(set.document.blueprints.crate.spin).toEqual({ node: 'Blade', axis: 'y', prop: 'angle' })

    const reread = parseXp(JSON.parse(JSON.stringify(set.document)))
    expect(reread.ok).toBe(true)
    if (reread.ok) {
      expect(reread.document.blueprints.crate.spin).toEqual({
        node: 'Blade',
        axis: 'y',
        prop: 'angle',
      })
    }

    // Cleared the same way `Lamp`'s off switch clears `light`: an explicit
    // `undefined` in the patch, which a save-and-reopen drops entirely (JSON
    // has no way to write an `undefined` value).
    const cleared = setBlueprint(set, 'crate', { spin: undefined })!
    expect(cleared.document.blueprints.crate.spin).toBeUndefined()
    expect('spin' in JSON.parse(JSON.stringify(cleared.document.blueprints.crate))).toBe(false)
  })

  /**
   * `setPlayerRole` assembles the player from scratch, so a field it does not
   * name is a field deleted by any unrelated edit. That is silent, and shows up
   * as a game that stopped answering to a button - which nobody traces back to
   * having opened the avatar picker.
   */
  test('changing the body keeps the keys the level had bound', () => {
    const bound = setPlayerRole(world(), { keys: [{ key: 'KeyE', does: 'use' }] })!
    expect(bound.document.player.keys).toEqual([{ key: 'KeyE', does: 'use' }])

    const bodied = setPlayerRole(bound, { blueprint: 'crate' })!
    expect(bodied.document.player.keys).toEqual([{ key: 'KeyE', does: 'use' }])
  })

  test('binding a key the body already answers to is refused, not saved', () => {
    // The panel must not be able to write a document it could not reopen.
    expect(setPlayerRole(start(), { keys: [{ key: 'KeyW', does: 'shoot' }] })).toBeNull()
    expect(setPlayerRole(start(), { keys: [{ key: 'KeyG', does: 'dance' }] })).toBeNull()
    expect(
      setPlayerRole(start(), { keys: [{ key: 'KeyE', does: 'a' }, { key: 'KeyE', does: 'b' }] }),
    ).toBeNull()
    expect(setPlayerRole(start(), { keys: [{ key: 'KeyE', does: '' }] })).toBeNull()
  })

  test('null unbinds them all, and the field goes rather than emptying', () => {
    const bound = setPlayerRole(start(), { keys: [{ key: 'KeyE', does: 'use' }] })!
    const bare = setPlayerRole(bound, { keys: null })!
    expect('keys' in bare.document.player).toBe(false)
  })

  test('the movement numbers are set, bounded, and cleared like jump', () => {
    const paced = setPlayerRole(start(), { speed: 4, sprint: 18, gravity: 13 })!
    expect(paced.document.player).toMatchObject({ speed: 4, sprint: 18, gravity: 13 })

    // The parser's own bounds, so the panel cannot write what it cannot reopen.
    expect(setPlayerRole(start(), { speed: 0 })).toBeNull()
    expect(setPlayerRole(start(), { gravity: 500 })).toBeNull()
    expect(setPlayerRole(start(), { drag: -1 })).toBeNull()

    const cleared = setPlayerRole(paced, { speed: null, sprint: null, gravity: null })!
    for (const field of ['speed', 'sprint', 'gravity']) {
      expect(field in cleared.document.player).toBe(false)
    }
  })

  /**
   * The `keys` carry-test above, for the field it turned out to miss: `bounce`
   * was on `PlayerRole` and not in the rebuild, so opening the avatar picker
   * silently un-bounced the level.
   */
  test('changing the body keeps the bounce the level had', () => {
    const bouncy = editing({ ...world().document, player: { bounce: 2 } })
    const bodied = setPlayerRole(bouncy, { blueprint: 'crate' })!
    expect(bodied.document.player.bounce).toBe(2)
  })

  /**
   * "Numbered, and the highest wins" is only usable if the numbering happens by
   * itself. Dropping four pads should count 1, 2, 3, 4 without anybody typing.
   */
  describe('save points arrive numbered', () => {
    const PAD = {
      model: 'proto/Cube_Prototype_Small',
      collider: 'none' as const,
      triggers: [{ on: 'enter' as const, do: [{ op: 'checkpoint' as const, target: 'other' as const }] }],
    }
    const withPad = () => {
      const made = addBlueprint(start(), 'pad')!
      return setBlueprint(made, 'pad', PAD)!
    }
    const drop = (state: ReturnType<typeof withPad>, props?: Record<string, number>) =>
      addEntity(state, { blueprint: 'pad', x: 0, y: 0, z: 0, ...(props ? { props } : {}) })!

    test('each one counts on from the last', () => {
      let state = withPad()
      for (const expected of [1, 2, 3]) {
        state = drop(state)
        const last = state.document.entities[state.document.entities.length - 1]
        expect(last.props.order).toBe(expected)
      }
    })

    test('the highest placed, not the count — so a gap never repeats a number', () => {
      // Two pads sharing a number is one of them permanently unreachable:
      // taking a save point requires beating the best so far, and equal does
      // not beat it.
      let state = drop(drop(drop(withPad())))
      state = removeEntity(state, 1)!
      state = drop(state)
      const orders = state.document.entities.map((e) => e.props.order)
      expect(orders).toEqual([1, 3, 4])
    })

    test('an order somebody asked for is never overwritten', () => {
      const state = drop(withPad(), { order: 9 })
      expect(state.document.entities[0].props.order).toBe(9)
    })

    test('a blueprint that takes no save point is not numbered', () => {
      // By what it does, not what it is called.
      const plain = setBlueprint(addBlueprint(start(), 'crateish')!, 'crateish', {
        model: 'proto/Cube_Prototype_Small',
      })!
      const state = addEntity(plain, { blueprint: 'crateish', x: 0, y: 0, z: 0 })!
      expect('order' in state.document.entities[0].props).toBe(false)
    })

    /**
     * A default nobody can override is a constant with extra steps - so the
     * number the editor guessed has to be typeable over. It was not: the
     * "nothing would change" guard read a list of fields that had no `props`
     * in it, so the panel's patch was refused with no error to say why.
     */
    describe('and the number stays typeable over', () => {
      test('a props-only patch is a change', () => {
        const state = drop(drop(withPad()))
        const edited = setEntity(state, 1, { props: { order: 7 } })
        expect(edited).not.toBeNull()
        expect(edited!.document.entities[1].props.order).toBe(7)
        // The other pad is untouched, so renumbering one is not renumbering all.
        expect(edited!.document.entities[0].props.order).toBe(1)
      })

      test('the next one counts on from what was typed', () => {
        // Typing 9 over the second of two makes the third a ten, not a three -
        // the default is "one past the highest", and the highest is now the
        // one somebody chose.
        let state = drop(drop(withPad()))
        state = setEntity(state, 1, { props: { order: 9 } })!
        state = drop(state)
        expect(state.document.entities.map((e) => e.props.order)).toEqual([1, 9, 10])
      })

      test('a patch that changes no prop is still no change', () => {
        // The undo stack is the reason: a panel re-emitting the same number
        // must not put a document in it that nobody can perceive undoing.
        const state = drop(withPad())
        expect(setEntity(state, 0, { props: { order: 1 } })).toBeNull()
      })

      test('taking a prop away is a change too', () => {
        // Not covered by comparing the keys that remain, which is why the
        // lengths are compared first.
        const state = drop(withPad())
        const bare = setEntity(state, 0, { props: {} })
        expect(bare).not.toBeNull()
        expect('order' in bare!.document.entities[0].props).toBe(false)
      })
    })
  })

  test('everything that points at one is reported, including the spawn verb', () => {
    const users = blueprintUsers(world().document, 'crate')
    expect(users).toHaveLength(2)
    expect(users.some((line) => line.includes('crate_1'))).toBe(true)
    expect(users.some((line) => line === 'spawner spawns it')).toBe(true)
  })

  test('the player counts as a user, as a body and as a weapon', () => {
    const asBody = doc({
      blueprints: { kart: { model: 'proto/Box_A' } },
      player: { blueprint: 'kart' },
    })
    expect(blueprintUsers(asBody, 'kart')).toEqual(['the player arrives as it'])

    const asGun = doc({
      blueprints: { pistol: { model: 'proto/Box_A' } },
      player: { weapon: { blueprint: 'pistol' } },
    })
    expect(blueprintUsers(asGun, 'pistol')).toEqual(['the player arrives holding it'])
  })

  /**
   * Refused rather than cascaded. Deleting somebody's level furniture as a side
   * effect of tidying a list is a destructive act disguised as a small one - so
   * the answer is no, and `blueprintUsers` is what the panel says instead.
   */
  test('one still in use will not be deleted', () => {
    expect(removeBlueprint(world(), 'crate')).toBeNull()
  })

  test('and one nothing points at goes', () => {
    const empty = addBlueprint(start(), 'target')!
    const gone = removeBlueprint(empty, 'target')!
    expect(gone).not.toBeNull()
    expect(gone.document.blueprints.target).toBeUndefined()
  })

  test('a rename carries the entities, the player and the spawn verb across', () => {
    let state = world()
    state = setPlayerRole(state, { blueprint: 'crate' })!
    const renamed = renameBlueprint(state, 'crate', 'box')!
    expect(renamed).not.toBeNull()

    const after = renamed.document
    expect(after.blueprints.box).toBeDefined()
    expect(after.blueprints.crate).toBeUndefined()
    expect(after.entities[0].blueprint).toBe('box')
    expect(after.player.blueprint).toBe('box')
    expect(after.blueprints.spawner.triggers[0].do[0]).toEqual({
      op: 'spawn',
      blueprint: 'box',
      dx: 0,
      dy: 0,
      dz: 0,
    })
  })

  /**
   * The property the whole file is written to keep: an editor cannot produce a
   * document its own parser refuses. A rename that missed the spawn verb would
   * leave a document that fails here and nowhere else.
   */
  test('and what comes out still parses', () => {
    let state = world()
    state = setPlayerRole(state, { blueprint: 'crate' })!
    const renamed = renameBlueprint(state, 'crate', 'box')!
    expect(parseXp(JSON.parse(JSON.stringify(renamed.document))).ok).toBe(true)
  })

  test('a rename onto a name already taken is refused', () => {
    expect(renameBlueprint(world(), 'crate', 'spawner')).toBeNull()
  })

  test('renaming a blueprint to itself is not an undo step', () => {
    const state = world()
    expect(renameBlueprint(state, 'crate', 'crate')).toBe(state)
  })
})

describe('numbering a new instance', () => {
  test('starts at one and counts up', () => {
    const empty = doc({ blueprints: { crate: { model: 'proto/Box_A' } } })
    expect(nextEntityName(empty, 'crate')).toBe('crate_1')

    const one = doc({
      blueprints: { crate: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'crate', name: 'crate_1', x: 0, y: 0, z: 0 }],
    })
    expect(nextEntityName(one, 'crate')).toBe('crate_2')
  })

  /**
   * Gaps are not filled, and this is the test that says why.
   *
   * Deleting `crate_2` and adding one would otherwise put the new thing in the
   * middle of the list under a name that used to mean something else - and any
   * rule still mentioning `crate_2` would quietly start pointing at it.
   */
  test('and does not reuse a number that has been freed', () => {
    const gapped = doc({
      blueprints: { crate: { model: 'proto/Box_A' } },
      entities: [
        { blueprint: 'crate', name: 'crate_1', x: 0, y: 0, z: 0 },
        { blueprint: 'crate', name: 'crate_3', x: 0, y: 0, z: 0 },
      ],
    })
    expect(nextEntityName(gapped, 'crate')).toBe('crate_4')
  })

  /** A name is unique across the document, not per blueprint. */
  test('steps over a name taken by something that is not one of these', () => {
    const clash = doc({
      blueprints: { crate: { model: 'proto/Box_A' }, barrel: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'barrel', name: 'crate_1', x: 0, y: 0, z: 0 }],
    })
    expect(nextEntityName(clash, 'crate')).toBe('crate_2')
  })

  test('and what it produces is a name the parser accepts', () => {
    const document = doc({ blueprints: { crate: { model: 'proto/Box_A' } } })
    const named = addEntity(editing(document), {
      blueprint: 'crate',
      name: nextEntityName(document, 'crate'),
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      scale: 1,
      props: {},
    })!
    expect(named).not.toBeNull()
    expect(parseXp(JSON.parse(JSON.stringify(named.document))).ok).toBe(true)
  })
})

/**
 * Placements, one at a time.
 *
 * The brush addresses a cell and the inspector addresses a *selection*, and the
 * two are not the same thing: two pieces may share an anchor, so erasing by
 * cell takes whichever came first rather than the one somebody is looking at.
 */
describe('a placement you have selected', () => {
  const laid = () => {
    let state = start()
    state = place(state, { x: 0, y: 0, z: 0 }, WALL)!
    state = place(state, { x: 4, y: 0, z: 0 }, WALL)!
    return state
  }

  test('moving one moves that one', () => {
    const next = setPlacement(laid(), 1, { x: 8 })!
    expect(next.document.world.placements[0].x).toBe(0)
    expect(next.document.world.placements[1].x).toBe(8)
  })

  /**
   * A drag arrives as 3.0000000000000004 and a placement is off the lattice now,
   * so the answer is neither "refuse it" nor "round to a cell" - it is snapped
   * to a tenth, the same as an entity. The float noise has to go, because a
   * placement is written into a file somebody reads.
   */
  test('a fraction from a drag is snapped to a tenth, and stays a fraction', () => {
    const next = setPlacement(laid(), 0, { x: 2.0000000000000004, z: -3.44 })!
    expect(next.document.world.placements[0].x).toBe(2)
    expect(next.document.world.placements[0].z).toBe(-3.4)
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('a snapped number is one a person can read', () => {
    const next = setPlacement(laid(), 0, { x: -3.4, z: 0.7 })!
    // Not -3.4000000000000004, which is what dividing by 0.1 gives you.
    expect(JSON.stringify(next.document.world.placements[0])).toContain('"x":-3.4')
    expect(JSON.stringify(next.document.world.placements[0])).toContain('"z":0.7')
  })

  test('a move that changes nothing is not an undo step', () => {
    const state = laid()
    const next = setPlacement(state, 0, { x: 0 })!
    expect(next.past.length).toBe(state.past.length)
  })

  test('outside the world is refused', () => {
    expect(setPlacement(laid(), 0, { x: 9000 })).toBeNull()
    expect(setPlacement(laid(), 0, { y: -1 })).toBeNull()
  })

  /**
   * The collider moves nothing, which is exactly why it needs its own check:
   * the guard above refuses to record an edit that changed no coordinate, and a
   * field it could not see would make "make this walk-through" the one
   * inspector change that never reaches the undo stack.
   */
  test('making a piece walk-through is an undo step, though nothing moved', () => {
    const state = laid()
    const next = setPlacement(state, 0, { collider: 'none' })!
    expect(next.past.length).toBe(state.past.length + 1)
    expect(next.document.world.placements[0].collider).toBe('none')
  })

  test('and putting it back leaves no key behind', () => {
    // Absent is the measured shape, and `collider: undefined` is not absent to
    // an `in` check or to a diff of the file.
    let state = setPlacement(laid(), 0, { collider: 'none' })!
    state = setPlacement(state, 0, { collider: undefined })!
    expect('collider' in state.document.world.placements[0]).toBe(false)
    expect(JSON.stringify(state.document)).not.toContain('collider')
  })

  test('setting the collider it already has is not an undo step', () => {
    const state = setPlacement(laid(), 0, { collider: [{ w: 1, h: 4, d: 1 }] })!
    const again = setPlacement(state, 0, { collider: [{ w: 1, h: 4, d: 1 }] })!
    expect(again.past.length).toBe(state.past.length)
  })

  test('a model we do not ship is refused', () => {
    expect(setPlacement(laid(), 0, { model: 'nope/Nope' })).toBeNull()
  })

  test('deleting takes the one you picked, not the one at that cell', () => {
    // Two pieces stacked on one anchor, which `place` allows through `stroke`
    // and which the parser has no objection to.
    const state = laid()
    state.document.world.placements.push({ ...state.document.world.placements[0], scale: 2 })
    const before = state.document.world.placements.length

    const next = removePlacement(state, before - 1)!
    expect(next.document.world.placements.length).toBe(before - 1)
    // The original at that cell is untouched: index, not address.
    expect(next.document.world.placements[0].scale).toBe(1)
  })

  test('an index nothing is at is refused rather than shifting the list', () => {
    expect(removePlacement(laid(), 9)).toBeNull()
    expect(setPlacement(laid(), 9, { x: 1 })).toBeNull()
  })

  test('undo puts it back where it was', () => {
    const state = laid()
    const moved = setPlacement(state, 0, { x: 6, rotation: 90 })!
    const back = undo(moved)
    expect(back.document.world.placements[0].x).toBe(0)
    expect(back.document.world.placements[0].rotation).toBe(0)
  })
})

/**
 * Marks: the part of a document the product reads rather than the player.
 *
 * `capabilityProblems` decides from these whether an XP can be a match or a
 * football game, which is why an editor that places walls but not marks can
 * build a perfect pitch that no lobby will ever schedule.
 */
describe('marks', () => {
  const pitch = () =>
    editing(
      doc({
        world: {
          floorY: 0,
          placements: [],
          marks: [
            { kind: 'spawn', x: -6, y: 1, z: 8, team: 'red' },
            { kind: 'spawn', x: 6, y: 1, z: 8, team: 'blue' },
          ],
        },
      }),
    )

  test('adding one fills in the sizes nobody wants to type', () => {
    const next = addMark(editing(doc({})), { kind: 'spawn', x: 0, y: 1, z: 0 })!
    const mark = next.document.world.marks[0]
    expect(mark.facing).toBe(0)
    expect(mark.width).toBeGreaterThan(0)
    expect(mark.height).toBeGreaterThan(0)
  })

  test('tenths, not thousandths - a gizmo drag is snapped', () => {
    const next = addMark(editing(doc({})), { kind: 'red', x: 2.44, y: 1.0000001, z: -3.66 })!
    expect(next.document.world.marks[0].x).toBe(2.4)
    expect(next.document.world.marks[0].y).toBe(1)
    expect(next.document.world.marks[0].z).toBe(-3.7)
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('a spawn can stand on a step, which a whole cell could not say', () => {
    /**
     * Marks were rounded to integers from the day they existed, so a spawn
     * typed at 0.5 came back as a 1 and standing on a half-height ledge was
     * unsayable - the same case `ENTITY_STEP` already answers for "just left of
     * the door". Two decimals in and one tenth out, because the grid is a tenth
     * and a mark is written into a file somebody diffs.
     */
    const next = setMark(pitch(), 0, { y: 0.5 })!
    expect(next.document.world.marks[0].y).toBe(0.5)
    expect(setMark(next, 0, { y: 0.24 })!.document.world.marks[0].y).toBe(0.2)
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('and a patch that only turns one does not move it', () => {
    // The trap in snapping three fields at once: an absent axis must stay
    // absent rather than being read as a zero and written back as one.
    const start = setMark(pitch(), 0, { y: 0.5 })!
    const turned = setMark(start, 0, { facing: 180 })!
    expect(turned.document.world.marks[0].y).toBe(0.5)
  })

  test('a frame you cannot walk through, or one the size of the world, is refused', () => {
    const start = editing(doc({}))
    expect(addMark(start, { kind: 'red', x: 0, y: 1, z: 0, width: 0 })).toBeNull()
    expect(addMark(start, { kind: 'red', x: 0, y: 1, z: 0, width: 99 })).toBeNull()
    expect(addMark(start, { kind: 'red', x: 900, y: 1, z: 0 })).toBeNull()
  })

  test('moving and turning one', () => {
    const next = setMark(pitch(), 0, { x: -8, facing: 90, team: 'green' })!
    expect(next.document.world.marks[0].x).toBe(-8)
    expect(next.document.world.marks[0].facing).toBe(90)
    expect(next.document.world.marks[0].team).toBe('green')
  })

  test('clearing a team removes the field rather than setting it empty', () => {
    const next = setMark(pitch(), 0, { team: '' })!
    expect(next.document.world.marks[0].team).toBeUndefined()
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('a change that changes nothing is not an undo step', () => {
    const state = pitch()
    expect(setMark(state, 0, { x: -6 })!.past.length).toBe(state.past.length)
  })

  /**
   * Deliberately allowed, and the comment on `removeMark` says why: refusing
   * would be refusing to let somebody rearrange their level. The claim is the
   * thing that has to change, and the parser names it on the way back in - which
   * is what this actually pins.
   */
  test('removing a spawn a capability depended on is allowed, and then refused on reload', () => {
    const claimed = editing(
      doc({
        capabilities: ['freeplay', 'match'],
        world: {
          floorY: 0,
          placements: [],
          marks: [
            { kind: 'spawn', x: -6, y: 1, z: 8 },
            { kind: 'spawn', x: 6, y: 1, z: 8 },
          ],
        },
      }),
    )
    const next = removeMark(claimed, 1)!
    expect(next.document.world.marks).toHaveLength(1)

    const again = parseXp(JSON.parse(JSON.stringify(next.document)))
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.problems[0].message).toContain('match')
  })

  test('an index nothing is at is refused', () => {
    expect(removeMark(pitch(), 9)).toBeNull()
    expect(setMark(pitch(), 9, { x: 0 })).toBeNull()
  })
})

/**
 * A spawn is a place to stand, so it lands on something.
 *
 * Reported as *"when I put the spawn point up the character gets lifted in y, so
 * he is always in the air"* - and the character was telling the truth. Every
 * other thing a level places is an object and is allowed to float; the two
 * spawns are a pair of feet, and feet a metre above the floor are the one
 * placement whose own picture is a bug report.
 *
 * The tests are here rather than next to `standingSurface` because the drop is
 * only half of it: the other half is *which edits* trigger one, and getting that
 * wrong in either direction is what a person would actually notice - a spawn
 * that will not go up onto a platform, or one that jumps to the floor when you
 * only turned it round.
 */
describe('a spawn lands on the ground', () => {
  const FLOOR = { model: 'proto/Primitive_Floor' }

  /** A four-by-four tile at y=0, so its top - and the feet on it - is 1. */
  const ground = () => place(editing(doc({})), { x: 0, y: 0, z: 0 }, FLOOR)!

  test('a new one drops to the top of the floor under it, not the level it was placed at', () => {
    /**
     * The path that produced the report. "Put a spawn here" reads the hovered
     * cell, and over open plane that cell is the *working level* - right for a
     * wall, which is what the number was computed for, and a spawn in mid-air
     * for anybody building above the ground.
     */
    const next = addMark(ground(), { kind: 'spawn', x: 0, y: 5, z: 0 })!
    expect(next.document.world.marks[0].y).toBe(1)
  })

  test('and it stops on a platform rather than falling past it', () => {
    // The case `arrivalSpot`'s doc is protecting when it refuses to ground-search
    // at arrival: an author who puts a spawn up on a ledge meant the ledge. A
    // drop *from above* keeps that - the ledge is the first solid it meets.
    const ledge = place(ground(), { x: 0, y: 3, z: 0 }, FLOOR)!
    const next = addMark(ledge, { kind: 'spawn', x: 0, y: 9, z: 0 })!
    expect(next.document.world.marks[0].y).toBe(4)
  })

  test('raising an existing one in the panel keeps the height - the height was the edit', () => {
    /**
     * The reversal of the rule this block used to state, and the report that
     * reversed it: "the spawn point can't change in the y height". Solids only
     * know placements, so a spawn over an entity platform - or a drop-in above
     * the pitch - was a height the panel accepted and the document silently
     * threw away, which is the exact refused-edit-looks-like-nothing failure
     * the camera panel documents. A typed height is now intent; `airborne()`
     * questions it, nothing overrules it.
     */
    const on = addMark(ground(), { kind: 'spawn', x: 0, y: 1, z: 0 })!
    expect(setMark(on, 0, { y: 6 })!.document.world.marks[0].y).toBe(6)
  })

  test('and it keeps it when the next edit only moves it sideways', () => {
    // The half a raised height used to lose: kept until something nudged it
    // along, and then quietly on the floor again. A mark in the air was put
    // there, and x and z say nothing about that.
    const on = addMark(ground(), { kind: 'spawn', x: 0, y: 1, z: 0 })!
    const up = setMark(on, 0, { y: 6 })!
    expect(setMark(up, 0, { x: 1, z: 0 })!.document.world.marks[0].y).toBe(6)
  })

  test('a drag that only went sideways still lands per column - the echoed height is not intent', () => {
    /**
     * The gizmo reports all three axes even when the hand moved only
     * sideways, the vertical number coming back exactly as it went out. That
     * echo must keep grounding, or the one drag everybody does - sliding a
     * spawn across the floor - would leave it hovering at its old ledge
     * height over the new column.
     */
    const ledge = place(place(ground(), { x: 0, y: 3, z: 0 }, FLOOR)!, { x: 8, y: 0, z: 0 }, FLOOR)!
    const on = addMark(ledge, { kind: 'spawn', x: 0, y: 9, z: 0 })!
    expect(on.document.world.marks[0].y).toBe(4)
    expect(setMark(on, 0, { x: 8, y: 4, z: 0 })!.document.world.marks[0].y).toBe(1)
  })

  test('walking it off a ledge sideways lands it on what is over there', () => {
    /**
     * The drop is per column, not per document, which is the thing a level made
     * of more than one height needs: dragging a spawn off a ledge and across to
     * the floor has to come down the whole way, and dragging it back has to go
     * back up. A tile spans four cells, so these two are `x` -2..1 and 6..9.
     */
    const ledge = place(place(ground(), { x: 0, y: 3, z: 0 }, FLOOR)!, { x: 8, y: 0, z: 0 }, FLOOR)!
    const on = addMark(ledge, { kind: 'spawn', x: 0, y: 9, z: 0 })!
    expect(on.document.world.marks[0].y).toBe(4)
    expect(setMark(on, 0, { x: 8 })!.document.world.marks[0].y).toBe(1)
  })

  test('turning it round does not move it', () => {
    /**
     * The half that would be worse than the bug. A spawn deliberately left over
     * a gap - a level you drop into - must not be pulled to the floor by an edit
     * that had nothing to do with where it is.
     */
    const on = addMark(editing(doc({})), { kind: 'spawn', x: 0, y: 5, z: 0 })!
    expect(setMark(on, 0, { facing: 90 })!.document.world.marks[0].y).toBe(5)
  })

  test('a world with nothing underneath keeps the height it was given', () => {
    // No placements and no ground plane: there is genuinely nothing to stand on,
    // and a half-built level is not a number to overrule.
    const next = addMark(editing(doc({})), { kind: 'spawn', x: 0, y: 5, z: 0 })!
    expect(next.document.world.marks[0].y).toBe(5)
  })

  test('a goal is not a pair of feet, and floats where it was put', () => {
    const next = addMark(ground(), { kind: 'red', x: 0, y: 5, z: 0 })!
    expect(next.document.world.marks[0].y).toBe(5)
  })

  test('turning a goal into a spawn lands it, because it has just become feet', () => {
    const goal = addMark(ground(), { kind: 'red', x: 0, y: 5, z: 0 })!
    expect(setMark(goal, 0, { kind: 'spawn' })!.document.world.marks[0].y).toBe(1)
  })

  test("the document's own spawn keeps a typed height too - one rule for both", () => {
    /**
     * The body on the editor's stage is drawn at the first spawn *mark* when
     * there is one and at this otherwise, so the mark rule and this one must
     * agree or the same field behaves differently in a level with teams.
     */
    const next = setSpawn(ground(), { y: 7 })!
    expect(next.document.spawn.y).toBe(7)
  })

  test("and the document's own spawn goes on following the floor it stands on", () => {
    /**
     * Feet already on something keep landing per column, which is the one drag
     * everybody does: sliding a spawn off a ledge and across to the floor. The
     * same two tiles the mark's version of this walks between - a ledge at y=3
     * whose top is 4, and floor over at x=8 whose top is 1.
     */
    const ledge = place(place(ground(), { x: 0, y: 3, z: 0 }, FLOOR)!, { x: 8, y: 0, z: 0 }, FLOOR)!
    const on = setSpawn(ledge, { y: 4 })!
    expect(on.document.spawn.y).toBe(4)
    expect(setSpawn(on, { x: 8, z: 0 })!.document.spawn.y).toBe(1)
  })

  test('but a spawn left in the air stays there when it is only moved sideways', () => {
    /**
     * The other direction, and the report: *"when you change the position with
     * the touchpad the y gets reset to 0"*. The pad sends x and z and no y at
     * all, so a lifted spawn read as an echo on every frame of the drag and
     * came down over the new column - a drop-in the author had typed, undone by
     * the next nudge. Both shapes of the same gesture are checked, because the
     * pad and the gizmo say it differently.
     */
    const up = setSpawn(ground(), { y: 9 })!
    expect(up.document.spawn.y).toBe(9)
    // The pad: two axes, and nothing about the third.
    expect(setSpawn(up, { x: 1, z: 0 })!.document.spawn.y).toBe(9)
    // The gizmo: all three, the height echoed back exactly as it went out.
    expect(setSpawn(up, { x: 1, y: 9, z: 0 })!.document.spawn.y).toBe(9)
  })

  test('and turning the player round does not drop them', () => {
    const up = doc({ spawn: { x: 0, y: 5, z: 0, facing: 0 } })
    expect(setSpawn(editing(up), { facing: 180 })!.document.spawn.y).toBe(5)
  })

  test('a solid ground plane is something to land on, when the world has one on', () => {
    // `world.ground` is the synthetic floor an author turns on while building.
    // It is standable, so it is where a spawn over open space comes to rest.
    const flat = editing(
      doc({ world: { floorY: 2, ground: true, placements: [], marks: [] } }),
    )
    expect(addMark(flat, { kind: 'spawn', x: 0, y: 9, z: 0 })!.document.world.marks[0].y).toBe(2)
  })
})

/**
 * Rules, as something you edit rather than type.
 *
 * The whole reason this layer exists: `blueprints.crate.triggers[0].do[1]` is a
 * path into a JSON file, and the panel that edits it can only be checked by
 * looking at it. What can be checked is that every edit it makes leaves a
 * document the parser still accepts - which for rules is the interesting case,
 * because a trigger with no verbs and a `spawn` naming nothing are both refused
 * at load.
 */
describe('rules', () => {
  const armed = () =>
    editing(
      doc({
        blueprints: {
          crate: { model: 'proto/Box_A', props: { hp: 10 } },
          piece: { model: 'proto/target_pieces_A' },
        },
      }),
    )

  /** The same level, with keys bound - which is what a `pressed` rule needs. */
  const keyed = () =>
    editing(
      doc({
        blueprints: {
          crate: { model: 'proto/Box_A', props: { hp: 10 } },
          piece: { model: 'proto/target_pieces_A' },
        },
        player: {
          keys: [
            { key: 'KeyE', does: 'use' },
            { key: 'KeyF', does: 'kick' },
          ],
        },
      }),
    )

  /**
   * A condition compared against something the level is keeping.
   *
   * The bug this caught, by pressing the button: `setTrigger` guarded the value
   * with `Number.isFinite` alone, so the panel's `@` switch sent a perfectly
   * good `"@world.wanted"`, the edit layer refused it, nothing was written, and
   * the control snapped back — a button whose only visible effect was nothing,
   * which is the exact failure this file's own notes keep being about.
   */
  test('a rule can be compared against a field rather than a number', () => {
    const state = addTrigger(armed(), 'crate')!
    const withWhen = setTrigger(state, 'crate', 0, {
      when: { prop: 'number', is: '==', value: '@world.wanted' },
    })
    expect(withWhen?.document.blueprints.crate.triggers[0]?.when?.value).toBe('@world.wanted')
  })

  test('and a value that is neither is still refused', () => {
    const state = addTrigger(armed(), 'crate')!
    // @ts-expect-error - the point of the check is a document built by hand
    expect(setTrigger(state, 'crate', 0, { when: { prop: 'x', is: '==', value: 'seven' } })).toBeNull()
  })

  test('a new rule is one that cannot be wrong', () => {
    const next = addTrigger(armed(), 'crate')!
    const trigger = next.document.blueprints.crate.triggers[0]
    expect(trigger.on).toBe('enter')
    expect(trigger.do).toHaveLength(1)
    // Round-tripped, because the point of a default is that it loads.
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('a blueprint nobody wrote is refused', () => {
    expect(addTrigger(armed(), 'nothing')).toBeNull()
  })

  test('the condition is added, changed and taken off again', () => {
    let state = addTrigger(armed(), 'crate')!
    state = setTrigger(state, 'crate', 0, { when: { prop: 'hp', is: '<=', value: 0 } })!
    expect(state.document.blueprints.crate.triggers[0].when).toEqual({
      prop: 'hp',
      is: '<=',
      value: 0,
    })

    // `null` and not `undefined`: an absent key in a patch means "leave it
    // alone", so removing needs a value of its own to say it with.
    state = setTrigger(state, 'crate', 0, { when: null })!
    expect(state.document.blueprints.crate.triggers[0].when).toBeUndefined()
  })

  /**
   * Reported as *"I can't select on press in behaviour in the select."*
   *
   * The panel's event picker sends `{ on: 'pressed' }` and nothing else - it has
   * no key to send, because the rule did not have one a moment ago - and
   * `setTrigger` refused that outright. The editor wrote nothing, the dropdown
   * snapped back, and there was no message anywhere: the option looked broken
   * because from outside it was.
   */
  test('choosing `pressed` fills in a key rather than refusing the choice', () => {
    const state = addTrigger(keyed(), 'crate')!
    const next = setTrigger(state, 'crate', 0, { on: 'pressed' })
    expect(next).not.toBeNull()
    const trigger = next!.document.blueprints.crate.triggers[0]
    expect(trigger.on).toBe('pressed')
    // The first binding the level declares, which is both a legal document and
    // the one an author most likely meant. They change it in the field beside.
    expect(trigger.key).toBe('KeyE')
    expect(parseXp(JSON.parse(JSON.stringify(next!.document))).ok).toBe(true)
  })

  test('and a key already chosen is left alone', () => {
    let state = addTrigger(keyed(), 'crate')!
    state = setTrigger(state, 'crate', 0, { on: 'pressed', key: 'KeyF' })!
    // Re-picking the same event must not quietly reset it to the first binding.
    expect(setTrigger(state, 'crate', 0, { on: 'pressed' })).toBeNull()
    expect(state.document.blueprints.crate.triggers[0].key).toBe('KeyF')
  })

  test('a level that binds no keys still refuses, because there is nothing to listen for', () => {
    // The honest answer rather than a rule that can never fire. The panel
    // disables the option and says so, so the silence does not come back.
    const state = addTrigger(armed(), 'crate')!
    expect(setTrigger(state, 'crate', 0, { on: 'pressed' })).toBeNull()
  })

  test('and turning a press back into a proximity rule drops the key with it', () => {
    let state = addTrigger(keyed(), 'crate')!
    state = setTrigger(state, 'crate', 0, { on: 'pressed' })!
    state = setTrigger(state, 'crate', 0, { on: 'enter' })!
    expect(state.document.blueprints.crate.triggers[0].key).toBeUndefined()
  })

  test('a rule cannot be emptied of verbs', () => {
    const state = addTrigger(armed(), 'crate')!
    expect(setTrigger(state, 'crate', 0, { do: [] })).toBeNull()
    expect(removeVerb(state, 'crate', 0, 0)).toBeNull()
  })

  test('a spawn naming a blueprint nobody wrote is refused', () => {
    const state = addTrigger(armed(), 'crate')!
    expect(
      setVerb(state, 'crate', 0, 0, { op: 'spawn', blueprint: 'ghost', dx: 0, dy: 0, dz: 0 }),
    ).toBeNull()
    expect(
      setVerb(state, 'crate', 0, 0, { op: 'spawn', blueprint: 'piece', dx: 0, dy: 1, dz: 0 }),
    ).not.toBeNull()
  })

  test('the shape a damaged rule actually takes, and it parses', () => {
    let state = addTrigger(armed(), 'crate', {
      on: 'damaged',
      when: { prop: 'hp', is: '<=', value: 0 },
      do: [{ op: 'spawn', blueprint: 'piece', dx: 0, dy: 0.5, dz: 0 }],
    })!
    state = addVerb(state, 'crate', 0, { op: 'score', amount: 1 })!
    state = addVerb(state, 'crate', 0, { op: 'despawn', target: 'self' })!

    const rule = state.document.blueprints.crate.triggers[0]
    expect(rule.do.map((verb) => verb.op)).toEqual(['spawn', 'score', 'despawn'])
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a verb in the middle is taken away without disturbing the others', () => {
    let state = addTrigger(armed(), 'crate')!
    state = addVerb(state, 'crate', 0, { op: 'score', amount: 3 })!
    state = addVerb(state, 'crate', 0, { op: 'despawn', target: 'self' })!
    state = removeVerb(state, 'crate', 0, 1)!
    expect(state.document.blueprints.crate.triggers[0].do.map((verb) => verb.op)).toEqual([
      'emit',
      'despawn',
    ])
  })

  test('removing a rule leaves the ones beside it', () => {
    let state = addTrigger(armed(), 'crate', { on: 'enter', do: [{ op: 'score', amount: 1 }] })!
    state = addTrigger(state, 'crate', { on: 'exit', do: [{ op: 'score', amount: 2 }] })!
    state = removeTrigger(state, 'crate', 0)!
    expect(state.document.blueprints.crate.triggers).toHaveLength(1)
    expect(state.document.blueprints.crate.triggers[0].on).toBe('exit')
  })

  test('a change that changes nothing is not an undo step', () => {
    const state = addTrigger(armed(), 'crate')!
    expect(setTrigger(state, 'crate', 0, { on: 'enter' })).toBeNull()
  })
})

/**
 * Who the player is.
 *
 * The one part of a document where a wrong name is invisible until somebody
 * plays it: a body that does not exist is a person who does not appear, and a
 * socket that does not is a gun on the floor.
 */
describe('the player', () => {
  const cast = () =>
    editing(
      doc({
        // The dummy is its own pack, and a document that uses art it has not
        // declared is refused - which is the check working, not the fixture
        // being awkward.
        packs: [{ id: 'proto' }, { id: 'dummy' }],
        blueprints: {
          marksman: {
            model: 'dummy/Dummy',
            collider: 'none',
            sockets: { hand: { x: 0.3, y: 1.2, z: 0.3 } },
          },
          pistol: { model: 'proto/Gun_Pistol', collider: 'none', props: { damage: 5 } },
        },
      }),
    )

  test('a body, and a gun in its hand', () => {
    let state = setPlayerRole(cast(), { blueprint: 'marksman' })!
    state = setPlayerRole(state, { weapon: { blueprint: 'pistol', socket: 'hand' } })!
    expect(state.document.player).toEqual({
      blueprint: 'marksman',
      weapon: { blueprint: 'pistol', socket: 'hand' },
    })
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a socket the body does not have is refused', () => {
    const state = setPlayerRole(cast(), { blueprint: 'marksman' })!
    expect(setPlayerRole(state, { weapon: { blueprint: 'pistol', socket: 'pocket' } })).toBeNull()
  })

  test('a socket with no body to hang on is refused', () => {
    expect(
      setPlayerRole(cast(), { weapon: { blueprint: 'pistol', socket: 'hand' } }),
    ).toBeNull()
  })

  test('going back to the built-in dummy', () => {
    const state = setPlayerRole(cast(), { blueprint: 'marksman' })!
    expect(setPlayerRole(state, { blueprint: null })!.document.player).toEqual({})
  })

  test('a blueprint nobody wrote is refused', () => {
    expect(setPlayerRole(cast(), { blueprint: 'ghost' })).toBeNull()
  })
})

/**
 * The world's own two numbers.
 *
 * `ground` is the interesting one and the reason this exists: the runtime's
 * answer to a half-built level was a catch plane forty cells down, which is not
 * standing anywhere.
 */
describe('the world', () => {
  test('ground goes on and comes off, and the document still parses', () => {
    const state = setWorld(start(), { ground: true })!
    expect(state.document.world.ground).toBe(true)
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
    expect(setWorld(state, { ground: false })!.document.world.ground).toBe(false)
  })

  test('the floor is a whole cell', () => {
    expect(setWorld(start(), { floorY: 2.6 })!.document.world.floorY).toBe(3)
  })

  test('a change that changes nothing is not an undo step', () => {
    const state = start()
    expect(setWorld(state, { ground: false })!.past.length).toBe(state.past.length)
  })
})

describe('falling starts you over', () => {
  test('it goes on, and comes back off', () => {
    const on = setWorld(start(), { restart: true })!
    expect(on.document.world.restart).toBe(true)
    expect(setWorld(on, { restart: false })!.document.world.restart).toBe(false)
  })

  /**
   * The pair the parser refuses, prevented rather than caught.
   *
   * A solid plane everywhere means nothing ever falls past the height that
   * would send it back, so an editor that let both be set would save a document
   * it cannot reopen - and that is the one property this whole file exists to
   * keep.
   */
  test('turning ground on turns it off, rather than saving an unopenable file', () => {
    const on = setWorld(start(), { restart: true })!
    const grounded = setWorld(on, { ground: true })!
    expect(grounded.document.world.ground).toBe(true)
    expect(grounded.document.world.restart).toBe(false)
    expect(parseXp(JSON.parse(JSON.stringify(grounded.document))).ok).toBe(true)
  })

  test('and it cannot be turned on while ground is', () => {
    const grounded = setWorld(start(), { ground: true })!
    const asked = setWorld(grounded, { restart: true })
    // Not an edit at all: the answer is already what it would have been.
    expect(asked!.document.world.restart).toBe(false)
    expect(parseXp(JSON.parse(JSON.stringify(asked!.document))).ok).toBe(true)
  })
})

/**
 * Editing what a blueprint is made of.
 *
 * Every refusal in here is a document `parseXp` would send back. That is the
 * whole contract of this file - an editor that can save a file it cannot open
 * is worse than one that refuses a keystroke - and parts are where it is
 * easiest to break, because a cycle *resolves*: the depth guard in
 * `partTransforms` stops it, so a loop produces a number rather than an error.
 */
describe('the parts a blueprint is made of', () => {
  const withParts = () =>
    editing(
      doc({
        blueprints: {
          turret: {
            model: 'proto/Box_A',
            parts: [
              { model: 'proto/Box_A', name: 'base', x: 0, y: 0, z: 0 },
              { model: 'proto/Box_A', name: 'barrel', parent: 'base', x: 0, y: 1, z: 0 },
            ],
          },
        },
      }),
    )

  test('a new part is a floor tile at the origin', () => {
    const next = addPart(withParts(), 'turret')!
    expect(next).not.toBeNull()
    const parts = partsOf(next.document.blueprints.turret)
    expect(parts).toHaveLength(3)
    expect(parts[2]).toEqual(NEW_PART)
  })

  test('a model we do not ship is refused', () => {
    expect(addPart(withParts(), 'turret', { model: 'nope/Nothing' })).toBeNull()
    expect(setPart(withParts(), 'turret', 0, { model: 'nope/Nothing' })).toBeNull()
  })

  test('a part can be moved and turned', () => {
    const next = setPart(withParts(), 'turret', 1, { x: 2, rotation: 90 })!
    const part = partsOf(next.document.blueprints.turret)[1]
    expect(part.x).toBe(2)
    expect(part.rotation).toBe(90)
    // And keeps what it was not asked about.
    expect(part.parent).toBe('base')
  })

  test('a name a sibling already has is refused', () => {
    expect(setPart(withParts(), 'turret', 1, { name: 'base' })).toBeNull()
  })

  test('a parent that does not resolve is refused', () => {
    expect(setPart(withParts(), 'turret', 1, { parent: 'nothing' })).toBeNull()
  })

  /**
   * The one that matters. A loop does not throw and does not hang - it returns
   * a position, because the resolver gives up at a depth and hands back
   * whatever it had. A number is something you argue with rather than notice.
   */
  test('and a loop is refused rather than left to the depth guard', () => {
    // base already has barrel hanging from it; hanging base from barrel closes
    // the ring.
    expect(setPart(withParts(), 'turret', 0, { parent: 'barrel' })).toBeNull()
  })

  test('clearing the parent clears the socket with it', () => {
    let state = setPart(withParts(), 'turret', 1, { socket: 'muzzle' })!
    state = setPart(state, 'turret', 1, { parent: '' })!
    const part = partsOf(state.document.blueprints.turret)[1]
    expect(part.parent).toBeUndefined()
    expect(part.socket).toBeUndefined()
  })

  /**
   * Detached rather than refused, which is the opposite of `removeBlueprint`
   * and right for the opposite reason: nothing is lost, so nothing needs
   * protecting. The orphan falls back to the blueprint's origin, where it is
   * visible and one drag from where it belongs.
   */
  test('removing a part detaches whatever hung from it', () => {
    const next = removePart(withParts(), 'turret', 0)!
    const parts = partsOf(next.document.blueprints.turret)
    expect(parts).toHaveLength(1)
    expect(parts[0].name).toBe('barrel')
    expect(parts[0].parent).toBeUndefined()
  })

  test('the last part takes the block with it', () => {
    let state = removePart(withParts(), 'turret', 1)!
    state = removePart(state, 'turret', 0)!
    expect(state.document.blueprints.turret.parts).toBeUndefined()
  })

  /** The property the whole file is written to keep. */
  test('whatever comes out of all of it still parses', () => {
    let state = addPart(withParts(), 'turret', { model: 'proto/Box_A' })!
    state = setPart(state, 'turret', 2, { name: 'sight', parent: 'barrel', y: 2 })!
    state = removePart(state, 'turret', 1)!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })
})

/**
 * What mode an XP is, from the editor.
 *
 * The interesting half is not the preset - it is that `scoreLimit` and
 * `timeLimit` are *optional*, and that absent is a third value rather than a
 * synonym for zero. A course with no time limit is over when somebody finishes
 * it; a zero limit is refused by the parser precisely so that absent is the
 * only way to say "no limit". A form field cleared to empty has to arrive here
 * as `null` and leave as nothing at all.
 */
describe('the mode a document is in', () => {
  const race = () =>
    editing(
      doc({
        capabilities: ['freeplay', 'competition'],
        world: {
          floorY: 0,
          placements: [],
          marks: [
            { kind: 'start', x: 0, y: 0, z: 0 },
            { kind: 'finish', x: 4, y: 0, z: 0 },
          ],
        },
      }),
    )

  /**
   * A document written before the block existed still edits.
   *
   * Asserted through `setRules` rather than against `document.rules` directly,
   * because what the parser leaves on a document with no block is the parser's
   * contract and not this file's - and at the time of writing it leaves the
   * field undefined despite typing it as required. `setRules` falls back to
   * `DEFAULT_RULES`, so editing an old document works either way.
   */
  test('a document written before the block existed still edits', () => {
    const next = setRules(start(), { preset: 'deathmatch' })!
    expect(next).not.toBeNull()
    expect(rulesOf(next.document)).toEqual({ preset: 'deathmatch' })
  })

  test('a preset can be chosen', () => {
    const next = setRules(race(), { preset: 'parkour' })!
    expect(next).not.toBeNull()
    expect(rulesOf(next.document).preset).toBe('parkour')
  })

  /**
   * Refused here as well as at the parser, because an editor that accepts it
   * is an editor that saves a file it cannot reopen - `football` needs a goal
   * at each end and this document has none.
   */
  test('a preset the world cannot back up is refused', () => {
    expect(setRules(race(), { preset: 'football' })).toBeNull()
  })

  test('limits can be set, and are kept apart', () => {
    let state = setRules(race(), { preset: 'deathmatch', scoreLimit: 20 })!
    state = setRules(state, { timeLimit: 300 })!
    expect(rulesOf(state.document)).toEqual({
      preset: 'deathmatch',
      scoreLimit: 20,
      timeLimit: 300,
    })
  })

  test('the respawn wait is the third of them, and had no way in until now', () => {
    /**
     * `readRules` has copied `respawn` in the same three-field loop as the two
     * above for as long as they have existed, and nothing could write it - so a
     * level could only ask for one by typing JSON. It matters more now that a
     * death is visible: a body falls onto its back, and at the default of zero
     * it falls and stands straight back up.
     */
    let state = setRules(race(), { preset: 'deathmatch', respawn: 5 })!
    expect(rulesOf(state.document).respawn).toBe(5)
    // On the same terms as its siblings: null takes it away, zero is refused
    // because absent is already how you say there is no wait.
    state = setRules(state, { respawn: null })!
    expect(rulesOf(state.document).respawn).toBeUndefined()
    expect(setRules(race(), { preset: 'deathmatch', respawn: 0 })).toBeNull()
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('and clearing one takes it away rather than zeroing it', () => {
    let state = setRules(race(), { preset: 'deathmatch', scoreLimit: 20, timeLimit: 300 })!
    state = setRules(state, { timeLimit: null })!
    expect(rulesOf(state.document).timeLimit).toBeUndefined()
    expect(rulesOf(state.document).scoreLimit).toBe(20)
    // And what comes out is still a document, which a zero would not have been.
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a zero limit is refused, because absent is how you say there is none', () => {
    expect(setRules(race(), { preset: 'deathmatch', scoreLimit: 0 })).toBeNull()
    expect(setRules(race(), { preset: 'deathmatch', timeLimit: -5 })).toBeNull()
  })

  test('changing only the preset leaves the limits alone', () => {
    let state = setRules(race(), { preset: 'deathmatch', scoreLimit: 20 })!
    state = setRules(state, { preset: 'shooter' })!
    expect(rulesOf(state.document)).toEqual({ preset: 'shooter', scoreLimit: 20 })
  })

  /**
   * Coming back to the default takes the block away rather than writing it.
   *
   * The stronger claim, and the one that matters: the editor stringifies the
   * parsed document to save, so a materialised `{ preset: 'freestyle' }` would
   * grow a block into every file anybody merely opened the dropdown in. Picking
   * the same thing back has to leave the document it started with.
   */
  test('and going back to freestyle takes the block away again', () => {
    const state = setRules(race(), { preset: 'parkour' })!
    const back = setRules(state, { preset: 'freestyle' })!
    expect(back.document.rules).toBeUndefined()
    expect(rulesOf(back.document)).toEqual({ preset: 'freestyle' })
  })

  /** But a freestyle somebody put a limit on is not the default, and stays. */
  test('though a freestyle with a limit is kept, because somebody meant it', () => {
    const state = setRules(race(), { preset: 'freestyle', timeLimit: 90 })!
    expect(state.document.rules).toEqual({ preset: 'freestyle', timeLimit: 90 })
  })
})

describe('how sides are handed out', () => {
  const sided = () =>
    editing(
      doc({
        capabilities: ['freeplay', 'match'],
        world: {
          floorY: 0,
          placements: [],
          marks: [
            { kind: 'spawn', x: 0, y: 0, z: 0, team: 'red' },
            { kind: 'spawn', x: 8, y: 0, z: 0, team: 'blue' },
          ],
        },
      }),
    )

  test('it can be set to host', () => {
    const next = setRules(sided(), { assign: 'host' })!
    expect(rulesOf(next.document).assign).toBe('host')
  })

  /**
   * `spread` is the default, so writing it is writing nothing.
   *
   * Without this, setting the picker back would leave a block that differs from
   * the default only by saying what the default is - `isDefaultRules` would
   * keep it, and a document nobody configured would have grown a rules block by
   * being looked at.
   */
  test('setting it back to spread clears the field rather than writing it', () => {
    const state = setRules(sided(), { assign: 'host' })!
    const back = setRules(state, { assign: 'spread' })!
    expect(back.document.rules?.assign).toBeUndefined()
    expect(rulesOf(back.document).assign).toBeUndefined()
  })

  test('and a document that only ever said spread has no block at all', () => {
    const next = setRules(sided(), { assign: 'spread' })!
    expect(next.document.rules).toBeUndefined()
  })

  test('an invented policy is refused', () => {
    expect(setRules(sided(), { assign: 'balanced' as never })).toBeNull()
  })

  /**
   * The trap Lane B found in `isDefaultRules` and fixed, asserted from this
   * side too: a field that survives a round trip through the parser is a field
   * that will still be there next week.
   */
  test('and what comes out survives being saved and read back', () => {
    const state = setRules(sided(), { preset: 'freestyle', assign: 'host' })!
    const reread = parseXp(JSON.parse(JSON.stringify(state.document)))
    expect(reread.ok).toBe(true)
    if (!reread.ok) return
    expect(rulesOf(reread.document).assign).toBe('host')
  })

  test('a shape can be declared, and cleared back to whatever the marks say', () => {
    const state = setRules(sided(), { sides: 'ffa' })!
    expect(rulesOf(state.document).sides).toBe('ffa')
    // `null` rather than a value to compare against: absent here is derived,
    // so there is no "the default" to write and drop the way `spread` is.
    const back = setRules(state, { sides: null })!
    expect(back.document.rules).toBeUndefined()
  })

  test('a shape the world cannot back up is refused, as the parser refuses it', () => {
    // The same rule as `football` without goals: an editor that accepts it is
    // an editor that saves a file it cannot reopen.
    expect(setRules(start(), { sides: 'team' })).toBeNull()
    expect(setRules(sided(), { sides: 'team' })).not.toBeNull()
  })

  test('and one against everyone will not also be split by a hash', () => {
    const state = setRules(sided(), { sides: 'one-vs-all' })!
    expect(setRules(state, { assign: 'spread' })).not.toBeNull()
    // `spread` is the default and so is never written; what is refused is the
    // block that would actually contain the contradiction.
    expect(rulesOf(setRules(state, { assign: 'spread' })!.document).assign).toBeUndefined()
  })

  /**
   * The bug this whole shape of function was rewritten for.
   *
   * `setRules` built its next block as `{ preset }` and copied three fields
   * onto it, so every field with no control in any panel - `respawn`,
   * `players`, `roles` - was deleted by the act of touching the mode picker. A
   * game created "on your own" is `rules.players` and nothing else, so it
   * stopped being for one player the first time its author changed the mode.
   */
  test('a field no panel can edit is carried, not dropped, by editing one that can', () => {
    const withPlayers = editing(
      doc({
        capabilities: ['freeplay'],
        rules: { preset: 'freestyle', players: { max: 1 }, respawn: 4 },
      }),
    )
    const next = setRules(withPlayers, { preset: 'shooter', scoreLimit: 10 })!
    expect(rulesOf(next.document)).toEqual({
      preset: 'shooter',
      scoreLimit: 10,
      players: { max: 1 },
      respawn: 4,
    })
  })
})

/**
 * The sky, where absent is the interesting value.
 *
 * A document with no background lets the page show through, which is how the
 * runtime sits inside the site rather than covering it. So "no colour" is not a
 * tidy default to fall back on - it is the thing most documents want, and a
 * control that always held a colour could never express it.
 */
describe('the background', () => {
  test('a colour can be set and read back', () => {
    const next = setWorld(start(), { background: '#101018' })!
    expect(next.document.world.background).toBe('#101018')
  })

  test('clearing it takes the field away rather than blanking it', () => {
    const set = setWorld(start(), { background: '#101018' })!
    const cleared = setWorld(set, { background: null })!
    expect(cleared.document.world.background).toBeUndefined()
    expect('background' in cleared.document.world).toBe(false)
  })

  /**
   * What a cleared text input actually produces. `new THREE.Color('')` throws
   * inside a render rather than refusing at the boundary, so an empty string
   * must never reach the document.
   */
  test('an empty string is absence, not a colour', () => {
    const set = setWorld(start(), { background: '#101018' })!
    const cleared = setWorld(set, { background: '' })!
    expect(cleared.document.world.background).toBeUndefined()
  })

  test('and setting the other world fields leaves it alone', () => {
    const set = setWorld(start(), { background: 'rebeccapurple' })!
    const grounded = setWorld(set, { ground: true })!
    expect(grounded.document.world.background).toBe('rebeccapurple')
  })

  test('what comes out still parses, with and without one', () => {
    const set = setWorld(start(), { background: '#101018' })!
    expect(parseXp(JSON.parse(JSON.stringify(set.document))).ok).toBe(true)
    const cleared = setWorld(set, { background: null })!
    expect(parseXp(JSON.parse(JSON.stringify(cleared.document))).ok).toBe(true)
  })
})

describe('the packs a document is built out of', () => {
  test('placing a model declares its pack, because the parser insists on it', () => {
    // The bug this closes, in one test. `packs` was written by the template and
    // never again, so a room with one dungeon pillar in it was a document that
    // would not re-open - and the failure landed on the *next* person to load
    // it, not on the person who placed it.
    const state = place(start(), { x: 0, y: 0, z: 0 }, { model: 'dungeon/pillar' })!
    expect(state.document.packs.map((p) => p.id)).toEqual(['proto', 'dungeon'])
    expect(parseXp(state.document).ok).toBe(true)
  })

  test('the credit travels with it, from the table rather than from the caller', () => {
    const state = addPack(start(), 'medieval-tiles')!
    expect(state.document.packs.at(-1)).toEqual({
      id: 'medieval-tiles',
      author: 'Kay Lousberg',
      licence: 'CC0',
      source: 'https://kaylousberg.itch.io/',
    })
  })

  test('adding a pack is one undo step, like every other edit', () => {
    const state = addPack(start(), 'dungeon')!
    expect(canUndo(state)).toBe(true)
    expect(undo(state).document.packs.map((p) => p.id)).toEqual(['proto'])
  })

  test('a pack we do not ship, and one already declared, are both refused', () => {
    expect(addPack(start(), 'nosuchpack')).toBeNull()
    expect(addPack(start(), 'proto')).toBeNull()
  })

  test('a pack the level is made of cannot be removed', () => {
    const state = place(start(), { x: 0, y: 0, z: 0 }, { model: 'dungeon/pillar' })!
    expect(packUse(state.document, 'dungeon')).toBe(1)
    expect(removePack(state, 'dungeon')).toBeNull()

    // Take the pillar away and it lets go.
    const empty = removePlacement(state, 0)!
    expect(packUse(empty.document, 'dungeon')).toBe(0)
    expect(removePack(empty, 'dungeon')!.document.packs.map((p) => p.id)).toEqual(['proto'])
  })

  test('deleting the last thing made of a pack does not undeclare it', () => {
    // `packs` is also the credits - it is what an export writes into
    // CREDITS.txt - so an author's line does not vanish because their last
    // barrel was deleted. Dropping it is `removePack`, which is a click.
    const state = place(start(), { x: 0, y: 0, z: 0 }, { model: 'dungeon/pillar' })!
    const empty = removePlacement(state, 0)!
    expect(empty.document.packs.map((p) => p.id)).toEqual(['proto', 'dungeon'])
  })

  test('a blueprint counts as a use, the same as a placement does', () => {
    // The parser reads both lists, so this has to as well - and a blueprint is
    // the likelier of the two to be first: the player carries a model before a
    // level has anything in it.
    const added = addBlueprint(start(), 'walker')!
    const state = setBlueprint(added, 'walker', { model: 'adventure/dagger' })!
    expect(state.document.packs.map((p) => p.id)).toContain('adventure')
    expect(packUse(state.document, 'adventure')).toBe(1)
    expect(removePack(state, 'adventure')).toBeNull()
    expect(parseXp(state.document).ok).toBe(true)
  })
})

/**
 * The tilt and the per-axis size, from the editor's side.
 *
 * The parser dropping a zero pitch is no use on its own: the editor writes a
 * parsed document straight back out, so if a field nudged back to its default
 * were *written* here, every save would grow it again. Both halves have to hold
 * for the round trip to, which is why this describes both.
 */
describe('tilting and stretching something you have selected', () => {
  const laid = () => {
    let state = start()
    state = place(state, { x: 0, y: 0, z: 0 }, WALL)!
    return state
  }

  test('a placement takes a pitch, and it survives being saved and read back', () => {
    const next = setPlacement(laid(), 0, { pitch: 30, stretch: { x: 3 } })!
    expect(next.document.world.placements[0].pitch).toBe(30)
    expect(next.document.world.placements[0].stretch).toEqual({ x: 3 })
    const reread = parseXp(JSON.parse(JSON.stringify(next.document)))
    expect(reread.ok).toBe(true)
    if (!reread.ok) return
    expect(reread.document.world.placements[0].pitch).toBe(30)
  })

  test('a tilt is wrapped and rounded the way a turn is', () => {
    const next = setPlacement(laid(), 0, { pitch: 450.4, roll: -90 })!
    expect(next.document.world.placements[0].pitch).toBe(90)
    expect(next.document.world.placements[0].roll).toBe(270)
  })

  test('putting it back to level clears the field rather than writing a zero', () => {
    const tilted = setPlacement(laid(), 0, { pitch: 30 })!
    const level = setPlacement(tilted, 0, { pitch: 0 })!
    expect('pitch' in level.document.world.placements[0]).toBe(false)
    // And the placement is the one it started as, byte for byte.
    expect(JSON.stringify(level.document.world.placements[0])).toBe(
      JSON.stringify(laid().document.world.placements[0]),
    )
  })

  test('a multiplier back to one goes with its axis, and the last one takes the block', () => {
    const wide = setPlacement(laid(), 0, { stretch: { x: 3, y: 2 } })!
    const half = setPlacement(wide, 0, { stretch: { x: 1, y: 2 } })!
    expect(half.document.world.placements[0].stretch).toEqual({ y: 2 })
    const none = setPlacement(half, 0, { stretch: { y: 1 } })!
    expect('stretch' in none.document.world.placements[0]).toBe(false)
  })

  test('a multiplier cannot go to zero, the same as scale', () => {
    const next = setPlacement(laid(), 0, { stretch: { x: 0 } })!
    expect(next.document.world.placements[0].stretch!.x).toBeCloseTo(ENTITY_STEP, 10)
  })

  test('a tilt that changes nothing is not an undo step', () => {
    const state = laid()
    expect(setPlacement(state, 0, { pitch: 0, roll: 0 })!.past.length).toBe(state.past.length)
    const tilted = setPlacement(state, 0, { pitch: 30 })!
    expect(setPlacement(tilted, 0, { pitch: 30 })!.past.length).toBe(tilted.past.length)
  })

  test('an entity gets the same treatment as a placement', () => {
    const tilted = setEntity(withEntities(), 2, { roll: 20, stretch: { z: 2 } })!
    expect(tilted.document.entities[2].roll).toBe(20)
    expect(tilted.document.entities[2].stretch).toEqual({ z: 2 })

    const back = setEntity(tilted, 2, { roll: 0, stretch: { z: 1 } })!
    expect('roll' in back.document.entities[2]).toBe(false)
    expect('stretch' in back.document.entities[2]).toBe(false)
    expect(setEntity(back, 2, { roll: 0 })).toBeNull()
  })

  /**
   * The brush lays level, unstretched pieces, so painting over a ramp is a real
   * edit. Before the tilt was part of the "is this already here" key, the
   * stroke reported itself as changing nothing and the ramp stayed - so there
   * was no way to straighten a piece with the tool that made it.
   */
  test('painting over a tilted piece with the same model straightens it', () => {
    const tilted = setPlacement(laid(), 0, { pitch: 30 })!
    const painted = place(tilted, { x: 0, y: 0, z: 0 }, WALL)!
    expect(painted).not.toBeNull()
    expect('pitch' in painted.document.world.placements[0]).toBe(false)
  })

  test('a tilt that is not a number is refused rather than saved as NaN', () => {
    // A NaN in the matrix is a level with an invisible hole in it and no error
    // anywhere - the exact failure every refusal in this file exists for.
    expect(setPlacement(laid(), 0, { pitch: Number.NaN })).toBeNull()
    expect(setEntity(withEntities(), 2, { stretch: { y: Number.NaN } })).toBeNull()
  })
})

/**
 * Where the world is watched from, as a thing a panel can change.
 *
 * There was no write path at all before this - the block was reachable only by
 * hand-editing JSON, which is why there was no camera panel in the editor.
 */
describe('the camera', () => {
  const level = () => editing(doc({}))

  test('a document that never said has no block, and picking follow keeps it that way', () => {
    // The round-trip rule: the editor stringifies the parsed document to save,
    // so a materialised `{ kind: 'follow' }` would grow a block into every file
    // anybody merely opened the panel in.
    expect(level().document.camera).toBeUndefined()
    expect(setCamera(level(), { kind: 'follow' })).toBeNull()
  })

  test('a side-on camera is written, with its own settings', () => {
    let state = setCamera(level(), { kind: 'side' })!
    state = setCamera(state, { axis: 'z', distance: 30, span: 16 })!
    expect(state.document.camera).toEqual({ kind: 'side', axis: 'z', distance: 30, span: 16 })
  })

  test('and going back to follow takes the whole block away again', () => {
    const state = setCamera(level(), { kind: 'side', distance: 30 })!
    const back = setCamera(state, { kind: 'follow' })!
    expect(back.document.camera).toBeUndefined()
  })

  /**
   * The rule this function has that `setRules` does not.
   *
   * `cameraProblems` refuses a `span` on a `follow` camera, so carrying the
   * block across a kind change would write something the parser then rejects -
   * which in this editor is a save that silently does nothing.
   */
  test('switching kind drops the fields that stop meaning anything', () => {
    let state = setCamera(level(), { kind: 'side', axis: 'z', distance: 30, span: 16 })!
    state = setCamera(state, { kind: 'fixed', x: 10, y: 8, z: -4 })!
    expect(state.document.camera).toEqual({ kind: 'fixed', x: 10, y: 8, z: -4 })
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a fixed camera with nowhere to stand is refused', () => {
    expect(setCamera(level(), { kind: 'fixed' })).toBeNull()
    expect(setCamera(level(), { kind: 'fixed', x: 1, y: 2 })).toBeNull()
    expect(setCamera(level(), { kind: 'fixed', x: 1, y: 2, z: 3 })).not.toBeNull()
  })

  test('half an aim is refused, because the other half would keep tracking', () => {
    const placed = setCamera(level(), { kind: 'fixed', x: 1, y: 2, z: 3 })!
    expect(setCamera(placed, { yaw: 90 })).toBeNull()
    expect(setCamera(placed, { yaw: 90, pitch: -15 })).not.toBeNull()
  })

  test('a spot to look at is written, and refused beside an angle', () => {
    const placed = setCamera(level(), { kind: 'fixed', x: 1, y: 2, z: 3 })!
    const staring = setCamera(placed, { at: { x: 0, y: 1, z: 0 } })!
    expect(staring.document.camera).toEqual({
      kind: 'fixed',
      x: 1,
      y: 2,
      z: 3,
      at: { x: 0, y: 1, z: 0 },
    })
    // Two answers to one question, so the panel writes one and clears the other.
    expect(setCamera(staring, { yaw: 90, pitch: 0 })).toBeNull()
    expect(setCamera(staring, { yaw: 90, pitch: 0, at: null })).not.toBeNull()
  })

  /**
   * The bug that quietly ate a table.
   *
   * `seats` is on `cameraFieldsFor('fixed')` and on the sweep `isDefaultCamera`
   * uses, so everything downstream believed it was handled - but this function
   * rebuilt the block out of `{ kind }` plus a list of *numeric* fields, so
   * nudging the lens by one degree on `mensch` saved a fixed camera with no
   * chairs in it, and four people ended up in one seat. Nothing said so: a
   * dropped field you cannot see in the panel looks exactly like a save that
   * worked.
   */
  test('and the chairs survive an edit to anything else in the block', () => {
    const seats = { blue: { x: 0, y: 22, z: 20 }, red: { x: 0, y: 22, z: -20 } }
    const seated = editing(doc({ camera: { kind: 'fixed', x: 0, y: 22, z: 20, seats } }))
    expect(setCamera(seated, { fov: 55 })!.document.camera).toEqual({
      kind: 'fixed',
      x: 0,
      y: 22,
      z: 20,
      fov: 55,
      seats,
    })
  })

  test('a follow camera can be framed, and cleared back to the default', () => {
    let state = setCamera(level(), { behind: 6, above: 2, beside: 0.8 })!
    expect(state.document.camera).toEqual({ kind: 'follow', behind: 6, above: 2, beside: 0.8 })

    // `null` and not `undefined`: absent in a patch means "leave it alone", so
    // clearing needs a value of its own to say it with.
    state = setCamera(state, { behind: null, above: null, beside: null })!
    expect(state.document.camera).toBeUndefined()
  })

  test('the lens is a document field on every kind that has one', () => {
    expect(setCamera(level(), { fov: 50, far: 250 })!.document.camera).toEqual({
      kind: 'follow',
      fov: 50,
      far: 250,
    })
    /*
     * A no-op on a side camera, which is orthographic and has no lens to widen.
     * `null` rather than a state, because the field is not carried and nothing
     * therefore changed - and a panel driven by `cameraFieldsFor` never offers
     * it there in the first place.
     */
    const flat = setCamera(level(), { kind: 'side' })!
    expect(setCamera(flat, { fov: 50 })).toBeNull()
    expect(flat.document.camera).toEqual({ kind: 'side' })
  })

  test('a number outside the bounds is refused rather than saved', () => {
    expect(setCamera(level(), { behind: 0 })).toBeNull()
    expect(setCamera(level(), { fov: 300 })).toBeNull()
    expect(setCamera(level(), { far: 2 })).toBeNull()
  })
})

/**
 * What is under the world, as four answers rather than three flags.
 *
 * A solid plane, a catch forty cells down, a walk back, and a death. The last
 * two are the pair worth testing: they answer the same question, so the parser
 * refuses a document carrying both - and an editor that could write one is an
 * editor that saves a level it cannot reopen.
 */
describe('falling', () => {
  const level = () => editing(doc({}))

  test('a fall can be made a death', () => {
    const next = setWorld(level(), { fatal: true })!
    expect(next.document.world.fatal).toBe(true)
    expect(next.document.world.restart).toBe(false)
    expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
  })

  test('and the two fall answers clear each other, whichever way you move', () => {
    // Not refused: a tick is a thing somebody just did, and answering it by
    // leaving the other one on would answer a click with a broken document.
    let state = setWorld(level(), { restart: true })!
    state = setWorld(state, { fatal: true })!
    expect(state.document.world).toMatchObject({ fatal: true, restart: false })

    state = setWorld(state, { restart: true })!
    expect(state.document.world).toMatchObject({ fatal: false, restart: true })
  })

  test('ground clears both, because nothing falls past a solid plane', () => {
    const state = setWorld(level(), { fatal: true })!
    const floored = setWorld(state, { ground: true })!
    expect(floored.document.world).toMatchObject({ ground: true, fatal: false, restart: false })
    expect(parseXp(JSON.parse(JSON.stringify(floored.document))).ok).toBe(true)
  })

  /**
   * The sweep the other two blocks have and this one did not.
   *
   * `setWorld` returns early when nothing changed, and that comparison is a
   * hand-written list of fields. `fatal` was added to the patch and left out of
   * it, and the symptom was the whole feature quietly not working: ticking the
   * box wrote nothing, because the fields it compared were all unchanged and it
   * returned before reaching the write.
   *
   * `Required<Parameters<typeof setWorld>[1]>` is what makes the next one a
   * compile error - add a field to the patch and this fixture does not build
   * until it is listed here, and listing it here is what runs it through the
   * guard.
   *
   * The same pair `isDefaultRules` and `isDefaultCamera` already run, met from
   * the third side: those two guard a field being *dropped* on save, and this
   * guards one that cannot be *set* at all.
   */
  test('every field the patch accepts actually reaches the document', () => {
    const everything: Required<Parameters<typeof setWorld>[1]> = {
      floorY: 3,
      ground: true,
      restart: true,
      fatal: true,
      background: '#101018',
    }

    for (const key of Object.keys(everything) as (keyof typeof everything)[]) {
      /*
       * From a level that has none of them, so every field is a change - and
       * `ground` is set false first because it clears the two fall answers, and
       * a fixture that turned it on would make those two look like no-ops.
       */
      const from = editing(doc({}))
      const next = setWorld(from, { [key]: everything[key] })

      /*
       * The *document* has to differ, not the call has to return something.
       *
       * The first version of this asserted `next !== null` and was worthless:
       * the no-change path returns `state` rather than null, so a field the
       * guard had forgotten sailed through it. Found by putting the `fatal` bug
       * back and watching this pass - which is the only way to know a guard
       * guards anything.
       */
      const wrote = next !== null && JSON.stringify(next.document.world) !== JSON.stringify(from.document.world)
      expect({ key, wrote }).toEqual({ key, wrote: true })
    }
  })

  test('and every one of those survives the parser', () => {
    // The property this whole file exists to keep: whatever the editor writes,
    // it can open again.
    for (const patch of [
      { ground: true },
      { restart: true },
      { fatal: true },
      { ground: false, fatal: true },
    ]) {
      const next = setWorld(level(), patch)
      if (!next) continue
      expect(parseXp(JSON.parse(JSON.stringify(next.document))).ok).toBe(true)
    }
  })
})

/**
 * Scenery becoming a thing with behaviour.
 *
 * The route before this was five steps - add a blueprint, find the model in the
 * picker, place an entity, delete the placement - and the fifth is the one
 * people forget, which leaves a crate inside a crate where one is scenery and
 * one is not.
 */
describe('making a blueprint from something already placed', () => {
  const laid = () => {
    const state = editing(doc({}))
    return place(state, { x: 3, y: 1, z: -2 }, { model: 'proto/Box_A' })!
  }

  test('the placement becomes an entity of a new blueprint', () => {
    const before = laid()
    const made = blueprintFrom(before, 0)!
    expect(made).not.toBeNull()

    const document = made.state.document
    expect(document.blueprints[made.name]?.model).toBe('proto/Box_A')
    expect(document.entities).toHaveLength(1)
    expect(document.entities[0]).toMatchObject({ blueprint: made.name, x: 3, y: 1, z: -2 })
  })

  test('and the scenery is consumed, not left inside it', () => {
    // The decision this function exists for: two things in one cell that look
    // identical and behave differently is worse than either on its own.
    const made = blueprintFrom(laid(), 0)!
    expect(made.state.document.world.placements).toHaveLength(0)
  })

  test('the turn and the size come across, because the author already chose them', () => {
    let state = editing(doc({}))
    state = place(state, { x: 0, y: 0, z: 0 }, { model: 'proto/Box_A' })!
    state = setPlacement(state, 0, { rotation: 90, scale: 2 })!
    const made = blueprintFrom(state, 0)!
    expect(made.state.document.entities[0]).toMatchObject({ rotation: 90, scale: 2 })
  })

  test('the name comes off the model, and a second one does not collide', () => {
    let state = laid()
    const first = blueprintFrom(state, 0)!
    expect(first.name).toBe('Box_A')

    state = place(first.state, { x: 9, y: 1, z: 9 }, { model: 'proto/Box_A' })!
    const second = blueprintFrom(state, 0)!
    // Uniquified rather than refused: "that name is taken" is not a thing to
    // tell somebody who has not chosen a name.
    expect(second.name).toBe('Box_A-2')
    expect(Object.keys(second.state.document.blueprints)).toContain('Box_A')
  })

  test('behaviour comes with it, the same as a blueprint made by hand', () => {
    // `addBlueprint` asks the preset table, so turning a spike tile into an
    // entity gets the spike rules rather than a hazard that does nothing.
    let state = editing(doc({}))
    state = place(state, { x: 0, y: 0, z: 0 }, { model: 'platformer-neutral/floor_spikes_2x2x1' })!
    const made = blueprintFrom(state, 0)
    if (!made) return
    expect(made.state.document.blueprints[made.name]?.triggers?.length ?? 0).toBeGreaterThan(0)
  })

  test('it is one undo, not three', () => {
    // Three commits would leave somebody who pressed this once and undid once
    // holding a blueprint with no scenery.
    const before = laid()
    const made = blueprintFrom(before, 0)!
    const undone = undo(made.state)
    expect(undone.document.world.placements).toHaveLength(1)
    expect(undone.document.entities).toHaveLength(0)
  })

  test('a placement nobody laid is refused', () => {
    expect(blueprintFrom(laid(), 7)).toBeNull()
  })

  test('and what comes out is a document that opens', () => {
    const made = blueprintFrom(laid(), 0)!
    expect(parseXp(JSON.parse(JSON.stringify(made.state.document))).ok).toBe(true)
  })
})

/**
 * Whether the people in this level may say anything.
 *
 * docs/xp/backlog.md §7b's off switch, from the panel's side. All of it is one
 * property: **on is the state with nothing written down**, so turning something
 * back on has to remove the field rather than write `true` - otherwise an
 * author who changed their mind leaves a block in the file forever.
 */
describe('talking', () => {
  const level = () => editing(doc({}))

  test('a document that never said has no block, and turning something on keeps it that way', () => {
    expect(level().document.talk).toBeUndefined()
    expect(setTalk(level(), { chat: true })).toBeNull()
    expect(setTalk(level(), { emotes: true })).toBeNull()
  })

  test('turning chat off writes only that', () => {
    const state = setTalk(level(), { chat: false })!
    expect(state.document.talk).toEqual({ chat: false })
  })

  test('and turning it back on takes the block away entirely', () => {
    const off = setTalk(level(), { chat: false })!
    const on = setTalk(off, { chat: true })!
    expect(on.document.talk).toBeUndefined()
  })

  test('the two switches are independent', () => {
    let state = setTalk(level(), { chat: false })!
    state = setTalk(state, { emotes: false })!
    expect(state.document.talk).toEqual({ chat: false, emotes: false })
    state = setTalk(state, { chat: true })!
    expect(state.document.talk).toEqual({ emotes: false })
  })

  test('pressing the switch you are already on is not an undo step', () => {
    const off = setTalk(level(), { chat: false })!
    expect(setTalk(off, { chat: false })).toBeNull()
  })

  test('what comes out is a document that opens', () => {
    const state = setTalk(level(), { chat: false, emotes: false })!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })
})

describe('editing a flow', () => {
  const withFlow = (): EditState => {
    const base = start()
    return {
      ...base,
      document: {
        ...base.document,
        flow: {
          start: 'roll',
          phases: {
            roll: { allow: ['roll'], next: [{ on: 'rolled', go: 'move' }] },
            move: { allow: ['use'], next: [{ on: 'moved', go: 'roll' }] },
          },
        },
      },
    }
  }

  test('a phase can be narrowed to some of the keys', () => {
    const next = setPhaseAllow(withFlow(), 'move', ['use', 'roll'])
    expect(next?.document.flow?.phases.move.allow).toEqual(['use', 'roll'])
  })

  test('and to none of them, which is a different thing from all of them', () => {
    // Empty is a phase saying nobody acts; absent is every binding. A control
    // that could only produce a list could not say the more useful of the two.
    expect(setPhaseAllow(withFlow(), 'move', [])?.document.flow?.phases.move.allow).toEqual([])
  })

  test('and back to all of them, without the field being left behind', () => {
    const next = setPhaseAllow(withFlow(), 'move', undefined)
    expect(next?.document.flow?.phases.move).not.toHaveProperty('allow')
  })

  test('a phase that is not there is refused rather than created', () => {
    // A phase is a node in a graph, and making one by ticking a checkbox on a
    // mistyped name is how a flow grows a state nothing reaches.
    expect(setPhaseAllow(withFlow(), 'mvoe', ['use'])).toBeNull()
  })

  test('writing what is already there is not an undo step', () => {
    const state = withFlow()
    expect(setPhaseAllow(state, 'move', ['use'])).toBe(state)
  })

  test("a phase can be made the turn-holder's, and given back to everybody", () => {
    const scoped = setPhaseWho(withFlow(), 'roll', 'turn')
    expect(scoped?.document.flow?.phases.roll.who).toBe('turn')
    // Back off without the field left behind, like allow going back to all.
    const open = setPhaseWho(scoped!, 'roll', null)
    expect(open?.document.flow?.phases.roll).not.toHaveProperty('who')
  })

  test('whose phase it is refuses a phase that is not there, and skips a non-edit', () => {
    expect(setPhaseWho(withFlow(), 'mvoe', 'turn')).toBeNull()
    const state = withFlow()
    expect(setPhaseWho(state, 'roll', null)).toBe(state)
  })

  test('a run can be told to go round, and told to stop', () => {
    const round = setFlowRounds(withFlow(), 3)!
    expect(round.document.flow?.rounds).toBe(3)
    // And back to once, without the field left behind.
    expect(setFlowRounds(round, null)!.document.flow).not.toHaveProperty('rounds')
  })

  test('taking the rounds away takes the seams with them', () => {
    /**
     * The pair the parser insists on: a step to the seam with no count is
     * refused, so leaving one behind would be an op whose only possible result
     * is a document that cannot save. Same rule `removePhase` follows for the
     * arrows that pointed at what it removed.
     */
    const round = setFlowRounds(withFlow(), 2)!
    const wired = addStep(round, 'move', { after: 5, go: ROUND_AGAIN })!
    expect(wired.document.flow?.phases.move.next).toHaveLength(2)
    const once = setFlowRounds(wired, null)!
    expect(once.document.flow?.phases.move.next).toHaveLength(1)
    expect(flowProblems(once.document.flow!)).toEqual([])
  })

  test('a seam cannot be drawn on a flow that does not go round', () => {
    // Refused here as well as by the parser, so the panel cannot write a
    // document that will not save.
    expect(addStep(withFlow(), 'move', { after: 5, go: ROUND_AGAIN })).toBeNull()
  })

  test('the end is a destination any flow may draw', () => {
    const stop = addStep(withFlow(), 'move', { after: 5, go: RUN_OVER })!
    expect(stop.document.flow?.phases.move.next?.[1]?.go).toBe(RUN_OVER)
    expect(flowProblems(stop.document.flow!)).toEqual([])
  })

  test('best of one is not a thing to say, and neither is best of a half', () => {
    expect(setFlowRounds(withFlow(), 1)).toBeNull()
    expect(setFlowRounds(withFlow(), 2.5)).toBeNull()
  })

  test('the start can be moved to another phase', () => {
    expect(setFlowStart(withFlow(), 'move')?.document.flow?.start).toBe('move')
  })

  test('but not to one that does not exist', () => {
    // The same refusal `flowProblems` makes at parse time, said here so the
    // panel cannot build a document that will not save.
    expect(setFlowStart(withFlow(), 'begin')).toBeNull()
  })

  test('and a level with no flow refuses both', () => {
    expect(setPhaseAllow(start(), 'roll', [])).toBeNull()
    expect(setFlowStart(start(), 'roll')).toBeNull()
  })

  /**
   * What a phase does on entering, which was the half of a flow that could be
   * drawn and not written.
   *
   * The panel could add a phase, wire the arrows and narrow the keys, and the
   * one thing a phase is *for* was a read-only row — so a flow was authorable
   * right up to the point where it does anything.
   */
  test('a phase can be given something to do', () => {
    const next = addPhaseVerb(withFlow(), 'roll', { op: 'emit', event: 'dealt' })
    expect(next?.document.flow?.phases.roll.does).toEqual([{ op: 'emit', event: 'dealt' }])
  })

  test('and another after it, in the order they were added', () => {
    let state = addPhaseVerb(withFlow(), 'roll', { op: 'emit', event: 'one' })!
    state = addPhaseVerb(state, 'roll', { op: 'emit', event: 'two' })!
    expect(state.document.flow?.phases.roll.does?.map((verb) => verb.op)).toEqual(['emit', 'emit'])
    expect(state.document.flow?.phases.roll.does?.[1]).toEqual({ op: 'emit', event: 'two' })
  })

  test('one is replaced outright rather than patched', () => {
    // A verb is a tagged union whose fields differ by tag, so a partial patch
    // across a change of `op` has no meaning — `setVerb`'s argument exactly.
    const state = addPhaseVerb(withFlow(), 'roll', { op: 'emit', event: 'one' })!
    const next = setPhaseVerb(state, 'roll', 0, { op: 'score', amount: 1 })
    expect(next?.document.flow?.phases.roll.does).toEqual([{ op: 'score', amount: 1 }])
  })

  test('the last one may go, unlike a rule’s — and takes the field with it', () => {
    /**
     * A rule with nothing to do is refused by the parser, so its last verb has
     * no remove button. A phase with nothing to do is the ordinary case — a
     * phase that only waits is most of a turn — so this is allowed, and it must
     * not leave `"does": []` behind for the next save to carry forever.
     */
    const state = addPhaseVerb(withFlow(), 'roll', { op: 'emit', event: 'one' })!
    const next = removePhaseVerb(state, 'roll', 0)
    expect(next?.document.flow?.phases.roll).not.toHaveProperty('does')
  })

  test('a phase or an index that is not there is refused rather than created', () => {
    expect(addPhaseVerb(withFlow(), 'mvoe')).toBeNull()
    expect(setPhaseVerb(withFlow(), 'roll', 0, { op: 'score', amount: 1 })).toBeNull()
    expect(removePhaseVerb(withFlow(), 'roll', 0)).toBeNull()
    expect(addPhaseVerb(start(), 'roll')).toBeNull()
  })

  test('and what it writes still parses, which is the editor’s one hard rule', () => {
    const state = addPhaseVerb(withFlow(), 'roll', { op: 'emit', event: 'dealt' })!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  /**
   * A place becoming a run, which is the edit every other one in this block
   * depended on and which nothing could make.
   *
   * `addPhase` refuses a document with no flow — its own note says the first
   * phase is `setFlow`'s business — and `setFlow` was never written. So every
   * level opened in the editor had no flow, the panel drew *this level describes
   * no round*, and there was no control anywhere that could change that. The
   * graph, the arrows, the verb rows and `allow` were all reachable only by
   * hand-editing the JSON to grow a `flow` block first.
   */
  test('a level with no round can be given one', () => {
    const next = startFlow(start(), 'roll')
    expect(next?.document.flow).toEqual({ start: 'roll', phases: { roll: {} } })
  })

  test('the first phase is the start, because those are the same phase', () => {
    // A flow's `start` has to name one of its `phases`, so the smallest flow
    // that parses is one phase - there is no half-made state to hold.
    const next = startFlow(start(), 'deal')!
    expect(flowProblems(next.document.flow!)).toEqual([])
  })

  test('and every other flow edit works on it straight away', () => {
    let state = startFlow(start(), 'roll')!
    state = addPhase(state, 'move')!
    state = addStep(state, 'roll', { on: 'rolled', go: 'move' })!
    state = addPhaseVerb(state, 'move', { op: 'emit', event: 'your go' })!
    expect(flowProblems(state.document.flow!)).toEqual([])
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('a level that already has one is refused rather than overwritten', () => {
    // "Start a flow" on a level with three phases in it would be a button whose
    // effect is deleting them.
    expect(startFlow(withFlow(), 'deal')).toBeNull()
    expect(startFlow(start(), '')).toBeNull()
  })

  /**
   * When the run is won, which the panel could not say and the block could not
   * carry — docs/xp/xp-flow.md §4.
   */
  test('a run can be given an ending', () => {
    const next = setFlowWins(withFlow(), { of: 'world', prop: 'home', is: '>=', value: 4 })
    expect(next?.document.flow?.wins).toEqual({ of: 'world', prop: 'home', is: '>=', value: 4 })
  })

  test('and null takes it away without leaving the field behind', () => {
    // `undefined` in a spread is indistinguishable from not mentioning it, so
    // "never ends" and "leave the ending alone" would be one call.
    const state = setFlowWins(withFlow(), { of: 'world', prop: 'home', is: '>=', value: 4 })!
    expect(setFlowWins(state, null)?.document.flow).not.toHaveProperty('wins')
  })

  test('a level with no flow has no ending to set', () => {
    expect(setFlowWins(start(), { of: 'world', prop: 'home', is: '>=', value: 1 })).toBeNull()
  })

  test('and the whole thing can be taken away again', () => {
    // Without this, starting one is a one-way switch — which is one somebody
    // presses to see what it does and then hand-edits JSON to undo.
    const next = removeFlow(withFlow())
    expect(next?.document).not.toHaveProperty('flow')
    expect(removeFlow(start())).toBeNull()
  })
})

describe('drawing a flow', () => {
  const withFlow = (): EditState => {
    const base = start()
    return {
      ...base,
      document: {
        ...base.document,
        flow: {
          start: 'roll',
          phases: {
            roll: { next: [{ on: 'rolled', go: 'move' }] },
            move: { next: [{ on: 'moved', go: 'roll' }] },
            over: {},
          },
        },
      },
    }
  }

  test('a new phase arrives empty, which is a phase nothing reaches', () => {
    // Deliberate: the panel then draws two warnings on it, while you are looking
    // at it, rather than the parser refusing the save later.
    const next = addPhase(withFlow(), 'deal')
    expect(next?.document.flow?.phases.deal).toEqual({})
  })

  test('a name already taken is refused', () => {
    expect(addPhase(withFlow(), 'move')).toBeNull()
  })

  test('removing a phase takes every arrow that pointed at it', () => {
    /**
     * The decision this function is really about. Leaving them would produce a
     * document the parser refuses, from a button whose only visible effect was
     * somewhere else on the screen.
     */
    const next = removePhase(withFlow(), 'move')
    expect(next?.document.flow?.phases).not.toHaveProperty('move')
    expect(next?.document.flow?.phases.roll.next ?? []).toEqual([])
  })

  test('and drops `next` entirely when it empties, rather than leaving a husk', () => {
    expect(removePhase(withFlow(), 'move')?.document.flow?.phases.roll).not.toHaveProperty('next')
  })

  test('the start is refused rather than reassigned on your behalf', () => {
    expect(removePhase(withFlow(), 'roll')).toBeNull()
  })

  test('an arrow needs both ends to exist', () => {
    expect(addStep(withFlow(), 'roll', { on: 'x', go: 'nowhere' })).toBeNull()
    expect(addStep(withFlow(), 'nowhere', { on: 'x', go: 'roll' })).toBeNull()
  })

  test('and a reason, because a step without one can never be taken', () => {
    expect(addStep(withFlow(), 'roll', { go: 'over' } as never)).toBeNull()
  })

  test('an arrow with both is added to the end of the list', () => {
    const next = addStep(withFlow(), 'roll', { on: 'give-up', go: 'over' })
    expect(next?.document.flow?.phases.roll.next).toEqual([
      { on: 'rolled', go: 'move' },
      { on: 'give-up', go: 'over' },
    ])
  })

  test('and can be taken away again by where it sits', () => {
    const next = removeStep(withFlow(), 'roll', 0)
    expect(next?.document.flow?.phases.roll).not.toHaveProperty('next')
  })

  test('an index that is not there is refused', () => {
    expect(removeStep(withFlow(), 'roll', 4)).toBeNull()
    expect(removeStep(withFlow(), 'over', 0)).toBeNull()
  })
})

describe('how many the level is for', () => {
  /**
   * `players` is a fact about the *level* - a board game for four is for four
   * wherever it is opened - and it had no control in any panel at all, so the
   * only way to say it was to type JSON. `setRules` already carried it rather
   * than dropping it; this is what lets somebody write one.
   */
  test('a floor and a ceiling, written as the pair', () => {
    const next = setRules(start(), { playersMin: 2, playersMax: 4 })
    expect(rulesOf(next!.document).players).toEqual({ min: 2, max: 4 })
  })

  test('and either half on its own, because a floor with no ceiling is common', () => {
    const floor = setRules(start(), { playersMin: 2 })
    expect(rulesOf(floor!.document).players).toEqual({ min: 2 })
    const ceiling = setRules(start(), { playersMax: 4 })
    expect(rulesOf(ceiling!.document).players).toEqual({ max: 4 })
  })

  test('null takes one away and leaves the other', () => {
    const both = setRules(start(), { playersMin: 2, playersMax: 4 })!
    const next = setRules(both, { playersMin: null })
    expect(rulesOf(next!.document).players).toEqual({ max: 4 })
  })

  test('and taking both away leaves no block at all', () => {
    const both = setRules(start(), { playersMin: 2, playersMax: 4 })!
    const next = setRules(both, { playersMin: null, playersMax: null })
    expect(rulesOf(next!.document).players).toBeUndefined()
  })

  test('a crossed pair is refused rather than quietly picked between', () => {
    // "At least four, at most two" has two readings and both are wrong.
    expect(setRules(start(), { playersMin: 4, playersMax: 2 })).toBeNull()
  })

  test('and so is a count no transport could carry', () => {
    expect(setRules(start(), { playersMax: MAX_DECLARED_PLAYERS + 1 })).toBeNull()
    expect(setRules(start(), { playersMin: 0 })).toBeNull()
    expect(setRules(start(), { playersMin: 1.5 })).toBeNull()
  })

  test('and changing the mode does not drop it', () => {
    // The bug `setRules`' own note is about, and the reason this block carries
    // everything it does not own.
    const four = setRules(start(), { playersMin: 4, playersMax: 4 })!
    const next = setRules(four, { preset: 'deathmatch' })
    expect(rulesOf(next!.document).players).toEqual({ min: 4, max: 4 })
  })
})

/**
 * The description, and what it takes to have none.
 *
 * The same round-trip rule `setCamera` and `setTalk` follow, said one field
 * down: a document only ever carries what somebody actually wrote, so an author
 * who wrote a description and thought better of it does not leave `"blurb": ""`
 * behind in the file forever.
 */
describe('what the level is, in a sentence', () => {
  test('writing one', () => {
    const state = describeDocument(editing(doc()), 'A door and a problem.')!
    expect(state.document.blurb).toBe('A door and a problem.')
  })

  test('clearing it takes the field away rather than emptying it', () => {
    const written = describeDocument(editing(doc()), 'Something')!
    const cleared = describeDocument(written, '')!
    expect(cleared.document.blurb).toBeUndefined()
    expect('blurb' in cleared.document).toBe(false)
  })

  test('typing what is already there is not an undo step', () => {
    const written = describeDocument(editing(doc()), 'Something')!
    expect(describeDocument(written, 'Something')).toBeNull()
    expect(describeDocument(written, '  Something  ')).toBeNull()
  })

  test('what comes out is a document that opens', () => {
    const state = describeDocument(editing(doc()), 'A door and a problem.')!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })
})

/**
 * One phrase, in one language.
 *
 * The rule under test is the three-deep one: a blank removes the row, the last
 * row removes the language, and the last language removes the block. Anything
 * less and an author who adds German, changes their mind, and deletes both rows
 * is left with `"words": {"de": {}}` in their file forever.
 */
describe('what the level says in another language', () => {
  const level = () => editing(doc({ name: 'The Gate' }))

  test('a phrase lands under its language', () => {
    const state = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    expect(state.document.words).toEqual({ de: { 'The Gate': 'Das Tor' } })
  })

  test('blanking it takes the row, the language and the block', () => {
    const written = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    const cleared = setPhrase(written, 'de', 'The Gate', '')!
    expect(cleared.document.words).toBeUndefined()
  })

  test('a second language does not disturb the first', () => {
    let state = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    state = setPhrase(state, 'fr', 'The Gate', 'La Porte')!
    expect(state.document.words).toEqual({
      de: { 'The Gate': 'Das Tor' },
      fr: { 'The Gate': 'La Porte' },
    })
  })

  /**
   * The key is the sentence the level prints, spaces and all. Trimming it here
   * would store a row that never matches anything.
   */
  test('the translation is trimmed and the key is not', () => {
    const state = setPhrase(level(), 'de', ' ready ', '  bereit  ')!
    expect(state.document.words).toEqual({ de: { ' ready ': 'bereit' } })
  })

  test('typing what is already there is not an undo step', () => {
    const written = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    expect(setPhrase(written, 'de', 'The Gate', 'Das Tor')).toBeNull()
  })

  test('a code that is not a language is refused rather than stored', () => {
    expect(setPhrase(level(), 'German', 'The Gate', 'Das Tor')).toBeNull()
  })

  /**
   * One press, one step back. A panel looping `setPhrase` would make undoing a
   * language as many steps as it had sentences.
   */
  test('a whole language goes in one step', () => {
    let state = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    state = setPhrase(state, 'de', 'open', 'offen')!
    const gone = removeLanguage(state, 'de')!
    expect(gone.document.words).toBeUndefined()
    expect(undo(gone).document.words).toEqual({ de: { 'The Gate': 'Das Tor', open: 'offen' } })
  })

  test('removing a language that was never there is not a step', () => {
    expect(removeLanguage(level(), 'de')).toBeNull()
  })

  test('what comes out is a document that opens', () => {
    const state = setPhrase(level(), 'de', 'The Gate', 'Das Tor')!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })
})

describe('what the level is', () => {
  const level = () => editing(doc({}))

  test('saying it is a battle writes it, and saying space takes it away again', () => {
    const battle = setRules(level(), { mode: 'battle' })!
    expect(battle.document.rules).toEqual({ preset: 'freestyle', mode: 'battle' })

    /*
     * Back to nothing rather than to `{ mode: 'space' }`. Absent already means
     * space, so writing it would leave a block that differs from the default
     * only by saying what the default is - which `isDefaultRules` then keeps,
     * and a document nobody configured grows a `rules` it never asked for.
     */
    const back = setRules(battle, { mode: 'space' })!
    expect(back.document.rules).toBeUndefined()
  })

  test('and it survives an edit to anything else in the block', () => {
    // `setRules` starts from what is there and overwrites what was asked for,
    // which is the safe direction - but the field it owns is deleted first, so
    // this is the line that says the carry-back works.
    const lobby = setRules(level(), { mode: 'lobby' })!
    expect(setRules(lobby, { scoreLimit: 20 })!.document.rules).toEqual({
      preset: 'freestyle',
      mode: 'lobby',
      scoreLimit: 20,
    })
  })

  test('a lobby keeps the rest of its rules, which is what it is for', () => {
    let state = setRules(level(), { preset: 'deathmatch', mode: 'lobby' })!
    state = setRules(state, { scoreLimit: 20, sides: 'ffa' })!
    expect(state.document.rules).toEqual({
      preset: 'deathmatch',
      mode: 'lobby',
      scoreLimit: 20,
      sides: 'ffa',
    })
  })
})

/**
 * The places a document holds, and the three things you can do to them.
 *
 * A level's own `world` is a scene too - the one called `main` - and it is the
 * one none of these touch: it cannot be added, renamed or taken away, because a
 * document with no place at all is not a document.
 */
describe('the places a level holds', () => {
  const level = () => editing(doc({}))
  const named = (state: EditState) => Object.keys(state.document.scenes ?? {})

  test('a new place arrives empty, with a floor', () => {
    const state = addScene(level(), 'arena')!
    const scene = state.document.scenes?.arena
    expect(scene).toBeDefined()
    if (!scene || typeof scene === 'string') throw new Error('not a place')

    // Empty rather than a copy of the root: what a clone arrives as is a room
    // full of things somebody has to delete before they can start.
    expect(scene.entities).toEqual([])
    expect(scene.world.placements).toEqual([])
    // And something to stand on, or arriving in it reads as a broken editor.
    expect(scene.world.ground).toBe(true)
    expect(scene.world.floorY).toBe(level().document.world.floorY)
  })

  test('it parses, which is the only claim that matters', () => {
    const state = addScene(level(), 'arena')!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  test('the root is not a place you can add', () => {
    // A `scenes.main` would make one word mean two places in one file, and the
    // losing one would be the one the author can actually see.
    expect(addScene(level(), 'main')).toBeNull()
  })

  test('nor is a name the format will not take', () => {
    expect(addScene(level(), 'Arena')).toBeNull()
    expect(addScene(level(), 'the arena')).toBeNull()
    expect(addScene(level(), '')).toBeNull()
  })

  test('and a name already in use is refused rather than overwritten', () => {
    // Overwriting is how somebody loses a room to a typo.
    const state = addScene(level(), 'arena')!
    expect(addScene(state, 'arena')).toBeNull()
  })

  test('renaming keeps the order, so a room does not jump to the bottom', () => {
    let state = addScene(level(), 'foyer')!
    state = addScene(state, 'arena')!
    state = addScene(state, 'cellar')!
    expect(named(renameScene(state, 'arena', 'pitch')!)).toEqual(['foyer', 'pitch', 'cellar'])
  })

  test('and renaming onto a name in use is refused', () => {
    let state = addScene(level(), 'foyer')!
    state = addScene(state, 'arena')!
    expect(renameScene(state, 'arena', 'foyer')).toBeNull()
    expect(renameScene(state, 'arena', 'main')).toBeNull()
  })

  test('removing takes the place and everything in it', () => {
    let state = addScene(level(), 'foyer')!
    state = addScene(state, 'arena')!
    expect(named(removeScene(state, 'foyer')!)).toEqual(['arena'])
  })

  test('and the last one takes the table with it', () => {
    // So a document that briefly had a second room round-trips as the one-room
    // document it is again, rather than carrying an empty `scenes`.
    const state = addScene(level(), 'arena')!
    expect(removeScene(state, 'arena')!.document).not.toHaveProperty('scenes')
  })

  test('a place that is not there cannot be renamed or removed', () => {
    expect(renameScene(level(), 'nowhere', 'somewhere')).toBeNull()
    expect(removeScene(level(), 'nowhere')).toBeNull()
  })

  test('there is a ceiling, because a scene is a whole world', () => {
    // `MAX_PLACEMENTS` times however many rooms is the real size of a document,
    // and without a number here a loop nobody meant to write decides it.
    let state = level()
    for (let n = 0; n < MAX_SCENES; n++) {
      const next = addScene(state, `room-${n}`)
      if (!next) break
      state = next
    }
    expect(named(state).length).toBeLessThan(MAX_SCENES)
    expect(addScene(state, 'one-more')).toBeNull()
  })
})

/**
 * Editing a room that is not the level's own.
 *
 * Every edit takes a place as its last argument now, and absent is the root -
 * so the point of these is the *other* answer: that the same functions, given a
 * scene key, write into that scene and leave the root alone.
 *
 * The pair "it landed there" and "it did not land here" is deliberate. A seam
 * that wrote to both would pass any test that only checked the first, and the
 * failure it produces - painting a wall into the wrong room - is invisible
 * until somebody walks in.
 */
describe('editing a place that is not the root', () => {
  const level = () => addScene(editing(doc({})), 'arena')!
  const arena = (state: EditState) => {
    const scene = state.document.scenes?.arena
    if (!scene || typeof scene === 'string') throw new Error('no arena')
    return scene
  }

  test('a placement lands in the room it was aimed at', () => {
    const state = place(level(), { x: 1, y: 0, z: 1 }, { model: 'proto/Primitive_Wall' }, 'arena')!
    expect(arena(state).world.placements).toHaveLength(1)
    expect(state.document.world.placements).toHaveLength(0)
  })

  test('and one aimed at nothing lands nowhere', () => {
    // Refused rather than quietly landing on the root, which is the failure
    // worth being loud about.
    expect(place(level(), { x: 1, y: 0, z: 1 }, { model: 'proto/Primitive_Wall' }, 'nowhere')).toBeNull()
  })

  test('an entity, a mark and a spawn all go to the same place', () => {
    let state = addEntity(level(), { blueprint: 'box', x: 2, y: 0, z: 2 }, 'arena')
    // The document has no blueprints, so this is refused - which is itself the
    // check that blueprints are the *document's* rather than a room's.
    expect(state).toBeNull()

    state = addMark(level(), { kind: 'spawn', x: 3, y: 1, z: 3 }, 'arena')!
    expect(arena(state).world.marks).toHaveLength(1)
    expect(state.document.world.marks).toHaveLength(0)

    const moved = setSpawn(state, { x: 4, z: 4 }, 'arena')!
    expect(arena(moved).spawn.x).toBe(4)
    expect(moved.document.spawn.x).toBe(0)
  })

  test('a stroke and its erasure both stay in the room', () => {
    const cells = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]
    const painted = stroke(level(), cells, { model: 'proto/Primitive_Wall' }, 'arena')!
    expect(arena(painted).world.placements).toHaveLength(2)
    expect(painted.document.world.placements).toHaveLength(0)

    const cleared = eraseStroke(painted, cells, 'arena')!
    expect(arena(cleared).world.placements).toHaveLength(0)
  })

  test('the world settings are the room’s, not the level’s', () => {
    const state = setWorld(level(), { floorY: 4 }, 'arena')!
    expect(arena(state).world.floorY).toBe(4)
    expect(state.document.world.floorY).toBe(0)
  })

  test('and all of it still parses', () => {
    let state = stroke(level(), [{ x: 0, y: 0, z: 0 }], { model: 'proto/Primitive_Wall' }, 'arena')!
    state = addMark(state, { kind: 'spawn', x: 1, y: 1, z: 1 }, 'arena')!
    state = setWorld(state, { floorY: 2 }, 'arena')!
    expect(parseXp(JSON.parse(JSON.stringify(state.document))).ok).toBe(true)
  })

  /**
   * The questions that are about the whole file rather than about one room.
   *
   * These were reading the root alone, which was right for exactly as long as a
   * document had one place: a blueprint used only in the cellar read as unused,
   * and deleting it would have emptied the cellar with nothing said.
   */
  test('a blueprint used only in another room still counts as used', () => {
    const withBlueprint = editing(
      doc({
        blueprints: { box: { model: 'proto/Box_A' } },
        scenes: {
          arena: {
            world: { floorY: 0, placements: [] },
            spawn: { x: 0, y: 1, z: 0, facing: 0 },
            entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
          },
        },
      }),
    )
    expect(blueprintUsers(withBlueprint.document, 'box').length).toBeGreaterThan(0)
  })

  test('but a name is free again in a second room, because a name is where you stand', () => {
    // `checkPlace` resolves names per place, so two rooms may each hold a
    // `box_1` - and numbering the arena's first box against the lobby's would
    // be numbering it against something nobody in that room can see.
    const state = editing(
      doc({
        blueprints: { box: { model: 'proto/Box_A' } },
        entities: [{ blueprint: 'box', name: 'box_1', x: 0, y: 0, z: 0 }],
        scenes: {
          arena: {
            world: { floorY: 0, placements: [] },
            spawn: { x: 0, y: 1, z: 0, facing: 0 },
            entities: [],
          },
        },
      }),
    )
    expect(nextEntityName(state.document, 'box')).toBe('box_2')
    expect(nextEntityName(state.document, 'box', 'arena')).toBe('box_1')
  })
})

/**
 * A door into a room, which is the thing a Places list makes you want the
 * moment it can open one.
 */
describe('a door into a room', () => {
  const level = () => addScene(editing(doc({})), 'cellar')!
  const AT = { x: 1, y: 0, z: 2 }
  /** The blueprint a door made, as the two things that make it one. */
  const doorIn = (state: EditState, name: string) => {
    const made = state.document.blueprints[name]
    if (!made) throw new Error(`no blueprint ${name}`)
    return { collider: made.collider, triggers: made.triggers }
  }

  test('is a kind of thing, a rule on it, and one of them on the floor', () => {
    const made = addDoor(level(), 'cellar', AT)!
    expect(made.name).toBe('to-cellar')
    expect(doorIn(made.state, 'to-cellar').triggers).toEqual([
      { on: 'enter', do: [{ op: 'load', scene: 'cellar' }] },
    ])
    const placed = made.state.document.entities.at(-1)
    expect(placed?.blueprint).toBe('to-cellar')
    expect(placed).toMatchObject(AT)
  })

  /**
   * The bug this exists to not have. A tile left on `auto` fills the cell it is
   * in, so you bump into the doorway instead of walking through it and the
   * `enter` never fires - invisible in the editor, obvious on the first try.
   */
  test('you can walk into, which is the whole of it working', () => {
    expect(doorIn(addDoor(level(), 'cellar', AT)!.state, 'to-cellar').collider).toBe('none')
  })

  test('it parses, which is the only claim that matters', () => {
    const made = addDoor(level(), 'cellar', AT)!
    expect(parseXp(JSON.parse(JSON.stringify(made.state.document))).ok).toBe(true)
  })

  /**
   * `main` is the way back, so it has to be a place a door can name - a level
   * whose front room no door could reach is the hole `two-rooms.xp.json`
   * shipped with.
   */
  test('the way back is a door like any other', () => {
    const made = addDoor(level(), 'main', AT, 'cellar')!
    expect(made.name).toBe('to-main')
    expect(doorIn(made.state, 'to-main').triggers).toEqual([
      { on: 'enter', do: [{ op: 'load', scene: 'main' }] },
    ])
    // And it lands in the room it leads *out* of, not in the root.
    expect(made.state.document.entities).toEqual([])
    const scene = made.state.document.scenes?.cellar
    if (!scene || typeof scene === 'string') throw new Error('not a place')
    expect(scene.entities).toHaveLength(1)
  })

  test('a door out of a room into itself is a tile that does nothing', () => {
    expect(addDoor(level(), 'main', AT)).toBeNull()
    expect(addDoor(level(), 'cellar', AT, 'cellar')).toBeNull()
  })

  test('and a door to a room this level does not hold is not a door', () => {
    expect(addDoor(level(), 'attic', AT)).toBeNull()
  })

  /**
   * A `scenes` entry that is a string is somewhere else entirely - that is
   * `load`'s other spelling, and it has no world in this document to arrive in.
   */
  test('nor is one aimed at a door out of the document', () => {
    const state = editing(doc({ scenes: { away: 'deep-dark' } }))
    expect(addDoor(state, 'away', AT)).toBeNull()
  })

  /**
   * Named after the room, because every door is the same tile. Numbering them
   * by model would make the second `Primitive_Floor-2`, which is a list nobody
   * can read back.
   */
  test('a second door to the same room is numbered, not refused', () => {
    const first = addDoor(level(), 'cellar', AT)!
    const second = addDoor(first.state, 'cellar', { x: 4, y: 0, z: 4 })!
    expect(second.name).toBe('to-cellar-2')
    expect(second.state.document.entities).toHaveLength(2)
  })

  test('one press is one undo', () => {
    const before = level()
    const made = addDoor(before, 'cellar', AT)!
    const back = undo(made.state)
    expect(back.document).toEqual(before.document)
  })

  /**
   * What you see is what fires, which is the point of the shape.
   *
   * A trigger reaches half a metre either side of where it stands whatever is
   * drawn on it, so a door left the size of its own floor tile would look four
   * cells wide and work in the middle one - and "it works if you walk over the
   * middle" reads as a flaky level rather than as a small door.
   */
  test('is drawn the size it actually works', () => {
    const made = addDoor(level(), 'cellar', AT)!
    const placed = made.state.document.entities.at(-1)
    // A quarter of a four-cell tile on each side is exactly one cell: the
    // footprint you can see is the footprint that fires, corner to corner.
    expect(placed?.stretch).toEqual({ x: 0.25, y: 3, z: 0.25 })
  })

  /**
   * And the claim the whole thing rests on: walking over it fires.
   *
   * Asked of the engine rather than of the document, because "a door you can
   * walk into" is not a shape a blueprint can be checked for - it is whether
   * the trigger volume the runtime builds reaches a body standing on the floor.
   * A door that parses, draws and never fires is the failure this is here to
   * catch, and it is one nothing else in this file could see.
   *
   * The prober is the body's own box, the same one `stepTriggers`' other tests
   * use: a metre up from the floor to eye height, which is where a person is.
   */
  test('and walking over it is walking into it', () => {
    const made = addDoor(level(), 'cellar', { x: 0, y: 0, z: 0 })!
    const world = spawnEntities(made.state.document)
    const body = {
      id: 500,
      box: { minX: -0.3, minY: 1, minZ: -0.3, maxX: 0.3, maxY: 2.7, maxZ: 0.3 },
    }

    const effects = stepTriggers(world, made.state.document.blueprints, [body], new Map())
    expect(effects).toContainEqual({ kind: 'load', scene: 'cellar' })
  })

  test('and standing somewhere else is not', () => {
    const made = addDoor(level(), 'cellar', { x: 0, y: 0, z: 0 })!
    const world = spawnEntities(made.state.document)
    const away = {
      id: 500,
      box: { minX: 8.7, minY: 1, minZ: 8.7, maxX: 9.3, maxY: 2.7, maxZ: 9.3 },
    }
    expect(stepTriggers(world, made.state.document.blueprints, [away], new Map())).toEqual([])
  })

  /**
   * The other half of "what you see is what fires": a step past the edge of the
   * post misses, and it should, because the post is not there either. This is
   * the assertion that would break if somebody made a door look bigger.
   */
  test('and a stride past the edge of it misses, because the post ends there', () => {
    const made = addDoor(level(), 'cellar', { x: 0, y: 0, z: 0 })!
    const world = spawnEntities(made.state.document)
    const beside = {
      id: 500,
      box: { minX: 0.7, minY: 1, minZ: -0.3, maxX: 1.3, maxY: 2.7, maxZ: 0.3 },
    }
    expect(stepTriggers(world, made.state.document.blueprints, [beside], new Map())).toEqual([])
  })
})
