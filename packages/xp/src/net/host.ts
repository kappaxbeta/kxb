/**
 * `@kxb/xp/host` - the hole where the world goes.
 *
 * Every other entry point in this package is pure. This one is the opposite: it
 * declares what an XP cannot supply for itself - who you are, how a message
 * reaches the other players, what time it is - and implements none of it.
 *
 * ---------------------------------------------------------------------------
 * Why interfaces and not an implementation
 * ---------------------------------------------------------------------------
 * The same engine has to run in three places that agree about nothing:
 *
 *   - **our app**, where identity is a signed-in operator, the transport is
 *     Supabase Realtime and durable results are events in a log;
 *   - **two tabs on a laptop**, where identity is a name in `localStorage`, the
 *     transport is a `BroadcastChannel` and nothing is durable at all - which is
 *     what `Try out` runs on, and what the tests run on;
 *   - **somebody else's project**, one day, where all three are theirs.
 *
 * A package that reached for `@supabase/supabase-js` would work in exactly one
 * of those. So the shape of the dependency is inverted: the engine says what it
 * needs, the host hands it in, and neither knows the other's name.
 *
 * The discipline that keeps this honest: **nothing in this package imports a
 * transport, an SDK or a global.** If a new capability needs one, it is a
 * method on one of these interfaces, supplied at the boundary.
 *
 * ---------------------------------------------------------------------------
 * Optional means optional
 * ---------------------------------------------------------------------------
 * Several members below are `?`. That is a real contract, not politeness: an XP
 * declares what it `needs` and what it merely `wants`, a missing `need` refuses
 * to load, and a missing `want` degrades. Without the split, a level with an
 * optional leaderboard cannot run on a host with no database - which is exactly
 * the friction that would make an exported XP useless.
 */

import type { Vec3 } from '../world/physics'

// ---------------------------------------------------------------------------
// Who is playing
// ---------------------------------------------------------------------------

export interface XpPlayer {
  /** Stable for as long as this person is in this instance. */
  id: string
  name: string
  /** A model id the catalogue knows, or undefined for the default body. */
  skin?: string
  /** Which side, once the rules have assigned one. */
  team?: string
}

export interface XpIdentity {
  /** Whoever is at the keyboard, or null if nobody is signed in. */
  current(): Promise<XpPlayer | null>
  /** Offered only by a host that has an account system. */
  signIn?(): Promise<XpPlayer>
  /** Offered only by a host that lets strangers in. */
  guest?(name: string): Promise<XpPlayer>
}

// ---------------------------------------------------------------------------
// How a message reaches the other players
// ---------------------------------------------------------------------------

/**
 * One topic, joined.
 *
 * Deliberately smaller than any real transport. Everything a running XP sends -
 * where somebody is, what they are doing, that a goal was scored - is a message
 * on a topic, and everything it receives is the same. Anything richer would be
 * a shape only one implementation could satisfy.
 *
 * **Nothing sent here is durable.** A socket is for what is true *now*; what has
 * to survive a refresh goes through `XpPersistence`. That line is not a
 * suggestion - a position update at 8 Hz written to a log is a log that grows by
 * a million rows an hour.
 */
export interface XpSocket {
  /** Fire and forget. No delivery guarantee, by design. */
  send(type: string, payload: unknown): void
  /** Returns an unsubscribe. */
  on(type: string, handler: (payload: unknown, from: string) => void): () => void
  /** Who is on this topic right now, including us. */
  peers(): XpPlayer[]
  /** Called when somebody joins or leaves. Returns an unsubscribe. */
  onPeers(handler: (peers: XpPlayer[]) => void): () => void
  leave(): void
}

