import Link from 'next/link'
import { WorldViewer } from '@/app/w/world-viewer'
import { ReportWorld } from '@/app/worlds/[id]/report-world'
import { WorldActions } from '@/app/worlds/[id]/world-actions'
import { creditFor } from '@/domain/worlds/credit'
import type { WorldDetail as World } from '@/domain/worlds/queries'
import { tagLabel } from '@/domain/worlds/tags'

/**
 * One world, to walk around and to take.
 *
 * A component rather than a page, because there are two pages: the public one
 * at /worlds/[id], and the one inside a space at /t/[slug]/worlds/[id]. They
 * show the identical thing and differ only in what surrounds them - and what
 * surrounds them is the whole point, because a member who followed a link out
 * of their space to the public page lost the workspace rail and had no way
 * back except the browser's Back button.
 *
 * So the *frame* differs and the world does not. Everything here takes what it
 * needs as a prop; neither page's access rules leak into it.
 */
export function WorldDetailView({
  world,
  spaces,
  signedIn,
  mine,
  myReport,
  /** Where the "all worlds" link goes. In a space, that is the space's own list. */
  backHref = '/worlds',
  /** How this page links to another world - a fork's parent, a tag. */
  hrefFor = (id: string) => `/worlds/${id}`,
  tagHref = (tag: string) => `/worlds?tag=${tag}`,
  /**
   * Set when this page was reached from a room's own "Discover worlds" link,
   * naming which one. Absent everywhere else - the public page has no
   * concept of a room - which is what keeps `WorldActions` defaulting to its
   * ordinary "use in my space" pair.
   */
  intoRoom,
}: {
  world: World
  spaces: { slug: string; name: string }[]
  signedIn: boolean
  mine: boolean
  myReport: string | null
  backHref?: string
  hrefFor?: (id: string) => string
  tagHref?: (tag: string) => string
  intoRoom?: { slug: string; id: string; name: string }
}) {
  return (

    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">
            <Link href={backHref} className="hover:underline">
              ← All worlds
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{world.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            by {creditFor(world)} · {world.blocks.toLocaleString()} blocks
            {world.uses > 0 && ` · used by ${world.uses.toLocaleString()} ${world.uses === 1 ? 'space' : 'spaces'}`}
            {world.approvedAt && ' · a match has been played through it'}
            {world.placements > world.blocks &&
              ` · ${(world.placements - world.blocks).toLocaleString()} props`}
            {world.forkedFrom && (
              <>
                {' · '}
                <Link href={hrefFor(world.forkedFrom)} className="underline hover:text-ink">
                  forked from another world
                </Link>
              </>
            )}
          </p>
          {world.blurb && <p className="mt-2 max-w-2xl text-sm text-ink-muted">{world.blurb}</p>}
        </div>

        {mine && (
          <Link
            href={
              world.origin === 'platform'
                ? `/ovaloffice/builder?world=${world.id}`
                : `/t/${world.spaceSlug}/builder?world=${world.id}`
            }
            className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface"
          >
            Open in the builder
          </Link>
        )}
      </header>

      {world.labels.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {world.labels.map((label) => (
            <li
              key={label.id}
              className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200"
            >
              {label.badge} · {label.count}
            </li>
          ))}
        </ul>
      )}

      {world.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {world.tags.map((tag) => (
            <li key={tag}>
              <Link
                href={tagHref(tag)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition hover:bg-surface hover:text-ink"
              >
                {tagLabel(tag)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Fixed height rather than an aspect ratio: this is a thing to turn
          round, and a viewport that reflows as the page does is one you lose
          your place in. */}
      <div className="h-[60vh] min-h-80 overflow-hidden rounded-2xl border border-line bg-[oklch(0.14_0.02_285)]">
        <WorldViewer world={world.document} />
      </div>

      <p className="text-xs text-ink-muted">drag to turn · scroll to zoom</p>

      <WorldActions
        id={world.id}
        spaces={spaces}
        canFork={spaces.length > 0}
        intoRoom={intoRoom}
      />

      {signedIn && <ReportWorld id={world.id} mine={myReport} />}

      <p className="text-xs text-ink-muted">
        Using this world copies its blocks into a battlefield of your own. Props
        the block palette has no cube for — furniture, trees, anything that is
        not a block — stay behind; the world itself keeps them, so a fork opened
        in the builder is complete.
      </p>
    </main>
  )
}
