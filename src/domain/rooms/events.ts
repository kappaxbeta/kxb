import type { DomainEvent } from '@/es/types'

/**
 * A room is another lounge.
 *
 * The space's lounge is the one room everybody shares, and that is exactly its
 * limitation: it is one room. Twelve people who want to do two things have to
 * agree, and the person who wants to build gets a football match through their
 * wall. A room is the answer - the same scene, the same palette, the same
 * everything, standing somewhere else.
 *
 * What it is *not* is a battlefield. The two are close enough to be worth
 * separating out loud:
 *
 *   - A **battlefield** is a saved world you fight *on*. It has no presence of
 *     its own - people meet in it only through a match, which brings its own
 *     roster and its own channel - and it can be published for other spaces to
 *     borrow.
 *   - A **room** is a place you *stand*. It has its own Realtime topic, so the
 *     people in it are separated from the people in the lounge, and it never
 *     leaves the space that made it.
 *
 * Like a battlefield, its blocks are not here. They live where every voxel
 * lives - in the lounge's chunk streams, keyed by `worldId` - and the room's
 * stream id *is* its world id, so there is nothing to store twice and no way
 * for the two to drift apart.
 *
 * Admin-only, deliberately. A room is a shared, persistent, named thing that
 * appears in everybody's sidebar and that nobody else can tidy away; that is
 * the same shape of decision as creating a battlefield or handing out a guest
 * link, and it answers to the same pair.
 */

export const ROOM_STREAM_TYPE = 'room'

export const ROOM_NAME_MAX = 60

/**
 * Who the room is listed to.
 *
 * `'open'` - everybody in the space sees it in the sidebar.
 * `'private'` - only owners and admins see it listed; everybody else is told
 *   where it is, or is not.
 *
 * Unlisted, not sealed. `can_enter_room` still admits anybody in the space, on
 * purpose - see 20260821000000_room_visibility.sql for why a second membership
 * model per room is a much bigger thing than this, and why the UI says
 * "unlisted" rather than "private" to anybody reading it.
 */
export type RoomVisibility = 'open' | 'private'

/**
 * What the room is for right now: building, or scrapping.
 *
 * The same pair the lounge has, and deliberately *not* the same value. The
 * lounge's mode is one column on the tenant, which is why a room could not
 * simply read it: flipping it from inside a room would have put the lobby and
 * every other room into battle mode at the same moment, which is the opposite
 * of why rooms exist. So each room carries its own, and the lounge keeps
 * carrying the space's.
 *
 * A room opens `creative`, which is the mode it has always been rendered in and
 * so is the only default that changes nothing for the rooms already standing.
 * The lounge opens `battle` - a different default for a different place: the
 * one shared room is where people turn up to spar, and a room is somewhere
 * somebody deliberately went to build.
 */
export type RoomMode = 'creative' | 'battle'

export type RoomCreated = DomainEvent<
  'RoomCreated',
  {
    name: string
    createdBy: string
    visibility: RoomVisibility
    /**
     * The level this room is, when it is one.
     *
     * Absent on every room ever opened, which is what `?` says rather than
     * defends against. A room that names a level draws the XP runtime instead
     * of the lounge scene and is otherwise unchanged - same topic, same chat,
     * same door, same place in the sidebar. docs/xp/backlog.md §11.5.
     *
     * Whether the room *is* a level is settled here and never after - see
     * `RoomXpSet`, which can only swap one level for another. A room full of
     * blocks that became a level would strand the blocks, and a level that
     * became a lounge room would strand what the store held for it.
     */
    xpRef?: string
  }
>

/**
 * Another game in the same slot.
 *
 * A room that is a level keeps everything that makes it a place - its topic,
 * its chat, its door, its row in the sidebar, the people standing in it - and
 * changes only what is drawn. That is worth having because the room *is* the
 * furniture: a space that plays one thing on Tuesday and another on Thursday
 * should not have to take the room down and hand out a new link to do it.
 *
 * **Only ever level to level.** The decider refuses this on a room with no
 * `xpRef`, which is the half of `RoomCreated`'s rule that still stands: a room
 * full of blocks that became a level would strand the blocks. Nothing here can
 * clear the reference either, so a level room never becomes a lounge room.
 *
 * A round in play is reopened by the same command - see the decider. Swapping
 * the game out from under a hand that is being played is the one case where
 * leaving the door shut would be shutting it for a game nobody is playing.
 */
