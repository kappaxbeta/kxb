import Link from 'next/link'
import type { Metadata } from 'next'
import { OurXps } from '@/app/ovaloffice/xps/our-xps'
import { listBuiltinsForOperator } from '@/domain/xps/builtins'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Our XPs' } satisfies Metadata

export const dynamic = 'force-dynamic'

/**
 * The levels we ship, and the two decisions an operator makes about one.
 *
 * ---------------------------------------------------------------------------
 * Not the review queue
 * ---------------------------------------------------------------------------
 * `/ovaloffice/xp` is somebody else's work waiting on a verdict. This is our
 * own shelf: the documents in `public/xp/xps/`, which are code, live in the
 * repo and arrive by deploy. Nothing here is being judged - the questions are
 * *is it listed* and *is it still the version we shipped*, and both of them are
 * answers an operator needs between deploys rather than at one.
 *
 * ---------------------------------------------------------------------------
 * What each button really does
 * ---------------------------------------------------------------------------
 * Open and Edit go to the creator's own routes, which are where a level is
 * looked at and changed - there is no second editor in here, and building one
 * would be a copy of the largest component in the product. Save in that editor
 * is a *download*, because a builtin has no project row to save into; Put in
 * is the other end of that trip.
 *
 * Putting a document in changes what players get now and does not change what
 * the next build ships. The page says so on every overridden row, because that
 * is the one thing about this surface somebody can be wrong about for a week:
 * a fix put in here and never committed survives every deploy and disappears
 * the moment somebody presses Put back.
 */
export default async function OurXpsPage() {
  const { admin, level } = await requireBackofficeSection('xps')

  const rows = await listBuiltinsForOperator(admin)

  const listed = rows.filter((row) => row.published).length
  const overridden = rows.filter((row) => row.overridden).length

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-neutral-800 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg font-medium">Our XPs</h1>
          <span className="font-mono text-xs text-neutral-500">
            {listed} of {rows.length} listed
            {overridden > 0 ? ` · ${overridden} overridden` : ''}
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          The levels this platform ships — the documents under{' '}
          <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300">
            public/xp/xps/
          </code>
          . Listed ones are in{' '}
          <Link href="/browse" className="underline hover:text-neutral-200">
            the store
          </Link>
          , the battle picker and the play rail. Submissions from spaces are next
          door, in{' '}
          <Link href="/ovaloffice/xp" className="underline hover:text-neutral-200">
            XP review
          </Link>
          .
        </p>
        <p className="max-w-2xl text-xs leading-relaxed text-neutral-500">
          Editing one downloads a file; putting that file back in serves it to
          everybody straight away and leaves the repo untouched. That is the fast
          path for a fix, not a place to keep one — commit the file too, then put
          the shipped document back.
        </p>
      </header>

      <OurXps rows={rows} canWrite={level === 'write'} />
    </div>
  )
}
