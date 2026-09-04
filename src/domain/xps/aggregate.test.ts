import { describe, expect, test } from 'bun:test'
import { decide, evolve, initialXpState, mayEdit, type XpProjectState } from '@/domain/xps/aggregate'
import type { XpCommand } from '@/domain/xps/commands'
import type { XpEvent } from '@/domain/xps/events'
import { DomainError } from '@/es/errors'

/**
 * The rules this stream can actually answer.
 *
 * Membership, the tier and `canWrite` are not on this stream, so none of them
 * are tested here - the action owns those and `commands.ts` says why. What is
 * here is the ownership bargain, which is the part that must not be
 * re-litigated per caller.
 */

const OWNER = 'owner-account'
const OTHER = 'somebody-else'

const fold = (events: XpEvent[]): XpProjectState =>
  events.reduce(evolve, initialXpState)

const run = (state: XpProjectState, command: XpCommand): XpProjectState =>
  decide(state, command).reduce(evolve, state)

const created = (): XpEvent[] => [
  { type: 'XpCreated', data: { name: 'Minigolf', owner: OWNER } },
]

const saved = (version: number): XpEvent => ({
  type: 'XpVersionSaved',
  data: { version, bytes: 1024, files: 3, by: OWNER },
})

describe('creating', () => {
  test('a project starts as a draft owned by whoever made it', () => {
    const state = fold(created())
    expect(state.status).toBe('draft')
    expect(state.owner).toBe(OWNER)
    // The safe direction: private to its owner until they say otherwise, rather
    // than visible to eleven colleagues the moment it exists.
    expect(state.spacePolicy).toBe('none')
  })

  test('creating twice on one stream is refused rather than ignored', () => {
    // The action mints the stream id, so this is a collision and not a retry.
    expect(() =>
      decide(fold(created()), { type: 'CreateXp', actorId: OWNER, name: 'Again' }),
    ).toThrow(DomainError)
  })

  test('a project that arrived from another space records where from', () => {
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
      movedFrom: 'a-stream-in-another-space',
    })
    expect(events[0]).toMatchObject({
      type: 'XpCreated',
      data: { movedFrom: 'a-stream-in-another-space' },
    })
  })

  /**
   * The editor reads this off the log.
   *
   * A project that has never been saved opens on the template it was started
   * from, and `studio/xp/[xpId]` finds that by looking at this event - there is
   * no column. So the field surviving `CreateXp` is not bookkeeping for a
   * funnel report: it is the only thing standing between somebody picking
   * "a room" and being handed an empty one.
   */
  test('a project started from a template records which', () => {
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
      template: 'room',
    })
    expect(events[0]).toMatchObject({ type: 'XpCreated', data: { template: 'room' } })
  })

  test('a project started from nothing claims no template', () => {
    // Absent rather than null: the editor's fallback is "no template", and a
    // field that is present and empty is a third state nothing wants.
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
    })
    expect(events[0].data).not.toHaveProperty('template')
  })

  /**
   * The cartridge's shell, on the same terms as the template.
   *
   * Chosen on the create form, where there is no document yet to hold it, and
   * read back by the editor when it builds the starter - see `startedFrom`. The
   * log is where the choice waits, and this is the assertion that it waits.
   */
  test('a project records the shell its author picked', () => {
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
      finish: 'galaxy',
      hue: 200,
    })
    expect(events[0]).toMatchObject({
      type: 'XpCreated',
      data: { finish: 'galaxy', hue: 200 },
    })
  })

  test('hue zero is red, not silence', () => {
    /*
      The one case worth its own test. Zero is a hue - it is red - and every
      "did they say?" check between the form and the starter document has to be
      a presence check rather than a truthiness one. A single `command.hue &&`
      anywhere in that chain turns an author asking for red into an author
      asking for nothing, and nothing else in the suite would notice.
    */
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
      hue: 0,
    })
    expect(events[0].data).toHaveProperty('hue', 0)
  })

  test('a project with no opinion about its shell records none', () => {
    const events = decide(initialXpState, {
      type: 'CreateXp',
      actorId: OWNER,
      name: 'Minigolf',
    })
    expect(events[0].data).not.toHaveProperty('finish')
    expect(events[0].data).not.toHaveProperty('hue')
  })
})

