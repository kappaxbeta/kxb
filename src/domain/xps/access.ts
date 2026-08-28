import 'server-only'
import type { XpProjectRow } from '@/domain/xps/queries'
import { canWrite, type TenantContext } from '@/lib/tenant'

/**
 * May this person do that to this project?
 *
 * docs/xp/backend.md §7.4, as one function. It is one function because the same
 * question is asked from the editor, the save endpoint, the space library, the
 * profile list and the export route, and five copies of a permission rule is
 * one rule that drifts. `commands.ts` says the decider owns the ownership half;
 * this is the whole of it, including the parts the decider cannot see.
 *
 * ---------------------------------------------------------------------------
 * Three inputs, and the reason none of them can be dropped
 * ---------------------------------------------------------------------------
 * **The project** says who owns it, who it was shared with, and what it lets
 * the space do. That is the part the aggregate decides and the database's RLS
 * enforces on reads.
 *
 * **The space** says whether this person is in it at all, and whether it may be
 * written to right now - `canWrite` refuses a guest, an archived space and a
 * lapsed subscription, and `hasTier` refuses `xo`. A grant is permission from a
 * person; a writable space is permission from the bill. Somebody can hold an
 * `edit` grant on a project in a space whose billing lapsed, and the honest
 * answer is no.
 *
 * **The account** is who is asking, which is not always a member: the owner of
 * a project keeps their rights after leaving the space it lives in, which is
 * the entire point of §7.0 and the one case a tenant-scoped check gets wrong.
 *
 * ---------------------------------------------------------------------------
 * What this returns, and why it is not a boolean
 * ---------------------------------------------------------------------------
 * A reason. "You cannot edit this" is a dead end; "this space is on xo, and the
 * editor is part of xp" is a next step. The caller decides whether to show it
 * or to 404 - a surface that would confirm a project exists to somebody who
 * cannot see it should still 404, and that is the caller's call rather than
 * this function's.
 */

export type XpAction =
  | 'read'
  | 'edit'
  | 'share'
  | 'submit'
  /** Rename, transfer, move, archive. Everything only an owner may do. */
  | 'own'
  /** Take it out of this space. The space's owner, not the project's. */
  | 'remove'
  /** Walk out with a zip of it. See the case below — this one is not like the others. */
  | 'export'

export type XpVerdict = { allowed: true } | { allowed: false; reason: string }

const YES: XpVerdict = { allowed: true }
const no = (reason: string): XpVerdict => ({ allowed: false, reason })

export interface XpViewerContext {
  accountId: string
  /**
   * The space the project lives in, if the viewer is in it. Null when they are
   * not - which is normal for an owner who has left, and is why this is not
   * simply a `TenantContext` parameter.
   */
  space: TenantContext | null
  /** Whether they hold a grant, and which. Read from `xp_grants`. */
  grant: 'view' | 'edit' | null
  /** Backoffice. Publishing and taking down, and nothing else. */
  operator: boolean
}

