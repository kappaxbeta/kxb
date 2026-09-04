'use server'

import { readSpaceChat, sayInSpace, type ChatResult } from '@/domain/chat/say'
import { chatRoomSchema } from '@/domain/chat/commands'
import type { ChatMessageView } from '@/domain/chat/queries'
import { requireTenant } from '@/lib/tenant'

/**
 * The browser's two doors into the conversation.
 *
 * Both are now four lines: open the space with the session cookie, hand the
 * context to `./say.ts`, return what it says. Everything that was here - the
 * gates, the guest refusal, the name resolution, the command, the projection
 * run - moved there when the native app arrived, because the native app has to
 * run the same rules from a route handler and a Server Action cannot be called
 * with a bearer token.
 *
 * What stayed here is the part that is genuinely about being a browser:
 *
 *   - `requireTenant` reads the session cookie, and 404s or redirects, which is
 *     right for something a page called and wrong for something a phone did.
 *   - No `revalidatePath`. The caller is standing inside a live WebGL canvas,
 *     and the layout re-render would tear the scene down mid-sentence - see the
 *     note on `setLoungeMode`, which learned this first.
 *   - The scene broadcasts over Realtime only once this has returned, which
 *     costs a round trip before anybody else sees the line and buys the thing
 *     that makes the feature work: every client in the room learns the message
 *     under the id it was actually stored with, so the report button beside it
 *     names a row that exists. The sender does not wait for any of it - their
 *     own line goes into the panel the moment they press return, and is rolled
 *     back if this refuses.
 *
 * A `'use server'` file exports async functions and nothing else, so the result
 * type these hand back is declared in `./say.ts` and re-exported nowhere.
 */

export async function postChatMessage(
  slug: string,
  body: string,
  roomId: string | null = null,
): Promise<ChatResult<{ id: string; authorName: string; createdAt: string }>> {
  const context = await requireTenant(slug, { guests: true })
  return sayInSpace(context, body, roomId)
}

export async function readRoomChat(
  slug: string,
  roomId: string | null,
): Promise<ChatResult<ChatMessageView[]>> {
  // Validated before the door as well as behind it, so that a bad id costs a
  // parse rather than a membership check and four queries.
  if (!chatRoomSchema.safeParse(roomId).success) {
    return { ok: false, error: 'No such room' }
  }

  const context = await requireTenant(slug, { guests: true })
  return readSpaceChat(context, roomId)
}

/*
  The head count per room was a Server Action here.

  It is `GET /api/t/[slug]/heads` now, over `roomHeads` in ./queries.ts, and the
  route handler carries the reason: the rail polls it, and a polled Server
  Action re-renders the page it is polled from.
*/
