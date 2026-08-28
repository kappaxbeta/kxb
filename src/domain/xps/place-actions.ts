'use server'

import { cancelBattle, createBattle } from '@/domain/battle/actions'
import type { BattleMode } from '@/domain/battle/events'
import { listBattles } from '@/domain/battle/queries'
import { closeStaleBattles } from '@/domain/battle/sweep'
import { readShelf, type Shelf } from '@/domain/magazine/shelf'
import { listPlayableXps } from '@/domain/xps/playable'
import { duplicateXp, remixXp } from '@/domain/xps/actions'
import { formatXpRef, parseXpRef } from '@/domain/xps/ref'
import { closeRoom, createXpRoom, setRoomXp } from '@/domain/rooms/actions'
import { listRooms } from '@/domain/rooms/queries'
import { battleOpen, requireTenant, writeBlockedReason, xpOpen } from '@/lib/tenant'

/**
 * Opening an XP from inside the world, rather than from a page about it.
 *
 * ---------------------------------------------------------------------------
 * What this is for
 * ---------------------------------------------------------------------------
 * docs/xp/backlog.md §11.5. The store is a page you leave the place to visit:
 * somebody standing in the lounge with three other people, who wants to play
 * the level one of them built this morning, has to walk out to `/browse`, find
 * it, and come back through a wizard. This is the other door - the rail's Play
 * tab lists what the space can play and opens one where you are standing.
 *
 * ---------------------------------------------------------------------------
 * Fetched on open, and not with the rail
 * ---------------------------------------------------------------------------
 * The obvious place for this list is the layout, beside the rooms and the
 * radio, and it is the wrong one: the layout renders on *every page in the
 * space*, and this is three queries for a tab most visits never open. So it is
 * an action the tab calls the first time it is shown, which costs one round
 * trip on a click and nothing at all on every other page.
 *
 * That is also why the list is not revalidated: a rail is not a page, and this
 * is the shape the scene HUDs already use (see the note in `chat-rail`). The
 * tab holds what it fetched and asks again when it is reopened.
 *
 * ---------------------------------------------------------------------------
 * Three states, and the third is the one worth building for
 * ---------------------------------------------------------------------------
 * §11.5 asks for attachable, creatable, and *visible but neither* - and says
 * the third must say why without reading as an error. So this returns the list
 * and the refusal separately rather than an empty list:
 *
 *   - `xpOpen` false → **no tab at all.** The caller does not render it, which
 *     is `requireFeature`'s argument: a tab that explains what it would have
 *     been is an advertisement for something the reader cannot have.
 *   - open, but this space cannot write → the cards render, unpressable, with
 *     the reason underneath. An archived space still gets to look at what it
 *     has; being told "this space is archived" is recoverable, and a button
 *     that fails on click is not.
 *   - open and writable → one press starts a match.
 */

export interface PlayableRail {
  /**
   * The shelf and everything else, already split.
   *
   * Split on the server rather than in the tab, because the rule that decides
   * which half a level is in is not "is its reference in the magazine" - a
   * project saved since it was taken in has a new reference and is still on the
   * shelf. `splitShelf` owns that, once, for both surfaces that draw it.
   */
  magazine: Shelf
  /** References this space is already keeping standing, so the tab can say so. */
  pinned: string[]
  /** Why the open control is dead, or null when it is live. */
  blocked: string | null
}

// `follow: false` for the same reason `readShelfFollow` falls back to it: this
// is the shelf nobody could read, and a shelf that cannot be read must not
// claim to be updating itself.
const NOTHING: Shelf = { inMagazine: [], catalogue: [], hidden: 0, follow: false }

