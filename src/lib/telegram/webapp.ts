/**
 * Telegram's Mini App container, as much of it as a 3D room needs.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * A guest link pasted into a Telegram chat already opens — Telegram's in-app
 * browser takes any https URL. What it opens into is a WebView with a URL bar,
 * a toolbar, and no way to tell Telegram that a vertical drag means "look up"
 * rather than "close this". For a marketing page that is fine. For a room you
 * walk around in it is the difference between a product and a demo that shuts
 * itself.
 *
 * A Mini App is the same WebView with those three things fixed, and the price
 * is a bot, a script from telegram.org, and this file.
 *
 * ---------------------------------------------------------------------------
 * The fragment problem, which is the whole reason for `sessionStorage`
 * ---------------------------------------------------------------------------
 * Telegram launches a Mini App by opening its configured URL with everything it
 * has to say in the *fragment*: `#tgWebAppPlatform=ios&tgWebAppStartParam=…`.
 * Two consequences run through this module.
 *
 * First, a fragment never reaches the server, so nothing about being inside
 * Telegram can be known while rendering. Every decision here is client-side by
 * necessity, not by preference.
 *
 * Second, the fragment survives exactly one page. `/tg` reads the start param
 * and immediately routes to `/g/<token>`, and that navigation drops it — so a
 * page that asked "am I in Telegram?" the honest way, by looking at its own
 * URL, would be told yes once and no forever after. Hence the stash: the launch
 * is read once, on whichever page Telegram opened, and kept for the tab.
 *
 * `sessionStorage` rather than a cookie or a store: it is scoped to the tab,
 * which is exactly the lifetime of a Mini App session, and it survives the full
 * page loads that a route group boundary can still cause. A React context would
 * be lost by those; a cookie would outlive the container and leave an ordinary
 * Safari tab believing it had a Telegram toolbar to talk to.
 */

/** Where the launch is kept once its fragment has been navigated away from. */
const LAUNCH_KEY = 'tg:launch'

export interface Launch {
  /** `ios`, `android`, `tdesktop`, `weba`… — left as a string on purpose. */
  platform: string
  /** The Bot API version *this client* implements, e.g. `8.0`. */
  version: string
  /** Whatever rode in on `?startapp=`. */
  startParam: string | null
  /**
   * The signed blob.
   *
   * Kept because a server that wants to trust the Telegram identity needs it,
   * and deliberately not parsed here: anything read out of it on the client is
   * a claim, not a fact, and the only thing that turns it into a fact is an
   * HMAC check against the bot token — which lives on the server.
   */
  initData: string | null
}

/**
 * A launch out of a query string and a fragment.
 *
 * Pure, and separated from the browser for the usual reason: this is the piece
 * that decides whether the app believes it is inside Telegram, and a wrong
 * answer here is a page that disables its own scrolling in ordinary Safari.
 *
 * Both halves are read because the two documented shapes disagree. The direct
 * link puts them in the fragment; some desktop clients have historically passed
 * them as an ordinary query. Reading both costs one line and removes a class of
 * "works on Android, blank on desktop" bug that is miserable to chase.
 */
export function readLaunch(search: string, hash: string): Launch | null {
  const from = (text: string) =>
    new URLSearchParams(text.startsWith('#') || text.startsWith('?') ? text.slice(1) : text)

  const fragment = from(hash)
  const query = from(search)
  const get = (key: string) => fragment.get(key) ?? query.get(key)

  // `tgWebAppPlatform` is the tell. It is present on every launch and on
  // nothing else, whereas `tgWebAppStartParam` is absent whenever somebody
  // opened the app from the menu button rather than from a link.
  const platform = get('tgWebAppPlatform')
  if (!platform) return null

  return {
    platform,
    version: get('tgWebAppVersion') ?? '6.0',
    startParam: get('tgWebAppStartParam'),
    initData: get('tgWebAppData'),
  }
}

/**
 * The launch for this tab, reading it out of the URL the first time.
 *
 * Safe to call from anywhere at any time, including before the Telegram script
 * has loaded — it only looks at the address bar. Returns null in an ordinary
 * browser, which is the answer every caller here branches on.
 */
export function launch(): Launch | null {
  if (typeof window === 'undefined') return null

  const fresh = readLaunch(window.location.search, window.location.hash)
  if (fresh) {
    try {
      window.sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(fresh))
    } catch {
      // Storage denied — a locked-down WebView, or private mode on an old
      // iOS. The launch is still returned, so the page Telegram opened
      // behaves correctly; only later pages lose the memory of it. That is a
      // missing toolbar tweak, not a broken app.
    }
    return fresh
  }

  try {
    const kept = window.sessionStorage.getItem(LAUNCH_KEY)
    return kept ? (JSON.parse(kept) as Launch) : null
  } catch {
    return null
  }
}

