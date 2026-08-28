'use client'

import { useTransition } from 'react'
import { clearPin, pinArm } from './pin-actions'

/**
 * "Show me this one."
 *
 * A toggle rather than a radio group, because the third state - pinned to
 * nothing, which is what every visitor is - has to be reachable in one click
 * from either arm. A radio set has no "off".
 *
 * `useTransition` rather than a plain call so the row can say it is working:
 * the action sets a cookie and revalidates, and on a cold server action that is
 * long enough for somebody to click it twice.
 */
export function ArmPin({
  experimentId,
  armId,
  pinned,
}: {
  experimentId: string
  armId: string
  pinned: boolean
}) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          // Clicking the arm you are already pinned to is how you stop being
          // pinned - see the note on the component.
          if (pinned) await clearPin()
          else await pinArm(experimentId, armId)
        })
      }
      className={`rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
        pinned
          ? 'border-primary/60 bg-secondary text-foreground'
          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {pinned ? 'Pinned' : 'Preview'}
    </button>
  )
}
