'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  DEFAULT_PRESET,
  type EventCapability,
  EVENT_CAPABILITIES,
  EVENT_SURFACES,
  findPreset,
} from '@/domain/events/presets'
import { roomDecider } from '@/domain/rooms/aggregate'
import { tenantDecider } from '@/domain/tenants/aggregate'
import { createTenantSchema } from '@/domain/tenants/commands'
import { roomsProjection } from '@/domain/rooms/projection'
import { tenantsProjection } from '@/domain/tenants/projection'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { executeCommand } from '@/es/command'
import { DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { requireBackofficeSection } from '@/lib/backoffice'
import { env } from '@/lib/env'
import { guestLinkUrl, mintGuestToken } from '@/domain/guests/application'

export type EventResult =
  | { ok: true }
  | { ok: false; error: string }

export type CreateEventResult =
  | { ok: true; slug: string; guestUrl: string }
  | { ok: false; error: string }

const UNIQUE_VIOLATION = '23505'

/**
 * The window, as the console posts it.
 *
 * Both ends are required and the order is checked here as well as by the table
 * constraint, because a constraint violation surfaces as a Postgres error
 * string and this is a form somebody is looking at. The database check is what
 * makes the rule true; this is what makes it readable.
 */
const windowSchema = z
  .object({
    opensAt: z.string().min(1, 'Say when it opens'),
    closesAt: z.string().min(1, 'Say when it closes'),
  })
  .refine(
    (value) => new Date(value.closesAt).getTime() > new Date(value.opensAt).getTime(),
    { message: 'The event has to close after it opens', path: ['closesAt'] },
  )

const roomsSchema = z.object({
  roomCap: z.number().int().min(2).max(40),
  roomMax: z.number().int().min(1).max(64),
  roomOverflow: z.boolean(),
})

const capabilitySchema = z.array(z.enum(EVENT_CAPABILITIES as [string, ...string[]]))
const surfaceSchema = z.array(z.enum(EVENT_SURFACES as [string, ...string[]]))

const createSchema = z
  .object({
    name: createTenantSchema.shape.name,
    slug: createTenantSchema.shape.slug,
    preset: z.string().default(DEFAULT_PRESET),
    note: z.string().max(500).optional(),
  })
  .and(windowSchema)

/**
 * Stand an event up: the space, its terms, its rooms and its link.
 *
 * ----------------------------------------------------------------------------
 * Why this is not `createTenant`
 * ----------------------------------------------------------------------------
 * It looks like a duplicate of that action and is deliberately not one. Three
 * differences, each of which would be wrong to paper over:
 *
 *   * **No billing check.** An event is sold per event, from /events, and has
 *     nothing to do with the per-workspace subscription. Running the
 *     entitlement check would mean a Stripe outage could stop an operator
 *     standing up a room somebody has already paid for.
 *   * **No redirect.** `createTenant` ends by sending the caller into their new
 *     workspace. The console needs the guest link back so it can show it.
 *   * **The creator is not a member at all.** This used to be the opposite -
 *     the operator became the owner, because `append_events()` is security
 *     invoker and refused anybody who was not a member, so ownership was the
 *     only route to inviting staff or flipping a switch afterwards. The cost
 *     was a person from this company sitting in the staff list of every event
 *     we have ever run, in a space belonging to somebody else.
 *
 *     20260903000000 replaced that with what was actually meant: a backoffice
 *     admin may append to any tenant stream, stamped with their own id, and
 *     the decider takes `platform: true` in place of a role. So the space is
 *     built ownerless and stays that way until the customer accepts their
 *     invitation as owner. `joinEventSpace` is the way in for an operator who
 *     wants to be in the room; `leaveEventSpace` is the way back out.
 *
 * ----------------------------------------------------------------------------
 * Order matters
 * ----------------------------------------------------------------------------
 * The slug is claimed first, then the space, then everything else. Each step
 * after the space is best-effort and reported rather than rolled back: an event
 * whose rooms did not get pre-created is an event with no rooms, which an
 * operator can fix in ten seconds, whereas unwinding a created space means
 * deleting a tenant and there is no supported way to do that. The one thing
 * that *is* rolled back is the slug claim, because a failed create that keeps
 * its URL means the operator cannot retry with the name they wanted.
 */
export async function createEvent(input: {
  name: string
  slug: string
  preset: string
  opensAt: string
  closesAt: string
  note?: string
}): Promise<CreateEventResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid event' }
  }

  const preset = findPreset(parsed.data.preset)
  if (!preset) return { ok: false, error: 'Unknown preset' }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')

  const tenantId = randomUUID()

  const { error: claimError } = await supabase.from('tenant_slugs').insert({
    slug: parsed.data.slug,
    tenant_id: tenantId,
    claimed_by: user.id,
  })

  if (claimError) {
    if (claimError.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `The URL "${parsed.data.slug}" is already taken` }
    }
    return { ok: false, error: `Could not reserve that URL: ${claimError.message}` }
  }

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command: {
        type: 'CreateTenant',
        actorId: user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        // The operator builds it and does not live in it. See the note on
        // ownership above, and `joinEventSpace` for the way back in.
        owner: 'none',
      },
      metadata: { actorId: user.id, platform: true },
    })
  } catch (error) {
    await supabase.from('tenant_slugs').delete().eq('slug', parsed.data.slug)
    const message =
      error instanceof DomainError || error instanceof Error
        ? error.message
        : 'Could not create the space'
    return { ok: false, error: message }
  }

  // Projected with the service role from here on. Every read model is gated on
  // membership - `rooms_insert` is `is_tenant_member(tenant_id)` - and the
  // operator is deliberately not a member of what they just built. Same client
  // the event console already reads these spaces with.
  //
  // Guarded, because this is the first step past the point of no return. The
  // slug claim above can no longer be released - `tenant_slugs_delete_unused`
  // allows a delete only while `not tenant_has_events(tenant_id)`, and the
  // stream now has `TenantCreated` - so an unhandled throw here would leave a
  // real space that no console can see: `event_spaces` has no row yet, and
  // `tenants_read_model` never got one. Reported rather than rolled back, like
  // every other step from here on, and the message has to say the slug is gone
  // because retrying the form with the same name will collide.
  try {
    await runProjection(admin, tenantsProjection, tenantId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      ok: false,
      error:
        `The space was created and holds the URL "${parsed.data.slug}", but its read model was not built: ${message}. ` +
        `Replay the tenants projection for ${tenantId} rather than retrying - that name is now taken.`,
    }
  }

  // The terms. Written with the service role because `event_spaces` is
  // admin-only for writes and the caller has already proven they are one.
  const { error: eventError } = await admin.from('event_spaces').insert({
    tenant_id: tenantId,
    opens_at: parsed.data.opensAt,
    closes_at: parsed.data.closesAt,
    preset: preset.key,
    guest_writes: preset.guestWrites,
    surfaces: preset.surfaces,
    room_cap: preset.roomCap,
    room_max: preset.roomMax,
    room_overflow: preset.roomOverflow,
    created_by: user.id,
    note: parsed.data.note?.trim() || null,
  })

  if (eventError) {
    return { ok: false, error: `The space was created, but its event record was not: ${eventError.message}` }
  }

  await applyPresetFlags(admin, tenantId, preset.key, user.id)
  await createRooms(supabase, admin, tenantId, preset.roomMax, user.id)

  const guestUrl = await mintEventLink(admin, tenantId, parsed.data.closesAt, user.id)

  revalidatePath('/ovaloffice/events')

  if (!guestUrl) {
    return {
      ok: false,
      error:
        'The space and its event were created, but the guest link was not — mint one from the event page. ' +
        'Do not hand out a link from a failed create.',
    }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.create',
    summary: `Created event space "${parsed.data.name}" (${parsed.data.slug})`,
    detail: { tenantId, slug: parsed.data.slug, preset: preset.key },
  })

  return { ok: true, slug: parsed.data.slug, guestUrl }
}

