import { type NextRequest, NextResponse } from 'next/server'
import { campaignFrom } from '@/domain/analytics/campaign'
import { normaliseCode } from '@/domain/promo/application'
import { rememberPromoCode } from '@/domain/promo/cookie'
import { redeemPromoCode } from '@/domain/promo/redeem'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

/**
 * kxb.team/code/CAFE24 - the link that goes on the poster.
 *
 * One URL that works for both of the people who will follow it, which is the
 * only thing that makes it printable. Somebody who has never heard of us and
 * somebody already signed in read the same six characters off the same flyer,
 * and neither of them should have to know which branch they are on.
 *
 *   signed out - the code is remembered and they land on sign-up with it
 *                already filled in, visible, and theirs to change
 *   signed in  - the month is granted on the spot and they land on the picker
 *                being told so
 *
 * A route handler rather than a page because both branches end in a redirect
 * and the signed-out one has to set a cookie on the way past - which a Server
 * Component cannot do, the response having already begun. The same constraint
 * that put the OAuth start in a Server Action puts this here.
 *
 * Redirect targets come from NEXT_PUBLIC_APP_URL rather than the request
 * origin, for the reason spelled out in /auth/confirm: behind the proxy Next
 * will otherwise happily redirect somebody to 0.0.0.0:3000.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const origin = env.appUrl()
  const { code: raw } = await params

  const code = normaliseCode(decodeURIComponent(raw))

  // A URL that cannot hold a code goes to the front page rather than to an
  // error. Somebody mistyping a poster URL is not looking at a diagnostic.
  if (!code) return NextResponse.redirect(new URL('/', origin))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  /**
   * A guest is signed in, and is not somebody a month can be granted to.
   *
   * `is_anonymous` is the definition the rest of the app uses, and skipping it
   * here would spend a code against a session that is going to be thrown away
   * when they close the tab - and, worse, would burn the one redemption their
   * eventual real account was entitled to.
   */
  const isMember = user && !user.is_anonymous && user.email

  if (!isMember) {
    await rememberPromoCode(code)

    // The code is in the query string as well as in the cookie. Belt and
    // braces, and the visible half: the sign-up form shows what it is about to
    // apply rather than applying something invisible.
    const next = new URL('/signup', origin)
    next.searchParams.set('code', code)

    // Carried forward so the tag survives the redirect and is still readable
    // when the redemption finally happens on the far side of sign-up.
    const src = request.nextUrl.searchParams.get('src')
    if (src) next.searchParams.set('src', src)

    return NextResponse.redirect(next)
  }

  const result = await redeemPromoCode(code, user.id, {
    source: 'link',
    campaign: campaignFrom(request.nextUrl.search),
  })

  /**
   * The outcome travels as a parameter, not as a flash message.
   *
   * A redirect out of a route handler has nowhere to put state, and the picker
   * has to be able to render the answer on a cold load - including for somebody
   * who followed this link twice. The outcome word maps to a sentence there,
   * from the same table the forms use.
   */
  const back = new URL('/tenants', origin)
  back.searchParams.set('promo', result.ok ? 'ok' : result.outcome)

  return NextResponse.redirect(back)
}
