import { notFound } from 'next/navigation'
import { ContestDocument } from '@/app/gewinnspiel/document'
import { contestMetadata } from '@/app/gewinnspiel/metadata'
import { CONTEST_TRANSLATIONS, type ContestLocale } from '@/app/gewinnspiel/locales'

/**
 * The four translations: `/gewinnspiel/en`, `/gewinnspiel/fr`… you know the rest.
 *
 * One dynamic segment rather than four folders, because four folders is four
 * copies of the same six lines and the fifth language would be a fifth. What
 * keeps it honest is the `notFound()` below: `/gewinnspiel/it` is a 404 rather
 * than a crash, and the list of what is not a 404 lives in `locales.ts` with
 * the prose, not in a routing table beside it.
 *
 * There was a `generateStaticParams` here doing that job as well, by prerender-
 * ing exactly these four. It went with the same change that put `force-dynamic`
 * on the page - under per-request rendering it is ignored, and an export Next
 * no longer calls is worse than no export at all, because the next reader
 * believes it. The reasoning for rendering per request is at the bare path, in
 * `../page.tsx`; the short version is that the build cannot read the row these
 * documents are made of.
 *
 * German is deliberately not in the list. It lives one level up at the bare
 * path, and answering here as well would put the binding document at two URLs
 * with two canonicals pointing in a circle.
 */
export const dynamic = 'force-dynamic'

/**
 * Everything unknown 404s here rather than in the page body, so `params` is
 * narrowed once and both exports can trust it.
 */
function asLocale(lang: string): ContestLocale {
  if (!(CONTEST_TRANSLATIONS as readonly string[]).includes(lang)) notFound()
  return lang as ContestLocale
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return contestMetadata(asLocale((await params).lang))
}

export default async function ContestTranslationPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  return <ContestDocument locale={asLocale((await params).lang)} />
}
