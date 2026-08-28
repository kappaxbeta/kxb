'use client'

import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { modelUrl } from '@/domain/lounge/palette'

/**
 * Start fetching a world's models before anything asks for them.
 *
 * The palette is 117 files and every model is two requests - the glTF and its
 * buffer - so a world is a burst of round trips that used to begin at the
 * moment `<BlockInstances>` mounted, which is after the canvas element exists,
 * after the WebGL context is up and after the whole scene tree has rendered.
 * None of that is needed to know which files are wanted: the blocks arrived
 * with the page.
 *
 * `useGLTF.preload` goes through drei's own cache, which is the same cache
 * `useGLTF` reads - so this is the identical request moved earlier, never a
 * second one. That is the reason for doing it this way rather than with a
 * `<link rel="preload">` in the document head, which would start the download
 * earlier still but has to match the loader's fetch exactly on credentials mode
 * or the browser cheerfully downloads everything twice.
 *
 * Only the models the world actually contains. Preloading the whole palette
 * would be 10MB to draw a floor made of grass.
 */
export function usePreloadedBlocks(models: Iterable<string>) {
  // In a memo rather than an effect, because an effect runs *after* the commit
  // that mounts the canvas - which is precisely the wait this exists to skip.
  // Preloading is idempotent and cached, so a double invoke costs nothing.
  useMemo(() => {
    for (const model of new Set(models)) useGLTF.preload(modelUrl(model))
  }, [models])
}
