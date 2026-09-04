import { DEFAULT_MODEL, isBuildable } from '@/domain/builder/catalogue'
import { isPlaceable } from '@/domain/builder/props'
import type { Cell } from '@/domain/builder/draw'
import { DEFAULT_LIGHT, type LightSpec, type Vec3 } from '@/domain/studio/scene'

/**
 * A built world, as a document.
 *
 * The scene studio's sibling, and deliberately not its extension. A
 * `StudioScene` is a handful of pieces posed for one photograph - three peeps,
 * two crates, a camera - and everything about it assumes you are placing them
 * one at a time from a panel of sliders. This is the other thing: a few
 * thousand cells laid down by dragging, out of every model we ship rather than
 * the 58 the lounge allows.
 *
 * Trying to make one document do both was the first attempt and it fell over
 * on the allow-list. `StudioScene.blocks` validates against
 * `isKnownModel` - the lounge's palette, which guards an immutable event log -
 * and widening that to 1308 models to serve a marketing render would have
 * loosened the check that actually matters. Two documents, two allow-lists,
 * one shared renderer.
 *
 * ---------------------------------------------------------------------------
 * Why this one is not in the URL
 * ---------------------------------------------------------------------------
 * The studio's scene is a link, and the note in `@/domain/studio/scene` about
 * why is still right - for a scene. It does not survive contact with this: one
 * drag of the wall tool is four hundred placements, and a world that fills the
 * grid is well past what a browser will keep in an address bar, let alone what
 * anybody can paste into a message.
 *
 * So a world is a file. It autosaves to localStorage as you build - the editor
 * is a tool an admin runs on their own machine, and losing an afternoon's
 * building to a refresh is the only unforgivable bug a builder can have - and
 * Save writes a `.json` you keep wherever you keep things. Still no table, no
 * migration and no permission story, for the same reason as the studio.
 */

/** One model, in one cell, turned and sized. */
export interface Placement {
  model: string
  /** Cell coordinates. `y` is the floor level; 0 is the ground plane. */
  x: number
  y: number
  z: number
  /** Turn about Y, in degrees - the editor's unit, not three.js's. */
  rotation: number
  /**
   * Multiplied on top of the pack's own scale.
   *
   * One means "whatever this pack says a cell is", which is right for almost
   * everything. It exists for the times a bench wants to be a landmark.
   */
  scale: number
}

/** The floor: a slab of one model, or nothing at all. */
export interface WorldGround {
  cols: number
  rows: number
  model: string
  /** Nibble the corners into an ellipse, rather than leaving a rectangle. */
  rounded: boolean
}

/**
 * One of the two coloured lights standing in the world.
 *
 * The shared `Rig` has always had a pair of these - a magenta one behind and to
 * the left, a cyan one in front and to the right - and they are most of why the
 * marketing stills look like anything: a flat-shaded voxel world lit by one sun
 * is a diagram, and two tinted lights at opposing angles is a photograph.
 *
 * They were hardcoded, and the only knob was `light.rim`, which moved both at
 * once and could not change either colour. This is the same pair, in the
 * document: an angle, a height, a colour and how bright it is relative to the
 * other. `light.rim` stays as the master - turning it down still dims the pair
 * together, which is what it always meant.
 */
export interface WorldLamp {
  /** Where it stands, in degrees round the world. Same convention as the sun. */
  azimuth: number
  /** How high it hangs, in cells. */
  height: number
  /** CSS hex. */
  color: string
  /** Relative to the other lamp, before `light.rim` scales them both. */
  intensity: number
}

/**
 * The pair the fixed rig used to have, to the number.
 *
 * Reproduced exactly - the same colours, the same positions, and intensities of
 * 1 and 0.5 against the multipliers that were baked in (90 and 45) - so a world
 * saved before these existed looks identical after them.
 */
export const DEFAULT_LAMPS: [WorldLamp, WorldLamp] = [
  { azimuth: -129, height: 6, color: '#f0abfc', intensity: 1 },
  { azimuth: 39, height: 4, color: '#67e8f9', intensity: 0.5 },
]

