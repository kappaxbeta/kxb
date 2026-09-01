'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { SelectedBlockChip } from '@/app/world/lounge/_hud/block-picker'
import type { PresenceStatus } from '@/app/world/lounge/_canvas/multiplayer'
import { PerfReadout } from '@/app/world/perf/perf-readout'
import {
  actionKey,
  type ControlRow,
  ControlsPanel,
  gesture,
  HelpButton,
  key,
  mouse,
  row,
  wasd,
} from '@/app/world/_hud/hud'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict, type WorldDict } from '@/app/i18n/world'
import type { CameraState } from '@/app/world/_stores/face-store'
import { generateFloor } from '@/domain/lounge/actions'
import { DEFAULT_WORLD_SIZE } from '@/domain/lounge/events'
import { DEFAULT_GROUND_MODEL } from '@/domain/lounge/palette'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What this world's controls are.
 *
 * Built from the same four flags the HUD already branches on, so the panel can
 * never promise a key that does nothing here: a battlefield grounds everybody,
 * so it has no fly row; battle mode cannot build, so it has no place/break; a
 * showcase visitor has neither.
 *
 * Touch and mouse are different lists rather than one list with the keys
 * swapped, because they are different *verbs*. There is no "sprint" on a
 * thumbstick - you push it further - and no "drag to look" on a mouse.
 */
export function loungeControls({
  isTouch,
  flying,
  canBuild,
  combat,
  canSetMode,
  dict,
}: {
  isTouch: boolean
  flying: boolean
  canBuild: boolean
  combat: boolean
  /**
   * Whether this person may flip the world between building and fighting.
   *
   * The owner/admin pair, and the same answer the chip in the corner is drawn
   * from - so the Tab row appears for exactly the people whose Tab does
   * something. Everybody else keeps the key as the browser's.
   */
  canSetMode: boolean
  /**
   * The words, passed in rather than read here.
   *
   * This is a plain function called from the scene's render, not a component,
   * so it cannot call `useLocale` itself - and making it one would put a hook
   * in the middle of the file that owns the frame loop. The scene has the
   * locale already; it hands it down.
   */
  dict: WorldDict
}): ControlRow[] {
  const t = dict.controls
  const soft = dict.softKeys

  if (isTouch) {
    const rows = [
      row([gesture('stick')], t.move),
      row([gesture('pan')], t.dragToLook),
      // Named "Jump ×2" rather than "Jump", because a second jump you have to
      // discover by falling off something is a second jump most people never
      // find - and the control for it is the one they are already holding.
      row([actionKey(flying ? '▲▼' : soft.jump)], flying ? t.fly : t.doubleJump),
    ]
    if (canBuild) {
      rows.push(row([actionKey(soft.place)], t.build))
      rows.push(row([actionKey(soft.break)], t.mine))
      rows.push(row([key(soft.chip)], t.blocks))
    }
    if (combat) {
      rows.push(row([actionKey(soft.dash)], t.attack))
      rows.push(row([actionKey(soft.kick)], t.shove))
    }
    // Last, and unconditional, exactly like the G row on a keyboard.
    rows.push(row([actionKey(soft.dance)], t.dance))
    return rows
  }

  /*
    Every cap below is left exactly as it is. `Space`, `Shift`, `Ctrl`, `Esc`
    and the six letters are what is printed on the keyboard in front of the
    reader, in both languages - translating one would name a key that is not
    there. Only the second half of each row is a sentence.
  */
  const rows = [
    row([wasd()], flying ? t.fly : t.move),
    row([key('Space')], flying ? t.up : t.doubleJump),
  ]
  if (flying) rows.push(row([key('Ctrl')], t.down))
  rows.push(row([key('Shift')], flying ? t.faster : t.sprint))
  if (canBuild) {
    rows.push(row([mouse('left'), mouse('right')], t.breakPlace))
    rows.push(row([actionKey('E')], t.blocks))
  }
  if (combat) {
    rows.push(row([actionKey('F')], t.dashAttack))
    rows.push(row([actionKey('Q')], t.kick))
  }
  rows.push(row([key('V')], t.view))
  rows.push(row([key('R')], t.lookAtYourself))
  rows.push(row([key('O')], t.seeTheRoom))
  rows.push(row([actionKey('G')], t.dance))
  rows.push(row([key('L')], t.mouseLook))
  // Above the housekeeping pair below, because it changes the world rather
  // than the way you are looking at it.
  if (canSetMode) rows.push(row([key('Tab')], t.switchMode))
  rows.push(row([key('H')], t.controls))
  rows.push(row([key('Esc')], t.leave))
  return rows
}

