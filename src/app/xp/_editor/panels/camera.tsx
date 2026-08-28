'use client'

import {
  CAMERA_AXES,
  CAMERA_KINDS,
  cameraFieldsFor,
  cameraOf,
  DEFAULT_ABOVE,
  DEFAULT_BEHIND,
  DEFAULT_BESIDE,
  DEFAULT_DISTANCE,
  DEFAULT_FAR,
  DEFAULT_FOV,
  DEFAULT_SPAN,
  type CameraAxis,
  type CameraKind,
  type XpCamera,
  type XpDocument,
} from '@kxb/xp'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel } from '@/app/xp/_editor/chrome'

/**
 * Where the world is watched from, as three controls and a handful of numbers.
 *
 * ---------------------------------------------------------------------------
 * Why this did not exist
 * ---------------------------------------------------------------------------
 * The camera block has been in the format since side-on levels shipped, and
 * there was no way to reach it: no panel, and no write path in `edit.ts` for a
 * panel to call. A document could only get a camera by being hand-edited, which
 * meant the feature existed for whoever knew the JSON and for nobody else.
 *
 * ---------------------------------------------------------------------------
 * The fields follow the kind, from one table
 * ---------------------------------------------------------------------------
 * `cameraFieldsFor` is the same table `cameraProblems` refuses against, asked
 * here so the panel offers exactly what the chosen kind can carry. Two lists
 * would be how a panel comes to show a `span` on a follow camera and then
 * silently fail to save it - which is the failure this editor is worst at
 * showing, because a refused edit looks identical to nothing happening.
 *
 * It also means switching kind visibly *drops* the other kind's numbers, which
 * is what `setCamera` does to the document. The panel showing one thing and the
 * file holding another is the discrepancy worth spending a table to avoid.
 */

export interface CameraProps {
  document: XpDocument
  onChange: (patch: {
    kind?: CameraKind
    axis?: CameraAxis
    distance?: number | null
    span?: number | null
    x?: number | null
    y?: number | null
    z?: number | null
    yaw?: number | null
    pitch?: number | null
    behind?: number | null
    above?: number | null
    beside?: number | null
    fov?: number | null
    far?: number | null
    at?: { x: number; y: number; z: number } | null
  }) => void
}

