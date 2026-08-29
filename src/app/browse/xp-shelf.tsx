'use client'

import { useState } from 'react'
import type { Finish } from '@kxb/xp'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { CartridgeSheet } from '@/app/components/cartridge/sheet'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'
import type { StoreDict } from '@/app/i18n/store'

/**
 * The store's shelf.
 *
 * ---------------------------------------------------------------------------
 * The last surface to stop being cards, and the one that argued longest
 * ---------------------------------------------------------------------------
 * Every other list of levels became cartridges first, and this one was held
 * back on purpose: `/browse` is the shop window. It is read by people with no
 * account, it is the page that has to persuade a stranger, and a `<canvas>` is
 * one element with no text in it - which is a real cost on the one page whose
 * words are the product.
 *
 * What changed the answer is that the cards were making the *same* argument
 * badly. `xp-card.tsx` reached for `.box` - the heaviest object the design
 * system has - precisely because "these are the thing worth looking at" was the
 * page's whole claim, and it was making that claim with a rectangle. A shelf of
 * cartridges is the claim itself: this is an object, somebody made it, you
 * could own it.
 *
 * ---------------------------------------------------------------------------
 * The words stay in the document
 * ---------------------------------------------------------------------------
 * The blurb is in the accessible list beside the canvas, not only the name -
 * which is more than the shelf does anywhere else, and the reason is this page
 * specifically. A screen reader gets what a sighted visitor gets, and so does
 * anything else that reads HTML. The panel a cartridge opens carries the rest:
 * the whole blurb rather than the four lines a card could hold, the capability
 * chips, and the counts.
 *
 * That is the trade being made honestly rather than quietly: the picture got
 * better and the prose moved one press away, and the prose is still in the
 * page for everything that cannot see the picture.
 */

export interface StoreCartridge {
  id: string
  name: string
  blurb: string | null
  cover: string | null
  finish: Finish | null
  hue: number | null
  href: string
  /** The counts line, already worded and localised by the page. */
  facts: string
  /** Short words for what the product may do with it. */
  chips: readonly string[]
}

export function XpShelf({ xps, t }: { xps: readonly StoreCartridge[]; t: StoreDict }) {
  const [open, setOpen] = useState<string | null>(null)
  const opened = xps.find((xp) => xp.id === open) ?? null

  const items: ShelfItem[] = xps.map((xp) => ({
    ref: xp.id,
    name: xp.name,
    cover: xp.cover,
    ...(xp.blurb ? { description: xp.blurb } : {}),
    ...(xp.finish ? { finish: xp.finish } : {}),
    // A presence check, because zero is red.
    ...(xp.hue === null ? {} : { hue: xp.hue }),
  }))

  return (
    <>
      {/*
        Bigger than a picker draws them. This is the shop window and the
        cartridge *is* the argument - the grid of cards it replaced was three
        across on a wide screen, and six small ones say "list" where three large
        ones say "look at this".
      */}
      <CartridgeShelf
        items={items}
        selected={open}
        onOpen={setOpen}
        ideal={330}
        label={t.shelfLabel}
      />

      {opened && (
        <CartridgeSheet
          reference={opened.id}
          {...(opened.hue === null ? {} : { hue: opened.hue })}
          name={opened.name}
          blurb={opened.blurb}
          cover={opened.cover}
          facts={opened.facts}
          note={
            opened.chips.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {opened.chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-accent-2/40 px-2 py-0.5 text-[11px] text-accent-2"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null
          }
          closeLabel={t.closeSheet}
          noPicture={t.noPicture}
          onClose={() => setOpen(null)}
        >
          {/*
            A real anchor. This is the store: a level's page is a thing people
            link each other to, and a button that pushes has no address to copy
            and nothing for a middle click to open.
          */}
          <a
            href={opened.href}
            className="rounded-full border border-accent bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20"
          >
            {t.openIt}
          </a>
        </CartridgeSheet>
      )}
    </>
  )
}
