import type { Metadata } from 'next'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { OccupancyBeacon } from '@/app/world/_presence/occupancy-beacon'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { listBattlefields } from '@/domain/battlefields/queries'
import { loungeProjection } from '@/domain/lounge/projection'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import { loungeImagesProjection } from '@/domain/lounge/image-projection'
import { listLoungeImages } from '@/domain/lounge/image-queries'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readLookFor, shopFor } from '@/domain/skins/queries'
import { readSceneIdentity } from '@/domain/guests/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { findWorldSpawn } from '@/domain/worlds/queries'
import { runProjection } from '@/es/projection'
import {
  battleOpen,
  canWrite,
  hasRole,
  isGuest,
  perfDisplayOn,
  requireFeature,
  requireTenant,
} from '@/lib/tenant'
import { readLocale } from '@/app/i18n/preference'
import { worldDict } from '@/app/i18n/world'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: worldDict(await readLocale()).meta.lounge }
}

export const dynamic = 'force-dynamic'

/**
 * The lounge: one shared voxel world per workspace.
 *
 * It lives under /t/[slug] like everything else, which is what makes it part of
 * what the workspace pays for - the same €20/month, the same unlimited members,
 * and the same read-only behaviour if billing lapses.
 */
export default async function LoungePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, { guests: true })
  const { supabase, tenant, user } = context

  requireFeature(context, 'lounge')

  // Catch up before rendering, so a world someone else built is present on
  // first load rather than after the first edit.
  // Two projections, two aggregates: chunk streams for the blocks, one stream
  // per image. They share a tenant but never a checkpoint.
  //
  // The avatar used to need a third run here. It is a plain profile row now, so
  // there is nothing to fold - it is just read alongside the rest.
  await runProjection(supabase, loungeProjection, tenant.id)
  await runProjection(supabase, loungeImagesProjection, tenant.id)
  // A third aggregate, and a third checkpoint: the goals people have stood in the
  // world. They are drawn in every mode, so this runs unconditionally rather than
  // behind the battle flag - a pitch laid down last week should still have its
  // goals when somebody wanders in to build.
  await runProjection(supabase, loungeGoalsProjection, tenant.id)

  // Saved arenas, for the panel that swaps one into the lounge. Only when the
  // battle feature is on for this caller - without it there are no arenas to
  // save to or load from, and the projection run would be work for nothing.
  if (battleOpen(context)) {
    await runProjection(supabase, battlefieldsProjection, tenant.id)
  }

  const [blocks, images, goals, avatar, name, arenas] = await Promise.all([
    listLoungeBlocks(supabase, tenant.id),
    listLoungeImages(supabase, tenant.id),
    // The lounge's own world id is the tenant id - see `worldOf`.
    listGoals(supabase, tenant.id, tenant.id),
    readProfileAvatar(supabase, user.id),
    readDisplayName(supabase, user.id),
    battleOpen(context)
      ? listBattlefields(supabase, tenant.id)
      : Promise.resolve([]),
  ])

  /**
   * A guest is not in `user_profiles`, so the name and body they chose at the
   * door live in `tenant_guests` instead. For a member this finds no row and
   * hands back exactly what was read above.
   */
  const identity = await readSceneIdentity(supabase, tenant.id, user.id, { name, avatar })

  /**
   * The body, which is a question about the account rather than about this
   * space - see `readLookFor`. An anonymous visitor is the dummy; anybody with
   * an account is whatever they chose, member here or not.
   *
   * The nameplate still comes from `identity`, so a guest keeps the name they
   * gave at the door. What changes is only what is standing under it.
   */
  const look = await readLookFor(supabase, user, tenant.id)

  /**
   * The wardrobe's other half, for anybody who has one.
   *
   * Read here rather than inside the scene because the scene is a client
   * component over a running world - one more fetch on mount is one more thing
   * happening while the canvas is trying to start. A guest owns nothing, so
   * this is an empty list and the picker is the animal grid it always was.
   */
  const wardrobe = user.is_anonymous ? null : await shopFor(supabase, user.id)
  const ownedSkins = (wardrobe?.skins ?? [])
    .filter((skin) => wardrobe?.owned[skin.id])
    .map((skin) => ({ id: skin.id, name: skin.name }))

  // The lounge's world id is the tenant's own. A space that has never set a
  // door gets null and everybody keeps arriving in the middle.
  const spawnAt = await findWorldSpawn(supabase, tenant.id)

  return (
    <>
      {/*
        The lounge is a world too, so it heartbeats like a room does. It has no
        cap of its own - `guest_limit` is what bounds the space - but the
        beacon is what makes walking *out* of a room free its place at once
        rather than twenty seconds later, because `touch_occupancy` clears
        whichever other world this person was counted in.
      */}
      <OccupancyBeacon tenantId={tenant.id} worldId={tenant.id} />
      <LoungeScene
      slug={slug}
      initialBlocks={blocks}
      initialImages={images}
      initialGoals={goals}
      readOnly={!canWrite(context)}
      /**
       * A guest walks.
       *
       * Flight otherwise defaults to `readOnly`, which is the showcase rule -
       * somebody who cannot touch anything drifts through the room like an
       * observatory. That is right for `/v/[slug]`, where the visitor is a
       * disembodied camera and nobody can see them.
       *
       * A guest is the opposite of that: they have a body, a nameplate, and
       * other people looking at them. Inheriting the camera's rule let them
       * float over a room everybody else is standing in, which reads as a bug
       * to every member watching and as a cheat in a match.
       */
      canFly={isGuest(context) ? false : undefined}
      canModerate={hasRole(context, ['owner', 'admin'])}
      mode={tenant.loungeMode}
      // Same pair the decider will re-check. This only decides whether the
      // button is offered; SetLoungeMode is where the answer is enforced.
      canSetMode={hasRole(context, ['owner', 'admin'])}
      arenas={arenas.map((arena) => ({ worldId: arena.worldId, name: arena.name }))}
      /*
       * The way to the catalogue, from inside the world.
       *
       * This is where somebody standing in a room thinks "we should be
       * somewhere better", and until now the only doors out were the sidebar
       * and a page they had no reason to visit. Only when the flag is on -
       * without it the link is a 404.
       */
      worldsHref={context.features.worlds ? `/t/${slug}/worlds` : undefined}
      spawnAt={spawnAt ?? undefined}
      avatar={look}
      animal={identity.avatar}
      skins={ownedSkins}
      wearingSkin={wardrobe?.chosen && look === wardrobe.chosen ? wardrobe.chosen : null}
      /*
        Measuring, when an operator has turned it on for this space. Off for
        everybody by default, and invisible in the room either way - see the
        `perf` flag in src/domain/flags/keys.ts.
      */
      perf={context.features.perf}
      /* And whether this space asked to see the numbers itself. Two switches,
         two owners: the flag is ours, the readout is theirs. */
      perfReadout={perfDisplayOn(context)}
      /*
        Cameras, when an operator has turned them on for this space. Off for
        everybody by default - see the `faces` flag in src/domain/flags/keys.ts
        - and off is the whole feature being absent rather than merely quiet:
        no switch in the HUD, and no signalling on the room's channel.
      */
      faces={context.features.faces}
      presence={{
        tenantId: tenant.id,
        userId: user.id,
        // The handle, which is what members see each other by everywhere else.
        // The wire format did not have to change for this - presence carries a
        // name rather than deriving one, which is exactly the seam this needed.
        name: identity.name,
      }}
      />
    </>
  )
}
