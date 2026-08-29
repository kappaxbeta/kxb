import { type NextRequest, NextResponse } from 'next/server'
import { isLocale, landingHref } from '@/app/i18n/locales'
import { env } from '@/lib/env'
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookie'

/**
 * The header's language switch, as a door that remembers.
 *
 * ---------------------------------------------------------------------------
 * Why the links do not simply point at the page
 * ---------------------------------------------------------------------------
 * They used to, and the switch was documented as deliberately stateless: it set
 * no cookie, because a remembered locale is what makes a shared URL open in the
 * wrong language for the person it was shared with.
 *
 * That argument is about *reading* the cookie, and it still holds - nothing
 * here or anywhere else redirects a visitor on the strength of a past choice,
 * so `/de` is German for everybody who opens it, forever. What it never
 * justified was declining to *write* one. The landing pages carry their locale
 * in the path and the pages under them do not: `/browse`, every `/xp`, and the
 * whole app behind the login answer from the cookie. So somebody could pick
 * Bulgarian in the header, read a Bulgarian front page, click Browse and be
 * handed English - having told us, in the most explicit way the page offers,
 * which language they read.
 *
 * A hop is the price of writing it, and this is the one place that hop is free.
 * The objection to a redirect was always about `/` - the URL that gets pasted
 * into a Discord - and nothing is pasting `/lang/bg`. It is reached by pressing
 * a control, which is exactly the moment somebody is willing to wait for a
 * page.
 *
 * ---------------------------------------------------------------------------
 * A click, not a visit
 * ---------------------------------------------------------------------------
 * This is also why the proxy does not do the same job by watching for `/de` and
 * `/bg`. Landing on a shared German link is a weak signal about what somebody
 * reads - they followed a link a colleague sent - and letting it rewrite the
 * language their app is in would mean a Bulgarian reader losing their setting
 * to somebody else's link. Pressing DE is a strong one. Only the strong signal
 * is written down.
 *
 * Redirect targets come from NEXT_PUBLIC_APP_URL rather than the request
 * origin, for the reason /code/[code] and /auth/confirm both give: behind the
 * proxy Next will otherwise happily redirect somebody to 0.0.0.0:3000.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const origin = env.appUrl()
  const { locale: raw } = await params

  // A locale this build does not speak is not an error worth a page: send them
  // to the front door in the language it already opens in, and write nothing.
  if (!isLocale(raw)) return NextResponse.redirect(new URL('/', origin))

  const response = NextResponse.redirect(new URL(landingHref(raw), origin))

  // Same shape as `writeLocale` and as the proxy's profile read - one cookie,
  // written in three places and spelled the same way in all of them. Not
  // httpOnly on purpose: client components read it to render the same words the
  // server just did. See the note in `@/app/i18n/preference`.
  response.cookies.set(LOCALE_COOKIE, raw, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCALE_MAX_AGE,
  })

  return response
}
