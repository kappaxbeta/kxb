import { bodyProblems, BODY_LIMITS, type BodySpec } from '@kxb/xp/blueprints'
import { craftProblems, MAX_PRICE, type CraftSpec } from '@/domain/thingiverse/craft'
import { fightProblems, type FightSpec } from '@/domain/thingiverse/fight'
import { knownModel } from '@/domain/thingiverse/models'
import { statesProblems, type States } from '@/domain/thingiverse/states'
import { timelineProblems, type Timeline } from '@/domain/thingiverse/timeline'
import { vehicleProblems, type VehicleSpec } from '@/domain/thingiverse/vehicle'

/**
 * The thingiverse: a shelf of things a space can summon into a room.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the block palette, and not the builder either
 * ---------------------------------------------------------------------------
 * A space already has two ways to put something in a world and neither of them
 * is this one:
 *
 *   - the **palette** (`@/domain/lounge/palette`) is 58 blocks, placed a cell
 *     at a time, with no identity - "cell (3,0,7) is dirt". You build *ground*
 *     with it. A block cannot fall, cannot be yours, and cannot be a fountain.
 *   - the **builder** (`@/domain/builder`) reaches the whole 1,300-model
 *     catalogue, and is an admin's offline tool: a JSON file on somebody's
 *     machine, laid out with drag tools, published as a whole world. You cannot
 *     summon one bench from it while standing in the room.
 *
 * What was missing is the middle: *this* thing, here, now, with properties -
 * a ball that falls, a crate that blocks the door, a fountain that does not.
 * That is a **blueprint** (the kind of thing) and a **thing** (one of them,
 * standing somewhere). The split is the same one `@kxb/xp/blueprints` makes at
 * length and for the same reason: every ball falls the same way, so how it
 * falls is a fact about balls, and where this one is is a fact about it.
 *
 * ---------------------------------------------------------------------------
 * Why the physics vocabulary is imported rather than restated
 * ---------------------------------------------------------------------------
 * `gravity`, `bounce`, `mass` and their bounds come from the XP engine, which
 * has had them since bodies existed and has a test suite behind every number.
 * Restating them here would give the product two spellings of one idea and let
 * a ball behave differently depending on which world it was dropped into - and
 * the whole point of a blueprint is that it is the *same thing* wherever it
 * turns up. So a thingiverse blueprint is deliberately a subset an XP blueprint
 * can be made from: a model, a collider, a body, a clip and some tags.
 *
 * What is *not* borrowed is the rest of an XP blueprint - parts, sockets,
 * triggers, scripts. Those need a rules engine, an editor and a level to be
 * meaningful, and a room has none of the three. The small closed vocabulary in
 * `ThingAction` below is what a room can honestly promise instead.
 */

/** How long a blueprint's name may be. A shelf label, not a description. */
export const MAX_BLUEPRINT_NAME = 48

/** How many blueprints one space may keep. */
export const MAX_BLUEPRINTS_PER_TENANT = 250

/** How many free-form tags one blueprint may carry, and how long each may be. */
export const MAX_BLUEPRINT_TAGS = 8
export const MAX_TAG_LENGTH = 24

/** How many actions one blueprint may carry. See `ThingAction`. */
export const MAX_BLUEPRINT_ACTIONS = 4

/**
 * How big or small a summoned thing may be drawn.
 *
 * A multiplier on top of the pack's own scale, exactly as a builder placement's
 * is - so 1 means "whatever this pack calls a cell". The floor is not zero: a
 * thing scaled to nothing is a thing nobody can find again to remove, which is
 * the same trap `MIN_GOAL_SIZE` exists to close. The ceiling keeps a summoned
 * bench from becoming the room.
 */
export const MIN_THING_SCALE = 0.1
export const MAX_THING_SCALE = 12

/**
 * When something happens to a thing.
 *
 * Four, and the shortness is still the design. A room is not a level: nobody is
 * scripting it, there is no editor for a rule, and the person setting this is
 * standing in the world with a rail panel open. Every word here has to be
 * answerable by looking at the thing.
 *
 *   `touch`  - somebody walked into it.
 *   `near`   - somebody is standing close to it.
 *   `always` - it does this on its own, forever.
 *   `use`    - somebody pressed E on it.
 *
 * `use` arrived with the machine (see `./states`) and is the one that needed no
 * new arithmetic: a thing with a `use` block already answers E, the runtime
 * already knows the frame it was pressed on, and every rule this list can carry
 * was already being evaluated on that frame. It is missing from the *machine's*
 * list of things a state waits for in only one respect - a change fires once
 * per press, and so does this, because the press is a frame and not a ring.
 *
 * `signal` is deliberately not here. A word arriving is not something that
 * happens *at* a thing in the way the other four are - it has no distance and
 * no toucher - and an action listening for one would need a second value field
 * beside the one the deed already uses. Signals are the machine's, and the
 * machine has a field for them. See `Change`.
 */
export const THING_WHENS = ['touch', 'near', 'always', 'use'] as const
export type ThingWhen = (typeof THING_WHENS)[number]

