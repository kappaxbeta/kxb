'use client'

import { useSyncExternalStore } from 'react'

/**
 * The level's own numbers, published out of the scene.
 *
 * Placements, entities, solid cells, scripts and a coordinate are *developer*
 * furniture. They were drawn in the corner of the level at a third of the
 * emphasis - already a compromise, and still four lines of geometry in front of
 * somebody trying to read whose turn it is. They belong in a panel you open,
 * not on the screen you play on.
 *
 * The same seam and the same argument as `match-store` and `here-store`: the
 * rail renders above this route and can never see it, so the scene writes and
 * the rail reads, and neither imports the other.
 *
 * Two of these numbers only exist at runtime - `entities` is the live list and
 * `cells` is the built collision set - which is why this is published from the
 * scene rather than computed from the document by whatever renders it. The note
 * at the scene's call site makes the same point: handing the HUD the whole
 * document made the third number disagree with the other two.
 */

export interface SceneDebug {
  /** The level's name, so the panel says what the numbers are about. */
  name: string
  placements: number
  entities: number
  cells: number
  /** "no scripts", or how many are named. The scene's own phrasing. */
  scripts: string
  /** Where you are standing, rounded by the reader rather than here. */
  at: { x: number; y: number; z: number } | null
  /**
   * Which way you are pointing, in the document's degrees. Zero looks along +z.
   *
   * Beside `at` rather than inside it, because they answer different questions
   * and one of them can be missing on its own - a coordinate is what the body
   * has and a bearing is what the *camera* has, and a level watched from a
   * fixed chair has a body that does not turn to face where the shot goes.
   */
  facing: number | null
}

let current: SceneDebug | null = null
const listeners = new Set<() => void>()

/**
 * Same numbers? Then nothing to re-render for.
 *
 * `useSyncExternalStore` compares snapshots by identity, and the position
 * changes every frame somebody walks - so publishing a fresh object each time
 * would wake the whole rail at frame rate. The coordinate is compared rounded
 * to one decimal, which is what the panel prints: below that the difference is
 * invisible and re-rendering for it is pure cost.
 */
function unchanged(a: SceneDebug | null, b: SceneDebug | null): boolean {
  if (a === null || b === null) return a === b

  const place = (one: SceneDebug) =>
    one.at ? `${one.at.x.toFixed(1)} ${one.at.y.toFixed(1)} ${one.at.z.toFixed(1)}` : ''

  // Whole degrees, which is what the panel prints - and coarser than the
  // coordinate on purpose: turning is continuous, so comparing a bearing at a
  // decimal would wake the rail on every frame of every mouse movement.
  const bearing = (one: SceneDebug) => (one.facing === null ? '' : Math.round(one.facing))

  return (
    a.name === b.name &&
    a.placements === b.placements &&
    a.entities === b.entities &&
    a.cells === b.cells &&
    a.scripts === b.scripts &&
    place(a) === place(b) &&
    bearing(a) === bearing(b)
  )
}

/** Called by the scene. Pass null on the way out. */
export function publishSceneDebug(next: SceneDebug | null): void {
  if (unchanged(current, next)) return
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): SceneDebug | null {
  return current
}

/** Null on the server: no scene has run yet, and there is nothing to hydrate. */
function serverSnapshot(): null {
  return null
}

/** The level being drawn right now, or null when there is none. */
export function useSceneDebug(): SceneDebug | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
