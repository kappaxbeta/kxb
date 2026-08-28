import type { RadioCommand } from '@/domain/radio/commands'
import { RADIO_STREAM_TYPE, type RadioEvent, type RadioScope } from '@/domain/radio/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * What is on, and whether it is playing.
 *
 * Three fields and no clock. Where in the song the room currently is cannot be
 * state here, because it is not a function of the events alone - it is a
 * function of the events *and the current time*, and a decider that read a
 * clock would stop being a pure fold of its history. That arithmetic lives in
 * two places instead: the projection, which turns an anchor into a resume
 * offset once when a track stops, and src/lib/radio/sync.ts, which turns the
 * anchor into a playhead continuously in each browser.
 */
export interface RadioState {
  trackUrl: string | null
  title: string | null
  playing: boolean
  scope: RadioScope
  place: string | null
}

export const initialRadioState: RadioState = {
  trackUrl: null,
  title: null,
  playing: false,
  scope: 'space',
  place: null,
}

export function evolve(state: RadioState, event: RadioEvent): RadioState {
  switch (event.type) {
    case 'TrackStarted':
      return {
        trackUrl: event.data.trackUrl,
        title: event.data.title,
        playing: true,
        /**
         * Absent on events written before the reach existed, and they all
         * meant the whole space. Defaulting here rather than at the read model
         * keeps the fold total: a replay of old history produces the same state
         * it always did.
         */
        scope: event.data.scope ?? 'space',
        place: event.data.scope === 'room' ? (event.data.place ?? null) : null,
      }

    case 'TrackStopped':
      // The URL survives a stop. That is what makes resuming possible, and it
      // is why "stopped" is not the same state as "nothing has ever been on".
      return { ...state, playing: false }

    case 'TrackResumed':
      return { ...state, playing: true }

    default:
      // An event type this version does not know about. Ignore it rather than
      // crash, so a rolled-back deploy can still replay newer history.
      return state
  }
}

export function decide(state: RadioState, command: RadioCommand): RadioEvent[] {
  switch (command.type) {
    /**
     * Put a track on.
     *
     * Idempotent only against the *exact* same track already playing, which
     * makes a double-click on Play a no-op rather than a restart. Re-submitting
     * the track that is currently on while it is stopped is not a no-op: that
     * is somebody pressing play on the thing in the box, and they mean it to
     * start.
     *
     * No check that the caller is an admin, and no way to make one - roles live
     * on the tenant stream and this decider cannot see it. The action checks,
     * and the restrictive policy on `events` is what actually enforces it. See
     * the note on `RadioEvent`.
     */
    case 'PlayTrack': {
      /**
       * The no-op now has to agree about the reach as well as the track.
       *
       * Re-submitting the same URL with a *different* scope is not a double
       * click - it is somebody moving the music from this room to the whole
       * space, or the other way, and it has to produce an event. Comparing only
       * the URL made that a silent no-op, which would read as the checkbox
       * being broken.
       */
      const place = command.scope === 'room' ? command.place : null
      if (
        state.playing &&
        state.trackUrl === command.trackUrl &&
        state.scope === command.scope &&
        state.place === place
      ) {
        return []
      }

      if (command.scope === 'room' && !place) {
        throw new DomainError(
          'Go into a room first — there is nowhere for a room-only track to play',
          'radio_no_room',
        )
      }

      return [
        {
          type: 'TrackStarted',
          data: {
            trackUrl: command.trackUrl,
            title: command.title,
            scope: command.scope,
            place,
          },
        },
      ]
    }

    /**
     * Turn it off.
     *
     * A no-op when it is already off rather than an error, because two admins
     * reaching for the stop button at the same moment is the normal way this
     * gets used, not a mistake either of them made. The second one should find
     * the radio off, not a complaint.
     */
    case 'StopTrack': {
      if (!state.playing) return []
      return [{ type: 'TrackStopped', data: {} }]
    }

    /**
     * Pick it back up.
     *
     * The one refusal in the file. Resuming with nothing ever having been on is
     * not a race two admins can innocently lose - it is a button that should
     * not have been drawn, so it says so rather than silently doing nothing and
     * leaving whoever pressed it to wonder.
     */
    case 'ResumeTrack': {
      if (state.trackUrl === null) {
        throw new DomainError('There is nothing to resume', 'radio_empty')
      }
      if (state.playing) return []
      return [{ type: 'TrackResumed', data: {} }]
    }

    default: {
      const unreachable: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(unreachable)}`)
    }
  }
}

export const radioDecider: Decider<RadioState, RadioCommand, RadioEvent> = {
  streamType: RADIO_STREAM_TYPE,
  initialState: initialRadioState,
  evolve,
  decide,
}
