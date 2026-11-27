'use client'

import { useState } from 'react'
import { ModelPicker } from '@/app/ovaloffice/builder/model-picker'
import {
  modelName,
  modelPicture,
  qualifiedModel,
  storedModel,
} from '@/domain/studio/model-id'

/**
 * Choosing what a prop in a still is, out of the whole world catalogue.
 *
 * ---------------------------------------------------------------------------
 * Why this replaced a select
 * ---------------------------------------------------------------------------
 * It was a `<select>` holding the 58 palette blocks in three groups with two
 * packs bolted on the end, and under it a text field for typing an id - because
 * the honest thing the select could not do was offer the other 1,300 models.
 * That pair is the shape of a decision nobody was happy with: the file said so
 * itself ("fourteen hundred `<option>` elements is a control nobody can find
 * anything in"), and it was right about the select and wrong about the
 * conclusion. The answer to a list too long to scan is not a shorter list, it
 * is a picker with a search box - and the builder has had one of those since
 * the thingiverse shipped.
 *
 * So this is that picker, and this file is the glue: a button saying what the
 * prop currently is, and the modal over it. Nothing about the studio's document
 * changed - `parseScene` already accepted every id `isBuildable` says yes to,
 * which is exactly what the picker now offers. What changed is that a park
 * fountain is a thing you can find rather than a thing you have to know the
 * name of.
 *
 * The two names one bb10 block has are `@/domain/studio/model-id`'s business,
 * and the reason that is not inlined here is that it carries an invariant worth
 * a test rather than a comment.
 */
export function PickModel({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-2 py-1.5 text-left transition hover:border-accent/50"
      >
        {/* Decorative: the name beside it is what the button says. A model
            whose picture has not been shot yet is hidden rather than left as a
            broken-image glyph, which is what `onError` is for.

            A plain <img> for the reason every tile in this product gives: the
            thumbnails are already WebP at the size they are drawn, so the
            optimizer has nothing to do but add a round trip. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={modelPicture(value)}
          alt=""
          className="size-8 shrink-0 rounded bg-background/60 object-contain"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{modelName(value)}</span>
        <span aria-hidden className="shrink-0 text-muted-foreground">
          ⌄
        </span>
      </button>

      {picking && (
        <ModelPicker
          selected={qualifiedModel(value)}
          onSelect={(model) => onChange(storedModel(model))}
          onClose={() => setPicking(false)}
          /*
           * The world catalogue and not the level packs: a still's document
           * refuses an `xp:` id (see `parseScene`), so offering one would be a
           * tile you can press that the scene then declines to hold.
           */
          scope="world"
        />
      )}
    </div>
  )
}
