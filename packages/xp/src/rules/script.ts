/**
 * `@kxb/xp/script` - a script, and the box it runs in.
 *
 * Stage 2 of docs/xp/creator.md §10, arriving in v1 rather than v2 because the
 * verbs ran out exactly where the plan said they would: the moment a rule has to
 * *compute* - how far away is the player, how long since I last fired, which of
 * these three doors is open - the closed vocabulary either grows an expression
 * language or hands the job to code. §10 argues at length for the second, and
 * this is it.
 *
 * The verbs do not go away and should not. A trigger with three verbs on it is
 * still readable in a panel as three rows, still diffable, still impossible to
 * write wrong. A script is the escape hatch, and the level that needs none is
 * the better level.
 *
 * ---------------------------------------------------------------------------
 * QuickJS in wasm, and not the Web Worker the plan first proposed
 * ---------------------------------------------------------------------------
 * §10 originally said "a Web Worker with no DOM, no fetch and no globals". That
 * is a real sandbox and it is the wrong one here, for one reason that turned out
 * to be decisive: **a worker is asynchronous**. Every answer costs at least a
 * frame, so a script cannot decide anything that has to be true *this* frame -
 * where a platform is, whether a door is open, whether a shot connected - and
 * those are most of what a script is for. The plan admits this in the same
 * paragraph and keeps the verbs "for anything that must be immediate"; with a
 * synchronous sandbox that split disappears and the verbs stay for being
 * *readable* instead, which is a much better reason.
 *
 * What QuickJS buys over the alternatives, in order of how much it matters:
 *
 * - **Synchronous.** A hook returns before the frame does.
 * - **Interruptible.** `while (true) {}` is caught by an interrupt handler after
 *   a fixed number of operations. There is no way to do that to a worker except
 *   by killing it, and no way at all to `new Function`.
 * - **Actually closed.** A fresh context has `Array`, `Math` and `JSON` and no
 *   `fetch`, no `XMLHttpRequest`, no `setTimeout`, no `globalThis.window`. A
 *   worker inherits a browser's whole surface and you subtract from it, which is
 *   a list you can be wrong about.
 * - **The same engine in the test and in the browser.** It is a wasm build, so
 *   `bun test` runs the identical interpreter a player's tab does. A worker
 *   sandbox can only be tested in a browser, which is the one place this project
 *   cannot watch anything run (docs/xp/manual.md §10).
 *
 * What it costs: about 590 KB of wasm in the bundle, and roughly 3 µs per hook
 * call. Both are measured, both are in the manual, and neither is close to
 * mattering at the sizes this engine is designed for.
 *
 * ---------------------------------------------------------------------------
 * The wasm module is handed in, not imported
 * ---------------------------------------------------------------------------
 * This file imports `quickjs-emscripten-core`, which is the interpreter's API
 * and no interpreter. The actual binary is a *variant* the caller passes to
 * `loadScripts`, for the same reason the transport is an `XpHost` and not a
 * Supabase client: a package that picked its own binary would pick wrong for
 * somebody - a browser wants the single file with the wasm inlined, a server
 * wants it beside the module, a Cloudflare worker wants a third thing. Choosing
 * is the host's job because the host is the one that knows.
 */

import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSSyncVariant,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core'

import { entityBox, isMaterial, type Blueprint } from '../document/blueprints'
import { bodyOf, push as pushBody } from '../world/bodies'
import { PLAYER_ID, worldTransform, type EntityId, type EntityWorld } from '../world/entities'

/** Read-only stand-in for an entity with no position. Never mutated. */
const ZERO = { x: 0, y: 0, z: 0 } as const
import {
  MAX_LIGHT_ANGLE,
  MAX_LIGHT_INTENSITY,
  MAX_LIGHT_RANGE,
  type XpDocument,
  type XpProblem,
} from '../document/format'
import { modeOf, rulesOf, type Mode } from '../document/rules'
import type { TriggerEvent } from './triggers'
import { damage as applyDamage } from './triggers'
import { applyVerb, type Effect } from './verbs'
import { BRIDGE, PRELUDE, WRAPPER_LINES, wrap, type BridgeName } from './script-api'
import { randomAt, seedFrom } from '../net/random'
import { translator } from '../document/words'

/** Keep a scripted curve inside the bounds the parser enforces on a typo. */
function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

/**
 * Re-exported here rather than behind an entry point of its own, because the
 * only reason a host has to hash anything is to fill in `ScriptOptions.seed`,
 * and that is this file's business.
 */
export { randomAt, seedFrom } from '../net/random'

/**
 * How much work one hook call may do before it is cut off.
 *
 * QuickJS calls the interrupt handler roughly every 5 000 loop iterations -
 * measured, `bun run xp:bench`, and it is a count of bytecode operations rather
 * than of time. So this is a budget of about 20 000 operations, which on this
 * machine is a little over a millisecond of the worst kind of work a script can
 * do and is several hundred times more than any reasonable hook needs.
 *
 * **A count and not a clock, on purpose.** A deadline in milliseconds cuts a
 * script off at a different place on a fast machine than on a slow one, so two
 * players running the same level would end up with different entity states -
 * which is the one failure this engine is arranged to make impossible. A count
 * runs out at the same operation everywhere.
 */
export const SCRIPT_FUEL = 4

/**
 * How much memory every script in one XP shares.
 *
 * Four megabytes, which is enormous for the kind of state a hook keeps and small
 * enough that a script building an array in a loop hits a `RangeError` rather
 * than the tab's own limit - the difference between one broken entity and a
 * browser asking whether to close the page.
 */
export const SCRIPT_MEMORY = 4 * 1024 * 1024

/** Stack, for the recursion a script writes by accident. */
export const SCRIPT_STACK = 256 * 1024

/** How many log lines one instance of the engine keeps. */
export const MAX_SCRIPT_LOGS = 200

/** A script that threw, with enough to find it in the file. */
export interface ScriptFailure {
  /** The name it has in the document's `scripts` block. */
  script: string
  /** The entity it was running for, or null for a failure at compile time. */
  entity: EntityId | null
  /** Which hook - `onSpawn`, `onTick`, `onTrigger`. */
  hook: string
  message: string
  /** The sandbox's own stack, with the wrapper's line offset taken back out. */
  stack: string
}

/**
 * One document's scripts, compiled and running.
 *
 * Owns a QuickJS context, so it must be closed. Everything on it is synchronous
 * - the same discipline ./entities keeps and for the same reason: a system that
 * awaits is a system whose order stops being deterministic.
 */
export interface Scripts {
  /**
   * Run a frame: reconcile instances, then tick them.
   *
   * Reconciling first is what makes a script work for an entity that was spawned
   * by a verb, by another script, or by the document - there is one path in, and
   * it is "does this live entity have an instance yet".
   */
  step(
    world: EntityWorld,
    blueprints: Readonly<Record<string, Blueprint>>,
    dt: number,
    /**
     * The level's `data`, for `world.get` and `world.add` inside a script.
     *
     * Optional and last, so every caller that predates it is unchanged. Absent
     * reads as a level that keeps nothing: every field is zero and writing does
     * nothing, which is the same answer a host with no store already gives.
     */
    data?: Map<string, number>,
  ): Effect[]