/** Whether this tab is a Mini App. */
export function insideTelegram(): boolean {
  return launch() !== null
}

/**
 * Dotted version comparison, for the capability gates below.
 *
 * The SDK ships `isVersionAtLeast`, and it is used in preference to this
 * wherever the script has loaded. This exists for the window before that — and
 * because the SDK's own copy is unreachable from a test.
 */
export function atLeast(have: string, want: string): boolean {
  const parse = (text: string) => text.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const mine = parse(have)
  const theirs = parse(want)
  for (let index = 0; index < Math.max(mine.length, theirs.length); index += 1) {
    const a = mine[index] ?? 0
    const b = theirs[index] ?? 0
    if (a !== b) return a > b
  }
  return true
}

/**
 * The bits of `window.Telegram.WebApp` this app touches.
 *
 * Hand-written rather than pulled from `@twa-dev/types`, and the trade is
 * deliberate: this is a dozen members out of about a hundred, every one of them
 * optional because the client on the other side may be three years old, and a
 * dependency would give a *complete* type whose completeness is a lie — it
 * would let a call to a Bot API 9 method type-check against a phone that
 * implements Bot API 6.
 */
interface WebApp {
  ready?: () => void
  expand?: () => void
  close?: () => void
  version?: string
  platform?: string
  isVersionAtLeast?: (version: string) => boolean
  disableVerticalSwipes?: () => void
  enableVerticalSwipes?: () => void
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  lockOrientation?: () => void
  unlockOrientation?: () => void
  openTelegramLink?: (url: string) => void
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
  showScanQrPopup?: (params: { text?: string }, callback?: (text: string) => boolean) => void
  closeScanQrPopup?: () => void
  HapticFeedback?: { impactOccurred?: (style: string) => void }
  initDataUnsafe?: {
    start_param?: string
    user?: { id?: number; first_name?: string; last_name?: string; username?: string }
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp }
  }
}

