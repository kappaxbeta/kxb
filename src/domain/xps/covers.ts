import { readdir } from 'node:fs/promises'
import path from 'node:path'
import 'server-only'

/**
 * Where a level's front picture comes from, for both kinds of level.
 *
 * ---------------------------------------------------------------------------
 * Two sources, one question
 * ---------------------------------------------------------------------------
 * A level we ship is a file on disk and its picture is another file on disk,
 * drawn by `bun run xp:shot` into `public/xp/shots/<id>.png`. A level a space
 * made is rows in a database and its picture is a file *inside the project*,
 * named by `meta.cover` or the first thing under `preview/`, and served
 * through `/api/xp/<id>/<path>` so the access rules that guard the project
 * guard its cover too.
 *
 * Nothing outside here should know that. The store's cards, the shelf's
 * cartridges and the sheet all want one string or null, and this is the module
 * that turns two very different storage stories into that.
 *
 * ---------------------------------------------------------------------------
 * A directory read, not a `stat` per level
 * ---------------------------------------------------------------------------
 * And not an `<img src>` at a path that may 404 either. A broken image in a
 * grid is worse than no image: the placeholder is a design decision and a
 * broken image is an accident, and a visitor cannot tell which they are looking
 * at. `catalogue.ts` made this argument first; the shelf needed the same answer
 * and copying it would have been a second list of shots to keep true.
 */

const SHOTS_DIR = path.join(process.cwd(), 'public', 'xp', 'shots')

/**
 * Every shot on disk, keyed by the XP it belongs to.
 *
 * `<id>.png` only. `first-room-eye.png` exists and is a second angle on the
 * same level; picking it up as a cover for `first-room-eye` would invent an XP
 * that does not exist.
 */
export async function builtinCovers(): Promise<Map<string, string>> {
  let files: string[]
  try {
    files = await readdir(SHOTS_DIR)
  } catch {
    return new Map()
  }

  const covers = new Map<string, string>()
  for (const file of files) {
    if (!file.endsWith('.png')) continue
    covers.set(file.slice(0, -'.png'.length), `/xp/shots/${file}`)
  }
  return covers
}

/**
 * The URL for a project's own cover, or null when it has none.
 *
 * The route is the same one the project card always used. Guarded on the path
 * being non-empty because `cover_path` is a nullable text column and an empty
 * string in it would produce `/api/xp/<id>/`, which is a request for the files
 * listing rather than a picture.
 */
export function projectCover(xpId: string, coverPath: string | null): string | null {
  const trimmed = coverPath?.trim()
  if (!trimmed) return null
  return `/api/xp/${xpId}/${trimmed}`
}
