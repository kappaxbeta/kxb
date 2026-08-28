/**
 * A round a document can describe.
 *
 * The block proposed in docs/xp/xp-flow.md, built spine-first: phases, what
 * entering one does, which of the player's keys are live in it, where it goes
 * next, and when it is won. Per-role overrides went to `rules.perRole` in the
 * end (§3, and the argument for the move is there); `rounds` and §5's `run`
 * scope are still deliberately absent, each being an argument of its own and
 * neither being needed to state a turn.
 *
 * ---------------------------------------------------------------------------
 * Why this is a module and not six fields on `XpRules`
 * ---------------------------------------------------------------------------
 * A match already has phase machines - six of them, one per mode, none of them
 * writable by a document (see xp-flow.md §1). Adding a seventh as loose fields
 * beside `preset` would make that seven. This is the shape they should all
 * eventually be, so it gets a file the way `camera.ts` and `rules.ts` did, and
 * for the same reason: the refusals and the defaults are the interesting part
 * and they belong next to the type they are about.
 *
 * ---------------------------------------------------------------------------
 * Nothing in here is a new vocabulary
 * ---------------------------------------------------------------------------
 * Every field is a shape the format already has, which is the whole argument
 * for the block being small:
 *
 *   `does`   a `Verb[]`, exactly what a trigger's `do` is. A phase being
 *            entered is an event, so it fires what a level already speaks.
 *   `when`   a `Condition`, exactly what a trigger's `when` is.
 *   `on`     an event name, exactly what an `emitted` trigger matches. A rule
 *            that finishes a turn says so, and the flow hears it.
 *   `allow`  names out of `player.keys`, which is the same list the phone
 *            draws buttons from and the headset hands to face buttons.
 *   `wins`   a `Condition` again, on the level's own data - which is why
 *            "first to four" needed no counter of this module's own.
 *
 * The one thing that is genuinely new is that a *document* decides when the
 * level moves between them.
 */

import { persists, type XpData } from './data'
import type { Mode } from './rules'
import type { Condition } from '../rules/triggers'
import type { Verb } from '../rules/verbs'

/**
 * Where a phase goes, and what takes it there.
 *
 * ---------------------------------------------------------------------------
 * Three ways, and they are not equals
 * ---------------------------------------------------------------------------
 * **`on` is the one a turn-based game uses**, and it costs nothing: `emitted`
 * is already a trigger event and `emit` is already a verb, so a rule that
 * finishes a turn says so and this hears it. A round of a board game ends when
 * somebody has moved a piece, not after twelve seconds.
 *
 * **`when` is for a phase that ends because the world reached a state** - a
 * score, a count, a door opened.
 *
 * **`after` is seconds, and it is the only field in the whole block that needs
 * a clock everybody agrees on.** That is worth saying plainly because it is the
 * cost boundary: a document whose transitions are all `when` and `on` is
 * sequenced by writes to its own data, so it needs no shared timer and no
 * arbiter at all when it is played alone. A document that reaches for `after`
 * has bought a distributed clock, and should know it did.
 *
 * At least one is required. A step with none of the three is a step that fires
 * on nothing, which is the same silent-forever failure as a rule matching a tag
 * nothing carries - and the parser refuses it rather than storing it.
 */
export interface FlowStep {
  when?: Condition
  on?: string
  after?: number
  /**
   * The phase to enter, or one of the two words that are not phases.
   *
   * Checked against `phases` by the parser, which is why the exceptions have
   * to be spelled rather than guessed - see `ROUND_AGAIN` and `RUN_OVER`.
   */
  go: string
}

/**
 * Round over: count it, and open the next one at `start` - or end the run when
 * that was the last.
 *
 * A destination rather than a phase, because it is not a state anybody is ever
 * *in*: it is the seam between two rounds, and drawing it as a phase would put
 * a box in every graph that nothing happens in. The `@` is what makes it
 * unmistakable in a document - a phase may not be named with one, so there is
 * no level in which this word means something else.
 */
export const ROUND_AGAIN = '@next-round'

/**
 * The run is over, now.
 *
 * The other thing a document could not say. `wins` ends a run *because
 * something is true*, and plenty of endings are not like that: full time, the
 * last round, a hand nobody can play out of. Those are a place the machine
 * arrives at, and this is how it says so.
 */
