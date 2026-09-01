import { AuthForm } from '@/app/(auth)/auth-form'
import { campaignSlug, campaignSource } from '@/domain/analytics/campaign'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { readLocale } from '@/app/i18n/preference'
import { readPromoCode } from '@/domain/promo/cookie'
import { listSignupOffers } from '@/domain/promo/offers'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign-up, which is only sometimes sign-up.
 *
 * When the door is shut this page still renders - it does not redirect to
 * /waitlist - because somebody arriving with an invite link needs the form, and
 * whether their token is any good is not a question this page can answer
 * cheaply or safely. So it renders the form either way and lets the actions
 * refuse, and it says up front what will happen, which is the part a visitor
 * actually needs.
 *
 * The invite token is read here and handed to the form as a hidden field rather
 * than being written to a cookie: a Server Component cannot set one. The OAuth
 * action does that on its way out - see startOAuth.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string; code?: string; src?: string }>
}) {
  const { invite, error, code, src } = await searchParams

  const supabase = await createClient()
  const [open, offers] = await Promise.all([
    isRegistrationOpen(supabase),
    /**
     * What is going, read off the codes an operator named `SIGNUP…`.
     *
     * Loaded here rather than fetched by the form, so it is on the page for
     * somebody with no JavaScript and cannot flash in a moment after the fields
     * have already been read. See `listSignupOffers` for why the prefix is the
     * switch.
     */
    listSignupOffers(),
  ])

  /**
   * The code from the URL, or the one /code/[code] left in the cookie.
   *
   * Read here rather than in the form so that arriving by either route looks
   * identical: `/code/CAFE24` redirects here with the code in the query string
   * *and* in a cookie, and a visitor who then reloads without the query string
   * - or comes back tomorrow - still sees the field filled in.
   *
   * `readPromoCode` normalises, so a hand-edited cookie cannot put an
   * unvalidated string into the field's value.
   */
  const promo = await readPromoCode(code)

  /**
   * The best published offer, if nothing else was in hand.
   *
   * Applied on the server rather than by a click, which is the difference
   * between an offer that works and one that only works with scripting - and
   * `AuthForm` shows the strip marked as applied, so nothing is redeemed
   * invisibly. A code that arrived on a link or in the cookie always wins: they
   * were handed that one specifically, and quietly swapping it for ours is
   * exactly the failure the visible field exists to prevent.
   */
  const applied = promo ?? offers[0]?.code ?? null

  return (
    <AuthForm
      mode="signup"
      errorCode={error}
      registrationOpen={open}
      invite={invite ?? null}
      code={applied}
      offers={offers}
      src={campaignSlug(campaignSource(src ?? null))}
      // Same rule as `/login`: no locale in the path means the reader's own.
      locale={await readLocale()}
    />
  )
}
