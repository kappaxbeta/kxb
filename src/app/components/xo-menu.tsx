import Link from 'next/link'
import { landingDict } from '@/app/i18n/landing'
import type { Locale } from '@/app/i18n/locales'

/**
 * XO, in the header: the channel and the three pages that live inside it.
 *
 * ---------------------------------------------------------------------------
 * Why it is a menu now
 * ---------------------------------------------------------------------------
 * Play, Create and Share moved off the header and into the channel, which
 * fixed a seven-link nav and created a smaller problem: on a phone the header
 * was a mark, two characters, a flag and a button, and the three pages the
 * product is actually explained on had no entrance anywhere in the chrome. A
 * reader who wanted "what can I build" had to guess that XO Universe was the
 * way in.
 *
 * So XO holds them. One control in the row, four destinations behind it, and
 * the first of them is the channel itself - `/xo-universe`, which is the page
 * the episodes are listed on. That order is the claim: the channel is the
 * thing, and Play, Create and Share are what is in it.
 *
 * ---------------------------------------------------------------------------
 * A `<details>`, for the reasons the language menu gives
 * ---------------------------------------------------------------------------
 * See `language-menu.tsx`: the disclosure is the browser's own, so it works
 * before hydration, it is keyboard-operable without anybody writing that, and
 * every link is in the DOM for a crawler whether or not anyone opened it. That
 * matters twice over here, because these four links are the site's own map and
 * this control sits on statically rendered pages that ship no client script.
 *
 * Same honest cost, too: with no JavaScript the menu closes on a second press
 * or on picking something, not on a click elsewhere. Every item navigates
 * away, so the case that actually happens resolves itself.
 *
 * ---------------------------------------------------------------------------
 * The labels
 * ---------------------------------------------------------------------------
 * "XO Universe" is literal in all three languages for the same reason
 * "Community" is in the headers around it: it is the name of the channel and
 * not a description of it. The others come out of the landing dictionary, which
 * has had Play, Create and Share translated since they were pills in this very
 * row - so a German reader gets Spielen, Bauen, Teilen without a new key being
 * invented for it. `bank` is the one key this menu did add, and it is "Bank" in
 * two of the three languages because it is a place rather than a description.
 */

/**
 * The four pages inside the channel, in the order they are met.
 *
 * The paths say "inside" now as well as the sentence above does: they moved
 * under `/xo-universe/` when the channel became where they are introduced, so
 * the menu, the URL and the card column on the channel page all agree about
 * where a reader is. The old `/play`, `/create` and `/share` are permanent
 * redirects - see `redirects()` in `next.config.ts` for why the landing page
 * still points at those and not at these.
 */
const INSIDE = [
  { key: 'play', href: '/xo-universe/play' },
  { key: 'create', href: '/xo-universe/create' },
  { key: 'share', href: '/xo-universe/share' },
  /*
    The money, last of the four and last on purpose. Play, Create and Share are
    what you can do here; the bank is what any of it costs, and a price list
    read before the thing it prices is a price list nobody has a use for. Same
    order as the card column on the channel page, which is the other place
    these four are met.
  */
  { key: 'bank', href: '/xo-universe/coins' },
] as const

export function XoMenu({
  locale,
  channels = false,
}: {
  locale: Locale
  /**
   * Whether the directory of other people's shows is reachable.
   *
   * A prop with a default rather than a lookup, for the reason `landing.tsx`
   * gives about `universe`: this component is rendered from a file published
   * to the public repository, and importing the flag resolver here would
   * compile in this repository and not in that one. A caller who knows nothing
   * about channels gets a menu without the item, which is also what the site
   * draws while the flag is off.
   *
   * It matters that this is gated at all: `/xo-universe/channels` 404s when
   * the flag is down, and a menu item that leads to a 404 is worse than a
   * menu that is one item shorter.
   */
  channels?: boolean
}) {
  const nav = landingDict(locale).nav

  return (
    <details className="menu xo-menu">
      <summary className="menu-trigger xo-trigger">
        <span className="nav-pill-xo-long">XO Universe</span>
        {/* "XO" under 768px. The label shortens rather than the control
            disappearing: it is the one destination that has to survive a
            phone, and two characters always fit. */}
        <span className="nav-pill-xo-short">XO</span>
        <span className="menu-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>

      <ul className="menu-panel">
        <li>
          {/* The channel itself, and the only item that is a place rather than
              a page: it is where the episodes are listed. */}
          <Link href="/xo-universe" className="menu-item">
            XO Universe
          </Link>
        </li>
        {INSIDE.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className="menu-item">
              {nav[page.key]}
            </Link>
          </li>
        ))}
        {/* The directory, after the four pages and before nothing.

            It sits last because of what it is rather than to get out of the
            way: Play, Create, Share and Bank explain this product, and
            Channels is where other people's shows are - the one item in the
            menu that leads somewhere we did not write. Somebody who has read
            what the thing does is the right reader for it; somebody who has
            not would be met by a list of strangers' episodes. */}
        {channels ? (
          <li>
            <Link href="/xo-universe/channels" className="menu-item">
              {nav.channels}
            </Link>
          </li>
        ) : null}
      </ul>
    </details>
  )
}
