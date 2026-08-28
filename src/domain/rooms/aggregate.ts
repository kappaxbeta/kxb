import {
  ROOM_STREAM_TYPE,
  type RoomEvent,
  type RoomMode,
  type RoomVisibility,
} from '@/domain/rooms/events'
import type { RoomCommand } from '@/domain/rooms/commands'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface RoomState {
  status: 'none' | 'open' | 'closed'
  name: string
  /** Who it is listed to. Not who may enter - see the note on RoomVisibility. */
  visibility: RoomVisibility
  /** Building or scrapping, this room only - see the note on RoomMode. */
  mode: RoomMode
  /** Heads at once, or null for "whatever the event says". */
  cap: number | null
  /** May a guest build in here? Only ever narrows the event's answer. */
  guestBuild: boolean
  /** Who opened it. For the read model, not for permission. */
  createdBy: string
  /** The level this room is, or null for an ordinary one. */
  xpRef: string | null
  /** When the current round began, or null when the door is open. */
  roundStartedAt: string | null
}

export const initialRoomState: RoomState = {
  status: 'none',
  name: '',
  visibility: 'open',
  mode: 'creative',
  xpRef: null,
  roundStartedAt: null,
  cap: null,
  guestBuild: true,
  createdBy: '',
}

export function evolve(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'RoomCreated':
      return {
        ...state,
        status: 'open',
        name: event.data.name,
        // Tolerated rather than required, so a room opened before rooms had a
        // visibility reads as listed - which is the rule it was created under.
        visibility: event.data.visibility ?? 'open',
        createdBy: event.data.createdBy,
        xpRef: event.data.xpRef ?? null,
      }

    case 'RoundStarted':
      return { ...state, roundStartedAt: event.data.at }

    case 'RoundReopened':
      return { ...state, roundStartedAt: null }

    case 'RoomXpSet':
      return { ...state, xpRef: event.data.xpRef }

    case 'RoomVisibilitySet':
      return { ...state, visibility: event.data.visibility }

    // No arm on RoomCreated to match: a room opens creative, which is what the
    // initial state above says, and carrying the mode on the creation event
    // would mean every room ever opened had to be re-read to learn a constant.
    case 'RoomModeSet':
      return { ...state, mode: event.data.mode }

    case 'RoomCapSet':
      return { ...state, cap: event.data.cap }

    case 'RoomGuestBuildSet':
      return { ...state, guestBuild: event.data.allowed }

    case 'RoomRenamed':
      return { ...state, name: event.data.name }

    case 'RoomClosed':
      return { ...state, status: 'closed' }

    default:
      return state
  }
}

