import { ReviewQueue } from '@/app/ovaloffice/xp/review-queue'
import { listLiveXps, listSubmittedXps } from '@/domain/xps/backoffice'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * What is waiting, and what is live.
 *
 * Two queues on one page, deliberately, for the reason `/ovaloffice/reports`
 * already gives about worlds and messages: they are one job. Somebody sitting
 * down to review wants to know whether there is anything waiting, and splitting
 * that across two routes means one of them stops being checked.
 *
 * They differ in what the verdict *does*, which is why they are two sections
 * rather than one list with a filter. Approving something waiting makes a
 * release — a fact that outlives the click, because a release can be rolled
 * back to forever after. Taking something live down does not delete anything:
 * it unlists the project, marks the release withdrawn, and leaves the owner
 * with their copy.
 */
export default async function XpReviewPage() {
  const { admin } = await requireBackofficeSection('xp')

  const [waiting, live] = await Promise.all([listSubmittedXps(admin), listLiveXps(admin)])

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-neutral-800 pb-3">
          <h1 className="text-lg font-medium">Waiting</h1>
          <span className="font-mono text-xs text-neutral-500">
            {waiting.length} submitted
          </span>
          <p className="ml-auto text-xs text-neutral-500">Oldest first</p>
        </div>

        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          Open one before deciding. A level has rules in it, and a screenshot cannot
          tell you the finish line is unreachable. Publishing approves{' '}
          <em className="not-italic text-neutral-300">this version</em> — the author
          can keep saving afterwards and the store will go on serving what you read.
        </p>

        <ReviewQueue rows={waiting} mode="waiting" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-neutral-800 pb-3">
          <h2 className="text-lg font-medium">Live</h2>
          <span className="font-mono text-xs text-neutral-500">{live.length}</span>
          {/* The honest answer to "what should I look at first" on a moderation
              surface is usually the one the most people are seeing. */}
          <p className="ml-auto text-xs text-neutral-500">Most played first</p>
        </div>

        <ReviewQueue rows={live} mode="live" />
      </section>
    </div>
  )
}
