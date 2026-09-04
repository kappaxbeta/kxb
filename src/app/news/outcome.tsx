import Link from 'next/link'
import { MarketingShell } from '@/app/components/marketing-shell'
import { SIGNUP_COPY } from '@/domain/news-signup/consent'
import type { TokenOutcome } from '@/domain/news-signup/tokens'
import { readLocale } from '@/app/i18n/preference'

/**
 * The page somebody lands on after pressing a link in a mail.
 *
 * One component for both endings, because they are the same page with a
 * different sentence, and because the *unknown* case has to look exactly like
 * the other two - a link that renders differently for a token that exists is a
 * way to test whether an address is on the list.
 *
 * In the reader's own language, from the cookie. It cannot come from the row:
 * the unknown case has no row, and a page that switched language depending on
 * whether the token resolved would leak the same thing the wording is careful
 * not to.
 */
export async function NewsOutcome({
  outcome,
  kind,
}: {
  outcome: TokenOutcome
  kind: 'confirmed' | 'unsubscribed'
}) {
  const t = SIGNUP_COPY[await readLocale()]
  const said = outcome === 'unknown' ? t.unknownToken : t[kind]

  return (
    <MarketingShell>
      <section className="mx-auto max-w-xl py-16 sm:py-24">
        <h1 className="font-pixel text-xl uppercase sm:text-2xl">{said.heading}</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">{said.blurb}</p>
        <Link
          href="/xo-universe"
          className="mt-8 inline-block text-sm font-medium underline underline-offset-4"
        >
          Project Oasis
        </Link>
      </section>
    </MarketingShell>
  )
}