export function mayDo(
  project: XpProjectRow,
  action: XpAction,
  viewer: XpViewerContext,
): XpVerdict {
  const isOwner = project.ownerId !== null && project.ownerId === viewer.accountId
  const inSpace = viewer.space !== null && viewer.space.tenant.id === project.tenantId

  // Archived is the end of the line for everything except reading it back and
  // taking a copy away. Export is deliberately outside this: a project being
  // retired is one of the moments somebody most wants their files.
  if (project.state === 'archived' && action !== 'read' && action !== 'export') {
    return no('This project has been archived')
  }

  switch (action) {
    case 'read': {
      if (project.state === 'published' || project.state === 'unlisted') return YES
      if (isOwner) return YES
      if (viewer.grant !== null) return YES
      if (viewer.operator) return YES
      // A member of the space sees that it exists whatever the policy - it is
      // on their bill, and their owner may need to remove it. What `none`
      // withholds is opening it, which is `edit` and `read`'s richer callers.
      if (inSpace) return YES
      return no('That project is not yours to see')
    }

    case 'edit': {
      if (project.state === 'removed') {
        return no('This project was removed from this space')
      }

      // Who, before whether. A stranger should be told it is not theirs rather
      // than told about somebody else's billing.
      const permitted =
        isOwner ||
        viewer.grant === 'edit' ||
        (inSpace && project.spacePolicy === 'edit')

      if (!permitted) return no('You do not have edit access to this project')

      /**
       * Not in the space at all, and the answer depends on who is asking.
       *
       * The owner is told to export, because they can — `export` is its own
       * rung precisely so that stays true when everything else has lapsed.
       * Somebody holding a *grant* from outside the space cannot export
       * either, so telling them to would be pointing at a second closed door.
       * One message for both was the first version of this and it was wrong in
       * the direction that wastes somebody's time.
       */
      if (!inSpace) {
        return no(
          isOwner
            ? 'You are not in the space this project lives in. Export it to keep a copy.'
            : 'You are no longer in the space this project lives in.',
        )
      }

      // The space has to be able to hold an edit, whoever is making it. A grant
      // is permission from a person; this is permission from the bill.
      return spaceCanHold(viewer.space, inSpace)
    }

    case 'share':
    case 'own': {
      if (!isOwner) {
        return no(
          action === 'share'
            ? 'Only the person who owns this project can share it'
            : 'Only the person who owns this project can change it',
        )
      }
      return YES
    }

    case 'submit': {
      if (!isOwner) return no('Only the owner can put a project forward')
      if (project.currentVersion === 0) return no('Save the project before submitting it')
      return spaceCanHold(viewer.space, inSpace)
    }

    /**
     * The one action the project's owner cannot veto and cannot perform.
     *
     * It is their space and their bill, so an owner cannot squat in a space
     * that no longer wants their project. It removes and never takes: the
     * project leaves the library, the owner keeps their copy, and §12.8 is why
     * they keep their read and their export for a while afterwards.
     */
    case 'remove': {
      if (!inSpace) return no('That project is not in a space you are in')
      const role = viewer.space?.tenant.role
      if (role !== 'owner' && role !== 'admin') {
        return no("Only this space's owner can remove a project from it")
      }
      return YES
    }

    /**
     * The one rung that does not ask the space anything.
     *
     * §7.0 says there is no personal shelf, and that leaving with your work is
     * Export. That promise is only true if it survives every way somebody can
     * lose their footing in a space: billing lapsing, the tier dropping to xo,
     * being removed from the membership, the space owner removing the project,
     * the project being archived. Every one of those refuses `edit` — and the
     * refusal message for an owner outside the space literally says *export it
     * to keep a copy*, which would be a lie if export ran the same check.
     *
     * So the owner may always export, full stop. Everybody else needs the same
     * standing they would need to edit, because a zip of a project you can only
     * *look at* is a fork by another route, and §12.5 leaves forking open.
     */
    case 'export': {
      if (isOwner) return YES

      const permitted =
        viewer.grant === 'edit' || (inSpace && project.spacePolicy === 'edit')
      if (!permitted) return no('That project is not yours to take a copy of')

      // Not `spaceCanHold`: exporting reads, it does not write, so a space
      // whose billing lapsed can still be got out of. That is the whole point.
      if (!inSpace) return no('You are not in the space this project lives in')
      return YES
    }

    default: {
      const exhaustive: never = action
      return no(`Unknown action: ${String(exhaustive)}`)
    }
  }
}

/**
 * Can this space hold a write at all right now?
 *
 * Separated because three actions ask it and because the order of the two
 * checks is a copy decision as much as a logic one: the tier is a thing
 * somebody can fix by buying, and a lapsed subscription is a thing they fix by
 * paying, and neither should read as "you are not allowed".
 */
function spaceCanHold(space: TenantContext | null, inSpace: boolean): XpVerdict {
  if (!inSpace || !space) {
    /**
     * Reached only by the owner now — `edit` answers this case itself, and
     * `submit` is owner-only. They still own it and there is nowhere to put an
     * edit, which is the honest consequence of §7.0's "no personal shelf", so
     * the message names the thing they can actually do.
     */
    return no('You are not in the space this project lives in. Export it to keep a copy.')
  }
  /*
   * No tier gate here any more.
   *
   * This asked `hasTier(space, 'xp')` and turned xo away from the editor
   * entirely, which was right while xp was a *half of the product* somebody had
   * or did not. Projects are a quantity now - xo holds three - so a tier can no
   * longer answer "may you edit"; only a count can, and a count belongs at the
   * door where a project is *made* rather than at the one where an existing
   * project is opened.
   *
   * Refusing here would also be the wrong shape even with the right number: a
   * space that dropped to free holding three projects must still be able to
   * open them, or the cap would have quietly taken away work somebody did.
   * `docs/product/pricing.md` §6 - nothing is deleted, and nothing becomes
   * unreachable either.
   */
  if (!canWrite(space)) {
    return no(`${space.tenant.name} cannot be written to right now`)
  }
  return YES
}

/**
 * The same question, for a caller that only wants yes or no.
 *
 * Named rather than inlined as `.allowed`, because `if (mayDo(...))` on an
 * object is always true and is exactly the bug a verdict type invites.
 */
export function can(
  project: XpProjectRow,
  action: XpAction,
  viewer: XpViewerContext,
): boolean {
  return mayDo(project, action, viewer).allowed
}
