import 'server-only'
import type { Client } from '@/es/store'
import type { Range } from './queries'

/**
 * Read side of the People tab.
 *
 * Same shape as `queries.ts` and for the same reasons - the aggregation is one
 * RPC because PostgREST caps rows, and this file's job is to give the JSON a
 * type and a default. See 20260809000000_visitor_profiles.sql for what the two
 * functions actually count.
 *
 * ---------------------------------------------------------------------------
 * Why this is accounts only
 * ---------------------------------------------------------------------------
 * Not a limitation to be fixed later, but the shape of the data on purpose. An
 * anonymous visitor is a salted hash that stops matching at midnight UTC, so
 * there is no such thing as "the same anonymous person, last week" to build a
 * profile out of. What is here is the history of accounts that were signed in
 * while they browsed - their own page views, and nothing that was not already
 * theirs.
 *
 * Both calls take the caller's session client, never the service role: the
 * guard is inside the function and reads the JWT, so calling it as the admin
 * key would bypass the check that makes it safe to expose at all.
 */

export interface ProfileSummary {
  userId: string
  /** Null if the account has no profile row - possible, if unusual. */
  username: string | null
  views: number
  /** Distinct days with at least one view. The habit signal. */
  activeDays: number
  firstSeen: string
  lastSeen: string
  /** The route they opened most, e.g. `/t/:slug/lounge`. */
  topSection: string | null
  device: string | null
  country: string | null
}

/**
 * The headline numbers, over windows the range selector does not move.
 *
 * "Monthly active users" means the last 30 days or it means nothing, so these
 * are fixed - an MAU that changed when you clicked 7d could not be compared to
 * last month's. They count accounts and never anonymous visitors, for the
 * reason at the top of this file: a rotating hash cannot be the same person
 * twice, so an anonymous MAU would be a count of person-days wearing a
 * people-shaped label.
 */
export interface AccountKpis {
  /** Distinct accounts active in the last 1 / 7 / 30 days. */
  dau: number
  wau: number
  mau: number
  /** Accounts whose first ever page view was in the last 30 days. */
  newThisMonth: number
  /** Every account ever seen, as the denominator for the above. */
  everSeen: number
}

export interface ProfileList {
  days: number
  accounts: ProfileSummary[]
  totals: { accounts: number; views: number }
  kpis: AccountKpis
}

export interface SectionVisit {
  section: string
  views: number
  /**
   * The same views, bucketed by age, nested rather than exclusive - a view
   * today is also in `thisWeek` and `thisMonth`. What `frecency()` weighs.
   */
  today: number
  thisWeek: number
  thisMonth: number
  lastSeen: string
}

export interface HourBucket {
  /** 0-23, UTC. The browser never told us their timezone. */
  hour: number
  views: number
}

export interface VisitorProfile {
  days: number
  userId: string
  username: string | null
  totals: {
    views: number
    activeDays: number
    firstSeen: string | null
    lastSeen: string | null
  }
  sections: SectionVisit[]
  pages: { path: string; views: number }[]
  hours: HourBucket[]
  daily: { day: string; views: number }[]
  countries: { country: string; views: number }[]
  devices: { device: string; views: number }[]
}

/** What a window with no signed-in traffic in it looks like. */
function emptyList(days: number): ProfileList {
  return {
    days,
    accounts: [],
    totals: { accounts: 0, views: 0 },
    kpis: { dau: 0, wau: 0, mau: 0, newThisMonth: 0, everSeen: 0 },
  }
}

export async function readProfiles(supabase: Client, days: Range = 30): Promise<ProfileList> {
  const { data, error } = await supabase.rpc('visitor_profiles', { days })

  if (error) {
    throw new Error(`Failed to read visitor profiles: ${error.message}`)
  }

  return (data as unknown as ProfileList | null) ?? emptyList(days)
}

/**
 * One account's history, or null when there is nothing in the window.
 *
 * Null rather than an empty profile, because "this account did not visit in the
 * last 30 days" and "this account does not exist" should look the same to the
 * page - it is the caller's job to render a not-found, and the honest answer to
 * both is that we have nothing to show.
 */
export async function readProfile(
  supabase: Client,
  userId: string,
  days: Range = 30,
): Promise<VisitorProfile | null> {
  const { data, error } = await supabase.rpc('visitor_profile', {
    p_user_id: userId,
    days,
  })

  if (error) {
    throw new Error(`Failed to read visitor profile: ${error.message}`)
  }

  const profile = data as unknown as VisitorProfile | null
  return profile && profile.totals.views > 0 ? profile : null
}
