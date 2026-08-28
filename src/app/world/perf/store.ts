'use client'

import { useSyncExternalStore } from 'react'
import type { Collector, PerfWindow } from '@/app/world/perf/collector'

/**
 * The one collector this tab is filling.
 *
 * A module-level store rather than a context, for the reason `said-store` gives:
 * chat has its own `chat:<tenantId>` topic owned by `<ChatDock>`, which lives in
 * the workspace layout - several routes above the canvas and never inside it.
 * Its packets are part of what the room is putting on the wire, so they have to
 * reach the same tally, and a provider hung off the tenant layout would have to
 * be threaded through every surface in between.
 *
 * One collector per tab is not a simplification: a tab is in exactly one room.
 * Walking from the lounge into a battle unmounts one scene and mounts another,
 * which disarms and re-arms this - and the two rooms' windows must not be added
 * together, because they are different rooms.
 *
 * It carries traffic in both directions, and the two are for different people.
 * Things that put packets on a wire write counts *in*; the probe drains them
 * and publishes each closed window back *out*, where `<PerfReadout>` may draw
 * it. The second direction only reaches a screen in a space that asked for it -
 * see the `perf_display` capability - and collection is unaffected either way.
 *
 * Everything is a no-op while nothing is armed, which is what makes it safe for
 * the counting calls to sit permanently in the hot paths: with the flag off,
 * `countSent` is one null check per packet and nothing else.
 */

let active: Collector | null = null

/** The last closed window, for the readout. Null until the first one closes. */
let latest: PerfWindow | null = null
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

/**
 * Start collecting into this collector.
 *
 * Called by the probe, which is only ever mounted when the flag is on for this
 * space - see `<PerfProbe>`. Arming is what makes every `countSent` and
 * `countReceived` in the app start doing something.
 */
export function armPerf(collector: Collector): void {
  active = collector
  // Deliberately cleared: the readout must not show the previous room's numbers
  // for the first fifteen seconds of this one.
  latest = null
  announce()
}

/** Stop. Called on the probe's unmount, which is walking out of the room. */
export function disarmPerf(collector: Collector): void {
  // Guarded on identity so a scene tearing down after its replacement has
  // already armed - which is the order React unmounts in - cannot disarm the
  // new room's collector.
  if (active !== collector) return
  active = null
  latest = null
  announce()
}

/** The collector currently being filled, or null. */
export function activeCollector(): Collector | null {
  return active
}

/** Is anything measuring right now? What the counting call sites ask. */
export function collecting(): boolean {
  return active !== null
}

/** One message went out. Free when nothing is collecting. */
export function countSent(event: string): void {
  active?.noteSent(event)
}

/**
 * One message arrived.
 *
 * Takes the clock rather than reading it, because every caller is a packet
 * handler that already has `performance.now()` in hand - and because the two
 * clocks in this app are easy to mix up (see `two-clocks-in-the-xp-runtime`).
 * This one is always `performance.now()`.
 */
export function countReceived(event: string, now: number): void {
  active?.noteReceived(event, now)
}

/** Publish a closed window to whatever is drawing the readout. */
export function publishWindow(window: PerfWindow): void {
  latest = window
  announce()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): PerfWindow | null {
  return latest
}

/**
 * Always null on the server.
 *
 * `useSyncExternalStore` compares snapshots by identity, so this has to be a
 * stable value rather than a fresh object - null is the stablest there is, and
 * it is also the truth: nothing has been measured during a server render.
 */
function serverSnapshot(): PerfWindow | null {
  return null
}

/**
 * The last closed window, for anything drawing the readout.
 *
 * Updates once every fifteen seconds, which is why the readout can be ordinary
 * React state driven by this. A live figure that re-rendered the HUD per packet
 * would be a diagnostic that changed the thing it measures.
 */
export function usePerfWindow(): PerfWindow | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
