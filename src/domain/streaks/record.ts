import 'server-only'
import { createHash } from 'node:crypto'
import { streakDecider } from '@/domain/streaks/aggregate'
import { recordVisitSchema } from '@/domain/streaks/commands'
import { utcDay } from '@/domain/streaks/days'
import { streaksProjection } from '@/domain/streaks/projection'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { TenantContext } from '@/lib/tenant'
import { writeBlockedReason } from '@/lib/tenant'

/**
 * The stream a member's streak lives on, one per (space, member).
 *
 * Derived rather than random, because the caller has to find the *same* stream
 * on every visit with nothing stored to look it up by. A v5-style UUID over the
 * pair is deterministic and, crucially, globally unique: the events table's
 * uniqueness is `(stream_id, version)` with no tenant in it, so the same member
 * in two spaces must not land on one stream id - the tenant is folded into the
 * hash exactly so they cannot. Minting a random id and remembering it in the
 * read model would race two first-visits into two streams; this cannot.
 */
export function streakStreamId(tenantId: string, userId: string): string {
  const bytes = createHash('sha1').update(`login_streak:${tenantId}:${userId}`).digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Record that this member showed up today, once per UTC day.
 *
 * Called from the tenant layout, so it runs on every page inside a space - the
 * streak is "showed up in this space today", not "opened this one page". That
 * it appends during a GET render is not new: `visit.ts` founds a homestead the
 * same way, and the layout already catches projections up on render.
 *
 * Cheap on the hot path by design. The common case is the second-and-later
 * navigation of a day, and it costs one indexed single-row read: if the read
 * model already has today, there is nothing to do and no stream is loaded. Only
 * the first visit of a day goes on to append and re-project.
 *
 * It never throws. Showing up is not an action a member took and is waiting on -
 * it is a side effect of opening the space - so a streak that could not be
 * written must not take the whole space down with it. The board swallows its
 * own read failures for the same reason; here the failure is a write.
 */
export async function recordDailyVisit(context: TenantContext): Promise<void> {
  const { user, tenant, supabase } = context

  // A guest is a link-visitor with no account to build a run on; a space that
  // has stopped paying or been archived records nothing new. Either way, skip.
  if (tenant.role === 'guest') return
  if (writeBlockedReason(context)) return

  const today = utcDay(new Date())

  try {
    // The hot-path short-circuit: already counted today, so there is nothing to
    // append and no reason to load the stream. One indexed row.
    const { data: seen } = await supabase
      .from('login_streaks_read_model')
      .select('last_day')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (seen?.last_day === today) return

    const parsed = recordVisitSchema.safeParse({ day: today })
    if (!parsed.success) return

    await executeCommand({
      supabase,
      decider: streakDecider,
      tenantId: tenant.id,
      streamId: streakStreamId(tenant.id, user.id),
      command: { type: 'RecordVisit', day: parsed.data.day },
      metadata: { actorId: user.id },
    })

    // Catch the read model up so the badge on the page about to render is
    // today's, not yesterday's. Tenant-wide like every projection run.
    await runProjection(supabase, streaksProjection, tenant.id)
  } catch (error) {
    // Never break a page load over a streak. Logged, not surfaced.
    console.error('recordDailyVisit failed', error)
  }
}