/**
 * What it then does.
 *
 * The same argument as above, applied to the other half. These are all things
 * the scene can do to one object with no state, no ownership and no round trip
 * - which is exactly why the list stops where it does. `score`, `give`,
 * `damage` and the rest of the XP verbs are missing on purpose: every one of
 * them needs somebody to be *playing* something, and a room is a place, not a
 * match. A thing that has to keep score is an XP, and the cartridge shelf is
 * where that lives.
 *
 *   `play`   - play a clip the model carries. `value` names it.
 *   `spin`   - turn on the spot.
 *   `bob`    - rise and fall gently.
 *   `vanish` - take itself away until the room is next loaded.
 *   `emit`   - shout a word at the room. `value` is the word.
 *   `become` - go to one of its own states. `value` names it.
 *   `attack` - swing at whatever is in reach. See `./fight`.
 *   `shoot`  - fire what its weapon is loaded with. See `./fight`.
 *
 * ---------------------------------------------------------------------------
 * The four that arrived later, and what changed to let them
 * ---------------------------------------------------------------------------
 * The first four are what a room could promise with no state, no ownership and
 * no round trip, and the note here used to say that everything else was an XP.
 * Three things have since made the rest of this list honest rather than
 * aspirational, and it is worth writing down which, because the argument
 * against a fifth word is still the right default:
 *
 *   - `emit` and `become` are cheap because the *machine* is the state, not the
 *     deed. A word shouted at a room is one string on a channel the lounge
 *     already keeps open, and a thing going to one of its own named states is a
 *     lookup in a list this blueprint carries. Neither invents a store.
 *   - `attack` and `shoot` are honest because battle mode already has health,
 *     damage, respawns and an ownership rule for all three. See `./fight`,
 *     which opens by conceding this note's original argument and then says what
 *     changed.
 *
 * `say` and `sound` are still missing and still on purpose. `say` would put a
 * line over the thing, which is presence's shape and not a thing's - a room
 * already has speech, it belongs to people, and a crate that talks would be the
 * first thing in this product to say something nobody said. `sound` would need
 * a shared audio story a lounge does not have: the XP runtime has one, per
 * match, with a mixer and a mute somebody consented to, and borrowing it would
 * put noise in a room over which nobody in it has a control.
 *
 * Both are worth having one day and neither is worth shipping as a word in a
 * dropdown that does nothing.
 */
export const THING_DEEDS = [
  'play',
  'spin',
  'bob',
  'vanish',
  'emit',
  'become',
  'attack',
  'shoot',
] as const
export type ThingDeed = (typeof THING_DEEDS)[number]

/** How long the word or line an action carries may be. */
export const MAX_ACTION_VALUE = 64

/**
 * One thing a blueprint does, and when.
 *
 * A pair rather than a `Trigger` with a condition and a list of verbs, which is
 * what XP has. The XP shape is right there and is deliberately not reused: it
 * carries targets, cooldowns, filters and a nested verb list, all of which need
 * a level to name things in. Two words and a value is what a rail panel can put
 * in front of somebody in one row, and a room can keep every promise it makes.
 */
export interface ThingAction {
  when: ThingWhen
  deed: ThingDeed
  /** The clip, the line or the sound. Absent for the deeds that need none. */
  value?: string
}

/**
 * How many extra animations one usable thing may offer, and how a key is named.
 *
 * Six, because they are drawn as a row of keycaps under the "you are in this"
 * prompt and a seventh is a row nobody reads. A key is one character, upper
 * cased on the way in, so `q` and `Q` are the same key - a thing offering both
 * would be a thing whose second binding never fires.
 */
export const MAX_USE_INPUTS = 6

/** How long a clip's name may be. The same bound `BlueprintSpec.clip` uses. */
export const MAX_CLIP_NAME = 64

/**
 * One extra animation, on a key, while you are using something.
 *
 * The turntable's second speed, the chair's slouch, the kart's horn. A key and
 * a clip, and nothing else: what happens is an animation on *your body*, which
 * is the one effect a room can promise without a rules engine underneath it.
 */
export interface UseInput {
  /** One character, upper case. Pressed while using the thing. */
  key: string
  /** The clip it plays. Unchecked against any pack - see `BlueprintSpec.clip`. */
  clip: string
  /** What the prompt calls it. The clip's own name when absent. */
  label?: string
}

/**
 * A thing you can be *in* rather than merely walk past.
 *
 * ---------------------------------------------------------------------------
 * Three clips, because using something has three moments
 * ---------------------------------------------------------------------------
 * A chair is not "an animation". It is sitting down, being sat, and standing up
 * - and every one of those is a different length and a different kind of thing.
 * `enter` and `leave` play once and hand over; `loop` runs until you let go.
 * Collapsing them into one clip is what makes a body snap into a seat, and
 * collapsing them into two (enter, leave) leaves nothing to play for the minute
 * somebody actually spends sitting there.
 *
 * All three are nullable and all three are independent: a bench with only a
 * `loop` is a bench you appear on and appear off, which is a perfectly good
 * bench. A turntable with only `enter` is a thing you touch once.
 *
 * ---------------------------------------------------------------------------
 * The names are not checked, and that is the same decision `clip` above makes
 * ---------------------------------------------------------------------------
 * Which clips exist depends on the *body*, and there are two of them: the
 * lounge's animals, which carry four (`AVATAR_CLIPS`), and the XP rig, which
 * carries a hundred and thirty-nine in a pack shared by every character. A
 * blueprint is summoned into worlds that use either, so a name checked against
 * one would be a blueprint that refuses to exist in the other. A name that
 * finds nothing plays nothing, and the body stands there - which is what a
 * chair with a missing clip should look like.
 */
