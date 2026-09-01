'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { OPEN_RAIL } from '@/app/t/[slug]/open-rail'
import { signOut } from '@/app/(auth)/actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict, type RailDict } from '@/app/i18n/rail'
import { GuestExit } from '@/app/t/[slug]/guest-exit'
import { ContactWidget } from '@/app/components/contact-widget'
import { TourWidget } from '@/app/components/tour-widget'
import Logo from '@/app/components/logo'
import { ChatDock } from '@/app/t/[slug]/chat-dock'
import { SummonDock } from '@/app/t/[slug]/summon-dock'
import type { ChatLine } from '@/app/t/[slug]/chat-panel'
import { Band, Face } from '@/app/t/[slug]/rail-bits'
import { Icon, type IconName } from '@/app/t/[slug]/rail-icons'
import { RadioDock } from '@/app/t/[slug]/radio-dock'
import { MatchBlock } from '@/app/t/[slug]/match-block'
import { RailTabs } from '@/app/t/[slug]/rail-tabs'
import type { NowPlaying } from '@/domain/radio/queries'
import type { RoomView } from '@/domain/rooms/queries'
import { doorActions, useDoor } from '@/app/world/_stores/door-store'
import { useCurrentMatch } from '@/app/t/[slug]/match-store'
import { useHere } from '@/app/world/_stores/here-store'
import type { EventSurface } from '@/domain/events/presets'
import type { GuestLinkView, GuestView } from '@/domain/guests/queries'
import { attempt } from '@/app/components/connection'
import { createRoom } from '@/domain/rooms/actions'
import { pinRoomForMe } from '@/domain/rooms/mark-actions'
import { orderPlaces, PIN_PENDING, type RoomMarks } from '@/domain/rooms/places'
import { RoomGlyph, tintClass } from '@/app/t/[slug]/room-icons'
import { hrefFor } from '@kxb/peepz-world/places'
import { type Tier, tierAtLeast } from '@/domain/billing/tiers'
import type { TenantRoleName } from '@/lib/supabase/types'
import { useRefusal } from '@/app/i18n/use-refusal'


/**
 * The workspace rail.
 *
 * Replaces the row of links that used to run across the top of every workspace
 * page, and absorbs the travel bar that used to float inside the 3D scenes.
 * Both were solving the same problem from opposite ends - "where can I go" -
 * and having two answers meant the lounge appeared in two places at once,
 * neither of which knew about the other.
 *
 * A floating panel rather than a column bolted to the edge: the sky and its
 * shooting stars run behind it on all four sides, the same way the hero's glass
 * panels float over the landing page. `.rail-panel` in globals.css is that
 * look, and it is deliberately the same look.
 *
 * Three widths, because the content splits differently at each:
 *
 *   phone   - one panel, slid in from the left by the floating button. A
 *             permanent rail on a 390px screen would eat a third of the
 *             viewport, and the surfaces that most need this navigation are
 *             the ones that want the whole screen.
 *   tablet  - the same single panel, permanently open on the left. Everything
 *             is in it: where you can go, and who is there.
 *   laptop  - the people move out to their own panel on the right. At 13" there
 *             is width to spare either side of the content but not enough
 *             height for one column to hold navigation *and* a roster without
 *             the roster falling off the bottom - and "where do I go" and "who
 *             is around" are two different questions anyway.
 */

export interface SidebarFeatures {
  pages: boolean
  tasks: boolean
  lounge: boolean
  cafe: boolean
  battle: boolean
  worlds: boolean
  scenes: boolean
  /**
   * Does this space have the XP suite?
   *
   * Not a flag — the tier, resolved in the layout. It is here rather than being
   * read from a context because the rail is a client component, and it changes
   * exactly one thing: whether the world catalogue entry is the catalogue or the
   * library that has it as a section.
   */
  xp: boolean
  /**
   * Is the skin shop open?
   *
   * The platform flag, resolved in the layout like the rest. It decides one
   * thing here: whether the avatar rail offers the door to `/skins` at all -
   * a link to a closed shop is the "notice pointing at a picture nobody can
   * see" the scenes flag warns about.
   */
  skinShop: boolean
  /**
   * Does this space have the thingiverse?
   *
   * The platform flag *and* the tier, resolved together in the layout - a shelf
   * of blueprints is world-building, which is what the xo tier is. One boolean
   * here rather than two, because the rail has only one thing to decide with
   * it: whether the tab exists.
   */
  thingiverse: boolean
  /**
   * Does running cost anything here?
   *
   * The space's own switch rather than a flag - see the `stamina` capability -
   * and it reaches the rail because that is where an owner flips it, standing
   * in the room it changes.
   */
  stamina: boolean
}

/**
 * The surfaces an event guest is allowed to reach, resolved on the server.
 *
 * Empty for everybody who is not a guest at an open event - a member's rail is
 * decided by flags and role as it always was, and this list never narrows it.
 *
 * Resolved rather than passed raw because the answer depends on the event's
 * phase as well as its settings: `guestCanReach` refuses everything while an
 * event is still upcoming, and that rule should not be re-implemented in a
 * client component where it could drift.
 */
export type GuestSurfaces = EventSurface[]

/**
 * Everything the guest-links section of the rail needs, or null when the
 * viewer has no business seeing it.
 *
 * Built on the server and passed down whole rather than fetched here, because
 * the rail is a client component and the links are secrets that only an owner
 * or admin may read - the decision about whether to build this object *is* the
 * access check, and null is the answer for everybody else.
 */
export interface SidebarGuestAccess {
  /** Passed in so a copied URL matches the deployment rather than the browser. */
  origin: string
  links: GuestLinkView[]
  /**
   * The guests inside right now, by name, across every link.
   *
   * The list rather than a count, because revoking a link is too blunt an
   * instrument to be the only one: a link that let four people in is the way
   * three of them are still happily in the room. Naming them is what makes
   * showing one person the door possible.
   */
  guests: GuestView[]
  capacity: number | null
}

/**
 * Everything the chat needs, or null when this space has none.
 *
 * Built in the layout rather than in the lounge page, and that move is the
 * point of it: `<ChatDock>` has to be the one thing mounted for the whole
 * workspace session, not a tenant of any one scene, or the conversation would
 * end every time somebody walked out of the lounge. Null covers the two ways
 * there can be nothing here - the `chat` feature flag is off, or this space has
 * not turned it on for itself - in one prop, the same way `guestAccess` folds
 * its own access check into presence or absence.
 */
export interface SidebarChatAccess {
  tenantId: string
  userId: string
  initialMessages: ChatLine[]
  /** Null when the viewer may post. A sentence explaining why not, otherwise. */
  blockedReason: string | null
}

/**
 * Everything the radio needs, or null when this space has none.
 *
 * Built in the layout for the same reason `SidebarChatAccess` is, and with one
 * more argument behind it: `<RadioDock>` owns an iframe that plays audio, so it
 * has to be mounted exactly once and has to outlive every scene. Mounting it in
 * a page would restart the track on every navigation between two rooms, which
 * is precisely what background audio must never do.
 *
 * Null means the `radio` flag is off. Unlike chat there is no second per-space
 * switch to fold in here - see the note on the flag.
 */
export interface SidebarRadioAccess {
  tenantId: string
  /** What is on right now, so the first render is already in the right place. */
  nowPlaying: NowPlaying | null
  /** Whether this viewer may work the controls. Re-checked server-side anyway. */
  canControl: boolean
}