export async function findPlayableXps(slug: string): Promise<PlayableRail> {
  const context = await requireTenant(slug, { guests: true })

  // Not `requireFeature`: this is an action behind a tab the caller already
  // decided to render, and notFound() out of a fetch on a rail would blank the
  // page somebody is standing in. An empty list is the same answer, quietly.
  if (!xpOpen(context) || !battleOpen(context)) {
    return { magazine: NOTHING, pinned: [], blocked: null }
  }

  const blocked = writeBlockedReason(context, { guestsAllowed: true })

  /*
   * The day-later backstop, asked from here as well as from the Battle hub.
   *
   * `closeStaleBattles` is a question somebody's visit asks rather than a job
   * that runs, and it was only ever asked on `/t/[slug]/battle`. That is the
   * one page a space that plays levels never opens: the Play tab starts a match
   * with `openXpHere` and the link goes straight into the match room, so a
   * space using nothing but this rail piled up an `open` match per press and
   * had nowhere to answer the question. So the rail asks it too - this tab is
   * what the hub is for a space that lives in the world.
   *
   * Only when this space may actually write. A read-only space cannot append
   * the closing event, so sweeping there is a query and four refusals.
   *
   * And caught, which the hub deliberately does not do. `closeStaleBattles`
   * lets its own query throw because on `/t/[slug]/battle` an unreadable
   * `battles_read_model` is a page that is about to fail anyway - here it is a
   * table this tab does not otherwise read, and letting it through would mean
   * a broken read model blanks the list of levels as well.
   */
  if (blocked === null) {
    try {
      await closeStaleBattles(context.supabase, context.tenant.id)
    } catch {
      // The next visit asks again - the same bargain the sweep makes per match.
    }
  }

  const [magazine, rooms] = await Promise.all([
    readShelf(context.supabase, context.tenant.id, true),
    // Private ones too: a level kept as an unlisted room is still kept, and the
    // card saying "keep it" for something already standing would open a second.
    listRooms(context.supabase, context.tenant.id, { includePrivate: true }),
  ])

  return {
    magazine,
    pinned: rooms.map((room) => room.xpRef).filter((ref) => ref !== null),
    blocked,
  }
}

export type PinResult = { ok: true } | { ok: false; error: string }

/**
 * Keep this level standing, as a place rather than as a match.
 *
 * ---------------------------------------------------------------------------
 * The other half of §11.5's two controls
 * ---------------------------------------------------------------------------
 * `openXpHere` starts a session. This makes a *place*: a row in the rail beside
 * the rooms, which stays there when the match it opens is over. The distinction
 * is the one the backstop made unavoidable - a match closed after a day is
 * correct for a room two people walked away from and wrong for the level a
 * space keeps standing, and the only way both are right is for the place not to
 * be the match.
 *
 * **A member's, not an owner's.** Same rule as opening a room, and the same
 * reasoning: this is furniture in the commons, and a space where only the owner
 * may put a level out is a space where nobody does. Guests are the exception -
 * `writeBlockedReason` refuses them here without `guestsAllowed`, because a
 * visitor on a link may join what is standing and may not change what a space
 * keeps.
 *
 * The name is the level's own, read from the list rather than taken from the
 * caller. A reference that is not in that list is refused before a row exists,
 * which is what stops a pin naming a private draft in another space.
 */
