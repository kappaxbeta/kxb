'use client'

import { useEffect, useRef } from 'react'
import { hueFor } from '@/app/components/hue'

/**
 * What a cartridge says when you pick it up.
 *
 * ---------------------------------------------------------------------------
 * Why clicking opens this rather than doing the thing
 * ---------------------------------------------------------------------------
 * A cartridge has one face and about eight words on it. That is the right
 * amount to *choose* by and nowhere near enough to decide by - the blurb, the
 * level's rules, where it came from and whether this space has it already are
 * all real questions somebody asks before they commit. The card grid answered
 * them by printing everything on every card, which is why a row of them was
 * four hundred pixels tall and still cut the blurb at four lines.
 *
 * So the shelf shows the thing and this shows the facts, and the verbs live
 * here where there is room to say what each one does.
 *
 * ---------------------------------------------------------------------------
 * A panel under the shelf, not a modal over the page
 * ---------------------------------------------------------------------------
 * Two of the three surfaces that use this are already inside something: the
 * battle wizard is a `role="dialog"` with its own Escape handler, and the
 * space's browse tabs sit in a page with a rail down the side. A second
 * full-screen layer inside the first is a dialog inside a dialog - two things
 * listening for Escape on `window`, where the one that closes is whichever
 * registered first, which is not a thing anybody can reason about.
 *
 * Inline has no such argument with its host. It also matches what the list
 * version of this picker always did - open the row you tapped, in place - so
 * nobody has to learn a new gesture to get the same answer.
 *
 * The actions arrive as `children`. This file knows nothing about magazines,
 * places or matches, and should not learn.
 */

export function CartridgeSheet({
  reference,
  hue,
  name,
  blurb,
  cover,
  facts,
  badge,
  note,
  closeLabel,
  noPicture,
  onClose,
  children,
}: {
  /** Only for the hue, so the panel is lit in the colour of the shell it opened from. */
  reference: string
  /** The level's own colour, when it named one. Otherwise derived from `reference`. */
  hue?: number
  name: string
  blurb: string | null
  cover: string | null
  /** One line of the level's own rules. Monospaced, as everywhere else. */
  facts: string | null
  /** Where it came from, or where it already is. A word, over the picture. */
  badge?: string | null
  /** A refusal or a warning that belongs above the buttons rather than on one. */
  note?: React.ReactNode
  closeLabel: string
  /** What the picture area says when the level has never been photographed. */
  noPicture: string
  onClose: () => void
  children: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  /*
    Brought into view when it opens.

    The shelf can be several rows tall inside a container that scrolls, so the
    cartridge somebody clicked is often near the bottom of what they can see and
    the panel under it is entirely below the fold. `'nearest'` rather than
    `'center'`: if it is already visible, nothing should move at all.
  */
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [reference])

  return (
    <div
      ref={panel}
      role="group"
      aria-label={name}
      className="cartridge-sheet mt-4 overflow-hidden rounded-xl border border-line/70 bg-surface-raised/50"
      style={{ '--box-hue': hue ?? hueFor(reference) } as React.CSSProperties}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* The picture at a fixed share of the panel, so a long blurb and a
            short one produce the same shape. 16:10, matching every other place
            a level's shot is shown. */}
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg bg-[oklch(0.06_0.02_265)] sm:w-56">
          {cover ? (
            /* eslint-disable-next-line @next/next/no-img-element -- the same
               PNG the shelf just drew onto the cartridge, out of the browser
               cache. The optimiser has nothing to add here but a hop. */
            <img
              src={cover}
              alt={`${name}, drawn from inside the level`}
              className="size-full object-cover"
            />
          ) : (
            /* An empty lit room rather than the words "no picture yet" - the
               shared way to say "this is a place" (DESIGN.md), and the one
               thing that cannot be mistaken for a real cover. */
            <div className="relative isolate size-full">
              <span aria-hidden className="neon-horizon" />
              <span aria-hidden className="neon-floor" />
              <span className="sr-only">{noPicture}</span>
            </div>
          )}

          {badge && (
            <span className="absolute right-2 top-2 rounded-full border border-accent-2/50 bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent-2">
              {badge}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-pixel text-lg uppercase leading-tight">{name}</h3>

          {facts && <p className="mt-1.5 font-mono text-[11px] text-ink-muted/70">{facts}</p>}

          {/* Not clamped, unlike the card. Reading the whole blurb is what this
              panel is for; one that cut it would leave nowhere that does not. */}
          {blurb && (
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{blurb}</p>
          )}

          {note && <div className="mt-3">{note}</div>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {children}

            <button
              type="button"
              onClick={onClose}
              className="ml-auto text-sm text-ink-muted transition hover:text-ink"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
