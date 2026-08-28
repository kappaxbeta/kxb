import { AGENTS_STREAM_TYPE, type AgentEvent } from '@/domain/agents/events'
import type { Projection } from '@/es/projection'
import type { StoredEvent } from '@/es/types'

/**
 * Fold the roster into one flat table.
 *
 * Every handler here is naturally idempotent - an upsert keyed on the agent id,
 * or a delete - so unlike the homestead's purse there is no version guard and
 * nothing to get wrong on a replay. That is a direct consequence of the roster
 * holding no running totals, which was the reason for keeping it out of the
 * homestead stream in the first place.
 *
 * The row carries no position and no activity. Those are derived from
 * `agent_id` and the clock by `src/domain/world/autonomy.ts`, on whichever
 * client is looking - see the note in ./events.ts about why there is nothing to
 * store.
 */

/**
 * Whose creature this is.
 *
 * The event's actor, never the session running the projection: a catch-up run
 * triggered by one member may well be the first to fold a colleague's events,
 * and those rows belong to whoever adopted the animal. The same call the
 * homestead projection makes, for the same reason.
 */
function ownerOf(event: StoredEvent<AgentEvent>): string | null {
  return event.actorId
}

export const agentsProjection: Projection<AgentEvent> = {
  name: 'agents_read_model',
  streamTypes: [AGENTS_STREAM_TYPE],

  async handle(supabase, event): Promise<void> {
    const owner = ownerOf(event)
    if (!owner) return

    switch (event.type) {
      case 'AgentAdopted': {
        const { error } = await supabase.from('agents_read_model').upsert(
          {
            tenant_id: event.tenantId,
            owner_id: owner,
            agent_id: event.data.agentId,
            name: event.data.name,
            avatar: event.data.avatar,
            place: event.data.place,
            adopted_at: event.createdAt,
          },
          { onConflict: 'tenant_id,agent_id' },
        )
        if (error) {
          throw new Error(`agents projection failed on adoption: ${error.message}`)
        }
        return
      }

      case 'AgentRenamed': {
        /**
         * An update rather than an upsert, and the difference is load-bearing on
         * a replay: an upsert would need every column, and a rename event does
         * not carry the avatar or the place. Writing the row from this event
         * alone would blank them.
         *
         * A rename whose agent has since been released simply matches no rows,
         * which is the right amount of nothing.
         */
        const { error } = await supabase
          .from('agents_read_model')
          .update({ name: event.data.name })
          .eq('tenant_id', event.tenantId)
          .eq('agent_id', event.data.agentId)
        if (error) {
          throw new Error(`agents projection failed on rename: ${error.message}`)
        }
        return
      }

      case 'AgentReleased': {
        const { error } = await supabase
          .from('agents_read_model')
          .delete()
          .eq('tenant_id', event.tenantId)
          .eq('agent_id', event.data.agentId)
        if (error) {
          throw new Error(`agents projection failed on release: ${error.message}`)
        }
        return
      }

      default:
        return
    }
  },
}
