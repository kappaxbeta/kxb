import 'server-only'
import { cookies } from 'next/headers'
import { type InviteRecord, inviteProblem } from '@/domain/access/application'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * The front door.
 *
 * Four things can create an account - password sign-up, a magic link, Google,
 * and Supabase's own invite email - and a gate that only covers some of them is
 * decoration. This module is the one place that decides, so the three paths we
 * control ask the same question in the same words, and the fourth (an admin
 * inviting somebody by email) is deliberately exempt because an admin doing it
 * on purpose *is* the authorisation.
 *
 * Everything here runs through the service role. That is not a shortcut: the
 * caller is by definition somebody with no account yet, so there is no session
 * to check policies against, and the invite table is admin-only precisely so a
 * signed-in member cannot read every unredeemed token in the system.
 */

/**
 * Where an invite token waits while somebody is off at Google.
 *
 * The token arrives as `/signup?invite=…`, and OAuth throws the browser to
 * another origin and back to `/auth/callback`, which sees none of the original
 * query string. A cookie is the only thing that survives that trip. Short-lived
 * and httpOnly: it is a capability, not a preference.
 */
export const INVITE_COOKIE = 'unkown_invite'
const INVITE_COOKIE_MAX_AGE = 30 * 60

/** Remember the token across an OAuth round trip. */
export async function rememberInviteToken(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INVITE_COOKIE_MAX_AGE,
  })
}

/** The token from the URL if there is one, else whatever the cookie kept. */
export async function readInviteToken(fromUrl?: string | null): Promise<string | null> {
  if (fromUrl && fromUrl.trim()) return fromUrl.trim()
  const jar = await cookies()
  return jar.get(INVITE_COOKIE)?.value?.trim() || null
}

export async function forgetInviteToken(): Promise<void> {
  const jar = await cookies()
  jar.delete(INVITE_COOKIE)
}

export type Admission =
  /**
   * Let them in. `inviteId` is set when an invite is what let them in.
   *
   * `required` separates the two ways that can happen. With the door open an
   * invite is still spent, but it is not what admitted them - they could have
   * signed up without it. With the door closed it is the entire reason they got
   * through, which is what makes losing the race for its last use a refusal
   * rather than a shrug. See `redeemInvite`.
   */
  | { ok: true; inviteId: string | null; required: boolean }
  | { ok: false; error: string; waitlist: boolean }

/**
 * May this address create an account?
 *
 * Two ways to yes: the door is open, or they hold a working invite. An invite
 * is checked even when the door is open, so that redeeming one still marks it
 * used - otherwise an admin who opens registration for a week would come back
 * to a pile of invites that all look unredeemed.
 *
 * `waitlist` on the refusal is what tells the caller to offer the queue rather
 * than just say no. It is false when the invite itself was the problem: somebody
 * holding a dead invite needs a new invite, and putting them on a list they may
 * already be on would be a strange answer to "this link stopped working".
 */
export async function mayRegister(email: string, token: string | null): Promise<Admission> {
  const supabase = await createClient()
  const open = await isRegistrationOpen(supabase)

  if (token) {
    const invite = await findInvite(token)
    const problem = inviteProblem(invite?.record ?? null, email)

    if (problem) {
      // A bad token while the door is open is not worth refusing over - they
      // could have signed up without it. Say nothing and let them through,
      // without marking anything redeemed.
      if (open) return { ok: true, inviteId: null, required: false }
      return { ok: false, error: problem, waitlist: false }
    }

    return { ok: true, inviteId: invite?.id ?? null, required: !open }
  }

  if (open) return { ok: true, inviteId: null, required: false }

  return {
    ok: false,
    error: 'Sign-up is by invitation at the moment.',
    waitlist: true,
  }
}

