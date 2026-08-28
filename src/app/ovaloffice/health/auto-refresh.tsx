'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Keeps the page current without anybody pressing anything.
 *
 * A monitoring page you have to refresh by hand is one you stop trusting - the
 * numbers on screen are from whenever you last looked, and there is nothing on
 * the page that says so. `router.refresh()` re-runs the server component, so
 * every probe is taken again and the whole page is replaced with a fresh render.
 *
 * `setInterval` rather than `requestAnimationFrame` deliberately: rAF does not
 * tick in a background tab, and the tab this page lives in is very often the
 * background one. A timer keeps counting.
 *
 * Thirty seconds because each refresh re-probes four network dependencies and
 * every replica. Faster would put a standing load on the backend for the sake
 * of a page nobody is watching second by second, and the whole point of this
 * page is to notice problems, not to cause them.
 */
const INTERVAL_MS = 30_000

export function AutoRefresh({ sampledAt }: { sampledAt: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [on, setOn] = useState(true)

  useEffect(() => {
    if (!on) return

    const timer = setInterval(() => {
      startTransition(() => router.refresh())
    }, INTERVAL_MS)

    return () => clearInterval(timer)
  }, [on, router])

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {/*
        Rendered from a prop rather than `new Date()` in the client, and
        formatted on the client on purpose - the server renders UTC and the
        person reading this is not in it. Sending the ISO string and letting
        the browser format it is what makes "last checked" mean anything, and
        suppressHydrationWarning covers the one render where they disagree.
      */}
      <span suppressHydrationWarning>
        Checked {new Date(sampledAt).toLocaleTimeString()}
        {pending && ' · refreshing'}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (on) {
            setOn(false)
          } else {
            setOn(true)
            startTransition(() => router.refresh())
          }
        }}
      >
        {on ? 'Pause' : 'Resume'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        Refresh
      </Button>
    </div>
  )
}
