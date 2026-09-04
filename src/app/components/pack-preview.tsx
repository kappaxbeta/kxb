import type { PackPreview } from '@/domain/thingiverse/pack-preview'

/**
 * A pack, with its face on.
 *
 * Four of its own models, its name, how many things are in it and who drew
 * them. See `@/domain/thingiverse/pack-preview` for why four and why those
 * four; this file is only the drawing.
 *
 * ---------------------------------------------------------------------------
 * No hooks, on purpose
 * ---------------------------------------------------------------------------
 * Two surfaces want this and they are different kinds of component: the
 * thingiverse's catalogue tab is server-rendered, and the builder's model
 * picker is a client modal with search state in it. A plain function of its
 * props works in both, and is the reason there is one card rather than two that
 * drift.
 *
 * `<img>` rather than `next/image` for the reason every tile in this product
 * gives: these are already WebP, already the exact size they are drawn at, and
 * the optimizer has nothing to do here but add a round trip. `loading="lazy"`
 * matters more than usual - fifty-one cards is two hundred pictures, of which
 * about twelve are ever on screen.
 */
export function PackPreviewCard({
  preview,
  active = false,
  /** Where pressing it goes. A link on a server page, a button in the picker. */
  href,
  onSelect,
  /** "218 models", already in the reader's language. */
  sizeLabel,
}: {
  preview: PackPreview
  active?: boolean
  href?: string
  onSelect?: () => void
  sizeLabel: string
}) {
  const body = (
    <>
      {/*
        The four pictures, as one strip.

        A fixed four-column grid rather than a flex row: a pack with two models
        in it should draw two pictures at the same size as everybody else's
        four, with the gap where the other two would be. A flex row would blow
        them up to fill the card and make the smallest packs the loudest thing
        on the page.
      */}
      <span className="grid grid-cols-4 gap-1">
        {preview.thumbnails.map((thumbnail, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            // The model id, which is unique within a pack and stable across
            // renders - the sampling is deterministic (see the domain file).
            key={preview.models[index]}
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-md bg-surface-raised/60 object-contain"
          />
        ))}
      </span>

      <span className="mt-2 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-ink">{preview.pack.label}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-muted">
          {preview.pack.size}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-ink-muted/80">
        {preview.pack.author}
      </span>
    </>
  )

  const className = `block rounded-xl border p-2 text-left transition ${
    active
      ? 'border-accent bg-accent/15'
      : 'border-line/60 bg-surface hover:border-accent/50 hover:bg-surface-raised'
  }`

  // The whole card is the control, and the pack's size is said out loud to a
  // screen reader - the number beside the name is a bare digit on purpose (see
  // the chips it replaces), and a bare digit read aloud is not a sentence.
  const label = `${preview.pack.label} — ${sizeLabel}`

  if (href) {
    return (
      <a href={href} aria-label={label} aria-current={active ? 'true' : undefined} className={className}>
        {body}
      </a>
    )
  }

  return (
    <button type="button" onClick={onSelect} aria-label={label} aria-pressed={active} className={className}>
      {body}
    </button>
  )
}

/**
 * A headed grid of them.
 *
 * The heading is the caller's word rather than a constant here, because the two
 * surfaces that draw this row call the same split by different names - the
 * thingiverse says "room packs" and "level packs", and the builder is only ever
 * furnishing a world.
 */
export function PackPreviewGrid({
  label,
  previews,
  activeId,
  hrefOf,
  onSelect,
  sizeLabelOf,
}: {
  label?: string
  previews: PackPreview[]
  activeId?: string
  hrefOf?: (packId: string) => string
  onSelect?: (packId: string) => void
  sizeLabelOf: (size: number) => string
}) {
  if (previews.length === 0) return null

  return (
    <section className="space-y-1.5">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70">
          {label}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {previews.map((preview) => (
          <PackPreviewCard
            key={preview.pack.id}
            preview={preview}
            active={activeId === preview.pack.id}
            href={hrefOf?.(preview.pack.id)}
            onSelect={onSelect ? () => onSelect(preview.pack.id) : undefined}
            sizeLabel={sizeLabelOf(preview.pack.size)}
          />
        ))}
      </div>
    </section>
  )
}