describe('who may do what', () => {
  test('only the owner can rename, share, transfer or archive', () => {
    const state = fold(created())
    const forbidden: XpCommand[] = [
      { type: 'RenameXp', actorId: OTHER, name: 'Mine now' },
      { type: 'ShareXp', actorId: OTHER, account: OTHER, right: 'edit' },
      { type: 'TransferXp', actorId: OTHER, to: OTHER },
      { type: 'ArchiveXp', actorId: OTHER },
      { type: 'SetXpAccess', actorId: OTHER, spacePolicy: 'edit' },
    ]

    for (const command of forbidden) {
      expect(() => decide(state, command)).toThrow(/Only the owner/)
    }
  })

  test('an edit grant lets somebody save without letting them share', () => {
    const state = fold([
      ...created(),
      { type: 'XpShared', data: { account: OTHER, right: 'edit' } },
    ])

    expect(mayEdit(state, OTHER)).toBe(true)
    expect(decide(state, { type: 'SaveXpVersion', actorId: OTHER, bytes: 10, files: 1 })).toHaveLength(1)
    expect(() =>
      decide(state, { type: 'ShareXp', actorId: OTHER, account: 'a-third', right: 'view' }),
    ).toThrow(/Only the owner/)
  })

  test('a view grant does not let somebody save', () => {
    const state = fold([
      ...created(),
      { type: 'XpShared', data: { account: OTHER, right: 'view' } },
    ])
    expect(mayEdit(state, OTHER)).toBe(false)
    expect(() =>
      decide(state, { type: 'SaveXpVersion', actorId: OTHER, bytes: 10, files: 1 }),
    ).toThrow(DomainError)
  })

  test('a space policy of edit lets anybody the action admits save', () => {
    // This stream cannot check membership, so `edit` here means "the project
    // allows the space to edit" and the action separately checks that the
    // person is in the space. Both are needed and neither is sufficient.
    const state = fold([...created(), { type: 'XpAccessSet', data: { spacePolicy: 'edit' } }])
    expect(mayEdit(state, OTHER)).toBe(true)
  })

  test('revoking a share takes the edit right with it', () => {
    const shared = fold([
      ...created(),
      { type: 'XpShared', data: { account: OTHER, right: 'edit' } },
    ])
    const revoked = run(shared, { type: 'UnshareXp', actorId: OWNER, account: OTHER })
    expect(mayEdit(revoked, OTHER)).toBe(false)
  })

  test('sharing with the owner is a no-op, not an error', () => {
    // What "share with everyone in this list" does when the owner is in the
    // list. Refusing would make the gesture fail for no reason.
    expect(
      decide(fold(created()), { type: 'ShareXp', actorId: OWNER, account: OWNER, right: 'edit' }),
    ).toEqual([])
  })

  test('transferring moves the owning rights entirely', () => {
    const moved = run(fold(created()), { type: 'TransferXp', actorId: OWNER, to: OTHER })
    expect(moved.owner).toBe(OTHER)
    expect(() => decide(moved, { type: 'RenameXp', actorId: OWNER, name: 'Back' })).toThrow(
      /Only the owner/,
    )
  })
})

describe('the space owner can remove, and can never take', () => {
  /**
   * The whole bargain in two tests. An owner cannot squat in a space that no
   * longer wants their project, and a space cannot appropriate work made in it.
   */
  test('somebody who is not the owner can remove it', () => {
    // Whether they own the *space* is not a fact this stream holds; the action
    // checks that, and what arrives here is "somebody entitled has asked".
    const state = fold(created())
    const removed = run(state, { type: 'RemoveXp', actorId: OTHER, reason: 'Not ours' })
    expect(removed.status).toBe('removed')
  })

  test('removing twice is a no-op', () => {
    const removed = fold([...created(), { type: 'XpRemoved', data: { by: OTHER, reason: 'x' } }])
    expect(decide(removed, { type: 'RemoveXp', actorId: OTHER, reason: 'again' })).toEqual([])
  })

  test('removal does not change who owns it', () => {
    const removed = fold([...created(), { type: 'XpRemoved', data: { by: OTHER, reason: 'x' } }])
    expect(removed.owner).toBe(OWNER)
  })

  test('a removed project cannot be saved into or submitted', () => {
    const removed = fold([
      ...created(),
      saved(1),
      { type: 'XpRemoved', data: { by: OTHER, reason: 'x' } },
    ])
    expect(() =>
      decide(removed, { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 }),
    ).toThrow(/removed/)
    expect(() => decide(removed, { type: 'SubmitXp', actorId: OWNER })).toThrow(/removed/)
  })
})