/**
 * The preset's feature flags, as tenant-scoped overrides.
 *
 * Written directly rather than through `setFeatureOverride`, which resolves its
 * subject from a slug and revalidates backoffice paths - both wasted work when
 * the tenant id is already in hand, and the slug lookup would be a round trip
 * per flag. The row shape is identical, which is what matters: the console's
 * flags page reads and edits these exactly as it does any other override.
 */
async function applyPresetFlags(
  admin: Client,
  tenantId: string,
  presetKey: string,
  grantedBy: string,
): Promise<void> {
  const preset = findPreset(presetKey)
  if (!preset) return

  const rows = Object.entries(preset.flags).map(([key, enabled]) => ({
    flag_key: key,
    scope: 'tenant' as const,
    scope_id: tenantId,
    enabled,
    value_int: null,
    granted_by: grantedBy,
    note: `${preset.label} preset`,
  }))

  // The guest cap is a valued flag, so it carries a number as well as a switch.
  rows.push({
    flag_key: 'guest_limit',
    scope: 'tenant' as const,
    scope_id: tenantId,
    enabled: true,
    value_int: preset.guestLimit as never,
    granted_by: grantedBy,
    note: `${preset.label} preset`,
  })

  await admin
    .from('feature_flag_overrides')
    .upsert(rows, { onConflict: 'flag_key,scope,scope_id' })
}

