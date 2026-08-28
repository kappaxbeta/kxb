import { describe, expect, test } from 'bun:test'
import { decide, evolve, initialPageState, pagesDecider } from '@/domain/pages/aggregate'
import type { PageEvent } from '@/domain/pages/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: PageEvent[]) {
  return fold(pagesDecider, events)
}

const created: PageEvent = {
  type: 'PageCreated',
  data: { parentId: null, title: 'Getting Started', position: 0 },
}

describe('pages evolve', () => {
  test('replays page creation and updates', () => {
    const state = given(
      created,
      {
        type: 'PageStructureUpdated',
        data: { parentId: null, title: 'Welcome', position: 1 },
      },
      {
        type: 'PageContentUpdated',
        data: { doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
      },
    )

    expect(state).toEqual({
      status: 'active',
      parentId: null,
      title: 'Welcome',
      position: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
  })

  test('ignores unknown event types instead of throwing', () => {
    const state = evolve(initialPageState, {
      type: 'SomethingFromTheFuture',
      data: {},
    } as unknown as PageEvent)

    expect(state).toEqual(initialPageState)
  })
})

describe('pages decide', () => {
  test('creating a page emits PageCreated', () => {
    expect(
      decide(initialPageState, {
        type: 'CreatePage',
        parentId: null,
        title: 'New Page',
        position: 0,
      }),
    ).toEqual([
      {
        type: 'PageCreated',
        data: { parentId: null, title: 'New Page', position: 0 },
      },
    ])
  })

  test('creating an existing page throws DomainError', () => {
    expect(() =>
      decide(given(created), {
        type: 'CreatePage',
        parentId: null,
        title: 'New Page',
        position: 0,
      }),
    ).toThrow(DomainError)
  })

  test('updating structure to identical parameters is a no-op', () => {
    expect(
      decide(given(created), {
        type: 'UpdatePageStructure',
        parentId: null,
        title: 'Getting Started',
        position: 0,
      }),
    ).toEqual([])
  })

  test('deleting a page emits PageDeleted', () => {
    expect(decide(given(created), { type: 'DeletePage' })).toEqual([
      { type: 'PageDeleted', data: {} },
    ])
  })
})
