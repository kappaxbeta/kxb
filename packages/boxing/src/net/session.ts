/**
 * `@kxb/boxing/net` - a fight, played over an `XpHost`.
 *
 * ---------------------------------------------------------------------------
 * This is the whole integration
 * ---------------------------------------------------------------------------
 * Everything else in this package is a boxing game that has never heard of
 * `@kxb/xp`. This file is the seam, and it is deliberately the only one: it
 * takes an `XpHost` - somebody's identity, somebody's transport, somebody's
 * clock - and drives `../rules/fight.ts` with it.
 *
 * That is what "XP is an SDK you integrate" means in practice. The game does
 * not extend the engine, is not a level in it, and is not loaded by it. It
 * imports the ports, satisfies nothing, and gets multiplayer, identity, a
 * clock, storage and a server authority in exchange - against our Supabase,
 * against two tabs on a laptop, or against a backend neither of us has seen.
 * Swapping `localHost()` for the app's realtime host changes nothing below this
 * comment.
 *
 * ---------------------------------------------------------------------------
 * All three of the SDK's authority tiers, doing three different jobs
 * ---------------------------------------------------------------------------
 * `docs/xp/creator.md` §9 fixes them, and a fighting game happens to need all
 * three - which is the reason this was worth building against the SDK rather
 * than beside it:
 *
 *   `self`     Where I am, what I am throwing, and **whether your punch hit
 *              me**. Sent as `STANCE` and `LANDED`. See the header of
 *              `../rules/fight.ts` for why the defender is the one who decides.
 *   `elected`  The round, the clock and the cards. The red corner owns them -
 *              lowest player id, the election with no messages in it.
 *   `server`   The result, once there is one. `XpArbiter.ask`, in
 *              `./arbiter.ts`, and the only thing here that is allowed to be
 *              slow.
 *
 * ---------------------------------------------------------------------------
 * What this is honest about
 * ---------------------------------------------------------------------------
 * There is no rollback and no input delay. A remote punch is drawn when its
 * `THREW` arrives, which on a real connection is a few tens of milliseconds
 * after it was thrown, so the defender is reacting to a punch that is already
 * slightly further along than it looks. At LAN and normal broadband latencies
 * that is inside the startup window of every punch in the table except the jab.
 * On a bad connection it is not, and the honest fix is rollback netcode rather
 * than a bigger buffer.
 */

import type { XpHost, XpPlayer, XpSocket } from '@kxb/xp/host'

import {
  CORNERS,
  MAX_HEALTH,
  MAX_STAMINA,
  NO_INTENT,
  cornerOf,
  fighter,
  newFight,
  opposite,
  stepFight,
  stopFight,
  type Corner,
  type Fight,
  type FightEvent,
  type Intent,
} from '../rules/fight'
import { MOVES, isPunch } from '../rules/moves'
import { staggers } from '../rules/contact'
import {
  LANDED,
  MATCH,
  STANCE,
  STOPPED,
  THREW,
  readLanded,
  readMatch,
  readStance,
  readStopped,
  readThrew,
  type Landed,
  type Match,
  type Stance,
  type Stopped,
} from './wire'

/** How often the owner tells the room what round it is. */
const MATCH_HZ = 4

/**
 * How long a corner stays ready after the last packet from it.
 *
 * Generously more than one stance period - `sendHz` is 8, so packets are 125ms
 * apart and this is twenty-four of them. It is a *liveness* check, not a lag
 * budget: dropping somebody mid-round because a few packets were late would
 * stop the fight for a hiccup, and a client that has really gone will fail this
 * within three seconds either way.
 */
const HEARD_FOR = 3

/**
 * How long a corner has been silent, so a host can tell a blip from a departure.
 *
 * Published because the two want different treatment and only the host can draw
 * either. A phone that drops a packet for a second and a phone that has been
 * put in a pocket are the same state to `connected()` - and covering the screen
 * for the first is worse than the gap it is reporting.
 */
export const SILENCE_UNKNOWN = Infinity

