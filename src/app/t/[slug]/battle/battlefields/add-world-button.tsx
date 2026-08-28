'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addWorldToSpace } from '@/domain/worlds/actions'
import { battleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Turning a catalogue world into an arena you can fight on, from the list of
 * arenas.
 *
 * The same action the world's own page offers, put where the decision is
 * actually made: nobody browsing a catalogue is thinking "battlefield", but
 * everybody looking at a short list of their own arenas is thinking "we need
 * another one". Two ways in to one server action, and the action is what
 * decides whether it may run.
 *
 * What it says afterwards matters more than usual, because the crossing is
 * lossy: a world that was half park arrives as a lawn, and being told that in
 * the moment is the difference between a known trade and a bug report.
 */
export function AddWorldButton({ slug, id, name }: { slug: string; id: string; name: string }) {
  const refusal = useRefusal()
  const t = battleDict(useLocale()).fields
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addWorldToSpace(slug, id)
            if (!result.ok) {
              setNote(refusal(result.error))
              return
            }
            router.push(`/t/${slug}/battle/battlefields/${result.worldId}/build`)
          })
        }
        className="rounded-lg border border-line px-3 py-1.5 text-center text-xs transition hover:bg-surface disabled:opacity-40"
      >
        {pending ? fill(t.copying, { name }) : t.useAsBattlefield}
      </button>
      {note && <p className="text-[11px] text-ink-muted">{note}</p>}
    </div>
  )
}
