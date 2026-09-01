/**
 * What a thing *is* right now, and what makes it something else.
 *
 * ---------------------------------------------------------------------------
 * Why a room needs this and a timeline was not it
 * ---------------------------------------------------------------------------
 * A blueprint could already say two things about time. `ThingAction` says "while
 * somebody is near, spin" - a standing rule, true whenever its condition is. A
 * `Timeline` says "open, wait, shut" - a performance, the same every run, over
 * in a minute. Between them they cover every thing in the shelf that is still
 * the same thing a moment later.
 *
 * What neither can say is that the thing *became something else*. A burger goes
 * on the pan raw and comes off cooked, and cooked is not a pose the raw burger
 * is holding - it is a different model, it lasts, and nothing about the room
 * puts it back. A crate that has been broken open stays broken. A target that
 * has been shot is gone for eight seconds and then is a whole target again.
 *
 * A timeline cannot hold any of those because a timeline has no memory: it is a
 * function of the clock, it starts again at zero, and asking it "has this been
 * shot?" is asking a sine wave what day it is. So this is the third and last
 * thing a blueprint says about time, and it is the one with memory.
 *
 * ---------------------------------------------------------------------------
 * A named state, not a number
 * ---------------------------------------------------------------------------
 * `raw`, `cooking`, `cooked`, `burnt`. Words, because every surface that has to
 * talk about one is written by a person: a change points at the state it goes
 * to, a signal is fired on the way into one, and the composer draws them as a
 * list somebody reads. An index would be a reference that silently means
 * something else the moment a state is deleted from the middle of the list -
 * the same argument `Socket` makes at length about names, and it lost the same
 * fight once already in `Cue.part`.
 *
 * ---------------------------------------------------------------------------
 * A state overrides the blueprint, it does not replace it
 * ---------------------------------------------------------------------------
 * Every field on a state is optional and absent means "whatever the blueprint
 * says". A thing with four states is not four blueprints: it is one bench, one
 * scale, one body, one set of seats, and four answers to "which model, which
 * clip, is it there". That is what makes the machine cheap to add to a thing
 * that already exists - you do not re-author the thing to give it a second look.
 *
 * The alternative, a state carrying a whole `BlueprintSpec`, was rejected on
 * the obvious ground: the four copies would drift, and three of the four would
 * be wrong the first time somebody changed the scale.
 */

import { knownModel } from '@/domain/thingiverse/models'

/**
 * How many states one thing may be in, and how long a name is.
 *
 * Eight, because the machine is drawn as a list of cards in a rail panel and a
 * ninth is a scroll. It is also, empirically, more than anything in this
 * catalogue wants: a cooker is three, a breakable is two, a traffic light is
 * three, and the one thing anybody has asked for with more than five was a
 * script wearing a state machine's clothes - and a script is an XP.
 */
export const MAX_STATES = 8
export const MAX_STATE_NAME = 24

/** How many ways out of one state there may be. */
export const MAX_CHANGES_PER_STATE = 4

/**
 * How long a signal's name may be.
 *
 * A word, not a sentence: signals are typed twice - once where they are sent
 * and once where they are heard - and anything long enough to be worth
 * abbreviating is long enough to be mistyped on the second go.
 */
export const MAX_SIGNAL_NAME = 24

/**
 * The longest a timed change may wait, in seconds.
 *
 * Five minutes. Long enough for anything a room does that somebody is still
 * watching - a respawn, a bake, a door that shuts itself - and short enough
 * that a mistyped number is a bug you find rather than a thing that appears to
 * have stopped working forever.
 */
export const MAX_CHANGE_SECONDS = 300
export const MIN_CHANGE_SECONDS = 0.1

