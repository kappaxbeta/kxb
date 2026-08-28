'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addWorldToSpace, forkWorld } from '@/domain/worlds/actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What you can do with somebody else's world.
 *
 * Three verbs, and the order is the point: look at it (that is the page
 * itself), take a copy, or stand it up somewhere people can walk around in it.
 *
 * Every one of them is refused server-side as well - membership, role, the
 * flags, the row policies - and this component's job is only to make the
 * refusal rare and legible. Which is why the space picker lists the spaces you
 * belong to rather than a free-text field: the common failure was never "wrong
 * id", it is "that space cannot do this", and the answer to that comes back as
 * a sentence rather than as a disabled button with no explanation.
 */
export function WorldActions({
  id,
  spaces,
  canFork,
  intoRoom,
}: {
  id: string
  /** The signed-in user's spaces. Empty when signed out, which hides both verbs. */
  spaces: { slug: string; name: string }[]
  /** Whether this caller has anywhere to fork *into*. */
  canFork: boolean
  /**
   * Reached from a room's own "Discover worlds" link. When set, the space
   * picker and "Use in my space" disappear in favour of a single button that
   * loads straight into the room they came from, rather than a fresh
   * battlefield - see the note on `addWorldToSpace`.
   */
  intoRoom?: { slug: string; id: string; name: string }
}) {
  const refusal = useRefusal()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [slug, setSlug] = useState(spaces[0]?.slug ?? '')
  const [note, setNote] = useState<string | null>(null)

  if (spaces.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        <Link href="/login" className="underline hover:text-ink">
          Sign in
        </Link>{' '}
        to fork this world or drop it into a space.
      </p>
    )
  }

  function add(): void {
    setNote(null)
    startTransition(async () => {
      const result = await addWorldToSpace(slug, id)
      if (!result.ok) {
        setNote(refusal(result.error))
        return
      }
      // Said plainly, including what did not survive the crossing. A copy that
      // quietly dropped a third of what you saw on this page would be the kind
      // of surprise you only discover standing in it.
      setNote(
        `${result.blocks.toLocaleString()} blocks copied in` +
          (result.props > 0 ? ` · ${result.props.toLocaleString()} props left behind` : '') +
          (result.clipped > 0 ? ` · ${result.clipped.toLocaleString()} clipped` : ''),
      )
      router.push(`/t/${slug}/battle/battlefields/${result.worldId}/build`)
    })
  }

  function loadIntoRoom(): void {
    if (!intoRoom) return
    setNote(null)
    startTransition(async () => {
      const result = await addWorldToSpace(intoRoom.slug, id, intoRoom.id)
      if (!result.ok) {
        setNote(refusal(result.error))
        return
      }
      // The room page's own uuid fallback resolves this to its real slug URL -
      // see `resolve()` in rooms/[roomSlug]/page.tsx - so there is nothing to
      // look up here.
      router.push(`/t/${intoRoom.slug}/rooms/${intoRoom.id}`)
    })
  }

  function fork(): void {
    setNote(null)
    startTransition(async () => {
      const result = await forkWorld({ scope: { kind: 'space', slug }, id })
      if (!result.ok) {
        setNote(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/builder?world=${result.id}`)
    })
  }

  if (intoRoom) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={loadIntoRoom}
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {pending ? 'Loading…' : `Load into “${intoRoom.name}”`}
        </button>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {spaces.length > 1 && (
          <select
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            aria-label="Which space"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
          >
            {spaces.map((space) => (
              <option key={space.slug} value={space.slug}>
                {space.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {pending ? 'Working…' : 'Use in my space'}
        </button>

        {canFork && (
          <button
            type="button"
            onClick={fork}
            disabled={pending}
            className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface disabled:opacity-40"
          >
            Fork and edit
          </button>
        )}
      </div>

      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  )
}
