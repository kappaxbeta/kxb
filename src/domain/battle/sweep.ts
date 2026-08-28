import 'server-only'
import { battleDecider } from '@/domain/battle/aggregate'
import { ABANDON_AFTER_HOURS } from '@/domain/battle/events'
import { battlesProjection } from '@/domain/battle/projection'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'

/**
 * Closing the matches nobody came back to.
 *
 * ---------------------------------------------------------------------------
 * A query, not a timer
 * ---------------------------------------------------------------------------
 * docs/xp/backlog.md §0.3 asked for a backstop and said what shape it should
 * be: the log already holds the opening event, so this is a question asked when
 * somebody looks, rather than a job that has to be running for the product to
 * be correct. There is no scheduler here and there should not be one - a cron
 * that dies leaves matches open forever and nobody finds out until a customer
 * asks, while a read that never runs leaves them open in a list nobody is
 * reading, which is a problem with no observer.
 *
 * So it runs from the battle hub, before that page lists anything. The cost is
 * one indexed query per visit that almost always returns nothing.
 *
 * ---------------------------------------------------------------------------
 * Why it never throws
 * ---------------------------------------------------------------------------
 * This is housekeeping in front of a page render. A match that refuses to close
 * - because somebody joined it a second ago and the decider now disagrees about
 * whether it is stale, or because two visitors swept at once and one lost the
 * version race - must not be the reason the hub is a 500. Every command is
 * attempted on its own and a failure leaves that row for the next visitor, who
 * will ask the same question and get a better answer.
 *
 * The one thing that *would* be worth hearing about is the query itself
 * failing, and that is left to throw: it means the read model is not readable,
 * and the page below is about to fail anyway.
 */

/**
 * How many stale matches one visit will close.
 *
 * A bound on the work a page render may do, not on the feature - the next
 * visitor takes the next batch, and a space with forty abandoned rooms is a
 * space that has not been looked at in a month. Ten is comfortably more than
 * any real backlog and small enough that the sweep is never the reason a page
 * is slow.
 */
const PER_VISIT = 10

/** Closed, and how many. Returned for the caller's log, ignored by the page. */
export interface SweepResult {
  closed: number
  /** Rows the cap left for the next visit. */
  left: number
}

export async function closeStaleBattles(
  supabase: Client,
  tenantId: string,
): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 3_600_000).toISOString()

  /*
   * Old by whichever clock applies to it.
   *
   * A live match is measured from its kickoff and an open one from when it was
   * opened, which is the same rule the decider applies - and it has to be asked
   * that way here too, or a match that sat open for a week and kicked off an
   * hour ago would be fetched, refused by the decider, and fetched again on
   * every visit for as long as it ran.
   */
  const { data, error } = await supabase
    .from('battles_read_model')
    .select('id, created_at, started_at, status')
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'live'])
    .or(`started_at.lte.${cutoff},and(started_at.is.null,created_at.lte.${cutoff})`)
    .order('created_at', { ascending: true })
    .limit(PER_VISIT + 1)

  if (error) throw new Error(`Failed to look for stale matches: ${error.message}`)

  const rows = (data ?? []).slice(0, PER_VISIT)
  const left = Math.max(0, (data?.length ?? 0) - PER_VISIT)

  if (rows.length === 0) return { closed: 0, left: 0 }

  const now = new Date().toISOString()
  let closed = 0

  for (const row of rows) {
    try {
      await executeCommand({
        supabase,
        decider: battleDecider,
        tenantId,
        streamId: row.id,
        command: { type: 'AbandonBattle', now, openedAt: row.created_at },
        // No actor: nobody did this. The metadata is where a person's id goes
        // and inventing one - the host's, say - would put a decision in their
        // name that they were absent for, which is the opposite of the fact
        // being recorded.
        metadata: {},
      })
      closed += 1
    } catch {
      // Deliberately swallowed - see the header. The next visit asks again.
    }
  }

  if (closed > 0) await runProjection(supabase, battlesProjection, tenantId)

  return { closed, left }
}
