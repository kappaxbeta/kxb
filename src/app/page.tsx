import type { Metadata } from 'next'
import { EN } from '@/app/i18n/landing'
import { landingAlternates } from '@/app/i18n/locales'
import { Landing, landingTerms } from '@/app/landing'

/**
 * The front page says what it is, rather than what it is called.
 *
 * The root layout's title is the product name, which is the right default for
 * every page inside a workspace - a tab reading "Pages" wants the app's name
 * next to it. This page is the one that gets *shared*, and an unfurl reading
 * "Virtual Team Lobby App" is a category, not an invitation. The headline
 * is the sentence that actually explains the thing, so it is the title.
 *
 * "Room" rather than "team space", and that is the whole repositioning. A team
 * space is judged on whether anybody opens it on day thirty, which is the
 * metric that closed every product in this category. A room is judged on the
 * time somebody was actually in it - an afternoon, a Tuesday night, ten
 * minutes at 3am - and is not expected to be moved into.
 *
 * Deliberately not "venue", which was the first draft of this. Venue is the
 * right word for a jam with two hundred people and the wrong one for two night
 * porters kicking a ball about on their break, and the second group is not a
 * rounding error on the first - see AUDIENCES in `landing.tsx`.
 *
 * English is unprefixed and this is it. `/de` is the same page in German; the
 * words for both live in `@/app/i18n/landing`.
 */
export const metadata: Metadata = {
  title: EN.meta.title,
  description: EN.meta.description,
  alternates: landingAlternates('en'),
}

export default async function Home() {
  return <Landing {...(await landingTerms())} dict={EN} locale="en" />
}
