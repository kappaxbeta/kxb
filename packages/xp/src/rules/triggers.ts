/**
 * When a rule runs.
 *
 * A trigger is an event, an optional condition, and a list of verbs. The verbs
 * are in ./verbs and are a closed vocabulary; this is the other half - what
 * makes them fire.
 *
 * ---------------------------------------------------------------------------
 * Why the condition is this small
 * ---------------------------------------------------------------------------
 * `hp <= 0`. One property, one comparison, one number. That is the entire
 * grammar, and it is small on purpose rather than as a first draft.
 *
 * A richer expression language is the obvious next thing and it is a trap at
 * this layer: the moment a condition can reference two entities or call a
 * function, it needs a parser, a scope, an evaluation order and a story about
 * what happens when it throws - and every one of those is a thing the *editor*
 * then has to show. The escape hatch for a rule that genuinely needs to compute
 * is a script in a worker (docs/xp/creator.md §10), not a bigger grammar here.
 *
 * What this size buys: a condition is three fields, so the panel that edits one
 * is three controls, and there is no expression anybody can write that fails at
 * runtime.
 *
 * ---------------------------------------------------------------------------
 * Enter and exit are remembered, not recomputed
 * ---------------------------------------------------------------------------
 * "Is the player inside this box" is a fact about now; "did they just walk in"
 * is a fact about the change. So the overlap set from last tick is kept, and an
 * `enter` fires on what is in the set now and was not before.
 *
 * Without that, `enter` fires sixty times a second while you stand in a
 * doorway, which turns a "you picked it up" into "you picked it up sixty times"
 * - and that class of bug is invisible until somebody counts their coins.
 */

import type { Blueprint, Box } from '../document/blueprints'
import { worldTransform, type EntityId, type EntityWorld } from '../world/entities'
import type { Mark } from '../document/format'
import { applyVerbs, type Effect, type Verb, type VerbTarget } from './verbs'