export function decide(state: RoomState, command: RoomCommand): RoomEvent[] {
  switch (command.type) {
    case 'CreateRoom': {
      // The stream id is minted fresh by the action, so a second CreateRoom on
      // the same stream is not somebody retrying - it is a uuid collision that
      // must never quietly overwrite a room full of people's work.
      if (state.status !== 'none') {
        throw new DomainError('That room already exists', 'room_exists')
      }
      return [
        {
          type: 'RoomCreated',
          data: {
            name: command.name,
            createdBy: command.actorId,
            visibility: command.visibility,
            // Spread rather than `xpRef: command.xpRef`, so an ordinary room's
            // event is byte for byte the one it always was - a stream full of
            // `"xpRef": undefined` would be a format change nothing asked for.
            ...(command.xpRef ? { xpRef: command.xpRef } : {}),
          },
        },
        /*
         * The cap as a second event rather than a field on the first.
         *
         * `RoomCapSet` already exists and already means this, and a room opened
         * with a cap and one capped a second later should be the same room -
         * which they are only if both went through the same event. The
         * alternative is a projection that writes the cap in two places and a
         * day when the two disagree.
         */
        ...(command.cap === undefined
          ? []
          : [{ type: 'RoomCapSet' as const, data: { cap: command.cap } }]),
      ]
    }

    /**
     * Deal.
     *
     * Only in a room that is a level, and that is not a technicality: a lounge
     * room has nothing a round would mean, and a Start button on one would be a
     * control that closes the door for no reason anybody in it could name.
     *
     * **Idempotent while a round is running**, rather than an error. Two people
     * pressing Start within a second of each other is the ordinary case at a
     * table, and the second one deserves the thing they wanted rather than a
     * red line about who was faster.
     *
     * **The level's `players.min` is not enforced here, and that is deliberate
     * rather than missing.** A decider does not read documents, and the head
     * count lives in presence - which is a client-side channel, not a table
     * this can query. So the minimum is *shown* where somebody can act on it:
     * the room's own chrome prints "needs 4" beside the button. Refusing a
     * start on a number the server cannot verify would be a rule that a stale
     * presence read could enforce against a table that is actually full.
     */
    case 'StartRound': {
      assertOpen(state)
      if (!state.xpRef) {
        throw new DomainError('This room is not a level', 'not_a_level')
      }
      if (state.roundStartedAt) return []
      return [{ type: 'RoundStarted', data: { at: command.now, by: command.actorId } }]
    }

    /**
     * Open the table again.
     *
     * Any member, including one who was not here when it started - see the note
     * on `RoundReopened`. Idempotent for the same reason Start is.
     */
    case 'ReopenRound': {
      assertOpen(state)
      if (!state.roundStartedAt) return []
      return [{ type: 'RoundReopened', data: { by: command.actorId } }]
    }

    /**
     * Another game in the same slot.
     *
     * **Only a room that is already a level.** `state.xpRef` is the whole of
     * the check and it is the rule `RoomCreated` has always carried: a lounge
     * room that became a level would strand the blocks somebody built in it,
     * and this cannot clear the reference, so a level room never becomes a
     * lounge room either. What it swaps is the game, not the kind of place.
     *
     * **A round in play is reopened by the same command.** The door is shut on
     * a hand that is no longer being dealt the moment the level changes, and
     * leaving it shut would mean waiting out a game nobody is playing. Emitted
     * before the swap only in the sense that both land in one append - the
     * order in the array is the order the log reads, and "the round ended, then
     * the level changed" is the true sentence.
     *
     * The cap follows the level for the reason `CreateRoom` gives, and through
     * the same `RoomCapSet` rather than a field on this event, so a room capped
     * by a swap and one capped by hand are the same room.
     */
    case 'SetRoomXp': {
      assertOpen(state)
      if (!state.xpRef) {
        throw new DomainError('This room is not a level', 'not_a_level')
      }
      // Already the game it is playing. Nothing happened, so nothing is logged
      // - including the reopen, which would otherwise make a no-op swap into a
      // way of opening the door with the wrong button.
      if (state.xpRef === command.xpRef) return []

      return [
        ...(state.roundStartedAt
          ? [{ type: 'RoundReopened' as const, data: { by: command.actorId } }]
          : []),
        { type: 'RoomXpSet', data: { xpRef: command.xpRef } },
        ...(command.cap === undefined || command.cap === state.cap
          ? []
          : [{ type: 'RoomCapSet' as const, data: { cap: command.cap } }]),
      ]
    }

    case 'RenameRoom': {
      assertOpen(state)
      // A rename to the name it already has is not a change, and appending an
      // event for it would put a lie in the log: nothing happened.
      if (state.name === command.name) return []
      return [{ type: 'RoomRenamed', data: { name: command.name } }]
    }

    case 'SetRoomVisibility': {
      assertOpen(state)
      // Already what it is, so nothing happened and nothing is logged.
      if (state.visibility === command.visibility) return []
      return [
        { type: 'RoomVisibilitySet', data: { visibility: command.visibility } },
      ]
    }

    case 'SetRoomMode': {
      assertOpen(state)
      // Already what it is, so nothing happened and nothing is logged - the
      // same rule the two setters above keep. It is the one that matters most
      // here: the switch is a toggle inside a live scene, and a double-click on
      // it should not put two events in the log saying the same thing.
      if (state.mode === command.mode) return []
      return [{ type: 'RoomModeSet', data: { mode: command.mode } }]
    }

    case 'SetRoomCap': {
      assertOpen(state)
      if (state.cap === command.cap) return []
      return [{ type: 'RoomCapSet', data: { cap: command.cap } }]
    }

    case 'SetRoomGuestBuild': {
      assertOpen(state)
      if (state.guestBuild === command.allowed) return []
      return [{ type: 'RoomGuestBuildSet', data: { allowed: command.allowed } }]
    }

    case 'CloseRoom': {
      // Closing a closed room is idempotent rather than an error: the caller
      // wanted it shut, and it is shut.
      if (state.status === 'closed') return []
      assertOpen(state)
      return [{ type: 'RoomClosed', data: {} }]
    }

    default:
      return []
  }
}

/**
 * A room has to exist and be open before anything can be done to it.
 *
 * Split out because both branches above need it and the failure is the same
 * sentence either way - "not found" for a stream with no history, because a
 * room id that names nothing and a room id somebody is guessing at should be
 * indistinguishable from here.
 */
function assertOpen(state: RoomState): void {
  if (state.status === 'none') {
    throw new DomainError('Room not found', 'room_missing')
  }
  if (state.status === 'closed') {
    throw new DomainError('That room has been closed', 'room_closed')
  }
}

export const roomDecider: Decider<RoomState, RoomCommand, RoomEvent> = {
  streamType: ROOM_STREAM_TYPE,
  initialState: initialRoomState,
  evolve,
  decide,
}
