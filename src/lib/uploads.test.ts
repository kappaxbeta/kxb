import { describe, expect, test } from 'bun:test'
import { isSafeStorageKey, storageKeyFor } from '@/lib/uploads'

/**
 * The containment check, which is the one piece of the Storage move that is
 * load-bearing for security.
 *
 * Storage keys are not filesystem paths, so `..` does not reach `/etc/passwd`.
 * It reaches something more useful to an attacker and easier to miss: another
 * workspace's prefix, in an app where the prefix *is* the tenant boundary.
 */

const TENANT = '3f6c2b4e-9a1d-4c8f-8b0e-2d5a7c1e4f90'

describe('storageKeyFor', () => {
  test('is the tenant prefix plus a content address', () => {
    expect(storageKeyFor(TENANT, 'abc123', 'png')).toBe(`${TENANT}/abc123.png`)
  })

  test('round-trips through the safety check', () => {
    expect(isSafeStorageKey(storageKeyFor(TENANT, 'abc123', 'webp'))).toBe(true)
  })
})

describe('isSafeStorageKey', () => {
  test('accepts a key this app mints', () => {
    expect(isSafeStorageKey(`${TENANT}/deadbeef.jpg`)).toBe(true)
  })

  test('rejects a traversal out of the tenant prefix', () => {
    expect(isSafeStorageKey(`${TENANT}/../other/x.png`)).toBe(false)
    expect(isSafeStorageKey('../x.png')).toBe(false)
    expect(isSafeStorageKey(`${TENANT}/..`)).toBe(false)
  })

  test('rejects keys that read as one thing and address another', () => {
    expect(isSafeStorageKey(`/${TENANT}/x.png`)).toBe(false)
    expect(isSafeStorageKey(`${TENANT}//x.png`)).toBe(false)
    expect(isSafeStorageKey(`${TENANT}\\x.png`)).toBe(false)
    expect(isSafeStorageKey(`${TENANT}/x.png\0.txt`)).toBe(false)
  })

  test('rejects anything that is not exactly tenant/file', () => {
    expect(isSafeStorageKey('x.png')).toBe(false)
    expect(isSafeStorageKey(`${TENANT}/nested/x.png`)).toBe(false)
    expect(isSafeStorageKey('')).toBe(false)
    expect(isSafeStorageKey(`${TENANT}/`)).toBe(false)
  })

  test('rejects an absurdly long key', () => {
    expect(isSafeStorageKey(`${TENANT}/${'a'.repeat(300)}.png`)).toBe(false)
  })
})
