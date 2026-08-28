import 'server-only'
import {
  type EventCapability,
  type EventSurface,
  EVENT_SURFACES,
} from '@/domain/events/presets'
import type { SpaceCapability } from '@/domain/tenants/events'
import type { Client } from '@/es/store'

/**
 * One named link in the banner.
 *
 * A name as well as a URL, because the banner has room for four words and a
 * bare `https://discord.gg/x7f2q` tells an attendee nothing about whether it
 * is the schedule or the sponsor. The name is what they read; the URL is what
 * they get.
 */
export interface EventLink {
  name: string
  url: string
}

/**
 * An event space, as everything outside the backoffice sees it.
 *
 * Read through the caller's own client rather than the service role: the select
 * policy on `event_spaces` admits anybody with a role in the tenant, guests
 * included, because the banner and the sidebar have to render for them. Nothing
 * in the row is a secret - it is the terms of the event, and the people inside
 * are who those terms are for.
 */
export interface EventView {
  tenantId: string
  opensAt: string
  closesAt: string
  preset: string
  /** The ceiling. What the staff have switched on is a separate question. */
  guestWrites: EventCapability[]
  surfaces: EventSurface[]
  roomCap: number
  roomMax: number
  roomOverflow: boolean
  note: string | null
  /**
   * The host's own line in the banner, or null before they have written one.
   *
   * Distinct from `note`, which is ours: `note` is why the event exists, read
   * by whoever opens the console in six months. This is read by everybody
   * standing in the room, and only the host may write it.
   */
  headline: string | null
  blurb: string | null
  links: EventLink[]
  /**
   * The saved banner on the event's public door, and the guest link its button
   * carries. Both null until the host has put one up.
   *
   * Ids rather than the banner and the link themselves: almost every reader of
   * this view is a page inside the event, which does not draw either of them.
   * The one surface that does - the settings picker - fetches them by id, and
   * the public door reads its own shape entirely separately. See `./door`.
   */
  bannerId: string | null
  bannerLinkId: string | null
  /**
   * Is this event on the front page? Ours to set, from the backoffice.
   *
   * Here rather than only in the backoffice list because the host should be
   * able to see it - a banner that is going to be seen by everybody who visits
   * kxb.team is worth knowing about while editing it.
   */
  featured: boolean
  /** Has it started, is it running, or is it over? Computed, never stored. */
  phase: 'upcoming' | 'running' | 'ended'
}

/**
 * The phase, from the clock rather than from a column.
 *
 * Stored state would need something to write it - a cron, a trigger, a
 * request - and every one of those has a window where the row says "running"
 * and the clock says otherwise. The database answers the same question the
 * same way in `event_open()`, so a guest refused at the door and a banner
 * saying the event has ended can never disagree.
 */
export function eventPhase(opensAt: string, closesAt: string, now = new Date()): EventView['phase'] {
  const ms = now.getTime()
  if (ms < new Date(opensAt).getTime()) return 'upcoming'
  if (ms >= new Date(closesAt).getTime()) return 'ended'
  return 'running'
}

type EventRow = {
  tenant_id: string
  opens_at: string
  closes_at: string
  preset: string
  guest_writes: string[]
  surfaces: string[]
  room_cap: number
  room_max: number
  room_overflow: boolean
  note: string | null
  headline: string | null
  blurb: string | null
  links: unknown
  banner_id: string | null
  banner_link_id: string | null
  featured: boolean
}

/**
 * The links column, defended against being anything else.
 *
 * The constraint in the database already refuses a bad array, so this is not
 * validation - it is what happens when a row predates the constraint or when a
 * read fails halfway. Dropping a malformed entry is right: a banner missing
 * one link is a banner, and one that throws takes down every page in the
 * event.
 */
function toLinks(value: unknown): EventLink[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { name, url } = entry as { name?: unknown; url?: unknown }
    if (typeof name !== 'string' || typeof url !== 'string') return []
    if (!name.trim() || !/^https?:\/\//i.test(url)) return []
    return [{ name, url }]
  })
}

function toView(row: EventRow): EventView {
  return {
    tenantId: row.tenant_id,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    preset: row.preset,
    guestWrites: (row.guest_writes ?? []) as EventCapability[],
    surfaces: (row.surfaces ?? []) as EventSurface[],
    roomCap: row.room_cap,
    roomMax: row.room_max,
    roomOverflow: row.room_overflow,
    note: row.note,
    headline: row.headline,
    blurb: row.blurb,
    links: toLinks(row.links),
    bannerId: row.banner_id,
    bannerLinkId: row.banner_link_id,
    featured: row.featured,
    phase: eventPhase(row.opens_at, row.closes_at),
  }
}

/**
 * The event this space is, or null for an ordinary space.
 *
 * Null is the answer for every space that exists today and most that ever will,
 * so every caller has to handle it - which is why this returns null rather than
 * throwing or substituting a default. A "default event" would make every
 * workspace in the product look like one that had ended.
 */