/**
 * Pre-create the rooms an event will need.
 *
 * Up front rather than on demand, because overflow at the door can only mint a
 * room when the guest doing the arriving is allowed to - and a conference,
 * which is exactly the kind of event where the rooms matter most, does not
 * grant that. Standing them up now means the venue is a venue before anybody
 * arrives, which is also what /events promises: "laid out and standing before
 * anybody arrives, so the first thing your people see is a place".
 *
 * Named by number rather than by anything clever. The operator renames them to
 * whatever the day calls them, and a room called "Hall 3" is at least honest
 * about having been generated.
 */
async function createRooms(
  supabase: Client,
  admin: Client,
  tenantId: string,
  count: number,
  actorId: string,
): Promise<void> {
  // Capped well below `room_max`, which is a ceiling for overflow rather than a
  // target. Standing up sixty-four rooms nobody asked for would make the picker
  // useless and the sidebar unreadable.
  const initial = Math.min(count, 4)

  for (let index = 1; index <= initial; index += 1) {
    const roomId = randomUUID()
    try {
      await executeCommand({
        supabase,
        decider: roomDecider,
        tenantId,
        streamId: roomId,
        command: {
          type: 'CreateRoom',
          actorId,
          name: `Hall ${index}`,
          visibility: 'open',
        },
        metadata: { actorId },
      })
    } catch {
      // Best effort - see the note on ordering in createEvent. An operator can
      // add a room by hand in less time than a rollback would take to write.
      return
    }
  }

  // The events are appended as the operator - so the log says who built these
  // halls - and projected with the service role, which is the half a
  // non-member cannot do. See the note in `createEvent`.
  await runProjection(admin, roomsProjection, tenantId)
}

/**
 * The one link, minted with the service role and expiring with the event.
 *
 * Not `createGuestLink`, for the same reason this file does not call
 * `createTenant`: that action runs `requireTenant`, which needs the caller to
 * already be a member of a space that was created a moment ago in the same
 * request. It would work - the operator *is* the owner - but only by accident
 * of ordering, and it revalidates paths that do not exist yet.
 *
 * `maxUses` is deliberately null. An event link is handed to a conference app
 * or a Discord announcement and opened by an unknown number of people; a budget
 * on it is a way to lock out the last twenty arrivals. The cap that matters is
 * the concurrent one, which the `guest_limit` override above sets.
 *
 * Null when the row did not land. The caller must not paper over that: the
 * whole output of this function is a URL somebody pastes into an announcement,
 * and a link with no row behind it does not fail here - it fails at the door,
 * for every attendee at once, with the operator having no idea.
 */