export interface UseSpec {
  /** Played once as you take hold. */
  enter: string | null
  /** Played while you are in it. Loops. */
  loop: string | null
  /** Played once as you let go. */
  leave: string | null
  /**
   * Where the bodies stand while using it, in the thing's own frame, in cells.
   *
   * Not a socket by name, which is what an XP blueprint would use: sockets are
   * authored into a model's rig and nothing in these packs has one. Three
   * numbers somebody can nudge until the peep is on the bench is the honest
   * version of the same idea, and it is the only version this catalogue can
   * support.
   *
   * Turned with the thing, so a bench rotated to face the other way seats
   * somebody facing the other way rather than seating them in the wall.
   *
   * -------------------------------------------------------------------------
   * A list, because a bench is not a chair
   * -------------------------------------------------------------------------
   * Most things that can be got into can be got into by more than one person: a
   * bench seats three, a table seats four, a car seats two and takes two more
   * in the back. One seat and "somebody is already in it" would make every one
   * of those a queue.
   *
   * Which seat you get is decided in the world rather than here - the nearest
   * free one to where you were standing when you pressed E (see `freeSeat`) -
   * because "free" is a fact about who is in the room this second and a
   * blueprint is a fact about a kind of thing.
   *
   * Never empty: a `use` block with no seats is a thing you can get into and
   * then stand nowhere, which is a state with no sensible drawing. `freshUse`
   * starts with one at the thing's own origin.
   */
  seats: readonly {
    x: number
    y: number
    z: number
    /**
     * A socket to sit on, if any, with x/y/z read as the nudge off it.
     *
     * Optional, because the two ways of saying where somebody sits are each
     * right for a different thing: a bench has three places along it that are
     * nothing but offsets, and a kart has a driver's seat that is a fact about
     * the kart and should follow it when the model is swapped. Making the bench
     * invent three socket names is ceremony; making the kart hard-code a number
     * is a seat that must be re-measured every time the model changes.
     */
    socket?: string
  }[]
  /** Extra animations, on keys, while you are in it. See `UseInput`. */
  inputs: readonly UseInput[]
}

/** What a fresh `use` block is: you get in, you are in it, you get out. */
export function freshUse(): UseSpec {
  return {
    enter: null,
    loop: null,
    leave: null,
    seats: [{ x: 0, y: 0, z: 0 }],
    inputs: [],
  }
}

/** How far a seat may be from the thing's own origin, in cells. */
export const MAX_SEAT_OFFSET = 8

/**
 * How many people one thing may hold.
 *
 * Eight, which is a long bench or a minibus and is also the room cap a match
 * runs at - so a thing cannot seat more people than a room can hold. Past this
 * the honest answer is two things standing next to each other, which is also
 * how you would build the seating in a real room.
 */
export const MAX_SEATS = 8

/**
 * How far a part may sit from the thing's own origin, in cells.
 *
 * The same bound seats get, and for the same reason: a thing is one object that
 * somebody points at, and a piece eight cells away from the piece it belongs to
 * is two things standing near each other. Past this the honest answer is two
 * blueprints.
 */
export const MAX_PART_OFFSET = 8

/**
 * How many extra pieces one blueprint may be built out of.
 *
 * Twelve, which is a market stall, a drum kit or a laid table, and is also
 * roughly where a thing stops being a thing: every part is a glTF the scene
 * fetches and draws, so a blueprint anybody can summon forty times is forty
 * times this number of draws. The composer says how many are left.
 */
export const MAX_PARTS = 12

/** How long a socket's name may be, and how many one part may carry. */
export const MAX_SOCKET_NAME = 24
export const MAX_SOCKETS_PER_PART = 6

/**
 * A named place on a thing that something else attaches to.
 *
 * The handle of a mug, the seat of a kart, the hand of a shopkeeper. Three
 * numbers and a word, in the frame of the part that owns it - so a socket
 * survives its part being moved or turned, which is the whole reason it is not
 * simply another offset written on the blueprint.
 *
 * ---------------------------------------------------------------------------
 * Why a name rather than an index
 * ---------------------------------------------------------------------------
 * Because the things that point at a socket are written by hand and elsewhere:
 * a seat says which socket it sits on, and an item says which socket it is
 * gripped by. `parts[2].sockets[0]` is a reference that silently means something
 * different the moment somebody reorders the composer's list, and reordering a
 * list is the least memorable edit there is. A name breaks loudly instead - the
 * seat finds nothing and falls back to the thing's own origin, which is visible.
 */
