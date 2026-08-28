import { describe, expect, test } from 'bun:test'
import { sectionLabel } from '@/domain/analytics/sections'

/**
 * The label is the only rule in the profiles module - everything else is one
 * RPC and a type. It matters because a column of `/t/:slug/battle/tournaments`
 * is technically correct and nobody reads it.
 */
describe('sectionLabel', () => {
  test('drops the workspace slug, which every route has anyway', () => {
    expect(sectionLabel('/t/:slug/lounge')).toBe('lounge')
    expect(sectionLabel('/v/:slug/lounge')).toBe('lounge')
  })

  test('keeps the trail through nested routes', () => {
    expect(sectionLabel('/t/:slug/battle/tournaments')).toBe('battle › tournaments')
  })

  test('shows an id as a marker rather than a placeholder nobody reads', () => {
    expect(sectionLabel('/t/:slug/pages/:id')).toBe('pages › #')
    expect(sectionLabel('/t/:slug/battle/battlefields/:id/build')).toBe(
      'battle › battlefields › # › build',
    )
  })

  test('names the two roots that would otherwise label as nothing', () => {
    expect(sectionLabel('/t/:slug')).toBe('Workspace')
    expect(sectionLabel('/')).toBe('Home')
  })

  test('leaves a public path alone', () => {
    expect(sectionLabel('/waitlist')).toBe('waitlist')
    expect(sectionLabel('/login')).toBe('login')
  })

  test('an account with no views yet has no busiest section', () => {
    expect(sectionLabel(null)).toBe('Nowhere yet')
  })
})
