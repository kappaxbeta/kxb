import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What the prize draw is, as one row an operator owns.
 *
 * `supabase/migrations/20270216000000_a_contest_the_backoffice_runs.sql` has the
 * argument for why these facts moved out of `contest.ts` and what stayed behind
 * (the rendering, and the reason a date is never handed to ICU). This file is
 * the front door: one read for every surface that mentions the contest, one
 * write behind the backoffice's section grant.
 *
 * ---------------------------------------------------------------------------
 * Read as the service role, on a page with no session
 * ---------------------------------------------------------------------------
 * Same call `offers.ts` makes and for the same reason: the caller is usually
 * somebody with no account reading a public document, and there is no session
 * to read it as. The row is world-readable anyway - every field on it is
 * printed on that page.
 *
 * This paragraph used to go on to say the six pages stayed prerendered and the
 * backoffice revalidated them. Half of that was wrong in a way only production
 * showed: `next build` runs without `SUPABASE_SERVICE_ROLE_KEY` - see the guard
 * on the read below - so a prerender could never have had the real row in it.
 * The pages render per request now, which is what actually makes "changed in
 * the backoffice, live on the site" one action rather than a deploy. The
 * `revalidatePath` calls in `saveContestSettings` stay, for the surfaces that
 * *are* cached.
 */

export interface ContestSettings {
  /** Whether the site *points* at the contest. The conditions stay reachable. */
  live: boolean
  /** The promo code that makes entering free. Uppercase. */
  code: string
  /** ISO dates, `YYYY-MM-DD`. The hour and zone are prose, not values. */
  startsOn: string
  endsOn: string
  drawsOn: string
  /** Euro amounts, best first. */
  prizes: readonly number[]
  /** Without the `#` and the `@` - the page draws those. */
  hashtag: string
  handle: string
  minAge: number
}

/**
 * What the contest was before anybody could edit it.
 *
 * These are the values `contest.ts` carried on the day the row was created, and
 * they are the fallback for every failure below rather than a set of empty
 * strings. That direction is deliberate and is the opposite of the economy's:
 * a flag that cannot be read should fail closed because the cost is a feature
 * briefly missing, and a *legal document* that cannot be read its own deadline
 * must not render a page that says the contest closes on the 1st of January
 * 1970. The last known-good text is the safe answer here.
 */
export const CONTEST_DEFAULTS: ContestSettings = {
  live: false,
  code: 'KXB50',
  startsOn: '2026-09-01',
  endsOn: '2026-09-30',
  drawsOn: '2026-10-02',
  prizes: [50, 25, 25],
  hashtag: 'kxbteam',
  handle: 'kxbteam',
  minAge: 18,
}

/**
 * The contest as it stands, or the defaults above if the row cannot be read.
 *
 * "Cannot be read" has to include *cannot be asked*, which is what the
 * try/catch is for. `createAdminClient` throws when `SUPABASE_SERVICE_ROLE_KEY`
 * is unset, and that key is deliberately absent from the image build - only
 * `NEXT_PUBLIC_*` values are build args, because a server secret promoted to a
 * Docker `ENV` is a secret that ships to anybody who can pull the image. So the
 * throw landed one line above the fallback written for exactly this, and four
 * production deploys died inside `next build` instead of falling back.
 *
 * The pages that draw these facts render per request now, so a visitor is not
 * normally on this path. The guard stays anyway: it is what makes the paragraph
 * above about "the last known-good text is the safe answer" true rather than
 * aspirational, and the next caller to import this may well be prerendered.
 */
export async function readContestSettings(): Promise<ContestSettings> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('contest_settings')
      .select('live, code, starts_on, ends_on, draws_on, prizes, hashtag, handle, min_age')
      .maybeSingle()

    if (error || !data) return CONTEST_DEFAULTS

    return {
      live: data.live,
      code: data.code,
      startsOn: data.starts_on,
      endsOn: data.ends_on,
      drawsOn: data.draws_on,
      // An empty array would render a prize list with nothing in it, which reads
      // as "no prizes" rather than as a failure. The column cannot be empty, so
      // this only fires if something has gone very wrong.
      prizes: data.prizes?.length ? data.prizes : CONTEST_DEFAULTS.prizes,
      hashtag: data.hashtag,
      handle: data.handle,
      minAge: data.min_age,
    }
  } catch {
    return CONTEST_DEFAULTS
  }
}

/**
 * Is the contest being pointed at right now?
 *
 * Its own function because it is the one thing most callers want, it is asked
 * from the site's chrome on pages that have nothing else to do with the
 * contest, and it must never throw there: a footer that crashed because a
 * campaign table was unreachable would take down every marketing page at once.
 */
export async function contestIsLive(): Promise<boolean> {
  try {
    return (await readContestSettings()).live
  } catch {
    return false
  }
}
