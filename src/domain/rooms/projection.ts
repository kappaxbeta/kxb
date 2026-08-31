import { ROOM_STREAM_TYPE, type RoomEvent } from '@/domain/rooms/events'
import { roomSlug } from '@/domain/rooms/slug'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The rooms a space can walk into.
 *
 * Deliberately thin - a name, who opened it, and whether it is still open. No
 * block count and no occupancy, for the two reasons those would each be a
 * mistake: counting blocks would mean reacting to every BlocksPlaced, the
 * hottest event in the log (see the note on battlefieldsProjection), and
 * occupancy is not in the log at all. Who is standing in a room right now lives
 * on a Realtime channel and is gone when the tab closes; a projection that
 * tried to hold it would be permanently, invisibly wrong.
 *
 * Occupancy does now have a table - `world_occupancy`, added for room caps in
 * 20260826000000 - and it is worth saying why that does not contradict the
 * paragraph above. It is heartbeat rows with a twenty-second life, written by
 * the client and swept by a reaper, not folded from anything. Nothing replays
 * it and nothing would be recoverable if it were lost, which is exactly the
 * property that keeps it out of here.
 *
 * The cap itself *is* in the log, because it is a decision somebody made
 * rather than a fact about right now, so `cap` and `guest_build` are projected
 * like any other setting.
 */
export const roomsProjection: Projection<RoomEvent> = {
  name: 'rooms_read_model',
  streamTypes: [ROOM_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<RoomEvent>): Promise<void> {
    switch (event.type) {
      case 'RoomCreated': {
        const { error } = await supabase.from('rooms_read_model').upsert(
          {
            // The room's stream id is its world id, so its blocks are already
            // findable without storing a second key.
            room_id: event.streamId,
            tenant_id: event.tenantId,
            name: event.data.name,
            // Derived here rather than carried on the event, so a replay
            // reproduces every room's URL from the name the log already has -
            // see the note at the top of ../rooms/slug.ts.
            slug: roomSlug(event.data.name, event.streamId),
            visibility: event.data.visibility ?? 'open',
            // Written rather than left to the column default, so a replay into
            // a fresh table produces the same row as a live create - the mode
            // is not on the event because every room opens creative.
            mode: 'creative',
            closed: false,
            // From the event, never now() or the session: a replay may be
            // rebuilding a room opened months ago by somebody since departed.
            // Null for an ordinary room, which is every room opened before
            // levels could be rooms. See 20261012000000_rooms_xp.sql.
            xp_ref: event.data.xpRef ?? null,
            // Written rather than left to the column default, for the reason
            // `mode` above is: a room opens unpinned and ungrouped, and a
            // replay into a fresh table should produce the row a live create
            // does rather than one that depends on the default.
            pinned_at: null,
            room_group: null,
            room_icon: null,
            room_tint: null,
            created_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'room_id' },
        )
        if (error) {
          throw new Error(`rooms projection failed to create: ${error.message}`)
        }
        return
      }

      case 'RoundStarted':
        await patch(supabase, event, { round_started_at: event.data.at })
        return

      case 'RoundReopened':
        await patch(supabase, event, { round_started_at: null })
        return

      case 'RoomRenamed':
        // The URL follows the name. A room renamed to something already taken
        // is refused in the action; if one slips past that check the unique
        // index refuses it here, which fails the projection rather than
        // pointing one URL at two rooms.
        await patch(supabase, event, {
          name: event.data.name,
          slug: roomSlug(event.data.name, event.streamId),
        })
        return

      // The slot's contents. Never null - the decider only ever swaps one
      // level for another - so a room's *kind* is still decided by its
      // creation event alone.
      case 'RoomXpSet':
        await patch(supabase, event, { xp_ref: event.data.xpRef })
        return

      case 'RoomVisibilitySet':
        await patch(supabase, event, { visibility: event.data.visibility })
        return

      case 'RoomModeSet':
        await patch(supabase, event, { mode: event.data.mode })
        return

      case 'RoomCapSet':
        await patch(supabase, event, { cap: event.data.cap })
        return

      case 'RoomGuestBuildSet':
        await patch(supabase, event, { guest_build: event.data.allowed })
        return

      /*
       * The pin, stamped with the event's own time.
       *
       * `event.createdAt` rather than `now()`, which is the rule every arm in
       * here keeps and matters more than usual for this one: the column is what
       * the list is *ordered by*, so a replay stamping today would reshuffle
       * every pinned room in the product into the order the projector happened
       * to catch up in.
       */
      case 'RoomPinSet':
        await patch(supabase, event, {
          pinned_at: event.data.pinned ? event.createdAt : null,
        })
        return

      case 'RoomGroupSet':
        await patch(supabase, event, { room_group: event.data.group })
        return

      case 'RoomIconSet':
        await patch(supabase, event, { room_icon: event.data.icon })
        return

      case 'RoomTintSet':
        await patch(supabase, event, { room_tint: event.data.tint })
        return

      case 'RoomClosed':
        await patch(supabase, event, { closed: true })
        return

      default:
        return
    }
  },
}

type RoomPatch = {
  name?: string
  slug?: string
  visibility?: string
  mode?: string
  xp_ref?: string
  cap?: number | null
  guest_build?: boolean
  closed?: boolean
  round_started_at?: string | null
  pinned_at?: string | null
  room_group?: string | null
  room_icon?: string | null
  room_tint?: string | null
}

async function patch(
  supabase: Client,
  event: StoredEvent<RoomEvent>,
  changes: RoomPatch,
): Promise<void> {
  const { error } = await supabase
    .from('rooms_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('room_id', event.streamId)

  if (error) {
    throw new Error(`rooms projection failed to update ${event.streamId}: ${error.message}`)
  }
}
