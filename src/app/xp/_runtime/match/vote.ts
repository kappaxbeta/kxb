import type { Standing } from '@/app/xp/_runtime/match/standings'

/**
 * An open vote, as a thing to put on a screen.
 *
 * The arbiter decides the vote (`xp_arbitrate`'s `vote_open` / `vote` /
 * `vote_close`, and `xp_arbiter_tally` for the majority). Nothing here decides
 * anything - it turns what the server said into the four questions a player
 * actually has: who can I pick, how is it going, have I voted, how long have I
 * got.
 *
 * Pure, and separate from the panel, because the counting rules are the sort of
 * thing that looks obviously right and is off by one: a vote panel that shows
 * somebody the wrong count is a vote panel that changes how they vote.
 *
 * ---------------------------------------------------------------------------
 * The counts here are not the majority
 * ---------------------------------------------------------------------------
 * They are what has been *cast*, which the server sends to everybody because a
 * vote nobody can watch is a vote nobody plays. Whether a count is a majority is
 * decided server-side against who is standing, and deliberately not recomputed
 * here - two implementations of "is that a majority" is exactly the shape that
 * ends with a screen saying somebody is out and a server saying they are not.
 */

/** What the arbiter reports while a vote is running. */
export interface OpenVote {
  /** ISO, from the server's clock. */
  closes: string
  /** voter id -> who they picked, or `skip`. */
  cast: Readonly<Record<string, string>>
}

/** The target that means "nobody", which is a real answer and not an absence. */
export const SKIP = 'skip'

export interface VoteOption {
  /** A player id, or `skip`. */
  id: string
  name: string
  /** How many have picked this so far. */
  votes: number
  /** Whether this is the one we picked. */
  ours: boolean
}

export interface VoteView {
  options: VoteOption[]
  /** Whole seconds until it closes, floored at zero. */
  left: number
  /** Who we picked, or null. */
  ours: string | null
  /**
   * Whether this client may cast one at all.
   *
   * False for somebody eliminated, and the panel still renders for them -
   * watching the room decide is most of what being out *is*, and hiding it
   * would make elimination feel like being disconnected.
   */
  may: boolean
}

export function voteView({
  vote,
  standings,
  me,
  now,
}: {
  vote: OpenVote | null | undefined
  standings: readonly Standing[]
  me: string | undefined
  /** Milliseconds since the epoch, passed in so a test can be at any moment. */
  now: number
}): VoteView | null {
  if (!vote) return null

  const counts = new Map<string, number>()
  for (const picked of Object.values(vote.cast)) {
    counts.set(picked, (counts.get(picked) ?? 0) + 1)
  }

  const ours = (me !== undefined && vote.cast[me]) || null

  /**
   * Everybody still in, and yourself among them.
   *
   * Voting for yourself is legal in every game of this kind and occasionally
   * correct, so it is not filtered out - and a list that silently omitted one
   * player would be read as that player being safe.
   *
   * Somebody already out is not on it: the server refuses a vote for them, and
   * an option that is always refused is a trap rather than a choice.
   */
  const options: VoteOption[] = standings
    .filter((row) => !row.out)
    .map((row) => ({
      id: row.id,
      name: row.name,
      votes: counts.get(row.id) ?? 0,
      ours: ours === row.id,
    }))

  options.push({ id: SKIP, name: 'nobody', votes: counts.get(SKIP) ?? 0, ours: ours === SKIP })

  const closes = Date.parse(vote.closes)
  return {
    options,
    // A deadline that cannot be parsed shows as zero rather than as NaN, which
    // would render as "NaN seconds left" and count down forever.
    left: Number.isFinite(closes) ? Math.max(0, Math.ceil((closes - now) / 1000)) : 0,
    ours,
    may: me !== undefined && standings.some((row) => row.mine && !row.out),
  }
}
