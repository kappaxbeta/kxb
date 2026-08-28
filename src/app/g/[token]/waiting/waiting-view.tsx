'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { knockStatus } from '@/app/g/[token]/waiting/status'
import { KNOCK_TTL_MINUTES } from '@/domain/guests/application'

/**
 * The doormat.
 *
 * Somebody has typed a name, chosen an animal and pressed the button, and is
 * now waiting on a person. The whole job of this screen is to make that wait
 * feel like a door rather than a loading spinner - which means saying what is
 * happening, saying roughly how long it lasts, and never showing a state the
 * visitor cannot act on.
 *
 * There is deliberately no "knock again" button. The knock is a row that is
 * already there; pressing it again would send nothing, and a button that
 * changes nothing is worse than no button when somebody is anxious about being
 * let in.
 */

/**
 * How often to ask.
 *
 * Slow enough to be a handful of requests over the knock's whole life, quick
 * enough that being let in feels like somebody opening a door rather than a
 * page eventually noticing. Being admitted is the moment this screen exists
 * for, so it is the one worth spending requests on.
 */
const POLL_MS = 3000

export function WaitingView({ spaceName }: { spaceName: string }) {
  const router = useRouter()
  const [state, setState] = useState<'waiting' | 'gone'>('waiting')

  useEffect(() => {
    let live = true

    const ask = async () => {
      const result = await knockStatus()
      // The component may have gone while the request was in flight - the
      // ordinary case, because being admitted navigates away.
      if (!live) return

      if (result.state === 'admitted') {
        // `replace`, not `push`: the browser's back button should not lead a
        // guest back to a doormat they are no longer standing on.
        router.replace(result.path)
        return
      }

      if (result.state === 'gone') setState('gone')
    }

    void ask()
    const timer = setInterval(ask, POLL_MS)

    return () => {
      live = false
      clearInterval(timer)
    }
  }, [router])

  if (state === 'gone') {
    return (
      <div className="space-y-3 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised text-2xl">
          🚪
        </div>
        <h1 className="text-lg font-semibold text-ink">Nobody let you in</h1>
        {/*
          One sentence for three different endings - turned away, nobody
          answered, the link died underneath them - and they are collapsed on
          purpose. Telling a stranger which one happened would be telling them
          something about the people in the room, and all three have the same
          next step.
        */}
        <p className="text-sm text-ink-muted">
          Ask whoever sent you the link to try again.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-center">
      <div
        className="inline-flex h-12 w-12 animate-pulse items-center justify-center rounded-full border border-line bg-surface-raised text-2xl"
        role="status"
        aria-label="Waiting to be let in"
      >
        ✋
      </div>
      <h1 className="text-lg font-semibold text-ink">You knocked on {spaceName}</h1>
      <p className="text-sm text-ink-muted">
        Somebody inside has to let you in. Keep this page open, and it will take you
        through on its own.
      </p>
      <p className="text-xs text-ink-muted">
        If nobody answers within {KNOCK_TTL_MINUTES} minutes you will have to knock
        again.
      </p>
    </div>
  )
}
