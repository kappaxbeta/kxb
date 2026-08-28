import Link from 'next/link'
import { creditBadge } from '@/domain/worlds/credit'
import type { WorldSummary } from '@/domain/worlds/queries'
import { tagLabel } from '@/domain/worlds/tags'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import type { Locale } from '@/domain/i18n/locale'

/**
 * One world in a list.
 *
 * A server component with no interactivity in it at all - the whole card is a
 * link. Which is the reason it can be shared between the public catalogue, a
 * space's own list and the backoffice's: there is no state to differ, so the
 * three pages differ only in what they put *around* it.
 *
 * What the card leads with is the block count rather than the placement count,
 * because "how big is this place" is the question somebody scanning a
 * catalogue is asking, and a world's props are not the place - see
 * domain/worlds/blocks.ts.
 */
export function WorldCard({
  world,
  href,
  t,
  locale,
  children,
}: {
  world: WorldSummary
  href: string
  /**
   * Resolved by the page. A server component, so there is no context to read.
   *
   * It carries the tag words as well as the counts: the filter chips on the
   * worlds page have been translated for a while and the tags *on the card*
   * were not, because `tagLabel` reads the vocabulary's own English. Two lists
   * of the same twelve words, one of them translated.
   */
  t: WorkspaceDict['worlds']
  /** For the counts, which a German reader groups with a full stop. */
  locale: Locale
  /** Anything the surrounding page wants under the card - actions, usually. */
  children?: React.ReactNode
}) {
  return (
    <article className="flex flex-col gap-2 overflow-hidden rounded-xl border border-line bg-surface/40 pb-4">
      {/*
        The picture, and a placeholder that is not a broken image.

        A plain <img>, not next/image, for the reason the block picker gives for
        its thumbnails and one more: this is a data URL, so there is no origin
        for the optimizer to fetch from and nothing for it to do but add a hop.

        16:9 and cropped, because the two sources - the builder's canvas and the
        offline rasterizer - do not agree on shape, and a grid of mixed aspect
        ratios lines up with nothing.
      */}
      <Link href={href} className="block aspect-video overflow-hidden bg-surface">
        {world.poster ? (
          <img
            src={world.poster}
            alt={`${world.name}, seen from above`}
            loading="lazy"
            className="size-full object-cover transition duration-500 hover:scale-[1.02]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-ink-muted">
            no picture yet
          </span>
        )}
      </Link>

      <div className="flex items-baseline justify-between gap-2 px-4">
        <h3 className="min-w-0 truncate font-medium">
          <Link href={href} className="hover:underline">
            {world.name}
          </Link>
        </h3>
        {/* Where it came from, which is the thing a stranger most wants to know
            and the reason the `origin` column exists. */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            world.origin === 'platform'
              ? 'bg-accent/15 text-ink'
              : 'border border-line text-ink-muted'
          }`}
        >
          {creditBadge(world)}
        </span>
      </div>

      {world.blurb && <p className="px-4 text-sm text-ink-muted">{world.blurb}</p>}

      <p className="px-4 text-xs text-ink-muted tabular-nums">
        {fill(t.blocks, { n: world.blocks.toLocaleString(locale) })}
        {/* Uses before views, and views only when nobody has used it yet: a
            count of clicks is the weakest thing on the card, and printing both
            invites reading the bigger number as the better one. */}
        {world.uses > 0
          ? ` ${fill(t.usedTimes, { n: world.uses.toLocaleString(locale) })}`
          : world.views > 0 && ` ${fill(t.seenTimes, { n: world.views.toLocaleString(locale) })}`}
        {world.visibility === 'private' && ` ${t.notPublished}`}
        {world.forkedFrom && ` ${t.aFork}`}
      </p>

      {/*
        What people have said, and what the product has seen for itself.
        Above the tags, because "the finish line is blocked" changes whether you
        open this card at all and "arena" only changes whether you wanted to.
      */}
      {(world.labels.length > 0 || world.approvedAt) && (
        <ul className="flex flex-wrap gap-1 px-4">
          {world.approvedAt && (
            <li
              className="rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] text-ink"
              title="A match ran to its end on a copy of this world"
            >
              played through
            </li>
          )}
          {world.labels.map((label) => (
            <li
              key={label.id}
              title={`${label.count} people reported this`}
              className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200"
            >
              {label.badge}
            </li>
          ))}
        </ul>
      )}

      {world.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1 px-4">
          {world.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted"
            >
              {t.tags[tag]?.label ?? tagLabel(tag)}
            </li>
          ))}
        </ul>
      )}

      {/* The padding lives on the rows rather than on the card, so the picture
          can reach the edges. Wrapped only when there is something to wrap - an
          empty padded div is a gap under every card that has no actions. */}
      {children && <div className="px-4">{children}</div>}
    </article>
  )
}
