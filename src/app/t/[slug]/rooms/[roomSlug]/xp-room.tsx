'use client'

import Link from 'next/link'
import type { XpDocument } from '@kxb/xp'
import { XpScene } from '@/app/xp/_runtime/scene'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * A room that is a level.
 *
 * ---------------------------------------------------------------------------
 * What this is instead of
 * ---------------------------------------------------------------------------
 * `battle/[battleId]/xp-match-room.tsx` mounts the same runtime and is not
 * reusable here, which is the honest reason this file exists rather than an
 * import. Two thirds of that component is the match around the level: a roster,
 * two sides to pick between, a Join, a status, an invite. A room has none of
 * those - people arrive by walking in, there is nothing to be on a side of, and
 * the door is the room's own.
 *
 * What is left when you take the match away is small enough to be worth
 * writing plainly, and the two are free to diverge: a match wants a scoreboard,
 * and a room wants whatever a room wants.
 *
 * ---------------------------------------------------------------------------
 * The room id is the topic
 * ---------------------------------------------------------------------------
 * `XpScene`'s `room` accepts any opaque string, and here it is the room's own
 * id - the same id its blocks would have been keyed by and the same one the
 * chat rows carry. So everybody who walks into this room is in one instance of
 * the level, and the people in the lounge are not.
 *
 * Nobody is put on a side. A match's lobby decides that before the document
 * loads; a room has no lobby, so the level decides for itself exactly as it
 * does for a single player - which is what `team` being absent means.
 */
export function XpRoom({
  slug,
  tenantId,
  roomId,
  chat,
  xp,
  xpId,
  me,
  avatar,
}: {
  slug: string
  /**
   * The space's id, for the chat topic. The action takes the slug; the channel
   * does not - see `realtimeChat`.
   */
  tenantId: string
  roomId: string
  /**
   * Whether this space has chat at all.
   *
   * Asked on the server, where the answer is, and passed down rather than
   * guessed: `chatOpen` is a feature flag and a tenant switch, and a runtime
   * that drew a box people typed into and then got refused for would be worse
   * than one that drew nothing.
   */
  chat: boolean
  /** Parsed on the server, so a broken document is a page rather than a crash. */
  xp: XpDocument
  /** The project row this level came from, when it is a saved one. */
  xpId?: string
  me: { id: string; name: string }
  /**
   * The animal this person is *in this space*, which is the lounge's answer.
   *
   * Without it the runtime falls through to `animalFor`, which is a hash of the
   * presence id - a stable animal, agreed by every client, and not the one on
   * the account. So somebody who had picked a fox walked into a room as a deer
   * and stayed a deer, while the same person in the lounge next door was a fox.
   *
   * The space's identity rather than the profile's, so the body here and the
   * face in the rail are the same fact - `readSceneIdentity` is what resolves
   * that, and the lounge on this same page is already drawn from it.
   */
  avatar?: string
}) {
  const t = workspaceDict(useLocale()).rooms

  return (
    /*
      `h-viewport-inset`, not `h-dvh`: this sits inside the workspace shell's
      `<main className="py-6">`, so a full `100dvh` here is a page taller than
      the window - it scrolls by exactly the padding and the bottom of the level
      hangs off the end. See globals.css.
    */
    <div className="relative h-viewport-inset w-full overflow-hidden">
      {/*
        The level, and this room's conversation with it.

        `roomId` and not null: a room *is* a conversation in this product - the
        chat rows carry this id and the rail is switched to it while somebody is
        standing here - so a level in a room that posted to the lounge instead
        would be talking past the people it is in a room with. The battle room
        next door is the other half of that decision, and answers it differently
        because it has no room to belong to.
      */}
      <XpScene
        xp={xp}
        room={roomId}
        me={me}
        {...(avatar ? { avatar } : {})}
        {...(xpId ? { xpId } : {})}
        {...(chat ? { conversation: { slug, tenantId, roomId } } : {})}
      />

      {/*
        One control, and it is the way out.

        This corner used to carry three of them and a card naming the room, the
        level and what the door was doing. All four were room chrome drawn over
        somebody else's level - and the level has its own top-right row, so
        "Leave" landed on top of "Unstick" and the two read as one broken
        button. The card said what the room was called to the person who had
        just walked into it.

        Starting a round went with them. It is the only control here that shuts
        people out, it does nothing a player can see from inside the level, and
        `startRound` is still the room's action - the door is opened and closed
        from the rooms list, where a room is a thing you look at rather than a
        thing you are standing in.

        `top-12` rather than `top-0`, which is the whole reason the overlap
        happened: the level draws `Unstick` and `Enter VR` at `right-0 top-0`,
        and room chrome in the same corner does not push them aside - it lands
        on them. This sits one row down and stays out of the level's way whether
        or not the level put anything there.

        `pointer-events-none` on the strip and back on for the link, because the
        biggest thing on this screen is a 3D scene that wants every click it can
        get - a transparent bar that quietly ate them would read as the game not
        responding. The same rule the match room follows.
      */}
      <div className="pointer-events-none absolute right-0 top-12 flex justify-end p-4">
        <Link
          href={`/t/${slug}/rooms`}
          className="pointer-events-auto rounded-lg border border-line/60 bg-surface/80 px-3 py-1.5 text-xs backdrop-blur-sm transition hover:border-accent/60"
        >
          {t.leave}
        </Link>
      </div>
    </div>
  )
}
