/**
 * Where somebody was when they last stopped playing.
 *
 * The first thing the `persistence` port is asked to remember, and deliberately
 * the smallest: one key, `player` scope, one position. docs/xp/state.md §7 is
 * the storage side; this is what goes in it and, more importantly, *when it is
 * read back*.
 *
 * ---------------------------------------------------------------------------
 * A room resumes. A race and a match do not.
 * ---------------------------------------------------------------------------
 * Asked for in exactly those words, and it is a rule about what the level *is*
 * rather than about saving:
 *
 *   - **A race starts at the start.** A course with a start and a finish is
 *     timed, and a run that began three checkpoints in is not a run. Resuming
 *     there would not be a convenience, it would be a leaderboard nobody can
 *     trust — and the person it flatters did not ask for that.
 *   - **A match starts everybody together.** Two sides beginning in different
 *     places because one of them played yesterday is not a match starting, it
 *     is a match already in progress.
 *   - **A room puts you back where you were.** A world you wander into and out
 *     of over a week is the case the whole feature exists for.
 *
 * So the question is answered from the document — what it declares it is for —
 * and never from whether a save happens to exist. A level that stops being a
 * race becomes one that resumes, which is the right way round: the author
 * changed what the level is.
 *
 * ---------------------------------------------------------------------------
 * The scene travels with the position, before scenes exist
 * ---------------------------------------------------------------------------
 * A multi-scene level checkpointed in the third scene has to come back to the
 * third scene, not to the third scene's coordinates in the first one. Scenes
 * are designed and unbuilt (docs/xp/scenes.md §1, backlog §0.2), so nothing
 * writes this field today and everything reads it as absent.
 *
 * It is here anyway because the alternative is a stored shape that has to be
 * migrated the day scenes land — and the rows it would have to be migrated *in*
 * belong to players, in projects we do not own, written by documents somebody
 * else wrote. A field nobody fills costs a line; a migration over other
 * people's saves costs an afternoon and some of them.
 */

import type { XpCapabilities } from '../document/capabilities'
import type { Preset, XpRules } from '../document/rules'

/** One key, so a store holding several things keeps them apart by name. */
export const PROGRESS_KEY = 'player:progress'

export interface XpProgress {
  /**
   * Which scene this position is in, once a document can have more than one.
   *
   * A key of the document's `scenes` table. Absent means the document itself,
   * which is every level today.
   */
  scene?: string
  /** Where to put the body. The same shape `returnTo` already takes. */
  at: { x: number; y: number; z: number; facing: number }
  /**
   * Which checkpoint this was, when the pad said.
   *
   * Stored so a resume can be compared against a *later* pad rather than only
   * replaced: the engine already decided highest-wins for a run in progress
   * (see `applyVerbs`), and a saved run that is behind the one you are having
   * should not overwrite it when you touch pad two.
   */
  order?: number
}

/** Presets that are a game between people rather than a place to be in. */
const MATCH_PRESETS: readonly Preset[] = ['deathmatch', 'football', 'shooter']

/**
 * Does this document put somebody back where they were?
 *
 * Read from what the level declares rather than from what is stored, so the
 * answer is the same for a player who has never been here and one who has.
 */
export function resumes(rules: XpRules, capabilities: XpCapabilities): boolean {
  if (capabilities.includes('competition')) return false
  if (capabilities.includes('match')) return false
  return !MATCH_PRESETS.includes(rules.preset)
}

/**
 * What came back from the store, checked.
 *
 * The same treatment the editor's `localStorage` draft gets and for the same
 * reason: it is our own value and it is still untrusted input. It was written
 * by an older version of this code, or by a document that has since changed
 * shape, or by somebody who edited their own row — the store is keyed to the
 * player and the player may write it.
 *
 * A value that does not read as progress is dropped rather than repaired.
 * Starting at the spawn is a working session; a body placed at `NaN` is a
 * camera pointing at nothing and a level that looks broken.
 */
export function readProgress(value: unknown): XpProgress | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  const raw = value as { scene?: unknown; at?: unknown; order?: unknown }
  const at = raw.at
  if (at === null || typeof at !== 'object') return null

  const point = at as { x?: unknown; y?: unknown; z?: unknown; facing?: unknown }
  if (
    !finite(point.x) ||
    !finite(point.y) ||
    !finite(point.z) ||
    !finite(point.facing)
  ) {
    return null
  }

  return {
    ...(typeof raw.scene === 'string' && raw.scene.length > 0 ? { scene: raw.scene } : {}),
    at: { x: point.x, y: point.y, z: point.z, facing: point.facing },
    ...(finite(raw.order) ? { order: raw.order } : {}),
  }
}

/** `NaN` and `Infinity` are numbers, and neither is a place. */
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