  /**
   * Deliver one of the trigger events to whatever script is on that entity.
   *
   * The same four events the verbs use, minus `spawned`, which has its own hook
   * because a thing that fires once should not look like a thing that fires
   * sixty times a second.
   */
  trigger(
    world: EntityWorld,
    blueprints: Readonly<Record<string, Blueprint>>,
    id: EntityId,
    event: Exclude<TriggerEvent, 'spawned'>,
    other: EntityId | null,
    /**
     * The level's `data`, exactly as `step` above takes it.
     *
     * It was missing here, and the omission is the shape this codebase keeps
     * being caught by: a write with no store is a deliberate no-op, so a script
     * that scored *on contact* wrote to nothing and read every field as zero,
     * while the document, the parser and the sandbox all did what they say.
     * Kickabout counts its goals in `onTrigger`; the scoreboard never moved.
     *
     * Optional and last, like `step`'s, so a caller that keeps nothing is
     * unchanged - and it is the same map, so which hook a script happens to
     * write from stops being something an author has to know.
     */
    data?: Map<string, number>,
  ): Effect[]

  /**
   * Say whether anybody else is in here, for `world.live`.
   *
   * A setter rather than an argument to `step`, because it is not a fact about
   * a frame: it changes when somebody joins or the room's arbiter answers for
   * the first time, which is rarely and never on the caller's schedule. Held
   * the way `data` is held, for the same reason - a bridge function is a plain
   * closure the sandbox calls and there is nowhere to thread an argument
   * through.
   *
   * Never called is `false`, which is the honest answer for every caller that
   * predates this: a test, a shot, and a level opened alone in the editor are
   * all exactly what `false` means.
   */
  setLive(on: boolean): void

  /**
   * Say which mode is actually being played, for `world.mode`.
   *
   * `rules.mode` is what the level *is*; this is what is happening in it. A
   * lobby hosting a battle is a battle for as long as the battle lasts, and a
   * script asking is asking about the session rather than about the file - so a
   * host that runs one says so, and everything else leaves it alone.
   *
   * Never called is the document's own answer, which is right for every caller
   * that predates this and for every level nobody schedules.
   */
  setMode(mode: Mode): void

  /** Everything that has thrown, oldest first. */
  readonly failures: readonly ScriptFailure[]
  /** Whatever the scripts have said, newest last, capped. */
  readonly logs: readonly string[]
  /** Seconds of simulated time, which is what `world.time` reads. */
  readonly elapsed: number

  close(): void
}

export type ScriptsOpened =
  | { ok: true; scripts: Scripts }
  | { ok: false; problems: XpProblem[] }

/**
 * A loaded interpreter, ready to open documents against.
 *
 * Separate from `Scripts` because loading the wasm is asynchronous and opening a
 * document is not: the async half happens once, when the app starts, and the
 * synchronous half happens every time somebody presses play.
 */
export interface ScriptEngine {
  open(document: XpDocument, options?: ScriptOptions): ScriptsOpened
}

/** What a host can decide about a document's scripts, all of it optional. */
export interface ScriptOptions {
  /**
   * The number `world.random` is addressed from.
   *
   * It has to be the *room's* number, not one this client invented, or the
   * clients roll different dice - so a host that runs a shared match passes
   * whatever the room agreed on. Left out, the document's own id is hashed,
   * which is what a test, a screenshot and a level opened alone in the editor
   * want: the same rolls every single time.
   */
  seed?: number
  /**
   * Which language `t` answers in.
   *
   * The reader's, not the room's - see ./words. Left out, `t` gives back
   * whatever it was passed, which is what a test and a level opened in the
   * editor want and is also exactly what a document with no `words` block does
   * anyway.
   */
  locale?: string
}

/**
 * Load the interpreter. Once per process, not once per XP.
 *
 * The variant is the wasm build, chosen by the host - see the note at the top of
 * this file about why this package does not choose it.
 */
export async function loadScripts(
  variant: QuickJSSyncVariant | Promise<{ default: QuickJSSyncVariant }>,
): Promise<ScriptEngine> {
  const wasm = await newQuickJSWASMModuleFromVariant(variant as QuickJSSyncVariant)
  return engineFor(wasm)
}

/**
 * The same thing, for a host that already has a module in its hands.
 *
 * There is nothing to give back. The wasm module is one compiled interpreter
 * for the whole process, holds no per-document state, and the things that do -
 * a runtime, a context, the compiled factories - hang off `Scripts` and are
 * freed by `close`.
 */
export function engineFor(wasm: QuickJSWASMModule): ScriptEngine {
  return { open: (document, options) => openScripts(wasm, document, options) }
}

/**
 * Take the wrapper's lines back out of whatever the sandbox reported.
 *
 * A stack frame reads `at onTick (turret.js:12:3)` and the author's file has
 * eleven lines. Left alone this is the sort of thing somebody spends twenty
 * minutes on before noticing it is always off by one.
 *
 * Two shapes, because QuickJS writes them differently and a first version of
 * this only handled the first: a frame inside a named function is parenthesised,
 * and a *compile* error - which is the one an author sees most - is bare, `at
 * turret.js:12:3`. So this matches the file-and-position part wherever it is
 * rather than the punctuation around it.
 */
function unwrapStack(stack: string): string {
  return stack.replace(/([\w.-]+\.js):(\d+):(\d+)/g, (whole, file: string, line: string, column: string) => {
    const shifted = Number(line) - WRAPPER_LINES
    return shifted > 0 ? `${file}:${shifted}:${column}` : whole
  })
}

/**
 * What a document with no scripts in it gets.
 *
 * Returned rather than a null, so the host mounts one thing and calls `step` on
 * it every frame whether or not the level has any code in it - a `scripts?.step`
 * at the call site is a branch that will one day be written the other way round.
 * A shared constant is safe because there is no state on it to share.
 */
const NO_SCRIPTS: Scripts = {
  step: () => [],
  trigger: () => [],
  // Nothing to tell: there is no sandbox here to read either of them. Still
  // functions, so a host calls them unconditionally rather than growing a
  // branch about whether this level has code in it - which is the whole point
  // of this object.
  setLive: () => {},
  setMode: () => {},
  failures: [],
  logs: [],
  elapsed: 0,
  close: () => {},
}

/**
 * The instance id a level's own script runs under.
 *
 * Negative, because every entity id is not: `PLAYER_ID` is 0 and everything the
 * runtime spawns counts up from `RUNTIME_ID_BASE`. So the world's instance can
 * live in the same map as the entities' without a second lookup anywhere, and
 * the two can never collide.
 *
 * A script running here is handed `-1` as its `self`, which is deliberately not
 * an entity: `getEntityByName(self)` finds nothing, and a hub that tries to move
 * itself moves nothing. What it has instead is `world`, which is the whole point
 * of it being the level's script rather than a thing's.
 */
export const WORLD_SCRIPT_ID = -1

