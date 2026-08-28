'use client'

import { useCallback, useState } from 'react'
import { QrBlock } from '@/app/components/qr-block'
import { configuredApp, guestStart, guestTokenFrom, miniAppLink } from '@/lib/telegram/deep-link'
import { useInsideTelegram } from '@/lib/telegram/use-telegram'
import { shareHref, shareVia } from '@/lib/telegram/webapp'

/**
 * One guest link, in every form somebody might actually send it.
 *
 * ---------------------------------------------------------------------------
 * Why the code is the biggest thing on the panel
 * ---------------------------------------------------------------------------
 * The three ways a link gets to a person are not equal. Pasting into a chat is
 * the common one and the copy button serves it. Sending on Telegram is one tap
 * and hands the whole thing to a chat picker. But the case this panel is
 * arranged around is the one with no chat in it at all: somebody is standing in
 * a room, at a stand, in front of a class, and the way a link reaches thirty
 * phones is that it is on a screen and everybody points a camera at it.
 *
 * That is why the code is drawn rather than offered behind a button. A QR you
 * have to click to see is a QR nobody shows anyone.
 *
 * ---------------------------------------------------------------------------
 * Which link goes where, and why the code is not the Telegram one
 * ---------------------------------------------------------------------------
 * Two links exist for one door: the ordinary `https://…/g/<token>` and, where a
 * bot is configured, `t.me/<bot>/<app>?startapp=<token>`. They reach the same
 * room. They are not interchangeable, and the split here is deliberate:
 *
 * - **The code and the clipboard carry the https link.** A QR is pointed at by
 *   whoever is standing there, with whatever is on their phone. Encoding the
 *   `t.me` address would make Telegram a *requirement* to walk through a door
 *   that works perfectly well in a browser - and for somebody without it
 *   installed, the code leads to a t.me landing page telling them to install a
 *   messenger. The same argument applies to the clipboard, only harder: a
 *   pasted link lands in email, calendar invites and Slack.
 * - **The Telegram button carries the `t.me` link.** Not a preference - it is
 *   the only way into the Mini App there is. Share the https link into a chat
 *   and Telegram opens it in its own in-app browser, which is the thing with
 *   the URL bar and the swipe-to-close that the Mini App exists to avoid.
 *
 * So the Telegram-specific container is reached by the Telegram-specific
 * button, and every other route stays open to everybody.
 */
export function ShareInvite({
  url,
  label,
  className,
}: {
  /** The finished guest link, as `createGuestLink` returned it. */
  url: string
  /** The name of the space, for the message that goes with a Telegram share. */
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  /**
   * Whether this panel is being drawn inside Telegram.
   *
   * False on the server and for one frame after, which is correct rather than
   * merely tolerable: the answer lives in a URL fragment the server never
   * receives, so rendering the button and then removing it is the only sequence
   * that does not hydrate into a mismatch.
   */
  const inTelegram = useInsideTelegram()

  const token = guestTokenFrom(url)
  const telegram = token ? miniAppLink(configuredApp(), guestStart(token)) : null

  const message = label ? `Come in to ${label}` : 'Come and join me in here'

  const copy = useCallback(async () => {
    try {
      // The https link, always - never the t.me one. A pasted link goes into
      // email, Slack, a calendar invite and a Discord channel, and a `t.me`
      // address in any of those asks somebody without Telegram to install it
      // before they can open a door that works fine in their browser.
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Refused over plain http, or by a browser that wanted a gesture it did
      // not get. The link is on screen and selectable, so this costs a
      // convenience rather than the feature.
      setCopied(false)
    }
  }, [url])

  /**
   * The one place the Mini App link belongs, and it has to be here.
   *
   * Not a preference - it is the only route into the Mini App that exists. A
   * Mini App opens from a `t.me/<bot>/<app>?startapp=` address and from nothing
   * else. Share the ordinary https link into a chat and Telegram opens it in its
   * own in-app browser: URL bar, toolbar, and a downward drag that closes the
   * room. Which is the exact thing the Mini App was built to avoid, so a share
   * button that sent the plain link would quietly make /tg dead code.
   *
   * Falls back to the https link when no bot is configured, because then there
   * is no Mini App to reach and an ordinary link in a chat is the whole feature.
   */
  const sendOnTelegram = useCallback(() => {
    const link = telegram ?? url
    // Inside the Mini App an ordinary anchor to t.me would load Telegram's
    // website inside Telegram. `shareVia` hands it to the client instead, and
    // says whether it did - false means the plain anchor below is correct.
    if (!shareVia(link, message)) window.open(shareHref(link, message), '_blank', 'noopener')
  }, [message, telegram, url])

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-3">
        <QrBlock text={url} label="Invite code" />
        <p className="text-center text-[11px] leading-relaxed text-white/50">
          Point a camera at this to open the door.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Invite link"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-white/70"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-white/30 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/*
        Offered whether or not a Mini App is configured, because the two are
        different features that happen to share a logo. `t.me/share/url` is just
        a chat picker for a link and works for anybody with Telegram installed;
        the Mini App is what that link opens into afterwards. Somebody with no
        bot registered still wants the share sheet.

        Hidden in one case only: inside Telegram itself, where the person is
        already in a chat and the useful control is the code above.
      */}
      {!inTelegram ? (
        <button
          type="button"
          onClick={sendOnTelegram}
          className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/80 transition-colors hover:border-white/30 hover:text-white"
        >
          Send on Telegram
        </button>
      ) : null}
    </div>
  )
}
