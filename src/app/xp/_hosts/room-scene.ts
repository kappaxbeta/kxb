/**
 * Which level a room is on, agreed between clients with nobody in charge.
 *
 * `./scenes` fetches what is behind a door. This decides *whether everybody
 * goes through it*, which is a harder problem than it looks and is the reason
 * the two are separate files.
 *
 * ---------------------------------------------------------------------------
 * Three constraints, and they are all awkward
 * ---------------------------------------------------------------------------
 * **A door is an event.** The rest of this runtime follows "derive, don't
 * transmit" - sides, spawn slots and peer motion are all computed from ids and
 * positions rather than sent. Walking through a door cannot be derived from
 * anything: one person did a thing at a moment, and the others have no way to
 * work it out. So it goes on the wire, and everything below is about it
 * arriving safely.
 *
 * **The wire is `send` and `on`, and `XpSocket` says in as many words: "fire
 * and forget, no delivery guarantee, by design."** A missed message is normal
 * rather than exceptional, so a design where one broadcast is the only chance
 * to hear about a level change is a design where somebody is left behind in an
 * empty room permanently.
 *
 * **Nobody is in charge.** There is no server tick and no elected owner - the
 * `server` tier of the plan does not exist yet, which is the same reason "who
 * won" is still unsolved. Two people can walk through two different doors on
 * the same frame and both be right.
 *
 * ---------------------------------------------------------------------------
 * So: a claim, a counter, and a tie-break nobody has to agree on first
 * ---------------------------------------------------------------------------
 * Each client holds a `SceneClaim` - which level, and a counter of how many
 * doors this room has been through. Walking through a door raises the counter
 * and broadcasts. A client adopts a claim with a *higher* counter than its own
 * and ignores anything lower, which makes a stale message harmless: an old
 * claim arriving late loses to what is already held rather than dragging a room
 * backwards.
 *
 * Equal counters are the interesting case, and ignoring them is what would break
 * this. Two doors on one frame means two claims at counter 4, and if each client
 * simply keeps its own, the room *splits* - half in one level, half in another,
 * both convinced they are right, and no later message can reconcile them because
 * every subsequent claim is compared against a different history. So a tie is
 * broken by the name, in a way every client computes identically and none of
 * them has to coordinate: the lower name wins. Somebody is sent through a door
 * they did not choose, which is a much smaller price than a room that is
 * permanently two rooms.
 */

/** Which level a room is on, and how many doors it has been through. */
export interface SceneClaim {
  /** The scene *name*, as the document wrote it - not the resolved target. */
  scene: string
  /**
   * How many doors this room has been through.
   *
   * A counter and not a timestamp. Two browsers disagree about what time it is
   * by anything up to minutes - `./presence` refuses to trust a sender's clock
   * for exactly this reason - so a design where the newest wall time wins is a
   * design decided by whoever's laptop is furthest ahead.
   */
  at: number
}

/**
 * The claim to broadcast when this client walks through a door.
 *
 * The name rather than the resolved target, so every client runs the same
 * `resolveScene` against its own copy of the document. Sending the resolved URL
 * would mean one client's `scenes` table deciding where everybody else fetches
 * from - which is the same shape as trusting a peer's clock, and worse, because
 * it is a URL.
 */
export function claimFor(current: SceneClaim | null, scene: string): SceneClaim {
  return { scene, at: (current?.at ?? 0) + 1 }
}

/**
 * A claim off the wire, or null if it is not one.
 *
 * Peers are not trusted input. Everything here arrives from another browser,
 * which may be running a different version of this code, a modified one, or
 * something that is not this code at all - so the payload is checked rather
 * than cast, the same way `./scenes` parses a fetched document instead of
 * believing it.
 *
 * The scene name is checked for shape rather than existence: whether a name
 * resolves is `resolveScene`'s question and it is answered against the
 * receiver's own document, which is the point.
 */
export function readClaim(payload: unknown): SceneClaim | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = payload as { scene?: unknown; at?: unknown }
  if (typeof raw.scene !== 'string' || raw.scene.length === 0) return null
  if (typeof raw.at !== 'number' || !Number.isFinite(raw.at) || raw.at < 0) return null
  return { scene: raw.scene, at: raw.at }
}

/**
 * Which of two claims a room should be on.
 *
 * Total and deterministic: every client fed the same pair returns the same
 * answer, with no message exchanged to decide it. That is what makes a room
 * converge without anybody being in charge.
 */
export function winner(held: SceneClaim | null, incoming: SceneClaim): SceneClaim {
  if (!held) return incoming
  if (incoming.at > held.at) return incoming
  if (incoming.at < held.at) return held
  /**
   * The same counter, two different doors.
   *
   * Compared by name, lowest first, because both clients have both names and
   * neither needs to ask anything. Any total order would do - this one is
   * `localeCompare`-free on purpose, since a locale-sensitive comparison is a
   * comparison two browsers can disagree about, which is exactly the property
   * this must not have.
   */
  return incoming.scene < held.scene ? incoming : held
}

/**
 * Whether a claim off the wire changes anything.
 *
 * Separate from `winner` because the caller needs to know whether to *act* -
 * fetching a document and swapping a level is expensive and visible, and doing
 * it because somebody re-announced the level you are already on would be a
 * loading screen for nothing.
 */
export function adopt(
  held: SceneClaim | null,
  payload: unknown,
): { claim: SceneClaim; changed: boolean } | null {
  const incoming = readClaim(payload)
  if (!incoming) return null
  const claim = winner(held, incoming)
  const changed = held === null || claim.scene !== held.scene || claim.at !== held.at
  return { claim, changed }
}

/**
 * What to tell somebody who has just arrived.
 *
 * The answer to "no delivery guarantee". A client that missed the broadcast, or
 * that joined after it, is in the same position - it does not know - and the
 * cheapest repair is that everybody already here says what they are on when
 * somebody new appears. It is idempotent by construction: the newcomer runs the
 * same `winner` over however many answers arrive and lands where the room is.
 *
 * Null when this client has been through no doors, because announcing "we are
 * on the level you already loaded" is a message that changes nothing. A room
 * where nobody has opened a door sends nothing at all, which is nearly all of
 * them.
 */
export function greeting(held: SceneClaim | null): SceneClaim | null {
  return held && held.at > 0 ? held : null
}

/**
 * Who has arrived since last time, by name rather than by counting.
 *
 * Counting was the first version and it was wrong in a way that only shows up
 * in a busy room: if somebody leaves and somebody else joins between two
 * renders, the *number* of peers is unchanged, so a greeting keyed on it never
 * fires - and the person who just walked in stands in whatever level their own
 * document loaded while everybody else is somewhere else. It is the exact
 * failure `greeting` exists to prevent, reintroduced one layer up by measuring
 * the wrong thing.
 *
 * A set difference cannot make that mistake: it asks who is here that was not
 * here before, which is the actual question.
 *
 * `seen` is *replaced* by the caller rather than added to, so somebody who
 * leaves and comes back is greeted again - they have been away, and while they
 * were away the room may have moved.
 */
export function arrivals(present: readonly string[], seen: ReadonlySet<string>): string[] {
  return present.filter((id) => !seen.has(id))
}
