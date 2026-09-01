import {
  CATALOGUE as XO_CATALOGUE,
  labelOf,
  searchCatalogue as searchXo,
  packSize as xoPackSize,
} from '@/domain/builder/catalogue'
import {
  builderUrl,
  modelThumbnailUrl as xoThumb,
  PACK_ORDER as XO_ORDER,
  PACKS as XO_PACKS,
  splitModel as splitXo,
} from '@/domain/builder/packs'
import {
  floorOffset,
  packSize as xpPackSize,
  searchCatalogue as searchXp,
} from '@kxb/xp/catalogue'
import {
  modelUrl as xpUrl,
  PACK_ORDER as XP_ORDER,
  PACKS as XP_PACKS,
  splitModel as splitXp,
  thumbnailUrl as xpThumb,
} from '@kxb/xp/packs'

/**
 * Every model a space can summon, out of both catalogues.
 *
 * ---------------------------------------------------------------------------
 * Why there are two, and why they cannot simply be merged
 * ---------------------------------------------------------------------------
 * This product has shipped two model registries, for two different jobs:
 *
 *   * `@/domain/builder/packs` - 1,308 models over eleven packs. The furniture
 *     and architecture a *world* is built out of: blocks, the prototype kit,
 *     the Tiny Treats rooms, the park.
 *   * `@kxb/xp/packs` - 4,462 over forty. What a *level* is built out of:
 *     characters, weapons, vehicles, dungeon sets, the boardgame pieces.
 *
 * A thing summoned into a room wants both. There is no reason a space should
 * be able to put a bench in its lounge and not a treasure chest, and the
 * catalogues overlap in intent far more than in content.
 *
 * They cannot be one list, because **their pack ids collide**: both name a pack
 * `restaurant` and both name one `proto`, and they are not always the same
 * files. A model id ends up in an immutable log and then in a `fetch`, so an id
 * that resolves to two different files depending on which table you look in
 * first is exactly the bug that cannot be fixed afterwards.
 *
 * So the XP half is namespaced. `xp:adventurers/Knight` is unambiguous, the
 * unprefixed ids every blueprint written so far already carries keep meaning
 * what they meant, and one function decides which registry a model belongs to.
 *
 * ---------------------------------------------------------------------------
 * One shape, twice
 * ---------------------------------------------------------------------------
 * The two `Pack` types are the same fields down to the names - label, path,
 * ext, prefix, scale, lift - because one was written from the other. That is
 * what makes this file thin: it decides *which* table to look in, and every
 * caller does the same arithmetic with what comes back.
 */

/** What marks a model as the level catalogue's. See above. */
export const XP_PREFIX = 'xp:'

export function isXpModel(model: string): boolean {
  return model.startsWith(XP_PREFIX)
}

/** The id as its own registry spells it, with the namespace taken off. */
export function bareModel(model: string): string {
  return isXpModel(model) ? model.slice(XP_PREFIX.length) : model
}

/** Where the file is. Empty string for an id that names nothing. */
export function modelUrlFor(model: string): string {
  return isXpModel(model) ? xpUrl(bareModel(model)) : builderUrl(model)
}

/** Its picture, for a tile. Both registries ship one per model. */
export function thumbnailFor(model: string): string {
  return isXpModel(model) ? xpThumb(bareModel(model)) : xoThumb(model)
}

/**
 * How to draw it: one authored unit is one metre, and how far off the floor.
 *
 * ---------------------------------------------------------------------------
 * Why the level packs' own scale is thrown away
 * ---------------------------------------------------------------------------
 * Reported as *"i put a dice it was mini"*, and it was: 4.8cm across. The
 * boardgame pack is declared at `scale: 0.05`, so a D20 measuring 0.965 units
 * drew at a twentieth of that. Two other packs are declared at 3, which would
 * have gone the other way.
 *
 * Those numbers are not unit conversions. They are *level-authoring*
 * conventions - how big a die should be when it is a prop on a board somebody
 * is playing on - and a room is not a board. Carried into a world they make the
 * size of a summoned thing unpredictable in a way nobody can see coming from
 * the picture on the tile.
 *
 * So the thingiverse states its own rule and it is the one somebody would
 * guess: **one authored unit is one metre, which is one block**. A model
 * measuring 1.5 stands 1.5 blocks tall, and the panel's own size control is
 * there for the times that is not what you wanted.
 *
 * ---------------------------------------------------------------------------
 * Except the construction kits, which really are two units to the block
 * ---------------------------------------------------------------------------
 * The world packs are the other thing: bb10 draws a cube two units on a side,
 * the Tiny Treats sets draw a floor tile two units square, and their `scale` is
 * documented as exactly this conversion - "multiplier that puts one authored
 * unit onto the one-unit cell". Throwing that away would double every crate and
 * every bath, and would put a summoned block next to a built one at twice its
 * size. So those keep their conversion, and the rule above is what it has
 * always meant for them.
 *
 * `lift` is in cells either way: the pack's own, plus - for a level model - how
 * far it has to come up to stand on the floor. 1,875 of the 4,462 are drawn
 * around their own centre rather than stood on zero (the barrels, the coins,
 * the guns), and without that term every one of them stands half buried.
 *
 * Null for an id neither registry knows, which the renderer draws at 1 and
 * unlifted. That is the right failure: a model we no longer ship should be a
 * thing in the wrong place, not a scene that will not load.
 */
