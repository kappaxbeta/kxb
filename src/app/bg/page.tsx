import type { Metadata } from 'next'
import { BG } from '@/app/i18n/landing'
import { landingAlternates } from '@/app/i18n/locales'
import { Landing, landingTerms } from '@/app/landing'

/**
 * The front page in Bulgarian.
 *
 * A folder, for the reason `/de` gives at length next door - and this is the
 * third file it said the cost of a third locale would be.
 *
 * What makes this one different from `/de` is what is *not* beside it. German
 * has `/de/events`, `/de/contact`, `/de/signup` and the rest; Bulgarian has
 * this page and nothing else, because the pages under it are enquiry forms and
 * German-law documents rather than the thing a shared link opens onto. That is
 * a deliberate stopping point rather than a half-finished one: `localePath`
 * sends a reader here through to the English forms, so every link on this page
 * lands on a page that exists.
 */
export const metadata: Metadata = {
  title: BG.meta.title,
  description: BG.meta.description,
  alternates: landingAlternates('bg'),
}

export default async function HomeBg() {
  return <Landing {...(await landingTerms())} dict={BG} locale="bg" />
}
