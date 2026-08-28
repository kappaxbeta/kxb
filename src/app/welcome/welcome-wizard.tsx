'use client'

import { useState, useTransition } from 'react'
import { fill } from '@/app/i18n/fill'
import { spacesDict } from '@/app/i18n/spaces'
import type { Locale } from '@/domain/i18n/locale'
import { PeepPicker, PeepPortrait } from '@/app/components/peep-picker'
import { finishWelcome } from '@/app/welcome/actions'
import { chooseAvatar } from '@/domain/profile/avatar-actions'
import { setUsername } from '@/domain/profile/username-actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Name, then face, then in.
 *
 * Two steps rather than one form, because the two questions fail in completely
 * different ways. A handle can be refused - somebody else has it - so that step
 * has to be able to stop and say so. An animal cannot be wrong, so that step is
 * a click that is already saved by the time you look up. Putting them on one
 * page would mean one Save button whose failure mode is "your name was taken,
 * also your peep is a crab now".
 *
 * The name is saved on leaving step one rather than at the end, which is what
 * makes the wizard survive a closed tab: reopening lands on the peep step
 * because the name is already the answer. Nothing here is held hostage until a
 * final submit.
 */
export function WelcomeWizard({
  suggestedUsername,
  initialAvatar,
  locale,
}: {
  suggestedUsername: string
  initialAvatar: string
  /** Resolved by the page. This screen runs before there is a space to be in. */
  locale: Locale
}) {
  const refusal = useRefusal()
  const t = spacesDict(locale).welcome
  const [step, setStep] = useState<'name' | 'peep'>('name')
  const [username, setUsernameValue] = useState(suggestedUsername)
  const [avatar, setAvatar] = useState(initialAvatar)
  const [error, setError] = useState<string | null>(null)
  /** A free handle near the one that was refused, offered as one click. */
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveName(next: string) {
    setError(null)
    setSuggestion(null)
    startTransition(async () => {
      const result = await setUsername(next)
      if (!result.ok) {
        setError(refusal(result.error))
        setSuggestion(result.suggestion ?? null)
        return
      }
      // Whatever the server settled on, not what was typed - the schema
      // lowercases and trims, and the field should show what is now true.
      setUsernameValue(result.username)
      setStep('peep')
    })
  }

  function submitName(formData: FormData) {
    saveName(
      String(formData.get('username') ?? '')
        .trim()
        .toLowerCase(),
    )
  }

  /**
   * The peep changes on click and saves behind it.
   *
   * There is nothing to validate and no wrong answer, so making somebody watch
   * a round trip to see themselves become a fox is pure latency. A failure puts
   * the old animal back and says why.
   */
  function pick(next: string) {
    if (next === avatar) return

    const previous = avatar
    setAvatar(next)
    setError(null)

    startTransition(async () => {
      const result = await chooseAvatar(next)
      if (!result.ok) {
        setAvatar(previous)
        setError(refusal(result.error))
      }
    })
  }

  function enter() {
    startTransition(async () => {
      await finishWelcome()
    })
  }

  return (
    <div className="enter w-full max-w-lg rounded-2xl border border-line bg-surface-raised/80 p-6 backdrop-blur-md sm:p-8">
      <div className="flex items-center gap-2">
        <Pip active={step === 'name'} done={step === 'peep'} />
        <Pip active={step === 'peep'} done={false} />
        <span className="ml-1 text-xs tracking-widest text-ink-muted uppercase">
          {fill(t.step, { n: step === 'name' ? 1 : 2 })}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 space-y-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500"
        >
          <p>✕ {error}</p>

          {/*
            The way out of a taken handle.

            This is the first screen of the app, and "that name is gone, guess
            again" is a poor first impression - especially when the server
            already knows which one is free. One click takes it and moves on.
          */}
          {suggestion && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => saveName(suggestion)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 font-mono text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
            >
              {fill(t.takeInstead, { name: suggestion })}
            </button>
          )}
        </div>
      )}

      {step === 'name' ? (
        <>
          <h1 className="font-pixel mt-5 text-2xl leading-tight sm:text-3xl">
            {t.nameTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{t.nameBody}</p>

          <form action={submitName} className="mt-6 space-y-3">
            <input
              name="username"
              defaultValue={username}
              required
              minLength={2}
              maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9_\-]*[A-Za-z0-9]"
              autoComplete="off"
              autoCapitalize="none"
              autoFocus
              spellCheck={false}
              aria-label={t.nameLabel}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-accent"
            />
            <p className="text-xs text-ink-muted">{t.nameRules}</p>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-accent px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? t.saving : t.continue}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-pixel mt-5 text-2xl leading-tight sm:text-3xl">
            {fill(t.peepTitle, { name: username })}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{t.peepBody}</p>

          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            <PeepPortrait avatar={avatar} />
            <p className="text-sm text-ink-muted">
              {t.youAreLead}
              <span className="text-ink capitalize">{avatar}</span>
              {t.youAreTail}
            </p>
          </div>

          <div className="mt-5">
            <PeepPicker selected={avatar} onSelect={pick} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enter}
              disabled={isPending}
              className="flex-1 rounded-full bg-accent px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t.enter}
            </button>
            {/* Backwards, not cancel. There is no cancelling a wizard whose
                first step has already been written - the name is saved - so the
                honest affordance is "let me change that again". */}
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep('name')
              }}
              disabled={isPending}
              className="rounded-full border border-line px-5 py-3 text-sm transition hover:bg-surface disabled:opacity-50"
            >
              {t.back}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Where you are, as two dots. */
function Pip({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={`h-1.5 w-8 rounded-full transition ${
        active ? 'bg-accent' : done ? 'bg-accent/40' : 'bg-line'
      }`}
    />
  )
}
