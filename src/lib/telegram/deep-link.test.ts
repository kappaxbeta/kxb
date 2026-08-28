import { describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mintGuestToken } from '@/domain/guests/application'
import { guestStart, guestTokenFrom, miniAppLink, startDestination } from './deep-link'
import { atLeast, nameFromInitData, readLaunch, shareHref } from './webapp'

/**
 * The two claims this feature rests on, and one that guards a redirect.
 *
 * The first is an alignment between two modules that do not import each other:
 * the guest token's alphabet and `startapp`'s. Nothing in the type system holds
 * those together, so a test does — and it checks the *real* minter rather than
 * a string that looks like one, because the whole risk is somebody changing
 * `base64url` to `base64` in a file that has no idea Telegram exists.
 *
 * The second is that `startDestination` cannot be talked into a path. It is the
 * only place where a stranger's input becomes somewhere the app navigates to.
 */

describe('the guest token is a legal startapp payload', () => {
  test('every token the app mints is url-safe and short enough', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const token = mintGuestToken()
      // Telegram's stated alphabet for the payload, plus its 512 ceiling. The
      // prefix rides along, because that is what actually gets sent.
      expect(guestStart(token)).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(guestStart(token).length).toBeLessThanOrEqual(512)
    }
  })

  test('a token round-trips through the payload to its own path', () => {
    const token = mintGuestToken()
    expect(startDestination(guestStart(token))).toBe(`/g/${token}`)
  })

  test('base64 rather than base64url would be caught', () => {
    // Not hypothetical: `toString('base64')` is one character away from what
    // the minter does, produces `+` and `/`, and would break links silently.
    const wrong = randomBytes(32).toString('base64')
    expect(startDestination(`g${wrong}`)).toBeNull()
  })
})

describe('startDestination refuses everything else', () => {
  test('no payload at all is null, not the home page', () => {
    // Somebody who opened the Mini App from the menu button rather than a link.
    expect(startDestination(null)).toBeNull()
    expect(startDestination('')).toBeNull()
  })

  test('a path cannot be smuggled in', () => {
    for (const attack of [
      'g../../ovaloffice',
      'ghttps://evil.example',
      '/ovaloffice',
      'g/t/acme',
      'x'.repeat(44),
    ]) {
      const out = startDestination(attack)
      expect(out === null || out.startsWith('/g/')).toBe(true)
    }
  })

  test('a token of the wrong length is not a token', () => {
    expect(startDestination(`g${'a'.repeat(42)}`)).toBeNull()
    expect(startDestination(`g${'a'.repeat(44)}`)).toBeNull()
  })
})

describe('miniAppLink', () => {
  test('builds a direct link from the bare pair', () => {
    expect(miniAppLink('kxb_bot/room', 'gABC')).toBe('https://t.me/kxb_bot/room?startapp=gABC')
  })

  test('tolerates the variable being pasted as a whole URL', () => {
    // The value a person is most likely to copy out of BotFather.
    expect(miniAppLink('https://t.me/kxb_bot/room', 'gABC')).toBe(
      'https://t.me/kxb_bot/room?startapp=gABC',
    )
    expect(miniAppLink('/kxb_bot/room/', 'gABC')).toBe('https://t.me/kxb_bot/room?startapp=gABC')
  })

  test('no Mini App configured means no link, rather than a broken one', () => {
    expect(miniAppLink(null, 'gABC')).toBeNull()
    // A half-filled variable is the same answer: switching apps and *then*
    // failing is worse than never offering the button.
    expect(miniAppLink('kxb_bot', 'gABC')).toBeNull()
    expect(miniAppLink('kxb bot/room', 'gABC')).toBeNull()
  })
})

describe('readLaunch', () => {
  const hash =
    '#tgWebAppData=user%3D%7B%7D%26hash%3Dabc' +
    '&tgWebAppVersion=8.0' +
    '&tgWebAppPlatform=ios' +
    '&tgWebAppStartParam=gTOKEN'

  test('reads the fragment Telegram actually launches with', () => {
    const launch = readLaunch('', hash)
    expect(launch).toEqual({
      platform: 'ios',
      version: '8.0',
      startParam: 'gTOKEN',
      initData: 'user={}&hash=abc',
    })
  })

  test('reads the same params out of a query string', () => {
    expect(readLaunch(hash.replace('#', '?'), '')?.platform).toBe('ios')
  })

  test('an ordinary browser is not Telegram', () => {
    expect(readLaunch('', '')).toBeNull()
    expect(readLaunch('?look=dark', '#section')).toBeNull()
    // A start param with no platform is not a launch - it is somebody who
    // copied half a fragment into an ordinary tab.
    expect(readLaunch('', '#tgWebAppStartParam=gTOKEN')).toBeNull()
  })

  test('a launch from the menu button has no start param', () => {
    const launch = readLaunch('', '#tgWebAppPlatform=android&tgWebAppVersion=7.0')
    expect(launch?.startParam).toBeNull()
    expect(startDestination(launch?.startParam)).toBeNull()
  })
})