export interface XpNetwork {
  /**
   * How many updates a second a client should send.
   *
   * The host's number, not the engine's, because it is a property of the
   * transport and of the room: traffic grows with the *square* of the room, so
   * a 20-player room at 12 Hz is 4,800 messages a second leaving the server.
   * Interpolation on the receiving side is what makes movement look smooth, and
   * it does that just as well from eight samples as from twelve.
   */
  readonly sendHz: number
  /** Most players this host will admit to one instance. */
  readonly maxPlayers: number
  join(topic: string): Promise<XpSocket>
}

// ---------------------------------------------------------------------------
// What survives the tab closing
// ---------------------------------------------------------------------------

export interface XpPersistence {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
  /**
   * A durable outcome: a final score, a race time, who won.
   *
   * Separate from `put` because it is append-only and ordered, which is what a
   * result has to be - a score that can be overwritten is a score somebody can
   * overwrite.
   */
  append?(stream: string, type: string, data: unknown): Promise<void>
}

// ---------------------------------------------------------------------------
// Who decides, when the clients must not
// ---------------------------------------------------------------------------

/**
 * The answer to "did that count".
 *
 * Two shapes rather than a value, because *stored* and *agreed with* are
 * different answers and a call that returns one number cannot say which it
 * meant. See `docs/xp/server-authority.md` §4.1.
 */
export type XpVerdict<T = unknown> =
  | { ok: true; outcome: T }
  | { ok: false; why: XpRefusal; message: string }

/**
 * Why an ask did not become an outcome. Three, and they are not one message:
 *
 * - `refused` - the rules said no. Show why; do not retry.
 * - `lost` - no answer came back. The action is *unresolved*, not failed, and
 *   the client may ask again; what it must not do is draw it as done.
 * - `stale` - the round moved on. Re-read the view rather than argue with it.
 */
export type XpRefusal = 'refused' | 'lost' | 'stale'

/**
 * One authority, for the outcomes no client may decide.
 *
 * Named `arbiter` and not `server` on purpose: `server` is already one of the
 * three authority tiers a document declares, and two meanings for one word is
 * the collision this project has paid for once already.
 *
 * Deliberately two calls. Everything this tier does is either *ask for an
 * outcome* or *read what I am entitled to know*, and a port with a method per
 * game is a port that grows a method every time somebody writes a level.
 */
export interface XpArbiter {
  /**
   * Ask for an outcome, and be told whether it happened.
   *
   * Asynchronous with no exception: an outcome is a round trip and pretending
   * otherwise is what makes a result latch locally and then evaporate. The
   * caller shows it as pending until this resolves.
   */
  ask<T = unknown>(action: string, payload?: unknown): Promise<XpVerdict<T>>

  /**
   * What this client may know, redacted by whoever decides.
   *
   * Your hand in full and everybody else's as a count. It is a *reply to the
   * asker* and never a broadcast - `XpSocket` sends to the whole topic, so
   * there is no such thing as a private message on it.
   */
  view<T = unknown>(): Promise<T>

  /**
   * Take what this level allows out of somebody else's save.
   *
   * Its own call rather than an `ask`, and the reason is the *instance*: `ask`
   * and `view` are scoped to a room's topic, because an outcome is something
   * that happened between people who are in a room together. A visit has no
   * room. The person it takes from is usually not online, which is the whole
   * argument in docs/xp/server-authority.md §4.3, so routing it through `ask`
   * would mean passing an instance that means nothing.
   *
   * **It carries nothing, and that is the design rather than an omission.** Who
   * it takes from is decided server-side at random among everybody who can
   * spare it: a visitor who could name a target would name the same one, which
   * is the farming state.md §7.6 lists fairness rules to prevent. The verdict
   * says who it turned out to be.
   *
   * **Optional**, because a host can have an arbiter and no worlds to visit: the
   * memory host arbitrates a match in a test and has no store behind it. Absent
   * means a level's raid button says so rather than failing quietly.
   */
  visit?<T = unknown>(): Promise<XpVerdict<T>>
}

// ---------------------------------------------------------------------------
// The whole slot
// ---------------------------------------------------------------------------

