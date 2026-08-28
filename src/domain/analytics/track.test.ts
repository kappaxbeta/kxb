import { describe, expect, test } from 'bun:test'
import {
  cleanPath,
  countryOf,
  deviceOf,
  isTrackablePath,
  languageOf,
  pageViewFrom,
  referrerHost,
  visitorHash,
} from '@/domain/analytics/track'

// The salt is read from the environment; the value does not matter to these
// tests, only that hashing is deterministic within a day and not across days.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-salt'

describe('cleanPath', () => {
  test('drops the query string, where ids and tokens live', () => {
    expect(cleanPath('/invitations?token=abc123')).toBe('/invitations')
  })

  test('drops the fragment', () => {
    expect(cleanPath('/pages/1#heading')).toBe('/pages/1')
  })

  test('rejects anything that is not a path', () => {
    expect(cleanPath('https://evil.example/x')).toBeNull()
    expect(cleanPath('')).toBeNull()
  })
})

describe('isTrackablePath', () => {
  test('counts the public site', () => {
    expect(isTrackablePath('/')).toBe(true)
    expect(isTrackablePath('/t/acme/tasks')).toBe(true)
  })

  test('skips the beacon itself and the surface reading the report', () => {
    expect(isTrackablePath('/api/analytics')).toBe(false)
    expect(isTrackablePath('/backoffice/analytics')).toBe(false)
  })

  test('skips the page for asking not to be counted', () => {
    expect(isTrackablePath('/notme')).toBe(false)
  })
})

describe('referrerHost', () => {
  test('keeps an external host, without www', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'kxb.team')).toBe('google.com')
  })

  test('reads our own domain as direct - a click is not acquisition', () => {
    expect(referrerHost('https://kxb.team/login', 'kxb.team')).toBeNull()
  })

  test('ignores the port on the Host header', () => {
    expect(referrerHost('http://127.0.0.1:3000/', '127.0.0.1:3000')).toBeNull()
  })

  test('no referrer is direct', () => {
    expect(referrerHost(null, 'kxb.team')).toBeNull()
    expect(referrerHost('not a url', 'kxb.team')).toBeNull()
  })
})

describe('deviceOf', () => {
  test('buckets the common agents', () => {
    expect(deviceOf('Mozilla/5.0 (Macintosh) Chrome/120')).toBe('desktop')
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile/15E')).toBe('mobile')
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17)')).toBe('tablet')
    expect(deviceOf('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('bot')
  })

  test('a request with no agent at all is not a person', () => {
    expect(deviceOf(null)).toBe('bot')
  })
})

describe('countryOf', () => {
  const headers = (init: Record<string, string>) => new Headers(init)

  test('reads whichever proxy header is present', () => {
    expect(countryOf(headers({ 'cf-ipcountry': 'de' }))).toBe('DE')
    expect(countryOf(headers({ 'x-vercel-ip-country': 'US' }))).toBe('US')
  })

  test('falls back to our own table when no proxy said', () => {
    // The normal path in production: DNS points straight at the box, so no
    // header arrives and the address is all we have. See geo.ts.
    expect(countryOf(headers({ 'x-forwarded-for': '8.8.8.8' }))).toBe('US')
    expect(countryOf(headers({ 'x-real-ip': '2a01:4f8:c17:b8f::1' }))).toBe('DE')
  })

  test('a proxy that says it does not know is not an answer', () => {
    // XX and T1 mean Cloudflare could not tell, so we still have our own look
    // rather than storing the shrug.
    expect(countryOf(headers({ 'cf-ipcountry': 'XX', 'x-forwarded-for': '8.8.8.8' }))).toBe('US')
  })

  test('unknown stays unknown rather than being guessed', () => {
    expect(countryOf(headers({}))).toBeNull()
    expect(countryOf(headers({ 'cf-ipcountry': 'XX' }))).toBeNull()
    expect(countryOf(headers({ 'cf-ipcountry': 'T1' }))).toBeNull()
    // A local request has no country and must not borrow one.
    expect(countryOf(headers({ 'x-forwarded-for': '127.0.0.1' }))).toBeNull()
  })
})

describe('languageOf', () => {
  test('takes the first tag and drops the weight', () => {
    expect(languageOf('de-DE,de;q=0.9,en;q=0.8')).toBe('de-de')
    expect(languageOf(null)).toBeNull()
  })
})

describe('visitorHash', () => {
  const day = new Date('2026-07-29T10:00:00Z')

  test('is the same person twice within a day', () => {
    expect(visitorHash('1.2.3.4', 'Chrome', day)).toBe(
      visitorHash('1.2.3.4', 'Chrome', new Date('2026-07-29T23:59:00Z')),
    )
  })

  test('stops matching at midnight, so nobody can be followed across days', () => {
    expect(visitorHash('1.2.3.4', 'Chrome', day)).not.toBe(
      visitorHash('1.2.3.4', 'Chrome', new Date('2026-07-30T00:01:00Z')),
    )
  })

  test('never contains the address it was made from', () => {
    expect(visitorHash('1.2.3.4', 'Chrome', day)).not.toContain('1.2.3.4')
  })
})

describe('pageViewFrom', () => {
  const headers = new Headers({
    host: 'kxb.team',
    'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120',
    'accept-language': 'de-DE,de;q=0.9',
    'cf-ipcountry': 'DE',
    'x-forwarded-for': '9.9.9.9, 10.0.0.1',
  })

  test('builds the row the endpoint stores', () => {
    const row = pageViewFrom(
      { path: '/pricing?ref=x', referrer: 'https://news.ycombinator.com/item?id=1', userId: null },
      headers,
    )

    expect(row).toMatchObject({
      path: '/pricing',
      referrer_host: 'news.ycombinator.com',
      country: 'DE',
      language: 'de-de',
      device: 'desktop',
      user_id: null,
    })
  })

  test('returns nothing for a path not worth a row', () => {
    expect(pageViewFrom({ path: '/backoffice', referrer: null, userId: null }, headers)).toBeNull()
  })

  test('files a tagged link under its campaign, not as direct', () => {
    // The point of the tag: a link posted in a video app or pasted into a chat
    // arrives with no referrer at all, and would otherwise be indistinguishable
    // from somebody typing the domain.
    const row = pageViewFrom(
      { path: '/demo', referrer: null, search: '?src=tiktok', userId: null },
      headers,
    )

    expect(row?.referrer_host).toBe('src:tiktok')
  })

  test('prefers the campaign to the referrer when a visit has both', () => {
    const row = pageViewFrom(
      {
        path: '/demo',
        referrer: 'https://news.ycombinator.com/item?id=1',
        search: '?src=hn-launch',
        userId: null,
      },
      headers,
    )

    expect(row?.referrer_host).toBe('src:hn-launch')
  })

  test('ignores a query string that is not a campaign', () => {
    const row = pageViewFrom(
      { path: '/demo', referrer: null, search: '?token=secret', userId: null },
      headers,
    )

    // Direct, and the token never touches the row - the path is stored without
    // its query for the same reason.
    expect(row?.referrer_host).toBeNull()
    expect(row?.path).toBe('/demo')
  })
})
