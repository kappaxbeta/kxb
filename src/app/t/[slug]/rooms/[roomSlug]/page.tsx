import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MidRound } from '@/app/t/[slug]/rooms/[roomSlug]/mid-round'
import { RoomFull } from '@/app/t/[slug]/rooms/[roomSlug]/room-full'
import { XpRoom } from '@/app/t/[slug]/rooms/[roomSlug]/xp-room'
import { PlaySession } from '@/app/xp/_runtime/net/play-session'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { OccupancyBeacon } from '@/app/world/_presence/occupancy-beacon'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { listBattlefields } from '@/domain/battlefields/queries'
import { guestMay } from '@/domain/events/queries'
import { admitToRoom } from '@/domain/rooms/admission'
import { touchRoom } from '@/domain/rooms/marks'
import { loungeProjection } from '@/domain/lounge/projection'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { readProfileSkin } from '@/domain/skins/queries'
import { readSceneIdentity } from '@/domain/guests/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { roomsProjection } from '@/domain/rooms/projection'
import { findRoom, findRoomBySlug, type RoomView } from '@/domain/rooms/queries'
import { findWorldSpawn } from '@/domain/worlds/queries'
import { parseXpRef, type XpRef } from '@/domain/xps/ref'
import { loadPlayableXp } from '@/domain/xps/playable'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import {
  battleOpen,
  canWrite,
  chatOpen,
  hasRole,
  isGuest,
  perfDisplayOn,
  requireFeature,
  requireTenant,
  xpOpen,
} from '@/lib/tenant'
import { fill } from '@/app/i18n/fill'
import type { Locale } from '@/domain/i18n/locale'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

export const metadata: Metadata = {
  title: 'Room',
}

export const dynamic = 'force-dynamic'

