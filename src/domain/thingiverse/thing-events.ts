import type { DomainEvent } from '@/es/types'
import type { BodySpec } from '@kxb/xp/blueprints'

/**
 * One thing, standing in one world.
 *
 * The instance half of the thingiverse. A blueprint is the kind of thing and
 * this is *that one over there* - summoned, moved, turned, resized, retuned and
 * eventually dismissed. Its own stream, for the reason every entity in this
 * codebase has one: those five verbs all refer to the same object over time.
 *
 * ---------------------------------------------------------------------------
 * A reference, not a copy
 * ---------------------------------------------------------------------------
 * A thing names its blueprint and stores none of it. The alternative - snapshot
 * the spec at summon time - was considered and is the wrong half of a real
 * trade:
 *
 *   * With a snapshot, editing a blueprint changes nothing that is already
 *     standing, so "make my lamps a bit bigger" is a job you do lamp by lamp.
 *     The whole reason a blueprint exists is that every ball falls the same
 *     way; a shelf whose edits do not reach the room is a shelf of stencils.
 *   * With a reference, editing a blueprint changes everything made from it -
 *     including things in rooms you are not standing in. That is the cost, it
 *     is real, and it is the one people expect: it is what "a kind of thing"
 *     means everywhere else in the product.
 *
 * `tuning` is the release valve. The two properties somebody actually wants to
 * differ per instance - does *this* one block, does *this* one fall - can be
 * overridden here, so the same crate can be a wall in the corridor and a barrel
 * on the ramp without being two blueprints. Everything else is the blueprint's.
 *
 * ---------------------------------------------------------------------------
 * Keyed by world, like a goal and unlike an image
 * ---------------------------------------------------------------------------
 * Things stand in *a* world - the lounge, a room, an arena - and a room's
 * furniture appearing in the lounge would be a bug you cannot explain. So the
 * world rides on every event, exactly as it does for goals, and absent means
 * the workspace's own lounge, which is what every reader in this codebase
 * already takes it to mean.
 */

export const THING_STREAM_TYPE = 'thingiverse_thing'

/**
 * How many things one world may hold.
 *
 * Each one is a glTF drawn as its own object - `useGLTF` caches by URL so the
 * geometry is shared, but the draw call is not, and a thing that falls is also
 * a body in a linear scan every frame. Sixty-four is a furnished room with room
 * to spare and comfortably inside what a phone will draw; it is not a number
 * anybody reaches by decorating, which is what makes it a guard rather than a
 * limit somebody has to work around.
 *
 * Blocks are the answer for anything that wants thousands. That is what they
 * are for, and they cost a fraction of this each.
 */
export const MAX_THINGS_PER_WORLD = 64

/** The world a thing stands in. Absent means the workspace's own lounge. */
export type ThingWorld = { worldId?: string }

/**
 * The two properties a single thing may disagree with its blueprint about.
 *
 * Deliberately not the whole spec. A per-instance override of everything is a
 * blueprint with extra steps, and the moment a thing needs its own model, clip
 * or actions it *is* a second blueprint - which costs one row and a name.
 *
 * Both are `undefined` when the thing simply agrees, and undefined is the only
 * spelling of agreement: a `null` that meant "same as the blueprint" beside a
 * `null` that means "scenery" is two states one field cannot hold.
 */
export interface ThingTuning {
  /** Overrides `BlueprintSpec.blocking`. */
  blocking?: boolean
  /** Overrides `BlueprintSpec.body`. Null is scenery; `{}` is "it falls". */
  body?: BodySpec | null
  /**
   * How far this one's shouts carry, in cells. Absent is the whole room.
   *
   * ---------------------------------------------------------------------------
   * Why the wiring is here and not on the blueprint
   * ---------------------------------------------------------------------------
   * This block used to be exactly two switches and the note above it said it
   * was about physics. It is really about the same thing those two are: *this
   * one's disagreements with its kind*. A blueprint says what a button is - it
   * shouts `open` when you press it - and it cannot say which door, because the
   * door is another object in a particular room and the blueprint is a fact
   * about every button anybody ever summons.
   *
   * So a wire is an instance's, like being solid and like falling. The
   * alternative was a fourth field on `BlueprintSpec`, and it would have made a
   * button that can only ever be used once: the second one summoned would open
   * the first one's door.
   */
  reach?: number
  /**
   * The things this one's shouts go to, by id, and nobody else hears them.
   *
   * Empty or absent is the room, which is what a signal has always been and
   * what every thing summoned before wires existed still means. Ids rather than
   * words because a wire is two objects somebody pointed at - a room with four
   * doors on it has four things called "Door", all waiting for `open`, and the
   * whole reason to run a wire is to say which.
   *
   * A wire to something that has since been dismissed is a wire to nothing: it
   * is left in the list rather than swept up, because the sweeping would be a
   * write to every wired thing in the room every time anything is cleared away,
   * and a stale id costs one comparison. See `earshot` in `_sim/thing-life`.
   */
  wires?: readonly string[]
}

