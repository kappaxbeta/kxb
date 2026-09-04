import { type NextRequest, NextResponse } from 'next/server'
import { isLocale, landingHref, type Locale, localePath } from '@/app/i18n/locales'
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
 * Where it lands changed: it used to always be the landing page, which meant
 * picking Bulgarian while reading a chapter threw you back to the front door
 * and lost your place. It returns you to the page you were on now - see
 * `backTo` for how, and for why a header is safe to build a redirect from only
 * after it has been checked.
 *
 * Redirect targets come from NEXT_PUBLIC_APP_URL rather than the request
 * origin, for the reason /code/[code] and /auth/confirm both give: behind the
 * proxy Next will otherwise happily redirect somebody to 0.0.0.0:3000.
 */
/**
 * The public paths that exist in more than one language.
 *
 * Kept as a list because it is a fact about which routes exist, and the only
 * honest way to know that is to have written them down. It mirrors the
 * directories under `src/app/de`; adding a translated page means adding it
 * here, and forgetting to means the switch leaves somebody on the English one
 * rather than sending them to a 404 - the safe direction to be wrong in.
 */
const TRANSLATED = ['/community', '/contact', '/demo', '/events', '/login', '/signup', '/waitlist']

/**
 * Where to put somebody down after the switch: the page they were reading.
 *
 * From the `Referer`, which costs nothing and cannot be tampered with usefully
 * - this handler is reached by clicking a link, so the referring page *is* the
 * page they were on. The alternative was threading the current path through
 * every link as a query parameter, which means every caller has to remember to
 * do it and one that forgets is a silent regression.
 *
 * Validated rather than trusted, because a redirect built from a header is an
 * open redirect if you let it be one. Same origin or nothing: a `Referer` from
 * another site sends them to the front door instead. `URL` parsing does the
 * work, so `//evil.example` and `/\evil.example` are not paths that survive it
 * - both parse as a host, not as a path on ours.
 *
 * A missing `Referer` is normal - privacy settings strip it - and falls back to
 * the landing page, which is what this always did.
 */
export function backTo(referer: string | null, origins: string[], locale: Locale): string {
  if (!referer) return landingHref(locale)

  let here: URL
  try {
    here = new URL(referer)
  } catch {
    return landingHref(locale)
  }

  // Against *every* origin this app answers on, not just the configured one.
  //
  // The first version checked `env.appUrl()` alone and was broken everywhere
  // except production: in development that is `http://127.0.0.1:3000` while
  // the browser is on `http://localhost:3000`, which are different origins, so
  // every switch fell back to the landing page. The same would happen behind a
  // tunnel or on a LAN address - the two the dev config already has
  // `allowedDevOrigins` for.
  //
  // So the request's own origin counts too: it is where the browser actually
  // is, which is the thing the Referer will agree with.
  const allowed = new Set(
    origins.map((o) => {
      try {
        return new URL(o).origin
      } catch {
        return o
      }
    }),
  )
  if (!allowed.has(here.origin)) return landingHref(locale)

  // Never back to this handler: a `Referer` of `/lang/de` would bounce.
  if (here.pathname.startsWith('/lang/')) return landingHref(locale)

  // Strip whatever locale the path carries, then put the new one on. `/de` and
  // `/de/events` are the only shapes that carry one; everything else answers
  // from the cookie and passes through unchanged.
  const segments = here.pathname.split('/').filter(Boolean)
  const withoutLocale =
    segments.length > 0 && isLocale(segments[0]!) ? `/${segments.slice(1).join('/')}` : here.pathname

  // The front page goes through `landingHref`, not `localePath`. The two
  // disagree about Bulgarian on purpose: `/bg` is a real page, while
  // `localePath` maps bg to English because nothing *below* the front page is
  // published in it. Using the wrong one here drops a Bulgarian reader on the
  // English front page for choosing Bulgarian.
  if (withoutLocale === '/' || withoutLocale === '') return landingHref(locale)

  // Only the paths that actually have a translated route get a prefix.
  //
  // `localePath` prefixes any public path, and its own note says callers are
  // the ones that know whether a path is translated - this one did not, and
  // sent somebody switching to German on `/xo-universe` to `/de/xo-universe`,
  // which does not exist. A 404 for choosing your own language.
  //
  // Everything else stays where it is, and nothing is lost by that: the pages
  // below the front page read their language from the cookie, which this
  // handler has just written. `/xo-universe` *is* the German channel once
  // you have picked German.
  const translated = TRANSLATED.some(
    (root) => withoutLocale === root || withoutLocale.startsWith(`${root}/`),
  )
  const target = (translated ? localePath(locale, withoutLocale) : withoutLocale) + here.search

  // The last gate, and the one that matters. Everything above produced a path
  // rather than a URL, but a path beginning `//` is not a path once it is
  // resolved: `new URL('//evil.example', origin)` is `https://evil.example`,
  // which is the open redirect this whole function exists to avoid. A referer
  // of `https://kxb.team//evil.example` passes the origin check and arrives
  // here, so the check has to be on the way out rather than on the way in.
  return target.startsWith('//') ? landingHref(locale) : target
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const origin = env.appUrl()
  const { locale: raw } = await params

  // A locale this build does not speak is not an error worth a page: send them
  // to the front door in the language it already opens in, and write nothing.
  if (!isLocale(raw)) return NextResponse.redirect(new URL('/', origin))

  // Checked against both, built on `origin`. The check has to know where the
  // browser is; the redirect has to be built on the configured URL, for the
  // reason the note above gives about 0.0.0.0:3000 behind the proxy.
  const response = NextResponse.redirect(
    new URL(
      backTo(request.headers.get('referer'), [origin, request.nextUrl.origin], raw),
      origin,
    ),
  )

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
