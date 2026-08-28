/**
 * Turning a share link into a Mini App address, and back.
 *
 * ---------------------------------------------------------------------------
 * Why the guest token can ride along unchanged
 * ---------------------------------------------------------------------------
 * A direct Mini App link is `t.me/<bot>/<app>?startapp=<payload>`, and the
 * payload's alphabet is the URL-safe one: letters, digits, `-` and `_`.
 *
 * `mintGuestToken` is `randomBytes(32).toString('base64url')` — forty-three
 * characters from exactly that alphabet. So the token this app already mints is
 * a legal payload with no encoding, no shortening and no second table mapping
 * one to the other. That is a lucky alignment rather than a designed one, and
 * it is worth writing down: if the token ever becomes base64 rather than
 * base64url, `+` and `/` arrive and this stops working silently.
 *
 * ---------------------------------------------------------------------------
 * The leading character, and why it is not a separator
 * ---------------------------------------------------------------------------
 * The payload is `<kind><rest>` — one character saying what this is, then the
 * thing itself. It looks like it wants to be `guest_<token>`, and it cannot be:
 * `startapp` allows only `-` and `_` as punctuation and base64url contains
 * both, so *any* separator is ambiguous against the payload it separates.
 *
 * A fixed-width prefix has no such problem. One character is a small price for
 * being able to send a second kind of link later without breaking the ones
 * already sitting in people's chats.
 *
 * ---------------------------------------------------------------------------
 * Why only one kind is understood
 * ---------------------------------------------------------------------------
 * `decodeStart` returns a path that the app then navigates to, which makes it
 * a redirector, and a redirector that accepts arbitrary paths is an open
 * redirect with a Telegram-branded front door. So it does not take paths. It
 * takes a token, checks its shape, and builds the path itself. Anything it does
 * not recognise lands on the home page, which is the boring correct answer.
 */

/**
 * The Mini App a share link can open into, as `botusername/appshortname`.
 *
 * Read here rather than through `lib/env` on purpose. Every caller of this is a
 * client component, and `lib/env` is the module that also knows the service
 * role key - so importing it into the browser is a door that should stay shut,
 * even though the bundler would strip the value.
 *
 * Public and harmless in itself: it is half of a `t.me` address that anybody
 * holding a share link can read off the link. The secret in this feature is the
 * bot *token*, which verifies `initData`, and nothing on the client wants it.
 *
 * Optional, and every caller treats absence as "there is no Mini App".
 * Registering a bot is a manual trip through BotFather, so a deployment that
 * has not made one yet shows ordinary https links rather than failing to boot,
 * and a preview branch does not have to borrow production's bot.
 */
export function configuredApp(): string | null {
  // Written as a whole static member expression because that is the form Next
  // substitutes at build time. Destructuring `process.env` first would leave an
  // undefined lookup in the browser and no warning about it.
  return process.env.NEXT_PUBLIC_TELEGRAM_APP || null
}

/** Guest link. The only kind of thing that is worth opening a room for. */
const GUEST = 'g'

/** Forty-three base64url characters, which is what 32 random bytes encode to. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The `startapp` payload for a guest token. */
export function guestStart(token: string): string {
  return `${GUEST}${token}`
}

/**
 * Where a payload leads, or null if it leads nowhere we will go.
 *
 * Null rather than a home-page path so the caller can tell "no start param at
 * all" — somebody who opened the app from the menu button — apart from "a start
 * param I refused", and say something different about each.
 */
export function startDestination(param: string | null | undefined): string | null {
  if (!param) return null

  const kind = param.slice(0, 1)
  const rest = param.slice(1)

  if (kind === GUEST && TOKEN.test(rest)) return `/g/${rest}`

  return null
}

/**
 * The token out of a guest link, for callers that were handed the URL.
 *
 * `createGuestLink` returns a finished `https://…/g/<token>` and not the token
 * that went into it, which is the right contract for what it is for - the whole
 * point of that action is that the caller does not have to know how a link is
 * assembled. This is the one place that needs the raw value back, and reading
 * it off the end of the path is cheaper and less invasive than widening a
 * return type that four other callers are happy with.
 */
export function guestTokenFrom(url: string): string | null {
  const last = url.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').pop() ?? ''
  return TOKEN.test(last) ? last : null
}

/**
 * The `t.me` address that opens this app on a token.
 *
 * Null when no Mini App is configured, which is the signal to every caller that
 * it should offer an ordinary https link instead. There is no fallback address
 * to invent here: a `t.me` link naming a bot that does not exist is worse than
 * no Telegram button at all, because it fails after the person has already
 * switched apps.
 */
export function miniAppLink(app: string | null, start: string): string | null {
  if (!app) return null
  // Tolerated so the variable can be pasted as a URL, a path, or the bare
  // `bot/app` pair the docs use, without the deployment having to know which
  // one this file wanted.
  const pair = app
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/^\/+|\/+$/g, '')

  if (!/^[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(pair)) return null

  return `https://t.me/${pair}?startapp=${start}`
}
