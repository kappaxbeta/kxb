'use client'

import { talkOf, type XpDocument } from '@kxb/xp'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict, type XpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * Whether the people in this level may say anything, as two switches.
 *
 * The editor half of docs/xp/backlog.md §7b's off switch. It sits with the mode
 * and the camera in the document window for the same reason those two do: it is
 * a fact about the whole document rather than about whatever is selected, and
 * two rows do not earn a window of their own.
 *
 * ---------------------------------------------------------------------------
 * Both halves, in one place
 * ---------------------------------------------------------------------------
 * Chat and emotes are separate switches and one panel, because the mistake this
 * exists to prevent is turning one off: a level with chat off and ninety-one
 * faces still on has not been made quiet, and an author who found only one of
 * two controls would think it had. Seeing them together is most of the feature.
 *
 * ---------------------------------------------------------------------------
 * On is the state with nothing written down
 * ---------------------------------------------------------------------------
 * `talkOf` fills in the absent block, so a document that has never had an
 * opinion shows both switches on - which is what it *is*, and is why turning
 * one back on removes the field rather than writing `true` (`setTalk`). The
 * consequence worth knowing while looking at this panel: switching something
 * off and on again leaves the file exactly as it was found.
 *
 * ---------------------------------------------------------------------------
 * What it cannot promise
 * ---------------------------------------------------------------------------
 * On here does not mean there will be a chat panel. Whether there is anywhere
 * for a message to go is the host's answer and the space's - a space with chat
 * switched off has no chat in its levels either - so the sentence under the
 * switch says *allowed*, not *available*. A panel that promised the second
 * would be wrong in every level opened from the operator route, where there is
 * no space at all.
 */

export interface TalkProps {
  document: XpDocument
  onChange: (patch: { chat?: boolean; emotes?: boolean }) => void
}

export function Talk({ document, onChange }: TalkProps) {
  const t = xpEditorDict(useLocale()).talk
  const talk = talkOf(document)

  return (
    <section className="mt-4 border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>

      <div className="grid grid-cols-2 gap-1.5">
        <Switch
          label={t.chat}
          words={t}
          on={talk.chat}
          onClick={() => onChange({ chat: !talk.chat })}
        />
        <Switch
          label={t.emotes}
          words={t}
          on={talk.emotes}
          onClick={() => onChange({ emotes: !talk.emotes })}
        />
      </div>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-neutral-500">
        {talk.chat && talk.emotes
          ? t.bothAllowed
          : talk.chat
            ? t.noFaces
            : talk.emotes
              ? t.noChat
              : t.quiet}
      </p>

      <Hint className="mt-1">{t.allowedNotPromised}</Hint>
    </section>
  )
}

/**
 * One switch, drawn as the panel's own pressed/unpressed pair.
 *
 * The violet of the camera's kind picker rather than a green/red pair: on is
 * the ordinary state here, and a level with both on should not look like a
 * level with two warnings in it.
 */
function Switch({
  label,
  words,
  on,
  onClick,
}: {
  label: string
  /** Resolved by the panel, so a switch is not two lookups. */
  words: XpEditorDict['talk']
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
        on
          ? 'border-violet-500 bg-violet-500/15 text-violet-200'
          : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
      }`}
    >
      {label} {on ? words.on : words.off}
    </button>
  )
}
