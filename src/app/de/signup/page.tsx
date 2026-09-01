import { AuthForm } from '@/app/(auth)/auth-form'
import { campaignSlug, campaignSource } from '@/domain/analytics/campaign'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { readPromoCode } from '@/domain/promo/cookie'
import { listSignupOffers } from '@/domain/promo/offers'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  alternates: { canonical: '/de/signup', languages: { en: '/signup', de: '/de/signup' } },
}

/** See the English page: the form renders whether or not the door is open. */
export default async function SignUpPageDe({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string; code?: string; src?: string }>
}) {
  const { invite, error, code, src } = await searchParams

  const supabase = await createClient()
  const [open, offers] = await Promise.all([
    isRegistrationOpen(supabase),
    // Codes are language-neutral; only the sentence around them is translated.
    listSignupOffers(),
  ])

  // The cookie is language-neutral, so a code picked up at /code/CAFE24 is
  // still here for somebody who then switched to the German page.
  const promo = await readPromoCode(code)

  // See the English page: a code in hand always beats the published offer.
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
      locale="de"
    />
  )
}
