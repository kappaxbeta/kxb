import { cn } from '@/lib/utils'

/**
 * The three pieces of trim every panel in this editor is made of.
 *
 * ---------------------------------------------------------------------------
 * Why these are components and the field style is a string
 * ---------------------------------------------------------------------------
 * A count, taken across `src/app/xp/_editor/` before this file existed:
 *
 *   - **58 section labels** in 13 files, in six spacing variants of one look.
 *   - **68 text inputs** in 10 files, in *thirty-five* variants of one look.
 *
 * That difference is the whole design of this module. The labels are one thing
 * written out repeatedly - same element, same four utilities, differing only in
 * the margin the surrounding layout wanted. That is a component, and the margin
 * is a prop.
 *
 * The inputs are not. Thirty-five variants is not thirty-five copies of a
 * mistake: a field in a three-across grid is `min-w-0 flex-1`, one under a label
 * is `w-full`, the one holding a frame number is `w-14 text-right tabular-nums`,
 * and a `<textarea>` needs `resize-none`. Those are real differences that a
 * component would have to take as props - at which point the prop list is the
 * class list with worse names, and the next unforeseen variant is a change to
 * this file rather than a class at the call site.
 *
 * So `FIELD` is the part they genuinely share - the border, the ground, the ink
 * and the focus ring, which is what "looks like a field in this editor" means -
 * and the size and flow stay at the call site where they are decided:
 *
 *     <input className={cn(FIELD, 'w-full px-1.5 py-1 font-mono text-[11px]')} />
 *
 * The test for whether something belongs here is not "is it repeated". It is
 * *would changing it in one place be right for every caller*. Recolouring every
 * field's focus ring: yes. Making every field `w-full`: obviously not.
 */

/** Border, ground, ink and focus ring - what a field in this editor looks like. */
export const FIELD =
  'rounded border border-neutral-800 bg-neutral-900/60 text-neutral-200 focus:border-neutral-600 focus:outline-none'

/**
 * The small tracked capitals a panel divides itself with.
 *
 * `<p>` rather than a heading, and deliberately: these sit inside a dock panel
 * that is already titled by its tab, and a document whose outline is forty
 * `<h3>`s reading PHYSICS, TAGS, PARTS is worse for a screen reader than one
 * with none. Where a real heading is wanted, this is the wrong component.
 */
export function PanelLabel({
  children,
  className,
}: {
  children: React.ReactNode
  /** Spacing and flow the surrounding panel wants - `mb-1.5`, `px-1`, `mt-4`. */
  className?: string
}) {
  return (
    <p className={cn('font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500', className)}>
      {children}
    </p>
  )
}

/**
 * The dim line under a control that says what it does to the document.
 *
 * There are a lot of these because this editor is a pile of nouns somebody has
 * to guess the meaning of - `collider`, `grip`, `phase` - and the alternative to
 * a sentence under the field is a manual nobody opens while they are mid-edit.
 *
 * `leading-relaxed` is the default because most are a sentence or two of prose.
 * The one-liners that sit tight against their control pass `leading-tight`.
 */
export function Hint({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn('font-mono text-[10px] leading-relaxed text-neutral-600', className)}>
      {children}
    </p>
  )
}
