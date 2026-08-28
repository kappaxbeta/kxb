import { cn } from '@/lib/utils'

/**
 * The red strip a panel shows when the last thing it tried came back refused.
 *
 * Twenty-five copies of this existed before it did - the same four utilities in
 * the same order, `role="alert"` on most of them and missing from a couple, and
 * a `break-all` that two panels had worked out for themselves after a Supabase
 * error arrived as one 200-character word with no spaces to wrap at. Nothing was
 * broken by that, which is exactly why it spread: each copy was three lines and
 * correct on the day it was written.
 *
 * What it cost was the ability to change the shape of a refusal. Softening the
 * red, or giving the strip an icon, or - the one that actually came up - making
 * every one of them announce itself to a screen reader, meant twenty-five edits
 * and a grep that could not tell a banner from the several red-bordered
 * *buttons* that share `hover:bg-red-500/15`. The two that had no `role="alert"`
 * are the evidence: they were not decided against, they were missed.
 *
 * So `role="alert"` lives here and is not a prop. A message that appears after
 * the button you just pressed, and that nobody sees unless they are looking at
 * that corner of the screen, is the case the role exists for.
 *
 * `children` rather than a `message` string, because a handful of callers put a
 * retry link or a `<code>` next to the text, and a component that only takes a
 * string sends them straight back to hand-rolling the div.
 *
 * Renders nothing for null, undefined or empty - so the usual call site is
 * `<ErrorNote>{error}</ErrorNote>` with no `error &&` in front of it. That guard
 * was the other half of the duplication.
 */
export function ErrorNote({
  children,
  className,
}: {
  children?: React.ReactNode
  /** Spacing the surrounding layout needs, e.g. `mb-4`. Merged, so it wins. */
  className?: string
}) {
  if (children === null || children === undefined || children === false || children === '') {
    return null
  }

  return (
    <p
      role="alert"
      className={cn('rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300', className)}
    >
      {children}
    </p>
  )
}
