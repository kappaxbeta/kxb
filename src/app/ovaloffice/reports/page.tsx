import { MessageQueue } from '@/app/ovaloffice/reports/message-queue'
import { ReportQueue } from '@/app/ovaloffice/reports/report-queue'
import { listMessageReports, listWorldReports } from '@/domain/moderation/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Reported worlds and reported messages, and what to do about either.
 *
 * One page with two queues rather than two pages, because they are one job: an
 * admin sitting down to moderate wants to know whether there is anything
 * waiting, and splitting that across two routes means one of them stops being
 * checked. The `status` filter drives both, for the same reason - "show me
 * everything still open" is a question about the platform, not about worlds.
 *
 * The queues themselves differ, and deliberately. A world is a place you have to
 * go and stand in before judging it, so that one is a list of links. A message
 * is the whole of the evidence, so this one prints it.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const { admin } = await requireBackofficeSection('reports')

  const filter =
    status === 'upheld' || status === 'dismissed' || status === 'all' ? status : 'open'

  const [reports, messages] = await Promise.all([
    listWorldReports(admin, filter),
    listMessageReports(admin, filter),
  ])

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Reported worlds</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open one and walk around it before you decide. A ban takes an arena off
            the platform — it does not delete anybody&rsquo;s building.
          </p>
        </div>

        <ReportQueue reports={reports} filter={filter} />
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Reported messages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hiding a message takes it out of the room and leaves it here, so the
            decision stays readable afterwards. Nobody is told who reported it.
          </p>
        </div>

        {/* No filter nav of its own: the one above sets the `status` in the URL
            and this queue reads the same value. Two filter strips on one page
            that set the same parameter would be two controls for one setting. */}
        <MessageQueue reports={messages} />
      </section>
    </div>
  )
}