/** What sets a trigger off. */
export type TriggerEvent =
  /** Something came inside this entity's box. */
  | 'enter'
  /** Something that was inside left. */
  | 'exit'
  /** This entity took damage - fired after the health has already changed. */
  | 'damaged'
  /** This entity came into being. */
  | 'spawned'
  /**
   * A player pressed one of the keys the document binds.
   *
   * The odd one, in the same way `finished` is: it comes from *outside* the
   * world rather than from something that happened inside it, and it names
   * something the level invented rather than something the engine knows about.
   *
   * It exists because `player.keys` was a format with no reader. A document
   * could bind five keys, the editor could bind them by pressing them, the HUD
   * could list them - and nothing anywhere turned a press into anything. Five
   * buttons that do nothing is a worse state than no buttons at all, because an
   * author sets one, believes it, and finds out from a player.
   *
   * A `pressed` trigger must name **which** binding it listens for, in `key`.
   * Without that all five keys would be the same key, and an author who bound
   * "grab" and "drop" would have one action - which is most of the point of
   * having five.
   */
  | 'pressed'
  /**
   * Another *entity* touched this one.
   *
   * The gap `enter` structurally cannot cover, and it is worth being precise
   * about why rather than reading them as near-synonyms:
   *
   * `stepTriggers` is handed **probers**, and the host hands it exactly one -
   * the player. So `enter` means "the person walked into me" and nothing else
   * in a level can set anything off by moving. A ball rolled into a goal, a
   * crate carried into a wall, a thrown thing meeting the floor: none of them
   * fired anything at all, whatever rules they carried.
   *
   * It is **not** about solidity. Entities are not solid to the player -
   * `buildSolids` is built from the world's placements and has never seen one -
   * so this is not "bumped into" as opposed to "passed through". Both events are
   * overlaps; the difference is entirely *who* is doing the overlapping.
   *
   * Which is also why the player does not fire this. Firing both for a person
   * walking into a pickup would run the same rule twice, and an author who wrote
   * one rule would watch it happen twice.
   *
   * `other` is the entity that touched it, so `teleport other to gate` and
   * `damage other` read exactly as they do on an `enter`.
   */
  | 'collide'
  /**
   * This entity hit the **level** - a floor, a wall, a placement.
   *
   * `collide`'s missing half, and the two are worth reading together. That one
   * is "another entity touched me" and is found by comparing overlaps; nothing
   * anywhere reported meeting the world itself, because until `@kxb/xp/bodies`
   * nothing in a level *could* - an entity was where it was put, so it never
   * arrived anywhere.
   *
   * A body has now landed, bounced off a wall or been stopped by a step, and
   * that is the moment a thud, a puff of dust, a broken crate or a ball that
   * goes rainbow on the woodwork hangs off. Fired from the contacts
   * `stepBodies` returns, by the host, through `stepHits`.
   *
   * `other` is **null**, always, for the same reason `dropped`'s is: there is
   * nobody. The thing it hit is the level, which is not an entity and has no id
   * - so a rule that writes onto `other` writes onto nothing, exactly as it
   * does on a drop. A rule about hitting a *thing* is `collide`, and the split
   * is that clean on purpose.
   *
   * Fires on the frame of the contact and not while resting. A body lying on
   * the floor has stopped, and re-firing this every frame would be a level
   * whose landing sound is a drone - see `inSolid`, which is where the epsilon
   * that guarantees it lives.
   */
  | 'hit'
  /**
   * This entity was picked up, and `dropped` is the other half.
   *
   * Asked for directly: *a trigger for an object to know that it is held.* It
   * was the one thing about being carried a level could not react to — `carry`
   * moved the thing and told nobody, so a flag that should glow in somebody's
   * hand, a lamp that should light when lifted, or a bomb that should start
   * counting had no moment to hang a rule on.
   *
   * ---------------------------------------------------------------------------
   * On the object, and `other` is who picked it up
   * ---------------------------------------------------------------------------
   * The same asymmetry `carry` itself has: the trigger is on the thing being
   * carried, and the carrier arrives as `other` — so `damage target: 'other'`
   * on a `held` rule hurts whoever grabbed it, and `when: { of: 'other', … }`
   * asks about them. That is what makes "only our side may pick this up"
   * writable.
   *
   * ---------------------------------------------------------------------------
   * An edge, found by looking rather than by being told
   * ---------------------------------------------------------------------------
   * Fired from `stepTriggers` by comparing who is hanging off whom against last
   * frame, exactly as `enter` and `exit` are found by comparing overlaps. The
   * alternative was firing it inside `applyVerb` where `carry` happens, and it
   * is wrong twice: verbs are pure and returning effects, so a verb that fired
   * rules would recurse — and it would miss every *other* way a thing stops
   * being held, of which there are already three (`drop`, `unhand`, `teleport`)
   * and one more that is not a verb at all: a peer's picture arriving over the
   * wire (`@kxb/xp/sharing`).
   */
  | 'held'
  /** Put down, however it was put down. See `held`. */
  | 'dropped'
  /**
   * A bound key let go of, which is the other half of `pressed`.
   *
   * The edge a level needs to say *while I am holding this*, and it did not
   * exist: a press was one thing and there was no second event, so "pick up on
   * the way down and put down on the way up" had to be faked as two `pressed`
   * rules with a latch between them to stop the first undoing the second inside
   * one press. A board game is the level that made that unbearable - four
   * pieces are four entities running four copies of the same correct rule - and
   * this is what replaces the whole arrangement with two rules that cannot
   * collide, because they are different events.
   *
   * Not `within`-narrowed the way a press is, and it must not be: what you let
   * go of is what is in your hand, not what you happen to be pointing at by
   * then, and you will have walked somewhere between the two.
   */
  | 'released'
  /**
   * The match ended, however it ended.
   *
   * A fact about the *world* rather than about this entity, which makes it the
   * odd one of the five - it fires on everything that asks, once, on the frame
   * the whistle goes. `spawned` is the same shape and the precedent for it.
   *
   * It exists because the end of a match was visible only to the HUD:
   * `stepMatch` decided it, the scoreboard drew it, and the document never
   * heard. So a level could not open a gate when the race ended, drop the walls
   * of an arena, or spawn anything to celebrate with - all of which an author
   * would reasonably expect the moment they set a score limit.
   *
   * **One event rather than three, and the reason is not the one I first wrote
   * down.** `stepMatch` knows *why* it ended - `finish | score | time` - and
   * this deliberately does not carry it.
   *
   * The argument I reached for was that a single event costs the ability to say
   * "ended on time". Lane A checked `holds` and it does not: a condition reads
   * `world.props.get(id)` - the properties of *the entity the trigger is on* -
   * so the reason has no home in a condition whether there is one event or
   * three. Splitting preserves no escape hatch, because there is no hatch.
   *
   * What is left is the argument against splitting, standing on its own:
   * **three events makes the common case cost three triggers.** "Open the gate
   * when the race ends" is reason-agnostic, and so is every use anybody has
   * named - confetti, dropping an arena's walls, a sound. Those authors would
   * write the same rule three times and have to keep them in step, paid on
   * every level to serve a rare one. Adding a fourth `finished` alongside to
   * fix that would leave two ways to say the same thing.
   *
   * **Known-deferred, recorded so it is a decision rather than a gap somebody
   * rediscovers:** there is no way to react to *why* a match ended. When that is
   * wanted it arrives as a mechanism for reading a match-level fact - worth
   * designing once, for the clock and the score and the winner together, rather
   * than being inferred from an event name.
   *
   * A `freestyle` document never fires it, and that is right rather than a gap:
   * a level with no end has no end to react to.
   */
  | 'finished'
  /**
   * This player has been dealt a secret role.
   *
   * The other event that comes from outside the world, and the one `rules.roles`
   * has been waiting for since it was written: the arbiter deals a value to each
   * player, the client is told its own, and until now nothing in a document
   * could react to it. A deck that nobody can act on is a deck that only exists
   * in the HUD.
   *
   * It fires **once, on every entity that asks**, on the frame the role arrives
   * — the same shape as `finished`, and for the same reason: it is a fact about
   * the round rather than about one thing in it.
   *
   * The role itself is a **property on the player**, named after the value that
   * was dealt and set to 1 — `bug` becomes `props.bug = 1`. So a rule reads it
   * the way it reads anything else, `{ of: 'other', prop: 'bug' }` on the person
   * who set the trigger off or `{ prop: 'bug' }` on the entity the rule is on,
   * and the vocabulary needs nothing new. A player dealt nothing has no such
   * property, which reads as zero — so "everybody who is not the bug" is
   * `bug == 0` and works before the deal as well as after it.
   *
   * A level with no `roles` never fires it, exactly as a `freestyle` level never
   * fires `finished`.
   */
  | 'dealt'
  /**
   * Back, after having been turned off for a while.
   *
   * The other half of `deactivate`, and until now the only moment in this
   * engine that happened to a thing and told nothing. `stepReturns` puts an
   * entity back and the runtime says "the crate is back" in the corner of the
   * screen; the document could not hear it, so a thing that comes back could
   * not come back *changed*.
   *
   * Which is what makes a target worth hitting twice. `deactivate` was built so
   * an ammo box could go quiet and return **with everything it had** - its
   * name, its properties, whatever a rule had written on it - and that is
   * exactly wrong for the case people actually reach for it in: a dummy knocked
   * to zero comes back still on zero, dies again to the next tap, and blinks.
   * The fix is one rule the author writes (`on: returned` → `heal`) rather than
   * a rule the engine has about what returning means, because "comes back
   * whole" is true of a punching bag and false of the ammo box this verb was
   * built for.
   *
   * `other` is null: nothing set it off. A timer ran out, which is a fact about
   * the clock rather than about anybody in the room.
   *
   * Deliberately **not** `spawned`. A thing that has been here all along and
   * was merely off has not come into being, and folding the two would fire
   * every set-up rule a blueprint has - the coin's initial spin, the turret's
   * first shot - every time a pickup refilled.
   */
  | 'returned'
  /**
   * Somebody said a name, and this entity was listening for it.
   *
   * The other half of the `emit` verb, which until now was a verb with no
   * reader. `emit` produced an effect, the runtime printed it in the corner of
   * the screen, and nothing in a document could hear it — so the one way for
   * one thing in a level to tell another thing something was to write a number
   * on it and have the other thing watch that number every frame. That works,
   * and it is a level built out of polling.
   *
   * This is the same shape `pressed` has, and deliberately so: an event that
   * carries a **name the level invented** rather than one the engine knows
   * about, matched against the name a trigger says it is listening for. The
   * vocabulary stays closed — `on` is still one of this list — while what
   * travels *through* it is open, which is the split that lets an author name
   * their own moments without the parser losing the ability to refuse a typo.
   *
   * `other` is whoever emitted it, so "who opened the gate" is answerable the
   * same way it is for a press or a crossing.
   *
   * **Fan-out, not delivery to one thing.** Every live entity listening for
   * that name hears it. A signal addressed to a particular entity would be a
   * different feature — the sender would have to name the receiver, which means
   * knowing it exists — and the case people reach for this in is one thing
   * announcing and several reacting.
   *
   * **What it is not** is a way to make a thing happen on another machine. See
   * `stepEmitted` for which emits travel and which do not, and why a script's
   * emit deliberately does not.
   */
  | 'emitted'

export const TRIGGER_EVENTS: readonly TriggerEvent[] = [
  'enter',
  'exit',
  'damaged',
  'spawned',
  'finished',
  'dealt',
  'pressed',
  'collide',
  // Beside `collide`, which is the half of it about other entities. This one
  // is about the level, and an author choosing between them is choosing what
  // they mean by "something".
  'hit',
  // Next to each other and after `collide`, because they are the pair somebody
  // is choosing between once they have a thing that can be picked up.
  'held',
  'dropped',
  'released',
  // Last, and beside nothing: it is the only one whose partner is a *verb*
  // rather than another event.
  'returned',
  // After it, and now there are two of that kind: `emitted` is the partner of
  // `emit` exactly as `returned` is the partner of `deactivate`.
  'emitted',
]

