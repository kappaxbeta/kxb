'use client'

import { LIMIT_KEYS, type LimitKey, type TierLimits } from '@/domain/billing/tiers'
import type { StoredLimits } from '@/domain/billing/tier-admin'

/**
 * The nine limits, as three answers rather than one number.
 *
 * A `limits` column has three states and only one of them is a number, which is
 * the whole reason this is a widget rather than nine inputs. Absent means
 * *inherit*, `null` means *unlimited*, and a plain number field cannot tell
 * them apart - an empty box would have to mean one of the two, and whichever it
 * meant would silently rewrite every row somebody saved.
 *
 * So the mode is picked explicitly and the number is only asked for when the
 * mode is "a number". `mergeLimits` on the server applies exactly these rules
 * in reverse.
 */

export type LimitMode = 'inherit' | 'unlimited' | 'number'

export interface LimitDraft {
  mode: LimitMode
  /** Only read when the mode is `number`. Kept as typed, so backspacing works. */
  value: string
}

export type LimitsDraft = Record<LimitKey, LimitDraft>

/** What each limit is called on this page. The doc comments in `tiers.ts` are the long form. */
const LIMIT_LABELS: Record<LimitKey, string> = {
  seats: 'Members',
  guests: 'Guests at once',
  xoPlaces: 'Rooms',
  xpPlaces: 'XP places',
  magazine: 'Magazine',
  projects: 'XP projects',
  matches: 'Matches at once',
  pages: 'Pages',
  pictures: 'Images',
}

/**
 * What to show beside an inherited field when the merged read is missing.
 *
 * Only reachable if the effective table and the stored table disagree about
 * which tiers exist, which is a broken table rather than a state to design for.
 * Everything reads as unlimited, which is the honest "we do not know" here - it
 * says nothing is being enforced rather than inventing a cap.
 */
export const NO_LIMITS: TierLimits = {
  seats: null,
  guests: null,
  xoPlaces: null,
  xpPlaces: null,
  magazine: null,
  projects: null,
  matches: null,
  pages: null,
  pictures: null,
}

export function draftFromLimits(limits: StoredLimits): LimitsDraft {
  return Object.fromEntries(
    LIMIT_KEYS.map((key): [LimitKey, LimitDraft] => {
      if (!Object.hasOwn(limits, key)) return [key, { mode: 'inherit', value: '' }]
      const stated = limits[key]
      if (stated === null) return [key, { mode: 'unlimited', value: '' }]
      return [key, { mode: 'number', value: String(stated) }]
    }),
  ) as LimitsDraft
}

/**
 * The draft as a row would store it, or the first thing wrong with it.
 *
 * Refuses rather than coerces, matching `mergeLimits`: a field that says
 * "number" and holds nothing is somebody mid-edit, and writing it as inherit
 * would drop a cap they meant to set without ever saying so.
 */
export function limitsFromDraft(
  draft: LimitsDraft,
): { ok: true; limits: StoredLimits } | { ok: false; error: string } {
  const limits: StoredLimits = {}

  for (const key of LIMIT_KEYS) {
    const field = draft[key]
    if (field.mode === 'inherit') continue
    if (field.mode === 'unlimited') {
      limits[key] = null
      continue
    }

    const parsed = Number(field.value.trim())
    if (!field.value.trim() || !Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: `${LIMIT_LABELS[key]} needs a whole number, or another mode.` }
    }
    limits[key] = parsed
  }

  return { ok: true, limits }
}

export function LimitFields({
  draft,
  onChange,
  effective,
  inheritLabel,
  disabled,
}: {
  draft: LimitsDraft
  onChange: (key: LimitKey, field: LimitDraft) => void
  /**
   * What each limit resolves to today, after the merge.
   *
   * Shown beside a field set to "inherit", because that is the one mode where
   * the form shows nothing and the product still has an answer. Without it an
   * operator reading this page cannot tell "xo has no cap on pages" from "xo's
   * cap on pages is written down somewhere else".
   */
  effective: TierLimits
  /** What inheriting means for this row - free's numbers, or the code's. */
  inheritLabel: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LIMIT_KEYS.map((key) => {
        const field = draft[key]
        const resolved = effective[key]

        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
          >
            <span className="w-28 shrink-0 text-xs" title={key}>
              {LIMIT_LABELS[key]}
            </span>

            <select
              value={field.mode}
              disabled={disabled}
              onChange={(event) =>
                onChange(key, { ...field, mode: event.target.value as LimitMode })
              }
              className="rounded border border-border bg-secondary px-1.5 py-1 text-xs disabled:opacity-50"
              aria-label={`${LIMIT_LABELS[key]} mode`}
            >
              <option value="inherit">{inheritLabel}</option>
              <option value="unlimited">unlimited</option>
              <option value="number">number</option>
            </select>

            {field.mode === 'number' ? (
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={field.value}
                disabled={disabled}
                onChange={(event) => onChange(key, { ...field, value: event.target.value })}
                className="w-20 rounded border border-border bg-secondary px-1.5 py-1 text-xs disabled:opacity-50"
                aria-label={LIMIT_LABELS[key]}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {field.mode === 'inherit'
                  ? `now ${resolved === null ? 'unlimited' : resolved}`
                  : 'no cap'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
