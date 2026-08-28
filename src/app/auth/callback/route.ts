import { type NextRequest, NextResponse } from 'next/server'
import {
  discardUninvitedAccount,
  forgetInviteToken,
  mayRegister,
  readInviteToken,
  redeemInvite,
} from '@/domain/access/gate'
import { campaignFrom } from '@/domain/analytics/campaign'
import { forgetPromoCode, readPromoCode } from '@/domain/promo/cookie'
import { redeemPromoCode } from '@/domain/promo/redeem'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

/**
 * Where OAuth lands.
 *
 * Separate from /auth/confirm on purpose - they are different exchanges, not
 * two flavours of one. A magic link carries a `token_hash` that `verifyOtp`
 * redeems; OAuth carries a short-lived `code` that `exchangeCodeForSession`
 * trades for a session, using a PKCE verifier stored in a cookie when the
 * sign-in started. Feeding one to the other's method fails in ways that read
 * like a misconfigured provider.
 *
 * Note Apple's `form_post` response mode never reaches this route. Apple POSTs
 * to Supabase's own callback; Supabase then redirects here with `?code=`. So a
 * GET handler is the whole story on our side.
 *
 * Redirect targets are built from NEXT_PUBLIC_APP_URL, not request.nextUrl.origin.
 *
 * Behind Caddy the app is a standalone Next server bound to 0.0.0.0:3000, and
 * when Next cannot derive an origin from the proxied request it falls back to
 * that bind address - producing redirects to `https://0.0.0.0:3000/...`, which
 * is not a place a browser can go. The configured app URL is the only value
 * that is definitionally right for the deployment, and it is already the source
 * of truth for Stripe's return URLs and the OAuth start.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origin = env.appUrl()

  // The provider reports refusals here too - someone closing Apple's dialog
  // arrives with `error=access_denied` and no code. That is a normal outcome,
  // not a failure worth showing a stack trace for.
  const providerError = searchParams.get('error')
  if (providerError) {
    const reason = providerError === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin))
  }

  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
  }

  // Only relative paths, or this route becomes an open redirect that a
  // phishing link can point anywhere.
  // The default is the root, not the picker: it is the page that knows how to
  // send somebody back to the space they were last in, and it falls through to
  // the picker when there is no such space.
  const requested = searchParams.get('next') ?? '/'
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Expired code, replayed code, or a PKCE verifier that never arrived -
    // typically because sign-in started in a different browser or the cookie
    // was blocked.
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
  }

  /**
   * The closed door, enforced after the fact.
   *
   * This is the one sign-up path where the account exists before we get a say.
   * Supabase creates the user during the exchange above, so "may this person
   * register" cannot be asked first the way it is on the password and
   * magic-link paths - by the time the question is askable, the answer has
   * already been acted on.
   *
   * So a refusal here has to undo something, and `discardUninvitedAccount`
   * carries the fences that make that safe: it deletes only an account that
   * owns nothing and was made seconds ago, and refuses in every other case. A
   * returning member is never at risk from it, which is the property that
   * matters when the trigger is an automated flag lookup.
   *
   * Signing out happens either way. An account we would not have created must
   * not be left holding a live session just because the deletion was declined.
   */
  const user = data.user
  const isNewAccount = user
    ? looksNewlyCreated(user.created_at, user.last_sign_in_at ?? null)
    : false

  if (user && isNewAccount) {
    const token = await readInviteToken(searchParams.get('invite'))
    const admission = await mayRegister(user.email ?? '', token)

    if (!admission.ok) {
      await supabase.auth.signOut()
      await discardUninvitedAccount(user.id)
      await forgetInviteToken()

      // The address is carried over so the waiting-list form is already filled
      // in. Somebody who just clicked through Google should not then have to
      // remember which of their addresses it used.
      const waitlist = new URL('/waitlist', origin)
      if (user.email) waitlist.searchParams.set('email', user.email)
      waitlist.searchParams.set('reason', admission.waitlist ? 'closed' : 'invite')
      return NextResponse.redirect(waitlist)
    }

    if (admission.inviteId) {
      const redeemed = await redeemInvite(admission.inviteId, user.id)

      // Lost the race for the last use. The account was created by the exchange
      // above and the invite that would have justified it is gone, so this is
      // the same situation as a refusal and gets the same undo - the fences on
      // the deletion are what make that safe.
      if (!redeemed && admission.required) {
        await supabase.auth.signOut()
        await discardUninvitedAccount(user.id)
        await forgetInviteToken()

        const waitlist = new URL('/waitlist', origin)
        if (user.email) waitlist.searchParams.set('email', user.email)
        waitlist.searchParams.set('reason', 'invite')
        return NextResponse.redirect(waitlist)
      }
    }
  }

  await forgetInviteToken()

  /**
   * The free month, for somebody who arrived on a code and signed in with
   * Google rather than filling in the form.
   *
   * Only for an account this exchange just created. `redeem_promo_code` would
   * refuse a returning member anyway - they have had their one redemption, or
   * they have a Stripe history - but relying on that would mean a member coming
   * back a month later, with a stale cookie still in the jar, silently spending
   * a use of a code that is being counted for a campaign. The measurement is
   * the point, so the guard is here rather than only in the database.
   *
   * Nothing is said about the outcome, and the redirect is untouched. There is
   * no room to say it: `next` is usually the root, which resolves to whichever
   * space or wizard this person belongs in, and hijacking that to deliver a
   * message would send a brand-new account past the onboarding it was heading
   * for. The grant shows up where it is relevant - the picker and the billing
   * page both name it - which is a better place for it than a banner on a page
   * about something else.
   */
  if (user && isNewAccount) {
    const promo = await readPromoCode(searchParams.get('code'))

    if (promo) {
      try {
        await redeemPromoCode(promo, user.id, {
          source: 'signup',
          campaign: campaignFrom(request.nextUrl.search),
        })
      } catch {
        // Never worth failing a completed sign-in over.
      }
    }
  }
  await forgetPromoCode()

  return NextResponse.redirect(new URL(next, origin))
}

/**
 * Was this account made by the exchange that just ran?
 *
 * Supabase stamps `created_at` and `last_sign_in_at` within the same instant on
 * a first-ever sign-in, and they diverge from then on. Comparing them is what
 * separates "somebody new just arrived" from "a member came back", and the
 * five-second window absorbs the clock skew between the auth server and here
 * without being wide enough to catch a returning session.
 *
 * Being wrong in the false direction is cheap - a new account is let in when
 * the door was shut, and an admin can remove it. Being wrong in the true
 * direction would aim a deletion at a real member, which is why this is
 * deliberately conservative and why the deletion re-checks the age itself.
 */
function looksNewlyCreated(createdAt: string, lastSignInAt: string | null): boolean {
  if (!lastSignInAt) return true

  const gap = new Date(lastSignInAt).getTime() - new Date(createdAt).getTime()
  return Math.abs(gap) < 5_000
}
