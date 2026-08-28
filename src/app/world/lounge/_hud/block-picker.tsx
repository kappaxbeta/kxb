'use client'

import { useMemo, useState } from 'react'
import { PALETTE_GROUPS, type PaletteGroupId, thumbnailUrl } from '@/domain/lounge/palette'
import { DEFAULT_WORLD_SIZE } from '@/domain/lounge/events'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict, type WorldDict } from '@/app/i18n/world'
import {
  GOAL_KINDS,
  type Goal,
  type GoalKind,
  MAX_GOAL_SIZE,
  MIN_GOAL_SIZE,
} from '@/domain/lounge/goal-events'
import { DEFAULT_TEMPLATE_ID, WORLD_TEMPLATES } from '@/domain/lounge/templates'
import { templateMark } from '@/app/world/lounge/_canvas/template-marks'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The block picker - Minecraft's inventory screen, roughly.
 *
 * Replaces a strip of 58 text buttons, which was unusable for the reason all
 * text-only pickers are: choosing "gravel_with_snow" from a wall of
 * underscore-separated words means reading every option, every time. A grid of
 * pictures is scanned, not read.
 *
 * Opening it releases pointer lock, exactly as Minecraft does. That is not
 * incidental - while the picker is open the mouse has to be a cursor again, and
 * the place/break handler keys off `document.pointerLockElement`, so releasing
 * the lock also disarms building for free.
 *
 * ---------------------------------------------------------------------------
 * Why this is tabbed, and why it fills a phone
 * ---------------------------------------------------------------------------
 * It used to be one long scroll: goals, then fifty-eight blocks, then the world
 * controls, then the pitch, then the reset - each a footer row stacked under a
 * grid that took every pixel it was given. On a desktop you saw all of it. On a
 * phone the grid ate the panel and the four footers were somewhere past the
 * bottom of the screen, so "lay a pitch" and "reset the world" were features
 * nobody on a handset knew existed.
 *
 * Tabs fix that by being the one layout where a section's height does not
 * depend on the section above it. Three tabs, each one screenful: what you are
 * holding, the goals, and the world itself.
 *
 * The panel is also full-bleed on a phone and a centred dialog from `sm` up.
 * There is no in-between worth having - a 92%-wide box on a 360px screen is a
 * 331px box with a useless margin, and the margin was costing a column of the
 * block grid.
 */

/**
 * What a block is called, for somebody choosing one.
 *
 * The dictionary first, then the id prettified: `dirt_with_grass` becomes
 * `Dirt with grass`, which is what this did on its own and is still the right
 * answer for a block nobody has written a word for. The id itself never
 * changes - it is what a placement stores.
 */
