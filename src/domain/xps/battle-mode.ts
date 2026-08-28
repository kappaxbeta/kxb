import type { BattleMode } from '@/domain/battle/events'
import { rulesOf, sidesOf, teamsOf, type XpDocument } from '@kxb/xp'

/**
 * What shape a match inside an XP is, read off the level rather than asked for.
 *
 * ---------------------------------------------------------------------------
 * The hard-coded `ffa` this replaces
 * ---------------------------------------------------------------------------
 * Every XP match was created as `ffa`, in two places that each said so in a
 * comment: the wizard skips its mode step for an XP because "the level *is* the
 * ground, and its `rules` block *is* the mode", and `openXpHere` called the
 * argument "a formality the document overrides". Both were right about where the
 * answer lives and wrong about it being harmless, because the battle's mode is
 * not decoration - it decides whether the lobby offers *Join red* and *Join
 * blue* or a single *Join*, and whether a side is handed to the runtime at all.
 * So a level built with two ends put everybody in one undifferentiated pile, and
 * the only thing that could have said otherwise was a document field that did
 * not exist.
 *
 * ---------------------------------------------------------------------------
 * Three answers, not five
 * ---------------------------------------------------------------------------
 * `BattleMode` also has `football` and `race`, and this deliberately returns
 * neither. Those two are *scored* modes in the battle domain - they carry a
 * clock, a target and their own settings block, and the decider refuses one
 * without them - and an XP reports no score back out yet (see
 * `xp-match-room.tsx`). Mapping a `football` preset onto a football *battle*
 * would produce a match with a whistle nothing can blow.
 *
 * What is left is exactly the question this answers: how the room is divided.
 * The preset stays the document's business, which is where the scoring it
 * describes is actually read.
 *
 * ---------------------------------------------------------------------------
 * Resolved here, on the server, from the whole document
 * ---------------------------------------------------------------------------
 * `sidesOf` needs the marks - absent is derived from them - and the marks are
 * only on the parsed document. `createBattle` already loads it to check the
 * reference resolves, so this costs nothing and every caller gets the same
 * answer. A picker row (`PlayableXp`) carries what the document *declared* and
 * cannot derive, which is why the wizard is not the place to work this out.
 */
export function battleModeFor(document: XpDocument): BattleMode {
  switch (sidesOf(rulesOf(document), document.world.marks)) {
    case 'team':
      /**
       * Two sides, or the battle cannot hold them.
       *
       * A battle's `team` mode *is* red and blue - `TEAMS` is those two words
       * and they are event values, so a third is a schema change rather than a
       * label. A board game has four spawn marks, and putting it in this mode
       * produces a lobby that offers two of its four colours, hands one of them
       * to the runtime as an override, and leaves the other two unreachable no
       * matter who joins.
       *
       * So a level with more sides than the battle has falls to `ffa`: the
       * battle stops trying to divide the room and the *level* seats people,
       * which is the thing it was already doing. One Join button, no side, and
       * `sideOf` answers from the document's own `assign`.
       *
       * The alternative is four `Side` values in an event-sourced schema, which
       * is a real option and a much larger one - and it would still be wrong for
       * the level with six.
       */
      return teamsOf(document.world.marks).length > 2 ? 'ffa' : 'team'
    case 'one-vs-all':
      return 'one_vs_all'
    case 'ffa':
      return 'ffa'
  }
}
