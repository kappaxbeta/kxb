'use client'

import { useAudioGate, useAudioPrefs } from '@/app/components/audio/use-audio'
import { play } from '@/lib/audio/engine'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'

/**
 * The audio settings view.
 *
 * Sits with the avatar and the username rather than under the owner-gated
 * workspace settings below them, because like those two it is yours and not
 * the workspace's - and unlike those two it does not even leave the machine.
 * Every member sees it, in every space, and nothing here is written to the log.
 *
 * The one thing this view has to get right that a checkbox list would not: the
 * sliders make a sound while you drag them. A volume control you cannot hear
 * is a number, and setting it becomes guesswork followed by a walk to the
 * lounge to find out what you chose.
 */

function VolumeRow({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className={disabled ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-xs font-medium text-ink">
          {label}
        </label>
        <span className="font-mono text-[10px] tabular-nums text-ink-muted">
          {Math.round(value * 100)}%
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="mt-2 w-full accent-[var(--color-accent)] disabled:cursor-not-allowed"
      />

      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{hint}</p>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
          {hint}
        </span>
      </span>
    </label>
  )
}

export function AudioSettings() {
  // The preview buttons are the first sound many people will ask this app for,
  // and they are a click - so the gate opens on the very gesture that wants it.
  useAudioGate()

  const t = settingsDict(useLocale()).audio
  const { prefs, set } = useAudioPrefs()

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      <div className="space-y-4">
        <Toggle
          checked={prefs.music}
          label={t.music}
          hint={t.musicHint}
          onChange={(music) => set({ music })}
        />

        <VolumeRow
          id="music-volume"
          label={t.musicVolume}
          hint={t.musicVolumeHint}
          value={prefs.musicVolume}
          disabled={!prefs.music}
          onChange={(musicVolume) => set({ musicVolume })}
        />
      </div>

      <hr className="border-line" />

      <div className="space-y-4">
        <Toggle
          checked={prefs.sfx}
          label={t.sfx}
          hint={t.sfxHint}
          onChange={(sfx) => set({ sfx })}
        />

        <VolumeRow
          id="sfx-volume"
          label={t.sfxVolume}
          hint={t.sfxVolumeHint}
          value={prefs.sfxVolume}
          disabled={!prefs.sfx}
          onChange={(sfxVolume) => {
            set({ sfxVolume })
            // Played after the change, so what you hear is the value you just
            // dragged to rather than the one you left. The catalogue's own
            // 40ms floor is what stops a fast drag becoming a machine gun.
            play('click')
          }}
        />
      </div>

      {/*
        Auditioning the real thing.

        The four sounds the game actually makes, rather than one generic beep -
        the useful question is not "is audio working" but "is a hit going to be
        too loud when I am in a call", and only the hit can answer that.
      */}
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {t.preview}
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['hit', t.hit],
              ['arrive', t.arrive],
              ['win', t.win],
              ['build', t.build],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={!prefs.sfx}
              onClick={() => play(id)}
              className="rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-ink transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-muted">{t.footnote}</p>
    </div>
  )
}
