import { RADIO_STREAM_TYPE, type RadioEvent } from '@/domain/radio/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * One row per space: what is on, and the two numbers that place the room in it.
 *
 * The row is overwritten rather than accumulated, which makes this the rare
 * projection where the read model is much smaller than its log. That is the
 * right shape - "what is playing" has exactly one answer, and the history of
 * everything that was ever on is still in `events` for anybody who wants it.
 *
 * `started_at` is taken from the *event's* `createdAt`, never from the clock of
 * whoever pressed play and never from `new Date()` here. It is the anchor every
 * browser subtracts from to find the playhead, so it has to be one clock they
 * all agree on, and Postgres is the only such clock in reach. See sync.ts.
 */
export const radioProjection: Projection<RadioEvent> = {
  name: 'space_radio',
  streamTypes: [RADIO_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<RadioEvent>): Promise<void> {
    switch (event.type) {
      /**
       * A new track resets the offset. Somebody putting a song on means from
       * the top, even if the last one was paused forty seconds in.
       */
      case 'TrackStarted':
        await upsert(supabase, {
          tenant_id: event.tenantId,
          track_url: event.data.trackUrl,
          title: event.data.title,
          started_at: event.createdAt,
          position_ms: 0,
          playing: true,
          // Absent on history from before the reach existed, and all of that
          // meant the whole space - the same default the fold applies.
          scope: event.data.scope ?? 'space',
          place: event.data.scope === 'room' ? (event.data.place ?? null) : null,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      /**
       * Stopping is where the arithmetic happens: the anchor and this event's
       * timestamp bracket a span of real time, and adding it to the offset we
       * were already at is where in the song the room had got to.
       *
       * Worked out here rather than reported by the client that pressed stop,
       * for the reason `TrackStopped` gives: an admin's own widget position is
       * their playback, not the room's, and a backgrounded tab's is not even
       * close. Both timestamps come from the same database clock, so the
       * subtraction is meaningful in a way that anything involving a browser's
       * `Date.now()` would not be.
       *
       * Read-modify-write, which most projections here avoid. Safe for the same
       * reason `SpaceCapabilitySet` is: a tenant's events are applied in order
       * by a single `runProjection` pass, so there is no second writer to race.
       * The `version` guard below is what keeps it idempotent - a checkpoint
       * lost between applying this and saving the cursor would otherwise replay
       * the stop and add the elapsed span a second time, sending the resume
       * point steadily further into the track on every retry.
       */
      case 'TrackStopped': {
        const row = await read(supabase, event.tenantId)
        if (!row || row.version >= event.version) return

        await patch(supabase, event, {
          playing: false,
          position_ms: elapsedInto(row.position_ms, row.started_at, event.createdAt),
        })
        return
      }

      /**
       * Resuming re-anchors and changes nothing else. The offset stays exactly
       * where the stop put it; `started_at` becomes now, so a listener joining
       * two minutes later computes two minutes past that offset rather than two
       * minutes past zero.
       */
      case 'TrackResumed':
        await patch(supabase, event, { playing: true, started_at: event.createdAt })
        return

      default:
        return
    }
  },
}

/**
 * Where in the track we had got to, in milliseconds.
 *
 * Clamped at zero because the two timestamps come from a clock that can be
 * stepped backwards - NTP corrections happen, and a negative seek position
 * would be rejected by the player and leave the radio stuck at a point it
 * cannot reach. A missing anchor means a row written by an older version of
 * this file; keeping the offset it already had is the honest answer.
 */
function elapsedInto(positionMs: number, startedAt: string | null, stoppedAt: string): number {
  if (!startedAt) return positionMs

  const span = Date.parse(stoppedAt) - Date.parse(startedAt)
  if (!Number.isFinite(span)) return positionMs

  return Math.max(0, Math.round(positionMs + span))
}

interface RadioRow {
  tenant_id: string
  track_url: string | null
  title: string | null
  started_at: string | null
  position_ms: number
  playing: boolean
  scope: string
  place: string | null
  updated_at: string
  version: number
}

async function read(supabase: Client, tenantId: string) {
  const { data, error } = await supabase
    .from('space_radio')
    .select('position_ms, started_at, version')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`radio projection failed to read ${tenantId}: ${error.message}`)
  }
  return data
}

async function upsert(supabase: Client, row: RadioRow): Promise<void> {
  const { error } = await supabase
    .from('space_radio')
    .upsert(row, { onConflict: 'tenant_id' })

  if (error) {
    throw new Error(`radio projection failed to upsert ${row.tenant_id}: ${error.message}`)
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<RadioEvent>,
  changes: Partial<RadioRow>,
): Promise<void> {
  const { error } = await supabase
    .from('space_radio')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('tenant_id', event.tenantId)

  if (error) {
    throw new Error(`radio projection failed to update ${event.tenantId}: ${error.message}`)
  }
}
