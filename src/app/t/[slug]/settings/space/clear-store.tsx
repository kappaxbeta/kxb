'use client'

import { useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { clearXpStore } from '@/domain/xps/store-actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict, type SettingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The two controls the store card was missing.
 *
 * docs/xp/backlog.md §7a settled the rule and
 * `20261031000000_clearing_a_store.sql` holds the argument. The short version,
 * because it is what these two buttons *are*:
 *
 *   - **Clear the shared world** — the `space` row. The town everybody built,
 *     reset. Nobody loses anything of their own.
 *   - **Clear everything** — that, and every player's private progress, and
 *     everybody's entry on whatever board this level keeps.
 *
 * ---------------------------------------------------------------------------
 * Two presses, and the second one says the number
 * ---------------------------------------------------------------------------
 * Not a `confirm()`, and not a modal either. A modal for this is a dialog
 * somebody dismisses without reading because they have dismissed nine of them
 * today; the second press is on a button whose words have *changed*, in the
 * place they were already looking, and it names how much it is about to erase.
 *
 * The count is honest about which count it is. `player` rows are one per person
 * — the table's own unique index says so — so "3 people's progress" is a fact
 * rather than an estimate, and the shared board is counted separately because
 * losing your name off a leaderboard and losing your inventory are not the same
 * loss.
 *
 * ---------------------------------------------------------------------------
 * There is no undo, and no "cleared 3 saves" either
 * ---------------------------------------------------------------------------
 * These rows are not the event log; nothing replays them, and last-write-wins
 * means the previous value went the moment it was overwritten.
 *
 * There *was* a line here saying what had gone, and watching it in a browser is
 * what removed it: the action revalidates the settings page, the page re-renders
 * from a store that is now empty, and the whole game — this component with it —
 * is no longer on the card. A confirmation that survives only when the clear was
 * *partial* is worse than none, because the case it goes missing in is the one
 * somebody most wants confirmed.
 *
 * So the figures are the answer, and they are a better one: the saves count
 * drops, the scope line goes, and a game with nothing left leaves the card
 * altogether. Only the failure needs words, because that is the case where
 * nothing else on the screen changes.
 */
export function ClearStore({
  slug,
  xpId,
  spaceRows,
  playerRows,
  sharedRows,
}: {
  slug: string
  xpId: string
  /** 1 when this level keeps a shared world, 0 when it does not. */
  spaceRows: number
  /** One per person, so this *is* the number of people. */
  playerRows: number
  /** Also one per person, and a different loss. */
  sharedRows: number
}) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).storage
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState<'space' | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const theirs = playerRows + sharedRows

  function clear(everything: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await attempt(() => clearXpStore(slug, xpId, everything))
      setArmed(null)
      // Success needs no branch: the action revalidated the page, and what
      // comes back has the saves it still has.
      if (!result.ok) setError(refusal(result.error))
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {spaceRows > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => (armed === 'space' ? clear(false) : setArmed('space'))}
          onBlur={() => setArmed((was) => (was === 'space' ? null : was))}
          className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-ink-muted hover:text-ink disabled:opacity-50"
        >
          {armed === 'space' ? t.clearAgain : t.clear}
        </button>
      )}

      {theirs > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => (armed === 'all' ? clear(true) : setArmed('all'))}
          onBlur={() => setArmed((was) => (was === 'all' ? null : was))}
          className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:border-red-500/70 hover:text-red-200 disabled:opacity-50"
        >
          {armed === 'all'
            ? fill(t.eraseAgain, { what: describeLoss(playerRows, sharedRows, t) })
            : t.clearAll}
        </button>
      )}

      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  )
}

/**
 * What the second press is about to take, in people rather than in rows.
 *
 * A row count is our word for it. "Three people's progress" is theirs, and it
 * is the one somebody should be reading in the half-second before they press a
 * thing that cannot be undone.
 */
function describeLoss(
  players: number,
  shared: number,
  t: SettingsDict['storage'],
): string {
  const parts: string[] = []
  if (players > 0) {
    parts.push(players === 1 ? t.onePerson : fill(t.manyPeople, { n: players }))
  }
  if (shared > 0) {
    parts.push(shared === 1 ? t.oneEntry : fill(t.manyEntries, { n: shared }))
  }
  return parts.join(t.and)
}
