'use client'

import { createContext, useContext } from 'react'
import { PACK_ORDER } from '@kxb/xp/packs'

/**
 * Which packs the open document is built out of, and how to change that.
 *
 * ---------------------------------------------------------------------------
 * Its own context rather than a field on `EditorApi`
 * ---------------------------------------------------------------------------
 * Not because the editor context is the wrong owner - it is exactly the right
 * owner, and this reads from the same state - but because the consumer is
 * `./picker`, and `./dock` already imports the picker. Putting this on
 * `EditorApi` would make the picker import the dock and the dock import the
 * picker, and a cycle between two modules that both run at import time is a
 * thing that works until the day a bundler orders them the other way round.
 *
 * ---------------------------------------------------------------------------
 * Why the default is "everything, and you cannot change it"
 * ---------------------------------------------------------------------------
 * The same reasoning as the dock's `Navigate`: a picker rendered outside an
 * editor - a test, the day one of these is used somewhere else - should still
 * draw every model rather than draw nothing. Showing all of them is the honest
 * fallback, because "which packs is this document made of" has no answer when
 * there is no document, and an empty grid would look like a broken panel
 * rather than an unanswered question.
 */
export interface PackScope {
  /** Pack ids the document declares, in `PACK_ORDER`. */
  declared: readonly string[]
  /** Say the document is built out of this pack. Null outside an editor. */
  add: ((packId: string) => void) | null
  /** Stop saying so. Refused by `removePack` while the level still uses it. */
  remove: ((packId: string) => void) | null
  /** How many placements and blueprints are made of this pack. */
  use: (packId: string) => number
}

const EVERYTHING: PackScope = {
  declared: PACK_ORDER as readonly string[],
  add: null,
  remove: null,
  use: () => 0,
}

const Scope = createContext<PackScope>(EVERYTHING)

export function PackScopeProvider({
  value,
  children,
}: {
  value: PackScope
  children: React.ReactNode
}) {
  return <Scope.Provider value={value}>{children}</Scope.Provider>
}

export function usePackScope(): PackScope {
  return useContext(Scope)
}
