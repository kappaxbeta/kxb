import { describe, expect, test } from 'bun:test'
import {
  boardDecider,
  decide,
  evolve,
  initialBoardPostState,
} from '@/domain/board/aggregate'
import type { BoardEvent } from '@/domain/board/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: BoardEvent[]) {
  return fold(boardDecider, events)
}

const ADA = '11111111-1111-4111-8111-111111111111'
const GRACE = '22222222-2222-4222-8222-222222222222'

const published: BoardEvent = {
  type: 'PostPublished',
  data: { body: 'Standup moves to 10:00', pinned: false },
}

describe('board evolve', () => {
  test('replays a notice through its edits', () => {
    const state = given(
      published,
      { type: 'PostEdited', data: { body: 'Standup moves to 10:30' } },
      { type: 'PostPinUpdated', data: { pinned: true } },
    )

    expect(state).toEqual({
      status: 'active',
      body: 'Standup moves to 10:30',
      pinned: true,
      reactions: {},
      sceneId: null,
      imageSlug: null,
    })
  })

  test('collects reactors under each face', () => {
    const state = given(
      published,
      { type: 'PostReacted', data: { emote: 4, userId: ADA } },
      { type: 'PostReacted', data: { emote: 4, userId: GRACE } },
      { type: 'PostReacted', data: { emote: 17, userId: ADA } },
    )

    expect(state.reactions).toEqual({ '4': [ADA, GRACE], '17': [ADA] })
  })

  test('drops a face once its last reactor leaves', () => {
    const state = given(
      published,
      { type: 'PostReacted', data: { emote: 4, userId: ADA } },
      { type: 'PostReacted', data: { emote: 4, userId: GRACE } },
      { type: 'PostUnreacted', data: { emote: 4, userId: GRACE } },
    )
    expect(state.reactions).toEqual({ '4': [ADA] })

    const empty = given(
      published,
      { type: 'PostReacted', data: { emote: 4, userId: ADA } },
      { type: 'PostUnreacted', data: { emote: 4, userId: ADA } },
    )
    expect(empty.reactions).toEqual({})
  })

  test('a replayed reaction does not double up', () => {
    const state = given(
      published,
      { type: 'PostReacted', data: { emote: 9, userId: ADA } },
      { type: 'PostReacted', data: { emote: 9, userId: ADA } },
    )

    expect(state.reactions).toEqual({ '9': [ADA] })
  })

  test('ignores unknown event types instead of throwing', () => {
    const state = evolve(initialBoardPostState, {
      type: 'SomethingFromTheFuture',
      data: {},
    } as unknown as BoardEvent)

    expect(state).toEqual(initialBoardPostState)
  })
})

describe('board decide', () => {
  test('publishing emits PostPublished', () => {
    const events = decide(initialBoardPostState, {
      type: 'PublishPost',
      actorId: ADA,
      body: 'Coffee machine is fixed',
      pinned: true,
      sceneId: null,
      imageSlug: null,
    })

    expect(events).toEqual([
      {
        type: 'PostPublished',
        data: {
          body: 'Coffee machine is fixed',
          pinned: true,
          sceneId: null,
          imageSlug: null,
        },
      },
    ])
  })

  test('publishing carries a scene through to the event', () => {
    const events = decide(initialBoardPostState, {
      type: 'PublishPost',
      actorId: ADA,
      body: 'Look what the team made',
      pinned: false,
      sceneId: '11111111-2222-3333-4444-555555555555',
      imageSlug: null,
    })

    expect(events[0]?.data).toMatchObject({
      sceneId: '11111111-2222-3333-4444-555555555555',
    })
  })

  test('publishing carries a picture through to the event', () => {
    const events = decide(initialBoardPostState, {
      type: 'PublishPost',
      actorId: ADA,
      body: '',
      pinned: false,
      sceneId: null,
      imageSlug: 'Zm9vYmFyYmF6cXV4',
    })

    expect(events[0]?.data).toMatchObject({ imageSlug: 'Zm9vYmFyYmF6cXV4', body: '' })
  })

  test('a notice written before scenes and pictures existed has neither', () => {
    // The stored event has no `sceneId` or `imageSlug` key at all - every
    // notice on every board predates both columns - and `evolve` has to read
    // that as "nothing attached" rather than as undefined leaking into the read
    // model.
    const state = given({
      type: 'PostPublished',
      data: { body: 'Standup at 10', pinned: false },
    })
    expect(state.sceneId).toBeNull()
    expect(state.imageSlug).toBeNull()
  })

  test('publishing over an existing notice is refused', () => {
    expect(() =>
      decide(given(published), {
        type: 'PublishPost',
        actorId: ADA,
        body: 'Something else',
        pinned: false,
        sceneId: null,
        imageSlug: null,
      }),
    ).toThrow(DomainError)
  })

  test('an edit that changes nothing emits nothing', () => {
    expect(
      decide(given(published), {
        type: 'EditPost',
        actorId: ADA,
        body: 'Standup moves to 10:00',
      }),
    ).toEqual([])
  })

  test('reacting emits PostReacted, reacting again takes it back', () => {
    const fresh = given(published)
    expect(decide(fresh, { type: 'ToggleReaction', actorId: ADA, emote: 3 })).toEqual([
      { type: 'PostReacted', data: { emote: 3, userId: ADA } },
    ])

    const reacted = given(published, {
      type: 'PostReacted',
      data: { emote: 3, userId: ADA },
    })
    expect(decide(reacted, { type: 'ToggleReaction', actorId: ADA, emote: 3 })).toEqual([
      { type: 'PostUnreacted', data: { emote: 3, userId: ADA } },
    ])
  })

  test("one person's reaction does not take back another's", () => {
    const reacted = given(published, {
      type: 'PostReacted',
      data: { emote: 3, userId: ADA },
    })

    expect(decide(reacted, { type: 'ToggleReaction', actorId: GRACE, emote: 3 })).toEqual(
      [{ type: 'PostReacted', data: { emote: 3, userId: GRACE } }],
    )
  })

  test('reacting to a notice that is already gone is a quiet no-op', () => {
    const gone = given(published, { type: 'PostDeleted', data: {} })

    expect(decide(gone, { type: 'ToggleReaction', actorId: ADA, emote: 3 })).toEqual([])
  })

  test('editing a taken-down notice is refused', () => {
    const gone = given(published, { type: 'PostDeleted', data: {} })

    expect(() =>
      decide(gone, { type: 'EditPost', actorId: ADA, body: 'back from the dead' }),
    ).toThrow(DomainError)
  })

  test('deleting twice emits nothing the second time', () => {
    const gone = given(published, { type: 'PostDeleted', data: {} })

    expect(decide(gone, { type: 'DeletePost', actorId: ADA })).toEqual([])
  })
})
