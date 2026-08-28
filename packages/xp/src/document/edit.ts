/**
 * Editing a document, as pure functions.
 *
 * The editor is a 3D tool and 3D tools are the hardest thing in this repo to
 * check: the Browser pane never fires `requestAnimationFrame`, so the canvas it
 * lives in stays black and nothing can be watched. What can be checked is
 * everything that is not the canvas - which cell a click means, what a drag
 * lays down, what undo puts back - and that is all of this file.
 *
 * So the split is not tidiness. Everything here is a function from a document
 * and an intent to a new document, and the component on top is the part that
 * turns a pointer into an intent and a document into meshes. If a bug is in the
 * first half there is a test for it; if it is in the second half you can see it.
 *
 * ---------------------------------------------------------------------------
 * Immutable, and why that is not just taste
 * ---------------------------------------------------------------------------
 * Every function returns a new document. That is what makes undo a stack of
 * references rather than a log of inverse operations - and an inverse-operation
 * undo is a second implementation of every edit, written once, exercised rarely,
 * and wrong in exactly the cases nobody tried.
 *
 * The cost is a copied array per edit. A drag is a few hundred of those and a
 * document is a few thousand placements, which is well inside what a browser
 * does without noticing - and `stroke` exists for the case where it is not: one
 * edit for a whole drag rather than one per cell.
 */

import {
  DEFAULT_MARK_HEIGHT,
  DEFAULT_MARK_WIDTH,
  isScriptName,
  MAX_CLIP_NAME,
  MAX_ENTITIES,
  MAX_MARK_SIZE,
  MAX_PLACEMENTS,
  placeOf,
  MAX_KEY_COOLDOWN,
  MAX_PLAYER_KEYS,
  MAX_SCRIPT_LENGTH,
  RESERVED_KEYS,
  WORLD_HEIGHT,
  WORLD_RADIUS,
  type EntitySpec,
  type Mark,
  type PackRef,
  type Placement,
  type PlayerKey,
  type PlayerRole,
  type XpWorld,
  type XpSpawn,
  MAIN_SCENE,
  type XpScene,
  type XpDocument,
  type PlayerLook,
} from './format'
import {
  bodyProblems,
  isMaterial,
  type Blueprint,
  type BodySpec,
  type Part,
  type Stretch,
  stretchOf,
} from './blueprints'
import {
  flowProblems,
  MAX_PHASES,
  MAX_ROUNDS,
  MAX_SAYS,
  MAX_STEPS,
  RESERVED_GOES,
  ROUND_AGAIN,
  type FlowStep,
  type XpFlow,
} from './flow'
import { flowStarterById, type FlowStarterId } from './flow-starters'
import type { Finish } from './finish'
import { CAPABILITIES, capabilityProblems, type Capability } from './capabilities'
import { isDataRef, type Condition, type Trigger, type TriggerEvent } from '../rules/triggers'
import { isXpId, type Verb } from '../rules/verbs'
import { isSound } from '../assets/sounds'
import { solidsFor, standingSurface } from '../world/solids'
import {
  DATA_NAME,
  dataOf,
  MAX_DATA_FIELDS,
  renameField,
  withField,
  withoutField,
  type XpField,
} from './data'
import { isDefaultTalk, type XpTalk } from './talk'
import { DEFAULT_MODEL, findModel, isKnownModel } from '../assets/catalogue'
import { PACKS, splitModel } from '../assets/packs'
import {
  clipIsSquare,
  MAX_CLIP_SAMPLES,
  MAX_CLIP_TRACKS,
  MAX_XP_CLIPS,
  type XpClip,
} from './clips'
import { presetFor } from './presets'
import {
  animatable,
  DEFAULT_CAMERA,
  emptyTimeline,
  MAX_CAMERAS,
  MAX_CUES,
  MAX_CUTS,
  MAX_DURATION,
  MAX_FPS,
  MAX_FRAMINGS,
  MAX_KEYS,
  MAX_TRACKED,
  MIN_FPS,
  propOfProperty,
  putKey,
  CAMERA_NAME,
  actionAsKeys,
  keysAsAction,
  posedAt,
  MAX_ACTION_SECONDS,
  MAX_ACTIONS,
  MAX_SEQUENCE_NAME,
  MAX_SEQUENCES,
  MAX_SPEED,
  MAX_TAKES,
  MIN_SPEED,
  type Take,
  type XpSequence,
  type Backdrop,
  type Cut,
  type Framing,
  type Key,
  type MovieCamera,
  type Tracks,
  type XpAction,
  type XpTimeline,
  EASES,
  type Ease,
} from './movie'
import {
  cameraFieldsFor,
  cameraOf,
  cameraProblems,
  isCameraKind,
  isDefaultCamera,
  type CameraAxis,
  type CameraKind,
  type XpCamera,
} from '../world/camera'
import {
  isEmptyWords,
  isLocaleCode,
  MAX_PHRASE_KEY,
  MAX_PHRASE_TEXT,
  type XpPhrases,
} from './words'
import {
  DEFAULT_ASSIGN,
  DEFAULT_MODE,
  isAssign,
  isMode,
  MAX_DECLARED_PLAYERS,
  isDefaultRules,
  isPreset,
  isSides,
  presetNeeds,
  rulesOf,
  rulesProblems,
  type Assign,
  type Mode,
  type Preset,
  type Sides,
  type XpRules,
} from './rules'

/** A cell. The unit everything structural is placed on. */
export interface Cell {
  x: number
  y: number
  z: number
}

export const cellId = (cell: Cell) => `${cell.x},${cell.y},${cell.z}`

/**
 * A document being edited, with somewhere to go back to.
 *
 * The undo stack holds whole documents. At a few thousand placements that is a
 * few hundred kilobytes a step, so it is bounded - and bounded at a number that
 * is about *forgetting*, not about memory: nobody undoes a hundred steps, and
 * the ones who try wanted the file they saved.
 */
export interface EditState {
  document: XpDocument
  past: XpDocument[]
  future: XpDocument[]
  /**
   * What the last edit was, when consecutive ones should collapse into one.
   *
   * Only typing needs this. Every other edit is a discrete act - you place a
   * wall, you drag a run - and one undo step each is exactly right. Typing is
   * not: a keystroke is an edit to the *document*, because the draft has to
   * autosave or an afternoon's work dies to a refresh, and one undo step per
   * character is an undo stack nobody can use.
   *
   * So an edit may name itself, and an edit with the same name as the one
   * before it replaces it on the stack instead of stacking on top. Undo clears
   * the mark, so undoing and typing again starts a new step rather than
   * silently editing the one you just came back to.
   */
  mark?: string
}

/** How far back undo goes. */
export const UNDO_DEPTH = 50

export function editing(document: XpDocument): EditState {
  return { document, past: [], future: [] }
}

/**
 * Record a change.
 *
 * The future is cleared, which is the standard and worth stating: undoing three
 * steps and then doing something new abandons the branch you undid. Keeping it
 * would mean redo sometimes reapplies work that no longer makes sense against
 * the document underneath it.
 */
function commit(state: EditState, next: XpDocument, mark?: string): EditState {
  const document = declaring(next)
  // A run of edits under one mark is one step: the stack keeps the document as
  // it was before the *first* of them, and everything since is one keystroke
  // after another in the same field.
  if (mark !== undefined && state.mark === mark) {
    return { document, past: state.past, future: [], mark }
  }
  return {
    document,
    past: [...state.past, state.document].slice(-UNDO_DEPTH),
    future: [],
    ...(mark !== undefined ? { mark } : {}),
  }
}

/**
 * The document with every pack it actually uses listed in `packs`.
 *
 * Here, in `commit`, rather than in the half-dozen edits that can be the first
 * to use a pack - because "declared" is not a fact about placing a wall, it is
 * an invariant of the document, and the parser already states it in exactly
 * these terms:
 *
 *     world uses "dungeon" but the document does not list it
 *
 * Which is what a saved level said, until this existed. Nothing ever added to
 * `packs` - a new document declares whatever its template did, `proto` - so
 * placing a single piece of any other kit produced a document that would not
 * re-open. It cost nothing to hit while `proto` and the platformer kit were
 * most of the catalogue and everything anybody built was made of walls; with
 * thirty-one packs it is the first thing that happens.
 *
 * Note what it does *not* do: remove a pack that has stopped being used. A
 * level you have emptied of dungeon pieces still says it is a dungeon level
 * until you say otherwise, because `packs` is also the credits - it is what an
 * export writes into CREDITS.txt - and silently dropping an author's line the
 * moment their last barrel is deleted is not a thing to do automatically.
 * `removePack` is the deliberate version, and it is the picker's minus button.
 */
function declaring(document: XpDocument): XpDocument {
  const declared = new Set(document.packs.map((pack) => pack.id))
  // The same two lists the parser reads. A blueprint's model is as much a use
  // as a placement is, and it is the one an editor is likelier to reach first:
  // the player blueprint carries a model before a level has anything in it.
  const missing = new Set<string>()
  for (const model of [
    ...document.world.placements.map((placement) => placement.model),
    ...Object.values(document.blueprints).map((blueprint) => blueprint.model),
  ]) {
    const packId = model.slice(0, model.indexOf('/'))
    if (packId.length > 0 && !declared.has(packId) && PACKS[packId]) missing.add(packId)
  }
  if (missing.size === 0) return document
  return { ...document, packs: [...document.packs, ...[...missing].map(packRef)] }
}

/** A pack's entry in a document: its id, and the credit that travels with it. */
function packRef(packId: string): PackRef {
  const pack = PACKS[packId]
  return { id: packId, author: pack.author, licence: pack.licence, source: pack.source }
}

/**
 * Say this document is built out of this pack.
 *
 * The picker's plus button. Declaring a pack nothing has used yet is the point
 * rather than a side effect: it is how you choose what the panel offers you,
 * and it is a document decision rather than a personal one, because the packs
 * a level is made of travel with it - to whoever opens it next, and into the
 * credits of anything exported from it.
 */
export function addPack(state: EditState, packId: string): EditState | null {
  if (!PACKS[packId]) return null
  if (state.document.packs.some((pack) => pack.id === packId)) return null
  return commit(state, { ...state.document, packs: [...state.document.packs, packRef(packId)] })
}

/**
 * Stop saying so - refused while anything in the level is still made of it.
 *
 * Refused rather than cascading into a delete: "remove this pack" and "delete
 * the forty things I built out of it" are different sentences, and a panel
 * that hears the first and does the second is one nobody trusts the minus
 * button on again. `packUse` is what the caller shows instead.
 */
export function removePack(state: EditState, packId: string): EditState | null {
  if (!state.document.packs.some((pack) => pack.id === packId)) return null
  if (packUse(state.document, packId) > 0) return null
  return commit(state, {
    ...state.document,
    packs: state.document.packs.filter((pack) => pack.id !== packId),
  })
}

/** How many placements and blueprints are made of this pack. */
export function packUse(document: XpDocument, packId: string): number {
  const prefix = `${packId}/`
  /*
   * Every place, not the root alone.
   *
   * This counted `document.world` only, which was right for exactly as long as
   * a document had one place: a pack used entirely in the cellar read as unused,
   * and the panel would have offered to remove it while the cellar was built out
   * of it. `placesOf` is the one answer to "the whole file" - see it for why
   * this class of question needed one.
   */
  const placed = placesOf(document).reduce(
    (count, place) =>
      count + place.world.placements.filter((one) => one.model.startsWith(prefix)).length,
    0,
  )
  return (
    placed +
    Object.values(document.blueprints).filter((blueprint) => blueprint.model.startsWith(prefix))
      .length
  )
}

/**
 * What the level is called.
 *
 * Trimmed, and refused when that leaves nothing: `parseXp` requires a name, so
 * an editor that lets the field be cleared is an editor that writes a document
 * it cannot re-open. Refused when it changes nothing, like every other edit
 * here, so pressing Enter without typing does not cost an undo step.
 *
 * No length cap in here, deliberately. The cap belongs to whatever the document
 * is *called something in* — a project in a space has one, a `.xp.json` on
 * somebody's disk does not — and a second number in this package would be one
 * more thing to keep in step with `XP_NAME_MAX`.
 */
export function renameDocument(state: EditState, name: string): EditState | null {
  const wanted = name.trim()
  if (wanted.length === 0) return null
  if (wanted === state.document.name) return null
  return commit(state, { ...state.document, name: wanted })
}

/**
 * What the level is, in a sentence.
 *
 * Cleared by an empty string rather than by a separate call, and the field goes
 * away entirely when it is: `blurb` is optional, and a document carrying
 * `"blurb": ""` says nothing its absence does not - the same round-trip rule
 * `setCamera` and `setTalk` follow. Without it, an author who wrote a
 * description and thought better of it would leave an empty key in the file.
 */
export function describeDocument(state: EditState, blurb: string): EditState | null {
  const wanted = blurb.trim()
  if (wanted === (state.document.blurb ?? '')) return null

  const document = { ...state.document }
  if (wanted.length === 0) delete document.blurb
  else document.blurb = wanted

  return commit(state, document)
}

/**
 * What the level's cartridge is made of.
 *
 * `null` takes the field away rather than writing `"plastic"`, which is the
 * round-trip rule `describeDocument` states and the reason the parser omits an
 * absent finish: a document that has never had an opinion about its shell must
 * come back out of the editor without one, or every level anybody opens grows a
 * line in its next diff.
 */
export function finishDocument(state: EditState, finish: Finish | null): EditState | null {
  if (finish === (state.document.finish ?? null)) return null

  const document = { ...state.document }
  if (finish === null) delete document.finish
  else document.finish = finish

  return commit(state, document)
}

/**
 * The shell's colour, as a hue.
 *
 * `null` takes the field away, which hands the choice back to the shelf rather
 * than writing down whatever it happened to pick - `hueFor` derives one from
 * the reference, and freezing that number into the document would make a
 * *derived* colour look like an *authored* one to everything downstream.
 *
 * Zero is a hue, so the comparison is against `?? null` rather than a
 * truthiness test. Red is not the absence of a colour.
 */
export function colourDocument(state: EditState, hue: number | null): EditState | null {
  if (hue === (state.document.hue ?? null)) return null

  const document = { ...state.document }
  if (hue === null) delete document.hue
  else document.hue = hue

  return commit(state, document)
}

/**
 * One phrase, in one language.
 *
 * `text` empty removes the row, and removing the last row of a language removes
 * the language, and removing the last language removes the block. Three levels
 * of the same rule and it is the one `setTalk` states: a file only ever carries
 * what somebody actually said, so an author who adds German, changes their mind
 * and deletes both rows gets their document back exactly as it was rather than
 * one carrying `"words": {"de": {}}` forever.
 *
 * The key is not trimmed. It is the *sentence the level prints* - `t(' ready ')`
 * looks up a key with its spaces on - and a table that quietly trimmed it would
 * hold a row that never matches anything. The translation is trimmed, because
 * that is a person typing into a box.
 */
export function setPhrase(
  state: EditState,
  locale: string,
  key: string,
  text: string,
): EditState | null {
  if (!isLocaleCode(locale)) return null
  if (key.length === 0 || key.length > MAX_PHRASE_KEY) return null

  const wanted = text.trim()
  if (wanted.length > MAX_PHRASE_TEXT) return null

  const before = state.document.words?.[locale]?.[key] ?? ''
  if (wanted === before) return null

  const table: Record<string, string> = { ...state.document.words?.[locale] }
  if (wanted.length === 0) delete table[key]
  else table[key] = wanted

  const words: Record<string, XpPhrases> = { ...state.document.words }
  if (Object.keys(table).length === 0) delete words[locale]
  else words[locale] = table

  const document = { ...state.document }
  if (isEmptyWords(words)) delete document.words
  else document.words = words

  return commit(state, document)
}

/**
 * Take a whole language out.
 *
 * Its own function rather than a loop of `setPhrase` in a panel, because that
 * loop would push one undo step per phrase - and undoing a language one
 * sentence at a time is not what anybody means by undo.
 */
export function removeLanguage(state: EditState, locale: string): EditState | null {
  if (!state.document.words?.[locale]) return null

  const words: Record<string, XpPhrases> = { ...state.document.words }
  delete words[locale]

  const document = { ...state.document }
  if (isEmptyWords(words)) delete document.words
  else document.words = words

  return commit(state, document)
}

export function undo(state: EditState): EditState {
  const previous = state.past.at(-1)
  if (!previous) return state
  return {
    document: previous,
    past: state.past.slice(0, -1),
    future: [state.document, ...state.future],
  }
}

export function redo(state: EditState): EditState {
  const next = state.future[0]
  if (!next) return state
  return {
    document: next,
    past: [...state.past, state.document],
    future: state.future.slice(1),
  }
}

export const canUndo = (state: EditState) => state.past.length > 0
export const canRedo = (state: EditState) => state.future.length > 0

/**
 * What is standing at a cell, if anything.
 *
 * By the placement's *anchor*, not by the cells it fills. A wall is four cells
 * wide, so "what is at this cell" has two possible meanings and only one of them
 * is useful to an editor: clicking a wall should select the wall, and dragging a
 * new one across it should replace it rather than leave two overlapping.
 */
export function at(document: XpDocument, cell: Cell, where?: PlaceTarget): Placement | null {
  return (
    placeIn(document, where)?.world.placements.find(
      (placement) => placement.x === cell.x && placement.y === cell.y && placement.z === cell.z,
    ) ?? null
  )
}

export interface PlaceOptions {
  model: string
  rotation?: number
  scale?: number
}

/**
 * Put something at a cell, replacing whatever was there.
 *
 * Refuses rather than throws, for two reasons an editor cares about: a model
 * that is not in the catalogue and a document already at its limit are both
 * things a *person* did, and the answer to a person is a message rather than a
 * stack trace. `null` means nothing changed and the caller should say why.
 */
/**
 * Which of a document's places an edit is aimed at.
 *
 * `undefined` is the level's own world - the scene the format calls `main` -
 * and a string is a key in `scenes`. The same shape and the same argument as
 * `FlowTarget` above: it is the last argument everywhere and absent is the
 * root, so every caller written before a document could hold several rooms is
 * unchanged and still right.
 */
export type PlaceTarget = string | undefined

/**
 * The three things that make a place, wherever it is kept.
 *
 * A document's own `world`, `spawn` and `entities` *are* a scene - the one
 * called `main` - and a scene holds the same three under a key. This is the one
 * function that knows that, so nothing downstream needs a branch: it is the
 * editor's half of what `standingIn` does for the runtime.
 *
 * Null for a key that names nothing, and for one that names a **door** - a
 * `scenes` entry that is a string is somewhere else entirely, with no world to
 * edit and no spawn to stand in. An edit aimed at one is refused rather than
 * quietly landing on the root, which is the failure worth being loud about:
 * painting a wall into the wrong room is invisible until somebody walks in.
 */
export function placeIn(
  document: XpDocument,
  where: PlaceTarget,
): {
  world: XpWorld
  spawn: XpSpawn
  entities: EntitySpec[]
  /** What happens here over time, when this place is a shot. See `@kxb/xp/movie`. */
  timeline?: XpTimeline
} | null {
  if (where === undefined) {
    return {
      world: document.world,
      spawn: document.spawn,
      entities: document.entities,
      ...(document.timeline ? { timeline: document.timeline } : {}),
    }
  }

  const scene = document.scenes?.[where]
  if (!scene || typeof scene === 'string') return null

  return {
    world: scene.world,
    spawn: scene.spawn,
    entities: scene.entities,
    ...(scene.timeline ? { timeline: scene.timeline } : {}),
  }
}

/**
 * The document with one of its places replaced.
 *
 * Takes a partial, because almost every edit changes one of the three: a brush
 * stroke is a `world`, a dragged body is `entities`, and moving the arrival is
 * a `spawn`. Spelling out the other two at every call site would be fifty
 * chances to carry the wrong one across.
 *
 * Returns the document unchanged for a target that is not a place, which pairs
 * with `placeIn` returning null - the callers all refuse on that, so this never
 * has to invent a room to write into.
 */
export function writePlace(
  document: XpDocument,
  where: PlaceTarget,
  next: {
    world?: XpWorld
    spawn?: XpSpawn
    entities?: EntitySpec[]
    /**
     * `null` takes the timeline away; absent leaves whatever is there.
     *
     * The one field here where those two have to be different words. Every
     * other member of a place always exists, so `undefined` can honestly mean
     * "not changing this one" - a timeline is a block a place may not have, and
     * "stop being a movie" is an edit somebody makes on purpose.
     */
    timeline?: XpTimeline | null
  },
): XpDocument {
  const laid = <T extends { timeline?: XpTimeline }>(place: T): T => {
    if (next.timeline === undefined) return place
    const copy = { ...place }
    if (next.timeline === null) delete copy.timeline
    else copy.timeline = next.timeline
    return copy
  }

  if (where === undefined) {
    return laid({
      ...document,
      ...(next.world ? { world: next.world } : {}),
      ...(next.spawn ? { spawn: next.spawn } : {}),
      ...(next.entities ? { entities: next.entities } : {}),
    })
  }

  const scene = document.scenes?.[where]
  if (!scene || typeof scene === 'string') return document

  return {
    ...document,
    scenes: {
      ...document.scenes,
      [where]: laid({
        ...scene,
        ...(next.world ? { world: next.world } : {}),
        ...(next.spawn ? { spawn: next.spawn } : {}),
        ...(next.entities ? { entities: next.entities } : {}),
      }),
    },
  }
}

/**
 * Every place in a document, the root first.
 *
 * For the questions that are about the **whole file** rather than about the
 * room you are standing in - is this blueprint used anywhere, does this pack
 * still earn its place, what names are taken. Those were all reading the root
 * alone, which was correct for exactly as long as a document had one place: a
 * blueprint used only in the cellar read as unused, and deleting it would have
 * emptied the cellar with nothing said.
 *
 * The root first because it is the one somebody means when they say "the
 * level", and because a list that starts anywhere else reads as arbitrary.
 * Doors are skipped: they hold no world of their own.
 */
export function placesOf(
  document: XpDocument,
): readonly { where: PlaceTarget; world: XpWorld; entities: EntitySpec[] }[] {
  const places: { where: PlaceTarget; world: XpWorld; entities: EntitySpec[] }[] = [
    { where: undefined, world: document.world, entities: document.entities },
  ]

  for (const [key, scene] of Object.entries(document.scenes ?? {})) {
    if (typeof scene === 'string') continue
    places.push({ where: key, world: scene.world, entities: scene.entities })
  }

  return places
}

export function place(
  state: EditState,
  cell: Cell,
  { model, rotation = 0, scale = 1 }: PlaceOptions,
  where?: PlaceTarget,
): EditState | null {
  if (!isKnownModel(model)) return null

  const place_ = placeIn(state.document, where)
  if (!place_) return null
  const existing = at(state.document, cell, where)
  // Placing the same thing again is not an edit. Without this, dragging back
  // and forth over one cell fills the undo stack with fifty identical steps.
  if (
    existing &&
    existing.model === model &&
    existing.rotation === rotation &&
    existing.scale === scale &&
    // The brush lays level, unstretched pieces, so a tilted one at this cell is
    // *not* the same thing - and without this, painting over a ramp with the
    // same model would silently do nothing rather than straighten it.
    sameShape(existing, {})
  ) {
    return null
  }

  const placements = place_.world.placements.filter((p) => p !== existing)
  if (placements.length + 1 > MAX_PLACEMENTS) return null

  placements.push({ model, x: cell.x, y: cell.y, z: cell.z, rotation, scale })

  return commit(state, writePlace(state.document, where, { world: { ...place_.world, placements } }))
}

/** Take away whatever is anchored at a cell. Null if there was nothing. */
export function erase(state: EditState, cell: Cell, where?: PlaceTarget): EditState | null {
  const place_ = placeIn(state.document, where)
  const existing = at(state.document, cell, where)
  if (!place_ || !existing) return null

  return commit(
    state,
    writePlace(state.document, where, {
      world: {
        ...place_.world,
        placements: place_.world.placements.filter((p) => p !== existing),
      },
    }),
  )
}

/**
 * A whole drag, as one edit.
 *
 * The reason this exists rather than calling `place` per cell: a drag across
 * forty cells would otherwise be forty entries in the undo stack, so undoing a
 * wall means pressing undo forty times. One stroke, one undo, which is what
 * anybody who has used a drawing tool expects.
 */
export function stroke(
  state: EditState,
  cells: readonly Cell[],
  { model, rotation = 0, scale = 1 }: PlaceOptions,
  where?: PlaceTarget,
): EditState | null {
  if (!isKnownModel(model)) return null
  if (cells.length === 0) return null

  const place_ = placeIn(state.document, where)
  if (!place_) return null

  const wanted = new Map<string, Cell>()
  for (const cell of cells) wanted.set(cellId(cell), cell)

  const placements = place_.world.placements.filter(
    (placement) => !wanted.has(cellId(placement)),
  )
  if (placements.length + wanted.size > MAX_PLACEMENTS) return null

  for (const cell of wanted.values()) {
    placements.push({ model, x: cell.x, y: cell.y, z: cell.z, rotation, scale })
  }

  // Nothing actually moved - a drag entirely over identical pieces. The tilt
  // and the stretch are part of the key for the reason they are part of the
  // check in `place`: a ramp and a level piece of the same model are two
  // different things, and a key that could not tell them apart would report a
  // stroke that straightens one as a stroke that changed nothing.
  //
  // The collider is in it for the sharper version of the same reason. The brush
  // lays plain pieces, so painting over a wall somebody had made walk-through
  // is a stroke that makes it solid again - and a key that could not see the
  // difference would drop that edit and leave the old piece, override and all.
  const key = (p: Placement) =>
    `${cellId(p)}:${p.model}:${p.rotation}:${p.scale}:${p.pitch ?? 0}:${p.roll ?? 0}:${JSON.stringify(p.stretch ?? null)}:${JSON.stringify(p.collider ?? null)}`
  if (placements.length === place_.world.placements.length) {
    const before = new Set(place_.world.placements.map(key))
    if (placements.map(key).every((one) => before.has(one))) return null
  }

  return commit(state, writePlace(state.document, where, { world: { ...place_.world, placements } }))
}

/** Erase a whole drag, as one edit. */
export function eraseStroke(
  state: EditState,
  cells: readonly Cell[],
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  if (!place_) return null

  const wanted = new Set(cells.map(cellId))
  const placements = place_.world.placements.filter(
    (placement) => !wanted.has(cellId(placement)),
  )
  if (placements.length === place_.world.placements.length) return null

  return commit(state, writePlace(state.document, where, { world: { ...place_.world, placements } }))
}

// ---------------------------------------------------------------------------
// Entities: the things that are not on the lattice
// ---------------------------------------------------------------------------

/**
 * How fine anything can be nudged.
 *
 * A tenth of a metre, for entities and - since placements came off the lattice
 * - for architecture too. "Just left of the door" is a real requirement and a
 * metre lattice cannot say it; a tenth is fine enough to line a crate up against
 * a wall by eye, and coarse enough that two things placed the same way end up in
 * the same place rather than a millionth apart.
 *
 * The brush still works in whole cells. That is not a leftover: painting a floor
 * is a different act from placing a crate, and a brush that laid tiles at 2.3
 * would leave seams you cannot see and cannot close.
 */
export const ENTITY_STEP = 0.1

/**
 * Round to the grid, and never hand back negative zero.
 *
 * Divided and multiplied by *ten* rather than by `ENTITY_STEP`, which is the
 * same arithmetic and not the same answer: `Math.round(-3.4 / 0.1) * 0.1` is
 * -3.4000000000000004, because 0.1 is not 0.1 in binary. That was invisible
 * while this only moved entities around in memory. It stopped being invisible
 * when placements started using it, because a placement is written into a file
 * a person reads and diffs, and a level full of 3.4000000000000004 is a level
 * whose diffs are noise.
 */