export interface Socket {
  /** Unique within the blueprint. Lower case, trimmed. */
  name: string
  /** Where it is, in the owning part's frame, in cells. */
  at: { x: number; y: number; z: number }
  /** Which way it faces, in quarter turns about the up axis. */
  turn: number
}

/**
 * One piece of a composed thing.
 *
 * ---------------------------------------------------------------------------
 * Why these hang off `model` rather than replacing it
 * ---------------------------------------------------------------------------
 * `BlueprintSpec.model` is the *root*, and it stays exactly what it always was:
 * one model id, the thing's identity, what a thumbnail is drawn from, what a
 * typed word is matched against, and what the scene fetches. `parts` is what is
 * bolted onto it, empty for the thousands of blueprints that are one bench.
 *
 * The obvious shape is a flat `parts: [...]` with no privileged member, and it
 * was rejected on a fact about the code rather than about the idea: `spec.model`
 * is read by the scene renderer, the held-thing HUD, the summon resolver and the
 * shelf, and a blueprint whose identity is "the first entry of a list, unless
 * the list is empty" gives every one of those a branch to get wrong. Worse, an
 * empty list would be a legal spec that draws nothing and cannot be found again.
 *
 * A root plus its attachments is also what these things are. A market stall is a
 * stall with crates on it; nobody thinks of it as an unordered set of eleven
 * meshes.
 */
export interface BlueprintPart {
  /** A model id the catalogue knows, namespaced where it needs to be. */
  model: string
  /** Where it sits, in the thing's own frame, in cells. */
  at: { x: number; y: number; z: number }
  /** Quarter turns about the up axis. Whole numbers; the composer nudges by one. */
  turn: number
  /** Multiplier on this part's own pack scale, exactly as the root's is. */
  scale: number
  /** What attaches here. See `Socket`. */
  sockets: readonly Socket[]
}

/** A part at the origin, its own size, facing the way the thing faces. */
export function freshPart(model: string): BlueprintPart {
  return { model, at: { x: 0, y: 0, z: 0 }, turn: 0, scale: 1, sockets: [] }
}

/**
 * Every socket on a thing, in the *thing's* frame, with the part's transform
 * already applied.
 *
 * Here rather than in the composer, because three surfaces need the same answer
 * and two of them are not the composer: a seat resolves against this, and so
 * does the grip of a held item. A rotation done three times is a rotation done
 * two different ways eventually.
 *
 * The root's own sockets come first and are listed under `part: null`, so
 * something can be attached to the bench itself rather than to a crate on it.
 */
export function socketsOf(spec: {
  parts?: readonly BlueprintPart[]
  sockets?: readonly Socket[]
}): { name: string; at: { x: number; y: number; z: number }; turn: number }[] {
  const out = (spec.sockets ?? []).map((socket) => ({ ...socket }))

  for (const part of spec.parts ?? []) {
    for (const socket of part.sockets) {
      // A quarter turn about up is a swap and a sign, which is worth writing out
      // rather than reaching for a matrix: there are four of them, they are
      // exact in integers, and a trig call here would put floating-point dust
      // into a coordinate somebody typed as a whole number.
      const quarter = ((part.turn % 4) + 4) % 4
      const { x, z } = spin(socket.at.x * part.scale, socket.at.z * part.scale, quarter)
      out.push({
        name: socket.name,
        at: {
          x: part.at.x + x,
          y: part.at.y + socket.at.y * part.scale,
          z: part.at.z + z,
        },
        turn: (socket.turn + part.turn) % 4,
      })
    }
  }

  return out
}

/** One of the four rotations, in integers. See `socketsOf`. */
function spin(x: number, z: number, quarter: number): { x: number; z: number } {
  if (quarter === 1) return { x: -z, z: x }
  if (quarter === 2) return { x: -x, z: -z }
  if (quarter === 3) return { x: z, z: -x }
  return { x, z }
}

/**
 * Where a seat actually is.
 *
 * A seat naming a socket that does not exist resolves to the thing's own origin
 * rather than to nothing, and that is deliberate: the failure of a missing
 * socket should be somebody standing in the middle of the bench, which anybody
 * can see and fix, not a seat that silently cannot be sat in. Same argument the
 * clip fields make about names this file refuses to check.
 */
export function seatAt(
  spec: { parts?: readonly BlueprintPart[]; sockets?: readonly Socket[] },
  seat: { x: number; y: number; z: number; socket?: string },
): { x: number; y: number; z: number } {
  if (!seat.socket) return { x: seat.x, y: seat.y, z: seat.z }
  const found = socketsOf(spec).find((one) => one.name === seat.socket)
  if (!found) return { x: 0, y: 0, z: 0 }
  // The seat's own numbers stay meaningful on a socket: they are the nudge off
  // it, which is how you sit somebody *on* a stool rather than *in* it.
  return { x: found.at.x + seat.x, y: found.at.y + seat.y, z: found.at.z + seat.z }
}

