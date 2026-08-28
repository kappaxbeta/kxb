/**
 * What a room id is allowed to be.
 *
 * ---------------------------------------------------------------------------
 * The switch is not here any more, and that is the point
 * ---------------------------------------------------------------------------
 * This held `XP_ROOMS`, read from `NEXT_PUBLIC_XP_ROOMS`. An environment
 * variable is the wrong shape for this and the reason is not taste: turning the
 * feature on for one space meant a redeploy, turning it off again meant another,
 * and the answer was the same for every space on the platform whether or not any
 * of them had asked.
 *
 * There is already a flag registry with per-space overrides and a backoffice
 * that renders every key in it (`src/domain/flags/keys.ts`), which is exactly
 * this question answered properly - a toggle per space, no deploy, and a record
 * of who turned it on. So the flag is `features.xp` and this file is left with
 * the one thing that genuinely is a constant.
 *
 * One flag, off by default, and it gates the part that leaves the operator tool
 * and touches the live product: an XP room several people are in at once.
 *
 * ---------------------------------------------------------------------------
 * Why this is a flag and not a gate
 * ---------------------------------------------------------------------------
 * `gate.ts` answers *who* may open the creator, which is a permission question
 * with a permission answer - a backoffice admin, checked against a session. This
 * is a different question: whether a half-finished feature is switched on at all.
 *
 * The two are not interchangeable and it matters here, because rooms are the
 * first part of this project that costs something outside it. A room is a
 * Realtime topic, Realtime is a shared tenant budget, and a level left open in a
 * tab is a client sending eight messages a second into that budget until
 * somebody closes it. That is a thing to turn on deliberately, in one place,
 * rather than to discover.
 *
 * ---------------------------------------------------------------------------
 * An environment variable, and public
 * ---------------------------------------------------------------------------
 * `NEXT_PUBLIC_` because the decision is needed in the browser as well as on the
 * server: the page has to decide whether to join a topic, and a server-only flag
 * would mean shipping the join code and hoping nothing called it.
 *
 * Public also means it is not a secret, which is honest - a flag is not a
 * permission. Somebody who reads the bundle learns that XP rooms exist. What
 * they cannot do is join one, because that is the migration's business
 * (`20260920000000_xp_rooms.sql`) and Realtime checks it whatever the client
 * believes.
 */
/**
 * A room id somebody was sent, or nothing.
 *
 * Validated in one place rather than at each use, because it ends up in a
 * Realtime topic and a topic with a colon in it is a topic that means something else. The
 * same alphabet the migration's parser accepts, and the same length - two checks
 * of one rule is one rule that can drift, so this is written to match and the
 * migration is the one that is enforced.
 */
export function roomId(value: string | undefined | null): string | null {
  if (!value) return null
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value) ? value : null
}

/**
 * The topic for one *place* in a room - docs/xp/scenes.md §1.6.
 *
 * ---------------------------------------------------------------------------
 * Why the scene is in the topic rather than filtered out of it
 * ---------------------------------------------------------------------------
 * Two people in different scenes must not see each other, and the cheap way to
 * arrange that is not to filter a stream they are both on - it is not to be on
 * it. Presence is a topic, so a scene in the topic means peers are fanned out
 * only to the people in the same room of the level, nameplates need no test,
 * and a shot in the lobby cannot reach somebody in the back room, because
 * nothing was sent rather than because something was dropped.
 *
 * It also makes big rooms *cheaper*: room traffic grows with the square of the
 * room, so twenty-five people in one topic is 625 and the same twenty-five
 * across five scenes is five lots of 25.
 *
 * ---------------------------------------------------------------------------
 * Always, including `main`
 * ---------------------------------------------------------------------------
 * A document with no scenes is one scene called `main` (`enterOf`), and it gets
 * `<room>/main` like everything else. The special case - a bare `<room>` for
 * the root and a slash for the rest - is the trap it looks like it avoids: two
 * spellings for one place, so a client on `abc` and a client on `abc/main`
 * would both believe they were in the lobby and neither would see the other.
 *
 * The cost is paid once, on the deploy that ships this: a tab that was on
 * `xp:abc` is on a topic nobody else joins any more. `NEXT_DEPLOYMENT_ID`
 * already hard-navigates an open tab on its next move, which is the same
 * reload this needs.
 *
 * ---------------------------------------------------------------------------
 * The room is still the room
 * ---------------------------------------------------------------------------
 * `roomId` stays the unit of a session - one instance, one set of players, one
 * arbiter - and the scene is which room of it you are standing in. That is why
 * this composes rather than replaces: `abc/lobby` and `abc/cellar` are one
 * game, and everything that reports on a session (the arbiter, a match result,
 * a finished run) keys on the part before the slash. The migration's
 * `xp_room_topic` splits it back off for exactly that reason.
 */
export function sceneTopic(room: string, scene: string): string {
  return `${room}/${scene}`
}
