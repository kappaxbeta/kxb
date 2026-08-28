import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AddWorldButton } from '@/app/t/[slug]/battle/battlefields/add-world-button'
import { BattlefieldsPanel } from '@/app/t/[slug]/battle/battlefields/battlefields-panel'
import { WorldCard } from '@/app/worlds/world-card'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import {
  listBattlefields,
  searchPublicBattlefields,
  withBlockCounts,
} from '@/domain/battlefields/queries'
import { listPublicWorlds } from '@/domain/worlds/queries'
import { runProjection } from '@/es/projection'
import { battleOpen, canWrite, hasRole, requireFeature, requireTenant } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).fields.title }
}

export const dynamic = 'force-dynamic'

/**
 * The arenas a space has saved, and the ones other spaces have opened up.
 *
 * Two lists rather than one, because they afford different things: yours can be
 * built in and retired, theirs can only be fought on. Merging them into a
 * single grid would mean every card carrying a badge explaining which kind it
 * is, which is the same information the heading gives once.
 */
export default async function BattlefieldsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { slug } = await params
  const { q } = await searchParams
  const locale = await readLocale()
  const dict = battleDict(locale)
  const worldWords = workspaceDict(locale).worlds
  const t = dict.fields
  const context = await requireTenant(slug)
  const { supabase, tenant } = context

  requireFeature(context, 'battle')
  // And the space's own switch. `notFound` rather than a sentence, which is the
  // rule `requireFeature` writes down: a link is not a permission, and a page
  // explaining what it would have been is an advertisement. A match already
  // running is deliberately still reachable - see `battleOpen`.
  if (!battleOpen(context)) notFound()

  await runProjection(supabase, battlefieldsProjection, tenant.id)

  const [mine, elsewhere, catalogue] = await Promise.all([
    listBattlefields(supabase, tenant.id).then((views) =>
      withBlockCounts(supabase, tenant.id, views),
    ),
    searchPublicBattlefields(supabase, tenant.id, q ?? ''),
    /*
     * The stages somebody else built, offered where a stage gets chosen.
     *
     * Six, most-used first, rather than the whole catalogue: this is a prompt
     * to go and look, not a second discovery page. Only when the flag is on -
     * with it off there is no builder in this space and no way to use one of
     * these anyway.
     */
    context.features.worlds
      ? listPublicWorlds(supabase, { limit: 6, sort: 'used' })
      : Promise.resolve([]),
  ])

  // The same pair that may make a battlefield any other way, which is what the
  // action re-checks. Shown rather than assumed, so a member does not press a
  // button that was never going to work.
  const canAdd = hasRole(context, ['owner', 'admin']) && canWrite(context)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t.heading}</h2>
          <p className="text-sm text-ink-muted">{t.body}</p>
        </div>
        <Link href={`/t/${slug}/battle`} className="text-sm hover:underline">
          {dict.backToBattle}
        </Link>
      </div>

      <BattlefieldsPanel
        slug={slug}
        mine={mine}
        elsewhere={elsewhere}
        search={q ?? ''}
        canManage={hasRole(context, ['owner', 'admin']) && canWrite(context)}
      />

      {catalogue.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">{t.catalogueHeading}</h3>
              <p className="text-sm text-ink-muted">{t.catalogueBody}</p>
            </div>
            <Link href="/worlds" className="text-sm hover:underline">
              {t.browseAllWorlds}
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogue.map((world) => (
              <WorldCard
                key={world.id}
                world={world}
                href={`/worlds/${world.id}`}
                t={worldWords}
                locale={locale}
              >
                {canAdd && <AddWorldButton slug={slug} id={world.id} name={world.name} />}
              </WorldCard>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
