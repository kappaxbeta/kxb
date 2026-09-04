import { headers } from 'next/headers'

/**
 * Whether this request came from the installed app rather than a browser.
 *
 * `packages/shell` is kxb.team in a WebView on somebody's home screen, and one
 * thing is true there that is not true anywhere else: **nothing may be sold**.
 * App Store guideline 3.1.1 says digital goods bought inside an iOS app go
 * through Apple's in-app purchase, and a Stripe checkout reachable from a web
 * view is not a loophole - it is the example the guideline is written from, and
 * a rejection at review with the screenshot attached.
 *
 * There are two mechanisms and they answer different questions:
 *
 *  - **`[data-shell]` in `globals.css`** decides what is *drawn*. The shell
 *    marks `<html>` before the first paint, `.not-in-app` disappears, and the
 *    purchase buttons are never on screen to be tapped or photographed.
 *  - **This function** decides what is *done*. A Server Action is a public POST
 *    endpoint: hiding its button is a rendering decision that anybody with the
 *    other button's markup can ignore. Every action that starts a payment calls
 *    this first.
 *
 * It reads the user agent, which the shell appends `kxbShell/<version>` to
 * (`applicationNameForUserAgent`). A user agent is a claim rather than a proof,
 * and that is fine in this direction: the failure mode of a lie is a browser
 * that talked itself out of being allowed to pay us. Nothing is granted by
 * saying it - only refused.
 *
 * Deliberately not called from a page. `headers()` makes a route dynamic, and
 * the marketing pages are static for every visitor on the web; making them
 * dynamic to answer a question only the app asks would be paid for by everybody
 * else. The CSS marker costs nothing and covers those.
 */
export async function isAppShell(): Promise<boolean> {
  return ((await headers()).get('user-agent') ?? '').includes('kxbShell/')
}

/**
 * What an action says when it refuses.
 *
 * Short, and pointedly not a signpost. "Manage your plan at kxb.team" is the
 * sentence that turns one guideline problem into two: steering somebody out of
 * the app to buy the same thing elsewhere is its own rule and its own
 * rejection. This build has nothing for sale and says only that.
 */
export const NOT_FOR_SALE_IN_APP = 'This is not available in the app.'
