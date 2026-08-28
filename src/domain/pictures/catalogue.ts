import 'server-only'
import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * The pictures that ship with the product.
 *
 * Read off the disk rather than listed in a constant, because the whole point
 * of being able to save a render out of the studio is that the set grows - and
 * a hand-kept array would mean every new picture came with an edit to a file
 * nobody would remember to make. The audio catalogue makes the opposite call
 * and is right to: there the array is the *specification*, and `public/audio`
 * is pruned to match it. Here the folder is the specification.
 *
 * Three roots, and nothing outside them: the thumbnails, and the two deco
 * folders. Every path this returns is one the static handler serves and one
 * `imageSchema` will accept, which is what keeps the picker and the column
 * constraint from ever disagreeing.
 */

export const PICTURE_ROOTS = ['thumbs', 'xo/scenes', 'xo/shots'] as const

/** Where new renders from the studio land. Must be one of the roots above. */
export const DECO_ROOT = 'xo/scenes'

const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'])

export interface Picture {
  /** The served path, e.g. `/xo/scenes/crew.webp`. What a row stores. */
  path: string
  /** The folder it came out of, for grouping in the picker. */
  folder: string
  /** The file name without its extension, for a label. */
  name: string
}

/** Absolute path of a folder under `public`, resolved once. */
function publicDir(...parts: string[]): string {
  return path.join(process.cwd(), 'public', ...parts)
}

export { publicDir }

/**
 * Everything under one root, recursively.
 *
 * A missing folder is an empty list, not a throw: the picker is a convenience
 * on a page that has other work to do, and a checkout without `public/xo` is a
 * reason to show fewer pictures rather than a 500.
 */
async function walk(root: string): Promise<Picture[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(publicDir(root), { withFileTypes: true, recursive: true })
  } catch {
    return []
  }

  return entries.flatMap((entry) => {
    if (!entry.isFile()) return []
    if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return []

    /**
     * `parentPath` is where the file actually is; `root` is only where the walk
     * started. Without it every picture in a subfolder of `thumbs` would come
     * back claiming to be directly inside it, and the path would 404.
     */
    const parent = entry.parentPath ?? publicDir(root)
    const relative = path.relative(publicDir(), path.join(parent, entry.name))

    return [
      {
        path: `/${relative.split(path.sep).join('/')}`,
        folder: path.relative(publicDir(), parent).split(path.sep).join('/'),
        name: path.basename(entry.name, path.extname(entry.name)),
      },
    ]
  })
}

/**
 * Every picture a banner may point at, grouped folder by folder.
 *
 * Sorted by path so the picker does not reshuffle between requests - `readdir`
 * makes no ordering promise, and a grid that rearranges itself under somebody's
 * cursor between two page loads reads as a bug.
 */
export async function listPictures(): Promise<Picture[]> {
  const found = await Promise.all(PICTURE_ROOTS.map((root) => walk(root)))
  return found.flat().sort((a, b) => a.path.localeCompare(b.path))
}