/**
 * What a blueprint *is*, as one value.
 *
 * Stored as a single `jsonb` column rather than as a row of columns, which is
 * the one place this read model differs from the goals and images beside it.
 * The reason is what gets *asked* of it: a query filters blueprints by who owns
 * them and whether they are public, and never by how bouncy they are. Nothing
 * indexes a property, nothing joins on one, and every field here arrives and
 * leaves as a whole. Spreading them across ten columns would buy a migration
 * per idea and no query.
 *
 * The cost of jsonb is that Postgres will not check it, so `blueprintProblems`
 * below is the check - run by the command schema on the way in, which is where
 * this kind of guard belongs anyway (the column constraint would only catch the
 * writes that got past the aggregate, and nothing is meant to).
 */
export interface BlueprintSpec {
  /**
   * The root model. A model id the catalogue knows: `pack/name`.
   *
   * The thing's identity as well as its biggest piece - see `BlueprintPart` for
   * why the composed ones hang off this rather than replacing it.
   */
  model: string
  /**
   * What else is bolted on, and where.
   *
   * Optional rather than an empty array, and that is about the log rather than
   * about taste: `jsonb` keeps whatever shape it was written with, every
   * blueprint drawn before the composer existed has no such key, and a reader
   * that assumed the array was there would throw on all of them. Absent and
   * empty mean the same thing here, which is the one case where two spellings
   * are safe.
   */
  parts?: readonly BlueprintPart[]
  /** Named places on the root itself. See `Socket`. */
  sockets?: readonly Socket[]
  /** Multiplier on the pack's own scale. See `MIN_THING_SCALE`. */
  scale: number
  /**
   * Whether you can walk through it.
   *
   * A boolean rather than XP's `ColliderSpec`, and this is the deliberate
   * narrowing: `auto` and `none` are the only two of that type's three cases a
   * room can offer, because the third - a hand-written box - is measured
   * against a model's own bounds in a file only an editor shows you. `true` is
   * `auto`, `false` is `none`, and `colliderOf` below is the translation for
   * whoever needs the engine's word for it.
   */
  blocking: boolean
  /**
   * How it moves on its own, or null for scenery.
   *
   * Null and `{}` mean different things and both are reachable on purpose,
   * which is inherited straight from `Blueprint.body`: null is a fountain,
   * which stands where it was put forever, and `{}` is a crate, which falls to
   * the floor and stops. An empty object is not "no body" and reading it as one
   * would make every dropped thing hover.
   */
  body: BodySpec | null
  /**
   * A clip it plays while it stands there, or null for a still model.
   *
   * Unchecked against any pack, for the reason `@kxb/xp/clips` gives about the
   * three fields that name a clip: which glTFs a host has loaded is the host's
   * business, and a name that finds nothing draws the model standing still
   * rather than failing to draw it at all.
   */
  clip: string | null
  /** What it does, and when. See `ThingAction`. */
  actions: readonly ThingAction[]
  /**
   * The same deeds, in an order, with gaps. See `Timeline`.
   *
   * Optional, and separate from `actions` rather than folded into them: an
   * action is a standing rule about a thing ("while somebody is near, spin")
   * and a timeline is a performance ("open, wait, shut"). Most things want the
   * first and only some want the second, and a blueprint written before the
   * timeline existed has no such key - so absent has to keep meaning what it
   * has always meant.
   */
  timeline?: Timeline
  /**
   * Whether you can get *in* it, and what your body does while you are.
   *
   * Null is everything: a crate is a crate, and walking into one is all that
   * ever happens to it. Present makes the thing answer **E** - and that is the
   * key in both worlds, with two different meanings that never overlap because
   * the modes never do: in play, E gets in; in creative, E picks the thing up
   * and carries it. Somebody building a room is moving furniture, and somebody
   * playing in one is using it.
   */
  use: UseSpec | null
  /**
   * Whether you can *drive* it, and how it goes when you do.
   *
   * Optional rather than nullable, exactly as `parts` is and for the same
   * reason: every blueprint drawn before vehicles existed has no such key, and
   * absent has to keep meaning what it has always meant - this is furniture.
   * Present makes the thing answer E with the wheel rather than a seat, and
   * `/vehicle` with its name summons it ready to go. The driver sits in the
   * first of `use.seats`; see `drivable` for why that is a rule and not a
   * field.
   */
  vehicle?: VehicleSpec
  /**
   * What it can be, and what makes it something else.
   *
   * Optional, exactly as `parts` and `vehicle` are and for the same reason:
   * every blueprint drawn before the machine existed has no such key, and
   * absent has to keep meaning what it has always meant - this thing is one
   * thing, forever. Present makes the thing a burger that cooks, a crate that
   * breaks, or a target that comes back. See `./states`.
   */
  states?: States
  /**
   * What it can take and what it can dish out, in battle mode.
   *
   * Optional and, unlike everything else here, *conditional on the room*: a
   * fight block means nothing in a creative world, where nobody can hit
   * anything. See `./fight`, which opens with why that is the runtime's rule to
   * keep rather than this file's.
   */
  fight?: FightSpec
  /**
   * What can be put on it, what it already holds, and what it can make.
   *
   * Optional. Present makes the thing a table, a rack, a pedestal or a cutting
   * board - the three of which are one idea, a socket that is empty or full.
   * See `./craft`.
   */
  craft?: CraftSpec
  /**
   * What summoning one costs, in coins. Absent is free.
   *
   * The play money the homestead runs on - see `MAX_PRICE`. Charged by the
   * server action that summons, which reads this from the stored blueprint
   * rather than taking a number from the browser: the rule `BuyGround` states
   * in as many words is that a client which can name its own price can buy the
   * whole map for nothing, and it holds just as hard here.
   *
   * On the blueprint rather than on the thing, because it is a fact about the
   * *kind*: a bench costs what a bench costs, and the one already standing in
   * the corner cost that when somebody put it there.
   */
  price?: number
  /**
   * Free-form labels, for finding it again.
   *
   * Deliberately not an enum, exactly as `Blueprint.tags` is not: the words a
   * space uses for its own furniture are the space's business, and an enum here
   * would make every new kind of thing somebody wants to describe a migration.
   */
  tags: readonly string[]
}

