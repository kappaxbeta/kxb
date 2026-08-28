'use client'

import { useMemo } from 'react'
import {
  actionKey,
  ControlsPanel,
  gesture,
  HelpButton,
  key,
  mouse,
  PaletteTile,
  row,
  useControlsPanel,
  wasd,
  type ControlRow,
} from '@/app/world/_hud/hud'
import { PROPS, prop, propThumbUrl, refundOf } from '@/domain/cafe/catalog'
import {
  ambience,
  canBuyTile,
  expansionCost,
  expansionFor,
  freeSeats,
  menu,
  propAt,
  seats,
  tipMultiplier,
  type CafeState,
} from '@/domain/cafe/game'
import type { TileKey } from '@/domain/world/grid'
import { ITEMS, recipe } from '@/domain/cafe/recipes'
import { cafeDict, cafeItemName, cafePropWords, type CafeDict } from '@/app/i18n/cafe'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * Everything the player needs to know that the room cannot tell them.
 *
 * Deliberately thin. The orders are above the customers' heads, the ingredients
 * are on the counters, and the room is the progress bar - so the panel is for
 * the two facts with nowhere to live in 3D: how much money there is, and what
 * the keys do.
 */

/** The café's own readouts. A rectangular `.hud-chip` - these hold lists. */
const PANEL =
  'rounded-xl border border-[var(--color-line)] bg-[oklch(0.12_0.04_285/0.75)] px-3 py-2 text-[var(--color-ink)] backdrop-blur'

