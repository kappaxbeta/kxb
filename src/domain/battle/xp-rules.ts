import {
  MAX_DECLARED_PLAYERS,
  PRESETS,
  playersOf,
  presetNeeds,
  rulesOf,
  type Capability,
  type Preset,
  type XpCapabilities,
  type XpDocument,
  type XpRules,
} from '@kxb/xp'
import { MAX_PLAYERS, type XpMatchRules } from '@/domain/battle/events'

/**
 * The level's rules are a suggestion, and this is where the match disagrees.
 *
 * docs/xp/backlog.md §3 asks for exactly this and the user asked for it in one
 * sentence - *"we need to also override the document for a custom match"*, and
 * then *"so they are just suggestion"*. Three functions, and the order they are
 * read in is the whole flow:
 *
 *   1. `offerablePresets` - what this level could possibly be played as.
 *   2. `defaultMatchRules` - what the wizard opens with, taken from the level.
 *   3. `applyMatchRules`   - the document the runtime is handed, once a host
 *                            has decided.
 *
 * **The document is never written to.** `applyMatchRules` returns a copy with a
 * different `rules` block on it, built on the server as the page hands the
 * level to the scene - so a match with a five-minute clock on a level that has
 * none changes nothing about the project, the version, or anybody else's game.
 * That is the same promise the version pin makes (docs/xp/backlog.md §11.5)
 * from the other direction: a match cannot move the level, and the level cannot
 * move a match already being played.
 *
 * In the app rather than in `@kxb/xp` deliberately. The package owns what a
 * document may *say*; which of those things a host may change is a product
 * decision belonging to whatever is scheduling the level - and `XpMatchRules`
 * is four of `XpRules`' seven fields for exactly that reason.
 */

/**
 * Every mode this level can actually back up.
 *
 * Derived from `presetNeeds`, never listed, which is the point: a capability is
 * a claim checked against the marks at parse time (`capabilityProblems`), so
 * pointing a preset at one inherits that check instead of restating it. A
 * football mode offered on a level with no goals would be the tag problem the
 * capability system exists to prevent, arriving at kickoff in front of
 * everybody rather than in the editor in front of an author.
 *
 * In `PRESETS` order, which is the order a picker shows them in. The three that
 * need nothing - freestyle, deathmatch, shooter - are always offerable, which
 * is what stops the list ever being empty.
 */
/**
 * Whether a match can be fought in this at all.
 *
 * ---------------------------------------------------------------------------
 * The one question a cartridge and a level answer differently
 * ---------------------------------------------------------------------------
 * Everything else about the two is deliberately the same. The store lists a
 * cartridge because it is an XP, the shelf shows it, a room opens it - see the
 * header of `src/app/xp/_runtime/framed.tsx`, which is a note about how little
 * had to change. This is the exception, and it is worth stating plainly because
 * the asymmetry looks like an oversight until you know why it is there.
 *
 * **A level without `match` is still fightable.** Half the shelf declares only
 * `freeplay` - `mensch`, `peepz`, `steal-a-plant` - and the Play rail opens
 * every one of them by starting a match, because a match is the room mechanism
 * this product has. Refusing those would close the door most of the shelf goes
 * through, to enforce a claim nobody was making.
 *
 * **A cartridge without `match` is not.** Its rules are code: there is no
 * arrangement of a card game or a café in which two sides fight over something,
 * and no amount of "just wander around it" makes one. The café and the house
 * are one member's kitchen and one member's living room, with a purse behind
 * them - a match scheduled in one is a fight nobody can win, in somebody's
 * house, and it would be somebody *else's* house for every player but one.
 *
 * The mirror of the `freeplay` check the rooms list keeps (see `pinXp`), and
 * the two together are the whole of what `capabilities` decides: what may
 * schedule this, asked from each side.
 *
 * `createBattle` is the boundary and asks this of the loaded document. Every
 * surface below is the same question asked early enough not to draw a button
 * that cannot work.
 */
export function fightable(level: {
  framed: boolean
  capabilities: readonly Capability[]
}): boolean {
  return !level.framed || level.capabilities.includes('match')
}

export function offerablePresets(capabilities: readonly Capability[]): Preset[] {
  return PRESETS.filter((preset) => {
    const needs = presetNeeds(preset)
    return needs === null || capabilities.includes(needs)
  })
}

