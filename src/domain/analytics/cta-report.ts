import 'server-only'
import type { Client } from '@/es/store'
import type { Range } from './queries'

/**
 * Read side of the CTAs tab: which buttons were pressed, from where, and where
 * the people pressing them were.
 *
 * ---------------------------------------------------------------------------
 * Aggregated here rather than in SQL, unlike every other report in this folder
 * ---------------------------------------------------------------------------
 * The traffic, pages and funnel reports are all `rpc(...)` calls into a
 * function shipped by a migration, and that is right for them: they group over
 * `page_views`, which is the biggest table in the database and grows with every
 * hit.
 *
 * This one groups over `analytics_events` filtered to a single event name -
 * clicks on a handful of buttons, in the low thousands a month rather than the
 * low millions. Pulling those rows and folding them in TypeScript costs a
 * fraction of what a second migration and a second RPC cost to maintain, and
 * every part of the grouping - which is the part that will actually change as
 * buttons come and go - is then a plain function anybody can read.
 *
 * It stops being right if the volume ever makes `ROW_CAP` bite. The report says
 * out loud when it does, rather than quietly reporting a sample as a total.
 *
 * The caller's session client, as everywhere here: `analytics_events` grants
 * select to backoffice admins and the policy reads the JWT, so the service role
 * would bypass the guard rather than satisfy it.
 */

/**
 * The most rows one report will read.
 *
 * A cap rather than pagination because a truncated CTA report is still a useful
 * one - the ranking barely moves - and an honest note about it is cheaper than
 * a loop that fetches forever the day something starts writing events in a
 * tight loop. PostgREST's own default ceiling is lower than this on some
 * deployments; `truncated` catches either.
 */
const ROW_CAP = 20_000

/** One button, over the window. */
export interface CtaCount {
  /** `props.id` - the CTA's own name. See `cta-tracker.tsx`. */
  id: string
  clicks: number
  /** Distinct daily visitor hashes. Over-counts anybody who came back. */
  visitors: number
  /** Where it was clicked from, busiest first. */
  paths: { path: string; clicks: number }[]
  /** Two-letter codes, busiest first. `null` is "could not be placed". */
  countries: { country: string | null; clicks: number }[]
}

export interface CtaReport {
  days: number
  clicks: number
  /** Every CTA, busiest first. */
  ctas: CtaCount[]
  /** Across all CTAs, busiest first. */
  countries: { country: string | null; clicks: number }[]
  /**
   * True when the window held more clicks than `ROW_CAP`.
   *
   * The page has to say so. A total that is silently a sample is worse than no
   * total, because it is the one number a reader will quote.
   */
  truncated: boolean
  /**
   * Clicks recorded before the country column existed, which are null forever.
   *
   * Reported separately from "we could not place the address", because they are
   * a different fact with a different fix: these will age out of the window on
   * their own. See the 20270131000000 migration.
   */
  withoutCountry: number
}

/** One row as the table stores it. */
interface EventRow {
  path: string
  country: string | null
  visitor_hash: string
  props: { id?: unknown } | null
}

/** Descending by count, then by key, so equal counts do not reorder per read. */
function ranked<T>(counts: Map<T, number>, key: (value: T) => string): { k: T; n: number }[] {
  return [...counts.entries()]
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n || key(a.k).localeCompare(key(b.k)))
}

export async function readCtaClicks(supabase: Client, days: Range = 30): Promise<CtaReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('analytics_events')
    .select('path, country, visitor_hash, props')
    .eq('name', 'cta_click')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(ROW_CAP)

  if (error) throw new Error(`Failed to read CTA clicks: ${error.message}`)

  const rows = (data as unknown as EventRow[] | null) ?? []

  const byId = new Map<
    string,
    { clicks: number; visitors: Set<string>; paths: Map<string, number>; countries: Map<string | null, number> }
  >()
  const countries = new Map<string | null, number>()
  let withoutCountry = 0

  for (const row of rows) {
    // A click whose id is not a short string is not a CTA click we wrote - the
    // props column is validated on the way in, but a report should not assume
    // its own writer was the only one there.
    const id = typeof row.props?.id === 'string' ? row.props.id : null
    if (!id) continue

    const bucket = byId.get(id) ?? {
      clicks: 0,
      visitors: new Set<string>(),
      paths: new Map<string, number>(),
      countries: new Map<string | null, number>(),
    }
    bucket.clicks += 1
    bucket.visitors.add(row.visitor_hash)
    bucket.paths.set(row.path, (bucket.paths.get(row.path) ?? 0) + 1)
    bucket.countries.set(row.country, (bucket.countries.get(row.country) ?? 0) + 1)
    byId.set(id, bucket)

    countries.set(row.country, (countries.get(row.country) ?? 0) + 1)
    if (row.country === null) withoutCountry += 1
  }

  const ctas: CtaCount[] = ranked(
    new Map([...byId].map(([id, b]) => [id, b.clicks])),
    (id) => id,
  ).map(({ k: id }) => {
    const bucket = byId.get(id)!
    return {
      id,
      clicks: bucket.clicks,
      visitors: bucket.visitors.size,
      paths: ranked(bucket.paths, (p) => p).map(({ k, n }) => ({ path: k, clicks: n })),
      countries: ranked(bucket.countries, (c) => c ?? '').map(({ k, n }) => ({
        country: k,
        clicks: n,
      })),
    }
  })

  return {
    days,
    clicks: rows.length,
    ctas,
    countries: ranked(countries, (c) => c ?? '').map(({ k, n }) => ({ country: k, clicks: n })),
    truncated: rows.length >= ROW_CAP,
    withoutCountry,
  }
}