export function CafeHud({
  state,
  mode,
  locked,
  started,
  ready,
  prompt,
  focus,
  selected,
  moving,
  onSelect,
  onRotate,
  onSell,
  onMove,
  onBuyTile,
  onToggleOpen,
  onMode,
  isTouch,
  compact,
}: {
  state: CafeState
  mode: 'serve' | 'build'
  /** Pointer lock is engaged, so the mouse turns the camera. */
  locked: boolean
  /** The player has clicked in, whether or not pointer lock was granted. */
  started: boolean
  /**
   * The room has finished loading.
   *
   * Tracked by the scene mounting rather than by a loader's progress: two
   * hundred models take a few seconds, and inviting somebody to "take over the
   * kitchen" while the canvas is still black gets them a pointer lock and no
   * world.
   */
  ready: boolean
  prompt: string | null
  focus: TileKey | null
  selected: string
  /** The square a prop has been picked up from, while it is in hand. */
  moving: TileKey | null
  onSelect: (id: string) => void
  onRotate: () => void
  onSell: () => void
  onMove: () => void
  onBuyTile: () => void
  onToggleOpen: () => void
  onMode: (mode: 'serve' | 'build') => void
  /** Touch-primary device: no keyboard legend, and the thumb rig is on screen. */
  isTouch: boolean
  /** Narrow screen: sheets instead of sidebars. */
  compact: boolean
}) {
  const help = useControlsPanel()
  const dishes = useMemo(() => menu(state), [state])
  const covers = useMemo(() => seats(state).length, [state])
  const free = useMemo(() => freeSeats(state).length, [state])
  const nicety = useMemo(() => ambience(state), [state])
  /**
   * What a bill is actually worth, which is the room *and* the house.
   *
   * Showing only the room's ambience here was a quiet lie the moment the house
   * started paying out: a player who had just spent an evening on a fireplace
   * would come back to a café insisting their tips were unchanged.
   */
  const tips = useMemo(
    () => Math.round((tipMultiplier(state) - 1) * 100),
    [state],
  )

  const waiting = state.customers.filter(
    (customer) => customer.state === 'seated' && customer.order,
  )

  /**
   * On a phone the build sheet owns the top of the screen, so the service
   * readouts stand down while building. They are about running the room, and you
   * are not running it - you are rearranging it.
   */
  const t = cafeDict(useLocale())
  const showStats = !(compact && mode === 'build')

  return (
    <>
      {/* --- takings and the room, top left --- */}
      <div
        className={`pointer-events-none absolute left-[var(--hud-edge-x)] top-[var(--hud-edge-top)] flex flex-col gap-2 ${
          showStats ? '' : 'hidden'
        }`}
      >
        <div className={`${PANEL} flex items-center gap-3`}>
          <span className="text-xl font-semibold tabular-nums text-amber-300">
            {state.coins}
            <span className="ml-1 text-xs font-normal text-amber-200/70">{t.coins}</span>
          </span>
          <span className="h-6 w-px bg-white/15" />
          <Stat label={t.served} value={state.served} />
          {!compact && <Stat label={t.walkedOut} value={state.walkedOut} />}
        </div>

        <div className={`${PANEL} flex items-center gap-3 text-xs`}>
          <Stat label={t.covers} value={`${free}/${covers}`} />
          {!compact && <Stat label={t.ambience} value={nicety} />}
          {!compact && state.homeComfort > 0 && (
            <Stat label={t.fromHome} value={state.homeComfort} />
          )}
          <Stat label={t.tips} value={`+${tips}%`} />
        </div>

        {covers === 0 && (
          <div className={`${PANEL} max-w-64 text-xs text-amber-200`}>
            {t.noCovers}
          </div>
        )}
      </div>

      {/* --- the menu and the current orders, top right ---
          Pushed down on a phone to clear the help and mode chips, which now
          occupy that corner. */}
      <div
        className={`pointer-events-none absolute right-[var(--hud-edge-x)] flex flex-col gap-2 ${
           'top-[calc(var(--hud-edge-top)+3.25rem)] w-32'
        } ${showStats ? '' : 'hidden'}`}
      >
        {/**
         * The sign on the door, at the head of the service column.
         *
         * It belongs with the menu and the queue rather than with the takings:
         * all three are about who is coming in and what they can order, and
         * opening up is the thing you do right before you start watching that
         * list. `pointer-events-auto` because the column around it is inert.
         */}
        <button
          type="button"
          onClick={onToggleOpen}
          className={[
            'pointer-events-auto w-full rounded-xl border px-3 py-2 text-left backdrop-blur transition',
            state.open
              ? 'border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30'
              : 'border-red-400/40 bg-red-500/20 hover:bg-red-500/30',
          ].join(' ')}
        >
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                state.open ? 'bg-emerald-400' : 'bg-red-400'
              }`}
            />
            <span className="flex-1 text-sm font-semibold text-white">
              {state.open ? t.open : t.closed}
            </span>
            {/* The column is half as wide on a phone, and a phone has no O key
                to press anyway. */}
            {!compact && (
              <kbd className="rounded bg-white/15 px-1 text-[10px] text-white/70">
                O
              </kbd>
            )}
          </span>
          {!compact && (
            <span className="mt-0.5 block text-[11px] text-white/50">
              {state.open ? t.takingCustomers : t.noNewCustomers}
            </span>
          )}
        </button>

        {/*
          The menu is reference material, and a phone has no room for it beside
          the takings - every dish is already legible on the bubble above the
          customer who ordered it. The one case it has to survive is the empty
          one, which is a diagnosis rather than a list.
        */}
        {(!compact || dishes.length === 0) && (
          <div className={PANEL}>
            <h2 className="mb-1 text-[11px] uppercase tracking-wide text-white/50">
              {t.onTheMenu}
            </h2>
            {dishes.length === 0 ? (
              <p className="text-xs text-white/60">
                {t.nothingCanBeMade}
              </p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {dishes.map((dish) => (
                  <li key={dish.id} className="flex justify-between">
                    <span>{cafeItemName(t, dish)}</span>
                    <span className="tabular-nums text-amber-300">
                      {dish.price}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {waiting.length > 0 && (
          <div className={PANEL}>
            <h2 className="mb-1 text-[11px] uppercase tracking-wide text-white/50">
              {t.waiting}
            </h2>
            <ul className="space-y-1 text-xs">
              {waiting.map((customer) => (
                <li key={customer.id} className="flex items-center gap-2">
                  <span className="w-16 truncate capitalize text-white/70">
                    {customer.avatar}
                  </span>
                  <span className="flex-1 truncate">
                    {cafeItemName(t, recipe(customer.order!))}
                  </span>
                  <Patience value={customer.patience} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* --- crosshair --- */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow" />

      {/* --- what pressing E would do --- */}
      {mode === 'serve' && prompt && (
        <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2">
          <div className={`${PANEL} text-sm`}>
            <kbd className="mr-2 rounded bg-white/15 px-1.5 py-0.5 text-xs">E</kbd>
            {prompt}
          </div>
        </div>
      )}

      {/* --- what you are holding --- */}
      {state.carried && (
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${
            compact ? 'bottom-44' : 'bottom-6'
          }`}
        >
          <div className={`${PANEL} text-sm`}>
            Carrying{' '}
            <span className="font-medium text-amber-300">
              {ITEMS[state.carried]?.name ?? state.carried}
            </span>
          </div>
        </div>
      )}

      {mode === 'build' && (
        <BuildPanel
          state={state}
          focus={focus}
          selected={selected}
          moving={moving}
          compact={compact}
          onSelect={onSelect}
          onRotate={onRotate}
          onSell={onSell}
          onMove={onMove}
          onBuyTile={onBuyTile}
        />
      )}

      {/* A quiet nudge when the mouse is free: the game is still playable. */}
      {started && !locked && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2">
          <div className={`${PANEL} text-[11px] text-white/60`}>
            {t.mouseHint}
          </div>
        </div>
      )}

      {/*
        Mode, and the way back to the keys.

        The keyboard legend that used to sit here is in the controls panel now.
        On a phone it was parked at `bottom-40` - the middle of the screen,
        which is the one place a first-person game cannot spare, and it was
        there only because both bottom corners were already taken by the
        thumbstick and the action button. Two round controls at the top edge
        replace it, and the legend is one tap away.
      */}
      <div
        className={
           'pointer-events-auto absolute right-[var(--hud-edge-x)] top-[var(--hud-edge-top)] z-20 flex items-center gap-2'
        }
      >
        <HelpButton onClick={help.show} />
        <button
          type="button"
          onClick={() => onMode(mode === 'serve' ? 'build' : 'serve')}
          className="hud-chip"
        >
          {mode === 'serve' ? t.build : t.done}
          {!isTouch && <kbd className="rounded bg-white/15 px-1">Tab</kbd>}
        </button>
      </div>

      {/* The controls, which are also the door in. See the house's copy of this
          for why the key list waits on `ready`. */}
      <ControlsPanel
        open={!started || help.open}
        interactive={started}
        isTouch={isTouch}
        rows={ready ? cafeControls(isTouch, mode, t) : []}
        intro={ready ? t.yourCafe : t.settingUp}
        onClose={help.hide}
      />
    </>
  )
}

