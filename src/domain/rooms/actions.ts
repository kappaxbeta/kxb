'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { hasRoomFor } from '@/domain/billing/quota'
import type { Tier } from '@/domain/billing/tiers'
import { roomDecider } from '@/domain/rooms/aggregate'
import {
  createRoomSchema,
  renameRoomSchema,
  type RoomCommand,
  roomIdSchema,
  setRoomCapSchema,
  setRoomGuestBuildSchema,
  setRoomModeSchema,
  setRoomVisibilitySchema,
  setRoomXpSchema,
  xpRefSchema,
} from '@/domain/rooms/commands'
import { guestMay } from '@/domain/events/queries'
import {
  ROOM_CAP_MAX,
  ROOM_CAP_MIN,
  type RoomMode,
  type RoomVisibility,
} from '@/domain/rooms/events'
import { roomsProjection } from '@/domain/rooms/projection'
import { listRooms } from '@/domain/rooms/queries'
import { roomSlug } from '@/domain/rooms/slug'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { hasRole, requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Opening, renaming and closing rooms.
 *
 * The authorization split is the same one battlefields/actions.ts sets out, and
 * worth restating because it is the reason these checks are here rather than in
 * the decider: the decider can only see *this stream*, so it answers "does this
 * room exist, is it open, is this a no-op". It cannot answer "are you an admin",
 * because the roster lives on the tenant's stream and a decider that read
 * another aggregate would not be a decider.
 *
 * So two checks live here:
 *
 *   1. **Role.** Admin or owner. A room is a shared, persistent, named thing
 *      that appears in everybody's sidebar and that nobody else can tidy away -
 *      the same shape of decision as creating a battlefield or handing out a
 *      guest link, and it answers to the same pair.
 *   2. **Ownership.** The room's tenant must be the space the caller is acting
 *      in. Without it, a member of one space could rename another's room by
 *      guessing an id: the decider would be perfectly happy to write to a
 *      stream it can see nothing wrong with.
 */

export type RoomResult =
  | { ok: true; roomId: string; slug: string }
  | { ok: false; error: string }

function toResult(error: unknown): RoomResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That room changed elsewhere. Try again.' }
  }
  throw error
}

type Guarded =
  | { ok: false; error: string }
  | {
      ok: true
      supabase: Client
      tenantId: string
      userId: string
      slug: string
      /** What the space bought, for the place caps. */
      tier: Tier
    }

async function guard(slug: string): Promise<Guarded> {
  const context = await requireTenant(slug)
  requireFeature(context, 'lounge')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // Hiding the button hides nothing - a Server Action is a public endpoint.
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can manage rooms' }
  }

  return {
    ok: true,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    slug,
    tier: context.tenant.tier,
  }
}

/**
 * Refuse a new room when the space is already holding its allowance.
 *
 * Counted here rather than in the decider, and that is forced rather than
 * chosen: a decider folds one room's stream and a cap is a fact about *all* of
 * them. The same reason the role check sits in `guard` above.
 *
 * The two kinds are counted apart because they are priced apart - a lounge room
 * and a level cost different things to run, and `docs/product/pricing.md` §2
 * prices them separately. `xpRef` already tells them apart on the read model,
 * so this is a filter rather than a new column.
 *
 * Returns the refusal sentence, or null when there is room. Says the number,
 * because "you have reached your limit" is a message somebody has to go and
 * look up, and names the plan rather than the flag: nobody outside this
 * codebase knows what an `xp_place_limit` is.
 */
