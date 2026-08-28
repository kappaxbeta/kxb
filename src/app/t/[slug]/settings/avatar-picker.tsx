'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useOptimistic, useState, useTransition } from 'react'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { chooseAvatar } from '@/domain/profile/avatar-actions'
import { AVATARS } from '@/domain/lounge/avatars'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Pick which animal you are.
 *
 * Unlike everything else on the settings page, this is not owner-gated, and it
 * is not even about this workspace: the choice follows your account, so it is
 * the same creature in every lounge you belong to and behind the café counter
 * too. It sits here because settings is where you already come to change things
 * about yourself.
 *
 * The preview renders the real model rather than a thumbnail sheet. The roster is
 * 3.3MB across 24 files, so drawing all of them at once to fill a grid would
 * download the whole pack to answer a question about one animal. One canvas,
 * loading only what you are looking at.
 */
export function AvatarPicker({ initialAvatar }: { initialAvatar: string }) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).avatar
  const [saved, setSaved] = useState(initialAvatar)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * The costume changes on click, not on server response.
   *
   * Choosing an animal is a decision with no wrong answer and nothing to
   * validate, so making anyone watch a round trip for it is pure latency. React
   * rolls this back automatically if the transition throws; an action that
   * returns an error rolls it back explicitly below.
   */
  const [shown, showOptimistically] = useOptimistic(saved)

  function choose(model: string) {
    if (model === shown) return
    setError(null)

    startTransition(async () => {
      showOptimistically(model)

      const result = await chooseAvatar(model)
      if (result.ok) {
        setSaved(result.model)
      } else {
        // `saved` is untouched, so leaving the transition drops the optimistic
        // value and the old animal comes back on its own.
        setError(refusal(result.error))
      }
    })
  }

  return (
    <div className="rounded-xl border border-line bg-surface-raised/40 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs text-ink-muted leading-relaxed">{t.body}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500">
          ✕ {error}
        </div>
      )}

      <div className="flex flex-col gap-5 pt-2 sm:flex-row">
        {/* The stage. Fixed height so swapping models does not reflow the page. */}
        <div className="h-48 w-full shrink-0 overflow-hidden rounded-lg border border-line bg-surface sm:w-48">
          {/*
            A bare Canvas camera points straight down -Z from wherever it is put,
            with no lookAt - so its height *is* the height it looks at. Animals
            stand on y = 0 and reach 2.01 at the tallest, so the camera sits at
            mid-height and far enough back to frame the bunny's ears: at fov 40,
            3.6 units shows ~2.6 of height.
          */}
          <Canvas camera={{ position: [0, 1, 3.6], fov: 40 }}>
            <ambientLight intensity={1.1} />
            <directionalLight position={[3, 6, 4]} intensity={2.2} />
            {/* Neon fill from below, so the model reads against a dark panel. */}
            <pointLight position={[-2, 0.5, 2]} intensity={12} color="#ff4fa3" />
            <pointLight position={[2, 1, 2]} intensity={10} color="#4fd8ff" />
            <Suspense fallback={null}>
              {/* Keyed so switching animal remounts and re-suspends cleanly
                  rather than showing the previous model's pose. Turned off-axis
                  because a three-quarter view reads as a character and a
                  head-on one reads as a mugshot. */}
              <group key={shown} rotation={[0, -1.6, 0]}>
                <AvatarModel model={shown} clip="idle" />
              </group>
            </Suspense>
          </Canvas>
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="radiogroup"
            aria-label={t.label}
            className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
          >
            {AVATARS.map((animal) => {
              const isCurrent = animal === shown
              return (
                <button
                  key={animal}
                  type="button"
                  role="radio"
                  aria-checked={isCurrent}
                  disabled={isPending}
                  onClick={() => choose(animal)}
                  className={`truncate rounded-lg border px-2 py-1.5 text-xs capitalize transition disabled:opacity-60 ${
                    isCurrent
                      ? 'border-accent bg-accent/15 font-semibold text-accent'
                      : 'border-line text-ink-muted hover:border-accent hover:text-ink'
                  }`}
                >
                  {animal}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {isPending ? t.saving : fill(t.youAre, { animal: shown })}
          </p>
        </div>
      </div>
    </div>
  )
}
