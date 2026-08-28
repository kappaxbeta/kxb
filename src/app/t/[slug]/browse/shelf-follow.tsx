'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { catchUpShelf, setShelfFollow } from '@/domain/magazine/actions'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Whether the shelf keeps itself current, and the catching-up that follows.
 *
 * Two jobs in one component because they are one decision seen twice: the
 * switch says what the space wants, and the effect is what the space wanting it
 * actually means the next time somebody opens the page.
 *
 * ---------------------------------------------------------------------------
 * The catch-up runs here rather than in the read
 * ---------------------------------------------------------------------------
 * Resolving stale entries while rendering the shelf would be a write during a
 * read - it would fire for every visitor including guests, who may not write at
 * all, and fill the log with restocks nobody performed. Doing it from a member's
 * own visit is a different thing: it is a write their visit asked for, the
 * action refuses when the space has not switched following on, and
 * `writeBlockedReason` turns it into a no-op for everybody who may not write.
 *
 * Once per mount, guarded by a ref rather than by the dependency array. Strict
 * Mode runs effects twice in development, and the second run would append a
 * second set of restocks - the decider would refuse most of them, but "most" is
 * not a thing to rely on for a log.
 */
export function ShelfFollow({
  slug,
  following,
  stale,
}: {
  slug: string
  following: boolean
  /** How many entries are behind. Only meaningful for the sentence. */
  stale: number
}) {
  const refusal = useRefusal()
  const router = useRouter()
  const [on, setOn] = useState(following)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const caughtUp = useRef(false)

  useEffect(() => {
    if (!following || stale === 0 || caughtUp.current) return
    caughtUp.current = true

    void attempt(() => catchUpShelf(slug)).then((result) => {
      // Quiet on failure. Nobody asked for this to happen, so nobody is waiting
      // to be told it did not - and the badges are still on the rows, which is
      // the manual path saying the same thing.
      if (result.ok) router.refresh()
    })
  }, [following, stale, slug, router])

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)

    startTransition(async () => {
      const result = await attempt(() => setShelfFollow(slug, next))
      if (!result.ok) {
        setOn(!next)
        setError(refusal(result.error))
        return
      }
      // Switching it on is a promise to catch up, and the rows are stale right
      // now. The effect above will not re-run for a prop this render already
      // has, so the refresh is what brings the new answer down.
      if (next) caughtUp.current = false
      router.refresh()
    })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={toggle}
          className="size-3.5 accent-current"
        />
        <span>{browseDict(useLocale()).shelf.follow}</span>
      </label>

      {!on && stale > 0 && (
        <span className="text-xs text-accent-2 tabular-nums">
          {stale} {stale === 1 ? 'level has' : 'levels have'} a newer version
        </span>
      )}

      {error && (
        <span role="alert" className="text-xs text-rose-300">
          {error}
        </span>
      )}
    </div>
  )
}