/**
 * What a blueprint is before anybody has changed anything.
 *
 * Solid, and it falls. `body: {}` rather than null, which is the *opposite* of
 * what this said first - the old note argued that "a bench that fell over the
 * moment it was summoned would be a bench nobody meant to make", and that was
 * an argument about the wrong thing: a body here does not tip anything over, it
 * only means the thing finds the floor.
 *
 * Which is what somebody expects. A crate let go in mid-air lands; a crate that
 * hangs there is a bug report. The things that genuinely should not fall - a
 * lamp on a wall, a banner across a doorway, a fountain - say so by turning the
 * switch off, and that is a decision somebody makes about a particular thing
 * rather than one everything else pays for.
 */
export function freshSpec(model: string): BlueprintSpec {
  return {
    model,
    scale: 1,
    blocking: true,
    body: {},
    clip: null,
    actions: [],
    tags: [],
    use: null,
  }
}

/** The engine's word for `blocking`, for whoever is talking to a body sim. */
export function colliderOf(spec: BlueprintSpec): 'auto' | 'none' {
  return spec.blocking ? 'auto' : 'none'
}

/** Whether this thing is handed to the body simulation at all. */
export function falls(spec: { body: BodySpec | null }): boolean {
  return spec.body !== null
}

/**
 * Whatever is wrong with the pieces, said in words.
 *
 * Its own function for the reason `usingProblems` is: the composer draws the
 * parts as their own panel and wants to mark that panel, and a caller holding a
 * half-built spec (the composer does, on every keystroke) can ask about the
 * pieces without being told about the clip it has not filled in yet.
 *
 * Socket names are checked for *collisions across the whole thing* rather than
 * within a part, because that is the scope anything pointing at one resolves in
 * - `socketsOf` flattens every part into one list, and two sockets called `seat`
 * on two different crates is a coin toss inside a lookup nobody can see. The
 * same argument two entities in an XP may not share a name.
 */
export function partProblems(spec: {
  parts?: readonly BlueprintPart[]
  sockets?: readonly Socket[]
}): string[] {
  const problems: string[] = []
  const parts = spec.parts ?? []

  if (parts.length > MAX_PARTS) {
    problems.push(`a thing is built out of at most ${MAX_PARTS} extra pieces`)
  }

  for (const part of parts) {
    if (!knownModel(part.model)) {
      problems.push(`${part.model} is not a model we ship`)
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = part.at[axis]
      if (!Number.isFinite(value) || Math.abs(value) > MAX_PART_OFFSET) {
        problems.push(`a piece must be within ${MAX_PART_OFFSET} cells of the thing`)
      }
    }
    if (!Number.isInteger(part.turn)) {
      problems.push('a piece turns in quarters')
    }
    if (
      !Number.isFinite(part.scale) ||
      part.scale < MIN_THING_SCALE ||
      part.scale > MAX_THING_SCALE
    ) {
      problems.push(`a piece's size must be between ${MIN_THING_SCALE} and ${MAX_THING_SCALE}`)
    }
    if (part.sockets.length > MAX_SOCKETS_PER_PART) {
      problems.push(`a piece carries at most ${MAX_SOCKETS_PER_PART} sockets`)
    }
  }

  const seen = new Set<string>()
  for (const socket of [...(spec.sockets ?? []), ...parts.flatMap((part) => part.sockets)]) {
    const name = socket.name.trim()
    if (name === '' || name.length > MAX_SOCKET_NAME) {
      problems.push(`a socket's name is 1-${MAX_SOCKET_NAME} characters`)
      continue
    }
    if (seen.has(name)) problems.push(`two sockets are called ${name}`)
    seen.add(name)

    for (const axis of ['x', 'y', 'z'] as const) {
      const value = socket.at[axis]
      if (!Number.isFinite(value) || Math.abs(value) > MAX_PART_OFFSET) {
        problems.push(`${name} must be within ${MAX_PART_OFFSET} cells of its piece`)
      }
    }
  }

  return problems
}

/**
 * Whatever is wrong with a spec, said in words.
 *
 * A list rather than a throw, and the shape is `bodyProblems`' on purpose: a
 * panel with six number fields wants to mark all six, and a parser that stops
 * at the first one makes somebody fix a form one round trip at a time. The
 * command schema turns a non-empty list into a refusal.
 */
