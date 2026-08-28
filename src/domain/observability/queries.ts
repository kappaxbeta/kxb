import 'server-only'
import type { Client } from '@/es/store'
import type { ErrorSource } from '@/domain/observability/record'

/** One crash, however many times it has happened. */
export interface ErrorGroupView {
  fingerprint: string
  occurrences: number
  /** Distinct signed-in people who hit it. Zero when nothing carried a user. */
  affected: number
  openCount: number
  firstSeen: string
  lastSeen: string
  message: string
  source: ErrorSource
  route: string | null
  path: string | null
  /** Next's identifier, and the string to grep the container logs for. */
  digest: string | null
  stack: string | null
}

export type ErrorFilter = 'open' | 'resolved' | 'all'

/**
 * The error list, grouped.
 *
 * Takes an admin client because the table has no policy for anybody but a
 * backoffice admin; the caller is expected to have passed
 * requireBackofficeAdmin() first, exactly as `listContactMessages` expects.
 * That guard is the gate, not this function.
 *
 * The grouping is done in Postgres rather than here - see
 * `error_report_groups` in the migration. The case worth designing for is the
 * one where a single bug has fired ten thousand times, and that is precisely
 * the case where those rows have no business being in Node.
 */
export async function listErrorGroups(
  admin: Client,
  status: ErrorFilter = 'open',
  limit = 50,
): Promise<ErrorGroupView[]> {
  const { data, error } = await admin.rpc('error_report_groups', {
    p_status: status,
    p_limit: limit,
  })

  if (error) throw new Error(`Failed to load error reports: ${error.message}`)

  return (data ?? []).map((row) => ({
    fingerprint: row.fingerprint,
    occurrences: Number(row.occurrences ?? 0),
    affected: Number(row.affected ?? 0),
    openCount: Number(row.open_count ?? 0),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    message: row.message,
    source: asSource(row.source),
    route: row.route,
    path: row.path,
    digest: row.digest,
    stack: row.stack,
  }))
}

/**
 * How many distinct crashes are unresolved, for the badge on the tab.
 *
 * Distinct, not total: a badge reading "412" when one bug fired four hundred
 * times is a badge that gets ignored, and the number an admin can act on is the
 * number of things to fix.
 */
export async function countOpenErrorGroups(admin: Client): Promise<number> {
  const { data, error } = await admin.rpc('error_report_groups', {
    p_status: 'open',
    p_limit: 500,
  })

  if (error) return 0
  return data?.length ?? 0
}

/** The column is check-constrained; TypeScript sees a string. */
function asSource(value: string): ErrorSource {
  return value === 'client' || value === 'not-found' ? value : 'server'
}
