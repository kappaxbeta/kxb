import { NewsEditor } from '@/app/ovaloffice/news/news-editor'
import { listAllNews, listNewsAudiences } from '@/domain/news/queries'
import { listPictures } from '@/domain/pictures/catalogue'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * The one channel that speaks *into* spaces.
 *
 * Everything else in the product is a space talking to itself - its board, its
 * chat, its own banner. This is the platform's side of that, and it is the
 * reason the table's policies have no membership clause at all: no role in any
 * space should ever unlock writing here.
 *
 * The picture list is read off the disk on every request. It is a directory
 * listing of two folders, this page is `force-dynamic` anyway, and it means a
 * render saved out of the studio a minute ago is in the picker without a
 * rebuild.
 */
export default async function NewsPage() {
  const { supabase, admin } = await requireBackofficeSection('news')

  const [news, audiences, pictures] = await Promise.all([
    listAllNews(supabase),
    listNewsAudiences(admin),
    listPictures(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">News</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A card over the board in every space — or in one — until the reader
          waves it away. Dismissed ones stay under the board&apos;s News tab, so
          nothing is lost by closing it.
        </p>
      </div>

      <NewsEditor news={news} audiences={audiences} pictures={pictures} />
    </div>
  )
}
