import { describe, expect, it } from 'bun:test'
import { hasSeenTour, TOUR_VERSION } from '@/lib/onboarding'
import { TOUR_STEPS, visibleTourSteps } from '@/app/components/tour-steps'

describe('hasSeenTour', () => {
  it('accepts the current version and nothing else', () => {
    expect(hasSeenTour(TOUR_VERSION)).toBe(true)
    // Whitespace survives a round trip through some proxies.
    expect(hasSeenTour(` ${TOUR_VERSION} `)).toBe(true)
  })

  it('treats a missing or unrecognised value as unseen', () => {
    expect(hasSeenTour(undefined)).toBe(false)
    expect(hasSeenTour('')).toBe(false)
    // The point of versioning the value: a stamp from an older tour does not
    // count as having seen this one.
    expect(hasSeenTour('v0')).toBe(false)
    expect(hasSeenTour('1')).toBe(false)
  })
})

describe('visibleTourSteps', () => {
  it('keeps every panel when there are no flags to resolve', () => {
    // A marketing page has no tenant. It is selling the product rather than
    // describing one deployment of it, so nothing is filtered.
    expect(visibleTourSteps(null)).toHaveLength(TOUR_STEPS.length)
  })

  it('drops panels whose surface this install has switched off', () => {
    const ids = visibleTourSteps({ lounge: true }).map((step) => step.id)

    expect(ids).toContain('lounge')
    // No flag of its own: every space can be joined, so this panel is always
    // true and must survive a run with everything else off.
    expect(ids).toContain('invite')
    expect(ids).not.toContain('build')
    expect(ids).not.toContain('play')
  })

  it('never returns nothing', () => {
    // The tour is reachable from a rail row, so an install with every flag off
    // must still have something to show rather than an empty dialog.
    expect(visibleTourSteps({}).length).toBeGreaterThan(0)
  })
})
