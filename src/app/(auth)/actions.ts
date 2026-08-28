'use server'

import { AUTH_REPLIES } from '@/app/i18n/auth'
import { isLocale, publicLocale } from '@/app/i18n/locales'

/**
 * Which language this form was read in, from the hidden field the auth form
 * posts. `/login` and `/de/login` render the same component, so the field is
 * how a server action tells them apart.
 */
function repliesFrom(formData: FormData) {
  const raw = formData.get('locale')
  const locale = typeof raw === 'string' && isLocale(raw) ? raw : 'en'
  // The form is only served in the languages the public site is published in,
  // so this narrowing never fires in practice - but the field is a posted
  // string, and a locale the sign-in page does not exist in has to land
  // somewhere rather than index into nothing.
  return AUTH_REPLIES[publicLocale(locale)]
}

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  discardUninvitedAccount,
  forgetInviteToken,
  mayCreateByEmailLink,
  mayRegister,
  readInviteToken,
  redeemInvite,
  rememberInviteToken,
} from '@/domain/access/gate'
import { campaignSource } from '@/domain/analytics/campaign'
import { forgetPromoCode, readPromoCode, rememberPromoCode } from '@/domain/promo/cookie'
import { redeemPromoCode } from '@/domain/promo/redeem'
import { forgetLastSpace, landingPath } from '@/domain/tenants/last-space'
import {
  keepCookieValue,
  KEEP_SIGNED_IN_COOKIE,
  KEEP_SIGNED_IN_FIELD,
  KEEP_SIGNED_IN_MAX_AGE,
} from '@/lib/auth-persistence'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export type AuthResult =
  | {
      ok: false
      error: string
      /**
       * Offer the waiting list.
       *
       * Set only when the refusal was "the door is shut", never when it was
       * "that invite is dead" - somebody holding a broken invite needs a new
       * invite, and pointing them at a queue they may already be in is a
       * confusing answer to a link that stopped working.
       */
      waitlist?: boolean
    }
  | { ok: true; message: string }

const emailSchema = z.email('Enter a valid email address')

/**
 * Record whether this device wants to stay signed in.
 *
 * Written before the credentials are checked, and on every path in this file -
 * password, link and OAuth - because the cookie has to already be in place when
 * the auth cookies are written a moment later. See src/lib/auth-persistence.ts
 * for what it does to them.
 *
 * A missing box means false, which is how an unchecked checkbox arrives in
 * FormData. The *default* is set by the form rendering it checked, not here:
 * the absence of the cookie entirely - somebody who signed in before this
 * existed - still reads as "keep me", so this shipping signs nobody out.
 */
async function rememberPersistence(formData: FormData | undefined): Promise<void> {
  const keep = formData?.get(KEEP_SIGNED_IN_FIELD) !== null &&
    formData?.get(KEEP_SIGNED_IN_FIELD) !== undefined

  const cookieStore = await cookies()
  cookieStore.set(KEEP_SIGNED_IN_COOKIE, keepCookieValue(keep), {
    path: '/',
    sameSite: 'lax',
    maxAge: KEEP_SIGNED_IN_MAX_AGE,
    secure: env.appUrl().startsWith('https://'),
  })
}

const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

/**
 * Password sign-in.
 */
export async function signInWithPassword(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid credentials' }
  }

  // Before the sign-in, so the auth cookies it writes are already governed.
  await rememberPersistence(formData)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Deliberately vague: distinguishing "no such user" from "wrong password"
    // hands an attacker a way to enumerate accounts.
    return { ok: false, error: repliesFrom(formData).badCredentials }
  }

  // Straight back to where they were. The session exists by now, so membership
  // can be checked here rather than bouncing through the landing page.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const destination = user ? await landingPath(supabase, user) : '/tenants'

  revalidatePath('/', 'layout')
  redirect(destination)
}

/**
 * Password sign-up.
 *
 * The gate comes first, before `signUp` is called at all. That ordering is the
 * whole difference between this path and the OAuth one: here we can refuse
 * *before* an account exists, so a closed door costs nothing and cleans up
 * nothing. See discardUninvitedAccount() for the path that does not get that
 * luxury.
 */
