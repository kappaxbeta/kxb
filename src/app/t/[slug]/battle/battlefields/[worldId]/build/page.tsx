import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { findBattlefield } from '@/domain/battlefields/queries'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { loungeProjection } from '@/domain/lounge/projection'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { findWorldSpawn } from '@/domain/worlds/queries'
import { runProjection } from '@/es/projection'
import { canWrite, hasRole, requireFeature, requireTenant } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).fields.buildTitle }
}

export const dynamic = 'force-dynamic'

/**
 * Building an arena.
 *
 * The same scene as the lounge, pointed at a different world. That is the whole
 * payoff of `worldId`: there is no second editor to maintain, no second block
 * palette, no second set of controls to learn - an arena is built with exactly
 * the tools the lounge is built with.
 *
 * Forced into creative mode, and given no presence channel. Both follow from
 * what this page is for: you are laying out a battlefield, not fighting on it,
 * and being dashed off a half-built wall by somebody who wandered in is not a
 * feature. The fighting happens at /t/[slug]/battle/[battleId].
 */
export default async function BuildBattlefieldPage({
  params,
}: {
  params: Promise<{ slug: string; worldId: string }>
}) {
  const { slug, worldId } = await params
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  requireFeature(context, 'battle')

  await runProjection(supabase, battlefieldsProjection, tenant.id)

  const battlefield = await findBattlefield(supabase, worldId)
  // Someone else's arena, or none. Not a 403, for the same reason a non-member
  // gets notFound() from requireTenant: which of the two it is would itself be
  // information.
  if (!battlefield || battlefield.tenantId !== tenant.id) notFound()

  await runProjection(supabase, loungeProjection, tenant.id)
  // Goals are part of the arena the way walls are - and this editor is where a
  // football arena's goals get placed, dragged and resized, so it has to see
  // them.
  await runProjection(supabase, loungeGoalsProjection, tenant.id)

  const [blocks, goals, avatar, spawnAt] = await Promise.all([
    listLoungeBlocks(supabase, tenant.id, worldId),
    listGoals(supabase, tenant.id, worldId),
    readProfileAvatar(supabase, user.id),
    // Set when this arena was pulled in from the world catalogue, which is the
    // case this exists for: an arena laid out around a corner of the map should
    // not open with you standing outside it.
    findWorldSpawn(supabase, worldId),
  ])

  // Read-only unless you are one of the two roles that may shape an arena -
  // the same check `createBattlefield` makes, and the action re-checks it.
  const editable = canWrite(context) && hasRole(context, ['owner', 'admin'])

  return (
    <LoungeScene
      slug={slug}
      worldId={worldId}
      worldName={battlefield.name}
      initialBlocks={blocks}
      // Images are a lounge fixture, not an arena one - an arena is terrain.
      initialImages={[]}
      initialGoals={goals}
      readOnly={!editable}
      canModerate={editable}
      mode="creative"
      /*
       * Grounded, even while building.
       *
       * An arena has to be laid out for people who can only walk, and you
       * cannot judge that from the air - a wall that looks like cover from
       * above may be one you can simply stroll around. Building it on foot is
       * what keeps the arena honest.
       */
      canFly={false}
      avatar={avatar}
      spawnAt={spawnAt ?? undefined}
      /*
       * No presence, and so no channel, no peers and no combat.
       *
       * Not a decision about whether co-building would be nice - it would - but
       * about what the Realtime policy can currently express. The topic is
       * `lounge:<tenantId>` and its policy parses exactly that shape (see
       * 20260727010000_lounge_presence.sql), so an arena has nowhere of its own
       * to broadcast into yet. Phase 3 generalises the topic; until then,
       * joining the lounge's channel from here would put two people who are in
       * different worlds into one room, drawn standing inside each other's
       * walls.
       */
    />
  )
}
