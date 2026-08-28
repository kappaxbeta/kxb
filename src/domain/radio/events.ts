import type { DomainEvent } from '@/es/types'

/**
 * How far a track reaches.
 *
 * `space` - everybody in the workspace, wherever they are standing.
 * `room`  - only the people in the place it was put on in.
 *
 * The distinction is about intention rather than volume. A DJ set in the lounge
 * during a party and a focus playlist in the café are both "the radio", and a
 * feature that could only do the first would make the second an imposition on
 * everybody who is not at the party.
 */
export type RadioScope = 'space' | 'room'

/**
 * The space radio: one stream per space, one track at a time.
 *
 * A stream per *space* rather than per track, which is the opposite of the
 * choice chat made next door, and the difference is worth being explicit about
 * because both are defensible.
 *
 * A chat message has no history: it is said once, and a stream per message
 * keeps every command's load at one row instead of replaying a room's whole
 * conversation to add a sentence. The radio does have history, and it is the
 * point - "what is on" only makes sense against "what was on before it", and a
 * pause has to know where it got to. Two tracks that could not see each other
 * could not hand over.
 *
 * -------------------------------------------------------------------------
 * Why not the tenant stream
 * -------------------------------------------------------------------------
 * `LoungeModeSet` and `ChatEnabledSet` are settings on the tenant's own stream,
 * and at a glance the radio looks like one more of those. It is not, and the
 * distinguishing question is how often it changes. Those switches are flipped a
 * handful of times in a space's life; a radio changes track all evening. Since
 * `executeCommand` folds an entire stream to work out its expected version,
 * putting tracks on the tenant stream would mean every invitation, every role
 * change and every capability toggle replaying a night of songs first.
 *
 * The cost of the split is that this decider cannot check whether the caller is
 * an admin - roles are state of the tenant stream, and this is not it. That
 * check therefore lives in the action, and, because an action is only a polite
 * layer, in a RESTRICTIVE policy on `events` that admits `stream_type = 'radio'`
 * only for an owner or an admin. See the migration; it is the one place in the
 * app where authorization is enforced by the database rather than by a decider,
 * and the note there explains why it had to be.
 */

/**
 * Somebody put something on.
 *
 * No timestamp in the payload, deliberately. The moment this happened is the
 * event's own `created_at`, stamped by Postgres, and that is the only clock in
 * the system every listener agrees on - see `started_at` in the migration.
 * A `startedAt` field here would be a browser's opinion of the time sitting
 * next to the trustworthy one, and eventually somebody would read the wrong
 * one.
 *
 * `title` is nullable and is a label, never a key. It is read off the starting
 * admin's own widget once it loads, so a track whose page is slow or which is
 * embed-blocked *for that one person* still goes on - unnamed. Requiring it
 * would let one failed lookup silence the room.
 */
export type TrackStarted = DomainEvent<
  'TrackStarted',
  {
    trackUrl: string
    title: string | null
    /**
     * How far this one reaches, and where from.
     *
     * Recorded on the event rather than kept as a setting on the space,
     * because it is a property of *this track going on now* - somebody puts a
     * mix on in the lounge for the people in the lounge, and the next thing
     * they play may well be for everybody. A stored preference would make the
     * reach outlive the intention behind it.
     *
     * `place` is null exactly when the scope is 'space'. Optional on the type
     * so events written before this shipped still fold: they predate the idea
     * of a reach, and every one of them meant the whole space.
     */
    scope?: RadioScope
    place?: string | null
  }
>

/**
 * The radio was turned off, mid-song.
 *
 * Carries nothing. Where the track had got to is not something the person
 * pressing stop should be trusted to report - their widget's position is their
 * own playback, which may be seconds off the room's, and on a tab that has been
 * backgrounded for ten minutes it may be nowhere near. The projection works the
 * offset out instead, from the anchor and this event's own timestamp, which is
 * the same clock the room was synchronised against in the first place.
 */
export type TrackStopped = DomainEvent<'TrackStopped', Record<string, never>>

/**
 * ...and turned back on again, at the point it stopped.
 *
 * The reason stop is not simply "start it again": a radio you can only restart
 * from the beginning is one nobody dares pause. Also carries nothing - the
 * offset is already in the read model, put there by the stop.
 */
export type TrackResumed = DomainEvent<'TrackResumed', Record<string, never>>

export type RadioEvent = TrackStarted | TrackStopped | TrackResumed

export const RADIO_STREAM_TYPE = 'radio'

/** Human labels, for the event log viewer. */
export const RADIO_EVENT_LABELS: Record<RadioEvent['type'], string> = {
  TrackStarted: 'track put on',
  TrackStopped: 'radio stopped',
  TrackResumed: 'radio resumed',
}

/**
 * Longest title we will write down.
 *
 * The string comes from a third party by way of somebody's browser, so it is
 * bounded on the way in for the same reason the chat bounds an author's handle:
 * it is drawn in a fixed-width rail, and a track whose "name" is four kilobytes
 * of padding is not a track name.
 */
export const MAX_TRACK_TITLE_LENGTH = 200