/**
 * What can move a thing out of a state.
 *
 * Six, and the shortness is the same discipline `THING_WHENS` keeps: every one
 * has to be answerable by looking at the thing, or by a word somebody typed
 * into the other end of the machine.
 *
 *   `after`   - it has been in this state for so many seconds. The clock.
 *   `signal`  - a word arrived. See `ThingState.emit`.
 *   `use`     - somebody pressed E on it.
 *   `touch`   - somebody walked into it.
 *   `broken`  - its health reached zero. See `./fight`.
 *   `filled`  - a slot on it got the item it was waiting for. See `SocketSlot`.
 *   `emptied` - somebody took the item out of a slot.
 *
 * `near` is missing and its absence is deliberate: a state is a thing that
 * *lasts*, and a state you leave by walking up to and re-enter by walking away
 * is a thing that flickers at the edge of a ring. That effect is what
 * `ThingAction` is for, it has the hysteresis for it (see `firing`), and it
 * does not have to be remembered afterwards.
 */
export const CHANGE_WHENS = ['after', 'signal', 'use', 'touch', 'broken', 'filled', 'emptied'] as const
export type ChangeWhen = (typeof CHANGE_WHENS)[number]

/**
 * One way out of a state.
 *
 * ---------------------------------------------------------------------------
 * Why `once` is a field and not a state you cannot come back to
 * ---------------------------------------------------------------------------
 * "This may happen only ever once" is a real thing to want - the chest with the
 * key in it, the machine with one free go - and the shape that expresses it
 * without a flag is a state with no way back into it. That works and is what
 * somebody should usually author. It stops working for the case that wants it
 * most: a change out of a state you *do* come back to, which is every respawn.
 * A target you can shoot forever but which only ever drops its prize the first
 * time needs the memory to live on the change rather than on the graph.
 *
 * The memory is per *thing*, not per blueprint, and it is not written down
 * anywhere: it lasts as long as the thing is standing in a room somebody has
 * loaded. That is the honest promise - a room is not a save file, nothing else
 * in the thingiverse survives a reload (`vanish` says so in as many words), and
 * a chest that remembered across sessions would be the first thing here to need
 * a row per player per object.
 */
export interface Change {
  when: ChangeWhen
  /** The state it goes to. A name in this machine; see `statesProblems`. */
  to: string
  /** Which word, for `signal`. Which socket, for `filled` and `emptied`. */
  value?: string
  /** How long, for `after`. Seconds. */
  seconds?: number
  /**
   * Whether the wait is drawn as a bar filling over the thing.
   *
   * Only means anything for `after`, and it is the difference between a burger
   * that is cooking and a burger that is inexplicably still raw. A timed change
   * with nothing drawn is a thing that appears to have ignored you for eight
   * seconds and then worked - which is the shape of every "is this broken?"
   * report a room has ever produced.
   *
   * Not on by default, because the other big user of the clock is a respawn,
   * and a bar counting down over a hole where a crate used to be is a HUD
   * element about nothing.
   */
  fill?: boolean
  /** Whether it may fire only once in this thing's life. See the note above. */
  once?: boolean
}

/**
 * One condition a thing can be in.
 *
 * Every field but the name is an override of the blueprint underneath, and
 * absent is "unchanged" - see the note at the top of the file about why a state
 * is not a whole spec.
 */
export interface ThingState {
  /** Unique within the machine. Lower case, trimmed. */
  name: string
  /** What it looks like here. Absent draws the blueprint's own model. */
  model?: string
  /**
   * What it plays here. Absent plays the blueprint's own clip.
   *
   * Null is not absent: null is "play nothing", which is how a broken thing
   * stops the idle animation the whole thing was playing. Two spellings with
   * two meanings, exactly as `BlueprintSpec.body` has.
   */
  clip?: string | null
  /**
   * Whether the thing is simply not there.
   *
   * The disappearing half of "it disappears and comes back". Hidden is not
   * removed: the thing is still standing where it was, still counted against
   * the world's cap, still in everybody's scene graph, and still running its
   * clock - which is exactly what a respawn needs and what `vanish` (the deed)
   * cannot give, because that one takes the thing away until the room is next
   * loaded and has nothing left to count down.
   *
   * A hidden thing is not solid either, whatever `blocking` says. A crate you
   * cannot see but still walk into is the worst object a room can contain.
   */
  hidden?: boolean
  /** Whether you can walk through it here. Absent uses the blueprint's. */
  blocking?: boolean
  /**
   * A word shouted at the room on the way *in* to this state.
   *
   * The sending half of "it can send events". One word, on entry rather than
   * on exit, because entry is the moment somebody can see: the burger becomes
   * cooked and the bell rings. Exit would ring the bell for a state nobody is
   * looking at any more.
   *
   * Who hears it is not this file's business - see `heard` for the rule, which
   * is deliberately "everything standing in this world, including itself".
   */
  emit?: string
  /**
   * Whether arriving here fills the health bar up again.
   *
   * The other half of "it comes back with full health". Separate from `hidden`
   * rather than implied by leaving it, because the two are independent and the
   * interesting object uses only one of them: a training dummy heals in place
   * and never disappears, and a door that has been forced open stays open at
   * zero health forever. See `./fight`.
   */
  restore?: boolean
  /** The ways out. See `Change`. */
  changes: readonly Change[]
}

