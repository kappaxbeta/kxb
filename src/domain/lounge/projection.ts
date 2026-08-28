import {
  LOUNGE_CHUNK_STREAM_TYPE,
  type LoungeEvent,
  worldOf,
} from '@/domain/lounge/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * One row per block.
 *
 * The obvious alternative - one row per chunk holding a JSON blob of its blocks
 * - was rejected because applying a delta to a blob is a read-modify-write, and
 * read-modify-write is not idempotent. Two projector runs overlapping on the
 * same chunk would each read the old blob and each write their own version,
 * silently losing the other's blocks.
 *
 * Row-per-block avoids that entirely: placing is an upsert, removing is a
 * delete, and running either twice lands on the same world. It costs more rows
 * (a large build is tens of thousands) which Postgres does not care about.
 *
 * Note `placed_by` comes from the event's actor and `placed_at` from its
 * timestamp - never from `now()` or a session. A projection may be replaying
 * something built months ago by someone who has since left the workspace, so
 * every value it writes has to come out of the log.
 */
export const loungeProjection: Projection<LoungeEvent> = {
  name: 'lounge_blocks_read_model',
  streamTypes: [LOUNGE_CHUNK_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<LoungeEvent>): Promise<void> {
    switch (event.type) {
      case 'BlocksPlaced': {
        // Deduplicate by cell, last wins.
        //
        // The decider now guarantees an event never lists a cell twice, but
        // events written before it did are in the log forever, and a projection
        // has to be able to replay every event that was ever valid to append.
        // Postgres rejects an upsert whose rows collide on the primary key
        // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), so
        // without this a single historical batch would wedge the projector on
        // every run and no later event would ever be applied.
        const byCell = new Map<string, (typeof event.data.blocks)[number]>()
        for (const block of event.data.blocks) {
          byCell.set(`${block.x},${block.y},${block.z}`, block)
        }

        const rows = [...byCell.values()].map((block) => ({
          tenant_id: event.tenantId,
          world_id: worldOf(event.data, event.tenantId),
          cx: event.data.cx,
          cz: event.data.cz,
          x: block.x,
          y: block.y,
          z: block.z,
          // The domain calls it `model` (a palette id); the table calls it
          // `type`. Mapping here keeps the event log free of schema naming.
          type: block.model,
          // The palette's colour lives in the glTF material, so nothing to
          // record. The column stays for tinted blocks later.
          color: null,
          placed_by: event.actorId,
          placed_at: event.createdAt,
        }))

        // One statement for the whole batch. The batching that made the write
        // side cheap pays off again here.
        const { error } = await supabase
          .from('lounge_blocks_read_model')
          .upsert(rows, { onConflict: 'tenant_id,world_id,x,y,z' })

        if (error) {
          throw new Error(`lounge projection failed to place blocks: ${error.message}`)
        }
        return
      }

      case 'BlocksRemoved': {
        // PostgREST cannot express "delete where (x,y,z) in (tuples)", so this
        // deletes by composite key one position at a time. Removals arrive in
        // far smaller batches than placements, and correctness beats cleverness
        // in a projector that has to survive replay.
        for (const position of event.data.positions) {
          const { error } = await supabase
            .from('lounge_blocks_read_model')
            .delete()
            .eq('tenant_id', event.tenantId)
            .eq('world_id', worldOf(event.data, event.tenantId))
            .eq('x', position.x)
            .eq('y', position.y)
            .eq('z', position.z)

          if (error) {
            throw new Error(`lounge projection failed to remove block: ${error.message}`)
          }
        }
        return
      }

      case 'ChunkCleared': {
        const { error } = await supabase
          .from('lounge_blocks_read_model')
          .delete()
          .eq('tenant_id', event.tenantId)
          .eq('world_id', worldOf(event.data, event.tenantId))
          .eq('cx', event.data.cx)
          .eq('cz', event.data.cz)

        if (error) {
          throw new Error(`lounge projection failed to clear chunk: ${error.message}`)
        }
        return
      }

      default:
        return
    }
  },
}