/**
 * What the café's controls are.
 *
 * Serving and building are two different games sharing a room, so they get two
 * lists - see the same split in the house. `T` only exists while building, and
 * listing it the rest of the time was the old legend's habit of describing a
 * mode you were not in.
 */
function cafeControls(
  isTouch: boolean,
  mode: 'serve' | 'build',
  t: CafeDict,
): ControlRow[] {
  const c = t.controls

  if (isTouch) {
    return mode === 'serve'
      ? [
          row([gesture('stick')], c.move),
          row([gesture('pan')], c.dragToLook),
          row([actionKey(c.use)], c.cookAndServe),
          row([actionKey(t.build)], c.rearrange),
        ]
      : [
          row([gesture('stick')], c.move),
          row([actionKey(c.place)], c.putItDown),
          row([actionKey(c.turn)], c.rotate),
          row([actionKey(c.sell)], c.sellItBack),
          row([actionKey(t.done)], c.stopBuilding),
        ]
  }

  /* Keycaps stay as they are - see the note at the top of `@/app/i18n/world`. */
  return mode === 'serve'
    ? [
        row([wasd()], c.move),
        row([key('Shift')], c.run),
        row([key(c.arrows)], c.look),
        row([actionKey('E')], c.useWhatYouFace),
        row([actionKey('O')], c.openOrClose),
        row([actionKey('Tab')], t.build),
        row([key('L')], c.mouseLook),
        row([key('Esc')], c.freeMouse),
      ]
    : [
        row([mouse('left')], c.place),
        row([mouse('right'), actionKey('X')], c.sell),
        row([actionKey('R')], c.rotate),
        row([key(c.wheel)], c.changeItem),
        row([actionKey('T')], c.buyFloor),
        row([actionKey('Tab')], t.done),
      ]
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1 text-xs text-white/60">
      <span className="font-medium tabular-nums text-white">{value}</span>
      {label}
    </span>
  )
}

