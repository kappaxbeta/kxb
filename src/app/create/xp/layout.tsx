import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The XP mini-site: home, docs, showcase.
 *
 * ---------------------------------------------------------------------------
 * Three pages that read as one place
 * ---------------------------------------------------------------------------
 * The shape is the one every tool site has settled on - a home that shows the
 * thing, docs that teach it, a showcase that proves it - because a reader
 * arriving at any of the three should be able to guess the other two. The nav
 * is this layout so the pages cannot drift apart, and it is server-rendered
 * with no active-link state on purpose: an `usePathname` highlight would be
 * the section's first client bundle, bought for an underline.
 *
 * ---------------------------------------------------------------------------
 * `noindex` here, not (only) per page
 * ---------------------------------------------------------------------------
 * The whole section is reachable-by-address-only while the creator is behind
 * its gate - see the argument at the top of `page.tsx`. Setting `robots` on
 * the layout means a page added to this folder is unlisted by default and
 * cannot forget to be; the day the section launches, this is the one line to
 * remove.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function XpSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/40 bg-surface/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/create/xp" className="flex items-baseline gap-2.5">
            <span className="text-sm font-semibold tracking-tight">XP</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
              a game creator
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/create/xp/docs" className="text-ink-muted transition-colors hover:text-ink">
              Docs
            </Link>
            <Link
              href="/create/xp/showcase"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              Showcase
            </Link>
          </div>
        </nav>
      </header>
      {children}
    </>
  )
}