export async function signUpWithPassword(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  }

  const token = await readInviteToken(asText(formData.get('invite')))
  const admission = await mayRegister(parsed.data.email, token)
  if (!admission.ok) {
    /**
     * The gate's own wording, translated at the boundary rather than inside it.
     *
     * `mayRegister` is domain code with no request to read a locale from, and
     * threading one through it would put a presentation concern in the middle
     * of an admission decision. The only refusal a visitor can actually reach
     * is the invitation-only one, and `waitlist` already identifies it.
     */
    const error = admission.waitlist ? repliesFrom(formData).invitationOnly : admission.error
    return { ok: false, error, waitlist: admission.waitlist }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(parsed.data)

  if (error) {
    return { ok: false, error: error.message }
  }

  /**
   * Spend the invite as soon as an account exists for it. Deliberately not
   * conditional on a session arriving: with email confirmation on there is no
   * session here, and an invite that only counted once somebody confirmed would
   * be reusable by anybody who signed up and never opened the mail.
   *
   * Gated on `identities` being non-empty, which is how GoTrue signals that the
   * user it just handed back is real. Signing up with an address that already
   * has an account returns success and an *obfuscated* user - a random id that
   * was never persisted - so that this path cannot be used to enumerate who has
   * an account. Redeeming against that id is a no-op the FK rejects anyway, and
   * more to the point the refusal below must not fire for it: doing so would
   * answer "that address exists" in the one place the whole design is careful
   * not to.
   */
  const isFreshAccount = (data.user?.identities?.length ?? 0) > 0

  if (admission.inviteId && data.user && isFreshAccount) {
    const redeemed = await redeemInvite(admission.inviteId, data.user.id)

    // Somebody else took the last use between the gate and here. The account
    // exists but should not, and undoing it is exactly what the OAuth path does
    // in the same situation - the fences on that deletion (owns nothing, made
    // seconds ago) hold just as well here.
    if (!redeemed && admission.required) {
      await discardUninvitedAccount(data.user.id)
      await forgetInviteToken()
      return {
        ok: false,
        error: 'That invitation has just been used up. Ask for a new one.',
      }
    }
  }
  await forgetInviteToken()

  /**
   * The free month, spent the moment there is an account to spend it on.
   *
   * Same placement and the same reasoning as the invite above: not conditional
   * on a session arriving. With email confirmation on there is no session here,
   * and a code that only counted once somebody opened their mail would leave
   * the account they created holding nothing - so the redemption runs against
   * the user id, through the service role, exactly as `redeemInvite` does.
   *
   * Gated on `isFreshAccount` for the reason that comment gives. Signing up
   * with an address that already has an account hands back an obfuscated user
   * whose id was never persisted; redeeming against it would burn a use of the
   * code on nobody, and the insert would fail on the foreign key anyway.
   *
   * A refusal is deliberately not reported. Every outcome this can produce -
   * a mistyped code, a code that ran out overnight - is a reason to say
   * something *about the code*, and there is nowhere to say it: the next thing
   * this function does is redirect, or ask them to check their email. Failing
   * the sign-up over it would be far worse, so the account is created either
   * way and the code can be entered again from the picker, which does have room
   * to explain itself.
   */
  const promoCode = await readPromoCode(asText(formData.get('code')))

  if (promoCode && data.user && isFreshAccount) {
    try {
      await redeemPromoCode(promoCode, data.user.id, {
        // `campaignSource`, not `campaignFrom`: the form posts the bare slug in
        // a hidden field, not a query string. Feeding a bare slug to the query
        // parser silently yields null, which is an attribution that quietly
        // stops working rather than one that fails.
        source: 'signup',
        campaign: campaignSource(asText(formData.get('src'))),
      })
    } catch {
      // A promo table that is unreachable must not be what stops somebody
      // creating an account.
    }
  }
  await forgetPromoCode()

  // With email confirmation enabled there is no session yet. Locally,
  // confirmation is off in supabase/config.toml, so sign-up logs you in.
  if (!data.session) {
    return { ok: true, message: repliesFrom(formData).confirmEmail }
  }

  revalidatePath('/', 'layout')
  // Straight into the wizard rather than the picker. A brand-new account is the
  // one case where "who are you" has never been asked, and landingPath() would
  // send them here on the very next navigation anyway - going directly saves a
  // redirect and a flash of a page they are about to be pulled off.
  redirect('/welcome')
}

