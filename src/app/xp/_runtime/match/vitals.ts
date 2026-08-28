/**
 * What one client may draw about somebody else's health.
 *
 * ---------------------------------------------------------------------------
 * Why this is allowed to exist at all
 * ---------------------------------------------------------------------------
 * Nothing a client knows about another player's body is worth drawing: their
 * health lives on the arbiter, the shooter's own claim is only a *claim* until
 * a verdict comes back, and a bar drawn from a local subtraction would be the
 * same mistake `claim` in ../_runtime/simulation exists to avoid - a number
 * latched before the round trip, and then wrong for the rest of the match.
 *
 * The arbiter already answers this question, twice, and neither answer is a
 * guess:
 *
 *   - `xp_arbiter_view` returns `health` as the whole map, unredacted, next to
 *     the `settings` the first join pinned. So the ceiling and every row are
 *     the server's, and they arrive together.
 *   - a confirmed `hit` returns the same map in its outcome, on the round trip
 *     that resolved the shot - which is the moment somebody actually wants to
 *     know, rather than up to a second later when the poll next runs.
 *
 * So this module does no arithmetic about damage and holds no opinion about
 * what a shot did. It turns "what the arbiter last said" into "what to draw",
 * and everything it refuses to draw is a case where the arbiter has not said.
 *
 * ---------------------------------------------------------------------------
 * A fraction needs a ceiling, and only one of them counts
 * ---------------------------------------------------------------------------
 * A bar is a *proportion*, so it needs to know what full is. The obvious source
 * is our own document - `player.blueprint.props.hp` is right there - and it is
 * the wrong one. The match's numbers were pinned by whoever joined first and a
 * client that disagrees is refused entry (20261008000000_xp_arbiter_hits.sql),
 * so the ceiling that the health map is measured against is the arbiter's. They
 * are the same number in every match that ever opens, and reading the local one
 * would be drawing two different games in the same bar on the one day they are
 * not.
 *
 * With no ceiling there is no bar. Not a full one, and not one guessed from the
 * largest row: "nobody has joined this match yet" and "everybody is untouched"
 * look identical on a full bar and are not the same fact.
 */

/** One bar, over one body. */
export interface Bar {
  /** The account id, which is what the crowd buffer is keyed by. */
  id: string
  /** Exactly what the arbiter last said, for a caller that wants the number. */
  hp: number
  /** How much of the match's own ceiling is left, 0 to 1. */
  left: number
}

/**
 * The bars to draw, from the arbiter's last word.
 *
 * Our own row is left out rather than drawn. The player's own health is already
 * on the HUD as a number, and a second copy of it floating over their own head
 * would be the one bar in the level that nobody can see from where they are
 * standing.
 *
 * Sorted by id, which is arbitrary and deliberate: the order decides nothing on
 * screen - every bar is positioned by the body it belongs to - and a stable one
 * means React keeps the same mesh for the same person as people come and go.
 */
export function barsFrom({
  health,
  full,
  me,
}: {
  /** The arbiter's map, account id to health. */
  health: Readonly<Record<string, number>> | undefined
  /** What the first join pinned as a whole body, from the arbiter's settings. */
  full: number | undefined
  /** Which row is ours, as the arbiter names it. */
  me: string | undefined
}): Bar[] {
  if (!health || full === undefined || !Number.isFinite(full) || full <= 0) return []

  return Object.entries(health)
    .filter(([id, hp]) => id !== me && typeof hp === 'number' && Number.isFinite(hp))
    .map(([id, hp]) => ({
      id,
      hp,
      // Clamped, because the ceiling and the row are two writes to one document
      // and a client that arrived between them should draw a full bar rather
      // than one hanging out of its own frame.
      left: Math.max(0, Math.min(1, hp / full)),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