export type RoomXpSet = DomainEvent<'RoomXpSet', { xpRef: string }>

/**
 * The longest a group caption may be.
 *
 * Shorter than a room name, and for a reason a name does not have: this is
 * drawn as a caption over a column that is 15rem wide, so a group called
 * something long is a group nobody can read the name of. Sixty characters would
 * be three lines of it.
 */
export const ROOM_GROUP_MAX = 24

/**
 * Kept at the top of the list, for everybody.
 *
 * The space's pin, not yours - which is the whole distinction worth drawing
 * here. A member's own pin is in `room_marks`, is private to them, and is not
 * a decision about the room; this one is an owner or admin saying "this is the
 * room this space runs on", and it is the same shape of decision as opening the
 * room in the first place. So it is in the log, and it answers to the same pair.
 *
 * `pinned: false` is the unpin rather than a second event type, for the reason
 * `RoomGuestBuildSet` carries one boolean rather than two events: they are one
 * setting, and two types would mean two arms in every fold that reads it.
 */
export type RoomPinSet = DomainEvent<'RoomPinSet', { pinned: boolean }>

/**
 * Which caption this room is listed under.
 *
 * A group is not a container. Nothing moves *into* it and nothing is true of it
 * while it holds no rooms - it is a string several rooms happen to name, and it
 * exists in the rail exactly as long as a room names it. That is why this is a
 * field on the room rather than a membership event pointing at a group
 * aggregate: there is no group aggregate, and inventing one would buy a create
 * screen, a delete screen and a second projection to hold a caption.
 *
 * `null` is "ungrouped", which is where every room standing today is and where
 * a room goes when its group is taken off it. Renaming a group is this event on
 * each of its rooms - see `setRoomGroup`.
 */
export type RoomGroupSet = DomainEvent<'RoomGroupSet', { group: string | null }>

/**
 * The glyph this room is drawn with in the list.
 *
 * A name out of `ROOM_ICONS`, or null for the default. The vocabulary is in
 * `src/domain/rooms/look.ts` and the drawings are in the app layer; this event
 * carries neither, only the name they agree on.
 *
 * The space's choice rather than yours, like the pin and the group above it: a
 * room's icon is how everybody finds it in the column, and a per-person one
 * would be a rail nobody could describe to a colleague over a desk.
 */
export type RoomIconSet = DomainEvent<'RoomIconSet', { icon: string | null }>

/**
 * And the colour that glyph is drawn in.
 *
 * A palette token out of `ROOM_TINTS`, or null for the rail's own colour.
 *
 * Its own event rather than a second field on `RoomIconSet`, which is the shape
 * every setting in this file already has - one decision, one event. They are
 * picked in the same panel and that is a fact about a panel; somebody who
 * recolours a room without touching its icon should not append an event
 * claiming they set the icon to what it already was.
 */
export type RoomTintSet = DomainEvent<'RoomTintSet', { tint: string | null }>

export type RoomVisibilitySet = DomainEvent<
  'RoomVisibilitySet',
  { visibility: RoomVisibility }
>

export type RoomModeSet = DomainEvent<'RoomModeSet', { mode: RoomMode }>

export type RoomRenamed = DomainEvent<'RoomRenamed', { name: string }>

/**
 * Closed, not deleted.
 *
 * The blocks stay exactly where they are, so a room that gets closed and
 * reopened is the room people built, not an empty one. All this removes is its
 * place in the list - the same argument `BattlefieldArchived` makes.
 */
export type RoomClosed = DomainEvent<'RoomClosed', Record<string, never>>

/**
 * How many heads fit in here at once.
 *
 * Per room rather than per space because the two rooms an event actually has
 * are not alike: a main hall wants twenty and a workshop wants six, and one
 * number for both means either the workshop is a crowd or the hall is half
 * empty. `null` hands the decision back to the event, which is what every room
 * standing today means by having no opinion.
 *
 * Not a comfort setting. Movement costs `SEND_HZ x M x (N-1)` events per
 * second, so a room's cost is *quadratic* in its population - one crowded room
 * is what takes a whole event's Realtime budget down, and this is the control
 * that stops it. See performancestudy/ for the measurements.
 */
