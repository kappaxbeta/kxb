'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { XpScene } from '@/app/xp/_runtime/scene'
import { useIsTouch } from '@/app/xp/_runtime/hud/touch-controls'
import { teamsOf } from '@kxb/xp'
import {
  joinBattle,
  restartBattle,
  setReady,
  startBattle,
  startRematch,
  wantRematch,
} from '@/domain/battle/actions'
import { cameBack, whoIsAway } from '@/app/t/[slug]/battle/[battleId]/away'
import { readBattle } from '@/app/t/[slug]/battle/[battleId]/read-battle'
import { publishMatch } from '@/app/t/[slug]/match-store'
import {
  MIN_PLAYERS,
  readyNeeded,
  seatsIn,
  sidesFor,
  type Side,
  type XpMatchRules,
} from '@/domain/battle/events'
import type { BattleView } from '@/domain/battle/queries'
import type { XpDocument } from '@kxb/xp'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * A match, played inside an XP.
 *
 * The runtime is *imported* rather than linked to, which is the whole point of
 * this file. `/xp/<id>` is the creator's workbench - an operator opens a document
 * there to check that a slope is walkable - and the people who play an XP never
 * see it. They come here, where the match already knows who is in it.
 *
 * ---------------------------------------------------------------------------
 * The room is the battle
 * ---------------------------------------------------------------------------
 * `room={battle.id}` and nothing else needs deciding: everybody the lobby sent
 * here joins the same Realtime topic because they were sent the same battle.
 * That is why the room id was never a uuid of its own - see `roomId` in
 * `@/lib/xp-rooms`, and the note on `xpId` in the battle events about why the
 * match still carries a world.
 *
 * ---------------------------------------------------------------------------
 * What was missing, and what it looked like from inside
 * ---------------------------------------------------------------------------
 * This was a header and two buttons, on the argument that every piece of chrome
 * next door reads a *result* out of the scene and an XP does not report one yet.
 * That argument holds for the clock, the kill feed and the whistle. It does not
 * hold for any of the three things that were reported after a real match:
 *
 * - **"I cannot see the other player."** The page was rendered once, on the
 *   server, and never again - so somebody who joined after the host loaded the
 *   room appeared on nobody's screen. The scene knew (presence is instant); the
 *   chrome around it did not, and the chrome is where a person looks to find
 *   out whether anybody else turned up. It polls now, exactly as `BattleRoom`
 *   does and for the reason that file gives: `router.refresh()` would re-render
 *   the route around a live WebGL canvas.
 * - **"It started without two people in."** There was no lobby at all - you
 *   landed in a playable level whatever the match's status was - so "started"
 *   was not a thing anybody could see happen. There is a lobby now, and the
 *   whistle counts ready signs rather than the roster.
 * - **"The match ended and I cannot rematch."** There was nothing to press.
 *   The result and the rematch are the same panel `BattleRoom` has, minus the
 *   scoreline, because the score is the part an XP still does not report.
 *
 * What is still missing is the *return*: no score comes back out of an XP, so
 * this match ends the ordinary ways a battle does - the last person out, or the
 * day-later backstop - rather than on a whistle. That is docs/xp/creator.md §9
 * and is said out loud below rather than left to be discovered.
 */
/**
 * What each side is called, and what colour it is.
 *
 * The lounge's own pair - fuchsia and cyan have meant red and blue since
 * football existed here, and somebody who has seen one should not have to learn
 * the other. `one_vs_all` has its own two, which are not teams and are not
 * coloured like them.
 */
/** What the button for one side says. Four phrases, one per side. */
function joinLabel(side: Side, t: BattleDict['xpRoom']): string {
  if (side === 'red') return t.joinRed
  if (side === 'blue') return t.joinBlue
  if (side === 'champion') return t.beChampion
  if (side === 'challengers') return t.joinChallengers
  return side
}

const SIDE_STYLE: Partial<Record<Side, string>> = {
  red: 'border-fuchsia-400/70 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25',
  blue: 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25',
}


