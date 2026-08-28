'use client'

import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import {
  ALL_EMOTES,
  EMOTE_SHEET,
  EMOTE_SHEET_HEIGHT,
  EMOTE_SHEET_WIDTH,
  EMOTE_TILE,
  type EmoteId,
  emoteBackgroundPosition,
} from '@/domain/world/emotes'

/**
 * Ninety-one faces in a grid, and nothing else.
 *
 * Pulled out of the HUD picker once the pinboard wanted the same grid in a very
 * different frame - a popover on a normal page rather than a panel floating
 * over a 3D scene. The *positioning* was never the shareable part: the HUD's
 * version is absolutely placed, opens upward and closes on a document-level
 * pointerdown because a full-screen click-catcher would swallow clicks back
 * into the game. None of that is true on a dashboard.
 *
 * So each caller owns its own shell and this owns the tiles: one sheet, ninety
 * one `background-position`s, no ninety-one requests.
 */
export function EmoteGrid({
  onPick,
  className = '',
}: {
  onPick: (id: EmoteId) => void
  className?: string
}) {
  const t = worldDict(useLocale()).dock

  return (
    // Columns are exactly one tile wide, so the sheet is always drawn at its
    // native 48px and never resampled. How many fit is the browser's problem,
    // which is what makes this work on a phone.
    <div
      role="listbox"
      aria-label={t.emotes}
      className={`grid justify-center gap-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, ${EMOTE_TILE}px)` }}
    >
      {ALL_EMOTES.map((id) => (
        <button
          key={id}
          type="button"
          role="option"
          aria-selected={false}
          // The faces have no names - see the note in emotes.ts - so the number
          // is the honest label. It is at least stable and unique, which is
          // what a screen reader needs to distinguish them.
          aria-label={fill(t.emoteNumber, { n: id + 1 })}
          onClick={() => onPick(id)}
          className="flex aspect-square items-center justify-center rounded-lg transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="block"
            style={{
              width: EMOTE_TILE,
              height: EMOTE_TILE,
              backgroundImage: `url(${EMOTE_SHEET})`,
              backgroundPosition: emoteBackgroundPosition(id),
              backgroundSize: `${EMOTE_SHEET_WIDTH}px ${EMOTE_SHEET_HEIGHT}px`,
              // Pixel art, same as the 3D bubble. Left to the browser's default
              // this is a blurry 48px upscale on a HiDPI screen.
              imageRendering: 'pixelated',
            }}
          />
        </button>
      ))}
    </div>
  )
}
