/**
 * `@kxb/maumau/arbiter` - the only thing at this table allowed to see a hand.
 *
 * ---------------------------------------------------------------------------
 * Why this game is authoritative and boxing is not
 * ---------------------------------------------------------------------------
 * `@kxb/boxing` gives damage to the *defender* and says why: a punch landing on
 * me is a fact about my health, and the alternative loses to lag in a way
 * players never forgive. That works because being wrong about a boxing match is
 * visible and self-correcting - a fighter a few centimetres out is snapped
 * straight by the next packet.
 *
 * Nothing here is either. **A hand is a secret**, and a secret cannot be shared
 * between the clients that are trying not to know it. There is no version of
 * this game in which the deck lives on somebody's machine and the game is still
 * worth playing: whoever holds it can read every hand, and a client that could
 * be trusted not to look is a client that did not need the secret kept.
 *
 * So the whole of `../rules/table.ts` runs *once*, somewhere no player can
 * reach, and every client is handed back the redaction in `Seen` - your cards
 * in full and everybody else's as a number. `docs/xp/server-authority.md` §4.1
 * is written around exactly this sentence, and this is the first game in the
 * project that needs all of it.
 *
 * ---------------------------------------------------------------------------
 * The rules travel with the game, which is why they are here
 * ---------------------------------------------------------------------------
 * `boxingArbiter` establishes the pattern and the argument holds harder here: a
 * game's rules living in the *host* means a second host implements different
 * ones. What is below teaches a `MemoryArbiter` the whole of Mau-Mau, so four
 * `memoryHost`s in a `bun test` are four players who cannot decide anything for
 * themselves - the same property the real authority has, expressed in a `Map`
 * and provable in microseconds.
 *
 * The real one is a database function, because the requirement is a *lock*: two
 * players pressing a card in the same tick both read the same turn, and only
 * one of them may have it. See
 * `supabase/migrations/20261228000000_a_hand_is_several_secrets_that_outlive_the_deal.sql`,
 * which implements the same rules against the same state shape.
 *
 * **The two are kept together by their sentences.** Every refusal in
 * `../rules/table.ts` appears character-for-character in that migration,
 * because those strings are also the keys `../play/words.ts` translates and
 * `words.test.ts` reads the TypeScript source to check. A rule changed on one
 * side and not the other shows up as a player being shown English in a German
 * game - which is a poor alarm, and is the honest state of a two-implementation
 * design. The database is the one that decides.
 *
 * ---------------------------------------------------------------------------
 * The shuffle is the one thing that is not in the rules package
 * ---------------------------------------------------------------------------
 * `../rules/cards.ts` builds a pack in a fixed order and refuses to shuffle it,
 * and `../rules/table.ts` takes its one shuffle as an argument. Both of those
 * point here, and the reason is the sentence
 * `20261012000000_xp_arbiter_secrets.sql` already had to write once:
 *
 * > `world.random` is `hash(seed, tick, index)` and every client holds the
 * > seed. Public agreement and secrecy are opposite requirements and they need
 * > opposite sources.
 *
 * A deal from the seeded stream is a deal every player at the table can compute
 * before their cards have finished sliding across the felt. The shuffle below
 * is the platform's own randomness and nothing else may be substituted for it,
 * including in a test - which is why the test passes a *stacked pack* rather
 * than a fixed seed.
 */

import type { XpHost, XpPlayer, XpVerdict } from '@kxb/xp/host'
import { Refused, type MemoryArbiter, type MemoryRuling } from '@kxb/xp/host'

import { deckOf, readCard, readSuit, type Card } from '../rules/cards'
import { MAX_PLAYERS, MIN_PLAYERS, readHouse, sameHouse, type House } from '../rules/house'
import { apply, deal, legal, seenBy, type Move, type Seen, type Table } from '../rules/table'

/**
 * The four things a client may ask for.
 *
 * Prefixed, because `xp_arbitrate` is one function for every game in the
 * deployment and `deal` is already taken - by the secrets migration, for a
 * different kind of deal entirely. An unprefixed collision here would be one
 * game silently answering another game's ask.
 */
