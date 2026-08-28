'use client'

import Link from 'next/link'
import type { Finish } from '@kxb/xp'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'

/**
 * The project, as the object other people will pick up.
 *
 * ---------------------------------------------------------------------------
 * Why the picker is not here
 * ---------------------------------------------------------------------------
 * The finish is a field on the *document* - see `@kxb/xp`'s `./finish` - and
 * the document is written by the editor's save handshake and by nothing else.
 * A control on this page would have to load the current version, patch one
 * string and write a whole new version back, which means a cosmetic change
 * bumps the version number: every shelf holding this level would light up its
 * "there is a newer version" badge, and every space following it would restock.
 * For a colour.
 *
 * So this page shows the cartridge and takes you one click from the control,
 * which is in the editor's Mode panel beside the other things true of the whole
 * document. Seeing it here is most of what the question "how will it look" is
 * actually asking, and it is a question this page could not answer at all
 * before - the finish was a word in a JSON file with nothing to compare it to.
 *
 * A live cartridge rather than a screenshot, because it is the same component
 * the shelves draw: a preview rendered by different code is a preview that is
 * eventually wrong.
 */
export function CartridgePanel({
  xpId,
  name,
  cover,
  finish,
  editHref,
  note,
  changeIt,
}: {
  xpId: string
  name: string
  cover: string | null
  /** Null when the level has never said, which draws as plastic. */
  finish: Finish | null
  /** Null for somebody who may look and not edit. */
  editHref: string | null
  note: string
  changeIt: string
}) {
  const item: ShelfItem = {
    // The project's own id, so the hue matches the cartridge the shelves draw
    // for it - `hueFor` is keyed on whatever the surface calls a level, and the
    // magazine calls this one by its reference. Close enough is not enough
    // here: a preview in a different colour from the thing is a broken preview.
    ref: xpId,
    name,
    cover,
    ...(finish ? { finish } : {}),
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full max-w-[13rem]">
        {/* One across. The shelf's own rule floors at two, because a shelf one
            cartridge wide is a list - which is a rule about shelves, and this
            is not one. */}
        <CartridgeShelf items={[item]} columns={1} onOpen={() => {}} label={name} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="max-w-[52ch] text-sm leading-relaxed text-ink-muted">{note}</p>
        {editHref && (
          <Link
            href={editHref}
            className="mt-3 inline-block text-sm text-accent transition hover:opacity-80"
          >
            {changeIt} →
          </Link>
        )}
      </div>
    </div>
  )
}