export function Sidebar(props: {
  slug: string
  tenantName: string
  archived: boolean
  features: SidebarFeatures
  username: string
  email: string
  role: TenantRoleName
  /**
   * What this space is on, shown beside the role.
   *
   * The tier and the role answer the two halves of "what am I allowed to do
   * here" - one is what the space bought, the other is what you are in it - and
   * until now only the second was on screen. Somebody hitting a cap had no way
   * to see which plan produced it without opening billing.
   *
   * A comped space reads `xp`, which is correct rather than a leak: the
   * `billing` flag resolves to the top tier where the context is built, so what
   * this prints is genuinely what the space has.
   */
  tier: Tier
  /** What this event lets its guests reach. Empty for everybody else. */
  guestSurfaces: GuestSurfaces
  /** Guest links, for an owner or admin. Null for everybody else. */
  guestAccess: SidebarGuestAccess | null
  /**
   * The rooms this person can see, listed under the places and managed from
   * the Room tab. Read in the layout so both copies of the rail get the same
   * list without either fetching.
   */
  rooms: RoomView[]
  /**
   * This person's own pins and last visits, keyed by room id.
   *
   * Read in the layout beside the rooms, for the same reason and in the same
   * breath: both copies of the rail draw the same ordering, and two components
   * asking for one person's preferences would be two round trips to sort one
   * list. Empty is a complete answer - the band then draws the space's pins,
   * the groups and creation order.
   */
  marks: RoomMarks
  /**
   * Levels this space keeps standing, listed as places rather than as matches.
   *
   * Empty when the space cannot play one at all - see `canPlayXp`, which is the
   * same pair of gates.
   */
  /** Whether they may open, hide and close one. */
  canManageRooms: boolean
  /**
   * May somebody open an XP from the Play tab, here and now?
   *
   * `xpOpen` and the battle flag, resolved in the layout. Separate from
   * `features.xp` above, which is the tier alone and answers a different
   * question - what the world catalogue entry is called. Conflating the two
   * would put a Play tab in front of every xp space whose flag is off.
   */
  canPlayXp: boolean
  /** Which animal this account is, for the rail's picker. See `AvatarRail`. */
  avatar: string
  /** Whether that animal is an override for this space only. */
  hereOnly: boolean
  /** Null when this space has no chat. Read by a guest, written by everyone else. */
  chat: SidebarChatAccess | null
  /** Null when the radio flag is off. Heard by a guest, worked by owners and admins. */
  radio: SidebarRadioAccess | null
}) {
  const pathname = usePathname()

  /**
   * Which page the drawer was opened on, rather than a plain "is it open".
   *
   * A drawer that survived the navigation it just caused would cover the page
   * it opened. Deriving openness from the path closes it on any navigation -
   * including the browser's own back button - without an effect that watches
   * the path and calls a setter, which is a render the router has already
   * scheduled being scheduled a second time.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null)

  /**
   * Folding the rail away, with no React state behind it.
   *
   * Deliberate, and the third design this went through. The rail is a client
   * component and the shell that pads itself around it is a *server* one, so
   * the fold has to reach the stylesheet either way - and once an attribute on
   * `<html>` is doing that, mirroring it into state buys nothing and costs the
   * two things state costs here:
   *
   *   - reading the stored preference on mount is a `setState` in an effect,
   *     which is a cascading render and which the lint rule is right about;
   *   - and rendering from it means the server's HTML and the client's first
   *     pass can disagree, which is a hydration mismatch on every page for
   *     anybody who had ever folded it.
   *
   * So both controls are always in the DOM and CSS decides which is visible -
   * see `.rail-unfold` in globals.css. The cost is honest: the fold lasts as
   * long as the layout is mounted, which is every navigation inside the space
   * but not a reload. Persisting it wants a boot script in the root layout,
   * which is the standard fix and a bigger change than this is worth today.
   */
  const t = railDict(useLocale())

  /**
   * Who is in the room, for the count on the switch below.
   *
   * Read here as well as inside `<People>`, which is not a duplicate source of
   * truth: both read the one store, and the number on the way in is a different
   * question from the list you get when you arrive.
   */
  const here = useHere()

  /**
   * Which half of the folded panel is showing.
   *
   * Only meaningful below `xl`, where the two rails have become one - above it
   * both halves are on screen and nothing reads this. Not persisted, like the
   * fold above it: coming back to a space should show you where you can go,
   * which is the half somebody arrives wanting.
   */
  const [showingPeople, setShowingPeople] = useState(false)

  const fold = (closed: boolean) => {
    const root = document.documentElement
    if (closed) root.dataset.railLeft = 'closed'
    else delete root.dataset.railLeft
  }
  const open = openedAt === pathname
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null)

  const panel = useRef<HTMLElement | null>(null)

  /**
   * A page asking for the drawer - see ./open-rail.
   *
   * Re-bound on every path change rather than closing over `setOpen`, for the
   * reason the Escape handler below gives: the helper is rebuilt every render.
   */
  useEffect(() => {
    const onAsk = () => setOpenedAt(pathname)
    document.addEventListener(OPEN_RAIL, onAsk)
    return () => document.removeEventListener(OPEN_RAIL, onAsk)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    // `setOpenedAt` rather than the `setOpen` helper above: the helper closes
    // over `pathname` and is rebuilt every render, which would re-bind this
    // listener on every one of them.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenedAt(null)
    }

    /**
     * And a tap anywhere but the drawer closes it.
     *
     * There is already a dimmed backdrop that does this, and it is kept: it is
     * what *says* the page behind is not the thing you are looking at. What it
     * cannot promise is being the thing your finger actually lands on - it is
     * one fixed element among the several a route may stack over it, and on the
     * XP page the report was exactly that: the drawer opened and only the ×
     * would close it.
     *
     * Asked of the document instead, so the answer does not depend on what is
     * painted where. `contains` on the panel is the whole rule - a tap inside
     * the drawer is somebody using it, and everything else is somebody
     * finished with it. In the capture phase, so a control on the page that
     * stops the event from bubbling cannot leave the drawer open behind it.
     *
     * `pointerdown` rather than `click`: a tap that starts outside and ends on
     * something that moved under it is still a tap outside, and closing on the
     * way down is what every drawer on a phone does.
     */
    const onDown = (event: PointerEvent) => {
      const node = panel.current
      const at = event.target
      if (!node || !(at instanceof Node)) return
      if (!node.contains(at)) setOpenedAt(null)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  return (
    <>
      {/*
        The phone's way in: a tab on the left edge, the same lash the rail folds
        down to on a wider screen.

        On a phone the rail is a drawer that slides in from the left, so the
        handle that opens it belongs on that same edge rather than floating in a
        corner - and it reads as one idea with the fold tab below, which is
        literally the same tab from `md` up. It replaces the round menu button
        that used to sit bottom-left: two shapes for "open the navigation" on the
        one edge it comes from was one too many.

        Only while the drawer is shut. Open, the way out is the drawer's own
        close - the X in its header, a tap on the dimmed page behind it, or
        Escape - so the tab has nothing left to do and is not drawn over the
        panel it opened. `md:hidden` because from `md` up the rail is permanent
        and its own `.rail-unfold` tab owns this edge instead.
      */}
      {/*
        Sized and placed for a thumb, which the `md` version of this tab is not.

        Two differences from the fold tab below, and both are the phone:

          * **Lower than the middle.** Halfway up is the hardest part of a phone
            screen to reach one-handed - the thumb arcs from the bottom corner -
            so it sits at 62%, inside that arc and still clear of anything
            docked along the bottom edge.
          * **A target rather than a hint.** The `md` tab is deliberately thin
            because a mouse can hit a 23px sliver and the rail it belongs to is
            already on screen. Here it is the *only* way to the navigation, so
            it is 35x60 around an 18px glyph - half again as wide as the mouse
            version, and still narrow enough to read as an edge rather than as a
            button parked on the page.

        The classes are unconditional because the element is `md:hidden` - the
        wider screens get the tab below, which is unchanged.
      */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.openNav}
          aria-expanded={false}
          className="rail-drawer-tab fixed top-[62%] left-0 z-[55] -translate-y-1/2 rounded-r-2xl border border-l-0 border-line bg-surface-raised/90 py-5 pr-2.5 pl-1.5 text-ink-muted shadow-lg backdrop-blur transition hover:border-accent hover:text-accent active:bg-surface md:hidden [&>svg]:h-[18px] [&>svg]:w-[18px]"
        >
          <Icon name="unfold" />
        </button>
      )}

      {/*
        The way back, and the only thing left on screen when the rail is folded.
        Pinned to the edge it came from, thin enough to be a hint rather than a
        control competing with the page, and only on the screens that can fold.
      */}
      <button
        type="button"
        onClick={() => fold(false)}
        aria-label={t.bringBack}
        className="rail-unfold fixed top-1/2 left-0 z-[55] -translate-y-1/2 rounded-r-xl border border-l-0 border-line bg-surface-raised/90 py-4 pr-1 pl-0.5 text-ink-muted backdrop-blur transition hover:border-accent hover:text-accent"
      >
        <Icon name="unfold" />
      </button>

      {/* Tap-anywhere-else to dismiss. Only exists while the drawer is open, so
          it can never swallow a click on the page underneath. */}
      {open && (
        <button
          type="button"
          aria-label={t.closeNav}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/*
        The conversation, mounted once and drawing nothing.

        Outside both panels on purpose. It is the single Realtime subscriber -
        two would be a bug `said-store` explains at length - while the panel it
        feeds appears in whichever rail is on screen. Putting it in either
        `<aside>` would tie the subscription to a breakpoint.
      */}
      {props.chat && (
        <ChatDock
          slug={props.slug}
          tenantId={props.chat.tenantId}
          userId={props.chat.userId}
          initialMessages={props.chat.initialMessages}
          blockedReason={props.chat.blockedReason}
          /**
           * The same list the Room tab draws, so the two cannot disagree about
           * which rooms exist. Read once in the layout and handed to both.
           */
          rooms={props.rooms.map((room) => ({ roomId: room.roomId, name: room.name }))}
        />
      )}

      {/*
        The summons, mounted once for the same reason the chat is: the
        interception has to reach somebody whether or not any rail is open.
        Beside the dock rather than inside it because they share nothing but a
        bell - see summon-store. Gated on `chat` because `/battle` is typed
        into it: a space with the conversation off has no composer to type the
        command in, and a topic nobody can ring needs no listener.
      */}
      {props.chat && (
        <SummonDock
          slug={props.slug}
          tenantId={props.chat.tenantId}
          userId={props.chat.userId}
        />
      )}

      {/*
        The radio, mounted once and drawing nothing.

        Outside both panels for the same reason the chat dock is, and with more
        riding on it: this one owns the player. Two of these would be two
        SoundCloud frames a few hundred milliseconds apart, which is not a
        louder radio - it is a flanger.
      */}
      {props.radio && (
        <RadioDock
          slug={props.slug}
          tenantId={props.radio.tenantId}
          initialNowPlaying={props.radio.nowPlaying}
          canControl={props.radio.canControl}
        />
      )}

      {/* Where it sits is `.rail-panel` in globals.css - see the note there
          about why the geometry is not utility classes. Slid out by its own
          width *plus* the gap, so the glow along its edge goes with it. */}
      <aside
        ref={panel}
        className={`rail-panel rail-panel-left z-50 backdrop-blur-xl transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-snap)] md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-[calc(100%+var(--rail-gap))]'
        }`}
      >
        {/*
          Three blocks, and only the middle one moves.

          It used to be one scroller holding everything, which meant the two
          things that answer "where am I and who am I" - the space's name at the
          top and your own account at the foot - scrolled away with the rows
          between them. On a space with enough rooms the account row was simply
          off the bottom, which is how you end up with a sign-out you cannot
          reach.

          So the column itself does not scroll: the brand takes the height it
          needs, the account takes the height *it* needs, and the navigation in
          between gets whatever is left and scrolls inside it. `min-h-0` on that
          middle box is what lets it be shorter than its own content - without
          it a flex child refuses to shrink and pushes the account out of the
          panel again.

          The bottom padding is even top and bottom now that nothing floats over
          the account row - the round menu button that used to sit in this
          corner, and that the phone's extra `pb-16` was leaving clear, is gone.
          The way in is a tab on the edge instead. See above.
        */}
        <div className="flex h-full flex-col px-3 pb-4 pt-5">
          <div className="shrink-0">
            <Brand {...props} onClose={() => setOpen(false)} />
          </div>

          {/* Fold, on the screens where the rail is permanent. A phone has the
              drawer's own close and does not want a second one. */}
          <button
            type="button"
            onClick={() => fold(true)}
            aria-label={t.foldAway}
            className="mt-3 hidden shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line/60 px-2 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink md:flex"
          >
            <Icon name="fold" />
            {t.foldAwayLabel}
          </button>

          {/* The navigation box. Every child is `shrink-0`: without it a flex
              column silently squashes its items to fit instead of overflowing,
              and a squashed item whose own contents have a fixed height spills
              out of its box and over the next one. */}
          {/*
            The two halves of this panel, as one switch.
            ---------------------------------------------------------------
            From a laptop up there are two panels: where to go on the left,
            who is here and what you can do on the right. Below that there is
            one, and the right-hand half used to be *appended* to it - so
            reaching the chat, or the shelf, or the room's switches meant
            scrolling past the whole of the navigation every time.

            A switch rather than a disclosure that pushes: opening one half
            hides the other, so neither ever has to be scrolled past to reach
            the other. It is the same move the account menu at the foot of this
            panel makes - a control that swaps what the panel is showing - and
            it is drawn only below `xl`, because above it both halves are
            already on screen and a switch between two visible things is a
            control with nothing to do.
          */}
          <div className="mt-4 shrink-0 xl:hidden">
            <button
              type="button"
              onClick={() => setShowingPeople((current) => !current)}
              aria-expanded={showingPeople}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-line/60 px-3 py-2 text-left transition hover:border-accent/60 hover:bg-surface-raised"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                {showingPeople ? t.bands.backToPlaces : t.bands.peopleTools}
              </span>
              {/*
                How many people are in here, on the way *in* only. It is the one
                thing somebody wants to know before deciding to look, and on the
                way back the panel they are returning to has nothing to count.
              */}
              <span className="font-mono text-[10px] text-ink-muted">
                {showingPeople ? '←' : here.people.length + 1}
              </span>
            </button>
          </div>

          <div className="rail-scroll mt-5 flex min-h-0 flex-1 flex-col gap-5">
            <div className={showingPeople ? 'hidden xl:block' : 'shrink-0'}>
              <Surfaces {...props} />
            </div>
            {/* Above everything, and not behind a tab. While a match is on,
                "what am I in and how do I get out" is the most urgent thing
                this panel answers, and the one control left over the level is
                the button that opens it. Draws nothing when there is no
                match.

                `xl:hidden` for the same reason the roster below it is: from a
                laptop up there is a right-hand panel and this lives there, so
                without it both copies draw at once and the match card appears
                twice on one screen. Below `xl` there is no right-hand panel, so
                this is the only copy and must stay. */}
            <div className={showingPeople ? 'hidden' : 'shrink-0 xl:hidden'}>
              <MatchBlock />
            </div>
            <div className={showingPeople ? 'hidden xl:block' : 'shrink-0'}>
              <Places {...props} />
            </div>
            {/* On a laptop these have their own panel across the page. Rendered
                in both, hidden in one, because the two copies read the same
                store and neither is the source of truth. */}
            {/*
              The right-hand half, when the switch above has asked for it.

              `flex-1` rather than `shrink-0` now: it is the whole of the panel
              while it is showing, so the tabs below take the height and scroll
              inside themselves instead of lengthening a column - which is the
              scrolling this switch exists to remove.
            */}
            <div
              className={`flex min-h-0 flex-col gap-5 xl:hidden ${
                showingPeople ? 'flex-1' : 'hidden'
              }`}
            >
              <People {...props} />
              {/* Folded away above `xl` exactly like the roster, and beside it
                  for the same reason: on a laptop the tools belong with the
                  people they are about, in the right-hand panel. Below `xl`
                  there is no right-hand panel, so they come back here - at a
                  fixed height, because here they are inside a scrolling column
                  rather than sharing one. */}
              <RailTabs
                slug={props.slug}
                role={props.role}
                guestAccess={props.guestAccess}
                hasChat={props.chat !== null}
                hasThings={props.features.thingiverse}
                stamina={props.features.stamina}
                hasPlay={props.canPlayXp}
                hasRadio={props.radio !== null}
                rooms={props.rooms}
                canManageRooms={props.canManageRooms}
                avatar={props.avatar}
                hereOnly={props.hereOnly}
                hasSkinShop={props.features.skinShop}
                /*
                  Filling, now that this half *is* the panel when it is on
                  screen. It was false when these sat at the bottom of one
                  scrolling column and `flex-1` inside a scroller resolves
                  against nothing.
                */
                fill
              />
            </div>
          </div>

          <Account {...props} />
        </div>
      </aside>

      {/*
        The people, on the other side.

        Only from `xl` - a 13" laptop and up. Narrower than that and the page
        between two panels is not worth reading, so the roster folds back into
        the left one.
      */}
      <aside className="rail-panel rail-panel-right z-40 hidden backdrop-blur-xl xl:block">
        {/*
          Two parts, and the split is the whole layout: the roster is always on
          screen because "who is around" is the question this panel exists to
          answer, and everything you might *do* is in the tabs below it, which
          take whatever height is left.

          The roster gets its own scroller and a ceiling. A full room used to
          push the chat and the guest links off the bottom of a panel that could
          not scroll; capping it at two fifths means a busy afternoon scrolls
          inside the list instead of eating the rest of the rail.
        */}
        {/*
          The column scrolls, which it did not.

          `.rail-panel` is `overflow: hidden` so its rounded corners clip, and
          this column inside it was `h-full` with no scroller - so three blocks
          that together wanted more than the panel had were squeezed rather
          than scrolled, and the chat is the one that gives. `rail-scroll` is
          the same pair the roster already uses: `min-height: 0` so a flex child
          may shrink below its content, and `overscroll-contain` so reaching the
          end does not start scrolling the page behind it.
        */}
        <div className="rail-scroll flex h-full flex-col gap-4 px-3 py-5">
          {/* Same reasoning as the drawer copy, and rendered in both for the
              same reason the roster is: neither panel is the source of truth,
              they read the same store. */}
          <div className="shrink-0">
            <MatchBlock />
          </div>
          <div className="rail-scroll max-h-[40%] shrink-0">
            <People {...props} />
          </div>

          {/*
            Chat, the door, and the guests, one at a time.

            `guestAccess` is only built for owners and admins, so the Visitors
            tab knows to explain itself rather than being a hidden element -
            answering a door somebody was already sent to is not an
            administrative act, and every member may do it. See KnockRail.
          */}
          <RailTabs
            slug={props.slug}
            role={props.role}
            guestAccess={props.guestAccess}
            hasChat={props.chat !== null}
            hasThings={props.features.thingiverse}
            stamina={props.features.stamina}
            hasPlay={props.canPlayXp}
            hasRadio={props.radio !== null}
            rooms={props.rooms}
            canManageRooms={props.canManageRooms}
            avatar={props.avatar}
            hereOnly={props.hereOnly}
            hasSkinShop={props.features.skinShop}
            fill
          />
        </div>
      </aside>
    </>
  )
}