async function placesFull(
  guarded: Extract<Guarded, { ok: true }>,
  kind: 'xo' | 'xp',
): Promise<string | null> {
  const key = kind === 'xp' ? 'xpPlaces' : 'xoPlaces'

  // `includePrivate` is load-bearing. The default hides private rooms, which is
  // right for a sidebar and wrong for a cap: without it a space holds twenty
  // open rooms and as many private ones as it likes, which is not a cap at all.
  // Closed rooms stay excluded, and that is also deliberate - closing one frees
  // a place, which is what the refusal below tells people to do.
  const rooms = await listRooms(guarded.supabase, guarded.tenantId, {
    includePrivate: true,
  })

  const held = rooms.filter((room) =>
    kind === 'xp' ? room.xpRef !== null : room.xpRef === null,
  ).length

  const { allowed, limit } = await hasRoomFor(
    guarded.supabase,
    guarded.tenantId,
    guarded.tier,
    key,
    held,
  )

  if (allowed) return null

  const noun = kind === 'xp' ? 'XP places' : 'rooms'
  return limit === 0
    ? `This plan does not include ${noun}. Upgrade to open one.`
    : `This space is using all ${limit} of its ${noun}. Close one, or upgrade for more.`
}

/**
 * Prove this room belongs to the space the caller is acting in.
 *
 * Hands back the room's current slug on the way through, because every caller
 * that needs this check also needs to know the URL the room ends up at - and
 * for everything but a rename, that is the one it already has.
 */
async function assertOwned(
  supabase: Client,
  tenantId: string,
  roomId: string,
): Promise<{ ok: false; error: string } | { ok: true; slug: string }> {
  const { data, error } = await supabase
    .from('rooms_read_model')
    .select('tenant_id, slug')
    .eq('room_id', roomId)
    .maybeSingle()

  if (error) throw new Error(`Failed to check room: ${error.message}`)
  // One answer for "does not exist" and "belongs to somebody else": the second
  // is information.
  if (!data || data.tenant_id !== tenantId) {
    return { ok: false, error: 'Room not found' }
  }
  return { ok: true, slug: data.slug }
}

/**
 * Is this name free in this space?
 *
 * Rooms are addressed by name now (`/t/<space>/rooms/<name>`), so two open
 * rooms called the same thing would be one URL pointing at two places. The
 * space gets the name once - until the room is closed, which releases it along
 * with everything else about the listing.
 *
 * Compared as slugs rather than as names, because the slug is what the URL is:
 * "Team A" and "team-a" are different names and the same address, and refusing
 * the second here is friendlier than letting the unique index refuse it inside
 * the projection.
 *
 * `exclude` is the room doing the renaming, which must not collide with itself.
 */
async function nameTaken(
  supabase: Client,
  tenantId: string,
  candidate: string,
  exclude?: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('rooms_read_model')
    .select('room_id')
    .eq('tenant_id', tenantId)
    .eq('slug', candidate)
    .eq('closed', false)
    .maybeSingle()

  if (error) throw new Error(`Failed to check that name: ${error.message}`)
  return Boolean(data) && data?.room_id !== exclude
}