/**
 * One of the space's extra rooms.
 *
 * Almost exactly the lounge page, and deliberately so - a room *is* a lounge,
 * standing somewhere else. Two things differ, and they are the two things that
 * make it a different place rather than a different view:
 *
 *   - the world it reads blocks from is the room's, not the tenant's;
 *   - `presence.roomId` puts it on `hall:<roomId>`, so the people in it are not
 *     the people in the lounge.
 *
 * There is still no images panel: a picture belongs to the space's one shared
 * album, and duplicating it per room would mean an upload in one appearing in
 * none of the others. The arena list is not that - it is tenant-wide already,
 * the same `arenas` the lounge page below fetches with `listBattlefields` - so
 * a room gets it too. `presence.roomId` (set below) is what tells
 * `LoungeScene` to offer saving and loading here as well as in the lounge -
 * see the `worlds` gate in ../../../world/lounge/lounge-scene.tsx.
 */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string; roomSlug: string }>
}) {
  const { slug, roomSlug } = await params
  const context = await requireTenant(slug, { guests: true })
  const { supabase, tenant, user } = context

  requireFeature(context, 'lounge')

  await runProjection(supabase, roomsProjection, tenant.id)

  const room = await resolve(supabase, tenant.id, slug, roomSlug)
  // Not found *or* not ours. A room from another space must 404 rather than
  // confirm it exists - the same rule `assertOwned` follows on the write side.
  if (!room || room.tenantId !== tenant.id) notFound()

  /**
   * The door.
   *
   * Only ever consulted for somebody who is not already inside - `alreadyHere`
   * is the difference between "this room is full" and "this room is full and
   * you are one of the people filling it". Without that check a refresh would
   * bounce somebody out of the room they are standing in, which is the most
   * confusing possible failure and the easiest one to write.
   */
  const capacity = await admitToRoom(supabase, {
    tenantId: tenant.id,
    userId: user.id,
    room,
    event: context.event,
    canMintRoom:
      hasRole(context, ['owner', 'admin']) ||
      guestMay(context.event, tenant.capabilities, 'rooms'),
  })

  // Somewhere else has space: go there instead of standing at a closed door.
  // A redirect rather than a page, because the answer is a room and the URL
  // should say which one - a "we put you in Hall 3" page that stays at Hall 2's
  // address is a back button that does the wrong thing.
  if (capacity.kind === 'elsewhere') {
    redirect(`/t/${slug}/rooms/${capacity.room.slug}`)
  }

  /*
   * A hand is being played and this person was not dealt into it.
   *
   * Its own page rather than the full-room one, because the wait is different
   * and so is the advice: a full room may never have space, and a round ends.
   * What it offers is the way back and the door itself - reopening was always
   * any member's to do, and this is the page where the person who wants it is
   * standing. See the note in `MidRound`.
   */
  if (capacity.kind === 'mid_round') {
    return <MidRound slug={slug} roomId={room.roomId} roomName={room.name} />
  }

  if (capacity.kind === 'full') {
    return (
      <RoomFull
        slug={slug}
        room={room}
        rooms={capacity.rooms}
        occupancy={capacity.occupancy}
        canOverflow={capacity.canOverflow}
      />
    )
  }

  /**
   * Remember that this person was in here.
   *
   * Below every refusal above, and that ordering is the whole correctness of
   * it: somebody redirected to another room, held outside a round, or turned
   * away from a full one did not visit this room, and a rail that floated rooms
   * to the top on the strength of a refused knock would be ordering by where
   * you were turned away.
   *
   * Awaited rather than left floating, which is the opposite of what it looks
   * like it should be. A fire-and-forget write in a server component races the
   * response: the render finishes, the request is torn down, and the insert may
   * or may not have left the process - so the room you visit least reliably is
   * the one you leave quickest. It is one upsert on a connection this page has
   * already used half a dozen times, and `touchRoom` returns a boolean rather
   * than throwing, so the cost of certainty here is a millisecond and no new
   * failure mode.
   */
  await touchRoom(supabase, tenant.id, user.id, room.roomId)

  /**
   * A room that is a level draws the level, and stops here.
   *
   * Before the lounge projections and the four reads under them, because none
   * of them apply: an XP room has no blocks, no goals and no arena picker, and
   * running them would be work whose results nothing renders.
   *
   * Everything *around* the room is untouched and that is the point of a level
   * being a room rather than a thing beside one - the door above admitted this
   * person, the chat rail is on this room's `room_id`, the visitor list is the
   * space's, and closing it is the ordinary close.
   *
   * The tier is checked here rather than trusted to the row: a space that had
   * xp and then dropped to xo still has the room, and what it must not have is
   * the level inside it. `RoomMissingXp` says so with the way out, exactly as
   * the match room does for a document that will not load.
   */
  if (room.xpRef) {
    if (!xpOpen(context)) {
      return <XpUnavailable slug={slug} room={room} locale={await readLocale()} />
    }

    const ref = parseXpRef(room.xpRef)
    const document = await loadPlayableXp(supabase, tenant.id, room.xpRef)
    if (!document) {
      return (
        <XpUnavailable
          slug={slug}
          room={room}
          parsedRef={ref}
          locale={await readLocale()}
        />
      )
    }

    const [avatar, name, skin] = await Promise.all([
      readProfileAvatar(supabase, user.id),
      readDisplayName(supabase, user.id),
      // The equipped skin, for the XP body only. Deliberately not folded into
      // the identity: nameplates, rails and the guest roster draw animals and
      // their pre-rendered shots, and a qualified skin id has no shot to draw.
      readProfileSkin(supabase, user.id),
    ])
    const identity = await readSceneIdentity(supabase, tenant.id, user.id, { name, avatar })

    return (
      <>
        <OccupancyBeacon tenantId={tenant.id} worldId={room.roomId} />
        {/*
          Play that happened, written down once it is over.

          docs/xp/creator.md §18.6. Beside the room rather than inside it, and
          the reference rather than the row: a builtin ground is play too, and
          `xpId` above deliberately drops everything a builtin is named by.
        */}
        <PlaySession xpRef={room.xpRef} instance={room.roomId} />
        <XpRoom
          slug={slug}
          tenantId={tenant.id}
          roomId={room.roomId}
          // Whether this space has chat at all. Asked here, where the context
          // is, rather than in the runtime - which has no tenant to ask.
          chat={chatOpen(context)}
          xp={document}
          {...(ref?.kind === 'project' ? { xpId: ref.xpId } : {})}
          me={{ id: user.id, name: identity.name }}
          // The same identity the lounge below is drawn from, so somebody does
          // not change animal by walking through a door - unless they bought a
          // skin, which outranks the animal in an XP and nowhere else. A guest
          // cannot own one, so the door's choice still stands for them.
          avatar={skin ?? identity.avatar}
        />
      </>
    )
  }

  await runProjection(supabase, loungeProjection, tenant.id)
  await runProjection(supabase, loungeGoalsProjection, tenant.id)

  // Saved arenas, for the same picker panel the lounge offers them from - see
  // the note above. Only when the battle feature is on, exactly as the lounge
  // page gates it: without it there is nothing to save to or load from, and
  // the projection run would be work for nothing.
  if (battleOpen(context)) {
    await runProjection(supabase, battlefieldsProjection, tenant.id)
  }

  const [blocks, goals, avatar, name, spawnAt, arenas] = await Promise.all([
    // The room's id is its world id, which is what keeps its blocks out of the
    // lounge's and out of every other room's.
    listLoungeBlocks(supabase, tenant.id, room.roomId),
    listGoals(supabase, tenant.id, room.roomId),
    readProfileAvatar(supabase, user.id),
    readDisplayName(supabase, user.id),
    // Set when this room's world came from the catalogue. Null everywhere else,
    // and everybody keeps arriving in the middle.
    findWorldSpawn(supabase, room.roomId),
    battleOpen(context)
      ? listBattlefields(supabase, tenant.id)
      : Promise.resolve([]),
  ])

  const identity = await readSceneIdentity(supabase, tenant.id, user.id, { name, avatar })

  return (
    <>
      {/*
        Outside the scene rather than inside it, so the heartbeat survives the
        canvas remounting - which it does whenever the mode switches. A beacon
        that restarted with the scene would blink this person out of the count
        for a moment, and at a cap of eight that is somebody else being let in.
      */}
      <OccupancyBeacon tenantId={tenant.id} worldId={room.roomId} />
      <LoungeScene
      slug={slug}
      worldId={room.roomId}
      worldName={room.name}
      spawnAt={spawnAt ?? undefined}
      initialBlocks={blocks}
      initialImages={[]}
      initialGoals={goals}
      readOnly={!canWrite(context)}
      // A guest walks here too, for the reason the lounge page gives at length.
      canFly={isGuest(context) ? false : undefined}
      canModerate={hasRole(context, ['owner', 'admin'])}
      /**
       * The room's own mode, not the space's.
       *
       * This was `mode="creative"` with no switch, because the only mode a room
       * could read was the lounge's - one column on the tenant, which
       * `setLoungeMode` writes - and a switch here would have flipped the lobby
       * and every other room at the same moment. So an owner standing in a room
       * was stuck in creative with nothing to press. A room carries its own
       * now; see the note on `RoomMode`.
       *
       * It still *opens* creative, which is the mode every room has been in
       * since rooms shipped: a room is somewhere somebody deliberately went to
       * build, unlike the lounge, which opens battle because it is where the
       * space turns up to spar.
       */
      mode={room.mode}
      // The same pair `setRoomMode` re-checks. This only decides whether the
      // switch is offered; the action is where the answer is enforced.
      canSetMode={hasRole(context, ['owner', 'admin'])}
      arenas={arenas.map((arena) => ({ worldId: arena.worldId, name: arena.name }))}
      // Carries the room along, so picking a world there loads it straight
      // into this room instead of standing up a new battlefield - see
      // `addWorldToSpace`'s `targetRoomId`.
      worldsHref={
        context.features.worlds ? `/t/${slug}/worlds?room=${room.roomId}` : undefined
      }
      avatar={identity.avatar}
      /* Rooms are measured on the same switch the lounge is - they are the
         same scene on a `hall:` topic. See the lounge page. */
      perf={context.features.perf}
      perfReadout={perfDisplayOn(context)}
      presence={{
        tenantId: tenant.id,
        userId: user.id,
        name: identity.name,
        roomId: room.roomId,
      }}
      />
    </>
  )
}