export const snap = (v: number) => Math.round(v * 10) / 10 + 0

/**
 * Degrees, wrapped into 0..360 and rounded - what `setEntity` does to a turn.
 *
 * Exported because a *relative* control has to know it. A pad that adds a
 * third of a degree per tick to a value the document rounds to a whole one is
 * a pad that writes the same number forty times a second and never moves the
 * thing - the same trap `snap` sets for positions, and the same answer: keep
 * the intent unsettled and settle only the write. See `Transformer` in the
 * movie editor.
 */
export const settleAngle = (v: number) => ((Math.round(v) % 360) + 360) % 360

/**
 * The tilt and the per-axis size, settled in place.
 *
 * Mutates rather than returns, because both callers have already built the
 * merged object and the alternative is a third spelling of "spread this over
 * that". Returns false when the patch is one the parser would send back, which
 * is the property the whole file exists to keep: an editor that cannot save a
 * file it cannot open.
 *
 * **Anything that means the default is deleted rather than written.** A pitch
 * nudged back to zero and a stretch put back to one leave no field behind, so a
 * placement somebody experimented with and undid is byte for byte the placement
 * it was. That is the same rule `setRules` follows for `assign: 'spread'`, and
 * it is the half that keeps `readShape`'s promise reachable from the editor -
 * the parser dropping a zero is no use if the editor writes one back every save.
 */
function settleShape(next: { pitch?: number; roll?: number; stretch?: Stretch }): boolean {
  for (const angle of ['pitch', 'roll'] as const) {
    const value = next[angle]
    if (value === undefined) continue
    if (!Number.isFinite(value)) return false
    const settled = settleAngle(value)
    if (settled === 0) delete next[angle]
    else next[angle] = settled
  }

  if (next.stretch === undefined) return true
  const kept: Stretch = {}
  for (const axis of ['x', 'y', 'z'] as const) {
    const value = next.stretch[axis]
    if (value === undefined) continue
    if (!Number.isFinite(value)) return false
    // The floor `scale` gets, for the reason it gets it: a multiplier of zero
    // is a thing with no size that still stops you at its corner.
    const settled = Math.max(ENTITY_STEP, snap(value))
    if (settled !== 1) kept[axis] = settled
  }
  if (Object.keys(kept).length === 0) delete next.stretch
  else next.stretch = kept
  return true
}

/** Do two things have the same tilt and the same per-axis size? */
function sameShape(
  a: { pitch?: number; roll?: number; stretch?: Stretch },
  b: { pitch?: number; roll?: number; stretch?: Stretch },
): boolean {
  const one = stretchOf(a.stretch)
  const two = stretchOf(b.stretch)
  return (
    (a.pitch ?? 0) === (b.pitch ?? 0) &&
    (a.roll ?? 0) === (b.roll ?? 0) &&
    one.x === two.x &&
    one.y === two.y &&
    one.z === two.z
  )
}

/**
 * Do two placements collide as the same thing?
 *
 * Compared as JSON, which is the honest tool for a field that is a string or a
 * short list of small objects and never anything else. The alternative is a
 * hand-written walk over six optional numbers per box, which is more code to
 * get a `-0` wrong in.
 *
 * It exists at all because `setPlacement` refuses to record an edit that
 * changed nothing, and a collider it could not see would make "make this piece
 * walk-through" the one inspector change that does not reach the undo stack.
 */
function sameCollider(a: Placement, b: Placement): boolean {
  if (a.collider === b.collider) return true
  return JSON.stringify(a.collider ?? null) === JSON.stringify(b.collider ?? null)
}

/**
 * What a rotation turns around.
 *
 * `origin` is the model's own - which is the pivot the *file* has, and the
 * right one for a door on its hinge or a gun in a hand.
 *
 * `centre` is the middle of its bounding box, which is what somebody dragging a
 * rotate ring expects: the crate spins where it stands rather than swinging
 * round a corner of itself. It is not a different transform, it is a different
 * *position* - the entity is moved so the chosen point stays where it was.
 */
export type Pivot = 'origin' | 'centre'

/** Add an entity. Null if the document is full or the blueprint is unknown. */
/**
 * Is this kind of thing a save point?
 *
 * By what it *does* rather than by what it is called. A blueprint named
 * `checkpoint` that takes no save point is not one, and a blueprint named
 * `flag` that does is - the verb is the fact, and the name is a label its
 * author chose.
 *
 * Exported because the panel has to ask the same question the numbering asks -
 * an `order` field on a crate is a field about nothing, and a panel deciding
 * for itself what a save point is would be the second answer to a question
 * that already has one.
 */
export function savesProgress(blueprint: Blueprint): boolean {
  return blueprint.triggers.some((trigger) => trigger.do.some((verb) => verb.op === 'checkpoint'))
}

/**
 * The number the next save point should carry.
 *
 * One past the highest already placed, which is what "increment by default"
 * means and is the only default that is right more often than it is wrong: save
 * points are almost always laid down in the order they are met.
 *
 * The highest **placed**, not the count. Deleting the third of four and adding
 * another has to produce a five rather than a second four - two pads sharing a
 * number is one of them permanently unreachable, because taking one requires
 * beating the best so far and an equal number does not beat it.
 *
 * A per-entity `props.order` wins over the blueprint's, because that is the
 * order the engine reads.
 */
export function nextCheckpointOrder(document: XpDocument): number {
  let highest = 0
  /*
   * Every place, unlike `nextEntityName` right below, and the difference is the
   * question rather than the convenience. A *name* is resolved where you are
   * standing, so two rooms may each hold a `door`. A save point's *order* is
   * about a run through the level, and a run goes through rooms - two of them
   * each numbering their first checkpoint `1` is a run that goes backwards.
   */
  for (const place of placesOf(document)) {
    for (const entity of place.entities) {
      const blueprint = document.blueprints[entity.blueprint]
      if (!blueprint || !savesProgress(blueprint)) continue
      const order = entity.props.order ?? blueprint.props.order ?? 0
      if (order > highest) highest = order
    }
  }
  return highest + 1
}

export function addEntity(
  state: EditState,
  spec: Omit<EntitySpec, 'rotation' | 'scale' | 'props'> &
    Partial<Pick<EntitySpec, 'rotation' | 'scale' | 'props'>>,
  where?: PlaceTarget,
): EditState | null {
  // Blueprints are the document's, not a place's - one library, every room.
  if (!(spec.blueprint in state.document.blueprints)) return null
  const place_ = placeIn(state.document, where)
  if (!place_) return null
  // Per place, like `MAX_PLACEMENTS`: the cap is what one room costs to run.
  if (place_.entities.length + 1 > MAX_ENTITIES) return null

  /**
   * A save point arrives numbered, unless the caller said otherwise.
   *
   * The half of "numbered, and the highest wins" that a person actually
   * notices: dropping four pads and having them count 1, 2, 3, 4 without
   * typing anything. An explicit `order` in `spec.props` is always kept - this
   * is a default, and a default that overwrites what somebody asked for is not
   * one.
   */
  const blueprint = state.document.blueprints[spec.blueprint]
  const numbered: Record<string, number> =
    savesProgress(blueprint) && spec.props?.order === undefined
      ? { order: nextCheckpointOrder(state.document) }
      : {}

  const entity: EntitySpec = {
    rotation: 0,
    scale: 1,
    ...spec,
    props: { ...numbered, ...(spec.props ?? {}) },
    x: snap(spec.x),
    y: snap(spec.y),
    z: snap(spec.z),
  }

  return commit(
    state,
    writePlace(state.document, where, { entities: [...place_.entities, entity] }),
  )
}

/**
 * Take one away, and orphan nothing.
 *
 * Anything parented to it comes with it. The alternative - leaving children
 * pointing at an index that no longer exists - is a document the parser refuses
 * and an editor that can produce it, which is the one property §9 says must
 * hold. Detaching them instead would be a defensible choice and a surprising
 * one: deleting a kart should not leave its driver sitting in mid-air.
 */
export function removeEntity(
  state: EditState,
  index: number,
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  const entity = place_?.entities[index]
  if (!place_ || !entity) return null

  const doomed = new Set<string>()
  if (entity.name) doomed.add(entity.name)

  // Repeated because a child of a child is orphaned too, and the list is short.
  let changed = true
  while (changed) {
    changed = false
    // This room's, because a parent may not reach across rooms - see
    // `checkPlace` in ./format. A sweep of the whole document would orphan a
    // body in the cellar because something in the lobby shared its name.
    for (const other of place_.entities) {
      if (other.name && !doomed.has(other.name) && other.parent && doomed.has(other.parent)) {
        doomed.add(other.name)
        changed = true
      }
    }
  }

  const entities = place_.entities.filter(
    (candidate, i) =>
      i !== index && !(candidate.parent !== undefined && doomed.has(candidate.parent)),
  )

  /**
   * And every key and cue that named any of them, gone with them.
   *
   * Compulsory rather than tidy: `readTimeline` refuses a track naming a body
   * that is not there, so an actor deleted out of a shot without this produces
   * a document that saves and then will not re-open. `doomed` is the right list
   * because it already has the orphaned children in it - deleting a rig deletes
   * what was hanging off it, and their keys are just as stale.
   */
  let document = writePlace(state.document, where, { entities })
  for (const name of doomed) document = followRename(document, where, name, null)

  return commit(state, document)
}

/**
 * One more of something, with everything hanging off it.
 *
 * ---------------------------------------------------------------------------
 * The subtree, not the entity
 * ---------------------------------------------------------------------------
 * `removeEntity` takes children with it, and this is the same argument read
 * forwards: duplicating a kart and leaving the driver behind is a copy of a
 * thing that is not the thing. So the whole subtree comes, parents first so
 * that a child's new `parent` is a name that already exists.
 *
 * Only the **root** steps aside by a cell. A child's position is relative to
 * its parent - see `worldTransform`, which walks the chain adding as it goes -
 * so offsetting a child as well would move it twice and pull the copy apart.
 *
 * ---------------------------------------------------------------------------
 * And the things keyed by a name, which is where this gets forgotten
 * ---------------------------------------------------------------------------
 * A body in a movie is not just a row in `entities`: it has tracks, it has
 * actions, and it may have a pose clip named after it. A duplicate that copies
 * only the entity is one that looks right until the playhead moves and the
 * copy stands still. `renamedIn` already carries the rule for a rename - that
 * *anything* keyed by `entity` belongs with it - and this obeys the same rule
 * in the copying direction.
 *
 * One commit, so one undo undoes the whole thing rather than peeling a group
 * apart one member at a time.
 */
export function duplicateEntity(
  state: EditState,
  index: number,
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  const place_ = placeIn(state.document, where)
  const source = place_?.entities[index]
  if (!place_ || !source?.name) return null

  // The subtree, parents before children - the same walk `removeEntity` does,
  // and repeated for the same reason: a child of a child is still family.
  const family: EntitySpec[] = [source]
  const inside = new Set<string>([source.name])
  let growing = true
  while (growing) {
    growing = false
    for (const one of place_.entities) {
      if (!one.name || inside.has(one.name)) continue
      if (one.parent && inside.has(one.parent)) {
        inside.add(one.name)
        family.push(one)
        growing = true
      }
    }
  }

  if (place_.entities.length + family.length > MAX_ENTITIES) return null

  /**
   * Old name to new, filled as we go.
   *
   * Names have to be reserved as they are minted rather than all at once:
   * `nextEntityName` reads the document, and a document that does not yet hold
   * the first copy will hand out its name again for the second.
   */
  const renamed = new Map<string, string>()
  const taken = new Set(
    place_.entities.map((one) => one.name).filter((one): one is string => !!one),
  )

  const copies: EntitySpec[] = []
  for (const spec of family) {
    const stem = spec.blueprint.replace(/[^a-z0-9_-]/gi, '') || 'thing'
    let n = 2
    let fresh = `${stem}_${n}`
    while (taken.has(fresh)) fresh = `${stem}_${++n}`
    taken.add(fresh)
    renamed.set(spec.name!, fresh)

    copies.push({
      ...spec,
      name: fresh,
      ...(spec.parent && renamed.has(spec.parent)
        ? { parent: renamed.get(spec.parent)! }
        : {}),
      // A cell aside, and only the root - see the note above.
      ...(spec.name === source.name ? { x: snap(spec.x + 1) } : {}),
      /*
       * A save point's number is not copyable. Two checkpoints answering to
       * `order: 3` is a level whose progress depends on which of them the
       * reader happens to see first, which is the failure `addEntity` numbers
       * them to avoid in the first place.
       */
      ...(savesProgress(state.document.blueprints[spec.blueprint])
        ? {
            props: {
              ...(spec.props ?? {}),
              order: nextCheckpointOrder(state.document) + copies.length,
            },
          }
        : {}),
    })
  }

  let document = writePlace(state.document, where, {
    entities: [...place_.entities, ...copies],
  })

  const timeline = placeIn(document, where)?.timeline
  if (timeline) {
    const tracks: Record<string, Tracks> = { ...timeline.tracks }
    for (const [from, to] of renamed) {
      const bag = timeline.tracks[from]
      if (bag) tracks[to] = bag
    }

    // Appended rather than spliced in beside their originals: an action list is
    // read by time and not by position, and `actedAt` folds it in `t` order.
    const actions = [...timeline.actions]
    for (const one of timeline.actions) {
      const to = renamed.get(one.entity)
      if (!to) continue
      actions.push(
        one.kind === 'play' && one.clip === poseClipOf(one.entity)
          ? { ...one, entity: to, clip: poseClipOf(to) }
          : { ...one, entity: to },
      )
    }

    document = writePlace(document, where, { timeline: { ...timeline, tracks, actions } })
  }

  /*
   * And the pose clip, which is the one thing keyed by a name that lives on the
   * *document* rather than in the timeline. Missing it leaves the copy playing
   * a clip that was never written, which the runtime treats as no clip at all -
   * so the duplicate of a posed body stands in the default rig, silently.
   */
  const clips = { ...(document.clips ?? {}) }
  let posed = false
  for (const [from, to] of renamed) {
    const clip = clips[poseClipOf(from)]
    if (!clip) continue
    clips[poseClipOf(to)] = clip
    posed = true
  }
  if (posed) document = { ...document, clips }

  return { state: commit(state, document), name: renamed.get(source.name)! }
}

/** What a body's own pose clip is called. Mirrors `poseClipName` in the editor. */
const poseClipOf = (entity: string) => `pose-${entity}`

/**
 * Change one, snapping anything positional.
 *
 * Returns null when nothing would change, for the same reason `place` does: a
 * gizmo fires a change event per frame while it is dragged, and a document per
 * frame in the undo stack is an undo button that does nothing you can perceive.
 */
export function setEntity(
  state: EditState,
  index: number,
  patch: Partial<EntitySpec>,
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  const existing = place_?.entities[index]
  if (!place_ || !existing) return null

  const next: EntitySpec = {
    ...existing,
    ...patch,
    ...(patch.x !== undefined ? { x: snap(patch.x) } : {}),
    ...(patch.y !== undefined ? { y: snap(patch.y) } : {}),
    ...(patch.z !== undefined ? { z: snap(patch.z) } : {}),
    ...(patch.rotation !== undefined ? { rotation: settleAngle(patch.rotation) } : {}),
    ...(patch.scale !== undefined ? { scale: Math.max(ENTITY_STEP, snap(patch.scale)) } : {}),
  }

  if (!settleShape(next)) return null

  /**
   * Props are compared too, or a props-only patch is dropped on the floor.
   *
   * The guard below reads "nothing would change" off a list of fields, so a
   * field missing from the list is a field that can never be edited - which is
   * what a save point's `order` was: typed in the panel, refused here, and no
   * error anywhere to say why.
   *
   * Shallow, because a prop is a number by construction.
   */
  const keys = Object.keys(next.props)
  const sameProps =
    keys.length === Object.keys(existing.props).length &&
    keys.every((key) => next.props[key] === existing.props[key])

  if (
    next.x === existing.x &&
    next.y === existing.y &&
    next.z === existing.z &&
    next.rotation === existing.rotation &&
    next.scale === existing.scale &&
    sameShape(next, existing) &&
    next.name === existing.name &&
    next.parent === existing.parent &&
    next.socket === existing.socket &&
    next.blueprint === existing.blueprint &&
    next.text === existing.text &&
    next.colour === existing.colour &&
    next.background === existing.background &&
    sameProps
  ) {
    return null
  }

  /**
   * Hanging one entity off another, refused when it cannot mean anything.
   *
   * The same three checks `addPart` makes for a part, and needed here for the
   * same reason: the parser is the boundary, and the editor must refuse to
   * build a document the boundary would send back. What is different is that
   * these arrive from a *select* rather than from typing, so the refusal is a
   * guard against a stale list - an entity renamed under an open panel - rather
   * than against a typo.
   *
   * A cycle is the one worth naming. It resolves rather than throwing (the
   * depth guard in the transform walk stops it), so a loop produces a position
   * instead of an error, and a position is something an author argues with for
   * ten minutes rather than notices.
   */
  if (next.parent !== undefined && next.parent !== existing.parent) {
    if (next.parent === '') delete next.parent
    else {
      // This room's, because a parent may not reach across rooms: a thing
      // hanging off something in another room is not hanging off anything you
      // can see. See `checkPlace` in ./format.
      const named = place_.entities.findIndex(
        (other, i) => i !== index && other.name === next.parent,
      )
      if (named < 0) return null
      if (wouldLoopEntities(place_.entities, index, next.parent)) return null
    }
  }
  // A socket on nothing is a socket on the world, which is not a thing. Cleared
  // with the parent rather than left behind, or re-parenting inherits a socket
  // name from a body that never had one.
  if (next.parent === undefined && next.socket !== undefined) delete next.socket
  if (next.socket === '') delete next.socket

  const entities = [...place_.entities]
  entities[index] = next

  /**
   * A rename takes whatever was hanging off the old name with it.
   *
   * Found while building the timeline's half of this and it is the same bug one
   * layer down: `parent` is a name, the parser refuses a name nothing declares,
   * so renaming a body that something hangs off saved a document that would not
   * re-open - and the error pointed at the *child*, naming a parent the author
   * had already renamed. The children are re-pointed here rather than orphaned.
   *
   * Clearing a name orphans them for real, because there is no new name to
   * point at. The parent link goes rather than dangling; a socket goes with it,
   * for the reason below - a socket on nothing is a socket on the world.
   */
  if (existing.name && next.name !== existing.name) {
    for (const [i, other] of entities.entries()) {
      if (i === index || other.parent !== existing.name) continue
      if (next.name) {
        entities[i] = { ...other, parent: next.name }
      } else {
        const orphan = { ...other }
        delete orphan.parent
        delete orphan.socket
        entities[i] = orphan
      }
    }
  }

  /**
   * A rename takes the body's keys with it.
   *
   * The rename is the case worth spelling out, because the failure is delayed
   * and points somewhere else: `readTimeline` refuses a track naming a body
   * that is not there, so renaming a keyed actor without this saves a document
   * that will not re-open, with an error naming a name the author has already
   * changed. Nothing in the panel would connect the two.
   *
   * Clearing the name is a delete as far as the timeline is concerned - an
   * unnamed body cannot be addressed, so its keys could never apply again.
   */
  const document =
    next.name === existing.name
      ? writePlace(state.document, where, { entities })
      : followRename(
          writePlace(state.document, where, { entities }),
          where,
          existing.name,
          next.name ?? null,
        )

  return commit(state, document)
}

/** `wouldLoop`, for entities. Same shape, different list - see the note there. */
function wouldLoopEntities(
  entities: readonly EntitySpec[],
  childIndex: number,
  parent: string,
): boolean {
  const byName = new Map(
    entities.filter((entity) => entity.name).map((entity) => [entity.name!, entity]),
  )
  let link = byName.get(parent)
  let depth = 0
  while (link && depth++ < 32) {
    if (link === entities[childIndex]) return true
    link = link.parent ? byName.get(link.parent) : undefined
  }
  return false
}

/**
 * Turn an entity, keeping a chosen point where it is.
 *
 * About the origin this is just a rotation. About the centre it is a rotation
 * *and* a move: the model's middle sits somewhere off its own origin, so
 * spinning it would otherwise carry it in an arc - which is exactly the "why is
 * it walking away from me" that a rotate ring produces if nobody thinks about
 * the pivot.
 */
export function rotateEntity(
  state: EditState,
  index: number,
  degrees: number,
  pivot: Pivot = 'origin',
  where?: PlaceTarget,
): EditState | null {
  const entity = placeIn(state.document, where)?.entities[index]
  if (!entity) return null
  if (pivot === 'origin') return setEntity(state, index, { rotation: degrees }, where)

  const blueprint = state.document.blueprints[entity.blueprint]
  const model = blueprint ? findModel(blueprint.model) : null
  if (!model) return setEntity(state, index, { rotation: degrees }, where)

  // The middle of the box, in the model's own frame.
  const cx = (model.min.x + model.size.w / 2) * entity.scale
  const cz = (model.min.z + model.size.d / 2) * entity.scale

  const before = turn(cx, cz, entity.rotation)
  const after = turn(cx, cz, degrees)

  return setEntity(
    state,
    index,
    {
      rotation: degrees,
      x: entity.x + before.x - after.x,
      z: entity.z + before.z - after.z,
    },
    where,
  )
}

/** A point turned about Y, the same convention three.js uses. */
function turn(x: number, z: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos + z * sin, z: -x * sin + z * cos }
}

// ---------------------------------------------------------------------------
// Tools: turning two corners into a set of cells
// ---------------------------------------------------------------------------

/**
 * The cells on a straight line between two, on the lattice.
 *
 * Bresenham in three dimensions, driven by whichever axis moves furthest, so a
 * diagonal has no gaps in it. Gaps matter more here than in a paint program: a
 * wall with a hole you cannot see from above is a wall somebody walks through.
 */
export function line(from: Cell, to: Cell): Cell[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
  if (steps === 0) return [from]

  const cells: Cell[] = []
  for (let i = 0; i <= steps; i++) {
    cells.push({
      x: from.x + Math.round((dx * i) / steps),
      y: from.y + Math.round((dy * i) / steps),
      z: from.z + Math.round((dz * i) / steps),
    })
  }
  return cells
}

/** Every cell in the box between two corners, filled. */
export function box(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = []
  const [x0, x1] = from.x <= to.x ? [from.x, to.x] : [to.x, from.x]
  const [y0, y1] = from.y <= to.y ? [from.y, to.y] : [to.y, from.y]
  const [z0, z1] = from.z <= to.z ? [from.z, to.z] : [to.z, from.z]

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) cells.push({ x, y, z })
    }
  }
  return cells
}

/**
 * The outline of the box between two corners - its walls, not its volume.
 *
 * A room is four walls and no ceiling, and drawing it as a filled box and then
 * hollowing it out is two operations where one will do. The vertical faces
 * only: a filled top is a lid nobody wants and a filled bottom is a floor the
 * floor tool already draws.
 */
export function outline(from: Cell, to: Cell): Cell[] {
  const [x0, x1] = from.x <= to.x ? [from.x, to.x] : [to.x, from.x]
  const [y0, y1] = from.y <= to.y ? [from.y, to.y] : [to.y, from.y]
  const [z0, z1] = from.z <= to.z ? [from.z, to.z] : [to.z, from.z]

  const seen = new Map<string, Cell>()
  const add = (cell: Cell) => seen.set(cellId(cell), cell)

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      add({ x, y, z: z0 })
      add({ x, y, z: z1 })
    }
    for (let z = z0; z <= z1; z++) {
      add({ x: x0, y, z })
      add({ x: x1, y, z })
    }
  }

  return [...seen.values()]
}

/**
 * Where a click lands, given what it hit.
 *
 * The interaction the lobby already taught people: the highlight sits *against*
 * the face you are pointing at, so clicking the top of a block puts the next one
 * on top of it and clicking its side puts one beside it. Holding the modifier
 * targets the block itself instead, which is what erasing means.
 *
 * `normal` is the face's outward direction, which is what a raycast gives you.
 * Rounded rather than trusted: a renderer hands back 0.9999 and flooring that is
 * a cell in the wrong place, once in a while, unreproducibly.
 */
export function cellFromHit(
  point: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  { inside = false }: { inside?: boolean } = {},
): Cell {
  // A hair *into* the face before flooring, so a hit exactly on a boundary
  // belongs to the cell it is a face of rather than to its neighbour.
  const bias = inside ? -0.5 : 0.5
  return {
    x: Math.floor(point.x + Math.round(normal.x) * bias),
    y: Math.floor(point.y + Math.round(normal.y) * bias),
    z: Math.floor(point.z + Math.round(normal.z) * bias),
  }
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

/**
 * The document's scripts, always an object.
 *
 * `scripts` is omitted from a document that has none, so that one which never
 * had a script round-trips without growing an empty block. Every reader would
 * otherwise have to say `?? {}`, and one of them would forget.
 */
export function scriptsOf(document: XpDocument): Readonly<Record<string, string>> {
  return document.scripts ?? {}
}

/** Which blueprints run a given script. */
export function usedBy(document: XpDocument, name: string): string[] {
  return Object.entries(document.blueprints)
    .filter(([, blueprint]) => blueprint.script === name)
    .map(([id]) => id)
}

/**
 * Write a script's source.
 *
 * Marked, so a run of keystrokes in one field is one undo step - see `mark` on
 * `EditState`. Refused if the source is longer than the parser will accept,
 * because an editor that lets you write a document its own parser rejects is an
 * editor that can save a file it cannot open.
 */
export function setScript(state: EditState, name: string, source: string): EditState | null {
  const scripts = scriptsOf(state.document)
  if (!(name in scripts)) return null
  if (source.length > MAX_SCRIPT_LENGTH) return null
  if (scripts[name] === source) return state

  return commit(
    state,
    { ...state.document, scripts: { ...scripts, [name]: source } },
    `script:${name}`,
  )
}

/**
 * Declare a field, or change one that is already declared.
 *
 * docs/xp/backlog.md §7c. One function for both, because the Data panel's
 * gesture is the same either way and two that differ only in whether they
 * refuse an existing name would be two code paths for one button.
 *
 * `commit` with a label per field, so editing a starting value twice in a row
 * is one undo step rather than two - the same collapsing rule typing already
 * has, for the same reason: a number input fires per keystroke.
 */
export function setDataField(state: EditState, name: string, field: XpField): EditState | null {
  if (!DATA_NAME.test(name)) return null

  const data = dataOf(state.document)
  const held = data[name]
  if (held && held.scope === field.scope && held.value === field.value && held.label === field.label) {
    return state
  }
  // The cap is the parser's, and it is checked here so the panel cannot build a
  // document that will not save rather than being told about it afterwards.
  if (!held && Object.keys(data).length >= MAX_DATA_FIELDS) return null

  return commit(state, { ...state.document, data: withField(data, name, field) }, `data:${name}`)
}

/**
 * Which of the player's keys are live in a phase.
 *
 * docs/xp/xp-flow.md §2. The one field of a flow worth a control before the
 * graph editor exists: it is what a phase *does to the player*, it changes while
 * you are designing a turn, and getting it wrong is a button that quietly stops
 * working - which reads as a broken key rather than as a rule.
 *
 * `undefined` and `[]` are opposites and both are reachable here: absent is
 * every binding, empty is *nobody acts*. A control that could only produce a
 * list would be one that cannot say the more useful of the two.
 *
 * Refused for a phase that is not there rather than creating one. A phase is a
 * node in a graph and making one by ticking a checkbox on a name you mistyped is
 * how a flow grows a state nothing reaches.
 */
/**
 * What a phase says it is, in the author's own words.
 *
 * The write side of `FlowPhase.says`, and the reason it needs one: the line is
 * the only part of a flow a *player* ever reads, so it is the part most likely
 * to be wrong - and an author who has to open the JSON to fix a sentence will
 * leave the sentence wrong.
 *
 * Trimmed, and empty removes rather than storing `""`: a phase saying nothing
 * and a phase carrying an empty string are the same phase, and only one of them
 * should be a document.
 */
/**
 * Which of a document's flows an edit is aimed at.
 *
 * ---------------------------------------------------------------------------
 * A parameter rather than a field on `EditState`
 * ---------------------------------------------------------------------------
 * A level can keep a round per mode (`flows`, ./format), so every function in
 * this section needs to know which one it is editing. The tempting place to put
 * that is `EditState`, beside the document and the undo stacks - and it is the
 * wrong one, because it would then be *on the undo stack*: pressing undo would
 * silently move you to a different flow, and the panel would be looking at a
 * round nobody asked to see. Which flow you are editing is a fact about the
 * screen, not about the document.
 *
 * So it is the last argument everywhere, and **absent is the level's own
 * `flow`** - which means every caller written before rounds could be per-mode,
 * and every test, is unchanged and still right.
 */
export type FlowTarget = Mode | undefined

/** The flow an edit is aimed at, or undefined when there is not one there. */
function flowAt(document: XpDocument, where: FlowTarget): XpFlow | undefined {
  return where === undefined ? document.flow : document.flows?.[where]
}

/**
 * The document with that flow replaced - or removed, for `undefined`.
 *
 * The bookkeeping this exists to hold in one place is the *emptying*: a `flows`
 * table whose last entry has just gone has to disappear rather than round-trip
 * as `{}`, which is the same rule `isDefaultRules` follows one block over and
 * the same one that keeps a document nobody configured from growing blocks it
 * never asked for.
 */
function writeFlow(document: XpDocument, where: FlowTarget, next: XpFlow | undefined): XpDocument {
  if (where === undefined) {
    return next === undefined ? omit(document, 'flow') : { ...document, flow: next }
  }

  const flows = { ...document.flows }
  if (next === undefined) delete flows[where]
  else flows[where] = next

  return Object.keys(flows).length === 0
    ? omit(document, 'flows')
    : { ...document, flows }
}

/**
 * And the undo mark, so two flows do not collapse into one step.
 *
 * `mark` is what makes consecutive keystrokes one undo step rather than one per
 * character. Without the target in it, typing a `says` in the battle's round
 * and then in the room's would replace the first edit with the second and the
 * first would be gone - the exact failure the mark exists to cause on purpose
 * for one field and must not cause across two.
 */
function flowMark(where: FlowTarget, what: string): string {
  return where === undefined ? `flow:${what}` : `flows.${where}:${what}`
}

export function setPhaseSays(
  state: EditState,
  phase: string,
  says: string,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, phase)) return null

  const held = flow.phases[phase]
  const wanted = says.trim()
  if (wanted.length > MAX_SAYS) return null
  if ((held.says ?? '') === wanted) return state

  const next: XpFlow = {
    ...flow,
    phases: {
      ...flow.phases,
      [phase]: wanted.length === 0 ? omit(held, 'says') : { ...held, says: wanted },
    },
  }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `says:${phase}`))
}

