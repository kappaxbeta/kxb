import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChallengesPanel } from '@/app/t/[slug]/battle/challenges/challenges-panel'
import { listChallenges } from '@/domain/challenges/queries'
import { listBattlefields } from '@/domain/battlefields/queries'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { runProjection } from '@/es/projection'
import { battleOpen, canWrite, requireFeature, requireTenant } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).challengeBoard.title }
}

export const dynamic = 'force-dynamic'

export default async function ChallengesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  const { supabase, tenant } = context

  requireFeature(context, 'battle')
  // And the space's own switch. `notFound` rather than a sentence, which is the
  // rule `requireFeature` writes down: a link is not a permission, and a page
  // explaining what it would have been is an advertisement. A match already
  // running is deliberately still reachable - see `battleOpen`.
  if (!battleOpen(context)) notFound()

  await runProjection(supabase, battlefieldsProjection, tenant.id)

  const [challenges, arenas] = await Promise.all([
    listChallenges(supabase, tenant.id),
    listBattlefields(supabase, tenant.id),
  ])

  const t = battleDict(await readLocale())

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t.challengeBoard.heading}</h2>
          <p className="text-sm text-ink-muted">{t.challengeBoard.body}</p>
        </div>
        <div className="flex gap-5 text-sm text-ink-muted">
          <Link
            href={`/t/${slug}/battle/tournaments`}
            className="transition hover:text-ink"
          >
            {t.tournaments}
          </Link>
          <Link
            href={`/t/${slug}/battle`}
            className="font-medium text-ink transition hover:text-accent"
          >
            {t.backToBattle}
          </Link>
        </div>
      </div>

      <ChallengesPanel
        slug={slug}
        incoming={challenges.incoming}
        outgoing={challenges.outgoing}
        // Only arenas already open to other spaces can be offered as ground:
        // a private one is a void to whoever you are challenging.
        arenas={arenas.filter((arena) => arena.visibility === 'public')}
        hasPrivateArenas={arenas.some((arena) => arena.visibility === 'space')}
        canSend={canWrite(context)}
      />
    </div>
  )
}