export const RUN_OVER = '@end'

/** The destinations that are not phases. */
export const RESERVED_GOES: readonly string[] = [ROUND_AGAIN, RUN_OVER]

export interface FlowPhase {
  /**
   * What happens on entering, in the vocabulary the level already speaks.
   *
   * Once, on the way in - not every frame. A phase is a state, and a `does`
   * that ran continuously would be a trigger with extra steps.
   */
  does?: readonly Verb[]
  /**
   * Which of `player.keys` are live here, by their `does` name.
   *
   * Absent means all of them, which is what every level without a flow has.
   * **Empty means none**, and that is the useful one: it is how a phase says
   * *watch, do not touch* without the document having to invent a rule that
   * refuses every press.
   *
   * Named rather than numbered because `player.keys` is already addressed by
   * name everywhere else - a rule listens for `use`, not for binding two.
   */
  allow?: readonly string[]
  /**
   * What is happening, and what you can do about it, in the author's words.
   *
   * ---------------------------------------------------------------------------
   * The one thing `allow` could never say
   * ---------------------------------------------------------------------------
   * A phase already decides which keys are live, and that is *enforcement* -
   * the button quietly does nothing, which is the whole of what a player is
   * told. Every time this format has been played by somebody who did not write
   * it, the same sentence has come back: **"what do I do now?"** After rolling
   * and putting a piece down there is no button that says the turn ends on a
   * key, and no amount of correct `allow` will ever say it.
   *
   * So the phase carries a line and the HUD draws it. Authored rather than
   * generated from the bindings, because "hold E to carry a piece" is a
   * sentence and `use` is a name - a list of key names is a reference card, and
   * what somebody stuck in a turn needs is an instruction.
   *
   * Optional, and absent draws nothing: a level whose phases are obvious should
   * not be made to write that down, and an empty strip is better than a filled
   * one nobody needed.
   */
  says?: string
  /**
   * Whose phase this is: `'turn'` narrows `allow` to the player the arbiter
   * says is up.
   *
   * ---------------------------------------------------------------------------
   * The one thing the board game could not say
   * ---------------------------------------------------------------------------
   * A turn-based level already *has* turns - `pass` rotates the seat and the
   * arbiter refuses a roll asked out of turn - but the refusal is silent and
   * the buttons are not: in the roll phase, four players see a live die and
   * one of them is right. "Whose go it is" was enforced and never *shown*,
   * which is the exact `allow` failure §2 documents - a button that quietly
   * does nothing.
   *
   * ---------------------------------------------------------------------------
   * Presentation and local enforcement, never authority
   * ---------------------------------------------------------------------------
   * The client filters its own presses and draws its own buttons by this; the
   * arbiter goes on refusing out-of-turn effects exactly as before, because a
   * client deciding it is its own go is the thing turns exist to prevent.
   * Which is also why the gate opens when *nobody* holds the turn: turns
   * start on the first `turn_start`, and a table where nothing has started -
   * or a level played alone, with no arbiter at all - must not be a table
   * where every key is dead.
   */
  who?: 'turn'
  /** Where it can go from here, in order. The first step that holds wins. */
  next?: readonly FlowStep[]
}

