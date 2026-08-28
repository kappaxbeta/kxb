import { describe, expect, test } from 'bun:test'
import { xpsProjection } from '@/domain/xps/projection'
import type { XpEvent } from '@/domain/xps/events'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * What the projection writes when a project is created.
 *
 * Narrow on purpose: the row this projection builds is checked against the
 * generated schema by the compiler, so what a test adds is the half a type
 * cannot see — *whether a field is written at all*, and what absent means.
 *
 * That is the whole of docs/xp/backlog.md §1c's storage half. `copiedFrom` has
 * been on `XpCreated` since `copyXp` was written and was dropped here for
 * months without anything failing, which is exactly the class of bug a type
 * check cannot catch: the row was valid, it was just missing a fact.
 */

/** Captures the row handed to `upsert`, and reports no error. */
function capture(): { rows: Record<string, unknown>[]; client: Client } {
  const rows: Record<string, unknown>[] = []
  const client = {
    from() {
      return {
        upsert(row: Record<string, unknown>) {
          rows.push(row)
          return Promise.resolve({ error: null })
        },
      }
    },
  } as unknown as Client
  return { rows, client }
}

const created = (data: Record<string, unknown>): StoredEvent<XpEvent> =>
  ({
    streamId: '33333333-3333-4333-8333-333333333333',
    tenantId: '11111111-1111-4111-8111-111111111111',
    type: 'XpCreated',
    version: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    actorId: null,
    data: { name: 'a level', owner: 'someone', ...data },
  }) as unknown as StoredEvent<XpEvent>

describe('a project being created', () => {
  test('a copy records what it was copied from', async () => {
    const { rows, client } = capture()
    await xpsProjection.handle(client, created({ copiedFrom: 'aaaaaaaa-1111-4111-8111-111111111111' }))

    expect(rows[0]?.copied_from).toBe('aaaaaaaa-1111-4111-8111-111111111111')
  })

  /**
   * Omitted rather than written as null, and the difference is a replay.
   *
   * `upsert` writes every key it is given, so a `copied_from: null` on an event
   * that simply predates the field would *clear* a row the backfill had just
   * filled in. Absent means "this event says nothing", which is the only honest
   * reading of an older event.
   */
  test('a project made from nothing does not claim a source', async () => {
    const { rows, client } = capture()
    await xpsProjection.handle(client, created({}))

    expect(rows[0]).not.toHaveProperty('copied_from')
  })

  test('and the rest of the row is still there', async () => {
    const { rows, client } = capture()
    await xpsProjection.handle(client, created({ copiedFrom: 'aaaaaaaa-1111-4111-8111-111111111111' }))

    expect(rows[0]).toMatchObject({
      id: '33333333-3333-4333-8333-333333333333',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      name: 'a level',
      state: 'draft',
      current_version: 0,
    })
  })
})
