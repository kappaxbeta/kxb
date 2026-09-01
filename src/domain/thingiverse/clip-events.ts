import type { BakedClip } from '@/domain/animator/clip'
import type { DomainEvent } from '@/es/types'
import type { BlueprintVisibility } from '@/domain/thingiverse/events'

/**
 * A clip a space made, rather than one a pack lent it.
 *
 * ---------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------
 * `@kxb/xp/clips` says this about levels, and it is exactly as true here: the
 * animator made a clip, handed back a file, and there was nowhere to put it. So
 * every animation a blueprint could name came out of a pack - four of them on
 * the lounge's animals - and a thing doing anything specific was a thing
 * somebody had to be talked out of.
 *
 * A clip is *numbers*: times and quaternions. An event log has carried numbers
 * since it existed, so there was never anything to wait for.
 *
 * ---------------------------------------------------------------------------
 * Baked, not keyed
 * ---------------------------------------------------------------------------
 * The animator's own format is a list of *keys*, each a whole pose, with an
 * easing between them - right for editing, wrong for shipping, because it means
 * every reader has to agree about what `smooth` means. What lands here is what
 * `bake` produces: one dense sample per frame, with the easing already in the
 * samples. Every player agrees about a straight line between two numbers, and
 * it is exactly the shape three.js binds.
 *
 * The document is kept too, in `doc`, and only so the clip can be *edited*
 * again: reopening a baked clip in the animator would give somebody a hundred
 * keys they cannot move. The runtime never reads it.
 *
 * ---------------------------------------------------------------------------
 * Which body it is for
 * ---------------------------------------------------------------------------
 * A clip binds to bones by name, so it only means anything on the skeleton it
 * was authored against. `skeleton` records which one that is, so a picker can
 * offer a clip on the bodies it will actually play on and stay quiet on the
 * ones it will not - the lounge's animals are a different rig with four clips
 * of their own, and a wave authored on the dummy is not one of them.
 */

export const CLIP_STREAM_TYPE = 'thingiverse_clip'

/** How many clips one space may keep. */
export const MAX_CLIPS_PER_TENANT = 64

/** How long a clip's name may be. A label on a strip, not a description. */
export const MAX_CLIP_NAME = 48

/**
 * How many samples one clip may carry.
 *
 * 1,440 is a minute at 24fps, which is far longer than anything anybody keys by
 * hand, and on a full rig is a few hundred kilobytes of JSON. The bound is here
 * because the number that produces it - duration times frame rate - is two
 * fields somebody can type, and an event is written before it is looked at.
 *
 * The same number `@kxb/xp/clips` uses, deliberately: a clip that fits in a
 * space's shelf should fit in a level, so the day one is exported into an XP
 * there is no second limit to discover.
 */
export const MAX_CLIP_SAMPLES = 1_440

export type ClipDrawn = DomainEvent<
  'ClipDrawn',
  {
    name: string
    /** The rig it was authored against. See the note above. */
    skeleton: string
    /** What plays. Dense samples - see `BakedClip`. */
    clip: BakedClip
    /** What it was authored *from*, so it can be opened again. */
    doc: unknown
    ownerId: string
    visibility: BlueprintVisibility
  }
>

export type ClipRenamed = DomainEvent<'ClipRenamed', { name: string }>

/**
 * Keyed again, and re-baked.
 *
 * Both halves in one event, for the reason `BlueprintReshaped` carries a whole
 * spec: they are one act. A log holding a new document beside the old samples
 * would be a log that disagrees with itself about what the clip is.
 */
export type ClipReshaped = DomainEvent<'ClipReshaped', { clip: BakedClip; doc: unknown }>

export type ClipVisibilitySet = DomainEvent<
  'ClipVisibilitySet',
  { visibility: BlueprintVisibility }
>

export type ClipHandedOver = DomainEvent<
  'ClipHandedOver',
  { ownerId: string; formerOwnerId: string }
>

/**
 * Taken off the shelf.
 *
 * Soft, and blueprints that name it are deliberately not chased down: a clip
 * name is resolved when it is *played*, and a name that finds nothing plays
 * nothing. So retiring a clip leaves the things that used it standing still
 * rather than breaking them, which is the same promise a retired blueprint
 * makes to the rooms it is standing in.
 */
export type ClipRetired = DomainEvent<'ClipRetired', Record<string, never>>

export type ClipEvent =
  | ClipDrawn
  | ClipRenamed
  | ClipReshaped
  | ClipVisibilitySet
  | ClipHandedOver
  | ClipRetired

export const CLIP_EVENT_LABELS: Record<ClipEvent['type'], string> = {
  ClipDrawn: 'clip made',
  ClipRenamed: 'clip renamed',
  ClipReshaped: 'clip changed',
  ClipVisibilitySet: 'clip shared',
  ClipHandedOver: 'clip handed over',
  ClipRetired: 'clip retired',
}
