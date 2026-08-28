'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/tenant'

/**
 * Erasing what a game has kept.
 *
 * docs/xp/state.md §7.5 Reading A gave a space owner the *view*; backlog §7a
 * held the erasing back until somebody decided what an owner may erase of
 * another person's progress. The answer is two controls rather than one, and
 * the whole argument is in `20261031000000_clearing_a_store.sql` beside the
 * function that enforces it.
 *
 * ---------------------------------------------------------------------------
 * In its own file, next to a comment in `actions.ts` explaining why
 * ---------------------------------------------------------------------------
 * Everything in `actions.ts` is a command against a project's stream: rename,
 * share, submit, move. This writes to no stream at all. It is a deletion out of
 * a table that was never event-sourced (§3.3 — a coin count has no audit value
 * and folding it from the beginning is the cost snapshotting exists to avoid),
 * so there is no event, no decider and nothing to project.
 *
 * That is worth a file boundary rather than a paragraph: the thing this cannot
 * do is be undone, and a caller reaching for it should not find it among a
 * dozen things that can.
 */

export type ClearResult = { ok: true; cleared: number } | { ok: false; error: string }

/**
 * Clear a level's store — the shared world alone, or all of it.
 *
 * The gate is the database's. `requireTenant` establishes *a* membership, which
 * is what makes the settings page render at all; whether this person may erase
 * somebody else's progress is `xp_store_clear`'s own check, written once where
 * the delete happens. A second copy here would be a second place for that rule
 * to be right.
 */
export async function clearXpStore(
  slug: string,
  xpId: string,
  everything: boolean,
): Promise<ClearResult> {
  const context = await requireTenant(slug)

  const { data, error } = await context.supabase.rpc('xp_store_clear', {
    p_xp_id: xpId,
    p_everything: everything,
  })

  /**
   * The function's own sentence, not one wrapped around it.
   *
   * It raises exactly one — "no such level" — and it covers both the level that
   * does not exist and the one that is not this person's to clear, deliberately.
   * Anything else that arrives here is the database being unwell rather than an
   * answer, and it is shown as-is for the same reason.
   */
  if (error) return { ok: false, error: error.message }

  /**
   * The settings page is a server render of figures that just changed.
   *
   * Without this the card would keep showing the saves that are gone until
   * something else happened to invalidate it — which on a page somebody just
   * pressed a destructive button on reads as the button not having worked, and
   * invites a second press.
   */
  revalidatePath(`/t/${slug}/settings/space`)

  return { ok: true, cleared: Number(data ?? 0) }
}