export function drawingOf(model: string): { scale: number; lift: number } | null {
  if (isXpModel(model)) {
    const bare = bareModel(model)
    const parts = splitXp(bare)
    if (!parts) return null
    // One unit, one metre - see above. `floorOffset` is in authored units, and
    // at this scale those are metres, so it needs no conversion of its own.
    return { scale: 1, lift: parts.pack.lift + floorOffset(bare) }
  }

  const parts = splitXo(model)
  if (!parts) return null
  return { scale: parts.pack.scale, lift: parts.pack.lift }
}

/**
 * Is this a model we actually ship?
 *
 * The allow-list, and the reason this file is in `src/domain`: an id from here
 * ends up in the event log and then in a `fetch`, so "is this a thing we have"
 * has to be answerable without touching the disk.
 */
export function knownModel(model: string): boolean {
  return modelUrlFor(model) !== ''
}

export interface ModelPack {
  /** Namespaced where it needs to be. What a URL and a filter carry. */
  id: string
  label: string
  size: number
  author: string
  source: string
}

/**
 * Every pack, in the order the browser lists them.
 *
 * The world's first, because they are what a *room* is furnished with and what
 * somebody opening this is nearly always after. The level packs follow, which
 * is also the order they arrived in.
 *
 * Computed once at module load: both registries are module constants, so this
 * is a list that cannot change while the process is running.
 */
export const MODEL_PACKS: readonly ModelPack[] = [
  ...XO_ORDER.map((id) => ({
    id,
    label: XO_PACKS[id].label,
    size: xoPackSize(id),
    author: XO_PACKS[id].author,
    source: XO_PACKS[id].source,
  })),
  ...XP_ORDER.map((id) => ({
    id: `${XP_PREFIX}${id}`,
    label: XP_PACKS[id].label,
    size: xpPackSize(id),
    author: XP_PACKS[id].author,
    source: XP_PACKS[id].source,
  })),
]

export interface ModelHit {
  id: string
  label: string
  packId: string
}

/**
 * Search both catalogues at once.
 *
 * Each half is searched by its own function - they implement the same rule
 * (lowercase, split on spaces and underscores, every term has to match
 * somewhere) and each knows its own model list. Reimplementing that here would
 * be a third copy of a rule that is already written down twice.
 *
 * `pack` narrows to one, namespace included, which is how the browser's chips
 * work. Without it both are searched and the world's models come first.
 */
export function searchModels(query: string, pack?: string): ModelHit[] {
  const wantsXp = pack ? isXpModel(pack) : true
  const wantsXo = pack ? !isXpModel(pack) : true

  const xo = wantsXo
    ? searchXo(query, pack).flatMap((group) =>
        group.models.map((entry) => ({
          id: entry.id,
          label: entry.label,
          packId: group.packId,
        })),
      )
    : []

  const xp = wantsXp
    ? searchXp(query, pack ? bareModel(pack) : undefined).flatMap((group) =>
        group.models.map((entry) => ({
          id: `${XP_PREFIX}${entry.id}`,
          label: entry.label,
          packId: `${XP_PREFIX}${group.packId}`,
        })),
      )
    : []

  return [...xo, ...xp]
}

/** How many models there are in total, for a page that wants to say so. */
export const MODEL_COUNT =
  XO_CATALOGUE.length + MODEL_PACKS.filter((pack) => isXpModel(pack.id)).reduce(
    (sum, pack) => sum + pack.size,
    0,
  )

/** A model's own name, prettified. The same rule both catalogues use. */
export function modelLabel(model: string): string {
  const parts = isXpModel(model) ? splitXp(bareModel(model)) : splitXo(model)
  return parts ? labelOf(parts.name) : model
}
