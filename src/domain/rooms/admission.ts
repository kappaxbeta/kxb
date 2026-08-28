import 'server-only'
import type { EventView } from '@/domain/events/queries'
import {
  type RoomOccupancy,
  roomOccupancy,
  roomWithSpace,
} from '@/domain/rooms/occupancy'
import { listRooms, type RoomView } from '@/domain/rooms/queries'
import type { Client } from '@/es/store'

/**
 * What happens when somebody walks up to a room.
 *
 *   `ok`        - in you go. The common answer, and the only one an ordinary
 *                 space ever gets, because an ordinary space has no caps.
 *   `elsewhere` - this one is full, that one is not.
 *   `full`      - the whole venue is full. The caller shows the queue, and
 *                 offers to open another room if the event allows it.
 */
export type Admission =
  | { kind: 'ok' }
  | { kind: 'elsewhere'; room: RoomView }
  /**
   * A round is running and this person was not in it when it started.
   *
   * Its own answer rather than `full`, because the two are different facts with
   * different waits: a full room may never have space, and a round ends. The
   * page says so and offers the way somebody actually gets in, which is to wait
   * for it to be reopened.
   */
  | { kind: 'mid_round'; startedAt: string }
  | {
      kind: 'full'
      rooms: RoomView[]
      occupancy: Record<string, RoomOccupancy>
      /** May another room be opened for them right now? */
      canOverflow: boolean
    }

/**
 * Decide whether somebody may come in, and where to put them if not.
 *
 * ----------------------------------------------------------------------------
 * This does not mint anything
 * ----------------------------------------------------------------------------
 * It is called during a page render, and a render must not have side effects -
 * Next prefetches routes, so a version of this that opened an overflow room
 * would open rooms when somebody *hovered a link*. The overflow decision is
 * made here and the overflow itself is performed by `openOverflowRoom`, a
 * server action the full-room page fires. See the note there.
 */
export async function admitToRoom(
  supabase: Client,
  input: {
    tenantId: string
    userId: string
    room: RoomView
    event: EventView | null
    /** May this person open a room? An admin always; a guest if the event says. */
    canMintRoom: boolean
  },
): Promise<Admission> {
  const { tenantId, userId, room, event, canMintRoom } = input

  /**
   * A dealt hand closes the door, and only for people outside it.
   *
   * Checked before the cap, because it is a different question and a cheaper
   * one: a round refuses everybody who is not already inside, whether or not
   * there is a seat spare. The presence read is the same one the cap path does
   * below, and for the same reason - a refresh must not eject somebody from a
   * game they are in the middle of.
   */
  if (room.roundStartedAt) {
    const playing = await isPresent(supabase, tenantId, room.roomId, userId)
    if (!playing) return { kind: 'mid_round', startedAt: room.roundStartedAt }
  }

  // No event, no cap, no question. Checked first and cheaply, because this is
  // the answer for every space in the product that is not an event and the
  // whole of this file should cost them nothing.
  if (!event && room.cap === null) return { kind: 'ok' }

  const rooms = await listRooms(supabase, tenantId)
  const occupancy = await roomOccupancy(supabase, tenantId, rooms, event)

  const here = occupancy.get(room.roomId)
  if (!here || !here.full) return { kind: 'ok' }

  /**
   * Already inside, and the room filled up around them.
   *
   * Without this, a refresh - or the router re-rendering after any action -
   * would eject somebody from the room they are standing in the moment it hit
   * its cap. A cap is a rule about *admission*; it is not a rule about who may
   * stay, which is also why lowering a cap mid-event drains a room rather than
   * emptying it.
   */
  const alreadyHere = await isPresent(supabase, tenantId, room.roomId, userId)
  if (alreadyHere) return { kind: 'ok' }

  const alternative = roomWithSpace(rooms, occupancy, room.roomId)
  if (alternative) return { kind: 'elsewhere', room: alternative }

  return {
    kind: 'full',
    rooms,
    occupancy: Object.fromEntries(occupancy),
    canOverflow:
      canMintRoom &&
      event !== null &&
      event.roomOverflow &&
      event.phase === 'running' &&
      rooms.length < event.roomMax,
  }
}

/**
 * Is this person already counted in this room?
 *
 * Reads the same twenty-second window `world_occupancy_count()` uses, so "in
 * the room" means the same thing to the door as it does to the count. Asking
 * the table rather than trusting the referrer, because the referrer is
 * something the browser sends.
 */
async function isPresent(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 20_000).toISOString()

  const { data } = await supabase
    .from('world_occupancy')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)
    .eq('user_id', userId)
    .gt('seen_at', since)
    .maybeSingle()

  return data !== null && data !== undefined
}
