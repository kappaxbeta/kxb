import type { DomainEvent } from '@/es/types'

/**
 * Images placed in the lounge.
 *
 * A separate aggregate from the voxel blocks, because they are a different kind
 * of thing. A block is a *value* at a coordinate - "cell (3,0,7) is dirt" - with
 * no identity of its own, which is why blocks batch into chunk streams and why
 * placing the same one twice records nothing.
 *
 * An image has identity. It is moved, resized and removed, and each of those
 * refers to the same object over time. That is a lifecycle, and a lifecycle
 * wants its own stream.
 */

export const LOUNGE_IMAGE_STREAM_TYPE = 'lounge_image'

/** Size limits in cells. Big enough for a mural, small enough to stay a prop. */
export const MIN_IMAGE_SIZE = 1
export const MAX_IMAGE_SIZE = 32

export type ImagePlaced = DomainEvent<
  'ImagePlaced',
  {
    /** `uploads.slug`, not a URL - the serving route resolves it through RLS. */
    uploadSlug: string
    x: number
    y: number
    z: number
    width: number
    height: number
    /** Quarter turns about Y: 0=north, 1=east, 2=south, 3=west. */
    facing: number
  }
>

export type ImageMoved = DomainEvent<
  'ImageMoved',
  { x: number; y: number; z: number }
>

/**
 * Turned in place.
 *
 * Its own event rather than a field on ImageMoved. Rotation and translation are
 * different things a person did, and folding them together would make the log
 * say "moved" about an image that never left its cell - which is the kind of
 * small lie that makes a history untrustworthy years later.
 */
export type ImageRotated = DomainEvent<'ImageRotated', { facing: number }>

export type ImageResized = DomainEvent<
  'ImageResized',
  { width: number; height: number }
>

export type ImageRemoved = DomainEvent<'ImageRemoved', Record<string, never>>

export type LoungeImageEvent =
  | ImagePlaced
  | ImageMoved
  | ImageRotated
  | ImageResized
  | ImageRemoved

export const LOUNGE_IMAGE_EVENT_LABELS: Record<LoungeImageEvent['type'], string> = {
  ImagePlaced: 'image placed',
  ImageMoved: 'image moved',
  ImageRotated: 'image rotated',
  ImageResized: 'image resized',
  ImageRemoved: 'image removed',
}
