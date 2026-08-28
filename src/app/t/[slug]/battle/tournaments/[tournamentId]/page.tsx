import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BracketPanel } from '@/app/t/[slug]/battle/tournaments/[tournamentId]/bracket-panel'
import { findTournament } from '@/domain/tournament/queries'
import { tournamentsProjection } from '@/domain/tournament/projection'
import { readUsernames } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import { canWrite, requireFeature, requireTenant } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).bracket.one }
}

export const dynamic = 'force-dynamic'

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string; tournamentId: string }>
}) {
  const { slug, tournamentId } = await params
  const locale = await readLocale()
  const t = battleDict(locale).bracket
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  requireFeature(context, 'battle')

  await runProjection(supabase, tournamentsProjection, tenant.id)

  const found = await findTournament(supabase, tenant.id, tournamentId)
  if (!found) notFound()

  const { view, state } = found

  // Everyone who appears anywhere in the bracket, named in one round trip.
  const names = await readUsernames(supabase, state.entrants)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{view.name}</h2>
          <p className="text-sm text-ink-muted">
            {view.status === 'open'
              ? t.states.signing
              : view.status === 'live'
                ? t.states.running
                : view.status === 'ended'
                  ? t.states.finished
                  : t.states.calledOff}
            {' · '}
            {view.entrants} {view.entrants === 1 ? t.entrantOne : t.entrantMany}
          </p>
        </div>
        <Link href={`/t/${slug}/battle/tournaments`} className="text-sm hover:underline">
          {t.backToTournaments}
        </Link>
      </div>

      <BracketPanel
        slug={slug}
        tournamentId={tournamentId}
        status={view.status}
        rounds={state.rounds.map((round) => round.map((match) => ({ ...match })))}
        entrants={state.entrants}
        names={Object.fromEntries(names)}
        winnerId={state.winner}
        isHost={state.createdBy === user.id}
        isEntrant={state.entrants.includes(user.id)}
        canAct={canWrite(context)}
      />
    </div>
  )
}