describe('review', () => {
  test('a project with nothing saved cannot be submitted', () => {
    expect(() => decide(fold(created()), { type: 'SubmitXp', actorId: OWNER })).toThrow(
      /Save the project/,
    )
  })

  test('submitting names the version that exists at that moment', () => {
    const state = fold([...created(), saved(1), saved(2)])
    expect(decide(state, { type: 'SubmitXp', actorId: OWNER })[0]).toMatchObject({
      type: 'XpSubmitted',
      data: { version: 2 },
    })
  })

  test('publishing something nobody submitted is refused', () => {
    const state = fold([...created(), saved(1)])
    expect(() => decide(state, { type: 'PublishXp', actorId: 'an-admin' })).toThrow(
      /not waiting for review/,
    )
  })

  /**
   * The single most important rule in the state machine.
   *
   * Publishing approves *a version*, not a project. A system where the next
   * save can change what the store serves is one where the review is theatre.
   */
  test('editing a published project does not move what the store serves', () => {
    let state = fold([...created(), saved(1)])
    state = run(state, { type: 'SubmitXp', actorId: OWNER })
    state = run(state, { type: 'PublishXp', actorId: 'an-admin' })

    expect(state.status).toBe('published')
    expect(state.publishedVersion).toBe(1)

    state = run(state, { type: 'SaveXpVersion', actorId: OWNER, bytes: 99, files: 9 })

    expect(state.currentVersion).toBe(2)
    // The draft moved; the store did not.
    expect(state.publishedVersion).toBe(1)
    expect(state.status).toBe('published')
  })

  test('a rejection sends it back to draft and does not destroy anything', () => {
    let state = fold([...created(), saved(1)])
    state = run(state, { type: 'SubmitXp', actorId: OWNER })
    state = run(state, { type: 'RejectXp', actorId: 'an-admin', reason: 'The gun clips the wall' })

    expect(state.status).toBe('draft')
    expect(state.currentVersion).toBe(1)
    // And it can go round again, which is the whole loop.
    expect(decide(state, { type: 'SubmitXp', actorId: OWNER })).toHaveLength(1)
  })

  test('taking it down keeps which version was live', () => {
    let state = fold([...created(), saved(1)])
    state = run(state, { type: 'SubmitXp', actorId: OWNER })
    state = run(state, { type: 'PublishXp', actorId: 'an-admin' })
    state = run(state, { type: 'UnpublishXp', actorId: 'an-admin', reason: 'A report' })

    expect(state.status).toBe('unlisted')
    // Unlisted rather than a 404: the page that says it was taken down still
    // has to know what it was.
    expect(state.publishedVersion).toBe(1)
  })

  test('withdrawing is the author taking their own submission back', () => {
    let state = fold([...created(), saved(1)])
    state = run(state, { type: 'SubmitXp', actorId: OWNER })
    state = run(state, { type: 'WithdrawXp', actorId: OWNER })
    expect(state.status).toBe('draft')
  })
})

