/**
 * The surface all three boxes are drawn on.
 *
 * Three sections that each invented their own spacing and their own heading
 * size is how a page starts looking assembled rather than designed, so the
 * surface has a file and the boxes have none of it. Translucent over the
 * world's own background, in the house's material - `bg-surface-raised/70`
 * with a blur behind it, the same one the demo lounge and the landing CTAs use
 * - because an opaque slab here would read as a dialog that had landed on the
 * page rather than a part of it.
 *
 * The heading is small, quiet and sentence case. It is a label on a thing you
 * are already looking at, not an announcement.
 */
export function Panel({
  title,
  aside,
  children,
}: {
  title: string
  /** The one fact worth putting on the same line as the title, if there is one. */
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface-raised/70 p-6 shadow-xl backdrop-blur-md sm:p-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[0.95rem] leading-none font-medium text-ink">{title}</h2>
        {aside ? <span className="text-xs leading-none text-ink-muted">{aside}</span> : null}
      </header>
      {children}
    </section>
  )
}

/**
 * The one button shape on this page.
 *
 * It highlights on press rather than on release - the whole difference between
 * a control that feels connected to your finger and one that feels like it is
 * thinking about it - and the scale is small enough to read as give, not as an
 * animation. Held back for anyone who has asked for less motion.
 */
export function Press({
  children,
  onPress,
  disabled,
  quiet,
}: {
  children: React.ReactNode
  onPress: () => void
  disabled?: boolean
  /** Secondary weight: same shape, less voice. */
  quiet?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={`rounded-full border px-4 py-1.5 text-sm transition duration-100 ease-out active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 ${
        quiet
          ? 'border-line/60 text-ink-muted hover:border-accent hover:text-ink'
          : 'border-line bg-surface-raised/60 text-ink hover:border-accent'
      }`}
    >
      {children}
    </button>
  )
}