export const SIT = 'maumau:sit'
export const READY = 'maumau:ready'
export const DEAL = 'maumau:deal'
export const MOVE = 'maumau:move'
export const LEAVE = 'maumau:leave'

export const ACTIONS = [SIT, READY, DEAL, MOVE, LEAVE] as const

/** Where the whole table lives inside the arbiter's state. */
export const KEY = 'maumau'

/**
 * Who is sitting down, before anybody has been dealt anything.
 *
 * Separate from `Table.seats` because a table exists before a deal does: people
 * arrive one at a time, the house is agreed by whoever asks first, and none of
 * that is a hand of cards. `deal` turns this into a `Table`, and from then on
 * the seats are the table's.
 */
export interface Sitting {
  seats: string[]
  /**
   * Who has said they are looking at the screen.
   *
   * Separate from `seats` because the two answer different questions and change
   * at different moments: you are seated by *arriving*, which the room decided,
   * and you are ready because you said so. A seat that also meant ready would
   * deal a hand to a tab that is still loading - and a hand is secret, so
   * nobody can glance over and tell you what you missed.
   *
   * Cleared by every deal. Ready is about *this* hand, and a table that
   * remembered it from the last one would deal the next before anybody had
   * looked up.
   */
  ready: string[]
  house: House
  /** Null until the first deal. The hand in progress, or the last one played. */
  table: Table | null
}

/**
 * What comes back from a move.
 *
 * **Nothing secret is in it, including to the person who asked.** A verdict is
 * an *outcome*, and the temptation is to return the card that was drawn - it is
 * the asker's own card, after all. That is how a secret leaks: the outcome is
 * the natural thing to log, to broadcast on the socket so everybody's animation
 * plays, and to put in an error report. The drawn card reaches its owner the
 * one way anything secret does, as a reply to their own `view`.
 */
export interface Outcome {
  /** What the table looks like now, to everybody. Never a hand. */
  turn: string | null
  phase: 'waiting' | 'playing' | 'over'
  /** How many at the table have said ready, and how many are at it. */
  ready: number
  seats: number
  winner: string | null
  /** A revision, so a client can tell a fresh view from a stale one. */
  at: number
}

// ---------------------------------------------------------------------------
// Reading what was asked
// ---------------------------------------------------------------------------

/**
 * A move, from a payload that arrived over the wire.
 *
 * Every branch is exhaustive about its own fields rather than passing the
 * object through, which is the rule `@kxb/boxing/wire` states and the reason it
 * states it: a `wish` riding along on a `draw` is harmless until the day
 * somebody reads one, and a `card` that is `{toString}` instead of a string is
 * an `includes` that never matches and a turn that can never be taken.
 */
