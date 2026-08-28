import { PictureGrid } from '@/app/ovaloffice/pictures/picture-grid'
import { listPictures, PICTURE_ROOTS } from '@/domain/pictures/catalogue'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * What is in the picture folders, as pictures.
 *
 * These files were only ever findable by opening the repo, which was fine while
 * the only person choosing one was the person who had put it there. It stopped
 * being fine when a banner started pointing at them by path: "which picture is
 * `venue-4-branded`" is not a question a file listing answers, and a wrong
 * guess ships to every space.
 *
 * Read off the disk rather than out of a table, for the reason the catalogue
 * gives: the folder is the specification. A render saved out of the picture
 * studio appears here on the next load, with no row and no rebuild.
 */
export default async function PicturesPage() {
  await requireBackofficeSection('pictures')

  const pictures = await listPictures()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pictures</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything under {PICTURE_ROOTS.map((root) => `public/${root}`).join(', ')} —{' '}
          {pictures.length} in all. These are what a news banner can point at.
          New ones come out of the picture studio&apos;s <em>Keep as deco</em>{' '}
          button, which writes into the repo and therefore only works in
          development.
        </p>
      </div>

      <PictureGrid pictures={pictures} />
    </div>
  )
}