/** What one lamp is worth as a three.js intensity, master dial included. */
export const LAMP_SCALE = 90

/**
 * A goal or a race mark, standing in a built world.
 *
 * The lounge has had these for as long as it has had football and races: a
 * frame you run through, with a kind - `red` and `blue` are the two ends of a
 * pitch, `start` and `finish` are the two ends of a race (see
 * `@/domain/lounge/goal-events`). What they were missing was a way to be *part
 * of a world* rather than something somebody stands up by hand afterwards.
 *
 * Which is what makes a published race a race. A parkour course whose finish
 * line is a red block is a decoration; one whose finish is a `finish` mark ends
 * a match when somebody runs through it - and a match that ends is what credits
 * the world as one that works (see `approve_world_from_match`).
 *
 * Shaped like the command it becomes, deliberately. `addWorldToSpace` turns
 * each of these into a `PlaceGoal`, and a document field that had to be
 * translated on the way would be a field that could be translated wrongly.
 */
export interface WorldMark {
  kind: 'red' | 'blue' | 'start' | 'finish'
  x: number
  y: number
  z: number
  width: number
  height: number
  /** Quarter turns about Y, exactly as a goal's is. */
  facing: number
}

/** What a fresh mark is, before anybody resizes it. A doorway, roughly. */
export const DEFAULT_MARK = { width: 4, height: 3, facing: 0 } as const