async function run(
  guarded: Extract<Guarded, { ok: true }>,
  roomId: string,
  command: RoomCommand,
  /** The room's URL after this command lands. */
  roomSlugAfter: string,
  /**
   * Whether to re-render the space around this.
   *
   * True for everything managed from the rooms page, which is every caller but
   * one: opening, renaming, hiding and closing all change what the rail shows.
   * `setRoomMode` passes false, because the person flipping it is standing
   * inside the room's live WebGL canvas and the layout re-render would tear the
   * scene down under them - the same reason `setLoungeMode` skips it, written
   * out at length there.
   */
  revalidate = true,
): Promise<RoomResult> {
  const { supabase, tenantId, slug } = guarded

  try {
    await executeCommand({
      supabase,
      decider: roomDecider,
      tenantId,
      // The room's stream id is its room id, which is also its world id.
      streamId: roomId,
      command,
      metadata: { actorId: guarded.userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, roomsProjection, tenantId)

  /**
   * The layout, not just the rooms page.
   *
   * The rail is rendered by `/t/[slug]/layout.tsx`, and a `revalidatePath` on a
   * *page* leaves the layout above it cached - so a newly opened room appeared
   * on the rooms page and nowhere else, and the sidebar only caught up on a
   * hard reload. `'layout'` invalidates the segment and everything under it,
   * which is exactly the scope a room's name and existence are read at.
   */
  if (revalidate) revalidatePath(`/t/${slug}`, 'layout')
  return { ok: true, roomId, slug: roomSlugAfter }
}

/**
 * Open a room.
 *
 * The id is minted here rather than derived from the name, even though the name
 * is now unique: the id is what the room's *blocks* are keyed by, and deriving
 * it from a name would mean a rename either moved the world or left the two
 * pointing at different things. The name decides the URL, the id decides the
 * world, and a rename only touches the first.
 *
 * Which is the other half of this: a space gets a name once, until the room
 * holding it is closed. Rooms used to be free to share one - "Meeting 2 is a
 * name somebody will want twice" - and addressing them by name is what took
 * that away.
 *
 * It is opened empty. There is no floor and nothing to stand on until somebody
 * lays one, which the block picker's worlds tab does in a click - and choosing
 * for them would mean picking one of three templates on their behalf and
 * making the first thing they do in their new room be undoing it.
 */
export async function createRoom(
  slug: string,
  name: string,
  visibility: RoomVisibility = 'open',
): Promise<RoomResult> {
  const parsed = createRoomSchema.safeParse({ name, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const full = await placesFull(guarded, 'xo')
  if (full) return { ok: false, error: full }

  const roomId = randomUUID()
  const candidate = roomSlug(parsed.data.name, roomId)

  if (await nameTaken(guarded.supabase, guarded.tenantId, candidate)) {
    return { ok: false, error: taken(parsed.data.name) }
  }

  return run(
    guarded,
    roomId,
    {
      type: 'CreateRoom',
      actorId: guarded.userId,
      name: parsed.data.name,
      visibility: parsed.data.visibility,
    },
    candidate,
  )
}

/**
 * Open a room that *is* a level.
 *
 * Everything `createRoom` does, plus the reference - so the room has its own
 * topic, its own chat, its own door and its own row in the sidebar, and draws
 * the XP runtime instead of the lounge scene. docs/xp/backlog.md §11.5.
 *
 * A second exported action rather than an optional argument on the first,
 * because the two are guarded differently in one respect that matters: this one
 * has to prove the caller may *play* that level as well as open a room, and the
 * proof is `listPlayableXps` in `domain/xps/place-actions.ts`, which is where
 * this is called from. Making it a parameter would put a reference on the
 * public surface of the ordinary room action with nothing checking it.
 *
 * The reference is validated here as well, because "the caller checked" is the
 * arrangement that fails the day there are two callers.
 */
export async function createXpRoom(
  slug: string,
  name: string,
  xpRef: string,
  /**
   * Heads at once, from the level's own `players.max`.
   *
   * The door is where a declared number has to be read, and this is how it gets
   * there: a board game for four opens a room capped at four, so the fifth
   * person meets `admitToRoom` and a sentence rather than a board with no seat.
   *
   * Ignored when it is outside what a room may be capped at - a level for one
   * is below `ROOM_CAP_MIN`, and a room of one is a room nobody can be joined
   * in. The level still knows it is for one; the room simply does not pretend
   * to enforce a number it has no shape for.
   */
  cap?: number,
): Promise<RoomResult> {
  // The same shape `setRoomXp` checks and the read model's constraint enforces,
  // written once in the schema next door.
  if (!xpRefSchema.safeParse(xpRef).success) {
    return { ok: false, error: 'That is not a level' }
  }

  const parsed = createRoomSchema.safeParse({ name, visibility: 'open' })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const full = await placesFull(guarded, 'xp')
  if (full) return { ok: false, error: full }

  const roomId = randomUUID()
  const candidate = roomSlug(parsed.data.name, roomId)

  if (await nameTaken(guarded.supabase, guarded.tenantId, candidate)) {
    return { ok: false, error: taken(parsed.data.name) }
  }

  return run(
    guarded,
    roomId,
    {
      type: 'CreateRoom',
      actorId: guarded.userId,
      name: parsed.data.name,
      visibility: parsed.data.visibility,
      xpRef,
      ...(cap !== undefined && cap >= ROOM_CAP_MIN && cap <= ROOM_CAP_MAX ? { cap } : {}),
    },
    candidate,
  )
}

/**
 * Open the next room, because every existing one is full.
 *
 * ----------------------------------------------------------------------------
 * Why this is an action and not part of the room page
 * ----------------------------------------------------------------------------
 * The obvious place for it is the door check in `admitToRoom`, which already
 * knows the venue is full. It cannot go there: that runs during a render, and
 * Next prefetches routes - so an overflow that happened during a render would
 * open rooms when somebody hovered a link in the picker. The full-room page
 * fires this instead, which is a real request with a real actor behind it.
 *
 * ----------------------------------------------------------------------------
 * Who may do it
 * ----------------------------------------------------------------------------
 * An owner or admin always, exactly as `createRoom` allows. A *guest* may too,
 * when the event's ceiling lists `rooms` and the host has not switched it off -
 * which is the "guests can open rooms, or only admins can" switch, and it is
 * enforced by the same `event_guest_may_write` the database uses, not by this
 * check alone. That is what makes an eighty-person event self-service at the
 * moment it fills up, at 2am, without anybody having to find an admin.
 *
 * The room is created by whoever needed it. No service-role path and no phantom
 * actor: the log says who opened Hall 5, and it was the person who could not
 * get into Hall 4.
 */
export async function openOverflowRoom(slug: string): Promise<RoomResult> {
  const context = await requireTenant(slug, { guests: 'event', surface: 'rooms' })
  requireFeature(context, 'lounge')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const event = context.event
  const isStaff = hasRole(context, ['owner', 'admin'])

  if (!isStaff) {
    if (!event || event.phase !== 'running') {
      return { ok: false, error: 'Only an owner or admin can open a room here' }
    }
    if (!guestMay(event, context.tenant.capabilities, 'rooms')) {
      return { ok: false, error: 'This event does not let visitors open rooms' }
    }
  }

  if (!event) {
    return { ok: false, error: 'This space does not overflow rooms' }
  }
  if (!event.roomOverflow) {
    return { ok: false, error: 'This event does not open extra rooms' }
  }

  // No tier cap here, on purpose, and it must stay that way. This is the
  // automatic overflow that opens a room when the last one filled up, and the
  // ceiling that applies is the event's own `roomMax` - the number that was
  // sold for this event. Applying `xoPlaces` as well would stop an event
  // overflowing halfway through, and what that looks like from outside is
  // people who cannot get in to a thing they were invited to, at the moment
  // the room is busiest.
  const existing = await listRooms(context.supabase, context.tenant.id)
  if (existing.length >= event.roomMax) {
    return {
      ok: false,
      error: `This event is capped at ${event.roomMax} rooms, and they are all open.`,
    }
  }

  // Named by number, from the count rather than from a stored counter. A
  // collision - two people overflowing in the same second - is caught by
  // `nameTaken` below and retried once with the next number up, which is
  // cheaper than serialising room creation behind a lock for an event that
  // fills up twice a weekend.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const name = `Hall ${existing.length + 1 + attempt}`
    const roomId = randomUUID()
    const candidate = roomSlug(name, roomId)

    if (await nameTaken(context.supabase, context.tenant.id, candidate)) continue

    return run(
      {
        ok: true,
        supabase: context.supabase,
        tenantId: context.tenant.id,
        userId: context.user.id,
        slug,
        tier: context.tenant.tier,
      },
      roomId,
      {
        type: 'CreateRoom',
        actorId: context.user.id,
        name,
        visibility: 'open',
      },
      candidate,
    )
  }

  return { ok: false, error: 'Could not open another room just now. Try again.' }
}

/** One sentence for a name somebody else is standing in. */
function taken(name: string): string {
  return `“${name}” is already a room here — close it or pick another name`
}

/**
 * List it to the space, or stop listing it.
 *
 * Not a lock. Anybody in the space who has the room's link can still walk in -
 * `can_enter_room` is unchanged - so this decides who *finds* it, and the UI
 * says "unlisted" rather than "private" for exactly that reason. See the note
 * on `RoomVisibility`.
 */
export async function setRoomVisibility(
  slug: string,
  roomId: string,
  visibility: RoomVisibility,
): Promise<RoomResult> {
  const parsed = setRoomVisibilitySchema.safeParse({ roomId, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid visibility' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    {
      type: 'SetRoomVisibility',
      actorId: guarded.userId,
      visibility: parsed.data.visibility,
    },
    owned.slug,
  )
}

/**
 * Switch one room between building and sparring.
 *
 * The room's own mode, not the space's. `setLoungeMode` writes one column on
 * the tenant, so the room page could not offer this switch at all - flipping it
 * from inside a room would have put the lobby and every other room into battle
 * mode at the same moment. The page hardcoded `mode="creative"` for that
 * reason, which left an owner standing in a room with no way out of it. This is
 * the way out.
 *
 * Owner or admin, from `guard` above - the same pair `SetLoungeMode` answers
 * to, and checked here rather than only in the HUD because a Server Action is a
 * public endpoint and hiding a button hides nothing.
 *
 * No revalidate: see the note on `run`'s last argument. The scene applies the
 * new mode to its own state and broadcasts it to the room's channel, which is
 * the room's channel and not the lounge's - so flipping a room is heard by the
 * people standing in it and by nobody else.
 */
export async function setRoomMode(
  slug: string,
  roomId: string,
  mode: RoomMode,
): Promise<RoomResult> {
  const parsed = setRoomModeSchema.safeParse({ roomId, mode })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid mode' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomMode', actorId: guarded.userId, mode: parsed.data.mode },
    owned.slug,
    false,
  )
}

/**
 * How many people fit in this room.
 *
 * Revalidates, unlike `setRoomMode` above: this is set from the rooms page
 * rather than from inside the canvas, and the picker's `7 / 10` badge is
 * exactly the thing that has to change.
 *
 * The cap is not enforced here - nothing stops a room that is already over a
 * new, smaller cap, and nobody standing in it is thrown out. The cap is a rule
 * about *admission*, checked at the door in the room page, so lowering it
 * during an event means the room drains rather than empties.
 */
export async function setRoomCap(
  slug: string,
  roomId: string,
  cap: number | null,
): Promise<RoomResult> {
  const parsed = setRoomCapSchema.safeParse({ roomId, cap })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid capacity' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomCap', actorId: guarded.userId, cap: parsed.data.cap },
    owned.slug,
  )
}

