'use client'

import { Camera } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { requestSceneRender } from '@/domain/renders/actions'

/**
 * Ask for a picture of this scene.
 *
 * Deliberately does not wait for one. The action registers a job and returns an
 * id; the worker draws it seconds later, on another machine. So the honest
 * feedback is "asked for", with a way to go and look - not a spinner over a
 * card, which would imply this button is doing the drawing and would sit there
 * for as long as a software rasteriser takes.
 *
 * No `useOptimistic`, following the rule the scene surfaces already have: the
 * action does revalidate, but what it revalidates is the renders page, not this
 * one - there is nothing on this card for a server answer to correct.
 */
export function RenderButton({ sceneId }: { sceneId: string }) {
  const [state, setState] = useState<'idle' | 'asked' | string>('idle')
  const [isPending, startTransition] = useTransition()

  if (state === 'asked') {
    return (
      <Link
        href="/ovaloffice/renders"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary"
      >
        <Camera className="size-3.5" aria-hidden />
        queued — watch it
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        setState('idle')
        startTransition(async () => {
          const result = await requestSceneRender(sceneId)
          setState(result.ok ? 'asked' : result.error)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-60"
    >
      <Camera className="size-3.5" aria-hidden />
      {isPending ? 'asking…' : state === 'idle' ? 'render' : state}
    </button>
  )
}
