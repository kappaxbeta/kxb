/**
 * Which side somebody is on.
 *
 * The gap `stepMatch` left on purpose. It decides *when* a match is over and
 * *why*, and not *who won*, because without sides there is no second answer to
 * give - `Mark.team` has existed since the format did and the editor has been
 * writing it, and nothing has ever read it.
 *
 * ---------------------------------------------------------------------------
 * Derived from identity, not handed out
 * ---------------------------------------------------------------------------
 * The same argument ./spawn makes, and it pays twice as much here.
 *
 * The obvious design assigns sides from a roster - count who is present, put the
 * next arrival on the smaller side. That needs the roster, and the roster is not
 * there when it is needed: presence arrives over a websocket some milliseconds
 * after the world is built, and a player's side decides which spawn mark they
 * arrive at on the first frame. Assigning late means spawning somebody in the
 * middle and then teleporting them to their own end once the channel connects.
 *
 * The second payment is the one that makes this worth it: **a side derived from
 * an id needs nothing on the wire.** `Together` already knows every peer's id -
 * presence gives it that - so every client can work out every other client's
 * side without a single extra byte at 8 Hz, and without the two of them ever
 * disagreeing. A transmitted side would be a fact that can arrive late, arrive
 * wrong, or not arrive.
 *
 * ---------------------------------------------------------------------------
 * What this is not, and the word it refuses to use
 * ---------------------------------------------------------------------------
 * It is **not balanced**, and it must not be called that. A hash is even across
 * many rooms and says nothing about any one of them: four people can land three
 * against one, and telling somebody that is balanced because the expectation is
 * two is the kind of correctness nobody who is losing three-on-one cares about.
 *
 * Guaranteed balance needs a roster, which means it needs somebody authoritative
 * to hold it - that is `assign: 'balanced'` when a host can supply one, and it
 * is a different mechanism rather than a tuning of this one. A host that has
 * already chosen sides passes them in, and then none of this runs.
 */

import { DEFAULT_ASSIGN, teamsOf, type Mark, type XpRules } from '@kxb/xp'

/**
 * `teamsOf` and `teamColour` moved into `@kxb/xp`.
 *
 * They were here first, because the runtime was the first thing that needed
 * them. They belong in the package because the *editor* needs the same two
 * answers - to grey out the assignment picker on a document with no sides, and
 * to colour the team field on a mark form - and an editor panel reaching into
 * `_runtime` for a rule would be the wrong direction entirely. Two copies of
 * "what counts as a side" and "what colour is red" is how the ring under a
 * player comes to disagree with the marker on their own spawn.
 */
export { teamColour, teamsOf } from '@kxb/xp'

/**
 * A number from an id.
 *
 * FNV-1a, the same one ./spawn uses. Deliberately *not* imported from there and
 * deliberately seeded differently below: a player's spawn slot and their side
 * would otherwise be correlated, so everybody on red would stand on the same
 * square of their own grid and the two features would look broken together.
 */