export type Comparison = '<' | '<=' | '==' | '!=' | '>=' | '>'

export const COMPARISONS: readonly Comparison[] = ['<', '<=', '==', '!=', '>=', '>']

/** `hp <= 0`, and nothing more elaborate. */
export interface Condition {
  /**
   * Whose property this is about. `self` - the entity the rule is on - by
   * default, which is every condition written before this field existed.
   *
   * ---------------------------------------------------------------------------
   * The field that made a mode expressible
   * ---------------------------------------------------------------------------
   * Capture the flag was blocked on exactly this and nothing else. "The flag
   * reached our base" is a rule on the *base*, asking about the thing that just
   * walked into it - and a condition that could only read the base's own
   * properties could not ask. The four gaps that entry listed were a `pressed`
   * with a reach, a weapon that goes away, a stun, and this one; only this one
   * stopped the mode being *writable*.
   *
   * What it deliberately is **not** is a `carrying` predicate. A verb can
   * already write a property onto whoever set a trigger off - `setProp target:
   * 'other'` - so "is carrying the flag" is `flag == 1` on that person, said in
   * the vocabulary the format already has. A predicate would have been a second
   * way to say a fact, and a second thing for every reader to know about.
   *
   * `other` is null on the events that have nobody behind them - `spawned`,
   * `finished`, a `pressed` with no presser - and a condition about nobody is
   * false rather than true. A rule that fired for everything because its
   * subject was missing is the failure mode worth refusing.
   */
  of?: VerbTarget
  prop: string
  is: Comparison
  /**
   * A number, or one the level is keeping.
   *
   * ---------------------------------------------------------------------------
   * The one indirection, and where it was put instead
   * ---------------------------------------------------------------------------
   * docs/xp/xp-flow.md §4 calls this "the one genuinely new idea in the file"
   * and is suspicious of it, rightly: an expression where a literal was is the
   * first step onto a slope that ends in a language. So it is worth saying
   * exactly which slot it went into and why that is the shallow one.
   *
   * The proposal put it on `prop`, as `@world.<field>` naming *which property to
   * read* - which turns a name into an expression, and the thing on the other
   * side of it is an entity id sitting in a data field, which nothing in this
   * format can write. Here it is on `value`, and it means the plainest possible
   * thing: **compare against a number the level is keeping rather than one the
   * document typed.** `prop` stays a name, `of` stays a subject, and the only
   * thing that gained a second form is the number.
   *
   * That is also what makes it buy the game §4 was written for without a script.
   * The round rolls a number into a field it declared - `roll` already does
   * exactly that, and already asks the arbiter for it so every client agrees -
   * and the thing to catch is whichever one carries it:
   *
   *     "does": [{ "op": "roll", "key": "wanted", "sides": 6 }]
   *     { "on": "held", "when": { "prop": "number", "is": "==", "value": "@world.wanted" },
   *       "do": [{ "op": "emit", "event": "caught" }] }
   *
   * One level and no nesting: `@world.<field>`, never `@world.a.b` and never
   * `@self.`. A field nobody has written reads as zero, exactly as a missing
   * property does - see `holds`.
   */
  value: number | DataRef
}

/**
 * A number read out of the level's own data, written where a literal goes.
 *
 * A template type rather than a bare `string` so the union is discriminated by
 * shape: anything that is not a number has to look like this, and a `value` of
 * `"7"` is a type error rather than a comparison against `NaN`.
 */
export type DataRef = `@world.${string}`

/**
 * What a reference may name.
 *
 * The same characters `DATA_NAME` allows in ./data, and deliberately no dot: one
 * level is the whole of the design, and the parser refusing `@world.a.b` is what
 * keeps it from becoming a path.
 */
export const DATA_REF = /^@world\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

export function isDataRef(value: unknown): value is DataRef {
  return typeof value === 'string' && DATA_REF.test(value)
}

/** The field a reference names, for a reader that wants the key rather than the number. */
export function refField(value: DataRef): string {
  return value.slice('@world.'.length)
}

/**
 * The number a condition is compared against, whichever form it was written in.
 *
 * One place, because there are three callers and a fourth that only reads it to
 * draw it - and a second copy of "absent is zero" is a second chance to make a
 * missing field mean *skip this rule* instead, which is the failure this file
 * refuses everywhere else.
 */
export function valueOf(
  value: number | DataRef,
  data?: ReadonlyMap<string, number>,
): number {
  if (typeof value === 'number') return value
  return data?.get(refField(value)) ?? 0
}

