/**
 * The vocabulary of things that cross a room's channel.
 *
 * In `domain` rather than beside the collector that fills it, because both
 * sides need it and the dependency may only point one way: the browser's
 * collector tallies by these names, and the backoffice page lists them in this
 * order. A copy on each side would drift, and the first sign of it would be a
 * row on the page that quietly counts nothing.
 *
 * A closed list rather than free text: the counts end up as a jsonb object
 * keyed by these, and a typo would become a new event type nobody notices is a
 * duplicate. Anything unrecognised folds onto `other`, so an event added to the
 * channel later is undercounted by name and never uncounted.
 */
export const PERF_EVENTS = [
  'move',
  'ball',
  'emote',
  /**
   * On the list although it crosses a different socket.
   *
   * Chat has its own `chat:<tenantId>` topic, owned by the rail rather than by
   * the scene - but the question the page answers is "how much traffic is this
   * room making", and the people in the room are making all of it.
   */
  'chat',
  'hit',
  'push',
  'room',
  /** This measurement's own probe, counted like anything else rather than
   *  hidden inside the numbers it reports. */
  'ping',
  'other',
] as const

export type PerfEvent = (typeof PERF_EVENTS)[number]

const KNOWN = new Set<string>(PERF_EVENTS)

/** Fold an event name onto the list above. */
export function perfEvent(name: string): PerfEvent {
  return KNOWN.has(name) ? (name as PerfEvent) : 'other'
}

/** The order the page lists them in: busiest first, this page's own last. */
export const EVENT_ORDER: readonly PerfEvent[] = PERF_EVENTS
