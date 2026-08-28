'use client'

import { moveLoungeImage, resizeLoungeImage, rotateLoungeImage } from '@/domain/lounge/image-actions'
import type { LoungeImageView } from '@/domain/lounge/image-queries'
import type { WorldDict } from '@/app/i18n/world'

/**
 * The controls that appear under a picture you have clicked on.
 *
 * Lifted out of `lounge-scene.tsx`, where it was 136 lines of markup two thirds
 * of the way down a 1,295-line component - between the goal editor and the
 * shutter, sharing a scope with the ball, the party lights and the block
 * palette, and touching none of them.
 *
 * The three sums it does are exported separately and tested. They are small,
 * and each is small in a way that is easy to get wrong in a direction nobody
 * notices until a picture is upside down or has quietly gone square.
 */

const BUTTON =
  'rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs transition hover:bg-white/25 disabled:opacity-40'

/** The four ways a picture can face, as the aggregate numbers them. */
const FACINGS = 4

/** How large a picture may get, in cells, each way. */
const MIN_SIZE = 1
const MAX_SIZE = 32

/**
 * Turning a picture, one quarter at a time.
 *
 * Anticlockwise is `+3` rather than `-1`, and that is not a flourish:
 * JavaScript's `%` keeps the sign of its left operand, so `(0 - 1) % 4` is
 * **-1** rather than 3. A facing of -1 is not one of the four, and what it
 * draws depends on what the renderer does with a number it was promised would
 * be 0..3.
 */
export function turned(facing: number, direction: 'left' | 'right'): number {
  return (facing + (direction === 'left' ? FACINGS - 1 : 1)) % FACINGS
}

/**
 * Growing and shrinking, both sides together.
 *
 * Together so the picture keeps its shape - stepping one side at a time is how
 * a photograph slowly becomes a square. Clamped here as well as in the
 * aggregate, so the button goes dead at the limit rather than sending a write
 * that comes back refused.
 */
export function resized(
  image: { width: number; height: number },
  step: number,
): { width: number; height: number } {
  return {
    width: Math.min(MAX_SIZE, Math.max(MIN_SIZE, image.width + step)),
    height: Math.min(MAX_SIZE, Math.max(MIN_SIZE, image.height + step)),
  }
}

/**
 * Moving a picture one cell.
 *
 * The floor is the only limit: a picture below `y = 0` is under the world and
 * cannot be clicked on again to be brought back, so the down button stops
 * rather than losing it. Sideways and depthways are unbounded here because the
 * world's own edges bound them.
 */
export function nudged(
  image: { x: number; y: number; z: number },
  delta: { x?: number; y?: number; z?: number },
): { x: number; y: number; z: number } {
  return {
    x: image.x + (delta.x ?? 0),
    y: Math.max(0, image.y + (delta.y ?? 0)),
    z: image.z + (delta.z ?? 0),
  }
}

const MOVES = [
  ['←', { x: -1 }],
  ['→', { x: 1 }],
  ['↑', { y: 1 }],
  ['↓', { y: -1 }],
  ['⤒', { z: -1 }],
  ['⤓', { z: 1 }],
] as const

export function ImagePanel({
  image,
  slug,
  dict,
  busy,
  onClose,
  onDelete,
  run,
}: {
  image: LoungeImageView
  slug: string
  dict: WorldDict['image']
  /** Whether a command is in flight, which greys every button at once. */
  busy: boolean
  onClose: () => void
  /**
   * Removing it, which the scene keeps: it is the one command that has to put
   * the picture back into the world's list rather than patch the one it is
   * holding, and the list is the scene's.
   */
  onDelete: () => void
  /**
   * Run a command, showing the change straight away and reverting it if the
   * server says no. The scene's, for the same reason - it owns the list.
   */
  run: (
    id: string,
    changes: Partial<LoungeImageView>,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) => Promise<void>
}) {
  return (
    <div className="pointer-events-auto absolute bottom-28 left-1/2 -translate-x-1/2 rounded-2xl border border-white/20 bg-black/70 p-3 text-white backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-xs font-medium">{dict.heading}</span>
        <span className="font-mono text-[10px] text-white/50">
          {image.width}x{image.height} @ {image.x},{image.y},{image.z}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-white/60 hover:text-white">
          {dict.done}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">{dict.move}</span>
          {MOVES.map(([label, delta]) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={() => {
                const next = nudged(image, delta)
                void run(image.id, next, () => moveLoungeImage(slug, { id: image.id, ...next }))
              }}
              className={BUTTON}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">{dict.turn}</span>
          {(['left', 'right'] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              disabled={busy}
              onClick={() => {
                const facing = turned(image.facing, direction)
                void run(image.id, { facing }, () =>
                  rotateLoungeImage(slug, { id: image.id, facing }),
                )
              }}
              className={BUTTON}
            >
              {direction === 'left' ? '⟲' : '⟳'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">{dict.size}</span>
          {(
            [
              ['−', -1],
              ['+', 1],
            ] as const
          ).map(([label, step]) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={() => {
                const next = resized(image, step)
                void run(image.id, next, () => resizeLoungeImage(slug, { id: image.id, ...next }))
              }}
              className={BUTTON}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded-lg border border-red-400/50 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {dict.delete}
        </button>
      </div>
    </div>
  )
}