export type RoomCapSet = DomainEvent<'RoomCapSet', { cap: number | null }>

/**
 * May a guest build in here?
 *
 * Separate from the event's space-wide `build` capability, and underneath it:
 * this can only ever take something away. An event that never sold building
 * does not acquire it because one room said yes.
 *
 * It exists because a room is the unit people actually reason about on the
 * day - the sponsor's room stays as it was built, the jam rooms are open to
 * anybody - and that is a decision for the host standing in the space, not for
 * whoever priced the event a month earlier.
 */
export type RoomGuestBuildSet = DomainEvent<'RoomGuestBuildSet', { allowed: boolean }>

/**
 * What it costs to walk in.
 *
 * `docs/product/economy.md` §11. A toll on the door, set by the space's owner,
 * paid into the space's bank. `0` is free and is the default - nothing about
 * this existing changes what an untouched room costs.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a kind of "need"
 * ---------------------------------------------------------------------------
 * A need is a *consequence*: you got hungry, and food costs something. A door
 * charge is a *toll*, paid before anything has happened to you, and it is the
 * only charge in this product that can stop somebody getting in at all. Those
 * are different bargains and an owner tunes them for different reasons, so they
 * are different events with different reasons on the movement.
 *
 * ---------------------------------------------------------------------------
 * It applies to members and admins, not only to strangers
 * ---------------------------------------------------------------------------
 * Deliberately, and it is the part most likely to be "fixed" by somebody who
 * assumes a toll must be for outsiders. A room whose regulars walk past the
 * turnstile is not a room with a price on it - it is a room with a price on
 * *visitors*, which is a different feature and a meaner one. The space's owner
 * is not charged, for the reason nobody is ever charged to pay themselves.
 */
export type RoomDoorPriceSet = DomainEvent<'RoomDoorPriceSet', { price: number }>

/**
 * Somebody dealt.
 *
 * The moment a room that is a level stops taking newcomers. `at` is the
 * server's, not the browser's, for the reason every timestamp in this codebase
 * that decides something is: a client that could name the start could name it
 * in the past and reopen the room from the other side of a guard.
 *
 * `by` is who pressed it, which is worth recording and decides nothing - any
 * member may reopen, including one who was not here when it started. A round
 * only its starter could end is a table locked when they close their laptop.
 */
export type RoundStarted = DomainEvent<'RoundStarted', { at: string; by: string }>

/** The door open again. People come and go until somebody deals afresh. */
export type RoundReopened = DomainEvent<'RoundReopened', { by: string }>

export type RoomEvent =
  | RoomCreated
  | RoundStarted
  | RoundReopened
  | RoomRenamed
  | RoomXpSet
  | RoomVisibilitySet
  | RoomModeSet
  | RoomPinSet
  | RoomGroupSet
  | RoomIconSet
  | RoomTintSet
  | RoomCapSet
  | RoomGuestBuildSet
  | RoomDoorPriceSet
  | RoomClosed

export const ROOM_EVENT_LABELS: Record<RoomEvent['type'], string> = {
  RoomCreated: 'room opened',
  RoomRenamed: 'room renamed',
  RoomXpSet: 'room level changed',
  RoomVisibilitySet: 'room visibility changed',
  RoomPinSet: 'room pin changed',
  RoomGroupSet: 'room group changed',
  RoomIconSet: 'room icon changed',
  RoomTintSet: 'room colour changed',
  RoomModeSet: 'room mode changed',
  RoomCapSet: 'room capacity changed',
  RoomGuestBuildSet: 'room guest building changed',
  RoomDoorPriceSet: 'room door price changed',
  RoomClosed: 'room closed',
  RoundStarted: 'round started',
  RoundReopened: 'round reopened',
}

/** The widest a room may be set to. Mirrors the check in the migration. */
export const ROOM_CAP_MAX = 40
/** The narrowest. Below two, a room is a corridor. */
export const ROOM_CAP_MIN = 2