export function XpMatchRoom({
  slug,
  tenantId,
  battle: initialBattle,
  xp,
  rules,
  xpId,
  chat,
  me,
  avatar,
  joined: initiallyJoined,
  staff,
}: {
  slug: string
  /**
   * The space's id, for the chat topic. The action takes the slug; the channel
   * does not - see `realtimeChat`.
   */
  tenantId: string
  battle: BattleView
  /**
   * Parsed on the server, and already carrying this match's overrides.
   *
   * `applyMatchRules` put them on before this was rendered, so the scene is
   * handed one document with one rules block - see the battle page.
   */
  xp: XpDocument
  /**
   * The same block, on its own, for the chrome to print.
   *
   * Handed over rather than read back off `xp.rules`, because the lobby has to
   * name a number the *decider* will use, and the decider reads the match's
   * block. Two ways to the same figure is how a lobby comes to promise a start
   * the server then refuses.
   */
  rules: XpMatchRules
  /**
   * The project row this ground came from, when it is a saved one.
   *
   * Resolved from `battle.xpId`'s reference on the server. A builtin ground has
   * none, and a level with nothing to store against is the common case.
   */
  xpId?: string
  /**
   * Whether this space has chat at all.
   *
   * Asked on the server, where the answer is. A match that drew a box people
   * typed into and were then refused for would be worse than one that drew
   * nothing at all.
   */
  chat: boolean
  me: { id: string; name: string }
  /**
   * The animal this person is in this space. See the same prop on the room next
   * door: without it the runtime falls through to `animalFor`, which is a hash
   * of the presence id rather than the body on the account.
   */
  avatar?: string
  joined: boolean
  /**
   * Whether this person runs the space, for the one control that is not a
   * player's.
   *
   * Was one of a pair with `canInvite`, which has gone: handing out a guest
   * link is the rail's job now, and `GuestRail` gates it on `guestAccess` -
   * built only for owners and admins - so a second boolean saying the same
   * thing had nothing left to guard. This one stays, because *may you end
   * something other people are in the middle of* is still its own question.
   */
  staff: boolean
}) {
  const refusal = useRefusal()
  const t = battleDict(useLocale()).xpRoom
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  /**
   * The match, in state rather than re-fetched through the router.
   *
   * `BattleRoom`'s decision, copied for its reason: a `router.refresh()` here
   * would re-render the route around a live canvas, which is the thing every
   * scene in this app goes out of its way to avoid. So the roster, the status
   * and the result all arrive as plain data and the scene never re-renders from
   * the server at all.
   */
  const [battle, setBattle] = useState(initialBattle)

  const refresh = useCallback(async () => {
    const next = await readBattle(slug, initialBattle.id)
    if (next) setBattle(next)
  }, [slug, initialBattle.id])

  const sides = sidesFor(battle.mode)
  /** Whether this document is a cartridge - see `Framed` in the XP runtime. */
  const framedDoc = xp.frame !== undefined

  const mine = battle.participants.find((player) => player.userId === me.id)
  const joined = mine !== undefined || initiallyJoined
  /**
   * Whoever may blow the whistle, which is not always whoever set it up.
   *
   * The host keeps it while they are standing in the lobby, and it passes to
   * everybody in it once they have gone - the decider's rule, mirrored here so
   * the button is offered to exactly the people it will accept. A start button
   * only the absent host could press is what made "leaving as owner closes the
   * match" true from inside.
   */
  const hosting = battle.participants.some((player) => player.userId === battle.createdBy)
  const isHost = hosting ? battle.createdBy === me.id : joined

  /**
   * The lights, switched from the lobby and kept for the match.
   *
   * On, everybody you are playing with stands in their own colour - the same
   * glow the lounge's party mode puts on the people in a room, and the same
   * hue-per-id, so somebody who is blue in the lounge is blue here. See
   * `src/app/xp/_runtime/glow.tsx`.
   *
   * **The room's, not yours.** One person throws the switch and the match is
   * lit for everybody in it, which is what the lounge's party does and is the
   * point of a light: a room where four people see four different rooms is not
   * a party. The message goes on the match channel - see `onParty` in
   * `_runtime/together.tsx` - so this state is set both by pressing the button
   * and by somebody else pressing theirs.
   *
   * **Anybody in the match may throw it**, where the lounge asks for a
   * moderator. The two are different rooms: a space has strangers in it and the
   * switch belongs to whoever runs it, while everybody in a match joined this
   * match on purpose. A light is also the one thing here that undoes itself.
   *
   * `host` is whoever threw it, because that is the person whose colour cycles
   * the wheel while everybody else sits on their own hue - which is how a room
   * picks somebody out without a label over their head.
   *
   * Kept in this component rather than in the scene, so it survives the lobby
   * closing: the panel goes away at kickoff and the lights stay on.
   */
  const [glow, setGlow] = useState(false)
  const [glowHost, setGlowHost] = useState<string | null>(null)
  const open = battle.status === 'open'
  const over = battle.status === 'ended' || battle.status === 'cancelled'

  /**
   * Tell the rail what is being played.
   *
   * The chrome that used to float over this scene lives in the left panel now -
   * see `MatchBlock`. The panel renders above this route in the tree and can
   * never see it, so the seam is a module store: this writes, the rail reads.
   *
   * `canEnd` is resolved here rather than published as its parts, because the
   * rule is this component's - the host keeps the whistle while they are in the
   * lobby and it passes to everybody once they have gone - and a rail deciding
   * it again from `isHost` and `staff` would be the same rule written twice, in
   * a file with no reason to know it.
   *
   * Cleared on the way out. "Am I in a match" is then answerable by whether the
   * store holds anything, rather than by parsing a URL in the rail.
   */
  useEffect(() => {
    publishMatch({
      slug,
      battleId: battle.id,
      name: battle.name,
      xpName: xp.name,
      preset: rules.preset,
      status: battle.status,
      joined,
      canEnd: (isHost || staff) && !over,
      /*
        Who it is between, so the rail can answer "who is here" for a match.

        Off `battle.participants` - the durable roster the match is *between* -
        rather than off the socket, which is who happens to be looking at it
        this second. See `CurrentMatch.people`.
      */
      people: battle.participants.map((player) => ({
        userId: player.userId,
        name: player.name,
        side: player.side ?? null,
      })),
      me: me.id,
    })

    return () => publishMatch(null)
  }, [
    slug,
    battle.id,
    battle.name,
    battle.status,
    battle.participants,
    xp.name,
    rules.preset,
    joined,
    isHost,
    staff,
    over,
    me.id,
  ])

  /**
   * Which side the lobby already put this player on.
   *
   * The host is the authority on it - `joinBattle` records a side before anybody
   * loads the document - so the runtime is told rather than left to work it out.
   * Null for a free-for-all or a race, where `sidesFor` returns nothing and the
   * level decides for itself.
   *
   * The names line up with the marks a document places on purpose: a battle's
   * `red` and `blue` are the same two words `Mark.team` uses, which is what lets
   * a side reach its own spawn without a translation table nobody maintains. A
   * mode whose sides are `champion` and `challengers` has no matching mark, and
   * `spawnFor` falls back rather than refusing - a level is still playable when
   * its author has not drawn a spawn for every mode it might host.
   *
   * Read off the *initial* roster rather than the polled one, deliberately: it
   * is a prop of the scene, and a value that changed under a running level
   * would re-key everybody's spawn mid-match.
   */
  const [mySide] = useState<Side | null>(
    () =>
      initialBattle.participants.find((player) => player.userId === me.id)?.side ?? null,
  )

  /**
   * Whether this battle's sides can seat this level at all.
   *
   * A battle knows two teams - `red` and `blue` are the whole of `TEAMS`, and
   * they are event values, so a third is a schema change rather than a label.
   * A board game has four spawn marks, and the two the lobby offers cannot
   * cover them: two players get a colour from the host, the other two get
   * nothing, and green and yellow are unreachable in a battle no matter who
   * joins.
   *
   * So when the level has more sides than the battle does, the *level* seats
   * everybody: `mySide` is not handed down, `sideOf` falls through to the
   * document's own `assign`, and all four chairs get used. The join buttons go
   * with it, because two buttons that decide half a table are worse than none -
   * they read as the whole choice.
   *
   * Not a fallback for a level with two sides: `red` and `blue` are the same
   * two words `Mark.team` uses, which is exactly why the host's answer works
   * there and is worth keeping.
   */
  const ourSides = teamsOf(xp.world.marks)
  const levelSeats = ourSides.length > sidesFor(battle.mode).length

  /**
   * A framed game seats you on arrival.
   *
   * ---------------------------------------------------------------------------
   * Because the panel that used to do it is gone
   * ---------------------------------------------------------------------------
   * A cartridge runs its own lobby, so this room no longer draws *Join red* and
   * *Join blue* - and those buttons were the only thing that ever wrote a seat.
   * Left alone, the roster reads `0 of 2 in` while two people fight, the match
   * record says nobody played it, and "somebody leaves and another can join"
   * has nothing to leave.
   *
   * So arriving *is* taking a seat, which is also what it feels like: you
   * followed a link to a match, and there is one free.
   *
   * ---------------------------------------------------------------------------
   * Two people arriving at once
   * ---------------------------------------------------------------------------
   * Both see an empty roster and both ask for red. The server takes the second
   * one too - switching sides is the same call - so they end up on the same
   * side rather than on two. The effect below sorts that out on the next poll:
   * whoever's id sorts higher moves to the free side, which needs no message
   * because both clients can see the same roster and reach the same answer.
   *
   * It is the same no-election rule the game itself seats corners by, and it
   * converges within one poll.
   */
  const seatTaken = useRef(false)
  useEffect(() => {
    if (!framedDoc || !open || pending) return

    const seats = seatsIn(battle.xpRules)
    const sides = sidesFor(battle.mode)
    const mineNow = battle.participants.find((player) => player.userId === me.id)

    // Nowhere to sit, or a level that seats people itself.
    if (levelSeats || sides.length === 0) return

    if (!mineNow) {
      if (seatTaken.current || battle.participants.length >= seats) return
      seatTaken.current = true
      const free = sides.find(
        (side) => !battle.participants.some((player) => player.side === side),
      )
      void joinBattle(slug, battle.id, free ?? sides[0])
      return
    }

    /**
     * Already seated, but sharing a side with somebody while another is empty.
     *
     * Only the one who sorts higher moves, so the two clients cannot swap past
     * each other forever.
     */
    const sharing = battle.participants.filter((player) => player.side === mineNow.side)
    if (sharing.length < 2) return
    const empty = sides.find(
      (side) => !battle.participants.some((player) => player.side === side),
    )
    if (!empty) return
    const highest = sharing.map((player) => player.userId).sort().at(-1)
    if (highest !== me.id) return
    void joinBattle(slug, battle.id, empty)
  }, [
    framedDoc,
    open,
    pending,
    battle.participants,
    battle.xpRules,
    battle.mode,
    battle.id,
    levelSeats,
    slug,
    me.id,
  ])


  /**
   * ---------------------------------------------------------------------------
   * Who is actually here, which the roster cannot answer
   * ---------------------------------------------------------------------------
   * Reported up out of the scene, because the socket is the only thing that
   * knows. `battle.participants` is who the match is *between* - durable,
   * polled, and still listing somebody whose laptop lid closed ten minutes ago -
   * and the difference between those two lists is the person everybody else is
   * standing around waiting for. See ./away.
   */
  /**
   * Who is on the socket, and when each of them was last on it.
   *
   * **One piece of state holding both**, which is not tidiness: the stamps are
   * computed *from* the list that is being replaced, so the two have to move
   * together or the update has to read state it is in the middle of changing.
   *
   * And everybody who *was* here is stamped, not just everybody who is.
   * Presence only speaks when the set changes, so a room that has been steady
   * for five minutes has not stamped anybody in five minutes - a player
   * dropping out of that room would read as having been gone the whole time,
   * skip the settle window, and open the panel instantly. Stamping the outgoing
   * list is what makes "last seen" mean the moment they left.
   */
  const [socket, setSocket] = useState<{
    present: readonly string[]
    seen: Record<string, number>
  }>({ present: [], seen: {} })

  const notePresence = useCallback((ids: readonly string[]) => {
    const at = Date.now()
    setSocket((before) => {
      const seen = { ...before.seen }
      for (const userId of before.present) seen[userId] = at
      for (const userId of ids) seen[userId] = at
      return { present: ids, seen }
    })
  }, [])

  /**
   * Playing on without them, once the room has decided to.
   *
   * Kept per person rather than as one flag, so a second player dropping out
   * ten minutes later opens the panel again. A dismissal is about the people it
   * named, not about the panel.
   */
  const [playingOn, setPlayingOn] = useState<readonly string[]>([])

  /**
   * Whether there is anybody to be counting seconds for.
   *
   * Asked before the clock is, and that ordering is the whole reason it is a
   * separate value: the countdown below needs a re-render a second, and a room
   * where nobody has gone anywhere should not be re-rendering a live canvas
   * once a second forever. Nor should one that has already decided to play on
   * without somebody, which is why `playingOn` is read here rather than only
   * where the panel is drawn.
   */
  const missing = useMemo(
    () =>
      battle.participants.some(
        (player) =>
          player.userId !== me.id &&
          !player.defeated &&
          !playingOn.includes(player.userId) &&
          socket.seen[player.userId] !== undefined &&
          !socket.present.includes(player.userId),
      ),
    [battle.participants, socket, playingOn, me.id],
  )

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!missing || battle.status !== 'live') return

    /*
     * The clock only runs while somebody is missing, so it is stale by the time
     * anybody is - and stale reads as *earlier*, which `whoIsAway` treats as
     * "not away yet". So the panel is at worst one second late and never one
     * second early, which is the right way round for a thing that exists to
     * tell people apart from their own connections.
     */
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [missing, battle.status])

  const away =
    battle.status === 'live'
      ? whoIsAway({
          roster: battle.participants,
          present: socket.present,
          seen: socket.seen,
          me: me.id,
          now,
        })
      : null

  const waitingFor = away?.gone.filter((player) => !playingOn.includes(player.userId)) ?? []

  /**
   * "Ana is back."
   *
   * Said out loud because the alternative is a panel that vanishes: somebody
   * watching it has no way to tell "they came back" from "the thing watching
   * them gave up", and those two call for opposite decisions.
   */
  const [returned, setReturned] = useState<string[]>([])
  const goneBefore = useRef<string[]>([])

  useEffect(() => {
    const gone = away?.gone ?? []
    const back = cameBack(goneBefore.current, gone)
    goneBefore.current = gone.map((player) => player.userId)

    if (back.length === 0) return

    setReturned(back)
    // And they are watched again from here. Somebody whose connection dropped
    // once is not somebody the room has agreed to play without for the rest of
    // the evening.
    setPlayingOn((before) => before.filter((userId) => !back.includes(userId)))
  }, [away])

  /**
   * Playing on: stop asking about these people, and stop counting.
   *
   * `seen` is deliberately *not* touched. They are still away, they are still on
   * the list `cameBack` is diffed against, and that is what makes their coming
   * back still worth announcing - which is the whole reason to keep watching a
   * room that has decided not to wait.
   */
  function playOn(players: readonly { userId: string }[]) {
    setPlayingOn((before) => [...before, ...players.map((player) => player.userId)])
  }

  /**
   * And it stops being news.
   *
   * Its own effect, keyed on the message rather than on the wait, and that is
   * not tidiness: `away` is a fresh object every render, so a timer started in
   * the effect above would be cleared by the very next render and the line
   * would stay on the screen for the rest of the match.
   */
  useEffect(() => {
    if (returned.length === 0) return

    const timer = setTimeout(() => setReturned([]), 6000)
    return () => clearTimeout(timer)
  }, [returned])

  /**
   * Everybody follows the restart.
   *
   * A restarted match is cancelled *and* points at the one that replaced it -
   * see `RestartBattle` - and that pointer is the whole reason the restart goes
   * through the log rather than being a cancel and a create. Without this the
   * other three would be looking at a "called off" card with a lobby to find
   * their own way back through.
   *
   * Only for a cancellation with somewhere to go. A match that ended the
   * ordinary way and grew a rematch keeps the door it has always had, because
   * that one was *asked* for and walking people through it would be moving them
   * out of a result they may still be reading.
   */
  useEffect(() => {
    if (battle.status !== 'cancelled' || !battle.rematchBattleId) return
    router.push(`/t/${slug}/battle/${battle.rematchBattleId}`)
  }, [battle.status, battle.rematchBattleId, router, slug])

  /** What the whistle needs, and how close the room is to it. */
  const needed = readyNeeded(battle.xpRules)
  const readyHere = battle.participants.filter((player) => player.ready)
  const iAmReady = mine?.ready ?? false

  /** Who is up for another one. Only meaningful once it is over. */
  const rematchers = battle.participants.filter((player) => player.wantsRematch)
  const iWantRematch = rematchers.some((player) => player.userId === me.id)

  /**
   * Keep watching, on the same five seconds `BattleRoom` uses.
   *
   * Through the whole of the match rather than only the lobby: the end of an XP
   * match arrives from somewhere else entirely - the last person out, or the
   * day-later backstop - so a room that stopped polling at kickoff would be a
   * room where the result never appears. Stops once there is nothing left to
   * learn, which is a rematch that exists or a match that was called off.
   */
  useEffect(() => {
    if (battle.status === 'cancelled') return
    if (over && battle.rematchBattleId) return

    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [over, battle.status, battle.rematchBattleId, refresh])

  /**
   * Joining is still the battle's own action.
   *
   * Not the room's: being in the Realtime topic and being on the *roster* are
   * different facts, and only the second one survives the tab closing. Presence
   * says who is here now; the roster is who this match is between.
   */
  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(refusal(result.error ?? t.thatDidNotWork))
      else await refresh()
    })
  }

  /**
   * Leaving, as a thing the match is told about.
   *
   * It used to be a link to the hub and nothing else, which left everybody who
   * walked out standing on the roster forever - a lobby full of people who are
   * not there, a start button counting them, and a live match that could never
   * empty and so could never end. Navigating afterwards rather than instead.
   */
  /**
   * Line up again, from here, and take the room with us.
   *
   * The other answer to somebody walking out - see the panel below. It calls
   * the match off and opens the same one again, and everybody else arrives
   * through the pointer it leaves behind rather than through a link they have
   * to notice.
   */
  function goRestart() {
    setError(null)
    startTransition(async () => {
      const result = await restartBattle(slug, battle.id)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  /**
   * The lobby's buttons, in the order they are drawn, so a number can reach one.
   *
   * ---------------------------------------------------------------------------
   * Why a list rather than three buttons in the JSX
   * ---------------------------------------------------------------------------
   * The level takes the pointer. That is the whole point of a first-person
   * scene - the mouse turns your head, and the cursor is gone - and it makes
   * every control on this panel unreachable without first pressing Escape to
   * give the pointer back, finding the button, and clicking it: *"u need to
   * press escape and then click there, not a nice flow"*.
   *
   * A key is the fix, and a *number* rather than a letter because the letters
   * belong to the document: `player.keys` can bind five of them, and a lobby
   * that claimed R would be a lobby that fought with the die.
   *
   * The list exists so the badge on a button and the key that presses it come
   * from one place. Two derivations - one numbering the buttons and one
   * numbering the handler's cases - is how a panel ends up printing 2 next to
   * something 3 does, and the person who finds out is mid-game.
   */
  const lobbyActions: {
    /** Stable across renders for React, and unrelated to the number. */
    id: string
    label: string
    run: () => void
    disabled: boolean
    className: string
    /** For "Ready ✓", which is a state rather than a second action. */
    pressed?: boolean
  }[] = []

  /** Sentences the lobby adds under its buttons. */
  const lobbyNotes: string[] = []


  /**
   * A cartridge runs its own lobby, so this one gets out of the way.
   *
   * ---------------------------------------------------------------------------
   * One lobby, and it belongs to whoever knows the game
   * ---------------------------------------------------------------------------
   * A framed XP - `packages/xp/src/document/frame.ts` - is a game the host runs
   * rather than a world this runtime draws, and the ones worth framing come with
   * their own idea of getting started: boxing shows two corners, the fighter
   * each was given, a ready button and a link to bring somebody.
   *
   * Drawing this panel as well produced two, which is what it looked like from
   * outside: *"you can't start the match when both say they're ready"*. Both
   * were working. Neither was listening to the other, and a player pressing
   * ready in one had no way to know which one counted.
   *
   * So the game's wins, because it is the one that can say *Boxer* and *red
   * corner* rather than *side 1*. What stays here is everything this panel knows
   * and the game cannot: who the match is between, and the way out of it.
   */
  const framed = framedDoc

  if (open && !framed) {
    /**
     * The sides stay on the panel until you say you are ready.
     *
     * They used to disappear the moment you picked one, which made the first
     * click final: *"u cant change the team at the moment, when u clicked it
     * should be changeable till u clicked ready"*. Picking a side is not a
     * commitment - the commitment is the ready button, which is what the
     * whistle counts - so there is no reason for the choice to lock before it.
     *
     * The side you are on is drawn as pressed rather than removed, so the panel
     * says which one you took as well as offering the other. Gone once you are
     * ready, because at that point changing it silently would move you after
     * the room had counted you.
     */
    /**
     * Whether there is a seat left to take.
     *
     * The panel used to offer *Join red* and *Join blue* to everybody in the
     * room, including somebody arriving at a match that already has both
     * fighters in it. The click was not ignored - it went to the server, the
     * aggregate refused it with `A battle holds 2 fighters`, and the visitor
     * got a red message for pressing the only two buttons they were offered.
     *
     * `seatsIn` is the same function the aggregate guards with, so the button
     * and the refusal cannot disagree about how many there are.
     *
     * Somebody already in the match is never blocked: switching sides is the
     * same call as joining, and they are not taking a new seat.
     */
    const seats = seatsIn(battle.xpRules)
    const full = !joined && battle.participants.length >= seats

    if (!iAmReady) {
      if (sides.length > 0 && !levelSeats) {
        for (const side of sides) {
          // The *live* side, off the polled roster - `mySide` is frozen at
          // mount on purpose, because it keys the spawn and a value that moved
          // under a running level would re-key everybody. The panel is asking a
          // different question: which side am I on right now.
          const onIt = joined && mine?.side === side
          lobbyActions.push({
            id: `side-${side}`,
            /*
              "Join red" rather than "red": the button is the whole question, so
              it says the verb. Four phrases rather than one template, because
              `champion` and `challengers` are not a colour you join.
            */
            label: onIt ? `${joinLabel(side, t)} ✓` : joinLabel(side, t),
            // Switching is the same call as joining: the server takes the side
            // you name and moves you, so there is nothing extra to write here.
            run: () => act(() => joinBattle(slug, battle.id, side)),
            disabled: pending || onIt || full,
            pressed: onIt,
            className: `${SIDE_STYLE[side] ?? 'border-accent bg-accent/15 text-accent hover:bg-accent/25'}`,
          })
        }
      } else if (!joined) {
        lobbyActions.push({
          id: 'join',
          label: t.join,
          run: () =>
            act(() =>
              sides.length > 0
                ? joinBattle(slug, battle.id, sides[0])
                : joinBattle(slug, battle.id),
            ),
          disabled: pending || full,
          className: 'border-accent bg-accent/15 text-accent hover:bg-accent/25',
        })
      }
    }

    /**
     * And say so, rather than leaving two dead buttons with no explanation.
     *
     * A disabled control answers "can I press this" and not "why not". For a
     * visitor who followed a link into a match that is already under way, the
     * second question is the only one they have.
     */
    if (full) {
      lobbyNotes.push(fill(t.battleFull, { seats: String(seats) }))
    }

    if (joined) {
      lobbyActions.push({
        id: 'glow',
        label: glow ? t.glowOn : t.glow,
        run: () => {
          setGlow((was) => !was)
          // Ours the moment we press it, so the wheel starts turning on our own
          // body without waiting for the packet to come back off the wire.
          setGlowHost(me.id)
        },
        // Never pending: it writes nothing to a server, which is the whole
        // reason it is here rather than beside the host's switches.
        disabled: false,
        pressed: glow,
        className: glow
          ? 'border-transparent bg-fuchsia-400/90 text-surface hover:bg-fuchsia-300'
          : 'border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-200 hover:bg-fuchsia-400/20',
      })

      lobbyActions.push({
        id: 'ready',
        label: iAmReady ? t.ready : t.iAmReady,
        run: () => act(() => setReady(slug, battle.id, !iAmReady)),
        disabled: pending,
        pressed: iAmReady,
        className: iAmReady
          ? 'border-transparent bg-emerald-400/90 text-surface hover:bg-emerald-300'
          : 'border-accent bg-accent/15 text-accent hover:bg-accent/25',
      })
    }

    if (isHost) {
      lobbyActions.push({
        id: 'start',
        label: t.start,
        run: () => act(() => startBattle(slug, battle.id)),
        // The whistle stays gated on the room being at the line. A number that
        // started a match two people short would be the same mistake as a
        // button that did, arriving faster.
        disabled: pending || readyHere.length < needed,
        className: 'border-transparent bg-amber-400 text-black hover:bg-amber-300',
      })
    }
  }

  /**
   * The list as the key handler sees it, without re-subscribing every render.
   *
   * `pending` flips twice per press and the roster arrives every five seconds,
   * so a listener with these in its dependency list would be added and removed
   * through the whole of the wait. The window hears one listener; the ref is
   * how it reads a fresh list.
   */
  const pressable = useRef(lobbyActions)
  /*
    Filled after every render rather than during one, which is what the refs
    lint rule is about and it is right: a ref written while rendering is a value
    React is entitled to assume did not change. After the commit it is simply
    the latest list, which is all the listener wants.
  */
  useEffect(() => {
    pressable.current = lobbyActions
  })

  /**
   * Whether this is a phone, which decides only whether the number is *drawn*.
   *
   * The listener below stays either way: a tablet with a keyboard attached is a
   * coarse pointer that can still press 1, and the badge is what would be a lie
   * on a device with no keys - not the shortcut.
   */
  const isTouch = useIsTouch()

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      /*
       * Not while typing, and not while a modifier is down - the same guard the
       * runtime's own key listener uses. `1` is also `1` in the chat box, and
       * ⌘1 is a browser tab.
       */
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      // `code` rather than `key`, so a French keyboard's top row still counts -
      // and the numpad too, which is where a right hand already is.
      const digit = /^(Digit|Numpad)([1-9])$/.exec(event.code)
      if (!digit) return

      const action = pressable.current[Number(digit[2]) - 1]
      if (!action || action.disabled) return

      // Only once the panel has one, and never as a keystroke the level also
      // hears: the lobby is on top of the scene and this is its key while it is.
      event.preventDefault()
      event.stopPropagation()
      action.run()
    }

    // Capture, so it beats the runtime's own window listener to a document that
    // happens to bind a digit. The panel is only up before kickoff, so this
    // takes nothing away from a level that is being played.
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [])

  /** Make the rematch and walk into it. Everybody else follows a poll later. */
  function goRematch() {
    setError(null)
    startTransition(async () => {
      const result = await startRematch(slug, battle.id)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  return (
    /**
     * No background of its own: the scene's canvas is transparent so the page's
     * own sky shows through its feathered edge, and an opaque colour here paints
     * over exactly the thing that makes it read as a world rather than a
     * rectangle. `overflow-hidden` stays - the chrome is absolutely positioned
     * against this.
     */
    /*
      `h-viewport-inset`, not `h-viewport`: this sits inside the workspace
      shell's own `py-6`, so the whole window plus that padding is a page that
      scrolls by exactly the padding. See globals.css.
    */
    <main className="relative h-viewport-inset w-full overflow-hidden">
      {/*
        The level, filling the screen.

        Underneath everything rather than inside a panel: an XP takes the pointer
        the moment you click it, and a game played in a box with a page around it
        is a game you keep clicking out of.
      */}
      {/*
        The space's own conversation, and not one per match.

        docs/xp/backlog.md §7b's second open question, answered here because
        this is the case that made it a question: a battle has no `rooms` row,
        so it is either the space's main conversation or nothing. The space's,
        because the whole argument for chat living on the host is that a message
        in a level is a message *in the space* rather than a second inbox nobody
        reads - and a per-match conversation with no row, no rail and nothing
        left after the match empties is precisely that second inbox.

        It costs nothing to change its mind later: a match that one day has a
        room is a different id passed here and nothing else.
      */}
      <XpScene
        xp={xp}
        room={battle.id}
        /* A battle is a battle whatever the document calls itself, and this is
           the one place that knows it. It picks the level's battle flow if it
           has one, and it is what a script reads back from `world.mode`. */
        mode="battle"
        /*
          What the wizard chose for this match, for a framed game to honour.

          A level ignores it - the runtime has never read a battle's clock, and
          `rules` on the document is what a level counts by. A cartridge cannot:
          its rounds are its own, and until this was passed a host setting three
          minutes got a lobby that said three minutes and a game that played its
          default. See `FrameProps.match`.
        */
        match={{
          timeLimit: rules.timeLimit ?? null,
          scoreLimit: rules.scoreLimit ?? null,
        }}
        startedAt={battle.startedAt}
        me={me}
        {...(avatar ? { avatar } : {})}
        {...(xpId ? { xpId } : {})}
        {...(mySide && !levelSeats ? { team: mySide } : {})}
        /**
         * Both directions, and both are needed.
         *
         * `party` is what this client asks for and is passed even when it is
         * off, or turning the lights *out* would be a press nobody else hears.
         * `onParty` is what the room turns out to agree about, so a peer's
         * switch lands here rather than only on their own screen.
         */
        party={{ on: glow, ...(glowHost ? { host: glowHost } : {}) }}
        onParty={(on, from) => {
          setGlow(on)
          setGlowHost(on ? from : null)
        }}
        {...(chat ? { conversation: { slug, tenantId } } : {})}
        onRoster={notePresence}
      />

      {/*
        The lobby, over the level rather than instead of it.

        A panel and not a page: the level is already loaded behind it, so this is
        the moment somebody is *waiting through* rather than a screen they have
        to get past - and being able to see the room you are about to play in is
        most of the answer to "is this thing broken".

        Not drawn at all for a framed XP - see `framed` above. Gating only its
        buttons was half a fix: the panel stayed, saying *waiting to start,
        0 of 2 in*, on top of a game that had just announced a technical
        knockout. Two lobbies is confusing; one lobby and one contradiction is
        worse.
      */}
      {open && !framed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-line/60 bg-surface/90 p-4 backdrop-blur-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                {t.waitingToStart}
              </p>
              <p className="font-mono text-[10px] text-ink-muted">
                {fill(t.readyLine, {
                  ready: readyHere.length,
                  needed,
                  here: battle.participants.length,
                  seats: seatsIn(battle.xpRules),
                })}
              </p>
            </div>

            {/*
              Who is here and who is ready, which is the question the ready sign
              was asked for. The roster rather than presence: a tick is a thing
              somebody said, and it has to be the same fact on every screen and
              survive a reload - which the socket's roster is not for.
            */}
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {battle.participants.map((player) => (
                <li
                  key={player.userId}
                  className={`rounded-full px-2.5 py-1 ${
                    player.ready
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : 'bg-surface-raised text-ink-muted'
                  }`}
                >
                  <span aria-hidden className="mr-1">
                    {player.ready ? '✓' : '○'}
                  </span>
                  {player.userId === me.id ? t.you : player.name}
                  {player.side && (
                    <span className="ml-1 text-ink-muted/70">{player.side}</span>
                  )}
                </li>
              ))}
              {battle.participants.length === 0 && (
                <li className="text-ink-muted">{t.nobodySeated}</li>
              )}
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/*
                Pick a side, where the mode has them.

                `sidesFor` rather than a list written out here, so a sixth mode
                cannot be forgotten - and one button per side rather than a
                picker and a Join, because two clicks to answer one question is
                one click too many for a control sitting over a running game.
              */}
              {/*
                And no side buttons at all when the level seats people itself -
                see `levelSeats`. Two buttons for a four-chair board is the
                worst of the three answers: it looks like the whole choice,
                decides half of it, and leaves two colours unreachable.
              */}
              {/*
                One button per action, each with the number that presses it.

                The number is drawn *on* the button rather than explained in the
                line below, which is the same decision the level's own controls
                card makes: a key somebody has to read a sentence to learn is a
                key they learn once and then forget. See `lobbyActions` for why
                the badge and the keystroke come from one list.
              */}
              {lobbyActions.map((action, index) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  {...(action.pressed === undefined ? {} : { 'aria-pressed': action.pressed })}
                  onClick={action.run}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}
                >
                  {/*
                    The number, only where there is a keyboard to press it on.

                    A phone has no pointer to lock, so nothing there was ever
                    stuck behind Escape - the button was always just a button,
                    and printing a key beside it would be printing a control the
                    device does not have. This badge is for the screen where the
                    mouse has been taken away by the level.
                  */}
                  {!isTouch && (
                    <span
                      aria-hidden
                      className="grid min-w-4 place-items-center rounded border border-current px-1 py-0.5 font-mono text-[10px] leading-none opacity-60"
                    >
                      {index + 1}
                    </span>
                  )}
                  {action.label}
                </button>
              ))}
            </div>

            {/*
              Why the buttons above cannot be pressed, when they cannot.

              Above the general hint rather than below it: "this match is full"
              answers the question somebody is actually asking, and "two people
              have to be at the line" is advice for a match they cannot get
              into.
            */}
            {lobbyNotes.map((note) => (
              <p key={note} className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
                {note}
              </p>
            ))}

            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              {readyHere.length < needed
                ? fill(t.needAtLine, {
                    n: needed,
                    tag:
                      needed > MIN_PLAYERS
                        ? fill(t.builtFor, { name: xp.name, n: needed })
                        : '',
                  })
                : isHost
                  ? t.everybodyReady
                  : t.everybodyReadyHost}
            </p>
          </div>
        </div>
      )}

      {/*
        Somebody has gone, and the room is being told.

        ---------------------------------------------------------------------
        Why this is not a pause
        ---------------------------------------------------------------------
        It sits over the match rather than stopping it, and only the card takes
        the pointer. Freezing everybody would mean one flaky connection - the
        one thing this panel exists to notice - could stop four other people
        playing, and a "pause" that half the room is not in is worse than none.
        So the level keeps running underneath, and what this adds is the answer
        to "is this broken, or is Ana just gone".

        Top rather than centred: the thing it is about is happening on the
        screen behind it, and a card in the middle of a board game covers the
        board.
      */}
      {waitingFor.length > 0 && away && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-amber-400/40 bg-surface/95 p-4 text-center backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/80">
              {away.overdue ? t.stillNotBack : t.holdOn}
            </p>

            <p className="mt-2 text-sm text-ink">
              {fill(waitingFor.length === 1 ? t.hasDropped : t.haveDropped, {
                names: waitingFor.map((player) => player.name).join(', '),
              })}
            </p>

            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              {away.overdue
                ? (waitingFor.length === 1 ? t.theirSeatIs : t.theirSeatsAre) + t.seatsHeld
                : fill(waitingFor.length === 1 ? t.holdingOne : t.holdingMany, {
                    n: away.left,
                  })}
            </p>

            {/*
              A choice only once there is one to make. Two buttons under a
              countdown would be read as "press one of these to skip the wait",
              which is not what either of them does.
            */}
            {away.overdue && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => playOn(waitingFor)}
                  className="rounded-full border border-line/60 px-4 py-1.5 text-xs text-ink-muted transition hover:border-line hover:text-ink disabled:opacity-50"
                >
                  {t.playOn}
                </button>

                {(isHost || staff) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={goRestart}
                    className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-medium text-black transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    {pending ? t.restarting : t.restartMatch}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        And the other way it ends: they came back.

        Its own line rather than the panel changing its words, because the panel
        is gone by the time this is true - and a room that just stops waiting
        cannot tell "they are back" from "whatever was watching gave up".
      */}
      {returned.length > 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200">
          {fill(returned.length === 1 ? t.isBack : t.areBack, {
            names:
              battle.participants
                .filter((player) => returned.includes(player.userId))
                .map((player) => player.name)
                .join(', ') || t.somebody,
          })}
        </p>
      )}

      {/*
        The result, and going again.

        The same panel `BattleRoom` shows, minus the scoreline: an XP reports no
        score, so there is nothing to print and inventing a nil-nil would be
        saying something the match does not know.
      */}
      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md rounded-3xl border border-line/60 bg-surface/95 px-8 py-6 text-center backdrop-blur-sm">
            <p className="text-2xl font-medium">
              {battle.status !== 'cancelled'
                ? t.matchOver
                : battle.rematchBattleId
                  ? t.startingAgain
                  : t.calledOff}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {/*
                A restarted match is cancelled with somewhere to go, and the
                effect above is already walking everybody there. This is the
                beat before the page moves, and saying "called off" through it
                would read as the match having been taken away.
              */}
              {battle.status === 'cancelled' && battle.rematchBattleId
                ? t.linedUpAgain
                : battle.abandoned
                  ? t.nobodyCameBack
                  : t.noScoreOut}
            </p>

            {battle.status === 'ended' && joined && (
              <div className="mt-5 border-t border-line/50 pt-4">
                {battle.rematchBattleId ? (
                  /*
                    A door rather than a vote, once somebody has made it. The
                    rematch keeps this level and these rules - see
                    `startRematch`, which used to drop both.
                  */
                  <Link
                    href={`/t/${slug}/battle/${battle.rematchBattleId}`}
                    className="inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-300"
                  >
                    {t.rematchOn}
                  </Link>
                ) : (
                  <>
                    <p className="text-xs text-ink-muted">
                      {rematchers.length === 0
                        ? t.nobodyAskedRematch
                        : fill(
                            rematchers.length === 1 ? t.wantsAnotherGo : t.wantAnotherGo,
                            { names: rematchers.map((p) => p.name).join(', ') },
                          )}
                    </p>

                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      {!iWantRematch && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => wantRematch(slug, battle.id))}
                          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 disabled:opacity-50"
                        >
                          {t.playAgain}
                        </button>
                      )}

                      {/*
                        Startable by anybody who opted in, not just the host -
                        whoever set the match up may have lost and left, and a
                        rematch only they could call is one that usually cannot
                        be called. The decider enforces the same rule.
                      */}
                      {iWantRematch && rematchers.length >= MIN_PLAYERS && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={goRematch}
                          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-300 disabled:opacity-50"
                        >
                          {t.startRematch}
                        </button>
                      )}

                      {iWantRematch && rematchers.length < MIN_PLAYERS && (
                        <p className="self-center text-xs text-ink-muted">
                          {t.waitingForOneMore}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <Link
              href={`/t/${slug}/battle`}
              className="mt-6 inline-block text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {t.backToLobby}
            </Link>
          </div>
        </div>
      )}

      {/*
        A failed action, where somebody will see it.

        The lounge has been bitten by this twice - a race result silently lost, a
        mode error rendered inside a panel that closes at kickoff. A Join that
        does nothing and says nothing is the same bug with a smaller blast
        radius.

        ---------------------------------------------------------------------
        And a third time, by a stacking context
        ---------------------------------------------------------------------
        It was bitten again the moment a *framed* XP could be mounted here. A
        cartridge draws its own full-size overlays - a lobby, a paused-tab
        notice - and those carry `z-20` and `z-30`, while this had no `z` at
        all. Same stacking context, so the alert painted underneath the game:
        rendered, correct, in the DOM, and invisible.

        Which is worth more than the fix, because of what it looked like from
        outside: a guest pressing *Join red*, being refused for a real reason,
        and seeing nothing happen at all.
      */}
      {error && (
        <p
          role="alert"
          className="pointer-events-none absolute inset-x-0 top-20 z-40 mx-auto w-fit rounded-lg bg-rose-950/85 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </p>
      )}

      {/* Said out loud rather than discovered: somebody who was not told will
          wait for a result that is not coming. */}
      {battle.status === 'live' && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit font-mono text-[10px] text-amber-400/60">
          no score comes back out of an XP yet
        </p>
      )}
    </main>
  )
}