async function mintEventLink(
  admin: Client,
  tenantId: string,
  closesAt: string,
  createdBy: string,
): Promise<string | null> {
  const token = mintGuestToken()

  // The link dies with the event rather than on the usual 30-day default, so a
  // token pasted into a public Discord cannot admit anybody the week after.
  // `event_open()` refuses them anyway; this means the door says "this event
  // has ended" rather than handing out an admission that grants nothing.
  const { error } = await admin.from('guest_links').insert({
    tenant_id: tenantId,
    token,
    label: 'Event link',
    max_uses: null,
    requires_knock: false,
    destination: null,
    expires_at: closesAt,
    created_by: createdBy,
  })

  if (error) return null

  return guestLinkUrl(env.appUrl(), token)
}

const scheduleSchema = z
  .object({
    tenantId: z.uuid(),
    preset: z.string().min(1),
    note: z.string().max(500).optional(),
  })
  .and(windowSchema)

export type ScheduleEventResult =
  | { ok: true; guestUrl: string }
  | { ok: false; error: string }

/**
 * Give an existing space an event.
 *
 * The other direction from `createEvent`, and the reason both exist is that
 * "event" is not a kind of space - it is a period a space is going through.
 * The schema already says so: `event_open()` answers true for a space with no
 * row at all, because "a space with no event record is not a closed event, it
 * is a workspace". So an event is a row you can add to any space and take away
 * again, and this is the adding.
 *
 * Which matters to the customer who has had a space for a year and wants their
 * hackathon to happen *in* it. `createEvent` would give them a second, empty
 * space - the event would run somewhere their people have never been, next to
 * the worlds they actually built.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not do
 * ---------------------------------------------------------------------------
 * It does not create rooms, and it does not touch ownership. Both are things
 * `createEvent` has to do because it is standing a space up from nothing; here
 * the space already has its rooms, its worlds and its staff, and helpfully
 * adding four halls called "Hall 1" to somebody's year-old workspace would be
 * vandalism.
 *
 * It *does* apply the preset's feature flags, and that is a real edit to a
 * space somebody else owns - `guest_limit` especially, because an event whose
 * space allows five guests is not an event. The form says so before you press
 * it, and the flags stay put when the event is retired, where the console
 * points at the flags page rather than guessing which ones to undo.
 */
export async function scheduleEvent(input: {
  tenantId: string
  preset: string
  opensAt: string
  closesAt: string
  note?: string
}): Promise<ScheduleEventResult> {
  const parsed = scheduleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid event' }
  }

  const preset = findPreset(parsed.data.preset)
  if (!preset) return { ok: false, error: 'Unknown preset' }

  const { admin, user } = await requireBackofficeSection('events', 'write')

  const { data: space, error: spaceError } = await admin
    .from('tenants_read_model')
    .select('id, archived')
    .eq('id', parsed.data.tenantId)
    .maybeSingle()

  if (spaceError) return { ok: false, error: `Could not read that space: ${spaceError.message}` }
  if (!space) return { ok: false, error: 'That space does not exist' }
  if (space.archived) {
    return { ok: false, error: 'That space is archived — unarchive it before giving it an event' }
  }

  const { error } = await admin.from('event_spaces').insert({
    tenant_id: parsed.data.tenantId,
    opens_at: parsed.data.opensAt,
    closes_at: parsed.data.closesAt,
    preset: preset.key,
    guest_writes: preset.guestWrites,
    surfaces: preset.surfaces,
    room_cap: preset.roomCap,
    room_max: preset.roomMax,
    room_overflow: preset.roomOverflow,
    created_by: user.id,
    note: parsed.data.note?.trim() || null,
  })

  if (error) {
    // The primary key is the tenant id, so this is the one collision worth
    // naming: the space already has an event and the operator wants Configure,
    // not a second one.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: 'That space already has an event — open it to change the dates' }
    }
    return { ok: false, error: `Could not schedule it: ${error.message}` }
  }

  await applyPresetFlags(admin, parsed.data.tenantId, preset.key, user.id)

  const guestUrl = await mintEventLink(admin, parsed.data.tenantId, parsed.data.closesAt, user.id)

  revalidatePath('/ovaloffice/events')
  revalidatePath(`/ovaloffice/events/${parsed.data.tenantId}`)

  if (!guestUrl) {
    return {
      ok: false,
      error:
        'The event was scheduled, but the guest link was not — mint one from the event page. ' +
        'Do not hand out a link from a failed create.',
    }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.schedule',
    summary: `Scheduled a ${preset.label} event on an existing space`,
    detail: { tenantId: parsed.data.tenantId, preset: preset.key },
  })

  return { ok: true, guestUrl }
}