/**
 * A thing's machine: where it starts, and what it can be.
 *
 * `start` is a name rather than "the first entry", which is one more reference
 * somebody has to keep true and is worth it: the composer lets a list be
 * reordered, and a machine whose starting state is whichever card happens to be
 * at the top is a thing that changes behaviour when you tidy it.
 */
export interface States {
  /** The state a freshly summoned thing is in. A name in `states`. */
  start: string
  states: readonly ThingState[]
}

/** A machine with one state in it: the thing, as it already was. */
export function freshStates(): States {
  return { start: 'whole', states: [{ name: 'whole', changes: [] }] }
}

/**
 * A two-state machine for the thing everybody asks for first.
 *
 * Shot, gone, back again. Written here rather than left to the composer because
 * it is four fields somebody would otherwise get subtly wrong in a way that
 * looks like nothing happening - a `broken` change with no way out is a thing
 * that vanishes permanently the first time it is hit.
 *
 * `restore` is on `whole` and not on `gone`, and the difference is not taste.
 * Both refill the bar and only one of them refills it at a moment that makes
 * sense: healing on the way *out* of the world means the thing spends its eight
 * seconds of being broken at full health, so anything asking "is this broken?"
 * gets the wrong answer for the whole time it matters - and a bar that flicked
 * back to full in the instant before the thing disappeared is the frame
 * somebody screenshots. Healing on the way *back in* is what "comes back with
 * full health" says on the tin.
 */
export function freshRespawn(seconds = 8): States {
  return {
    start: 'whole',
    states: [
      { name: 'whole', restore: true, changes: [{ when: 'broken', to: 'gone' }] },
      { name: 'gone', hidden: true, changes: [{ when: 'after', to: 'whole', seconds }] },
    ],
  }
}

/** The state by that name, or undefined. */
export function stateNamed(machine: States, name: string): ThingState | undefined {
  return machine.states.find((state) => state.name === name)
}

/**
 * Where a thing starts, allowing for a machine that points at nothing.
 *
 * Falls back to the first state rather than to nothing, for the reason `seatAt`
 * gives about a missing socket: the failure of a mistyped start should be a
 * thing standing there in the wrong pose, which anybody can see and fix, not a
 * thing that refuses to be drawn.
 */
export function startOf(machine: States): string {
  return stateNamed(machine, machine.start)?.name ?? machine.states[0]?.name ?? ''
}

/**
 * What the thing looks like in a state, given what the blueprint says.
 *
 * Here rather than in the renderer because four surfaces need the same answer
 * and only one of them is the lounge: the composer's stage previews a state,
 * the thumbnail draws the starting one, and the shelf's tile has to pick one
 * too. A resolution done four times is a resolution done two ways eventually.
 */
export function lookOf(
  base: { model: string; clip: string | null; blocking: boolean },
  state: ThingState | undefined,
): { model: string; clip: string | null; blocking: boolean; hidden: boolean } {
  return {
    model: state?.model ?? base.model,
    // `undefined` is "the blueprint's", `null` is "none" - see `ThingState.clip`.
    clip: state === undefined || state.clip === undefined ? base.clip : state.clip,
    // A hidden thing is never solid, whatever it says. See `ThingState.hidden`.
    blocking: state?.hidden ? false : (state?.blocking ?? base.blocking),
    hidden: state?.hidden ?? false,
  }
}

