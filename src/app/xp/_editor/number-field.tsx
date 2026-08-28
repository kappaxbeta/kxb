'use client'

import { useState } from 'react'

/**
 * A number input you can empty.
 *
 * ---------------------------------------------------------------------------
 * The bug, because it is not obvious from the code that causes it
 * ---------------------------------------------------------------------------
 * Reported as: *"number fields are annoying, you can't delete a number. If it
 * is 43 and you want to remove all and write it, fine - but when it's 1 and you
 * want to write 4 you can't delete, because a number is required."*
 *
 * Every number field in this editor is controlled and reads its value out of the
 * document, and every one of them guards its `onChange` the same way:
 *
 *     const parsed = Number.parseFloat(event.target.value)
 *     if (!Number.isNaN(parsed)) onChange(parsed)
 *
 * That guard is right, and it is what causes this. Deleting the last digit makes
 * the field's value the empty string, which does not parse, so nothing is
 * written; the document still says 1; React re-renders with `value={1}`; the
 * digit is back before the key is up.
 *
 * At two digits it looks like it works, because deleting the first of `43`
 * leaves `3` - which parses, is written, and the field genuinely holds one
 * character. So the failure is invisible at every length except the last one,
 * which is why it survived this long and why the report is phrased as being
 * about small numbers.
 *
 * Removing the guard is not the fix. `NaN` in a document is a document that
 * stops parsing while somebody is still typing, and `Number('')` is **0** -
 * which would silently rewrite the value the instant the last digit went, which
 * is worse than refusing to delete it.
 *
 * ---------------------------------------------------------------------------
 * A draft, held only while it is not a number yet
 * ---------------------------------------------------------------------------
 * So the input keeps the exact characters somebody has typed, and the document
 * keeps getting numbers. The draft is shown when it does not parse (`""`, `"-"`,
 * `"1e"`) or when it parses to what the document already says (`"1."` on the way
 * to `"1.5"`, `"007"`); otherwise the document wins.
 *
 * That last clause is what makes an undo work while a field is focused: an
 * outside change makes the draft disagree with the value, and disagreement is
 * resolved in the document's favour. No effect, no `setState` during render, and
 * no way for the two to drift.
 *
 * On blur the draft is dropped, so a field left holding `""` goes back to
 * showing the number that was never taken away from it rather than staying
 * blank.
 *
 * ---------------------------------------------------------------------------
 * A component rather than a hook
 * ---------------------------------------------------------------------------
 * Most of these fields are inside a `.map` - one per axis, one per property, one
 * per part - and a hook cannot be called from there. One component per input is
 * one `useState` per input, which is exactly the granularity the draft needs
 * anyway: two fields being typed into are two drafts.
 */
export function NumberInput({
  value,
  commit,
  format,
  className,
  ...rest
}: {
  /** What the document says. */
  value: number
  /**
   * Called with a number whenever the typed text is one.
   *
   * Free to clamp, round or refuse - a commit that lands somewhere other than
   * what was typed makes the draft disagree with the value, so the field snaps
   * to what the document actually took. That is the honest behaviour for a
   * bounded field and it is why there are no `min`/`max` props here: the
   * boundary belongs to whoever owns the value.
   */
  commit: (value: number) => void
  /**
   * How the document's value is rendered when no draft is showing.
   *
   * The place to round, since `0.1` added to `0.30000000000000004` is what a
   * float does and a field reading `2.9000000000000004` is a field somebody
   * stops trusting.
   */
  format?: (value: number) => string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'>) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      {...rest}
      type="number"
      className={className}
      value={showsDraft(draft, value) ? draft! : (format ?? String)(value)}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        const next = parseNumber(raw)
        if (next !== null) commit(next)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/**
 * Whether what is on screen should be the typed text or the document's number.
 *
 * The rule the whole component turns on, pulled out because it is the half that
 * can be checked without a DOM - and because getting it wrong in either
 * direction is a distinct bug. Always keeping the draft means an undo does not
 * show; never keeping it is the bug at the top of this file.
 *
 * Text that does not parse is kept, because it is somebody mid-keystroke and
 * there is no number to show instead. Text that parses to what the document
 * already says is kept too, and that is the subtle one: `"1."` and `"007"` are
 * both worth ten of `String(1)`, since replacing them would delete the
 * character just typed.
 */
export function showsDraft(draft: string | null, value: number): boolean {
  if (draft === null) return false
  const parsed = parseNumber(draft)
  return parsed === null || parsed === value
}

/**
 * The typed text as a number, or null for text that is not one yet.
 *
 * `parseFloat` rather than `Number`, and the difference is the whole point:
 * both read `'1.'` as 1, but `Number('')` is 0 while `parseFloat('')` is `NaN`.
 * See above - an empty field reading as zero is this same bug wearing a hat.
 */
export function parseNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}
