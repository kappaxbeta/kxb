/**
 * What kind of event this is, expressed as the settings that differ.
 *
 * No 'server-only': a preset is not secret, and the console renders its
 * contents as the starting position of a form.
 *
 * A preset is a *starting point*, never a mode. Nothing branches on
 * `event_spaces.preset` anywhere in the app - it is recorded so the console can
 * say "hackathon, with two things changed" instead of showing a wall of
 * checkboxes with no story behind them. Every value it sets is editable
 * afterwards, and an event whose settings no longer match its preset is a
 * normal, expected thing rather than a drift to be corrected.
 *
 * The reason to have them at all is that the three questions an event asks -
 * may strangers build, may they talk, how big are the rooms - have obvious
 * answers per kind of event and non-obvious ones in isolation. A hackathon
 * where nobody may build is a mistake somebody will make at 2am the night
 * before; this is where that mistake gets pre-empted.
 */

import type { GuestWriteCapability } from '@/domain/tenants/events'

/**
 * The capability names a guest may be granted, as stored in
 * `event_spaces.guest_writes`.
 *
 * Deliberately the same vocabulary as the host's switches, plus `chat` - which
 * is a capability of an event but not one of those switches, because chat
 * already has its own switch (`ChatEnabledSet`) and its own feature flag. See
 * the note on SpaceCapabilitySet for why that one was left where it was.
 *
 * Built from `GuestWriteCapability` rather than `SpaceCapability`, so a space
 * switch that is not about *writing* cannot arrive here. `perf_display` is the
 * one that made the distinction necessary: it is a thing a space chooses to
 * look at, and "may a guest be granted the performance readout" is not a
 * question this list can ask.
 */
export type EventCapability = GuestWriteCapability | 'chat'

export const EVENT_CAPABILITIES: EventCapability[] = [
  'build',
  'rooms',
  'board',
  'tasks',
  'pages',
  'battle',
  'agents',
  'chat',
]

export const EVENT_CAPABILITY_LABELS: Record<EventCapability, string> = {
  build: 'Build in the world',
  rooms: 'Open new rooms',
  board: 'Post on the pinboard',
  tasks: 'Write tasks',
  pages: 'Edit pages',
  battle: 'Take part in matches',
  agents: 'Creatures',
  chat: 'Chat',
}

/**
 * The pages a guest may reach, as stored in `event_spaces.surfaces`.
 *
 * Not the same list as the capabilities, and the difference is the whole point
 * of having two: `board` in `surfaces` means a guest can *read* the pinboard,
 * `board` in `guest_writes` means they can *post* on it. A conference wants the
 * first without the second, and one list could not say so.
 */
export type EventSurface =
  | 'lounge'
  | 'rooms'
  | 'board'
  | 'tasks'
  | 'pages'
  | 'cafe'
  | 'battle'

/**
 * One entry per page a guest can actually be sent to, and nothing else.
 *
 * Worth stating because the obvious mistake is to write the list you wish
 * existed. There is no `shots` here - `/world/shots` is the marketing studio
 * and is not tenant-scoped at all - and no `dashboard`, because
 * `/t/[slug]/dashboard` only redirects to the board. A checkbox for either
 * would toggle nothing, which is worse than not offering it.
 */
export const EVENT_SURFACES: EventSurface[] = [
  'lounge',
  'rooms',
  'board',
  'tasks',
  'pages',
  'cafe',
  'battle',
]

export const EVENT_SURFACE_LABELS: Record<EventSurface, string> = {
  lounge: 'The lounge',
  rooms: 'Rooms',
  board: 'Overview and pinboard',
  tasks: 'Tasks',
  pages: 'Pages',
  cafe: 'Café and garden',
  battle: 'Matches and tournaments',
}

export interface EventPreset {
  key: string
  label: string
  /** One line, shown beside the radio button in the console. */
  blurb: string
  guestWrites: EventCapability[]
  surfaces: EventSurface[]
  roomCap: number
  roomMax: number
  roomOverflow: boolean
  /**
   * Tenant-scoped feature flag overrides to apply on creation.
   *
   * These are a different mechanism from everything above, and the split is the
   * one already drawn for chat: a flag says whether this space *has* a feature
   * at all, the capability says whether a guest may use it. `battle: false` on
   * a conference means nobody is fighting, staff included; `battle` missing
   * from `guestWrites` would only have meant the attendees are not.
   */
  flags: Partial<Record<'chat' | 'battle' | 'agents' | 'cafe' | 'pages', boolean>>
  /** Value for the `guest_limit` valued flag - how many may be inside at once. */
  guestLimit: number
}

