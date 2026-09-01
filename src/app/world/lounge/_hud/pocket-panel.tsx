'use client'

import {
  holdInPocket,
  takeFromPocket,
  usePocket,
} from '@/app/world/_stores/pocket-store'
import { POCKET_KEY, POCKET_SIZE } from '@/domain/thingiverse/pocket'

/**
 * What you are carrying, drawn as a row of chips.
 *
 * ---------------------------------------------------------------------------
 * Why a row and not a grid
 * ---------------------------------------------------------------------------
 * Because a pocket holds eight things, and eight is small enough that the whole
 * of it fits on one line at the bottom of a phone. A grid is what you reach for
 * when the count is unbounded, and it costs a decision the row does not have to
 * make - where the cursor is, what arrow keys do, whether it scrolls. None of
 * those are questions worth answering for something you glance at between two
 * tables.
 *
 * It also puts the *held* item somewhere fixed and obvious. The whole panel
 * exists to answer one question - what happens if I press G at that table - and
 * the answer is the highlighted chip.
 *
 * ---------------------------------------------------------------------------
 * It is not a modal
 * ---------------------------------------------------------------------------
 * You keep walking with it open, and that is deliberate: a pocket you have to
 * shut before you can use what is in it would make every ingredient two presses
 * and a context switch. `L` toggles, clicking a chip takes it in hand, and the
 * world underneath keeps its pointer lock - which is why nothing here grabs
 * focus and every control is reachable by pointer alone.
 */
export function PocketPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pocket = usePocket()

  if (!open) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-2xl border border-line/60 bg-sky/90 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Pocket ({pocket.items.length}/{POCKET_SIZE})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
          >
            {POCKET_KEY.toUpperCase()}
          </button>
        </div>

        {pocket.items.length === 0 ? (
          /*
            An empty pocket says what fills it, rather than "nothing here".
            Taking something off a table is the only way anything gets in, and
            that is not guessable from a blank row.
          */
          <p className="max-w-xs text-[11px] leading-relaxed text-ink-muted">
            Empty. Press G at a shelf or a table to pick something up.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {pocket.items.map((item, index) => (
              <li key={`${item}-${index}`}>
                <button
                  type="button"
                  onClick={() => holdInPocket(index)}
                  /*
                    Double-click drops it on the floor - or rather, forgets it.
                    There is nowhere for it to land: an item is a word, not a
                    thing, and summoning one to be dropped would put a row in the
                    world for something somebody is throwing away. Forgetting is
                    the honest version, and it is behind a second click because
                    losing an ingredient to a stray tap is worse than the extra
                    press.
                  */
                  onDoubleClick={() => takeFromPocket(index)}
                  className={`rounded-lg border px-2 py-1 text-xs transition ${
                    pocket.holding === index
                      ? 'border-accent/60 bg-accent/20 text-ink'
                      : 'border-line/60 bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
