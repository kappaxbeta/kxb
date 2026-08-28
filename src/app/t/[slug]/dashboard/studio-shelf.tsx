import { Clapperboard, Plus } from 'lucide-react'
import Link from 'next/link'
import type { SceneSummary } from '@/domain/scenes/queries'
import { workspaceDict } from '@/app/i18n/workspace'
import type { Locale } from '@/domain/i18n/locale'

/**
 * What this space has made, at the foot of its board.
 *
 * Below the notices rather than beside them, and that is the whole layout
 * argument. A side column would have to live inside a main that already has a
 * rail on the left and, from `xl`, a second on the right - which leaves the
 * reading column around 400px, and a stream of paragraphs at 400px is not a
 * stream anybody reads. So the page is one column and this is the thing you
 * arrive at when the board runs out: what is here to open, once you have
 * finished reading what is here to read.
 *
 * A rail rather than a grid of cards. These are things with names and lengths,
 * not features being advertised, and three equal panels with an icon apiece
 * would say the opposite. It scrolls sideways because the interesting ones are
 * the recent ones and the tail is allowed to go off the edge.
 */
export function StudioShelf({
  slug,
  scenes,
  locale,
}: {
  slug: string
  scenes: SceneSummary[]
  /** Resolved by the page. A server component - see `StreakBadge`. */
  locale: Locale
}) {
  const t = workspaceDict(locale).board

  return (
    <section className="mt-12 border-t border-line/50 pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-pixel text-[0.7rem] tracking-[0.18em] text-accent-2 uppercase">
          {t.studio}
        </h2>
        <Link
          href={`/t/${slug}/studio`}
          className="text-xs text-ink-muted transition hover:text-ink"
        >
          {t.openStudio}
        </Link>
      </div>

      {scenes.length === 0 ? (
        <p className="mt-3 max-w-[52ch] text-sm text-ink-muted">
          {t.nothingMade}
        </p>
      ) : (
        /*
          A scroller, and the padding on the right is the affordance: the last
          card stops short of the edge so the strip reads as continuing rather
          than as ending exactly where the column does. `overflow-x` on its own
          would clip the cards' glow, which is why the negative margin puts the
          scroll port a little wider than the text column it sits under.
        */
        <ul className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          <li className="shrink-0 snap-start">
            <Link
              href={`/t/${slug}/studio`}
              className="flex h-full w-32 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line/70 p-3 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
            >
              <Plus className="size-4" aria-hidden />
              {t.makeOne}
            </Link>
          </li>

          {scenes.map((scene) => (
            <li key={scene.id} className="shrink-0 snap-start">
              <Link
                href={`/t/${slug}/studio/video?scene=${scene.id}`}
                className="flex h-full w-44 flex-col gap-2 rounded-2xl border border-line/50 bg-surface-raised/25 p-3 transition hover:border-accent/60 hover:bg-surface-raised/50"
              >
                <span className="flex items-center justify-between gap-2 text-ink-muted">
                  <Clapperboard className="size-4 shrink-0" aria-hidden />
                  <span className="text-[0.65rem] tabular-nums">{scene.seconds}s</span>
                </span>
                <span className="line-clamp-2 text-sm leading-snug">{scene.name}</span>
                {scene.visibility === 'public' && (
                  // Cyan: this one is finished enough to have been handed out.
                  <span className="mt-auto text-[0.6rem] tracking-[0.18em] text-accent-2 uppercase">
                    {t.shared}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
