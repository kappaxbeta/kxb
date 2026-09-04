import {
  isXpModel,
  MODEL_PACKS,
  type ModelPack,
  searchModels,
  thumbnailFor,
} from '@/domain/thingiverse/models'

/**
 * What a pack looks like, before you open it.
 *
 * ---------------------------------------------------------------------------
 * Fifty-one words and a number is not a catalogue
 * ---------------------------------------------------------------------------
 * Every surface that offers these packs offers them the same way: a row of
 * chips reading "Proto 218", "Kappa 2", "Resources 78". That is a filter, and
 * it works if you already know what is in them. Nobody does. "Adventure" and
 * "Adventurers" are different packs; "Shapes" is arrows and chevrons and
 * "Proto" is grey building blocks; "Cosmos" is one galaxy. The only way to find
 * that out was to press each one and read the grid, fifty-one times.
 *
 * So a pack gets a face: four of its own models, as the pictures that already
 * exist. It is the cheapest possible answer to "what is in here" - four `<img>`
 * tags against a folder of WebP files we ship - and it is the answer, because
 * these packs are *drawings*, and four drawings say more than any label we
 * could write for them.
 *
 * ---------------------------------------------------------------------------
 * Spread through the pack rather than taken off the front
 * ---------------------------------------------------------------------------
 * The first four are the worst four. A catalogue sorted by filename opens on
 * `arrow_black`, `arrow_blue`, `arrow_green`, `arrow_purple` - one shape in
 * four colours, which describes a pack of a hundred and fifty-six things as
 * "arrows". Sampling at even intervals through the list costs the same and
 * lands in four different neighbourhoods of the alphabet, which for these packs
 * is four different *kinds* of thing: names cluster by subject because that is
 * how the people who drew them named the files.
 *
 * Deterministic, and not a shuffle. A cover that changes between two renders of
 * the same page is a page that looks broken, and a cover that changes between
 * the server's HTML and the client's first paint is a hydration mismatch.
 */

/** How many models a cover shows. Four fits one row at every size that draws one. */
export const COVER_SIZE = 4

export interface PackPreview {
  pack: ModelPack
  /** Model ids, spread through the pack. Fewer than `COVER_SIZE` for a small pack. */
  models: string[]
  /** Their pictures, in the same order, so a caller need not resolve them. */
  thumbnails: string[]
}

/**
 * One pack's cover.
 *
 * Empty models for a pack id nothing ships, rather than throwing: this is
 * called with whatever a filter carries, and a stray id should draw a card with
 * no pictures on it rather than take the page down.
 */
export function packPreview(packId: string, size = COVER_SIZE): PackPreview | null {
  const pack = MODEL_PACKS.find((entry) => entry.id === packId)
  if (!pack) return null

  // The whole pack, which is what an empty query means to both catalogues.
  // Their own search rather than a list built here: the model list lives in the
  // registries and a third copy of "which models are in this pack" is the thing
  // that goes stale.
  const all = searchModels('', packId).map((hit) => hit.id)
  const models = spread(all, size)

  return { pack, models, thumbnails: models.map(thumbnailFor) }
}

/** Every pack with a cover, in the order the pickers list them. */
export function packPreviews(size = COVER_SIZE): PackPreview[] {
  return MODEL_PACKS.map((pack) => packPreview(pack.id, size)).filter(
    (preview): preview is PackPreview => preview !== null,
  )
}

/** The world packs and the level packs, which is the split every picker draws. */
export function splitPreviews(previews: PackPreview[]): {
  rooms: PackPreview[]
  levels: PackPreview[]
} {
  return {
    rooms: previews.filter((preview) => !isXpModel(preview.pack.id)),
    levels: previews.filter((preview) => isXpModel(preview.pack.id)),
  }
}

/**
 * `count` items taken at even intervals through a list.
 *
 * Sampled at the *middle* of each interval rather than at its start, which is
 * what keeps the last pick away from the end of the alphabet and the first away
 * from the beginning of it. With 156 items and 4 samples the step is 39: from
 * the start that is 0, 39, 78, 117, and the first pick is still whatever sorts
 * first; from the middle it is 19, 58, 97, 136, which is four models nobody
 * would call the front of the list.
 */
function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items]
  const step = items.length / count
  const picked: T[] = []
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.min(items.length - 1, Math.round(index * step + step / 2))])
  }
  return picked
}
