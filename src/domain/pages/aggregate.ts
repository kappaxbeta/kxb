import type { PageCommand } from '@/domain/pages/commands'
import { PAGE_STREAM_TYPE, type PageEvent } from '@/domain/pages/events'
import { DomainError } from '@/es/errors'
import type { Decider, JsonValue } from '@/es/types'

export interface PageState {
  status: 'none' | 'active' | 'deleted'
  parentId: string | null
  title: string
  position: number
  doc: JsonValue
}

export const initialPageState: PageState = {
  status: 'none',
  parentId: null,
  title: '',
  position: 0,
  doc: { type: 'doc', content: [] },
}

export function evolve(state: PageState, event: PageEvent): PageState {
  switch (event.type) {
    case 'PageCreated':
      return {
        status: 'active',
        parentId: event.data.parentId,
        title: event.data.title,
        position: event.data.position,
        doc: { type: 'doc', content: [] },
      }
    case 'PageStructureUpdated':
      return {
        ...state,
        parentId: event.data.parentId,
        title: event.data.title,
        position: event.data.position,
      }
    case 'PageContentUpdated':
      return {
        ...state,
        doc: event.data.doc,
      }
    case 'PageDeleted':
      return {
        ...state,
        status: 'deleted',
      }
    default:
      return state
  }
}

export function decide(state: PageState, command: PageCommand): PageEvent[] {
  switch (command.type) {
    case 'CreatePage': {
      if (state.status !== 'none') {
        throw new DomainError('This page already exists', 'page_exists')
      }
      return [
        {
          type: 'PageCreated',
          data: {
            parentId: command.parentId,
            title: command.title,
            position: command.position,
          },
        },
      ]
    }

    case 'UpdatePageStructure': {
      assertActive(state)
      if (
        state.parentId === command.parentId &&
        state.title === command.title &&
        state.position === command.position
      ) {
        return []
      }
      return [
        {
          type: 'PageStructureUpdated',
          data: {
            parentId: command.parentId,
            title: command.title,
            position: command.position,
          },
        },
      ]
    }

    case 'UpdatePageContent': {
      assertActive(state)
      if (JSON.stringify(state.doc) === JSON.stringify(command.doc)) {
        return []
      }
      return [
        {
          type: 'PageContentUpdated',
          data: { doc: command.doc },
        },
      ]
    }

    case 'DeletePage': {
      if (state.status === 'none') {
        throw new DomainError('Page not found', 'page_not_found')
      }
      if (state.status === 'deleted') return []
      return [{ type: 'PageDeleted', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function assertActive(state: PageState): void {
  if (state.status === 'none') {
    throw new DomainError('Page not found', 'page_not_found')
  }
  if (state.status === 'deleted') {
    throw new DomainError('This page has been deleted', 'page_deleted')
  }
}

export const pagesDecider: Decider<PageState, PageCommand, PageEvent> = {
  streamType: PAGE_STREAM_TYPE,
  initialState: initialPageState,
  evolve,
  decide,
}