export interface XpFlow {
  /** The phase a run opens in. Checked against `phases` by the parser. */
  start: string
  /**
   * Which place this round is played in, by the name in the `scenes` table.
   *
   * ---------------------------------------------------------------------------
   * The run names the scene, not the other way round
   * ---------------------------------------------------------------------------
   * A level with a foyer and an arena in it wants its battle to happen in the
   * arena and its lobby round to happen in the foyer. Both are rounds of the
   * same document, so the *round* is the thing that knows where it belongs -
   * which is also the direction xp-flow.md §5 argues for: one arena hosting
   * three different rulesets is the normal case, and a scene carrying its own
   * ruleset would make it the exception.
   *
   * **Absent means wherever you already are**, which is every flow written
   * before this and every level with one place in it. A round that names no
   * scene does not move anybody.
   *
   * Checked against `scenes` by the parser, because a round that jumps to a
   * room the document does not have is a level that starts and then goes
   * nowhere, with nothing on any console to say why.
   */
  scene?: string
  phases: Readonly<Record<string, FlowPhase>>
  /**
   * How many times the round is played before the run is over.
   *
   * ---------------------------------------------------------------------------
   * Best of three, said once instead of built out of four parts
   * ---------------------------------------------------------------------------
   * This was already expressible and that is exactly the argument for the
   * field: the shipped *Best of three* starter says it with a declared
   * counter, an `addProp` in a phase nobody plays, a `when` comparing that
   * counter, and a `wins` comparing it again - four places that all have to
   * agree about the number three, in a document whose author only ever
   * thought of one. Change it to five and you edit three of them, and the
   * fourth is a level that ends a round early for ever.
   *
   * So the machine counts. Absent is one round, which is every flow written
   * before this and is the honest default: a run that goes round is a thing a
   * document opts into.
   *
   * ---------------------------------------------------------------------------
   * It needs `@next-round` to mean anything, and the parser insists
   * ---------------------------------------------------------------------------
   * A number here does not by itself make anything repeat - what repeats is a
   * step that says so. A flow declaring three rounds with no step reaching
   * `ROUND_AGAIN` is a best-of-three that plays once, silently, which is the
   * failure this file refuses everywhere else. `flowProblems` refuses it too.
   */
  rounds?: number
  /**
   * When this run is won, and therefore over.
   *
   * ---------------------------------------------------------------------------
   * The field that makes a flow a game rather than a loop
   * ---------------------------------------------------------------------------
   * Without it a flow is a state machine that runs forever: the board game's
   * turn passes round the table and nothing anywhere can say somebody got four
   * pieces home. The six hard-coded machines each know how their own mode ends -
   * a score limit, a clock, a finish line - and a document describing its own
   * phases had no way to say it at all.
   *
   * A `Condition`, and deliberately not a new expression language: `addProp
   * target: 'world'` already writes the level's own data and `of: 'world'`
   * already reads it, so *first to four* is a comparison against a number the
   * document is already keeping.
   *
   *     "wins": { "of": "world", "prop": "mine-home", "is": ">=", "value": 4 }
   *
   * ---------------------------------------------------------------------------
   * It says *that* it is won, not *who* won
   * ---------------------------------------------------------------------------
   * Worth being plain about, because the field is called `wins`. The condition
   * is about the level's state, and a level's state does not carry a name - so
   * this ends the run, and the scoreboard, which has been the arbiter's answer
   * to "who is ahead" all along, says who. Inventing a winner from a condition
   * that mentions nobody would be a result the document did not state.
   *
   * ---------------------------------------------------------------------------
   * Checked on the same frame the phases are, and once
   * ---------------------------------------------------------------------------
   * After the phase step rather than before it, so a phase whose `does` scores
   * the winning point ends the run on the frame it happened. And a run that has
   * been won is over: the flow stops stepping, because a machine that kept
   * moving after its own ending would be drawing phases nobody is playing.
   *
   * Absent is every flow written before this, and is a run with no ending of its
   * own - which is right for a turn that is meant to go round forever, and is
   * still endable by whatever `rules` preset the level also declares.
   */
  wins?: Condition
}

/**
 * How many phases one document may describe.
 *
 * Generous against anything anybody has drawn - a turn is three - and finite
 * because this ends up in a graph the editor has to lay out, and a state
 * machine nobody can read on a screen is one nobody can debug either.
 */
export const MAX_PHASES = 32

/**
 * How long a phase's line may be.
 *
 * A sentence, not a manual. It is drawn over a running game in a strip beside
 * the readouts, so the limit is what fits there and stays readable - anything
 * longer belongs in the level's own description, which is a page somebody reads
 * before they start rather than a line they read while playing.
 */
export const MAX_SAYS = 120

/** How many ways out one phase may have. */
export const MAX_STEPS = 8

/**
 * How many times a run may go round.
 *
 * Best of ninety-nine is not a game anybody is playing, and the cap is here
 * for the same reason `MAX_PHASES` is: a number out of a text field ends up
 * driving a loop, and the honest place to say what is absurd is next to the
 * type.
 */
export const MAX_ROUNDS = 99

