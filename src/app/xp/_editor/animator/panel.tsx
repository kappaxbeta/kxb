import type { LucideIcon } from 'lucide-react'

/**
 * One titled block in the animator's side rail.
 *
 * Its own file because eight panels use it and the two that were pulled out of
 * `animator.tsx` need it too — a component the extracted piece has to import
 * back out of the file it left is a circular import waiting to be discovered by
 * a bundler rather than by a reader.
 */
export function Panel({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string
  hint?: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-secondary/20 p-3">
      <h3 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/40 text-accent">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {title}
      </h3>
      {hint && <p className="-mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}
