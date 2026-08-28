import 'server-only'
import { runProjection, type Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { DomainEvent } from '@/es/types'

/**
 * The sweep that makes read models eventually right.
 *
 * ---------------------------------------------------------------------------
 * Why there are two projectors and not one
 * ---------------------------------------------------------------------------
 * Projections run inline, in the request, right after the command that caused
 * them. That is what makes the UI instant: by the time the action returns and
 * `revalidatePath` re-renders, the read model already has the new row. Moving
 * that to a worker would be a product change on every write surface in the app
 * - the user does a thing and does not see it - so it stays.
 *
 * What it cannot do is be *correct*, for two reasons that have nothing to do
 * with each other:
 *
 *   1. **It runs as the user.** A guest's session has RLS that refuses writes
 *      to member-only read models - and an UPDATE that matches no row under RLS
 *      is zero rows and not an error. The projection sees success, the
 *      checkpoint moves, and the fact is gone. Measured on a real database in
 *      20261025000000, repaired there for three tables by widening policies,
 *      and still live as a mechanism for every read model a guest can reach.
 *
 *   2. **There is one projector per in-flight request.** Concurrency on a
 *      checkpoint is not something the inline design ever had an answer for.
 *
 * So this sweep runs behind them as the service role, on its own cursor, and
 * repairs whatever the inline pass dropped. It is the authority; the inline
 * pass is a latency optimisation that is allowed to be wrong.
 *
 * ---------------------------------------------------------------------------
 * Why that is safe to run twice
 * ---------------------------------------------------------------------------
 * It is not a new requirement. `Projection.handle` has always been documented
 * as having to be idempotent, because the checkpoint is written after the batch
 * and a crash mid-batch replays it. Two projectors over the same events is the
 * same demand, made continuously instead of occasionally.
 *
 * ---------------------------------------------------------------------------
 * This is not a service
 * ---------------------------------------------------------------------------
 * It is a route in the same Next.js app, in the same image, reached by the same
 * crontab that already drives four other jobs. No new container, no new deploy
 * target, nothing else to be down.
 */

/**
 * What separates the sweep's cursor from the inline one.
 *
 * The whole design rests on this. If they shared a checkpoint, the inline pass
 * moving it past an event it silently failed to write would hide that event
 * from the sweep as well - and the sweep exists precisely to catch that. Two
 * cursors over one log, one of them trusted.
 *
 * `@` because a projection name is also a read model's table name throughout
 * this codebase, and `@` cannot appear in one - so a worker checkpoint can
 * never be mistaken for an inline one by anything that pattern-matches names.
 */
export const WORKER_SUFFIX = '@worker'

/** The same projection, reading from the sweep's own cursor. */
export function asWorkerProjection(
  projection: Projection<DomainEvent>,
): Projection<DomainEvent> {
  return { ...projection, name: `${projection.name}${WORKER_SUFFIX}` }
}

export interface TenantHead {
  tenantId: string
  /** The last tenant_seq handed out - the head of this space's log. */
  lastSeq: number
}

export interface WorkItem {
  projection: Projection<DomainEvent>
  tenantId: string
  /** How far behind this projection is for this tenant, in events. */
  behind: number
}

/**
 * Which projections are behind, worst first.
 *
 * Pure, so the ordering is testable without a database. Worst-first matters
 * more than it looks: a run that ends on a deadline should have spent its time
 * on the biggest backlogs, and round-robin would spread a fixed budget evenly
 * over spaces that mostly have nothing to do.
 *
 * A tenant with no checkpoint for a projection is at 0 and therefore behind by
 * the whole log, which is correct - it has genuinely never been swept - and is
 * why a newly added projection catches itself up without anybody intervening.
 */
export function pendingWork(
  heads: readonly TenantHead[],
  checkpoints: ReadonlyMap<string, number>,
  projections: readonly Projection<DomainEvent>[],
): WorkItem[] {
  const work: WorkItem[] = []

  for (const head of heads) {
    for (const projection of projections) {
      const key = checkpointKey(asWorkerProjection(projection).name, head.tenantId)
      const at = checkpoints.get(key) ?? 0

      if (head.lastSeq > at) {
        work.push({ projection, tenantId: head.tenantId, behind: head.lastSeq - at })
      }
    }
  }

  return work.sort((a, b) => b.behind - a.behind)
}

/**
 * The key `pendingWork` expects, so callers cannot spell it differently.
 *
 * Both sides go through here, including `pendingWork` itself. That is not
 * ceremony: the two used to build the string independently, and a separator
 * that differed by one character would mean every lookup missing, every
 * projection reported as behind by its whole log, and a sweep that re-projected
 * everything for ever while looking like it was working.
 */
export function checkpointKey(projection: string, tenantId: string): string {
  return `${projection} ${tenantId}`
}

export interface SweepResult {
  /** Projection/tenant pairs that were behind when the run started. */
  pending: number
  /** Pairs actually drained before the deadline. */
  swept: number
  /** Events applied across all of them. */
  applied: number
  failed: number
  errors: string[]
}

/**
 * Drain as much of the backlog as fits in the time available.
 *
 * Serial, deliberately, and this is the one place the choice is load-bearing
 * rather than lazy. The sweep's whole value is being the single reader of the
 * log - running its own batches concurrently would reintroduce, inside the
 * fix, exactly the concurrent-projector problem it was built to remove.
 */
export async function sweep(
  admin: Client,
  work: readonly WorkItem[],
  options: { batchSize: number; deadlineAt: number },
): Promise<SweepResult> {
  let swept = 0
  let applied = 0
  let failed = 0
  const errors: string[] = []

  for (const item of work) {
    if (Date.now() > options.deadlineAt) break

    try {
      applied += await runProjection(
        admin,
        asWorkerProjection(item.projection),
        item.tenantId,
        options.batchSize,
      )
      swept++
    } catch (error) {
      // One broken projection must not stop the other fourteen. A read model
      // whose handler throws on a malformed event would otherwise wedge the
      // entire sweep for every space, which is a far worse failure than the one
      // it started with.
      failed++
      if (errors.length < 5) {
        const message = error instanceof Error ? error.message : 'unknown'
        errors.push(`${item.projection.name}/${item.tenantId}: ${message}`)
      }
    }
  }

  return { pending: work.length, swept, applied, failed, errors }
}