/**
 * What just happened to a thing, as the runtime saw it.
 *
 * A bag of facts for one frame rather than an event queue, because that is what
 * the caller actually has: the lounge knows, this frame, whether somebody is
 * touching this thing, whether they pressed E, what its health is and which
 * words were shouted since the last frame. Turning those into a queue first and
 * then draining it here would be two representations of one frame.
 */
export interface Happened {
  /** Seconds since the last call. */
  dt: number
  /** Signals shouted in this world since the last call. */
  signals?: readonly string[]
  /** Somebody pressed E on it this frame. */
  used?: boolean
  /** Somebody is inside the touch ring this frame. */
  touched?: boolean
  /** Its health reached zero this frame. See `./fight`. */
  broken?: boolean
  /** Sockets that got an item this frame, by socket name. */
  filled?: readonly string[]
  /** Sockets that lost an item this frame, by socket name. */
  emptied?: readonly string[]
}

/**
 * Where a thing is in its machine, between frames.
 *
 * Deliberately plain data and deliberately not a class: the lounge keeps one of
 * these per thing in a ref, the tests build them by hand, and the whole point of
 * this file is that the interesting half of a state machine can be checked
 * without a canvas.
 */
export interface Standing {
  /** Which state it is in. */
  state: string
  /** How long it has been in it, in seconds. */
  since: number
  /**
   * Which `once` changes have already fired, as `stateName/index`.
   *
   * Keyed by where the change *is* rather than by what it does, because two
   * states may perfectly well both open onto `gone` and only one of them be the
   * one that may happen once. Not persisted - see `Change.once`.
   */
  spent?: readonly string[]
}

/** A thing, as it starts: in the machine's first state, having done nothing. */
export function standing(machine: States): Standing {
  return { state: startOf(machine), since: 0 }
}

/**
 * Whether a thing standing in this world hears a signal.
 *
 * Everything does, including the thing that sent it. That is the whole rule,
 * and it is chosen over the two obvious narrower ones on the same ground the
 * rest of this file picks names over indices: a room has no way to *address*
 * one thing. There is no entity list, nothing has an id somebody types, and the
 * composer has no picker that could offer one. Broadcasting to the world means
 * the pan can tell the burger it is hot without either of them knowing the
 * other exists, which is the only version of this a room can honestly author.
 *
 * The cost is that two independent cookers in one room cook each other's food.
 * That is real, it is the price of having no addresses, and the way out is the
 * one this codebase already recommends for anything that needs to name its
 * neighbours: that is a level, and a level is an XP.
 *
 * Hearing itself is what makes a chain work: a state emits `cooked`, and a
 * *different* state of the same thing is listening for it. Suppressing self
 * would break that for no benefit, since a state cannot be entered twice by one
 * signal anyway - the machine has already moved on by the time it is heard.
 */
export function heard(signals: readonly string[] | undefined, word: string): boolean {
  return (signals ?? []).includes(word)
}

/** What a step did: where the thing is now, and what it shouted on the way. */
export interface Stepped {
  standing: Standing
  /** Signals to shout at the world. Empty almost always. */
  emit: readonly string[]
  /** Whether health should go back to full. See `ThingState.restore`. */
  restore: boolean
}

/**
 * How many changes one step may follow before it gives up.
 *
 * Because a machine may perfectly well pass straight through a state - `gone`
 * for zero seconds into `whole` is a legal thing to author by accident - and
 * two states that each `after: 0` into the other is an infinite loop inside one
 * frame. Four is deeper than any legitimate chain and cheap to bound.
 *
 * Rather than refusing to author it: the validator cannot see the loop (each
 * state is individually fine), and a thing that settles somewhere after four
 * hops is a visible bug rather than a hung tab.
 */