/**
 * Whose phase this is: `'turn'` scopes its keys to the player who is up,
 * `null` gives it back to everybody. See `FlowPhase.who` for what the field
 * means and what it deliberately does not decide.
 */
export function setPhaseWho(
  state: EditState,
  phase: string,
  who: 'turn' | null,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, phase)) return null

  const held = flow.phases[phase]
  if ((held.who ?? null) === who) return state

  const next: XpFlow = {
    ...flow,
    phases: {
      ...flow.phases,
      [phase]: who === null ? omit(held, 'who') : { ...held, who },
    },
  }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `who:${phase}`))
}

export function setPhaseAllow(
  state: EditState,
  phase: string,
  allow: readonly string[] | undefined,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, phase)) return null

  const held = flow.phases[phase]
  const same =
    held.allow === undefined
      ? allow === undefined
      : allow !== undefined &&
        held.allow.length === allow.length &&
        held.allow.every((one, at) => one === allow[at])
  if (same) return state

  const next: XpFlow = {
    ...flow,
    phases: {
      ...flow.phases,
      // Dropped rather than written as undefined, so a document that never
      // narrowed a phase round-trips without growing the field.
      [phase]: allow === undefined ? omit(held, 'allow') : { ...held, allow: [...allow] },
    },
  }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `allow:${phase}`))
}

/**
 * What a phase does on being entered.
 *
 * ---------------------------------------------------------------------------
 * The half of a flow that was drawable and not writable
 * ---------------------------------------------------------------------------
 * The graph could add a phase, wire the arrows and narrow the keys, and the one
 * thing a phase is *for* - doing something when a run walks into it - was a
 * read-only row that said `emit · teleport` or `—`. So a flow was authorable
 * right up to the point where it does anything, and the last step was still
 * hand-editing JSON. That is the same gap `BehaviourPanel` was written to close
 * for a rule, and this is the same close: the panel draws the verb rows it
 * already draws, and these are the three edits under them.
 *
 * **Empty is absent here, unlike a trigger's `do`.** A rule with nothing to do
 * is refused by the parser, so its last verb has no remove button; a phase with
 * nothing to do is the ordinary case - `play` in the board game does nothing on
 * entry, it just waits - so removing the last one is allowed and drops the field
 * rather than leaving `"does": []` behind.
 *
 * The three are separate rather than one setter that takes a list, for the
 * reason `setVerb` and `addVerb` are: the refusals belong next to the shape they
 * are about, and a panel handed an array to splice would be the second place
 * that knows what a `does` may contain.
 */
export function addPhaseVerb(
  state: EditState,
  phase: string,
  verb: Verb = NEW_VERB,
  where?: FlowTarget,
): EditState | null {
  const held = flowAt(state.document, where)?.phases[phase]
  if (!held) return null
  return setPhaseDoes(state, phase, [...(held.does ?? []), verb], where)
}

/**
 * Replace one verb outright, rather than patch it - `setVerb`'s argument
 * exactly: a verb is a tagged union whose fields differ by tag, so a partial
 * patch across a change of `op` has no meaning.
 */
export function setPhaseVerb(
  state: EditState,
  phase: string,
  at: number,
  verb: Verb,
  where?: FlowTarget,
): EditState | null {
  const held = flowAt(state.document, where)?.phases[phase]
  if (!held?.does?.[at]) return null
  const verbs = [...held.does]
  verbs[at] = verb
  return setPhaseDoes(state, phase, verbs, where)
}

/** Take one away, by its place in the list. The last one may go. */
export function removePhaseVerb(
  state: EditState,
  phase: string,
  at: number,
  where?: FlowTarget,
): EditState | null {
  const held = flowAt(state.document, where)?.phases[phase]
  if (!held?.does?.[at]) return null
  return setPhaseDoes(
    state,
    phase,
    held.does.filter((_, index) => index !== at),
    where,
  )
}

/** The one write the three above share, so `does: []` can never be committed. */
function setPhaseDoes(
  state: EditState,
  phase: string,
  does: readonly Verb[],
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  const held = flow?.phases[phase]
  if (!flow || !held) return null

  const next: XpFlow = {
    ...flow,
    phases: {
      ...flow.phases,
      [phase]: does.length === 0 ? omit(held, 'does') : { ...held, does },
    },
  }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `does:${phase}`))
}

/**
 * Which phase a run opens in.
 *
 * Refused for a name that is not a phase, which is the same refusal
 * `flowProblems` makes at parse time - said here so the panel cannot build a
 * document that will not save rather than being told about it afterwards.
 */
export function setFlowStart(state: EditState, start: string, where?: FlowTarget): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, start)) return null
  if (flow.start === start) return state
  return commit(state, writeFlow(state.document, where, { ...flow, start }), flowMark(where, 'start'))
}

/**
 * The first phase of a level's first flow, which is how a place becomes a run.
 *
 * ---------------------------------------------------------------------------
 * The button that was not there
 * ---------------------------------------------------------------------------
 * `addPhase` refuses a document with no flow, and the comment under it said the
 * first phase was "`setFlow`'s business" - and `setFlow` was never written. So
 * every level in the editor had no flow, the panel drew *this level describes no
 * round*, and there was no control anywhere that could change that. The graph,
 * the arrows, the verb rows and `allow` were all reachable only by hand-editing
 * the JSON to grow a `flow` block first, which is exactly the thing the panel
 * exists to stop being necessary.
 *
 * **One phase and it is the start**, because those are the same phase: a flow's
 * `start` has to name one of its `phases`, so the smallest flow that parses is
 * this and there is no intermediate state to hold. It arrives empty - no verbs,
 * every key live, nowhere to go - which is what `addPhase` does too, and the
 * panel immediately draws the one warning that is true of it: nothing leaves
 * here.
 *
 * Refused for a level that already has one. Replacing a flow is not a thing this
 * can mean, and "start a flow" on a level with three phases in it would be a
 * button whose effect is deleting them.
 */
export function startFlow(state: EditState, name: string, where?: FlowTarget): EditState | null {
  if (flowAt(state.document, where) || name.length === 0) return null
  const flow: XpFlow = { start: name, phases: { [name]: {} } }
  return commit(state, writeFlow(state.document, where, flow), flowMark(where, `start:${name}`))
}

/**
 * When this run is won.
 *
 * `null` takes the field away, which `Partial` cannot say - the same shape
 * `TriggerPatch.when` already uses and for the same reason: `undefined` in a
 * spread is indistinguishable from not mentioning it, so "never ends" and
 * "leave the ending alone" would be one call.
 *
 * Not checked against the level's `data` here. A `wins` naming a field nobody
 * declared is reported by `parseXp`'s own walk over the whole document, with an
 * address, the next time it is read - and a second implementation of that check
 * in the edit layer is a second one to keep in step.
 */
export function setFlowWins(
  state: EditState,
  wins: Condition | null,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow) return null
  const next: XpFlow = wins === null ? omit(flow, 'wins') : { ...flow, wins }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, 'wins'))
}

/**
 * And the whole thing taken away again, which turns a run back into a place.
 *
 * The other end of `startFlow`, and it has to exist for the same reason every
 * other block in this file has a way out: a one-way switch is one somebody
 * presses to see what it does and then has to hand-edit JSON to undo. `flow` is
 * a *run* - see docs/xp/xp-flow.md §5 - and a level deciding it is a place after
 * all is an ordinary edit rather than a mistake.
 *
 * Everything in it goes, phases and arrows and all. That is not a hidden cost:
 * the panel is the whole flow on one screen, so what is being removed is what
 * was being looked at - and this file's undo is the safety net it is for.
 */
export function removeFlow(state: EditState, where?: FlowTarget): EditState | null {
  if (!flowAt(state.document, where)) return null
  return commit(state, writeFlow(state.document, where, undefined), flowMark(where, 'none'))
}

/**
 * What the product may do with this level: keep it standing as a room, run a
 * match on it, score a ball game, rank two runs of it.
 *
 * ---------------------------------------------------------------------------
 * The one block the editor could read and not write
 * ---------------------------------------------------------------------------
 * `capabilities` decides who may *schedule* a level - see ./capabilities - and
 * the Document panel printed it and the Mode panel greyed presets out for want
 * of one, and nothing anywhere could change it. A level made from the room
 * template was `freeplay` for ever; one made from the match template could
 * never stop offering "keep as a room" to a space that only wanted to battle
 * on it. The board game is the case that asked: it is a table for four, not a
 * place to wander, and until this it could not say so.
 *
 * ---------------------------------------------------------------------------
 * Each claim is checked against the world, here, before it is written
 * ---------------------------------------------------------------------------
 * `capabilityProblems` is the parser's own check and it runs here too, so a
 * `match` claimed in a world with one spawn is refused at the checkbox rather
 * than at the save - which is the same rule every other op in this file
 * follows. And a capability the Mode preset leans on cannot be taken away
 * while the preset stands: `setRules` refuses a preset whose capability is
 * missing, and this is the other half of that, so the two cannot be used to
 * produce a document the parser throws back.
 *
 * Empty is refused rather than written: the parser would put `freeplay` back
 * on a document that declares nothing, and an op whose effect is "the opposite
 * of what you asked" is worse than one that says no. Deduplicated and kept in
 * the canonical order, so two documents claiming the same things diff the same.
 */
export function setCapabilities(
  state: EditState,
  capabilities: readonly Capability[],
): EditState | null {
  const wanted = CAPABILITIES.filter((one) => capabilities.includes(one))
  if (wanted.length === 0) return null
  for (const one of wanted) {
    /*
     * The root's world, which is what the parser checks it against.
     *
     * A `football` claim in a document with rooms could in principle be backed
     * up by goals in the arena rather than in the level's own world - and it is
     * not, because `capabilityProblems` is asked one world and the parser asks
     * it the root's. Matching that here is the point: an editor that accepted a
     * claim the parser then refuses is an editor that saves a document it
     * cannot reopen. When the check learns about rooms, both move together.
     */
    if (capabilityProblems(one, state.document.world).length > 0) return null
  }
  const needed = presetNeeds(rulesOf(state.document).preset)
  if (needed && !wanted.includes(needed)) return null

  const held = state.document.capabilities
  if (held.length === wanted.length && held.every((one, index) => one === wanted[index])) {
    return state
  }
  return commit(state, { ...state.document, capabilities: wanted })
}

/**
 * A whole round, written in one go from one of the shapes a game usually has.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `startFlow` called five times
 * ---------------------------------------------------------------------------
 * It could be - every piece of a starter is reachable through an op this file
 * already has, and each of those ops keeps its own rules. That is exactly how
 * it is built below: the data fields go through `setDataField`, the keys
 * through `setPlayerRole`, the die through `addBlueprint` and `addEntity`, so
 * a starter cannot write a field the Data panel would refuse or a key the
 * player panel would. What is *not* reused is their place on the undo stack:
 * the final `commit` is from the state this was called in, so somebody who
 * pressed one button presses undo once. See `addBody`, which made the same
 * trade for the same reason.
 *
 * ---------------------------------------------------------------------------
 * Nothing the author already has is overwritten
 * ---------------------------------------------------------------------------
 * A field of the same name is kept as typed; a key already bound to `use` keeps
 * its letter; a blueprint called `die` is left alone and the entity is placed
 * from the starter's own anyway - which is still right, because the name is
 * what the flow's arrows listen to and a die the author made is a die that
 * says `rolled` or it is not the thing this starter needs.
 *
 * The flow itself *is* replaced, and deliberately: starting from a shape is a
 * decision about the whole round, and a level with three phases in it that
 * picks "board game" has chosen a different game. `startFlow` refuses a second
 * flow because its button would otherwise be a delete; this one says what it
 * replaces on the card, and undo is one press away.
 *
 * `live` is the absence of a flow, so applying it takes the flow away - the
 * same write `removeFlow` makes - and is a no-op on a level that has none.
 */
export function applyFlowStarter(
  state: EditState,
  id: FlowStarterId,
  where?: FlowTarget,
): EditState | null {
  const starter = flowStarterById(id)
  if (!starter) return null

  if (!starter.flow) {
    return flowAt(state.document, where) ? removeFlow(state, where) : state
  }
  // A starter that does not hold is a bug in this package, not a level.
  if (flowProblems(starter.flow).length > 0) return null

  let next: EditState = state

  for (const [name, field] of Object.entries(starter.data ?? {})) {
    if (name in dataOf(next.document)) continue
    const added = setDataField(next, name, field)
    if (!added) return null
    next = added
  }

  if (starter.keys && starter.keys.length > 0) {
    const held = next.document.player.keys ?? []
    const bound = new Set(held.map((binding) => binding.does))
    const taken = new Set(held.map((binding) => binding.key))
    // Merged by what the key *does*, then by the key itself: a level that has
    // `use` on another letter keeps it, and a starter whose letter is already
    // spoken for by some other binding does not bind two things to one key.
    const missing = starter.keys.filter(
      (binding) => !bound.has(binding.does) && !taken.has(binding.key),
    )
    if (missing.length > 0) {
      const rebound = setPlayerRole(next, { keys: [...held, ...missing] })
      if (!rebound) return null
      next = rebound
    }
  }

  for (const [name, blueprint] of Object.entries(starter.blueprints ?? {})) {
    if (name in next.document.blueprints) continue
    const added = addBlueprint(next, name, blueprint)
    if (!added) return null
    next = added
  }

  const spawn = next.document.spawn
  for (const entity of starter.entities ?? []) {
    const { dx, dy, dz, scale, ...rest } = entity
    const placed = addEntity(next, {
      ...rest,
      x: spawn.x + dx,
      y: spawn.y + dy,
      z: spawn.z + dz,
      ...(scale !== undefined ? { scale } : {}),
    })
    if (!placed) return null
    next = placed
  }

  return commit(state, writeFlow(next.document, where, starter.flow), flowMark(where, `starter:${id}`))
}

/**
 * A phase, added.
 *
 * Empty: no verbs, every key live, nowhere to go. That is deliberate and it is
 * what the panel then draws two warnings on - nothing reaches it, and nothing
 * leaves it - because a phase you have made and not yet wired is exactly a
 * phase nothing reaches, and the graph should say so while you are looking at
 * it rather than when the parser refuses the save.
 *
 * Refused for a name already taken, and for a document with no flow: the first
 * phase of a level's first flow is `setFlow`'s business, not a button that
 * quietly invents a `start`.
 */
export function addPhase(state: EditState, name: string, where?: FlowTarget): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || name.length === 0 || Object.hasOwn(flow.phases, name)) return null
  if (Object.keys(flow.phases).length >= MAX_PHASES) return null

  const next: XpFlow = { ...flow, phases: { ...flow.phases, [name]: {} } }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `add:${name}`))
}

/**
 * A phase, removed - and every arrow that pointed at it.
 *
 * **The arrows go too**, which is the whole decision here. Leaving them would
 * produce a document the parser refuses, from a button whose only visible effect
 * was somewhere else on the screen - and "delete this, then hunt for what broke"
 * is the shape of edit this panel exists to stop.
 *
 * The start is refused rather than reassigned. Which phase a run opens in is a
 * choice somebody made, and picking the next one alphabetically on their behalf
 * is a worse answer than saying no.
 */
export function removePhase(state: EditState, name: string, where?: FlowTarget): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, name)) return null
  if (flow.start === name) return null

  const phases: Record<string, XpFlow['phases'][string]> = {}
  for (const [id, phase] of Object.entries(flow.phases)) {
    if (id === name) continue
    const kept = (phase.next ?? []).filter((step) => step.go !== name)
    phases[id] =
      phase.next === undefined
        ? phase
        : kept.length === 0
          ? omit(phase, 'next')
          : { ...phase, next: kept }
  }

  return commit(
    state,
    writeFlow(state.document, where, { ...flow, phases }),
    flowMark(where, `remove:${name}`),
  )
}

/**
 * How many times the round is played, or `null` for once.
 *
 * ---------------------------------------------------------------------------
 * The two fields move together, because one without the other is broken
 * ---------------------------------------------------------------------------
 * `rounds` needs a step that reaches `ROUND_AGAIN` and a step reaching
 * `ROUND_AGAIN` needs `rounds` - `flowProblems` refuses both halves of that
 * pair, so an op that wrote one of them alone would be an op whose only
 * possible result is a document that cannot save.
 *
 * So taking the count away takes the seams with it, exactly as `removePhase`
 * takes the arrows that pointed at what it removed. Adding one does *not*
 * invent a seam - where the round ends is a decision about the game, and
 * guessing it would put an arrow in the graph nobody drew. The panel draws
 * the warning instead, which is the same bargain a new phase already makes.
 */
export function setFlowRounds(
  state: EditState,
  rounds: number | null,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow) return null
  if (rounds !== null && (!Number.isInteger(rounds) || rounds < 2 || rounds > MAX_ROUNDS)) {
    return null
  }
  if ((flow.rounds ?? null) === rounds) return state

  if (rounds === null) {
    const phases: Record<string, XpFlow['phases'][string]> = {}
    for (const [id, phase] of Object.entries(flow.phases)) {
      const kept = (phase.next ?? []).filter((step) => step.go !== ROUND_AGAIN)
      phases[id] =
        phase.next === undefined
          ? phase
          : kept.length === 0
            ? omit(phase, 'next')
            : { ...phase, next: kept }
    }
    return commit(
      state,
      writeFlow(state.document, where, { ...omit(flow, 'rounds'), phases }),
      flowMark(where, 'rounds'),
    )
  }

  return commit(state, writeFlow(state.document, where, { ...flow, rounds }), flowMark(where, 'rounds'))
}

/**
 * An arrow, from one phase to another.
 *
 * The reason comes with it, because a step without one is refused by
 * `flowProblems` - so a graph that let you draw the line first and say why
 * afterwards would spend that whole time holding a document that cannot save.
 * Dragging picks the two ends; the reason is the small form that lands with it.
 */
export function addStep(
  state: EditState,
  from: string,
  step: FlowStep,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  if (!flow || !Object.hasOwn(flow.phases, from)) return null
  /**
   * A destination is a phase, or one of the two words that are not - and the
   * seam needs a round count to be the seam *between*, which is the same pair
   * `flowProblems` insists on. Refusing here as well is what keeps the panel
   * from writing a document that will not save.
   */
  const reserved = RESERVED_GOES.includes(step.go)
  if (!reserved && !Object.hasOwn(flow.phases, step.go)) return null
  if (step.go === ROUND_AGAIN && flow.rounds === undefined) return null
  if (step.when === undefined && step.on === undefined && step.after === undefined) return null

  const held = flow.phases[from]
  const steps = [...(held.next ?? []), step]
  if (steps.length > MAX_STEPS) return null

  const next: XpFlow = { ...flow, phases: { ...flow.phases, [from]: { ...held, next: steps } } }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `step:${from}`))
}

/** An arrow, removed by its place in the phase's list. */
export function removeStep(
  state: EditState,
  from: string,
  at: number,
  where?: FlowTarget,
): EditState | null {
  const flow = flowAt(state.document, where)
  const held = flow?.phases[from]
  if (!flow || !held?.next || at < 0 || at >= held.next.length) return null

  const steps = held.next.filter((_, index) => index !== at)
  const phase = steps.length === 0 ? omit(held, 'next') : { ...held, next: steps }
  const next: XpFlow = { ...flow, phases: { ...flow.phases, [from]: phase } }
  return commit(state, writeFlow(state.document, where, next), flowMark(where, `step:${from}:${at}`))
}

/** A copy without one key, for a field whose absence means something. */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _gone, ...rest } = value
  return rest
}

/**
 * Rename a declared field.
 *
 * **It does not touch the rules that named it**, and that is deliberate rather
 * than unfinished: the parser reports every rule reaching for a field nobody
 * declared, with an address, the next time the document is read. A rename that
 * also rewrote blueprints would be a second implementation of that walk,
 * silently editing somebody's rules as a side effect of a text field.
 *
 * The document is left alone when the new name is taken or the old one is not
 * there - see `renameField`, which is where that argument lives.
 */
export function renameDataField(state: EditState, from: string, to: string): EditState | null {
  if (!DATA_NAME.test(to)) return null

  const data = dataOf(state.document)
  const next = renameField(data, from, to)
  if (next === data) return null

  return commit(state, { ...state.document, data: next }, `data:${to}`)
}

/**
 * Undeclare a field.
 *
 * The block goes when the last field does, rather than staying as `{}`: the
 * editor writes a parsed document straight back out, and an empty block is a
 * field that appears in every file somebody opens and saves. `readData` already
 * refuses to materialise one, so leaving it here would be the editor and the
 * parser disagreeing about what a document with no data looks like.
 */
export function removeDataField(state: EditState, name: string): EditState | null {
  const data = dataOf(state.document)
  if (!Object.hasOwn(data, name)) return null

  const next = withoutField(data, name)
  const document = { ...state.document }
  if (Object.keys(next).length === 0) delete document.data
  else document.data = next

  return commit(state, document, `data:${name}`)
}

/**
 * What a new script starts as.
 *
 * Not empty. An empty file gives a person nowhere to begin and no clue which
 * names are in scope, and the three hooks are exactly the thing that is
 * impossible to guess. It compiles and does nothing, which is what a script
 * nobody has written yet should do.
 */
export const NEW_SCRIPT = `// self, world, log and getEntityByName are in scope.
// Nothing else is: no fetch, no Date, no Math.random.

function onSpawn() {
  // Once, when this thing comes into being.
}

function onTick(dt) {
  // Every frame. dt is seconds.
}

function onTrigger(event, other) {
  // 'enter', 'exit' or 'damaged'.
}
`

/**
 * Put a clip the animator made into the level, or take one out.
 *
 * ---------------------------------------------------------------------------
 * A whole-block write, unlike every other table here
 * ---------------------------------------------------------------------------
 * `addScript`, `addBlueprint` and `addMotion` all take one thing and add it,
 * because that is how somebody edits one: they are looking at a panel with one
 * script in it. Clips arrive differently. The animator holds a **library** - a
 * walk, an idle, a wave, a death, authored together against one rig - and "save
 * these to the level" is one press about all of them.
 *
 * So this replaces the block. A clip the animator no longer has is a clip
 * somebody deleted in the animator, and leaving it behind would make the level's
 * list drift away from the tool's with no way to reconcile the two.
 *
 * ---------------------------------------------------------------------------
 * What it refuses
 * ---------------------------------------------------------------------------
 * Only what would make the document unopenable: too many, a track out of step
 * with its own times, an empty name. Everything else - a clip nothing names, two
 * clips that look alike, a rig no body in this level wears - is allowed,
 * because a library is authored *before* the bodies that use it and an editor
 * that refused work in progress would be an editor you cannot work in.
 */
export function setClips(
  state: EditState,
  clips: Readonly<Record<string, XpClip>>,
): EditState | null {
  const names = Object.keys(clips)
  if (names.length > MAX_XP_CLIPS) return null
  for (const name of names) {
    if (name.length === 0 || name.length > MAX_CLIP_NAME) return null
    const clip = clips[name]!
    if (clip.times.length === 0 || clip.times.length > MAX_CLIP_SAMPLES) return null
    /**
     * At least one track, and this is the case that actually happens.
     *
     * `bake` drops bones that never move, which is right - a clip that only
     * waves has no business carrying twenty legs' worth of identical
     * quaternions. A clip nobody has *posed* therefore bakes to zero tracks, and
     * writing one would put a document in the editor that `readClip` refuses:
     * the panel would hold a level it could not save, which is the one thing
     * this editor promises not to do. Found by pressing the button on a fresh
     * clip.
     */
    const tracks = Object.keys(clip.bones).length
    if (tracks === 0 || tracks > MAX_CLIP_TRACKS) return null
    if (!clipIsSquare(clip)) return null
  }

  const next = { ...state.document }
  // Absence rather than an empty block, the same rule `motions` and `draw` have:
  // `parseXp` drops an empty one on the way in, so writing one would leave the
  // editor holding a document a save-and-reopen does not produce.
  if (names.length === 0) delete next.clips
  else next.clips = clips

  return commit(state, next)
}

/** Start a new script. Refuses a name already taken or one the parser would not have. */
export function addScript(state: EditState, name: string, source = NEW_SCRIPT): EditState | null {
  if (!isScriptName(name)) return null
  const scripts = scriptsOf(state.document)
  if (name in scripts) return null

  return commit(state, { ...state.document, scripts: { ...scripts, [name]: source } })
}

/**
 * Remove a script, and detach whatever was running it.
 *
 * Detaching is not tidiness - a blueprint pointing at a script that does not
 * exist is a document the parser refuses, so leaving the reference would make
 * deleting a script produce a level that cannot be opened.
 */
