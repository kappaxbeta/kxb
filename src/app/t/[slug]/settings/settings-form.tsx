'use client'

import { useState, useTransition } from 'react'
import {
  renameTenant,
  setChatEnabled,
  setLoungePublicityAction,
  setSpaceCapability,
} from '@/domain/tenants/actions'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

export function SettingsForm({
  slug,
  initialName,
  initialIsPublicLounge,
  initialChatEnabled,
  /**
   * Whether this installation has chat at all.
   *
   * False hides the switch entirely rather than disabling it, which is the same
   * choice `requireFeature` makes for a whole page and for the same reason: a
   * greyed-out control explaining a feature the reader cannot have is an
   * advertisement, not an interface.
   */
  chatAvailable,
  initialMatchesEnabled,
  /**
   * Whether this installation has the battle system at all.
   *
   * The same read as `chatAvailable` and hidden the same way when false, for
   * the reason given there - and it is the *flag alone*, not `battleOpen`,
   * because this is the control that changes the space's half of that answer.
   * Gating it on the combined one would make the switch impossible to turn back
   * on once it had been turned off.
   */
  matchesAvailable,
  initialPerfDisplay,
  /**
   * Whether anything in this space's rooms is measuring at all.
   *
   * The `perf` flag, read on its own rather than through `perfDisplayOn` - the
   * same reason `matchesAvailable` is the flag and not `battleOpen`: this is
   * the control that sets the space's half of that answer, and asking the
   * combined question would make the switch impossible to turn back on.
   *
   * Hidden rather than disabled when false, like the two above. There is
   * nothing to look at in a space nothing is measuring, and a greyed switch
   * offering it would be an advertisement for an operator's diagnostic.
   */
  perfAvailable,
  isOwnerOrAdmin,
}: {
  slug: string
  initialName: string
  initialIsPublicLounge: boolean
  initialChatEnabled: boolean
  chatAvailable: boolean
  initialMatchesEnabled: boolean
  matchesAvailable: boolean
  initialPerfDisplay: boolean
  perfAvailable: boolean
  isOwnerOrAdmin: boolean
}) {
  const refusal = useRefusal()
  const [name, setName] = useState(initialName)
  const [isPublic, setIsPublic] = useState(initialIsPublicLounge)
  const [chatOn, setChatOn] = useState(initialChatEnabled)
  const [matchesOn, setMatchesOn] = useState(initialMatchesEnabled)
  const [perfOn, setPerfOn] = useState(initialPerfDisplay)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const t = settingsDict(useLocale()).space
  const [isPending, startTransition] = useTransition()

  function handlePublicityToggle(newVal: boolean) {
    setIsPublic(newVal)
    setStatusMsg(null)
    setErrorMsg(null)

    startTransition(async () => {
      const res = await setLoungePublicityAction(slug, newVal)
      if (res.ok) {
        setStatusMsg(newVal ? t.showcase.on : t.showcase.off)
      } else {
        setIsPublic(!newVal)
        setErrorMsg(refusal(res.error))
      }
    })
  }

  /**
   * Flipped optimistically and rolled back if the server refuses, the same
   * shape as the showcase toggle above it. The rollback matters more here: a
   * switch that says "on" while the lounge shows no chat tab is a support
   * ticket, and the two are on different pages so nobody would notice for days.
   */
  function handleChatToggle(newVal: boolean) {
    setChatOn(newVal)
    setStatusMsg(null)
    setErrorMsg(null)

    startTransition(async () => {
      const res = await setChatEnabled(slug, newVal)
      if (res.ok) {
        setStatusMsg(newVal ? t.chat.on : t.chat.off)
      } else {
        setChatOn(!newVal)
        setErrorMsg(refusal(res.error))
      }
    })
  }

  /**
   * Matches, on the same optimistic-with-rollback terms as the two above.
   *
   * `setSpaceCapability` rather than a switch of its own: the `battle`
   * capability has existed since the event desk was built and is spelled
   * "Matches" there too. What is new is that an ordinary space can reach it,
   * and that `battleOpen` now reads it - before, turning it off outside an
   * event window was a switch that changed nothing.
   */
  function handleMatchesToggle(newVal: boolean) {
    setMatchesOn(newVal)
    setStatusMsg(null)
    setErrorMsg(null)

    startTransition(async () => {
      const res = await setSpaceCapability(slug, 'battle', newVal)
      if (res.ok) {
        setStatusMsg(newVal ? t.matches.on : t.matches.off)
      } else {
        setMatchesOn(!newVal)
        setErrorMsg(refusal(res.error))
      }
    })
  }

  /**
   * The performance readout, on the same optimistic-with-rollback terms.
   *
   * `perf_display` is a space capability like `battle`, and the only one that
   * defaults *off* - see `perfDisplayOn`. Nothing about measurement changes
   * here: this decides whether the people in this space's rooms are shown the
   * numbers, not whether there are any.
   */
  function handlePerfToggle(newVal: boolean) {
    setPerfOn(newVal)
    setStatusMsg(null)
    setErrorMsg(null)

    startTransition(async () => {
      const res = await setSpaceCapability(slug, 'perf_display', newVal)
      if (res.ok) {
        setStatusMsg(newVal ? t.perf.on : t.perf.off)
      } else {
        setPerfOn(!newVal)
        setErrorMsg(refusal(res.error))
      }
    })
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault()
    setStatusMsg(null)
    setErrorMsg(null)

    startTransition(async () => {
      const res = await renameTenant(slug, name)
      if (res.ok) {
        setStatusMsg(t.rename.done)
      } else {
        setErrorMsg(refusal(res.error))
      }
    })
  }

  const publicUrl = `${
    typeof window !== 'undefined' ? window.location.origin : ''
  }/v/${slug}`

  return (
    <div className="space-y-8 max-w-2xl">
      {statusMsg && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-500 font-medium">
          ✓ {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-500 font-medium">
          ✕ {errorMsg}
        </div>
      )}

      {/* Public Lounge Showcase Setting */}
      <div className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t.showcase.title}</h2>
          <p className="mt-1 text-xs text-ink-muted leading-relaxed">{t.showcase.body}</p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm font-medium text-ink">{t.showcase.toggle}</span>
          <button
            type="button"
            disabled={!isOwnerOrAdmin || isPending}
            onClick={() => handlePublicityToggle(!isPublic)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isPublic ? 'bg-accent' : 'bg-line'
            } disabled:opacity-40`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPublic ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {isPublic && (
          <div className="mt-4 pt-4 border-t border-line text-xs">
            <p className="text-ink-muted mb-1.5 font-medium">{t.showcase.urlLabel}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={publicUrl}
                className="flex-1 bg-surface px-3 py-1.5 rounded border border-line text-xs font-mono select-all text-ink"
              />
              <a
                href={`/v/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded bg-accent text-white font-medium text-xs hover:opacity-90 transition"
              >
                {t.showcase.open}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Lounge chat. Absent, not disabled, where the feature is not available -
          see the note on `chatAvailable`. */}
      {chatAvailable && (
        <div className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.chat.title}</h2>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">{t.chat.body}</p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-ink">{t.chat.toggle}</span>
            <button
              type="button"
              role="switch"
              aria-checked={chatOn}
              aria-label={t.chat.label}
              disabled={!isOwnerOrAdmin || isPending}
              onClick={() => handleChatToggle(!chatOn)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                chatOn ? 'bg-accent' : 'bg-line'
              } disabled:opacity-40`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  chatOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Said out loud rather than left to be discovered. Turning a chat off
              is not the same as deleting one, and an admin doing it to end a
              conversation should know which of the two they are doing. */}
          {chatOn && (
            <p className="mt-2 border-t border-line pt-4 text-xs text-ink-muted">
              {t.chat.note}
            </p>
          )}
        </div>
      )}

      {/* Matches. Absent rather than disabled where the installation has no
          battle system - see the note on `matchesAvailable`. */}
      {matchesAvailable && (
        <div className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.matches.title}</h2>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">{t.matches.body}</p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-ink">{t.matches.toggle}</span>
            <button
              type="button"
              role="switch"
              aria-checked={matchesOn}
              aria-label={t.matches.label}
              disabled={!isOwnerOrAdmin || isPending}
              onClick={() => handleMatchesToggle(!matchesOn)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                matchesOn ? 'bg-accent' : 'bg-line'
              } disabled:opacity-40`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  matchesOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Said before it is pressed, because the two halves of the answer
              are not obvious: a fixture in play is not called off by this, and
              nothing anybody fought is deleted. */}
          {matchesOn && (
            <p className="mt-2 border-t border-line pt-4 text-xs text-ink-muted">
              {t.matches.note}
            </p>
          )}
        </div>
      )}

      {/* The performance readout. Absent where nothing in this space's rooms is
          measuring - see the note on `perfAvailable`. */}
      {perfAvailable && (
        <div className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.perf.title}</h2>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">{t.perf.body}</p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-ink">{t.perf.toggle}</span>
            <button
              type="button"
              role="switch"
              aria-checked={perfOn}
              aria-label={t.perf.label}
              disabled={!isOwnerOrAdmin || isPending}
              onClick={() => handlePerfToggle(!perfOn)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                perfOn ? 'bg-accent' : 'bg-line'
              } disabled:opacity-40`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  perfOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <p className="mt-2 border-t border-line pt-4 text-xs text-ink-muted">{t.perf.note}</p>
        </div>
      )}

      {/* Rename Workspace */}
      <form
        onSubmit={handleRename}
        className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-ink">{t.rename.title}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t.rename.body}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <input
            type="text"
            value={name}
            disabled={!isOwnerOrAdmin || isPending}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-surface px-3 py-2 rounded-lg border border-line text-sm text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!isOwnerOrAdmin || isPending || name === initialName}
            className="px-4 py-2 rounded-lg bg-surface-raised border border-line text-xs font-medium text-ink hover:bg-surface disabled:opacity-40"
          >
            {t.rename.save}
          </button>
        </div>
      </form>
    </div>
  )
}
