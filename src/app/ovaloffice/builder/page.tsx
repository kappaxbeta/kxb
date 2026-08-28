import Link from 'next/link'
import { WorldBuilder } from '@/app/ovaloffice/builder/world-builder'
import { creditFor } from '@/domain/worlds/credit'
import { findWorld } from '@/domain/worlds/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'World builder' }

/**
 * Where a world gets built.
 *
 * The guard runs here and not only in the layout, exactly as every other
 * backoffice page does: a layout does not re-run for a Server Action and can be
 * skipped by a direct request.
 *
 * `?world=` is the one thing that makes this page dynamic. Without it the
 * editor is what it always was - a working file in the browser, see
 * `@/domain/builder/world`. With it, the editor is open on a row in the
 * catalogue, and everything the panel offers changes: Save writes back, and the
 * autosave stays out of it.
 *
 * A world published from here is credited to the kxb.team team rather than to
 * the admin who drew it - see `PLATFORM_CREDIT`.
 */
export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ world?: string }>
}) {
  const { supabase } = await requireBackofficeSection('builder')
  const { world: worldId } = await searchParams

  // Read through the caller's own client, not the service-role one. A
  // backoffice admin may edit any world - that is what the update policy says -
  // and reading as themselves is what makes that a decision the database is
  // making rather than one this page assumed.
  const opened = worldId ? await findWorld(supabase, worldId) : null

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-medium">
          {opened ? `Editing “${opened.name}”` : 'World builder'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Draw a place out of every model we ship — walls, circles, rooms and
          wordmarks, a drag at a time. Export the frame as a PNG for an advert,
          publish it to{' '}
          <Link href="/worlds" className="underline hover:text-foreground">
            the catalogue
          </Link>{' '}
          for spaces to stand in, or copy a view link to send somebody the world
          itself.
        </p>
      </header>

      {/*
        Touch works, and is still second best. Said rather than enforced.

        One finger draws, two pinch and pan, and the two modifiers that have no
        key on a phone - look and erase - are buttons on the viewport. What a
        phone cannot give back is the rest of the keyboard: the tool letters,
        the level nudges, the arrow-key pan. So this is a real "you can build
        here", not a claim that it is the same tool.
      */}
      <p className="mb-4 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground xl:hidden">
        On a phone: one finger draws, two fingers pinch and pan, and the buttons
        on the picture are look and erase. The panel is below the viewport, and
        the keyboard shortcuts are the thing you are missing.
      </p>

      <WorldBuilder
        scope={{ kind: 'platform' }}
        opened={
          opened && {
            id: opened.id,
            blurb: opened.blurb,
            tags: opened.tags,
            visibility: opened.visibility,
            // A backoffice admin may write to any row in this table, so there
            // is no world they are offered a fork of instead of a save.
            mine: true,
            credit: creditFor(opened),
          }
        }
        openedWorld={opened?.document ?? null}
      />
    </section>
  )
}