/** The SDK, once its script has run. Null everywhere else, including too early. */
export function webApp(): WebApp | null {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

/** Whether the client implements a given Bot API version. */
function supports(version: string): boolean {
  const app = webApp()
  if (app?.isVersionAtLeast) return app.isVersionAtLeast(version)
  const known = launch()?.version
  return known ? atLeast(known, version) : false
}

/**
 * Tell Telegram the page is up, and take the sheet off its leash.
 *
 * Three calls, in an order that matters, and none of them optional for a room
 * somebody walks around in:
 *
 * - `ready()` dismisses the loading placeholder. Without it the app is drawn
 *   under a spinner that never stops.
 * - `expand()` opens the sheet to full height. A Mini App opens at roughly half
 *   the screen, which is right for a form and absurd for a 3D world.
 * - `disableVerticalSwipes()` is the one that actually matters. Telegram reads
 *   a downward drag anywhere in the WebView as "dismiss", and this app's look
 *   control *is* a vertical drag — so without it, looking up closes the app.
 *   Bot API 7.7, hence the gate; on an older client the room still works and
 *   the camera is just awkward, which is the correct degradation.
 *
 * Returns a teardown that puts the swipe back, so a component can hold this for
 * as long as it is the thing on screen without leaving the setting behind.
 */
export function settle(): () => void {
  const app = webApp()
  if (!app) return () => {}

  app.ready?.()
  app.expand?.()

  if (supports('7.7')) {
    app.disableVerticalSwipes?.()
    return () => app.enableVerticalSwipes?.()
  }

  return () => {}
}

/**
 * Full screen, for the world and nothing else.
 *
 * Separate from `settle` because it is the one setting with a wrong place to
 * use it: a marketing page that swallows Telegram's own header has taken away
 * the back button and given nothing back. A room has its own navigation and
 * wants every pixel.
 *
 * The orientation lock rides along for the same reason it does in a native
 * game — a phone rotating mid-match is never what the person holding it meant.
 * Both are Bot API 8.0 and both are allowed to be missing.
 */
export function fullscreen(): () => void {
  const app = webApp()
  if (!app || !supports('8.0')) return () => {}

  app.requestFullscreen?.()
  app.lockOrientation?.()

  return () => {
    app.exitFullscreen?.()
    app.unlockOrientation?.()
  }
}

/**
 * The name out of a raw `initData` blob.
 *
 * Pure, and the reason it exists separately is timing rather than testing. The
 * SDK's `initDataUnsafe` is only there once `telegram-web-app.js` has run, and
 * the door renders its name field before that — a prefill that arrives two
 * hundred milliseconds late lands after somebody has started typing, and
 * overwriting a half-typed name is worse than never offering one.
 *
 * `initData` itself is in the launch parameters, which came out of the URL and
 * are in `sessionStorage` from the first paint. So this route has the answer
 * synchronously, on the first render, with no script involved.
 */
export function nameFromInitData(initData: string | null | undefined): string | null {
  if (!initData) return null
  try {
    const raw = new URLSearchParams(initData).get('user')
    if (!raw) return null
    const user = JSON.parse(raw) as { first_name?: string; last_name?: string; username?: string }
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    return name || user.username || null
  } catch {
    return null
  }
}

/**
 * The name Telegram thinks this person has.
 *
 * Used to *prefill* the door's name field and for nothing else. Both sources
 * are the client's word for it — `initDataUnsafe` is named that way by Telegram
 * for a good reason, and the query string it is parsed from is the same claim
 * in a different shape. Neither is checked here, and neither can be: the only
 * thing that turns `initData` into a fact is an HMAC against the bot token, on
 * the server.
 *
 * Prefilling is the right use of an unverified claim. The worst case is that
 * somebody edits a name they were going to type anyway. Trusting it to skip the
 * door would be a different feature and would need that HMAC first.
 */
export function claimedName(): string | null {
  const early = nameFromInitData(launch()?.initData)
  if (early) return early

  const user = webApp()?.initDataUnsafe?.user
  if (!user) return null
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return name || user.username || null
}

/**
 * Hand a link to Telegram's own share sheet.
 *
 * `t.me/share/url` is the ordinary web share endpoint and works in any browser,
 * which is why the URL is built the same way in both branches. What differs is
 * how it is *opened*: inside a Mini App, an ordinary anchor to t.me would load
 * Telegram's website inside Telegram, which is a memorable kind of broken.
 * `openTelegramLink` hands it to the client instead, and the client shows the
 * chat picker.
 *
 * Returns whether it was handled here. False means the caller should let a
 * plain link do its job.
 */
export function shareVia(url: string, text: string): boolean {
  const app = webApp()
  if (!app?.openTelegramLink) return false
  app.openTelegramLink(shareHref(url, text))
  return true
}

/** The share URL, which is worth having separately so an anchor can use it too. */
export function shareHref(url: string, text: string): string {
  const params = new URLSearchParams({ url, text })
  return `https://t.me/share/url?${params.toString()}`
}

/**
 * Telegram's own QR scanner.
 *
 * This is the single best thing the container gives this app, and it is worth
 * saying why: reading a QR code in a browser needs `BarcodeDetector`, Safari
 * does not have it, and so the nearby handshake has always had a text box where
 * it wanted a camera. Inside Telegram there is a native scanner on *both*
 * platforms, and it is one call.
 *
 * The callback returns `true` to dismiss the popup — the API's way of saying
 * "this is the code I wanted". Resolving null covers the person who closed it,
 * which is not an error and should not read as one.
 */
export function scanQr(prompt: string): Promise<string | null> {
  const app = webApp()
  if (!app?.showScanQrPopup || !supports('6.4')) return Promise.resolve(null)

  return new Promise((resolve) => {
    let done = false
    app.showScanQrPopup?.({ text: prompt }, (text) => {
      if (done) return true
      done = true
      resolve(text)
      return true
    })

    // Nothing fires when somebody dismisses the popup themselves, so a promise
    // awaited on that path would never settle and the button would stay
    // disabled for the rest of the session. Telegram closes the sheet on its
    // own; this only makes sure the caller hears about it.
    const poll = window.setInterval(() => {
      if (done) {
        window.clearInterval(poll)
        return
      }
      if (!document.hidden) return
    }, 500)
    window.setTimeout(() => {
      window.clearInterval(poll)
      if (!done) {
        done = true
        app.closeScanQrPopup?.()
        resolve(null)
      }
    }, 120_000)
  })
}

/** Whether a native scanner is on offer here. */
export function canScanNatively(): boolean {
  return Boolean(webApp()?.showScanQrPopup) && supports('6.4')
}

/**
 * Fired on `window` once the SDK has loaded and the container has been settled.
 *
 * Everything else about a launch is knowable from the URL and therefore
 * synchronous. Capabilities are not: `showScanQrPopup` and friends only exist
 * once a script has come back from telegram.org, which is tens or hundreds of
 * milliseconds after the first paint.
 *
 * That gap is a real bug without an event. Anything that asks "is there a
 * scanner?" during the first render is told no, and if it caches that answer -
 * as a `getSnapshot` must, since it has to be referentially stable - it is told
 * no forever, and the native scanner never appears in the one container that
 * has one.
 *
 * A plain DOM event rather than a store or a context, because the listeners are
 * scattered and unrelated, and because the thing being announced genuinely is a
 * global: a script finished loading.
 */
export const TELEGRAM_READY = 'telegram:ready'

/** Say the SDK has arrived. Called once, by the shell that loads it. */
export function announceReady(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TELEGRAM_READY))
}
