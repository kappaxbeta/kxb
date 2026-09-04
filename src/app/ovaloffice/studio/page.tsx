import { HeroEditor } from '@/app/ovaloffice/studio/hero-editor'
import { SceneEditor } from '@/app/ovaloffice/studio/scene-editor'
import { ShotEditor } from '@/app/ovaloffice/studio/shot-editor'
import { decodeHero } from '@/domain/studio/hero'
import { decodeScene } from '@/domain/studio/scene'
import { decodeShot } from '@/domain/studio/shot'
import { findScene } from '@/domain/scenes/queries'
import { listPublicWorlds } from '@/domain/worlds/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Scene studio' }

/**
 * Where the marketing renders get composed.
 *
 * The guard runs here and not only in the layout, exactly as every other
 * backoffice page does: a layout does not re-run for a Server Action and can be
 * skipped by a direct request.
 *
 * The scene itself arrives in the query string - see the note in
 * `@/domain/studio/scene` about why a composition is a link. Read from the
 * `searchParams` prop rather than through `useSearchParams` in the client: the
 * page is already dynamic because it is behind an auth check, so there is
 * nothing to gain from deferring it to the browser, and this way the editor
 * mounts with the scene it is going to draw instead of drawing a default one
 * first.
 *
 * Which editor you get is which key is in the address: `?s=` is a still, `?v=`
 * is a shot and `?h=` is a composed hero. A mode toggle held in state would be
 * the other option and a worse one - the three documents are different shapes,
 * so the toggle would have to either discard the others or keep copies nobody
 * can see. As links they are all just bookmarks, and moving between them is a
 * normal navigation.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; v?: string; h?: string; scene?: string }>
}) {
  const { supabase } = await requireBackofficeSection('studio')
  const { s, v, h, scene } = await searchParams

  /**
   * A saved scene, opened as itself.
   *
   * `?scene=<id>` rather than the document in the address, which is the whole
   * difference between opening a bookmark and opening a *row*: the editor gets
   * the name, the blurb and the id, so pressing save writes over the scene you
   * opened instead of making a second one every time.
   *
   * And it *stays* `?scene=<id>` from then on. It used to not: the editor
   * rewrote the address to the encoded document on the first keystroke, so the
   * two ways of arriving converged - which sounded tidy and meant that a save
   * followed by a reload came back to a document with no row behind it, the
   * panel forgetting it had ever saved and the next press keeping a second
   * scene. Once a scene is what is being edited, the address says so.
   */
  /**
   * The worlds that can be pulled in as a set.
   *
   * Fetched before the branches rather than inside the one that used to need
   * it: both the picture studio and the motion studio offer the same catalogue
   * now, and a `const` declared after an early `return` that references it is a
   * temporal dead zone rather than a clever saving.
   *
   * Both origins, because a platform admin composing a marketing render is as
   * likely to want a set a space built as one of ours. What the policy hides is
   * simply absent from the list.
   */
  const worlds = (await listPublicWorlds(supabase, {})).slice(0, 40).map((world) => ({
    id: world.id,
    name: world.name,
    blocks: world.blocks,
    poster: world.poster,
    origin: world.origin,
    spaceName: world.spaceName,
  }))

  if (scene !== undefined) {
    const saved = await findScene(supabase, scene)
    if (saved) {
      return (
        <section>
          <header className="mb-4">
            <h2 className="text-lg font-medium">{saved.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {saved.blurb || 'A saved scene. Saving writes over this row; the address stays on it.'}
            </p>
          </header>
          <ShotEditor
            initial={saved.document}
            scene={{
              scope: { kind: 'platform' },
              id: saved.id,
              name: saved.name,
              blurb: saved.blurb ?? '',
              visibility: saved.visibility,
            }}
            worlds={worlds}
          />
        </section>
      )
    }
  }

  if (h !== undefined) {
    return (
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-medium">Hero studio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a banner: a sky, blocks drifting through it, a headline you
            can edit, and a still from the scene studio dropped in beside it.
            Reroll the drift until the arrangement lands, then take it away as a
            PNG or record the whole thing as a video.
          </p>
        </header>
        <HeroEditor initial={decodeHero(h)} />
      </section>
    )
  }

  if (v !== undefined) {
    return (
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-medium">Motion studio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give the arrangement a clock: walk the cast about, let them jump and
            emote, move the camera between framings, then record the whole thing
            as a video. The shot lives in this page’s address, same as a still.
          </p>
        </header>
        <ShotEditor
          initial={decodeShot(v)}
          scene={{ scope: { kind: 'platform' } }}
          worlds={worlds}
        />
      </section>
    )
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-medium">Scene studio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Arrange peeps, blocks and light, then export the frame as a PNG with a
          transparent background. The whole scene lives in this page’s address —
          bookmark it to come back to an arrangement.
        </p>
      </header>
      {/* `deco` only here: the button writes into the repo and is admin-only,
          so a space's copy of this editor does not offer it. */}
      <SceneEditor initial={decodeScene(s)} worlds={worlds} deco />
    </section>
  )
}
