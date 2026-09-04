'use server'

import { redirect } from 'next/navigation'
import { closeAccount, type CloseResult } from '@/domain/account/close'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * The button at the bottom of the profile page.
 *
 * Thin on purpose - everything that decides anything is in `close.ts`, which
 * knows nothing about browsers - and it carries exactly two things this file
 * has to own because they are about being a request rather than about being an
 * account.
 *
 * **The confirmation word.** Checked here rather than in `closeAccount`, and
 * that is the seam: a typed word is a fact about a form, not about an account.
 * A future caller - the phone, most likely - will have its own way of asking
 * and should not have to send an English string to satisfy a rule that is
 * really "somebody meant this".
 *
 * **The sign-out.** The session cookie belongs to the response, so the domain
 * cannot clear it. Without this the browser walks away holding an access token
 * for a banned account and meets a wall of refusals on the next navigation
 * instead of a landing page.
 *
 * Deliberately not re-asking for a password. The account is already signed in,
 * the act is behind a typed confirmation, and there is a real argument the
 * other way - but an account created through an invite link or through Google
 * may have no password at all, and a confirmation somebody physically cannot
 * satisfy is a deletion button that does not work for the people most likely
 * to press it.
 */
export async function closeMyAccount(confirmation: string): Promise<CloseResult> {
  const { user, supabase } = await requireUser()

  /*
   * Trimmed and case-folded. The word is a statement of intent, not a
   * password, and refusing "close " for its trailing space would be pedantry
   * dressed up as safety. Compared against every locale's word rather than the
   * reader's own: the page prints one of them, and which one is a detail of
   * how the page was rendered, not of what was meant.
   */
  const said = confirmation.trim().toLocaleUpperCase()
  if (!CONFIRMATION_WORDS.includes(said)) {
    return { ok: false, error: 'Type the confirmation word to close the account' }
  }

  const result = await closeAccount(supabase, user)
  if (!result.ok) return result

  /*
   * A fresh client for the sign-out. The one above was made before the account
   * was banned and its cached user is a person who no longer exists; asking it
   * to sign out works, but reading anything else from it afterwards would be
   * reading a ghost.
   */
  const session = await createClient()
  await session.auth.signOut()

  redirect('/')
}

/**
 * The words that mean yes, in every language the app is printed in.
 *
 * A list rather than a lookup because the alternative is worse: resolving the
 * reader's locale here to pick one word would refuse somebody who switched
 * language in another tab, and there is no attack this narrowness prevents -
 * every word on this list is one the product itself offers to somebody.
 *
 * They are the `close.confirmWord` strings from `@/app/i18n/settings`, copied
 * rather than imported, because `src/domain` may not import `@/app/*`.
 */
const CONFIRMATION_WORDS = ['CLOSE', 'SCHLIESSEN', 'ЗАКРИЙ']