export interface BuilderWorld {
  /** What the file is called and what the export is named after. */
  name: string
  /** Delivered pixel size of a PNG export. */
  width: number
  height: number
  camera: { position: Vec3; target: Vec3; fov: number }
  ground: WorldGround | null
  placements: Placement[]
  light: LightSpec
  /** The two coloured lights standing in it. See `WorldLamp`. */
  lamps: [WorldLamp, WorldLamp]
  /** Goals and race marks. See `WorldMark`. */
  marks: WorldMark[]
  /**
   * Where people come in, in cells. Null means the middle.
   *
   * Only two numbers: the height is not stored because it is not a decision -
   * it is whatever the ground happens to be at that column when somebody
   * arrives, which is a thing the world knows better than the person who marked
   * the door. See `surfaceAt` in the lounge's spawn module.
   *
   * It travels with the world into a space (see `world_spawns`), which is the
   * whole reason it is in the document rather than a builder-only preference: a
   * carefully laid-out arena whose visitors all appear in the same corner of it
   * is a layout nobody sees.
   */
  spawn: { x: number; z: number } | null
  /** Painted behind everything, or transparent when null. */
  background: string | null
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Half-width of the buildable lattice. A 161-cell square, which is a big world. */
export const GRID_REACH = 80

/** How high you may build, and how far you may dig. */
export const MAX_LEVEL = 40
export const MIN_LEVEL = -8

/**
 * The most placements one world may hold.
 *
 * Not a rule about taste - it is the number past which the editor stops being
 * usable, because every placement is a cloned glTF in the scene graph. Reached
 * by dragging, which is why the stroke cap in ./draw is the smaller number:
 * that one keeps a single mistake from being catastrophic, and this one keeps
 * an afternoon of correct decisions from being the same thing.
 */
export const MAX_PLACEMENTS = 20000

export const DEFAULT_WORLD: BuilderWorld = {
  name: 'world',
  width: 1920,
  height: 1080,
  camera: { position: [18, 14, 22], target: [0, 1, 0], fov: 38 },
  ground: { cols: 25, rows: 25, model: DEFAULT_MODEL, rounded: false },
  placements: [],
  light: DEFAULT_LIGHT,
  lamps: DEFAULT_LAMPS,
  marks: [],
  // The middle, which is where the lounge has always put people.
  spawn: null,
  // Transparent, like the studio's export. A cut-out standing on a page reads
  // as a place; a rectangle of sky reads as a screenshot.
  background: null,
}

// ---------------------------------------------------------------------------
// Cells and placements
// ---------------------------------------------------------------------------

/** The key a cell is indexed under. Three integers, so it is stable and sortable. */
export function cellKey(cell: { x: number; y: number; z: number }): string {
  return `${cell.x},${cell.y},${cell.z}`
}

/** Whether a cell is inside the lattice at all. */
export function inBounds(cell: Cell): boolean {
  return (
    Math.abs(cell.x) <= GRID_REACH &&
    Math.abs(cell.z) <= GRID_REACH &&
    cell.y >= MIN_LEVEL &&
    cell.y <= MAX_LEVEL
  )
}

/**
 * Lay cells down, replacing whatever was in them.
 *
 * One cell holds one model. Stacking two in a cell was the other option and it
 * is the wrong one for a *builder*: you paint over a wall to change its
 * material, and if painting layered instead of replaced then every correction
 * would double the scene until the tab died - with the old model still visible
 * inside the new one the whole time.
 *
 * Returns a new list. The editor's undo stack holds whole worlds, and it can
 * only do that safely if nothing here mutates the one it was given.
 */
export function place(
  placements: readonly Placement[],
  cells: readonly Cell[],
  spec: { model: string; rotation: number; scale: number },
): Placement[] {
  const byCell = new Map(placements.map((placement) => [cellKey(placement), placement]))

  for (const cell of cells) {
    if (!inBounds(cell)) continue
    byCell.set(cellKey(cell), {
      model: spec.model,
      x: cell.x,
      y: cell.y,
      z: cell.z,
      rotation: spec.rotation,
      scale: spec.scale,
    })
  }

  const out = [...byCell.values()]
  // Trimmed from the front, so the oldest work is what goes. Which is the
  // wrong end for the person building - but the alternative is dropping the
  // stroke they just drew, and a tool that silently refuses the thing you just
  // did reads as broken. The editor warns when this bites.
  return out.length > MAX_PLACEMENTS ? out.slice(out.length - MAX_PLACEMENTS) : out
}

/** Rub cells out. */
export function erase(placements: readonly Placement[], cells: readonly Cell[]): Placement[] {
  const gone = new Set(cells.map(cellKey))
  return placements.filter((placement) => !gone.has(cellKey(placement)))
}

/** What is standing in a cell, if anything. */
export function at(placements: readonly Placement[], cell: Cell): Placement | undefined {
  const key = cellKey(cell)
  return placements.find((placement) => cellKey(placement) === key)
}

/**
 * The highest occupied level in a column, or null when it is empty.
 *
 * What the brush uses to stack: clicking a block puts the next one on top of
 * it rather than inside it, which is the behaviour every voxel editor has and
 * the one thing people notice immediately when it is missing.
 */
export function columnTop(
  placements: readonly Placement[],
  x: number,
  z: number,
): number | null {
  let top: number | null = null
  for (const placement of placements) {
    if (placement.x !== x || placement.z !== z) continue
    if (top === null || placement.y > top) top = placement.y
  }
  return top
}

/**
 * The floor, as placements.
 *
 * Generated rather than stored - the document holds four numbers and this
 * expands them - which is why it lives here rather than in the editor that
 * draws it: the exporter has to lay the same floor the editor shows, and two
 * copies of this loop would be two floors that agree until somebody changes
 * one.
 *
 * Level -1, so the ground's top face is y=0 and building starts on it.
 */
export function groundPlacements(ground: WorldGround | null): Placement[] {
  if (!ground) return []

  const halfX = Math.floor(ground.cols / 2)
  const halfZ = Math.floor(ground.rows / 2)
  const out: Placement[] = []

  for (let x = -halfX; x < ground.cols - halfX; x += 1) {
    for (let z = -halfZ; z < ground.rows - halfZ; z += 1) {
      if (ground.rounded) {
        // Nibbled into an ellipse inscribed in the slab, so a patch stops
        // roundly rather than raggedly. Same shape the marketing stills use.
        const dx = (x + 0.5) / (ground.cols / 2)
        const dz = (z + 0.5) / (ground.rows / 2)
        if (dx * dx + dz * dz > 1) continue
      }
      out.push({ model: ground.model, x, y: -1, z, rotation: 0, scale: 1 })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------------

/**
 * A number, or the fallback. Clamped rather than rejected.
 *
 * Same reasoning as the studio's: the input here is a JSON file somebody may
 * have hand-edited, and a silly value should give a silly world rather than an
 * error page. The bounds exist so a bad file cannot ask for a hundred-thousand
 * block ground plane.
 */
function number(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(number(value, fallback, min, max))
}

function vec3(value: unknown, fallback: Vec3, limit: number): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  return [
    number(value[0], fallback[0], -limit, limit),
    number(value[1], fallback[1], -limit, limit),
    number(value[2], fallback[2], -limit, limit),
  ]
}

/** CSS hex, three or six digits. */
const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i

function placement(value: unknown): Placement | null {
  const raw = (value ?? {}) as Record<string, unknown>
  // An unknown model has no sensible substitute: the renderer would fetch a
  // glTF that is not there and suspend forever, taking the whole world's
  // Suspense boundary with it. Dropped, exactly as the studio drops a block.
  //
  // `isPlaceable` rather than `isBuildable`: a placement may be a prop out of
  // the level catalogue as well as a model out of the world's own. See
  // ./props.ts for what widened and what deliberately did not.
  if (typeof raw.model !== 'string' || !isPlaceable(raw.model)) return null

  const cell = {
    x: integer(raw.x, 0, -GRID_REACH, GRID_REACH),
    y: integer(raw.y, 0, MIN_LEVEL, MAX_LEVEL),
    z: integer(raw.z, 0, -GRID_REACH, GRID_REACH),
  }

  return {
    model: raw.model,
    ...cell,
    rotation: number(raw.rotation, 0, -360, 360),
    scale: number(raw.scale, 1, 0.05, 20),
  }
}

function ground(value: unknown): WorldGround | null {
  if (value === null) return null
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    cols: integer(raw.cols, 25, 1, GRID_REACH * 2 + 1),
    rows: integer(raw.rows, 25, 1, GRID_REACH * 2 + 1),
    // Still the world catalogue only, unlike a placement. The ground is a slab
    // of one model repeated over every cell of a rectangle, which is a thing
    // only a floor tile is: a ground of chests is thousands of chests, and the
    // control that sets it is a floor picker rather than a prop picker.
    model: typeof raw.model === 'string' && isBuildable(raw.model) ? raw.model : DEFAULT_MODEL,
    rounded: raw.rounded === true,
  }
}

function light(value: unknown): LightSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    azimuth: number(raw.azimuth, DEFAULT_LIGHT.azimuth, -180, 180),
    elevation: number(raw.elevation, DEFAULT_LIGHT.elevation, 2, 89),
    sun: number(raw.sun, DEFAULT_LIGHT.sun, 0, 8),
    ambient: number(raw.ambient, DEFAULT_LIGHT.ambient, 0, 4),
    hemisphere: number(raw.hemisphere, DEFAULT_LIGHT.hemisphere, 0, 4),
    rim: number(raw.rim, DEFAULT_LIGHT.rim, 0, 4),
  }
}

