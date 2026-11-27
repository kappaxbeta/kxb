import { describeModel, labelOf } from '@/domain/builder/catalogue'
import { placementThumbnail } from '@/domain/builder/props'
import { isKnownModel, thumbnailUrl } from '@/domain/lounge/palette'

/**
 * The two names one block has, and which of them a still stores.
 *
 * ---------------------------------------------------------------------------
 * Why a translation exists at all
 * ---------------------------------------------------------------------------
 * The lounge palette and the `bb10` pack are the same 58 files under two names.
 * A still has always stored the bare one - `crate` - because that is what the
 * palette this panel used to offer is made of; the builder's picker deals in
 * qualified ids, because it spans fifteen packs and a bare name is ambiguous
 * across them.
 *
 * They are not interchangeable in a scene. `blockY` places a cube by its top
 * face and already corrects for bb10 being modelled around its own centre, and
 * `Pack.lift` corrects for the same thing again - so a qualified bb10 id in a
 * still lands half a cell high. Fixing that in `Block` would break the builder,
 * where the lift is right: the two surfaces genuinely mean different things by
 * a placement's y.
 *
 * So the correction lives here, at the one door a qualified id comes through,
 * and `model-id.test.ts` holds it to the invariant it depends on - that every
 * name in the pack is a name in the palette, so no bb10 model loses its way
 * home. Every other pack lifts by zero and passes through untouched.
 */

const BB10 = 'bb10/'

/** What a still should store for a model the builder's picker handed back. */
export function storedModel(model: string): string {
  const bare = model.startsWith(BB10) ? model.slice(BB10.length) : model
  return isKnownModel(bare) ? bare : model
}

/** The other direction, so the picker can highlight what is already chosen. */
export function qualifiedModel(model: string): string {
  return isKnownModel(model) ? `${BB10}${model}` : model
}

/**
 * Its picture, from whichever of the two registries knows the id.
 *
 * The palette has its own thumbnails - a different directory, shot by a
 * different script - and `placementThumbnail` returns an empty string for a
 * bare name rather than guessing a pack for it. So the palette is asked first.
 */
export function modelPicture(model: string): string {
  return isKnownModel(model) ? thumbnailUrl(model) : placementThumbnail(model)
}

/** Its name, said the way the picker's own tiles say it: thing, then pack. */
export function modelName(model: string): string {
  return isKnownModel(model) ? `${labelOf(model)} · Blocks` : describeModel(model)
}
