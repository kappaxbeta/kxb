'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { putBackXp, takeInXp } from '@/domain/magazine/actions'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The project → magazine arrow, drawn where the project is.
 *
 * ---------------------------------------------------------------------------
 * The last arrow in the diagram to get a surface
 * ---------------------------------------------------------------------------
 * `docs/product/pricing.md` §3 has four: take in, load, remix, and **publish** -
 * "put a project into your own magazine, where it can be loaded". The picker on
 * `/browse` covers the first three and can technically do this one too, since a
 * space's own projects are in the list it draws. But the moment somebody wants
 * it is the moment they have just finished building the thing, and at that
 * moment they are here, not on a list of everything.
 *
 * Deliberately not called Publish on screen. That word is taken, by the
 * platform: `publishXp` is a review verdict in `/ovaloffice` that puts a
 * project in the *public* store, and a button here wearing the same word would
 * promise a stranger's eyeballs and deliver a shelf. So the surface says what
 * actually happens, in the same words the picker uses.
 *
 * ---------------------------------------------------------------------------
 * A version is not what is shelved
 * ---------------------------------------------------------------------------
 * `shelvedProject` looks the entry up by project rather than by reference, so
 * saving does not knock a project off its own shelf - see the note there. What
 * that means here is that this panel says "in your magazine" for a project
 * taken in three versions ago, which is the truth: the shelf follows the
 * project, and a place loading from it gets whatever this space plays now.
 */
export function MagazinePanel({
  slug,
  /** What this project would be shelved as - null when nothing is saved yet. */
  reference,
  /** What the shelf holds, at whatever version. Null when it is not on it. */
  shelvedAs,
}: {
  slug: string
  reference: string | null
  shelvedAs: string | null
}) {
  const refusal = useRefusal()
  const t = browseDict(useLocale()).shelf
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /**
   * What this visit did to the shelf, on top of what the server said.
   *
   * The actions revalidate `/t/<slug>/browse` rather than this page, so nothing
   * re-renders under it. `useState` with a rollback rather than `useOptimistic`,
   * the house rule for anything whose action does not revalidate what it is
   * drawn from.
   */
  const [moved, setMoved] = useState<boolean | null>(null)
  const on = moved ?? shelvedAs !== null

  function change(next: boolean) {
    if (reference === null) return
    setError(null)
    setMoved(next)

    startTransition(async () => {
      const result = await attempt(() =>
        // Taking in names the version this space plays now; putting back names
        // whatever the shelf holds, which may be an older one.
        next ? takeInXp(slug, reference) : putBackXp(slug, shelvedAs ?? reference),
      )
      if (!result.ok) {
        setMoved(!next)
        setError(refusal(result.error))
        return
      }
      // The rail and the picker on /browse both list this now.
      router.refresh()
    })
  }

  if (reference === null) {
    /*
      Nothing saved is nothing to shelve.

      Said rather than shown as a dead button: a project fresh out of
      `/browse/new` has `current_version: 0` and no document behind it, and
      `versionFor` treats that as the absence of a version for exactly this
      reason - a reference to it would name something that was never stored.
    */
    return (
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {t.saveFirst}
      </p>
    )
  }

  return (
    <>
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {on ? t.onShelf : t.putOnNote}
      </p>

      <button
        type="button"
        onClick={() => change(!on)}
        disabled={pending}
        className={
          on
            ? 'mt-4 rounded-full border border-line px-4 py-1.5 text-sm text-ink-muted transition hover:border-ink-muted hover:text-ink disabled:opacity-50'
            : 'mt-4 rounded-full border border-accent/60 px-4 py-1.5 text-sm text-accent transition hover:bg-accent/10 disabled:opacity-50'
        }
      >
        {on ? t.takeOff : t.putOn}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-xs text-amber-200">
          {error}
        </p>
      )}
    </>
  )
}