export interface Trigger {
  on: TriggerEvent
  /**
   * Whose rule this is: a property whoever sets it off has to carry.
   *
   * -------------------------------------------------------------------------
   * Not a second `when`, and the difference is where it is asked
   * -------------------------------------------------------------------------
   * `when` is a question about *state* - is there a roll, is the health low, has
   * the door been opened. This is a question about *standing*: is this thing
   * yours to touch at all. They read alike and they belong at different points,
   * which the order in `fire` already says out loud - `key`, `within` and now
   * this are asked before `holds`, because a thing across the level or somebody
   * else's piece is not a rule whose condition failed, it is a rule this press
   * was never aimed at.
   *
   * Keeping them apart is also what makes both usable at once. `when` takes one
   * condition, deliberately, and the board game had already spent it on the
   * dice - so "there is a roll **and** this piece is mine" had nowhere to live
   * and the four seats could each move all sixteen pieces. Written as a `by`,
   * the two questions stop competing for the same field.
   *
   * -------------------------------------------------------------------------
   * A group is a property, not a list
   * -------------------------------------------------------------------------
   * `by: 'team:blue'` is "blue's, and nobody else's", because `spawnPlayer`
   * writes `team:<side>` onto a body that has a side and onto nothing else -
   * see `teamProp`. But nothing here knows what a team is: it is a property
   * name, so `by: 'has-key'` is a door only somebody carrying one may open, and
   * `by: 'is-blue'` is a rule only a blue *piece* can set off.
   *
   * Defining a group by a property rather than by a `groups` list is the same
   * argument `tags` makes one paragraph over in ./blueprints: a list is a second
   * place to keep the membership in step with the thing that grants it, and the
   * property is already written by whoever grants it.
   *
   * **Non-zero, not present**, which is the rule everywhere else in this engine:
   * a property nobody has written reads as zero, so `by` is false before the
   * sides are known as well as for the side you are not on.
   */
  by?: string
  when?: Condition
  /**
   * Which binding this listens for. Only meaningful on `pressed`.
   *
   * It is the `does` name from `player.keys` - the name the *level* invented -
   * rather than a `KeyboardEvent.code`. That separation is the whole reason a
   * binding has two halves: which physical key is a setting a player might
   * change or a headset might not have, and what it means is a fact about the
   * level. A trigger naming `KeyE` would break the moment somebody rebound it,
   * and would be unreachable in VR, where there is no E.
   *
   * Refused on every other event rather than ignored - see `readTrigger`. A
   * field that is silently dropped is the failure this format keeps having, and
   * `cameraProblems` refusing side-only fields on a follow camera is the
   * precedent.
   */
  key?: string
  /**
   * How near the presser has to be, in cells. Only meaningful on `pressed`.
   *
   * A press is offered to every live entity, which is right for "open the
   * hatch" - the presser is standing in front of it by construction, and the
   * level has one. It is wrong for "press E to pick this up", where there are
   * two flags and a key that takes whichever one it likes is a game of chance.
   * This is the field that makes a pickup a place rather than a keystroke.
   *
   * **A sphere, not a circle.** The distance is the full three-dimensional one
   * between the rule's entity and the presser, both composed through their
   * parents. Measuring on the floor plane only would put a thing on the balcony
   * directly above you in reach of a press made underneath it, which reads as
   * grabbing through a ceiling.
   *
   * **Absent means everywhere**, which is what every `pressed` rule written
   * before this field did and still does. So there is no ceiling on it: a reach
   * of a thousand cells is the same rule as no reach at all, where a `jump` of a
   * thousand is a player in orbit. Zero and below are refused, because a rule
   * that can never fire is a typo rather than a design.
   *
   * Refused on every other event, the way `key` is: `enter` already has a reach
   * and it is the entity's own box, so a second one would be two answers to one
   * question.
   */
  within?: number
  /**
   * Which name this listens for. Only meaningful on `emitted`.
   *
   * `key` on a `pressed` trigger is the precedent, down to the refusal:
   * required where it means something, refused everywhere else rather than
   * ignored, for the same reason - an `enter` carrying one would read as if it
   * did something.
   *
   * Matched as an exact string against what `emit` said. No globbing, no
   * namespaces, no wildcard: a level that wants "any door" has a property to
   * test with, and a matcher here would be a second little language living
   * inside a field, arriving before anybody has asked for the first.
   */
  event?: string
  do: readonly Verb[]
}

/**
 * Does the condition hold, for the entity it is about?
 *
 * `other` is the one that set the trigger off, and is only consulted by a
 * condition that asked for it. Optional and last so every existing caller -
 * including the tests that predate `of` - keeps working unchanged.
 */
/**
 * The one property name the world answers for.
 *
 * Reserved at the parser (`readProps`) so a blueprint cannot declare one and
 * find it quietly ignored - the failure this codebase keeps meeting, where a
 * field parses, the editor can set it, and nothing reads it.
 */
export const HELD_PROP = 'held'

export function holds(
  world: EntityWorld,
  id: EntityId,
  condition: Condition | undefined,
  other: EntityId | null = null,
  /**
   * The level's declared data, when the host is keeping any.
   *
   * Last and optional for the reason `other` is: every caller that predates
   * `of: 'world'` — including the tests written before it — keeps working
   * unchanged, and a host with none reads every field as zero.
   */
  data?: ReadonlyMap<string, number>,
): boolean {
  if (!condition) return true

  /**
   * A condition about the level's own data reads the map the host is keeping.
   *
   * The other half of `world` as a target (docs/xp/backlog.md §7c): a rule
   * writes saved data with `addProp target: 'world'` and reads it back with
   * `of: 'world'`, in the vocabulary that already existed rather than a
   * `whenData` beside it.
   *
   * A host with no data - no store, or a document that declared none - reads
   * every field as **absent**, which falls through to the same zero a missing
   * property already reads as. That is deliberate and matches the sentence
   * below: a rule about a number nobody has written is a rule about zero, not a
   * rule that is skipped. `needs: persistence` is how a level says it cannot
   * work that way.
   */
  /**
   * Both sides of the comparison may now come out of the level's data, and that
   * is not a special case worth branching on: `of: 'world'` decides where the
   * *left* number is read and `@world.` decides the *right* one, and a condition
   * that uses both - `{ of: 'world', prop: 'caught', is: '>=', value: '@world.needed' }` -
   * is two ordinary reads rather than a third thing.
   */
  const want = valueOf(condition.value, data)

  if (condition.of === 'world') {
    return compare(data?.get(condition.prop) ?? 0, condition.is, want)
  }

  // A condition about whoever set it off, when nobody did, is false. See the
  // note on `of`: the alternative is a rule that fires for want of a subject.
  if (condition.of === 'other' && other === null) return false
  const subject = condition.of === 'other' ? other! : id

  /**
   * `held` is the world's answer, not a property anybody wrote.
   *
   * Asked for as *"just state, so scripts or behaviour can look and react"* —
   * beside the `held` and `dropped` triggers, which are the *edge*. A rule that
   * wants "while it is in somebody's hands" rather than "the moment it was
   * picked up" had to mirror the fact into a property with a pair of `setProp`s
   * and keep them in step, which is the bookkeeping the capture template does
   * by hand and the kind that goes wrong quietly.
   *
   * Derived rather than stored, which is what makes it always true: it is
   * `world.parent`, the same row `carry` writes and `drop`, `unhand`, `teleport`
   * and an arriving peer's picture all clear. There is nothing to keep in step
   * because there is only one copy.
   */
  if (condition.prop === HELD_PROP) {
    // `parent` *or* `heldBy`: this client's own hands, or a peer's, which is
    // what makes the answer the same on every screen. See the field.
    const inHand = world.parent.has(subject) || world.heldBy.has(subject)
    return compare(inHand ? 1 : 0, condition.is, want)
  }

  const props = world.props.get(subject)
  // A missing property reads as zero rather than as "skip this rule". A crate
  // with no `hp` and a rule about `hp <= 0` is a crate that is already broken,
  // which is a strange level and a predictable one - where "never fires" is a
  // rule that looks correct and silently does nothing.
  const actual = props?.[condition.prop] ?? 0
  return compare(actual, condition.is, want)
}

/**
 * One comparison, in one place.
 *
 * Extracted when `of: 'world'` arrived and needed the same six cases against a
 * number from a different table. Two copies of this switch is two places for a
 * seventh comparison to be added to, and one of them to be forgotten.
 */
function compare(actual: number, is: Comparison, value: number): boolean {
  switch (is) {
    case '<':
      return actual < value
    case '<=':
      return actual <= value
    case '==':
      return actual === value
    case '!=':
      return actual !== value
    case '>=':
      return actual >= value
    case '>':
      return actual > value
  }
}

/**
 * Is the one who set this off close enough to it?
 *
 * Exported because it is a fact about the world that reads the same from a test
 * and from a host - and because the runtime wants to draw a prompt over the
 * thing a press would reach, which is this question asked a frame early.
 *
 * Composed positions on both sides: a flag in somebody's hand is at their hand
 * and not at the floor where it was placed, and a rule about picking it up
 * should agree with what the player can see.
 */