export interface BoxingSession {
  /** The match, mutated in place. Read it to draw; do not write to it. */
  readonly fight: Fight
  /** Which corner is at this keyboard. */
  readonly mine: Corner
  /** Whether this client owns the round clock. See the header. */
  readonly owner: boolean
  /**
   * The host's clock, in seconds.
   *
   * On the session rather than left to the caller because it is the clock every
   * `since` in the fight was written from, and a renderer that reached for
   * `performance.now()` instead would be animating against a second clock that
   * starts at a different moment. The symptom is a punch frozen a frame behind
   * the simulation deciding whether it landed.
   */
  clock(): number
  /** Everybody on the topic, us included. */
  peers(): XpPlayer[]
  /**
   * How many seconds since anything arrived from the other corner.
   *
   * `Infinity` before the first packet. Its use is a *host* one: a gap of half a
   * second is a network being a network, and covering the fight to say so is
   * worse than the gap. See `Waiting` in `../play/hud.tsx`, which waits several
   * times `HEARD_FOR` before it draws anything.
   */
  silence(): number
  /**
   * True once we have actually *heard from* the other corner.
   *
   * Renamed from `ready`, because a fighter now has a `ready` of their own and
   * one word for two ideas is a bug waiting to be written. This one is about
   * *their client running*; theirs is about a person pressing a button.
   *
   * Not "is somebody on the roster". The roster is one client's opinion and two
   * clients can hold different ones - which is not a hypothetical: a goodbye
   * from a replaced socket, a hello that crossed a remount, and one side has an
   * opponent while the other does not.
   *
   * That asymmetry is the worst failure this game has, because of who decides a
   * hit. The defender does. So the ready side can walk, feel the other body,
   * throw a hundred punches and land none of them - their opponent's client is
   * not running and nobody is there to say the punch arrived. It reads exactly
   * like broken collision, which is what it was reported as.
   *
   * Evidence fixes it by construction: readiness means *a packet arrived from
   * them recently*, and packets only flow from a client that is itself running.
   * The state cannot be one-sided, because the thing that makes me ready is the
   * thing that only happens when you are.
   */
  connected(): boolean
  /**
   * One frame. Hand it your own intent and the seconds since the last call;
   * it returns everything that happened, already sent.
   */
  step(intent: Intent, dt: number): FightEvent[]
  /**
   * Say you are ready, or take it back.
   *
   * Sends immediately rather than waiting for the stance clock. A lobby button
   * that took an eighth of a second to light up on the other screen is a button
   * people press twice.
   */
  say(ready: boolean): void
  /** Called for every event, including the ones that arrived from the other client. */
  on(handler: (event: FightEvent) => void): () => void
  leave(): void
}

export interface BoxingOptions {
  host: XpHost
  /** The room. Two clients on the same topic are two fighters. */
  topic: string
  /**
   * Play both corners locally.
   *
   * For a bot, a test, or two pads on one machine - `resolves` becomes both
   * corners and nothing is sent. Not the same as being alone on a topic: this
   * says *nobody else will ever author the other corner*, which is a different
   * fact and the one that decides who resolves contact.
   */
  solo?: boolean
  /**
   * The whole match's fighting time in seconds, as a host counts it.
   *
   * Absent is the game's own default. Cut into rounds by `roundsOf`, which also
   * clamps it - a number somebody typed into a wizard can be three seconds, and
   * three seconds each is not three short rounds, it is no game.
   */
  matchSeconds?: number | null
}

/**
 * Join a fight.
 *
 * Async because two of the ports are: `identity.current()` is a round trip on a
 * host with accounts, and `network.join()` is a subscription. Everything after
 * this resolves is synchronous, which is what a game loop needs.
 */
