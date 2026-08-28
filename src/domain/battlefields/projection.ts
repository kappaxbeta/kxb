import {
  BATTLEFIELD_STREAM_TYPE,
  type BattlefieldEvent,
} from '@/domain/battlefields/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The list of arenas a space can pick from.
 *
 * No block counts here, deliberately. The obvious feature - "show how big each
 * battlefield is" - would mean this projection reacting to every BlocksPlaced
 * in the log, which is the hottest event type there is: a player dragging
 * across a wall emits them several times a second. Coupling a listing page's
 * bookkeeping to that is how the block projector gets slow.
 *
 * The count is read on demand instead, by the queries in ./queries.ts, from the
 * block table that already has the index for it.
 */
export const battlefieldsProjection: Projection<BattlefieldEvent> = {
  name: 'battlefields_read_model',
  streamTypes: [BATTLEFIELD_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<BattlefieldEvent>): Promise<void> {
    switch (event.type) {
      case 'BattlefieldCreated': {
        const { error } = await supabase.from('battlefields_read_model').upsert(
          {
            // The battlefield's stream id is its world id.
            world_id: event.streamId,
            tenant_id: event.tenantId,
            name: event.data.name,
            visibility: event.data.visibility,
            archived: false,
            // From the event, never now() or a session: a replay may be
            // rebuilding something made months ago by someone since departed.
            created_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'world_id' },
        )
        if (error) {
          throw new Error(`battlefields projection failed to create: ${error.message}`)
        }
        return
      }

      case 'BattlefieldRenamed':
        await patch(supabase, event, { name: event.data.name })
        return

      case 'BattlefieldVisibilitySet':
        await patch(supabase, event, { visibility: event.data.visibility })
        return

      case 'BattlefieldArchived':
        await patch(supabase, event, { archived: true })
        return

      default:
        return
    }
  },
}

type BattlefieldPatch = {
  name?: string
  visibility?: string
  archived?: boolean
}

async function patch(
  supabase: Client,
  event: StoredEvent<BattlefieldEvent>,
  changes: BattlefieldPatch,
): Promise<void> {
  const { error } = await supabase
    .from('battlefields_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('world_id', event.streamId)

  if (error) {
    throw new Error(
      `battlefields projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}
