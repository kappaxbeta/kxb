'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Finish } from '@kxb/xp'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { CartridgeSheet } from '@/app/components/cartridge/sheet'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'

/**
 * A space's own projects, as the cartridges they will become.
 *
 * ---------------------------------------------------------------------------
 * Why these are cartridges too
 * ---------------------------------------------------------------------------
 * Everything else on this page already is - the magazine, the store, the
 * wizard's picker - and a project is not a different *kind* of thing from the
 * levels beside it. It is the same thing earlier: the draft of the object
 * somebody will eventually pick up. Drawing it as a card while its published
 * sibling is a cartridge says they are two species, and the moment you publish
 * one it silently changes shape.
 *
 * It also answers a question the card could not. A project's cover, its name
 * and its finish are three decisions an author makes separately and only ever
 * sees together *after* shipping. Here the list of drafts is a rehearsal of the
 * shelf they are heading for.
 *
 * ---------------------------------------------------------------------------
 * The strings arrive made
 * ---------------------------------------------------------------------------
 * `facts`, `badge` and `needs` are composed on the server. The alternative is
 * shipping `describeNeed` and two dictionaries into the browser to reassemble
 * sentences that never change after the render - and this component is already
 * paying for a WebGL context.
 *
 * ---------------------------------------------------------------------------
 * A sheet, and then a link
 * ---------------------------------------------------------------------------
 * The card was a link and clicking it left the page. The cartridge opens the
 * same panel every other shelf opens, with the project's facts in it and one
 * loud button to the project page. That costs one extra press and buys the
 * thing the card could not do: read what a level is without leaving the list
 * you are comparing it against. The panel's button is a real `<a>`, so the
 * middle click and the context menu still work.
 */

export interface ProjectCartridge {
  id: string
  name: string
  blurb: string | null
  cover: string | null
  /** Null when the level has never said. Draws as plastic. */
  finish: Finish | null
  /** Null lets the shelf derive one from the id, which is the common case. */
  hue: number | null
  href: string
  /** The version line - `v3`, or `v3 · v2 live`, or "never saved". */
  facts: string
  /** Draft, published, submitted. The word in the corner of the picture. */
  badge: string
  /** Already described, in the reader's language. Empty for most levels. */
  needs: string
}

export function ProjectShelf({
  projects,
  label,
  openIt,
  closeLabel,
  noPicture,
}: {
  projects: readonly ProjectCartridge[]
  label: string
  openIt: string
  closeLabel: string
  noPicture: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const opened = projects.find((project) => project.id === open) ?? null

  const items: ShelfItem[] = projects.map((project) => ({
    ref: project.id,
    name: project.name,
    cover: project.cover,
    ...(project.finish ? { finish: project.finish } : {}),
    // A presence check, not a truthiness one: zero is red.
    ...(project.hue === null ? {} : { hue: project.hue }),
  }))

  return (
    <>
      <CartridgeShelf items={items} selected={open} onOpen={setOpen} label={label} />

      {opened && (
        <CartridgeSheet
          reference={opened.id}
          {...(opened.hue === null ? {} : { hue: opened.hue })}
          name={opened.name}
          blurb={opened.blurb}
          cover={opened.cover}
          facts={opened.facts}
          badge={opened.badge}
          note={
            opened.needs.length > 0 ? (
              <p className="text-[11px] leading-relaxed text-ink-muted">{opened.needs}</p>
            ) : null
          }
          closeLabel={closeLabel}
          noPicture={noPicture}
          onClose={() => setOpen(null)}
        >
          {/*
            An anchor rather than a button that pushes, so a middle click opens
            a tab and the context menu has something to copy. The prefetch on
            hover is the router's own; nothing here needs to ask for it.
          */}
          <a
            href={opened.href}
            onClick={(event) => {
              // Left click with no modifier is a client navigation; everything
              // else is the browser's to handle, and intercepting it is how a
              // link stops behaving like one.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              router.push(opened.href)
            }}
            className="rounded-full border border-accent bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20"
          >
            {openIt}
          </a>
        </CartridgeSheet>
      )}
    </>
  )
}