function asText(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Magic link — passwordless.
 *
 * `signInWithOtp` creates the user on first use, so this doubles as sign-up for
 * anyone who would rather not have a password at all.
 */
export async function sendMagicLink(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' }
  }

  // Set now, used when the link is followed: the choice is made on this device
  // in this browser, and the cookie is still here when the mail is clicked.
  await rememberPersistence(formData)

  /**
   * The promo code goes into the jar for the same reason, and is spent in the
   * same place - /auth/confirm, which is where an account first exists on this
   * path. Nothing is redeemed here: `signInWithOtp` only sends a mail, and a
   * code burned at send time would be gone by the time somebody asked for a
   * second link because the first one got lost.
   */
  const promo = asText(formData.get('code'))
  if (promo) await rememberPromoCode(promo)

  const supabase = await createClient()
  const origin = env.appUrl()

  /**
   * `shouldCreateUser` *is* the gate on this path, and it is a neat fit: the
   * one flag separates "sign in" from "sign up" inside a single call. Turning
   * it off when the door is shut leaves every existing account able to sign in
   * by link - which matters, because a closed door must never lock out the
   * people already inside - while refusing to mint a new one.
   */
  const token = await readInviteToken(asText(formData.get('invite')))
  const mayCreate = await mayCreateByEmailLink(parsed.data, token)

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: mayCreate,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  })

  /**
   * An unknown address with creation refused comes back as an error, and that
   * error is an account-enumeration oracle: it fires for addresses without an
   * account and stays quiet for addresses with one. So it is swallowed, and
   * every caller gets the same sentence as before.
   *
   * Only that error. A genuine failure - the mailer being down - still reports
   * itself, because a silent "check your mail" for a mail that will never come
   * is the worst outcome available.
   */
  if (error) {
    const suppressed = !mayCreate && /signup|not allowed|disabled/i.test(error.message)
    if (!suppressed) return { ok: false, error: error.message }
  }

  // Same response whether or not the address has an account, so this cannot be
  // used to test which emails are registered.
  return {
    ok: true,
    message: repliesFrom(formData).magicSent.replace('{email}', parsed.data),
  }
}

/**
 * Start an OAuth sign-in.
 *
 * Runs on the server rather than in the browser because the PKCE flow stores a
 * code verifier in a cookie, and a Server Action is somewhere cookies can
 * actually be written. Doing this from a Client Component leaves the verifier
 * in browser storage, which is what makes /auth/callback fail with "invalid
 * request" on the round trip back.
 *
 * `signInWithOAuth` does not redirect - it hands back the provider URL and
 * expects the caller to send the browser there.
 */
async function startOAuth(
  provider: 'google' | 'apple',
  invite: string | null,
  promo: string | null,
): Promise<never> {
  /**
   * Stash the invite before leaving for the provider.
   *
   * It arrived as `/signup?invite=…` and the round trip through Google lands on
   * /auth/callback with a query string of the provider's choosing, so the only
   * way the token survives is a cookie. It has to be written *here* rather than
   * when the page rendered, because a Server Component cannot set one - the
   * response has already begun streaming by then. A Server Action can, which is
   * the same reason the OAuth start lives in one at all.
   */
  if (invite) await rememberInviteToken(invite)

  // The promo code makes the same trip for the same reason, and needs the same
  // treatment: /auth/callback sees the provider's query string, not this page's.
  // It is re-written here rather than relied upon from /code/[code] because the
  // person may have typed or edited it on the sign-up form since.
  if (promo) await rememberPromoCode(promo)

  const supabase = await createClient()

  // NEXT_PUBLIC_APP_URL, not the Origin header.
  //
  // The header is whatever the browser or a proxy put there, and a missing one
  // silently fell back to a hardcoded localhost - so production sent people to
  // their own machine after a successful Google sign-in. The configured app URL
  // is the one value that is definitionally correct for this deployment.
  const origin = env.appUrl()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  })

  if (error || !data?.url) {
    redirect(`/login?error=oauth_failed`)
  }

  redirect(data.url)
}

/**
 * Both take the form's own FormData, which is how the invite reaches them: the
 * buttons are plain forms, so the hidden field the signup page renders arrives
 * here without any client JavaScript having run.
 */
export async function signInWithGoogle(formData?: FormData): Promise<never> {
  await rememberPersistence(formData)
  return startOAuth(
    'google',
    asText(formData?.get('invite') ?? null),
    asText(formData?.get('code') ?? null),
  )
}

export async function signInWithApple(formData?: FormData): Promise<never> {
  await rememberPersistence(formData)
  return startOAuth(
    'apple',
    asText(formData?.get('invite') ?? null),
    asText(formData?.get('code') ?? null),
  )
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await forgetLastSpace()
  revalidatePath('/', 'layout')
  redirect('/login')
}