/**
 * Room sizes are not comfort settings, and the numbers here are load-bearing.
 *
 * Movement costs `SEND_HZ x M x (N-1)` events per second per room, so cost is
 * quadratic in a room's population and only linear in the number of rooms. A
 * single room of 30 is over the Realtime budget on its own; ten rooms of 8 are
 * comfortably inside it. Every `roomCap` below is chosen against that formula
 * rather than against how a room feels to stand in. See performancestudy/.
 */
export const EVENT_PRESETS: EventPreset[] = [
  {
    key: 'hackathon',
    label: 'Hackathon',
    blurb:
      'Teams building for a weekend. Strangers may build, post and write tasks; rooms are small and multiply as people arrive.',
    guestWrites: ['build', 'rooms', 'board', 'tasks', 'chat'],
    surfaces: ['lounge', 'rooms', 'board', 'tasks'],
    roomCap: 10,
    roomMax: 12,
    roomOverflow: true,
    flags: { chat: true, battle: false, agents: false },
    guestLimit: 100,
  },
  {
    key: 'conference',
    label: 'Conference or class',
    blurb:
      'People come to watch and talk. The room is built beforehand and stays as it was built; attendees chat and read.',
    guestWrites: ['chat'],
    surfaces: ['lounge', 'rooms', 'board', 'pages'],
    // Bigger rooms, because a talk is people standing still - and standing
    // still costs 0.5 messages a second instead of eight. The quadratic only
    // bites when everybody is moving at once, which is not what a talk is.
    roomCap: 16,
    roomMax: 8,
    roomOverflow: true,
    flags: { chat: true, battle: false, agents: false },
    guestLimit: 300,
  },
  {
    key: 'jam',
    label: 'Jam or party',
    blurb:
      'Everybody moving at once - matches, football, building. The smallest rooms of the three, for exactly that reason.',
    guestWrites: ['build', 'rooms', 'battle', 'chat'],
    surfaces: ['lounge', 'rooms', 'board', 'battle'],
    // The smallest cap here, and the reason is the formula: this is the one
    // preset where everybody really is moving continuously, so it is the one
    // where the quadratic is not a worst case but the normal Tuesday.
    roomCap: 8,
    roomMax: 10,
    roomOverflow: true,
    flags: { chat: true, battle: true, agents: false },
    guestLimit: 80,
  },
]

export function findPreset(key: string): EventPreset | null {
  return EVENT_PRESETS.find((preset) => preset.key === key) ?? null
}

export const DEFAULT_PRESET = 'hackathon'

/**
 * The Realtime cost of a configuration, in broadcast deliveries per second.
 *
 * `SEND_HZ x M x (N-1)` per room, summed over the rooms, with M = N because
 * this is the worst case: everybody in every room moving at once. That is the
 * number worth showing an operator, because the failure it predicts - frames
 * silently dropped for everybody in the space, not just the crowded room - is
 * tenant-wide and does not announce itself.
 *
 * Kept here rather than in the console so it can be unit-tested against the
 * table in performancestudy/optimization1.md.
 */
export const SEND_HZ = 8

export function realtimeWorstCase(roomCount: number, roomCap: number): number {
  if (roomCap < 2 || roomCount < 1) return 0
  return SEND_HZ * roomCap * (roomCap - 1) * roomCount
}

/**
 * What the Realtime tenant is configured to allow.
 *
 * 25 000 is what kxb.team runs (stock self-host is 100; raised to 5 000 on
 * 2026-07-31 and to 25 000 when the limits were sized for ~1 000 spaces); an
 * isolated event box is provisioned at 20 000. Overridable so the console on an
 * event box tells the truth about that box rather than about this one.
 *
 * **This number must track `scripts/realtime-limits.sh`**, which is what
 * actually sets the server-side ceiling. It is only a warning threshold - it
 * throttles nothing - so the two drifting apart does not break play. It does
 * something arguably worse: the console starts telling operators a perfectly
 * safe event is over budget, they learn the warning is noise, and it stops
 * working as a warning on the day it is right.
 *
 * Note it is `NEXT_PUBLIC_*` and therefore inlined at build time. If the value
 * is set as a CI repo variable it wins over this default, and `deploy.sh
 * --env-only` cannot change it - that needs a rebuild.
 */
export const REALTIME_BUDGET = Number(process.env.NEXT_PUBLIC_REALTIME_BUDGET ?? 25_000)

export interface BudgetVerdict {
  worstCase: number
  budget: number
  /** Over budget, so a busy moment drops frames for the whole space. */
  over: boolean
}

export function budgetVerdict(
  roomCount: number,
  roomCap: number,
  budget: number = REALTIME_BUDGET,
): BudgetVerdict {
  const worstCase = realtimeWorstCase(roomCount, roomCap)
  return { worstCase, budget, over: worstCase > budget }
}
