import { type ModelHit, modelLabel, searchModels } from '@/domain/thingiverse/models'

/**
 * What `/thingiverse ball` means.
 *
 * The command is a *sentence somebody typed into a chat box*, which is the
 * whole design problem: there is no picker in front of them, no list to scroll
 * and no id to paste. One word has to reach either something on the shelf or
 * something in a pack of thirteen hundred models, and it has to do it without
 * ever summoning the wrong thing silently.
 *
 * So this resolves to a *list*, ranked, and the caller decides. One match opens
 * the preview holding it; several open the preview holding the first with the
 * rest one click away; none says so. That is deliberately not "pick the best
 * one and go": summoning is a thing that appears in a shared room in front of
 * other people, and a wrong guess is a wrong guess everybody can see.
 *
 * ---------------------------------------------------------------------------
 * Why the shelf outranks the packs
 * ---------------------------------------------------------------------------
 * A blueprint is somebody's decision: they picked the model, set how big it is,
 * decided whether it falls and gave it a name. A catalogue entry is raw stock.
 * If a space has made a "ball" - a `park/ball` at 0.6 that bounces - then
 * `/thingiverse ball` means *that*, and offering the eleven models with "ball"
 * in the filename above it would be the tool forgetting what the space already
 * told it.
 *
 * Within the shelf, yours outrank the space's public ones for the same reason
 * one step down: two people may each own a "lamp", and the one you meant is
 * almost always yours.
 */

/** What the shelf looks like to this module. The full row is `BlueprintView`. */
export interface Summonable {
  id: string
  name: string
  model: string
  /** Whether it is yours. Only used for ranking - both are summonable. */
  mine: boolean
}

/**
 * One answer to a typed query.
 *
 * A blueprint match names the blueprint; a catalogue match names a model that
 * has no blueprint yet, and summoning it draws one first (see
 * `summonModel` in ./actions.ts). Two shapes rather than one with a nullable
 * id, because the difference decides what happens next and a nullable field
 * would let a caller forget to ask.
 */
export type SummonMatch =
  | { kind: 'blueprint'; id: string; name: string; model: string; mine: boolean }
  | { kind: 'model'; model: string; name: string }

/** How many answers are worth offering. Past this it is a browse, not a guess. */
export const MAX_SUMMON_MATCHES = 12

/**
 * Rank the shelf and the catalogue against what somebody typed.
 *
 * Matching is the catalogue's own rule, restated in one place so both halves
 * agree: lowercase, split on spaces and underscores, every term has to appear
 * somewhere. "red chair" and "chair_red" find the same thing. An empty query
 * returns nothing rather than everything - `/thingiverse` on its own is a
 * request to *open* the shelf, and the caller reads the empty list as that.
 */
export function resolveSummon(query: string, shelf: readonly Summonable[]): SummonMatch[] {
  const terms = query.toLowerCase().split(/[\s_]+/).filter(Boolean)
  if (terms.length === 0) return []

  const hits = (haystack: string): boolean =>
    terms.every((term) => haystack.toLowerCase().includes(term))

  const blueprints = shelf
    .filter((entry) => hits(`${entry.name} ${entry.model.replace(/[/_]/g, ' ')}`))
    .sort((a, b) => rank(a, terms) - rank(b, terms))
    .map(
      (entry): SummonMatch => ({
        kind: 'blueprint',
        id: entry.id,
        name: entry.name,
        model: entry.model,
        mine: entry.mine,
      }),
    )

  // The models already on the shelf are not offered twice. Somebody who typed
  // "ball" and has a ball wants their ball, not the raw model it was cut from.
  const taken = new Set(shelf.map((entry) => entry.model))

  /**
   * Both catalogues, searched by their own rule.
   *
   * `searchModels` has already applied the same matching the shelf gets above -
   * every term somewhere, in any order - so this only has to drop what is
   * already on the shelf and rank what is left. See `@/domain/thingiverse/models`
   * for why the level packs arrive namespaced.
   */
  const models = searchModels(query)
    .filter((entry) => !taken.has(entry.id))
    .sort((a, b) => modelRank(a, terms) - modelRank(b, terms))
    .map((entry): SummonMatch => ({ kind: 'model', model: entry.id, name: entry.label }))

  return [...blueprints, ...models].slice(0, MAX_SUMMON_MATCHES)
}

/**
 * Lower is better.
 *
 * Three tiers, and nothing finer. An exact name beats a name that merely
 * contains the words, yours beats the space's, and everything else keeps the
 * order the shelf came in - which is oldest first, so a space's answer to
 * "lamp" stays the same from one day to the next. A cleverer score (edit
 * distance, term position, recency) would reorder the list as the shelf grows,
 * and a summon menu whose first entry moves is one people stop trusting.
 */
function rank(entry: Summonable, terms: string[]): number {
  const exact = entry.name.toLowerCase() === terms.join(' ')
  return (exact ? 0 : 2) + (entry.mine ? 0 : 1)
}

/**
 * The same idea for raw models: an exact name beats a partial one.
 *
 * The world's packs come before the level's when the two tie, which is what
 * `searchModels` already orders them by - a room is furnished before it is
 * populated, and somebody typing "chest" in a lounge means the wooden one.
 */
function modelRank(entry: ModelHit, terms: string[]): number {
  return entry.label.toLowerCase() === terms.join(' ') ? 0 : 1
}

/**
 * What a blueprint cut straight from a model should be called.
 *
 * The model's own label, which is what the picker already shows and therefore
 * what somebody who typed "fountain" is looking at when they place it. Naming
 * it after the *query* was the alternative and is worse in the one case that
 * matters: "/thingiverse red" summoning a chair called "red".
 */
export function nameForModel(model: string): string {
  return modelLabel(model)
}
