import Link from 'next/link'
import { cookies } from 'next/headers'
import { ANALYTICS_OPT_OUT_COOKIE, isOptedOut } from '@/domain/analytics/opt-out'
import { countMeAgain, stopCountingMe } from './actions'

export const metadata = {
  title: 'Nicht mitzählen',
  // Not a page anybody should arrive at from a search result. It is reached on
  // purpose, by typing it, or from the link in the privacy notice.
  robots: { index: false, follow: false },
}

/**
 * One switch, per browser: count this browser, or do not.
 *
 * The reason it exists is in `domain/analytics/opt-out.ts`. The short version is
 * that the person who builds a site visits it more than anybody, from more
 * browsers than anybody, and those visits are indistinguishable from real ones
 * once they are rows - the daily hash is deliberately not linkable across days,
 * so nothing can be subtracted afterwards.
 *
 * Per browser and not per account, because that is what the cookie can promise.
 * A signed-out profile used for testing has no account to hang a preference on,
 * and it is exactly the profile whose visits need excluding.
 *
 * Bilingual on one page rather than split into `/notme` and `/notme/en` like the
 * legal pages: this is four sentences and a button, and a language switch would
 * be most of the interface.
 */
export default async function NotMePage() {
  const jar = await cookies()
  const excluded = isOptedOut(jar.get(ANALYTICS_OPT_OUT_COOKIE)?.value)

  return (
    <div className="mx-auto min-h-screen max-w-xl p-8 text-ink">
      <Link href="/" className="text-accent hover:underline">
        ← Zurück zur Startseite
      </Link>

      <h1 className="mt-8 mb-2 text-3xl font-bold">Nicht mitzählen</h1>
      <p className="text-ink-muted">
        Gilt für diesen Browser. Die Einstellung steckt in einem Cookie, mehr braucht es dafür
        nicht — keine Anmeldung, keine Kennung.
      </p>

      <div
        // The state first and in words, because a page whose entire content is
        // "did the click work" should answer that before it offers the next one.
        className={`mt-8 rounded-lg border p-5 ${
          excluded ? 'border-accent bg-surface-raised' : 'border-line bg-surface-raised'
        }`}
      >
        <p className="font-medium">
          {excluded
            ? 'Dieser Browser wird nicht gezählt.'
            : 'Dieser Browser wird derzeit gezählt.'}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {excluded
            ? 'Seitenaufrufe und Klicks aus diesem Browser werden nicht gespeichert. Bereits gespeicherte Aufrufe bleiben unberührt.'
            : 'Seitenaufrufe aus diesem Browser landen in der Reichweitenmessung — siehe Datenschutzerklärung.'}
        </p>

        <form action={excluded ? countMeAgain : stopCountingMe} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-accent"
          >
            {excluded ? 'Doch wieder mitzählen' : 'Diesen Browser nicht mitzählen'}
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-ink-muted" lang="en">
        <strong className="text-ink">In English:</strong> this switch stops page views and clicks
        from this browser being recorded. It applies to this browser only, it is stored in a single
        cookie that contains nothing but the choice itself, and clearing your cookies undoes it.
        Records already stored are not affected — they cannot be traced back to a browser.
      </p>

      <p className="mt-4 text-sm text-ink-muted">
        Was überhaupt gemessen wird, steht in der{' '}
        <Link href="/datenschutz" className="text-accent hover:underline">
          Datenschutzerklärung
        </Link>
        .
      </p>
    </div>
  )
}
