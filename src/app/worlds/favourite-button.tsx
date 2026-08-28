'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { toggleFavouriteWorld } from '@/domain/worlds/actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The heart.
 *
 * Optimistic, which is unusual for this codebase's scene work and right here:
 * the action revalidates `/worlds`, so the server's answer does come back and
 * correct the page - and a heart that waits a round trip before filling in is
 * the single most obvious place in a product to feel slow. See the note on
 * optimistic UI in the scene HUDs for the case where this is *not* safe: there
 * the actions skip `revalidatePath`, so an optimistic value has nothing to be
 * reconciled against and silently reverts.
 *
 * Signed out, it is not rendered at all rather than rendered and refused - a
 * control that only ever tells you to log in is a control that should have been
 * a link.
 */
export function FavouriteButton({ id, kept }: { id: string; kept: boolean }) {
  const refusal = useRefusal()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useOptimistic(kept)

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={optimistic}
      title={optimistic ? 'Kept — press to forget' : 'Keep this world'}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic)
          const result = await toggleFavouriteWorld(id)
          if (!result.ok) setNote(refusal(result.error))
        })
      }
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
        optimistic
          ? 'border-accent/60 bg-accent/10 text-ink'
          : 'border-line text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {/* Filled or outlined, rather than two different glyphs: the shape has to
          stay put between states or the row twitches every time somebody
          presses it. */}
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
        <path
          d="M8 14S1.5 9.9 1.5 5.6A3.6 3.6 0 0 1 8 3.4a3.6 3.6 0 0 1 6.5 2.2C14.5 9.9 8 14 8 14Z"
          fill={optimistic ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      {note ?? (optimistic ? 'Kept' : 'Keep')}
    </button>
  )
}