export function blueprintProblems(spec: BlueprintSpec): string[] {
  const problems: string[] = []

  if (!knownModel(spec.model)) {
    problems.push(`${spec.model} is not a model we ship`)
  }

  if (
    !Number.isFinite(spec.scale) ||
    spec.scale < MIN_THING_SCALE ||
    spec.scale > MAX_THING_SCALE
  ) {
    problems.push(`scale must be between ${MIN_THING_SCALE} and ${MAX_THING_SCALE}`)
  }

  if (spec.body) problems.push(...bodyProblems(spec.body))

  problems.push(...partProblems(spec))

  if (spec.clip !== null && spec.clip.trim() === '') {
    // Null is "no clip" and is the only spelling of it. An empty string is the
    // second spelling that a round trip grows a field nobody wrote out of.
    problems.push('a clip must be named, or absent')
  }

  if (spec.actions.length > MAX_BLUEPRINT_ACTIONS) {
    problems.push(`a thing may do at most ${MAX_BLUEPRINT_ACTIONS} things`)
  }

  for (const action of spec.actions) {
    if (!(THING_WHENS as readonly string[]).includes(action.when)) {
      problems.push(`${action.when} is not something that happens to a thing`)
    }
    if (!(THING_DEEDS as readonly string[]).includes(action.deed)) {
      problems.push(`${action.deed} is not something a thing can do`)
    }
    if (action.value !== undefined && action.value.length > MAX_ACTION_VALUE) {
      problems.push(`an action's word must be under ${MAX_ACTION_VALUE} characters`)
    }
    if (needsValue(action.deed) && !action.value?.trim()) {
      problems.push(`${action.deed} needs to be told what to ${action.deed}`)
    }
  }

  if (spec.use) problems.push(...usingProblems(spec.use))

  // A vehicle's own bounds, and the one cross-block rule: driving needs a seat,
  // which is `use`'s to provide. Checked whole rather than only when `use` is
  // absent, so the editor's vehicle section can mark itself with one call.
  if (spec.vehicle) problems.push(...vehicleProblems(spec.vehicle, spec.use))

  // The pieces it may point at are this blueprint's own - see
  // `timelineProblems`, which is given them rather than reading them, because
  // it also runs in an editor mid-edit.
  if (spec.timeline) {
    // `when` is checked here rather than in `timelineProblems`, which cannot
    // import the list without closing a cycle - see the note over `HELD_DEEDS`.
    if (!(THING_WHENS as readonly string[]).includes(spec.timeline.when)) {
      problems.push(`${spec.timeline.when} is not something that happens to a thing`)
    }
    problems.push(...timelineProblems(spec.timeline, (spec.parts ?? []).length))
  }

  // The machine, and the one cross-block rule it carries: `become` names a
  // state, and a `become` on a thing with no machine is a deed that can never
  // do anything. Caught here rather than in `statesProblems`, which is given a
  // machine and cannot see the actions.
  if (spec.states) problems.push(...statesProblems(spec.states))

  for (const action of spec.actions) {
    if (action.deed !== 'become') continue
    const to = action.value?.trim() ?? ''
    if (to === '') continue
    if (!spec.states?.states.some((state) => state.name.trim() === to)) {
      problems.push(`${to} is not one of the states`)
    }
  }

  // Fighting is given the deeds because `shoot` with nothing to fire and
  // `attack` with no weapon are both things that look like nothing happening.
  const deeds = spec.actions.map((action) => action.deed)
  if (spec.fight) problems.push(...fightProblems(spec.fight, deeds))
  else if (deeds.includes('attack') || deeds.includes('shoot')) {
    problems.push('something that fights needs to be told how hard it hits')
  }

  if (spec.craft) problems.push(...craftProblems(spec.craft))

  if (spec.price !== undefined) {
    if (!Number.isInteger(spec.price) || spec.price < 0 || spec.price > MAX_PRICE) {
      problems.push(`a price is 0-${MAX_PRICE} whole coins`)
    }
  }

  if (spec.tags.length > MAX_BLUEPRINT_TAGS) {
    problems.push(`at most ${MAX_BLUEPRINT_TAGS} tags`)
  }
  if (spec.tags.some((tag) => tag.length > MAX_TAG_LENGTH || tag.trim() === '')) {
    problems.push(`a tag must be 1-${MAX_TAG_LENGTH} characters`)
  }

  return problems
}

/**
 * Whatever is wrong with a `use` block, said in words.
 *
 * Its own function rather than four more branches in `blueprintProblems`,
 * because the editor draws this as its own section and wants to mark that
 * section rather than the whole form.
 *
 * Named `usingProblems` rather than the more obvious `useProblems`: anything
 * matching `use[A-Z]` is a React hook as far as the linter is concerned, and a
 * pure function in `src/domain` being told it may only be called from a
 * component is a fight not worth having over one letter.
 */
