import type { SVGProps } from 'react'

/**
 * The X logo, as the solid glyph it actually is.
 *
 * lucide dropped its brand icons in v1 - there is no bird to import any more,
 * and lucide's `X` is the close-window cross, which beside a link reads as
 * "dismiss" rather than as a profile. So it is drawn here, copied exactly and
 * filled: this is somebody else's mark, and a house-style redraw of a logo is
 * both a worse mark and a worse citizen. `github-mark.tsx` next door makes the
 * same argument about the Octocat.
 *
 * Its own file because it is on three surfaces now - the landing footer, the
 * shell footer every deep page wears, and the channel, where it sits beside
 * the news signup as the other way of hearing about a chapter. It lived inside
 * `landing.tsx` while the landing page was the only one with a profile link.
 *
 * Drawn on a 24-unit grid, so `size-4` sizes it with the marks around it.
 */
export function XMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/**
 * Where the account is, and what it is called.
 *
 * One handle for the whole studio, the channel included: Project Oasis is
 * published by the same people who publish everything else here, and a second
 * account with three followers would be a worse place to send a reader than
 * the one that is actually posting.
 */
export const X_HANDLE = '@kxbteam'
export const X_HREF = 'https://x.com/kxbteam'
