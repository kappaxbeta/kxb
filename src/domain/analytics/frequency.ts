import 'server-only'
import type { Client } from '@/es/store'
import type { Range } from './queries'

/**
 * Read side of the Pages tab, and of the space numbers on the backoffice
 * overview.
 *
 * Not to be confused with `frecency.ts` next door, which is a ranking rule.
 * This is plain frequency: how often each page was opened, over four windows at
 * once, with no weighting and no opinion. The two answer different questions
 * and the tab shows both.
 *
 * See 20260811000000_page_frequency.sql for what the functions count. As
 * everywhere else here, both take the caller's session client - the guard is
 * inside the function and reads the JWT, so the service role would bypass it.
 */

/**
 * One row of the frequency table.
 *
 * The four counts are nested rather than exclusive: a view in the last 24 hours
 * is also in `week`, `month` and `year`. That is what lets a row be read
 * straight across - `year` is the total and each narrower column is a share of
 * it - instead of needing addition to answer "how many this month".
 */
export interface Frequency {
  /** Present on the paths list, absent on the folded sections list. */
  path?: string
  section: string
  day: number
  week: number
  month: number
  year: number
  /** Distinct daily visitor hashes over the year. See the page_views migration. */
  visitors: number
  lastSeen: string
}

export interface FrequencyReport {
  /** Every path, busiest first, capped at 500. */
  paths: Frequency[]
  /** The same traffic folded to routes. Short enough to always be complete. */
  sections: Frequency[]
  /** How many distinct paths exist, so a truncated table can say so. */
  distinctPaths: number
}

export interface SpaceActivity {
  slug: string
  views: number
  accounts: number
  visitors: number
  lastSeen: string
}

export interface SpaceReport {
  days: number
  spaces: SpaceActivity[]
  /**
   * The typical space.
   *
   * The median, not the mean: one workspace somebody is building in all week
   * drags an average off the distribution, and the "average space" then
   * describes nothing that exists. The median space is a real space.
   */
  median: { views: number; accounts: number }
  /** Everything under `/t/:slug` added up - what the median describes. */
  combined: { spaces: number; views: number; accounts: number }
}

const emptyFrequency: FrequencyReport = { paths: [], sections: [], distinctPaths: 0 }

export async function readFrequency(supabase: Client): Promise<FrequencyReport> {
  const { data, error } = await supabase.rpc('page_frequency')

  if (error) {
    throw new Error(`Failed to read page frequency: ${error.message}`)
  }

  return (data as unknown as FrequencyReport | null) ?? emptyFrequency
}

export async function readSpaceActivity(
  supabase: Client,
  days: Range = 30,
): Promise<SpaceReport> {
  const { data, error } = await supabase.rpc('space_activity', { days })

  if (error) {
    throw new Error(`Failed to read space activity: ${error.message}`)
  }

  return (
    (data as unknown as SpaceReport | null) ?? {
      days,
      spaces: [],
      median: { views: 0, accounts: 0 },
      combined: { spaces: 0, views: 0, accounts: 0 },
    }
  )
}
