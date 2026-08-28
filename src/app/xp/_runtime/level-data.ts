import { arbitrated, defaultsOf, persists, shares, storeKeyOf, type XpData } from '@kxb/xp'

/**
 * A level's declared data, while it is being played.
 *
 * docs/xp/backlog.md §7c, the last step: the `data` block is read by the parser
 * and edited in the panel, and until this existed nothing ever loaded it or
 * wrote it back. A rule could say `addProp coins target: 'world'` and the number
 * went nowhere.
 *
 * The pure half is here for the reason `race-record.ts` is: what to read, what
 * has changed and what is worth writing are decisions with edge cases, and the
 * component that owns the frame loop is not somewhere they can be tested.
 *
 * ---------------------------------------------------------------------------
 * One map, mutated in place, diffed against what was written
 * ---------------------------------------------------------------------------
 * `applyVerb` writes straight into the map — the same arrangement `world.props`
 * has, and the reason is the same: a rule that adds a coin and then asks whether
 * there are ten has to see the one it just added. So nothing tells us a write
 * happened, and the honest way to find out is to compare against the last thing
 * we stored.
 *
 * That is cheap in the only sense that matters here: the block is capped at 32
 * fields, so the comparison is at most 32 numbers once a frame, against a
 * `world.props` walk that is already every entity in the level.
 *
 * ---------------------------------------------------------------------------
 * A level with no store still has its data
 * ---------------------------------------------------------------------------
 * The map is built from the declared defaults whether or not anything can
 * persist it. A builtin document under `public/xp/xps/` has no row to store
 * against, and its rules should still work — the coins count up, the door opens,
 * and none of it is there tomorrow. That is `wants` rather than `needs`: a
 * document that cannot work session-only says `needs: persistence` and is
 * refused at the door instead.
 */

/** What the fields are before anything has been read back. */
export function openingValues(data: XpData): Map<string, number> {
  return defaultsOf(data)
}

/**
 * The store keys to read at open, with the field each one belongs to.
 *
 * Every declared field, including the ones a rule may never touch: the alternative
 * is reading lazily on first use, which puts a network round trip inside a frame
 * and makes the first `coins >= 10` of a session answer against a default that
 * has not been filled in yet.
 */
export function plannedReads(data: XpData): { name: string; key: string }[] {
  return Object.entries(data)
    // A `run` field has nothing in the store to read: it starts at its declared
    // default every match, which is what the scope *means*. Skipped here as well
    // as in `persisted` below, because a field read back but never written is
    // one that answers with whatever was there before the scope existed.
    .filter(([, field]) => persists(field))
    .map(([name, field]) => ({ name, key: storeKeyOf(name, field) }))
}

/**
 * What a value read back from the store is worth.
 *
 * `undefined` is a field nobody has written, which is the common case on a first
 * visit and is not a failure — the declared default stands. Anything that is not
 * a finite number is a stored value that has stopped matching the model: an
 * author changed a field's meaning, or something else wrote the row. The default
 * stands there too, because a rule comparing against `NaN` is false forever and
 * a level that silently stops working is worse than one that starts over.
 */
export function readBack(stored: unknown, fallback: number): number {
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback
}

/**
 * Which fields have moved since they were last written.
 *
 * Answers with names rather than a boolean so the caller writes only what
 * changed: each field is its own store key, and a `player:coins` write that also
 * re-wrote `space:town` would be one player's frame overwriting a value
 * everybody shares.
 *
 * Sorted, so a level that changes three fields in one frame writes them in the
 * same order every time. Nothing depends on it; it makes a log readable.
 */
export function changed(live: ReadonlyMap<string, number>, written: ReadonlyMap<string, number>): string[] {
  const moved: string[] = []
  for (const [name, value] of live) {
    if (written.get(name) !== value) moved.push(name)
  }
  return moved.sort()
}

/**
 * Of those, the ones there is anywhere to put.
 *
 * Split from `changed` rather than folded into it, because they answer different
 * questions and one of them is about the *document*: `changed` is "what moved",
 * which a caller with no document can ask, and this is "what is worth a round
 * trip", which needs to know what the level declared.
 */
/**
 * The fields worth asking about again, because somebody else may have moved them.
 *
 * Read on a timer beside the write, which is what makes `space` mean what it
 * says. The pair is deliberate: a level that writes on an interval and never
 * reads is a level where every client is authoritative about a value they all
 * share, and the last one to flush wins an argument nobody knew was happening.
 */
export function shareable(data: XpData): { name: string; key: string }[] {
  return Object.entries(data)
    .filter(([, field]) => shares(field))
    .map(([name, field]) => ({ name, key: storeKeyOf(name, field) }))
}

/**
 * Which of those this client may safely adopt.
 *
 * **Only where it has nothing of its own waiting.** A field whose live value has
 * moved since it was last written is a change this client has made and not yet
 * flushed, and taking the stored value over it would undo somebody's own roll a
 * second after they made it. Everything else is somebody else's news.
 */
export function adoptable(
  name: string,
  live: ReadonlyMap<string, number>,
  written: ReadonlyMap<string, number>,
): boolean {
  return live.get(name) === written.get(name)
}

/**
 * The fields the arbiter keeps for the length of one game.
 *
 * The `run` half of what `shareable` answers for the store: same question,
 * different transport, and they are deliberately disjoint - a field that went
 * to both would be two writers with two clocks arguing about one number.
 */
export function arbitratedFields(data: XpData): string[] {
  return Object.entries(data)
    .filter(([, field]) => arbitrated(field))
    .map(([name]) => name)
}

export function persisted(names: readonly string[], data: XpData): string[] {
  return names.filter((name) => {
    const field = data[name]
    return field !== undefined && persists(field)
  })
}

/**
 * How long to wait before writing a field again.
 *
 * A rule can add to a field every frame — a score that ticks while you stand on
 * something, a timer counting down — and a write per frame is sixty round trips
 * a second per field. §3.3 is last-write-wins per row, so coalescing is not a
 * compromise here: the value that lands is the same one either way, and the only
 * thing the wait costs is how much is lost if the tab dies mid-second.
 *
 * Two seconds, and the teardown flush is what makes that safe rather than the
 * number: leaving the level writes everything outstanding.
 */
export const WRITE_EVERY_SECONDS = 2
