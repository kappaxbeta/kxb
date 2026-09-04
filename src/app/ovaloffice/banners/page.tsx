import { BannerEditor } from '@/app/ovaloffice/banners/editor'
import { artCatalogue } from '@/domain/banners/catalogue'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Store banners' }

/**
 * The App Store screenshots, composed here rather than in a design file.
 *
 * There are twelve panels in three languages on two canvases, which is
 * seventy-two pictures, and every one of them has to carry the same mark in the
 * same place with the same face at the same size. That is the argument for a
 * page: the moment those exist as seventy-two layered files, the eleventh one
 * somebody edits stops matching the other seventy-one and nobody finds out
 * until the listing is live.
 *
 * The guard runs here and not only in the layout, exactly as every other
 * backoffice page does: a layout does not re-run for a Server Action and can be
 * skipped by a direct request.
 *
 * The art catalogue is read off the filesystem on the server and handed down as
 * plain paths - see `@/domain/banners/catalogue` for why it is a directory
 * listing rather than a written-down list.
 */
export default async function BannersPage() {
  await requireBackofficeSection('banners')
  const art = await artCatalogue()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-lg font-medium">Store banners</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          The App Store panels, drawn at delivered size. The dark rectangles are left empty on
          purpose — paste the gameplay capture in afterwards, at the coordinates listed under the
          controls. Editing here is for trying something; the words that ship live in{' '}
          <code className="text-xs">domain/banners/panels.ts</code>.
        </p>
      </header>
      <BannerEditor art={art} />
    </div>
  )
}
