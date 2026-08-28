import 'server-only'
import type { Reactions } from '@/domain/board/aggregate'
import { isEmote } from '@/domain/world/emotes'
import type { Client } from '@/es/store'

export interface BoardReaction {
  emote: number
  /** Handles, already resolved, in the order people reacted. */
  by: string[]
  /** Did the person looking at this put this face on it? */
  mine: boolean
}

/**
 * A scene on a notice, as a card knows it.
 *
 * Everything here comes down with the board in one query and none of it is the
 * shot. A card is a name and a length until somebody presses play, at which
 * point the document arrives on its own - see `loadPinnedScene`.
 */
export interface BoardScene {
  id: string
  name: string
  seconds: number
}

/**
 * Whose notice this is, as the board draws them.
 *
 * A name and an animal together rather than a name and a lookup, because the
 * board hangs every notice off its author's avatar and a component that had to
 * resolve one would need the whole roster shipped to the client to do it.
 */
export interface BoardAuthor {
  name: string
  /** An avatar id from the roster; `avatarShotUrl` turns it into a picture. */
  avatar: string
}

/** A name and an animal for everybody who might appear on this board. */
export type BoardPeople = ReadonlyMap<string, BoardAuthor>

export interface BoardPostView {
  id: string
  body: string
  pinned: boolean
  reactions: BoardReaction[]
  author: BoardAuthor | null
  createdAt: string
  updatedAt: string
  edited: boolean
  /**
   * The scene pinned with it, if there is one and it is still there.
   *
   * Null covers three different facts that a card treats identically: nothing
   * was ever attached, the scene has since been deleted, and the reader may not
   * see it. The notice is its words in all three cases, which is what it was
   * before anybody attached anything.
   */
  scene: BoardScene | null
  /**
   * The picture pinned with it, as a path the browser can ask for.
   *
   * A URL rather than the slug, so nothing downstream has to know how uploads
   * are addressed. Unlike the scene it is not checked here: whether the bytes
   * come back is decided by /api/uploads/[slug] when the browser asks, and that
   * policy is workspace membership - the same thing that let this reader see
   * the board at all. Checking again here would be a round trip per notice to
   * re-derive an answer that is already yes. A slug whose upload has since been
   * deleted 404s, and the card folds itself away rather than drawing a hole.
   */
  image: string | null
  /**
   * Did the person looking at this write it?
   *
   * Here rather than compared by handle on the client, because a handle is a
   * display name and this decides whether somebody is shown the buttons that
   * take their own notice down. The id it is derived from never leaves this
   * function - see the note on `listBoardPosts`.
   */
  mine: boolean
}

/** How many notices the dashboard shows before "show older". */
export const BOARD_PAGE_SIZE = 20

/**
 * The whole board for one space, ready to render.
 *
 * User ids never leave this function. The board renders handles and a "you"
 * flag, so both are resolved here rather than shipped to the client as ids it
 * would have to look up - which is also what keeps the reaction tooltip from
 * being a list of UUIDs when somebody has not picked a username yet.
 */
export async function listBoardPosts(
  supabase: Client,
  tenantId: string,
  viewerId: string,
  people: BoardPeople,
): Promise<BoardPostView[]> {
  const { data, error } = await supabase
    .from('board_posts_read_model')
    .select(
      'id, body, pinned, reactions, edited, scene_id, image_slug, created_by, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('deleted', false)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(BOARD_PAGE_SIZE)

  if (error) {
    throw new Error(`Failed to list board posts: ${error.message}`)
  }

  const rows = data ?? []

  /**
   * Every pinned scene on this page, in one query.
   *
   * A join would be the obvious answer and PostgREST cannot express this one:
   * `scene_id` is deliberately not a foreign key - see the migration - so there
   * is no relationship for it to embed. A second round trip for a handful of
   * ids is the smaller price, and it goes through `listPostedScenes`, which is
   * subject to the scenes policy rather than to the board's.
   */
  const scenes = await listPostedScenes(
    supabase,
    rows.map((row) => row.scene_id).filter((id): id is string => id !== null),
  )

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    pinned: row.pinned,
    reactions: toReactions(row.reactions as Reactions | null, viewerId, people),
    author: row.created_by ? (people.get(row.created_by) ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: row.edited,
    scene: row.scene_id ? (scenes.get(row.scene_id) ?? null) : null,
    image: row.image_slug ? `/api/uploads/${row.image_slug}` : null,
    mine: row.created_by === viewerId,
  }))
}

/**
 * The cards for a page's worth of pinned scenes, by id.
 *
 * Reads `published_scenes` directly rather than going through
 * `@/domain/scenes/queries`, because what a board needs is narrower than a
 * summary: three columns and no document. Anything the policy hides is simply
 * absent from the map, and the caller reads that as "no scene".
 */
async function listPostedScenes(
  supabase: Client,
  ids: string[],
): Promise<Map<string, BoardScene>> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return new Map()

  const { data } = await supabase
    .from('published_scenes')
    .select('id, name, seconds')
    .in('id', wanted)

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, name: row.name, seconds: Number(row.seconds) },
    ]),
  )
}

/**
 * Turn the stored map into rows the chip strip can render.
 *
 * Sorted by count, then by index, so the board does not reshuffle itself under
 * somebody's cursor every time a tie is broken differently. Indices the current
 * sheet cannot draw are dropped rather than rendered as a torn tile - the same
 * call `isEmote` makes for a packet off the wire, made here for a row that was
 * written by a build with a longer sheet than this one.
 */
function toReactions(
  reactions: Reactions | null,
  viewerId: string,
  people: BoardPeople,
): BoardReaction[] {
  if (!reactions) return []

  return Object.entries(reactions)
    .map(([key, userIds]) => ({ emote: Number(key), userIds: userIds ?? [] }))
    .filter((entry) => isEmote(entry.emote) && entry.userIds.length > 0)
    .sort((a, b) => b.userIds.length - a.userIds.length || a.emote - b.emote)
    .map((entry) => ({
      emote: entry.emote,
      by: entry.userIds.map((userId) => people.get(userId)?.name ?? 'someone'),
      mine: entry.userIds.includes(viewerId),
    }))
}
