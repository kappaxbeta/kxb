import type { Finish } from '@kxb/xp'
import type { DomainEvent } from '@/es/types'

/**
 * An XP project is a folder with an owner.
 *
 * The bytes are not here. Assets live in `xp_files`, content-addressed per
 * space, and each save's document and manifest live in `xp_versions`. What this
 * aggregate holds is the *identity*: whose it is, where it lives, who else may
 * touch it, and whether the world can see it.
 *
 * That split is the battlefield shape and the argument transfers whole - "the
 * level formerly called Sandpit is now called Coliseum, and was published on
 * the 4th and taken down on the 9th" is a fact about an object with a
 * lifecycle, and a lifecycle wants its own stream. docs/xp/creator.md §16.1
 * predicted this exact shape; what it did not predict is that a project with an
 * audience also wants its own art, which is why there is a manifest at all.
 *
 * ---------------------------------------------------------------------------
 * Owner and home are different facts
 * ---------------------------------------------------------------------------
 * `owner` is an account, carried in `XpCreated` and moved only by
 * `XpTransferred`. The home space is the stream's own `tenantId`, which every
 * event carries because `events.tenant_id` is not null.
 *
 * So a project cannot change space by emitting an event. There is no `XpMoved`
 * that rewrites a field, because the log is append-only and every row already
 * carries the tenant it was written under. Moving is a copy: a fresh stream in
 * the target tenant whose `XpCreated` names `movedFrom`, and `XpMovedOut` here
 * to close this one. Two streams, one project, and the link between them is in
 * both directions.
 */

export const XP_STREAM_TYPE = 'xp'

export const XP_NAME_MAX = 80
export const XP_BLURB_MAX = 240

/**
 * What every member of the home space may do, over and above their own grants.
 *
 * `none` is the default and it is the safe direction: a project made in a
 * shared space is private to its owner until they say otherwise, rather than
 * visible to eleven colleagues the moment it is created.
 */
export type XpSpacePolicy = 'none' | 'view' | 'edit'

/** What one named person may do. Sharing is the owner's power, never the space's. */
export type XpRight = 'view' | 'edit'

export type XpState =
  | 'draft'
  | 'submitted'
  | 'published'
  /** Was live, now is not. Links to it still resolve and say so. */
  | 'unlisted'
  /** The space's owner took it out of their space. The owner keeps their copy. */
  | 'removed'
  | 'archived'

export type XpCreated = DomainEvent<
  'XpCreated',
  {
    name: string
    /** The account this belongs to. Not the same question as which space it is in. */
    owner: string
    /** Which template it started from, for the funnel. Absent for an empty one. */
    template?: string
    /**
     * What the author said its cartridge should look like, before there was a
     * document to say it in.
     *
     * The same slot `template` occupies and for the same reason. A project is
     * minted before anything is saved - a name is the only thing that has to
     * exist first - so a choice made on the create form has nowhere to live
     * until the editor writes its first version. The log is where it waits.
     *
     * Read once, by the editor, when it builds the starter document, and
     * stamped onto it - after which the fields are in `XpDocument` where they
     * belong and this is history. Deliberately not projected into the read
     * model, exactly as `template` is not: one screen needs it, once, on the
     * one path where nothing has been saved.
     */
    finish?: Finish
    /** And its colour, on the same terms. 0-359. */
    hue?: number
    /** The stream this continues, when it arrived here from another space. */
    movedFrom?: string
    /**
     * The project this was duplicated from, if it was.
     *
     * Kept apart from `movedFrom` rather than folded into one "came from"
     * field, because the two mean opposite things about the source: a move
     * ends it and a copy leaves it exactly as it was. A single field would
     * make "is the original still there" unanswerable from the log, which is
     * the one question anybody looking at this later will have.
     */
    copiedFrom?: string
  }
>

export type XpRenamed = DomainEvent<'XpRenamed', { name: string; blurb?: string }>

/**
 * A save.
 *
 * `manifest` is path to content hash; the bytes are already in `xp_files` by
 * the time this is appended, which is what makes a half-uploaded folder leave
 * orphan blobs and no version rather than a version that can be read while it
 * is incomplete. The store reads versions, so it would be read.
 */