/**
 * Does this entity carry that property, as something other than zero?
 *
 * The whole of `Trigger.by`. Null is false rather than true: a rule with an
 * owner and nobody to own it has not been set off by the right person, it has
 * been set off by nobody.
 */
export function carries(world: EntityWorld, id: EntityId | null, prop: string): boolean {
  if (id === null) return false
  return (world.props.get(id)?.[prop] ?? 0) !== 0
}

export function within(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  id: EntityId,
  other: EntityId | null,
  reach: number,
): boolean {
  if (other === null) return false
  const here = worldTransform(world, id, blueprints)
  const there = worldTransform(world, other, blueprints)
  const dx = here.x - there.x
  const dy = here.y - there.y
  const dz = here.z - there.z
  // Squared, so a reach test costs no square root sixty times a second per
  // entity in the level - which is what this is, once a document uses it.
  return dx * dx + dy * dy + dz * dz <= reach * reach
}

/**
 * What a caller knows about an event beyond which one it was.
 *
 * Optional wherever it is taken and always last, so every call site written
 * before any given field keeps working. Each entry is read by exactly one
 * thing, and each is absent in the honest case rather than defaulted:
 *
 * - `now` by `deactivate` - a host that cannot say what time it is cannot
 *   promise to bring anything back, see `VerbContext.now`.
 * - `key` by `pressed`, which is how five bindings stay five bindings.
 * - `marks` by `teleport`, so a destination can be named rather than measured.
 * - `data` by a condition asking `of: 'world'` and by `setProp`/`addProp`
 *   aimed at it. Rides in this bag rather than becoming a parameter, so a
 *   caller that has none is a caller that changed nothing. It is one map at
 *   both ends: a rule that adds a coin and then asks whether there are ten
 *   sees the one it just added, the ordering `applyVerbs` already promises
 *   within a single rule.
 * - `random` by a `damage` or `heal` with a range on it. Without it a range
 *   takes its low end, which is what keeps this whole pass a function of its
 *   inputs for anybody stepping it in a test.
 *
 * A named type rather than the same five fields written out at each of the six
 * places that pass them along: they were duplicated inline, and a bag that has
 * to be edited in six files is a bag that ends up different in one of them.
 */
export interface TriggerClock {
  now?: number
  key?: string
  /**
   * The one entity a reach-based press is meant for, when somebody has decided.
   *
   * Set by `pressOn` from `aimOf`, and absent everywhere else - which is what
   * makes it safe: absent means nobody has decided, and a `within` answers on
   * distance alone exactly as it always has. See where it is read, in `fire`.
   */
  aimed?: EntityId | null
  /**
   * The name an `emitted` trigger is being offered. See `Trigger.event`.
   *
   * Beside `key` rather than instead of it: they are the same idea for two
   * different events, and one field serving both would let a `pressed` rule and
   * an `emitted` rule set each other off by happening to name the same string.
   */
  event?: string
  marks?: readonly Mark[]
  data?: Map<string, number>
  random?: () => number
}

/**
 * Fire whatever this entity has for an event.
 *
 * Returns the host's share of the work. Everything that happens to the world
 * has already happened by the time this returns - see ./verbs.
 */
export function fire(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  id: EntityId,
  event: TriggerEvent,
  other: EntityId | null = null,
  clock?: TriggerClock,
): Effect[] {
  const name = world.blueprint.get(id)
  const blueprint = name ? blueprints[name] : undefined
  if (!blueprint?.triggers?.length) return []

  const effects: Effect[] = []
  for (const trigger of blueprint.triggers) {
    if (trigger.on !== event) continue
    /**
     * The right key, not merely a key.
     *
     * A `pressed` trigger that matched any press would make all five bindings
     * the same binding. Compared before `holds` because it is the cheaper test
     * and because a trigger for a different key is not a rule that failed its
     * condition - it is a rule this event has nothing to do with.
     */
    if ((trigger.on === 'pressed' || trigger.on === 'released') && trigger.key !== clock?.key) {
      continue
    }
    /**
     * The right name, not merely a name. `key` above is the precedent.
     *
     * A rule listening for `gate-open` is not a rule that failed its condition
     * when `wave-cleared` goes past - it is a rule this signal has nothing to
     * do with, which is why this is a `continue` here rather than anything the
     * author can see.
     */
    if (trigger.on === 'emitted' && trigger.event !== clock?.event) continue
    /**
     * Near enough, when the rule asked for near.
     *
     * Before `holds` for the same reason the key is: a thing across the level is
     * not a rule whose condition failed, it is a rule this press was not aimed
     * at. And a reach with nobody behind it is false rather than true - the same
     * answer `of: 'other'` gives, and for the same reason: a rule that fires for
     * want of a subject is the failure mode worth refusing.
     */
    if (trigger.within !== undefined) {
      if (!within(world, blueprints, id, other, trigger.within)) continue
      /**
       * And the one thing in reach, when the caller has worked out which.
       *
       * A reach fires on *everything* inside it, which is right for a rule that
       * lights three lamps and wrong for one that picks something up: standing
       * among four pieces, one press ran the same correct rule four times. The
       * caller that knows better is `pressOn`, which asks `aimOf` - the same
       * answer the highlight is drawn from, so the thing under the cursor is the
       * thing that moves.
       *
       * Opt-in, so every caller written before this is unchanged: absent means
       * nobody has decided, and the reach alone answers as it always has. And
       * only `within` rules are narrowed - a rule with no reach is not aimed at
       * anything, so a *put down* still fires wherever the thing in your hand
       * happens to be.
       */
      if (clock?.aimed !== undefined && clock.aimed !== id) continue
    }
    /**
     * Theirs, when the rule says whose it is.
     *
     * Beside the reach and before the condition, for the reason on the field:
     * somebody else's piece is not a rule that failed its condition, it is a
     * rule that was not theirs to set off. And a rule with an owner and nobody
     * to own it is false rather than true - the same answer `within` gives when
     * `other` is null, and for the same reason.
     */
    if (trigger.by !== undefined && !carries(world, other, trigger.by)) continue
    if (!holds(world, id, trigger.when, other, clock?.data)) continue
    effects.push(...applyVerbs(world, blueprints, trigger.do, { self: id, other, ...clock }))
    /**
     * Stop if the entity is gone.
     *
     * A rule whose first verb is `despawn` and whose second is anything else is
     * a rule about a thing that no longer exists, and running the rest of it
     * writes properties onto a corpse. It is also the shape a `damaged` rule
     * takes almost every time.
     */
    if (!world.alive.has(id)) break
  }
  return effects
}

