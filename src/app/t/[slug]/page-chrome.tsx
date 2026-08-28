'use client'

import { useEffect, useRef } from 'react'

/**
 * The banners above the page, measured so a full-height surface can subtract
 * them.
 *
 * `.h-viewport-inset` is `100dvh` less the shell's own padding, which is exact
 * for a page with nothing above it and 241px short of exact the moment a banner
 * appears - the scene keeps its full height, the banner is added on top, and
 * the document scrolls by precisely the banner. That is what "somehow the height
 * is 110vh, so i can scroll the page... but u in the game" is: you drag to look
 * and the page moves under you instead.
 *
 * The height cannot be known in CSS - a banner wraps to two lines on a narrow
 * phone and one on a wide one - so it is measured here and published as
 * `--page-chrome`, which `.h-viewport-inset` subtracts. Any banner counts, and
 * a page with none pays nothing: the variable defaults to zero and this
 * component renders a plain wrapper.
 *
 * On `documentElement` rather than on a parent, because the surfaces reading it
 * are in a different subtree - a scene lives inside `<main>`, and this wraps the
 * block above `<main>`'s content.
 */
export function PageChrome({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = box.current
    if (!node) return

    const root = document.documentElement
    /**
     * `ResizeObserver` rather than a measurement on mount: a banner that wraps
     * when the phone rotates, or one whose text arrives with a translation, is
     * a banner whose height changes after the first paint. Measuring once would
     * leave the scene wrong by however much it moved.
     */
    const observer = new ResizeObserver(() => {
      const height = node.getBoundingClientRect().height
      // Written as a whole number of pixels: the subpixel value churns on every
      // scroll on some browsers, and a variable that changes re-lays out every
      // surface reading it.
      root.style.setProperty('--page-chrome', `${Math.round(height)}px`)
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
      // Cleared rather than left behind - navigating from a page with a banner
      // to one without would otherwise keep charging the scene for it.
      root.style.removeProperty('--page-chrome')
    }
  }, [])

  /**
   * `flow-root`, so the wrapper's box includes its children's margins.
   *
   * Without it a banner's own `mb-4` collapses *through* this div and is not in
   * the height measured here - which left the page scrolling by exactly one
   * margin, 16px, after the banner itself had been accounted for. A block
   * formatting context contains the margin instead of passing it on.
   */
  return (
    <div ref={box} className="flow-root">
      {children}
    </div>
  )
}