/**
 * The chrome around the world: the crosshair, the readouts, the mode chip and
 * the way in to the keys.
 *
 * Every prop here is a plain value, and that is not an accident. This is the one
 * part of the scene with no share in the frame loop - it renders when something
 * *happens*, not when a frame runs - so it takes no refs and reads no context.
 * The two places the HUD does touch the loop are the thumbstick, which writes
 * `moveRef`, and the shutter button, which fires a callback the scene owns; both
 * live outside this component for exactly that reason.
 */
/**
 * The shutter's face, in the panel's own hand.
 *
 * Stroked in `currentColor` at 1.6 on a 24 grid, round caps and joins: the
 * same construction as `GamepadMark` on the chip directly above it and as
 * `GestureMark` in the controls panel behind it. The bump on the top edge is
 * what makes a rounded rectangle read as a camera rather than as a window.
 */
function ShutterMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.8 8.4h3.1l1.4-2.2h7.4l1.4 2.2h3.1a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H3.8a1.6 1.6 0 0 1-1.6-1.6V10a1.6 1.6 0 0 1 1.6-1.6z" />
      <circle cx="12" cy="13.4" r="3.2" />
    </svg>
  )
}

/**
 * The camera switch, drawn rather than written.
 *
 * The same argument the shutter makes one component up: this rail is two chips
 * wide on a phone, "Show your face" is the widest thing that could go in it, and
 * an emoji would arrive in the system's own colours next to a 1.5px cyan stroke.
 *
 * Struck through when it is off, which is the one thing a camera glyph on its
 * own cannot say. A camera that means "your camera is off, press to switch it
 * on" and a camera that means "your camera is on" are the same picture
 * otherwise, and the difference between them is the whole question somebody is
 * asking when they look at it.
 */
function CameraMark({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.4" y="6.6" width="13.2" height="10.8" rx="2.2" />
      <path d="M15.6 10.6 21.6 7.6v8.8l-6-3z" />
      {off && <path d="M3.4 3.6 20.6 20.4" />}
    </svg>
  )
}

/**
 * The microphone, drawn like the camera beside it.
 *
 * Struck through when it is off, for the reason the camera glyph is: a mic that
 * means "press to be heard" and a mic that means "you are being heard" are the
 * same picture otherwise.
 *
 * `live` is a third state and not a cosmetic one - it is the only thing on
 * screen that says sound is leaving the device *right now*. In push-to-talk
 * that is the difference between holding the key and not, and somebody has to
 * be able to see it without listening to themselves.
 */
function MicMark({ off, live }: { off: boolean; live: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2.6" width="6" height="11" rx="3" fill={live ? 'currentColor' : 'none'} />
      <path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0" />
      <path d="M12 17.8v3.6M8.6 21.4h6.8" />
      {off && <path d="M3.4 3.6 20.6 20.4" />}
    </svg>
  )
}