describe('guestTokenFrom', () => {
  test('recovers the token from a link the action handed back', () => {
    const token = mintGuestToken()
    expect(guestTokenFrom(`https://kxb.team/g/${token}`)).toBe(token)
    expect(guestTokenFrom(`https://kxb.team/g/${token}/`)).toBe(token)
    expect(guestTokenFrom(`https://kxb.team/g/${token}?utm=x#top`)).toBe(token)
  })

  test('a URL that is not a guest link yields nothing', () => {
    // The share panel drops its QR to the plain link rather than guessing.
    expect(guestTokenFrom('https://kxb.team/t/acme')).toBeNull()
    expect(guestTokenFrom('https://kxb.team/')).toBeNull()
  })
})

describe('sharing a Mini App link through the share sheet', () => {
  /**
   * The share button sends the `t.me` link, not the https one, and that is the
   * only route into the Mini App there is - an https link shared into a chat
   * opens Telegram's in-app browser instead.
   *
   * Which puts one URL inside another, and the inner one carries its own `?`.
   * Left unencoded, Telegram would read `startapp` as a parameter of the share
   * endpoint rather than of the link being shared, and the recipient would get
   * the Mini App's front door with no token on it.
   */
  test('the nested startapp survives being put inside a share URL', () => {
    const token = mintGuestToken()
    const deep = miniAppLink('kxb_bot/room', guestStart(token))!
    const href = shareHref(deep, 'Come and join me in here')

    // The `?` of the inner URL must not still be a `?` in the outer one.
    expect(href.startsWith('https://t.me/share/url?')).toBe(true)
    expect(href.slice('https://t.me/share/url?'.length)).not.toContain('?')

    // And it must come back out intact on the other side.
    const shared = new URLSearchParams(new URL(href).search).get('url')
    expect(shared).toBe(deep)
    expect(new URL(shared!).searchParams.get('startapp')).toBe(guestStart(token))
  })
})

describe('nameFromInitData', () => {
  const user = { id: 7, first_name: 'Ada', last_name: 'Lovelace', username: 'ada' }
  const initData = `user=${encodeURIComponent(JSON.stringify(user))}&auth_date=1&hash=abc`

  test('reads a name without the SDK having loaded', () => {
    // The point of the whole function: the door prefills on first paint, and
    // telegram-web-app.js is nowhere near ready then.
    expect(nameFromInitData(initData)).toBe('Ada Lovelace')
  })

  test('falls back to the username when there is no display name', () => {
    const bare = `user=${encodeURIComponent(JSON.stringify({ id: 7, username: 'ada' }))}`
    expect(nameFromInitData(bare)).toBe('ada')
  })

  test('nothing to prefill is null, never a crash', () => {
    expect(nameFromInitData(null)).toBeNull()
    expect(nameFromInitData('')).toBeNull()
    expect(nameFromInitData('auth_date=1&hash=abc')).toBeNull()
    // Malformed JSON in a value the client controls. The door must still render.
    expect(nameFromInitData('user=%7Bnot-json')).toBeNull()
  })
})

describe('atLeast', () => {
  test('gates the versions this app actually checks', () => {
    // 7.7 is disableVerticalSwipes, 8.0 is fullscreen. Both are the difference
    // between a usable room and an app that closes when you look up.
    expect(atLeast('7.7', '7.7')).toBe(true)
    expect(atLeast('7.10', '7.7')).toBe(true)
    expect(atLeast('7.6', '7.7')).toBe(false)
    expect(atLeast('8.0', '7.7')).toBe(true)
    expect(atLeast('6.0', '8.0')).toBe(false)
  })

  test('does not compare versions as decimals', () => {
    // The trap: 7.10 parsed as a number is 7.1, and less than 7.7.
    expect(atLeast('7.10', '7.9')).toBe(true)
  })

  test('survives a version it cannot parse', () => {
    expect(atLeast('', '7.7')).toBe(false)
    expect(atLeast('nonsense', '7.7')).toBe(false)
  })
})
