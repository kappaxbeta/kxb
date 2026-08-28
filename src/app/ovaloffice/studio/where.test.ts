import { describe, expect, test } from 'bun:test'
import { studioHref } from '@/app/ovaloffice/studio/where'

describe('studioHref', () => {
  test('stays in the space it was pressed in', () => {
    expect(studioHref('image', 'kxb', 'abc')).toBe('/t/kxb/studio/image?s=abc')
    expect(studioHref('video', 'kxb', 'abc')).toBe('/t/kxb/studio/video?v=abc')
  })

  test('is the backoffice page with a key when there is no space', () => {
    expect(studioHref('image', undefined, 'abc')).toBe('/ovaloffice/studio?s=abc')
    expect(studioHref('hero', undefined)).toBe('/ovaloffice/studio?h=')
  })

  test('carries an empty document as a blank editor, not as a missing key', () => {
    expect(studioHref('hero', 'kxb')).toBe('/t/kxb/studio/hero?h=')
  })
})