/**
 * Something somebody said, as it reaches everybody else.
 *
 * `by` is the id, not the name: a roster already maps one to the other and a
 * line carrying a name is a line that is wrong the moment somebody renames
 * themselves. `at` is the host's clock so two clients order a conversation the
 * same way — a sender's clock is a sender's opinion.
 */
export interface XpLine {
  by: string
  text: string
  at: number
  /**
   * What the host knew this person was called, for the lines a roster cannot
   * reach.
   *
   * The rule above still holds and this does not weaken it: `by` is the truth,
   * a roster entry beats this whenever there is one, and a panel that preferred
   * this would be the panel that goes stale when somebody renames themselves.
   *
   * It exists because the roster does not cover the whole conversation. A host
   * that keeps history hands back lines written by people who are *not in the
   * level* - said an hour ago, said in the space while nobody was playing - and
   * there is no roster entry to map those at all. The choice was this field or
   * a panel that prints a uuid for every line older than the session.
   *
   * Optional because a host with no history has no such lines: `local` and the
   * memory host never set it, and neither should anything that only ever
   * carries what was said by somebody currently here.
   */
  name?: string
}

/**
 * Saying something, from inside a level.
 *
 * The fifth slot, and the whole design of docs/xp/backlog.md §7b: chat belongs
 * to the *host* rather than to the engine, because who should hear it is a
 * question about the product and not about the level.
 *
 * That placement answers three questions at once, each for a different reason:
 *
 *   - **Our app hands an XP the space's own chat**, so a message sent in a
 *     level is a message in the space rather than a second inbox nobody reads.
 *   - **Two tabs on a laptop get a channel and no history**, which is what
 *     trying a level out should have. A test that wrote to a database would be
 *     a level test that posts in the space.
 *   - **A host with none of it offers none**, and a document that needs chat is
 *     refused rather than opened with a panel that does nothing.
 *
 * ---------------------------------------------------------------------------
 * Emotes are not here, and that is the decision
 * ---------------------------------------------------------------------------
 * They were asked for in the same breath and they are a different kind of
 * thing. An emote is *ephemeral* — a face over a head for two seconds, worth
 * nothing a moment later — which is exactly `XpSocket`'s contract, and the
 * engine already has one. Chat is *durable*: it has an author, a time, and a
 * place it is kept.
 *
 * Putting an emote here would give it a history nobody wants and a write nobody
 * asked for; putting chat on the socket would make it as reliable as a position
 * update, which is to say not at all. §9's line is the same one: a socket is
 * for what is true *now*.
 */
export interface XpChat {
  /**
   * Say it. Resolves when the host has it, not when anybody has read it.
   *
   * Async because a host that keeps history writes it, and a caller that wants
   * to know whether their message survived the tab closing needs somewhere to
   * find out. A host with no history resolves immediately.
   */
  say(text: string): Promise<void>
  /** Returns an unsubscribe, like every other listener in this file. */
  on(handler: (line: XpLine) => void): () => void
  /**
   * What was said before this player arrived, when the host keeps any.
   *
   * Optional rather than empty: *"no history"* and *"an empty room"* are
   * different facts, and a level that opens on a blank panel because the host
   * does not keep history should be able to say so rather than implying nobody
   * has ever spoken here.
   */
  recent?(): Promise<XpLine[]>
}

export interface XpHost {
  identity: XpIdentity
  network: XpNetwork
  persistence?: XpPersistence
  /**
   * Offered only by a host that can keep a secret and change two things at
   * once. Optional, and a document that needs it says so - which is what stops
   * a game whose fairness depends on this running client-authoritatively on
   * somebody else's infrastructure and looking like it works.
   */
  arbiter?: XpArbiter
  /**
   * Offered by a host that has somewhere for a message to go. Absent is a level
   * where nobody can say anything, which is every level today.
   */
  chat?: XpChat
  /**
   * Seconds since the instance started, monotonic.
   *
   * Supplied rather than read from `performance.now()` so a test can drive a
   * whole match in a loop without waiting for one, and so a replay can be fed
   * recorded time. An engine that reads its own clock cannot be run faster than
   * real life, which makes every test about a timer a test that takes as long
   * as the timer.
   */
  now(): number
}