/**
 * Take the event away and leave the space.
 *
 * The inverse of `scheduleEvent`, and distinct from `closeEventNow` in a way
 * worth being precise about, because the two look similar and are not:
 *
 *   closeEventNow  moves `closes_at` to now. The row stays, so the space is
 *                  still an event - one that has ended. Guests holding a live
 *                  pass keep *reading* what they spent the weekend making, and
 *                  the banner says the event is over.
 *
 *   retireEvent    deletes the row. The space stops being an event at all and
 *                  goes back to being an ordinary workspace, which is what
 *                  `event_open()` returning true for a missing row means.
 *
 * So this is the button for "the hackathon is over and they are keeping the
 * space", which is the outcome /events is selling. Nothing built is touched:
 * the worlds, rooms, pages, chat and members are the space's, and always were.
 *
 * What does change is guests. `event_guest_may_write()` requires a row, so with
 * it gone a guest writes nothing - they are back to what a guest in an ordinary
 * space may do, which is take part in matches and nothing else durable. That is
 * the correct end state and it is why this is a separate, deliberate action
 * rather than something that happens by itself when the clock runs out.
 */
export async function retireEvent(tenantId: string): Promise<EventResult> {
  const id = z.uuid().safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const { admin, user } = await requireBackofficeSection('events', 'write')

  const { error } = await admin.from('event_spaces').delete().eq('tenant_id', id.data)

  if (error) return { ok: false, error: `Could not retire it: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.retire',
    summary: `Retired the event on space ${id.data}, returning it to a workspace`,
    detail: { tenantId: id.data },
  })

  revalidatePath('/ovaloffice/events')
  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

const configureSchema = z
  .object({
    tenantId: z.uuid(),
    guestWrites: capabilitySchema,
    surfaces: surfaceSchema,
    note: z.string().max(500).optional(),
  })
  .and(windowSchema)
  .and(roomsSchema)

/**
 * Change an event's terms.
 *
 * Everything at once rather than a setter per field, because the console posts
 * one form and the fields constrain each other - a window whose end moved and a
 * room cap that grew are one decision about the same event, and saving them
 * separately means a moment where the event is half-changed.
 *
 * Nothing here touches the staff switches. Those are on the tenant stream and
 * belong to the space's own admins; the console *shows* them, and the event
 * desk inside the space is where they are flipped.
 */
export async function configureEvent(input: {
  tenantId: string
  opensAt: string
  closesAt: string
  guestWrites: string[]
  surfaces: string[]
  roomCap: number
  roomMax: number
  roomOverflow: boolean
  note?: string
}): Promise<EventResult> {
  const parsed = configureSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings' }
  }

  const { admin, user } = await requireBackofficeSection('events', 'write')

  const { error } = await admin
    .from('event_spaces')
    .update({
      opens_at: parsed.data.opensAt,
      closes_at: parsed.data.closesAt,
      guest_writes: parsed.data.guestWrites as EventCapability[],
      surfaces: parsed.data.surfaces,
      room_cap: parsed.data.roomCap,
      room_max: parsed.data.roomMax,
      room_overflow: parsed.data.roomOverflow,
      note: parsed.data.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', parsed.data.tenantId)

  if (error) return { ok: false, error: `Could not save: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.configure',
    summary: `Changed the terms of the event on space ${parsed.data.tenantId}`,
    detail: { tenantId: parsed.data.tenantId },
  })

  revalidatePath('/ovaloffice/events')
  revalidatePath(`/ovaloffice/events/${parsed.data.tenantId}`)
  return { ok: true }
}

