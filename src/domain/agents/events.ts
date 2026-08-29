import type { DomainEvent } from '@/es/types'
import type { PlaceId } from '@kxb/peepz-world/places'

/**
 * The creatures that live in a member's rooms and decide for themselves what to
 * do.
 *
 * ---------------------------------------------------------------------------
 * What is in the log, and what is emphatically not
 * ---------------------------------------------------------------------------
 * In: that a creature exists, what it is called, which animal it is, and which
 * room it lives in. Those are the facts you expect to still be true when you
 * come back tomorrow, and the facts a colleague expects to see when they visit.
 *
 * Out: everything it is *doing*. Where it is standing, whether it is asleep,
 * which way it is facing. Not because that would be a lot of writes - though it
 * would, at sixty a second per animal - but because none of it needs storing at
 * all. `src/domain/world/autonomy.ts` derives the whole schedule from the agent
 * id and the wall clock, so every tab computes the same answer without anybody
 * broadcasting anything. The position is not persisted for the same reason the
 * time is not persisted: it is a function of things that already are.
 *
 * That is the same call `HomesteadEvent` made about player positions, arrived at
 * from the opposite direction. There, presence on a realtime channel was the
 * right home for something ephemeral. Here there is no channel either, because
 * an agent has nothing to tell anyone that they cannot work out.
 *
 * ---------------------------------------------------------------------------
 * One stream per member, mirroring the homestead
 * ---------------------------------------------------------------------------
 * Agents are kept apart from `homestead` rather than folded into it, because
 * they share none of its invariants. The homestead aggregate exists to keep one
 * purse honest and every event in it moves coins; adopting a cat moves nothing.
 * Putting them together would mean every adoption contended with every burger
 * sold for the same stream version, to protect a balance neither of them
 * touches.
 *
 * The stream is still keyed on (tenant, member), because that is the security
 * boundary: an agent lives in one of *your* rooms, and the action derives the
 * stream from the session, so there is no argument anybody can pass to put a
 * badger in a colleague's kitchen.
 */

export const AGENTS_STREAM_TYPE = 'agents'

/**
 * How many creatures one member may keep in one room.
 *
 * Four. Enough that a room feels inhabited, low enough that the render cost is
 * bounded by something other than enthusiasm - each one is a rigged glTF with
 * its own animation mixer, and a phone notices the sixth.
 */
export const MAX_AGENTS_PER_PLACE = 4

/**
 * A creature moved in.
 *
 * No seed field, and that is deliberate rather than an omission. The entire
 * schedule is derived from the agent's id via `seedFrom`, so storing a seed
 * alongside it would be storing the same information twice and inviting the two
 * to disagree - a row whose seed had been edited would describe an animal that
 * behaved like a different one.
 *
 * `avatar` is recorded rather than derived from the name for the usual reason:
 * the pack of models is code, and code changes. A member who adopted a penguin
 * in July should not find it has become a hedgehog in August because somebody
 * reordered the list.
 */
export type AgentAdopted = DomainEvent<
  'AgentAdopted',
  {
    /** A uuid, and the only input the whole schedule takes. */
    agentId: string
    name: string
    /** One of `AVATARS` from src/domain/lounge/avatars.ts. */
    avatar: string
    place: PlaceId
  }
>

/** Renamed. The one thing about a creature its owner can change. */
export type AgentRenamed = DomainEvent<'AgentRenamed', { agentId: string; name: string }>

/**
 * A creature left.
 *
 * A fact appended rather than a row deleted, which is the ordinary event
 * sourcing answer and here has a specific payoff: re-adopting produces a *new*
 * id, and therefore a new seed, and therefore an animal that genuinely behaves
 * differently. Reusing the id would resurrect the same routine, which is not
 * what "a new cat" means.
 */
export type AgentReleased = DomainEvent<'AgentReleased', { agentId: string }>

export type AgentEvent = AgentAdopted | AgentRenamed | AgentReleased

export const AGENT_EVENT_LABELS: Record<AgentEvent['type'], string> = {
  AgentAdopted: 'creature adopted',
  AgentRenamed: 'creature renamed',
  AgentReleased: 'creature released',
}