/** What the document's `backend.needs` may ask for. */
export const HOST_CAPABILITIES = [
  'identity',
  'network',
  'persistence',
  'arbiter',
  'chat',
] as const
export type HostCapability = (typeof HOST_CAPABILITIES)[number]

/**
 * Which of the asked-for capabilities this host cannot satisfy.
 *
 * Called before an XP loads. An empty list means go; anything in it is a clear
 * refusal naming what is missing, which is the difference between "this host
 * has no database" and a level that starts and then quietly loses every score.
 */
export function missingCapabilities(
  host: XpHost,
  needs: readonly HostCapability[],
): HostCapability[] {
  return needs.filter((need) => {
    switch (need) {
      case 'identity':
        return typeof host.identity?.current !== 'function'
      case 'network':
        return typeof host.network?.join !== 'function'
      case 'persistence':
        return typeof host.persistence?.get !== 'function'
      case 'arbiter':
        return typeof host.arbiter?.ask !== 'function'
      case 'chat':
        return typeof host.chat?.say !== 'function'
    }
  })
}

/**
 * What a need means to somebody deciding whether to open a level.
 *
 * The disclosure half of docs/xp/state.md §7.7, and it lives beside the
 * capability rather than in a React component for the reason `describeCapability`
 * does: the words are part of the contract, and a second place to phrase them is
 * a second place for them to drift from what the runtime actually enforces.
 *
 * Written from the player's side rather than the port's. "Somewhere to save" is
 * a sentence about the level; "persistence" is a field name, and a person
 * choosing what to play should not have to know ours.
 */
export const NEEDS_EN: Record<HostCapability, string> = {
  identity: 'Needs you signed in',
  network: 'Played with other people',
  persistence: 'Remembers what you do',
  arbiter: 'Keeps score on the server',
  chat: 'People can talk in it',
}

export function describeNeed(
  capability: HostCapability,
  /**
   * The words, in the reader's language, defaulted to English.
   *
   * Passed in rather than looked up: this package is imported by the runtime,
   * the editor and the store, and none of them should have to bring the app's
   * i18n tree along for one record. English stays here because English is the
   * contract - the sentences are part of what §7.7 promises - and a caller that
   * has a reader hands over what that reader speaks.
   */
  words: Record<HostCapability, string> = NEEDS_EN,
): string {
  return words[capability]
}

/**
 * The same question asked by a caller that has ports rather than a host.
 *
 * `missingCapabilities` wants an `XpHost`, and the runtime does not have one -
 * it composes a network, sometimes an arbiter, and passes them down separately.
 * Building a throwaway host object there so this function could be reused would
 * be inventing a shape to satisfy a signature.
 *
 * Kept beside its sibling rather than in the runtime because the *asymmetry* is
 * the thing worth having in one place and testing: a missing `need` refuses the
 * level, a missing `want` does not, and the two lists are never combined. A
 * caller that treated them alike would either refuse levels that should degrade
 * or lose every score in one that should not have opened.
 */
export function unsupported(
  asked: readonly HostCapability[] | undefined,
  offered: readonly HostCapability[],
): HostCapability[] {
  return (asked ?? []).filter((capability) => !offered.includes(capability))
}

/** Re-exported so a host can type a position without reaching into the engine. */
export type { Vec3 }

export {
  memoryArbiter,
  memoryHost,
  memoryNetwork,
  Refused,
  type MemoryArbiter,
  type MemoryHostOptions,
  type MemoryNetwork,
  type MemoryRuling,
} from './memory-host'