export function removeScript(state: EditState, name: string): EditState | null {
  const scripts = scriptsOf(state.document)
  if (!(name in scripts)) return null

  const remaining = { ...scripts }
  delete remaining[name]

  const blueprints: Record<string, Blueprint> = {}
  for (const [id, blueprint] of Object.entries(state.document.blueprints)) {
    if (blueprint.script !== name) {
      blueprints[id] = blueprint
      continue
    }
    // Rebuilt without `script` rather than set to undefined: an explicit
    // `script: undefined` survives `JSON.stringify` as a missing key but not as
    // an absent one, and the difference shows up the moment a document is
    // compared against another.
    const rest = { ...blueprint }
    delete rest.script
    blueprints[id] = rest
  }

  return commit(state, {
    ...state.document,
    blueprints,
    ...(Object.keys(remaining).length > 0 ? { scripts: remaining } : { scripts: undefined }),
  })
}

/** Rename one, carrying every blueprint that used it across. */
export function renameScript(state: EditState, from: string, to: string): EditState | null {
  if (from === to) return state
  if (!isScriptName(to)) return null
  const scripts = scriptsOf(state.document)
  if (!(from in scripts) || to in scripts) return null

  const renamed: Record<string, string> = {}
  // Rebuilt in order rather than deleted and re-added, so a rename does not
  // shuffle the list under the person who did it.
  for (const [name, source] of Object.entries(scripts)) {
    renamed[name === from ? to : name] = source
  }

  const blueprints: Record<string, Blueprint> = {}
  for (const [id, blueprint] of Object.entries(state.document.blueprints)) {
    blueprints[id] = blueprint.script === from ? { ...blueprint, script: to } : blueprint
  }

  return commit(state, { ...state.document, blueprints, scripts: renamed })
}

/** Attach a script to a blueprint, or `null` to take it off. */
export function setBlueprintScript(
  state: EditState,
  blueprint: string,
  name: string | null,
): EditState | null {
  const existing = state.document.blueprints[blueprint]
  if (!existing) return null
  if (name !== null && !(name in scriptsOf(state.document))) return null
  if ((existing.script ?? null) === name) return state

  const next = { ...existing }
  if (name === null) delete next.script
  else next.script = name

  return commit(state, {
    ...state.document,
    blueprints: { ...state.document.blueprints, [blueprint]: next },
  })
}

/**
 * Where the world is watched from.
 *
 * A patch, like `setRules`, and with one rule of its own that the rules block
 * does not need: **a field belonging to another kind is dropped when the kind
 * changes.** `cameraProblems` refuses a `span` on a `follow` camera, so
 * carrying the whole block across a kind change would write something the
 * parser then rejects - which in this editor means a save that silently does
 * nothing. It is the same move `setTrigger` makes when a rule stops being a
 * press and its key stops meaning anything.
 *
 * `null` on a number removes it, as everywhere else here. Absent means "leave
 * it alone", and the two are not the same: a cleared field has to reach here as
 * `null` or clearing would be impossible.
 *
 * Refused when the result does not hold. The panel should not *offer* the
 * broken combination either - `cameraFieldsFor` is exported so it can show only
 * the fields the chosen kind has - but this is what makes it true rather than
 * merely tidy.
 */
export function setCamera(
  state: EditState,
  patch: {
    kind?: CameraKind
    axis?: CameraAxis
    distance?: number | null
    span?: number | null
    x?: number | null
    y?: number | null
    z?: number | null
    yaw?: number | null
    pitch?: number | null
    behind?: number | null
    above?: number | null
    beside?: number | null
    fov?: number | null
    far?: number | null
    at?: { x: number; y: number; z: number } | null
  },
): EditState | null {
  const current = cameraOf(state.document)
  const kind = patch.kind ?? current.kind
  if (!isCameraKind(kind)) return null

  const next: XpCamera = { kind }

  /*
   * Carried only where it still means something. A `distance` left over from a
   * side camera is the field an author changed their mind about half way, and
   * keeping it is how it comes back the next time they switch kinds.
   */
  const allowed = cameraFieldsFor(kind)

  if (allowed.includes('axis')) {
    const axis = patch.axis ?? current.axis
    if (axis !== undefined) next.axis = axis
  }

  for (const field of [
    'distance',
    'span',
    'x',
    'y',
    'z',
    'yaw',
    'pitch',
    'behind',
    'above',
    'beside',
    'fov',
    'far',
  ] as const) {
    if (!allowed.includes(field)) continue
    const asked = patch[field]
    const value = asked === undefined ? current[field] : asked
    if (value === null || value === undefined) continue
    if (!Number.isFinite(value)) return null
    next[field] = value
  }

  /**
   * The two that are not numbers, carried the same way the numbers are.
   *
   * **Neither was carried at all, and that quietly ate a table.** `seats` is on
   * `cameraFieldsFor('fixed')` and on the sweep `isDefaultCamera` uses, so
   * everything downstream believed it was handled - but this function rebuilt
   * the block out of `{ kind }` plus a list of numeric fields, so opening the
   * camera panel on `mensch` and nudging the lens by one degree wrote a fixed
   * camera with **no chairs**, and four people sat in one seat. A refused edit
   * looks like nothing happening; an edit that silently drops a field you cannot
   * see in the panel looks like nothing happening too, right up until somebody
   * plays it.
   *
   * A patch may clear either with `null`, like a number, and neither is
   * validated here: the parser's shape check is the one that matters and
   * `cameraProblems` below refuses the pair `at` and `yaw` make.
   */
  if (allowed.includes('at')) {
    const at = patch.at === undefined ? current.at : patch.at
    if (at) next.at = at
  }

  if (allowed.includes('seats')) {
    // No patch field of its own: a seat is added on the Sides panel, and this
    // one only has to stop throwing them away.
    if (current.seats) next.seats = current.seats
  }

  if (cameraProblems(next).length > 0) return null

  /*
   * Going back to `follow` with nothing on it takes the block away rather than
   * writing it, exactly as `setRules` does and for the same round-trip reason:
   * the editor stringifies the parsed document to save, so a materialised
   * `{ kind: 'follow' }` would grow a block into every file anybody merely
   * opened the panel in.
   */
  const document = { ...state.document }
  if (isDefaultCamera(next)) delete document.camera
  else document.camera = next

  /*
   * Nothing changed is not a change, which matters here more than it does for
   * the rules block: this is a picker, and clicking the kind you are already on
   * would otherwise push an undo step that undoes nothing visible. The same
   * comparison `setTrigger` makes, and for the same reason.
   */
  if (JSON.stringify(document.camera) === JSON.stringify(state.document.camera)) return null

  return commit(state, document)
}

/**
 * Whether the people in this level may say anything.
 *
 * A patch of two switches, and the only interesting thing about it is what it
 * does with `true`: turning something back on **removes the field** rather than
 * writing it, because absent already means on (./talk) and a document carrying
 * `{"chat": true}` says nothing its absence does not. Without that, an author
 * who turned chat off and changed their mind would leave a block behind in the
 * file forever - the same round-trip rule `setCamera` follows above.
 *
 * So the block only ever exists while something is actually off, and it
 * disappears the moment nothing is.
 */
export function setTalk(
  state: EditState,
  patch: { chat?: boolean; emotes?: boolean },
): EditState | null {
  const next: XpTalk = {}
  for (const field of ['chat', 'emotes'] as const) {
    const value = patch[field] ?? state.document.talk?.[field]
    // Only `false` is worth writing. See above - `true` is what absence means.
    if (value === false) next[field] = false
  }

  const document = { ...state.document }
  if (isDefaultTalk(next)) delete document.talk
  else document.talk = next

  // Clicking the switch you are already on is not a change, and an undo step
  // that undoes nothing visible is worse than no undo step. Same as `setCamera`.
  if (JSON.stringify(document.talk) === JSON.stringify(state.document.talk)) return null

  return commit(state, document)
}

/**
 * What mode this XP is, and what ends it.
 *
 * A patch rather than a whole block, so a panel can change the clock without
 * knowing what the preset is - and `null` on a number *removes* it, which is
 * the one thing this function has to get right. Absent is not zero: a course
 * with no `timeLimit` is over when somebody finishes it, and a zero limit is
 * refused by the parser precisely so that absent is the only way to say "no
 * limit". A field cleared in a form has to reach here as `null` and leave as
 * nothing at all, or clearing it would write a document that cannot be opened.
 *
 * Refused when the preset needs a capability the document does not declare -
 * `football` without two goals, `parkour` without a start and a finish. The
 * parser refuses the same pair, so accepting it here would be an editor that
 * saves a file it cannot reopen. A panel should not *offer* the preset in that
 * state either; `presetNeeds` is exported so it can say why instead.
 */
export function setRules(
  state: EditState,
  patch: {
    preset?: Preset
    /**
     * What the level *is*, on the same null-means-remove terms as the rest.
     *
     * `space` is what absent means, so writing it clears the field rather than
     * storing it - the same rule `assign` follows below and for the same reason:
     * a block that differs from the default only by saying what the default is
     * is a block `isDefaultRules` then keeps, and a document nobody configured
     * grows a `rules` it never asked for.
     */
    mode?: Mode | null
    sides?: Sides | null
    scoreLimit?: number | null
    timeLimit?: number | null
    /**
     * How long a body lies where it fell, on the same null-means-remove terms.
     *
     * The third of the three numbers `readRules` has always carried and the one
     * that never had a way in: absent means straight back up, which is what
     * every level written before there was a control for it says.
     */
    respawn?: number | null
    assign?: Assign | null
    /**
     * How many the level is for, on the same null-means-remove terms.
     *
     * Two numbers rather than one field, because they are removed
     * independently: a board game for exactly four says both, a co-op that
     * needs two but seats a room says only `min`, and a level that never cared
     * says neither.
     */
    playersMin?: number | null
    playersMax?: number | null
  },
): EditState | null {
  const current = rulesOf(state.document)

  const preset = patch.preset ?? current.preset
  if (!isPreset(preset)) return null

  /**
   * Everything this function does not touch, carried rather than rebuilt.
   *
   * It was `{ preset }`, and that was a field-dropping bug of exactly the kind
   * `isDefaultRules`' own warning is about, one layer along: `respawn`,
   * `players` and `roles` have no control in any panel, so every one of them
   * was silently deleted the moment somebody changed the mode or typed in a
   * limit. A game created "on your own" - which is `rules.players` and nothing
   * else - stopped being for one player the first time its author opened the
   * mode picker.
   *
   * So the shape is now "start from what is there, overwrite what was asked
   * for". A field added to `XpRules` in future is carried by default, which is
   * the safe direction: the failure mode of forgetting one here is a setting
   * that survives, not a setting that vanishes.
   */
  const next: XpRules = { ...current, preset }
  // The four this function owns are cleared and written back below, so a `null`
  // in the patch removes rather than being overtaken by the value carried in.
  delete next.sides
  delete next.mode
  delete next.assign
  delete next.respawn
  delete next.scoreLimit
  delete next.timeLimit

  /**
   * What shape the fight is, on the same null-means-remove terms as `assign`.
   *
   * Absent is *derived* rather than fixed (see `sidesOf`), so there is no value
   * to compare against and clear the way `spread` is cleared below - the only
   * way to go back to "whatever the marks say" is to pass `null`, and a picker
   * that offers three shapes has to offer that fourth answer explicitly.
   */
  const sides = patch.sides === undefined ? current.sides : patch.sides
  if (sides !== null && sides !== undefined) {
    if (!isSides(sides)) return null
    next.sides = sides
  }

  /**
   * How sides are handed out, on the same null-means-remove terms as the
   * limits.
   *
   * `spread` is the default and absent means it, so setting it back to `spread`
   * clears the field rather than writing it - otherwise `isDefaultRules` would
   * see a block that differs from the default only by saying what the default
   * is, keep it, and a document nobody configured would grow a rules block.
   */
  /** What the level is, on `assign`'s terms exactly - see the patch field. */
  const mode = patch.mode === undefined ? current.mode : patch.mode
  if (mode !== null && mode !== undefined) {
    if (!isMode(mode)) return null
    if (mode !== DEFAULT_MODE) next.mode = mode
  }

  const assign = patch.assign === undefined ? current.assign : patch.assign
  if (assign !== null && assign !== undefined) {
    if (!isAssign(assign)) return null
    if (assign !== DEFAULT_ASSIGN) next.assign = assign
  }

  /**
   * How many people the level is for, which is a fact about the *level*.
   *
   * Not a setting on the room it is played in - a board game for four is for
   * four wherever it is opened - so it belongs in the document, and until now it
   * had no control in any panel at all. `setRules` carried it rather than
   * dropping it, which kept a hand-written one alive; this is what lets somebody
   * write one without a text editor.
   *
   * The pair is refused rather than clamped when it crosses, because the two
   * readings of "at least four, at most two" are both wrong and picking one
   * quietly is how an author ends up with a number they did not type.
   */
  delete next.players
  const seats = {
    min: patch.playersMin === undefined ? current.players?.min : (patch.playersMin ?? undefined),
    max: patch.playersMax === undefined ? current.players?.max : (patch.playersMax ?? undefined),
  }
  for (const value of [seats.min, seats.max]) {
    if (value === undefined) continue
    if (!Number.isInteger(value) || value < 1 || value > MAX_DECLARED_PLAYERS) return null
  }
  if (seats.min !== undefined && seats.max !== undefined && seats.min > seats.max) return null
  if (seats.min !== undefined || seats.max !== undefined) {
    next.players = {
      ...(seats.min === undefined ? {} : { min: seats.min }),
      ...(seats.max === undefined ? {} : { max: seats.max }),
    }
  }

  const limit = (key: 'scoreLimit' | 'timeLimit' | 'respawn') => {
    const asked = patch[key]
    // Undefined in the patch means "leave it alone"; null means "take it away".
    const value = asked === undefined ? current[key] : asked
    if (value === null || value === undefined) return
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(key)
    next[key] = value
  }

  try {
    limit('scoreLimit')
    limit('timeLimit')
    limit('respawn')
  } catch {
    return null
  }

  const needed = presetNeeds(preset)
  if (needed && !state.document.capabilities.includes(needed)) return null

  /**
   * And every other refusal the parser makes about this block, asked here.
   *
   * The capability check above predates `rulesProblems` taking the marks and is
   * left where it is because it is the one a panel greys a button out for. This
   * catches the rest - a `team` claim in a world with no team spawns, a
   * `one-vs-all` told to split the room - and it is the same rule as that one:
   * the editor writes through the parser on every keystroke, so a block accepted
   * here and refused there is a save that silently does nothing.
   */
  if (rulesProblems(next, state.document.capabilities, state.document.world.marks).length > 0) {
    return null
  }

  /**
   * Setting it back to freestyle takes the block away rather than writing it.
   *
   * The default is *absence*, the same way `scripts` and `parts` are, and the
   * reason is a round trip: the editor stringifies the parsed document to save,
   * so a materialised `{ preset: 'freestyle' }` would grow a block into every
   * file anybody merely opened the dropdown in. Picking the same thing back has
   * to leave the document it started with, byte for byte.
   *
   * A freestyle *with* a limit is kept, because it is not the default and
   * somebody meant it - reading it back is how they find out the mode ignores
   * it.
   */
  const document = { ...state.document }
  if (isDefaultRules(next)) delete document.rules
  else document.rules = next

  return commit(state, document)
}

// ---------------------------------------------------------------------------
// Blueprints - the kinds of thing a level contains
// ---------------------------------------------------------------------------

/**
 * What a *new* blueprint may be called - stricter than what the parser accepts.
 *
 * `parseXp` takes any string as a key, because `blueprints` is a JSON object and
 * a hand-written document may have been written before this rule existed. So
 * this is an editor rule, and the direction matters: an editor stricter than its
 * parser is safe, and one looser than its parser can save a file it cannot open.
 *
 * The alphabet is the one entity names and script names already use. A blueprint
 * name is typed into a `spawn` verb and read back out of an error message, and
 * the names that make either awkward are exactly the ones with spaces and quotes
 * in them.
 */
export const isBlueprintName = (name: string) => /^[a-z0-9][a-z0-9_-]*$/i.test(name)

/**
 * Everything that would break if this blueprint went away, in words.
 *
 * `usedBy` for scripts answers the same question and returns names, because a
 * script is only ever used one way. A blueprint is used four ways - an entity is
 * one, the player's body is one, the player's weapon is one, and a `spawn` verb
 * in some *other* blueprint's triggers is the one nobody thinks of - so this
 * returns sentences rather than names. They are for a person deciding whether to
 * delete something, and "3 entities" is the answer to a different question than
 * "the player is one".
 */
export function blueprintUsers(document: XpDocument, name: string): string[] {
  const users: string[] = []

  // Every place, not the root alone: a blueprint used only in the cellar read as
  // unused, and deleting it would have emptied the cellar with nothing said.
  const entities = placesOf(document).flatMap((place) =>
    place.entities.filter((entity) => entity.blueprint === name),
  )
  if (entities.length > 0) {
    // Named where they have names, because "one entity" sends somebody hunting
    // and "the entity called door" does not.
    const named = entities.map((entity) => entity.name).filter((n): n is string => !!n)
    users.push(
      named.length > 0
        ? `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}, including ${named.slice(0, 3).join(', ')}`
        : `${entities.length} unnamed ${entities.length === 1 ? 'entity' : 'entities'}`,
    )
  }

  if (document.player.blueprint === name) users.push('the player arrives as it')
  if (document.player.weapon?.blueprint === name) users.push('the player arrives holding it')

  for (const [id, blueprint] of Object.entries(document.blueprints)) {
    for (const trigger of blueprint.triggers) {
      if (trigger.do.some((verb) => verb.op === 'spawn' && verb.blueprint === name)) {
        users.push(`${id} spawns it`)
        break
      }
    }
  }

  return users
}

/**
 * What a blueprint starts as.
 *
 * A floor tile, `auto` collision, and nothing else. The model has to be
 * *something* the catalogue knows or the document does not parse, and a floor is
 * the least surprising something: it is visible from every angle, it is the one
 * piece whose shape says nothing about what you meant, and it does not fall over.
 *
 * No tags and no props on purpose. Both are free-form vocabulary the level
 * invents, and a blueprint that arrived carrying a `health` nobody asked for is
 * a blueprint somebody has to notice and delete.
 */
export const NEW_BLUEPRINT: Blueprint = {
  model: DEFAULT_MODEL,
  collider: 'auto',
  tags: [],
  props: {},
  sockets: {},
  triggers: [],
}

/**
 * Start a new kind of thing.
 *
 * When the model is one the catalogue already knows something about - a spike, a
 * sawblade, a coin - that knowledge is **copied in**: collider, tags, props and
 * triggers, written out as a plain blueprint with nothing recording where they
 * came from. See ./presets for why copied rather than referenced; the short
 * version is that an XP is one file, and a level whose behaviour lives in a
 * table it does not carry is a level that arrives half missing.
 *
 * Anything passed explicitly wins over the preset, so a caller that knows what
 * it wants is never argued with. Refuses a name already taken, or one the editor
 * would not have.
 */
export function addBlueprint(
  state: EditState,
  name: string,
  blueprint: Partial<Blueprint> = {},
): EditState | null {
  if (!isBlueprintName(name)) return null
  if (name in state.document.blueprints) return null
  if (blueprint.model !== undefined && !isKnownModel(blueprint.model)) return null
  if (blueprint.script !== undefined && !(blueprint.script in scriptsOf(state.document))) {
    return null
  }

  const model = blueprint.model ?? NEW_BLUEPRINT.model
  const preset = presetFor(model) ?? {}

  return commit(state, {
    ...state.document,
    blueprints: {
      ...state.document.blueprints,
      [name]: { ...NEW_BLUEPRINT, ...preset, ...blueprint },
    },
  })
}

/**
 * Start a new kind of thing, and arrive as it.
 *
 * `addBlueprint` and `setPlayerRole` in one step, for the one case where doing
 * them separately is a trap rather than a choice: a blueprint made to be the
 * player's body is not a body until something says so, and a document with a
 * blueprint called `player` that the player is not is exactly the state somebody
 * lands in when they make one and stop.
 *
 * ---------------------------------------------------------------------------
 * One press is one undo
 * ---------------------------------------------------------------------------
 * Both halves go through their own function, so every rule either of them has -
 * a name the editor would refuse, a blueprint that does not exist, a socket a
 * body does not have - is applied here without being restated. What is *not*
 * reused is their place on the undo stack: the final `commit` is from the state
 * this was called in, so the two writes are one entry. Somebody who pressed a
 * button once presses undo once.
 */
export function addBody(
  state: EditState,
  name: string,
  blueprint: Partial<Blueprint> = {},
): EditState | null {
  const added = addBlueprint(state, name, blueprint)
  if (!added) return null
  const worn = setPlayerRole(added, { blueprint: name })
  if (!worn) return null
  return commit(state, worn.document)
}

/**
 * Turn a piece of scenery into a kind of thing.
 *
 * ---------------------------------------------------------------------------
 * Why this is one action and not two
 * ---------------------------------------------------------------------------
 * A placement is a model at a spot and nothing else - it cannot be damaged,
 * carried, triggered or scored. The moment an author wants any of that they
 * need a *blueprint* with an *entity* of it, and the route there was: add a
 * blueprint, open the model picker, find the model they were already looking
 * at, place an entity, then delete the placement they started from. Five steps
 * to say "this crate should be breakable", and the fifth is the one people
 * forget - which leaves a crate inside a crate, one of them scenery, and a
 * level where half the boxes react and half do not for no visible reason.
 *
 * **So the placement is consumed rather than left behind.** That is the
 * decision worth defending: a button that only *added* the blueprint would put
 * an entity inside the scenery it was made from, and two things in one cell
 * that look identical and behave differently is a worse state than either.
 *
 * The spot, the turn and the size come across, because they are what the author
 * already chose by dragging the thing there. The *behaviour* comes from the
 * preset table exactly as it does for a blueprint made by hand - `addBlueprint`
 * asks `presetFor`, so turning a spike tile into an entity gets the spike rules
 * with it rather than a hazard that does nothing.
 *
 * ---------------------------------------------------------------------------
 * The name
 * ---------------------------------------------------------------------------
 * Derived from the model rather than asked for, and uniquified rather than
 * refused. A dialog here would be a dialog in front of the one gesture this
 * exists to shorten, and "the name is taken" is not a thing to tell somebody
 * who has not chosen a name. `crate`, then `crate-2`. An author renames it in
 * the panel that is about to open on it.
 */
export function blueprintFrom(
  state: EditState,
  index: number,
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  const placement = placeIn(state.document, where)?.world.placements[index]
  if (!placement) return null

  const name = freeBlueprintName(state.document.blueprints, placement.model)
  if (name === null) return null

  /**
   * A piece somebody made walk-through stays walk-through.
   *
   * The only one of the two collider states that carries across, because it is
   * the only one both formats can say. A drawn list of boxes cannot become an
   * entity's single centred box without picking one of them and being wrong
   * about the rest, so it is dropped and the entity gets the measured box -
   * which is the same thing that happens to a placement's `bounce`, and visible
   * the moment you press Try rather than a week later.
   */
  const made = addBlueprint(state, name, {
    model: placement.model,
    ...(placement.collider === 'none' ? { collider: 'none' as const } : {}),
  })
  if (!made) return null

  /*
   * The entity first, the placement out second, and both on `made` rather than
   * on `state`: three commits would be three undo steps for one gesture, and an
   * author who pressed this once and pressed undo once would be left with a
   * blueprint and no scenery.
   */
  const placed = addEntity(
    made,
    {
      blueprint: name,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      rotation: placement.rotation,
      scale: placement.scale,
    },
    where,
  )
  if (!placed) return null

  const cleared = removePlacement(placed, index, where)
  if (!cleared) return null

  /*
   * One step on the undo stack, not three.
   *
   * The three helpers above each commit, which is right when they are called on
   * their own and wrong here: this is one gesture, and an author who pressed it
   * once and pressed undo once would be left holding a blueprint with no
   * scenery. So the finished document is committed against the state this
   * started from - the same move a marked run of keystrokes makes, without
   * needing a mark for a thing that happens once.
   */
  return { state: commit(state, cleared.document), name }
}

/**
 * A name nothing else is using, from a model id.
 *
 * `platformer-blue/spikeblock_up_blue` is `spikeblock_up_blue` - the bare name,
 * because the pack is how the *art* is addressed and a blueprint is a thing in
 * this level. Null when a hundred are taken, which is not a case anybody will
 * meet and is still not a case to loop forever in.
 */
function freeBlueprintName(
  blueprints: Readonly<Record<string, Blueprint>>,
  model: string,
): string | null {
  const bare = splitModel(model)?.name ?? model
  return freeNameFrom(blueprints, bare)
}

/**
 * The same numbering, from a root that is not a model.
 *
 * Split out for `addDoor`, whose root is a *room* - `to-cellar` rather than
 * `Primitive_Floor`. Every door in a level is made of the same tile, so naming
 * them after the model would make the second one `Primitive_Floor-2` and the
 * fourth `Primitive_Floor-4`, which is a list nobody can read back. What tells
 * two doors apart is where they go.
 */
function freeNameFrom(
  blueprints: Readonly<Record<string, Blueprint>>,
  bare: string,
): string | null {
  // The alphabet `isBlueprintName` accepts, so a model with a dot or a space in
  // it produces a name the document will take rather than one it refuses.
  const root = bare.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'thing'

  if (!(root in blueprints) && isBlueprintName(root)) return root
  for (let n = 2; n < 100; n++) {
    const tried = `${root}-${n}`
    if (!(tried in blueprints) && isBlueprintName(tried)) return tried
  }
  return null
}

/**
 * Change what a kind of thing is.
 *
 * `script` is deliberately not settable here - `setBlueprintScript` owns it,
 * because attaching a script is the one field with a referent that has to exist
 * and a patch that silently accepted a missing one would produce a document the
 * parser refuses.
 */
