import 'server-only'
import type { Client } from '@/es/store'

/**
 * Who has the editor open, and until when.
 *
 * docs/xp/backend.md §12.7. Two people may both hold edit rights on a project;
 * until there is real collaboration, only one of them may have it open.
 *
 * ---------------------------------------------------------------------------
 * The two numbers, and why they are these two
 * ---------------------------------------------------------------------------
 * The renew interval has to be comfortably shorter than the lifetime, or an
 * editor loses its own claim during a slow request and somebody else can walk
 * in while the first person is still typing. Four to one leaves room for three
 * consecutive failures — a tunnel, a sleeping laptop's first wake, a deploy —
 * before anything is taken.
 *
 * Ninety seconds is also the wait a *second* person accepts before taking over,
 * and that is the real constraint on making it longer. Five minutes would be
 * safer for the holder and would mean a colleague staring at a read-only editor
 * for five minutes after somebody closed a laptop, which is the more common
 * situation by a distance.
 */
export const CLAIM_SECONDS = 90
export const RENEW_SECONDS = 20

export interface XpClaim {
  heldBy: string
  claimedAt: string
  expiresAt: string
  /** Worked out on the server, because a browser's clock is not evidence. */
  live: boolean
}

/** Who holds this project, or null when nobody ever has. */
export async function readClaim(supabase: Client, xpId: string): Promise<XpClaim | null> {
  const { data, error } = await supabase
    .from('xp_claims')
    .select('held_by, claimed_at, expires_at')
    .eq('xp_id', xpId)
    .maybeSingle()

  if (error || !data) return null

  return {
    heldBy: data.held_by,
    claimedAt: data.claimed_at,
    expiresAt: data.expires_at,
    live: new Date(data.expires_at).getTime() > Date.now(),
  }
}

export type ClaimOutcome =
  | { ok: true; claim: XpClaim }
  /** Somebody else has it, and their claim has not run out. */
  | { ok: false; heldBy: string; since: string; expiresAt: string }

/**
 * Take the claim, or renew it if it is already yours.
 *
 * One upsert rather than a read followed by a write, because two editors
 * opening the same project in the same second is exactly the case this exists
 * for — and a read-then-write would let both of them see "free" before either
 * wrote. The condition that makes it safe is in the `WHERE`: the row is only
 * overwritten when it is nobody's, already yours, or expired.
 *
 * `now()` is the database's, not the caller's. Two app replicas with slightly
 * different clocks would otherwise disagree about whether a claim had lapsed,
 * and the disagreement would be resolved in favour of whichever one was fast.
 */
export async function takeClaim(
  supabase: Client,
  xpId: string,
  accountId: string,
): Promise<ClaimOutcome> {
  const { data, error } = await supabase.rpc('claim_xp', {
    p_xp_id: xpId,
    p_account: accountId,
    p_seconds: CLAIM_SECONDS,
  })

  if (error) {
    // A failed claim is not a failed edit. The ladder and `expected_version`
    // are what actually protect the document, so refusing to open the editor
    // because a bookkeeping row would not write is the wrong trade - see the
    // note at the top of the migration.
    return { ok: true, claim: optimistic(accountId) }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { ok: true, claim: optimistic(accountId) }

  if (row.held_by !== accountId) {
    return {
      ok: false,
      heldBy: row.held_by,
      since: row.claimed_at,
      expiresAt: row.expires_at,
    }
  }

  return {
    ok: true,
    claim: {
      heldBy: row.held_by,
      claimedAt: row.claimed_at,
      expiresAt: row.expires_at,
      live: true,
    },
  }
}

/**
 * Give it up on purpose.
 *
 * An optimisation rather than the mechanism: closing a tab should not make a
 * colleague wait ninety seconds. Nothing breaks when it does not happen, which
 * is the property that matters when the tab was closed by a crash.
 */
export async function releaseClaim(
  supabase: Client,
  xpId: string,
  accountId: string,
): Promise<void> {
  await supabase.from('xp_claims').delete().eq('xp_id', xpId).eq('held_by', accountId)
}

/**
 * What to report when the claims table itself is unavailable.
 *
 * Deliberately generous: the caller is somebody the ladder has already said may
 * edit, and the honest failure mode of a bookkeeping table is that bookkeeping
 * stops, not that work does.
 */
function optimistic(accountId: string): XpClaim {
  const now = new Date()
  return {
    heldBy: accountId,
    claimedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CLAIM_SECONDS * 1000).toISOString(),
    live: true,
  }
}
