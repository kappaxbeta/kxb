/**
 * `@kxb/boxing/art` - which pixels go with which move.
 *
 * ---------------------------------------------------------------------------
 * The one place frames and seconds meet
 * ---------------------------------------------------------------------------
 * `../rules/moves.ts` is in seconds and says why: the host owns the clock and a
 * move written in frames changes length on a 144Hz monitor. The art is in
 * frames, because it is drawn that way. This file is the join, and it is the
 * only file in the package that knows both - which is what keeps the simulation
 * testable with no notion that a sprite exists.
 *
 * It holds no pixels and imports no image. `frameOf` returns *which cell of the
 * atlas*, and the renderer - the host's job, in the app - turns that into
 * texture offsets. Same line `@kxb/xp` draws when it says the engine returns
 * numbers and the host draws them.
 *
 * ---------------------------------------------------------------------------
 * A character owns its own atlas, and the two we ship agree about nothing
 * ---------------------------------------------------------------------------
 * This started as one global clip list, which was right for exactly as long as
 * there was one fighter. The second pack has 68x61 cells against the first's
 * 102x67, a two-frame jab against a four-frame one, six clips with different
 * names, and one - `body-hook` - that the first does not have at all.
 *
 * So there is no shared sheet and no shared frame count. What *is* shared is
 * `CLIP_FOR`: the map from a move the rules know to the clip names that could
 * draw it, in preference order. A character supplies the clips it has, and
 * `frameOf` picks the first one that exists. That is what lets the second
 * fighter's single jab stand in for the first's two without a branch anywhere.
 *
 * ---------------------------------------------------------------------------
 * Every number below `figure` was measured, not chosen
 * ---------------------------------------------------------------------------
 * By walking the alpha channel of each atlas - see `scripts/boxing-assets.ts`.
 * A sprite is mostly empty space, and where the *figure* sits inside its cell
 * is what decides whether a fighter stands on the canvas or floats above it.
 * Two packs put it in two different places, and neither says so anywhere.
 */

import { MOVES, durationOf, type MoveName } from '../rules/moves'

/**
 * How tall a fighter is, in metres.
 *
 * The drawn figure, not the cell. Each character's `figure.height` is how many
 * pixels that is in its own atlas, and everything else about its size on screen
 * falls out of the two - which is the only way two packs drawn at different
 * scales end up the same height in the ring.
 */
export const FIGHTER_METRES = 1.8

export type Fit =
  /** Runs continuously at a fixed rate. Idle, walking, a held guard. */
  | { kind: 'loop'; fps: number }
  /**
   * Stretched across the whole move.
   *
   * So a 720ms overhand plays its frames slowly and a 250ms jab plays them
   * quickly. That is what makes a slow punch *look* slow, which is the only
   * warning a defender gets.
   */
  | { kind: 'move' }
  /**
   * A fixed length, then hold the last frame.
   *
   * For the moves whose duration is a *timer* rather than an animation: a
   * knockdown is 2.4 seconds of being counted over, and stretching a
   * seven-frame fall across it would be a boxer descending in slow motion.
   */
  | { kind: 'seconds'; over: number }

export interface Clip {
  /** Ours. The key `CLIP_FOR` names, and the atlas row order. */
  name: string
  /** The file in that pack's separate-animations folder, without `.png`. */
  file: string
  frames: number
  fit: Fit
}

export interface Character {
  id: string
  label: string
  /**
   * The file in this package's `assets/`, by name. Joined with whatever base
   * the host serves them from - see `characters.ts`.
   */
  atlas: string
  /** One cell, in pixels. */
  frame: { width: number; height: number }
  /** Where the drawn figure sits inside a cell. Measured. */
  figure: {
    /** The figure's own height in pixels, which `FIGHTER_METRES` is spread over. */
    height: number
    /** Pixels of empty cell below its feet. What stops it floating. */
    feet: number
  }
  clips: readonly Clip[]
}

/**
 * Which clips can draw which move, best first.
 *
 * Shared by every character. The second and later entries are *alternates* -
 * the other jab, the other slip, the body hook - and a character that has none
 * of them simply falls through to the first.
 *
 * A boxer who throws the identical frames every jab reads as a sprite rather
 * than a person, and both packs drew the other hand for exactly this. Which one
 * is used comes from a counter the renderer keeps rather than a random number:
 * this package is deterministic, and two clients disagreeing about which glove
 * was out would be two clients drawing different fights.
 */
