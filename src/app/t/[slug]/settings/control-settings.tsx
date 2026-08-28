'use client'

import { CameraModeChoice } from '@/app/components/controls/camera-mode-choice'
import { VoiceModeChoice } from '@/app/components/controls/voice-mode-choice'
import { HandChoice } from '@/app/components/controls/hand-choice'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'

/**
 * The touch layout, settable away from a world.
 *
 * Sits with the avatar, the username and the sound rather than under the
 * owner-gated workspace settings, because like those it is yours and not the
 * space's - and like the sound, it never leaves the machine. Every member sees
 * it, in every space, and nothing here is written to the log.
 *
 * Shown on a laptop too, deliberately, where it changes nothing about the page
 * you are on. The person most likely to come looking for this is the one who
 * answered too fast on a phone and is now at a desk; a card that hid itself on
 * the device with the keyboard would be a setting you can only find while you
 * are already annoyed by it.
 */
export function ControlSettings() {
  const t = settingsDict(useLocale()).controls

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      {/* Keeps its little heading: the card's <h2> covers the hand picker
          below, and two unlabelled radiogroups in one card read as one. */}
      <CameraModeChoice align="start" />

      {/* Keeps its heading too, and for a reason beyond telling two
          radiogroups apart: this is the one setting in the card that decides
          what leaves the device, and a person looking for it should find a
          word that says so rather than a pair of unlabelled pictures. */}
      <VoiceModeChoice align="start" />

      {/* No heading of its own - the <h2> above already said it. */}
      <HandChoice heading={null} align="start" />

      <p className="text-[11px] leading-relaxed text-ink-muted">{t.footnote}</p>
    </div>
  )
}
