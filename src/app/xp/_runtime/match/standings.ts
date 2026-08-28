import { sideOf } from '@/app/xp/_runtime/match/teams'
import type { Mark, XpRules } from '@kxb/xp'
import type { XpPlayer } from '@kxb/xp/host'

/**
 * The scoreboard, from what the arbiter said and who is in the room.
 *
 * Pure, and separate from the component for the reason everything else in this
 * folder is: the interesting parts here are the *joins* - a score keyed by
 * account id, a name keyed by presence id, and a side derived from neither -
 * and every one of them is a thing to get wrong quietly. A missing join shows
 * up as a scoreboard of blank rows or of duplicated people, both of which look
 * like a rendering bug and are not.
 *
 * ---------------------------------------------------------------------------
 * The arbiter's map is the truth about scores and knows nothing else
 * ---------------------------------------------------------------------------
 * `xp_arbitrate` returns `{ id: kills }` and that is all it can return: it has
 * never seen the document, has no presence and does not know anybody's name.
 * Everything a scoreboard needs beyond the number comes from this client -
 * names from the presence roster, sides from the marks - which is exactly the
 * split §4.1 describes. Outcomes are decided there; presentation is decided
 * here, and being wrong here costs a wrong-looking row rather than a wrong game.
 *
 * ---------------------------------------------------------------------------
 * Somebody with a score and no presence is still on the board
 * ---------------------------------------------------------------------------
 * Two people can leave the room while the match is still going, and the score
 * they got is a fact about the match rather than about who is currently
 * connected. Dropping them would make a scoreboard that rewrites history every
 * time somebody's tab crashes. They keep their number and lose their name,
 * which is the honest way round.
 */
export interface Standing {
  id: string
  /** Their name, or a short form of the id for somebody who has left. */
  name: string
  kills: number
  /** Undefined in a level with no sides, which is most of them. */
  side?: string
  /** Whether this row is the person reading it. */
  mine: boolean
  /** Whether they are still in the room. */
  here: boolean
  /**
   * Out of the match for good, rather than waiting to come back.
   *
   * False in every level with no lives in it, which is every deathmatch built
   * so far - and that is the reason it is a separate field from health rather
   * than derived from it. Somebody on zero health is *down*, and the difference
   * between down and out is the difference between eight seconds and the rest
   * of the game.
   */
  out: boolean
}

/**
 * A name for somebody nobody can see any more.
 *
 * The first characters of the id rather than "unknown", so two absent players
 * are two rows rather than one repeated - and short, because the full thing is
 * a uuid and a scoreboard is not the place to read one.
 */
function shortened(id: string): string {
  return id.slice(0, 6)
}

export function standingsFrom({
  scores,
  lives,
  roster,
  me,
  marks,
  rules,
  team,
}: {
  /** Kills per account id, exactly as the arbiter returned them. */
  scores: Readonly<Record<string, number>>
  /**
   * Lives per account id, when the match has them at all.
   *
   * Absent or empty means nobody can be eliminated, which is the default and
   * every level built before elimination existed.
   */
  lives?: Readonly<Record<string, number>>
  /** Everybody presence says is here, including us. */
  roster: readonly XpPlayer[]
  /** Our own account id, which the arbiter told us rather than us telling it. */
  me: string | undefined
  marks: readonly Mark[]
  /**
   * What the document says about sides, so the board splits the way the level
   * does.
   *
   * Absent is a caller with no document, which `sideOf` reads as "derive it" -
   * and a board that guessed while the world assigned would put team totals
   * over a free-for-all.
   */
  rules?: Pick<XpRules, 'assign' | 'sides'>
  /** The side a host has already put *us* on, when it has. */
  team?: string
}): Standing[] {
  const names = new Map<string, string>()
  for (const player of roster) names.set(player.id, player.name)

  /**
   * Everybody with a score, plus everybody here who has not scored yet.
   *
   * The union rather than either one: a player who has scored nothing is still
   * playing and belongs on the board at zero, and a player who has left still
   * has the kills they got.
   */
  const ids = new Set<string>([...Object.keys(scores), ...names.keys(), ...Object.keys(lives ?? {})])

  const rows: Standing[] = []
  for (const id of ids) {
    const side = sideOf(
      marks,
      { id, ...(id === me && team !== undefined ? { given: team } : {}) },
      rules,
    )
    rows.push({
      id,
      name: names.get(id) ?? shortened(id),
      kills: scores[id] ?? 0,
      ...(side === undefined ? {} : { side }),
      mine: id === me,
      here: names.has(id),
      // Only when this match has lives at all. `lives[id] === undefined` is a
      // player in a match nobody can be eliminated from, not a player who has
      // run out.
      out: lives?.[id] !== undefined && lives[id]! <= 0,
    })
  }

  /**
   * Most kills first, and ties broken by name rather than left to the map.
   *
   * Insertion order would be whatever the database happened to build the jsonb
   * in, so two players on one kill each would swap places every poll - a
   * scoreboard that flickers while nothing is happening.
   */
  return rows.sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name))
}

/**
 * The same thing summed by side, for a level that has them.
 *
 * Empty for a level with no sides, which is the signal to draw the individual
 * board instead - rather than one row called `undefined` holding everybody.
 */
export function teamTotals(standings: readonly Standing[]): { side: string; kills: number }[] {
  const totals = new Map<string, number>()
  for (const row of standings) {
    if (row.side === undefined) continue
    totals.set(row.side, (totals.get(row.side) ?? 0) + row.kills)
  }
  return [...totals]
    .map(([side, kills]) => ({ side, kills }))
    .sort((a, b) => b.kills - a.kills || a.side.localeCompare(b.side))
}