export function Hud({
  locked,
  entered,
  readOnly,
  canBuild,
  blockCount,
  pending,
  saving,
  error,
  hasTarget,
  slug,
  worldId,
  worldName,
  isTouch,
  roomy,
  onEnterTouch,
  controls,
  helpOpen,
  onShowHelp,
  onHideHelp,
  selected,
  onOpenPicker,
  near,
  onAct,
  onCapture,
  shot,
  presence,
  peerCount,
  perfReadout,
  mode,
  onSetMode,
  modeBusy,
  modeError,
  demo,
  camera,
  onToggleCamera,
  mic,
  micLive,
  micPush,
  onToggleMic,
}: {
  /** Whether the player is driving right now. The crosshair follows this. */
  locked: boolean
  /** Whether they have ever driven. The controls panel follows this - see the
   *  latch in <LoungeScene>, and why it is not `locked`. */
  entered: boolean
  readOnly: boolean
  /** Placing and breaking, which is creative mode only. */
  canBuild: boolean
  blockCount: number
  pending: number
  saving: boolean
  error: string | null
  hasTarget: boolean
  slug: string
  worldId?: string
  worldName?: string
  isTouch: boolean
  /** Whether the viewport is wide enough for the full readouts. */
  roomy: boolean
  onEnterTouch: () => void
  /** What this world's keys do. Built by the scene, which knows the mode. */
  controls: ControlRow[]
  helpOpen: boolean
  onShowHelp: () => void
  onHideHelp: () => void
  selected: string
  onOpenPicker: () => void
  /**
   * The thing you are standing next to, and what E would do to it.
   *
   * The HUD does not decide this - it draws it. See `SelectedBlockChip`, which
   * is one chip for the block and the thing because there is only one key.
   */
  near?: { name: string; model: string; line: string } | null
  onAct?: () => void
  /** 'off' for the public showcase, which has no presence channel. */
  presence: PresenceStatus | 'off'
  peerCount: number
  /**
   * Show this room's own frame rate, traffic and round trip in the readout.
   *
   * Off unless the space asked for it - see the `perf_display` capability and
   * `perfDisplayOn`. It is a space's choice rather than a consequence of an
   * operator measuring: those are two different decisions, and only one of them
   * belongs to the people standing in the room.
   */
  perfReadout: boolean
  /**
   * Our own camera, when the space has faces switched on.
   *
   * Undefined is the feature being off, and it is checked rather than the
   * state, because 'off' is a thing a camera can *be*: a room with the flag on
   * and nobody's camera running still has a switch in it.
   */
  camera?: CameraState
  onToggleCamera?: () => void
  /** The microphone, on the same terms as the camera. Undefined is off. */
  mic?: CameraState
  /** Sound is leaving the device this instant. See <MicMark>. */
  micLive?: boolean
  /** Whether this person talks by holding a key. Only changes what we say. */
  micPush?: boolean
  onToggleMic?: () => void
  mode: 'creative' | 'battle'
  /**
   * Undefined for everyone who cannot change it - a plain member, or a
   * showcase visitor. The chip still renders, because "why can nobody dash"
   * is a question the mode answers and hiding it leaves unanswered.
   */
  onSetMode?: (next: 'creative' | 'battle') => void
  modeBusy: boolean
  modeError: string | null
  /** Nothing here is written down. See the prop of the same name on the scene. */
  demo: boolean
  /** Save the world as a PNG. See `capture` on the scene. */
  onCapture: () => void
  /** The filename just written, for a moment. Null the rest of the time. */
  shot: string | null
}) {
  const refusal = useRefusal()
  const t = worldDict(useLocale()).lounge
  const router = useRouter()
  const [generating, startGenerating] = useTransition()
  const [genError, setGenError] = useState<string | null>(null)

  /**
   * Seeding writes ~196 events server-side and never touches the local block
   * map, so the scene has no idea it happened. router.refresh() re-runs the
   * page's server render and hands down the new world - the one place in the
   * lounge where a round trip is the right answer, because 40,000 blocks are
   * not something to replay optimistically.
   */
  function seed() {
    setGenError(null)
    startGenerating(async () => {
      const result = await attempt(() =>
        generateFloor(slug, DEFAULT_GROUND_MODEL, DEFAULT_WORLD_SIZE, worldId),
      )
      if (result.ok) router.refresh()
      else setGenError(refusal(result.error))
    })
  }

  return (
    <>
      {/* The crosshair dims when nothing is in reach, so "why is nothing
          happening" answers itself before you click. */}
      {locked && (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity ${
            hasTarget ? 'opacity-90' : 'opacity-25'
          }`}
        >
          <div className="relative h-5 w-5">
            {/* Dark, because the sky is now white. */}
            <span className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-violet-950" />
            <span className="absolute left-0 top-1/2 h-px w-5 -translate-y-1/2 bg-violet-950" />
          </div>
        </div>
      )}

      <ControlsPanel
        // `entered`, not `locked`: on the way in once, and never again by
        // accident. Releasing the mouse to use the block picker or the mode
        // switch is not leaving the room.
        open={!entered || helpOpen}
        // Summoned mid-session it is a modal over a world you are already in;
        // as the entry gate it must let the click through to the canvas, which
        // is the only way pointer lock is ever granted. See <ControlsPanel>.
        interactive={entered}
        isTouch={isTouch}
        rows={controls}
        intro={worldName ?? (readOnly ? t.walkNotChange : undefined)}
        /* Touch entry is a React flag, not a pointer lock, so there is nothing
           on the canvas for a click-through to land on. Desktop has the canvas
           and gets the click-through instead. */
        onEnter={isTouch && !entered ? onEnterTouch : undefined}
        onClose={() => {
          if (helpOpen) onHideHelp()
          else if (isTouch) onEnterTouch()
        }}
        footer={
          /* Only offered on a genuinely empty world. Once anything has been
             built, laying 40,000 blocks under it is almost never what someone
             means to click.

             `!demo` is belt and braces: the demo world is never empty, so this
             is already unreachable there - but "the demo appends nothing" is an
             invariant, and an invariant that holds by arithmetic somewhere else
             in the file is one somebody will break by accident. */
          blockCount === 0 && canBuild && !demo ? (
            <div className="pointer-events-auto text-center">
              <button
                type="button"
                disabled={generating}
                onClick={seed}
                className="bg-accent rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {generating
                  ? t.layingFloor
                  : fill(t.generateFloor, { n: DEFAULT_WORLD_SIZE })}
              </button>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
                {fill(t.floorNote, { blocks: DEFAULT_WORLD_SIZE * DEFAULT_WORLD_SIZE })}
              </p>
              {genError && (
                <p role="alert" className="mt-2 text-[10px] text-red-300">
                  {genError}
                </p>
              )}
            </div>
          ) : undefined
        }
      />

      {/*
        The readout.

        On a phone this drops to the two facts that change - who else is here,
        and whether your placements have landed - and loses the block count and
        the world name, which are context you already have and which were
        together eating a third of the top edge on a 375px screen.
      */}
      <div className="absolute left-[var(--hud-edge-x)] top-[var(--hud-edge-top)] hud-chip font-mono">
        {/* Which world, when it is not the lounge. An arena and the lounge are
            the same renderer with the same palette, so without this the only
            way to tell them apart is the URL. */}
        {worldName && roomy && (
          <span className="text-[var(--color-accent-2)]">{worldName}</span>
        )}
        {roomy && <span>{fill(t.blocks, { n: blockCount })}</span>}
        {pending > 0 && (
          <span className="text-amber-600">{fill(t.queued, { n: pending })}</span>
        )}
        {saving && <span className="opacity-60">{t.saving}</span>}
        {/* Only meaningful for members; the showcase has no channel at all. */}
        {presence !== 'off' &&
          (presence === 'error' ? (
            <span className="text-red-500" title={t.offlineTitle}>
              {t.offline}
            </span>
          ) : presence === 'connecting' ? (
            <span className="opacity-50">{t.connecting}</span>
          ) : (
            <span className="text-emerald-600">
              {peerCount === 0 ? t.onlyYou : fill(t.othersHere, { n: peerCount })}
            </span>
          ))}
        {/* Last in the readout, beside who else is here, because it is a fact
            about this room rather than about what you are building in it. */}
        {perfReadout && <PerfReadout />}
      </div>

      {/*
        Mode, and the way to change it.

        Top right rather than in the block picker, because it is not a build
        setting - it changes whether the person next to you can knock you over,
        which is worth seeing without opening a menu.
      */}
      <div className="absolute right-[var(--hud-edge-x)] top-[var(--hud-edge-top)] flex flex-col items-end gap-2">
        {/* The way back to the keys, in every world and at every width. It is
            the one control that must never be hidden by the compacting below -
            it is what the compacting sends you to. */}
        <HelpButton onClick={onShowHelp} />

        {/*
          The shutter, under the question mark and above everything that
          compacts. Not in the controls panel with the keys, because it is not a
          way of playing - it is a way of taking something away with you, and it
          has to be one press from wherever you happen to be standing.

          A camera *drawn* rather than the word - this rail is two chips wide on
          a phone and "Screenshot" is the widest thing that could go in it - and
          drawn rather than the emoji it used to be. An emoji is somebody else's
          artwork: it arrives in the system's own colours, at the system's own
          weight, and a different shape on every platform. Beside a chip whose
          whole design is a 1.5px cyan stroke it reads as a sticker somebody
          left on the HUD.
        */}
        <button
          type="button"
          onClick={onCapture}
          aria-label={t.shutter}
          title={t.shutterTitle}
          className="hud-chip pointer-events-auto size-11 justify-center !px-0"
        >
          <ShutterMark />
        </button>

        {/*
          The camera, under the shutter.
          Next to the thing that takes a picture of the room rather than in the
          controls panel, because it is the same kind of verb: not a way of
          playing, but something you do to the room you are standing in - and
          like the shutter it has to be one press from wherever you are, most of
          all for the press that turns it *off*.
        */}
        {camera && onToggleCamera && (
          <button
            type="button"
            onClick={onToggleCamera}
            aria-pressed={camera === 'on'}
            aria-label={
              camera === 'on' ? t.cameraOn : camera === 'asking' ? t.cameraAsking : t.cameraOff
            }
            title={camera === 'on' ? t.cameraOnTitle : t.cameraOffTitle}
            className={`hud-chip pointer-events-auto size-11 justify-center !px-0 ${
              camera === 'on' ? '!border-[var(--color-accent-2)] text-[var(--color-accent-2)]' : ''
            } ${camera === 'asking' ? 'opacity-60' : ''}`}
          >
            <CameraMark off={camera !== 'on'} />
          </button>
        )}

        {/*
          And the microphone, under the camera.
          Two switches rather than one, because plenty of people want to be
          heard and not seen and rather more want the reverse - a single control
          for both would make each of those a choice to give something up.
        */}
        {mic && onToggleMic && (
          <button
            type="button"
            onClick={onToggleMic}
            aria-pressed={mic === 'on'}
            aria-label={
              mic === 'on' ? (micPush ? t.micOnPush : t.micOn) : t.micOff
            }
            title={mic === 'on' ? (micPush ? t.micOnPushTitle : t.micOnTitle) : t.micOffTitle}
            className={`hud-chip pointer-events-auto size-11 justify-center !px-0 ${
              micLive
                ? '!border-[var(--color-accent)] text-[var(--color-accent)]'
                : mic === 'on'
                  ? '!border-[var(--color-accent-2)] text-[var(--color-accent-2)]'
                  : ''
            } ${mic === 'asking' ? 'opacity-60' : ''}`}
          >
            <MicMark off={mic !== 'on'} live={Boolean(micLive)} />
          </button>
        )}

        {(mic === 'denied' || mic === 'missing') && (
          <p
            className="hud-chip max-w-[14rem] text-[10px] text-amber-600"
            title={mic === 'denied' ? t.micDeniedTitle : t.micMissingTitle}
          >
            {mic === 'denied' ? t.micDenied : t.micMissing}
          </p>
        )}

        {/* Why the button did nothing. A refused permission produces no error
            anywhere a person is looking - the prompt simply does not come back
            - and without this the switch reads as broken rather than as
            answered. */}
        {(camera === 'denied' || camera === 'missing') && (
          <p
            className="hud-chip max-w-[14rem] text-[10px] text-amber-600"
            title={camera === 'denied' ? t.cameraDeniedTitle : t.cameraMissingTitle}
          >
            {camera === 'denied' ? t.cameraDenied : t.cameraMissing}
          </p>
        )}

        {/* The receipt. Nobody watches their downloads bar, and a button that
            appears to do nothing gets pressed four more times. */}
        {shot && (
          <p className="hud-chip max-w-[14rem] truncate text-[10px] text-[var(--color-accent-2)]">
            {fill(t.saved, { name: shot })}
          </p>
        )}

        {readOnly && (
          <div className="hud-chip !border-red-500/60 text-red-500">{t.readOnly}</div>
        )}

        {presence !== 'off' && (
          <>
            <div className="hud-chip">
              <span
                className={
                  mode === 'battle'
                    ? 'text-amber-600'
                    : 'text-[var(--color-accent-2)]'
                }
              >
                {mode === 'battle' ? t.battle : t.creative}
              </span>
              {/* The switch is a sentence on a desktop and a glyph on a phone:
                  "Switch to creative" is 17 characters of chrome to hang next
                  to a scene somebody is trying to look at. */}
              {onSetMode && (
                <button
                  type="button"
                  disabled={modeBusy}
                  aria-label={mode === 'battle' ? t.toCreative : t.toBattle}
                  onClick={() => onSetMode(mode === 'battle' ? 'creative' : 'battle')}
                  className="pointer-events-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] transition hover:bg-white/30 disabled:opacity-40"
                >
                  {modeBusy
                    ? '…'
                    : roomy
                      ? mode === 'battle'
                        ? t.toCreative
                        : t.toBattle
                      : '⇄'}
                </button>
              )}
            </div>

            {modeError && (
              <p role="alert" className="max-w-xs text-right text-[10px] text-red-500">
                {modeError}
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="absolute left-1/2 top-6 max-w-md -translate-x-1/2 rounded-lg bg-red-600/90 px-3 py-2 text-xs text-white"
        >
          {fill(t.errorTail, { error })}
        </div>
      )}

      {/*
        What you are holding, and the way in to change it.

        Bottom centre on a mouse. On touch it moves to the top, because the
        bottom of a phone is now entirely spoken for: the thumbstick's zone is
        11rem wide on the left and the action stack is on the right, and what
        was left in the middle was about 60px on a small handset - the chip was
        overlapping both.
      */}
      <div
        className={
          isTouch
            ? 'pointer-events-none absolute left-1/2 top-[calc(var(--hud-edge-top)+3.25rem)] -translate-x-1/2'
            : 'pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2'
        }
      >
        {/*
          Also when you cannot build: in play mode there is no palette to open,
          but there is still a thing in front of you and still one key that acts
          on it, and this chip is now where that key is announced.
        */}
        {(canBuild || near) && (
          <SelectedBlockChip
            selected={selected}
            near={near}
            onOpen={onOpenPicker}
            onAct={onAct}
            isTouch={isTouch}
          />
        )}
      </div>
    </>
  )
}