/**
 * Hurt something, and let it react.
 *
 * A function rather than a verb because it is the entry point *into* the rules
 * from outside them - a shot lands, a dash connects - and because the order
 * matters and should only be written once: the health changes first, then the
 * `damaged` triggers run, so a rule asking `hp <= 0` is asking about the damage
 * that just landed rather than about the tick before.
 *
 * ---------------------------------------------------------------------------
 * The clock goes through, and it is not decoration
 * ---------------------------------------------------------------------------
 * This used to call `fire` with nothing, which made every `damaged` rule the
 * one kind of rule with no idea what time it was - and the verb that reads the
 * time is `deactivate`. So the most natural rule anybody writes on this event,
 * *"at zero, go away for three seconds"*, turned the thing off **forever**:
 * `now` was undefined, the return was scheduled for `Infinity`, and nothing
 * anywhere said so. Every other entry point into the rules already passed one.
 */
export function damage(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  id: EntityId,
  amount: number,
  by: EntityId | null = null,
  clock?: TriggerClock,
): Effect[] {
  if (!world.alive.has(id)) return []
  const props = world.props.get(id)
  if (!props || props.hp === undefined) return []

  props.hp = Math.max(0, props.hp - amount)
  return fire(world, blueprints, id, 'damaged', by, clock)
}

/** One thing somebody said, and who said it. */
export interface Said {
  event: string
  from: EntityId
}

/**
 * How many signals one frame may deliver before the rest are dropped.
 *
 * A rule that emits the name it listens for is a loop, and it is a loop an
 * author writes by accident the first afternoon they use this - `on: emitted
 * "ping"` → `emit "ping"` reads as a heartbeat and is a hang. There is no
 * arrangement of the format that makes that unsayable, so it is bounded
 * instead.
 *
 * **A count of deliveries, not a depth.** Depth is the wrong bound twice: a
 * chain eight long is a legitimate level and a fan-out of two hundred
 * entities each re-emitting is not, and depth cannot tell them apart. This
 * counts the work, which is the thing that actually costs a frame.
 *
 * Generous on purpose. It is a runaway backstop, not a budget an author should
 * ever feel — a level near this number is a level with a bug in it, and the
 * number is high enough that saying so is fair.
 */
export const MAX_SIGNALS = 512

/**
 * Deliver what was said to whoever was listening.
 *
 * The reader for the `emit` verb, which had none. Separate from `stepTriggers`
 * rather than folded into it, because the two answer different questions: that
 * pass works out who is standing inside what, and this one delivers names that
 * have already been produced - by a rule, by a script, or by another signal.
 *
 * **Drained here rather than at the point of emission**, which is the ordering
 * rule this engine already keeps in two other places: `applyVerb` is pure and
 * returns effects, so a verb that fired rules would recurse through itself, and
 * ./script queues a script-dealt `damaged` rather than delivering it inside the
 * hook that caused it. One rule, now three times.
 *
 * What comes back is the effects **and** everything said in the course of
 * producing them, because the caller has one more job with that list: the ones
 * that have to cross the wire (see the host). A caller that only wants the
 * effects can ignore it.
 */
export function stepEmitted(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  said: readonly Said[],
  clock?: TriggerClock,
): { effects: Effect[]; said: Said[] } {
  const effects: Effect[] = []
  /**
   * Copied rather than consumed, so a caller can hand the same array to two
   * things - the host hands it to this and then to the socket.
   */
  const queue: Said[] = [...said]
  const heard: Said[] = []

  let delivered = 0
  // Indexed rather than iterated: a rule may say something while this runs, and
  // what it said belongs to this frame too. `MAX_SIGNALS` is what stops that
  // being a promise the engine cannot keep.
  for (let i = 0; i < queue.length; i++) {
    const next = queue[i]
    if (!next) continue
    heard.push(next)

    /**
     * A snapshot, because a rule may despawn something mid-fan-out.
     *
     * Iterating `world.alive` while a verb removes from it is the shape that
     * works until two entities kill each other, and ./script's tick loop takes
     * the same copy for the same reason.
     */
    for (const id of [...world.alive]) {
      if (delivered >= MAX_SIGNALS) break
      // Died earlier in this same fan-out. A signal is not a reason to run a
      // rule on something that is already gone.
      if (!world.alive.has(id)) continue

      const produced = fire(world, blueprints, id, 'emitted', next.from, {
        ...clock,
        event: next.event,
      })
      if (!produced.length) continue
      delivered += 1

      for (const effect of produced) {
        effects.push(effect)
        // A signal a signal caused. Queued rather than delivered here, so the
        // fan-out for one name finishes before the next name starts - which is
        // the difference between an order an author can reason about and one
        // that depends on entity ids.
        if (effect.kind === 'emit') queue.push({ event: effect.event, from: effect.from })
      }
    }

    if (delivered >= MAX_SIGNALS) break
  }

  return { effects, said: heard }
}

/** Who is standing inside what, carried between ticks. */
export type Overlaps = Map<EntityId, Set<EntityId>>

/**
 * Told when something walked into or out of something else.
 *
 * The overlap set is worked out here, once, and two different things want the
 * answer: the verbs, which run immediately and are why this pass exists, and a
 * script's `onTrigger`, which lives in a sandbox this file must not know about.
 * So the second consumer is a callback rather than a second overlap pass - the
 * cost of this is per entity per player, and doing it twice would double the
 * number that actually bounds how big a level can be (see `MAX_ENTITIES`).
 *
 * It is called *after* the entity's own verbs have run, so a script asking about
 * a property sees what the rules just did to it.
 */
export type Crossed = (
  id: EntityId,
  event: 'enter' | 'exit' | 'collide' | 'hit' | 'held' | 'dropped',
  /**
   * Whoever set it off, or null when nothing did.
   *
   * Null arrived with `dropped`: a thing that has been put down is not in
   * anybody's hands, so naming the person who used to hold it would be handing
   * a script a subject that is no longer true. Every other event here has one.
   */
  by: EntityId | null,
) => void

/**
 * Which of a document's actions have a rule for *letting go* of them.
 *
 * ---------------------------------------------------------------------------
 * Why anything outside the engine wants to know
 * ---------------------------------------------------------------------------
 * A tap is turned into an edge by `pressBuffer` in the runtime, and its rule is
 * that a quick press-and-let-go means *I have picked this up*: the release is
 * withheld and owed to the next tap. That is exactly right for `use` on a board
 * game, and it is exactly wrong for `roll` - an action with no `released` rule
 * anywhere in the document spends every second tap paying off a debt nothing
 * ever collects, so the die throws on the first press, does nothing on the
 * second, throws on the third. On a phone, where every action is a circle
 * somebody taps, that reads as a button that half works.
 *
 * The buffer cannot answer this on its own: `player.keys` says an action exists
 * and says nothing about which events a blueprint listens for. This does, from
 * the one place that knows - the triggers themselves.
 *
 * Names rather than key codes, because `Trigger.key` is a `does` and so is what
 * a thumb button carries. The caller matches on the same string on both
 * devices, which is what stops a phone and a keyboard disagreeing about what a
 * tap meant.
 */