function Brand({
  slug,
  tenantName,
  archived,
  onClose,
}: {
  slug: string
  tenantName: string
  archived: boolean
  onClose: () => void
}) {
  const t = railDict(useLocale())

  return (
    <div className="flex items-start justify-between gap-2 px-2">
      <Link href={`/t/${slug}`} className="flex min-w-0 items-center gap-2">
        <Logo />
        <span className="min-w-0">
          <span className="block font-pixel uppercase truncate text-m font-semibold tracking-tight">
            {tenantName}
          </span>
          {archived && (
            <span className="text-[11px] text-ink-muted">{t.archived}</span>
          )}
        </span>
      </Link>

      <button
        type="button"
        onClick={onClose}
        aria-label={t.closeNav}
        className="-mr-1 rounded-lg p-1 text-ink-muted transition hover:text-ink md:hidden"
      >
        <Icon name="close" />
      </button>
    </div>
  )
}

/**
 * One row of the rail.
 *
 * The appearance is `.rail-link` in globals.css, keyed off `aria-current` for
 * the same reason `.nav-link` is: the state a screen reader is told and the
 * state the eye is shown are one attribute and cannot drift apart.
 */
function Row({
  href,
  active,
  icon,
  children,
  meta,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
  /** Trailing note - a count, a door, "here". */
  meta?: React.ReactNode
}) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className="rail-link">
      <span aria-hidden className="rail-link-icon">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta}
    </Link>
  )
}