function lamp(value: unknown, fallback: WorldLamp): WorldLamp {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    azimuth: number(raw.azimuth, fallback.azimuth, -180, 180),
    height: number(raw.height, fallback.height, -8, 60),
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color : fallback.color,
    // Capped rather than unbounded: a lamp at 10,000 is not a lighting choice,
    // it is a white screen, and this parses files people hand-edit.
    intensity: number(raw.intensity, fallback.intensity, 0, 6),
  }
}

const MARK_KINDS = new Set(['red', 'blue', 'start', 'finish'])

/**
 * One mark, clamped.
 *
 * The size bounds match `MIN_GOAL_SIZE`/`MAX_GOAL_SIZE` rather than importing
 * them, because that module is the lounge's and this one is the builder's -
 * they are two documents with two allow-lists, which is the split the header of
 * this file is about. The numbers are checked again by the goal decider when
 * the mark becomes a real goal, which is where getting it wrong would matter.
 */
function mark(value: unknown): WorldMark | null {
  const raw = (value ?? {}) as Record<string, unknown>
  if (typeof raw.kind !== 'string' || !MARK_KINDS.has(raw.kind)) return null

  return {
    kind: raw.kind as WorldMark['kind'],
    x: integer(raw.x, 0, -GRID_REACH, GRID_REACH),
    y: integer(raw.y, 0, MIN_LEVEL, MAX_LEVEL),
    z: integer(raw.z, 0, -GRID_REACH, GRID_REACH),
    width: integer(raw.width, DEFAULT_MARK.width, 1, 24),
    height: integer(raw.height, DEFAULT_MARK.height, 1, 24),
    facing: integer(raw.facing, 0, 0, 3),
  }
}