/**
 * May guests build in this room?
 *
 * Only ever narrows: `event_guest_may_build()` checks the space's `build`
 * capability first and consults this afterwards, so switching it on in a space
 * that never sold building changes nothing. That ordering is in the SQL rather
 * than here on purpose - it is the half that a guest driving the API by hand
 * also has to obey.
 */
export async function setRoomGuestBuild(
  slug: string,
  roomId: string,
  allowed: boolean,
): Promise<RoomResult> {
  const parsed = setRoomGuestBuildSchema.safeParse({ roomId, allowed })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid setting' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomGuestBuild', actorId: guarded.userId, allowed: parsed.data.allowed },
    owned.slug,
  )
}

export async function renameRoom(
  slug: string,
  roomId: string,
  name: string,
): Promise<RoomResult> {
  const parsed = renameRoomSchema.safeParse({ roomId, name })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  // The room renaming itself is excluded, so "Workshop" -> "workshop" is a
  // rename rather than a collision with itself.
  const candidate = roomSlug(parsed.data.name, parsed.data.roomId)
  const clash = await nameTaken(
    guarded.supabase,
    guarded.tenantId,
    candidate,
    parsed.data.roomId,
  )
  if (clash) return { ok: false, error: taken(parsed.data.name) }

  return run(
    guarded,
    parsed.data.roomId,
    {
      type: 'RenameRoom',
      actorId: guarded.userId,
      name: parsed.data.name,
    },
    candidate,
  )
}

