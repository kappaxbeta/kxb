'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { useInsideTelegram } from '@/lib/telegram/use-telegram'
import { announceReady, fullscreen, settle } from '@/lib/telegram/webapp'

/**
 * The Telegram container, set up once for every route below it.
 *
 * ---------------------------------------------------------------------------
 * Why the script is conditional
 * ---------------------------------------------------------------------------
 * `telegram-web-app.js` is the only way to talk to the client, and it is also a
 * third-party script from a third-party origin on a page that otherwise has
 * none. Loading it for everybody would mean every visitor to the landing page
 * pays a DNS lookup and a request to telegram.org to enable a toolbar they are
 * not looking at, and — the part that actually matters — it would put an
 * outbound request to Telegram on pages that a cookie banner has not been
 * answered on yet.
 *
 * It is not needed to know whether we are inside Telegram. The launch
 * parameters are in the URL that Telegram opened, so `insideTelegram()` answers
 * from the address bar alone and the script is fetched only once the answer is
 * yes. Everybody else never learns it exists.
 *
 * ---------------------------------------------------------------------------
 * Why the answer arrives one frame late
 * ---------------------------------------------------------------------------
 * The launch lives in the fragment, which the server never receives. So the
 * server's honest render is "not in Telegram", and anything else would be a
 * hydration mismatch — the markup would disagree with itself on the first
 * paint. `useInsideTelegram` is built around that constraint rather than
 * fighting it; see the note there for why it is a store read and not an effect.
 */
export function TelegramShell() {
  // Also the read that stashes the launch for the rest of the tab, and it
  // happens here because this component is in the root layout - so it runs on
  // whichever page Telegram opened, before any navigation drops the fragment.
  const present = useInsideTelegram()

  if (!present) return null

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      // `onReady` rather than `onLoad`, because a client-side navigation
      // remounts this component while the script is already in the document -
      // `onLoad` fires once ever, `onReady` fires on every mount. Settling
      // twice is harmless; settling never is a sheet stuck at half height.
      onReady={() => {
        settle()
        // Only now do the capabilities exist. Anything that asked before this
        // point was told the truth for that moment and needs telling again -
        // chiefly the scan button, which is absent until it hears this.
        announceReady()
      }}
    />
  )
}

/**
 * Full screen and a locked orientation, for as long as this is mounted.
 *
 * Deliberately *not* in the shell above, because it is the one Telegram setting
 * with a wrong place to use it. Taking over the client's header removes the
 * back button, and a marketing page that does that has taken something away and
 * given nothing back. A room has its own way out and wants every pixel — a
 * phone's toolbars cost about a tenth of the viewport, which is a lot of a
 * world.
 *
 * Mounted inside the scene rather than its route, so leaving the room by any
 * path — a link, the rail, a match ending — puts the header back. Both calls
 * are Bot API 8.0 and both are allowed to be missing; on an older client this
 * is a no-op and the room is merely smaller.
 */
export function TelegramFullscreen() {
  useEffect(() => fullscreen(), [])
  return null
}
