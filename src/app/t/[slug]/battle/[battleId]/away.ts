/**
 * Who was in this match and is not here any more.
 *
 * Asked for after the thing that ruins a four-player game: somebody's tab
 * closes, their piece stops moving, and the other three sit there for a minute
 * working out whether the game is broken or the person is. The match itself
 * cannot tell them - a battle knows who its *roster* is, which is a durable
 * fact and survives a laptop lid closing, and that is exactly why it is the
 * wrong list to answer "is anybody actually here" with.
 *
 * ---------------------------------------------------------------------------
 * Two lists, and the difference between them is the whole feature
 * ---------------------------------------------------------------------------
 * - **The roster** is who this match is between. It is event-sourced, it is
 *   polled, and somebody who has closed their laptop is still on it.
 * - **Presence** is who is on the socket right now. It is instant, it is gone
 *   the moment a tab closes, and it is what the level has been drawing bodies
 *   from all along.
 *
 * Somebody on the first and not on the second is the person everybody is
 * waiting for. Neither list can say that on its own, which is why this takes
 * both and why it lives beside the match room rather than in the runtime: the
 * runtime has never heard of a roster.
 *
 * ---------------------------------------------------------------------------
 * Pure, because the case that matters cannot be played
 * ---------------------------------------------------------------------------
 * The interesting moments here are a socket dropping for three seconds, a
 * reload, and a wait running out - none of which a person can produce reliably
 * in a browser, and all of which are two lists and a clock. So it takes `now`
 * as an argument and ./away.test.ts is where the rules are settled.
 */

/**
 * How long a gap has to last before it is somebody leaving.
 *
 * Presence blinks: a reload drops the socket and picks it up a second later,
 * and so does a phone changing from wifi to mobile data. A panel that appeared
 * on every blink would be a panel people learn to ignore, which is worse than
 * not having one - so four seconds, which is long enough to cover a reload and
 * short enough that nobody has finished asking "where did they go" out loud.
 */
export const SETTLE_MS = 4_000

/**
 * How long the room holds before it has to decide something.
 *
 * Forty-five seconds is about how long somebody takes to come back from a
 * dropped connection, and about twice as long as anybody will wait without
 * being offered a way out. It is not a deadline the match enforces - nothing
 * ends here - it is when the panel stops saying "hang on" and starts offering
 * the two honest answers: play on a player down, or line up again.
 */
export const WAIT_MS = 45_000

/** Somebody the room is waiting for. */
export interface AwayPlayer {
  userId: string
  name: string
  /** How long they have been gone, in whole seconds. */
  seconds: number
}

export interface AwayView {
  /** Who is missing, longest gone first. */
  gone: AwayPlayer[]
  /** Seconds left on the wait, floored at zero. */
  left: number
  /** Whether the wait has run out and there is a choice to make. */
  overdue: boolean
}

/** A rostered player, as much of one as this needs. */
export interface Rostered {
  userId: string
  name: string
  /**
   * Whether they are already out of this match.
   *
   * Nobody waits for somebody who has been knocked out: their game is over
   * either way, and in an elimination mode walking out *is* a defeat - so
   * without this the panel would open on the loser of every match at the
   * moment they close the tab, which is the moment the match is over.
   */
  defeated?: boolean
}

export function whoIsAway({
  roster,
  present,
  seen,
  me,
  now,
}: {
  /** Who this match is between, from the battle's own roster. */
  roster: readonly Rostered[]
  /** Who the socket can see right now, by account id. */
  present: readonly string[]
  /**
   * When each of them was last seen on the socket, in milliseconds.
   *
   * Only people who have been seen *at all* can go missing, which is the one
   * rule here worth arguing about. Somebody who took a seat in the lobby and
   * never loaded the level would otherwise be permanently away, and the panel
   * would open on a match that is going perfectly well and never close. They
   * have not left; they never arrived, and the lobby's own ready gate is what
   * covers that.
   */
  seen: Readonly<Record<string, number>>
  /** Yourself, who is never waited for - you are reading this. */
  me: string
  now: number
}): AwayView | null {
  const here = new Set(present)

  const gone: AwayPlayer[] = []
  for (const player of roster) {
    if (player.userId === me) continue
    if (player.defeated) continue
    if (here.has(player.userId)) continue

    const last = seen[player.userId]
    if (last === undefined) continue

    const away = now - last
    if (away < SETTLE_MS) continue

    gone.push({
      userId: player.userId,
      name: player.name,
      seconds: Math.floor(away / 1000),
    })
  }

  if (gone.length === 0) return null

  gone.sort((a, b) => b.seconds - a.seconds)

  /**
   * The wait belongs to whoever went first.
   *
   * Two people dropping a minute apart is not two waits - it is one room
   * standing around - and starting the clock again for the second one would
   * mean a match that can never get to the point of offering a way out.
   */
  const longest = gone[0]?.seconds ?? 0
  const left = Math.max(0, Math.ceil(WAIT_MS / 1000 - longest))

  return { gone, left, overdue: left === 0 }
}

/**
 * Who was missing a moment ago and is back.
 *
 * The other half of the panel, and the half worth saying out loud: a room that
 * silently stops waiting leaves everybody wondering whether the person returned
 * or whether the thing that was watching them gave up. Their body reappearing
 * in the level answers it for whoever happened to be looking that way; this is
 * for everybody else.
 */
export function cameBack(
  before: readonly string[],
  now: readonly AwayPlayer[],
): string[] {
  const still = new Set(now.map((player) => player.userId))
  return before.filter((userId) => !still.has(userId))
}
