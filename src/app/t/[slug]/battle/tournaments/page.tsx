import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { TournamentsPanel } from '@/app/t/[slug]/battle/tournaments/tournaments-panel'
import { listBattlefields } from '@/domain/battlefields/queries'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { listPlayableXps } from '@/domain/xps/playable'
import { fightable } from '@/domain/battle/xp-rules'
import { listTournaments } from '@/domain/tournament/queries'
import { tournamentsProjection } from '@/domain/tournament/projection'
import { runProjection } from '@/es/projection'
import { battleOpen, canWrite, requireFeature, requireTenant, xpOpen } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).bracket.title }
}

export const dynamic = 'force-dynamic'

export default async function TournamentsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const t = battleDict(await readLocale()).bracket
  const context = await requireTenant(slug)
  const { supabase, tenant } = context

  requireFeature(context, 'battle')
  // And the space's own switch. `notFound` rather than a sentence, which is the
  // rule `requireFeature` writes down: a link is not a permission, and a page
  // explaining what it would have been is an advertisement. A match already
  // running is deliberately still reachable - see `battleOpen`.
  if (!battleOpen(context)) notFound()

  await runProjection(supabase, tournamentsProjection, tenant.id)
  await runProjection(supabase, battlefieldsProjection, tenant.id)

  /*
   * The same list the match hub offers, and empty when the space is not on xp -
   * `listPlayableXps` takes the gate rather than being wrapped in it, so the
   * fork below is absent rather than locked. A chooser is the wrong place to be
   * sold to; the battle wizard is where somebody went looking for the thing.
   */
  const [tournaments, arenas, playable] = await Promise.all([
    listTournaments(supabase, tenant.id),
    listBattlefields(supabase, tenant.id),
    listPlayableXps(supabase, tenant.id, xpOpen(context)),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t.heading}</h2>
          <p className="text-sm text-ink-muted">{t.body}</p>
        </div>
        <div className="flex gap-5 text-sm text-ink-muted">
          <Link
            href={`/t/${slug}/battle/challenges`}
            className="transition hover:text-ink"
          >
            {t.toChallenges}
          </Link>
          <Link
            href={`/t/${slug}/battle`}
            className="font-medium text-ink transition hover:text-accent"
          >
            {battleDict(await readLocale()).backToBattle}
          </Link>
        </div>
      </div>

      <TournamentsPanel
        slug={slug}
        tournaments={tournaments}
        arenas={arenas}
        /*
          Places filtered out, the same as on the match hub. A tournament is a
          ladder of matches, so a cartridge with no match in it has even less
          business here than it has there - see `fightable`.
        */
        xps={playable.xps.filter(fightable)}
        canCreate={canWrite(context)}
      />
    </div>
  )
}
