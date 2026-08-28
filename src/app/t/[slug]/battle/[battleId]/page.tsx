import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { XpMatchRoom } from '@/app/t/[slug]/battle/[battleId]/xp-match-room'
import { PlaySession } from '@/app/xp/_runtime/net/play-session'
import { BattleRoom } from '@/app/t/[slug]/battle/[battleId]/battle-room'
import { findBattle } from '@/domain/battle/queries'
import { applyMatchRules, matchRulesFrom } from '@/domain/battle/xp-rules'
import { loadPlayableXp } from '@/domain/xps/playable'
import { parseXpRef } from '@/domain/xps/ref'
import { battlesProjection } from '@/domain/battle/projection'
import { findBattlefield } from '@/domain/battlefields/queries'
import { findWorldSpawn } from '@/domain/worlds/queries'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { loungeProjection } from '@/domain/lounge/projection'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readSceneIdentity } from '@/domain/guests/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import {
  chatOpen,
  perfDisplayOn,
  requireFeature,
  requireTenant,
  xpOpen,
} from '@/lib/tenant'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).broken.title }
}

export const dynamic = 'force-dynamic'

/**
 * One match: the lobby before it starts, the arena once it has.
 *
 * Both are this page, because they are the same room - joining, picking a side
 * and fighting all happen with the world already loaded around you. Sending
 * people to a separate lobby page and then into the scene would mean waiting
 * for the world twice.
 */
export default async function BattlePage({
  params,
}: {
  params: Promise<{ slug: string; battleId: string }>
}) {
  const { slug, battleId } = await params
  const context = await requireTenant(slug, { guests: true })
  const locale = await readLocale()
  const { supabase, tenant, user } = context

  requireFeature(context, 'battle')

  await runProjection(supabase, battlesProjection, tenant.id)

  const battle = await findBattle(supabase, battleId)
  if (!battle) notFound()

  await runProjection(supabase, battlefieldsProjection, battle.tenantId)

  /**
   * Whose blocks these are.
   *
   * Not the host's, necessarily. `lounge_blocks_read_model` is keyed by
   * `(tenant_id, world_id)` where the tenant is the space that *built* the
   * world - so a match fought on an arena borrowed from another space has to
   * read through that space, not through whoever is hosting the match.
   *
   * A world id equal to the host's tenant id is the host's own lounge, which is
   * the one case where the two coincide.
   */
  const isLounge = battle.worldId === battle.tenantId
  const arena = isLounge ? null : await findBattlefield(supabase, battle.worldId)
  const worldTenantId = arena?.tenantId ?? battle.tenantId

  /**
   * Only catch up a world we are actually in.
   *
   * A projection run reads that tenant's events and writes that tenant's
   * checkpoint, and RLS permits neither for a space we do not belong to - so
   * on a borrowed arena this would fail rather than help. It does not need to:
   * the blocks are already projected by the space that built them, and the
   * select policy on public battlefields is what lets us read the result.
   */
  if (worldTenantId === tenant.id) {
    await runProjection(supabase, loungeProjection, worldTenantId)
    // The goals, on the same terms and for the same reason - a borrowed arena's are
    // already projected by the space that built it, and the public-battlefield
    // select policy is what lets us read them.
    await runProjection(supabase, loungeGoalsProjection, worldTenantId)
  }

  const [blocks, goals, avatar, name, spawnAt] = await Promise.all([
    listLoungeBlocks(supabase, worldTenantId, battle.worldId),
    listGoals(supabase, worldTenantId, battle.worldId),
    readProfileAvatar(supabase, user.id),
    readDisplayName(supabase, user.id),
    // For the people who are not fighting. A fighter is placed on the ring by
    // `spawnSlot`, which is what a match needs and this must not override -
    // see the scene's spawn note. A spectator has no square, and until now
    // stood in the middle of the arena, which is the middle of the fight.
    findWorldSpawn(supabase, battle.worldId),
  ])

  // A guest carries the name and body they chose at the door; a member's row
  // is absent here and the profile answers above stand.
  const identity = await readSceneIdentity(supabase, context.tenant.id, user.id, {
    name,
    avatar,
  })

  /**
   * A match fought inside an XP, in a space that may not open one.
   *
   * Said out loud rather than fallen through, and that is the whole change.
   * The branch below used to be `xpOpen(context) && battle.xpId`, so a space on
   * `xo` walked past it and landed in `BattleRoom` - which is a *different
   * game*, on the lounge, with the ring nowhere in it. Nothing was broken and
   * nothing said anything: you summoned a boxing match, pressed enter, and
   * stood in the lounge.
   *
   * `XpMissing` already exists for the neighbouring case - the level cannot be
   * loaded - for exactly this reason, and this is the second way to arrive at
   * the same nothing. It deserves the same answer and a different sentence,
   * because this one names something the reader can act on.
   */
  if (battle.xpId && !xpOpen(context)) {
    return <XpLocked slug={slug} t={battleDict(locale).broken} />
  }

  /**
   * A match fought inside an XP is played somewhere else.
   *
   * The battle room is a lounge scene with a roster over it, and an XP is its
   * own runtime - so rather than teaching one to render the other, this hands
   * over. The battle id is the room, which is the whole reason `roomId` accepts
   * any opaque string: everybody who was sent here joins the same topic.
   *
   * The roster, the sides and the scoring stay exactly where they are. What is
   * missing is the *return* - a score coming back out of an XP is the next
   * milestone (docs/xp/creator.md §9), and until it exists this is a room you
   * play in rather than a match that ends.
   */
  if (battle.xpId) {
    const document = await loadPlayableXp(supabase, context.tenant.id, battle.xpId)
    // A document that will not load is a page saying so rather than a black
    // canvas - the same answer the creator's own route gives, for the same
    // reason: this is the screen somebody hand-editing a level will meet.
    if (!document) {
      return (
        <XpMissing slug={slug} id={battle.xpId} t={battleDict(locale).broken} />
      )
    }

    /**
     * The row behind the reference, when the ground is a saved project.
     *
     * `battle.xpId` is a *reference* — `p-<uuid>-v<n>` for a project, a bare id
     * for a builtin — and the store is keyed by the row. Resolved here rather
     * than in the scene because parsing a reference is this side's job and the
     * scene should be handed the thing, not the string it was written as.
     */
    const ref = parseXpRef(battle.xpId)

    /**
     * The level, as this match settled it.
     *
     * The whole of the per-match override, applied here and nowhere else: the
     * document goes to the runtime with a different `rules` block on it, so the
     * mode system, the clock and the HUD keep reading one block from one place
     * and nothing downstream grows a branch for "unless a match said
     * otherwise". The project on disk is untouched - see `applyMatchRules`.
     */
    const played = applyMatchRules(document, battle.xpRules)

    return (
      <>
        {/*
          Play that happened, written down once it is over.

          docs/xp/creator.md §18.6, and the instance is the battle id because
          that is the topic everybody here shares - the thread back to which
          space's members were playing, which §18.2's user-centric split
          eventually needs and which nothing else in the row could carry.
        */}
        <PlaySession xpRef={battle.xpId} instance={battle.id} />
        <XpMatchRoom
          slug={slug}
          tenantId={context.tenant.id}
          battle={battle}
          xp={played}
          rules={battle.xpRules ?? matchRulesFrom(document)}
          {...(ref?.kind === 'project' ? { xpId: ref.xpId } : {})}
          // Whether this space has chat at all. Asked here, where the context
          // is, rather than in the runtime - which has no tenant to ask.
          chat={chatOpen(context)}
          me={{
            id: user.id,
            name: displayNameFor(name, user.email, battleDict(locale).broken.someone),
          }}
          // The identity this space already resolved, so a match does not put
          // somebody in a different body than the room they came from.
          avatar={identity.avatar}
          joined={battle.participants.some((player) => player.userId === user.id)}
          // The same predicate and a different question - see the prop. The
          // action re-asks it anyway; this only decides whether the button is
          // drawn.
          staff={context.tenant.role === 'owner' || context.tenant.role === 'admin'}
        />
      </>
    )
  }

  return (
    <BattleRoom
      slug={slug}
      battle={battle}
      worldName={arena?.name ?? 'the lounge'}
      initialBlocks={blocks}
      initialGoals={goals}
      avatar={identity.avatar}
      userId={user.id}
      displayName={identity.name}
      canInvite={context.tenant.role === 'owner' || context.tenant.role === 'admin'}
      // The same predicate and a different question - see the prop. The action
      // re-asks it anyway; this only decides whether the button is drawn.
      staff={context.tenant.role === 'owner' || context.tenant.role === 'admin'}
      spawnAt={spawnAt ?? undefined}
      /*
        Collection, when an operator has turned it on for this space. Read off
        the context the tenant guard already resolved rather than asked for
        again - `requireTenant` runs `resolveFeatures` on the way in, and this
        page is behind it.
      */
      perf={context.features.perf}
      perfReadout={perfDisplayOn(context)}
    />
  )
}

