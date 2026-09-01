'use client'

import { useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { setStaminaNow, useStaminaOverride } from '@/app/world/_stores/stamina-store'
import { setStamina } from '@/domain/tenants/actions'

/**
 * Whether running costs anything in this space.
 *
 * Beside party mode and the rainbow because it is the same kind of control -
 * something about the room everybody in it is standing in - and unlike them in
 * the one way that matters: this is written down. The party is a broadcast that
 * lasts as long as somebody is holding it; this is a rule the space keeps.
 *
 * Owners and admins only. Everybody else sees nothing at all rather than a
 * disabled switch, which is the rule the rest of this rail follows: a control
 * that is always refused is a promise of a feature somebody does not have.
 *
 * ---------------------------------------------------------------------------
 * Why the switch tells the world itself
 * ---------------------------------------------------------------------------
 * `setStamina` deliberately does not revalidate - see the action. So the
 * scene would not hear about this until the next page load, which for the
 * person who just pressed it is "the switch did nothing". Publishing to
 * `stamina-store` is what closes that: the world takes the new rule
 * immediately, and the server's answer is what a later load agrees with.
 *
 * Optimistic, with the revert on a refusal, for the reason every control over a
 * live scene in this codebase is: a switch that waits for a round trip before
 * moving reads as broken at conversational distance.
 */
export function StaminaSwitch({
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
  const override = useStaminaOverride()
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  if (!canSet) return null

  const current = override ?? on

  return (
    <div className="px-1">
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={current}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked
            setError(false)
            setStaminaNow(next)

            start(async () => {
              const result = await attempt(() => setStamina(slug, next))
              if (result.ok) return
              // Put the world back the way it was. A rule that looked like it
              // changed and did not is worse than one that refused visibly.
              setStaminaNow(!next)
              setError(true)
            })
          }}
          className="h-3.5 w-3.5 accent-accent"
        />
        {t.stamina}
      </label>
      <p className="mt-0.5 px-1 text-[11px] text-ink-muted">
        {current ? t.staminaOn : t.staminaOff}
      </p>
      {error && (
        <p role="alert" className="px-1 text-[11px] text-red-400">
          {t.staminaFailed}
        </p>
      )}
    </div>
  )
}