function openScripts(
  wasm: QuickJSWASMModule,
  document: XpDocument,
  options?: ScriptOptions,
): ScriptsOpened {
  const sources = document.scripts ?? {}

  /**
   * Nothing to run, so nothing to spin up.
   *
   * A context is half a millisecond and four megabytes of address space, and
   * most levels have no scripts at all. This is also what lets the host create a
   * `Scripts` unconditionally and not branch on whether the document has any.
   */
  const wanted = new Set<string>()
  for (const blueprint of Object.values(document.blueprints)) {
    if (blueprint.script) wanted.add(blueprint.script)
  }
  /**
   * The level's own script counts as a reason to spin up.
   *
   * Found by a test that opened a document whose only script was the hub and
   * got silence: this set was built from blueprints alone, so a level whose
   * logic is *all* in the hub - which is the case the hub exists for - looked
   * exactly like a level with no scripts at all.
   */
  if (document.script) wanted.add(document.script)
  if (wanted.size === 0) return { ok: true, scripts: NO_SCRIPTS }

  const runtime: QuickJSRuntime = wasm.newRuntime()
  runtime.setMemoryLimit(SCRIPT_MEMORY)
  runtime.setMaxStackSize(SCRIPT_STACK)

  const context: QuickJSContext = runtime.newContext()

  /**
   * State the bridge reads, set for the duration of one call in and cleared
   * after.
   *
   * Mutable and shared rather than passed, because the bridge functions are
   * created once at setup and called from inside the interpreter - there is no
   * argument list to thread a world through. Cleared on the way out so that a
   * bridge call arriving at an impossible moment reads a null world and returns
   * zero rather than writing into last frame's.
   */
  let world: EntityWorld | null = null
  let blueprints: Readonly<Record<string, Blueprint>> = {}
  /**
   * The level's own data, for the length of one call in.
   *
   * Held like `world` rather than passed, because the bridge functions are
   * plain closures the sandbox calls and there is nowhere to thread an argument
   * through. Null when the host keeps none, which reads the same as a field
   * nobody has written: zero.
   */
  let data: Map<string, number> | null = null
  let effects: Effect[] = []
  let elapsed = 0
  /** Whether anybody else is in here. See `Scripts.setLive`. */
  let live = false
  /**
   * Which mode is actually running, which is not always the document's.
   *
   * `rules.mode` is what a level *is* when nobody says otherwise; a battle
   * played in it is a session, and the session is what a script means when it
   * asks. Held rather than read off the document for that reason, and seeded
   * from the document so a host that never says anything is still right.
   */
  let mode: Mode = modeOf(rulesOf(document))

  /**
   * The shared stream's seed, and where it is within the current tick.
   *
   * `rolledAt` is the tick the count belongs to rather than a flag, because
   * `step` and every `trigger` a frame produces are separate calls in and they
   * all have to draw from the same run of numbers - two triggers on one tick
   * that both started at index zero would roll the same "random" value.
   */
  const seed = options?.seed !== undefined ? options.seed >>> 0 : seedFrom(document.id)
  let rolls = 0
  let rolledAt = -1

  const failures: ScriptFailure[] = []
  const logs: string[] = []
  const translate = translator(document.words, options?.locale ?? '')

  /** name -> id, rebuilt when the set of named entities changes. */
  let names = new Map<string, EntityId>()
  let namesSize = -1
  /** parent -> children, so moving a kart moves the boxes of what is in it. */
  let children = new Map<EntityId, EntityId[]>()
  let parentsSize = -1

  function refreshIndexes(w: EntityWorld) {
    if (w.name.size !== namesSize) {
      names = new Map()
      for (const [id, given] of w.name) names.set(given, id)
      namesSize = w.name.size
    }
    if (w.parent.size !== parentsSize) {
      children = new Map()
      for (const [id, link] of w.parent) {
        const list = children.get(link.id)
        if (list) list.push(id)
        else children.set(link.id, [id])
      }
      parentsSize = w.parent.size
    }
  }

  /**
   * Whose collision box no longer matches where they are.
   *
   * Written to by every move a script makes and emptied once, at the end of the
   * call in - see `refreshBoxes`.
   */
  const moved = new Set<EntityId>()

  /**
   * Note that an entity's collision box, and its passengers', are now stale.
   *
   * The box is cached (see ./entities) because nothing used to move. A script
   * moving something is the first thing that does, and a stale box is a crate
   * you bump into where it used to be - which looks like a rendering bug and is
   * not one.
   *
   * Deferred rather than rebuilt here, because rebuilding is not cheap - a
   * transform composed up the parents, a box built from the model, and the same
   * again for everything riding on it - and a script that writes `self.x`,
   * `self.y` and `self.z` on separate lines would pay for it three times over,
   * twice for a position it never meant anything to be at. Nothing inside a
   * script step reads a box: the sandbox can ask where something *is*, which is
   * `world.position`, and cannot ask how wide it is. So the whole set is
   * rebuilt once, on the way out, and by then every write has landed.
   */
  function refreshBox(id: EntityId) {
    moved.add(id)
  }

  /** Make every box that a script moved match where the thing ended up. */
  function refreshBoxes() {
    if (!world || moved.size === 0) return
    for (const id of moved) {
      // Something the frame moved and then despawned has no box to keep, and
      // `despawn` has already taken it out of the map.
      if (!world.alive.has(id)) continue
      const name = world.blueprint.get(id)
      const blueprint = name ? blueprints[name] : undefined
      if (!blueprint) continue
      const placed = worldTransform(world, id, blueprints)
      const box = entityBox(blueprint, placed, placed.rotation, placed.scale, placed)
      if (box) world.box.set(id, box)
      else world.box.delete(id)
      // A passenger's box is composed from its parent's transform, so moving
      // the kart moves the boxes of what is in it. Added to the set rather
      // than recursed into, so a chain three deep is still one pass.
      for (const child of children.get(id) ?? []) moved.add(child)
    }
    moved.clear()
  }

  /**
   * Trigger events a script caused, delivered after it finishes.
   *
   * A script calling `other.damage(10)` should reach the other entity's own
   * `onTrigger('damaged')`, and doing that where it happens would mean calling
   * into the interpreter from inside a function the interpreter is calling. So
   * it is queued and drained at the end of the call, which gives one order that
   * can be written down: everything a hook causes reaches the other scripts on
   * the same frame, after the hook that caused it has returned.
   */
  const pending: { id: EntityId; event: Exclude<TriggerEvent, 'spawned'>; other: EntityId | null }[] = []

  // --- the bridge ----------------------------------------------------------
  // Numbers and strings only. Everything shaped like an object is built out of
  // these in ./script-api, inside the sandbox, where it is free.

  const impl: Record<BridgeName, (...args: QuickJSHandle[]) => QuickJSHandle> = {
    num: (idH, fieldH) => {
      const id = context.getNumber(idH) as EntityId
      const field = context.getNumber(fieldH)
      if (!world) return context.newNumber(0)

      /**
       * An entity that hangs from nothing is read straight out of the maps.
       *
       * `worldTransform` walks a chain and builds an object to hold the answer,
       * and for anything unparented - which is nearly every entity in a level -
       * the answer is the position already sitting in the map. A script reading
       * `self.x`, `self.y` and `self.z` in one line does this three times, so
       * the composed path is the exception rather than the default.
       */
      /**
       * The lamp fields, before the transform ones.
       *
       * Read off `world.light` whatever the entity hangs from: a torch in
       * somebody's hand is as bright as a torch on the wall, so unlike position
       * there is nothing to compose down a parent chain.
       */
      /**
       * Is this in somebody's hands? The world's own answer, not a property.
       *
       * `parent` or `heldBy`, so a script reads the same thing on the screen of
       * whoever is carrying it and on everybody else's - the same answer
       * `HELD_PROP` gives through the condition's door, from the same row.
       */
      if (field === 9) {
        return context.newNumber(world.parent.has(id) || world.heldBy.has(id) ? 1 : 0)
      }

      /**
       * How fast it is going. Zero for everything that is not a body.
       *
       * Above the lamp branch because they are numbered above it and the branch
       * below is a `>=`. Read straight off the row and *not* composed down a
       * parent chain, unlike position: a thing being carried has no velocity of
       * its own - `stepBodies` clears it the moment it is picked up - so the
       * honest answer for anything in a hand is zero, which is what an absent
       * row already says.
       */
      if (field >= 10 && field <= 12) {
        const going = world.velocity.get(id)
        if (!going) return context.newNumber(0)
        return context.newNumber(field === 10 ? going.x : field === 11 ? going.y : going.z)
      }

      /**
       * How fast it is going, whichever way - in one crossing rather than three.
       *
       * `speed` used to be `dx`, `dy` and `dz` read separately and squared in
       * the sandbox, which is three trips over the boundary for one number.
       * `dist` makes the same trade for the same reason; `bun run xp:bench`
       * prices a crossing at about a microsecond, so a `hit` rule asking how
       * hard something arrived paid three of them per entity per frame.
       */
      if (field === 13) {
        const going = world.velocity.get(id)
        if (!going) return context.newNumber(0)
        return context.newNumber(Math.sqrt(going.x * going.x + going.y * going.y + going.z * going.z))
      }

      if (field >= 5) {
        const lamp = world.light.get(id)
        if (!lamp) return context.newNumber(0)
        return context.newNumber(
          field === 5
            ? lamp.intensity
            : field === 6
              ? lamp.range
              : field === 7
                ? lamp.colour
                : lamp.angle,
        )
      }

      if (!world.parent.has(id)) {
        if (field === 3) return context.newNumber(world.rotation.get(id) ?? 0)
        if (field === 4) return context.newNumber(world.scale.get(id) ?? 1)
        const at = world.position.get(id)
        if (!at) return context.newNumber(0)
        return context.newNumber(field === 0 ? at.x : field === 1 ? at.y : at.z)
      }

      const placed = worldTransform(world, id, blueprints)
      const value = field === 0 ? placed.x
        : field === 1 ? placed.y
        : field === 2 ? placed.z
        : field === 3 ? placed.rotation
        : placed.scale
      return context.newNumber(value)
    },

    /**
     * All three axes at once, which is what `moveTo` and `moveBy` mean.
     *
     * Not a convenience. Setting x, y and z separately is three crossings and,
     * worse, three rebuilds of the collision box and of every passenger's -
     * two of which are for positions the script never intended anything to be
     * at.
     */
    setPos: (idH, xH, yH, zH) => {
      const id = context.getNumber(idH) as EntityId
      const x = context.getNumber(xH)
      const y = context.getNumber(yH)
      const z = context.getNumber(zH)
      if (!world || !world.alive.has(id) || ![x, y, z].every(Number.isFinite)) return context.undefined
      if (!world.position.has(id)) return context.undefined
      world.position.set(id, { x, y, z })
      refreshBox(id)
      return context.undefined
    },

    /**
     * Shift it by an offset, in one crossing rather than four.
     *
     * `moveBy` used to be written in the sandbox as `moveTo(this.x + dx, ...)`,
     * which reads well and is three position reads and a write - four trips
     * over the boundary to add three numbers, and the boundary is what this
     * design pays for.
     *
     * It also fixes what that spelling got wrong on anything parented. Reading
     * `this.x` composes the parents and gives *world* coordinates; `moveTo`
     * writes the position an entity owns, which is the one *within* its
     * parent's frame. So a gun in a hand moved by one cell used to jump to
     * wherever the hand was, plus one - a teleport rather than a nudge. Adding
     * to the local position, as this does, is the only reading of "move it a
     * bit" that holds for a child as well as for everything else.
     */
    moveBy: (idH, xH, yH, zH) => {
      const id = context.getNumber(idH) as EntityId
      const dx = context.getNumber(xH)
      const dy = context.getNumber(yH)
      const dz = context.getNumber(zH)
      if (!world || !world.alive.has(id) || ![dx, dy, dz].every(Number.isFinite)) return context.undefined
      const at = world.position.get(id)
      if (!at) return context.undefined
      world.position.set(id, { x: at.x + dx, y: at.y + dy, z: at.z + dz })
      refreshBox(id)
      return context.undefined
    },

    setNum: (idH, fieldH, valueH) => {
      const id = context.getNumber(idH) as EntityId
      const field = context.getNumber(fieldH)
      const value = context.getNumber(valueH)
      if (!world || !world.alive.has(id) || !Number.isFinite(value)) return context.undefined

      /**
       * Writing a lamp, which is the whole of "animatable in scripts".
       *
       * **Only on something the document already said was a lamp.** A script
       * cannot light an entity that has no `light` block — a level would
       * otherwise have lights in it that nothing in the file mentions, and the
       * count of them is the thing `MAX_LIGHTS` exists to keep visible.
       *
       * Clamped rather than refused, unlike the parser: a fade is a loop
       * writing a number every frame, and the run that overshoots by 0.001 on
       * the last step should end dark rather than throw the last write away.
       * The parser is where a *typo* is caught; this is where a curve lands.
       */
      /**
       * Read-only, and silently so.
       *
       * Being carried is a fact about the world - `carry` and `drop` are how it
       * changes - so a script assigning to it is a script asking for a lie.
       * Dropped rather than refused because every other write here that cannot
       * land does the same, and a throw from inside a frame loop is a level
       * that stops rather than a line that did nothing.
       */
      if (field === 9) return context.undefined

      /**
       * Setting a velocity outright - stopping a ball, or aiming one.
       *
       * Only on something the document made a body, for `light`'s reason word
       * for word: a level whose scenery drifts has movement in it that nothing
       * in the file mentions, and `stepBodies` is the only thing that would
       * ever put it back.
       *
       * The row is **deleted** rather than written with a zero when all three
       * come to nothing, because absent and at rest are the same state and
       * `EntityWorld.velocity` is kept sparse on purpose.
       */
      if (field >= 10 && field <= 12) {
        const name = world.blueprint.get(id)
        if (!bodyOf(name ? blueprints[name] : undefined)) return context.undefined
        const going = { ...(world.velocity.get(id) ?? { x: 0, y: 0, z: 0 }) }
        if (field === 10) going.x = value
        else if (field === 11) going.y = value
        else going.z = value
        if (going.x === 0 && going.y === 0 && going.z === 0) world.velocity.delete(id)
        else world.velocity.set(id, going)
        return context.undefined
      }

      if (field >= 5) {
        const lamp = world.light.get(id)
        if (!lamp) return context.undefined
        if (field === 5) lamp.intensity = clamp(value, 0, MAX_LIGHT_INTENSITY)
        else if (field === 6) lamp.range = clamp(value, 0, MAX_LIGHT_RANGE)
        else if (field === 7)
          // A colour is packed rather than measured, so a fractional or
          // out-of-range one is rounded into the cube instead of wrapping.
          lamp.colour = Math.round(clamp(value, 0, 0xffffff))
        // Meaningless on a 'point' lamp, same as reading it is - not refused,
        // because a script switching a lamp between the two later should not
        // have to remember which one it left the angle on.
        else lamp.angle = clamp(value, 0, MAX_LIGHT_ANGLE)
        return context.undefined
      }

      if (field <= 2) {
        const at = world.position.get(id)
        if (!at) return context.undefined
        world.position.set(id, {
          x: field === 0 ? value : at.x,
          y: field === 1 ? value : at.y,
          z: field === 2 ? value : at.z,
        })
      } else if (field === 3) {
        world.rotation.set(id, value)
      } else {
        // A scale of zero is a thing with no box and no pixels, which reads as
        // a bug in the engine rather than as a line somebody wrote.
        if (value <= 0) return context.undefined
        world.scale.set(id, value)
      }
      refreshBox(id)
      return context.undefined
    },

    alive: (idH) => {
      const id = context.getNumber(idH) as EntityId
      return context.newNumber(world?.alive.has(id) ? 1 : 0)
    },

    prop: (idH, keyH) => {
      const id = context.getNumber(idH) as EntityId
      const key = context.getString(keyH)
      // Missing reads as zero, the same as a trigger's condition does. One
      // answer to "what is a property nobody set", in both places.
      return context.newNumber(world?.props.get(id)?.[key] ?? 0)
    },

    material: (idH) => {
      const id = context.getNumber(idH) as EntityId
      // Absent is `own`, so the word is what comes back rather than undefined:
      // a script comparing `self.material === 'own'` has to work on a thing
      // that never wore anything, which is nearly every thing.
      return context.newString(world?.material.get(id) ?? 'own')
    },

    setMaterial: (idH, nameH) => {
      const id = context.getNumber(idH) as EntityId
      const name = context.getString(nameH)
      if (!world || !world.alive.has(id)) return context.undefined
      // The name was checked in the prelude, where a bad one throws with a line
      // number in somebody's own script rather than out here with none. This
      // guard is the type narrowing and a second door on the same lock.
      if (!isMaterial(name)) return context.undefined
      effects.push(
        ...applyVerb(world, blueprints, { op: 'material', target: 'self', material: name }, {
          self: id,
          other: null,
        }),
      )
      return context.undefined
    },

    setProp: (idH, keyH, valueH) => {
      const id = context.getNumber(idH) as EntityId
      const key = context.getString(keyH)
      const value = context.getNumber(valueH)
      if (!world || !Number.isFinite(value)) return context.undefined
      effects.push(
        ...applyVerb(world, blueprints, { op: 'setProp', key, value, target: 'self' }, { self: id, other: null }),
      )
      return context.undefined
    },

    /**
     * Add to a property, on the side that already holds it.
     *
     * `self.add('n', 1)` used to be `setProp(id, k, prop(id, k) + 1)` in the
     * prelude, which is two trips over the boundary for one addition. The
     * boundary is what this design pays for - `bun run xp:bench` prices a
     * crossing at about a microsecond - and it is the same trade `dist` makes
     * a few functions down: move the arithmetic to the side that has the
     * numbers, rather than carrying the numbers to the arithmetic.
     *
     * The verb does the adding, not this function, so a property nobody has
     * set still starts at the zero `addProp` uses everywhere else.
     */
    addProp: (idH, keyH, amountH) => {
      const id = context.getNumber(idH) as EntityId
      const key = context.getString(keyH)
      const value = context.getNumber(amountH)
      if (!world || !Number.isFinite(value)) return context.undefined
      effects.push(
        ...applyVerb(world, blueprints, { op: 'addProp', key, value, target: 'self' }, { self: id, other: null }),
      )
      return context.undefined
    },

    data: (keyH) => {
      const key = context.getString(keyH)
      // Missing reads as zero, like a property and like a condition. One answer
      // to "what is a number nobody has set", in all three places.
      return context.newNumber(data?.get(key) ?? 0)
    },

    setData: (keyH, valueH) => {
      const key = context.getString(keyH)
      const value = context.getNumber(valueH)
      if (!world || !data || !Number.isFinite(value)) return context.undefined

      /**
       * A field the document never declared is refused, and said out loud.
       *
       * `parseXp` refuses a *rule* naming one and cannot do the same here: a key
       * in a script is a string that may be built at runtime. So the check moves
       * to the moment of the write — and it **logs** rather than failing
       * silently, because the alternative was discovered by a test: the value
       * went into the map, the scene wrote back only declared fields, and the
       * author's coin count worked all session and was gone the next morning
       * with nothing anywhere saying why.
       */
      if (!Object.hasOwn(document.data ?? {}, key)) {
        logs.push(`there is no field called "${key}" — declare it in Data before writing to it`)
        return context.undefined
      }
      /**
       * Through the verb rather than into the map.
       *
       * `setProp target: 'world'` is the one place that knows what writing a
       * level's field means, and a second writer here would be a second place
       * to keep in step the day it learns anything — a cap, a refusal, a
       * declared-field check.
       */
      effects.push(
        ...applyVerb(
          world,
          blueprints,
          { op: 'setProp', key, value, target: 'world' },
          { self: PLAYER_ID, other: null, data },
        ),
      )
      return context.undefined
    },

    /** `world.add`, in one crossing. `addProp`'s note applies word for word. */
    addData: (keyH, amountH) => {
      const key = context.getString(keyH)
      const value = context.getNumber(amountH)
      if (!world || !data || !Number.isFinite(value)) return context.undefined
      if (!Object.hasOwn(document.data ?? {}, key)) {
        logs.push(`there is no field called "${key}" — declare it in Data before writing to it`)
        return context.undefined
      }
      effects.push(
        ...applyVerb(
          world,
          blueprints,
          { op: 'addProp', key, value, target: 'world' },
          { self: PLAYER_ID, other: null, data },
        ),
      )
      return context.undefined
    },

    spendData: (keyH, amountH) => {
      const key = context.getString(keyH)
      const amount = context.getNumber(amountH)
      if (!world || !data || !Number.isFinite(amount)) return context.newNumber(0)

      if (!Object.hasOwn(document.data ?? {}, key)) {
        logs.push(`there is no field called "${key}" — declare it in Data before spending it`)
        return context.newNumber(0)
      }

      /**
       * Short is a refusal and not a partial spend.
       *
       * Taking what there is and answering `false` would be the worst of both:
       * the caller reads it as "nothing happened" and the money is gone anyway.
       */
      const held = data.get(key) ?? 0
      if (!Number.isFinite(amount) || amount < 0 || held < amount) return context.newNumber(0)

      effects.push(
        ...applyVerb(
          world,
          blueprints,
          { op: 'setProp', key, value: held - amount, target: 'world' },
          { self: PLAYER_ID, other: null, data },
        ),
      )
      return context.newNumber(1)
    },

    /**
     * How far apart two entities are, in one crossing instead of six.
     *
     * `distanceTo` used to be written in the sandbox as `this.x - other.x` and
     * so on, which reads well and costs **six** trips over the wasm boundary for
     * one number - and the boundary is the expensive part of this whole design,
     * at roughly 1.1us a crossing measured by `bun run xp:bench`. A level with
     * five hundred scripted entities each asking one distance a tick spent most
     * of a frame's entire budget doing it: 14ms of 16.7, against 2.5 now.
     *
     * The composition is deliberately the same as `num`'s: unparented entities
     * are read straight out of the map, and anything hanging off something else
     * is composed with `worldTransform`. A script asking how far away something
     * is means where it is *drawn*, and a gun in a hand is where the hand is.
     *
     * `flat` drops the height, which is what "how close is the player" usually
     * means in a level with stairs in it - somebody one floor up is not out of
     * range.
     */
    dist: (aH, bH, flatH) => {
      if (!world) return context.newNumber(Infinity)

      const here = world
      const at = (id: EntityId) => {
        if (!here.parent.has(id)) return here.position.get(id) ?? ZERO
        return worldTransform(here, id, blueprints)
      }

      const a = at(context.getNumber(aH) as EntityId)
      const b = at(context.getNumber(bH) as EntityId)

      const dx = a.x - b.x
      const dz = a.z - b.z
      const dy = context.getNumber(flatH) === 1 ? 0 : a.y - b.y

      return context.newNumber(Math.sqrt(dx * dx + dy * dy + dz * dz))
    },

    byName: (nameH) => {
      const wanted = context.getString(nameH)
      const id = names.get(wanted)
      return context.newNumber(id !== undefined && world?.alive.has(id) ? id : -1)
    },

    damage: (idH, amountH) => {
      const id = context.getNumber(idH) as EntityId
      const amount = context.getNumber(amountH)
      if (!world || !Number.isFinite(amount)) return context.undefined
      const before = world.alive.has(id)
      // With the clock, so a `damaged` rule that says "off for three seconds"
      // means three seconds when a script dealt the hit as well as when a shot
      // did. Without it the deadline is `Infinity` and the thing never returns.
      effects.push(
        ...applyDamage(world, blueprints, id, amount, null, {
          now: elapsed,
          ...(data ? { data } : {}),
        }),
      )
      // Only if it survived: a script hook for an entity that has just been
      // despawned by its own verbs is a hook running on a corpse, and the
      // instance is about to be dropped anyway.
      if (before && world.alive.has(id)) pending.push({ id, event: 'damaged', other: null })
      return context.undefined
    },

    /**
     * A shove, and whether it landed.
     *
     * Thin on purpose: `push` in `@kxb/xp/bodies` is the one that knows about
     * mass and the speed cap, and this is the crossing. A second implementation
     * of "divide by mass" on this side of the bridge would be a second thing to
     * keep in step with a number an author can change.
     */
    push: (idH, xH, yH, zH) => {
      const id = context.getNumber(idH) as EntityId
      if (!world) return context.newNumber(0)
      const landed = pushBody(
        world,
        blueprints,
        id,
        context.getNumber(xH),
        context.getNumber(yH),
        context.getNumber(zH),
      )
      return context.newNumber(landed ? 1 : 0)
    },

    runAnimation: (idH, nameH, loopH, partsH) => {
      const id = context.getNumber(idH) as EntityId
      const name = context.getString(nameH)
      if (!world || !world.alive.has(id)) return context.undefined
      /**
       * The parts, as JSON, because the bridge carries numbers and strings.
       *
       * A handle-shaped array would mean the host reaching into a sandbox value
       * element by element, which is the one thing this bridge is arranged to
       * avoid - every other call passes primitives across and nothing else. The
       * prelude does the encoding, so what a script writes is an array.
       *
       * Anything that is not an array of strings is treated as "no parts", which
       * is the whole body: a malformed list should be a clip that plays rather
       * than a call that throws inside somebody's `onTick`.
       */
      const raw = context.getString(partsH)
      let parts: string[] | null = null
      if (raw !== '') {
        try {
          const parsed: unknown = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            const names = parsed.filter((entry): entry is string => typeof entry === 'string')
            if (names.length > 0) parts = names
          }
        } catch {
          parts = null
        }
      }
      /**
       * An empty name clears it, which is how a loop is stopped.
       *
       * `runAnimation(null)` in the prelude arrives here as `''` rather than as
       * a missing argument, because the bridge is typed and a hole in it would
       * be a second shape every implementation has to handle.
       */
      if (name === '') world.clip.delete(id)
      else {
        world.clip.set(id, {
          name,
          loop: context.getNumber(loopH) !== 0,
          at: world.tick,
          ...(parts ? { parts } : {}),
        })
      }
      return context.undefined
    },

    despawn: (idH) => {
      const id = context.getNumber(idH) as EntityId
      if (!world) return context.undefined
      effects.push(
        ...applyVerb(world, blueprints, { op: 'despawn', target: 'self' }, { self: id, other: null }),
      )
      return context.undefined
    },

    spawn: (fromH, blueprintH, dxH, dyH, dzH) => {
      const from = context.getNumber(fromH) as EntityId
      const name = context.getString(blueprintH)
      const dx = context.getNumber(dxH)
      const dy = context.getNumber(dyH)
      const dz = context.getNumber(dzH)
      if (!world || !blueprints[name] || ![dx, dy, dz].every(Number.isFinite)) {
        return context.newNumber(-1)
      }
      const made = applyVerb(
        world,
        blueprints,
        { op: 'spawn', blueprint: name, dx, dy, dz },
        { self: from, other: null },
      )
      effects.push(...made)
      const spawned = made.find((effect) => effect.kind === 'spawned')
      return context.newNumber(spawned && spawned.kind === 'spawned' ? spawned.id : -1)
    },

    score: (amountH, byH) => {
      const amount = context.getNumber(amountH)
      const by = context.getNumber(byH) as EntityId
      if (Number.isFinite(amount)) effects.push({ kind: 'score', amount, by })
      return context.undefined
    },

    emit: (eventH, fromH) => {
      const event = context.getString(eventH)
      const from = context.getNumber(fromH) as EntityId
      // `script: true` so the host knows not to broadcast it: this hook has
      // already run on every client. See the note on the effect in ./verbs.
      if (event) effects.push({ kind: 'emit', event, from, script: true })
      return context.undefined
    },

    /**
     * What the level says, through the document's own table.
     *
     * Resolved once when the context is built rather than per call: the block
     * does not change while a level is open, and this is reached from inside a
     * frame.
     */
    say: (keyH) => context.newString(translate(context.getString(keyH))),

    log: (textH) => {
      const line = context.getString(textH)
      // Capped by dropping the oldest. A script logging every frame is the
      // common case and the interesting line is the last one, not the first.
      logs.push(line)
      if (logs.length > MAX_SCRIPT_LOGS) logs.shift()
      return context.undefined
    },

    state: (whichH) => {
      const which = context.getNumber(whichH)
      if (which === 0) return context.newNumber(world?.tick ?? 0)
      if (which === 2) return context.newNumber(seed)
      // A number rather than a boolean, because that is what this bridge slot
      // carries and one shape for every reading is worth more than a third
      // conversion at the boundary. The prelude turns it back into `true`.
      if (which === 3) return context.newNumber(live ? 1 : 0)
      return context.newNumber(elapsed)
    },

    /**
     * What the level *is*, in words, for `world.mode` and `world.style`.
     *
     * Two document facts rather than two more numbers, because a script asking
     * them is going to compare them against a name - `world.mode === 'battle'`
     * reads as the question it is, and a number would mean an author keeping a
     * table of them in their head.
     *
     * Read off the document on every call rather than resolved once. It costs a
     * lookup and buys the thing `say` gives up for the same reason it can: the
     * words table cannot change while a level is open and neither can this, but
     * this is one property access rather than a map build, so there is nothing
     * to save.
     */
    about: (whichH) =>
      context.newString(context.getNumber(whichH) === 0 ? mode : rulesOf(document).preset),

    /**
     * The next value of the shared stream.
     *
     * The index is what this counts and it resets whenever the tick moves, so
     * two clients that disagreed about how many rolls a frame contained
     * disagree for that frame and agree again on the next one. See ./random for
     * why that is worth more than a longer stream.
     */
    random: () => {
      const tick = world?.tick ?? 0
      if (tick !== rolledAt) {
        rolledAt = tick
        rolls = 0
      }
      return context.newNumber(randomAt(seed, tick, rolls++))
    },
  }

  /** Everything the context is holding that has to be freed by hand. */
  const held: QuickJSHandle[] = []

  const bridge = context.newObject()
  for (const name of BRIDGE) {
    const fn = context.newFunction(name, impl[name])
    context.setProp(bridge, name, fn)
    fn.dispose()
  }
  context.setProp(context.global, '$b', bridge)
  bridge.dispose()

  const prelude = context.evalCode(PRELUDE, 'xp-prelude.js')
  if (prelude.error) {
    // Not an author's mistake - this file shipped with the engine. Loud, and
    // fatal for the document, because every script would fail identically.
    const message = context.dump(prelude.error) as { message?: string }
    prelude.error.dispose()
    context.dispose()
    runtime.dispose()
    return {
      ok: false,
      problems: [{ at: 'scripts', message: `the script API failed to load: ${message?.message ?? 'unknown'}` }],
    }
  }
  prelude.value.dispose()

  const api = context.getProp(context.global, '$xp')
  const hooks = {
    make: context.getProp(api, 'make'),
    drop: context.getProp(api, 'drop'),
    spawned: context.getProp(api, 'spawned'),
    tick: context.getProp(api, 'tick'),
    trigger: context.getProp(api, 'trigger'),
  }
  api.dispose()
  held.push(...Object.values(hooks))

  // --- compile ---------------------------------------------------------------
  const factories = new Map<string, QuickJSHandle>()
  const problems: XpProblem[] = []

  for (const name of wanted) {
    const source = sources[name]
    if (source === undefined) {
      // The parser refuses this, so it can only reach here from a document
      // built in memory by the editor.
      problems.push({ at: `blueprints`, message: `no script called "${name}"` })
      continue
    }
    const compiled = context.evalCode(wrap(source), `${name}.js`)
    if (compiled.error) {
      const detail = context.dump(compiled.error) as { name?: string; message?: string; stack?: string }
      compiled.error.dispose()
      // The *name* carries most of the meaning for a compile error - QuickJS's
      // message for a missing brace is `expecting ';'`, which on its own reads
      // like a note rather than like a refusal.
      const headline = [detail?.name, detail?.message ?? 'did not compile'].filter(Boolean).join(': ')
      problems.push({
        at: `scripts.${name}`,
        message: `${headline}${detail?.stack ? `\n${unwrapStack(detail.stack)}` : ''}`,
      })
      continue
    }
    factories.set(name, compiled.value)
  }

  if (problems.length > 0) {
    for (const factory of factories.values()) factory.dispose()
    for (const handle of held) handle.dispose()
    context.dispose()
    runtime.dispose()
    return { ok: false, problems }
  }

  // The sandbox's last door out, closed. From here a script can reach the
  // engine only through the names ./script-api left on `globalThis`.
  const sealed = context.evalCode('delete globalThis.$xp', 'xp-prelude.js')
  if (sealed.error) sealed.error.dispose()
  else sealed.value.dispose()

  /**
   * Fuel, refilled before every call in.
   *
   * The handler is installed once. Returning true is what stops the
   * interpreter, and it stops it with a catchable error rather than a corrupt
   * context - the same context runs the next entity's hook.
   */
  let fuel = SCRIPT_FUEL
  runtime.setInterruptHandler(() => --fuel <= 0)

  /** Which entity ids have an instance, and what hooks it turned out to have. */
  /**
   * `key` is this instance's id, as a handle, made once and kept.
   *
   * Every call into the sandbox names the instance it is for, so a naive
   * dispatch allocates a handle for the same unchanging number sixty times a
   * second per scripted entity - and `bun run xp:bench` prices that dispatch at
   * about half a microsecond, which at five hundred entities is a quarter of a
   * millisecond of a frame spent packing numbers that were already packed.
   *
   * Disposed where the instance is dropped, and in `close` for whatever is
   * still standing when the level does.
   */
  const instances = new Map<EntityId, { script: string; hooks: number; key: QuickJSHandle }>()
  /** Instances that threw. They are not called again - see `report`. */
  const stopped = new Set<EntityId>()

  const HAS_SPAWN = 1
  const HAS_TICK = 2
  const HAS_TRIGGER = 4

  function report(script: string, entity: EntityId | null, hook: string, error: QuickJSHandle) {
    const detail = context.dump(error) as { message?: string; stack?: string }
    error.dispose()
    failures.push({
      script,
      entity,
      hook,
      message: String(detail?.message ?? 'threw'),
      stack: unwrapStack(String(detail?.stack ?? '')),
    })
    /**
     * One throw and the instance stops.
     *
     * A hook that threw will be called again next frame with the same state and
     * throw again, sixty times a second, and the failure that mattered is the
     * one at the top of a list of three thousand identical ones. Stopping is
     * also the honest thing to show a person: the entity is broken, and it
     * looks broken, rather than flickering between working and not.
     *
     * What it gives up is a script that throws in a rare branch and would have
     * been fine afterwards. That is a real loss and it is the smaller one.
     */
    if (entity !== null) stopped.add(entity)
  }

  /**
   * Call one of the interpreter's own dispatchers, with fuel and a net.
   *
   * The arguments belong to the caller and are still alive on the way out, so
   * that the ones which do not change between calls - an instance's id, a
   * frame's delta - can be made once and handed over many times. Anything built
   * for a single call is disposed by whoever built it.
   */
  function call(hook: QuickJSHandle, script: string, entity: EntityId | null, which: string, args: QuickJSHandle[]) {
    fuel = SCRIPT_FUEL
    const result = context.callFunction(hook, context.undefined, ...args)
    if (result.error) report(script, entity, which, result.error)
    else result.value.dispose()
  }

  function scriptOf(w: EntityWorld, id: EntityId): string | undefined {
    const name = w.blueprint.get(id)
    return name ? blueprints[name]?.script : undefined
  }

  /**
   * Bring the instances in line with the world, and fire `onSpawn` for the new.
   *
   * Every path that creates an entity - the document, a verb, another script -
   * arrives here, because the question asked is "does this live entity have an
   * instance" rather than "who made it". That is why there is no `spawn` hook
   * anywhere else in the engine to keep in step with this one.
   */
  function reconcile(w: EntityWorld) {
    for (const [id, instance] of instances) {
      if (id === WORLD_SCRIPT_ID || w.alive.has(id)) continue
      call(hooks.drop, instance.script, id, 'drop', [instance.key])
      instance.key.dispose()
      instances.delete(id)
    }
    /**
     * A stopped entity forgets it was stopped once it is gone.
     *
     * Separate from the sweep above because the two sets do not line up: a
     * script whose *top level* threw has no instance to drop, and if its id is
     * never cleared here then the runtime id that reuses it later starts life
     * already broken.
     */
    for (const id of stopped) {
      if (!w.alive.has(id)) stopped.delete(id)
    }

    /**
     * The level's own script, made once and never dropped.
     *
     * Outside the loop below because that loop asks "does this live entity have
     * an instance", and this one is not an entity - there is nothing in
     * `w.alive` to walk to find it. The document is the thing that says it
     * exists, and the document does not change while a level is open.
     */
    if (document.script && !instances.has(WORLD_SCRIPT_ID) && !stopped.has(WORLD_SCRIPT_ID)) {
      const factory = factories.get(document.script)
      if (factory) {
        fuel = SCRIPT_FUEL
        // One handle, passed as both the key and the id and then kept as the
        // instance's own - see the note on `instances`.
        const keyHandle = context.newNumber(WORLD_SCRIPT_ID)
        const made = context.callFunction(hooks.make, context.undefined, keyHandle, factory, keyHandle)

        if (made.error) {
          keyHandle.dispose()
          report(document.script, WORLD_SCRIPT_ID, 'top level', made.error)
        } else {
          const bits = context.getNumber(made.value)
          made.value.dispose()
          instances.set(WORLD_SCRIPT_ID, { script: document.script, hooks: bits, key: keyHandle })
          if (bits & HAS_SPAWN) {
            call(hooks.spawned, document.script, WORLD_SCRIPT_ID, 'onSpawn', [keyHandle])
          }
        }
      }
    }

    for (const id of w.alive) {
      if (instances.has(id)) continue
      /**
       * A script whose top level threw is not tried again either.
       *
       * It has no instance, so without this it would fail the "does this live
       * entity have an instance yet" test on every single frame and produce the
       * flood of identical failures the whole `stopped` idea exists to prevent
       * - which is exactly what it did until a test counted them.
       */
      if (stopped.has(id)) continue

      const script = scriptOf(w, id)
      if (!script) continue
      const factory = factories.get(script)
      if (!factory) continue

      fuel = SCRIPT_FUEL
      const keyHandle = context.newNumber(id)
      const made = context.callFunction(hooks.make, context.undefined, keyHandle, factory, keyHandle)

      if (made.error) {
        keyHandle.dispose()
        report(script, id, 'top level', made.error)
        continue
      }
      const bits = context.getNumber(made.value)
      made.value.dispose()
      instances.set(id, { script, hooks: bits, key: keyHandle })

      if (bits & HAS_SPAWN) call(hooks.spawned, script, id, 'onSpawn', [keyHandle])
    }
  }

  /** Deliver whatever the scripts set off among themselves. */
  function drain() {
    // Indexed rather than iterated: a hook may queue more while it runs, and
    // those belong to this frame too. Bounded by the fact that each one is a
    // hook call with its own fuel.
    for (let i = 0; i < pending.length && i < 1024; i++) {
      const next = pending[i]
      const instance = instances.get(next.id)
      if (!instance || stopped.has(next.id) || !(instance.hooks & HAS_TRIGGER)) continue
      if (!world?.alive.has(next.id)) continue
      const event = context.newString(next.event)
      const other = context.newNumber(next.other ?? -1)
      call(hooks.trigger, instance.script, next.id, 'onTrigger', [instance.key, event, other])
      event.dispose()
      other.dispose()
    }
    pending.length = 0
  }

  /** Set the shared state up for one call in, and take it down after. */
  function during<T>(
    w: EntityWorld,
    b: Readonly<Record<string, Blueprint>>,
    body: () => T,
    d?: Map<string, number>,
  ): Effect[] {
    world = w
    blueprints = b
    data = d ?? null
    effects = []
    refreshIndexes(w)
    body()
    drain()
    // After `drain`, so that a box is rebuilt once for everything the frame did
    // to it - the hook, and whatever the triggers it set off went on to move.
    refreshBoxes()
    const produced = effects
    world = null
    data = null
    effects = []
    return produced
  }

  const scripts: Scripts = {
    setLive(on) {
      live = on === true
    },

    setMode(next) {
      mode = next
    },

    step(w, b, dt, d) {
      // A frame that is not a number is a host bug, and passing it through
      // would make every `world.time` and every `dt * speed` in every script
      // NaN at once - which reads as "the level broke" rather than as one bad
      // delta.
      const delta = Number.isFinite(dt) && dt > 0 ? dt : 0
      return during(
        w,
        b,
        () => {
          elapsed += delta
          reconcile(w)
          /**
           * A snapshot of the ids, not the live map.
           *
           * A hook may spawn something scripted, and the new instance is created
           * by the *next* frame's reconcile rather than half way through this
           * one. Iterating the map while a hook adds to it is the sort of thing
           * that works until two entities spawn each other.
           */
          // One handle for the frame's delta rather than one per entity: it is
          // the same number for every hook in the loop below, and packing it
          // again for each of five hundred entities is five hundred
          // allocations of a number the sandbox is about to read once.
          const step = context.newNumber(delta)
          for (const id of [...instances.keys()]) {
            const instance = instances.get(id)
            if (!instance || stopped.has(id) || !(instance.hooks & HAS_TICK)) continue
            // The world's instance is not in `alive` and never will be. Every
            // other id here has to be, or a hook would run for something that
            // died earlier in the same frame.
            if (id !== WORLD_SCRIPT_ID && !w.alive.has(id)) continue
            call(hooks.tick, instance.script, id, 'onTick', [instance.key, step])
          }
          step.dispose()
        },
        d,
      )
    },

    trigger(w, b, id, event, other, d) {
      return during(
        w,
        b,
        () => {
          const instance = instances.get(id)
          if (!instance || stopped.has(id) || !(instance.hooks & HAS_TRIGGER)) return
          if (!w.alive.has(id)) return
          const named = context.newString(event)
          const otherH = context.newNumber(other ?? -1)
          call(hooks.trigger, instance.script, id, 'onTrigger', [instance.key, named, otherH])
          named.dispose()
          otherH.dispose()
        },
        d,
      )
    },

    get failures() {
      return failures
    },
    get logs() {
      return logs
    },
    get elapsed() {
      return elapsed
    },

    close() {
      for (const instance of instances.values()) instance.key.dispose()
      instances.clear()
      for (const factory of factories.values()) factory.dispose()
      factories.clear()
      for (const handle of held) handle.dispose()
      held.length = 0
      context.dispose()
      runtime.dispose()
    },
  }

  return { ok: true, scripts }
}