/** The pages of the app, as opposed to the places in it. */
/**
 * Is this a specific match, as opposed to the battle lobby?
 *
 * `/t/acme/battle` is the list of matches and is a surface like any other;
 * `/t/acme/battle/<id>` is one match in progress. A guest is only ever in the
 * second, and while they are, it is the only place they should be able to go.
 */
function inMatch(pathname: string, slug: string): boolean {
  return pathname.startsWith(`/t/${slug}/battle/`)
}

function Surfaces({
  slug,
  features,
  tier,
  role,
  guestSurfaces,
}: {
  slug: string
  features: SidebarFeatures
  tier: Tier
  role: TenantRoleName
  guestSurfaces: GuestSurfaces
}) {
  const pathname = usePathname()
  const t = railDict(useLocale())


  /**
   * A guest's rail is whatever the event opened, and nothing by default.
   *
   * Outside an event that is still none of it: the dashboard, pages and tasks
   * are the workspace, a guest on a link was let in to be in a *room*, and
   * those pages refuse them - so a rail of links to 404s would be a menu of
   * disappointments.
   *
   * An event is the case that changes it. The host has said, surface by
   * surface, what the people they invited may reach, and until now the rail
   * ignored that and showed them nothing - so a hackathon could open the
   * pinboard and its guests had no way to get there but a typed URL. The rows
   * below are exactly `guestSurfaces`, which the server resolved through
   * `guestCanReach`, so the rail can only ever agree with what the routes
   * already enforce.
   *
   * A match in progress still takes over completely - see below.
   */
  if (role === 'guest') {
    if (inMatch(pathname, slug)) {
      return (
        <nav aria-label={t.bands.main}>
          <Band>{t.bands.match}</Band>
          {/* The match they are in, and nothing else. No link back to the
              lounge: leaving mid-match is a decision the match itself owns -
              there is a Forfeit button for it - and a rail link that quietly
              counts as a defeat would be a trap. */}
          <Row href={pathname} active icon={<Icon name="battle" />}>
            {t.surfaces.inMatch}
          </Row>
        </nav>
      )
    }

    /**
     * Both gates, not either.
     *
     * A surface the host opened is still nothing without the flag that builds
     * it - `requireFeature` runs on those routes too - and the rail claiming
     * otherwise would send a guest to a page that refuses them for a reason
     * they cannot see or fix.
     *
     * `lounge` and `rooms` are absent on purpose: they are the Places band's,
     * and listing them here would give a guest the same door twice.
     */
    const guestRows: { href: string; label: string; icon: IconName; show: boolean }[] = [
      {
        // The board lives at the workspace root - "board" is the pinboard and
        // the overview both, which is why one surface lights one row.
        href: `/t/${slug}`,
        label: t.surfaces.board,
        icon: 'dashboard',
        show: guestSurfaces.includes('board'),
      },
      {
        href: `/t/${slug}/pages`,
        label: t.surfaces.pages,
        icon: 'pages',
        show: guestSurfaces.includes('pages') && features.pages,
      },
      {
        href: `/t/${slug}/tasks`,
        label: t.surfaces.tasks,
        icon: 'tasks',
        show: guestSurfaces.includes('tasks') && features.tasks,
      },
      {
        href: `/t/${slug}/battle`,
        label: t.surfaces.battle,
        icon: 'battle',
        show: guestSurfaces.includes('battle') && features.battle,
      },
    ]

    // Filtered here rather than into a second array, for the reason the member
    // list below gives: a filtered copy widens `icon` back to `string`.
    if (!guestRows.some((row) => row.show)) return null

    return (
      <nav aria-label={t.bands.main}>
        <Band>{t.bands.thisEvent}</Band>
        {guestRows
          .filter((row) => row.show)
          .map((row) => (
            <Row
              key={row.href}
              href={row.href}
              active={
                row.href === `/t/${slug}`
                  ? pathname === row.href
                  : pathname.startsWith(row.href)
              }
              icon={<Icon name={row.icon} />}
            >
              {row.label}
            </Row>
          ))}
      </nav>
    )
  }

  /**
   * Whether this row is the page you are on.
   *
   * Prefix matching by default, so /pages/abc still lights up Pages. `exact` is
   * for the one row that cannot use it: the board sits at the workspace root
   * now, and `/t/acme` is a prefix of every other route in the rail - without
   * this, Dashboard would be highlighted on top of whichever row was really
   * current, on every single page.
   */
  const at = (href: string, exact = false) =>
    pathname === href || (!exact && pathname.startsWith(`${href}/`))

  // Flags decide what is here, not whether it is greyed out: the routes call
  // requireFeature() themselves, so this only keeps the rail honest about what
  // exists. Filtered at the point of use rather than into a second array, which
  // is where the icon names would widen back to `string`.
  const items: {
    href: string
    label: string
    icon: IconName
    show: boolean
    exact?: boolean
  }[] = [
    // The workspace root, not a child route: the board is what opening a space
    // shows you now. See src/app/t/[slug]/page.tsx.
    { href: `/t/${slug}`, label: t.surfaces.dashboard, icon: 'dashboard', show: true, exact: true },
    { href: `/t/${slug}/pages`, label: t.surfaces.pages, icon: 'pages', show: features.pages },
    { href: `/t/${slug}/tasks`, label: t.surfaces.tasks, icon: 'tasks', show: features.tasks },
    { href: `/t/${slug}/battle`, label: t.surfaces.battle, icon: 'battle', show: features.battle },
    /*
      The builder and the space's saved worlds. `garden` rather than a new
      glyph: it is the one icon here that reads as a place rather than as an
      activity, which is what a world is.

      From `xo` up this entry becomes the library, which has the worlds inside
      it as a section. A replacement rather than a sixth row: a space with
      projects has one place its work lives, and two rows called Worlds and
      Browse would make somebody guess which one their level is in. A free
      space has no projects to put above its worlds, so it keeps exactly the
      page it had.
    */
    /*
      The tier, not `features.xp`. `/browse` gates on the tier too and answers a
      space below it with notFound(), so keying this row on the installation
      flag put a Browse row in the rail of every free space on an installation
      that *has* the xp product - a link to a 404 - and hid the Worlds page
      those spaces can actually open. `requireTier`'s own note is the rule this
      follows: a link is not a permission. The threshold is `xo` because that is
      where projects begin; it must stay whatever `/browse` asks for. The offer
      to upgrade lives in the battle wizard, where somebody is standing in front
      of the thing they would be buying.
    */
    tierAtLeast(tier, 'xo')
      ? { href: `/t/${slug}/browse`, label: t.surfaces.browse, icon: 'world', show: features.worlds }
      : { href: `/t/${slug}/worlds`, label: t.surfaces.worlds, icon: 'world', show: features.worlds },
    /*
      No Thingiverse row, and its absence is the decision.

      It had one, directly under the worlds, and it did not earn a permanent
      line in a six-item list: what is behind it is a shelf and a model browser,
      which is the same kind of answer to "what is this space made of" that the
      magazine and the store are - so it is the first tab of Browse now, and the
      row above is the way in. See `ThingiverseWorkbench`.

      The thing somebody actually reaches for mid-session was never this row
      anyway. It is the green door in the rail, which summons into the room they
      are standing in without leaving it.
    */
    // Where videos and pictures get made. Under Worlds rather than above it,
    // because you usually build the place before you shoot in it.
    { href: `/t/${slug}/studio`, label: t.surfaces.studio, icon: 'studio', show: features.scenes },
    // Who has shown up, and for how many days running. Not behind a flag: a
    // streak is earned by opening the space, which every member does, so there
    // is nothing to switch off - the same reason Dashboard has none.
    { href: `/t/${slug}/leaderboard`, label: t.surfaces.streaks, icon: 'streak', show: true },
  ]

  return (
    <nav aria-label={t.bands.main}>
      <Band>{t.bands.main}</Band>
      {items.filter((item) => item.show).map((item) => (
        <Row
          key={item.href}
          href={item.href}
          active={at(item.href, item.exact)}
          icon={<Icon name={item.icon} />}
        >
          {item.label}
        </Row>
      ))}
    </nav>
  )
}

