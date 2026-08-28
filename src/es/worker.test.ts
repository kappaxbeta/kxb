import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Projection } from '@/es/projection'
import type { DomainEvent } from '@/es/types'
import {
  asWorkerProjection,
  checkpointKey,
  pendingWork,
  WORKER_SUFFIX,
  type TenantHead,
} from '@/es/worker'

function projection(name: string): Projection<DomainEvent> {
  return { name, streamTypes: ['whatever'], handle: async () => {} }
}

const chat = projection('chat_messages_read_model')
const tasks = projection('tasks_read_model')

const heads: TenantHead[] = [
  { tenantId: 'quiet', lastSeq: 10 },
  { tenantId: 'busy', lastSeq: 1000 },
]

describe('asWorkerProjection', () => {
  it('reads from its own cursor, never the inline one', () => {
    // The entire design rests on this. Sharing a checkpoint would let the
    // inline pass move it past an event it silently failed to write, hiding
    // that event from the sweep that exists to catch exactly that.
    expect(asWorkerProjection(chat).name).toBe(`chat_messages_read_model${WORKER_SUFFIX}`)
    expect(asWorkerProjection(chat).name).not.toBe(chat.name)
  })

  it('changes nothing else', () => {
    const worker = asWorkerProjection(chat)
    expect(worker.streamTypes).toBe(chat.streamTypes)
    expect(worker.handle).toBe(chat.handle)
  })
})

describe('pendingWork', () => {
  it('treats a projection with no checkpoint as behind by the whole log', () => {
    // Which is how a newly added projection catches itself up with nobody
    // intervening.
    const work = pendingWork(heads, new Map(), [chat])

    expect(work.map((w) => w.tenantId)).toEqual(['busy', 'quiet'])
    expect(work[0]?.behind).toBe(1000)
  })

  it('orders worst backlog first', () => {
    // A run that ends on a deadline must have spent its time on the biggest
    // backlogs. Round-robin would spread a fixed budget over spaces that mostly
    // have nothing to do.
    const checkpoints = new Map([
      [checkpointKey(`chat_messages_read_model${WORKER_SUFFIX}`, 'busy'), 995],
      [checkpointKey(`tasks_read_model${WORKER_SUFFIX}`, 'quiet'), 0],
    ])

    const work = pendingWork(heads, checkpoints, [chat, tasks])

    expect(work[0]).toMatchObject({ tenantId: 'busy', behind: 1000 })
    expect(work.find((w) => w.tenantId === 'busy' && w.projection === chat)?.behind).toBe(5)
  })

  it('skips what is already at the head', () => {
    const checkpoints = new Map([
      [checkpointKey(`chat_messages_read_model${WORKER_SUFFIX}`, 'quiet'), 10],
      [checkpointKey(`chat_messages_read_model${WORKER_SUFFIX}`, 'busy'), 1000],
    ])

    expect(pendingWork(heads, checkpoints, [chat])).toEqual([])
  })

  it('ignores the inline checkpoint of the same name', () => {
    // The inline pass being fully caught up says nothing about whether the
    // sweep is. If this ever reads the wrong key, the sweep silently stops
    // running and everything looks fine.
    const checkpoints = new Map([
      [checkpointKey('chat_messages_read_model', 'busy'), 1000],
      [checkpointKey('chat_messages_read_model', 'quiet'), 10],
    ])

    const work = pendingWork(heads, checkpoints, [chat])

    expect(work).toHaveLength(2)
    expect(work[0]?.behind).toBe(1000)
  })
})

describe('the projection registry', () => {
  it('lists every projection in src/domain', () => {
    // A projection added and not registered is silently not swept, and the
    // symptom is a read model that is *nearly* right. They are module
    // constants rather than runtime registrations, so there is nothing to
    // enumerate - this reads the source instead.
    const domain = join(import.meta.dir, '..', 'domain')

    const onDisk = readdirSync(domain, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          readFileSync(join(domain, name, 'projection.ts'))
          return true
        } catch {
          return false
        }
      })

    const registry = readFileSync(join(domain, 'projections.ts'), 'utf8')

    const missing = onDisk.filter(
      (name) => !registry.includes(`@/domain/${name}/projection'`),
    )

    expect(missing).toEqual([])
  })
})