function Patience({ value }: { value: number }) {
  const fraction = Math.max(0, Math.min(1, value / 50))
  return (
    <span className="h-1.5 w-8 overflow-hidden rounded-full bg-white/15">
      <span
        className="block h-full rounded-full transition-[width] duration-200"
        style={{
          width: `${fraction * 100}%`,
          backgroundColor: fraction > 0.3 ? '#5ad07a' : '#e0573e',
        }}
      />
    </span>
  )
}


/** A build-panel action, with the key that also does it. */
function PanelButton({
  children,
  onClick,
  disabled,
  hint,
  tone,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  hint: string
  tone: 'plain' | 'good' | 'danger'
}) {
  const tones = {
    plain: 'border-white/15 bg-white/5 hover:bg-white/15',
    good: 'border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20',
    danger: 'border-red-400/40 bg-red-400/10 hover:bg-red-400/20',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${tones[tone]}`}
    >
      <span className="truncate">{children}</span>
      <kbd className="shrink-0 rounded bg-black/40 px-1 text-white/60">{hint}</kbd>
    </button>
  )
}

/**
 * The palette.
 *
 * Grouped by category rather than sorted by price, because the question a player
 * is asking is "what kind of thing do I need" long before "what can I afford".
 * Affordability is shown per item instead, by dimming.
 */
function BuildPanel({
  state,
  focus,
  selected,
  moving,
  compact,
  onSelect,
  onRotate,
  onSell,
  onMove,
  onBuyTile,
}: {
  state: CafeState
  focus: TileKey | null
  selected: string
  moving: TileKey | null
  /** Bottom sheet instead of a sidebar, for a phone-sized screen. */
  compact: boolean
  onSelect: (id: string) => void
  onRotate: () => void
  onSell: () => void
  onMove: () => void
  onBuyTile: () => void
}) {
  const t = cafeDict(useLocale())
  const chosen = prop(selected)
  const existing = focus ? propAt(state, focus) : undefined
  const held = moving ? propAt(state, moving) : undefined

  /**
   * Floor is bought a strip at a time, so the strip is what has to be priced.
   *
   * Showing the single-square price here was a straightforward lie: the button
   * read "60", the purchase actually cost several hundred, and the whole feature
   * looked broken because it was quietly unaffordable.
   */
  const strip = focus ? expansionFor(state, focus) : []
  const stripPrice = focus && strip.length > 0 ? expansionCost(state, focus) : 0
  const floorForSale = focus ? canBuyTile(state, focus) : false

  const groups = [
    { key: 'kitchen', label: t.groups.kitchen },
    { key: 'dining', label: t.groups.dining },
    { key: 'decor', label: t.groups.decor },
  ] as const

  return (
    <div
      className={
        compact
          ? // A sheet across the top on a phone: the bottom of the screen belongs
            // to the thumbstick and the action button, and the middle has to stay
            // clear because that is where you drag to look.
            'pointer-events-auto absolute inset-x-2 top-2 z-10 max-h-[42vh] overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-3 text-white backdrop-blur'
          : 'pointer-events-auto absolute bottom-4 left-4 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-white/10 bg-black/70 p-3 text-white backdrop-blur'
      }
    >
      <h2 className="mb-2 text-sm font-semibold">{t.build}</h2>

      {/* What the targeted square is currently offering. */}
      {held ? (
        <div className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-2 py-1.5 text-[11px] text-amber-100">
          {fill(t.panel.carrying, { name: cafePropWords(t, held).name })}
        </div>
      ) : (
        <div className="mb-3 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white/70">
          {!focus && t.panel.lookAtSquare}
          {focus && strip.length > 0 && (
            /* Two of the three pieces keep a colour of their own, so the
               sentence is split on its slots rather than filled in one go. */
            <>
              {t.panel.extends
                .replace('{n}', '\u0000')
                .replace('{cost}', '\u0001')
                .split(/([\u0000\u0001])/)
                .map((part, index) =>
                  part === '\u0000' ? (
                    <span key={index} className="text-white">
                      {fill(t.panel.squares, { n: strip.length })}
                    </span>
                  ) : part === '\u0001' ? (
                    <span
                      key={index}
                      className={floorForSale ? 'text-amber-300' : 'text-red-300'}
                    >
                      {stripPrice}
                    </span>
                  ) : (
                    <span key={index}>{part}</span>
                  ),
                )}
              {!floorForSale && t.panel.notEnoughCoins}
            </>
          )}
          {focus && strip.length === 0 && existing && (
            <>{fill(t.panel.somethingHere, { name: cafePropWords(t, existing).name })}</>
          )}
          {focus && strip.length === 0 && !existing && state.tiles.has(focus) && (
            <>
              {fill(t.panel.emptySquare, {
                name: chosen ? cafePropWords(t, chosen).name : t.panel.something,
              })}
            </>
          )}
          {focus && strip.length === 0 && !existing && !state.tiles.has(focus) && (
            <>{t.panel.outOfReach}</>
          )}
        </div>
      )}

      {/* Actions for whatever is under the crosshair. */}
      <div className="mb-3 grid grid-cols-2 gap-1">
        <PanelButton
          onClick={onMove}
          disabled={!held && !existing}
          hint="G"
          tone="plain"
        >
          {held ? t.panel.cancelMove : t.panel.move}
        </PanelButton>
        <PanelButton
          onClick={onSell}
          disabled={!!held || !existing}
          hint="X"
          tone="danger"
        >
          {existing ? fill(t.panel.sellFor, { n: refundOf(existing) }) : t.panel.sell}
        </PanelButton>
        <PanelButton
          onClick={onBuyTile}
          disabled={!floorForSale}
          hint="T"
          tone="good"
        >
          {strip.length > 0
            ? fill(t.panel.layStrip, { n: strip.length, cost: stripPrice })
            : t.panel.layFloor}
        </PanelButton>
        <PanelButton onClick={onRotate} disabled={false} hint="R" tone="plain">
          {t.controls.rotate}
        </PanelButton>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="mb-3">
          <h3 className="mb-1 text-[11px] uppercase tracking-wide text-white/40">
            {group.label}
          </h3>
          <div className={compact ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-3 gap-1'}>
            {PROPS.filter((entry) => entry.category === group.key).map((entry) => {
              const words = cafePropWords(t, entry)
              return (
                <PaletteTile
                  key={entry.id}
                  src={propThumbUrl(entry.id)}
                  name={words.name}
                  price={entry.price}
                  bonus={entry.ambience}
                  active={entry.id === selected}
                  affordable={state.coins >= entry.price}
                  title={words.blurb ?? words.name}
                  onClick={() => onSelect(entry.id)}
                />
              )
            })}
          </div>
        </div>
      ))}

      {chosen?.blurb && (
        <p className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white/60">
          {chosen.blurb}
        </p>
      )}
    </div>
  )
}