export async function pinXp(
  slug: string,
  reference: string,
  /**
   * What to call the room. Blank means the level's own name.
   *
   * Optional because the useful default is obvious and typing it again is
   * ceremony - but *editable*, because two spaces keeping the same level want
   * to call it different things, and "Cliffside" is the author's word for it
   * rather than this space's word for the room it is in.
   */
  name?: string,
): Promise<PinResult> {
  const context = await requireTenant(slug)

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  const { xps } = await listPlayableXps(context.supabase, context.tenant.id, true)
  const chosen = xps.find((entry) => entry.ref === reference)
  if (!chosen) return { ok: false, error: 'XP not found' }
  // The author's word, honoured at the door as well as in the rail that hides
  // the button: a level that took `freeplay` off itself is a game and not a
  // place, and a room of it is a room nobody was meant to be able to keep.
  if (!chosen.capabilities.includes('freeplay')) {
    return { ok: false, error: 'This level is set to battles only and cannot be kept as a room' }
  }

  // Trimmed here as well as by the schema, so a name of spaces is the default
  // rather than a validation message about something nobody typed.
  const called = (name ?? '').trim() || chosen.name

  /*
   * The door takes its number from the level, not from the host.
   *
   * §3's argument, and the reason `players` is on the document at all: a board
   * game for four is for four wherever it is opened, and a room whose capacity
   * somebody could raise would be handing the fifth player a seat that does not
   * exist. `createXpRoom` ignores a number a room cannot be capped at.
   */
  const result = await createXpRoom(slug, called, chosen.ref, chosen.players.max)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Take the room down.
 *
 * `closeRoom` rather than a delete, which is the rule rooms already follow and
 * the reason its own event says so: the blocks stay, the chat stays, and a room
 * closed by mistake is a room somebody can be given back. For a level there is
 * even less to lose and the same argument holds - what the space's store held
 * for that level is untouched.
 */
export async function unpinXp(slug: string, reference: string): Promise<PinResult> {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const room = (await listRooms(context.supabase, context.tenant.id, { includePrivate: true }))
    .find((entry) => entry.xpRef === reference)

  if (!room) return { ok: false, error: 'That room is not here' }

  const result = await closeRoom(slug, room.roomId)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Play something else in a room that is already a level.
 *
 * The room stays: same door, same chat, same row in the rail, same people
 * standing in it. Only the game changes. That is the thing a pinned room could
 * not do before - a space that wanted to play something else on Thursday had to
 * take the room down and put another one up, which throws away the room's name,
 * its conversation, and every link anybody had to it.
 *
 * Guarded exactly as `pinXp` is, and for the same two reasons: the reference has
 * to be one this space may actually play, which only `listPlayableXps` can say,
 * and the cap has to come from the level rather than from the caller - see the
 * note there about a board game for four. `setRoomXp` re-checks the role, the
 * ownership and the shape, so a call that skips this wrapper is refused rather
 * than trusted.
 */
export async function swapRoomXp(
  slug: string,
  roomId: string,
  reference: string,
): Promise<PinResult> {
  const context = await requireTenant(slug)

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  const { xps } = await listPlayableXps(context.supabase, context.tenant.id, true)
  const chosen = xps.find((entry) => entry.ref === reference)
  if (!chosen) return { ok: false, error: 'XP not found' }
  // The author's word, honoured at the door as well as in the rail that hides
  // the button: a level that took `freeplay` off itself is a game and not a
  // place, and a room of it is a room nobody was meant to be able to keep.
  if (!chosen.capabilities.includes('freeplay')) {
    return { ok: false, error: 'This level is set to battles only and cannot be kept as a room' }
  }

  const result = await setRoomXp(slug, roomId, chosen.ref, chosen.players.max)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export type CopyForRoomResult = { ok: true; xpId: string } | { ok: false; error: string }

/**
 * Take your own copy of the level a room is playing.
 *
 * docs/xp/backlog.md §1c, asked for as: *"admins and members can both edit —
 * but a member cannot change the instance code. They open the editor, make a
 * copy in the space, change that, and it shows in the room."*
 *
 * ---------------------------------------------------------------------------
 * Nobody edits the room's level, and that is the safe half rather than the
 * inconvenient one
 * ---------------------------------------------------------------------------
 * An edit to a live room's level is an edit under the feet of whoever is
 * standing in it — and the room names a *version* (`p-<uuid>-v3`), so a save
 * would not even reach them until an admin moved the pointer. Copying is not a
 * workaround for a missing permission; it is the only shape of this that is not
 * a trapdoor.
 *
 * ---------------------------------------------------------------------------
 * A member may do this, and it is not a new permission
 * ---------------------------------------------------------------------------
 * `duplicateXp` guards `edit` on the *source*, which is §7.4's ladder and
 * already the right question: a space whose `space_policy` lets members edit
 * its projects lets them copy one, and a space that does not, does not. What
 * this action adds is only the room — that the level being copied is the one
 * actually being played here, rather than an id a caller supplied.
 *
 * So the copy is refused for a member who could not have opened the level in
 * the editor anyway, and no room role is invented to say so. *Aiming* the room
 * stays where it was: `setRoomXp` is owner-or-admin, and this deliberately does
 * not touch it.
 *
 * The reference is read off the room rather than passed in, which is the whole
 * of the trust story here: a `roomId` cannot be turned into a copy of a private
 * draft in another space, because the only id this will copy is the one that
 * room's own row already names.
 */
export async function copyRoomXp(slug: string, roomId: string): Promise<CopyForRoomResult> {
  const context = await requireTenant(slug)

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const room = (await listRooms(context.supabase, context.tenant.id, { includePrivate: true }))
    .find((entry) => entry.roomId === roomId)

  if (!room?.xpRef) return { ok: false, error: 'That room is not playing a level' }

  const ref = parseXpRef(room.xpRef)
  if (!ref) return { ok: false, error: 'That room is not playing a level' }

  /**
   * A builtin is imported rather than copied, and now there is something to
   * import it with.
   *
   * This used to refuse, and the refusal was right at the time: the documents
   * under `public/xp/xps/` are files in the image rather than rows, so there is
   * nothing for `duplicateXp` to read a version out of — and the note here said
   * that making one into a project is *a real feature, an import*, which should
   * not appear quietly behind a button that says "copy".
   *
   * `remixXp` is that feature, with its own name and its own checks. So
   * the branch stays — the two are genuinely different operations, one guarded
   * on a source project and one on the space — and what changes is only that
   * the second one now exists to be called.
   *
   * It matters most for the level that could not be played at all: a room
   * standing on `steal-a-plant` was a room nobody could enter, because the
   * document needs `persistence` and a file has no row to store against. The
   * copy button in that room is now the way out of it.
   */
  if (ref.kind === 'builtin') {
    const made = await remixXp(slug, formatXpRef({ kind: 'builtin', id: ref.id }))
    return made.ok ? { ok: true, xpId: made.xpId } : made
  }

  const made = await duplicateXp(slug, ref.xpId)
  // Renamed on the way out: `copyId` is the copy's id from the copier's point
  // of view, and the rail's next move is a URL - where it is just the xp id.
  return made.ok ? { ok: true, xpId: made.copyId } : made
}

/**
 * A newer version of what this room is playing, if there is one.
 *
 * ---------------------------------------------------------------------------
 * No install table, and that is the decision
 * ---------------------------------------------------------------------------
 * The obvious shape for "so we know which version" is a row per space per
 * level - an install, like an app. This is not that, because **the room already
 * is one**: `rooms_read_model.xp_ref` is `p-<uuid>-v3`, which names the project
 * *and* the version (see `domain/xps/ref.ts` - the version is in the reference,
 * deliberately). A second table saying the same thing is a second thing to keep
 * in step, and the day they disagree a room plays a version the install does not
 * know about.
 *
 * What a table would have bought is updating every room at once. What it costs
 * is that answer being wrong somewhere, and rooms on one level at different
 * versions is a real thing rather than a bug - a space trying a new version in
 * one room while the Friday game keeps the one everybody knows.
 *
 * ---------------------------------------------------------------------------
 * Which version counts as newer
 * ---------------------------------------------------------------------------
 * Asked of `listPlayableXps` rather than resolved here. That list already
 * settles it - a space's own projects at `current_version`, everybody else's at
 * `published_version` - and `queries.ts` says out loud why nothing else may:
 * *"nothing resolves latest here on purpose - a helper that guessed would
 * eventually be called from the store, which is how a draft gets served to the
 * public."* Reusing the one rule means an update can never offer a version the
 * space could not have picked from the list by hand.
 *
 * Null for a builtin, which has no versions to be behind: a file we ship is the
 * file we ship.
 */
export interface RoomUpdate {
  /** The version the room is on now. */
  from: number
  /** The newest this space may play. */
  to: number
  /** What to swap to. */
  ref: string
  /**
   * Whether the newer one is an unpublished draft.
   *
   * Only ever true for a space's own level, and worth saying in the rail rather
   * than hiding: "update" reads like a safer word than it is when the thing on
   * the other end is a level somebody saved four minutes ago.
   */
  draft: boolean
  /** What it is called, so the rail does not have to look it up again. */
  name: string
}

export async function findRoomUpdate(
  slug: string,
  reference: string,
): Promise<RoomUpdate | null> {
  const context = await requireTenant(slug, { guests: true })
  if (!xpOpen(context)) return null

  const here = parseXpRef(reference)
  if (here === null || here.kind !== 'project') return null

  const { xps } = await listPlayableXps(context.supabase, context.tenant.id, true)

  for (const xp of xps) {
    const theirs = parseXpRef(xp.ref)
    if (theirs === null || theirs.kind !== 'project') continue
    if (theirs.xpId !== here.xpId) continue
    // Only forward. A room pinned to v4 while the space may only play v3 - the
    // level was withdrawn, or a release rolled back - is not something to
    // "update" backwards without being asked.
    if (theirs.version <= here.version) return null

    return {
      from: here.version,
      to: theirs.version,
      ref: xp.ref,
      draft: xp.draft,
      name: xp.name,
    }
  }

  return null
}

export type OpenXpResult = { ok: true; battleId: string } | { ok: false; error: string }

/**
 * Start a match inside this XP, named after it.
 *
 * **A thin call on `createBattle` rather than a second way to make one.** Every
 * check that matters is already there and is the boundary - the tier, the
 * feature, the write block, and `playableExists`, which is what stops a
 * reference typed into this action naming a private draft in another space. A
 * parallel path would be a second place for those four to be got right.
 *
 * What this adds is the one answer the rail cannot supply: the **name**, which
 * is the level's own, because a one-press control has nowhere to ask for one -
 * and "Cliffside" is a better match name than "Untitled" for a room nobody was
 * going to rename anyway.
 *
 * The **mode** argument is a placeholder and is documented as one in
 * `createBattle`: a match with an `xpId` on it takes its shape from the
 * document, through `battleModeFor`. It used to be `ffa` *and be believed*,
 * which is what put a level built with two ends into a single undifferentiated
 * pile.
 *
 * The name comes out of the same list the tab was rendered from, so a reference
 * that is not in it is refused here rather than opening a match called after a
 * document this space may not see.
 */
export async function openXpHere(slug: string, reference: string): Promise<OpenXpResult> {
  const context = await requireTenant(slug, { guests: true })

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  const { xps } = await listPlayableXps(context.supabase, context.tenant.id, true)
  const chosen = xps.find((entry) => entry.ref === reference)

  if (!chosen) return { ok: false, error: 'XP not found' }

  // `ffa` is the placeholder the signature needs and not a decision - see
  // above, and `battleModeFor` where the decision is actually made.
  return createBattle(slug, chosen.name, 'ffa', undefined, undefined, undefined, chosen.ref)
}

/**
 * The match this room's level has on right now, if there is one.
 *
 * ---------------------------------------------------------------------------
 * Why a room can have a match at all
 * ---------------------------------------------------------------------------
 * A room and a match are the two different products of one level, and the Play
 * tab already says which is which: a room is furniture that stays until
 * somebody takes it down, a match is a session the backstop closes a day after
 * kick-off. What a room could not do was *be played competitively* - four
 * people standing in a level with two ends had a world and no fixture, and the
 * only way to get one was to leave for the Battle hub and open a second copy of
 * the same level.
 *
 * So the Room tab gets the same two controls the Play tab has, aimed at the
 * room somebody is standing in: run one, or call it off.
 *
 * ---------------------------------------------------------------------------
 * Found by what it is fought in, because there is nothing else to find it by
 * ---------------------------------------------------------------------------
 * A battle carries the reference it is fought in (`xpId`) and a room carries
 * the reference it plays (`xpRef`), and nothing joins the two. That is not an
 * omission to fix with a column: a match is a session and a room is a place,
 * their lifetimes are deliberately different, and a foreign key between them
 * would make closing one an event in the other.
 *
 * What it costs is stated rather than hidden: two rooms playing the *same*
 * level see the same match. That is the honest answer as well as the cheap one
 * - it is one fixture on one level, and telling the second room there is
 * nothing on would have it open a duplicate that splits everybody who turns up.
 *
 * The newest is the one, because `listBattles` is newest-first and a level with
 * two open matches on it is a level somebody opened twice.
 */
export interface RoomMatch {
  battleId: string
  status: 'open' | 'live'
  /** How the sides are drawn, so the rail can say what it will be. */
  mode: BattleMode
  /** Everybody on the roster, for "3 in" rather than "somebody is in". */
  fighters: number
}

export async function findRoomMatch(
  slug: string,
  reference: string,
): Promise<RoomMatch | null> {
  const context = await requireTenant(slug, { guests: true })
  // Both switches, and quietly: this is a rail asking a question, so "no" is an
  // absent control rather than an error in front of somebody standing in a room.
  if (!xpOpen(context) || !battleOpen(context)) return null

  /*
   * Before the question is answered, for the reason the hub sweeps before it
   * lists: this read is the one that would otherwise tell somebody standing in
   * a room that a match is on, pointing at a lobby nobody has been in since
   * yesterday. The rail would then offer to join it instead of to run one.
   *
   * Guarded the same way `findPlayableXps` guards it, and swallowing nothing of
   * its own - the sweep already leaves a row it could not close for the next
   * visitor to ask about.
   */
  if (writeBlockedReason(context, { guestsAllowed: true }) === null) {
    await closeStaleBattles(context.supabase, context.tenant.id)
  }

  const open = await listBattles(context.supabase, context.tenant.id, ['open', 'live'])
  const match = open.find((battle) => battle.xpId === reference)
  if (!match) return null

  return {
    battleId: match.id,
    // Narrowed rather than cast: `listBattles` was asked for these two, and a
    // third status arriving here would be a query that changed under this.
    status: match.status === 'live' ? 'live' : 'open',
    mode: match.mode,
    fighters: match.participants.length,
  }
}

/**
 * Call off the match this room has on.
 *
 * A cancel rather than a whistle, and the difference is what goes in the log:
 * `CancelBattle` records that nothing happened, which is the truthful entry for
 * a fixture somebody turned off, where an `end` would put a game nobody
 * attended in everybody's tally. The room, its name, its chat and its level are
 * all untouched - only the fixture goes.
 *
 * A member's, not an owner's, because it is `cancelBattle` that decides who may
 * and it already refuses anybody who should not. Wrapped rather than called
 * directly from the rail so the room's two controls are one import, and so the
 * reference is checked to be one this space plays before anything is cancelled.
 */
export async function closeRoomMatch(slug: string, reference: string): Promise<PinResult> {
  const match = await findRoomMatch(slug, reference)
  if (!match) return { ok: false, error: 'Nothing is on in here' }

  const result = await cancelBattle(slug, match.battleId)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
