import { describe, expect, test } from 'bun:test'
import { can, mayDo, type XpViewerContext } from '@/domain/xps/access'
import type { XpProjectRow } from '@/domain/xps/queries'
import type { Tier } from '@/domain/billing/tiers'
import type { TenantContext } from '@/lib/tenant'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * The ladder, and the cases that made it a function rather than a habit.
 *
 * Most of these are "somebody who obviously should be refused, is". The ones
 * worth reading are the three that are not obvious: an `edit` grant in a space
 * whose billing lapsed, an owner who has left the space, and a space admin who
 * may remove a project they may not open.
 */

const OWNER = 'owner-account'
const OTHER = 'other-account'
const SPACE = 'space-uuid'

const project = (over: Partial<XpProjectRow> = {}): XpProjectRow => ({
  id: 'xp-uuid',
  tenantId: SPACE,
  ownerId: OWNER,
  name: 'Minigolf',
  blurb: null,
  state: 'draft',
  spacePolicy: 'none',
  currentVersion: 1,
  publishedVersion: null,
  coverPath: null,
  bytes: 0,
  updatedAt: '2026-08-10T00:00:00Z',
  ...over,
})

/** Enough of a TenantContext for the four fields this module reads. */
const space = (
  over: { role?: TenantRoleName; tier?: Tier; writable?: boolean; entitled?: boolean; id?: string } = {},
): TenantContext =>
  ({
    tenant: {
      id: over.id ?? SPACE,
      slug: 'kxb',
      name: 'kxb',
      archived: false,
      role: over.role ?? 'member',
      entitled: over.entitled ?? true,
      // `canWrite` reads this now, not `subscription.writable` - see the note
      // on `deactivated` in lib/tenant.ts. Billing no longer shuts a space; the
      // only thing that does is somebody deciding to.
      deactivated: over.writable === false,
      tier: over.tier ?? 'xp',
    },
    subscription: { writable: over.writable ?? true },
  }) as unknown as TenantContext

const viewer = (over: Partial<XpViewerContext> = {}): XpViewerContext => ({
  accountId: OTHER,
  space: space(),
  grant: null,
  operator: false,
  ...over,
})

describe('reading', () => {
  test('a published project is readable by anybody, signed out included', () => {
    const anon = viewer({ accountId: '', space: null })
    expect(can(project({ state: 'published' }), 'read', anon)).toBe(true)
  })

  test('a draft is not readable by a stranger', () => {
    expect(can(project(), 'read', viewer({ space: null }))).toBe(false)
  })

  test('a member of the space sees a draft exists even under a policy of none', () => {
    // It is on their bill and their owner may need to remove it. What `none`
    // withholds is opening it.
    expect(can(project({ spacePolicy: 'none' }), 'read', viewer())).toBe(true)
    expect(can(project({ spacePolicy: 'none' }), 'edit', viewer())).toBe(false)
  })

  test('the owner reads it wherever it lives, including from outside the space', () => {
    expect(can(project(), 'read', viewer({ accountId: OWNER, space: null }))).toBe(true)
  })
})

describe('editing', () => {
  test('the owner can edit', () => {
    expect(can(project(), 'edit', viewer({ accountId: OWNER }))).toBe(true)
  })

  test('an edit grant is enough, a view grant is not', () => {
    expect(can(project(), 'edit', viewer({ grant: 'edit' }))).toBe(true)
    expect(can(project(), 'edit', viewer({ grant: 'view' }))).toBe(false)
  })

  test('a space policy of edit lets any member in', () => {
    expect(can(project({ spacePolicy: 'edit' }), 'edit', viewer())).toBe(true)
  })

  /**
   * The case the ladder exists for.
   *
   * A grant is permission from a person; a writable space is permission from
   * the bill. Holding one without the other is not an edge case - it is what
   * every project in a space looks like the day its card expires.
   */
  test('an edit grant in a space that cannot be written to is refused, and says why', () => {
    const lapsed = viewer({ grant: 'edit', space: space({ writable: false }) })
    const verdict = mayDo(project(), 'edit', lapsed)

    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('cannot be written to')
  })

  /**
   * This asserted the opposite until the tiers stopped being halves of the
   * product. An xo space was turned away from the editor entirely, on the
   * argument that the editor *was* xp; xo now holds three projects, so a tier
   * can no longer answer "may you edit" and only a count can.
   *
   * The count is not asked here on purpose. It belongs at the door where a
   * project is made, not at the one where an existing project is opened -
   * otherwise a space that dropped a tier holding three of them could not open
   * its own work, and a cap would have quietly taken away something somebody
   * did. docs/product/pricing.md §6: nothing is deleted, and nothing becomes
   * unreachable either.
   */
  test('any tier may open a project it already holds, free included', () => {
    for (const tier of ['free', 'xo', 'xp'] as const) {
      const owner = viewer({ accountId: OWNER, space: space({ tier }) })
      expect(can(project(), 'edit', owner)).toBe(true)
    }
  })

  /**
   * The owner who has left. They still own it, and there is nowhere to put an
   * edit - which is the honest consequence of "no personal shelf", and the
   * message says the thing they can actually do.
   */
  test('an owner outside the space is told to export rather than told no', () => {
    const gone = viewer({ accountId: OWNER, space: null })
    const verdict = mayDo(project(), 'edit', gone)

    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('Export')
  })

  test('a removed project cannot be edited by anybody, owner included', () => {
    expect(can(project({ state: 'removed' }), 'edit', viewer({ accountId: OWNER }))).toBe(false)
  })

  test('a published project is still editable — the draft moves, the store does not', () => {
    expect(can(project({ state: 'published' }), 'edit', viewer({ accountId: OWNER }))).toBe(true)
  })

  test('who is checked before whether, so a stranger is not told about billing', () => {
    const stranger = viewer({ space: space({ writable: false }) })
    const verdict = mayDo(project(), 'edit', stranger)

    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) {
      expect(verdict.reason).toContain('edit access')
      expect(verdict.reason).not.toContain('written to')
    }
  })
})