export function setBlueprint(
  state: EditState,
  name: string,
  /**
   * `body: null` **removes** it, which is the one field here that needs saying.
   *
   * Absent means "leave it alone" for every key in a patch, and for `collider`
   * or `tags` that is the whole story because there is no state in between. A
   * body has one: `{}` is a meaningful value - it says *this falls*, with every
   * default - so "no body" cannot be spelled as an empty object the way "no
   * motions" can. The same `null` convention `setCamera` uses for its numbers.
   */
  patch: Partial<Omit<Blueprint, 'script' | 'triggers' | 'body'>> & { body?: BodySpec | null },
): EditState | null {
  const existing = state.document.blueprints[name]
  if (!existing) return null
  if (patch.model !== undefined && !isKnownModel(patch.model)) return null

  /**
   * The body is taken out of the patch here, once, because its `null` is not a
   * value a `Blueprint` may hold - so every spread of `patch` below would
   * otherwise have to be told about it.
   */
  const { body, ...rest } = patch

  /**
   * Refused rather than clamped, the way a hand-typed collider box is.
   *
   * The panel offers spinners bounded by the same table (`BODY_LIMITS`), so a
   * number out of range here has come from somewhere else - and a `bounce` of
   * 1.4 quietly saved as 1 would be the editor holding a document that differs
   * from the one it was told to hold.
   */
  if (body !== undefined && body !== null && bodyProblems(body).length > 0) return null

  /**
   * Picking a model the catalogue knows about brings its behaviour with it -
   * but only onto a blueprint nobody has touched yet.
   *
   * This is the moment the preset is actually *for*. A person adds a blueprint,
   * opens the picker and chooses `floor_spikes`: at that instant they mean
   * spikes, and a thing that looks like spikes and does nothing is the failure
   * the table exists to prevent. Doing it at creation only would never fire,
   * because a new blueprint starts as a floor tile and the model is chosen a
   * moment later.
   *
   * "Untouched" is the whole safety of it: still the default collider, no tags,
   * no properties, no triggers. Anyone who has edited any of those has said
   * something about this blueprint, and quietly replacing it because they
   * changed the model would throw away work - which is far worse than a preset
   * that did not fire.
   */
  if (patch.model !== undefined && patch.model !== existing.model) {
    const pristine =
      existing.collider === NEW_BLUEPRINT.collider &&
      existing.tags.length === 0 &&
      Object.keys(existing.props).length === 0 &&
      existing.triggers.length === 0
    const preset = pristine ? presetFor(patch.model) : null
    if (preset) {
      return commit(state, {
        ...state.document,
        blueprints: {
          ...state.document.blueprints,
          [name]: { ...existing, ...preset, ...rest, ...(body ? { body } : {}) },
        },
      })
    }
  }

  if (patch.collider !== undefined && typeof patch.collider === 'object') {
    // The parser wants three positive sides, so an editor that let a zero
    // through would be an editor that saves an unopenable file.
    const box = patch.collider
    if (![box.w, box.h, box.d].every((side) => Number.isFinite(side) && side > 0)) return null
  }

  const merged: Blueprint = { ...existing, ...rest }

  /**
   * And no body is the absence of the block, not a null in it.
   *
   * `null` is how the panel says "this is scenery again" - see the patch type -
   * and leaving the key behind would be the editor holding a document that
   * differs from the one a save-and-reopen produces, which is its one hard
   * property (docs/xp/manual.md §9). Same rule as `draw` and `motions` below.
   */
  if (body === null) delete merged.body
  else if (body !== undefined) merged.body = body

  /**
   * Being visible is the absence of a field, not a `true` in one.
   *
   * `readBlueprint` drops `draw: true` on the way in, so a panel that wrote one
   * would hold a document differing from the one a save-and-reopen produces -
   * and the editor's one hard property is that what it holds is what parses
   * (docs/xp/manual.md §9). Deleting it here means the *only* place that has to
   * know is this line, rather than every caller that toggles the switch.
   */
  if (merged.draw === true) delete merged.draw

  /**
   * And no motions is the absence of the block, not an empty one.
   *
   * `readMotions` hands back `undefined` for `{}`, so a panel that deleted the
   * last motion and left the key behind would be holding a document that
   * differs from the one a save-and-reopen produces - which is the editor's one
   * hard property (docs/xp/manual.md §9). Same line, same reason, as `draw` and
   * `pose` above.
   */
  if (merged.motions && Object.keys(merged.motions).length === 0) delete merged.motions

  /**
   * And no pose is the absence of a field too.
   *
   * A picker set back to "however it stands" hands an empty string, which the
   * parser refuses - so the panel would be saving a document it could not
   * reopen. Cleared here for the same reason `draw` is: the one place that has
   * to know is this one.
   */
  if (merged.pose !== undefined && merged.pose.length === 0) delete merged.pose

  /**
   * And the graph it points at, on the same rule and for a sharper reason.
   *
   * `pose` cleared to an empty string is merely refused by the parser. An
   * `animator` left behind after a body changes skeleton is *worse than
   * refused*: the graph is written for the rig the body used to be, so every
   * clip in it names something the new body does not have, and the parser now
   * says so - which would leave the editor holding a document it cannot save.
   *
   * The panel that switches a body between skeletons clears this by handing an
   * empty string, exactly as it clears the pose. Same line, same reason.
   */
  if (merged.animator !== undefined && merged.animator.length === 0) delete merged.animator

  return commit(state, {
    ...state.document,
    blueprints: { ...state.document.blueprints, [name]: merged },
  })
}

/**
 * Rename one, carrying everything that pointed at it across.
 *
 * All four referents from `blueprintUsers`, and the `spawn` verbs are the reason
 * this is not four lines: a verb inside *another* blueprint's triggers is the
 * reference nobody remembers, and leaving one behind produces a document that
 * parses today and refuses to load the moment somebody touches the trigger.
 */
export function renameBlueprint(state: EditState, from: string, to: string): EditState | null {
  if (from === to) return state
  if (!isBlueprintName(to)) return null
  const document = state.document
  if (!(from in document.blueprints) || to in document.blueprints) return null

  const blueprints: Record<string, Blueprint> = {}
  // Rebuilt in order rather than deleted and re-added, so a rename does not
  // shuffle the list under the person who did it - the same reason
  // `renameScript` does.
  for (const [id, blueprint] of Object.entries(document.blueprints)) {
    blueprints[id === from ? to : id] = {
      ...blueprint,
      triggers: blueprint.triggers.map((trigger) => ({
        ...trigger,
        do: trigger.do.map((verb) =>
          verb.op === 'spawn' && verb.blueprint === from ? { ...verb, blueprint: to } : verb,
        ),
      })),
    }
  }

  const player: PlayerRole = { ...document.player }
  if (player.blueprint === from) player.blueprint = to
  if (player.weapon?.blueprint === from) {
    player.weapon = { ...player.weapon, blueprint: to }
  }

  return commit(state, {
    ...document,
    blueprints,
    player,
    entities: document.entities.map((entity) =>
      entity.blueprint === from ? { ...entity, blueprint: to } : entity,
    ),
  })
}

/**
 * Take a kind of thing away - and refuse while anything still is one.
 *
 * The other choice was to cascade: delete the blueprint and every entity made
 * from it. That is what `removeScript` does one layer down, and it is right
 * there because detaching a script leaves the thing itself alone. Here the
 * equivalent is deleting somebody's level furniture as a side effect of tidying
 * a list, which is a destructive act disguised as a small one.
 *
 * So it refuses, and `blueprintUsers` is exported so the panel can say *what* is
 * in the way rather than making a button that does nothing.
 */
export function removeBlueprint(state: EditState, name: string): EditState | null {
  if (!(name in state.document.blueprints)) return null
  if (blueprintUsers(state.document, name).length > 0) return null

  const remaining = { ...state.document.blueprints }
  delete remaining[name]

  return commit(state, { ...state.document, blueprints: remaining })
}

/**
 * What a new part starts as.
 *
 * The same floor tile a new blueprint gets, at the origin, unturned. It arrives
 * *on top of* whatever is already there rather than beside it, which is
 * deliberate: a part dropped a metre to one side looks like a mistake somebody
 * has to undo, and a part at the origin looks like a part waiting to be moved.
 */
export const NEW_PART: Part = {
  model: DEFAULT_MODEL,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  scale: 1,
}

/** The parts of a blueprint, always a list. */
export const partsOf = (blueprint: Blueprint): readonly Part[] => blueprint.parts ?? []

/**
 * Would hanging `child` from `parent` close a loop?
 *
 * The check the parser also makes, needed here as well and not instead: the
 * parser is the boundary and this is the *editor*, which must refuse to build a
 * document the boundary would send back. A cycle is the worst of the mistakes a
 * part can carry because it resolves - the depth guard in `partTransforms`
 * stops it - so it produces a number rather than an error, and a number is
 * something you argue with rather than notice.
 */
function wouldLoop(parts: readonly Part[], childIndex: number, parent: string): boolean {
  const byName = new Map(parts.filter((part) => part.name).map((part) => [part.name!, part]))
  let link = byName.get(parent)
  let depth = 0
  while (link && depth++ < 32) {
    if (link === parts[childIndex]) return true
    link = link.parent ? byName.get(link.parent) : undefined
  }
  return false
}

/** Add a model to a blueprint. Refuses one the catalogue does not know. */
export function addPart(
  state: EditState,
  blueprint: string,
  part: Partial<Part> = {},
): EditState | null {
  const existing = state.document.blueprints[blueprint]
  if (!existing) return null
  if (part.model !== undefined && !isKnownModel(part.model)) return null

  const made: Part = { ...NEW_PART, ...part }
  return commit(state, {
    ...state.document,
    blueprints: {
      ...state.document.blueprints,
      [blueprint]: { ...existing, parts: [...partsOf(existing), made] },
    },
  })
}

/**
 * Change one part.
 *
 * Every refusal here is a document the parser would send back: a model we do
 * not ship, a name already taken by a sibling, a parent that does not resolve,
 * a loop, a scale of zero. An editor that accepted any of them would be an
 * editor that saves a file it cannot open, which is the property this whole
 * file exists to keep.
 */
export function setPart(
  state: EditState,
  blueprint: string,
  index: number,
  patch: Partial<Part>,
): EditState | null {
  const existing = state.document.blueprints[blueprint]
  const parts = existing ? partsOf(existing) : []
  const part = parts[index]
  if (!part) return null

  if (patch.model !== undefined && !isKnownModel(patch.model)) return null
  if (patch.scale !== undefined && (!Number.isFinite(patch.scale) || patch.scale <= 0)) return null
  for (const axis of ['x', 'y', 'z', 'rotation'] as const) {
    const value = patch[axis]
    if (value !== undefined && !Number.isFinite(value)) return null
  }

  if (patch.name !== undefined && patch.name !== null) {
    if (patch.name !== '' && !isBlueprintName(patch.name)) return null
    if (parts.some((other, i) => i !== index && other.name === patch.name)) return null
  }

  const next: Part = { ...part, ...patch }
  // An empty name is no name. A part called '' is a part every other part can
  // claim to hang from by leaving the field blank.
  if (next.name === '' || next.name === null) delete next.name
  if (next.parent === '' || next.parent === null) {
    delete next.parent
    delete next.socket
  }
  if (next.socket === '' || next.socket === null) delete next.socket

  if (next.parent !== undefined) {
    if (!parts.some((other, i) => i !== index && other.name === next.parent)) return null
    const settled = parts.map((other, i) => (i === index ? next : other))
    if (wouldLoop(settled, index, next.parent)) return null
  }

  const updated = parts.map((other, i) => (i === index ? next : other))
  return commit(state, {
    ...state.document,
    blueprints: {
      ...state.document.blueprints,
      [blueprint]: { ...existing!, parts: updated },
    },
  })
}

/**
 * Take a part away, and detach whatever hung from it.
 *
 * Detached rather than refused, which is the opposite of what `removeBlueprint`
 * does and is right for the opposite reason. Refusing to delete a blueprint
 * protects a level full of furniture somebody built; a part that loses its
 * parent falls back to the blueprint's own origin, where it is immediately
 * visible and one drag from where it should be. Nothing is lost, so nothing
 * needs protecting.
 *
 * The last part leaving takes the whole block with it, so a blueprint that is
 * one model again round-trips without an empty `parts: []` - the same rule
 * `removeScript` follows for `scripts`.
 */
export function removePart(state: EditState, blueprint: string, index: number): EditState | null {
  const existing = state.document.blueprints[blueprint]
  const parts = existing ? partsOf(existing) : []
  const going = parts[index]
  if (!going) return null

  const remaining = parts
    .filter((_, i) => i !== index)
    .map((part) => {
      if (!going.name || part.parent !== going.name) return part
      const orphan = { ...part }
      delete orphan.parent
      delete orphan.socket
      return orphan
    })

  const next = { ...existing! }
  if (remaining.length > 0) next.parts = remaining
  else delete next.parts

  return commit(state, {
    ...state.document,
    blueprints: { ...state.document.blueprints, [blueprint]: next },
  })
}

/**
 * The next free `crate_1`, `crate_2` for a kind of thing.
 *
 * Dragging a blueprint into the level makes an entity, and an entity with no
 * name is one no rule and no script can address - so the useful default is a
 * name rather than nothing. Numbered from the blueprint, because that is the
 * only word available that means anything to the person who dragged it.
 *
 * It counts *up from the highest taken* rather than filling gaps. Filling gaps
 * would mean deleting `crate_2` and adding one puts the new thing in the middle
 * of the list, answering to a name that used to mean something else - and any
 * rule that still mentioned `crate_2` would quietly start pointing at it.
 */
export function nextEntityName(
  document: XpDocument,
  blueprint: string,
  /**
   * Which place the name has to be free in, and the answer is *this* one.
   *
   * Scoped rather than document-wide, and that is the format's own rule rather
   * than a shortcut: **a name is resolved where you are standing**. Two rooms
   * may each hold a `door`, because you are only ever in one of them - see
   * `checkPlace` in ./format and docs/xp/scenes.md §1.2. Sweeping every room
   * here would make the second room's first door `door_2`, which is a name
   * numbered against something nobody in that room can see.
   */
  where: PlaceTarget = undefined,
): string {
  // Blueprint names share the entity alphabet, so a blueprint name is always a
  // usable stem - except for a hand-written document from before that rule, and
  // there the stem is scrubbed rather than refused.
  const stem = blueprint.replace(/[^a-z0-9_-]/gi, '') || 'thing'
  const taken = new Set((placeIn(document, where)?.entities ?? []).map((entity) => entity.name))

  let highest = 0
  const pattern = new RegExp(`^${stem}_(\\d+)$`, 'i')
  for (const name of taken) {
    const match = name ? pattern.exec(name) : null
    if (match) highest = Math.max(highest, Number(match[1]))
  }

  // The loop is not paranoia: `crate_1` may be taken by something that is not a
  // crate, because a name is unique across the whole document rather than per
  // blueprint.
  let next = highest + 1
  while (taken.has(`${stem}_${next}`)) next += 1
  return `${stem}_${next}`
}

// ---------------------------------------------------------------------------
// Placements, individually
// ---------------------------------------------------------------------------

/**
 * Move or turn one piece of architecture, by its index.
 *
 * By index and not by cell, which is the difference between this and `place`.
 * `place` is the brush - it answers "put this here, replacing whatever was" -
 * and a cell is exactly the right address for that. This is the inspector:
 * something is selected, the selection is a position in the list, and it has to
 * survive being moved somewhere something else already stands.
 *
 * Snapped to `PLACEMENT_STEP` rather than to whole cells. Placements came off
 * the lattice when the editor learned to place against surfaces, so a piece can
 * sit anywhere - but a gizmo drag arrives as 3.0000000000000004 and a document
 * full of those is a document nobody can diff. A tenth is fine enough to put a
 * crate against a wall and coarse enough that two pieces meant to line up
 * actually do.
 */
export function setPlacement(
  state: EditState,
  index: number,
  patch: Partial<Placement>,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const existing = place?.world.placements[index]
  if (!place || !existing) return null

  if (patch.model !== undefined && !isKnownModel(patch.model)) return null

  const next: Placement = {
    ...existing,
    ...patch,
    ...(patch.x !== undefined ? { x: snap(patch.x) } : {}),
    ...(patch.y !== undefined ? { y: snap(patch.y) } : {}),
    ...(patch.z !== undefined ? { z: snap(patch.z) } : {}),
  }

  // Spreading a patch that says `collider: undefined` leaves the key present
  // and empty, which every reader treats as absent and every `in` check does
  // not. Deleting it is how the inspector's "measured" setting puts a piece
  // back to the piece it was.
  if (next.collider === undefined) delete next.collider

  if (!settleShape(next)) return null
  if (!inWorld(next)) return null

  // Nothing changed, so nothing is recorded. A gizmo drag fires every frame and
  // most frames move nothing; without this the undo stack fills with steps that
  // undo to the same place.
  if (
    next.model === existing.model &&
    next.x === existing.x &&
    next.y === existing.y &&
    next.z === existing.z &&
    next.rotation === existing.rotation &&
    next.scale === existing.scale &&
    sameShape(next, existing) &&
    sameCollider(next, existing)
  ) {
    return state
  }

  const placements = [...place.world.placements]
  placements[index] = next
  return commit(state, writePlace(state.document, where, { world: { ...place.world, placements } }))
}

/**
 * Take one piece away, by its index.
 *
 * The sibling of `erase`, which works by cell and is what the brush wants. An
 * index is what a *selection* is, and the two are not interchangeable: two
 * pieces may share an anchor, and erasing by cell would take whichever came
 * first rather than the one somebody is looking at.
 */
export function removePlacement(
  state: EditState,
  index: number,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  if (!place?.world.placements[index]) return null
  const placements = place.world.placements.filter((_, i) => i !== index)
  return commit(state, writePlace(state.document, where, { world: { ...place.world, placements } }))
}

/** Inside the lattice the format allows. */
function inWorld(placement: Placement): boolean {
  return (
    placement.x >= -WORLD_RADIUS &&
    placement.x < WORLD_RADIUS &&
    placement.z >= -WORLD_RADIUS &&
    placement.z < WORLD_RADIUS &&
    placement.y >= 0 &&
    placement.y < WORLD_HEIGHT
  )
}

/**
 * Append one piece, without replacing what is already at that cell.
 *
 * The difference from `place` is the whole reason both exist. `place` is the
 * brush: it answers "put this here", and here already having something is
 * exactly the case it handles by replacing it. This is paste, and paste that
 * removed the thing you pasted next to would be a paste that loses work.
 *
 * The two pieces then share an anchor, which the format allows and which `at`
 * resolves to the first of them - fine, because nothing addresses a placement
 * by cell any more except the brush.
 */
