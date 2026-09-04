import Link from 'next/link'
import { ContestForm } from '@/app/ovaloffice/gewinnspiel/contest-form'
import { CONTEST_LOCALES, contestHref } from '@/app/gewinnspiel/locales'
import { writtenDate } from '@/app/gewinnspiel/dates'
import { readContestHealth } from '@/domain/contest/health'
import { readContestSettings } from '@/domain/contest/settings'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * The prize draw, and the one code the whole legal construction rests on.
 *
 * Everything about the contest that a person decides is on this page: whether
 * the site points at it, when it runs, what is handed out, which code makes
 * entering free and what that code is worth. It used to be a file - `contest.ts`
 * - which meant closing a campaign was a deploy.
 *
 * ---------------------------------------------------------------------------
 * Why the checks are above the form
 * ---------------------------------------------------------------------------
 * § 5 of the conditions says entering is free, and that sentence is only true
 * while the code is live and outlives the draw. Those are facts about a
 * different table, they cannot be seen from outside (`/code/<anything>`
 * redirects whether or not the code exists), and getting them wrong turns a
 * Gewinnspiel into a lottery you have to buy into. So the answer is the first
 * thing on the page, before anything editable.
 *
 * What is *not* here: the prose. Sixteen numbered clauses in six languages are
 * a document, they are reviewed in a pull request, and a text box in a
 * backoffice is not where a legal amendment should be typed. What this page
 * edits are the facts the clauses quote - which is why moving one is still an
 * amendment under § 12, and why the form says so out loud.
 */
export default async function GewinnspielPage() {
  const { admin, level } = await requireBackofficeSection('gewinnspiel')

  const settings = await readContestSettings()
  const health = await readContestHealth(admin, settings)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Gewinnspiel</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The prize draw at{' '}
          <Link href="/gewinnspiel" className="underline">
            /gewinnspiel
          </Link>
          , in six languages. What is set here is what those pages say — the
          conditions themselves are prose in the repository, and changing a date
          after the announcement has gone out is an amendment under § 12, not an
          edit. The pages rebuild when you save.
        </p>
      </div>

      {/*
        The health of the promise, first.

        Green is not "the campaign is doing well" — it is "the sentence in § 5
        is currently true". That distinction is why the wording here is about
        the code rather than about the contest.
      */}
      <section
        className={`rounded-lg border px-4 py-3 ${
          health.well
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-amber-500/50 bg-amber-500/5'
        }`}
      >
        <h3 className="text-sm font-medium">
          {health.well
            ? 'Entering is free, and stays free past the draw.'
            : 'Entering is not free right now.'}
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {health.checks.map((check) => (
            <li key={check.what}>
              <span className={check.ok ? 'text-emerald-500' : 'text-amber-500'}>
                {check.ok ? '✓' : '!'}
              </span>{' '}
              <span className="font-medium text-foreground">{check.what}</span> —{' '}
              {check.says}
            </li>
          ))}
        </ul>
      </section>

      <ContestForm
        settings={settings}
        offer={health.offer}
        readOnly={level !== 'write'}
      />

      {/*
        The six pages, so the thing being edited is one click away in the
        language somebody is about to be asked to check.
      */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">The pages this writes</h3>
        <ul className="flex flex-wrap gap-3 text-sm">
          {CONTEST_LOCALES.map((locale) => (
            <li key={locale}>
              <Link
                href={contestHref(locale)}
                className="rounded border border-border px-2 py-1 font-mono text-xs hover:bg-secondary"
              >
                {locale}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Entries close on{' '}
          <span className="font-medium text-foreground">
            {writtenDate(settings.endsOn, 'de')}
          </span>{' '}
          in German and{' '}
          <span className="font-medium text-foreground">
            {writtenDate(settings.endsOn, 'pl')}
          </span>{' '}
          in Polish — the same day, written the way each language writes it. Both
          come out of <code className="font-mono">gewinnspiel/dates.ts</code>, so
          nothing here is at the mercy of the runtime&rsquo;s locale data.
        </p>
      </section>
    </div>
  )
}
