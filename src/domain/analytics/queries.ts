import 'server-only'
import type { Client } from '@/es/store'

/**
 * Read side of the analytics tab.
 *
 * One RPC, one shape. The aggregation lives in `page_view_report()` for the
 * reason spelled out in its migration - PostgREST caps rows, and counting a
 * month of traffic client-side would mean paging all of it - so this file's
 * whole job is to give that JSON a type and a default.
 *
 * It takes the caller's own session client, never the service role: the guard
 * inside the function reads the JWT, so calling it as the admin key would
 * bypass the very check that makes it safe to expose.
 */

export interface Bucket {
  views: number
  visitors: number
}

export interface PageBucket extends Bucket {
  path: string
}
export interface SectionBucket extends Bucket {
  /** A route rather than a URL: `/t/:slug/lounge`, not `/t/acme/lounge`. */
  section: string
}
export interface SourceBucket extends Bucket {
  /** A bare host, or the literal `direct` for a hit with no referrer. */
  source: string
}
export interface CountryBucket extends Bucket {
  /** ISO-3166 alpha-2, or the literal `unknown`. */
  country: string
  /** The most common language tag seen from there, as a hint when it is. */
  language: string | null
}
export interface DeviceBucket extends Bucket {
  device: string
}
export interface DayBucket extends Bucket {
  day: string
}

export interface RecentView {
  at: string
  path: string
  source: string
  country: string | null
  device: string
  signedIn: boolean
}

export interface AnalyticsReport {
  days: number
  totals: {
    views: number
    visitors: number
    signedIn: number
    bots: number
    /** Distinct signed-in accounts behind those views. */
    accounts: number
  }
  pages: PageBucket[]
  sections: SectionBucket[]
  sources: SourceBucket[]
  countries: CountryBucket[]
  devices: DeviceBucket[]
  daily: DayBucket[]
  recent: RecentView[]
}

/** What an empty database looks like, so the page has no null branch. */
function emptyReport(days: number): AnalyticsReport {
  return {
    days,
    totals: { views: 0, visitors: 0, signedIn: 0, bots: 0, accounts: 0 },
    pages: [],
    sections: [],
    sources: [],
    countries: [],
    devices: [],
    daily: [],
    recent: [],
  }
}

/** The window the tab offers. Anything else falls back to a month. */
export const RANGES = [1, 7, 30, 365] as const
export type Range = (typeof RANGES)[number]

export function asRange(raw: string | undefined): Range {
  const days = Number(raw)
  return (RANGES as readonly number[]).includes(days) ? (days as Range) : 30
}

/** `365d` is a year and reads like a typo. The others are days. */
export function rangeLabel(days: Range): string {
  return days === 1 ? '24h' : days === 365 ? '1y' : `${days}d`
}

export async function readAnalytics(
  supabase: Client,
  days: Range = 30,
): Promise<AnalyticsReport> {
  const { data, error } = await supabase.rpc('page_view_report', { days })

  if (error) {
    throw new Error(`Failed to read analytics: ${error.message}`)
  }

  // A brand-new database has never been visited, and the function still returns
  // its shape - the fallback is for the case where it returned nothing at all.
  return (data as unknown as AnalyticsReport | null) ?? emptyReport(days)
}