export const CLIP_FOR: Record<MoveName, readonly string[]> = {
  idle: ['idle'],
  walkIn: ['walkIn'],
  walkOut: ['walkOut'],
  dashIn: ['dashIn'],
  dashOut: ['dashOut'],
  jab: ['jab', 'jab2'],
  cross: ['cross'],
  hook: ['hook', 'bodyHook'],
  uppercut: ['uppercut'],
  overhand: ['overhand'],
  block: ['block'],
  parry: ['parry', 'parry2'],
  slip: ['slip', 'slip2'],
  hurt: ['hurt', 'hurt2'],
  stunned: ['stunned'],
  down: ['down'],
  out: ['out'],
  won: ['won'],
}

export interface Cell {
  column: number
  row: number
}

/** Row lookups, built once per character rather than per frame. */
const indices = new WeakMap<Character, Map<string, { clip: Clip; row: number }>>()

function indexOf(character: Character): Map<string, { clip: Clip; row: number }> {
  let index = indices.get(character)
  if (!index) {
    index = new Map(character.clips.map((clip, row) => [clip.name, { clip, row }]))
    indices.set(character, index)
  }
  return index
}

/**
 * The cell to draw, for a move that began `elapsed` seconds ago.
 *
 * `take` picks between alternates - hand it a counter that goes up once per
 * move and the jabs alternate hands.
 *
 * Clamped at both ends. A negative `elapsed` is not supposed to happen and does:
 * a `since` reconstructed from another machine's packet can land a frame ahead
 * of our own clock. Unclamped, that is a texture offset off the top of the
 * atlas, which draws as a transparent square - a fighter who vanishes for one
 * frame with nothing logged anywhere.
 */
export function frameOf(
  character: Character,
  move: MoveName,
  elapsed: number,
  take = 0,
): Cell {
  const index = indexOf(character)
  const options = CLIP_FOR[move].filter((name) => index.has(name))
  // Falling back to `idle` rather than throwing: a character missing a clip is
  // a pack we have not finished importing, and a fighter who stands still for
  // one move is a bug somebody can see and fix. A thrown error mid-round is a
  // black canvas.
  const chosen = options.length > 0 ? options[Math.abs(take) % options.length]! : 'idle'
  const found = index.get(chosen) ?? index.get('idle')
  if (!found) return { column: 0, row: 0 }

  const { clip, row } = found
  const age = Math.max(0, elapsed)
  const last = clip.frames - 1

  switch (clip.fit.kind) {
    case 'loop':
      return { column: Math.floor(age * clip.fit.fps) % clip.frames, row }
    case 'seconds':
      return { column: Math.min(last, Math.floor((age / clip.fit.over) * clip.frames)), row }
    case 'move': {
      // `durationOf` can be zero - `idle` and the walks are zero-length by
      // design, and dividing by it would be a NaN column. Those all loop, so
      // this is unreachable today and one edit away from not being.
      const over = durationOf(MOVES[move]) || 0.2
      return { column: Math.min(last, Math.floor((age / over) * clip.frames)), row }
    }
  }
}

// ---------------------------------------------------------------------------
// How big it is, and where it stands
// ---------------------------------------------------------------------------

/** Metres per pixel for this character, so both fighters end up the same height. */
export const scaleOf = (character: Character): number =>
  FIGHTER_METRES / character.figure.height

/** The quad to draw, in metres. Wider and taller than the fighter - cells have margins. */
export function quadOf(character: Character): { width: number; height: number } {
  const scale = scaleOf(character)
  return {
    width: character.frame.width * scale,
    height: character.frame.height * scale,
  }
}

/**
 * How far above the canvas the quad's *centre* belongs.
 *
 * Not half its height: the figure's feet are some way up from the bottom of the
 * cell, by a different amount in each pack, and centring the quad on the floor
 * hangs one fighter in the air and buries the other's ankles.
 */
export function liftOf(character: Character): number {
  const scale = scaleOf(character)
  return quadOf(character).height / 2 - character.figure.feet * scale
}

/** The atlas grid, derived so a renderer's UV maths and the build script agree. */
export const columnsOf = (character: Character): number =>
  Math.max(...character.clips.map((clip) => clip.frames))

export const rowsOf = (character: Character): number => character.clips.length
