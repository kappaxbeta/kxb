'use server'

import { randomUUID } from 'node:crypto'
import {
  createRoomSchema,
  renameRoomSchema,
  roomIdSchema,
  setRoomCapSchema,
  setRoomDoorPriceSchema,
  setRoomGuestBuildSchema,
  setRoomGroupSchema,
  setRoomIconSchema,
  setRoomModeSchema,
  setRoomPinnedSchema,
  setRoomTintSchema,
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
import type { RoomIcon, RoomTint } from '@/domain/rooms/look'
import {
  assertOwned,
  guardFrom,
  nameTaken,
  openRoomIn,
  placesFull,
  run,
  taken,
  type Guarded,
  type RoomResult,
} from '@/domain/rooms/open'
import { listRooms } from '@/domain/rooms/queries'
import { roomSlug } from '@/domain/rooms/slug'
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

/**
 * The machinery these actions run on lives in `./open.ts`.
 *
 * `RoomResult`, the guard, the place cap, the name reservation and `run` itself
 * moved there when the phone learned to open a room: a route handler cannot
 * call a Server Action, and fifteen actions' worth of rules were not going to
 * survive being written twice. What is left in this file is the door -
 * `requireTenant`, which reads the session cookie and 404s - and the fifteen
 * commands themselves.
 */

/** The door, for everything below: the space, then the room rules. */
async function guard(slug: string): Promise<Guarded> {
  const context = await requireTenant(slug)
  requireFeature(context, 'lounge')
  return guardFrom(context)
}

/**
 * Open a room.
 *
 * The id is minted rather than derived from the name, even though the name is
 * now unique: the id is what the room's *blocks* are keyed by, and deriving it
 * from a name would mean a rename either moved the world or left the two
 * pointing at different things. The name decides the URL, the id decides the
 * world, and a rename only touches the first. See `openRoomIn`, which is where
 * that now lives.
 */
export async function createRoom(
  slug: string,
  name: string,
  visibility: RoomVisibility = 'open',
): Promise<RoomResult> {
  const context = await requireTenant(slug)
  requireFeature(context, 'lounge')

  return openRoomIn(context, name, visibility)
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
 * Keep this room at the top of the Places list, for everybody in the space.
 *
 * The *space's* pin. A member's own pin is a different thing entirely - it is
 * private, it is not a decision about the room, and it is written to
 * `room_marks` by `pinRoomForMe` next door rather than appended here.
 *
 * Owner or admin, from `guard` above. That is not ceremony over an ordering:
 * this pin is what everybody in the space sees first when they open the rail,
 * so it is a small piece of the space's navigation, and the same pair that
 * decides which rooms exist decides which one leads.
 *
 * Nothing caps how many rooms may be pinned. A space that pins all nine of its
 * rooms has said nothing, and has done it to itself in nine deliberate clicks -
 * a refusal at the fourth would be the product having an opinion about how
 * somebody arranges their own rail.
 */
export async function setRoomPinned(
  slug: string,
  roomId: string,
  pinned: boolean,
): Promise<RoomResult> {
  const parsed = setRoomPinnedSchema.safeParse({ roomId, pinned })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid pin' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomPinned', actorId: guarded.userId, pinned: parsed.data.pinned },
    owned.slug,
  )
}

/**
 * List this room under a caption, or take it out of one.
 *
 * A group is made by naming it. There is no create step and no group to pick
 * from a list that somebody has to fill first, because a group here is not a
 * container - it is a caption several rooms happen to share, and it exists for
 * exactly as long as a room names it. See `RoomGroupSet`.
 *
 * Which means renaming a group is this call once per room in it, and taking a
 * group off its last room is how a group goes away. Both are loops in the
 * caller rather than operations here, and at the size a space's room list
 * actually is - the tier caps it well under twenty - that is the right trade
 * against a groups table with its own screens and its own projection.
 *
 * Owner or admin, like every other decision about how the space is laid out.
 */
export async function setRoomGroup(
  slug: string,
  roomId: string,
  group: string | null,
): Promise<RoomResult> {
  const parsed = setRoomGroupSchema.safeParse({ roomId, group })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid group' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomGroup', actorId: guarded.userId, group: parsed.data.group },
    owned.slug,
  )
}

/**
 * The glyph this room is drawn with in the Places list.
 *
 * Owner or admin, because it is how *everybody* finds the room in the column -
 * the same argument the group and the space's pin make, one layer down. Null
 * takes it off and puts the room back to the default glyph.
 *
 * `setRoomIconSchema` is the only thing that refuses a name nothing can draw:
 * the column has no check constraint, on purpose, so that adding an icon is a
 * code change rather than a migration that has to ship first. See the migration
 * header for the trade.
 */
export async function setRoomIcon(
  slug: string,
  roomId: string,
  icon: RoomIcon | null,
): Promise<RoomResult> {
  const parsed = setRoomIconSchema.safeParse({ roomId, icon })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not an icon' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomIcon', actorId: guarded.userId, icon: parsed.data.icon },
    owned.slug,
  )
}

/** And the colour it is drawn in. Same pair, same rules - see `setRoomIcon`. */
export async function setRoomTint(
  slug: string,
  roomId: string,
  tint: RoomTint | null,
): Promise<RoomResult> {
  const parsed = setRoomTintSchema.safeParse({ roomId, tint })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not a colour' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomTint', actorId: guarded.userId, tint: parsed.data.tint },
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

/**
 * Put a price on the door, or take it off.
 *
 * `docs/product/economy.md` §11. Paid by everybody who walks in - members and
 * admins included, not only strangers - and it goes into the space's bank.
 *
 * The same guard every other room setting uses, which means **any member may
 * set it**, not only an owner. That is the existing shape rather than a
 * decision made here, and it is worth noticing: a toll is the one room setting
 * that can stop somebody getting in at all. If that turns out to be too loose,
 * the fix is `guard` growing a role, not this action growing a second check -
 * every setting beside it would want the same thing.
 */
export async function setRoomDoorPrice(
  slug: string,
  roomId: string,
  price: number,
): Promise<RoomResult> {
  const parsed = setRoomDoorPriceSchema.safeParse({ roomId, price })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid price' }
  }

  const guarded = await guard(slug)
  if (!guarded.ok) return guarded

  const owned = await assertOwned(guarded.supabase, guarded.tenantId, parsed.data.roomId)
  if (!owned.ok) return owned

  return run(
    guarded,
    parsed.data.roomId,
    { type: 'SetRoomDoorPrice', price: parsed.data.price },
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
