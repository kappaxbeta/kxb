import { describe, expect, test } from 'bun:test'
import {
  billingDecider,
  decide,
  initialBillingState,
  isWritable,
} from '@/domain/billing/aggregate'
import { type BillingEvent, subscriptionStreamId } from '@/domain/billing/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

/**
 * Payment rules, tested without a Stripe account, a network, or a webhook.
 *
 * This is the payoff of translating Stripe events into domain commands at the
 * edge: the interesting behaviour - what a reversal eight weeks later does to a
 * workspace - is a pure function over past events.
 */

function given(...events: BillingEvent[]) {
  return fold(billingDecider, events)
}

const started: BillingEvent = {
  type: 'SubscriptionStarted',
  data: {
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    priceId: 'price_123',
    amountCents: 2000,
    currency: 'eur',
  },
}

const paid: BillingEvent = {
  type: 'PaymentSucceeded',
  data: { invoiceId: 'in_1', amountCents: 2000, periodEnd: '2026-08-25T00:00:00.000Z' },
}

/** A space that bought the cheap tier, and has paid for it. */
const onXo: BillingEvent[] = [
  {
    type: 'SubscriptionStarted',
    data: {
      stripeCustomerId: 'cus_xo',
      stripeSubscriptionId: 'sub_xo',
      priceId: 'price_xo',
      amountCents: 500,
      currency: 'eur',
      tier: 'xo',
    },
  },
  paid,
]

const PERIOD_END = '2026-09-25T00:00:00.000Z'

describe('access while SEPA settles', () => {
  test('a brand new subscription is writable before any money arrives', () => {
    const state = given(started)
    expect(state.status).toBe('pending')
    expect(isWritable(state.status)).toBe(true)
  })

  test('a single failed debit does not lock the workspace', () => {
    const state = given(started, paid, {
      type: 'PaymentFailed',
      data: { invoiceId: 'in_2', reason: 'AC04 account closed' },
    })
    expect(state.status).toBe('past_due')
    expect(isWritable(state.status)).toBe(true)
  })

  test('suspension is what makes it read-only', () => {
    const state = given(started, {
      type: 'SubscriptionSuspended',
      data: { reason: 'Stripe stopped retrying' },
    })
    expect(isWritable(state.status)).toBe(false)
  })

  test('cancelling makes it read-only too', () => {
    const state = given(started, paid, {
      type: 'SubscriptionCanceled',
      data: { effectiveAt: null },
    })
    expect(isWritable(state.status)).toBe(false)
  })
})

describe('reversals and recovery', () => {
  test('a payment reversed weeks later suspends a previously active workspace', () => {
    const active = given(started, paid)
    expect(active.status).toBe('active')

    const suspended = given(started, paid, {
      type: 'SubscriptionSuspended',
      data: { reason: 'reversed by the bank' },
    })
    expect(suspended.status).toBe('suspended')
    expect(suspended.lastFailureReason).toBe('reversed by the bank')
  })

  test('paying reinstates a suspended workspace with no separate command', () => {
    const state = given(
      started,
      { type: 'SubscriptionSuspended', data: { reason: 'reversed' } },
      paid,
    )
    expect(state.status).toBe('active')
    expect(state.lastFailureReason).toBeNull()
    expect(isWritable(state.status)).toBe(true)
  })
})

describe('webhook redelivery', () => {
  test('re-starting the same Stripe subscription is a no-op', () => {
    const state = given(started)
    expect(
      decide(state, {
        type: 'StartSubscription',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        priceId: 'price_123',
        amountCents: 2000,
        currency: 'eur',
        tier: 'xp',
      }),
    ).toEqual([])
  })

  test('a second, different subscription on a live workspace is rejected', () => {
    const state = given(started)
    expect(() =>
      decide(state, {
        type: 'StartSubscription',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_OTHER',
        priceId: 'price_123',
        amountCents: 2000,
        currency: 'eur',
        tier: 'xp',
      }),
    ).toThrow(DomainError)
  })

  test('a repeated failure after suspension records nothing new', () => {
    const state = given(started, {
      type: 'SubscriptionSuspended',
      data: { reason: 'gave up' },
    })
    expect(
      decide(state, {
        type: 'RecordPaymentFailed',
        invoiceId: 'in_9',
        reason: 'still broke',
      }),
    ).toEqual([])
  })

  test('suspending twice is a no-op', () => {
    const state = given(started, {
      type: 'SubscriptionSuspended',
      data: { reason: 'gave up' },
    })
    expect(decide(state, { type: 'SuspendSubscription', reason: 'again' })).toEqual([])
  })

  test('billing a workspace that never subscribed is rejected', () => {
    expect(() =>
      decide(initialBillingState, {
        type: 'RecordPaymentSucceeded',
        invoiceId: 'in_1',
        amountCents: 2000,
        periodEnd: null,
      }),
    ).toThrow(/no subscription/i)
  })

  test('a cancelled workspace can subscribe again', () => {
    const state = given(started, {
      type: 'SubscriptionCanceled',
      data: { effectiveAt: null },
    })
    expect(
      decide(state, {
        type: 'StartSubscription',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_NEW',
        priceId: 'price_123',
        amountCents: 2000,
        currency: 'eur',
        tier: 'xp',
      }),
    ).toHaveLength(1)
  })
})

