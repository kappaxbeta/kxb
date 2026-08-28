import { AuthForm } from '@/app/(auth)/auth-form'
import { campaignSlug, campaignSource } from '@/domain/analytics/campaign'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { readLocale } from '@/app/i18n/preference'
import { readPromoCode } from '@/domain/promo/cookie'
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
  const open = await isRegistrationOpen(supabase)

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

  return (
    <AuthForm
      mode="signup"
      errorCode={error}
      registrationOpen={open}
      invite={invite ?? null}
      code={promo}
      src={campaignSlug(campaignSource(src ?? null))}
      // Same rule as `/login`: no locale in the path means the reader's own.
      locale={await readLocale()}
    />
  )
}