/**
 * The places, and who is standing in them.
 *
 * This is the travel bar, moved. It used to float over the bottom of every
 * scene, which meant the one control that says "you can leave" was drawn
 * inside the thing you were leaving - and it had to be hidden by hand whenever
 * a HUD panel wanted the same corner.
 */
function Places({
  slug,
  features,
  role,
  rooms,
  marks,
  canManageRooms,
}: {
  slug: string
  features: SidebarFeatures
  role: TenantRoleName
  rooms: RoomView[]
  /** This person's own pins and last visits, read in the layout. */
  marks: RoomMarks
  canManageRooms: boolean
}) {
  const pathname = usePathname()
  const t = railDict(useLocale())

  const here = useHere()

  /**
   * Pins this browser has changed and the server has not confirmed yet.
   *
   * `useState` and an overlay rather than `useOptimistic`, which is the house
   * rule for a rail drawn over a live scene and is load-bearing here for the
   * reason `play-rail` writes out at length: an optimistic value needs
   * something to be confirmed against, and a pin is confirmed by a layout
   * revalidation that arrives as a whole new tree rather than as a resolved
   * promise. `useOptimistic` snaps back the instant the transition ends, which
   * for this control means the room visibly jumps back down the list and then
   * up again.
   *
   * Kept after it lands rather than cleared, because clearing it is the same
   * flicker one render later: the overlay and the server agree by then, so
   * there is nothing to clear except the agreement. It is dropped on a refusal,
   * which is the only case where the two ever disagree.
   */
  const [pinning, setPinning] = useState<Record<string, boolean>>({})

  /**
   * The groups this viewer has folded away.
   *
   * **Open is the default and folding is the deliberate act**, which is the
   * whole of the rule: a group exists because an admin said these rooms belong
   * together, so arriving with them hidden would be the rail undoing the
   * arrangement it was asked to draw. Nothing is hidden until somebody presses
   * a caption, and what they pressed is the only thing that closes.
   *
   * Kept per viewer in `localStorage` rather than in a table, on the same
   * reasoning the Pinnwand's dismissals are: this is which parts of a menu one
   * browser has tidied, it is worth nothing to anybody else, and losing it
   * costs one expanded group. There is no round trip and no row.
   *
   * `useSyncExternalStore` rather than state seeded by an effect, because
   * `localStorage` is exactly what it is for: the server has none, so the
   * server snapshot is the empty set and hydration matches by construction,
   * and React re-reads on the client without a render pass that sets state
   * from inside an effect. See `foldStore` below.
   */
  const folded = useSyncExternalStore(
    subscribeToFolds,
    () => foldsFor(slug),
    () => NO_FOLDS,
  )

  /**
   * A guest sees the lounge and nothing else.
   *
   * The café, houses and gardens are *somebody's* - they belong to a member,
   * they have doors, and the whole knock-and-admit flow assumes the person
   * outside is a colleague. A stranger on a link walking into your kitchen is
   * not what any of that was designed for, so they do not get the door at all.
   *
   * The lounge is the commons, which is exactly why it is the one that stays:
   * it belongs to nobody, so there is nobody to intrude on.
   */
  const guest = role === 'guest'

  // And while they are in a match, not even that. The match is the room; a
  // link out of it during play is either an accidental forfeit or a way to
  // leave your side a player down.
  if (guest && inMatch(pathname, slug)) return null

  /**
   * The lounge, and nothing else - because it is the last place that is a page.
   *
   * The café, the house and the garden were three rows here and three routes
   * behind them. They are cartridges now: `dream-restaurant` and `peepz-world`
   * in the XP shelf, opened in a room like any other game, which is why the
   * rooms below are where they turn up. A rail row is a *place in the product*,
   * and a row pointing at a route nobody serves is the worst kind of navigation
   * - it looks like the feature is broken rather than moved.
   *
   * The `cafe` flag still gates the homestead itself: it is what
   * `openHomesteadFrame` checks before a cartridge opens, and what the purse
   * lives behind. It just no longer decides whether a *link* is drawn.
   */
  if (!features.lounge) return null

  /*
   * The rooms, sorted into their bands.
   *
   * The overlay is applied to the marks rather than to the result, so a room
   * being pinned takes the same path through `orderPlaces` that a pinned room
   * takes - one ordering, and no second implementation of "where does a pinned
   * room go" living in a click handler.
   *
   * The stamp on an overlaid pin is `PIN_PENDING`, which sorts exactly where
   * the server's own stamp is about to put it - see the note there. The room
   * moves once, when you click, and does not move again when the answer lands.
   */
  const overlaid: RoomMarks = { ...marks }
  for (const [roomId, pinned] of Object.entries(pinning)) {
    overlaid[roomId] = {
      seenAt: marks[roomId]?.seenAt ?? null,
      pinnedAt: pinned ? PIN_PENDING : null,
    }
  }

  const places = orderPlaces(rooms, overlaid)

  const loungeHref = hrefFor('lounge', slug, undefined)
  const loungeActive = pathname.startsWith(`/t/${slug}/lounge`)

  /** Fold a group away, or bring it back. */
  function fold(name: string) {
    const next = new Set(folded)
    if (!next.delete(name)) next.add(name)
    setFolds(slug, next)
  }

  function pin(roomId: string, pinned: boolean) {
    setPinning((was) => ({ ...was, [roomId]: pinned }))
    void attempt(() => pinRoomForMe(slug, roomId, pinned)).then((result) => {
      if (result.ok) return
      // Put it back. Nothing else in the rail moved, so the whole recovery is
      // dropping the overlay and letting the server's answer stand.
      setPinning((was) => {
        const next = { ...was }
        delete next[roomId]
        return next
      })
    })
  }

  /** One room, drawn the same way wherever in the list it turns up. */
  function roomRow(room: RoomView, byAdmin = false) {
    return (
      <RoomRow
        key={room.roomId}
        slug={slug}
        room={room}
        active={pathname.startsWith(`/t/${slug}/rooms/${room.slug}`)}
        /*
         * A room the *space* pinned gets no control, and that is not a
         * simplification. Your pin is yours to take off; the space's is an
         * instruction from an owner, and a member unpinning it from a rail row
         * would either do nothing (the refusal is server-side) or quietly
         * change the rail for everybody. Neither is a button worth drawing.
         */
        pinned={byAdmin ? 'space' : (overlaid[room.roomId]?.pinnedAt ? 'mine' : 'none')}
        onPin={pin}
        t={t}
      />
    )
  }

  return (
    <nav aria-label={t.bands.places}>
      <Band>{t.bands.places}</Band>

      {/*
        The lounge, always first and never in a band of its own.

        It is the commons - nobody's, so a visit does not follow you into it,
        and the link must not pretend otherwise by carrying `?of=`.
      */}
      <Row
        href={loungeHref}
        active={loungeActive}
        icon={<Icon name="lounge" />}
        meta={
          // The head count, on the place you are actually in. Elsewhere it
          // would be a number this client has no way to know.
          loungeActive && here.place === 'lounge' && here.people.length > 0 ? (
            <span className="rail-count">{here.people.length + 1}</span>
          ) : null
        }
      >
        {t.places.lounge}
      </Row>

      {/*
        --- pinned ------------------------------------------------------------

        Kept at the top, and captioned, because a list whose first three rows
        are in a different order from the rest has to say why. The caption is
        the whole explanation, and it costs one 10px line.
      */}
      {places.pinned.length > 0 && (
        <>
          <Caption>{t.rooms.pinnedHeading}</Caption>
          {places.pinned.map((entry) => roomRow(entry.room, entry.byAdmin))}
        </>
      )}

      {/*
        --- the groups --------------------------------------------------------

        A caption and its rooms, at the same indent as everything else. Not
        indented, which is the change: rooms used to hang off the lounge in a
        `pl-4` branch on the argument that they are "more lounges". They are,
        and it was still wrong - the indent made the whole list read as one
        place with a sub-menu, and it left the lounge carrying an empty branch
        in every space that had no rooms yet. A caption groups rows without
        moving them; an indent moves every row to group some of them.
      */}
      {places.groups.map((group) => {
        const open = !folded.has(group.name)

        return (
          <div key={group.name}>
            <Caption
              open={open}
              onToggle={() => fold(group.name)}
              /* The count only while it is folded. Open, it is a number you
                 could reach by looking; closed, it is the only thing saying
                 what is behind the caption. */
              count={open ? null : group.rooms.length}
            >
              {group.name}
            </Caption>
            {open && group.rooms.map((room) => roomRow(room))}
          </div>
        )
      })}

      {/*
        --- everything else ---------------------------------------------------

        Captioned only when there is a group above it. Without one, these are
        simply "the rooms" and a heading over all of them says nothing; with
        one, an uncaptioned run of rows directly under a group's rows reads as
        more of that group.
      */}
      {places.loose.length > 0 && places.groups.length > 0 && (
        <Caption>{t.rooms.ungroupedHeading}</Caption>
      )}
      {places.loose.map((room) => roomRow(room))}

      {/* The remainder as one line rather than as more rows - the point of the
          cap is that the rail stops growing. */}
      {places.overflow > 0 && (
        <Row
          href={`/t/${slug}/rooms`}
          active={pathname === `/t/${slug}/rooms`}
          icon={<span aria-hidden>+</span>}
        >
          {fill(t.rooms.more, { n: places.overflow })}
        </Row>
      )}

      {canManageRooms && <NewRoom slug={slug} />}
    </nav>
  )
}

