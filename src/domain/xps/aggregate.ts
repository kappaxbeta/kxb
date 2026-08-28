import type { XpCommand } from '@/domain/xps/commands'
import {
  XP_STREAM_TYPE,
  type XpEvent,
  type XpRight,
  type XpSpacePolicy,
  type XpState,
} from '@/domain/xps/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface XpProjectState {
  status: 'none' | XpState
  name: string
  blurb: string
  /** The account. Empty only before `XpCreated`. */
  owner: string
  spacePolicy: XpSpacePolicy
  grants: Readonly<Record<string, XpRight>>
  currentVersion: number
  /** What the store serves. Deliberately not the same as `currentVersion`. */
  publishedVersion: number | null
  /**
   * Every version that has ever been approved, oldest first.
   *
   * The set a rollback may move within. It grows and never shrinks, including
   * across a take-down: a release that was pulled stays in the list because the
   * table cannot tell an ordinary supersede from a moderation take-down, and
   * the decider should not guess. What stops a pulled release being quietly
   * restored is that `XpUnpublished` leaves the project `unlisted`, so putting
   * anything back live is a publish decision again.
   */
  releases: readonly number[]
  cover: string | null
}

export const initialXpState: XpProjectState = {
  status: 'none',
  name: '',
  blurb: '',
  owner: '',
  spacePolicy: 'none',
  grants: {},
  currentVersion: 0,
  publishedVersion: null,
  releases: [],
  cover: null,
}

export function evolve(state: XpProjectState, event: XpEvent): XpProjectState {
  switch (event.type) {
    case 'XpCreated':
      return { ...state, status: 'draft', name: event.data.name, owner: event.data.owner }

    case 'XpRenamed':
      return { ...state, name: event.data.name, blurb: event.data.blurb ?? state.blurb }

    case 'XpVersionSaved':
      return {
        ...state,
        currentVersion: event.data.version,
        cover: event.data.cover ?? state.cover,
      }

    case 'XpAccessSet':
      return { ...state, spacePolicy: event.data.spacePolicy }

    case 'XpShared':
      return { ...state, grants: { ...state.grants, [event.data.account]: event.data.right } }

    case 'XpUnshared': {
      const grants = { ...state.grants }
      delete grants[event.data.account]
      return { ...state, grants }
    }

    case 'XpTransferred':
      return { ...state, owner: event.data.to }

    case 'XpMovedOut':
      return { ...state, status: 'archived' }

    case 'XpRemoved':
      return { ...state, status: 'removed' }

    case 'XpSubmitted':
      return { ...state, status: 'submitted' }

    case 'XpWithdrawn':
    case 'XpRejected':
      return { ...state, status: 'draft' }

    case 'XpPublished':
      return {
        ...state,
        status: 'published',
        publishedVersion: event.data.version,
        releases: state.releases.includes(event.data.version)
          ? state.releases
          : [...state.releases, event.data.version],
      }

    case 'XpRolledBack':
      return { ...state, status: 'published', publishedVersion: event.data.to }

    case 'XpUnpublished':
      // The published version is kept rather than cleared. An unlisted project
      // still has links pointing at it, and the page that says "this was taken
      // down" is a better answer than a 404 - which means it still has to know
      // which version it *was*, if only to name it.
      return { ...state, status: 'unlisted' }

    case 'XpArchived':
      return { ...state, status: 'archived' }

    default:
      return state
  }
}