function hash(id: string): number {
  let value = 0x811c9dc5
  // A different seed from the spawn slot's, so the two are independent.
  value ^= 0x5bf03635
  for (let i = 0; i < id.length; i++) {
    value ^= id.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/**
 * Which side this player is on, or undefined when the level has no sides.
 *
 * `given` is what a host has already decided - the battle lobby picks sides
 * before anybody loads the document, and when it has, none of the derivation
 * runs. Honoured even when it names a side the document does not have, because
 * the alternative is silently overriding a host that knows something we do not,
 * and `spawnFor` already falls back sensibly for a side with no mark of its own.
 *
 * Undefined for a document with no team spawns, which is most of them. That is
 * not a degraded case - it is a level with no sides, and `arrivalSpot` puts a
 * player with no side on the document's own spawn.
 */
export function sideOf(
  marks: readonly Mark[],
  who: {
    id?: string
    given?: string
    /**
     * The seat this player took, for `assign: 'claim'` and nothing else.
     *
     * Not derived and not guessable: it is what the table granted when they
     * asked for it, so it arrives late by definition - a client with none has
     * not sat down yet, which is a real state at a board game and reads as no
     * side at all.
     */
    seat?: string
    /**
     * Everybody the room knows about, for `assign: 'order'` and nothing else.
     *
     * Optional, and absent is what every caller written before it meant: a
     * client with no roster gets no side from `order`, which is the honest
     * answer on the first frame rather than a guess that changes.
     */
    roster?: readonly string[]
  },
  /**
   * What the document says about sides, or nothing for a caller that has no
   * document to hand.
   *
   * It was `assign` alone, and it is the whole rules block now because there
   * are two fields in it that decide this and a caller passing one of them was
   * a caller silently ignoring the other. Structural rather than `XpRules`
   * proper so a test can pass `{ assign: 'host' }` without building a document
   * around it.
   */
  rules: Pick<XpRules, 'assign' | 'sides'> = {},
): string | undefined {
  /**
   * A seat somebody took beats anything anybody else decided.
   *
   * Before `given`, which is the one place in this file where a host is
   * overruled, and it is deliberate: `claim` is a document saying *these seats
   * are not a thing to be decided for people*. A lobby that had already picked
   * sides would otherwise hand somebody a colour they did not choose and then
   * refuse to let them change it, which is the worst of both mechanisms.
   *
   * Nothing is returned until they have one. That is not a gap to paper over
   * with a hash - at a table, *nobody has sat down yet* is a state the game is
   * in for its first seconds, and a player quietly seated somewhere is how you
   * end up with two people on blue.
   */
  if ((rules.assign ?? DEFAULT_ASSIGN) === 'claim') return who.seat

  if (who.given !== undefined) return who.given

  const teams = teamsOf(marks)
  if (teams.length === 0) return undefined

  /**
   * The two shapes nothing here can hand out, and they refuse for different
   * reasons.
   *
   * **`ffa`** is an author saying the team spawns in this level are not sides.
   * The marks stay where they are - a level can have four spawn points that
   * happen to carry names - and reading them anyway would make the field a
   * label rather than a setting.
   *
   * **`one-vs-all`** needs to pick exactly one player out of a room, which
   * needs the roster this whole file exists to avoid waiting for. So a host
   * names the one, it arrives as `given` above, and none of this runs; until
   * one does, nobody is on a side. Deliberately the same answer `assign: 'host'`
   * gives - a champion nobody has been made is a match that has not started,
   * not a match with two teams in it.
   *
   * **Only what the document *said*, not what `sidesOf` derives**, and the
   * difference is one case: a level with a single named spawn derives `ffa`
   * there and has always been everybody-on-that-side here, which is the rule
   * three paragraphs down and is about making a missing mark visible rather
   * than about shape. An author who wants that level to be a free-for-all says
   * so, and then this line is what refuses it.
   */
  if (rules.sides !== undefined && rules.sides !== 'team') return undefined

  /**
   * `host` means wait to be told.
   *
   * Checked after the sides are known rather than before, so a document that
   * says `host` and has no sides is still simply a document with no sides -
   * there is nothing for a host to assign either, and answering "undefined for
   * two different reasons" through one path keeps the caller from caring which.
   *
   * A player who arrives at a `host` level on their own has no side, and that is
   * the point of the setting rather than a failure of it: the level is only
   * meant to be played as a scheduled match.
   */
  if ((rules.assign ?? DEFAULT_ASSIGN) === 'host') return undefined

  /**
   * Seated in the order the room agrees on: first side to the first player.
   *
   * ---------------------------------------------------------------------------
   * Why sorting ids is the same answer the arbiter already gives
   * ---------------------------------------------------------------------------
   * `spread` hashes because a side has to be known on the *first frame* and the
   * roster is not there yet. A table wants something a hash cannot give: the
   * seats in a fixed order, so the first player is blue and the second is red -
   * and, more usefully than it sounds, so that **the seating order and the turn
   * order are the same order**. The first person to sit down is the first to
   * play.
   *
   * That second half is why this sorts rather than takes the roster's own order.
   * `turn_start` seats the turn with `array_agg(key order by key)` over the
   * arbiter's `health` map, which is the account ids sorted - so sorting them
   * here produces the identical sequence, from a roster every client already
   * has, with nothing added to the wire and no second source of truth to drift.
   * A roster in arrival order would be each client's own idea of who is here,
   * which is the thing `sideOf` exists to avoid depending on.
   *
   * ---------------------------------------------------------------------------
   * It is late on purpose, and the caller has to expect that
   * ---------------------------------------------------------------------------
   * There is no roster on the first frame, so this answers `undefined` until
   * presence has landed and then answers a side. That is exactly what `spread`
   * was designed *not* to do, and it is right here for the reason it was wrong
   * there: at a table you arrive, sit down and are dealt a colour, and being
   * moved to your own chair when the room fills is the game starting rather
   * than a glitch. A level that cannot survive being re-seated should not use
   * this.
   */
  if ((rules.assign ?? DEFAULT_ASSIGN) === 'order') {
    if (!who.id || !who.roster || who.roster.length === 0) return undefined
    const seated = [...new Set(who.roster)].sort()
    const at = seated.indexOf(who.id)
    if (at < 0) return undefined
    /**
     * Wrapping rather than refusing a fifth player.
     *
     * A room that is one bigger than the level has seats for is a room, not an
     * error, and putting the fifth arrival on nobody's side would take away
     * their spawn and their camera. Two people sharing blue is a worse game and
     * a game; no side at all is a spectator nobody asked to be one.
     */
    return teams[at % teams.length]
  }
  /**
   * One side is everybody's side.
   *
   * A level with one team spawn is half-finished rather than one-sided, and
   * putting half the room on a team that has nowhere to stand would make the
   * missing mark harder to notice rather than easier.
   */
  if (teams.length === 1) return teams[0]

  /**
   * Nobody in particular is on nobody's side.
   *
   * Not "the first side", which is what this said in its first draft and which
   * quietly broke `arrivalSpot`: a side decides which spawn mark you arrive at,
   * so putting an anonymous player on red moves them onto red's mark - and
   * `moving-parts` places its `xp.spawn` deliberately in the middle between its
   * two team spawns, six cells from either. That is the *same* regression this
   * file's neighbour already fixed once, arriving through a different door.
   *
   * Nobody in particular is the author trying the level out, or anybody playing
   * it alone: no room, no `me`, no id. They belong on the spot the document
   * chose. A side is something you are given by being one of several people, and
   * one person is not a side.
   */
  if (!who.id) return undefined

  return teams[hash(who.id) % teams.length]
}

