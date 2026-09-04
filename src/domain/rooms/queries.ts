import 'server-only'
import type { RoomMode, RoomVisibility } from '@/domain/rooms/events'
import { roomIcon, roomTint, type RoomIcon, type RoomTint } from '@/domain/rooms/look'
import type { Client } from '@/es/store'

/**
 * The read side of rooms.
 *
 * Two questions and nothing else: what can I walk into, and is this one real.
 * Anything about who is *in* a room is deliberately absent - that lives on a
 * Realtime channel and is gone when the tab closes, so a server-rendered answer
 * would be stale before it reached the browser.
 */

export interface RoomView {
  roomId: string
  tenantId: string
  name: string
  /** How the room is addressed in a URL. Unique per space among open rooms. */
  slug: string
  visibility: RoomVisibility
  /** Building or scrapping. This room's own, not the space's. */
  mode: RoomMode
  /** Heads at once, or null for "whatever the event says". */
  cap: number | null
  /** May a guest place blocks in here? Only ever narrows the event's answer. */
  guestBuild: boolean
  /**
   * Coins to walk in. `0` is free, which is every room until an owner says
   * otherwise. See `RoomDoorPriceSet`.
   */
  doorPrice: number
  /**
   * The level this room is, or null for an ordinary lounge room.
   *
   * Set at creation and never after - see `RoomCreated`. What it changes is
   * only what is drawn inside: everything else about the room, from its topic
   * to its chat to its door, is what it always was.
   */
  xpRef: string | null
  /**
   * When the current round began, or null when the room takes newcomers.
   *
   * Only ever set on a room that is a level. The door reads it - see
   * `admitToRoom` - and the room's own chrome shows it, which is why it is on
   * the view rather than fetched where it is needed.
   */
  roundStartedAt: string | null
  /**
   * When an owner or admin pinned this room for the whole space, or null.
   *
   * The *space's* pin. A member's own is in `room_marks` and is private to
   * them - see `src/domain/rooms/marks.ts` for why the two are stored in
   * completely different ways, and `orderPlaces` for how they are read
   * together.
   *
   * A timestamp rather than a boolean, because several pinned rooms need an
   * order and "whichever was pinned first" is the only one nobody has to be
   * taught.
   */
  adminPinnedAt: string | null
  /** The caption this room is listed under in the rail, or null. */
  group: string | null
  /**
   * The glyph this room is drawn with, or null for the default one.
   *
   * A name out of `ROOM_ICONS`, narrowed on the way out of the row - an
   * unrecognised one becomes the default rather than throwing, see `roomIcon`.
   */
  icon: RoomIcon | null
  /** The palette token that glyph is drawn in, or null for the rail's own. */
  tint: RoomTint | null
  createdAt: string
}

/**
 * Every column a `RoomView` is made of, written once.
 *
 * Three selects had the same list and it had grown to eleven columns; the next
 * one added would have been added to two of them.
 */
const ROOM_COLUMNS =
  'room_id, tenant_id, name, slug, visibility, mode, cap, guest_build, door_price, xp_ref, round_started_at, pinned_at, room_group, room_icon, room_tint, created_at'

type Row = {
  room_id: string
  tenant_id: string
  name: string
  slug: string
  visibility: string
  mode: string
  cap: number | null
  guest_build: boolean
  door_price: number | null
  xp_ref: string | null
  round_started_at: string | null
  pinned_at: string | null
  room_group: string | null
  room_icon: string | null
  room_tint: string | null
  created_at: string
}

function toView(row: Row): RoomView {
  return {
    roomId: row.room_id,
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    // Anything the check constraint is later widened to accept reads as the
    // *narrower* option, which is the failure that reveals least.
    visibility: row.visibility === 'private' ? 'private' : 'open',
    // Narrowed the same way, and towards `creative` because that is the mode
    // every room has been in since rooms shipped: a value this build does not
    // recognise should leave the room behaving as it always has rather than
    // turn fighting on in it.
    mode: row.mode === 'battle' ? 'battle' : 'creative',
    cap: typeof row.cap === 'number' ? row.cap : null,
    xpRef: row.xp_ref ?? null,
    roundStartedAt: row.round_started_at ?? null,
    adminPinnedAt: row.pinned_at ?? null,
    // Trimmed to null, so a caption that is nothing but whitespace - which the
    // command schema refuses but an older row could hold - reads as ungrouped
    // rather than drawing a heading with no words in it.
    group: row.room_group?.trim() ? row.room_group.trim() : null,
    icon: roomIcon(row.room_icon),
    tint: roomTint(row.room_tint),
    // Towards permissive, unlike the two above, and for the reason the column
    // default gives: this switch only ever *narrows* the event's answer, so a
    // value this build cannot read must not be what silently stops a room
    // full of people building.
    guestBuild: row.guest_build !== false,
    // Null for a row written before doors could charge. Free, which is what
    // those rooms were.
    doorPrice: row.door_price ?? 0,
    createdAt: row.created_at,
  }
}

/**
 * The rooms this caller can see, oldest first - the order they were opened.
 *
 * `includePrivate` is the manage view: owners and admins see the unlisted ones
 * too, because they are the people who can open, hide and close them, and a
 * room they cannot see is a room they cannot close. Everybody else gets the
 * listed ones - which is the whole of what `private` means here. It is not a
 * wall: see the note on `RoomVisibility`.
 */
export async function listRooms(
  supabase: Client,
  tenantId: string,
  { includePrivate = false }: { includePrivate?: boolean } = {},
): Promise<RoomView[]> {
  let query = supabase
    .from('rooms_read_model')
    .select(ROOM_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('closed', false)

  if (!includePrivate) query = query.eq('visibility', 'open')

  const { data, error } = await query
    // Oldest first, unlike the battlefield list. A room is a *place*: people
    // learn where it sits in the list and reach for it by position, and a list
    // that reshuffles whenever somebody opens a new one is a list you have to
    // read every time.
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list rooms: ${error.message}`)
  return (data ?? []).map(toView)
}

/**
 * One room, by the name in its URL.
 *
 * The room page's lookup. Null rather than a throw for both "does not exist"
 * and "you may not see it" - the select policy makes those indistinguishable
 * from here, which is the same reason `findBattlefield` gives and the same
 * reason `requireTenant` 404s a non-member rather than confirming the space is
 * real.
 */
export async function findRoomBySlug(
  supabase: Client,
  tenantId: string,
  slug: string,
): Promise<RoomView | null> {
  const { data, error } = await supabase
    .from('rooms_read_model')
    .select(ROOM_COLUMNS)
    // Scoped to the space, unlike `findRoom` below: a slug is only unique
    // within one, so this pair is the key and either half alone is not.
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('closed', false)
    .maybeSingle()

  if (error) throw new Error(`Failed to load room: ${error.message}`)
  return data ? toView(data) : null
}

/**
 * One room, by id.
 *
 * Still here for the links that were handed out while rooms were addressed by
 * uuid - the room page redirects those to the name. Everything else should be
 * reaching for `findRoomBySlug`.
 */
export async function findRoom(
  supabase: Client,
  roomId: string,
): Promise<RoomView | null> {
  const { data, error } = await supabase
    .from('rooms_read_model')
    .select(ROOM_COLUMNS)
    .eq('room_id', roomId)
    .eq('closed', false)
    .maybeSingle()

  if (error) throw new Error(`Failed to load room: ${error.message}`)
  return data ? toView(data) : null
}