export async function getEvent(
  supabase: Client,
  tenantId: string,
): Promise<EventView | null> {
  const { data, error } = await supabase
    .from('event_spaces')
    .select(
      'tenant_id, opens_at, closes_at, preset, guest_writes, surfaces, room_cap, room_max, room_overflow, note, headline, blurb, links, banner_id, banner_link_id, featured',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // A read failure is not an event ending. Anything that throws here would take
  // out the lounge for a space that has nothing to do with events, so this
  // degrades to "not an event" - which is the shape the whole app already
  // handles, and which grants a guest no more than they had before.
  if (error || !data) return null

  return toView(data as EventRow)
}

export interface EventListItem extends EventView {
  name: string
  slug: string
  archived: boolean
}

/**
 * Every event, newest deadline first, for the backoffice list.
 *
 * Takes the service-role client: this crosses tenants by definition, and the
 * select policy on `event_spaces` is deliberately scoped to people standing in
 * one. The caller is `requireBackofficeAdmin()`, which has already proven who
 * is asking.
 */
export async function listEvents(admin: Client): Promise<EventListItem[]> {
  const { data, error } = await admin
    .from('event_spaces')
    .select(
      'tenant_id, opens_at, closes_at, preset, guest_writes, surfaces, room_cap, room_max, room_overflow, note, headline, blurb, links, banner_id, banner_link_id, featured, tenants_read_model!inner(name, slug, archived)',
    )
    .order('closes_at', { ascending: false })

  if (error) throw new Error(`Failed to list events: ${error.message}`)

  return (data ?? []).map((row) => {
    const tenant = (row as unknown as { tenants_read_model: { name: string; slug: string; archived: boolean } })
      .tenants_read_model
    return {
      ...toView(row as unknown as EventRow),
      name: tenant.name,
      slug: tenant.slug,
      archived: tenant.archived,
    }
  })
}

export interface EventableSpace {
  tenantId: string
  name: string
  slug: string
}

/**
 * Spaces that could hold an event but are not holding one.
 *
 * The list behind "run an event in a space that already exists", which is the
 * other half of the events surface: `createEvent` mints a space *for* an event,
 * and that is right for a customer who bought a weekend. It is wrong for the
 * customer who already has a space, has been using it for a year, and wants
 * their hackathon to happen *in it* - with their worlds, their rooms and their
 * logo already on the wall. Making them a second space would mean the event
 * happens somewhere their people have never been.
 *
 * Archived spaces are left out. An event is a reason to open a door, and a
 * space whose doors were deliberately shut is not somewhere to put one - the
 * operator can unarchive it first, which is a decision worth making on purpose.
 *
 * Ordered by name rather than by recency, because this is a list you search by
 * knowing which space you mean.
 */
export async function listSpacesWithoutEvent(admin: Client): Promise<EventableSpace[]> {
  const { data: taken, error: takenError } = await admin
    .from('event_spaces')
    .select('tenant_id')

  if (takenError) throw new Error(`Failed to read events: ${takenError.message}`)

  const { data, error } = await admin
    .from('tenants_read_model')
    .select('id, name, slug')
    .eq('archived', false)
    .order('name')

  if (error) throw new Error(`Failed to list spaces: ${error.message}`)

  // Filtered here rather than with `not in`, because the exclusion list is
  // every event that has ever existed and PostgREST spells that as a URL
  // parameter - which stops being a request anybody can send at a few hundred.
  const held = new Set((taken ?? []).map((row) => row.tenant_id))

  return (data ?? [])
    .filter((row) => !held.has(row.id))
    .map((row) => ({ tenantId: row.id, name: row.name, slug: row.slug }))
}

/**
 * May a guest do this, all three levels considered?
 *
 * The TypeScript half of `event_guest_may_write()`. The SQL is what enforcement
 * actually runs - it is the half a guest driving the API by hand also has to
 * obey - and this exists so the UI can hide a control rather than offering one
 * that fails. The two agreeing is what the SQL-level tests check; the two
 * *existing separately* is deliberate, because a UI that asked the database for
 * every button would be a round trip per checkbox.
 */
export function guestMay(
  event: EventView | null,
  capabilities: Partial<Record<SpaceCapability, boolean>>,
  capability: EventCapability,
): boolean {
  if (!event) return false
  if (event.phase !== 'running') return false
  if (!event.guestWrites.includes(capability)) return false
  // Chat is not one of the host's switches - it has `ChatEnabledSet` and its
  // own feature flag instead - so there is nothing to consult for it here.
  if (capability === 'chat') return true
  return capabilities[capability] ?? true
}

/**
 * May a guest reach this surface?
 *
 * Reachability survives the event ending, and that is the difference between
 * this and `guestMay` above. When the doors shut, a guest still holding a live
 * pass keeps reading the pinboard they spent the weekend filling - they simply
 * cannot write to it any more. Ejecting them from the page as well would make
 * "nothing is deleted when the day is over", which /events promises in as many
 * words, into something that is technically true and practically false.
 */
export function guestCanReach(
  event: EventView | null,
  surface: EventSurface,
): boolean {
  if (!event) return false
  if (event.phase === 'upcoming') return false
  return event.surfaces.includes(surface)
}

export function isEventSurface(value: string): value is EventSurface {
  return (EVENT_SURFACES as string[]).includes(value)
}