export function readMove(payload: unknown): Move | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>

  switch (wire.kind) {
    case 'play': {
      const card = readCard(wire.card)
      if (!card) return null
      const wish = readSuit(wire.wish)
      return {
        kind: 'play',
        card,
        ...(wish ? { wish } : {}),
        ...(wire.mau === true ? { mau: true as const } : {}),
      }
    }
    case 'draw':
      return { kind: 'draw' }
    case 'mau':
      return { kind: 'mau' }
    case 'catch':
      return typeof wire.who === 'string' && wire.who.length > 0
        ? { kind: 'catch', who: wire.who }
        : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// The rules, taught to an arbiter
// ---------------------------------------------------------------------------

/**
 * A shuffle, from whatever randomness the caller has.
 *
 * Fisher-Yates, written out rather than a `sort(() => Math.random() - 0.5)`,
 * which is not a shuffle: a comparator that answers inconsistently gives a
 * distribution with visible bias, and the bias in a card game is somebody's
 * hand.
 */
export function shuffled(cards: readonly Card[], random: () => number): Card[] {
  const pack = [...cards]
  for (let at = pack.length - 1; at > 0; at--) {
    const swap = Math.floor(random() * (at + 1))
    ;[pack[at], pack[swap]] = [pack[swap]!, pack[at]!]
  }
  return pack
}

const sittingOf = (state: Map<string, unknown>): Sitting | undefined =>
  state.get(KEY) as Sitting | undefined

const outcomeOf = (sitting: Sitting, at: number): Outcome => ({
  turn: sitting.table?.seats[sitting.table.turn] ?? null,
  phase: sitting.table ? sitting.table.phase : 'waiting',
  ready: sitting.ready.length,
  seats: sitting.seats.length,
  winner: sitting.table?.winner ?? null,
  at,
})

/**
 * Is the table ready to be dealt to?
 *
 * Everybody, not a majority and not a quorum. A card game with a player who is
 * not looking is not a game that is two thirds fine - it is a game with a seat
 * that times out every turn, and at two players that is all of them.
 */
export const tableReady = (sitting: Sitting): boolean =>
  sitting.seats.length >= MIN_PLAYERS &&
  sitting.seats.every((seat) => sitting.ready.includes(seat))

/**
 * Teach a `memoryArbiter` the whole of Mau-Mau.
 *
 * `random` is injected for the same reason `apply`'s shuffle is: this function
 * is the reference implementation *and* the thing tests run, and a test that
 * cannot stack the deck can only assert that something legal happened. The
 * default is the platform's - see the header for why it must never be the
 * seeded stream.
 */
export function maumauArbiter(
  arbiter: MemoryArbiter,
  random: () => number = Math.random,
): MemoryArbiter {
  /** A counter, so `Outcome.at` moves whether or not anything visible did. */
  let revision = 0

  const write = (ruling: MemoryRuling, sitting: Sitting): Outcome => {
    revision += 1
    ruling.state.set(KEY, sitting)
    return outcomeOf(sitting, revision)
  }

  return arbiter
    .decides(SIT, (ruling: MemoryRuling): Outcome => {
      const me = ruling.by.id
      const existing = sittingOf(ruling.state)

      /**
       * The house is pinned by whoever sits down first, and the second person
       * to name a different one is refused by name.
       *
       * The same shape `boxing`'s `join` uses for hp and damage, and for the
       * same reason: a second player quietly playing under the first player's
       * rules is a game where somebody's sevens do not stack and nobody is told.
       */
      /**
       * Read against the *smallest* table, not the largest.
       *
       * `readHouse` clamps the hand to what the pack can deal, and how many
       * people will turn up is not known when the first one sits down. Clamping
       * to `MAX_PLAYERS` here would settle every table at the five-seat cap -
       * so two people who agreed on ten cards each would silently get five, for
       * three players who never arrived.
       *
       * `MIN_PLAYERS` keeps the number the table actually asked for. `DEAL`
       * re-reads it against the seats that did turn up, which is the moment
       * that number is knowable, and can only shrink it.
       */
      const asked = readHouse(ruling.payload, MIN_PLAYERS)
      if (existing && !sameHouse(existing.house, asked)) {
        throw new Refused('this table was opened with different rules')
      }

      const sitting: Sitting = existing ?? { seats: [], ready: [], house: asked, table: null }
      if (sitting.seats.includes(me)) return outcomeOf(sitting, revision)

      /**
       * Four, and it is a hard number rather than a suggestion.
       *
       * Not because the rules break at five - they do not - but because the
       * pack does: `handCap` is derived from thirty-two cards and a fifth seat
       * makes a hand of five out of a deal that has to leave a pile behind.
       * Refusing at the door is a sentence; discovering it at the deal is a
       * table that will not start and does not say why.
       */
      if (sitting.seats.length >= MAX_PLAYERS) throw new Refused('this table is full')
      /**
       * ...and nobody sits down into a hand in progress.
       *
       * A seat added mid-hand would change what `direction` means and whose
       * turn is next, halfway through somebody's go. They wait for the deal,
       * which is what happens at a real table.
       */
      if (sitting.table && sitting.table.phase === 'playing') {
        throw new Refused('wait for this hand to finish')
      }

      return write(ruling, { ...sitting, seats: [...sitting.seats, me] })
    })

    /**
     * "I am looking at the screen."
     *
     * A toggle rather than a one-way switch, because somebody who said it and
     * then had to answer the door should be able to take it back before the
     * cards are down. Once they are down it means nothing and is cleared.
     */
    .decides(READY, (ruling: MemoryRuling): Outcome => {
      const me = ruling.by.id
      const sitting = sittingOf(ruling.state)
      if (!sitting) throw new Refused('there is no table')
      if (!sitting.seats.includes(me)) throw new Refused('you are not at this table')
      if (sitting.table?.phase === 'playing') throw new Refused('this hand is not finished')

      const want = ruling.payload === undefined || (ruling.payload as { ready?: unknown })?.ready !== false
      const ready = sitting.ready.filter((seat) => seat !== me)
      if (want) ready.push(me)

      return write(ruling, { ...sitting, ready })
    })

    .decides(LEAVE, (ruling: MemoryRuling): Outcome => {
      const me = ruling.by.id
      const sitting = sittingOf(ruling.state)
      if (!sitting) throw new Refused('there is no table')
      if (!sitting.seats.includes(me)) return outcomeOf(sitting, revision)

      const seats = sitting.seats.filter((seat) => seat !== me)
      const ready = sitting.ready.filter((seat) => seat !== me)
      /**
       * Standing up mid-hand ends the hand rather than repacking the table.
       *
       * The alternative is to remove one seat from a `Table` that has a turn
       * index into it, a direction round it, and a debt owed to whoever is
       * next - and every version of that is a rule nobody agreed to about what
       * happens to the cards somebody walked off with. Ending the hand is
       * honest and is what the other players can see happening.
       */
      const table = sitting.table?.phase === 'playing' ? null : sitting.table
      return write(ruling, { ...sitting, seats, ready, table })
    })

    .decides(DEAL, (ruling: MemoryRuling): Outcome => {
      const sitting = sittingOf(ruling.state)
      if (!sitting) throw new Refused('there is no table')
      if (!sitting.seats.includes(ruling.by.id)) throw new Refused('you are not at this table')
      if (sitting.seats.length < MIN_PLAYERS) throw new Refused('a table needs two')
      if (sitting.table?.phase === 'playing') throw new Refused('this hand is not finished')
      /**
       * Everybody has to have said so.
       *
       * Checked here rather than only in the client, because the deal is the
       * one act that cannot be taken back: the cards are out, they are secret,
       * and a player who was still loading has already lost a turn.
       */
      if (!tableReady(sitting)) throw new Refused('not everybody is ready')

      /**
       * The house is re-read against the seats that actually turned up.
       *
       * `readHouse` clamps the hand to what the pack can deal, and how many are
       * playing is not known when the first person sits down. Two players who
       * agreed on ten cards each and were then joined by two more get six, and
       * the alternative is a deal that leaves nothing to draw from.
       */
      const house = readHouse(sitting.house, sitting.seats.length)

      const table = deal(
        sitting.seats,
        shuffled(deckOf(house.deck), random),
        house,
        sitting.table?.wins ?? {},
      )
      // Ready is about the hand that is starting, so it is spent by starting it.
      return write(ruling, { ...sitting, house, ready: [], table })
    })

    .decides(MOVE, (ruling: MemoryRuling): Outcome => {
      const sitting = sittingOf(ruling.state)
      if (!sitting?.table) throw new Refused('nothing has been dealt')

      const move = readMove(ruling.payload)
      if (!move) throw new Refused('that is not a move')

      /**
       * Who is moving comes from `ruling.by`, never from the payload.
       *
       * The one rule that makes every other rule in this file mean anything: a
       * client that could name the seat it is playing from could play out of
       * somebody else's hand, and `legal` would agree with it because the cards
       * really are there.
       */
      const seat = ruling.by.id
      const refusal = legal(sitting.table, seat, move)
      if (refusal) throw new Refused(refusal)

      const table = apply(sitting.table, seat, move, (cards) => shuffled(cards, random))
      return write(ruling, { ...sitting, table })
    })

    /**
     * ...and what each of them may then read back.
     *
     * The redaction is `seenBy`, which is in the rules package rather than
     * here, so the client renders from the same type the authority computed and
     * there is no second definition of "what may I know" to drift.
     */
    .shows((state: Map<string, unknown>, to: XpPlayer) => {
      const sitting = sittingOf(state)
      const watched: Watched = sitting
        ? {
            seats: [...sitting.seats],
            ready: [...sitting.ready],
            house: sitting.house,
            seen: sitting.table ? seenBy(sitting.table, to.id) : null,
            me: to.id,
          }
        : { seats: [], ready: [], house: readHouse(null), seen: null, me: to.id }

      /**
       * Under a `maumau` key, and not at the top level.
       *
       * Because the real `xp_arbiter_view` cannot do anything else: one
       * instance's row is shared with every other game the platform runs, so
       * that function returns scores, lives, votes and turns alongside this,
       * and a card table at the top level would collide with all of them.
       *
       * Matching it here rather than papering over the difference in `watch` is
       * the point - the two implementations of this authority should be
       * swappable, and a shape that differs between them is a shape that gets
       * one of them wrong.
       */
      return { [KEY]: watched }
    })
}

/**
 * What one client gets back from `view`.
 *
 * `seats` and `house` are outside `seen` because they outlive a hand: people are
 * sat down before anything is dealt, and a lobby that could not be drawn until
 * the first deal would be a lobby nobody could join from.
 */
export interface Watched {
  seats: string[]
  /** Who at the table has said they are ready. Public, like the seats. */
  ready: string[]
  house: House
  /** The hand in progress, from this client's seat. Null before the first deal. */
  seen: Seen | null
  me: string
}

// ---------------------------------------------------------------------------
// The client's half
// ---------------------------------------------------------------------------

/**
 * Ask for something, from a host that may not have an authority at all.
 *
 * Unlike `boxing`'s `reportFight`, a missing arbiter here is **fatal and says
 * so**, rather than degrading to a game that plays without a record. Boxing can
 * be played between two tabs with nowhere to write the result down, because the
 * fight itself is decided between the two clients. This game *is* the arbiter:
 * with no authority there is nobody to hold the deck, and pretending otherwise
 * would mean dealing on a client, which is the one thing the whole design is
 * arranged to prevent.
 *
 * That refusal reaches the player as a sentence before anything loads, because
 * the registry declares `arbiter` in `needs` - see
 * `src/app/xp/_runtime/games/registry.tsx`. This is the floor under it.
 */
export async function askTable<T = Outcome>(
  host: XpHost,
  action: string,
  payload?: unknown,
): Promise<XpVerdict<T>> {
  if (!host.arbiter) {
    return { ok: false, why: 'refused', message: 'this table has no dealer' }
  }
  return host.arbiter.ask<T>(action, payload)
}

/**
 * ...and read back what this client is entitled to see.
 *
 * Reaches into `maumau` on the reply, because the view belongs to the whole
 * instance rather than to this game - see `shows` above.
 *
 * ---------------------------------------------------------------------------
 * An empty table is not a missing answer
 * ---------------------------------------------------------------------------
 * The distinction this function exists to make, and it is the bug it was
 * written wrong for once. `xp_arbiter_view` returns the whole instance and
 * `maumau_seen` gives a JSON **null** for an instance nobody has sat down at -
 * which is the correct answer and is what every client sees before the first
 * `sit`.
 *
 * Returning `null` for that made "the authority has not answered yet" and
 * "the authority says there is no table yet" the same value, and `./play`
 * draws the first of those as *Asking the dealer…*. So a fresh room sat on
 * that sentence for ever: the only way out of it was to sit down, and the
 * button to sit down was behind the view.
 *
 * `null` now means one thing only - **there is no authority to ask** - and an
 * arbiter that answered always produces a `Watched`, empty if that is the
 * truth. The memory arbiter has always done this; this is the real one being
 * made to agree.
 */
export async function watch(host: XpHost): Promise<Watched | null> {
  if (!host.arbiter) return null

  const view = await host.arbiter.view<Record<string, unknown>>()
  const mine = view?.[KEY]
  if (mine && typeof mine === 'object') return mine as Watched

  /**
   * Nobody has sat down. Who *we* are still comes from the authority.
   *
   * `xp_arbiter_view` puts the caller's own id on the reply as `me`, read from
   * `auth.uid()` - so even an empty table knows who is looking at it, and the
   * lobby can tell "you have not sat down" from "nobody has".
   */
  const me = typeof view?.me === 'string' ? view.me : ''
  return { seats: [], ready: [], house: readHouse(null), seen: null, me }
}