export function decide(state: XpProjectState, command: XpCommand): XpEvent[] {
  switch (command.type) {
    case 'CreateXp': {
      // The stream id is minted fresh by the action, so a second CreateXp on
      // one stream is not somebody retrying - it is a collision that must not
      // happen quietly.
      if (state.status !== 'none') {
        throw new DomainError('That project already exists', 'xp_exists')
      }
      return [
        {
          type: 'XpCreated',
          data: {
            name: command.name,
            owner: command.actorId,
            ...(command.template ? { template: command.template } : {}),
            ...(command.finish ? { finish: command.finish } : {}),
            // A presence check, because zero is red. See the field's own note.
            ...(command.hue === undefined ? {} : { hue: command.hue }),
            ...(command.movedFrom ? { movedFrom: command.movedFrom } : {}),
            ...(command.copiedFrom ? { copiedFrom: command.copiedFrom } : {}),
          },
        },
      ]
    }

    case 'RenameXp': {
      assertOwner(state, command.actorId, 'rename')
      if (state.name === command.name && (command.blurb ?? state.blurb) === state.blurb) return []
      return [
        {
          type: 'XpRenamed',
          data: { name: command.name, ...(command.blurb === undefined ? {} : { blurb: command.blurb }) },
        },
      ]
    }

    case 'SaveXpVersion': {
      assertEditable(state)
      if (!mayEdit(state, command.actorId)) {
        throw new DomainError('You cannot save changes to this project', 'xp_forbidden')
      }
      return [
        {
          type: 'XpVersionSaved',
          data: {
            version: state.currentVersion + 1,
            bytes: command.bytes,
            files: command.files,
            by: command.actorId,
            ...(command.cover ? { cover: command.cover } : {}),
          },
        },
      ]
    }

    case 'SetXpAccess': {
      assertOwner(state, command.actorId, 'change who can see this')
      if (state.spacePolicy === command.spacePolicy) return []
      return [{ type: 'XpAccessSet', data: { spacePolicy: command.spacePolicy } }]
    }

    case 'ShareXp': {
      assertOwner(state, command.actorId, 'share')
      // Sharing with the owner is a no-op rather than an error: it is what a
      // "share with everyone in this list" gesture does when the owner is in
      // the list, and refusing would make that gesture fail for no reason.
      if (command.account === state.owner) return []
      if (state.grants[command.account] === command.right) return []
      return [{ type: 'XpShared', data: { account: command.account, right: command.right } }]
    }

    case 'UnshareXp': {
      assertOwner(state, command.actorId, 'change sharing')
      if (!(command.account in state.grants)) return []
      return [{ type: 'XpUnshared', data: { account: command.account } }]
    }

    case 'TransferXp': {
      assertOwner(state, command.actorId, 'transfer')
      if (command.to === state.owner) return []
      return [{ type: 'XpTransferred', data: { to: command.to, by: command.actorId } }]
    }

    case 'MoveXpOut': {
      assertOwner(state, command.actorId, 'move')
      assertLive(state)
      return [{ type: 'XpMovedOut', data: { to: command.to, by: command.actorId } }]
    }

    /**
     * The one command the owner cannot veto.
     *
     * Whether the caller owns the *space* is not a fact this stream holds, so
     * the action checks it and what arrives here is "somebody entitled to
     * remove has asked". The decider's job is only to refuse a second removal.
     */
    case 'RemoveXp': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'removed' || state.status === 'archived') return []
      return [{ type: 'XpRemoved', data: { by: command.actorId, reason: command.reason } }]
    }

    case 'SubmitXp': {
      assertOwner(state, command.actorId, 'submit')
      assertLive(state)
      if (state.status === 'submitted') return []
      if (state.currentVersion === 0) {
        throw new DomainError('Save the project before submitting it', 'xp_empty')
      }
      return [
        {
          type: 'XpSubmitted',
          data: {
            version: state.currentVersion,
            ...(command.note ? { note: command.note } : {}),
          },
        },
      ]
    }

    case 'WithdrawXp': {
      assertOwner(state, command.actorId, 'withdraw')
      if (state.status !== 'submitted') return []
      return [{ type: 'XpWithdrawn', data: {} }]
    }

    /**
     * A platform verdict. The backoffice is the only caller, and `platform:
     * true` on the command envelope is what lets it append to a stream in a
     * space it is not a member of.
     *
     * It publishes `currentVersion` rather than the version that was submitted,
     * which is deliberate and is the one place this is subtle: a submission
     * names a version, and if the author has saved since, approving the *newer*
     * one would publish something nobody read. So it is refused instead, and
     * the queue tells the reviewer to look again.
     */
    case 'PublishXp': {
      if (state.status === 'none') throw notFound()
      if (state.status !== 'submitted') {
        throw new DomainError('That project is not waiting for review', 'xp_not_submitted')
      }
      return [
        { type: 'XpPublished', data: { version: state.currentVersion, by: command.actorId } },
      ]
    }

    case 'RejectXp': {
      if (state.status !== 'submitted') {
        throw new DomainError('That project is not waiting for review', 'xp_not_submitted')
      }
      return [
        {
          type: 'XpRejected',
          data: { version: state.currentVersion, by: command.actorId, reason: command.reason },
        },
      ]
    }

    case 'UnpublishXp': {
      if (state.status !== 'published') return []
      return [
        {
          type: 'XpUnpublished',
          data: {
            // Non-null whenever the status is `published`; the two move
            // together and only `XpPublished` and `XpRolledBack` set either.
            version: state.publishedVersion ?? 0,
            by: command.actorId,
            reason: command.reason,
          },
        },
      ]
    }

    /**
     * Move between releases, without a second review.
     *
     * Only among versions already in `releases`, which is what keeps this from
     * being a way around review: everything it can reach was read and approved.
     * That invariant is the whole reason the owner may do it themselves - a
     * release with a bug in it can be put back an hour later rather than at the
     * next reviewer's convenience.
     *
     * Refused while unlisted. A project that was taken down goes live again by
     * being published, which is a decision somebody makes, not a pointer move.
     */
    case 'RollBackXp': {
      assertOwner(state, command.actorId, 'roll back')
      if (state.status !== 'published') {
        throw new DomainError('This project is not live', 'xp_not_published')
      }
      if (!state.releases.includes(command.to)) {
        throw new DomainError(
          `Version ${command.to} was never released, so there is nothing to go back to`,
          'xp_not_a_release',
        )
      }
      if (state.publishedVersion === command.to) return []
      return [{ type: 'XpRolledBack', data: { to: command.to, by: command.actorId } }]
    }

    case 'ArchiveXp': {
      assertOwner(state, command.actorId, 'archive')
      if (state.status === 'none') throw notFound()
      if (state.status === 'archived') return []
      return [{ type: 'XpArchived', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * May this account save changes?
 *
 * The ownership half of docs/xp/backend.md §7.4 — the half this stream can
 * answer. The space policy is on this stream too, but *membership* is not, so a
 * `spacePolicy` of `edit` is checked here as "the project allows the space to
 * edit" and the action separately checks "and this person is in the space".
 * Both are needed and neither is sufficient.
 */
export function mayEdit(state: XpProjectState, accountId: string): boolean {
  if (state.owner === accountId) return true
  if (state.grants[accountId] === 'edit') return true
  return state.spacePolicy === 'edit'
}

/** May this account see it at all, given that they got past the database's policy? */
export function mayRead(state: XpProjectState, accountId: string): boolean {
  if (state.status === 'published') return true
  if (state.owner === accountId) return true
  if (accountId in state.grants) return true
  return state.spacePolicy !== 'none'
}

function notFound(): DomainError {
  return new DomainError('Project not found', 'xp_not_found')
}

function assertOwner(state: XpProjectState, accountId: string, verb: string): void {
  if (state.status === 'none') throw notFound()
  if (state.owner !== accountId) {
    // Named rather than generic, because the whole ownership bargain is that
    // this answer is predictable: a space admin reading it should understand
    // that the project is somebody's, not that they hit a bug.
    throw new DomainError(`Only the owner can ${verb} this project`, 'xp_not_owner')
  }
}

function assertLive(state: XpProjectState): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'archived') {
    throw new DomainError('That project has been archived', 'xp_archived')
  }
  if (state.status === 'removed') {
    throw new DomainError('That project was removed from this space', 'xp_removed')
  }
}

function assertEditable(state: XpProjectState): void {
  assertLive(state)
  // Published is deliberately editable. The draft moves and the store does not
  // - which is the rule that makes review mean anything, because a system where
  // publishing approves *a project* rather than *a version* is one where the
  // next save can be anything.
}

export const xpDecider: Decider<XpProjectState, XpCommand, XpEvent> = {
  streamType: XP_STREAM_TYPE,
  initialState: initialXpState,
  evolve,
  decide,
}