export function releasedKeys(document: {
  blueprints: Readonly<Record<string, { triggers?: readonly { on: string; key?: string }[] }>>
}): Set<string> {
  const named = new Set<string>()
  for (const blueprint of Object.values(document.blueprints)) {
    for (const trigger of blueprint.triggers ?? []) {
      if (trigger.on === 'released' && trigger.key !== undefined) named.add(trigger.key)
    }
  }
  return named
}

/**
 * A body in the world that can set a trigger off.
 *
 * A player, usually. Typed as a box plus an id rather than as a player, because
 * nothing here should know what a player is - the same reason the character
 * controller takes a predicate instead of a world.
 */
export interface Prober {
  id: EntityId
  box: Box
}

function overlapping(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  )
}

/**
 * `spawned`, for everything that has appeared since the last step.
 *
 * ---------------------------------------------------------------------------
 * A trigger nothing fired
 * ---------------------------------------------------------------------------
 * `spawned` has been in the vocabulary, in the parser and in the editor's own
 * list since triggers existed, and **nothing in the engine ever fired it**. A
 * level could carry a rule that said "when this appears, do that", save it,
 * re-open it, and watch it do nothing for ever - and one shipped level does:
 * `steal-a-plant`'s gate emits its hint on `spawned`, so the hint has never
 * appeared.
 *
 * It was the only one. `finished` and `dealt` look unfired from inside this
 * package and are not - the host fires both, because both are facts about a
 * *round* rather than about the world, and the world is all this file can see.
 * An audit that only reads `packages/xp` will accuse them; two commit messages
 * of mine did.
 *
 * Its own pass rather than a case inside `stepTriggers`, because it answers a
 * different question. That one asks *who is overlapping whom* and needs
 * probers; this asks *what is new* and needs only the live set.
 *
 * ---------------------------------------------------------------------------
 * Why `seen` is pruned rather than only added to
 * ---------------------------------------------------------------------------
 * A pickup that deactivates and comes back is the same id leaving the live set
 * and rejoining it, and coming back *is* spawning - a rule that lights a lamp
 * when a coin appears should light it again for the coin that returned.
 * Keeping ids for ever would fire once in the level's lifetime and quietly
 * never again, which is the same silence this whole function exists to end.
 */
export function stepSpawned(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  /** Ids already announced. Owned by the caller and mutated here, like `overlaps`. */
  seen: Set<EntityId>,
  clock?: TriggerClock,
): Effect[] {
  const effects: Effect[] = []

  for (const id of world.alive) {
    if (seen.has(id)) continue
    seen.add(id)
    // No `other`: nobody spawned it *at* anybody, which is the whole difference
    // between this and every event `stepTriggers` reports.
    effects.push(...fire(world, blueprints, id, 'spawned', null, clock))
  }

  for (const id of [...seen]) if (!world.alive.has(id)) seen.delete(id)

  return effects
}

/**
 * Run the enter and exit triggers for this tick.
 *
 * `previous` is the overlap set from last tick and is *mutated* into this
 * tick's - the caller keeps one and hands it back, which is what makes "just
 * walked in" answerable at all.
 *
 * Note what is tested: every entity with a *trigger*, whether or not it has a
 * collider. A pickup you walk through has no box to stop you and must still
 * know you touched it, which is the case that makes this a separate pass rather
 * than something the collision could report.
 */
export function stepTriggers(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  probers: readonly Prober[],
  previous: Overlaps,
  onCross?: Crossed,
  /**
   * What time it is, passed through to every rule this fires.
   *
   * It was missing, and the omission was invisible in exactly the way this
   * codebase keeps being caught by: `deactivate` takes a `seconds` and falls
   * back to `Infinity` when nobody tells it the time, so a pickup that said
   * "come back in fifteen seconds" was a pickup that never came back. Every
   * test passed, the field parsed, the editor could set it - and the only path
   * that could actually *use* it was a script, because scripts pass a clock and
   * walking into something did not.
   *
   * Which is to say: `seconds` worked everywhere except the place a pickup is
   * picked up.
   */
  clock?: TriggerClock,
): Effect[] {
  const effects: Effect[] = []

  for (const prober of probers) {
    const before = previous.get(prober.id) ?? new Set<EntityId>()
    const now = new Set<EntityId>()

    for (const id of world.alive) {
      const name = world.blueprint.get(id)
      const blueprint = name ? blueprints[name] : undefined
      if (!blueprint?.triggers?.length) continue

      const box = world.box.get(id) ?? triggerBox(world, id)
      if (!box || !overlapping(box, prober.box)) continue
      now.add(id)
    }

    for (const id of now) {
      if (before.has(id)) continue
      effects.push(...fire(world, blueprints, id, 'enter', prober.id, clock))
      onCross?.(id, 'enter', prober.id)
    }
    for (const id of before) {
      // A thing that stopped existing did not "exit". It died, and `despawn`
      // already said so - firing exit as well would run a pickup's rules twice.
      if (!now.has(id) && world.alive.has(id)) {
        effects.push(...fire(world, blueprints, id, 'exit', prober.id, clock))
        onCross?.(id, 'exit', prober.id)
      }
    }

    previous.set(prober.id, now)
  }

  effects.push(...stepCollisions(world, blueprints, previous, onCross, clock))
  effects.push(...stepHolding(world, blueprints, previous, onCross, clock))

  return effects
}

/**
 * The key `previous` keeps the held set under.
 *
 * The same map the prober and collision passes share, for the reason given
 * there: `PLAYER_ID` is nine million and entity ids count up from nothing, so a
 * key above both can never collide with either — and one thing to hand back and
 * forth beats two that can get out of step.
 */
const HELD_KEY = -1 as EntityId

/**
 * Who is in somebody's hands, and who just stopped being.
 *
 * An edge found by looking, exactly as `enter` and `exit` are. Firing this from
 * inside `applyVerb` where `carry` happens was the obvious alternative and is
 * wrong twice: a pure verb that fired rules would recurse, and it would miss
 * every other way a thing stops being held — `drop`, `unhand`, `teleport`, and
 * a peer's picture arriving over the wire, which is not a verb at all.
 *
 * The **carrier** is `other`, which is what makes "only our side may pick this
 * up" writable: a `held` rule can ask `when: { of: 'other', … }` about whoever
 * grabbed it, and `damage target: 'other'` hurts them.
 */