export async function joinBoxing(options: BoxingOptions): Promise<BoxingSession> {
  const { host, topic, solo = false, matchSeconds = null } = options

  const me = (await host.identity.current()) ?? {
    id: 'anonymous',
    name: 'Anonymous',
  }

  const socket: XpSocket | null = solo ? null : await host.network.join(topic)
  const listeners = new Set<(event: FightEvent) => void>()

  /**
   * Which corner is whose, decided by id and by nothing else.
   *
   * The same rule `@kxb/xp/owning` uses for a ball: lowest id first, re-run
   * whenever the roster changes. It costs no packets because both clients
   * already know both ids, and it cannot disagree because sorting two strings
   * is not a negotiation. The alternative - first to arrive takes red - needs a
   * message, and that message can be lost.
   */
  const cornersFor = (peers: XpPlayer[]): Record<Corner, XpPlayer> => {
    const everybody = [me, ...peers.filter((peer) => peer.id !== me.id)]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return {
      red: everybody[0] ?? me,
      blue: everybody[1] ?? { id: 'waiting', name: 'Waiting…' },
    }
  }

  let seats = cornersFor(socket?.peers() ?? [])
  let mine: Corner = seats.red.id === me.id ? 'red' : 'blue'

  const fight = newFight(
    fighter('red', seats.red.id, seats.red.name),
    fighter('blue', seats.blue.id, seats.blue.name),
    matchSeconds,
  )

  /** In solo the fight never waits; otherwise it waits for a second body. */
  let opponent: XpPlayer | null = solo ? seats[opposite(mine)] : null

  /**
   * Host-clock seconds when anything last arrived from the other corner.
   *
   * `-Infinity` rather than 0, because 0 is a real reading on a clock that
   * starts at zero - and "we heard from them at the very first instant" is
   * exactly the wrong default for a value whose whole job is to be evidence.
   */
  let heard = -Infinity

  const emit = (events: FightEvent[]) => {
    for (const event of events) for (const listener of listeners) listener(event)
  }

  // -------------------------------------------------------------------------
  // Taking the seats, and re-taking them when somebody joins or leaves
  // -------------------------------------------------------------------------

  const seat = (peers: XpPlayer[]) => {
    /**
     * A roster that has lost everybody is ignored once somebody was seated.
     *
     * Presence hiccups - see `connected` above - and re-seating from an empty
     * list would swap the corners underneath a running fight: `cornersFor([])`
     * puts *us* in red and a placeholder in blue, so both clients would decide
     * they were red and neither would resolve the other's punches.
     *
     * If they really have gone, `connected` says so within `HEARD_FOR` seconds
     * without anybody's corner moving.
     */
    if (peers.length === 0 && opponent !== null) return

    seats = cornersFor(peers)
    mine = seats.red.id === me.id ? 'red' : 'blue'
    opponent = peers.find((peer) => peer.id !== me.id) ?? null

    for (const corner of CORNERS) {
      fight[corner].id = seats[corner].id
      fight[corner].name = seats[corner].name
    }

    /**
     * Two fighters with the same name are told apart.
     *
     * Not a hypothetical: names come from a list of ten on this host, so a
     * collision is one fight in ten - and on a host with real accounts, two
     * people called Alex is one fight in rather fewer than that. Either way the
     * scoreboard becomes "Duke 100, Duke 100" and nobody can read which bar is
     * theirs, which is the one thing a HUD has to get right.
     *
     * The *blue* corner is the one marked, always, so the two clients agree
     * about which of them was renamed without exchanging a word about it - the
     * same no-messages reasoning the corners themselves are handed out by.
     */
    if (fight.red.name === fight.blue.name) {
      fight.blue.name = `${fight.blue.name} (blue)`
    }
  }

  /**
   * Seat from the roster that is already there, before listening for changes.
   *
   * Both halves are needed and the first one was missing. `onPeers` fires on a
   * *change*, and for whoever joins second there is no change to hear: they
   * arrive, the roster already has both names in it, and nothing ever calls the
   * handler. The symptom is the worst kind - the first client plays a normal
   * match and the second stands still forever, because `opponent` is null and
   * `step` refuses to run against an empty corner.
   */
  if (socket) {
    seat(socket.peers())
    socket.onPeers(seat)
  }

  // -------------------------------------------------------------------------
  // What arrives
  // -------------------------------------------------------------------------

  /**
   * Their whole fighter, as they last described it.
   *
   * Applied wholesale rather than merged - see the "whole picture" note in
   * ./wire. `since` is reconstructed from the age they sent against *our*
   * clock, which is the only way two unrelated `now()`s can agree about how far
   * into a punch somebody is.
   */
  const takeStance = (stance: Stance) => {
    if (stance.corner === mine) return
    heard = host.now()
    const them = fight[stance.corner]
    them.x = stance.x
    them.move = stance.move
    them.since = host.now() - stance.age
    them.health = stance.health
    them.stamina = stance.stamina
    them.ready = stance.ready
    them.character = stance.character
  }

  /**
   * They have started something, and we are hearing about it now.
   *
   * Set to begin *now* rather than backdated by the trip. Backdating is more
   * accurate and worse to play against: it would mean a punch whose startup is
   * partly already over on arrival, so a jab could become unreactable by
   * definition rather than by latency. Drawing it from the top costs the
   * attacker a few milliseconds of honesty and gives the defender the whole
   * window the frame data promises.
   */
  const takeThrew = (corner: Corner, move: Stance['move']) => {
    if (corner === mine) return
    heard = host.now()
    const them = fight[corner]
    them.move = move
    them.since = host.now()
    them.spent = false
    emit([{ type: 'threw', by: corner, move, at: host.now() }])
  }

  /**
   * Our punch reached them, and this is their verdict on it.
   *
   * We do not check it. That is the whole point of the tier - they are
   * authoritative over their own health, and a client that second-guessed the
   * answer would be a client that disagrees with the person being hit about
   * whether they were hit.
   */
  const takeLanded = (landed: Landed) => {
    if (landed.corner === mine) return
    heard = host.now()
    const them = fight[landed.corner]
    const us = fight[mine]

    them.health = landed.health
    them.stamina = landed.stamina

    // One punch, one answer, on this side too: without this our own punch stays
    // live and a second `LANDED` for the same swing would double the score.
    us.spent = true

    if (landed.contact.kind === 'parried') {
      us.move = 'stunned'
      us.since = host.now()
    } else if (staggers(landed.contact) && them.health > 0) {
      them.move = 'hurt'
      them.since = host.now()
    }

    if (landed.contact.kind === 'clean' || landed.contact.kind === 'broken') {
      us.dealt += landed.contact.damage
    } else if (landed.contact.kind === 'blocked') {
      us.dealt += landed.contact.damage
    }

    emit([{ type: 'contact', by: mine, on: landed.corner, move: landed.move, contact: landed.contact }])
  }

  /**
   * They have been knocked out, and only we can make that official.
   *
   * The other half of the seam described in `./wire`. A knockout is decided by
   * the fighter it happened to, and the *match* is ended by whoever owns the
   * clock - so when those are two different clients the finish has to travel,
   * and this is the end that acts on it. `stopFight` scores the round and sets
   * the verdict exactly as a local knockout would, and the `MATCH` sent on the
   * resulting `over` event is what tells the sender their own knockout counted.
   *
   * Two refusals, and they are the same one `takeStance` and `takeLanded` make.
   * A packet about *our* corner is not theirs to send - we are authoritative
   * over our own body and would otherwise accept being knocked out by anybody
   * who asked. And a follower has no business ending a match at all: if we are
   * not the owner this is somebody else's job, and doing it anyway would end
   * the fight locally and then have it un-ended by the next `MATCH`, which is
   * the exact failure this message exists to fix.
   */
  const takeStopped = (stopped: Stopped) => {
    heard = host.now()
    if (stopped.corner === mine) return
    if (!owner()) return
    const events = stopFight(fight, opposite(stopped.corner), stopped.how, host.now())
    if (events.length === 0) return
    emit(events)
    sendMatch()
  }

  /** The round and the clock, from whoever owns them. */
  const takeMatch = (match: Match) => {
    // Evidence even when we are the owner and will ignore the contents: what
    // makes this a heartbeat is that it *arrived*, not what it said.
    heard = host.now()
    if (owner()) return
    const rang = match.round !== fight.round || match.phase !== fight.phase
    fight.phase = match.phase
    fight.round = match.round
    fight.clock = match.clock
    fight.cards = match.cards
    fight.verdict = match.verdict

    // A new round on somebody else's say-so still has to reset our own body,
    // because the owner's `MATCH` deliberately carries no fighters.
    if (rang && (match.phase === 'between' || match.phase === 'fighting')) {
      const us = fight[mine]
      us.move = 'idle'
      us.since = host.now()
      us.downsThisRound = 0
      us.dealt = 0
      us.spent = false
      if (match.phase === 'between') {
        us.health = Math.min(MAX_HEALTH, us.health + 45)
        us.stamina = MAX_STAMINA
        us.x = mine === 'red' ? -1.5 : 1.5
      }
    }
  }

  socket?.on(STANCE, (payload) => {
    const stance = readStance(payload)
    if (stance) takeStance(stance)
  })
  socket?.on(THREW, (payload) => {
    const threw = readThrew(payload)
    if (threw) takeThrew(threw.corner, threw.move)
  })
  socket?.on(LANDED, (payload) => {
    const landed = readLanded(payload)
    if (landed) takeLanded(landed)
  })
  socket?.on(MATCH, (payload) => {
    const match = readMatch(payload)
    if (match) takeMatch(match)
  })
  socket?.on(STOPPED, (payload) => {
    const stopped = readStopped(payload)
    if (stopped) takeStopped(stopped)
  })

  // -------------------------------------------------------------------------
  // What leaves
  // -------------------------------------------------------------------------

  const owner = () => solo || mine === 'red'

  /**
   * Heard from recently. Nothing else.
   *
   * ---------------------------------------------------------------------------
   * Presence is not evidence, and requiring it lost people
   * ---------------------------------------------------------------------------
   * This used to be `opponent !== null && heard recently` - the roster *and* a
   * packet. The roster half looked like belt and braces and was a way to lose
   * somebody: presence on a phone is not steady, and a sync that briefly comes
   * back empty emptied `opponent`, which made a fighter who was still sending
   * eight packets a second read as gone. *"He was showing briefly and then I
   * couldn't see him again."*
   *
   * A packet from the other corner is strictly better proof than a roster
   * entry: it means their client is running *and* reaching us, which is what
   * this question is actually asking. And it needs no floor of its own -
   * `heard` starts at `-Infinity`, so nobody is connected until somebody has
   * genuinely spoken.
   */
  const connected = () => solo || host.now() - heard <= HEARD_FOR

  let nextStance = 0
  let nextMatch = 0

  const sendStance = (now: number) => {
    const us = fight[mine]
    socket?.send(STANCE, {
      corner: mine,
      x: us.x,
      move: us.move,
      // Clamped at zero because `age` is validated as non-negative on the way
      // in, and a frame in which `since` is a hair ahead of `now` is a dropped
      // packet rather than a crash.
      age: Math.max(0, now - us.since),
      health: us.health,
      stamina: us.stamina,
      ready: us.ready,
      character: us.character,
    })
  }

  const sendMatch = () => {
    socket?.send(MATCH, {
      phase: fight.phase,
      round: fight.round,
      clock: fight.clock,
      cards: fight.cards,
      verdict: fight.verdict,
    })
  }

  // -------------------------------------------------------------------------
  // The frame
  // -------------------------------------------------------------------------

  const step = (intent: Intent, dt: number): FightEvent[] => {
    const now = host.now()

    /**
     * The stance goes out whether or not there is a fight yet, and that is
     * load-bearing rather than wasteful.
     *
     * It is the heartbeat `ready` is evidence of. An earlier version returned
     * before this line when nobody was there, which is a deadlock with a clean
     * explanation: I am not ready so I send nothing, so you never hear from me,
     * so you are not ready either, so you send nothing. Two clients sitting in
     * the same room waiting for each other to speak first.
     */
    if (now >= nextStance) {
      nextStance = now + 1 / (host.network.sendHz || 8)
      sendStance(now)
    }

    /**
     * The round and the clock go out too, whether or not anybody is answering.
     *
     * Same argument as the stance above and a second one on top. A client that
     * has just come back - a tab that was hidden, a connection that dropped -
     * has a clock frozen at whatever it was when it stopped stepping, and the
     * owner's is the only correct one. If the owner only broadcast while it
     * considered itself connected, the first thing a returning client would
     * hear is nothing, and the two clocks would stay ten seconds apart until
     * something else happened to move them.
     *
     * Sending it unconditionally means a reconnection *is* the resync: the next
     * `MATCH` lands within a quarter of a second and the follower takes it.
     */
    if (owner() && now >= nextMatch) {
      nextMatch = now + 1 / MATCH_HZ
      sendMatch()
    }

    // Nobody to fight yet. The clock does not start against an empty corner -
    // a round that ticked away while you waited for a friend would be a round
    // you lost by loading first.
    if (!connected()) return []

    const events = stepFight({
      fight,
      intents: {
        [mine]: intent,
        [opposite(mine)]: NO_INTENT,
      } as Record<Corner, Intent>,
      dt,
      now,
      // The netcode, in one expression. See ../rules/fight.ts.
      resolves: solo ? CORNERS : [mine],
    })

    for (const event of events) {
      // A punch has to leave immediately - the whole move is shorter than one
      // tick of the stance clock.
      if (event.type === 'threw' && event.by === mine) {
        socket?.send(THREW, { corner: mine, move: event.move })
      }

      // We were hit. Our verdict, and it leaves now for the same reason.
      if (event.type === 'contact' && event.on === mine) {
        const us = fight[mine]
        socket?.send(LANDED, {
          corner: mine,
          move: event.move,
          contact: event.contact,
          health: us.health,
          stamina: us.stamina,
        })
      }

      // The bell and the result are the owner's, and they must not wait for the
      // next scheduled `MATCH`: a round that ends 250ms late on the other screen
      // is a punch that landed after the bell.
      if (owner() && (event.type === 'bell' || event.type === 'over')) sendMatch()

      /**
       * We have been stopped, and we do not own the match. Say so.
       *
       * The one thing a follower is allowed to announce about the *result*, and
       * only about itself. `stop` is reached from `count`, which runs on the
       * client whose health bar it is - so on a knockout suffered here this is
       * the only client in the room that knows, and until this line it stayed
       * that way: the fight ended on this screen and carried on for the other
       * one, then the owner's next `MATCH` put this screen back into `fighting`
       * as though nothing had happened.
       *
       * Restricted to `ko` and `tko` because they are the two a fighter is
       * authoritative over. A decision is the cards, the cards are the owner's,
       * and a follower whose local clock happened to run out first must not be
       * able to declare the match a draw.
       */
      if (
        !owner() &&
        event.type === 'over' &&
        (event.verdict.how === 'ko' || event.verdict.how === 'tko') &&
        event.verdict.winner === opposite(mine)
      ) {
        socket?.send(STOPPED, { corner: mine, how: event.verdict.how })
      }
    }

    emit(events)
    return events
  }

  return {
    fight,
    get mine() {
      return mine
    },
    get owner() {
      return owner()
    },
    /**
     * Us and everybody else, once.
     *
     * `XpSocket.peers` is documented as including us and neither host that
     * ships with the SDK actually does, so this adds `me` and then removes the
     * duplicate rather than trusting either reading.
     */
    clock: () => host.now(),
    peers: () =>
      socket
        ? [me, ...socket.peers().filter((peer) => peer.id !== me.id)]
        : [me],
    connected,
    silence: () => (heard === -Infinity ? SILENCE_UNKNOWN : host.now() - heard),
    say(ready: boolean) {
      const us = fight[mine]
      if (us.ready === ready) return
      us.ready = ready

      /**
       * In solo, saying yes says it for both.
       *
       * `solo` means *nobody else will ever author the other corner* - a bot,
       * a test, two pads on one machine - so waiting for that corner to consent
       * is waiting for a person who is not coming. It is the same reasoning that
       * makes `resolves` both corners in solo, one phase earlier.
       */
      if (solo) fight[opposite(mine)].ready = ready

      sendStance(host.now())
    },
    step,
    on(handler) {
      listeners.add(handler)
      return () => void listeners.delete(handler)
    },
    leave() {
      socket?.leave()
      listeners.clear()
    },
  }
}

/** Re-exported so a caller can name a move without a second import. */
export { MOVES, isPunch, cornerOf }
