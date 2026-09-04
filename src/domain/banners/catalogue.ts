import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ArtCatalogue } from '@/domain/banners/spec'

/**
 * What art the banner tool may reach for.
 *
 * Read off the filesystem rather than written down here, and that is the whole
 * point: somebody drops a new animal render into `public/xo/shots/` or a new
 * block thumbnail into `public/thumbs/blocks/`, and it is in the picker the
 * next time the page loads. A hand-kept list would be a second inventory to
 * forget to update, and the failure mode - art that exists but cannot be
 * chosen - is invisible from inside the tool.
 *
 * Server-only. It touches `node:fs`, so it is called from the page and the
 * result is handed to the client as plain strings; the editor never learns that
 * a directory was involved.
 *
 * Everything returned is a public path, ready to go straight into `src` - which
 * is also what the painter loads, so a value that survives the picker is a
 * value that draws.
 */
const PUBLIC = path.join(process.cwd(), 'public')

const IMAGE = /\.(webp|png|jpg|jpeg)$/i

async function list(dir: string, keep: (name: string) => boolean = () => true): Promise<string[]> {
  try {
    const names = await readdir(path.join(PUBLIC, dir))
    return names
      .filter((n) => IMAGE.test(n) && keep(n))
      .sort()
      .map((n) => `/${dir}/${n}`)
  } catch {
    // A directory that is not there is an empty section of the picker, not a
    // broken page - the tool has to open on a checkout that never ran whatever
    // script writes the renders.
    return []
  }
}

/**
 * The `-three.webp` shots only.
 *
 * There are five angles per animal and four of them are the same animal from a
 * worse side. Three-quarter is the one that reads at 300px with a light on it,
 * so it is the only one offered - twenty-four choices rather than a hundred and
 * twenty, which is the difference between a picker and a directory listing.
 */
const THREE_QUARTER = (n: string) => n.endsWith('-three.webp')

export async function artCatalogue(): Promise<ArtCatalogue> {
  const [animals, scenes, blocks, home, cafe, proto, holiday] = await Promise.all([
    list('xo/shots', THREE_QUARTER),
    list('xo/scenes'),
    list('thumbs/blocks'),
    list('thumbs/home'),
    list('thumbs/cafe'),
    list('thumbs/builder/proto'),
    list('xp/thumbs/holiday'),
  ])

  return {
    cast: [
      { label: 'Animals', items: animals },
      { label: 'Scenes', items: scenes },
    ],
    objects: [
      { label: 'Blocks', items: blocks },
      { label: 'Home & garden', items: home },
      { label: 'Café', items: cafe },
      { label: 'Props', items: [...proto, ...holiday] },
    ],
  }
}