function label(model: string, words: WorldDict['picker']['blocks']): string {
  const said = words[model]
  if (said) return said
  const plain = model.replace(/_/g, ' ')
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

/**
 * The goal editor's half of the picker's props.
 *
 * Handed in whole rather than as eight loose callbacks, because it is all-or-nothing:
 * a read-only world gets none of it, and a world that can be built in gets the lot.
 */
export interface GoalControls {
  list: readonly Goal[]
  /** Stand a new one where the player is standing. */
  onAdd: (kind: GoalKind) => void
  /** Stand the template's red-and-blue pair, blocks untouched. */
  onAddPair: () => void
  onResize: (id: string, width: number, height: number) => void
  /** Quarter-turn it, so it can face across the other axis. */
  onRotate: (id: string) => void
  /** Make it something else: the other side, or a race mark. */
  onTeam: (id: string, kind: GoalKind) => void
  onRemove: (id: string) => void
  /** The id of whichever goal is mid-request, so its row can be disabled. */
  busy?: string | null
}

/**
 * Where people come in, and how to move it.
 *
 * Its own tab, and that separation is the point rather than tidiness. It first
 * went in beside the marks, on the grounds that everything there is a spot on
 * the floor placed by standing on it - and that reading is exactly the confusion
 * to avoid, because one of those marks is a race's `start`. A start line is
 * where a *field lines up when a race begins*; a spawn is where anybody who
 * opens the door appears, race or no race. Two different questions that both
 * answer "where do people stand", filed under one heading, is how somebody sets
 * one meaning to change the other.
 *
 * So: its own tab, its own word - Arrival - and no mention of a match.
 *
 * A ring is drawn for it on the ground in the world (see `SpawnMark`), which is
 * what this edits. Null where the viewer cannot move it: `world_spawns` is
 * owner-and-admin only, and a button that always fails is worse than no button.
 */
export interface SpawnControls {
  /** The current door, or null for the middle of the world. */
  at: { x: number; z: number } | null
  /** Put it where the player is standing. */
  onSet: () => void
  /** Back to the middle. */
  onClear: () => void
  busy: boolean
  error: string | null
  /**
   * Whether the ring is drawn at all, and the switch for it.
   *
   * A property of the world, saved with it. The ring is a nine-block circle of
   * chalk in the middle of a room - exactly what you want while you are deciding
   * where the door goes, and exactly what you do not want in the room afterwards
   * - so an owner who puts it away has put it away for everybody walking in, and
   * finds it still away on the next device they open the room on.
   *
   * Only the people who can move the spawn get the switch, because they are the
   * only ones who see the tab, and it is the same authority that decides where
   * the door is in the first place.
   */
  visible: boolean
  onVisible: (next: boolean) => void
}

/**
 * Laying one of the catalogue's worlds down.
 *
 * One callback for every template, rather than the two the picker used to take
 * (`onReset` and `onPitch`): those were the same verb - clear the world, lay
 * something - with the payload hard-coded into the prop name, so a third ground
 * meant a third prop and a fourth footer row. The catalogue in
 * domain/lounge/templates.ts is the list now, and this is how it is applied.
 *
 * Omitted when the viewer may not rebuild the world, which hides the section.
 */
export interface TemplateControls {
  onApply: (templateId: string) => void
  /** True while one is being laid, which disables all of them. */
  busy: boolean
  /** Why the last one was refused, if it was. Null when nothing is wrong. */
  note?: string | null
  /**
   * Clear the world and lay nothing back down.
   *
   * Not one more entry in `WORLD_TEMPLATES` - `templates.test.ts` asserts every
   * catalogue template lays *something*, on purpose, because a template you
   * cannot tell apart from a bug is not a template. This is its own control
   * for its own reason: a room opens exactly this way (see `createRoom`), so
   * it is the way back rather than a ground to stand on.
   *
   * Omitted where emptying the world does not make sense - the lounge and a
   * battlefield are meant to have a floor.
   */
  onEmpty?: () => void
}

/**
 * Saving and loading whole worlds, as the picker offers it.
 *
 * The controls themselves live in the scene - they already existed as a chip in
 * the top-right HUD - and this is a second, findable home for them: a tiny
 * unlabelled select in a corner turned out to be where world-loading went to be
 * undiscovered, and the picker is the one screen people already open to change
 * the world.
 */
export interface WorldControls {
  arenas: { worldId: string; name: string }[]
  onSave: () => void
  /** Absent when the viewer may not overwrite the lounge - it is the owner's call. */
  onLoad?: (worldId: string, name: string) => void
  busy: boolean
  note: string | null
}

type Tab = 'blocks' | 'goals' | 'spawn' | 'worlds'

export function BlockPicker({
  open,
  selected,
  onSelect,
  onClose,
  templates,
  resetting = false,
  goals,
  spawn,
  worlds,
  catalogueHref,
}: {
  open: boolean
  selected: string
  onSelect: (model: string) => void
  onClose: () => void
  /** Laying a template world. Omitted when the world is read-only. */
  templates?: TemplateControls
  resetting?: boolean
  /**
   * The goals in this world, and what may be done to them.
   *
   * Here rather than in a panel of its own because a goal is a thing you place while
   * building, and this is the screen you are already in when you are choosing what to
   * place. Opening the picker also releases pointer lock, which is exactly what
   * resizing a goal with buttons needs.
   */
  goals?: GoalControls
  /**
   * Where people come in. Its own tab, and its own thing - see `SpawnControls`
   * for why it is deliberately not filed with the marks above.
   */
  spawn?: SpawnControls | null
  /** Saving this world as an arena, and replacing it with a saved one. */
  worlds?: WorldControls
  /**
   * Where the world catalogue is, for this space.
   *
   * Separate from `worlds` above, and deliberately: those controls answer to
   * the owner/admin pair because they overwrite the room everybody is standing
   * in. *Finding* a world is not that - it is a link to a page - and gating
   * discovery behind moderation is how a catalogue stays a thing only two
   * people in the space know exists.
   */
  catalogueHref?: string
}) {
  const t = worldDict(useLocale()).picker
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('blocks')

  const hasWorlds = Boolean(templates || worlds || catalogueHref)

  /**
   * The panel is always in the DOM, hidden with classes rather than unmounted.
   *
   * The usual mount-then-animate dance needs two pieces of state and a
   * requestAnimationFrame to give the browser something to transition *from* -
   * and it sets state inside an effect, which tears under concurrent rendering.
   * Keeping the element mounted means `open` alone can drive the transition,
   * because the element it applies to already exists.
   *
   * `inert` is what makes that safe: while closed the panel is unreachable by
   * keyboard and invisible to screen readers, so an always-present dialog does
   * not become a focus trap sitting under the page.
   */

  /**
   * A tab that stops being offered must not stay selected.
   *
   * The goals tab disappears the moment the lounge is switched out of creative
   * mode, and the picker is mounted the whole time - so without this, somebody
   * who was on it is left looking at a panel with nothing in it and no obvious
   * way back.
   *
   * Derived rather than corrected in an effect. Both say the same thing, but an
   * effect that calls `setTab` renders the empty panel first and fixes it on the
   * next pass; this never renders it at all.
   */
  const active: Tab =
    (tab === 'goals' && !goals) ||
    (tab === 'spawn' && !spawn) ||
    (tab === 'worlds' && !hasWorlds)
      ? 'blocks'
      : tab

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return PALETTE_GROUPS.map((group) => ({
      // The id, not the name: the heading is drawn from the dictionary below.
      id: group.id,
      models: needle
        ? group.models.filter((model) => model.includes(needle))
        : [...group.models],
    })).filter((group) => group.models.length > 0)
  }, [query])

  return (
    <div
      // `inert` while closed: not focusable, not announced, not clickable -
      // which is what lets the panel stay mounted without trapping anything.
      inert={!open}
      aria-hidden={!open}
      /**
       * z-30, above the touch controls.
       *
       * They are z-20 and rendered after this in the scene, so at equal
       * z-index the thumbstick and the jump/dash stack painted *over* an open
       * picker - which is most of what "the picker does not work on mobile"
       * was. The scene also stops rendering them while this is open; the
       * z-index is the belt to that pair of braces.
       */
      className={`absolute inset-0 z-30 flex items-center justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] transition-opacity duration-200 sm:p-4 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Backdrop. Clicking it closes, which is the gesture everyone tries. */}
      <button
        type="button"
        aria-label={t.closePicker}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[oklch(0.06_0.03_285_/_0.72)] backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.dialog}
        /**
         * Full-height on a phone, a centred dialog from `sm` up.
         *
         * Sized rather than positioned: `.hud-panel` sets `position: relative`
         * in globals.css, and a `.absolute` utility loses to it - the class
         * comes later in the sheet. So the safe-area insets live on the flex
         * parent as padding and this just fills what is left.
         *
         * `touch-manipulation` turns off the 300ms double-tap-zoom delay, which
         * on a grid of 58 tiles was the difference between "tap" and "tap,
         * wait, wonder whether it registered".
         */
        className={`hud-panel flex h-full w-full touch-manipulation flex-col overflow-hidden transition-all duration-200 sm:h-auto sm:max-h-[85%] sm:w-[min(56rem,92vw)] ${
          open ? 'translate-y-0 scale-100' : 'translate-y-3 scale-95'
        }`}
      >
        {/* --- header: what this is, and the way out ------------------------- */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line/50 px-3 py-2 sm:px-5 sm:py-3">
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto p-3"
            // The tab strip is the one thing that may scroll sideways, and only
            // on the narrowest handsets. Everything else wraps.
          >
            <TabButton active={active === 'blocks'} onClick={() => setTab('blocks')}>
              {t.tabs.blocks}
            </TabButton>
            {goals && (
              <TabButton active={active === 'goals'} onClick={() => setTab('goals')}>
                {t.tabs.goals}
                {goals.list.length > 0 && (
                  <span className="ml-1 tabular-nums opacity-60">
                    {goals.list.length}
                  </span>
                )}
              </TabButton>
            )}
            {spawn && (
              <TabButton active={active === 'spawn'} onClick={() => setTab('spawn')}>
                {t.tabs.spawn}
              </TabButton>
            )}
            {hasWorlds && (
              <TabButton active={active === 'worlds'} onClick={() => setTab('worlds')}>
                {t.tabs.worlds}
              </TabButton>
            )}
          </div>

          {/*
            A real target, not a 20px "Esc" label.

            44px is the smallest thing a thumb hits reliably, and this is the
            control somebody reaches for while a scene is running behind it.
          */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent/15 hover:text-ink sm:size-9"
          >
            <span aria-hidden className="text-lg leading-none">
              ✕
            </span>
          </button>
        </div>

        {/* --- the tab itself ----------------------------------------------- */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
          {active === 'blocks' && (
            <BlocksTab
              groups={groups}
              query={query}
              onQuery={setQuery}
              selected={selected}
              onPick={(model) => {
                onSelect(model)
                onClose()
              }}
            />
          )}

          {active === 'goals' && goals && <GoalSection goals={goals} />}
          {active === 'spawn' && spawn && <SpawnSection spawn={spawn} />}

          {active === 'worlds' && hasWorlds && (
            <WorldsTab
              templates={templates}
              worlds={worlds}
              catalogueHref={catalogueHref}
              resetting={resetting}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition sm:py-1.5 ${
        active
          ? 'bg-accent/20 text-ink shadow-[0_0_1rem_oklch(0.7_0.27_322_/_0.35)] ring-1 ring-accent/60'
          : 'text-ink-muted hover:bg-accent/10 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** The palette itself: a search box and a grid of pictures. */
function BlocksTab({
  groups,
  query,
  onQuery,
  selected,
  onPick,
}: {
  groups: { id: PaletteGroupId; models: string[] }[]
  query: string
  onQuery: (value: string) => void
  selected: string
  onPick: (model: string) => void
}) {
  const t = worldDict(useLocale()).picker

  return (
    <>
      {/*
        Sticky, so the search stays reachable after scrolling into the props.
        It needs a background of its own - a transparent bar over a scrolling
        grid of thumbnails is unreadable - and that background has to be the
        *panel's* colour, not a darker one. A near-black strip between the tab
        row and the grid reads as a hole cut in the glass rather than as part of
        it; this is the top stop of `.hud-panel`'s own gradient, lifted to an
        opacity that hides what scrolls under it.
      */}
      <div className="sticky -top-3 z-10 -mx-3 mb-3  px-3 pb-2 pt-3 sm:-top-4 sm:-mx-5 sm:px-5 sm:pt-4">
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="w-full rounded-full border border-line/60 bg-surface/70 px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-accent focus:shadow-[0_0_0_3px_oklch(0.7_0.27_322_/_0.18)] sm:py-1.5 sm:text-xs"
        />
      </div>

      {groups.map((group) => (
        <section key={group.id} className="mb-5 last:mb-0">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
            {t.groups[group.id]}
          </h3>
          {/*
            Four across on the narrowest handset and as many as fit after that.
            `minmax(0, 1fr)` rather than a fixed minimum, because a fixed one
            (5.5rem, as it was) drops a 360px screen to three columns and then
            leaves half a column of dead margin.
          */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] sm:gap-2">
            {group.models.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => onPick(model)}
                title={label(model, t.blocks)}
                className={`group flex flex-col items-center gap-1 rounded-2xl border p-1.5 transition sm:p-2 ${
                  selected === model
                    ? 'border-accent bg-accent/15 shadow-[0_0_1.2rem_oklch(0.7_0.27_322_/_0.35)]'
                    : 'border-transparent bg-white/[0.04] hover:border-accent/50 hover:bg-accent/10'
                }`}
              >
                <span className="flex size-12 items-center justify-center sm:size-14">
                  {/*
                    A plain <img>, not next/image. These are already the exact
                    size they are drawn at and already WebP, so the optimizer
                    has nothing to do but add a round trip through
                    /_next/image for each of 58 tiles.

                    Lazy, because the panel is a scroller and the props at the
                    bottom are three screenfuls down - a phone that opens the
                    picker to change one terrain block should not pay for the
                    furniture. `decoding="async"` keeps the decode off the
                    thread the 3D scene behind this is still using.

                    Width and height are set so the row reserves its space
                    before the image lands; without them the grid reflows as
                    each tile arrives, which is what the old placeholder
                    existed to prevent.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl(model)}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    className="size-12 transition-transform group-hover:scale-110 sm:size-14"
                    draggable={false}
                  />
                </span>
                <span className="w-full truncate text-center text-[10px] leading-tight text-ink-muted">
                  {label(model, t.blocks)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-8 text-center text-xs text-ink-muted">
          Nothing matches “{query}”.
        </p>
      )}
    </>
  )
}

/**
 * The confirm-state key for the "Empty" card, which is not a `WORLD_TEMPLATES`
 * entry - see the note on `TemplateControls.onEmpty` - but shares the same
 * one-question-at-a-time `confirming` latch as the cards that are.
 */
const EMPTY_ID = '__empty__'

/**
 * The world tab: where you are, and what else you could be standing in.
 *
 * Three things in one place, in the order somebody reaches for them: lay a
 * fresh world from a template, load one this space saved, or save this one.
 * They used to be four separate footer strips below the block grid, which is
 * how "reset the world" ended up invisible on every phone.
 */
function WorldsTab({
  templates,
  worlds,
  catalogueHref,
  resetting,
}: {
  templates?: TemplateControls
  worlds?: WorldControls
  catalogueHref?: string
  resetting: boolean
}) {
  /**
   * Which template is asking twice.
   *
   * One latch, not one per card: only one question can be on screen at a time,
   * and giving each card its own state meant two cards could both be showing
   * "yes, wipe it" - which is exactly the moment to hit the wrong one.
   */
  const t = worldDict(useLocale()).picker
  const [confirming, setConfirming] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const arenas = useMemo(() => worlds?.arenas ?? [], [worlds])
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return arenas
    return arenas.filter((arena) => arena.name.toLowerCase().includes(needle))
  }, [arenas, filter])

  const busy = resetting || templates?.busy || worlds?.busy

  return (
    <div className="space-y-6">
      {templates && (
        <section>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
            {t.startWorld}
          </h3>
          <p className="mb-3 mt-1 text-[11px] text-ink-muted">{t.startWorldNote}</p>

          {templates.note && (
            <p className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
              {templates.note}
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            {WORLD_TEMPLATES.map((template) => {
              const asking = confirming === template.id

              return (
                <li
                  key={template.id}
                  className={`rounded-2xl border p-3 transition ${
                    asking
                      ? 'border-accent bg-accent/10 shadow-[0_0_1.2rem_oklch(0.7_0.27_322_/_0.3)]'
                      : 'border-line/50 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="size-9 shrink-0 text-[var(--color-accent-2)]">
                      {templateMark(template.id)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {t.templates[template.id].name}
                        {/* The one a match is set on unless somebody says
                            otherwise - worth saying here too, so the ground the
                            battle lobby picks by itself is not a surprise. */}
                        {template.id === DEFAULT_TEMPLATE_ID && (
                          <span className="rounded-full border border-[var(--color-accent-2)]/50 px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-accent-2)]">
                            {t.default}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] leading-snug text-ink-muted">
                        {asking
                          ? t.confirmLay
                          : fill(t.templates[template.id].blurb, {
                              n: DEFAULT_WORLD_SIZE,
                            })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    {asking ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="rounded-full px-3 py-2 text-xs text-ink-muted transition hover:bg-white/10 sm:py-1.5"
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(null)
                            templates.onApply(template.id)
                          }}
                          className="rounded-full bg-accent px-4 py-2 text-xs font-medium transition disabled:opacity-50 sm:py-1.5"
                        >
                          {busy ? t.laying : t.layIt}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirming(template.id)}
                        className="rounded-full border border-accent/60 px-4 py-2 text-xs text-ink transition hover:bg-accent/15 disabled:opacity-50 sm:py-1.5"
                      >
                        {busy ? t.working : t.useThis}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}

            {templates.onEmpty && (
              <li
                className={`rounded-2xl border p-3 transition ${
                  confirming === EMPTY_ID
                    ? 'border-accent bg-accent/10 shadow-[0_0_1.2rem_oklch(0.7_0.27_322_/_0.3)]'
                    : 'border-line/50 bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="size-9 shrink-0 text-[var(--color-accent-2)]">
                    {templateMark(EMPTY_ID)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{t.empty}</p>
                    <p className="text-[11px] leading-snug text-ink-muted">
                      {confirming === EMPTY_ID ? t.confirmEmpty : t.emptyBlurb}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  {confirming === EMPTY_ID ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-full px-3 py-2 text-xs text-ink-muted transition hover:bg-white/10 sm:py-1.5"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(null)
                          templates.onEmpty?.()
                        }}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-medium transition disabled:opacity-50 sm:py-1.5"
                      >
                        {busy ? t.clearing : t.emptyIt}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(EMPTY_ID)}
                      className="rounded-full border border-accent/60 px-4 py-2 text-xs text-ink transition hover:bg-accent/15 disabled:opacity-50 sm:py-1.5"
                    >
                      {busy ? t.working : t.useThis}
                    </button>
                  )}
                </div>
              </li>
            )}
          </ul>
        </section>
      )}

      {worlds && (
        <section>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
            {t.arenas}
          </h3>
          <p className="mb-3 mt-1 text-[11px] text-ink-muted">{t.arenasNote}</p>

          {/* The filter appears only when there is enough to filter. A search
              box over three names is furniture. */}
          {worlds.onLoad && arenas.length > 5 && (
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t.findArena}
              aria-label={t.findArenaLabel}
              className="mb-2 w-full rounded-full border border-line/60 bg-surface/70 px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-accent sm:py-1.5 sm:text-xs"
            />
          )}

          {worlds.onLoad && matches.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {matches.map((arena) => (
                <li key={arena.worldId}>
                  <button
                    type="button"
                    disabled={worlds.busy}
                    onClick={() => worlds.onLoad?.(arena.worldId, arena.name)}
                    title={fill(t.replaceTitle, { name: arena.name })}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line/40 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-ink transition hover:border-accent/60 hover:bg-accent/10 disabled:opacity-50 sm:py-2"
                  >
                    <span className="min-w-0 truncate">{arena.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-muted">{t.load}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {worlds.onLoad && arenas.length > 0 && matches.length === 0 && (
            <p className="mb-3 text-[11px] text-ink-muted">
              {fill(t.noMatches, { query: filter })}
            </p>
          )}

          {arenas.length === 0 && (
            <p className="mb-3 text-[11px] text-ink-muted">
              {t.nothingSaved}
            </p>
          )}

          <button
            type="button"
            disabled={worlds.busy}
            onClick={worlds.onSave}
            className="w-full rounded-full border border-[var(--color-accent-2)]/60 px-4 py-2.5 text-xs text-[var(--color-accent-2)] transition hover:bg-[var(--color-accent-2)]/10 disabled:opacity-50 sm:w-auto sm:py-1.5"
          >
            {worlds.busy ? t.working : t.saveArena}
          </button>

          {worlds.note && (
            <p className="mt-2 text-[11px] text-ink-muted">{worlds.note}</p>
          )}
        </section>
      )}

      {catalogueHref && (
        <section>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
            {t.elsewhere}
          </h3>
          <p className="mb-3 mt-1 text-[11px] text-ink-muted">{t.elsewhereNote}</p>
          {/*
            An ordinary link, and it leaves the world. Which is the right
            trade: browsing a catalogue is reading, comparing and turning
            things round, and doing that in a panel over a live 3D scene means
            a fraction of the room to do it in while the scene carries on
            rendering behind it.
          */}
          <a
            href={catalogueHref}
            className="inline-block w-full rounded-full border border-line/60 px-4 py-2.5 text-center text-xs text-ink transition hover:border-accent/60 hover:bg-accent/10 sm:w-auto sm:py-1.5"
          >
            {t.discover}
          </a>
        </section>
      )}
    </div>
  )
}

/**
 * Mark colours, matching the posts in the world and the nameplates.
 *
 * The two goals are their sides' colours. A start is green because it is the one
 * thing in a world that means "go", and a finish is white for the chequer it is
 * drawn with - both readable against grass, snow and a night sky, which is the
 * same test the goal colours had to pass.
 */
const KIND_STYLES: Record<GoalKind, string> = {
  red: 'border-red-500/60 bg-red-500/15 text-red-300',
  blue: 'border-blue-400/60 bg-blue-500/15 text-blue-300',
  start: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300',
  finish: 'border-white/60 bg-white/15 text-white',
}

/**
 * The next thing a mark can be.
 *
 * One button that cycles rather than four that set, because the list is short
 * and a row of four buttons on every mark would be most of the row. It replaced
 * a red/blue toggle, which is the same control with two fewer stops.
 */
function nextKind(kind: GoalKind): GoalKind {
  const order = GOAL_KINDS
  return order[(order.indexOf(kind) + 1) % order.length] ?? 'red'
}

/**
 * A stepper big enough to hit with a thumb.
 *
 * 2.25rem on touch-sized screens and 1.5rem from `sm` up. The old one was
 * 1.5rem everywhere, which is under half the 44px a finger actually lands on -
 * and these sit in a row of six, so missing one hits its neighbour.
 */
const STEPPER =
  'flex size-9 items-center justify-center rounded-lg border border-line/50 bg-white/[0.06] text-sm leading-none text-ink transition hover:border-accent/60 hover:bg-accent/15 disabled:opacity-40 sm:size-6 sm:text-xs'

/**
 * The goals in this world, and the controls for them.
 *
 * Listed rather than selected by clicking one in the world, and that is a deliberate
 * trade. Picking a goal with the crosshair would mean making the posts targetable,
 * which puts them in the way of the block you were trying to place behind them - and
 * a goal is a thing you adjust a handful of times, not something you reach for
 * constantly. A list of two rows is also simply easier to hit than a post.
 *
 * Every control is a whole-cell step, because a goal sits on the same lattice as
 * everything else - so it can be lined up against what was built around it.
 */
function GoalSection({ goals }: { goals: GoalControls }) {
  const t = worldDict(useLocale()).picker
  const { list, onAdd, onAddPair, onResize, onRotate, onTeam, onRemove, busy } = goals

  return (
    <section>
      <div className="mb-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
          {t.marks}
        </h3>
        <p className="mt-1 text-[11px] text-ink-muted">{t.marksNote}</p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {GOAL_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => onAdd(kind)}
              className={`rounded-full border px-3 py-2.5 text-xs font-medium transition hover:brightness-125 sm:py-1.5 ${KIND_STYLES[kind]}`}
            >
              + {t.kinds[kind]}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        /**
         * The empty state is the moment somebody is preparing a match, so it does
         * the preparing: one button, both goals, at the template's two ends. The
         * pitch template on the worlds tab is the wrong answer here when the world
         * is something people already built - it flattens everything first.
         */
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line/40 bg-white/[0.03] px-4 py-6">
          <p className="text-center text-[11px] text-ink-muted">{t.noMarks}</p>
          <button
            type="button"
            disabled={busy === 'new'}
            onClick={onAddPair}
            className="rounded-full bg-accent px-5 py-2.5 text-xs font-medium transition disabled:opacity-50 sm:py-1.5"
          >
            {busy === 'new' ? t.standing : t.standBoth}
          </button>
          <p className="text-center text-[10px] text-ink-muted/80">{t.standBothNote}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((goal) => (
            <li
              key={goal.id}
              className={`rounded-2xl border px-3 py-2.5 text-xs ${KIND_STYLES[goal.kind]}`}
            >
              <div className="flex items-center gap-2">
                {/* Tap it to make it the next thing along: red, blue, start,
                    finish, round again. */}
                <button
                  type="button"
                  disabled={busy === goal.id}
                  onClick={() => onTeam(goal.id, nextKind(goal.kind))}
                  title={t.changeMark}
                  className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium transition hover:bg-white/25 disabled:opacity-40 sm:py-0.5"
                >
                  {t.kinds[goal.kind]}
                </button>

                <span className="text-[10px] tabular-nums opacity-70">
                  {goal.x}, {goal.y}, {goal.z}
                </span>

                <button
                  type="button"
                  disabled={busy === goal.id}
                  onClick={() => onRotate(goal.id)}
                  title={t.turnMark}
                  aria-label={t.turnMark}
                  className={`${STEPPER} ml-auto`}
                >
                  ⟳
                </button>

                <button
                  type="button"
                  disabled={busy === goal.id}
                  onClick={() => onRemove(goal.id)}
                  title={t.removeMark}
                  aria-label={t.removeMark}
                  className={`${STEPPER} border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/20`}
                >
                  ✕
                </button>
              </div>

              {/*
                Width and height, on their own row.

                They used to share the row above with `ml-auto` on each, which
                on a narrow screen wrapped into a column of six controls in no
                obvious order. A row of their own is one line on a phone and
                still one line on a desktop.
              */}
              <div className="mt-2 flex items-center gap-3">
                {(
                  [
                    ['W', goal.width, (next: number) => onResize(goal.id, next, goal.height)],
                    ['H', goal.height, (next: number) => onResize(goal.id, goal.width, next)],
                  ] as const
                ).map(([axis, value, set]) => (
                  <span key={axis} className="flex items-center gap-1.5">
                    <span className="text-[10px] opacity-70">{axis}</span>
                    <button
                      type="button"
                      disabled={busy === goal.id || value <= MIN_GOAL_SIZE}
                      onClick={() => set(value - 1)}
                      aria-label={fill(t.narrower, { axis })}
                      className={STEPPER}
                    >
                      −
                    </button>
                    <span className="w-4 text-center tabular-nums">{value}</span>
                    <button
                      type="button"
                      disabled={busy === goal.id || value >= MAX_GOAL_SIZE}
                      onClick={() => set(value + 1)}
                      aria-label={fill(t.wider, { axis })}
                      className={STEPPER}
                    >
                      +
                    </button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The always-visible reminder of what you are holding.
 *
 * Doubles as the open button, because on touch there is no E key to press.
 */
export function SelectedBlockChip({
  selected,
  onOpen,
  isTouch,
}: {
  selected: string
  onOpen: () => void
  isTouch: boolean
}) {
  const t = worldDict(useLocale()).picker

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hud-chip pointer-events-auto !py-1.5 !pl-1.5 !pr-4"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-white/10">
        {/*
          Eager, unlike the grid's: this one is on screen from the moment the
          world is, and it is the HUD's answer to "what am I holding".

          It used to fall back to a grey square, because the picture did not
          exist until somebody had opened the picker and let it render - so the
          chip showed a blank for anybody who had not. A file has no such
          state.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(selected)}
          alt=""
          width={32}
          height={32}
          decoding="async"
          className="size-8"
          draggable={false}
        />
      </span>
      <span className="text-left">
        <span className="block text-xs font-medium leading-tight text-ink">
          {label(selected, t.blocks)}
        </span>
        <span className="block text-[10px] leading-tight text-ink-muted">
          {isTouch ? t.tapToChange : t.pressE}
        </span>
      </span>
    </button>
  )
}

/**
 * The Arrival tab.
 *
 * One question, asked plainly, with nothing about matches on the panel: where
 * does somebody who opens the door to this world end up standing? See
 * `SpawnControls` for why it is not filed with the marks.
 *
 * Placed by standing there, and there is no field to type a coordinate into on
 * purpose - the whole point of the ring drawn on the floor is that the spawn is
 * a *place*, and walking to it is how a person picks a place. The coordinates
 * are printed, because "did that button do anything" needs an answer even when
 * you are standing on top of the thing that changed.
 */
function SpawnSection({ spawn }: { spawn: SpawnControls }) {
  const refusal = useRefusal()
  const t = worldDict(useLocale()).picker

  return (
    <section>
      <div className="mb-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
          {t.arrival}
        </h3>
        <p className="mt-1 text-[11px] text-ink-muted">{t.arrivalNote}</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/40 bg-white/[0.03] px-4 py-6">
        <p className="text-center text-[11px] text-ink-muted">
          {spawn.at
            ? fill(t.arriveAt, { x: spawn.at.x, z: spawn.at.z })
            : t.arriveMiddle}
        </p>

        <button
          type="button"
          disabled={spawn.busy}
          onClick={spawn.onSet}
          className="rounded-full bg-accent px-5 py-2.5 text-xs font-medium transition disabled:opacity-50 sm:py-1.5"
        >
          {spawn.busy ? t.movingDoor : t.arriveHere}
        </button>

        {spawn.at && (
          <button
            type="button"
            disabled={spawn.busy}
            onClick={spawn.onClear}
            className="rounded-full border border-line/60 px-4 py-2 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 sm:py-1"
          >
            {t.backToMiddle}
          </button>
        )}

        <p className="text-center text-[10px] text-ink-muted/80">{t.arrivalHint}</p>

        {/*
          The ring is a working marker, not decoration - see `SpawnControls`.

          Below the buttons, because it is about looking rather than about
          placing, and nobody reaches for it until the placing is done. Offered
          only once there is a door: with none, people arrive in the middle by
          default, nothing is drawn, and a switch for an invisible ring is a
          switch that appears to be broken.
        */}
        {spawn.at && (
        <label className="mt-1 flex items-center gap-2 border-t border-line/40 pt-3 text-[11px] text-ink-muted">
          <input
            type="checkbox"
            checked={spawn.visible}
            onChange={(event) => spawn.onVisible(event.target.checked)}
            className="size-3.5 rounded border-line accent-accent"
          />
          {t.showRing}
          <span className="text-ink-muted/70">{t.forEveryone}</span>
        </label>
        )}

        {spawn.error && (
          <p role="alert" className="text-center text-[11px] text-red-300">
            {refusal(spawn.error)}
          </p>
        )}
      </div>
    </section>
  )
}