function stepHolding(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  previous: Overlaps,
  onCross?: Crossed,
  clock?: TriggerClock,
): Effect[] {
  const before = previous.get(HELD_KEY) ?? new Set<EntityId>()
  const now = new Set<EntityId>()
  for (const id of world.parent.keys()) {
    if (world.alive.has(id)) now.add(id)
  }
  /**
   * A peer's hands count too, which is the whole of "send it in the network".
   *
   * So `held` fires on *every* client the moment somebody picks something up,
   * not only on theirs - a flag that should glow when carried glows on all four
   * screens, which is the only version of that feature worth having.
   */
  for (const id of world.heldBy.keys()) {
    if (world.alive.has(id)) now.add(id)
  }

  // Nothing has ever been carried in this level, which is nearly every level:
  // two walks of usually-empty maps and out.
  if (before.size === 0 && now.size === 0) return []

  const effects: Effect[] = []

  for (const id of now) {
    if (before.has(id)) continue
    // The carrier, when it is one of ours. A peer holding it has no entity to
    // name, so the rule fires with no subject rather than with a wrong one.
    const by = world.parent.get(id)?.id ?? null
    effects.push(...fire(world, blueprints, id, 'held', by, clock))
    if (by !== null) onCross?.(id, 'held', by)
  }

  for (const id of before) {
    /**
     * A thing that stopped existing was not put down.
     *
     * The same rule `exit` follows and for the same reason: `despawn` already
     * said so, and firing this as well would run a rule twice on one event.
     */
    if (now.has(id) || !world.alive.has(id)) continue
    // Nobody is holding it any more, so there is no carrier to name - which is
    // the honest answer rather than the id of whoever used to have it.
    effects.push(...fire(world, blueprints, id, 'dropped', null, clock))
    onCross?.(id, 'dropped', null)
  }

  previous.set(HELD_KEY, now)
  return effects
}

/**
 * Entities meeting entities.
 *
 * ---------------------------------------------------------------------------
 * What this costs, because it is the reason it is shaped this way
 * ---------------------------------------------------------------------------
 * Every pair of live entities is the obvious implementation and it is a million
 * tests at `MAX_ENTITIES` - which the manual's §3 would have to grow a paragraph
 * about, and which a level of a thousand crates would pay every frame for a
 * feature it does not use.
 *
 * So only entities that **declare** a `collide` rule are asked, and they are
 * asked against the live set. The cost is *askers × entities*, and an author
 * with two collide rules in a thousand-entity level pays two thousand box
 * tests - the same order as the trigger pass above already pays per player.
 * A level that never uses the event pays one walk of the live set to discover
 * it has no askers.
 *
 * ---------------------------------------------------------------------------
 * Edges, not frames
 * ---------------------------------------------------------------------------
 * The same `previous` map the prober pass uses, keyed by the *collider's* id.
 * Safe to share because `PLAYER_ID` is nine million and entity ids count up from
 * nothing, so the two can never be the same key - and sharing it means one thing
 * to hand back and forth rather than two that can get out of step.
 *
 * There is no `uncollide`. `exit` exists because a pickup has to know you left
 * the pad you were standing on; nothing has asked to know that two things
 * stopped touching, and a verb nobody reads is the one thing this format
 * refuses to grow.
 */
function stepCollisions(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  previous: Overlaps,
  onCross: Crossed | undefined,
  clock: TriggerClock | undefined,
): Effect[] {
  const effects: Effect[] = []

  /**
   * Who is asking, worked out once.
   *
   * Before the pair loop rather than inside it, so a level with no collide rules
   * - which is every level written before this - does one walk of the live set
   * and stops.
   */
  const askers: EntityId[] = []
  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    const blueprint = name ? blueprints[name] : undefined
    if (blueprint?.triggers?.some((trigger) => trigger.on === 'collide')) askers.push(id)
  }
  if (askers.length === 0) return effects

  for (const id of askers) {
    const box = world.box.get(id) ?? triggerBox(world, id)
    if (!box) continue

    const before = previous.get(id) ?? new Set<EntityId>()
    const now = new Set<EntityId>()

    for (const other of world.alive) {
      // Nothing collides with itself, and a thing being carried is not colliding
      // with whoever is carrying it - it is held, which is a different fact and
      // one the carrier already knows.
      if (
        other === id ||
        // A thing being carried is not colliding with whoever is holding it -
        // it is *held*, which is a different fact and one the carrier already
        // knows. `parent` is a link with a socket on it, so it is the `id` on
        // that link that names the carrier.
        world.parent.get(id)?.id === other ||
        world.parent.get(other)?.id === id
      ) {
        continue
      }
      const theirs = world.box.get(other) ?? triggerBox(world, other)
      if (!theirs || !overlapping(box, theirs)) continue
      now.add(other)
    }

    for (const other of now) {
      if (before.has(other)) continue
      effects.push(...fire(world, blueprints, id, 'collide', other, clock))
      onCross?.(id, 'collide', other)
    }

    previous.set(id, now)
  }

  return effects
}

/**
 * Turn a frame's contacts into `hit` rules.
 *
 * Separate from `stepTriggers` rather than folded into it, and the reason is
 * the same one `Crossed` exists for: this pass has no overlap of its own to
 * compute. `stepBodies` already knows exactly what met what - it is the thing
 * that stopped them - so re-deriving it here would be a second answer to a
 * question already answered, and the two would disagree the moment one of them
 * changed.
 *
 * **Only the contacts with the level.** An entity-on-entity contact is
 * `collide`, which `stepCollisions` finds by comparing overlaps against last
 * frame, and firing it from here as well would run every collide rule twice -
 * once for the overlap and once for the bounce that caused it. See `Contact`,
 * where `other: null` is the whole distinction.
 *
 * Deduplicated by entity, because a body wedged into a corner resolves on two
 * axes in one frame and that is one landing, not two.
 */
export function stepHits(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  contacts: readonly { id: EntityId; other: EntityId | null }[],
  onCross?: Crossed,
  clock?: TriggerClock,
): Effect[] {
  const effects: Effect[] = []
  const already = new Set<EntityId>()

  for (const contact of contacts) {
    if (contact.other !== null) continue
    if (already.has(contact.id)) continue
    already.add(contact.id)
    // A body that died to its own landing - a shell that breaks on impact -
    // must not have the next frame's contact fired on it as well.
    if (!world.alive.has(contact.id)) continue
    effects.push(...fire(world, blueprints, contact.id, 'hit', null, clock))
    onCross?.(contact.id, 'hit', null)
  }

  return effects
}

/**
 * A box for something that has no collider.
 *
 * A pickup is `collider: "none"` so it does not stop you, and it still has to
 * notice you. Rather than making the author draw a second, invisible box, this
 * is the model's own footprint - which is where the thing looks like it is, and
 * therefore where walking into it feels like it should count.
 */
function triggerBox(world: EntityWorld, id: EntityId): Box | null {
  const at = world.position.get(id)
  if (!at) return null
  // Half a metre either side: big enough to be walked into at running pace
  // without threading a needle, small enough that two pickups side by side are
  // still two things.
  const reach = 0.5
  return {
    minX: at.x - reach,
    minY: at.y - reach,
    minZ: at.z - reach,
    maxX: at.x + reach,
    maxY: at.y + reach + 1,
    maxZ: at.z + reach,
  }
}
