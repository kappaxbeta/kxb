import { describe, expect, test } from 'bun:test'
import { countryForIp, parseIpv4, parseIpv6Prefix } from '@/domain/analytics/geo'

/**
 * The addresses below are picked because they are stable, public and famous:
 * they are registry allocations to organisations that have held them for years,
 * so a rebuild of the table should not move them. If one of these ever fails
 * after `bun run scripts/update-geoip.ts`, the table changed, not the code.
 *
 * They assert the *registry's* country, which is the only thing this data can
 * say - 1.1.1.1 answers from everywhere and is registered to APNIC in Australia.
 */

describe('parseIpv4', () => {
  test('reads a dotted quad', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0)
    expect(parseIpv4('1.2.3.4')).toBe(0x01020304)
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff)
  })

  test('rejects what only looks numeric', () => {
    expect(parseIpv4('1.2.3')).toBeNull()
    expect(parseIpv4('1.2.3.256')).toBeNull()
    expect(parseIpv4('1.2.3.')).toBeNull()
    expect(parseIpv4('1.2.3.1e2')).toBeNull()
    expect(parseIpv4('nope')).toBeNull()
  })
})

describe('parseIpv6Prefix', () => {
  test('keeps the top 64 bits and drops the rest', () => {
    // The interface half is not part of the key, so two addresses in one /64
    // are the same lookup.
    expect(parseIpv6Prefix('2a01:4f8:c17:b8f::1')).toBe(
      parseIpv6Prefix('2a01:4f8:c17:b8f:ffff:ffff:ffff:ffff'),
    )
  })

  test('expands the compressed run', () => {
    expect(parseIpv6Prefix('2001:db8::1')).toBe(0x20010db800000000n)
    expect(parseIpv6Prefix('::')).toBe(0n)
  })

  test('reads a mapped v4 as v4, not v6', () => {
    // Otherwise `::ffff:8.8.8.8` searches the v6 table, where it is not.
    expect(parseIpv6Prefix('::ffff:8.8.8.8')).toBeNull()
  })

  test('ignores a zone id and rejects nonsense', () => {
    expect(parseIpv6Prefix('fe80::1%eth0')).toBe(0xfe80000000000000n)
    expect(parseIpv6Prefix('2001::db8::1')).toBeNull()
    expect(parseIpv6Prefix('gggg::1')).toBeNull()
    expect(parseIpv6Prefix('1.2.3.4')).toBeNull()
  })
})

describe('countryForIp', () => {
  test('places well-known v4 allocations', () => {
    expect(countryForIp('8.8.8.8')).toBe('US')
    expect(countryForIp('1.1.1.1')).toBe('AU')
  })

  test('places v6 too', () => {
    expect(countryForIp('2001:4860:4860::8888')).toBe('US')
    expect(countryForIp('2a01:4f8:c17:b8f::1')).toBe('DE')
  })

  test('unwraps the forms an address arrives in', () => {
    expect(countryForIp('::ffff:8.8.8.8')).toBe('US')
    expect(countryForIp('[2606:4700:4700::1111]')).toBe('US')
    expect(countryForIp('  8.8.8.8  ')).toBe('US')
  })

  test('a private address is a proxy that did not forward, not a place', () => {
    expect(countryForIp('127.0.0.1')).toBeNull()
    expect(countryForIp('10.0.0.1')).toBeNull()
    expect(countryForIp('192.168.1.5')).toBeNull()
    expect(countryForIp('172.16.0.1')).toBeNull()
    expect(countryForIp('169.254.1.1')).toBeNull()
    expect(countryForIp('::1')).toBeNull()
    expect(countryForIp('fe80::1')).toBeNull()
    expect(countryForIp('fd00::1')).toBeNull()
  })

  test('a carrier NAT pool belongs to the carrier, not to a country', () => {
    expect(countryForIp('100.64.0.1')).toBeNull()
  })

  test('unknown input stays unknown rather than being guessed', () => {
    expect(countryForIp(null)).toBeNull()
    expect(countryForIp('unknown')).toBeNull()
    expect(countryForIp('')).toBeNull()
    expect(countryForIp('not-an-ip')).toBeNull()
    expect(countryForIp('0.0.0.0')).toBeNull()
  })

  test('every answer is a plausible ISO-3166 code', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2a01:4f8:c17:b8f::1']) {
      expect(countryForIp(ip)).toMatch(/^[A-Z]{2}$/)
    }
  })
})
