import type { Metadata } from 'next'
import Link from 'next/link'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'
import { ClipStudio } from '@/app/t/[slug]/thingiverse/clips/clip-studio'
import { isSkinLook } from '@/domain/lounge/avatars'
import { readLookFor } from '@/domain/skins/queries'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { coinsOf, nextPrice } from '@/domain/bank/next'
import { countClips, findClipDoc, listClips } from '@/domain/thingiverse/queries'
import { runProjection } from '@/es/projection'
import { requireTenant, requireThingiverse } from '@/lib/tenant'

export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).thingiverse.clips.heading }
}

export const dynamic = 'force-dynamic'

/**
 * The pose editor, inside a space.
 *
 * The animator has existed for a while in the backoffice and had nowhere to put
 * anything: it posed the dummy, baked the keys and handed back a `.glb` you
 * kept wherever you keep files. So every animation a blueprint could name came
 * out of a pack we ship, and a thing doing anything specific was a thing
 * somebody had to be talked out of.
 *
 * This is the same editor with a shelf under it. Same component, imported
 * outright rather than copied - the precedent is /t/[slug]/builder, which
 * imports the backoffice's world builder and says why at length: a component is
 * a component, and where it sits in the route tree is not a boundary. What
 * differs between the two surfaces is one prop.
 *
 * ---------------------------------------------------------------------------
 * Why the editor is handed the body somebody actually wears
 * ---------------------------------------------------------------------------
 * Posing a grey mannequin and then watching the clip play on a knight is a
 * small constant translation somebody has to do in their head, and the two are
 * not even the same shape - an arm that cleared the body on the dummy can end
 * up inside a pauldron. The skins share the dummy's skeleton *exactly*, every
 * bone name down to `handslot.r`, so this is a different file on one rig and
 * nothing else changes.
 */
export default async function ClipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { slug } = await params
  const { edit } = await searchParams

  const context = await requireTenant(slug)
  requireThingiverse(context)

  const { supabase, tenant, user } = context
  const t = workspaceDict(await readLocale()).thingiverse

  await runProjection(supabase, thingiverseProjection, tenant.id)

  const [clips, look] = await Promise.all([
    listClips(supabase, tenant.id, user.id),
    readLookFor(supabase, user, tenant.id),
  ])

  /**
   * The clip being reopened, if the URL names one.
   *
   * Read here rather than by the client, because it is the one thing on this
   * page that is not already in `clips`: the authoring document is as large
   * again as the samples and nothing but this editor has any use for it, so it
   * is left out of the list and fetched by id. See `findClipDoc`.
   *
   * A stray id resolves to null and opens a blank editor rather than a 404: the
   * page is still the page, and the thing somebody wanted is simply not there.
   */
  const opened = edit ? await findClipDoc(supabase, tenant.id, edit) : null

  /*
    What keeping a *new* clip costs, from the same helper `saveClip` charges
    from. Counted with `countClips` and not `clips.length`: the list is filtered
    to what this person may see, and a quota is about what the space holds.
  */
  const price = coinsOf(
    await nextPrice(supabase, tenant.id, tenant.tier, 'clips', await countClips(supabase, tenant.id)),
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold text-ink">{t.clips.heading}</h1>
          <Link
            href={`/t/${slug}/thingiverse`}
            className="text-xs text-ink-muted underline decoration-line hover:text-ink"
          >
            {t.heading}
          </Link>
        </div>
        <p className="max-w-2xl text-sm text-ink-muted">{t.clips.intro}</p>
      </header>

      <ClipStudio
        slug={slug}
        clips={clips}
        price={price}
        t={t.clips}
        editing={edit && opened ? { id: edit, name: opened.name, doc: opened.doc } : null}
        /*
          Only when it is a skin. `look` is what the room draws and can be an
          animal - `isSkinLook` is the same test the lounge uses - and an animal
          id handed to a rig that expects `/xp/packs/<id>.glb` is a 404 in the
          middle of the editor.
        */
        skin={isSkinLook(look) ? look : null}
      />
    </div>
  )
}
