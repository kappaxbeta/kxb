import type { Metadata } from 'next'
import { SceneEditor } from '@/app/ovaloffice/studio/scene-editor'
import { decodeScene } from '@/domain/studio/scene'
import { listPickableWorlds } from '@/domain/worlds/queries'
import { canWrite, hasRole, requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).studio.metaPicture }
}

export const dynamic = 'force-dynamic'

/** One arrangement, one frame. See the note in the video studio about sharing the editors. */
export default async function SpaceImageStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ s?: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  requireFeature(context, 'scenes')

  const { s } = await searchParams

  /**
   * Who may put what they made on the board, from here.
   *
   * The same pair the motion studio resolves, in the same words, because it is
   * the same rule: anybody who can write in the space can pin a picture, and
   * making it *lead* the board stays the space's call. Both are re-checked in
   * `publishPost`; these only decide what is drawn.
   */
  const canPin = hasRole(context, ['owner', 'admin', 'member']) && canWrite(context)
  const canPinTop = hasRole(context, ['owner', 'admin']) && canWrite(context)

  // This space's own worlds and then everybody's shared ones, as sets to compose
  // in. The policy decides which are visible; this only says how many are worth
  // offering, and in which order - see `listPickableWorlds`.
  const worlds = (await listPickableWorlds(context.supabase, context.tenant.id)).map((world) => ({
    id: world.id,
    name: world.name,
    blocks: world.blocks,
    poster: world.poster,
    origin: world.origin,
    // See the same line in the video studio.
    spaceName: world.tenantId === context.tenant.id ? context.tenant.name : world.spaceName,
  }))


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
        <h1 className="text-lg font-medium">{t.pictureTitle}</h1>
        {/* Hidden on a phone. The card on the studio's front door said this
            same sentence a tap ago, and on a 390px screen it is sixty pixels of
            already-read text between the title and the thing itself. */}
        <p className="mt-1 hidden text-sm text-ink-muted sm:block">
          {t.pictureBody}
        </p>
      </header>
      <SceneEditor
        initial={decodeScene(s)}
        worlds={worlds}
        space={{ slug, canPin, canPinTop }}
      />
    </section>
  )
}