describe('saving', () => {
  test('versions count up from one', () => {
    let state = fold(created())
    state = run(state, { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    state = run(state, { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    expect(state.currentVersion).toBe(2)
  })

  test('a cover is remembered until a save replaces it', () => {
    let state = fold(created())
    state = run(state, {
      type: 'SaveXpVersion',
      actorId: OWNER,
      bytes: 1,
      files: 1,
      cover: 'preview/01.png',
    })
    expect(state.cover).toBe('preview/01.png')

    state = run(state, { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    // A save that says nothing about the cover is not a save that removes it.
    expect(state.cover).toBe('preview/01.png')
  })

  test('a rename that changes nothing emits nothing', () => {
    const state = fold(created())
    expect(decide(state, { type: 'RenameXp', actorId: OWNER, name: 'Minigolf' })).toEqual([])
  })
})

describe('moving out', () => {
  test('only the owner can move it, and it ends this stream', () => {
    const state = fold(created())
    expect(() => decide(state, { type: 'MoveXpOut', actorId: OTHER, to: 'other-space' })).toThrow(
      /Only the owner/,
    )

    const moved = run(state, { type: 'MoveXpOut', actorId: OWNER, to: 'other-space' })
    // A move is a copy - the project continues as a stream in the target space,
    // because every event carries the tenant it was written under and the log
    // is append-only.
    expect(moved.status).toBe('archived')
  })
})

describe('releases', () => {
  const live = (): XpProjectState => {
    let state = fold([...created(), saved(1)])
    state = run(state, { type: 'SubmitXp', actorId: OWNER })
    return run(state, { type: 'PublishXp', actorId: 'an-admin' })
  }

  const shipAgain = (state: XpProjectState): XpProjectState => {
    let next = run(state, { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    next = run(next, { type: 'SubmitXp', actorId: OWNER })
    return run(next, { type: 'PublishXp', actorId: 'an-admin' })
  }

  test('every approved version joins the list, and the list only grows', () => {
    const twice = shipAgain(live())
    expect(twice.releases).toEqual([1, 2])
    expect(twice.publishedVersion).toBe(2)
  })

  test('a save on its own is not a release', () => {
    const state = run(live(), { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    expect(state.currentVersion).toBe(2)
    // Only approval makes a release, which is what keeps the list a set of
    // things review has actually seen.
    expect(state.releases).toEqual([1])
  })

  test('the owner can go back to an earlier release without a second review', () => {
    const back = run(shipAgain(live()), { type: 'RollBackXp', actorId: OWNER, to: 1 })
    expect(back.publishedVersion).toBe(1)
    expect(back.status).toBe('published')
    // And forward again, because the list is unchanged by moving within it.
    expect(run(back, { type: 'RollBackXp', actorId: OWNER, to: 2 }).publishedVersion).toBe(2)
  })

  /**
   * The invariant that keeps rollback from being a way around review: it can
   * only reach versions review has already approved.
   */
  test('rolling back to a version that was never released is refused', () => {
    const state = run(live(), { type: 'SaveXpVersion', actorId: OWNER, bytes: 1, files: 1 })
    expect(() => decide(state, { type: 'RollBackXp', actorId: OWNER, to: 2 })).toThrow(
      /never released/,
    )
  })

  test('only the owner can roll back', () => {
    expect(() =>
      decide(shipAgain(live()), { type: 'RollBackXp', actorId: OTHER, to: 1 }),
    ).toThrow(/Only the owner/)
  })

  test('rolling back to what is already live emits nothing', () => {
    expect(decide(live(), { type: 'RollBackXp', actorId: OWNER, to: 1 })).toEqual([])
  })

  /**
   * A project that was taken down goes live again by being published, not by
   * being pointed at. Otherwise a take-down would be one click from undone by
   * the person it was aimed at.
   */
  test('a taken-down project cannot be rolled back into life', () => {
    const down = run(shipAgain(live()), {
      type: 'UnpublishXp',
      actorId: 'an-admin',
      reason: 'A report',
    })
    expect(down.status).toBe('unlisted')
    expect(() => decide(down, { type: 'RollBackXp', actorId: OWNER, to: 1 })).toThrow(
      /not live/,
    )
  })

  test('a take-down names the release it pulled', () => {
    const events = decide(shipAgain(live()), {
      type: 'UnpublishXp',
      actorId: 'an-admin',
      reason: 'A report',
    })
    expect(events[0]).toMatchObject({ type: 'XpUnpublished', data: { version: 2 } })
  })

  test('a withdrawn release stays available to go back to once live again', () => {
    // The list never shrinks. What stops a pulled release being quietly
    // restored is that going live again is a publish decision.
    const down = run(shipAgain(live()), {
      type: 'UnpublishXp',
      actorId: 'an-admin',
      reason: 'A report',
    })
    expect(down.releases).toEqual([1, 2])
  })
})

describe('pricing a level', () => {
  /**
   * Two prices in one decision. `once` is what it costs to play, paid a single
   * time; `remix` is what it costs to take a copy and change it. Both are free
   * until somebody says otherwise, and nothing about the feature existing
   * changes what an untouched level costs.
   */
  test('a level is free to play and free to fork until it is priced', () => {
    const state = fold(created())
    expect(state.price).toEqual({ once: 0, remix: 0, split: {} })
  })

  test('the owner sets both at once', () => {
    const state = run(fold(created()), {
      type: 'PriceXp', actorId: OWNER, once: 40, remix: 200,
    })
    expect(state.price.once).toBe(40)
    expect(state.price.remix).toBe(200)
  })

  test('nobody else may put a price on somebody s work', () => {
    expect(() =>
      decide(fold(created()), { type: 'PriceXp', actorId: OTHER, once: 40, remix: 0 }),
    ).toThrow(DomainError)
  })

  test('setting the same price again writes nothing', () => {
    const priced = fold([...created(), { type: 'XpPriced', data: { once: 40, remix: 0 } }])
    expect(decide(priced, { type: 'PriceXp', actorId: OWNER, once: 40, remix: 0 })).toEqual([])
  })

  test('a price can be taken back off', () => {
    const priced = fold([...created(), { type: 'XpPriced', data: { once: 40, remix: 10 } }])
    const free = run(priced, { type: 'PriceXp', actorId: OWNER, once: 0, remix: 0 })
    expect(free.price).toEqual({ once: 0, remix: 0, split: {} })
  })

  test('a nonsense price is refused rather than clamped', () => {
    for (const once of [-1, 1.5, 999_999_999, NaN]) {
      expect(() =>
        decide(fold(created()), { type: 'PriceXp', actorId: OWNER, once, remix: 0 }),
      ).toThrow(DomainError)
    }
  })
})

describe('splitting what a remix pays', () => {
  /**
   * What is *not* allocated stays with the owner, so a split need not add to
   * 100 - and deliberately cannot be forced to, because a level whose owner has
   * given away every point is a level they are paid nothing for. That is a
   * mistake rather than a configuration.
   */
  test('a partial split is complete, because the rest is the owner s', () => {
    const state = run(fold(created()), {
      type: 'PriceXp', actorId: OWNER, once: 0, remix: 100, split: { [OTHER]: 30 },
    })
    expect(state.price.split).toEqual({ [OTHER]: 30 })
  })

  test('shares may total exactly the whole', () => {
    const state = run(fold(created()), {
      type: 'PriceXp', actorId: OWNER, once: 0, remix: 100,
      split: { [OTHER]: 60, 'third-person': 40 },
    })
    expect(Object.values(state.price.split).reduce((a, b) => a + b, 0)).toBe(100)
  })

  /**
   * The one that matters. Paying out more than arrived is minting, dressed up
   * as a collaboration - and it would be silent, because each share on its own
   * looks perfectly reasonable.
   */
  test('but never more, which would pay out more than came in', () => {
    expect(() =>
      decide(fold(created()), {
        type: 'PriceXp', actorId: OWNER, once: 0, remix: 100,
        split: { [OTHER]: 60, 'third-person': 60 },
      }),
    ).toThrow(/more than the price/)
  })

  test('a share outside a percentage is meaningless and refused', () => {
    for (const share of [0, -10, 101, 2.5]) {
      expect(() =>
        decide(fold(created()), {
          type: 'PriceXp', actorId: OWNER, once: 0, remix: 100, split: { [OTHER]: share },
        }),
      ).toThrow(DomainError)
    }
  })

  test('no split at all carries no key, so the common case stays small', () => {
    const [event] = decide(fold(created()), {
      type: 'PriceXp', actorId: OWNER, once: 10, remix: 0,
    })
    expect(Object.hasOwn(event.data, 'split')).toBe(false)
  })
})