export function addPlacement(
  state: EditState,
  placement: Placement,
  where?: PlaceTarget,
): EditState | null {
  if (!isKnownModel(placement.model)) return null
  const place = placeIn(state.document, where)
  if (!place) return null
  // Per place, because the cap is about what one room costs to draw. A document
  // with four rooms is four worlds and is meant to be.
  if (place.world.placements.length + 1 > MAX_PLACEMENTS) return null

  const piece: Placement = {
    ...placement,
    x: snap(placement.x),
    y: snap(placement.y),
    z: snap(placement.z),
  }
  if (!inWorld(piece)) return null

  return commit(
    state,
    writePlace(state.document, where, {
      world: { ...place.world, placements: [...place.world.placements, piece] },
    }),
  )
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
/**
 * Whichever of the three a caller named, on the grid.
 *
 * A tenth, not a whole cell, and that is a change rather than a detail. Marks
 * were rounded to integers from the day they existed and nothing ever argued
 * for it - a spawn is *a place to stand*, and standing on a half-height ledge
 * or a step is exactly the case an integer cannot say. It is the same argument
 * `ENTITY_STEP` already makes for "just left of the door", and the brush's
 * whole cells stay whole for the reason written there: painting a floor is a
 * different act.
 *
 * Absent fields stay absent so a patch that only turns a mark round does not
 * quietly move it, and `snap` rather than arithmetic here because 0.1 is not
 * 0.1 in binary and a mark is written into a file somebody diffs.
 */
function snapped(at: Partial<Pick<Mark, 'x' | 'y' | 'z'>>): Partial<Mark> {
  return {
    ...(at.x !== undefined ? { x: snap(at.x) } : {}),
    ...(at.y !== undefined ? { y: snap(at.y) } : {}),
    ...(at.z !== undefined ? { z: snap(at.z) } : {}),
  }
}

/**
 * A spawn's height, dropped onto whatever is underneath it.
 *
 * Reported as *"when I put the spawn point up the character gets lifted in y, so
 * he is always in the air"*, and the report is about the one number in this
 * format with no ground under it. Everything else placed in a level is a *thing*
 * and floats on purpose - a lamp hangs, a platform is meant to be up there. A
 * spawn is a place to **stand**, and a place to stand a metre above the floor is
 * not one.
 *
 * ---------------------------------------------------------------------------
 * Here rather than at arrival
 * ---------------------------------------------------------------------------
 * The other place this could live is `arrivalSpot` in the runtime, and it
 * deliberately does not: that function's own doc argues that a mark's `y` is
 * taken as-is because *second-guessing its height with a ground search would
 * move it off the platform the author meant*. That argument is still right, and
 * this does not contradict it - it makes the number in the document true at the
 * moment it is written, so the runtime can go on trusting it and the panel goes
 * on showing the height somebody will actually stand at. One correction, at the
 * one point a person is looking at the result.
 *
 * ---------------------------------------------------------------------------
 * Down only, and never onto nothing
 * ---------------------------------------------------------------------------
 * A drag up over a floor comes straight back down, which is what makes the y
 * handle on a spawn feel like it is attached to the world rather than to the
 * air. A drag up onto a *platform* stops on the platform, because that is the
 * first solid the drop meets. And a spawn over a hole keeps the height it was
 * given: `standingSurface` returns null when a world has nothing there and no
 * ground plane either, and a half-built level is not a thing to overrule.
 */
function grounded(world: XpWorld, at: { x: number; y: number; z: number }): number {
  const surface = standingSurface(
    solidsFor(world).isSolid,
    at.x,
    at.y,
    at.z,
    world.ground ? world.floorY : null,
  )
  return surface ?? at.y
}

/**
 * Add a fact about the level: a spawn, a goal, a start, a finish.
 *
 * Marks are the one part of a document the *product* reads rather than the
 * player - `capabilityProblems` decides from them whether this XP can be a
 * match or a football game - which is why a level can be perfect and still
 * refuse to load with a capability it cannot back up. So an editor that can
 * place walls and not marks is an editor that can build a pitch nobody can
 * schedule a game on.
 */
export function addMark(
  state: EditState,
  mark: Omit<Mark, 'facing' | 'width' | 'height'> & Partial<Mark>,
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  if (!place_) return null
  const made: Mark = {
    facing: 0,
    width: DEFAULT_MARK_WIDTH,
    height: DEFAULT_MARK_HEIGHT,
    ...mark,
    ...snapped(mark),
  }
  /**
   * A new spawn lands on the ground, not at the height the pointer was.
   *
   * The button puts a mark at the hovered cell, and the hovered cell is the
   * *working level* wherever the pointer is over open plane rather than over
   * geometry - so somebody building at level 3 got a spawn at 3 with nothing
   * under it. Right for a wall, which is what that cell was computed for, and
   * wrong for the one mark that is a pair of feet.
   */
  if (made.kind === 'spawn') made.y = grounded(place_.world, made)
  if (!markIsSane(made)) return null

  return commit(
    state,
    writePlace(state.document, where, {
      world: { ...place_.world, marks: [...place_.world.marks, made] },
    }),
  )
}

/** Move, turn, resize or re-team one, by its index. */
export function setMark(
  state: EditState,
  index: number,
  patch: Partial<Mark>,
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  const existing = place_?.world.marks[index]
  if (!place_ || !existing) return null

  const next: Mark = {
    ...existing,
    ...patch,
    ...snapped(patch),
  }
  // A team of '' is a team nobody is on, and the format's `team` is optional
  // rather than empty - so clearing the field removes it.
  if (patch.team !== undefined && patch.team === '') delete next.team
  /**
   * A moved spawn re-lands, and so does a mark that has just *become* one -
   * but a *lifted* one keeps the height it was given.
   *
   * The kind is in the condition rather than the position, because changing a
   * goal into a spawn is the same question asked a different way: the height
   * that was fine for a frame standing in the world is a height nobody can
   * stand at, and it would arrive floating with nothing having moved.
   *
   * The guard on a move is `setSpawn`'s, for `setSpawn`'s reasons: the gizmo
   * echoes all three axes on a sideways drag, so the only readable sign of
   * vertical intent is the number differing - and a mark that was standing in
   * the air was put there, the pads sending no y at all being why a height had
   * to survive a sideways move rather than only the edit that set it.
   */
  if (
    next.kind === 'spawn' &&
    (patch.kind !== undefined ||
      ((patch.x !== undefined || patch.y !== undefined || patch.z !== undefined) &&
        next.y === existing.y &&
        existing.y === grounded(place_.world, existing)))
  ) {
    next.y = grounded(place_.world, next)
  }
  if (!markIsSane(next)) return null

  if (JSON.stringify(next) === JSON.stringify(existing)) return state

  const marks = [...place_.world.marks]
  marks[index] = next
  return commit(state, writePlace(state.document, where, { world: { ...place_.world, marks } }))
}

/**
 * Take one away.
 *
 * This is the edit most likely to make a document stop parsing, and deliberately
 * not guarded against: removing one of two spawns from a level that claims
 * `match` leaves a claim the world no longer backs up. Refusing here would be
 * refusing to let somebody rearrange their level, so instead the *capability*
 * is the thing to change - and the parser will say so, by name, the moment the
 * document is read back.
 */
export function removeMark(
  state: EditState,
  index: number,
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  if (!place_?.world.marks[index]) return null
  const marks = place_.world.marks.filter((_, i) => i !== index)
  return commit(state, writePlace(state.document, where, { world: { ...place_.world, marks } }))
}

// ---------------------------------------------------------------------------
// The world itself
// ---------------------------------------------------------------------------

/**
 * The two facts about a world that are not a list of things in it.
 *
 * `ground` is the one worth a control: without it the runtime's answer to a
 * half-built level is a catch plane forty cells down, which is not standing
 * anywhere, it is falling more slowly. With it there is somewhere to stand while
 * you are still building - and it stays off by default, because an invisible
 * floor under the whole world hides the hole you left in the real one.
 */
export function setWorld(
  state: EditState,
  patch: {
    ground?: boolean
    floorY?: number
    restart?: boolean
    fatal?: boolean
    background?: string | null
  },
  where?: PlaceTarget,
): EditState | null {
  const place_ = placeIn(state.document, where)
  if (!place_) return null
  const world = place_.world
  const floorY = patch.floorY === undefined ? world.floorY : Math.round(patch.floorY)
  const ground = patch.ground === undefined ? world.ground : patch.ground
  const restart = patch.restart === undefined ? world.restart : patch.restart
  const fatal = patch.fatal === undefined ? world.fatal : patch.fatal

  if (!Number.isFinite(floorY)) return null

  /**
   * Ground wins, and turning it on turns the restart off.
   *
   * The parser refuses the pair - a solid plane everywhere means nothing ever
   * falls past the height that would send it back - so an editor that let both
   * be set would be an editor that saves a document it cannot reopen, which is
   * the one property this whole file exists to keep.
   *
   * Cleared rather than refused, because the gesture is unambiguous: somebody
   * who ticks "ground" has said they want somewhere to stand, and answering a
   * tick with nothing happening is worse than answering it with the thing they
   * asked for.
   */
  const settled = ground ? false : restart

  /**
   * And the same for a fall that kills, plus the rule the pair brings.
   *
   * `ground` clears it for the reason above - nothing falls past a solid plane -
   * and **the two fall answers clear each other, in whichever direction the
   * author just moved.** The parser refuses a document carrying both, because a
   * document has not said which it means; here there is no ambiguity, because a
   * tick is a thing somebody just did. Answering it by leaving the other one on
   * would be answering a click with a document the editor cannot reopen.
   *
   * Written out rather than folded into one expression: this is four booleans
   * deciding two, and the version of it that fitted on a line was wrong twice.
   */
  let falls = settled
  let dying = ground ? false : fatal

  if (!ground) {
    if (patch.fatal === true) falls = false
    else if (patch.restart === true) dying = false
  }

  /**
   * The sky, where absent means transparent.
   *
   * `null` removes it and `undefined` leaves it alone, the same convention the
   * rules block's limits use - and here absence is not a tidy default but the
   * *interesting* value: a document with no background lets the page show
   * through, which is how the runtime sits inside the site rather than covering
   * it. A control that always held a colour could never express that.
   *
   * An empty string is treated as absence too, because that is what a cleared
   * text field produces and `new THREE.Color('')` is a throw inside a render
   * rather than a refusal at the boundary.
   */
  const asked = patch.background
  const background =
    asked === undefined ? world.background : asked === null || asked === '' ? undefined : asked

  /*
   * Nothing changed is not a change - and every field has to be listed here or
   * it silently cannot be set at all.
   *
   * `fatal` was missed on the first pass and the symptom was exactly that:
   * ticking it wrote nothing, because the three fields this compared were all
   * unchanged and the function returned before reaching the write. Same shape as
   * the trap `isDefaultRules` documents at length, met from the other side - one
   * list forgets a field and the field stops working, rather than being dropped.
   */
  if (
    floorY === world.floorY &&
    ground === world.ground &&
    falls === world.restart &&
    dying === world.fatal &&
    background === world.background
  ) {
    return state
  }

  const next: XpWorld = { ...world, floorY, ground, restart: falls, fatal: dying }
  if (background === undefined) delete next.background
  else next.background = background

  return commit(state, writePlace(state.document, where, { world: next }))
}

// ---------------------------------------------------------------------------
// Rules: the triggers hanging off a blueprint
// ---------------------------------------------------------------------------

/**
 * What a new rule starts as.
 *
 * `enter` and one `emit`, which is the only verb that cannot be wrong: it names
 * no blueprint, touches no property and needs nothing else in the document to
 * exist. A new rule that arrived as `damage 10` would be a rule that does
 * something the moment it is added, to whatever walked into the thing, and an
 * editor whose "add" button changes the game is an editor people stop pressing.
 */
export const NEW_TRIGGER: Trigger = { on: 'enter', do: [{ op: 'emit', event: 'touched' }] }

/** What a new verb starts as, for the same reason. */
export const NEW_VERB: Verb = { op: 'emit', event: 'something' }

/**
 * A patch to a rule.
 *
 * `when: null` is how a condition is *removed*, which `Partial<Trigger>` cannot
 * say: `when: undefined` in an object spread is indistinguishable from not
 * mentioning it, so "always fire" and "leave the condition alone" would be the
 * same call.
 */
export interface TriggerPatch {
  on?: TriggerEvent
  when?: Condition | null
  /**
   * Which binding a `pressed` rule listens for. `null` clears it.
   *
   * Present here rather than left out because a patch type that cannot express
   * a field is a field the editor silently deletes on the next unrelated edit -
   * change a rule's condition and lose its key. Same shape as `when` for the
   * same reason.
   */
  key?: string | null
  /**
   * How near the presser has to be, in cells. `null` clears it, which is the
   * press-from-anywhere the rule had before somebody set a reach.
   */
  within?: number | null
  do?: readonly Verb[]
}

/** Change one blueprint, or refuse. The shared half of every function below. */
function withBlueprint(
  state: EditState,
  name: string,
  change: (blueprint: Blueprint) => Blueprint | null,
): EditState | null {
  const existing = state.document.blueprints[name]
  if (!existing) return null

  const next = change(existing)
  if (!next) return null

  return commit(state, {
    ...state.document,
    blueprints: { ...state.document.blueprints, [name]: next },
  })
}

/**
 * Would the parser have this verb?
 *
 * Asked here rather than left to the save, because the editor's one hard
 * property is that an edited document still parses (docs/xp/manual.md §9). The
 * check that matters is `spawn`: a rule that makes a blueprint nobody wrote is
 * refused by name at load, so a panel that let somebody pick one would be a
 * panel that writes a file the editor cannot reopen.
 */
function verbIsSane(verb: Verb, blueprints: Readonly<Record<string, Blueprint>>): boolean {
  switch (verb.op) {
    case 'damage':
    case 'heal':
    case 'score':
      return Number.isFinite(verb.amount)
    /**
     * A clip has to be named, and that is the whole check.
     *
     * Whether the *pack* holds it cannot be asked here - this package does not
     * know which glTFs a host has loaded - so it is the same contract
     * `blueprint.pose` has, and the editor's picker is what keeps an author from
     * naming one that is not there. An empty name is refusable, though, and it
     * is the state a half-filled row is in.
     */
    case 'animate':
      return verb.clip.length > 0
    /**
     * A motion, unlike a clip, *can* be checked here - and is.
     *
     * The asymmetry with `animate` directly above is the point. A clip name
     * belongs to the host's pack and this package has no way to know what was
     * loaded; a motion name belongs to a **blueprint in this very document**, so
     * a `play` naming one nobody wrote is refusable in exactly the way a `spawn`
     * of an unwritten blueprint is - and the same panel that offers it can only
     * offer names that exist.
     *
     * Any blueprint's, not the one the rule is on. A rule fires with a `self`
     * and an `other` and the target may be either, so which blueprint will be
     * playing this is not known here - and refusing a name that some blueprint
     * in the level does have would be refusing a working level.
     */
    case 'play':
      return (
        verb.motion.length > 0 &&
        Object.values(blueprints).some((blueprint) => verb.motion in (blueprint.motions ?? {}))
      )
    case 'rest':
      return true
    /**
     * A dice with fewer than two faces is not a dice.
     *
     * The upper bound is the one worth having, and it is about the panel rather
     * than the maths: a number input somebody holds a key down in reaches four
     * digits in a second, and a d1000 is not a thing anybody meant. The field
     * name is checked at save by `undeclared`, not here — this function has no
     * document to check it against.
     */
    case 'roll':
      return verb.key.length > 0 && Number.isInteger(verb.sides) && verb.sides >= 2 && verb.sides <= 100
    /**
     * Both names have to be there, and neither can be checked here.
     *
     * `along` is a mark prefix and `by` is a data field, and this function has
     * no document — the marks are checked at save by nothing at all (a track
     * with a gap in it is a legal document and a game that stops), and the field
     * is checked by `undeclared`. What is refusable here is a verb missing half
     * of itself.
     */
    case 'advance':
      return verb.by.length > 0 && verb.along.length > 0
    // A seat with no name is not a seat. Whether the document *has* that side is
    // checked at save, like `advance`'s track — this function has no document.
    case 'sit':
      return verb.team.length > 0 && verb.team.length <= 48
    // Nothing to be wrong about: it carries no fields.
    case 'pass':
    case 'raid':
      return true
    // A meeting with no length is one the arbiter gives its own default to.
    case 'meet':
      return verb.seconds === undefined || (Number.isFinite(verb.seconds) && verb.seconds > 0)
    case 'setProp':
    case 'addProp':
      return verb.key.length > 0 && Number.isFinite(verb.value)
    case 'despawn':
    case 'activate':
    case 'drop':
    case 'unhand':
    case 'checkpoint':
    case 'disarm':
    case 'arm':
      return true
    case 'stun':
      // A stun of zero seconds is a stun nobody experiences, and unlike
      // `deactivate` there is no "until told" for the number to fall back to.
      return Number.isFinite(verb.seconds) && verb.seconds > 0
    case 'material':
      // A closed list, checked at the door: an unknown look is a rule that
      // would silently wear the model's own materials, which is the class of
      // quiet nothing this function exists to catch.
      return isMaterial(verb.material)
    case 'dash':
      // Signed, so the test is not `> 0` - but a dash of nowhere is the same
      // half-written rule a stun of no time is, and the parser refuses it.
      return Number.isFinite(verb.cells) && verb.cells !== 0
    case 'swing':
      // Unsigned, unlike a dash: there is no swinging backwards, and an absent
      // reach is an arm of the usual length rather than a missing field.
      return verb.reach === undefined || (Number.isFinite(verb.reach) && verb.reach > 0)
    case 'carry':
      // A socket is optional and free-form - the engine never looks one up by
      // meaning, it only composes transforms - so there is nothing to check.
      return true
    case 'deactivate':
      // A zero or negative delay is a thing that comes back before it has gone,
      // and absent already means "until something turns it on" - so there is no
      // meaning left for a number below one to carry.
      return verb.seconds === undefined || (Number.isFinite(verb.seconds) && verb.seconds > 0)
    case 'spawn':
      return (
        verb.blueprint in blueprints &&
        Number.isFinite(verb.dx) &&
        Number.isFinite(verb.dy) &&
        Number.isFinite(verb.dz)
      )
    case 'teleport':
      /**
       * A name, and only that it is one.
       *
       * Deliberately *not* checked against the entities that exist, unlike
       * `spawn` above - and the asymmetry is the point. A blueprint that does
       * not exist makes a document the parser refuses, so offering one would
       * write a file the editor cannot reopen. A destination that does not
       * exist yet is just a level being built in the order its author chose:
       * they place the pad, name the exit it will go to, and put the node in
       * afterwards. Refusing that means the panel dictates the order of work.
       *
       * The verb already fails softly - `entityByName` returns null and nobody
       * moves - so the cost of a typo is a pad that does nothing, which is
       * visible the first time it is walked on.
       */
      return verb.to.length > 0
    case 'load':
      // The shape, not the existence. Whether `next-level.xp.json` is actually
      // there is a question about a directory this package cannot see, and an
      // author linking to the level they are about to write next is the normal
      // way to build two of them. What is checked is that the id cannot name
      // anything outside `public/xp/xps/`.
      //
      // A room in this document is held to the same alphabet and is *also* not
      // checked for existence, and here the panel could have checked - the
      // `scenes` table is right there. It does not, for the reason the
      // destination field above gives: an author placing the pad before
      // building the room it opens is a level being built in the order they
      // chose, and a panel that refused it would be dictating that order.
      return 'scene' in verb ? isXpId(verb.scene) : isXpId(verb.xp)
    case 'emit':
      return verb.event.length > 0
    // Same closed list the parser uses, so a rule built in the editor cannot
    // save a name that will not reopen.
    case 'sound':
      return isSound(verb.sound)

    /**
     * A cut has to be named, and the name is checked at the *save*.
     *
     * The same shape `animate` has, and for a reason worth keeping straight:
     * this function's one hard job is that a document the panel builds still
     * parses, and `readVerb` refuses a cut name that is not an id. Whether the
     * document actually declares that cut is checked there too - and cannot be
     * checked here without the sequences, which this signature deliberately
     * does not take.
     */
    case 'movie':
      return verb.sequence.length > 0
  }
}

/** Give a blueprint another rule. */
export function addTrigger(
  state: EditState,
  blueprint: string,
  trigger: Trigger = NEW_TRIGGER,
): EditState | null {
  if (trigger.do.length === 0) return null
  return withBlueprint(state, blueprint, (existing) => {
    if (!trigger.do.every((verb) => verbIsSane(verb, state.document.blueprints))) return null
    return { ...existing, triggers: [...existing.triggers, trigger] }
  })
}

/** Change when a rule fires, what it asks first, or what it does. */
export function setTrigger(
  state: EditState,
  blueprint: string,
  index: number,
  patch: TriggerPatch,
): EditState | null {
  return withBlueprint(state, blueprint, (existing) => {
    const trigger = existing.triggers[index]
    if (!trigger) return null

    const verbs = patch.do ?? trigger.do
    // A rule with nothing to do is a rule somebody meant to finish, and the
    // parser says so. Refusing here means the editor cannot write one.
    if (verbs.length === 0) return null
    if (!verbs.every((verb) => verbIsSane(verb, state.document.blueprints))) return null

    const when = patch.when === undefined ? trigger.when : (patch.when ?? undefined)
    /**
     * A number, or a field the level is keeping - the same two forms the parser
     * takes (`Condition.value`).
     *
     * `Number.isFinite` on its own was the whole of this line, and it made the
     * panel's `@` switch a button whose only visible effect was nothing: it sent
     * a perfectly good `"@world.wanted"`, this refused it, the editor wrote
     * nothing, and the control snapped back. Found by pressing it - the same way
     * the `pressed` bug three paragraphs down was found, and the same shape.
     */
    if (when && (when.prop.length === 0 || !(Number.isFinite(when.value) || isDataRef(when.value)))) {
      return null
    }

    const on = patch.on ?? trigger.on
    const named = patch.key === undefined ? trigger.key : (patch.key ?? undefined)
    /**
     * The same rule the parser enforces, enforced here too.
     *
     * A `pressed` with no key fires on nothing and an `enter` carrying one reads
     * as if it did something. The editor refusing rather than writing it is what
     * stops a document being saved in a state `parseXp` will later reject - the
     * worst version of which is an author who cannot reopen their own level.
     *
     * Dropped rather than refused when the event *changes away* from `pressed`,
     * because that is somebody deliberately turning a key rule into a proximity
     * rule and the key has no meaning afterwards.
     *
     * ---------------------------------------------------------------------------
     * Choosing `pressed` fills the key in rather than refusing the choice
     * ---------------------------------------------------------------------------
     * **This is the bug that made `pressed` unselectable.** The panel's event
     * picker sends `{ on: 'pressed' }` and nothing else - it has no key to send,
     * because the rule did not have one a moment ago - so the line below
     * returned `null`, the editor wrote nothing, and the dropdown snapped back
     * to the event it was already on. From outside it read as the option being
     * broken, and it was reported that way: *"I can't select on press."*
     *
     * The refusal was right about the document and wrong about the moment. So
     * the first binding the level declares is filled in instead - `player.keys`
     * is where a document says which keys it has, and a rule that listens for
     * the first one is both a legal document and the one an author most likely
     * meant. They then change it in the field beside the picker, which already
     * exists.
     *
     * A level that binds *no* keys still refuses, and has to: there is nothing
     * to listen for, so the honest answer is that this rule cannot be written
     * yet. The panel disables the option and says so, rather than letting the
     * silence come back.
     */
    const keyed = on === 'pressed' || on === 'released'
    const key = keyed ? (named ?? state.document.player.keys?.[0]?.key) : named
    if (keyed && !key) return null
    const carried = keyed ? key : undefined

    /**
     * The reach, held to the same two rules the parser holds it to.
     *
     * Refused when it is not a positive number - a rule that can never fire is
     * worse in the editor than in a file, because the panel would show a field
     * with a number in it and the level would do nothing. Dropped when the event
     * changes away from `pressed`, exactly as the key is, and for the same
     * reason: it means nothing on the rule the author has just made.
     */
    const asked = patch.within === undefined ? trigger.within : (patch.within ?? undefined)
    if (asked !== undefined && (!Number.isFinite(asked) || asked <= 0)) return null
    const reach = on === 'pressed' ? asked : undefined

    const next: Trigger = {
      on,
      ...(when ? { when } : {}),
      ...(carried ? { key: carried } : {}),
      ...(reach !== undefined ? { within: reach } : {}),
      do: verbs,
    }
    if (JSON.stringify(next) === JSON.stringify(trigger)) return null

    const triggers = [...existing.triggers]
    triggers[index] = next
    return { ...existing, triggers }
  })
}

/** Take a rule away. */
export function removeTrigger(
  state: EditState,
  blueprint: string,
  index: number,
): EditState | null {
  return withBlueprint(state, blueprint, (existing) => {
    if (!existing.triggers[index]) return null
    return { ...existing, triggers: existing.triggers.filter((_, i) => i !== index) }
  })
}

/** Add a verb to the end of a rule's list. */
export function addVerb(
  state: EditState,
  blueprint: string,
  trigger: number,
  verb: Verb = NEW_VERB,
): EditState | null {
  const existing = state.document.blueprints[blueprint]?.triggers[trigger]
  if (!existing) return null
  return setTrigger(state, blueprint, trigger, { do: [...existing.do, verb] })
}

/**
 * Replace one verb outright, rather than patch it.
 *
 * A verb is a tagged union and its fields differ by tag, so a partial patch
 * across a change of `op` has no meaning - `{ op: 'despawn', amount: 10 }` is
 * not a thing. The panel builds a whole verb and hands it over, which also means
 * there is exactly one place that knows what fields each op has.
 */
export function setVerb(
  state: EditState,
  blueprint: string,
  trigger: number,
  index: number,
  verb: Verb,
): EditState | null {
  const existing = state.document.blueprints[blueprint]?.triggers[trigger]
  if (!existing?.do[index]) return null
  const verbs = [...existing.do]
  verbs[index] = verb
  return setTrigger(state, blueprint, trigger, { do: verbs })
}

/**
 * Take a verb away, unless it is the last one.
 *
 * The last one is refused rather than taking the rule with it: emptying a list
 * and deleting the thing that holds it are two different intentions, and
 * guessing at the second when somebody asked for the first is how an editor
 * loses work. Delete the rule to delete the rule.
 */
export function removeVerb(
  state: EditState,
  blueprint: string,
  trigger: number,
  index: number,
): EditState | null {
  const existing = state.document.blueprints[blueprint]?.triggers[trigger]
  if (!existing?.do[index]) return null
  if (existing.do.length === 1) return null
  return setTrigger(state, blueprint, trigger, { do: existing.do.filter((_, i) => i !== index) })
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

/**
 * Move where a person arrives, when nothing else says.
 *
 * The document's own `spawn`, which is the *fallback*: `spawn.ts` uses a spawn
 * mark when the level has one, so a level with teams has several places to
 * arrive and this is the one it falls back to. Editing it was reachable from
 * nowhere - marks had a panel, this had a field in a file - which made "the
 * player starts in the wrong place" unfixable in a level that had no marks,
 * which is most of them.
 *
 * Snapped and bounded exactly as a mark is, and for the same reasons: the same
 * grid so the two agree, and a `y` under the floor or an `x` past the edge is a
 * player who arrives outside the world.
 */
export function setSpawn(
  state: EditState,
  patch: Partial<{ x: number; y: number; z: number; facing: number }>,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  if (!place) return null
  const current = place.spawn
  const next = {
    ...current,
    ...patch,
    ...snapped(patch),
    // Wrapped rather than clamped: turning past 360 is a drag that kept going,
    // and refusing it would stop a gizmo mid-turn.
    ...(patch.facing !== undefined
      ? { facing: ((Math.round(patch.facing) % 360) + 360) % 360 }
      : {}),
  }

  /**
   * The document's own spawn lands too, for the same reason a mark does -
   * unless the edit *was* the height, or the feet were never on anything.
   *
   * A gizmo drag reports all three axes even when the hand only moved
   * sideways, so "y is in the patch" cannot mean "the author wants this
   * height" - the echoed value is the same number the spawn already had.
   * What can mean it is the number having changed: a typed 3 in the y field,
   * or a real pull on the vertical arrow. Grounding that too is what made the
   * field a control that accepts a keystroke the document then silently
   * refuses - solids only know placements, so a spawn over an entity platform
   * or a drop-in above the pitch could never be asked for at all. A height
   * over nothing is now the author's to keep, and `airborne()` in the
   * Document panel is where it is questioned rather than overruled.
   *
   * That test alone kept the height only until the *next* sideways nudge,
   * which is the report *"when you change the position with the touchpad the
   * y gets reset to 0"*: the pad sends x and z and no y at all, so every frame
   * of the drag read as an echo and re-landed the feet. So the other half of
   * the question is where they were standing to begin with. Feet already on a
   * surface go on following the surface - across a floor, up onto a platform,
   * off a ledge - and feet in the air stay in the air, because moving a
   * drop-in sideways says nothing about the author having changed their mind
   * about the drop.
   */
  const moved = patch.x !== undefined || patch.y !== undefined || patch.z !== undefined
  if (moved && next.y === current.y && current.y === grounded(place.world, current)) {
    next.y = grounded(place.world, next)
  }

  if (next.x < -WORLD_RADIUS || next.x >= WORLD_RADIUS) return null
  if (next.z < -WORLD_RADIUS || next.z >= WORLD_RADIUS) return null
  if (next.y < 0 || next.y >= WORLD_HEIGHT) return null

  if (JSON.stringify(next) === JSON.stringify(current)) return state

  return commit(state, writePlace(state.document, where, { spawn: next }))
}

/**
 * Change what a person arrives as.
 *
 * `null` clears a field, for the same reason `TriggerPatch` needs it: `blueprint:
 * undefined` cannot be told apart from not passing one, and "go back to the
 * built-in dummy" is a thing somebody will want to do.
 *
 * Every rule the parser has is checked here, because this is the one part of a
 * document where a wrong name is invisible until it is played: a body that does
 * not exist is a player who does not appear.
 */
export function setPlayerRole(
  state: EditState,
  patch: {
    blueprint?: string | null
    avatarSocket?: string | null
    weapon?: PlayerRole['weapon'] | null
    /** The bound keys, whole. `null` unbinds them all. */
    keys?: readonly PlayerKey[] | null
    /** Cells a jump clears. `null` returns the level to the built-in height. */
    jump?: number | null
    /** Cells a second walking. `null` returns to the built-in 7. */
    speed?: number | null
    /** Cells a second sprinting. `null` returns to the built-in 13. */
    sprint?: number | null
    /** Cells a second squared downwards. `null` returns to the built-in 26. */
    gravity?: number | null
    /** How quickly pace is reached, cells/s². `null` is back to instant. */
    acceleration?: number | null
    /** How quickly a release stops you, cells/s². `null` is back to instant. */
    drag?: number | null
    /** Which side the level opens on. `null` goes back to the host's own guess. */
    view?: PlayerRole['view'] | null
    /**
     * What everybody wears when this level names no body of its own.
     *
     * `null` is back to whatever the level would be otherwise - the dummy, or
     * the body it names. See `XpPlayer.wears`: this swaps a *model* and leaves
     * the blueprint's triggers and props alone, so it sits happily beside a
     * named body rather than contradicting one.
     */
    wears?: PlayerLook | null
  },
): EditState | null {
  const current = state.document.player

  const blueprint =
    patch.blueprint === undefined ? current.blueprint : (patch.blueprint ?? undefined)
  if (blueprint !== undefined && !(blueprint in state.document.blueprints)) return null

  const body = blueprint ? state.document.blueprints[blueprint] : undefined

  const avatarSocket =
    patch.avatarSocket === undefined ? current.avatarSocket : (patch.avatarSocket ?? undefined)
  const wears = patch.wears === undefined ? current.wears : (patch.wears ?? undefined)
  // A socket with no body to hang on is a line that means something and does
  // nothing - the built-in dummy has no sockets to name.
  if (avatarSocket !== undefined && (!body || !(avatarSocket in body.sockets))) return null

  const view = patch.view === undefined ? current.view : (patch.view ?? undefined)

  const weapon = patch.weapon === undefined ? current.weapon : (patch.weapon ?? undefined)
  if (weapon) {
    if (!(weapon.blueprint in state.document.blueprints)) return null
    if (weapon.socket !== undefined && (!body || !(weapon.socket in body.sockets))) return null
  }

  /**
   * Carried across rather than rebuilt, and this line is the whole reason the
   * function reads the current value at all.
   *
   * `next` is assembled from scratch below, so a field not named here is a
   * field *deleted* by any unrelated edit - change the weapon, lose the keys.
   * That failure is silent and shows up as a game that stopped answering to a
   * button, which nobody traces back to having opened the avatar picker. Every
   * optional field on `PlayerRole` belongs in this function.
   */
  const keys = patch.keys === undefined ? current.keys : (patch.keys ?? undefined)
  if (keys !== undefined && !keysAreSane(keys)) return null

  const jump = patch.jump === undefined ? current.jump : (patch.jump ?? undefined)
  // The same bounds the parser applies, so a panel cannot write a document it
  // could not reopen.
  if (jump !== undefined && (!Number.isFinite(jump) || jump <= 0 || jump > 20)) return null

  /**
   * The movement numbers, patched the same way jump is and bounded the same
   * way the parser bounds them - a panel cannot write a document it could not
   * reopen.
   */
  const paces: Partial<
    Record<'speed' | 'sprint' | 'gravity' | 'acceleration' | 'drag', number>
  > = {}
  for (const [field, most] of [
    ['speed', 40],
    ['sprint', 40],
    ['gravity', 100],
    ['acceleration', 400],
    ['drag', 400],
  ] as const) {
    const wanted = patch[field] === undefined ? current[field] : (patch[field] ?? undefined)
    if (wanted === undefined) continue
    if (!Number.isFinite(wanted) || wanted <= 0 || wanted > most) return null
    paces[field] = wanted
  }

  const next: PlayerRole = {
    ...(jump !== undefined ? { jump } : {}),
    /*
     * Carried, not patchable here yet - and the carry is the fix: `bounce` is
     * on `PlayerRole` and was missing from this rebuild, so opening the avatar
     * picker silently un-bounced the level. See the note above `keys`.
     */
    ...(current.bounce !== undefined ? { bounce: current.bounce } : {}),
    ...paces,
    ...(keys && keys.length > 0 ? { keys } : {}),
    ...(blueprint ? { blueprint } : {}),
    ...(wears && wears !== 'dummy' ? { wears } : {}),
    ...(avatarSocket ? { avatarSocket } : {}),
    ...(view ? { view } : {}),
    ...(weapon ? { weapon } : {}),
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return state

  return commit(state, { ...state.document, player: next })
}

/**
 * Would the parser take these keys?
 *
 * The same three rules `readPlayer` applies, asked here so a panel cannot write
 * a document it could not reopen - the editor's one hard property
 * (docs/xp/manual.md §9). Deliberately reading `RESERVED_KEYS` and
 * `MAX_PLAYER_KEYS` from the format rather than restating them, because two
 * copies of a list is one list that drifts.
 */
function keysAreSane(keys: readonly PlayerKey[]): boolean {
  if (keys.length > MAX_PLAYER_KEYS) return false
  const taken = new Set<string>()
  for (const bound of keys) {
    if (!/^[A-Z][A-Za-z0-9]+$/.test(bound.key)) return false
    if (RESERVED_KEYS.includes(bound.key)) return false
    if (taken.has(bound.key)) return false
    if (bound.does.length === 0) return false
    // The same bounds the parser applies to a wait, for the same reason the
    // three above are read from the format: a panel that could write a five
    // hundred second cooldown would be a panel whose document will not reopen.
    if (bound.cooldown !== undefined) {
      if (!Number.isFinite(bound.cooldown)) return false
      if (bound.cooldown <= 0 || bound.cooldown > MAX_KEY_COOLDOWN) return false
    }
    taken.add(bound.key)
  }
  return true
}

/** Everything the parser would insist on, asked before the document is written. */
function markIsSane(mark: Mark): boolean {
  if (mark.x < -WORLD_RADIUS || mark.x >= WORLD_RADIUS) return false
  if (mark.z < -WORLD_RADIUS || mark.z >= WORLD_RADIUS) return false
  if (mark.y < 0 || mark.y >= WORLD_HEIGHT) return false
  if (mark.width < 1 || mark.width > MAX_MARK_SIZE) return false
  if (mark.height < 1 || mark.height > MAX_MARK_SIZE) return false
  return true
}

/**
 * How many places one document may hold, the root included.
 *
 * A ceiling rather than a design. The reason for one at all is `MAX_PLACEMENTS`
 * one level up: a scene carries a whole world, so a document's real size is
 * that cap times however many rooms it has, and without a number here a level
 * could be talked into being a hundred of them by a loop nobody meant to write.
 *
 * Sixteen is generous for the thing this is for - a lobby, an arena, a couple
 * of side rooms - and small enough that the list stays something you can read.
 */
export const MAX_SCENES = 16

/**
 * A new empty place in this document, by name.
 *
 * ---------------------------------------------------------------------------
 * Empty rather than a copy of the root
 * ---------------------------------------------------------------------------
 * The tempting alternative is to clone what you are standing in, on the theory
 * that a second room usually resembles the first. It is wrong for the reason
 * duplicating anything is: what arrives is a room full of things somebody has
 * to delete before they can start, and the deleting is invisible work that
 * looks like building. A scene with no entities is *empty* rather than falling
 * back to the root's for the same reason, one layer down - see `XpScene`.
 *
 * The floor comes with it, because a place with nothing to stand on is a place
 * you fall out of, and arriving in one reads as the editor being broken rather
 * than as a room you have not built yet.
 *
 * Refused for a name the format will not take, for `main` - the root already
 * has that name, and a `scenes.main` would make one word mean two places in one
 * file - and for one this document already uses. Refusing a duplicate rather
 * than overwriting: the second is how somebody loses a room to a typo.
 */
export function addScene(state: EditState, name: string): EditState | null {
  if (!isXpId(name) || name === MAIN_SCENE) return null

  const scenes = state.document.scenes ?? {}
  if (Object.hasOwn(scenes, name)) return null
  // The root counts, because it is a place you can be standing in.
  if (Object.keys(scenes).length + 1 >= MAX_SCENES) return null

  const scene: XpScene = {
    world: {
      // The root's floor height, so a second room is level with the first
      // rather than starting at zero underneath it.
      floorY: state.document.world.floorY,
      // Something to stand on, because a place you fall out of reads as the
      // editor being broken rather than as a room nobody has built yet.
      ground: true,
      // Neither of the two ways a fall can end: a new room is forgiving until
      // its author says otherwise, which is what every level had before either
      // field existed.
      restart: false,
      fatal: false,
      placements: [],
      marks: [],
    },
    spawn: { x: 0, y: state.document.world.floorY + 1, z: 0, facing: 0 },
    entities: [],
  }

  return commit(state, { ...state.document, scenes: { ...scenes, [name]: scene } }, `scene:add:${name}`)
}

/**
 * Rename a place, and nothing that points at it.
 *
 * **Deliberately nothing.** A scene's key is named by `enter`, by a flow's
 * `scene`, and by every `load` verb that goes there - and rewriting all of them
 * from here would be an edit that reaches into rules and phases the author is
 * not looking at. The parser refuses a name that has stopped resolving, so what
 * a rename produces is a document that says exactly where it is broken, which
 * is the better failure: visible, listed, and fixable one at a time.
 *
 * Refused when the new name is taken, for the reason `addScene` refuses one -
 * merging two rooms because somebody typed an existing name is how a room
 * disappears.
 */
export function renameScene(state: EditState, from: string, to: string): EditState | null {
  const scenes = state.document.scenes
  if (!scenes || !Object.hasOwn(scenes, from)) return null
  if (from === to) return state
  if (!isXpId(to) || to === MAIN_SCENE || Object.hasOwn(scenes, to)) return null

  // Rebuilt in order rather than deleted and re-added, so a rename does not
  // move the room to the bottom of a list somebody has been reading top to
  // bottom.
  const next: Record<string, XpScene | string> = {}
  for (const [key, value] of Object.entries(scenes)) next[key === from ? to : key] = value

  return commit(state, { ...state.document, scenes: next }, `scene:rename:${from}`)
}

/**
 * Take a place away, with everything in it.
 *
 * No armed second press here, unlike `removeFlow`: a scene is one row in a list
 * rather than the whole panel, undo is one keystroke, and a confirm on every
 * row of a list is the kind of friction that trains people to click through it.
 *
 * The root is not removable and is not offered - a document's own `world` is
 * where the player is when nothing else has been said, and a level with no
 * place at all is not a level.
 */
export function removeScene(state: EditState, name: string): EditState | null {
  const scenes = state.document.scenes
  if (!scenes || !Object.hasOwn(scenes, name)) return null

  const next = { ...scenes }
  delete next[name]

  return commit(
    state,
    // Gone entirely when the last one goes, so a document that briefly had a
    // second room round-trips as the one-room document it is again. And out of
    // any cut that used it as a shot - see `followShotRemoved`.
    followShotRemoved(
      Object.keys(next).length === 0
        ? omit(state.document, 'scenes')
        : { ...state.document, scenes: next },
      name,
    ),
    `scene:remove:${name}`,
  )
}

/**
 * How big a door is drawn, and why it is that and not bigger.
 *
 * A trigger's reach is **half a metre either side of where it stands** - see
 * `triggerBox` in ../rules/triggers, which is what a thing with no collider is
 * measured by, and which does not know or care how large the model on top of it
 * looks. So the only honest size for a door is one that matches: anything wider
 * promises a doorway and delivers a keyhole, and "it works if you walk over the
 * middle of it" is the worst kind of bug to hand somebody - it looks like the
 * level is flaky rather than like the door is small.
 *
 * `Primitive_Floor` is four cells square, so a quarter on each side is exactly
 * one cell: the footprint you can see is the footprint that fires, corner to
 * corner. That is the whole reason these numbers are not round.
 *
 * The height is the part with a choice in it. Flat, a door is invisible until
 * you are standing on it - there is nothing else to make it visible with, since
 * `colour` on an entity reaches a sign's text and nothing else. Three cells is
 * a post you can see across a room and still a cell short of `Primitive_Wall`,
 * so a door standing in a doorway does not poke out through the wall around it.
 */
const DOOR_SHAPE = { x: 0.25, y: 3, z: 0.25 } as const

/**
 * A way into a room, as a thing you can walk onto.
 *
 * ---------------------------------------------------------------------------
 * Why this is one action and not five
 * ---------------------------------------------------------------------------
 * A room you can open in the editor is a room you immediately want a door to,
 * and until this the route there was: add a blueprint, find the floor tile in
 * the picker, set its collider to `none`, add an `enter` trigger, add a `load`
 * verb, type the scene name, then drag an entity of it into the level. Seven
 * steps, and three of them are the kind you only know to take after getting it
 * wrong once - a door with a collider is a wall you bump into, and a door with
 * no entity is a blueprint nobody meets.
 *
 * So the Places list offers it directly, and this is the whole gesture: the
 * kind of thing, the rule on it, and one of them on the floor in front of you.
 *
 * ---------------------------------------------------------------------------
 * A blueprint per door, not a door property on the thing you clicked
 * ---------------------------------------------------------------------------
 * The tempting shape is "make *this* piece a door", and it is wrong at the
 * level the format works at: a trigger belongs to a **kind of thing**, so
 * turning the selected crate into a door turns every crate in the level into
 * one. A new blueprint per door has the opposite property and the one an author
 * expects - four doors to the cellar are four entities of `to-cellar`, and
 * changing where it goes changes all four, which is what "the same door" means.
 *
 * Named after the room rather than the model for the same reason. Every door is
 * the same tile, so `Primitive_Floor-4` says nothing; `to-cellar` says the only
 * thing that tells two of them apart.
 *
 * ---------------------------------------------------------------------------
 * `collider: none`, which is the bug this exists to not have
 * ---------------------------------------------------------------------------
 * A flat tile still fills the cell it is in, so a door left on `auto` is a
 * doorway you cannot walk into - you stand on it and the `enter` never fires,
 * because you never entered. It is invisible in the editor and obvious the
 * first time somebody tries the level, which is the worst place to find out.
 *
 * ---------------------------------------------------------------------------
 * And it is drawn the size it actually works
 * ---------------------------------------------------------------------------
 * A post one cell square and three tall, which is not decoration: a trigger
 * reaches half a metre either side of where it stands whatever is drawn on top
 * of it, so a door the size of the floor tile it is made from would promise
 * four cells and fire in one. See `DOOR_SHAPE`.
 *
 * ---------------------------------------------------------------------------
 * Which room it goes *in*
 * ---------------------------------------------------------------------------
 * `where`, like every other edit - the room being edited. That is the half that
 * makes the gesture mean anything: a door is a pair of rooms, and the one it
 * leads *from* is the one you are standing in. Refused when the two are the
 * same, because a door out of a room into itself is a tile that does nothing.
 *
 * Refused, too, for a `to` this document does not hold. `main` is a room by
 * this test and has to be - it is the way back, and a level whose front room no
 * door could reach is the hole `two-rooms.xp.json` shipped with.
 */
export function addDoor(
  state: EditState,
  to: string,
  at: { x: number; y: number; z: number },
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  // A door out of the room you are in, into the room you are in.
  if (to === (where ?? MAIN_SCENE)) return null
  if (to !== MAIN_SCENE) {
    const scene = state.document.scenes?.[to]
    // A door out of the document is `load`'s other spelling and is not this:
    // `scenes.<name>` holding a string is somewhere else entirely.
    if (!scene || typeof scene === 'string') return null
  }

  const name = freeNameFrom(state.document.blueprints, `to-${to}`)
  if (name === null) return null

  const made = addBlueprint(state, name, { collider: 'none' })
  if (!made) return null

  /*
   * The rule through `addTrigger` rather than written into the blueprint above,
   * so the verb is checked by the same `verbIsSane` every hand-built rule goes
   * through. One place decides what a rule the parser would keep looks like.
   */
  const ruled = addTrigger(made, name, { on: 'enter', do: [{ op: 'load', scene: to }] })
  if (!ruled) return null

  const placed = addEntity(
    ruled,
    {
      blueprint: name,
      name: nextEntityName(ruled.document, name, where),
      ...at,
      // A post the size of its own trigger. See `DOOR_SHAPE`.
      stretch: { ...DOOR_SHAPE },
    },
    where,
  )
  if (!placed) return null

  /*
   * One step on the undo stack, not three - the same move `blueprintFrom` makes
   * one screen up, and for the same reason: somebody who pressed a button once
   * presses undo once, and landing them on a blueprint with no door in the
   * level would be the worst of the three places to stop.
   */
  return { state: commit(state, placed.document), name }
}

// ---------------------------------------------------------------------------
// The movie
// ---------------------------------------------------------------------------

/**
 * Every writer a timeline panel calls, and one rule they all share.
 *
 * A timeline is a set of overrides on things that exist, and `readTimeline`
 * refuses one that names something absent. That refusal is right and it means
 * the *editing* side has an obligation it would otherwise have quietly skipped:
 * an edit that takes a name away has to take its keys with it, or the next save
 * refuses a document the author never did anything wrong to. `renamedIn`,
 * `withoutEntity` and `removeCamera` below are that obligation, and each one
 * says which edit it is standing behind.
 */

/** The timeline of the place being edited, or a fresh one. */
function timelineIn(document: XpDocument, where: PlaceTarget): XpTimeline | null {
  return placeIn(document, where)?.timeline ?? null
}

function writeTimeline(
  state: EditState,
  where: PlaceTarget,
  next: XpTimeline | null,
  mark?: string,
): EditState | null {
  if (!placeIn(state.document, where)) return null
  return commit(state, writePlace(state.document, where, { timeline: next }), mark)
}

/**
 * This place becomes a shot.
 *
 * Idempotent, because the button that calls it is on a panel somebody may open
 * twice, and a second press that wiped the first movie would be the most
 * expensive undo in the editor.
 */
export function startMovie(state: EditState, where?: PlaceTarget): EditState | null {
  const place = placeIn(state.document, where)
  if (!place || place.timeline) return null

  /**
   * The first camera is aimed at the spawn, not at the origin.
   *
   * `emptyTimeline`'s default framing is a fixed `[8, 5, 8]` looking at the
   * middle of the world, which is right for a level built around its origin and
   * is *inside a wall* in one built anywhere else - and the first thing anybody
   * saw on opening a movie was a full-screen close-up of the floor. A camera
   * you have to fly out of before you can tell what you are looking at is a
   * worse start than one that is merely imperfect.
   *
   * The spawn rather than the level's extent, and that is a deliberate stop:
   * a bounding box over placements and entities would frame the *building* -
   * including the far wall of a room nobody is in - where the spawn is where
   * the level thinks the interesting part is. It is also the one point every
   * place is guaranteed to have.
   */
  const spawn = place.spawn
  const fresh = emptyTimeline()
  const framed: XpTimeline = {
    ...fresh,
    cameras: [
      {
        ...DEFAULT_CAMERA,
        keys: [
          {
            t: 0,
            position: [spawn.x + 7, spawn.y + 4.5, spawn.z + 7],
            // Chest height on whoever is standing there, rather than their
            // feet: a camera aimed at the floor puts the subject in the top
            // third of the frame, which reads as a mistake rather than a style.
            target: [spawn.x, spawn.y + 1.2, spawn.z],
            fov: DEFAULT_CAMERA.keys[0]!.fov,
          },
        ],
      },
    ],
  }

  return writeTimeline(state, where, framed)
}

/**
 * And stops being one.
 *
 * The keys go with it rather than being kept somewhere for later. A movie half
 * removed - the block gone, the keys parked - is a file that grows things
 * nobody can see, and the undo stack is the honest way back.
 */
export function removeMovie(state: EditState, where?: PlaceTarget): EditState | null {
  if (!timelineIn(state.document, where)) return null
  if (!placeIn(state.document, where)) return null
  // And every take of it, for the reason `followShotRemoved` gives: a cut
  // naming a place that is no longer a shot is a document the parser refuses.
  const document = followShotRemoved(
    writePlace(state.document, where, { timeline: null }),
    where ?? MAIN_SCENE,
  )
  return commit(state, document)
}

/** How long it runs, how fast, and what it is composited over. */
export function setMovie(
  state: EditState,
  patch: { duration?: number; fps?: number; backdrop?: Backdrop },
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline) return null

  const duration =
    patch.duration === undefined
      ? timeline.duration
      : Math.min(MAX_DURATION, Math.max(0.01, patch.duration))
  const fps =
    patch.fps === undefined
      ? timeline.fps
      : Math.round(Math.min(MAX_FPS, Math.max(MIN_FPS, patch.fps)))
  if (!Number.isFinite(duration) || !Number.isFinite(fps)) return null

  const backdrop = patch.backdrop ?? timeline.backdrop
  // A picture from somewhere else is refused here as well as in the parser: an
  // edit that saves and then will not re-open is worse than one that is refused
  // while the author is still looking at the field.
  if (backdrop.image !== undefined && !backdrop.image.startsWith('/')) return null
  if ((backdrop.kind === 'image' || backdrop.kind === 'sky') && !backdrop.image) return null

  const next = { ...timeline, duration, fps, backdrop }
  if (
    next.duration === timeline.duration &&
    next.fps === timeline.fps &&
    next.backdrop === timeline.backdrop
  ) {
    return null
  }
  return writeTimeline(state, where, next)
}

/**
 * How one key leaves for the next.
 *
 * ---------------------------------------------------------------------------
 * Two thirds of the format were unreachable
 * ---------------------------------------------------------------------------
 * `Ease` has been `hold | linear | smooth` since keys existed, `sampleKeys`
 * honours all three, and every key the movie panel writes is hardcoded
 * `smooth`. So *hold* - which is how a body stays put and then jumps, and the
 * only way to get a cut rather than a glide - could be written into a file by
 * hand and never by the editor that owns the file.
 *
 * Kept as its own writer rather than folded into `putEntityKey`: that one is
 * about a value at a moment, this is about the shape of the segment after it,
 * and the panel changes them at completely different times - one on every drag
 * of a pad, the other once, deliberately.
 */
export function setKeyEase(
  state: EditState,
  entity: string,
  property: string,
  index: number,
  ease: Ease,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const keys = timeline?.tracks[entity]?.[property]
  const key = keys?.[index]
  if (!timeline || !keys || !key) return null
  if (!EASES.includes(ease)) return null
  // Nothing changing is not an undo step, the same rule `place` follows.
  if (key.ease === ease) return null

  const next = [...keys]
  next[index] = { ...key, ease }
  return writeTimeline(state, where, {
    ...timeline,
    tracks: {
      ...timeline.tracks,
      [entity]: { ...timeline.tracks[entity], [property]: next },
    },
  })
}

/**
 * Keys on several properties of one body, in one edit.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a loop over `putEntityKey`
 * ---------------------------------------------------------------------------
 * It cannot be, at the call site. Every writer here takes a state and returns
 * the next one, so two calls made from one event handler both start from the
 * render's state and the second discards the first. A pad reports two axes at
 * once - pitch and yaw come out of a single push - so calling the singular
 * writer twice keeps whichever happened to be last and silently drops the
 * other, which is a control that works on one axis and the axis depends on the
 * order of two lines.
 *
 * `moveActorAt` already solved this for x, y and z. This is the same answer for
 * anything animatable, which is what a rotate or scale pad needs.
 *
 * A property that cannot be keyed is **skipped rather than refusing the whole
 * write**: the caller is a pad reporting both of its axes, and one of them
 * being out of range for this body is not a reason to ignore the other. The
 * write is refused only when nothing at all could be keyed.
 */
export function putEntityKeys(
  state: EditState,
  entity: string,
  values: Readonly<Record<string, number>>,
  at: number,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  if (!place || !timeline) return null
  if (!Number.isFinite(at)) return null

  const target = place.entities.find((one) => one.name === entity)
  if (!target) return null

  const had = timeline.tracks[entity] ?? {}
  // Whether this body is about to take a track slot it does not already hold.
  const newcomer = Object.keys(had).length === 0
  if (newcomer && Object.keys(timeline.tracks).length >= MAX_TRACKED) return null

  let bag: Tracks = had
  for (const [property, raw] of Object.entries(values)) {
    const prop = propOfProperty(property)
    const limits = prop === null ? animatable(property) : undefined
    if (prop === null && !limits) continue
    // Checked against the blueprint's declarations as well as the entity's own
    // overrides, for the reason `readTimeline` spells out: a placed entity
    // carries only the numbers it differs on, so its own bag is usually empty.
    if (prop !== null) {
      const declared = state.document.blueprints[target.blueprint]?.props ?? {}
      if (!(prop in declared) && !(prop in target.props)) continue
    }
    if ((bag[property]?.length ?? 0) >= MAX_KEYS) continue

    const value = limits ? Math.min(limits.max, Math.max(limits.min, raw)) : raw
    if (!Number.isFinite(value)) continue

    bag = {
      ...bag,
      // `smooth` for the reason `onKey` gives: what an author describes when
      // they key two positions is a move, and a shot of straight lines reads
      // as a robot arm.
      [property]: putKey(bag[property], { t: Math.max(0, at), value, ease: 'smooth' }),
    }
  }

  if (bag === had) return null
  return writeTimeline(state, where, {
    ...timeline,
    tracks: { ...timeline.tracks, [entity]: bag },
  })
}

/**
 * A key, on one property of one body.
 *
 * Replacing any key already at that instant rather than stacking, which is the
 * gesture the panel is built around: scrub back to a key, change the value,
 * press again.
 */
export function putEntityKey(
  state: EditState,
  entity: string,
  property: string,
  key: Key,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  if (!place || !timeline) return null

  const target = place.entities.find((one) => one.name === entity)
  if (!target) return null

  const prop = propOfProperty(property)
  const limits = prop === null ? animatable(property) : undefined
  if (prop === null && !limits) return null
  // Checked against the blueprint's declarations as well as the entity's own
  // overrides, for the reason `readTimeline` spells out: a placed entity carries
  // only the numbers it differs on, so its own bag is usually empty.
  if (prop !== null) {
    const declared = state.document.blueprints[target.blueprint]?.props ?? {}
    if (!(prop in declared) && !(prop in target.props)) return null
  }

  const bag: Tracks = timeline.tracks[entity] ?? {}
  if (!(property in bag) && Object.keys(bag).length === 0 && Object.keys(timeline.tracks).length >= MAX_TRACKED) {
    return null
  }
  if ((bag[property]?.length ?? 0) >= MAX_KEYS) return null

  const value = limits ? Math.min(limits.max, Math.max(limits.min, key.value)) : key.value
  if (!Number.isFinite(value) || !Number.isFinite(key.t)) return null

  const keys = putKey(bag[property], { ...key, t: Math.max(0, key.t), value })
  return writeTimeline(state, where, {
    ...timeline,
    tracks: { ...timeline.tracks, [entity]: { ...bag, [property]: keys } },
  })
}

/** A key dropped. The property goes with it when it was the last one, and so does the node. */
export function dropEntityKey(
  state: EditState,
  entity: string,
  property: string,
  index: number,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const bag = timeline?.tracks[entity]
  if (!timeline || !bag?.[property]?.[index]) return null

  const kept = bag[property]!.filter((_, i) => i !== index)
  const nextBag: Record<string, Key[]> = { ...bag }
  if (kept.length === 0) delete nextBag[property]
  else nextBag[property] = kept

  const tracks: Record<string, Tracks> = { ...timeline.tracks }
  // An empty bag is left in the file as an empty object otherwise, which the
  // timeline draws a row for and the author cannot get rid of.
  if (Object.keys(nextBag).length === 0) delete tracks[entity]
  else tracks[entity] = nextBag

  return writeTimeline(state, where, { ...timeline, tracks })
}

/** Everything keyed on one body, gone. What the timeline's own delete calls. */
export function clearEntityKeys(
  state: EditState,
  entity: string,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline?.tracks[entity]) return null
  const tracks: Record<string, Tracks> = { ...timeline.tracks }
  delete tracks[entity]
  return writeTimeline(state, where, { ...timeline, tracks })
}

/**
 * A camera, placed where the viewport is looking.
 *
 * The name is made unique here rather than refused, because this is a button
 * and not a field: an author pressing "add camera" four times means four
 * cameras, not three and an error.
 */
export function addCamera(
  state: EditState,
  framing: Omit<Framing, 't'>,
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline || timeline.cameras.length >= MAX_CAMERAS) return null

  const taken = new Set(timeline.cameras.map((one) => one.name))
  let name = 'cam'
  let n = 1
  while (taken.has(name)) {
    n += 1
    name = `cam${n}`
  }

  const next = writeTimeline(state, where, {
    ...timeline,
    cameras: [...timeline.cameras, { name, keys: [{ t: 0, ...framing }], ease: true }],
  })
  return next ? { state: next, name } : null
}

