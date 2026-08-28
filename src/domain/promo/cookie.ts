import 'server-only'
import { cookies } from 'next/headers'
import { normaliseCode } from '@/domain/promo/application'

/**
 * Where a code waits between arriving and being spendable.
 *
 * The gap it bridges is the whole reason /code/[code] exists. Somebody follows
 * a link off a poster, and at that moment there is no account to grant anything
 * to. They then go through sign-up, possibly via Google - which throws the
 * browser to another origin and back to /auth/callback with a query string of
 * the provider's choosing - and only at the far end of that is there a user id.
 * A cookie is the only thing that survives the trip.
 *
 * Deliberately not httpOnly, unlike the invite cookie next door. That one is a
 * capability worth hiding from page scripts; this one is a promo code that was
 * printed on a poster and is already in the URL bar. What it is is a *hint*, and
 * the sign-up form reads it to prefill a visible field so the person can see -
 * and change - which code is about to be applied. A code nobody can see applied
 * itself is the thing to avoid here, not a code somebody's own JavaScript can
 * read.
 */
export const PROMO_COOKIE = 'unkown_promo'

/**
 * Long enough to survive making a coffee and reading the terms, short enough
 * that a code found in a browser weeks later does not turn up unannounced on a
 * different person's sign-up. The invite cookie's 30 minutes is too tight for
 * this: an invite is followed on purpose, a poster is a thing you photograph
 * and get to later.
 */
const PROMO_COOKIE_MAX_AGE = 24 * 60 * 60

/** Remember a code across sign-up, including an OAuth round trip. */
export async function rememberPromoCode(raw: string): Promise<void> {
  const code = normaliseCode(raw)
  if (!code) return

  const jar = await cookies()
  jar.set(PROMO_COOKIE, code, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PROMO_COOKIE_MAX_AGE,
  })
}

/**
 * The code from this request if it carries one, else whatever the cookie kept.
 *
 * Normalised on the way out as well as on the way in, so a cookie set by an
 * older build - or edited by hand, since this one is not httpOnly - cannot put
 * an unvalidated string in front of the redemption path.
 */
export async function readPromoCode(fromUrl?: string | null): Promise<string | null> {
  const fromRequest = normaliseCode(fromUrl)
  if (fromRequest) return fromRequest

  const jar = await cookies()
  return normaliseCode(jar.get(PROMO_COOKIE)?.value ?? null)
}

export async function forgetPromoCode(): Promise<void> {
  const jar = await cookies()
  jar.delete(PROMO_COOKIE)
}