/** The door, clamped into the lattice. Anything unreadable means "the middle". */
function spawn(value: unknown): { x: number; z: number } | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.x !== 'number' || typeof raw.z !== 'number') return null
  return {
    x: integer(raw.x, 0, -GRID_REACH, GRID_REACH),
    z: integer(raw.z, 0, -GRID_REACH, GRID_REACH),
  }
}

/**
 * A world document from whatever was in the file.
 *
 * Never throws and never returns a partial world: every field either survives
 * validation or is replaced.
 */
export function parseWorld(value: unknown): BuilderWorld {
  const raw = (value ?? {}) as Record<string, unknown>
  const camera = (raw.camera ?? {}) as Record<string, unknown>

  const placements = Array.isArray(raw.placements)
    ? raw.placements
        .slice(0, MAX_PLACEMENTS)
        .map(placement)
        .filter((entry): entry is Placement => entry !== null)
    : []

  // Two placements in one cell is not expressible by the editor but is
  // expressible in a file, and the renderer would draw both - so the last one
  // written wins, which is the same rule `place` follows.
  const byCell = new Map(placements.map((entry) => [cellKey(entry), entry]))

  return {
    name:
      typeof raw.name === 'string' && raw.name.trim().length > 0
        ? raw.name.trim().slice(0, 60)
        : DEFAULT_WORLD.name,
    width: integer(raw.width, DEFAULT_WORLD.width, 64, 4096),
    height: integer(raw.height, DEFAULT_WORLD.height, 64, 4096),
    camera: {
      position: vec3(camera.position, DEFAULT_WORLD.camera.position, 400),
      target: vec3(camera.target, DEFAULT_WORLD.camera.target, 400),
      fov: number(camera.fov, DEFAULT_WORLD.camera.fov, 5, 120),
    },
    ground: ground(raw.ground),
    placements: [...byCell.values()],
    light: light(raw.light),
    // Always a pair. A file with one lamp, or none, gets the other from the
    // defaults rather than rendering a world lit differently from the one that
    // was saved - the count is part of the rig, not part of the content.
    lamps: [
      lamp(Array.isArray(raw.lamps) ? raw.lamps[0] : undefined, DEFAULT_LAMPS[0]),
      lamp(Array.isArray(raw.lamps) ? raw.lamps[1] : undefined, DEFAULT_LAMPS[1]),
    ],
    // Capped at a dozen: a world is a place with a couple of goals in it, and
    // a file claiming two hundred is a file that would spend a minute writing
    // one command per mark into somebody's space.
    marks: Array.isArray(raw.marks)
      ? raw.marks.slice(0, 12).map(mark).filter((entry): entry is WorldMark => entry !== null)
      : [],
    spawn: spawn(raw.spawn),
    background:
      typeof raw.background === 'string' && HEX.test(raw.background) ? raw.background : null,
  }
}

/** The document as a file's worth of bytes. Pretty-printed, because it is a file people open. */
export function serialiseWorld(world: BuilderWorld): string {
  return JSON.stringify(world, null, 2)
}

/** The inverse, for a string that may be anything at all. */
export function deserialiseWorld(text: string): BuilderWorld {
  try {
    return parseWorld(JSON.parse(text))
  } catch {
    return DEFAULT_WORLD
  }
}