/**
 * A camera removed, and every cut that named it with it.
 *
 * The cuts are the whole reason this is not a one-line filter. A cut naming a
 * camera that is gone is a document `readTimeline` refuses, so leaving them
 * would make deleting a camera an edit that saves and then will not re-open -
 * and the author would have no way to tell that the two were connected.
 *
 * The last camera cannot go: a movie without one is not a movie, and the parser
 * would put `DEFAULT_CAMERA` back on the next load, which is a refused edit
 * wearing the costume of a successful one.
 */
export function removeCamera(
  state: EditState,
  name: string,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline || timeline.cameras.length <= 1) return null
  if (!timeline.cameras.some((one) => one.name === name)) return null

  return writeTimeline(state, where, {
    ...timeline,
    cameras: timeline.cameras.filter((one) => one.name !== name),
    cuts: timeline.cuts.filter((cut) => cut.camera !== name),
  })
}

/** A camera renamed, and the cuts that named it renamed with it. See `removeCamera`. */
export function renameCamera(
  state: EditState,
  from: string,
  to: string,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline || from === to) return null
  if (!CAMERA_NAME.test(to)) return null
  if (!timeline.cameras.some((one) => one.name === from)) return null
  if (timeline.cameras.some((one) => one.name === to)) return null

  return writeTimeline(state, where, {
    ...timeline,
    cameras: timeline.cameras.map((one) => (one.name === from ? { ...one, name: to } : one)),
    cuts: timeline.cuts.map((cut) => (cut.camera === from ? { ...cut, camera: to } : cut)),
  })
}

/** A framing written into one camera's path at `t`, replacing any already there. */
export function putFraming(
  state: EditState,
  camera: string,
  key: Framing,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const one = timeline?.cameras.find((each) => each.name === camera)
  if (!timeline || !one) return null
  if (!Number.isFinite(key.t) || !Number.isFinite(key.fov)) return null
  if (one.keys.length >= MAX_FRAMINGS && !one.keys.some((each) => Math.abs(each.t - key.t) <= 0.02)) {
    return null
  }

  const t = Math.max(0, key.t)
  const kept = one.keys.filter((each) => Math.abs(each.t - t) > 0.02)
  const keys = [...kept, { ...key, t }].sort((a, b) => a.t - b.t)

  return writeTimeline(state, where, {
    ...timeline,
    cameras: timeline.cameras.map((each) => (each.name === camera ? { ...each, keys } : each)),
  })
}

/** A framing dropped. The last one stays - a camera is at least one framing. */
export function dropFraming(
  state: EditState,
  camera: string,
  index: number,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const one = timeline?.cameras.find((each) => each.name === camera)
  if (!timeline || !one || one.keys.length <= 1 || !one.keys[index]) return null

  return writeTimeline(state, where, {
    ...timeline,
    cameras: timeline.cameras.map((each) =>
      each.name === camera ? { ...each, keys: each.keys.filter((_, i) => i !== index) } : each,
    ),
  })
}

/** Whether a camera settles into its framings or passes through them. */
export function setCameraEase(
  state: EditState,
  camera: string,
  ease: boolean,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const one = timeline?.cameras.find((each) => each.name === camera)
  if (!timeline || !one || one.ease === ease) return null

  return writeTimeline(state, where, {
    ...timeline,
    cameras: timeline.cameras.map((each) => (each.name === camera ? { ...each, ease } : each)),
  })
}

/** And now this camera, from here. One cut per instant, the later one winning. */
export function putCut(
  state: EditState,
  cut: Cut,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline || !Number.isFinite(cut.t)) return null
  if (!timeline.cameras.some((one) => one.name === cut.camera)) return null

  const t = Math.max(0, cut.t)
  const kept = timeline.cuts.filter((one) => Math.abs(one.t - t) > 0.02)
  if (kept.length >= MAX_CUTS) return null

  return writeTimeline(state, where, {
    ...timeline,
    cuts: [...kept, { ...cut, t }].sort((a, b) => a.t - b.t),
  })
}

export function dropCut(state: EditState, index: number, where?: PlaceTarget): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline?.cuts[index]) return null
  return writeTimeline(state, where, {
    ...timeline,
    cuts: timeline.cuts.filter((_, i) => i !== index),
  })
}
/**
 * An action, placed on a body.
 *
 * One writer for all five kinds, because they differ only in the fields their
 * kind carries - which was the argument for folding `cues` and `lines` into
 * `actions` in the first place. What used to be four exported functions with
 * four copies of the same guards is this and `dropAction`.
 *
 * **One per body per instant**, the rule keys already followed: two things
 * starting on the same body a hundredth of a second apart is never what
 * somebody meant, and is invisible in the timeline afterwards. Two *different*
 * bodies at one moment is two actions, which is a scene.
 */
export function putAction(
  state: EditState,
  action: XpAction,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  if (!place || !timeline) return null
  if (!Number.isFinite(action.t) || !Number.isFinite(action.duration)) return null
  if (!place.entities.some((one) => one.name === action.entity)) return null
  if (action.kind === 'play' && action.clip.trim().length === 0) return null
  if (action.kind === 'say' && action.text.trim().length === 0) return null

  const t = Math.max(0, action.t)
  const duration = Math.min(MAX_ACTION_SECONDS, Math.max(0.05, action.duration))

  const kept = timeline.actions.filter(
    (one) => one.entity !== action.entity || Math.abs(one.t - t) > 0.02,
  )
  if (kept.length >= MAX_ACTIONS) return null

  return writeTimeline(state, where, {
    ...timeline,
    actions: [...kept, { ...action, t, duration }].sort((a, b) => a.t - b.t),
  })
}

/** An action moved, retimed or edited in place. */
export function setAction(
  state: EditState,
  index: number,
  patch: Partial<XpAction>,
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const action = timeline?.actions[index]
  if (!timeline || !action) return null
  /*
   * The kind is not patchable, and that is a refusal rather than an oversight:
   * every kind carries different fields, so changing it would leave the old
   * ones behind and the new ones missing. Remove and add is the honest way.
   */
  if (patch.kind !== undefined && patch.kind !== action.kind) return null

  const merged = { ...action, ...patch } as XpAction
  const next: XpAction = {
    ...merged,
    t: Math.max(0, Number.isFinite(merged.t) ? merged.t : action.t),
    duration: Math.min(
      MAX_ACTION_SECONDS,
      Math.max(0.05, Number.isFinite(merged.duration) ? merged.duration : action.duration),
    ),
  }

  const actions = [...timeline.actions]
  actions[index] = next
  return writeTimeline(
    state,
    where,
    { ...timeline, actions: actions.sort((a, b) => a.t - b.t) },
    // Marked, so dragging an action's edge is one undo step rather than one per
    // frame of the drag - the same mechanism the gizmo and typing both use.
    `movie:action:${index}`,
  )
}

export function dropAction(state: EditState, index: number, where?: PlaceTarget): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline?.actions[index]) return null
  return writeTimeline(state, where, {
    ...timeline,
    actions: timeline.actions.filter((_, i) => i !== index),
  })
}

/**
 * An action turned into the keys it was producing.
 *
 * The door between the two halves, and it only goes this way cheaply. What
 * comes out is exactly what was on screen a moment before, so nothing moves
 * when it is pressed - the property that makes it safe as a button rather than
 * a warning.
 *
 * The action goes with it. Leaving both would be a body driven twice, and the
 * keys would win at every moment they cover - so the action would be a row in
 * the timeline that does nothing, which is worse than either.
 */
