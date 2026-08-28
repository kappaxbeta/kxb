'use client'

import { useEffect, useRef } from 'react'
import { xpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'
import {
  ALL_EMOTES,
  EMOTE_SHEET,
  EMOTE_SHEET_HEIGHT,
  EMOTE_SHEET_WIDTH,
  EMOTE_TILE,
  type EmoteId,
  emoteTileStyle,
} from '@/app/xp/_runtime/body/emotes'

/**
 * The button that opens the faces, and the grid it opens.
 *
 * Copied in *shape* from `src/app/world/emote-picker.tsx` (2026-08-11) rather
 * than imported — docs/xp/creator.md §1.2, enforced by `eslint.config.mjs`. It
 * is deliberately the smaller half of that component: no chat tab, because
 * chat in an XP is docs/xp/backlog.md §7b's other half and is a *durable* thing
 * on a different port, and no mirror, because this runtime has no mirror camera
 * to offer.
 *
 * Open/closed is owned by the caller rather than held here, because the scene
 * has a key for it *and* this button, and two sources of truth over one boolean
 * is how you end up with a panel that needs pressing twice after you clicked
 * away.
 */

/** How big one face is drawn in the grid. */
const TILE = 34

export function EmotePicker({
  open,
  onOpenChange,
  onPick,
  className = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (id: EmoteId) => void
  /**
   * Where the button sits.
   *
   * Passed in for the reason the lounge's is: the corner a floating button may
   * have is a fact about the *screen*, and this runtime's bottom right is the
   * jump button's on a phone. The lounge puts emotes in that corner and stacks
   * its actions above; here it is the other way round, because in a lounge the
   * main thing your right thumb does is pull a face and in a game it is jump.
   */
  className?: string
}) {
  const t = xpDict(useLocale()).emotes
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Escape closes, and so does clicking anywhere else.
   *
   * Registered on the document rather than as an overlay behind the panel: the
   * thing behind it is a 3D scene that wants its own pointer events, and a
   * full-screen click-catcher would swallow the first click back into the game
   * every single time.
   */
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Stopped here so the scene's own Escape does not also fire and drop
        // the player out of the level on the way past. Closing a panel and
        // leaving a game are not the same press.
        event.stopPropagation()
        onOpenChange(false)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return
      onOpenChange(false)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onOpenChange])

  return (
    <div className={`pointer-events-auto absolute z-30 ${className}`}>
      {open && (
        <div
          ref={panel}
          className="absolute bottom-full right-0 mb-2 w-[min(88vw,26rem)] overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur"
        >
          {/*
            Scrolls rather than shrinking the tiles to fit. Ninety-one faces at
            a size a thumb can hit is taller than a phone's half-screen, and a
            grid that solved that by shrinking would be ninety-one things too
            small to tell apart - which is the same as having none.
          */}
          <div className="max-h-[42vh] overflow-y-auto overscroll-contain p-2">
            <div className="flex flex-wrap justify-center gap-1">
              {ALL_EMOTES.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`Emote ${id + 1}`}
                  onClick={() => {
                    onPick(id)
                    // Picked is done: the panel is over the level, and a grid
                    // that stayed up would be a grid you have to dismiss before
                    // you can see anybody react to what you just did.
                    onOpenChange(false)
                  }}
                  className="rounded transition-transform hover:scale-110 active:scale-95"
                  style={{ ...emoteTileStyle(id, TILE), imageRendering: 'pixelated' }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={open ? t.close : t.open}
        title={t.title}
        className={`flex size-11 items-center justify-center rounded-full border border-white/25 shadow-lg backdrop-blur-sm transition-colors ${
          open ? 'bg-white/25' : 'bg-black/30 hover:bg-black/50'
        }`}
      >
        <span
          aria-hidden
          className="block size-8"
          style={{
            backgroundImage: `url(${EMOTE_SHEET})`,
            // The first face on the sheet, scaled from 48px into the 32px
            // button. `background-size` carries the same ratio as the position.
            backgroundPosition: '0 0',
            backgroundSize: `${(EMOTE_SHEET_WIDTH * 32) / EMOTE_TILE}px ${
              (EMOTE_SHEET_HEIGHT * 32) / EMOTE_TILE
            }px`,
            imageRendering: 'pixelated',
          }}
        />
      </button>
    </div>
  )
}
