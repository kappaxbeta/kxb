'use client'

import { useCallback, useMemo, useState } from 'react'
import { placeLoungeImage } from '@/domain/lounge/image-actions'
import type { LoungeImageView } from '@/domain/lounge/image-queries'
import { attempt } from '@/app/components/connection'
import type { WorldDict } from '@/app/i18n/world'
import type { Target } from '@/app/world/lounge/_scene/scene-types'

/**
 * The pictures hanging in a world, and the four things that happen to them.
 *
 * Their own hook because they are their own aggregate - one stream, with a
 * move/rotate/resize/remove lifecycle of its own - and because none of the four
 * pieces of state below were read by anything else in `lounge-scene.tsx`. They
 * sat among the blocks, the ball, the party lights and the shutter, sharing a
 * scope with all of them and a subject with none.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, but not fire-and-forget
 * ---------------------------------------------------------------------------
 * Block edits are cheap, frequent and unnoticed if one is refused. Image
 * operations are rare and individually visible - somebody moved *that picture*,
 * and it moved - so a rejected one has to put the picture back rather than
 * leave the screen disagreeing with the log. That is `run`, and the revert is
 * the whole reason it exists rather than the caller patching directly.
 *
 * ---------------------------------------------------------------------------
 * Two steps to hang one
 * ---------------------------------------------------------------------------
 * The file goes to the upload API and comes back an opaque slug; then a command
 * hangs *that slug* in the world. The bytes and the placement are different
 * facts with different lifetimes - the same image can be placed twice, and
 * taking it off a wall does not delete the upload.
 */
export function useLoungeImages({
  slug,
  initial,
  readOnly,
  demo,
  target,
  dict,
  refusal,
}: {
  slug: string
  initial: LoungeImageView[]
  readOnly: boolean
  /** The demo has no workspace to file bytes under, so it refuses silently. */
  demo: boolean
  /** Where the crosshair last pointed, which is where a dropped file lands. */
  target: Target
  dict: WorldDict
  refusal: (text: string) => string
}) {
  const [images, setImages] = useState<LoungeImageView[]>(initial)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? null,
    [images, selectedImageId],
  )

  const patchImage = useCallback(
    (id: string, changes: Partial<LoungeImageView>) => {
      setImages((current) =>
        current.map((image) => (image.id === id ? { ...image, ...changes } : image)),
      )
    },
    [],
  )

  /**
   * Run an image command, reverting the optimistic change if it is refused.
   *
   * Unlike block edits - which are cheap, frequent and fire-and-forget - image
   * operations are rare and individually visible, so a rejected one has to put
   * the picture back rather than leave the screen disagreeing with the log.
   */
  const runImage = useCallback(
    async (
      id: string,
      changes: Partial<LoungeImageView>,
      action: () => Promise<{ ok: boolean; error?: string }>,
    ) => {
      const before = images.find((image) => image.id === id)
      if (!before) return

      setError(null)
      setBusy(true)
      patchImage(id, changes)

      const result = await attempt(action)
      if (!result.ok) {
        patchImage(id, before)
        setError(refusal(result.error ?? dict.image.refused))
      }
      setBusy(false)
    },
    // `dict` is one of two module-level objects, so it changes only when the
    // reader's language does - which is a reload, not a render.
    [images, patchImage, dict, refusal],
  )

  /**
   * Drop a picture into the world.
   *
   * Two steps, deliberately separate: the file goes to the upload API and comes
   * back as an opaque slug, then a command hangs *that slug* in the world. The
   * bytes and the placement are different facts with different lifetimes - the
   * same image can be placed twice, and removing it from the world does not
   * delete the upload.
   */

  const dropFile = useCallback(
    async (file: File) => {
      if (readOnly) return
      // The upload endpoint wants a workspace to file the bytes under, and the
      // demo is not in one. Refused silently rather than with a banner: nobody
      // was told they could hang a picture here, so a dropped file is a
      // misunderstanding to ignore, not an error to report.
      if (demo) return

      setError(null)
      setBusy(true)

      try {
        const form = new FormData()
        form.append('file', file)
        form.append('slug', slug)

        const response = await fetch('/api/upload', { method: 'POST', body: form })
        const data = await response.json()

        if (!response.ok || !data.slug) {
          setError(refusal(data.error ?? dict.image.uploadFailed))
          return
        }

        // Where the crosshair last pointed, or the origin. A drag cannot happen
        // under pointer lock, so there is often no live target anyway.
        //
        // Read from state rather than the ref: the ref exists so the per-frame
        // click handler sees a fresh value without re-subscribing, and closing
        // over it here would make it "passed to a hook", which then forbids the
        // frame loop from writing to it at all.
        const cell = target.place ?? { x: 0, y: 0, z: 0 }
        const placement = { ...cell, width: 4, height: 3, facing: 0 }

        const placed = await placeLoungeImage(slug, {
          uploadSlug: data.slug,
          ...placement,
        })

        if (!placed.ok) {
          setError(refusal(placed.error))
          return
        }

        setImages((current) => [
          ...current,
          { id: placed.id, uploadSlug: data.slug, ...placement },
        ])
        setSelectedImageId(placed.id)
      } catch {
        setError(dict.image.networkError)
      } finally {
        setBusy(false)
      }
    },
    [slug, readOnly, demo, target, dict, refusal],
  )

  return {
    images,
    setImages,
    selected,
    selectedImageId,
    setSelectedImageId,
    busy,
    error,
    setError,
    patchImage,
    runImage,
    dropFile,
  }
}
