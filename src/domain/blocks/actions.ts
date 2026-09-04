'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'

/**
 * Blocking somebody, and letting them back.
 *
 * ---------------------------------------------------------------------------
 * Not a moderation action
 * ---------------------------------------------------------------------------
 * These live beside `domain/moderation/actions.ts` in spirit and deliberately
 * not in it. A report is addressed to us and waits for a verdict; a block is
 * addressed to nobody, takes effect immediately, and is nobody's business but
 * the blocker's. Sharing a file with the moderation queue would be the first
 * step towards sharing a status column with it.
 *
 * ---------------------------------------------------------------------------
 * Not scoped to a space
 * ---------------------------------------------------------------------------
 * There is no slug here and no tenant check, which is the one thing about this
 * pair worth arguing over. A block *is* an account-wide arrangement: somebody
 * you do not want to hear in the lounge is somebody you do not want to hear in
 * the cafe either, and asking people to block the same person once per room
 * would be a feature that works only for people who never move.
 *
 * The cost of that is that the id being blocked is not checked against a
 * membership. It does not need to be: the only thing a row here can do is make
 * *your own* reading smaller. Blocking a stranger you will never meet is a
 * no-op you paid a round trip for, and blocking somebody who is not real is the
 * same. Nothing here can be used to reach anybody.
 *
 * ---------------------------------------------------------------------------
 * Guests may block
 * ---------------------------------------------------------------------------
 * `writeBlockedReason` refuses a guest every durable write in the product, and
 * this is the exception. The rule exists because a visitor should not leave
 * marks on somebody else's space; a block leaves no mark on anything - it is a
 * row about the reader, it changes nobody else's view, and it is collected with
 * the guest account when the session ends. A visitor standing in a public
 * lounge is exactly the person most likely to need it.
 */

export type BlockResult = { ok: true } | { ok: false; error: string }

const targetSchema = z.object({ userId: z.uuid() })

/**
 * Stop hearing somebody.
 *
 * Idempotent by upsert rather than by "insert and forgive 23505". Pressing
 * block twice - from two tabs, or because the first press did not visibly do
 * anything - is not an error condition and should not be reported as one.
 */
export async function blockUser(userId: string): Promise<BlockResult> {
  const parsed = targetSchema.safeParse({ userId })
  if (!parsed.success) return { ok: false, error: 'Not somebody who can be blocked' }

  const { user, supabase } = await requireUser()

  // The check constraint underneath says the same thing; this says it in a
  // sentence, because the constraint's message is not one anybody should read.
  if (parsed.data.userId === user.id) {
    return { ok: false, error: 'You cannot block yourself' }
  }

  const { error } = await supabase.from('blocked_users').upsert(
    { blocker_id: user.id, blocked_id: parsed.data.userId },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  )

  if (error) return { ok: false, error: `Could not block: ${error.message}` }

  /*
   * The settings list, and nothing else. The chat panel is standing inside a
   * live canvas when this is pressed and a layout re-render would tear the
   * scene down around it - the same reason `reportChatMessage` revalidates
   * nothing. The panel drops the blocked person's lines from its own state
   * instead, and the next full load agrees with it because the select policy
   * does.
   */
  revalidatePath('/t/[slug]/settings/profile', 'page')
  return { ok: true }
}

/** Let somebody back in. */
export async function unblockUser(userId: string): Promise<BlockResult> {
  const parsed = targetSchema.safeParse({ userId })
  if (!parsed.success) return { ok: false, error: 'Not somebody who can be unblocked' }

  const { user, supabase } = await requireUser()

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', parsed.data.userId)

  if (error) return { ok: false, error: `Could not unblock: ${error.message}` }

  revalidatePath('/t/[slug]/settings/profile', 'page')
  return { ok: true }
}
