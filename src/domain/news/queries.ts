import 'server-only'
import { type NewsLink, readLinks } from '@/domain/news/links'
import type { Client } from '@/es/store'

/**
 * Reading the announcements.
 *
 * Both functions are one `select` and neither filters by who is asking. The
 * policy in 20260917000000_platform_news.sql does it: a space sees published
 * rows aimed at it or at everybody, and the backoffice sees the lot including
 * drafts. Repeating that here would be a second copy of a sentence that is
 * already written once, in the place that enforces it.
 */

export interface NewsItem {
  id: string
  headline: string
  body: string | null
  image: string | null
  links: NewsLink[]
  /** Null means every space. */
  tenantId: string | null
  published: boolean
  createdAt: string
}

const NEWS_COLUMNS = 'id, headline, body, image, links, tenant_id, published, created_at'

interface Row {
  id: string
  headline: string
  body: string | null
  image: string | null
  links: unknown
  tenant_id: string | null
  published: boolean
  created_at: string
}

function toItem(row: Row): NewsItem {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    image: row.image,
    links: readLinks(row.links),
    tenantId: row.tenant_id,
    published: row.published,
    createdAt: row.created_at,
  }
}

/** How many announcements the News tab shows. Older ones fall off the end. */
export const NEWS_PAGE_SIZE = 20

/**
 * What this space should see, newest first.
 *
 * The tenant filter is spelled out rather than left to the policy alone. The
 * policy answers "may this reader see this row", and for a global announcement
 * the answer is yes for everybody - so without the `or` below, a member of two
 * spaces would see the other one's targeted news on this one's board.
 *
 * A failure here returns nothing rather than throwing. This sits on the space's
 * front page next to the board; an announcement that cannot be read is worth
 * less than the page it would take down with it - the same call `resolveFeatures`
 * makes, for the same reason.
 */
export async function listSpaceNews(
  supabase: Client,
  tenantId: string,
): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('platform_news')
    .select(NEWS_COLUMNS)
    .eq('published', true)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order('created_at', { ascending: false })
    .limit(NEWS_PAGE_SIZE)

  if (error) return []
  return (data ?? []).map((row) => toItem(row as Row))
}

/** A space, as the backoffice's "who is this for" picker knows it. */
export interface NewsAudience {
  tenantId: string
  name: string
  slug: string
}

/**
 * Every space an announcement could be aimed at.
 *
 * Takes the service-role client, like the rest of the backoffice's listings:
 * "every space in the product" is not a question any policy grants, because
 * nobody is a member of all of them.
 *
 * Archived spaces are left out. Aiming an announcement at a space nobody can
 * open is a row that will never be read, and the picker offering it is how that
 * mistake gets made.
 */
export async function listNewsAudiences(admin: Client): Promise<NewsAudience[]> {
  const { data, error } = await admin
    .from('tenants_read_model')
    .select('id, name, slug')
    .eq('archived', false)
    .order('name')

  if (error) throw new Error(`Failed to list spaces: ${error.message}`)
  return (data ?? []).map((row) => ({ tenantId: row.id, name: row.name, slug: row.slug }))
}

/** Everything, drafts included. Only an admin gets past the policy. */
export async function listAllNews(supabase: Client): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('platform_news')
    .select(NEWS_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to list news: ${error.message}`)
  return (data ?? []).map((row) => toItem(row as Row))
}
