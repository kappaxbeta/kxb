import { ErrorLog } from '@/app/ovaloffice/errors/error-log'
import { type ErrorFilter, listErrorGroups } from '@/domain/observability/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * What is broken, and how badly.
 *
 * The app runs as two replicas behind Caddy, which is what made this page worth
 * building: a crash was previously a line on whichever container happened to
 * serve the request, and the digest printed there was shown to somebody talking
 * to the other one. Everything lands in one table now, from the server
 * (instrumentation.ts), from the browser's error boundary, and from the 404
 * page - see the migration for what each source means.
 *
 * Grouped by fingerprint, so the list answers "what is broken" rather than
 * "what happened". One bug that fired four hundred times is one row with four
 * hundred on it.
 */
export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const { admin } = await requireBackofficeSection('errors')

  const filter: ErrorFilter =
    status === 'resolved' || status === 'all' ? status : 'open'

  const groups = await listErrorGroups(admin, filter)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Errors</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every crash the app noticed, grouped by cause. The digest on a row is
          the same string the visitor was shown and the one to grep the container
          logs for.
        </p>
      </div>

      <ErrorLog groups={groups} filter={filter} />
    </div>
  )
}
