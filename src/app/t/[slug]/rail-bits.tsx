import type React from 'react'

/**
 * The two pieces every rail panel is built out of.
 *
 * Here rather than in sidebar.tsx because the tabbed block (./rail-tabs.tsx) is
 * imported *by* the sidebar and needs both of them - and a component reaching
 * back into the file that renders it is a cycle waiting to be a bundler bug.
 */

/** A band heading. Small, wide-tracked, and never a link. */
export function Band({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
      {children}
    </h2>
  )
}

/**
 * Somebody's face, at rail size.
 *
 * An initial in a ring rather than the avatar they walk around in: those are
 * glTF models, and rendering four of them to draw a list would cost more than
 * the scene the list is describing. The dot is welded to the corner, so "here"
 * is a property of the person rather than a column of its own.
 */
export function Face({ name, here = true }: { name: string; here?: boolean }) {
  return (
    <span aria-hidden className="relative shrink-0">
      <span className="grid size-7 place-items-center rounded-full border border-line/70 bg-surface-raised text-[11px] font-semibold uppercase text-ink">
        {name.slice(0, 1)}
      </span>
      {here && (
        <span className="absolute -bottom-px -right-px size-2 rounded-full border-2 border-[oklch(0.13_0.05_275)] bg-emerald-600 shadow-[0_0_0.4rem_oklch(0.78_0.18_165/0.9)]" />
      )}
    </span>
  )
}
