'use client'

import { useSyncExternalStore } from 'react'
import {
  type BuilderWorld,
  deserialiseWorld,
  serialiseWorld,
} from '@/domain/builder/world'

/**
 * Where a world lives between sessions.
 *
 * localStorage, and the reasoning is the same as the studio's for putting a
 * scene in the URL: these are marketing renders, not user data. Nothing
 * downstream reads them, the exported PNG and the share link are the artefacts,
 * and the person building is an admin on their own machine. A table for that
 * would be a migration, a set of actions and a permission story in service of a
 * working file.
 *
 * What localStorage buys over the URL - which is what the studio does - is
 * size. A built world is thousands of placements; see the note in
 * `@/domain/builder/world` about why that is not an address bar.
 *
 * The honest cost is that a world lives on one machine in one browser. Save
 * writes a `.json` you keep wherever you keep things, and that is the copy that
 * survives a cleared cache - so the autosave is a safety net, not the archive.
 */

const AUTOSAVE = 'ovaloffice.builder.autosave'
const SLOTS = 'ovaloffice.builder.slots'

/** Reading storage throws in a private window with quota off, which is not worth crashing over. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

export function loadAutosave(): BuilderWorld | null {
  return safely(() => {
    const text = window.localStorage.getItem(AUTOSAVE)
    return text ? deserialiseWorld(text) : null
  }, null)
}

export function saveAutosave(world: BuilderWorld): void {
  safely(() => window.localStorage.setItem(AUTOSAVE, serialiseWorld(world)), undefined)
}

export interface Slot {
  name: string
  saved: string
  placements: number
}

/**
 * The slot list, as a store rather than as a read.
 *
 * localStorage is an external system, and reading it into component state on
 * mount is the pattern `react-hooks/set-state-in-effect` exists to catch: it
 * renders once with the wrong answer and then again with the right one. Every
 * other browser-owned thing in this codebase is a `*-store` read through
 * `useSyncExternalStore` for the same reason - see `@/app/world/door-store`.
 *
 * The snapshot is cached and only rebuilt when a slot is written, because
 * `useSyncExternalStore` compares snapshots by identity: parsing storage afresh
 * on every call would hand back a new array every time and spin the panel
 * forever.
 */
let snapshot: Slot[] | null = null
const listeners = new Set<() => void>()

function announce(): void {
  snapshot = null
  for (const listener of listeners) listener()
}

function read(): Slot[] {
  if (snapshot) return snapshot

  snapshot = safely(() => {
    const text = window.localStorage.getItem(SLOTS)
    if (!text) return []
    const raw = JSON.parse(text) as Record<string, { saved: string; world: string }>
    return Object.entries(raw)
      .map(([name, entry]) => ({
        name,
        saved: entry.saved,
        // Counted from the stored document rather than kept alongside it, so a
        // slot cannot claim a size it does not have.
        placements: deserialiseWorld(entry.world).placements.length,
      }))
      .sort((a, b) => b.saved.localeCompare(a.saved))
  }, [])

  return snapshot
}

/** Stable across calls, so the server render and the first client render agree on "none yet". */
const NONE: Slot[] = []

export function useSlots(): Slot[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => NONE,
  )
}

export function saveSlot(world: BuilderWorld): void {
  safely(() => {
    const text = window.localStorage.getItem(SLOTS)
    const raw = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    raw[world.name] = { saved: new Date().toISOString(), world: serialiseWorld(world) }
    window.localStorage.setItem(SLOTS, JSON.stringify(raw))
  }, undefined)
  announce()
}

export function loadSlot(name: string): BuilderWorld | null {
  return safely(() => {
    const text = window.localStorage.getItem(SLOTS)
    if (!text) return null
    const raw = JSON.parse(text) as Record<string, { world: string }>
    const entry = raw[name]
    return entry ? deserialiseWorld(entry.world) : null
  }, null)
}

export function deleteSlot(name: string): void {
  safely(() => {
    const text = window.localStorage.getItem(SLOTS)
    if (!text) return
    const raw = JSON.parse(text) as Record<string, unknown>
    delete raw[name]
    window.localStorage.setItem(SLOTS, JSON.stringify(raw))
  }, undefined)
  announce()
}