/**
 * Why this flow does not hold, or an empty list if it does.
 *
 * Every reason rather than the first, like `cameraProblems` and
 * `rulesProblems`: an author whose `start` names a phase that is not there, and
 * who also has a step pointing at one, should be told about both.
 *
 * ---------------------------------------------------------------------------
 * The two refusals that are the point of the whole check
 * ---------------------------------------------------------------------------
 * **A destination that does not exist**, which is the mistake that would
 * otherwise be invisible: the run reaches that step, goes nowhere, and the level
 * appears to freeze with nothing in any log to say why.
 *
 * **A phase nothing can reach.** Not an error in any language, and always a
 * mistake here - it is a state somebody drew, wired to nothing, and will spend
 * an afternoon wondering why they never see. The editor is meant to draw this
 * as unreachable; the parser saying so first means it is caught in a document
 * that never went through the editor at all.
 */
export function flowProblems(flow: XpFlow): string[] {
  const problems: string[] = []
  const names = Object.keys(flow.phases)

  if (names.length === 0) return ['a flow with no phases is not a flow']
  if (names.length > MAX_PHASES) {
    problems.push(`too many phases: ${names.length}, and the limit is ${MAX_PHASES}`)
  }
  if (!Object.hasOwn(flow.phases, flow.start)) {
    problems.push(`"start" names "${flow.start}", which is not one of the phases`)
  }
  /**
   * The `@` is reserved, and a phase that took it would make a destination
   * ambiguous - two readings of one word, decided by whichever check ran
   * first. Refused here rather than resolved by precedence.
   */
  for (const name of names) {
    if (name.startsWith('@')) {
      problems.push(`"${name}" starts with "@", which only ${RESERVED_GOES.join(' and ')} may`)
    }
  }

  if (flow.rounds !== undefined) {
    if (!Number.isInteger(flow.rounds) || flow.rounds < 2) {
      problems.push(`"rounds" is ${flow.rounds}, and a run goes round two or more times or not at all`)
    } else if (flow.rounds > MAX_ROUNDS) {
      problems.push(`too many rounds: ${flow.rounds}, and the limit is ${MAX_ROUNDS}`)
    }
  }

  /** Everything a step points at, so reachability is one walk rather than two. */
  const reached = new Set<string>([flow.start])
  /** Whether anything can actually reach the next round. See `XpFlow.rounds`. */
  let goesRound = false

  for (const [name, phase] of Object.entries(flow.phases)) {
    const steps = phase.next ?? []
    if (steps.length > MAX_STEPS) {
      problems.push(`"${name}" has ${steps.length} ways out, and the limit is ${MAX_STEPS}`)
    }
    steps.forEach((step, at) => {
      const reserved = RESERVED_GOES.includes(step.go)
      if (!reserved && !Object.hasOwn(flow.phases, step.go)) {
        problems.push(`"${name}" step ${at} goes to "${step.go}", which is not one of the phases`)
      }
      if (step.go === ROUND_AGAIN) {
        goesRound = true
        if (flow.rounds === undefined) {
          problems.push(
            `"${name}" step ${at} goes to "${ROUND_AGAIN}", and this flow declares no "rounds" to go round`,
          )
        }
        // The next round opens where the first one did, so `start` is reached
        // by this as surely as by an arrow drawn at it.
        reached.add(flow.start)
      }
      // `@end` reaches nothing: it is where a run stops, not somewhere it goes.
      if (!reserved) reached.add(step.go)
      if (step.when === undefined && step.on === undefined && step.after === undefined) {
        problems.push(
          `"${name}" step ${at} has no "when", "on" or "after", so nothing can ever take it`,
        )
      }
      if (step.after !== undefined && step.after <= 0) {
        problems.push(`"${name}" step ${at} waits ${step.after} seconds, which is not a wait`)
      }
    })
  }

  for (const name of names) {
    if (!reached.has(name)) {
      problems.push(`nothing reaches "${name}", so a run can never be in it`)
    }
  }

  /**
   * A number of rounds nothing can ever count.
   *
   * The other half of the pair the field needs to be true: `rounds: 3` with no
   * step reaching the seam is a best-of-three that plays exactly once and says
   * nothing about it. Same class as the phase nothing reaches, and caught the
   * same way - by walking what is written rather than by trusting the number.
   */
  if (flow.rounds !== undefined && !goesRound) {
    problems.push(
      `"rounds" is ${flow.rounds}, and no step goes to "${ROUND_AGAIN}" - so the round would be played once`,
    )
  }

  return problems
}


