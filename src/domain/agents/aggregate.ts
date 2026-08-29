import {
  AGENTS_STREAM_TYPE,
  type AgentEvent,
  MAX_AGENTS_PER_PLACE,
} from '@/domain/agents/events'
import type { AgentCommand } from '@/domain/agents/commands'
import { AVATARS } from '@/domain/lounge/avatars'
import { DomainError } from '@/es/errors'
import type { PlaceId } from '@kxb/peepz-world/places'
import type { Decider } from '@/es/types'

/**
 * What the roster guards.
 *
 * Three things, and nothing else: that a room does not fill up, that an agent
 * exists before it is renamed or released, and that its animal is one the model
 * pack can actually load. Everything else about a creature - where it wanders,
 * when it sleeps - is derived from its id and is not the aggregate's business.
 *
 * The avatar check is the interesting one, because it is the only place this
 * file reaches into another domain. It earns that: an unknown model name is a
 * `<Suspense>` that never resolves and an invisible animal that cannot be
 * clicked to release, which is a stuck state a member cannot get themselves out
 * of. Refusing at the write is the difference between a bad request and a room
 * with a ghost in it.
 */
export interface AgentState {
  agents: Map<string, { name: string; avatar: string; place: PlaceId }>
}

export const initialAgentState: AgentState = { agents: new Map() }

export function evolve(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'AgentAdopted': {
      const agents = new Map(state.agents)
      agents.set(event.data.agentId, {
        name: event.data.name,
        avatar: event.data.avatar,
        place: event.data.place,
      })
      return { agents }
    }

    case 'AgentRenamed': {
      const current = state.agents.get(event.data.agentId)
      // A rename for an agent that is not there is not a crash - a replay of a
      // log where the release was appended first has to land somewhere, and
      // `evolve` must be total.
      if (!current) return state

      const agents = new Map(state.agents)
      agents.set(event.data.agentId, { ...current, name: event.data.name })
      return { agents }
    }

    case 'AgentReleased': {
      const agents = new Map(state.agents)
      agents.delete(event.data.agentId)
      return { agents }
    }

    default:
      return state
  }
}

function countIn(state: AgentState, place: PlaceId): number {
  let total = 0
  for (const agent of state.agents.values()) {
    if (agent.place === place) total++
  }
  return total
}

export function decide(state: AgentState, command: AgentCommand): AgentEvent[] {
  switch (command.type) {
    case 'AdoptAgent': {
      /**
       * Adopting the same id twice is a no-op rather than an error.
       *
       * The client mints the uuid so it can draw the creature before the round
       * trip lands, which means a retried request - a flaky connection, a double
       * tap - arrives with an id the log already has. Returning no events makes
       * that idempotent, and the alternative is a user-visible failure for a
       * command that already succeeded.
       */
      if (state.agents.has(command.agentId)) return []

      if (countIn(state, command.place) >= MAX_AGENTS_PER_PLACE) {
        throw new DomainError(
          `There is only room for ${MAX_AGENTS_PER_PLACE} of them in here`,
        )
      }

      if (!(AVATARS as readonly string[]).includes(command.avatar)) {
        throw new DomainError('There is no such animal')
      }

      return [
        {
          type: 'AgentAdopted',
          data: {
            agentId: command.agentId,
            name: command.name,
            avatar: command.avatar,
            place: command.place,
          },
        },
      ]
    }

    case 'RenameAgent': {
      const current = state.agents.get(command.agentId)
      if (!current) throw new DomainError('There is no such creature')
      // Nothing changed. Saying so with no events keeps the log free of the
      // rename that renamed nothing.
      if (current.name === command.name) return []

      return [{ type: 'AgentRenamed', data: { agentId: command.agentId, name: command.name } }]
    }

    case 'ReleaseAgent': {
      // Already gone. Idempotent for the same reason adoption is: the client
      // removes it optimistically and a retry must not fail.
      if (!state.agents.has(command.agentId)) return []
      return [{ type: 'AgentReleased', data: { agentId: command.agentId } }]
    }

    default:
      return []
  }
}

export const agentsDecider: Decider<AgentState, AgentCommand, AgentEvent> = {
  streamType: AGENTS_STREAM_TYPE,
  initialState: initialAgentState,
  evolve,
  decide,
}