/**
 * What the wizard opens with: the level's own rules, resolved.
 *
 * Pre-filled rather than blank, because the document has already answered every
 * one of these and a host who changes nothing should get the match its author
 * intended. `playersOf` fills the absent halves in, so the block that comes out
 * is complete - see `XpMatchRules` on why it is whole rather than a patch.
 *
 * The cap is narrowed to what a battle actually holds. A level may declare it
 * is for twenty-five (`MAX_DECLARED_PLAYERS`, the transport's ceiling) and a
 * battle holds sixteen, so offering the larger number would be offering seats
 * that `JoinBattle` refuses.
 */
export function defaultMatchRules(level: {
  preset: Preset
  scoreLimit: number | null
  timeLimit: number | null
  players: { min: number; max: number }
}): XpMatchRules {
  const max = Math.min(level.players.max, MAX_PLAYERS)
  return {
    preset: level.preset,
    ...(level.scoreLimit !== null ? { scoreLimit: level.scoreLimit } : {}),
    ...(level.timeLimit !== null ? { timeLimit: level.timeLimit } : {}),
    players: { min: Math.min(level.players.min, max), max },
  }
}

/** The same, read straight off a parsed document. */
export function matchRulesFrom(document: XpDocument): XpMatchRules {
  const rules = rulesOf(document)
  const players = playersOf(rules)
  return defaultMatchRules({
    preset: rules.preset,
    scoreLimit: rules.scoreLimit ?? null,
    timeLimit: rules.timeLimit ?? null,
    players,
  })
}

/**
 * The document the runtime is handed, with this match's rules on it.
 *
 * A copy, and the copy is the whole design: nothing downstream of here needs to
 * know that an override happened, so every reader of `rules` - the mode system,
 * the HUD's clock, the door's capacity - keeps reading one block from one place
 * and no branch is added anywhere for "unless a match said otherwise".
 *
 * The fields the override does not carry are kept from the document. `assign`,
 * `respawn` and `roles` are the author's and stay the author's; a host has no
 * control that sets them and inventing one here would silently drop them.
 *
 * **Absent means absent.** A level with `scoreLimit: 10` played under a block
 * with no score limit loses the limit rather than keeping it, which is what
 * makes "no target" expressible at all - see `XpMatchRules`.
 *
 * Null override returns the document untouched, by identity, so a match created
 * before any of this existed costs nothing and is byte for byte the level.
 */
export function applyMatchRules(
  document: XpDocument,
  override: XpMatchRules | null,
): XpDocument {
  if (!override) return document

  const base = rulesOf(document)
  const rules: XpRules = {
    ...base,
    preset: override.preset,
    players: override.players,
  }
  // Assigned only when present, and deleted otherwise: spreading `base` above
  // carries the document's own limits, and "the host removed the clock" has to
  // survive that.
  if (override.scoreLimit === undefined) delete rules.scoreLimit
  else rules.scoreLimit = override.scoreLimit
  if (override.timeLimit === undefined) delete rules.timeLimit
  else rules.timeLimit = override.timeLimit

  return { ...document, rules }
}

/**
 * Why this match's rules do not hold against this level, or an empty list.
 *
 * The gate that stops an override being a way round the parser. Only two things
 * can be wrong that `xpMatchRulesSchema` cannot see, and both need the
 * document: a preset the world cannot support, and a cap wider than the level
 * declared - because `players.max` is a fact *about the level* and a host
 * raising it would be handing somebody a seat that does not exist.
 *
 * Every reason rather than the first, like `rulesProblems` and
 * `capabilityProblems` before it.
 */
export function matchRulesProblems(
  override: XpMatchRules,
  document: XpDocument,
): string[] {
  const problems: string[] = []
  // Never absent - `parseXp` puts `freeplay` on a document that declares none -
  // and spread because the offer list takes a plain array.
  const capabilities: XpCapabilities = document.capabilities

  if (!offerablePresets([...capabilities]).includes(override.preset)) {
    problems.push(
      `“${document.name}” cannot be played as ${override.preset} — it does not have what that mode needs`,
    )
  }

  if (override.players.min > override.players.max) {
    problems.push('the smallest number of players is more than the largest')
  }

  const declared = playersOf(rulesOf(document))
  if (override.players.max > Math.min(declared.max, MAX_PLAYERS)) {
    problems.push(
      `“${document.name}” is built for ${declared.max} at most — a match cannot seat more`,
    )
  }
  if (override.players.max > MAX_DECLARED_PLAYERS) {
    problems.push(`a match holds ${MAX_DECLARED_PLAYERS} at the very most`)
  }

  return problems
}
