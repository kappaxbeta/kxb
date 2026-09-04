import { isBuildable, labelOf, searchCatalogue } from '@/domain/builder/catalogue'
import {
  bareModel,
  drawingOf,
  isXpModel,
  knownModel,
  MODEL_PACKS,
  modelUrlFor,
  thumbnailFor,
  XP_PREFIX,
} from '@/domain/thingiverse/models'
import { searchCatalogue as searchXp } from '@kxb/xp/catalogue'

/**
 * The second catalogue, as things you can stand in a built world.
 *
 * ---------------------------------------------------------------------------
 * Why the builder's allow-list widened, and what it did not widen
 * ---------------------------------------------------------------------------
 * `./catalogue` guards the builder document: 1,401 models over fourteen packs,
 * and a model id that is not one of them is dropped on load rather than fetched.
 * That is still the rule. What changed is the size of the list it is checked
 * against, because the builder was the one editor in the product that could not
 * reach the level packs - 4,462 models of characters, weapons, dungeon walls and
 * vehicles that the thingiverse has been offering a room since it shipped.
 *
 * There was never a reason for that beyond the order things were built in. A
 * world is furnished out of one registry and a room is furnished out of two, so
 * a park bench could stand in a published world and a treasure chest could not,
 * and the only way to get one into a still was to put it in the scene studio
 * instead.
 *
 * So the builder reaches both now, through the same door the thingiverse
 * opened: `@/domain/thingiverse/models`, where a `xp:` prefix says which
 * registry an id belongs to and one function per question resolves it. This
 * file is the builder's name for that, and it exists rather than the editor
 * importing the thingiverse directly for one reason - the widening is a
 * decision about *this document*, and a decision wants a place to be written
 * down.
 *
 * ---------------------------------------------------------------------------
 * These are props, in the word `toBlocks` already used
 * ---------------------------------------------------------------------------
 * `@/domain/worlds/blocks` has always split a world's placements in two: the
 * `bb10` cubes, which become blocks somebody can stand on, and everything else,
 * which it counts as `props` and leaves behind. A level model is on the second
 * side of that line and nothing here moves it - `splitModel` in `./packs` does
 * not know the `xp:` namespace, so `isBlockModel` says no without being asked
 * to, which is the answer it should give.
 *
 * That means a chest placed in a world is visible in the editor, in an export
 * and in a marketing still, and is *not* carried into a space's walkable copy.
 * The publish panel already reports that count, in the words it already used.
 * Making props survive that crossing is a different feature: it needs somewhere
 * in the lounge's event log to put a model that is not a unit cube, and that
 * shape does not exist yet.
 *
 * ---------------------------------------------------------------------------
 * One authored unit is one metre, which is not what the level packs say
 * ---------------------------------------------------------------------------
 * Not re-argued here. `drawingOf` made this call for the thingiverse and the
 * reasoning transfers whole: a level pack's own `scale` is a level-authoring
 * convention - how big a die should be on a board - and a world is not a board.
 * Reusing that function rather than writing a second rule is the point; two
 * surfaces drawing the same chest at two sizes is the bug this avoids.
 */

/** Whether a model id may stand in a built world. The document's allow-list. */
export function isPlaceable(model: string): boolean {
  return isXpModel(model) ? knownModel(model) : isBuildable(model)
}

/**
 * Where the file is, for either catalogue. Empty string for an id naming nothing.
 *
 * `isBuildable` and not `knownModel` on the world half, deliberately: the level
 * registry's own `modelUrl` answers "could this be a path", and the world half
 * has a generated list of every file we actually ship. Keeping the stricter
 * check on the side that has one is free.
 */
export function placementUrl(model: string): string {
  return isPlaceable(model) ? modelUrlFor(model) : ''
}

/** Its picture, for a picker tile. Both registries ship one per model. */
export function placementThumbnail(model: string): string {
  return thumbnailFor(model)
}

/**
 * How to draw it: the multiplier on one authored unit, and the lift off the cell
 * floor. Null for an id neither registry knows, which the renderer draws at 1.
 */
export function placementDrawing(model: string): { scale: number; lift: number } | null {
  return drawingOf(model)
}

/**
 * The packs, in the order a picker lists them.
 *
 * The thingiverse's list unchanged - world packs first, because they are what a
 * *world* is mostly built out of and what somebody opening the picker is nearly
 * always after, then the level packs in the order they arrived.
 */
export const PLACEABLE_PACKS = MODEL_PACKS

export interface PlacementGroup {
  packId: string
  label: string
  models: { id: string; label: string }[]
}

/**
 * Both catalogues searched at once, grouped by pack.
 *
 * Each registry's own search, because they implement the same rule - lowercase,
 * split on spaces and underscores, every term has to match somewhere - and each
 * knows its own model list. Both already return groups, so this is the
 * namespacing and the concatenation and nothing else. Not `searchModels`, which
 * returns a flat list the picker would only have to group back up.
 *
 * `packId` narrows to one, namespace included, which is how the chips work.
 */
export function searchPlaceable(query: string, packId?: string): PlacementGroup[] {
  const narrowed = packId !== undefined
  const wantsXp = narrowed ? isXpModel(packId) : true
  const wantsXo = narrowed ? !isXpModel(packId) : true

  const xo = wantsXo
    ? searchCatalogue(query, packId).map((group) => ({
        packId: group.packId,
        label: group.label,
        models: group.models.map((entry) => ({ id: entry.id, label: entry.label })),
      }))
    : []

  const xp = wantsXp
    ? searchXp(query, packId ? bareModel(packId) : undefined).map((group) => ({
        packId: `${XP_PREFIX}${group.packId}`,
        label: group.label,
        models: group.models.map((entry) => ({
          id: `${XP_PREFIX}${entry.id}`,
          label: entry.label,
        })),
      }))
    : []

  return [...xo, ...xp]
}

/** A model's own name, prettified, for a chip or a tooltip. */
export function placementLabel(model: string): string {
  const bare = bareModel(model)
  const cut = bare.lastIndexOf('/')
  return cut < 0 ? labelOf(bare) : labelOf(bare.slice(cut + 1))
}