const MAX_HOPS = 4

/**
 * Advance a thing by one frame.
 *
 * Pure, which is the point: every way this can be subtly wrong - a timed change
 * that fires a frame early, a `once` that fires twice, a signal heard in the
 * state that sent it - is invisible in a screenshot and one line in a test.
 *
 * The order inside a step is: the clock moves, then the changes are considered
 * in the order they were authored, and the first one that matches wins. First
 * rather than most-specific, because "most specific" is a ranking somebody has
 * to learn, and the list in the composer is already in an order they chose.
 */
export function step(machine: States, was: Standing, what: Happened): Stepped {
  const emit: string[] = []
  const spent = new Set(was.spent ?? [])
  let state = was.state
  let since = was.since + Math.max(0, what.dt)
  let restore = false

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const here = stateNamed(machine, state)
    if (!here) break

    let took: { change: Change; index: number } | undefined
    for (const [index, change] of here.changes.entries()) {
      if (change.once && spent.has(`${state}/${index}`)) continue
      if (!matches(change, since, what)) continue
      took = { change, index }
      break
    }
    if (!took) break

    if (took.change.once) spent.add(`${state}/${took.index}`)

    const next = stateNamed(machine, took.change.to)
    // A change pointing at a state nobody wrote leaves the thing where it is,
    // for the reason `seatAt` gives: a visible nothing beats an invisible
    // failure, and the thing carrying on being what it was is legible.
    if (!next) break

    state = next.name
    // The clock restarts on the way in, and this is what makes `after` mean
    // "for this long in *this* state" rather than "this long since it was
    // summoned". Carrying the remainder over was considered and rejected: a
    // burger that spends 0.3s of its cooking time in `raw` because that is
    // where the frame boundary fell is a burger that cooks at a different speed
    // depending on the frame rate.
    since = 0
    if (next.emit) emit.push(next.emit)
    if (next.restore) restore = true

    // Only the clock and the machine survive a hop. A `use` that moved the
    // thing out of one state must not also move it out of the next one in the
    // same frame - one press, one change - and the same is true of a touch, a
    // break and a filled slot. Signals are the exception and are handled by the
    // loop simply continuing to see them: a chain of states listening for the
    // same word is a thing somebody meant, and each hop's `after: 0` still runs.
    what = { dt: 0, signals: what.signals }
  }

  return {
    standing: { state, since, ...(spent.size > 0 ? { spent: [...spent] } : {}) },
    emit,
    restore,
  }
}

/** Whether one change is satisfied by this frame. */
function matches(change: Change, since: number, what: Happened): boolean {
  switch (change.when) {
    case 'after':
      return since >= (change.seconds ?? 0)
    case 'signal':
      return change.value !== undefined && heard(what.signals, change.value)
    case 'use':
      return what.used === true
    case 'touch':
      return what.touched === true
    case 'broken':
      return what.broken === true
    case 'filled':
      return inSlot(what.filled, change.value)
    case 'emptied':
      return inSlot(what.emptied, change.value)
  }
}

/**
 * Whether a slot event matches, where naming no slot means any of them.
 *
 * Any rather than none, because the overwhelmingly common thing has exactly one
 * slot - a pan, a pedestal, a plate - and making that author type its name
 * again on the change is ceremony that buys nothing.
 */
function inSlot(slots: readonly string[] | undefined, name: string | undefined): boolean {
  if (!slots || slots.length === 0) return false
  if (name === undefined || name.trim() === '') return true
  return slots.includes(name)
}

/**
 * How far a timed change has got, 0 to 1, or null if nothing is being waited on.
 *
 * The bar over the burger. Here rather than in the renderer because "which
 * change is the thing waiting on" is the same first-match rule `step` uses, and
 * a bar that filled for a change the machine was not actually going to take is
 * a lie that is very hard to see.
 */
