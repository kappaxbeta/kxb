'use client'

import { useState, useTransition } from 'react'

import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { setSpaceCapability } from '@/domain/tenants/actions'
import type { CastReach } from '@/lib/tenant'

/**
 * Who may write a word the whole room sees.
 *
 * One control with three positions, because that is the question a host has -
 * "can visitors set off fireworks in my lounge?" - and it is not the shape the
 * answer is *stored* in. Underneath it is two switches on the space's
 * capability map (see `spells` in domain/tenants/events.ts), which is what
 * kept this off the migration queue; the ladder is assembled here and read back
 * by `castReach`.
 *
 * A step down the ladder is two writes when it crosses both switches. They are
 * sent in order and the first failure stops the second, so a refusal cannot
 * leave the space one switch into a position nobody chose.
 */

const RUNGS: CastReach[] = ['admins', 'members', 'everyone']

export function SpellsCard({
  slug,
  initial,
  canEdit,
}: {
  slug: string
  initial: CastReach
  /** Members who are not owners or admins see the setting and cannot move it. */
  canEdit: boolean
}) {
  const t = settingsDict(useLocale()).space.spells
  const [reach, setReach] = useState<CastReach>(initial)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const names: Record<CastReach, string> = {
    admins: t.admins,
    members: t.members,
    everyone: t.everyone,
  }

  const choose = (next: CastReach) => {
    if (next === reach || !canEdit) return
    const was = reach
    // Optimistic, and put back below if the server says no: this is a radio
    // group, and one that only moves after a round trip feels broken.
    setReach(next)
    setNote(null)
    setError(null)

    start(async () => {
      const writes: [string, boolean][] = [
        ['spells', next !== 'admins'],
        ['spells_guests', next === 'everyone'],
      ]
      for (const [capability, enabled] of writes) {
        const result = await setSpaceCapability(slug, capability, enabled)
        if (result.ok) continue
        setReach(was)
        setError(result.error)
        return
      }
      setNote(t.saved)
    })
  }

  return (
    <div className="rounded-xl border border-line bg-surface-raised/40 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      <div role="radiogroup" aria-label={t.title} className="flex flex-col gap-2 pt-2">
        {RUNGS.map((rung) => (
          <button
            key={rung}
            type="button"
            role="radio"
            aria-checked={reach === rung}
            disabled={!canEdit || pending}
            onClick={() => choose(rung)}
            className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition ${
              reach === rung
                ? 'border-accent bg-accent/10 text-ink'
                : 'border-line text-ink-muted hover:border-accent/40'
            } ${canEdit ? '' : 'cursor-default opacity-70'}`}
          >
            <span
              aria-hidden
              className={`size-3.5 shrink-0 rounded-full border ${
                reach === rung ? 'border-accent bg-accent' : 'border-line'
              }`}
            />
            {names[rung]}
          </button>
        ))}
      </div>

      <p className="border-t border-line pt-4 text-xs text-ink-muted">{t.note}</p>

      {note && <p className="text-xs font-medium text-emerald-500">{note}</p>}
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
}