export type XpVersionSaved = DomainEvent<
  'XpVersionSaved',
  {
    version: number
    bytes: number
    files: number
    /** Who saved it, which is the record of who actually built the thing. */
    by: string
    /** The front picture, as a path inside the folder. */
    cover?: string
  }
>

export type XpAccessSet = DomainEvent<'XpAccessSet', { spacePolicy: XpSpacePolicy }>

export type XpShared = DomainEvent<'XpShared', { account: string; right: XpRight }>

export type XpUnshared = DomainEvent<'XpUnshared', { account: string }>

export type XpTransferred = DomainEvent<'XpTransferred', { to: string; by: string }>

/** Terminal. This project continues as a stream in another space. */
export type XpMovedOut = DomainEvent<'XpMovedOut', { to: string; by: string }>

/**
 * The space's owner taking it out of their space.
 *
 * Not a delete, and the difference is the whole of the ownership bargain: the
 * project leaves the library and stops costing the space bytes, and the owner
 * keeps their read and their export. Neither party can be held hostage - an
 * owner cannot squat in a space that no longer wants their project, and a space
 * cannot appropriate work made in it.
 */
export type XpRemoved = DomainEvent<'XpRemoved', { by: string; reason: string }>

export type XpSubmitted = DomainEvent<'XpSubmitted', { version: number; note?: string }>

export type XpWithdrawn = DomainEvent<'XpWithdrawn', Record<string, never>>

/**
 * A platform verdict, which is why it carries a `by` and why only the
 * backoffice appends it.
 *
 * Publishing is not a field the space can set. Same distinction the platform
 * draws for event spaces: the ceiling is ours, the switch is the host's.
 */
export type XpPublished = DomainEvent<'XpPublished', { version: number; by: string }>

export type XpRejected = DomainEvent<
  'XpRejected',
  { version: number; by: string; reason: string }
>

/**
 * Taken down.
 *
 * Carries the version that was live, even though at the moment it is decided
 * there is exactly one and naming it looks redundant. It is not redundant to
 * the projection, which has to mark that release withdrawn - and the choice is
 * between the event carrying a fact the decider already holds, or the
 * projection reading a row back to rediscover it. An event that carries what
 * its readers need is the cheaper of those and the one that survives a replay
 * in a different order.
 */
export type XpUnpublished = DomainEvent<
  'XpUnpublished',
  { version: number; by: string; reason: string }
>

/**
 * Live is now an earlier release.
 *
 * Not a publish, and the difference is what makes it the owner's to do rather
 * than ours: every version this can move to has already been read and approved,
 * so it is movement *inside* what review permitted rather than a way around it.
 * Somebody whose release has a bug in it can put back the one from an hour ago
 * without waiting for a reviewer to wake up.
 */
export type XpRolledBack = DomainEvent<'XpRolledBack', { to: number; by: string }>

/** Retired, not deleted. The bytes stay until a retention sweep collects them. */
export type XpArchived = DomainEvent<'XpArchived', Record<string, never>>

export type XpEvent =
  | XpCreated
  | XpRenamed
  | XpVersionSaved
  | XpAccessSet
  | XpShared
  | XpUnshared
  | XpTransferred
  | XpMovedOut
  | XpRemoved
  | XpSubmitted
  | XpWithdrawn
  | XpPublished
  | XpRejected
  | XpUnpublished
  | XpRolledBack
  | XpArchived

export const XP_EVENT_LABELS: Record<XpEvent['type'], string> = {
  XpCreated: 'project created',
  XpRenamed: 'project renamed',
  XpVersionSaved: 'version saved',
  XpAccessSet: 'space access changed',
  XpShared: 'shared with somebody',
  XpUnshared: 'sharing revoked',
  XpTransferred: 'ownership transferred',
  XpMovedOut: 'moved to another space',
  XpRemoved: 'removed from the space',
  XpSubmitted: 'submitted for review',
  XpWithdrawn: 'submission withdrawn',
  XpPublished: 'published',
  XpRejected: 'submission rejected',
  XpUnpublished: 'taken down',
  XpRolledBack: 'rolled back to an earlier release',
  XpArchived: 'project archived',
}
