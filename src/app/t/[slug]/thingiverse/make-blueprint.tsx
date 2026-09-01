'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { drawBlueprint } from '@/domain/thingiverse/actions'
import { freshSpec } from '@/domain/thingiverse/blueprint'
import { nameForModel } from '@/domain/thingiverse/summon'

/**
 * Cut a blueprint out of a pack.
 *
 * One button and no form, deliberately. Everything a blueprint has - how big,
 * whether it blocks, whether it falls, what it does - is a decision that is far
 * easier to make once you can *see* the thing, and this page cannot show you
 * that: it is a thumbnail on a grid. So the button makes the least surprising
 * blueprint there is (`freshSpec`: solid, still, its own size, named after the
 * model) and the editor above is where it becomes something.
 *
 * `router.refresh()` rather than a local list, because the shelf is rendered by
 * the server component above and re-reading it is one request against a read
 * model that is already warm. This page is not a scene: there is no WebGL
 * context to tear down, which is the reason the world's actions refuse to do
 * exactly this.
 */
export function MakeBlueprint({
  slug,
  model,
  label,
  busyLabel,
  children,
  className,
}: {
  slug: string
  model: string
  label: string
  busyLabel: string
  /**
   * The whole tile, when the tile is the control.
   *
   * The shop next door works this way and it is the better shape: forty models
   * on a grid with a button under each is forty identical buttons to read past,
   * and the picture is what somebody is actually aiming at. Given children, this
   * becomes the card rather than a row beneath it.
   *
   * Without them it stays the plain button it was, which is what the places
   * that have one thing to make still want.
   */
  children?: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const act = () =>
    start(async () => {
      setError(null)
      const result = await attempt(() =>
        drawBlueprint(slug, { name: nameForModel(model), spec: freshSpec(model) }),
      )
      if (!result.ok) {
        setError(result.error ?? 'Refused')
        return
      }
      router.refresh()
    })

  /**
   * The tile shape: the card itself is the button.
   *
   * `title` carries the action rather than a visible label, because the label
   * would be the same three words on every tile in the grid - and a grid of
   * forty identical labels is a grid you read past. The pending state is the
   * feedback, and it is on the thing you pressed.
   */
  if (children) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={act}
        title={pending ? busyLabel : label}
        aria-label={`${label}: ${nameForModel(model)}`}
        className={`relative flex flex-col items-center rounded-xl border p-2 text-left transition disabled:opacity-60 ${
          error
            ? 'border-red-400/60 bg-red-500/5'
            : 'border-line bg-surface-raised/50 hover:border-accent/60 hover:bg-surface-raised'
        } ${className ?? ''}`}
      >
        {children}
        {error && (
          <span role="alert" className="mt-1 block text-[0.62rem] text-red-400">
            {error}
          </span>
        )}
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={act}
        className="w-full rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink transition hover:bg-surface-raised disabled:opacity-40"
      >
        {pending ? busyLabel : label}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-[10px] text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