/**
 * Which keys are live in a phase, given what the document binds.
 *
 * The whole of `allow` at the point of use, and it *intersects* rather than
 * replaces: a phase may only ever narrow what `player.keys` already declared.
 * A phase that could add a binding would be a second place bindings come from,
 * and the button a phone draws would stop matching the rule that fires.
 */
/**
 * Whole seconds until the soonest clock takes this phase somewhere else.
 *
 * Null when nothing here leaves on a timer, which is most phases - `on` and
 * `when` have no countdown to show because there is no answer to *how long*.
 *
 * **The shortest `after` wins**, because the first step that holds is the one
 * taken: a phase with two clocks leaves on the earlier of them, so the earlier
 * is the one worth counting down. Rounded *up*, so a HUD reads 3, 2, 1 and
 * changes on the second rather than 2, 1, 0 with the last second invisible.
 */
export function phaseCountdown(phase: FlowPhase | undefined, age: number): number | null {
  let soonest = Infinity
  for (const step of phase?.next ?? []) {
    if (step.after !== undefined && step.after < soonest) soonest = step.after
  }
  return soonest === Infinity ? null : Math.max(0, Math.ceil(soonest - age))
}

/**
 * Which step leaves this phase now, or null to stay where it is.
 *
 * **The first one that holds, in the order the document wrote them.** That is
 * the author's tie-break and the reason it is a list rather than a set: two
 * steps whose conditions are both true this frame is not an error, it is a
 * priority, and the one written first is the one meant.
 *
 * The three ways are checked cheapest-first - `on` is a lookup in a small
 * array, `after` is a comparison, `when` walks a condition against the world -
 * and `||` short-circuits, so a step that leaves on an event never evaluates
 * its own `when`.
 *
 * `holds` is passed in rather than imported. It needs the live entity world and
 * the level's data, neither of which belongs in a module about the shape of a
 * document, and injecting it is what lets this be called from a test with no
 * world at all.
 */
export function stepFrom(
  phase: FlowPhase | undefined,
  {
    age,
    said,
    holds,
  }: {
    /** How long this phase has been running, in seconds. */
    age: number
    /** Event names heard this frame, which is what `on` matches against. */
    said: readonly string[]
    /** Whether a condition holds against the world as the rules just left it. */
    holds: (condition: Condition) => boolean
  },
): FlowStep | null {
  for (const step of phase?.next ?? []) {
    const taken =
      (step.on !== undefined && said.includes(step.on)) ||
      (step.after !== undefined && age >= step.after) ||
      (step.when !== undefined && holds(step.when))
    if (taken) return step
  }
  return null
}

export function allowedIn(phase: FlowPhase | undefined, bound: readonly string[]): string[] {
  if (!phase?.allow) return [...bound]
  const allow = new Set(phase.allow)
  return bound.filter((does) => allow.has(does))
}

/**
 * The same question with the answer a *role* narrows, which is §3 of the file
 * this module was built from.
 *
 * ---------------------------------------------------------------------------
 * The order is the rule, and it is written as one
 * ---------------------------------------------------------------------------
 * The phase narrows first and the role narrows what is left, so a role can only
 * ever take keys away. That is not an implementation detail to be preserved by
 * care - it is the whole readability of `allow`, and the reason it is expressed
 * as a filter of a filter rather than as two sets unioned and compared: there is
 * no arrangement of the two lists that makes this hand a key back.
 *
 * A phase saying `"allow": []` - *watch, do not touch* - therefore stays true
 * for everybody at the table, whatever they were dealt. The alternative was
 * considered and is worse in exactly the way a document is: you would have to
 * hold two tables in your head to answer "does this button do anything", and one
 * of them is secret, so nobody watching could answer it at all.
 *
 * `role` is the dealt value's `allow`, or undefined for the player who was dealt
 * nothing - which is everybody, in every level with no deck, and everybody for
 * the first couple of seconds of a level with one.
 */