/**
 * Put another game in the slot.
 *
 * Owner or admin, from `guard` - the same pair that may open the room and close
 * it. This is not the round's decision, which any member makes because it lasts
 * minutes; it is what the room *is*, which everybody in the space will find
 * there tomorrow.
 *
 * The reference is checked for shape here and for *existence* by the caller in
 * `domain/xps/place-actions.ts`, which is the only side that can ask what this
 * space may play. That split is the same one `createXpRoom` keeps, and for the
 * same reason: a decider cannot read the store, and this action cannot either
 * without becoming a second copy of `listPlayableXps`.
 *
 * Revalidates, unlike `setRoomMode`. The scene under the person pressing this
 * is the *old* level, and tearing it down is the point rather than the cost -
 * the room page re-renders and mounts the new document. Everybody else standing
 * in the room keeps playing what they loaded until they reload; the swap is not
 * broadcast, and pretending otherwise would need the runtime to be able to
 * change documents underneath a running scene.
 */
export async function setRoomXp(
  slug: string,
  roomId: string,
  xpRef: string,
  cap?: number,
): Promise<RoomResult> {
  const parsed = setRoomXpSchema.safeParse({
    roomId,
    xpRef,
    // A number outside what a room may be capped at is dropped rather than
    // refused, exactly as `createXpRoom` drops it: a level for one is below
    // ROOM_CAP_MIN, and that is the level's business rather than a reason the
    // swap cannot happen.
    ...(cap !== undefined && cap >= ROOM_CAP_MIN && cap <= ROOM_CAP_MAX ? { cap } : {}),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not a level' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    {
      type: 'SetRoomXp',
      actorId: guarded.userId,
      xpRef: parsed.data.xpRef,
      ...(parsed.data.cap === undefined ? {} : { cap: parsed.data.cap }),
    },
    owned.slug,
  )
}

