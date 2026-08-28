import { describe, expect, it } from 'bun:test'
import { spaceSlugFromPath } from '@/lib/last-space'

describe('spaceSlugFromPath', () => {
  it('takes the slug from any page inside a workspace', () => {
    expect(spaceSlugFromPath('/t/acme')).toBe('acme')
    expect(spaceSlugFromPath('/t/acme/lounge')).toBe('acme')
    expect(spaceSlugFromPath('/t/acme/battle/123')).toBe('acme')
  })

  it('ignores everything outside /t', () => {
    expect(spaceSlugFromPath('/')).toBeNull()
    expect(spaceSlugFromPath('/tenants')).toBeNull()
    // The public visitor lounge is not a space you are a member of.
    expect(spaceSlugFromPath('/v/acme')).toBeNull()
  })

  it('refuses anything that is not a legal slug', () => {
    // Traversal, whitespace and the reserved shapes all end up in a redirect
    // header if they get through, so none of them may be remembered.
    expect(spaceSlugFromPath('/t/..%2F..%2Fetc')).toBeNull()
    expect(spaceSlugFromPath('/t/a')).toBeNull()
    expect(spaceSlugFromPath('/t/-acme')).toBeNull()
    expect(spaceSlugFromPath('/t/acme%0Aevil')).toBeNull()
    expect(spaceSlugFromPath(`/t/${'x'.repeat(41)}`)).toBeNull()
  })
})