/**
 * The URL segment, resolved to a room.
 *
 * A name normally - `/t/acme/rooms/workshop` - which is unique per space among
 * open rooms and so identifies exactly one.
 *
 * A uuid is the old shape of this URL, from before rooms were addressed by
 * name, and it is looked up by id and redirected rather than 404ed: those links
 * are sitting in people's chat histories and in guest links, and a dead link to
 * a room that is standing right there is a worse answer than a redirect. Note
 * the check is `looksLikeUuid` rather than "the name lookup missed" - a room
 * genuinely called by a uuid-shaped name cannot exist, because `roomSlug` only
 * ever produces one for a name that slugifies to nothing, in which case the id
 * *is* the address and the redirect below is a no-op it never reaches.
 */
async function resolve(
  supabase: Client,
  tenantId: string,
  slug: string,
  segment: string,
): Promise<RoomView | null> {
  if (!UUID.test(segment)) return findRoomBySlug(supabase, tenantId, segment)

  const room = await findRoom(supabase, segment)
  if (!room || room.tenantId !== tenantId) return null
  if (room.slug === segment) return room

  redirect(`/t/${slug}/rooms/${room.slug}`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A room whose level cannot be opened.
 *
 * Four causes, and three of them share one answer: the space moved off the
 * tier, the project's release was withdrawn, or the document no longer
 * parses. None of those has an action for the person standing at the door,
 * and all three are recoverable by going somewhere else - so this says what
 * happened and points at the rooms list, rather than 404ing a room that
 * demonstrably exists.
 *
 * The fourth is different and worth telling apart: `version === 0` is not
 * a level that *was* taken down, it is one that was never up - a project
 * pinned to a room before its first save (`playable.ts`'s `versionFor` now
 * keeps this from happening again, but an existing room can already be stuck
 * this way). "It may have been taken down" would send whoever reads it
 * looking for something that never existed; the honest answer is that there
 * is nothing to load *yet*, and the way out is to go save the level, not to
 * go elsewhere.
 */
function XpUnavailable({
  slug,
  room,
  parsedRef,
  locale,
}: {
  slug: string
  room: RoomView
  /** Absent when the tier itself is closed - there was nothing to parse yet. */
  parsedRef?: XpRef | null
  /** Resolved by the page. A server component, so there is no context to read. */
  locale: Locale
}) {
  const t = workspaceDict(locale).rooms
  const neverSaved = parsedRef?.kind === 'project' && parsedRef.version === 0

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        {t.levelLabel}
      </p>
      <h1 className="mt-2 text-2xl font-medium">
        {fill(t.notOpen, { name: room.name })}
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        {neverSaved ? t.neverSaved : t.cannotLoad}
      </p>
      {neverSaved && parsedRef?.kind === 'project' ? (
        <Link
          href={`/t/${slug}/studio/xp/${parsedRef.xpId}`}
          className="mt-4 inline-block text-sm text-accent hover:underline"
        >
          {t.openInEditor}
        </Link>
      ) : null}
      <Link
        href={`/t/${slug}/rooms`}
        className="mt-6 block text-sm text-accent hover:underline"
      >
        ← Rooms
      </Link>
    </main>
  )
}
