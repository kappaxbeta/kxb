'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { adoptAgent, releaseAgent } from '@/domain/agents/actions'
import type { AgentView } from '@/domain/agents/queries'
import { MAX_AGENTS_PER_PLACE } from '@/domain/agents/events'
import { AVATARS } from '@/domain/lounge/avatars'
import type { PlaceId } from '@kxb/peepz-world/places'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Taking creatures in, and letting them go.
 *
 * Built on the emote picker's shape - a round button in the corner that opens a
 * panel above it - because it is the same kind of thing: a scene-level control
 * that has to live over a WebGL canvas without stealing the canvas' pointer
 * events. Open/closed is owned here rather than by the caller, unlike the emote
 * picker, because there is no keyboard shortcut competing for it.
 *
 * ---------------------------------------------------------------------------
 * No name field, on purpose
 * ---------------------------------------------------------------------------
 * A text input inside a scene that reads WASD is a trap: every letter typed is
 * also a step taken, and every fix for that is a global "are we typing" flag
 * that some other handler forgets to check. So a creature is named after its
 * animal and `renameAgent` waits for a surface that is not standing in the
 * middle of a game - the action exists, nothing calls it yet.
 */

/** The panel's own copy of the roster, so the scene can draw a new one at once. */
export function CreaturePicker({
  slug,
  place,
  agents,
  onChange,
  /** Nudged aside from whatever already owns the corner. */
  className = '',
}: {
  slug: string
  place: PlaceId
  agents: AgentView[]
  /**
   * Hand the roster back up.
   *
   * The scene holds the list, not this component, because the *bodies* are
   * drawn from it - so an adoption has to reach the canvas, not just the panel.
   */
  onChange: (agents: AgentView[]) => void
  className?: string
}) {
  const refusal = useRefusal()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Escape closes, and so does clicking anywhere else. Lifted from the emote
   * picker, including the reason it is on the document rather than an overlay:
   * the thing behind is a 3D scene that wants its own clicks, and a full-screen
   * catcher would swallow the first one back into the game every time.
   */
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Stopped so the scene's own Escape does not also fire and drop the
        // player out of build mode on the way past.
        event.stopPropagation()
        setOpen(false)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const full = agents.length >= MAX_AGENTS_PER_PLACE

  /**
   * Draw the animal first, ask the server second.
   *
   * The id is minted here, which is what makes that possible: the id *is* the
   * seed, so there is nothing the server has to tell us before the creature can
   * start living its life. A failed round trip takes it back out again and says
   * why - deliberately hand-rolled rather than `useOptimistic`, because these
   * actions do not revalidate a path (a `revalidatePath` would tear down the
   * React tree and take the canvas with it), so an optimistic value would snap
   * back the moment the transition settled.
   */
  function adopt(avatar: string) {
    if (full || pending) return

    const agent: AgentView = {
      agentId: crypto.randomUUID(),
      // Capitalised animal. See the note above about why there is no field.
      name: avatar[0].toUpperCase() + avatar.slice(1),
      avatar,
    }

    const before = agents
    setError(null)
    onChange([...before, agent])

    startTransition(async () => {
      const result = await adoptAgent(slug, { ...agent, place })
      if (!result.ok) {
        onChange(before)
        setError(refusal(result.error))
      }
    })
  }

  const t = worldDict(useLocale()).dock

  function release(agentId: string) {
    if (pending) return

    const before = agents
    setError(null)
    onChange(before.filter((agent) => agent.agentId !== agentId))

    startTransition(async () => {
      const result = await releaseAgent(slug, { agentId })
      if (!result.ok) {
        onChange(before)
        setError(refusal(result.error))
      }
    })
  }

  return (
    <div className={`pointer-events-auto absolute z-30 ${className}`}>
      {open && (
        <div
          ref={panel}
          className="absolute bottom-full right-0 mb-2 max-h-[46vh] w-[min(92vw,20rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-black/80 p-3 shadow-2xl backdrop-blur"
        >
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-white">
            {t.creatures}
            <span className="text-[11px] font-normal tabular-nums text-white/40">
              {agents.length}/{MAX_AGENTS_PER_PLACE}
            </span>
          </h2>

          {agents.length > 0 && (
            <ul className="mb-3 space-y-1">
              {agents.map((agent) => (
                <li
                  key={agent.agentId}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5"
                >
                  <span className="flex-1 truncate text-xs text-white/80">{agent.name}</span>
                  <button
                    type="button"
                    onClick={() => release(agent.agentId)}
                    disabled={pending}
                    aria-label={fill(t.letGoOf, { name: agent.name })}
                    className="rounded px-1.5 py-0.5 text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    {t.letGo}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mb-2 text-[11px] text-white/50">
            {full ? t.full : t.theyWander}
          </p>

          <div
            role="group"
            aria-label={t.adopt}
            className="grid grid-cols-3 gap-1"
          >
            {AVATARS.map((animal) => (
              <button
                key={animal}
                type="button"
                onClick={() => adopt(animal)}
                disabled={full || pending}
                className="truncate rounded-lg border border-white/10 px-2 py-1.5 text-xs capitalize text-white/60 transition hover:border-amber-300/50 hover:text-white disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-white/60"
              >
                {animal}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[11px] text-red-300">
              {error}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? t.closeCreatures : t.openCreatures}
        title={t.creatures}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-lg shadow-lg backdrop-blur transition-colors ${
          open ? 'bg-amber-400/30' : 'bg-black/55 hover:bg-black/70'
        }`}
      >
        <span aria-hidden>🐾</span>
      </button>
    </div>
  )
}
