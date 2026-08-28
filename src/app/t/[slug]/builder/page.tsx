import type { Metadata } from 'next'
import Link from 'next/link'
import { WorldBuilder } from '@/app/ovaloffice/builder/world-builder'
import { creditFor } from '@/domain/worlds/credit'
import { findWorld, listSpaceWorlds } from '@/domain/worlds/queries'
import { canWrite, hasRole, requireFeature, requireTenant } from '@/lib/tenant'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.builder }
}

export const dynamic = 'force-dynamic'

/**
 * A space's own world builder.
 *
 * The same editor the backoffice uses, imported outright rather than copied.
 * That is worth stating because it looks like a layering violation - a tenant
 * route reaching into /ovaloffice - and the alternative is worse in both
 * available shapes: a second copy of a 700-line editor that drifts within a
 * month, or moving the whole builder into a shared directory and rewriting
 * every import in a feature nobody asked to have touched. The component is a
 * component; where it happens to sit in the route tree is not a boundary.
 *
 * What differs between the two surfaces is one value: `scope`. It decides
 * whether a published world is filed as the platform's or as this space's, and
 * therefore who is credited for it on the discovery page - see
 * `PLATFORM_CREDIT` and the `origin` column.
 *
 * Building is a member's job. Whether a *guest* should be here is a question
 * this page answers by not asking it: `requireTenant` without a guest option
 * admits members only, which is right for a tool whose output is published
 * under the space's name.
 */
export default async function SpaceBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ world?: string }>
}) {
  const { slug } = await params
  const { world: worldId } = await searchParams

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')

  const { supabase, tenant, user } = context

  const opened = worldId ? await findWorld(supabase, worldId) : null

  /**
   * This space's worlds, so the editor can open one.
   *
   * The panel inside offers starters, a slot in this browser and a `.json` off
   * your disk - three ways to open a *file*, and no way to open the thing people
   * actually make here. Reopening something you had built meant leaving for
   * /worlds and coming back through "Open in the builder", which is a route
   * nobody finds from a page that looks like it already has an open dialog on
   * it.
   *
   * Read here rather than inside `WorldBuilder`: that component is shared with
   * the backoffice, takes a document and knows nothing about tenants, and giving
   * it a query would make a shared editor depend on which surface it is on.
   * The page is the part that already knows.
   */
  const yours = await listSpaceWorlds(supabase, tenant.id)
  const t = workspaceDict(await readLocale()).builder

  /**
   * Whether Save writes back, or only Fork is offered.
   *
   * The same sentence the update policy in the migration enforces, spelled out
   * here so the panel can offer the honest pair of buttons rather than a Save
   * that fails. The policy is still the thing that decides - this is only what
   * the page shows.
   */
  const mine =
    !!opened &&
    opened.tenantId === tenant.id &&
    canWrite(context) &&
    (opened.authorId === user.id || hasRole(context, ['owner', 'admin']))

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">
            {opened ? fill(t.editing, { name: opened.name }) : t.heading}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t.bodyLead}
            <Link href="/worlds" className="underline hover:text-ink">
              {t.everybody}
            </Link>
            {t.bodyTail}
          </p>
        </div>
        <Link href={`/t/${slug}/worlds`} className="text-sm hover:underline">
          {t.yourWorlds}
        </Link>
      </header>

      {/*
        Open one of yours, without leaving.

        Names rather than the cards /worlds draws: this is a way back into
        something half-finished, not a second catalogue, and a grid of stills
        above the editor would push the canvas off the screen it needs. The one
        currently open is marked rather than dropped from the row, so the list
        does not reshuffle under the pointer every time somebody opens a
        different world.

        A plain link, so the page loads with the world in it - the editor takes
        its document as a prop, and there is nothing to be gained by fetching it
        client-side into a component that would have to be told to reset.
      */}
      {yours.length > 0 && (
        <nav aria-label={t.openOneLabel} className="mb-4">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {t.openOne}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {yours.map((world) => (
              <li key={world.id}>
                <Link
                  href={`/t/${slug}/builder?world=${world.id}`}
                  aria-current={world.id === opened?.id ? 'page' : undefined}
                  className={`flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                    world.id === opened?.id
                      ? 'border-accent bg-accent/15 text-ink'
                      : 'border-line text-ink-muted hover:border-accent/60 hover:text-ink'
                  }`}
                >
                  <span className="truncate">{world.name}</span>
                  {/* Said out loud, because it is the answer to "why is this one
                      not in the catalogue" and this is where somebody is
                      standing when they ask it. */}
                  {world.visibility === 'private' && (
                    <span className="shrink-0 text-[10px] text-ink-muted/70">{t.draft}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* The same note the backoffice builder carries, and for the same reason. */}
      <p className="mb-4 rounded-lg border border-line bg-surface/40 px-3 py-2 text-xs text-ink-muted xl:hidden">
        {t.touchNote}
      </p>

      <WorldBuilder
        scope={{ kind: 'space', slug }}
        opened={
          opened && {
            id: opened.id,
            blurb: opened.blurb,
            tags: opened.tags,
            visibility: opened.visibility,
            mine,
            credit: creditFor(opened),
          }
        }
        openedWorld={opened?.document ?? null}
      />
    </section>
  )
}
