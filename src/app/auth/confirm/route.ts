import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { recordEmailVerified } from '@/domain/profile/email-verification'
import { forgetPromoCode, readPromoCode } from '@/domain/promo/cookie'
import { redeemPromoCode } from '@/domain/promo/redeem'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

/**
 * Where the magic link lands.
 *
 * The email carries a `token_hash` rather than a ready-made confirmation URL,
 * so the exchange happens here, in our own request context. That matters:
 * `verifyOtp` sets the session cookies through the server client, which is what
 * makes the session visible to Server Components on the very next request.
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

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Only allow relative paths - an absolute `next` would turn this route into
  // an open redirect.
  // See the note in the OAuth callback: the root resolves "which space", the
  // picker is only the fallback.
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    /**
     * Expired, already used, or tampered with - except for the one case that
     * is none of those and is the ordinary outcome of a working email change.
     *
     * A change sends two mails, one to the old address and one to the new, and
     * on this deployment opening *either* completes it: the second token is
     * dead from that moment. That was measured against the running GoTrue
     * rather than assumed, in both orders, and it happens despite
     * `double_confirm_changes` being on.
     *
     * So somebody who does the obvious thing - opens both messages, because
     * two arrived - gets bounced to an error page telling them their link is
     * broken, seconds after it worked. Which is a lie, and an alarming one on
     * a page about their account's address.
     *
     * The test below is deliberately not "assume it worked". A dead
     * `email_change` token means the change is settled only if there is no
     * longer a change waiting: `new_email` is empty once GoTrue has applied it.
     * If it is still set, the link really did expire with the move unfinished,
     * and the error is the honest answer.
     */
    if (type === 'email_change') {
      const {
        data: { user: signedIn },
      } = await supabase.auth.getUser()

      const stillPending = (signedIn as { new_email?: unknown } | null)?.new_email

      if (signedIn && !stillPending) {
        return NextResponse.redirect(new URL('/?email=changed', origin))
      }
    }

    return NextResponse.redirect(new URL('/login?error=expired_link', origin))
  }

  /**
   * The free month, for somebody who signed up by magic link.
   *
   * This is the point on that path where an account first exists - the mail
   * that got them here was sent before there was anyone to grant a month to -
   * so the code has been waiting in a cookie since /code/[code] or the sign-up
   * form put it there.
   *
   * Only for an account this verification just created. A returning member
   * signing in by link with a stale cookie still in the jar would otherwise
   * spend a use of a code that is being counted for a campaign; the database
   * would refuse the grant, but the count is the thing being protected here.
   * `looksNewlyCreated` is the same test /auth/callback uses, for the same
   * reason and with the same tolerance.
   */
  const user = data.user

  /**
   * The address is proven, whatever kind of link this was.
   *
   * This route is the one place in the app where somebody has just demonstrated
   * that they read a particular inbox - a token we mailed there came back and
   * verified. That is true of a magic link, of an accepted invite and of a
   * confirmed email change alike, so the record is written here rather than
   * once per link type.
   *
   * `user.email` and not the address the link was *sent* to. On an email change
   * those differ until the last confirmation lands, and `verifyOtp` has already
   * moved the account by the time it returns - so this reads the address the
   * account now has, which is the one the banner will be comparing against.
   */
  if (user) {
    await recordEmailVerified(user.id, user.email)
  }

  if (user && looksNewlyCreated(user.created_at, user.last_sign_in_at ?? null)) {
    const promo = await readPromoCode()

    if (promo) {
      try {
        await redeemPromoCode(promo, user.id, { source: 'signup' })
      } catch {
        // A confirmed sign-in is never worth failing over a promo table.
      }
    }
  }
  await forgetPromoCode()

  return NextResponse.redirect(new URL(next, origin))
}

/**
 * Was this account made by the verification that just ran?
 *
 * The same shape, and the same five-second tolerance, as the copy in
 * /auth/callback - see the reasoning there. Duplicated rather than shared
 * because the two routes are deliberately independent of each other, and a
 * helper in a third module would be a shared dependency between two exchanges
 * that have no other reason to know one another exists.
 */
function looksNewlyCreated(createdAt: string, lastSignInAt: string | null): boolean {
  if (!lastSignInAt) return true

  const gap = new Date(lastSignInAt).getTime() - new Date(createdAt).getTime()
  return Math.abs(gap) < 5_000
}