describe('owning', () => {
  test('only the owner can share or change it, whatever their role in the space', () => {
    const admin = viewer({ space: space({ role: 'admin' }) })
    expect(can(project(), 'share', admin)).toBe(false)
    expect(can(project(), 'own', admin)).toBe(false)
    expect(can(project(), 'share', viewer({ accountId: OWNER }))).toBe(true)
  })

  test('an edit grant does not become ownership', () => {
    expect(can(project(), 'own', viewer({ grant: 'edit' }))).toBe(false)
  })

  test('submitting needs a save first', () => {
    const owner = viewer({ accountId: OWNER })
    expect(can(project({ currentVersion: 0 }), 'submit', owner)).toBe(false)
    expect(can(project({ currentVersion: 1 }), 'submit', owner)).toBe(true)
  })
})

describe('removing', () => {
  /**
   * The bargain, in three tests. The space owner can always remove; the project
   * owner can never be removed *from*; and neither becomes the other.
   */
  test("the space's owner can remove a project they do not own", () => {
    expect(can(project(), 'remove', viewer({ space: space({ role: 'owner' }) }))).toBe(true)
  })

  test('an ordinary member cannot', () => {
    expect(can(project(), 'remove', viewer({ space: space({ role: 'member' }) }))).toBe(false)
  })

  test("the project's owner cannot remove it from somebody else's space", () => {
    // They archive or move instead. Removal is the space's power over its own
    // library, not a second delete button for the owner.
    const ownerNotInSpace = viewer({ accountId: OWNER, space: null })
    expect(can(project(), 'remove', ownerNotInSpace)).toBe(false)
  })

  test('removing does not imply editing', () => {
    const spaceOwner = viewer({ space: space({ role: 'owner' }) })
    expect(can(project({ spacePolicy: 'none' }), 'remove', spaceOwner)).toBe(true)
    expect(can(project({ spacePolicy: 'none' }), 'edit', spaceOwner)).toBe(false)
  })
})

describe('archived', () => {
  test('everything except reading it back is refused', () => {
    const owner = viewer({ accountId: OWNER })
    const archived = project({ state: 'archived' })

    expect(can(archived, 'read', owner)).toBe(true)
    for (const action of ['edit', 'share', 'own', 'submit', 'remove'] as const) {
      expect(can(archived, action, owner)).toBe(false)
    }
  })
})

describe('exporting', () => {
  /**
   * §7.0's promise, and the five ways it could quietly stop being true.
   *
   * "There is no personal shelf, and leaving with your work is Export" is only
   * a promise if export survives every way somebody loses their footing in a
   * space. The `edit` refusal for an owner outside the space even *says* export
   * it to keep a copy, which would be a lie if export ran the same check.
   */
  test('the owner can always export, however badly things have gone', () => {
    const owner = { accountId: OWNER }

    const cases: [string, ReturnType<typeof project>, XpViewerContext][] = [
      ['ordinary', project(), viewer({ ...owner })],
      ['left the space', project(), viewer({ ...owner, space: null })],
      ['billing lapsed', project(), viewer({ ...owner, space: space({ writable: false }) })],
      ['dropped to xo', project(), viewer({ ...owner, space: space({ tier: 'xo' }) })],
      ['removed from the space', project({ state: 'removed' }), viewer({ ...owner })],
      ['archived', project({ state: 'archived' }), viewer({ ...owner })],
    ]

    for (const [what, subject, who] of cases) {
      const verdict = mayDo(subject, 'export', who)
      expect(`${what}: ${verdict.allowed}`).toBe(`${what}: true`)
    }
  })

  test('a collaborator with edit can export', () => {
    expect(can(project(), 'export', viewer({ grant: 'edit' }))).toBe(true)
  })

  test('somebody who can only look at it cannot take a copy', () => {
    // A zip of a project you can only view is a fork by another route, and
    // §12.5 leaves forking open rather than answering it here.
    expect(can(project(), 'export', viewer({ grant: 'view' }))).toBe(false)
    expect(can(project({ spacePolicy: 'view' }), 'export', viewer())).toBe(false)
  })

  test('a lapsed space can still be got out of by its collaborators', () => {
    // Export reads and does not write, so `canWrite` has no business here.
    const lapsed = viewer({ grant: 'edit', space: space({ writable: false }) })
    expect(can(project(), 'export', lapsed)).toBe(true)
  })
})

describe('the refusal somebody reads', () => {
  /**
   * Found by driving the real endpoints, not by reading the ladder.
   *
   * A collaborator who has left the space held an `edit` grant, so the "who"
   * check passed and they fell through to the owner's message — which told them
   * to export something `export` would also refuse. One message for two very
   * different people, pointing at a second closed door.
   */
  test('a grantee outside the space is not told to export', () => {
    const gone = viewer({ grant: 'edit', space: null })
    const verdict = mayDo(project(), 'edit', gone)

    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) {
      expect(verdict.reason).not.toContain('Export')
      expect(verdict.reason).toContain('no longer in the space')
    }
    // And the door it would have pointed at really is shut.
    expect(can(project(), 'export', gone)).toBe(false)
  })

  test('the owner outside the space still is, because for them it is true', () => {
    const gone = viewer({ accountId: OWNER, space: null })
    const verdict = mayDo(project(), 'edit', gone)

    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('Export')
    expect(can(project(), 'export', gone)).toBe(true)
  })
})