/**
 * May a magic link create an account for this address?
 *
 * A separate question from `mayRegister`, because the magic-link path cannot
 * spend an invite the way the others do. There is no account at the moment the
 * mail is sent, and burning the invite then breaks the most ordinary thing a
 * person does with a sign-in email: ask for a second one because the first got
 * lost. The second request would find the invite spent and silently refuse to
 * create anybody.
 *
 * So the rule here is structural instead of counted. An *addressed* invite -
 * one locked to a mailbox - can be honoured any number of times without
 * rationing, because it can only ever produce an account for that one address;
 * re-sending is harmless by construction. An *open* invite cannot, because
 * honouring it without spending it would let one link mint accounts for as many
 * addresses as somebody cared to type. Those are refused here, and their holder
 * uses the password form, where an invite can be spent against a real account
 * id at the moment one exists.
 *
 * Returns false only in the case that matters: a closed door and no invite that
 * fits. An existing account signing in by link is never this function's
 * business - see the `shouldCreateUser` note at the call site.
 */
export async function mayCreateByEmailLink(
  email: string,
  token: string | null,
): Promise<boolean> {
  const supabase = await createClient()
  if (await isRegistrationOpen(supabase)) return true

  if (!token) return false

  const invite = await findInvite(token)
  if (!invite) return false

  // Open invites are declined on this path on purpose - see above. Requiring an
  // address is what makes "no rationing" safe rather than a hole.
  if (!invite.record.email) return false

  return inviteProblem({ ...invite.record, uses: 0, maxUses: 1 }, email) === null
}

async function findInvite(
  token: string,
): Promise<{ id: string; record: InviteRecord } | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('account_invites')
    .select('id, email, max_uses, uses, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    record: {
      email: data.email,
      maxUses: data.max_uses,
      uses: data.uses,
      expiresAt: data.expires_at,
      revokedAt: data.revoked_at,
    },
  }
}

/**
 * Mark an invite used, once.
 *
 * The update is conditional on the `uses` value it read, which is what makes
 * two simultaneous redemptions of a one-use invite resolve to one winner
 * instead of two accounts. Without the `.eq('uses', …)` this is the classic
 * read-then-write race, and the thing being raced for is exactly the thing the
 * invite was rationing.
 *
 * Returns false when it lost the race, and the caller has to act on that when
 * the invite was `required` - otherwise the rationing this update exists to
 * enforce is decided and then thrown away, and a one-use invite admits everyone
 * who raced for it. Best-effort by design for the *audit* columns - who
 * redeemed it is nice to have, and is not worth failing a sign-up over.
 */
export async function redeemInvite(inviteId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { data: current } = await admin
    .from('account_invites')
    .select('uses, max_uses')
    .eq('id', inviteId)
    .maybeSingle()

  if (!current || current.uses >= current.max_uses) return false

  const { data: updated } = await admin
    .from('account_invites')
    .update({
      uses: current.uses + 1,
      last_redeemed_by: userId,
      last_redeemed_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('uses', current.uses)
    .select('id')

  return (updated?.length ?? 0) > 0
}

/**
 * Undo an account that should never have been created.
 *
 * Only OAuth needs this. The password and magic-link paths ask permission
 * before creating anybody, but Google hands us a finished account: Supabase
 * creates the user during the code exchange, before any code of ours runs. By
 * the time we can say "no", the row exists.
 *
 * So the refusal is a deletion, and it is fenced. Both conditions must hold:
 *
 *   * the account owns nothing - no membership anywhere, so nothing is lost
 *   * it was created seconds ago - it is the one this request just made
 *
 * The age check is what stops a returning user being deleted if the flags ever
 * come back wrong. Somebody who signed in a month ago fails it, and the worst
 * case degrades to "signed out and told to ask for an invite" rather than
 * "account destroyed". A deletion this automatic has to fail in the harmless
 * direction, and refusing to delete is that direction.
 */
export async function discardUninvitedAccount(userId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { data: account } = await admin.auth.admin.getUserById(userId)
  const createdAt = account?.user?.created_at
  if (!createdAt) return false

  const ageMs = Date.now() - new Date(createdAt).getTime()
  if (ageMs > 60_000) return false

  const { count } = await admin
    .from('tenant_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count ?? 0) > 0) return false

  const { error } = await admin.auth.admin.deleteUser(userId)
  return !error
}