/**
 * A caption over a run of rows.
 *
 * Not `<Band>`, which is an `<h2>` and names a whole region of the rail: there
 * is one Places band and it already has its heading. A screen reader given
 * "Places, Pinned, Design, Other rooms" as four regions would be told about a
 * structure that is really one list with dividers in it.
 *
 * A button when it can fold something and a plain paragraph when it cannot -
 * rather than a button that is always there and sometimes does nothing. "Pinned"
 * and "Other rooms" are not groups anybody arranged and there is nothing behind
 * them to put away; a control on them would be a promise the rail does not keep.
 *
 * The caret is a caret that *turns* rather than a plus that becomes a minus: it
 * says which way the rows went as well as that they went, and at 7px a rotation
 * is legible where a glyph swap is a flicker.
 *
 * Either way it is read out, not `aria-hidden`. The caption is the only thing
 * that says which group a room is in, so hiding it would leave somebody
 * listening to the rail with an unexplained pile of rooms in an order they
 * cannot account for. It is quieter than a heading, not absent.
 */
function Caption({
  children,
  open,
  onToggle,
  count,
}: {
  children: React.ReactNode
  /** Whether what it captions is showing. Absent when it captions nothing foldable. */
  open?: boolean
  onToggle?: () => void
  /** How many rows are behind it, drawn only while it is folded. */
  count?: number | null
}) {
  const words = 'truncate text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted/70'

  /*
    The caret slot is drawn either way, and is only *invisible* on a caption
    with nothing to fold. Every caption in the band then starts its words at the
    same x - and a column where "Pinned" and "Work" begin two characters apart
    reads as two kinds of list rather than one list with a control on some of
    its dividers.
  */
  const caret = (
    <svg
      viewBox="0 0 8 8"
      width={7}
      height={7}
      aria-hidden
      className={`shrink-0 fill-current text-ink-muted/70 transition-transform ${
        onToggle ? '' : 'invisible'
      } ${open ? 'rotate-90' : ''}`}
    >
      <path d="M2 0.6 6.4 4 2 7.4Z" />
    </svg>
  )

  const inside = (
    <>
      {caret}
      <span className={words}>{children}</span>
      {count !== null && count !== undefined && (
        <span className="shrink-0 text-[10px] tabular-nums text-ink-muted/60">{count}</span>
      )}
    </>
  )

  const shape = 'flex w-full items-center gap-1.5 px-3 pb-0.5 pt-2 text-left'

  if (!onToggle) return <p className={shape}>{inside}</p>

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`${shape} rounded-lg transition hover:text-ink`}
    >
      {inside}
    </button>
  )
}

/**
 * Which groups this browser has folded away, and where that is kept.
 *
 * A tiny external store rather than component state, so the rail can read
 * `localStorage` through `useSyncExternalStore` - which is the one hook that
 * handles "the server does not have this value" without a hydration mismatch
 * and without setting state from an effect.
 *
 * One key per space, because the groups are the space's: a "Design" folded away
 * in one workspace has nothing to do with a "Design" in another, and one shared
 * key would make them the same fold.
 *
 * Every access is wrapped and both directions fail silently. `localStorage`
 * throws outright in a browser with site data blocked, and this is a menu
 * preference - the right behaviour when it cannot be read is every group open,
 * which is the default anyway. A rail that threw here would take the whole
 * workspace shell with it; see the storage-denied notes.
 */
const FOLDED_KEY = 'places:folded:'

/** The server's answer, and the answer when storage refuses. Stable, because
 *  `useSyncExternalStore` compares snapshots by identity. */
const NO_FOLDS: ReadonlySet<string> = new Set()

/** The last set handed out, per space. Also what keeps the snapshot stable. */
let foldCache: { slug: string; folds: ReadonlySet<string> } | null = null
const foldListeners = new Set<() => void>()

function subscribeToFolds(onChange: () => void): () => void {
  foldListeners.add(onChange)
  return () => {
    foldListeners.delete(onChange)
  }
}

function foldsFor(slug: string): ReadonlySet<string> {
  if (foldCache?.slug === slug) return foldCache.folds

  let folds: ReadonlySet<string> = NO_FOLDS
  try {
    const raw = window.localStorage.getItem(FOLDED_KEY + slug)
    const names: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(names)) {
      folds = new Set(names.filter((name): name is string => typeof name === 'string'))
    }
  } catch {
    // Storage denied, or a value somebody else wrote. Every group opens.
  }

  foldCache = { slug, folds }
  return folds
}

function setFolds(slug: string, folds: ReadonlySet<string>): void {
  // The cache first, so the re-render this triggers reads the new value even
  // when the write below throws - the fold then holds for the session and is
  // forgotten on reload, which is the right half of the feature to keep.
  foldCache = { slug, folds }
  try {
    if (folds.size === 0) window.localStorage.removeItem(FOLDED_KEY + slug)
    else window.localStorage.setItem(FOLDED_KEY + slug, JSON.stringify([...folds]))
  } catch {
    // Nothing to do and nothing worth saying.
  }
  for (const listener of foldListeners) listener()
}

/**
 * One room in the Places list.
 *
 * A `<div>` around the link rather than a link with a button inside it, because
 * a button inside an anchor is not a thing HTML has - the click would navigate
 * as well as pin. Same shape the rooms rail's rename control uses, and the same
 * bargain: the control is invisible until the row is hovered and always
 * reachable by keyboard, because a pin permanently beside every room turns a
 * list of places to walk into into a list of things to administer.
 */