/** How far a shout may be told to carry, in cells. */
export const MIN_THING_REACH = 1
export const MAX_THING_REACH = 64

/**
 * How many things one thing may be wired to.
 *
 * Eight, which is the room cap a match runs at and is also where a diagram
 * stops being one somebody can hold in their head. Past this the honest answer
 * is a word the whole room hears, which is what the default already is.
 */
export const MAX_WIRES = 8

export type ThingSummoned = DomainEvent<
  'ThingSummoned',
  ThingWorld & {
    blueprintId: string
    /**
     * Where it stands, in whole cells on the block lattice.
     *
     * Whole cells rather than free position, which is the same choice images
     * and goals made and for the same reason: a room is built out of blocks,
     * and a bench that lands 0.3 of a cell into the wall it was meant to stand
     * against is a bench somebody has to nudge. The preview snaps as you carry
     * it, so what you see before you place it is where it lands.
     *
     * `y` is the cell the thing's *feet* are in, not its middle. Every pack but
     * the blocks is modelled standing on zero (see `Pack.lift`), so this is the
     * number the renderer can use without arithmetic, and the one somebody
     * reading "y: 0" would expect to mean "on the ground".
     */
    x: number
    y: number
    z: number
    /** Quarter turns about Y, exactly as an image's and a goal's are. */
    facing: number
    /** Multiplier on top of the blueprint's own scale. See `MIN_THING_SCALE`. */
    scale: number
    /**
     * Whether it is still here tomorrow.
     *
     * True is furniture: somebody arranged the room and the room stays
     * arranged. False is a thing you got out to use - a ball, a chair dragged
     * over for a conversation, a target somebody is practising against - and it
     * goes when its owner leaves the world.
     *
     * Optional, so every thing summoned before this existed replays as what it
     * was: furniture. Absent is true everywhere it is read.
     *
     * -----------------------------------------------------------------------
     * Why the *log* carries this and not a client
     * -----------------------------------------------------------------------
     * Because the sweep that acts on it is best-effort. A browser that is
     * closed mid-session never gets to tidy up, so something else has to be
     * able to know that the chair in the corner was never meant to outlive the
     * person who pulled it out. A row that says so can be swept by anything -
     * the next visitor's client, a cron, an admin pressing a button - and a
     * flag that lived only in the tab that placed it could be swept by nothing.
     */
    keep?: boolean
  }
>

export type ThingMoved = DomainEvent<'ThingMoved', { x: number; y: number; z: number }>

export type ThingTurned = DomainEvent<'ThingTurned', { facing: number }>

export type ThingScaled = DomainEvent<'ThingScaled', { scale: number }>

/**
 * This one, specifically, blocks or falls differently from its kind.
 *
 * One event carrying the whole tuning rather than one per property, for the
 * same reason `BlueprintReshaped` carries the whole spec: the panel that writes
 * this has both switches on it and somebody flipping both has made one
 * decision. Clearing an override is the same event with the field absent.
 */
export type ThingTuned = DomainEvent<'ThingTuned', { tuning: ThingTuning }>

/**
 * Made furniture, or made temporary.
 *
 * Its own event rather than a field on `ThingTuned`, which is about *physics* -
 * does this one block, does this one fall. Whether a thing outlives the person
 * who put it there is a fact of a different kind, and folding the two together
 * would mean a log that says "retuned" about a decision to leave something
 * behind.
 */
export type ThingKeepSet = DomainEvent<'ThingKeepSet', { keep: boolean }>

export type ThingDismissed = DomainEvent<'ThingDismissed', Record<string, never>>

export type ThingEvent =
  | ThingSummoned
  | ThingMoved
  | ThingTurned
  | ThingScaled
  | ThingTuned
  | ThingKeepSet
  | ThingDismissed

export const THING_EVENT_LABELS: Record<ThingEvent['type'], string> = {
  ThingSummoned: 'thing summoned',
  ThingMoved: 'thing moved',
  ThingTurned: 'thing turned',
  ThingScaled: 'thing resized',
  ThingTuned: 'thing retuned',
  ThingKeepSet: 'thing kept or let go',
  ThingDismissed: 'thing dismissed',
}
