import { projectRefPrefix } from '@/domain/xps/ref'
import type { Client } from '@/es/store'

/**
 * How much a world was played, out of the session log.
 *
 * The first reader of `xp_sessions` (docs/xp/creator.md §18.6), and it is not
 * the fund: it is the number the backoffice review queue was already printing
 * and sorting by. `xps_read_model.plays` is read in three places and written in
 * none, so every project has shown `0 plays` since the column existed and "most
 * played first" has been a sort over zeros.
 *
 * ---------------------------------------------------------------------------
 * A world, not a version of one
 * ---------------------------------------------------------------------------
 * Sessions are keyed by reference, and a reference names a version — that is
 * §11.5's pinned-version decision and it is right for a match. It is the wrong
 * unit for this question: a reviewer asking what to look at first means the
 * game, not v3 of it. So every version folds into one figure here, and the
 * version stays in the row for the question that genuinely turns on it —
 * §18.8's open "does a world's *version* earn, or the world?", which this is
 * deliberately not answering on anybody's behalf.
 */

export interface PlayTotals {
  /** Sessions that ended. Not people: one person playing twice is two. */
  plays: number
  /** Seconds of them, summed. */
  seconds: number
  /** When the last one ended, or null for a world nobody has played. */
  lastPlayed: string | null
}

export const NEVER_PLAYED: PlayTotals = { plays: 0, seconds: 0, lastPlayed: null }

/** One row of `xp_play_totals`, before it is keyed back to a project. */
export interface PrefixTotals {
  prefix: string
  plays: number
  seconds: number
  last_played: string | null
}

/**
 * The function's rows, keyed back by project id.
 *
 * Split out and exported for the reason `draftToRestore` is: this is the part
 * with a decision in it, and the rest is a network call. The decision is what
 * happens to a prefix that came back and matches nothing the caller asked
 * about, which is a query answering a question nobody asked and is dropped
 * rather than kept under a key nothing will look up.
 */
export function playsByProject(
  xpIds: readonly string[],
  rows: readonly PrefixTotals[],
): Map<string, PlayTotals> {
  const byPrefix = new Map(rows.map((row) => [row.prefix, row]))

  const totals = new Map<string, PlayTotals>()
  for (const xpId of xpIds) {
    const row = byPrefix.get(projectRefPrefix(xpId))
    totals.set(
      xpId,
      row
        ? {
            // `count` and `sum` come back as bigint, which supabase-js hands
            // over as a number here and as a string on a large one. Neither is
            // trusted: `Number` on both is the same line the read model's own
            // `bytes` already uses.
            plays: Number(row.plays),
            seconds: Number(row.seconds),
            lastPlayed: row.last_played,
          }
        : NEVER_PLAYED,
    )
  }
  return totals
}

/**
 * The same fold, for the function that answers by id rather than by prefix.
 *
 * `xp_play_totals_mine` has already done the keying, because the permission it
 * enforces is about an id — so the only decision left here is the one every
 * caller of the other fold also gets: a world that came back with nothing is a
 * zero rather than a gap.
 */
export function playsById(
  xpIds: readonly string[],
  rows: readonly { xp_id: string; plays: number; seconds: number; last_played: string | null }[],
): Map<string, PlayTotals> {
  const byId = new Map(rows.map((row) => [row.xp_id, row]))

  return new Map(
    xpIds.map((xpId) => {
      const row = byId.get(xpId)
      return [
        xpId,
        row
          ? { plays: Number(row.plays), seconds: Number(row.seconds), lastPlayed: row.last_played }
          : NEVER_PLAYED,
      ]
    }),
  )
}

/**
 * Ask the database, for a list of projects.
 *
 * One round trip for a page rather than one per row — the same rule
 * `listByState` already follows about a queue of thirty not becoming sixty
 * queries.
 *
 * A failed read is zeroes rather than a throw, and that is a judgement about
 * what this number is for: it decorates a queue and orders it. A backoffice
 * page that will not open because a count could not be summed is worse than one
 * that opens with the counts missing, and the caller has no better answer to
 * give. It is not the shape a payout would use — §18.3 wants that recomputed
 * from the log and answered exactly or not at all.
 */
export async function readPlayTotals(
  client: Client,
  xpIds: readonly string[],
): Promise<Map<string, PlayTotals>> {
  if (xpIds.length === 0) return new Map()

  const { data, error } = await client.rpc('xp_play_totals', {
    p_prefixes: xpIds.map(projectRefPrefix),
  })

  if (error) {
    console.error('play totals could not be read:', error.message)
    return playsByProject(xpIds, [])
  }

  return playsByProject(xpIds, (data ?? []) as PrefixTotals[])
}

/**
 * The same question, asked as somebody with a space rather than as the platform.
 *
 * `readPlayTotals` above is the backoffice's, through the service role.
 * `xp_sessions` grants select to backoffice admins and nobody else, so an owner
 * calling that one gets zeroes for their own world — which is the one place the
 * number is most wanted. §18.1: *a fund at this size is a signal, not an income
 * — it says the thing you made was played.* This is the signal without the fund.
 *
 * A count and never the rows behind it. The function is aggregates-only by
 * construction rather than by a policy that admits an owner to the table, for
 * the reason scenes.md §3.4 gives and this page already says out loud beside
 * the store panel: they own the game, not the people playing it.
 *
 * The caller's own client, so the permission is the database's — a member of
 * the space, or the owner wherever they now are. A page that authorised this
 * itself would be a second place for that rule to be right.
 */
export async function readMyPlayTotals(
  client: Client,
  xpIds: readonly string[],
): Promise<Map<string, PlayTotals>> {
  if (xpIds.length === 0) return new Map()

  const { data, error } = await client.rpc('xp_play_totals_mine', {
    p_xp_ids: [...xpIds],
  })

  if (error) {
    // Zeroes rather than a throw, for the reason above: this decorates a page
    // that is about something else, and a project you cannot open because a
    // count would not sum is worse than a project with no count on it.
    console.error('play totals could not be read:', error.message)
    return playsById(xpIds, [])
  }

  return playsById(xpIds, data ?? [])
}
