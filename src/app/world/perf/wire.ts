/**
 * The two messages measurement itself puts on the channel.
 *
 * Their own module rather than fields on anything existing, for the reason
 * `EmoteMessage` gives about not riding along with movement, sharpened: these
 * are not about the room at all. Every other event on this channel describes
 * something a person did; these describe the wire. Folding a nonce into
 * `MoveMessage` would have meant the diagnostic travelling in every packet of
 * the traffic it is supposed to be counting, and a `move` handler deciding
 * whether it was also an echo.
 *
 * Terse, because they are the one thing here that must not cost the room
 * anything: a ping is a nonce and two connection ids.
 */

/** "Time me." Addressed to one connection - see the handler in `multiplayer`. */
export const PERF_PING = 'perf-ping'
/** "Here it is back." Addressed to whoever asked. */
export const PERF_ECHO = 'perf-echo'

export interface PerfPing {
  /** The nonce. Only the sender ever interprets it; everyone else copies it. */
  n: string
  /** Who to send it back to, as a connection rather than a person: one tab
   *  timing the room must not have its ping answered by its owner's other tab
   *  on a different machine. */
  from: string
  /**
   * Who should answer.
   *
   * The whole reason a ping costs two messages instead of `n`. Everybody on the
   * channel receives this - Realtime has no private lane - and everybody but
   * one drops it on this line, which is a comparison rather than a reply.
   */
  to: string
}

export interface PerfEcho {
  n: string
  /** The `from` of the ping this answers. Anybody else drops it. */
  to: string
}