function RoomRow({
  slug,
  room,
  active,
  pinned,
  onPin,
  t,
}: {
  slug: string
  room: RoomView
  active: boolean
  /** Whose pin holds this room up, if either. */
  pinned: 'space' | 'mine' | 'none'
  onPin: (roomId: string, pinned: boolean) => void
  t: RailDict
}) {
  return (
    <div className="group/room relative flex items-center">
      <Link
        href={`/t/${slug}/rooms/${room.slug}`}
        aria-current={active ? 'page' : undefined}
        className={`rail-link min-w-0 flex-1 ${pinned === 'none' ? '' : 'rail-link-marked'}`}
      >
        <span aria-hidden className={`rail-link-icon ${tintClass(room.tint)}`}>
          <RoomGlyph name={room.icon} />
        </span>
        <span className="min-w-0 flex-1 truncate">{room.name}</span>
        {/*
          A room that is a level says so, and says it here rather than in a
          second list. That is the whole point of a level being a room: one list
          of places, one kind of row, and a tag for the one thing that differs
          about what is inside.

          It gives up its slot to the pin control on hover - two pills and a
          glyph in a 15rem row is a row nobody can read - which is why this is
          `group-hover/room:opacity-0` rather than a second element beside it.

          Taking turns only works while the pin is the thing that arrives on
          hover. A room pinned by the space, or by you, draws its mark
          permanently and drew it straight through the `P` - so a marked row
          reserves the road instead (`.rail-link-marked`) and the pill keeps
          its opacity: both facts are true at once, and both are worth saying.
        */}
        {room.xpRef && (
          <span
            className={`xp-tag transition ${
              pinned === 'none' ? 'group-hover/room:opacity-0' : ''
            }`}
          >
            XP
          </span>
        )}
      </Link>

      {pinned === 'space' ? (
        /*
          The space's pin, stated and not offered.

          Drawn always rather than on hover, because it is the answer to "why is
          this room at the top" for somebody who did not put it there - and that
          question is asked exactly by the people who never hover it.
        */
        <span
          aria-hidden
          title={t.rooms.pinnedBySpace}
          className="pointer-events-none absolute right-2.5 text-[11px] text-accent-2/70"
        >
          <PinMark filled />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onPin(room.roomId, pinned !== 'mine')}
          aria-pressed={pinned === 'mine'}
          title={fill(pinned === 'mine' ? t.rooms.unpin : t.rooms.pin, {
            name: room.name,
          })}
          className={`absolute right-1.5 rounded-lg p-1.5 text-ink-muted transition hover:text-ink focus-visible:opacity-100 ${
            pinned === 'mine' ? 'text-accent-2/80 opacity-100' : 'opacity-0 group-hover/room:opacity-100'
          }`}
        >
          <PinMark filled={pinned === 'mine'} />
        </button>
      )}
    </div>
  )
}

/**
 * A pin, at rail size.
 *
 * Two states out of one drawing: the outline is "you could", the filled one is
 * "you did". Filling it rather than colouring it alone is what makes the two
 * tell apart for somebody who cannot see the difference between muted ink and
 * cyan - which on a row that is already tinted a colour of its own is more
 * people than usual.
 */
function PinMark({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={13}
      height={13}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.2 1.8h3.6l-.5 4 2.6 2.4v1.2H4.1V8.2l2.6-2.4-.5-4Z" />
      <path d="M8 9.4V14" />
    </svg>
  )
}

/**
 * Open a room from the navigation itself.
 *
 * The Room tab already has a fuller version of this - with the unlisted switch
 * and the controls for the room you are standing in - and this is deliberately
 * not that. It sits at the bottom of the lounge's own branch because that is
 * where the answer to "another one of these" belongs: you are looking at the
 * list of rooms when you decide you want one more, and the tab is a panel away
 * on a laptop and a tab away on a phone.
 *
 * So: a name, and you are in it. The room opens listed - which is what "one
 * more room" means nine times out of ten - and unlisting it is a checkbox in
 * the Room tab once you are inside.
 */
function NewRoom({ slug }: { slug: string }) {
  const refusal = useRefusal()
  const t = railDict(useLocale())
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [opening, setOpening] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!opening) {
    return (
      <button
        type="button"
        onClick={() => setOpening(true)}
        className="rail-link w-full text-left text-ink-muted"
      >
        <span aria-hidden className="rail-link-icon">
          +
        </span>
        <span className="min-w-0 flex-1 truncate">{t.rooms.newRoom}</span>
      </button>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await createRoom(slug, name)
          if (!result.ok) {
            setError(refusal(result.error))
            return
          }
          setName('')
          setOpening(false)
          // Refresh before navigating, so this very rail already lists the room
          // by the time the new page paints - `revalidatePath` only marked the
          // layout stale on the server.
          router.refresh()
          router.push(`/t/${slug}/rooms/${result.slug}`)
        })
      }}
      className="space-y-1.5 px-1 py-1"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpening(false)
            setError(null)
          }
        }}
        placeholder={t.rooms.namePlaceholder}
        maxLength={60}
        autoFocus
        disabled={pending}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs disabled:opacity-50"
      />

      {error && (
        <p role="alert" className="text-[11px] text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpening(false)
            setError(null)
          }}
          className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-50"
        >
          {t.rooms.cancel}
        </button>
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-50"
        >
          {pending ? t.rooms.opening : t.rooms.open}
        </button>
      </div>
    </form>
  )
}

/**
 * Who is around: the room you are in, then everybody else's front door.
 *
 * Its own component because it is rendered twice - folded into the left panel
 * on a tablet, standing in its own panel on the right from `xl` up. Both copies
 * read the same store and the same props, so there is no "real" one.
 */
function People({ username }: { username: string }) {
  const here = useHere()
  /**
   * Null unless you are standing in your own homestead, which is the only place
   * anybody may show anybody else out. Published out of the scene - see
   * `door-store`. The door's *controls* have moved to the Room tab; this reads
   * the same store only to know whether the eject button belongs on a row.
   */
  const door = useDoor()

  return (
    <div className="flex flex-col gap-4">
      {/*
        The front door used to sit above this list, and it has moved into the
        Room tab. It is a setting, not a person, and it was the tallest thing in
        a panel whose job is the roster - on a short screen it pushed the people
        it was about off the bottom.
      */}
      <Online here={here} username={username} owner={door !== null} />

      {/*
        Everybody else's front door used to be a band here, and it went with the
        routes it linked to.

        It was the only way to reach `?of=` without hand-editing a URL - one
        click from your café to Sam's - and `?of=` was a *page* parameter. A
        cartridge has no address bar: `openHomesteadFrame` opens the homestead
        of whoever is holding the controller, deliberately, so that a room
        pinned to the café is one door that leads each member to their own.

        Visiting is therefore a thing this product does not currently do, rather
        than a thing hidden here. When it comes back it belongs *inside* the
        game - the door and the knock are still in the log, `HomesteadAccessSet`
        and all - as a control in the cartridge rather than a link in a rail.
      */}
    </div>
  )
}

/**
 * Who is in the room with you.
 *
 * "Online" means "in this room", and that is the only sense of it this app can
 * honestly report: presence is a channel you are joined to, and somebody
 * reading the dashboard is on no channel at all. So the heading names the room
 * rather than the workspace, and outside a room the band says why it is empty
 * instead of showing an empty list.
 *
 * ---------------------------------------------------------------------------
 * A match is a room too, and it was not one here
 * ---------------------------------------------------------------------------
 * `here-store` is written by the world scenes and its `PlaceId` is the four
 * rooms of a world. A battle is none of them - so somebody standing in a match,
 * with an opponent, in a ring, both names on the scoreboard in front of them,
 * was told *"go into a place to see who is there"*.
 *
 * The two are not merged, because they answer different questions. A world's
 * roster is *presence*: live off a channel, and gone the moment you look away.
 * A match's is who it is **between**: durable, off the battle, and still true of
 * somebody who has stepped out for a second. So this reads whichever one it is
 * in, and prefers the world when it is in both - a match played inside a place
 * is somewhere you are standing, and the people around you are the answer to
 * "who is here".
 */
