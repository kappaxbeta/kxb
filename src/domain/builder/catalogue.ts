import { PACK_MODELS } from '@/domain/builder/catalogue.generated'
import { PACK_ORDER, PACKS, splitModel } from '@/domain/builder/packs'

/**
 * The whole shipped catalogue, as one searchable list.
 *
 * This is the allow-list too. A model id ends up in a saved world and then in a
 * `fetch`, so "is this a thing we ship" has to be answerable without touching
 * the disk - the generated list is what makes that a set lookup rather than a
 * hopeful string concatenation.
 *
 * Note what is deliberately *not* here: `isKnownModel` from
 * `@/domain/lounge/palette`. That list is 58 blocks and it guards the lounge's
 * event log, where a bad model id is permanent. This one guards a marketing
 * render that lives in a JSON file on an admin's machine. Two lists because
 * they are answering two different questions, and collapsing them would mean
 * either the builder is stuck with 58 models or the lounge accepts 1308.
 */

export interface CatalogueEntry {
  /** `pack/name`. */
  id: string
  packId: string
  name: string
  /** The name with its underscores knocked out, for reading and for searching. */
  label: string
}

/** Prettify a model name: floor_grass_sliced_A -> Floor grass sliced A. */
export function labelOf(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const CATALOGUE: readonly CatalogueEntry[] = PACK_ORDER.flatMap((packId) =>
  (PACK_MODELS[packId] ?? []).map((name) => ({
    id: `${packId}/${name}`,
    packId,
    name,
    label: labelOf(name),
  })),
)

const CATALOGUE_SET = new Set(CATALOGUE.map((entry) => entry.id))

export function isBuildable(model: string): boolean {
  return CATALOGUE_SET.has(model)
}

/** What the builder starts holding: a grass block, because you build ground first. */
export const DEFAULT_MODEL = 'bb10/dirt_with_grass'

/**
 * The catalogue filtered by a typed query, grouped by pack.
 *
 * Matching is on the *name*, lowercased, with underscores and spaces treated
 * the same - so "grass sliced" finds `floor_grass_sliced_A` and so does
 * "grass_sliced". Typing a pack id matches everything in that pack, which is
 * how "park" gets you the park rather than three benches called park-something.
 *
 * Every term has to match somewhere, in any order: "red chair" finds
 * `chair_red_A` and "chair red" finds it too. With 1308 models a substring
 * search on the whole phrase is a search that mostly returns nothing.
 */
export function searchCatalogue(
  query: string,
  packId?: string,
): { packId: string; label: string; models: CatalogueEntry[] }[] {
  const terms = query.toLowerCase().split(/[\s_]+/).filter(Boolean)

  const groups = PACK_ORDER.filter((id) => !packId || id === packId).map((id) => ({
    packId: id,
    label: PACKS[id].label,
    models: (PACK_MODELS[id] ?? [])
      .filter((name) => {
        if (terms.length === 0) return true
        const haystack = `${id} ${name.toLowerCase().replace(/_/g, ' ')}`
        return terms.every((term) => haystack.includes(term))
      })
      .map((name) => ({ id: `${id}/${name}`, packId: id, name, label: labelOf(name) })),
  }))

  return groups.filter((group) => group.models.length > 0)
}

/** How many models a pack holds, for the picker's tab counts. */
export function packSize(packId: string): number {
  return PACK_MODELS[packId]?.length ?? 0
}

/**
 * A model's display name, pack included, for chips and tooltips.
 *
 * Falls back to the raw id rather than throwing: this is called on whatever is
 * in a loaded document, and a world written against a pack we have since
 * dropped should show its dangling id, not blow up the toolbar.
 */
export function describeModel(model: string): string {
  const parts = splitModel(model)
  if (!parts) return model
  return `${labelOf(parts.name)} · ${parts.pack.label}`
}