export function allowedFor(
  phase: FlowPhase | undefined,
  role: readonly string[] | undefined,
  bound: readonly string[],
  /**
   * Whether the arbiter says it is this player's go - `null` when nobody
   * holds the turn, which opens the gate (see `FlowPhase.who`). Optional so
   * every level without a `who` phase never has to answer the question.
   */
  onTurn?: boolean | null,
): string[] {
  if (phase?.who === 'turn' && onTurn === false) return []
  const here = allowedIn(phase, bound)
  if (!role) return here
  const allow = new Set(role)
  return here.filter((does) => allow.has(does))
}

/**
 * Why this run's ending cannot work, given what the level keeps.
 *
 * ---------------------------------------------------------------------------
 * A `wins` on a number that survives the game is a level won forever
 * ---------------------------------------------------------------------------
 * The trap `wins` opens, and it opens quietly. `{ of: 'world', prop:
 * 'blue-home', is: '>=', value: 4 }` is the obvious way to write *first player
 * home wins*, and it is correct exactly once: `blue-home` is `space`-scoped, so
 * the four is still in the row tomorrow, and every game after the first is over
 * on its opening frame - `finished` fires, the flow stops stepping, and the
 * board nobody has touched says the run is won.
 *
 * That is the same failure `persists` was written about, arriving through the
 * one door that turns it from a stale number into an unplayable level. It is
 * worth a refusal rather than a stale counter because the two cost differently:
 * a wrong number is something a player can see and an author can chase, and a
 * level that ends before anybody moves looks like the engine is broken.
 *
 * ---------------------------------------------------------------------------
 * Only `wins`, and deliberately not a step's `when`
 * ---------------------------------------------------------------------------
 * The asymmetry is the interesting part. A *transition* reading a saved number
 * is a good thing to be able to write - "if you have ten coins, go to the shop
 * phase" is a persistent unlock deciding which way a round goes, and refusing it
 * would take away most of what `when` is for. An *ending* is different in kind:
 * it is asked on every frame from the first and answered once, so a number that
 * arrives already true answers it before the run exists.
 *
 * The right-hand side is not checked either. `value: '@world.needed'` naming a
 * saved field is a target rather than a tally - *first to whatever this space
 * decided* - and there is nothing wrong with that at all.
 *
 * A field the level never declared is `undeclared`'s to report, not this one's:
 * two messages about one typo is worse than one.
 */
export function winsProblems(flow: XpFlow, data: XpData): string[] {
  const wins = flow.wins
  if (!wins || wins.of !== 'world') return []

  const field = data[wins.prop]
  if (!field || !persists(field)) return []

  return [
    `"wins" counts "${wins.prop}", which is kept ${field.scope === 'player' ? 'per player' : 'in the space'} and outlives the run — ` +
      `so the second game would be won before anybody moved. Declare it with scope "run".`,
  ]
}

/**
 * Which of a document's flows a given mode plays.
 *
 * A **projection**, not a branch, and that is the whole of why it exists. A
 * document can carry a round per mode - the one the level runs in a room, the
 * one it runs as a battle - and if that were a fork the runtime made, every
 * reader downstream would have to make it too: the phase stepper, the HUD, the
 * win check, the editor. There are around thirty of them and they would drift.
 *
 * So one function answers it once and everything else goes on reading a single
 * flow, exactly as `standingIn` lets the world, the spawn and the marks stay
 * singular in a document with several scenes.
 *
 * **`flow` is what a mode with no round of its own plays.** Not nothing: a
 * level with one round that happens to be scheduled as a match is the ordinary
 * case, and making it write the same phases under every mode would be a format
 * that punishes the common document for the sake of the rare one.
 *
 * Which also means the fallback only goes one way. A round written under
 * `flows.battle` never runs in a room - a foyer that suddenly has a whistle in
 * it is the quiet kind of wrong - and a level with neither has no round at all,
 * which has to stay possible: `steal-a-plant` is a place, not a run.
 */
export function flowFor(
  document: { flow?: XpFlow; flows?: Readonly<Partial<Record<Mode, XpFlow>>> },
  mode: Mode,
): XpFlow | undefined {
  return document.flows?.[mode] ?? document.flow
}