export function bakeAction(state: EditState, index: number, where?: PlaceTarget): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  const action = timeline?.actions[index]
  if (!place || !timeline || !action) return null
  if (action.kind === 'play' || action.kind === 'say') return null

  const body = place.entities.find((one) => one.name === action.entity)
  if (!body) return null

  const baked = actionAsKeys(action, timeline, {
    x: body.x,
    y: body.y,
    z: body.z,
    rotation: body.rotation,
  })
  if (Object.keys(baked).length === 0) return null

  const bag: Tracks = timeline.tracks[action.entity] ?? {}
  return writeTimeline(state, where, {
    ...timeline,
    tracks: { ...timeline.tracks, [action.entity]: { ...bag, ...baked } },
    actions: timeline.actions.filter((_, i) => i !== index),
  })
}

/**
 * And keys turned back into the move they describe, when they describe one.
 *
 * `keysAsAction` is where "when possible" is decided, and it refuses far more
 * than it accepts - which is the point. What this adds is the other half of the
 * trade: the keys go, because a move running *beside* the keys it came from
 * would be overridden by them at every moment and do nothing.
 */
export function liftKeys(state: EditState, entity: string, where?: PlaceTarget): EditState | null {
  const timeline = timelineIn(state.document, where)
  if (!timeline) return null

  const action = keysAsAction(timeline.tracks[entity], entity)
  if (!action) return null

  const tracks: Record<string, Tracks> = { ...timeline.tracks }
  delete tracks[entity]

  return writeTimeline(state, where, {
    ...timeline,
    tracks,
    actions: [...timeline.actions, action].sort((a, b) => a.t - b.t),
  })
}

/**
 * A timeline with one body renamed throughout, or unchanged.
 *
 * Not an edit of its own. It is the half of `setEntity` and of deleting an
 * actor that the format's own strictness makes compulsory: `readTimeline`
 * refuses a track or a cue naming a body that is not there, so a rename that
 * left the keys behind would produce a document that saves and then will not
 * re-open, with the error pointing at a name the author has already changed.
 *
 * `to` of `null` is the delete. The keys go rather than being parked: an actor
 * removed is an actor removed, and undo is the way back.
 */
function renamedIn(timeline: XpTimeline, from: string, to: string | null): XpTimeline {
  if (!from) return timeline

  const tracks: Record<string, Tracks> = {}
  for (const [name, bag] of Object.entries(timeline.tracks)) {
    if (name !== from) tracks[name] = bag
    else if (to !== null) tracks[to] = bag
  }

  /*
   * And the actions, which are the other thing keyed by a body's name.
   *
   * This used to walk two lists - `cues` and `lines` - and folding them into
   * `actions` removed a chance to forget: the rule is that *anything* keyed by
   * `entity` belongs in this function, and there is now one place to obey it.
   */
  const actions = timeline.actions
    .filter((one) => one.entity !== from || to !== null)
    .map((one) => (one.entity === from && to !== null ? { ...one, entity: to } : one))

  return { ...timeline, tracks, actions }
}

/**
 * The document with a place's timeline told that a body changed name or left.
 *
 * Exported so `setEntity` and `removeEntity` can call it, and no other caller
 * should need it: this is a repair, not a feature.
 */
export function followRename(
  document: XpDocument,
  where: PlaceTarget,
  from: string | undefined,
  to: string | null,
): XpDocument {
  if (!from) return document
  const timeline = placeIn(document, where)?.timeline
  if (!timeline) return document
  const next = renamedIn(timeline, from, to)
  return next === timeline ? document : writePlace(document, where, { timeline: next })
}

// ---------------------------------------------------------------------------
// Sequences - the composing side
// ---------------------------------------------------------------------------

/**
 * Every place in this document that is a shot, in the order the panel lists them.
 *
 * The root first, because it is the one somebody means when they say "the
 * level" - the same order `everyPlace` uses and for the same reason.
 */
export function shotsIn(document: XpDocument): string[] {
  const shots: string[] = []
  if (document.timeline) shots.push(MAIN_SCENE)
  for (const [name, scene] of Object.entries(document.scenes ?? {})) {
    if (typeof scene !== 'string' && scene.timeline) shots.push(name)
  }
  return shots
}

function writeSequences(
  state: EditState,
  sequences: Record<string, XpSequence>,
): EditState {
  const document = { ...state.document }
  if (Object.keys(sequences).length === 0) delete document.sequences
  else document.sequences = sequences
  return commit(state, document)
}

/**
 * A new cut, named for you.
 *
 * The name is derived rather than asked for, because this is a button on a
 * panel and a modal asking for a name is how somebody ends up with `sequence`,
 * `sequence2` and `Untitled` anyway. Renaming is a field on the row.
 */
export function addSequence(state: EditState): { state: EditState; id: string } | null {
  const existing = state.document.sequences ?? {}
  if (Object.keys(existing).length >= MAX_SEQUENCES) return null

  let id = 'cut'
  let n = 1
  while (id in existing) {
    n += 1
    id = `cut-${n}`
  }

  return { state: writeSequences(state, { ...existing, [id]: { takes: [] } }), id }
}

export function removeSequence(state: EditState, id: string): EditState | null {
  const existing = state.document.sequences ?? {}
  if (!(id in existing)) return null
  const next = { ...existing }
  delete next[id]
  return writeSequences(state, next)
}

export function renameSequence(state: EditState, id: string, name: string): EditState | null {
  const sequence = state.document.sequences?.[id]
  if (!sequence) return null
  const trimmed = name.trim().slice(0, MAX_SEQUENCE_NAME)
  if ((sequence.name ?? '') === trimmed) return null

  const next = { ...sequence }
  if (trimmed.length === 0) delete next.name
  else next.name = trimmed
  // Marked, so typing a name is one undo step rather than one per character -
  // the same reason every other text field in this editor names its edit.
  return commit(
    state,
    { ...state.document, sequences: { ...state.document.sequences, [id]: next } },
    `sequence-name:${id}`,
  )
}

/**
 * A shot appended to a cut, whole.
 *
 * Whole rather than trimmed, because that is what dragging a shot onto a
 * timeline means everywhere: you get all of it and then you pull the ends in.
 * The length comes from the shot's own timeline, which is the only place that
 * knows it - a take that guessed a duration would be one an author has to fix
 * before they can do anything.
 */
export function addTake(
  state: EditState,
  id: string,
  scene: string,
  atIndex?: number,
): EditState | null {
  const sequence = state.document.sequences?.[id]
  if (!sequence || sequence.takes.length >= MAX_TAKES) return null

  const place = placeIn(state.document, scene === MAIN_SCENE ? undefined : scene)
  const timeline = place?.timeline
  if (!timeline) return null

  const take: Take = { scene, from: 0, to: timeline.duration, speed: 1 }
  const takes = [...sequence.takes]
  takes.splice(atIndex ?? takes.length, 0, take)

  return writeSequences(state, {
    ...state.document.sequences,
    [id]: { ...sequence, takes },
  })
}

/**
 * A take trimmed, retimed, or both.
 *
 * Clamped rather than refused, unlike the parser: this is a drag, and a handle
 * that stops moving at the limit is the right feedback where a refused edit
 * would just look like the pointer had come off the handle. The parser's
 * refusal is still what stops a crossed pair reaching a file - it is guarding
 * against a hand-edited document, and this is guarding against a mouse.
 */
export function setTake(
  state: EditState,
  id: string,
  index: number,
  patch: { from?: number; to?: number; speed?: number },
): EditState | null {
  const sequence = state.document.sequences?.[id]
  const take = sequence?.takes[index]
  if (!sequence || !take) return null

  const place = placeIn(state.document, take.scene === MAIN_SCENE ? undefined : take.scene)
  const whole = place?.timeline?.duration ?? MAX_DURATION

  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, patch.speed ?? take.speed))
  // A frame is the smallest trim worth having, and two handles that can meet
  // exactly are two handles that produce a zero-length take on the way past.
  const grain = 1 / (place?.timeline?.fps ?? 30)
  const from = Math.min(
    Math.max(0, patch.from ?? take.from),
    (patch.to ?? take.to) - grain,
  )
  const to = Math.max(Math.min(whole, patch.to ?? take.to), from + grain)

  if (from === take.from && to === take.to && speed === take.speed) return null
  if (![from, to, speed].every(Number.isFinite)) return null

  const takes = [...sequence.takes]
  takes[index] = { ...take, from, to, speed }
  return writeSequences(state, { ...state.document.sequences, [id]: { ...sequence, takes } })
}

/**
 * The same take again, immediately after it.
 *
 * The gesture `Take`'s own note is written around - *"a shot used twice at
 * different lengths is what an edit is"* - and the one the panel had no button
 * for. Doing it by hand was `addTake`, which lands the shot **whole**, and then
 * retyping both trims onto it; two undo steps and a number to remember.
 *
 * After rather than at the end, because a copy is a thing you make *here*: the
 * pair is almost always about to become two halves of one shot, and a duplicate
 * that arrived at the bottom of the cut would have to be walked back up it.
 *
 * No cap check beyond the one `MAX_TAKES` already is - this is the only writer
 * that can grow a cut without the author naming a shot, so it is the one that
 * would otherwise walk past the limit unnoticed.
 */
export function copyTake(state: EditState, id: string, index: number): EditState | null {
  const sequence = state.document.sequences?.[id]
  const take = sequence?.takes[index]
  if (!sequence || !take || sequence.takes.length >= MAX_TAKES) return null

  const takes = [...sequence.takes]
  takes.splice(index + 1, 0, { ...take })
  return writeSequences(state, { ...state.document.sequences, [id]: { ...sequence, takes } })
}

/** A take pulled out of the cut. */
export function dropTake(state: EditState, id: string, index: number): EditState | null {
  const sequence = state.document.sequences?.[id]
  if (!sequence?.takes[index]) return null
  return writeSequences(state, {
    ...state.document.sequences,
    [id]: { ...sequence, takes: sequence.takes.filter((_, i) => i !== index) },
  })
}

/** A take dragged somewhere else in the order. */
export function moveTake(
  state: EditState,
  id: string,
  from: number,
  to: number,
): EditState | null {
  const sequence = state.document.sequences?.[id]
  if (!sequence?.takes[from] || from === to) return null
  if (to < 0 || to >= sequence.takes.length) return null

  const takes = [...sequence.takes]
  const [moved] = takes.splice(from, 1)
  takes.splice(to, 0, moved!)
  return writeSequences(state, { ...state.document.sequences, [id]: { ...sequence, takes } })
}

/**
 * Every take of a place that is no longer a shot, gone.
 *
 * The third member of the family `followRename` belongs to, and it stands
 * behind `removeMovie` and `removeScene`: `readSequence` refuses a take naming
 * a place with no timeline, so taking a movie away without this leaves a cut
 * that saves and will not re-open, with the error naming a scene the author was
 * deliberately finished with.
 */
export function followShotRemoved(document: XpDocument, scene: string): XpDocument {
  const sequences = document.sequences
  if (!sequences) return document

  const next: Record<string, XpSequence> = {}
  let changed = false
  for (const [id, sequence] of Object.entries(sequences)) {
    const takes = sequence.takes.filter((take) => take.scene !== scene)
    if (takes.length !== sequence.takes.length) changed = true
    next[id] = { ...sequence, takes }
  }

  return changed ? { ...document, sequences: next } : document
}

/**
 * A new movie: an empty stage with a timeline on it.
 *
 * ---------------------------------------------------------------------------
 * A movie is not your level with a clock attached
 * ---------------------------------------------------------------------------
 * `startMovie` gives an *existing* place a timeline, and the format is built on
 * that unification - a shot is a scene, which is what makes a cutscene between
 * two playable rooms fall out for free. What it made the panel invite was the
 * wrong thing: "turn this level into a film", so the first act of making a movie
 * was committing your level to being one, and every actor you added for the
 * camera was an actor standing in the game.
 *
 * That is backwards for the thing people actually do. A movie starts **empty**
 * and you put things in it: a body, a light, a wall behind them - and where a
 * set already exists, you *import* it (see `importPlace`) rather than filming
 * where you happen to be standing.
 *
 * So this is the button, and `startMovie` stays for the case it was right about
 * all along: a room you have built that should also play itself.
 *
 * The name is derived rather than asked for, like a camera's and a cut's, and
 * for the same reason: a modal asking for a name before there is anything to
 * name is a form between somebody and the thing they came to do.
 */
export function addMovie(state: EditState): { state: EditState; name: string } | null {
  const scenes = state.document.scenes ?? {}

  let name = 'movie'
  let n = 1
  while (Object.hasOwn(scenes, name)) {
    n += 1
    name = `movie-${n}`
  }

  const made = addScene(state, name)
  if (!made) return null

  /*
   * No ground under it, unlike an ordinary new room.
   *
   * `addScene` turns the floor on because a place you fall out of reads as the
   * editor being broken. A movie has nobody to fall out of it, and an infinite
   * plane is a horizon in every wide shot - so a film starts with nothing behind
   * it, which is also what `backdrop: none` means and what makes the first frame
   * exportable as a cut-out.
   */
  const scene = made.document.scenes?.[name]
  if (!scene || typeof scene === 'string') return null
  const staged: XpDocument = {
    ...made.document,
    scenes: {
      ...made.document.scenes,
      [name]: { ...scene, world: { ...scene.world, ground: false } },
    },
  }

  const started = startMovie({ ...made, document: staged }, name)
  return started ? { state: started, name } : null
}

/**
 * A place's set and cast, copied into a movie.
 *
 * ---------------------------------------------------------------------------
 * Copied, not referenced
 * ---------------------------------------------------------------------------
 * The alternative is a movie that *points* at the room it is filming, so the
 * film follows the level as it changes. It sounds better and it is the thing
 * that makes a shot impossible to keep: a wall moved for the sake of a jump
 * ruins a framing nobody was looking at, and the author finds out when they next
 * export. A film is a **record**; what it holds is what it holds.
 *
 * Additive rather than replacing, because importing twice is how somebody
 * builds a shot out of two rooms - and because a movie that already had a body
 * standing in it should not lose them for wanting a wall.
 *
 * ---------------------------------------------------------------------------
 * Names have to survive, because the timeline addresses by them
 * ---------------------------------------------------------------------------
 * An imported body whose name is already taken is renamed, and that is not
 * tidiness: a duplicate name is refused by `checkPlace`, and the *keys already
 * written against the existing one* would silently start applying to whichever
 * the lookup found first. So the newcomer moves, and the timeline that exists
 * keeps pointing at what it always pointed at.
 */
export function importPlace(
  state: EditState,
  into: PlaceTarget,
  from: string,
): EditState | null {
  const target = placeIn(state.document, into)
  const source = placeOf(state.document, from)
  if (!target || !source) return null
  // A place cannot import itself: every name would collide with itself and the
  // result is the same room with everything in it twice.
  if ((into ?? MAIN_SCENE) === from) return null

  if (target.world.placements.length + source.world.placements.length > MAX_PLACEMENTS) return null
  if (target.entities.length + source.entities.length > MAX_ENTITIES) return null

  const taken = new Set(target.entities.map((one) => one.name).filter(Boolean) as string[])
  /** What each imported name became, so a parent link lands on the right body. */
  const renamed = new Map<string, string>()

  const arrivals = source.entities.map((one) => {
    if (!one.name) return { ...one }
    let name = one.name
    let n = 1
    while (taken.has(name)) {
      n += 1
      name = `${one.name}-${n}`
    }
    taken.add(name)
    if (name !== one.name) renamed.set(one.name, name)
    return { ...one, name }
  })

  // Parents are names too, and an import that renamed a body without following
  // its children would leave them pointing at a name that is no longer theirs -
  // the same failure `followRename` exists for, one import earlier.
  const settled = arrivals.map((one) =>
    one.parent && renamed.has(one.parent) ? { ...one, parent: renamed.get(one.parent)! } : one,
  )

  return commit(
    state,
    writePlace(state.document, into, {
      world: {
        ...target.world,
        placements: [...target.world.placements, ...source.world.placements],
        marks: [...target.world.marks, ...source.world.marks],
      },
      entities: [...target.entities, ...settled],
    }),
  )
}

/**
 * A body brought into a shot, blueprint and all.
 *
 * ---------------------------------------------------------------------------
 * Why the movie has its own way of adding somebody
 * ---------------------------------------------------------------------------
 * The level editor's way is a picker of 3,892 models you drag into the world,
 * and it is the right tool for building a *set*. A shot needs the other half:
 * somebody to point the camera at, named, so a timeline can address them at
 * all. Those are different acts and it shows in what each needs to ask - the
 * picker asks "which of everything", and this asks "who".
 *
 * So the movie offers the **25 rigged models** and nothing else, which is the
 * whole cast the two skeletons can make: the dummy, and twenty-four peepz. A
 * crate is scenery and scenery is built in the editor, where the brush is.
 *
 * ---------------------------------------------------------------------------
 * One blueprint per model, reused
 * ---------------------------------------------------------------------------
 * Adding two foxes should be two entities and *one* blueprint, not two - a
 * blueprint is a kind of thing, and a document that grows `fox`, `fox-2`,
 * `fox-3` for three of the same animal is one where changing what a fox is
 * means changing it three times. So an existing blueprint for the model is
 * reused where there is one.
 *
 * The name is derived and always free, because this is a button: somebody
 * pressing it four times means four actors, not three and an error.
 */
export function addActor(
  state: EditState,
  model: string,
  at: { x: number; y: number; z: number },
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  if (!isKnownModel(model)) return null
  const place = placeIn(state.document, where)
  if (!place) return null

  // The blueprint this model already has, if the document has one.
  const existing = Object.entries(state.document.blueprints).find(
    ([, blueprint]) => blueprint.model === model,
  )?.[0]

  let next = state
  let blueprint = existing
  if (!blueprint) {
    // `peepz/fox` is not a blueprint name; the part after the slash is.
    const stem = (model.split('/').pop() ?? model).replace(/[^a-z0-9_-]/gi, '').toLowerCase()
    let candidate = stem || 'actor'
    let n = 1
    while (candidate in state.document.blueprints) {
      n += 1
      candidate = `${stem}-${n}`
    }
    const made = addBlueprint(state, candidate, { model })
    if (!made) return null
    next = made
    blueprint = candidate
  }

  const name = nextEntityName(next.document, blueprint, where)
  const placed = addEntity(
    next,
    {
      blueprint,
      name,
      x: snap(at.x),
      // Actors stand on the ground rather than floating at the camera's height:
      // a body placed at eye level is one whose first edit is always the same
      // correction, and nobody means "in the air" by "put someone here".
      y: snap(at.y),
      z: snap(at.z),
    },
    where,
  )

  return placed ? { state: placed, name } : null
}

/**
 * A body moved in a shot, which is three keys rather than a position.
 *
 * ---------------------------------------------------------------------------
 * Dragging in a movie means keying
 * ---------------------------------------------------------------------------
 * In the level editor, dragging something moves it: the document holds one
 * position and that is where the thing is. In a shot the document holds a
 * position *and* a timeline, and if a drag wrote the entity's own `x` it would
 * move the actor at every moment except the ones already keyed - so a shot
 * somebody had spent an afternoon on would shift underneath them and the
 * handles would appear to do nothing wherever a key already existed.
 *
 * So a drag writes keys, at the playhead. It is the only reading that is stable
 * under the thing an author does next, and it is what every editor with a time
 * axis in it does.
 *
 * ---------------------------------------------------------------------------
 * All three axes in one edit, marked
 * ---------------------------------------------------------------------------
 * Three calls to `putEntityKey` would be three undo steps for one gesture, and
 * a gizmo fires a change per frame while it is held - so it would be three per
 * frame. The `mark` is what collapses a whole drag into one step, the same
 * mechanism typing already uses, and it is keyed by actor and moment so that
 * letting go and dragging again is a new step rather than an edit of the last.
 */
export function moveActorAt(
  state: EditState,
  entity: string,
  at: number,
  to: { x: number; y: number; z: number },
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  if (!place || !timeline) return null
  if (!place.entities.some((one) => one.name === entity)) return null
  if (![to.x, to.y, to.z, at].every(Number.isFinite)) return null

  const t = Math.max(0, at)
  const bag: Tracks = timeline.tracks[entity] ?? {}
  const next: Record<string, Key[]> = { ...bag }

  for (const [property, value] of [
    ['x', to.x],
    ['y', to.y],
    ['z', to.z],
  ] as const) {
    const limits = animatable(property)!
    next[property] = putKey(bag[property], {
      t,
      value: Math.min(limits.max, Math.max(limits.min, snap(value))),
      ease: 'smooth',
    })
  }

  return writeTimeline(
    state,
    where,
    { ...timeline, tracks: { ...timeline.tracks, [entity]: next } },
    `movie:move:${entity}:${t}`,
  )
}

/**
 * A camera's framing moved, keeping everything about it except where it stands.
 *
 * The same drag, on the other kind of thing a shot has points in. Separate from
 * `putFraming` because that one takes a whole framing and is what a button
 * calls; this one is what a handle calls sixty times a second, so it carries
 * the `mark` and reads the rest of the framing out of the document rather than
 * asking a caller mid-drag to remember what the fov was.
 */
export function moveFraming(
  state: EditState,
  camera: string,
  index: number,
  to: { x: number; y: number; z: number },
  /** Whether the handle is on where it stands or on what it looks at. */
  what: 'position' | 'target' = 'position',
  where?: PlaceTarget,
): EditState | null {
  const timeline = timelineIn(state.document, where)
  const one = timeline?.cameras.find((each) => each.name === camera)
  const framing = one?.keys[index]
  if (!timeline || !one || !framing) return null
  if (![to.x, to.y, to.z].every(Number.isFinite)) return null

  const moved: Framing = { ...framing, [what]: [to.x, to.y, to.z] as const }
  const keys = [...one.keys]
  keys[index] = moved

  return writeTimeline(
    state,
    where,
    {
      ...timeline,
      cameras: timeline.cameras.map((each) => (each.name === camera ? { ...each, keys } : each)),
    },
    `movie:framing:${camera}:${index}:${what}`,
  )
}

/**
 * An empty node: something to hang things off.
 *
 * ---------------------------------------------------------------------------
 * Not a new kind of thing, and the format already says why
 * ---------------------------------------------------------------------------
 * `Blueprint.draw` was written for exactly this and its note makes the whole
 * argument: *"a `world.nodes` list would need its own naming, its own
 * uniqueness check, its own parenting, its own selection and gizmo in the
 * editor, and its own spelling in every verb that takes a target. All of that
 * exists for entities and none of it is about being visible."*
 *
 * So a node is an entity whose blueprint draws nothing. `model` stays required
 * because the editor has to draw *something* to let you grab it - it is the
 * icon for the node rather than its appearance, and `drawnModels` returns
 * nothing for it, so a movie full of them fetches no glTFs.
 *
 * ---------------------------------------------------------------------------
 * Its own blueprint, never a prop's
 * ---------------------------------------------------------------------------
 * `addActor` reuses a blueprint that already has the model, which is right for
 * props - three crates are one kind of thing. It would be wrong here: reusing a
 * *drawn* blueprint would turn every crate in the level invisible, and reusing
 * the node's would make a crate a node. So this keeps its own, named for what
 * it is.
 */
export function addNode(
  state: EditState,
  at: { x: number; y: number; z: number },
  where?: PlaceTarget,
): { state: EditState; name: string } | null {
  const place = placeIn(state.document, where)
  if (!place) return null

  const existing = Object.entries(state.document.blueprints).find(
    ([, blueprint]) => blueprint.draw === false,
  )?.[0]

  let next = state
  let blueprint = existing
  if (!blueprint) {
    let candidate = 'node'
    let n = 1
    while (candidate in state.document.blueprints) {
      n += 1
      candidate = `node-${n}`
    }
    /*
     * The icon is a small prototype cube. Which model it is barely matters -
     * nothing fetches it - but it has to be one the parser knows, and a shape
     * with an obvious middle is the one to grab a group by.
     */
    const made = addBlueprint(state, candidate, { model: NODE_ICON })
    if (!made) return null
    const marked = setBlueprint(made, candidate, { draw: false })
    if (!marked) return null
    next = marked
    blueprint = candidate
  }

  const name = nextEntityName(next.document, blueprint, where)
  const placed = addEntity(
    next,
    { blueprint, name, x: snap(at.x), y: snap(at.y), z: snap(at.z) },
    where,
  )

  return placed ? { state: placed, name } : null
}

/**
 * What a node is drawn as while it is being edited.
 *
 * A constant rather than a choice, because it is not one: the model is never
 * fetched at play and the only thing it decides is what an author grabs. One
 * answer everywhere beats a picker for a thing nobody has an opinion about.
 */
export const NODE_ICON = 'proto/Cube_Prototype_Small'

/**
 * Hang one entity off another, or set it free.
 *
 * `null` unparents. The two are one writer because they are one control - a
 * select with an empty row at the top - and because the guards are the same
 * either way: `setEntity` refuses a parent that is not in this place and one
 * that would make a loop, both of which it already checks.
 */
export function setParent(
  state: EditState,
  entity: string,
  parent: string | null,
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const index = place?.entities.findIndex((one) => one.name === entity) ?? -1
  if (!place || index < 0) return null
  // `setEntity` reads `''` as "no parent", which is the shape the select gives
  // back for its empty row - so the two agree without a third spelling.
  return setEntity(state, index, { parent: parent ?? '' }, where)
}

/**
 * Several bodies moved together, by the same amount.
 *
 * ---------------------------------------------------------------------------
 * One edit, not one per body
 * ---------------------------------------------------------------------------
 * Calling `moveActorAt` in a loop is the obvious build and it is broken in a way
 * that says nothing: every call derives its next document from the *same*
 * `state`, so the last one wins and the rest are silently discarded. That has
 * been the shape of three separate bugs in this editor already - a control and a
 * document disagreeing about which value they are about - and a loop over a
 * writer is the easiest way to write it again.
 *
 * ---------------------------------------------------------------------------
 * A delta, because they are not going to the same place
 * ---------------------------------------------------------------------------
 * `moveActorAt` takes a destination, which is right for one body under a gizmo.
 * Several bodies dragged together each keep their own offset - that is what
 * "together" means - so this takes the *shift* and applies it to wherever each
 * one already was at that moment.
 *
 * "Wherever each was" is the value at `at` with keys applied, not the entity's
 * own: a body already keyed elsewhere at this moment should move from *there*,
 * or dragging a group would collapse it onto its unkeyed poses.
 */
export function moveActorsAt(
  state: EditState,
  entities: readonly string[],
  at: number,
  by: { x: number; y: number; z: number },
  where?: PlaceTarget,
): EditState | null {
  const place = placeIn(state.document, where)
  const timeline = place?.timeline
  if (!place || !timeline || entities.length === 0) return null
  if (![by.x, by.y, by.z, at].every(Number.isFinite)) return null

  const t = Math.max(0, at)
  const tracks: Record<string, Tracks> = { ...timeline.tracks }
  let touched = false

  for (const name of entities) {
    const body = place.entities.find((one) => one.name === name)
    if (!body) continue

    const from = posedAt(body, timeline, t).entity
    const bag: Tracks = tracks[name] ?? {}
    const next: Record<string, Key[]> = { ...bag }

    for (const [property, value] of [
      ['x', from.x + by.x],
      ['y', from.y + by.y],
      ['z', from.z + by.z],
    ] as const) {
      const limits = animatable(property)!
      next[property] = putKey(bag[property], {
        t,
        value: Math.min(limits.max, Math.max(limits.min, snap(value))),
        ease: 'smooth',
      })
    }

    tracks[name] = next
    touched = true
  }

  if (!touched) return null

  return writeTimeline(
    state,
    where,
    { ...timeline, tracks },
    // One mark for the whole group, so a drag is one undo step however many
    // bodies are in it.
    `movie:move:${entities.join(',')}:${t}`,
  )
}
