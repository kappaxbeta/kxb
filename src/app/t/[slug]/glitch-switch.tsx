'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import {
  GLITCH_PREVIEW_MS,
  previewGlitch,
  setGlitchNow,
  useGlitchOverride,
} from '@/app/world/_stores/glitch-store'
import { setGlitch } from '@/domain/tenants/actions'

/**
 * Whether a bad connection is drawn as a glitch in this space.
 *
 * Under the stamina switch because it is the same kind of control - a rule
 * about the room, written down, that an owner flips while standing in it -
 * and built the same way for the same reasons: `setGlitch` does not
 * revalidate, so the switch publishes to `glitch-store` itself and the world
 * takes the new rule at once; optimistic, with the revert on a refusal.
 *
 * The test button is the part stamina never needed. A rule about running is
 * visible the moment you run; a rule about bad connections is visible only
 * when somebody has one, which is the one time nobody is checking a switch.
 * So the button glitches *your own* body for a few seconds, on this client
 * only - see `previewGlitch` - and the person who pressed it turns the mirror
 * camera round and sees what the room will do to somebody, without having to
 * find a bad link to prove it, and without the people around them being made
 * to look broken for the demonstration.
 *
 * Owners and admins only, like the switch above it.
 */
export function GlitchSwitch({
  slug,
  on,
  canSet,
}: {
  slug: string
  /** What the space last recorded. The store's answer wins after that. */
  on: boolean
  canSet: boolean
}) {
  const t = railDict(useLocale()).tabs
  const override = useGlitchOverride()
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)
  const [testing, setTesting] = useState(false)
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The button's own label follows the preview's clock, and a timer that
  // outlives the rail would set state on nothing.
  useEffect(
    () => () => {
      if (testTimer.current) clearTimeout(testTimer.current)
    },
    [],
  )

  if (!canSet) return null

  const current = override ?? on

  return (
    <div className="px-1">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={current}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.checked
              setError(false)
              setGlitchNow(next)

              start(async () => {
                const result = await attempt(() => setGlitch(slug, next))
                if (result.ok) return
                // Put the world back the way it was. A rule that looked like it
                // changed and did not is worse than one that refused visibly.
                setGlitchNow(!next)
                setError(true)
              })
            }}
            className="h-3.5 w-3.5 accent-accent"
          />
          {t.glitch}
        </label>
        <button
          type="button"
          disabled={testing}
          onClick={() => {
            previewGlitch()
            setTesting(true)
            if (testTimer.current) clearTimeout(testTimer.current)
            testTimer.current = setTimeout(() => setTesting(false), GLITCH_PREVIEW_MS)
          }}
          className="rounded-md border border-line/60 px-2 py-0.5 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50"
        >
          {t.glitchTest}
        </button>
      </div>
      <p className="mt-0.5 px-1 text-[11px] text-ink-muted">
        {testing ? t.glitchTesting : current ? t.glitchOn : t.glitchOff}
      </p>
      {error && (
        <p role="alert" className="px-1 text-[11px] text-red-400">
          {t.glitchFailed}
        </p>
      )}
    </div>
  )
}