export function usingProblems(use: UseSpec): string[] {
  const problems: string[] = []

  for (const [field, value] of [
    ['enter', use.enter],
    ['loop', use.loop],
    ['leave', use.leave],
  ] as const) {
    // Null is "no clip" and is the only spelling of it, exactly as it is for
    // `BlueprintSpec.clip`. A blank string is the second spelling a round trip
    // grows a field nobody wrote out of.
    if (value !== null && value.trim() === '') {
      problems.push(`the ${field} clip must be named, or absent`)
    }
    if (value !== null && value.length > MAX_CLIP_NAME) {
      problems.push(`a clip name must be under ${MAX_CLIP_NAME} characters`)
    }
  }

  if (use.seats.length === 0) {
    // A thing you can get into and then stand nowhere. See `UseSpec.seats`.
    problems.push('something you can get into needs at least one seat')
  }
  if (use.seats.length > MAX_SEATS) {
    problems.push(`at most ${MAX_SEATS} people`)
  }

  for (const seat of use.seats) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = seat[axis]
      if (!Number.isFinite(value) || Math.abs(value) > MAX_SEAT_OFFSET) {
        problems.push(`a seat must be within ${MAX_SEAT_OFFSET} cells of the thing`)
      }
    }
    // The socket is *not* checked against the blueprint's sockets, and that is
    // the same decision every clip name in this file makes: a seat pointing at a
    // socket nobody has drawn yet resolves to the thing's origin, which is
    // somebody sitting in the middle of the bench - visible, and fixable by
    // whoever is looking at it. Refusing to save is how you lose the other six
    // edits in the panel because the seventh got ahead of itself.
    if (seat.socket !== undefined && seat.socket.trim() === '') {
      problems.push('a seat sits on a named socket, or on none')
    }
  }

  if (use.inputs.length > MAX_USE_INPUTS) {
    problems.push(`at most ${MAX_USE_INPUTS} extra animations`)
  }

  const keys = new Set<string>()
  for (const input of use.inputs) {
    if (input.key.length !== 1) {
      problems.push('an input is one key')
    }
    if (keys.has(input.key.toUpperCase())) {
      // Two answers to one key is a coin toss inside a resolution nobody can
      // see - the same reason two entities may not share a name in an XP.
      problems.push(`${input.key.toUpperCase()} is bound twice`)
    }
    keys.add(input.key.toUpperCase())

    if (input.clip.trim() === '') problems.push('an input needs a clip to play')
    if (input.clip.length > MAX_CLIP_NAME) {
      problems.push(`a clip name must be under ${MAX_CLIP_NAME} characters`)
    }
  }

  return problems
}

/** Whether getting into this is a thing somebody can do. */
export function usable(spec: { use: UseSpec | null }): boolean {
  return spec.use !== null
}

/**
 * Whether pressing G at this does anything beyond sitting in it.
 *
 * Three ways a thing can answer the key, and a thing with none of them should
 * leave G alone so that the prompt over it stays honest:
 *
 *   - an action fires on `use`
 *   - a state has a way out that waits for `use`
 *   - it has somewhere to put something, or something to take
 *
 * The third is the one that is easy to leave out and is the whole point of a
 * rack: a shelf with a pan on it has no actions and no machine, and G is how
 * you take the pan.
 */
export function answersUse(spec: {
  actions?: readonly ThingAction[]
  states?: States
  craft?: CraftSpec
}): boolean {
  if ((spec.actions ?? []).some((action) => action.when === 'use')) return true
  if (
    spec.states?.states.some((state) =>
      state.changes.some((change) => change.when === 'use'),
    )
  ) {
    return true
  }
  return (spec.craft?.slots.length ?? 0) > 0
}

/** The deeds that are meaningless without something to name. */
export function needsValue(deed: ThingDeed): boolean {
  return deed === 'play' || deed === 'emit' || deed === 'become'
}

/** Whether this thing has states, a fight in it, or somewhere to put something. */
export function machined(spec: { states?: States }): boolean {
  return (spec.states?.states.length ?? 0) > 0
}

/** Whether anything can hurt this, in a room where hitting is allowed. */
export function breakable(spec: { fight?: FightSpec }): boolean {
  return (spec.fight?.health?.hurtBy.length ?? 0) > 0
}

/** Whether anything can be put on this, or taken off it. */
export function holds(spec: { craft?: CraftSpec }): boolean {
  return (spec.craft?.slots.length ?? 0) > 0
}

/**
 * What taking from this socket costs, in coins.
 *
 * Zero for a free slot and for a socket nobody has drawn, which are the same
 * answer for the same reason `seatAt` falls back to the origin: the failure of
 * a mistyped socket should be something visible and harmless, and charging for
 * a slot that does not exist is neither.
 */
export function priceOfSlot(spec: { craft?: CraftSpec }, socket: string): number {
  return spec.craft?.slots.find((slot) => slot.socket === socket)?.price ?? 0
}

/** What summoning one costs, in coins. */
export function priceOfThing(spec: { price?: number }): number {
  return spec.price ?? 0
}

/**
 * The bounds a panel draws its number fields against.
 *
 * Re-exported rather than copied so a body field retuned in the engine moves
 * the room's slider with it - the same reason the engine's own editor imports
 * these instead of writing them down twice.
 */
export { BODY_LIMITS }
