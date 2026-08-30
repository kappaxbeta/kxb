'use client'

import { useState } from 'react'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { ChatRail } from '@/app/t/[slug]/chat-rail'
import { GuestRail } from '@/app/t/[slug]/guest-rail'
import { KnockRail } from '@/app/t/[slug]/knock-rail'
import { PlayRail } from '@/app/t/[slug]/play-rail'
import { Face } from '@/app/t/[slug]/rail-bits'
import { RadioRail } from '@/app/t/[slug]/radio-rail'
// Type-only, so it is erased before the bundler ever sees a cycle back to the
// file that renders this one.
import { AvatarRail } from '@/app/t/[slug]/avatar-rail'
import { RoomsRail } from '@/app/t/[slug]/rooms-rail'
import type { SidebarGuestAccess } from '@/app/t/[slug]/sidebar'
import { doorActions, useDoor } from '@/app/world/_stores/door-store'
import { FrontDoorControls } from '@/app/world/_canvas/room-door'
import { useParty } from '@/app/world/_stores/party-store'
import { useRainbowSwitch } from '@/app/world/_stores/rainbow-store'
import { useStuck } from '@/lib/stuck-store'
import type { Knock } from '@/app/world/_presence/room-presence'
import type { RoomView } from '@/domain/rooms/queries'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * The rail's tools, as three tabs.
 *
 * They used to be three sections stacked down the panel, and on anything
 * shorter than a desktop monitor they did not fit: the panel is a fixed-height
 * flex column, so a chat that wanted 18rem and a guest list that wanted 20rem
 * were both squeezed below their content height and drew straight over each
 * other. The bug was in the layout, not the length - but three panels that each
 * want the whole column is also a sign that only one of them should be on
 * screen at a time.
 *
 * So: the roster stays permanently visible above (it is the answer to "who is
 * around", which is why the panel exists), and everything you might *do* is
 * behind a tab that gets the whole remaining height and scrolls inside it.
 *
 * Tabs that have nothing to show are not rendered at all rather than disabled.
 * A space with no chat has no Chat tab; a member who cannot hand out guest
 * links has no Visitors tab. A disabled tab is a promise of a feature somebody
 * does not have.
 */

type TabId = 'chat' | 'room' | 'visitors'

export function RailTabs({
  slug,
  role,
  guestAccess,
  hasChat,
  hasPlay,
  hasRadio,
  rooms,
  canManageRooms,
  avatar,
  hereOnly,
  hasSkinShop,
  /**
   * Whether to take the panel's remaining height, or stand at a fixed one.
   *
   * True in the right-hand panel, which is a flex column this block is the last
   * item in. False in the phone and tablet drawer, where the whole rail is one
   * scrolling column - `flex-1` inside a scroller resolves against nothing and
   * collapses the tab body to its content.
   */
  fill,
}: {
  slug: string
  role: TenantRoleName
  guestAccess: SidebarGuestAccess | null
  hasChat: boolean
  /**
   * Can this space open an XP where it stands?
   *
   * `xpOpen` and the battle flag together, resolved in the layout - not the
   * tier alone, which is what `features.xp` on the rail means. Both, because
   * the tab makes a match to put the level in: a space with the suite and no
   * battle flag would get a tab whose one control has nowhere to send anybody.
   */
  hasPlay: boolean
  hasRadio: boolean
  rooms: RoomView[]
  canManageRooms: boolean
  /** Which animal this account is. See `AvatarRail`. */
  avatar: string
  /** Whether that animal is an override for this space only. */
  hereOnly: boolean
  /** Whether the skin shop is open, and so worth a door. See `SidebarFeatures`. */
  hasSkinShop: boolean
  fill: boolean
}) {
  /**
   * Your own front door, or null when you are not standing in your own place.
   *
   * Read here rather than passed in: it is published out of the running scene
   * (see `door-store`), so it changes as you walk about and no server render
   * knows about it.
   */
  const t = railDict(useLocale()).tabs

  const door = useDoor()

  /**
   * Whether the world on screen offers a way out of being stuck, read for the
   * same reason the door is: the scene publishes it, so it comes and goes as you
   * walk about and no server render knows about it.
   *
   * Only needed to answer whether a guest gets the tab at all - see below.
   */
  const stuck = useStuck()

  // A guest answers no doors and hands out no links - see the note in KnockRail
  // about why the second is deliberately wider than the first.
  const member = role !== 'guest'

  /**
   * The radio lives inside the Room tab rather than having one of its own -
   * what is playing in here is a property of the room, next to party mode.
   *
   * Which is why a radio can open the Room tab for a guest, who would otherwise
   * never see one. A guest standing in the lobby hears whatever is on, so a
   * guest needs somewhere to answer the question and somewhere to turn it off;
   * a visitor being played music with no control over it anywhere on screen is
   * the one outcome the consent design exists to prevent. Everything else in
   * that tab already hides itself from them - `PartySwitch` renders nothing
   * without a scene to broadcast into, `RoomTab` explains itself, and the radio
   * controls are drawn only for owners and admins.
   *
   * A world on screen opens it for the same kind of reason. Being built into a
   * corner does not check whether you were invited, and the way out of one is in
   * this tab.
   *
   * **Always open now**, and the rule is unchanged rather than abandoned: it
   * appears when there is something in it for them, and there always is. Which
   * animal you are lives here, and a guest is exactly the person who cannot
   * change it anywhere else - the settings page needs a membership. A room of
   * four identical penguins with nobody able to do anything about it was the
   * old rule's cost, and it was paid entirely by visitors.
   */
  const tabs: TabId[] = [
    ...(hasChat ? (['chat'] as const) : []),
    'room',
    ...(member ? (['visitors'] as const) : []),
  ]

  /**
   * Which tab is open, as an override rather than as the state itself.
   *
   * Null means "whatever is first", so a space that turns chat on mid-session
   * does not leave somebody looking at a tab that no longer exists - and the
   * fallback below covers the same case for a tab that disappears while it is
   * the one being read.
   */
  const [chosen, setChosen] = useState<TabId | null>(null)
  const at: TabId | undefined =
    chosen && tabs.includes(chosen) ? chosen : tabs[0]

  /**
   * Whether the Play door is open, held apart from the tabs.
   *
   * Not a fourth `TabId`, which is what it was and what made this a layout
   * problem: the three tabs are tools you switch between with the panel staying
   * put, and Play is a door out of the space. Modelling it as a tab also drew
   * it as one - a fourth label in a strip sized for three - and squeezed every
   * other tab to make room for it.
   *
   * It takes the panel while it is open, so the two are still one column: the
   * rail is a fixed-height flex box, and a list of levels *under* three tabs
   * would have been two scrollers fighting over the same height.
   */
  const [playing, setPlaying] = useState(false)

  // Nothing to draw at all: no tools, and no door either.
  if (at === undefined && !hasPlay) return null

  return (
    <div
      className={`flex flex-col border-t border-line/60 pt-3 ${
        fill ? 'min-h-0 flex-1' : 'shrink-0'
      }`}
    >
      {/*
        The door, above the tools and across all of them.

        A guest gets it too - `createBattle` admits guests deliberately, and a
        visitor at an event who cannot start the level everybody came to play is
        a visitor waiting for a member to press a button.
      */}
      {hasPlay && (
        <div className="shrink-0 px-2 pb-2">
          <button
            type="button"
            onClick={() => setPlaying((open) => !open)}
            aria-expanded={playing}
            className="rail-play"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                {playing ? t.close : t.play}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                {playing ? '×' : t.playHint}
              </span>
            </span>
          </button>
        </div>
      )}

      {at !== undefined && !playing && (
      <div role="tablist" aria-label={t.toolsLabel} className="flex shrink-0 gap-1 px-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={at === tab}
            onClick={() => setChosen(tab)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
              at === tab
                ? 'bg-accent/20 text-ink'
                : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
            }`}
          >
            {t[tab]}
          </button>
        ))}
      </div>
      )}

      {/*
        The one scroller in this block.

        `min-h-0` is what makes it a scroller rather than a squashed box: a flex
        item's default `min-height: auto` refuses to go below its content, which
        is precisely how the old stacked sections came to overflow their own
        boxes and overlap the next one.

        It is one box whether the door or a tab is filling it, so the height
        does not jump as they swap - and `role` follows what is actually in it,
        because a region holding a list of levels is not the panel of a tab
        nothing in the strip is selecting.
      */}
      <div
        {...(playing
          ? { role: 'region', 'aria-label': t.levels }
          : { role: 'tabpanel', 'aria-label': at ? t[at] : undefined })}
        /*
          A floor and a ceiling on the filling one.

          `flex-1` alone means "whatever is left", and in the right rail what
          is left is whatever the match block and the roster above did not take
          - which on a busy afternoon was a room switcher, one message, and the
          box to type in. A conversation you can see one line of is a
          conversation you scroll rather than read.

          So: at least 300px, and at most 36rem, with the *column* scrolling
          when the three of them together do not fit. The ceiling matters as
          much as the floor - on a tall screen an unbounded chat pushes the
          guest links and the door off the bottom, which is the same bug the
          roster's own cap exists for.

          `min-h-0` moves into the other branch rather than staying shared, and
          that is not tidying. Both would land on the same element, and which of
          two `min-height` rules wins is decided by the order Tailwind emits
          them rather than the order they are written here - so a floor written
          beside a zero is a floor that may or may not exist, and which it is
          cannot be read off this line. Separated, it is 300px at every height
          measured.
        */
        className={`mt-2 overflow-y-auto overscroll-contain ${
          fill ? 'min-h-[300px] max-h-[36rem] flex-1' : 'min-h-0 h-72'
        }`}
      >
        {playing && <PlayRail slug={slug} canKeepRooms={canManageRooms} />}

        {!playing && at === 'chat' && <ChatRail />}

        {!playing && at === 'room' && (
          <div className="space-y-4 pb-2">
            {/*
              Rooms above the front door, because they are the commons and it is
              yours - and because the reason anybody opens this tab mid-session
              is to go somewhere, not to change a setting on a house they may
              not even be standing in.
            */}
            <RoomsRail slug={slug} rooms={rooms} canManage={canManageRooms} />
            {/*
              The radio, directly under the places and above the switches.

              It sits with party mode rather than with the door because the two
              are the same kind of thing - what this room is like right now,
              for everybody in it - while the door is a setting on one person's
              house. It goes *first* of the two because it is the only item in
              this tab that can be waiting on an answer: when a track has just
              gone on, the top of this panel is a question addressed to whoever
              opened it.
            */}
            <RadioRail />
            {/* Above the door, because it applies to wherever the person
                reading it is standing right now, and the door below may well
                belong to a house they are nowhere near. */}
            <PartySwitch />
            {/*
              And which animal you are, offered to guests as well as members.

              The settings page has the same choice behind a door a visitor
              cannot open, which is how a room ends up as four identical
              penguins with nobody able to do anything about it. Under the
              switches because it is a fact about *you* rather than about the
              room, and the room's own controls should come first.
            */}
            <AvatarRail
              initial={avatar}
              hereOnly={hereOnly}
              slug={slug}
              hasSkinShop={hasSkinShop}
            />
            {/* Under the party, because the two are the same kind of thing -
                a switch you throw on a room you are standing in - and the
                party is the one people come looking for. */}
            <RainbowSwitch />
            <RoomTab slug={slug} door={door} />
          </div>
        )}

        {!playing && at === 'visitors' && (
          <div className="space-y-3 pb-2">
            {/* Above the links, because somebody standing at the door is
                waiting on an answer and a link is a thing you write once. */}
            <KnockRail slug={slug} />

            {guestAccess ? (
              <GuestRail
                slug={slug}
                origin={guestAccess.origin}
                links={guestAccess.links}
                guests={guestAccess.guests}
                capacity={guestAccess.capacity}
              />
            ) : (
              <p className="px-3 text-[11px] leading-relaxed text-ink-muted">
                {t.guestLinksNote}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Your front door, and whoever is standing at it.
 *
 * Only yours: the control writes to your own homestead, and it only exists
 * while you are inside it - so away from home this tab says where the setting
 * lives rather than showing a switch that would write to the wrong place.
 */
/**
 * Turn the room pink.
 *
 * The one control in this rail that is not a setting: nothing is written down,
 * nothing survives a reload, and anybody standing in the space sees it happen
 * within a packet - see ../../world/party-store for why a party is a broadcast
 * rather than a row.
 *
 * Renders nothing at all unless there is a scene to broadcast into *and* the
 * viewer is an owner or an admin. A dead switch labelled "party mode" in
 * everybody's sidebar would be a worse answer than no switch: the question it
 * raises - why does this do nothing - has no answer anywhere on the page.
 */
function PartySwitch() {
  const t = railDict(useLocale()).tabs.party
  const { on, set } = useParty()
  if (!set) return null

  return (
    <RoomSwitch label={t.label} on={on} onChange={set} note={on ? t.on : t.off} />
  )
}

/**
 * Turn the room to rainbow glass.
 *
 * The other broadcast switch, and it renders under exactly the same conditions
 * as the party for exactly the same reason - see above. What it does *not*
 * touch is the animals: everybody stays legible as themselves while the place
 * around them goes transparent, because a room where you cannot tell who is who
 * is a room nobody can play in. Furniture stays solid too, a rainbow tree being
 * a tree-shaped smear rather than a tree.
 */
function RainbowSwitch() {
  const t = railDict(useLocale()).tabs.rainbow
  const { on, set } = useRainbowSwitch()
  if (!set) return null

  return (
    <RoomSwitch label={t.label} on={on} onChange={set} note={on ? t.on : t.off} />
  )
}

/**
 * The switch both of the above are.
 *
 * Extracted when the second one arrived rather than before it: two switches
 * that must look and behave alike is a component, one is a shape.
 */
function RoomSwitch({
  label,
  note,
  on,
  onChange,
}: {
  label: string
  note: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="px-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
          on
            ? 'border-accent/60 bg-accent/10 text-ink'
            : 'border-line/60 text-ink-muted hover:text-ink'
        }`}
      >
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full ring-1 transition ${
            on ? 'bg-accent ring-accent' : 'bg-surface-raised ring-line'
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
              on ? 'left-[1.125rem]' : 'left-0.5 opacity-60'
            }`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{label}</span>
          <span className="block text-[10px] leading-snug text-ink-muted">{note}</span>
        </span>
      </button>
    </div>
  )
}

function RoomTab({
  slug,
  door,
}: {
  slug: string
  door: ReturnType<typeof useDoor>
}) {
  const t = railDict(useLocale()).tabs.door

  if (!door) {
    return (
      <p className="px-3 text-[11px] leading-relaxed text-ink-muted">{t.away}</p>
    )
  }

  return (
    <div className="space-y-2 pb-2">
      <FrontDoorControls slug={door.slug} mode={door.mode} />
      <Knocking knocks={door.knocks} />
      <p className="px-3 pt-1 text-[10px] leading-relaxed text-ink-muted">
        {fill(t.applies, { where: slug === door.slug ? t.thisSpace : door.slug })}
      </p>
    </div>
  )
}

/**
 * Whoever is waiting outside.
 *
 * Directly under the setting that caused them to be waiting, because the two
 * are one thought: a knock only exists because the door says `knock`, and the
 * fastest fix for a queue of them is the control immediately above.
 */
function Knocking({ knocks }: { knocks: Knock[] }) {
  const t = railDict(useLocale()).tabs.door

  if (knocks.length === 0) return null

  return (
    <ul className="pt-1.5">
      {knocks.map((knock) => (
        <li key={knock.userId} className="px-1 py-1">
          <div className="flex items-center gap-2.5 pb-1.5">
            <Face name={knock.name} here={false} />
            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={knock.name}>
              {knock.name}
            </span>
          </div>
          <div className="flex gap-1 pl-[2.375rem]">
            <button
              type="button"
              onClick={() => doorActions()?.admit(knock.userId)}
              className="flex-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-600 transition hover:bg-emerald-500/25"
            >
              {t.letIn}
            </button>
            <button
              type="button"
              onClick={() => doorActions()?.refuse(knock.userId)}
              className="flex-1 rounded-lg border border-line/70 px-2 py-1 text-[11px] text-ink-muted transition hover:bg-line/40 hover:text-ink"
            >
              {t.notNow}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
