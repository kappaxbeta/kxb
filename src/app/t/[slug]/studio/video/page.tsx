import type { Metadata } from 'next'
import { ShotEditor } from '@/app/ovaloffice/studio/shot-editor'
import { findScene } from '@/domain/scenes/queries'
import { listPickableWorlds } from '@/domain/worlds/queries'
import { listBlueprints } from '@/domain/thingiverse/queries'
import { decodeShot } from '@/domain/studio/shot'
import { canWrite, hasRole, requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).studio.metaVideo }
}

export const dynamic = 'force-dynamic'

/**
 * The motion studio, in a space.
 *
 * The same editor the backoffice uses, which is the point: there is one place
 * that knows what a shot *is*, and a second copy for spaces would be two
 * renderers to keep in step and two parsers to keep agreeing. What differs is
 * the scope a save goes into - `{ kind: 'space' }` here against
 * `{ kind: 'platform' }` there.
 *
 * The editor components still live under `app/ovaloffice/studio`, which is the
 * wrong address for them now that they are shared. Left alone deliberately:
 * moving them renames a dozen imports across two features, and that is worth
 * doing when something is already touching them rather than as a change of its
 * own.
 *
 * `?scene=` opens a saved row as itself, so saving writes over it; `?v=` opens
 * a document straight out of a link. A `?v=` document that gets saved becomes a
 * `?scene=` one at that moment and stays there - the editor only carries the
 * document in the address while there is no row to name instead. See the note
 * on `onSaved` in the shot editor for what that was costing.
 */
export default async function SpaceVideoStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ v?: string; scene?: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  requireFeature(context, 'scenes')

  const { v, scene } = await searchParams

  /**
   * Who may put what they made on the board, from here.
   *
   * Anybody who can write in the space can pin a scene - that is the whole
   * point of moving the act into the studio, and it is why the board's
   * composer no longer carries a scene picker. Making it *lead* the board is
   * still the space's call, so the checkbox for that is admin-only. Both are
   * re-checked in `publishPost`; these only decide what is drawn.
   */
  const canPin = hasRole(context, ['owner', 'admin', 'member']) && canWrite(context)
  const canPinTop = hasRole(context, ['owner', 'admin']) && canWrite(context)

  /**
   * The space's shelf, for props that are whole things rather than one model.
   *
   * Only where the space has the thingiverse at all: the feature is off by
   * default, and a studio in a space without it simply gets an empty list and
   * no picker. Trimmed to what the editor draws with - a name to choose by and
   * the spec to draw from - because the view also carries ownership and
   * moderation fields that are the rail's business and not a shot's.
   */
  const blueprints = context.features.thingiverse
    ? (await listBlueprints(context.supabase, context.tenant.id, context.user.id)).map(
        (one) => ({ id: one.id, name: one.name, spec: one.spec }),
      )
    : []

  /** The same list the picture studio offers, for the same reason. */
  const worlds = (await listPickableWorlds(context.supabase, context.tenant.id)).map((world) => ({
    id: world.id,
    name: world.name,
    blocks: world.blocks,
    poster: world.poster,
    origin: world.origin,
    // Named rather than left null for this space's own worlds: `listSpaceWorlds`
    // does not attach names, and the picker draws "a space" when it has none -
    // which is a strange thing to be told about the space you are standing in.
    spaceName: world.tenantId === context.tenant.id ? context.tenant.name : world.spaceName,
  }))

  if (scene !== undefined) {
    const saved = await findScene(context.supabase, scene)
    if (saved) {
      return (
        // Wide for the same reason as the empty studio below: this is the same
        // editor with a document already in it.
        <section className="mt-6" data-surface="wide">
          <header className="mb-4">
            <h1 className="text-lg font-medium">{saved.name}</h1>
            {saved.blurb && <p className="mt-1 text-sm text-ink-muted">{saved.blurb}</p>}
          </header>
          <ShotEditor
            initial={saved.document}
            scene={{
              scope: { kind: 'space', slug },
              id: saved.id,
              name: saved.name,
              blurb: saved.blurb ?? '',
              visibility: saved.visibility,
              canPin,
              canPinTop,
            }}
            worlds={worlds}
            blueprints={blueprints}
          />
        </section>
      )
    }
  }


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
        <h1 className="text-lg font-medium">{t.videoTitle}</h1>
        {/* Hidden on a phone. The card on the studio's front door said this
            same sentence a tap ago, and on a 390px screen it is sixty pixels of
            already-read text between the title and the thing itself. */}
        <p className="mt-1 hidden text-sm text-ink-muted sm:block">
          {t.videoBody}
        </p>
      </header>
      <ShotEditor
        initial={decodeShot(v)}
        scene={{ scope: { kind: 'space', slug }, canPin, canPinTop }}
        worlds={worlds}
        blueprints={blueprints}
      />
    </section>
  )
}
