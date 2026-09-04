import { describe, expect, test } from 'bun:test'
import type { HomesteadEvent } from '@/domain/homestead/events'
import { ownerOf } from '@/domain/homestead/projection'
import type { StoredEvent } from '@/es/types'

/**
 * Whose purse an event moves.
 *
 * One function, tested on its own, because it is where coins went missing. The
 * rest of this projection needs a database; this does not, and this is the part
 * that was wrong.
 *
 * The bug it pins: `events.actor_id` is `auth.uid()`, forced by RLS inside
 * `append_events` - `metadata.actorId` does not override it. So the credit half
 * of a transfer, written to the *recipient's* stream by the *sender's* session,
 * carries the sender as its actor. Reading the actor moved the sender's purse,
 * and the version guard on the wrong row then usually skipped the write
 * entirely. Sender debited, nobody credited, nothing logged.
 */

function stored(
  event: HomesteadEvent,
  actorId: string | null,
): StoredEvent<HomesteadEvent> {
  return {
    ...event,
    globalSeq: 1,
    tenantId: 'space',
    streamId: 'stream',
    streamType: 'homestead',
    version: 1,
    actorId,
    createdAt: '2026-09-01T00:00:00.000Z',
  } as StoredEvent<HomesteadEvent>
}

describe('an event on your own stream', () => {
  test('belongs to whoever did it', () => {
    // The original rule, and still right for everything self-inflicted: a
    // catch-up run triggered by one member folds a colleague's events, and the
    // sofa belongs to whoever bought it - not to whoever loaded the page.
    const event = stored(
      { type: 'CoinsSpent', data: { on: 'thing', what: 'a bench', cost: 4 } },
      'buyer',
    )
    expect(ownerOf(event)).toBe('buyer')
  })
})

describe('an event on somebody else s stream', () => {
  test('belongs to the owner it names, not to the actor', () => {
    const event = stored(
      {
        type: 'CoinsReceived',
        data: { from: 'sender', amount: 10, transfer: 't', owner: 'recipient' },
      },
      // The sender is signed in. RLS writes them as the actor even though the
      // event lands on the recipient's stream - this is the whole bug.
      'sender',
    )
    expect(ownerOf(event)).toBe('recipient')
  })

  test('a battle payout credits the winner, not whoever reported the result', () => {
    const event = stored(
      {
        type: 'CoinsEarned',
        data: { amount: 10, reason: 'battle-win', owner: 'winner', what: 'Coliseum' },
      },
      'whoever-ran-the-projection',
    )
    expect(ownerOf(event)).toBe('winner')
  })
})

describe('the edges', () => {
  test('a transfer written before owner existed still falls back to the actor', () => {
    // Faithful rather than correct. Those events were misattributed when they
    // were written and a rebuild reproduces that; the coins are findable in the
    // log by their transfer id, and putting them back is a decision somebody
    // makes, not something a projection may do on its own.
    const event = stored(
      { type: 'CoinsReceived', data: { from: 'sender', amount: 10, transfer: 't' } },
      'sender',
    )
    expect(ownerOf(event)).toBe('sender')
  })

  test('an empty owner is not an owner', () => {
    const event = stored(
      { type: 'CoinsReceived', data: { from: 'a', amount: 1, transfer: 't', owner: '' } },
      'actor',
    )
    expect(ownerOf(event)).toBe('actor')
  })

  test('an event with neither cannot be placed', () => {
    // Skipped rather than written against a null, which would collect every
    // unattributable movement into one row that means nothing.
    const event = stored({ type: 'PropMoved', data: { place: 'cafe', from: '0,0', to: '1,0', rotY: 0 } }, null)
    expect(ownerOf(event)).toBeNull()
  })
})