/** Whatever this person is called, and something rather than nothing. */
function displayNameFor(
  name: string | null | undefined,
  email: string | undefined,
  fallback: string,
): string {
  return name?.trim() || email?.split('@')[0] || fallback
}

/**
 * A match whose level this space's plan does not include.
 *
 * The sibling of `XpMissing` below, and deliberately shaped like it: the level
 * is fine, the match is fine, and the one thing in the way is a plan - which is
 * the half worth saying, because it is the half somebody can change.
 */
function XpLocked({ slug, t }: { slug: string; t: BattleDict['broken'] }) {
  return (
    <main className="dark min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          {t.label}
        </p>
        <h1 className="mt-2 text-2xl font-medium">{t.lockedHeading}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">{t.lockedBody}</p>
        <Link
          href={`/t/${slug}/battle`}
          className="mt-8 inline-block text-sm text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline"
        >
          {t.backToLobby}
        </Link>
      </div>
    </main>
  )
}

/**
 * A match whose level has gone.
 *
 * Possible in three ways now, not one: a file we ship can be deleted, a
 * project's release can be withdrawn after a match names it, and a space can
 * lose access to somebody else's project between the summon and the kick-off.
 * All three arrive here as the same nothing, and all three deserve the same
 * answer - said plainly, with the way back, rather than a 404 that reads like
 * the match itself never existed.
 */
function XpMissing({
  slug,
  id,
  t,
}: {
  slug: string
  id: string
  /** Resolved by the page. A server component, so there is no context to read. */
  t: BattleDict['broken']
}) {
  return (
    <main className="dark min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          {t.label}
        </p>
        <h1 className="mt-2 text-2xl font-medium">{fill(t.heading, { id })}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">{t.body}</p>
        <Link
          href={`/t/${slug}/battle`}
          className="mt-8 inline-block text-sm text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline"
        >
          {t.backToLobby}
        </Link>
      </div>
    </main>
  )
}