/**
 * Close a room.
 *
 * The blocks stay exactly where they are, so a room that is closed and reopened
 * is the room people built rather than an empty one. What closing does take
 * away immediately is the *channel*: `can_enter_room` checks the flag, so
 * anybody still standing in it is refused the topic on their next reconnect
 * rather than left broadcasting into a place the space has shut.
 */
export async function closeRoom(slug: string, roomId: string): Promise<RoomResult> {
  const parsed = roomIdSchema.safeParse({ roomId })
  if (!parsed.success) return { ok: false, error: 'Invalid room' }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'CloseRoom', actorId: guarded.userId },
    owned.slug,
  )
}

/**
 * Deal, and open the table again.
 *
 * ---------------------------------------------------------------------------
 * Any member, and that is the decision
 * ---------------------------------------------------------------------------
 * Every other action in this file goes through `guard`, which is owner-or-admin
 * because a room is a shared, persistent, named thing that appears in
 * everybody's sidebar. A round is not that shape at all: it is a table saying
 * "we are playing now", it lasts minutes, and the person who deals is whoever
 * is sitting down. Needing an admin to start a board game is the version of
 * this nobody would use.
 *
 * So the check is membership and the ordinary write block, and *not* the role.
 * Reopening is the same, deliberately widened past whoever started it: a round
 * only its dealer could end is a table left locked when they close their laptop.
 *
 * The decider still refuses a round in a room that is not a level, so the worst
 * a stray call can do is a refusal.
 */
async function atTable(slug: string): Promise<Guarded> {
  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'lounge')

  // Guests included: an event's attendees are the people at the table, and the
  // same argument `createBattle` makes about a visitor who cannot start the
  // match everybody came for applies word for word here.
  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  return {
    ok: true,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    slug,
    tier: context.tenant.tier,
  }
}

export async function startRound(slug: string, roomId: string): Promise<RoomResult> {
  const guarded = await atTable(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    roomId,
    {
      type: 'StartRound',
      actorId: guarded.userId,
      // The server's clock. A browser that could name the start could name it
      // in the past, which is a round that was already over when it began.
      now: new Date().toISOString(),
    },
    owned.slug,
  )
}

export async function reopenRound(slug: string, roomId: string): Promise<RoomResult> {
  const guarded = await atTable(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, roomId)
  if (!owned.ok) return owned

  return run(guarded, roomId, { type: 'ReopenRound', actorId: guarded.userId }, owned.slug)
}