export function Camera({ document, onChange }: CameraProps) {
  const t = xpEditorDict(useLocale()).camera
  const camera = cameraOf(document)
  const has = (field: keyof XpCamera) => cameraFieldsFor(camera.kind).includes(field)

  /**
   * Which of the three things this camera looks at.
   *
   * A picker rather than two switches, because the three are exclusive and the
   * parser says so: `yaw` without `pitch` is refused (half a direction keeps
   * tracking on the axis nobody typed), and `at` beside either is refused (a
   * point and a direction are two answers to one question). A pair of toggles
   * would let somebody reach both of those states and then wonder why the save
   * did nothing.
   *
   * So each button writes the whole answer and clears the other two.
   */
  const aim: 'watches' | 'oneWay' | 'spot' =
    camera.at !== undefined
      ? 'spot'
      : camera.yaw !== undefined && camera.pitch !== undefined
        ? 'oneWay'
        : 'watches'

  const aims = [
    { key: 'watches', label: t.watchesThePlayer, blurb: t.turnsToWatch, patch: { yaw: null, pitch: null, at: null } },
    { key: 'oneWay', label: t.aimedOneWay, blurb: t.staresOneWay, patch: { yaw: 0, pitch: 0, at: null } },
    {
      key: 'spot',
      label: t.looksAtASpot,
      blurb: t.staresAtASpot,
      // The middle of the level rather than the origin, which for a table is
      // the same answer and for a room is at least inside it.
      patch: { yaw: null, pitch: null, at: { x: 0, y: Math.round(document.spawn.y), z: 0 } },
    },
  ] as const

  return (
    <section className="mt-4 border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>

      <div className="grid grid-cols-3 gap-1.5">
        {CAMERA_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() =>
              onChange(
                /*
                 * A fixed camera needs somewhere to stand before it is a legal
                 * document, so choosing it puts one in front of the player
                 * rather than refusing the click. The spawn plus a few cells
                 * back and up is a shot somebody can see the level from, which
                 * beats a camera at the origin - inside the floor of most
                 * levels, and indistinguishable from the level failing to load.
                 */
                kind === 'fixed'
                  ? {
                      kind,
                      x: Math.round(document.spawn.x),
                      y: Math.round(document.spawn.y) + 6,
                      z: Math.round(document.spawn.z) + 10,
                    }
                  : { kind },
              )
            }
            title={t.kindBlurbs[kind]}
            className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
              camera.kind === kind
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            {t.kinds[kind]}
          </button>
        ))}
      </div>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-neutral-500">
        {t.kindBlurbs[camera.kind]}
      </p>

      {/* --- side-on ------------------------------------------------------ */}
      {has('axis') && (
        <div className="mt-3">
          <span className="font-mono text-[10px] text-neutral-600">{t.runsAlong}</span>
          <div className="mt-1 flex gap-1.5">
            {CAMERA_AXES.map((axis) => (
              <button
                key={axis}
                type="button"
                onClick={() => onChange({ axis })}
                className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
                  (camera.axis ?? 'x') === axis
                    ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                }`}
              >
                {axis}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {has('distance') && (
          <Number
            label={t.standOff}
            value={camera.distance}
            placeholder={DEFAULT_DISTANCE}
            onChange={(distance) => onChange({ distance })}
          />
        )}
        {has('span') && (
          <Number
            label={t.cellsTall}
            value={camera.span}
            placeholder={DEFAULT_SPAN}
            onChange={(span) => onChange({ span })}
          />
        )}

        {/* --- fixed ------------------------------------------------------ */}
        {has('x') && (
          <>
            <Number label="x" value={camera.x} onChange={(x) => onChange({ x })} />
            <Number label="y" value={camera.y} onChange={(y) => onChange({ y })} />
            <Number label="z" value={camera.z} onChange={(z) => onChange({ z })} />
          </>
        )}

        {/* --- follow ----------------------------------------------------- */}
        {has('behind') && (
          <>
            <Number
              label={t.behind}
              value={camera.behind}
              placeholder={DEFAULT_BEHIND}
              onChange={(behind) => onChange({ behind })}
            />
            <Number
              label={t.above}
              value={camera.above}
              placeholder={DEFAULT_ABOVE}
              onChange={(above) => onChange({ above })}
            />
            <Number
              label={t.beside}
              value={camera.beside}
              placeholder={DEFAULT_BESIDE}
              onChange={(beside) => onChange({ beside })}
            />
          </>
        )}

        {/* --- the lens, on every kind that has one ----------------------- */}
        {has('fov') && (
          <Number
            label={t.lens}
            value={camera.fov}
            placeholder={DEFAULT_FOV}
            onChange={(fov) => onChange({ fov })}
          />
        )}
        {has('far') && (
          <Number
            label={t.sees}
            value={camera.far}
            placeholder={DEFAULT_FAR}
            onChange={(far) => onChange({ far })}
          />
        )}
      </div>

      {has('yaw') && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {aims.map((one) => (
              <button
                key={one.key}
                type="button"
                // The whole answer at once, because the parser refuses every
                // half of one - see `aim` above.
                onClick={() => onChange(one.patch)}
                className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                  aim === one.key
                    ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                }`}
              >
                {one.label}
              </button>
            ))}
          </div>

          {aim === 'oneWay' && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Number label="yaw°" value={camera.yaw} onChange={(yaw) => onChange({ yaw })} />
              <Number
                label="pitch°"
                value={camera.pitch}
                onChange={(pitch) => onChange({ pitch })}
              />
            </div>
          )}

          {aim === 'spot' && camera.at && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <Number
                  key={axis}
                  label={axis}
                  value={camera.at![axis]}
                  // All three every time: the parser refuses a point missing
                  // one, so a patch that sent a single axis would be refused
                  // and read as the field doing nothing.
                  onChange={(value) =>
                    onChange({ at: { ...camera.at!, [axis]: value ?? 0 } })
                  }
                />
              ))}
            </div>
          )}

          <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-500">
            {aims.find((one) => one.key === aim)?.blurb}
          </p>
        </>
      )}
    </section>
  )
}

/**
 * An optional number, where empty means the default rather than zero.
 *
 * Held as its own string rather than derived from the value on every render,
 * for the reason the Mode panel's `Limit` gives at length: clearing the field
 * types an empty string, which is not a number, so a controlled input reading
 * back from the document would put the old number straight back and the field
 * could never be emptied at all.
 *
 * A *placeholder* rather than a filled-in value, because that is the difference
 * between "this level chose four" and "four is what four means here" - and only
 * the first should end up in the file. `placeholder` is absent for a fixed
 * camera's coordinates, which have no default to fall back to.
 */
function Number({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: number | undefined
  placeholder?: number
  onChange: (value: number | null) => void
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-neutral-600">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value === undefined ? '' : String(value)}
        placeholder={placeholder === undefined ? '—' : String(placeholder)}
        onChange={(event) => {
          const typed = event.target.value.trim()
          if (typed === '') {
            onChange(null)
            return
          }
          const parsed = globalThis.Number(typed)
          // A value the edit layer would refuse is one the field simply does
          // not accept, rather than one it accepts and then silently drops.
          if (!globalThis.Number.isFinite(parsed)) return
          onChange(parsed)
        }}
        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
      />
    </label>
  )
}