export function filling(machine: States, now: Standing): number | null {
  const here = stateNamed(machine, now.state)
  if (!here) return null

  const spent = new Set(now.spent ?? [])
  for (const [index, change] of here.changes.entries()) {
    if (change.when !== 'after' || !change.fill) continue
    if (change.once && spent.has(`${now.state}/${index}`)) continue
    const seconds = change.seconds ?? 0
    if (seconds <= 0) return 1
    return Math.min(1, now.since / seconds)
  }
  return null
}

/**
 * Whatever is wrong with a machine, said in words.
 *
 * The same shape and the same reason as `blueprintProblems`: a panel with eight
 * cards wants to mark all eight, and a parser that stops at the first mistake
 * makes somebody fix a form one round trip at a time.
 *
 * The one cross-cutting check is that every `to` and the `start` name a state
 * that exists. That *is* refused rather than tolerated, unlike the socket and
 * clip names elsewhere in this file's neighbours, and the difference is worth
 * stating: a missing clip is a thing that stands still, which is a picture of
 * the problem. A missing state is a change that silently never happens, and
 * "nothing happens" is indistinguishable from every other reason nothing
 * happens. The failure has to be at the point of authoring or it is undiagnosable.
 */
export function statesProblems(machine: States): string[] {
  const problems: string[] = []

  if (machine.states.length === 0) {
    problems.push('a thing that changes needs at least one state')
  }
  if (machine.states.length > MAX_STATES) {
    problems.push(`a thing may be in at most ${MAX_STATES} states`)
  }

  const names = new Set<string>()
  for (const state of machine.states) {
    const name = state.name.trim()
    if (name === '' || name.length > MAX_STATE_NAME) {
      problems.push(`a state's name is 1-${MAX_STATE_NAME} characters`)
      continue
    }
    if (names.has(name)) problems.push(`two states are called ${name}`)
    names.add(name)
  }

  if (machine.states.length > 0 && !names.has(machine.start.trim())) {
    problems.push(`${machine.start} is not one of the states`)
  }

  for (const state of machine.states) {
    if (state.model !== undefined && !knownModel(state.model)) {
      problems.push(`${state.model} is not a model we ship`)
    }
    if (state.clip !== undefined && state.clip !== null && state.clip.trim() === '') {
      // Null is "no clip" and is the only spelling of it, exactly as it is on
      // the blueprint itself. A blank string is the second spelling a round
      // trip grows a field nobody wrote out of.
      problems.push('a clip must be named, or absent')
    }
    if (state.emit !== undefined && !word(state.emit)) {
      problems.push(`a signal's name is 1-${MAX_SIGNAL_NAME} characters`)
    }
    if (state.changes.length > MAX_CHANGES_PER_STATE) {
      problems.push(`${state.name} has at most ${MAX_CHANGES_PER_STATE} ways out`)
    }

    for (const change of state.changes) {
      if (!(CHANGE_WHENS as readonly string[]).includes(change.when)) {
        problems.push(`${change.when} is not something that happens to a thing`)
      }
      if (!names.has(change.to.trim())) {
        problems.push(`${state.name} changes into ${change.to}, which is not a state`)
      }
      if (change.when === 'after') {
        const seconds = change.seconds
        if (
          seconds === undefined ||
          !Number.isFinite(seconds) ||
          seconds < MIN_CHANGE_SECONDS ||
          seconds > MAX_CHANGE_SECONDS
        ) {
          problems.push(`a wait is ${MIN_CHANGE_SECONDS}-${MAX_CHANGE_SECONDS} seconds`)
        }
      }
      if (change.when === 'signal' && !word(change.value ?? '')) {
        problems.push(`${state.name} waits for a signal nobody named`)
      }
      if (
        (change.when === 'filled' || change.when === 'emptied') &&
        change.value !== undefined &&
        change.value.trim() === ''
      ) {
        // Absent is "any slot" and is the only spelling of it. See `inSlot`.
        problems.push('a change waits on a named slot, or on any')
      }
    }
  }

  return problems
}

/** Whether a signal name is one word of a sensible length. */
function word(name: string): boolean {
  const trimmed = name.trim()
  return trimmed !== '' && trimmed.length <= MAX_SIGNAL_NAME
}
