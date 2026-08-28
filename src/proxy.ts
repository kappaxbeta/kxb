import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { closeEndedVisit, GUEST_LEFT_PATH } from '@/domain/guests/session'
import { isLocale } from '@/domain/i18n/locale'
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookie'
import { countRequest } from '@/domain/health/counters'
import {
  forSession,
  KEEP_SIGNED_IN_COOKIE,
  keepsSignedIn,
} from '@/lib/auth-persistence'
import {
  LAST_SPACE_COOKIE,
  LAST_SPACE_MAX_AGE,
  spaceSlugFromPath,
} from '@/lib/last-space'

/**
 * Refreshes the Supabase session on every request.
 *
 * Server Components cannot set cookies, so without this the access token would
 * expire and never rotate. `getUser()` here triggers the refresh and writes the
 * new cookies onto the outgoing response.
 *
 * This is the `proxy` file convention, which replaced `middleware` in
 * Next.js 16 - same behaviour, new name.
 */
export async function proxy(request: NextRequest) {
  /**
   * Counted here because this is the only layer every app request passes
   * through, and counted *first* so a request that later redirects or throws is
   * still a request that arrived.
   *
   * The matcher below is what makes this number meaningful: static assets,
   * images and the HMR socket never reach here, so it counts app requests
   * rather than file fetches. It is not Caddy's request count and the health
   * page says as much. See counters.ts for why the state lives on globalThis.
   */
  countRequest()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })

          /**
           * "Keep me signed in", applied on the way out.
           *
           * Here rather than at sign-in, because the refresh below *rewrites*
           * these cookies on nearly every request - a lifetime set once at the
           * door would be handed straight back by the first rotation. This is
           * the one place every auth cookie in the app passes through.
           */
          const keep = keepsSignedIn(request.cookies.get(KEEP_SIGNED_IN_COOKIE)?.value)

          for (const { name, value, options } of cookiesToSet) {
            /**
             * A removal is not a lifetime choice, and must not be treated as
             * one. `@supabase/ssr` clears a cookie by writing it empty with
             * `maxAge: 0`; `forSession` strips exactly that field, which would
             * turn a sign-out into an empty cookie the browser keeps until the
             * window closes. The library then still finds a chunk with the
             * right name on the next request. Signing out has to actually take
             * the cookie away - see `closeEndedVisit`, which depends on it.
             */
            const lifetime =
              value === '' ? options : keep ? options : forSession(options)
            response.cookies.set(name, value, lifetime)
          }
        },
      },
    },
  )

  // Do not remove this call, and do not put logic between it and the return -
  // it is what actually performs the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  /**
   * The language on the account, brought into the browser that has never asked.
   *
   * `locales.ts` says this layer is "the last place worth adding a second
   * concern to", and that stands - which is why this is the *only* other thing
   * in here, and why it is shaped to disappear. It runs when there is a signed-
   * in account and no `unkown_locale` cookie, which is once per browser, and it
   * writes the cookie so that every `readLocale()` after it is a cookie read
   * with no database in it.
   *
   * It has to be here for the same reason `closeEndedVisit` above does: this is
   * the one layer that can both see a session and write a cookie. A render can
   * do neither half - it may read a cookie but not set one - so the alternative
   * was for every server page inside a space to make its own profile query and
   * for the ones that forgot to quietly disagree with the layout.
   *
   * A guest is skipped: an anonymous session has no profile row, so the query
   * would be a round trip to learn nothing. Anybody with no preference stored
   * is skipped too - by getting null back and writing nothing, which leaves
   * `Accept-Language` as the answer it already was.
   */
  if (user && !user.is_anonymous && !request.cookies.has(LOCALE_COOKIE)) {
    const { data } = await supabase
      .from('profile_locales')
      .select('locale')
      .eq('user_id', user.id)
      .maybeSingle()

    const chosen = data?.locale
    if (chosen && isLocale(chosen)) {
      response.cookies.set(LOCALE_COOKIE, chosen, {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: LOCALE_MAX_AGE,
      })
    }
  }

  /**
   * The goodbye page is where a visit actually ends.
   *
   * This is the one layer that can both see a session and take it away - a
   * Server Component cannot write a cookie, which is why the page itself could
   * never do this and why the loop survived so long. Everything upstream of
   * here only ever *redirected* a lapsed guest to `/g/left`, and every door out
   * of that page leads back through `/` or `/signup`, both of which send an
   * anonymous session straight back to it. The browser could not reach the
   * product at all.
   *
   * So the session is closed on the way in, and the page renders for somebody
   * who is signed out. `closeEndedVisit` refuses to touch a session that is
   * still a visit somewhere else, which is the case `?from=` exists for.
   *
   * Returning here rather than falling through: none of the branches below
   * apply to this path, and all of them read the `user` that has just stopped
   * being true.
   */
  if (user?.is_anonymous && pathname === GUEST_LEFT_PATH) {
    await closeEndedVisit(supabase, user)
    return response
  }

  // Signed-out users are bounced off anything behind a login. This is an
  // optimistic check only - it knows whether there is a session, not whether
  // that session belongs to the workspace in the URL. Membership is settled by
  // requireTenant() in the page and again in every Server Action, because a
  // proxy cannot be the authorization boundary for requests that never pass
  // through it.
  const isProtected =
    pathname.startsWith('/t/') ||
    pathname.startsWith('/tenants') ||
    pathname.startsWith('/invitations') ||
    pathname.startsWith('/welcome')

  if (pathname === '/v' ) {
    return response
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    /**
     * A space has an outside, and a stranger should land on it rather than on
     * a login form.
     *
     * An event's slug is printed on badges and pasted into Discords, and the
     * person who follows it has no account and is not being asked to get one -
     * they are being asked to pick a name and walk in. `/e/[slug]` is that
     * page; see the note at the top of it.
     *
     * Sent here without checking whether the slug *is* an event, because this
     * layer must not be a database query on the way to a redirect. The door
     * page does the check it is already loading the row for, and sends anybody
     * who is not standing outside an event on to `/login` - so a signed-out
     * member of an ordinary workspace ends up exactly where they do today, one
     * hop later.
     */
    const slug = spaceSlugFromPath(pathname)
    url.pathname = slug ? `/e/${slug}` : '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  /**
   * A guest asking for the sign-up form is asking to stop being a guest.
   *
   * An anonymous session is not an account, and the block below - which sends
   * any signed-in user off `/signup` to `/` - is right for a real account and a
   * trap for a guest: `/` sends an anonymous session with no space back out, so
   * they could click "create your own space" and never once reach the form. So
   * sign the anonymous session out on the way in, here in the one layer that can
   * write a cookie, and let `/signup` render for a signed-out visitor. This is
   * the same move made for `/g/left` above, for the same reason.
   *
   * Unconditional, unlike `closeEndedVisit`: a guest may still hold a live
   * admission somewhere, but clicking through to sign up is a decision to leave
   * it, and letting the anonymous session survive would make GoTrue *link* the
   * new email onto the guest account rather than mint a fresh one. The orphaned
   * anonymous row is litter once signed out - nothing can return to it - and the
   * reaper collects it.
   */
  if (user?.is_anonymous && pathname === '/signup') {
    await supabase.auth.signOut()
    return response
  }

  // Already signed in and asking for a sign-in form: send them to the root,
  // which is the one place that works out where "in" means for them. Sending
  // them straight to the picker here would be a guess this layer cannot check -
  // the proxy knows there is a session, not which workspaces it belongs to.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  /**
   * Remember the workspace being opened.
   *
   * Written here rather than in the page because a Server Component cannot set
   * a cookie, and this is the one layer every `/t/…` request already passes
   * through. It is written optimistically - the proxy has not proved membership
   * and does not try to - so the value is treated as a hint and checked again
   * before it is ever acted on.
   */
  // Re-written on every visit rather than only when it changes, so that the
  // expiry slides forward for somebody who lives in one workspace and would
  // otherwise be shown the picker one day for no reason they could name.
  const slug = user ? spaceSlugFromPath(pathname) : null
  if (slug) {
    response.cookies.set(LAST_SPACE_COOKIE, slug, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: LAST_SPACE_MAX_AGE,
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images and the dev server's own
     * hot-reload socket - none of those need a session refresh and running
     * middleware on them is pure latency.
     *
     * `_next/webpack-hmr` is excluded for a sharper reason than latency. It is
     * a WebSocket upgrade, and this proxy awaits `getUser()` - a network call
     * to the auth server - before returning. When Supabase is slow or down,
     * that call hangs, the upgrade never completes, and the browser reports
     * `ERR_INVALID_HTTP_RESPONSE` against a URL with nothing to do with
     * Supabase. The database being unreachable should look like the database
     * being unreachable, not like the dev server being broken.
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
