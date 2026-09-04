import 'server-only'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { hasRoomFor } from '@/domain/billing/quota'
import type { Tier } from '@/domain/billing/tiers'
import { roomDecider } from '@/domain/rooms/aggregate'
import { createRoomSchema, type RoomCommand } from '@/domain/rooms/commands'
import type { RoomVisibility } from '@/domain/rooms/events'
import { roomsProjection } from '@/domain/rooms/projection'
import { listRooms } from '@/domain/rooms/queries'
import { roomSlug } from '@/domain/rooms/slug'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import {
  hasRole,
  writeBlockedReason,
  type TenantContext,
} from '@/lib/tenant'

/**
 * Opening a room, and the machinery every other room command runs on.
 *
 * This is `actions.ts` with the door taken off. That file still holds the
 * fifteen Server Actions and the argument for where each check lives; what
 * moved here is everything that happens *after* somebody has been let into the
 * space, because the phone opens rooms too and a route handler cannot call a
 * Server Action.
 *
 * The split follows the one the whole native app is built on: `requireTenant`
 * and `requireBearerTenant` are two ways through the same door, both hand back
 * a `TenantContext`, and every rule past that point is written once. In here
 * that means the role check, the write gate, the place cap, the name
 * reservation and the command itself - the five things that decide whether a
 * room may exist - rather than fifteen actions' worth of plumbing.
 *
 * `revalidatePath` stays inside `run`, and is deliberate rather than an
 * oversight: it is valid in a route handler as well as an action, it is what
 * keeps the web's rail correct after any of these commands, and moving it out
 * would mean fifteen call sites each remembering to do it.
 *
 * Not a `'use server'` file. It takes a context object, which a client must
 * never be able to supply.
 */

export type RoomResult =
  | { ok: true; roomId: string; slug: string }
  | { ok: false; error: string }

export function toResult(error: unknown): RoomResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That room changed elsewhere. Try again.' }
  }
  throw error
}

export type Guarded =
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

export function guardFrom(context: TenantContext): Guarded {
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // Hiding the button hides nothing - a Server Action is a public endpoint, and
  // so is a route handler.
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or admin can manage rooms' }
  }

  return {
    ok: true,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    slug: context.tenant.slug,
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
export async function placesFull(
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
export async function assertOwned(
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
export async function nameTaken(
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

export async function run(
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
/** One sentence for a name somebody else is standing in. */
export function taken(name: string): string {
  return `“${name}” is already a room here — close it or pick another name`
}

async function createRoomFor(
  guarded: Extract<Guarded, { ok: true }>,
  name: string,
  visibility: RoomVisibility = 'open',
): Promise<RoomResult> {
  const parsed = createRoomSchema.safeParse({ name, visibility })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

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
 * Open a room, with the space already established.
 *
 * The context comes from whichever door the caller came through. Everything
 * else - lounge flag, write gate, role, cap, name - is asked here, so a room
 * opened from a phone is the same room, refused for the same reasons and in the
 * same words.
 */
export async function openRoomIn(
  context: TenantContext,
  name: string,
  visibility: RoomVisibility = 'open',
): Promise<RoomResult> {
  const guarded = guardFrom(context)
  if (!guarded.ok) return guarded

  return createRoomFor(guarded, name, visibility)
}
