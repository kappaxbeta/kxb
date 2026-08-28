import type { Metadata } from 'next'
import Link from 'next/link'
import { HeroEditor } from '@/app/ovaloffice/studio/hero-editor'
import { listBanners } from '@/domain/events/banners'
import { decodeHero, encodeHero } from '@/domain/studio/hero'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).studio.metaBanner }
}

export const dynamic = 'force-dynamic'

/** A banner: a sky, drifting blocks, a headline. See the video studio's note on sharing the editors. */
export default async function SpaceHeroStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ h?: string; banner?: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  requireFeature(context, 'scenes')

  const { h, banner } = await searchParams

  /**
   * What this space has kept, so a banner can be opened again.
   *
   * Read here rather than left to Settings because the studio is where somebody
   * goes to change one, and a tool that can only ever start from blank makes
   * "fix the typo in the headline" mean composing the whole thing twice.
   *
   * Only for the people who could save one. `event_banners` refuses everybody
   * else on insert, and offering an ordinary member a list they cannot write
   * back to would be a shelf of other people's work.
   */
  const canKeep = context.tenant.role === 'owner' || context.tenant.role === 'admin'
  const saved = canKeep ? await listBanners(context.supabase, context.tenant.id) : []

  /**
   * Which document opens, and why the query string wins.
   *
   * `?h=` is the live edit — the composer rewrites it on every slider tick — so
   * a reload while working has to come back to what is on screen, not to what
   * was last saved. `?banner=` is how you *start* from a saved one, and the
   * editor replaces the address with `?h=` on its first change, at which point
   * the two agree again.
   */
  const opened = banner ? saved.find((entry) => entry.id === banner) : undefined
  const initial = h ? decodeHero(h) : (opened?.document ?? decodeHero(undefined))


  const t = workspaceDict(await readLocale()).studio
  return (
    /*
      The whole window, bar the left rail.

      `data-surface` is read by globals.css, which drops the right panel and
      unclamps the middle column - see the note there for why it is an attribute
      rather than a prop. A studio is a canvas and a timeline, and the roster of
      who is online is not part of that job.
    */
    <section className="mt-6" data-surface="wide">
      <header className="mb-4">
        <h1 className="text-lg font-medium">{t.bannerTitle}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.bannerBody}</p>
      </header>

      <HeroEditor
        initial={initial}
        space={
          canKeep
            ? { slug, bannerId: opened?.id, bannerName: opened?.name }
            : undefined
        }
      />

      {saved.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-ink-muted">{t.keptHere}</p>
          <ul className="flex flex-wrap gap-2">
            {saved.map((entry) => (
              <li key={entry.id}>
                {/*
                  Both keys, and that is deliberate. `banner` says which row a
                  save writes back to; `h` is the document the editor opens
                  with, which is what makes the picture appear before anything
                  has been fetched. Carrying only `banner` would work and would
                  cost a round trip on every reopen.
                */}
                <Link
                  href={`/t/${slug}/studio/hero?banner=${entry.id}&h=${encodeHero(entry.document)}`}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    entry.id === opened?.id
                      ? 'border-accent/60 text-ink'
                      : 'border-line text-ink-muted hover:border-accent/60 hover:text-ink'
                  }`}
                >
                  {entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
