import type { MagazineCommand } from '@/domain/magazine/commands'
import { MAGAZINE_STREAM_TYPE, type MagazineEvent } from '@/domain/magazine/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * The shelf, and the one rule it has.
 *
 * An XP is in or it is out. That is genuinely all of it - there is no ordering
 * to defend, no ownership (the space owns the shelf, not the entries) and no
 * cap to enforce, because the magazine is unlimited on every tier including
 * free. `docs/product/pricing.md` §3 argues why: a shelved XP costs storage and
 * nothing else, and metering it would buy nothing while making every other cap
 * look mean.
 *
 * So the invariant is only "not twice", and it is worth having a decider for
 * anyway. Taking the same XP in twice is not a harmless no-op: it would put a
 * second row on the shelf, and every count that reads the shelf - and the
 * places that load from it - would disagree with what somebody sees.
 */

export interface MagazineState {
  /** Every reference currently on the shelf. */
  refs: Set<string>
  /** Take new versions without asking. Off until somebody says otherwise. */
  follow: boolean
}

export const initialMagazineState: MagazineState = { refs: new Set(), follow: false }

export function evolve(state: MagazineState, event: MagazineEvent): MagazineState {
  switch (event.type) {
    case 'XpTakenIn': {
      // A fresh Set rather than a mutation: `fold` may replay the same events
      // to answer a different question, and a decider that mutated its input
      // would make the second answer depend on the first.
      const refs = new Set(state.refs)
      refs.add(event.data.xpRef)
      return { ...state, refs }
    }

    case 'XpPutBack': {
      const refs = new Set(state.refs)
      refs.delete(event.data.xpRef)
      return { ...state, refs }
    }

    case 'ShelfFollowSet':
      return { ...state, follow: event.data.on }

    default:
      return state
  }
}

export function decide(
  state: MagazineState,
  command: MagazineCommand,
): MagazineEvent[] {
  switch (command.type) {
    case 'TakeInXp': {
      /*
       * Already in is a no-op, not an error.
       *
       * Two people pressing the same button on the same afternoon is the
       * ordinary case for a shared shelf, and so is a double click. Refusing
       * would mean showing somebody an error for a state they wanted and now
       * have - see the redelivery branches in `billing/aggregate.ts`, which
       * take the same view for the same reason.
       */
      if (state.refs.has(command.xpRef)) return []

      return [{ type: 'XpTakenIn', data: { xpRef: command.xpRef, name: command.name } }]
    }

    case 'PutBackXp': {
      /*
       * Not in is an error, where already-in was not, and the asymmetry is
       * deliberate. Taking in twice lands on the state you asked for; putting
       * back something that is not there means the shelf you are looking at is
       * not the shelf that exists, and quietly succeeding would leave you
       * believing you had removed something.
       */
      if (!state.refs.has(command.xpRef)) {
        throw new DomainError('That is not in this magazine', 'not_in_magazine')
      }

      return [{ type: 'XpPutBack', data: { xpRef: command.xpRef } }]
    }

    case 'RestockXp': {
      /*
       * Already on the newest is a no-op, and it is the ordinary case.
       *
       * Two people looking at the same shelf both see the badge, and the
       * second one presses a moment after the first. Same reasoning as
       * `TakeInXp` above: they wanted a state, and it is the state that
       * exists.
       */
      if (state.refs.has(command.to) && !state.refs.has(command.from)) return []
      if (command.from === command.to) return []

      /*
       * Not holding the old one is an error, exactly as putting back something
       * absent is. It means the shelf on the screen is not the shelf that
       * exists - somebody put this back while the badge was being read - and
       * silently taking the new version in would *add* a level to a shelf
       * whose owner had just removed it.
       */
      if (!state.refs.has(command.from)) {
        throw new DomainError('That is not in this magazine', 'not_in_magazine')
      }

      /*
       * Both events, in this order, from one decision.
       *
       * The order is load-bearing rather than cosmetic: `evolve` removes then
       * adds, so a restock that named the same reference twice would end with
       * it *off* the shelf if these were swapped. The guard above makes that
       * unreachable, and the order means it would still be right if the guard
       * were ever relaxed.
       *
       * Written as a put-back and a take-in rather than a new `XpRestocked`
       * event, because the shelf's state is genuinely those two things
       * happening, and every projection and count already knows how to read
       * them. A third event would be a third thing every reader must learn in
       * order to end up in the same place. The intent that is lost - "this was
       * an update, not a swap somebody made by hand" - is recoverable from the
       * two events sharing a version, and is not worth a migration.
       */
      return [
        { type: 'XpPutBack', data: { xpRef: command.from } },
        { type: 'XpTakenIn', data: { xpRef: command.to, name: command.name } },
      ]
    }

    case 'SetShelfFollow': {
      /*
       * Setting it to what it already is writes nothing.
       *
       * A toggle is the control most likely to be pressed twice by accident,
       * and a log full of "turned it on" against a shelf that was already
       * following would make the one entry that matters - the time it actually
       * changed - impossible to find.
       */
      if (state.follow === command.on) return []

      return [{ type: 'ShelfFollowSet', data: { on: command.on } }]
    }
  }
}

export const magazineDecider: Decider<MagazineState, MagazineCommand, MagazineEvent> = {
  streamType: MAGAZINE_STREAM_TYPE,
  initialState: initialMagazineState,
  evolve,
  decide,
}