/**
 * Shut the doors now.
 *
 * Implemented as moving `closes_at` to this instant rather than as a `closed`
 * boolean, so that there is exactly one way to ask whether an event is running
 * and it is the same way in SQL, in the banner and at the door. A second
 * mechanism would mean `event_open()` had two things to check and somewhere,
 * eventually, one of them would be missed.
 *
 * Nobody standing in the space is ejected. Live guest passes run out on their
 * own schedule and the reaper collects them, so the room empties itself instead
 * of teleporting people out of a match. What stops immediately is *joining* and
 * *writing* - which is what closing an event actually means.
 */
export async function closeEventNow(tenantId: string): Promise<EventResult> {
  const id = z.uuid().safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const { admin, user } = await requireBackofficeSection('events', 'write')

  const now = new Date().toISOString()

  // `opens_at` is pulled back with it when the event had not started yet -
  // otherwise the table's `closes_at > opens_at` check refuses to close an
  // event that was scheduled for next week, which is exactly the event an
  // operator is most likely to be cancelling.
  const { data: existing } = await admin
    .from('event_spaces')
    .select('opens_at')
    .eq('tenant_id', id.data)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'That space is not an event' }

  const opensAt =
    new Date(existing.opens_at).getTime() >= new Date(now).getTime()
      ? new Date(new Date(now).getTime() - 1000).toISOString()
      : existing.opens_at

  const { error } = await admin
    .from('event_spaces')
    .update({ opens_at: opensAt, closes_at: now, updated_at: now })
    .eq('tenant_id', id.data)

  if (error) return { ok: false, error: `Could not close it: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.close',
    summary: `Closed the event on space ${id.data} now`,
    detail: { tenantId: id.data, closesAt: now },
  })

  revalidatePath('/ovaloffice/events')
  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

/**
 * Put this event on the front page, or take it off.
 *
 * Ours, not the host's, and that is the only interesting thing about it. The
 * host composes the banner and picks the door - see `attachEventBanner` - and
 * the front page is where we decide what kxb.team is currently advertising.
 * The alternative, a checkbox in Settings, would be a billboard rented by
 * accident to whoever ticked it.
 *
 * Nothing is checked about whether the event *has* a banner. `listFeaturedDoors`
 * drops the ones that do not, so ticking this before the host has composed one
 * is a no-op that starts working the moment they do - which is the right shape
 * for a decision made a week before an event by somebody who cannot see the
 * banner yet.
 */
export async function featureEvent(
  tenantId: string,
  featured: boolean,
): Promise<EventResult> {
  const id = z.uuid().safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const { admin, user } = await requireBackofficeSection('events', 'write')

  const { error } = await admin
    .from('event_spaces')
    .update({ featured, updated_at: new Date().toISOString() })
    .eq('tenant_id', id.data)

  if (error) return { ok: false, error: `Could not save it: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'event.feature',
    summary: `${featured ? 'Featured' : 'Unfeatured'} event ${id.data} on the front page`,
    detail: { tenantId: id.data, featured },
  })

  revalidatePath('/ovaloffice/events')
  revalidatePath(`/ovaloffice/events/${id.data}`)
  // The band on the front page is rendered from this flag and nothing else
  // would ever invalidate it.
  revalidatePath('/')
  return { ok: true }
}