describe('tiers', () => {
  test('a subscription started before tiers existed reads as the safe default', () => {
    // `started` has no `tier` in its payload, which is exactly the shape of
    // every event written before the tiers migration. It must not resolve to
    // xp: falling back to the expensive half would hand the XP suite to every
    // historical space at once.
    expect(given(started).tier).toBe('xo')
  })

  test('the tier comes off the event, not the price', () => {
    expect(given(...onXo).tier).toBe('xo')
  })

  test('booking a change records where it is going and when', () => {
    const events = decide(given(...onXo), {
      type: 'ScheduleTierChange',
      to: 'xp',
      effectiveAt: PERIOD_END,
    })

    expect(events).toEqual([
      {
        type: 'SubscriptionTierChangeScheduled',
        data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
      },
    ])
  })

  test('booking a change does not change the tier yet - that is the whole point', () => {
    const state = given(...onXo, {
      type: 'SubscriptionTierChangeScheduled',
      data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
    })

    expect(state.tier).toBe('xo')
    expect(state.pendingTier).toBe('xp')
    expect(state.pendingTierAt).toBe(PERIOD_END)
  })

  test('booking the tier you are already on is refused', () => {
    expect(() =>
      decide(given(...onXo), {
        type: 'ScheduleTierChange',
        to: 'xo',
        effectiveAt: PERIOD_END,
      }),
    ).toThrow(/already on xo/i)
  })

  test('booking the same change twice is a double click, not a second booking', () => {
    const state = given(...onXo, {
      type: 'SubscriptionTierChangeScheduled',
      data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
    })

    expect(
      decide(state, { type: 'ScheduleTierChange', to: 'xp', effectiveAt: PERIOD_END }),
    ).toEqual([])
  })

  test('a space with no live subscription has no plan to change', () => {
    expect(() =>
      decide(initialBillingState, {
        type: 'ScheduleTierChange',
        to: 'xp',
        effectiveAt: PERIOD_END,
      }),
    ).toThrow(DomainError)
  })

  test('the change lands only when Stripe says the price moved', () => {
    const booked = given(...onXo, {
      type: 'SubscriptionTierChangeScheduled',
      data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
    })

    const landed = fold(billingDecider, [
      ...onXo,
      {
        type: 'SubscriptionTierChangeScheduled',
        data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
      },
      {
        type: 'SubscriptionTierChanged',
        data: { from: 'xo', to: 'xp', priceId: 'price_xp', amountCents: 1000 },
      },
    ])

    expect(booked.tier).toBe('xo')
    expect(landed.tier).toBe('xp')
    // Landing clears the booking, so the billing page stops promising a move
    // that already happened.
    expect(landed.pendingTier).toBeNull()
    expect(landed.amountCents).toBe(1000)
  })

  test('the many other subscription.updated events do not append a plan change', () => {
    // Stripe fires customer.subscription.updated for a card change, a tax rate,
    // a renewal. Every one of them arrives here saying "the tier is xo", and
    // without this guard each would write a "plan changed" event to xo.
    expect(
      decide(given(...onXo), {
        type: 'ChangeSubscriptionTier',
        to: 'xo',
        priceId: 'price_xo',
        amountCents: 500,
      }),
    ).toEqual([])
  })

  test('cancelling the booking leaves the tier where it was', () => {
    const state = given(...onXo, {
      type: 'SubscriptionTierChangeScheduled',
      data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
    })

    const events = decide(state, { type: 'CancelTierChange' })
    expect(events).toEqual([
      { type: 'SubscriptionTierChangeCanceled', data: { was: 'xp' } },
    ])

    expect(given(...onXo, ...events).tier).toBe('xo')
    expect(given(...onXo, ...events).pendingTier).toBeNull()
  })

  test('cancelling a booking that does not exist records nothing', () => {
    expect(decide(given(...onXo), { type: 'CancelTierChange' })).toEqual([])
  })

  test('cancelling the subscription drops a booked plan change with it', () => {
    const state = given(
      ...onXo,
      {
        type: 'SubscriptionTierChangeScheduled',
        data: { from: 'xo', to: 'xp', effectiveAt: PERIOD_END },
      },
      { type: 'SubscriptionCanceled', data: { effectiveAt: null } },
    )

    // Otherwise a dead space claims it is moving to xp next month.
    expect(state.pendingTier).toBeNull()
    expect(state.pendingTierAt).toBeNull()
  })

  test('a plan change does not revive a suspended space', () => {
    const state = given(
      ...onXo,
      { type: 'SubscriptionSuspended', data: { reason: 'gave up' } },
      {
        type: 'SubscriptionTierChanged',
        data: { from: 'xo', to: 'xp', priceId: 'price_xp', amountCents: 1000 },
      },
    )

    expect(state.tier).toBe('xp')
    expect(state.status).toBe('suspended')
    expect(isWritable(state.status)).toBe(false)
  })
})

describe('subscriptionStreamId', () => {
  const tenant = '11111111-1111-4111-8111-111111111111'

  test('is stable, so a webhook finds the same stream every time', () => {
    expect(subscriptionStreamId(tenant)).toBe(subscriptionStreamId(tenant))
  })

  test('differs per tenant', () => {
    expect(subscriptionStreamId(tenant)).not.toBe(
      subscriptionStreamId('22222222-2222-4222-8222-222222222222'),
    )
  })

  test('is not the tenant id - that would collide with the tenant stream', () => {
    expect(subscriptionStreamId(tenant)).not.toBe(tenant)
  })

  test('is a well-formed v5 UUID, so Postgres accepts it', () => {
    expect(subscriptionStreamId(tenant)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