function Online({
  here,
  username,
  owner,
}: {
  here: ReturnType<typeof useHere>
  username: string
  /**
   * Whether this is your own homestead, and so whether you may show people out.
   *
   * The old door panel carried its own copy of this list purely to hang an
   * eject button off, which meant the same four names appeared twice on a wide
   * screen. One list with the button folded in says the same thing once.
   */
  owner: boolean
}) {
  const t = railDict(useLocale())
  const match = useCurrentMatch()

  /**
   * The match's roster, when there is one and no world roster to prefer.
   *
   * Null rather than an empty array when it does not apply, so the branch below
   * reads as *which of the three states is this* rather than as a length check.
   */
  const inMatch = here.place === null && match !== null ? match : null

  if (inMatch) {
    return (
      <section aria-label={t.bands.whoIsHere}>
        <Band>{t.bands.whoIsHere}</Band>
        {inMatch.people.length === 0 ? (
          /*
            A match nobody has taken a seat in yet. Said plainly rather than
            falling back to "go into a place", which would be advice for
            somebody who is already somewhere.
          */
          <p className="px-3 text-[11px] leading-relaxed text-ink-muted">{t.who.noSeats}</p>
        ) : (
          <ul>
            {inMatch.people.map((person) => (
              <Peep
                key={person.userId}
                name={person.name}
                you={person.userId === inMatch.me}
              />
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <section aria-label={t.bands.whoIsHere}>
      <Band>{here.place ? t.bands.inPlace[here.place] : t.bands.whoIsHere}</Band>

      {here.place === null ? (
        <p className="px-3 text-[11px] leading-relaxed text-ink-muted">
          {t.who.walkIn}
        </p>
      ) : (
        <ul>
          <Peep name={username} you />
          {here.people.map((person) => (
            <Peep
              key={person.userId}
              name={person.name}
              onShowOut={
                owner ? () => doorActions()?.eject(person.userId) : undefined
              }
            />
          ))}
          {here.people.length === 0 && (
            <li className="px-3 pt-1 text-[11px] text-ink-muted">
              {t.who.nobodyElse}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function Peep({
  name,
  you = false,
  onShowOut,
}: {
  name: string
  you?: boolean
  onShowOut?: () => void
}) {
  const t = railDict(useLocale())

  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5">
      <Face name={name} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{name}</span>
      {/* Everyone in this list is, by definition, in the room - so the only
          thing left to say is which one of them is you. */}
      {you && <span className="shrink-0 text-[10px] text-ink-muted">{t.who.you}</span>}
      {onShowOut && (
        /**
         * Hidden until the row is hovered, and always reachable by keyboard.
         *
         * Throwing somebody out is not a thing to put permanently in front of
         * the owner next to the name of a friend, but `opacity-0` alone would
         * make it unreachable for anyone tabbing through - hence the
         * focus-visible escape.
         */
        <button
          type="button"
          onClick={onShowOut}
          title={fill(t.who.showOutTitle, { name })}
          className="shrink-0 rounded-lg px-2 py-0.5 text-[10px] text-ink-muted opacity-0 transition hover:bg-red-500/15 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
        >
          {t.who.showOut}
        </button>
      )}
    </li>
  )
}

/**
 * You, at the foot of the rail.
 *
 * Everything about the account rather than about the workspace, folded behind
 * your own name - the same split the account menu made in the old header, kept
 * because it is still the right one.
 *
 * Its own block at the bottom of the column rather than the last row of the
 * scroller, and `shrink-0` is the whole of it: this box asks for the height it
 * needs and the navigation above gives up the difference. It used to be pushed
 * out of the bottom of the panel by a long enough rail - see the note on the
 * column - and a sign-out you have to scroll a nav list to find is a sign-out
 * that is missing.
 */
function Account({
  slug,
  username,
  email,
  role,
  tier,
  features,
}: {
  slug: string
  username: string
  email: string
  role: TenantRoleName
  /** What the space is on. See the note on the Sidebar prop of the same name. */
  tier: Tier
  /** For the tour, which must not describe surface this space has switched off. */
  features: SidebarFeatures
}) {
  const t = railDict(useLocale())
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const isOwner = role === 'owner'

  /**
   * The same row as everything above it.
   *
   * These used to be plain text links, which made the account menu the one part
   * of the rail that did not look like the rail. Reusing `.rail-link` means the
   * icon column lines up with the navigation's, so the whole panel reads as one
   * list even though it is four.
   */
  const items: { href: string; label: string; icon: IconName; show: boolean }[] = [
    { href: `/t/${slug}/members`, label: t.account.members, icon: 'members', show: isOwner },
    { href: `/t/${slug}/billing`, label: t.account.billing, icon: 'billing', show: isOwner },
    // Not for a visitor either, and this one was a dead link rather than a
    // wrong page: /t/[slug]/settings calls requireTenant without `guests`, so a
    // guest following this row got a 404. What it would have shown them if it
    // had opened is the other half of the reason - a password panel, for an
    // account they do not have.
    //
    // Two rows now, because settings is two pages: what is yours, and what is
    // the space's. They used to be one column of cards where a member could
    // change the top half and only read the bottom.
    { href: `/t/${slug}/settings/profile`, label: t.account.profile, icon: 'profile', show: role !== 'guest' },
    /*
      Your shelf of things, beside your profile rather than only in the nav.

      Browse, whose first tab is the shelf, and this is the only row that names
      it: what you have *made* is a fact about you, and the menu with your name
      on it is where somebody looks for their own work. The navigation above
      answers "what can this space do" and has a Browse row for that; this one
      answers "where is my stuff" and says the word somebody is thinking.

      Not for a visitor, like the two rows around it: a guest owns no blueprints
      and the page refuses them at `requireTenant`.
    */
    {
      href: `/t/${slug}/browse`,
      label: t.surfaces.thingiverse,
      icon: 'thing',
      show: features.thingiverse && role !== 'guest',
    },
    { href: `/t/${slug}/settings/space`, label: t.account.spaceSettings, icon: 'settings', show: role !== 'guest' },
    // Not for a visitor: there is nothing to switch to. A guest belongs to one
    // space, by a link, and the picker on the other end of this row has no list
    // to show them - see <GuestPicker>, which catches the ones who arrive there
    // by another door.
    { href: '/tenants', label: t.account.switchSpace, icon: 'switch', show: role !== 'guest' },
  ]

  return (
    <div className="mt-3 flex shrink-0 flex-col border-t border-line/60 pt-2">
      {/*
        The button first, the menu under it.

        It was the other way round, and that is what made this menu impossible
        to shut: opening it inserted six rows *above* the toggle, which pushed
        the toggle itself off the bottom of a panel that clips - so the one
        control that closes the thing was the one the thing had just hidden. The
        rail scrolls now, which would have made it merely awkward; putting the
        button above its own menu makes it stay exactly where the thumb left it,
        which is the actual fix.
      */}
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-surface-raised"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-raised text-sm font-semibold uppercase"
        >
          {username.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={username}>
            {username}
          </span>
          {/*
            Role and tier on one line, in that order.
            
            What you are here, then what the space is on. Both are needed to
            answer "why can I not do this" - a member in an xp space and an
            owner in a free one are refused by completely different rules - and
            the line had only ever carried the first half.
            
            The tier is dimmer, because it is a fact about the space rather than
            about you, and the reader is looking at their own account block.
          */}
          <span className="block truncate text-[11px] text-ink-muted" title={email}>
            {t.account.roles[role]} <span className="text-ink-muted/60">· {tier}</span>
          </span>
        </span>
        <span
          aria-hidden
          className={`text-ink-muted transition-transform duration-[var(--dur-fast)] ${
            open ? 'rotate-180' : ''
          }`}
        >
          {/* Points down when shut, up when open - the menu is below it now, so
              the arrow has to say which way the list will unfold. */}
          <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 6.5 8 10 11.5 6.5" />
          </svg>
        </span>
      </button>

      {/*
        Capped, and scrolling inside the cap.

        Open, this is seven rows in a box that is `shrink-0` - so on a short
        screen it would take the whole rail and then keep going past the bottom
        of a panel that clips. The navigation above gives up its space first,
        and past this ceiling the menu scrolls itself instead.
      */}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.account.menu}
          className="rail-scroll max-h-[45vh] pt-1"
        >
          {items
            .filter((entry) => entry.show)
            .map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                role="menuitem"
                className="rail-link"
              >
                <span aria-hidden className="rail-link-icon">
                  <Icon name={entry.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              </Link>
            ))}

          {/*
            The way to reach a human, moved in here from the corner dock: inside
            a workspace the corner belongs to the rooms, and this is the list
            everything about you already lives in. The dock's own copy hides
            itself on /t/... so there is still only one.
          */}
          {/*
            What this place is, reopenable.

            Above the contact row on purpose: "I do not know what the café is
            for" and "something is broken" arrive at the same moment, and the
            first is answered here in six panels without anybody having to write
            an email about it. Same shape as the row below it - a dialog behind a
            `.rail-link`, see <TourWidget>.
          */}
          <TourWidget variant="rail" features={features} />

          <ContactWidget variant="rail" />

          {/*
            A visitor gets the exit, not the sign-out.

            Signing out of an anonymous session destroys the only proof they
            were admitted and leaves them on a page they can no longer load,
            with nothing to sign back in with - so the two are swapped rather
            than shown side by side. See <GuestExit>.
          */}
          {role === 'guest' ? (
            <div className="px-1 pt-1">
              <GuestExit />
            </div>
          ) : (
            <form action={signOut}>
              <button type="submit" role="menuitem" className="rail-link w-full text-left">
                <span aria-hidden className="rail-link-icon">
                  <Icon name="signOut" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t.account.signOut}</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
