'use client'

/**
 * Somebody spoke, announced out of the rail and heard by the scene.
 *
 * The mirror image of `here-store`, and here for the same structural reason
 * read backwards. There, the scene knows something the rail wants; here, the
 * rail knows something the scene wants - because the chat lives in the sidebar,
 * which spans the whole workspace, while the speech bubbles live in a canvas
 * several routes below it and can never render above it.
 *
 * ---------------------------------------------------------------------------
 * Why the rail owns the channel and not the scene
 * ---------------------------------------------------------------------------
 * There can only be one subscriber to a topic. Two components on one page both
 * opening `chat:<tenantId>` would be two joins on one socket, and - far worse -
 * two message lists that disagree: Realtime does not echo your own broadcast
 * back to you, so a line typed in one surface would be invisible in the other
 * forever.
 *
 * Chat has its own topic rather than riding the lounge's for the same reason,
 * one level up: supabase-js hands back the same channel object for a repeated
 * topic string, and an already-subscribed channel cannot take presence
 * callbacks - so sharing a topic broke the scene's presence. See `chat-dock`.
 *
 * So the rail owns it, because the rail is the surface that is always mounted.
 * The scene comes and goes as somebody walks in and out of the lounge; the
 * sidebar is there on every page in the space, which makes it the only place a
 * subscription can live without the conversation stopping when you go and read
 * a page.
 *
 * ---------------------------------------------------------------------------
 * An event, not a state
 * ---------------------------------------------------------------------------
 * `here-store` holds a value and wakes readers when it changes. This does the
 * opposite: it fires and keeps nothing. A bubble is something that *happened* -
 * the same argument `EmoteMessage` makes for not riding along with movement -
 * so there is no "current message" to snapshot, no `useSyncExternalStore`, and
 * nothing for a scene mounting late to replay. Somebody who walks into the
 * lounge mid-conversation should not be met by six stale bubbles; the
 * scrollback in the rail is where the conversation is.
 */

export interface Said {
  /** Who spoke. The scene matches this against its peers to find the head. */
  userId: string
  body: string
}

/**
 * Who is speaking when there is nobody to be.
 *
 * The scene finds the right head by matching a `userId` against the presence
 * channel's, and a room with no channel - the demo, the lobby - has none to
 * match. Without a stand-in, your own line lands in the map of *other* people's
 * bubbles, keyed to an id no body in the room has, and is drawn by nobody: you
 * type, and nothing happens anywhere.
 *
 * A constant rather than a generated id, because there is exactly one of these
 * per tab by definition, and the scene has to recognise it without being told.
 * Not a valid UUID, so it can never collide with a real user's.
 */
export const LOCAL_SPEAKER = 'local-speaker'

type Listener = (said: Said) => void

const listeners = new Set<Listener>()

/**
 * Tell whoever is drawing bodies that somebody spoke.
 *
 * Called for received *and* sent messages. Your own line raises your own bubble
 * the moment you press return, which is what third person needs in order to
 * show you what everybody else is already seeing over your head.
 */
export function announceSaid(said: Said): void {
  for (const listener of listeners) listener(said)
}

/** Listen for speech. Returns the unsubscribe. */
export function onSaid(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
