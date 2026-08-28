'use client'

import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'

/**
 * The icon rail, and the strip along the bottom.
 *
 * The two pieces of IDE furniture that are not the dock itself. Both exist for
 * the same reason: a docked layout is powerful and *invisible* - a panel you
 * dragged away is a panel you cannot find again, and a panel you closed by
 * accident is a feature that has silently disappeared.
 *
 * The rail is the answer to both. Every tool window has an icon that is lit
 * when it is open, so the layout is always legible from the edge no matter what
 * anybody dragged where, and closing something is undoable by clicking the same
 * icon. It is the piece that makes a dock safe to rearrange.
 *
 * ---------------------------------------------------------------------------
 * Pictograms, and why the letters went
 * ---------------------------------------------------------------------------
 * This used to be one or two characters per window, and that was the right
 * trade at the time: *"Four tool windows do not need an icon language: a
 * pictogram for 'Models' is a guess the reader has to decode, and a picture of a
 * cube says nothing that 'M' does not."*
 *
 * **The refusal was conditional on the number, and the number moved.** There are
 * eight tool windows, and the letter scheme had already broken down under its
 * own weight: Behaviour was `R`, left over from when the panel was called Rules,
 * and Scripts was `J` because `S` was taken by Scene. Two of eight marks did not
 * say what they meant, which is exactly the decoding cost the letters were
 * chosen to avoid - and unlike a picture, a wrong letter gives the reader
 * nothing to fall back on.
 *
 * Inline SVG, not an icon package. A handful of hand-drawn paths beats a
 * dependency, the repo has no icon set to be consistent with, and every one of
 * these is four strokes at 16 pixels. The name is still in the tooltip, which is
 * where it always was.
 *
 * ---------------------------------------------------------------------------
 * Two zones, because not everything on a rail is a toggle
 * ---------------------------------------------------------------------------
 * The rail's stated purpose is that closing something is undoable by clicking
 * the same icon, and that only holds for a view toggle. `Try` is not one:
 * it *goes* somewhere, it has no lit state to speak of, and the thing that ends
 * it is Escape rather than clicking the icon again. Publishing, when it exists,
 * will be worse - not undoable by clicking it, and one pixel from a panel toggle
 * in an identical button is how somebody publishes a draft.
 *
 * So destinations and actions live below a rule, drawn as filled buttons rather
 * than lit ones, and they do not share a component with the toggles above them.
 * An action may ask first: `confirm` is the copy for a thing that cannot be
 * clicked back.
 */

export interface ToolWindow {
  id: string
  label: string
  /** The pictogram, drawn in a 16×16 box. See `Glyph`. */
  icon: Glyph
}

/**
 * A destination or an action: something the rail can do that is not a panel.
 *
 * Deliberately not a `ToolWindow` with a flag. The two are drawn differently,
 * behave differently and one of them can be irreversible; a shared type with a
 * boolean on it is how the two ended up one pixel apart in the first place.
 */
export interface RailAction {
  id: string
  label: string
  icon: Glyph
  onSelect: () => void
  /** Ask before doing it. The copy is the question. */
  confirm?: string
  disabled?: boolean
}

export type Glyph =
  | 'scene'
  | 'properties'
  | 'models'
  | 'blueprints'
  | 'tools'
  | 'document'
  | 'behaviour'
  | 'data'
  | 'flow'
  | 'scripts'
  | 'animator'
  | 'words'
  | 'movie'
  | 'play'

/**
 * Every pictogram, as paths in a 16×16 box.
 *
 * Drawn rather than chosen: each one is the *shape of the thing the panel
 * holds*, not a metaphor for it. Scene is a tree because that panel is a tree.
 * Models is a cube because that panel is cubes. Behaviour is a signal splitting
 * into two, because a rule is one thing happening and two things following.
 */
export function Icon({ glyph }: { glyph: Glyph }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[glyph]}
    </svg>
  )
}

const PATHS: Record<Glyph, React.ReactNode> = {
  // A tree: a trunk down the left, three things hanging off it.
  scene: (
    <>
      <path d="M3.5 2.5v10" />
      <path d="M3.5 5h3M3.5 8.5h3M3.5 12h3" />
      <path d="M7 3.8h5.5M7 7.3h5.5M7 10.8h5.5" />
    </>
  ),
  // Sliders, which is what that panel is: rows of values you move.
  properties: (
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // A clapperboard: a slate with the hinged arm up. The one shape that means
  // "film" without a word next to it, and it is four strokes.
  movie: (
    <>
      <rect x="2" y="6.5" width="12" height="7" rx="1" />
      <path d="M2.4 6.5 5 3.6l3 2.9M8 6.5l2.6-2.9 3 2.9" />
    </>
  ),
  // A cube, in the same isometric the catalogue's thumbnails are shot in.
  models: (
    <>
      <path d="M8 2 13.5 5v6L8 14 2.5 11V5z" />
      <path d="M2.5 5 8 8l5.5-3M8 8v6" />
    </>
  ),
  // A cube with a second one behind it: the kind of thing, and its instances.
  blueprints: (
    <>
      <path d="M6 5 10.5 7.4v4.2L6 14l-4.5-2.4V7.4z" />
      <path d="M5.5 3.2 10 1l4.5 2.4v4.2l-2 1.1" />
    </>
  ),
  // A pointer, because that panel is what the pointer is currently doing.
  tools: (
    <>
      <path d="M4 2.5 12 8l-3.6.9L10 13l-1.7.8-1.6-4-2.7 2.4z" />
    </>
  ),
  // A page with lines on it.
  document: (
    <>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
      <path d="M6 8.5h4M6 11h3" />
    </>
  ),
  // Two speech marks, because that panel is sentences - and two rather than one
  // because the whole panel is the same sentence said twice.
  words: (
    <>
      <path d="M3 5h4v4H3z" />
      <path d="M3 9l1.6 2.6" />
      <path d="M9 5h4v4H9z" />
      <path d="M9 9l1.6 2.6" />
    </>
  ),
  // One thing happening, two things following.
  behaviour: (
    <>
      <circle cx="3.8" cy="8" r="1.6" />
      <path d="M5.4 8h2.4l2.2-3.2M7.8 8l2.2 3.2" />
      <circle cx="11.6" cy="4.8" r="1.6" />
      <circle cx="11.6" cy="11.2" r="1.6" />
    </>
  ),
  // Three stacked bars with a lock's shackle over them: a small pile of numbers
  // that stays put. Not a database cylinder — that is a picture of our storage,
  // and this panel is about what an author's level remembers.
  data: (
    <>
      <path d="M4 9.5h8M4 12h8M4 14.5h8" />
      <path d="M6.2 7V5.2a1.8 1.8 0 0 1 3.6 0V7" />
    </>
  ),
  // Angle brackets. The one place a metaphor is not needed.
  scripts: (
    <>
      <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </>
  ),
  // A figure mid-stride with a keyframe under it. The one glyph that is two
  // ideas, because the panel is: a body, and time.
  animator: (
    <>
      <circle cx="8" cy="2.9" r="1.5" />
      <path d="M8 4.4v4M8 6.2 5.6 7.6M8 6.2l2.4 1.4M8 8.4 6.2 11.4M8 8.4l1.8 3" />
      <path d="M2.5 14h11" />
      <path d="M6 12.6 7.2 14 6 15.4 4.8 14z" fill="currentColor" />
    </>
  ),
  // Three states and the arrows between them, which is what the panel draws.
  // Its own glyph rather than Data's: the two shared one for a while, and a
  // rail where two buttons are pixel-identical is a rail that cannot be read.
  flow: (
    <>
      <rect x="1.5" y="6" width="4" height="4" rx="0.8" />
      <rect x="10.5" y="2" width="4" height="4" rx="0.8" />
      <rect x="10.5" y="10" width="4" height="4" rx="0.8" />
      <path d="M5.5 8h2.2c.8 0 1.3-.4 1.7-1L10.5 4M7.7 8c.8 0 1.3.4 1.7 1l1.1 3" />
    </>
  ),
  // A play triangle: the only glyph here everybody already knows.
  play: (
    <>
      <path d="M5 3.2 12.5 8 5 12.8z" />
    </>
  ),
}

export function IconRail({
  windows,
  open,
  onToggle,
  actions = [],
}: {
  windows: readonly ToolWindow[]
  /** Which ones are currently in the layout. */
  open: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Destinations and actions, below the rule. Not toggles. */
  actions?: readonly RailAction[]
}) {
  const t = xpEditorDict(useLocale()).chrome
  return (
    <nav
      aria-label={t.toolWindows}
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-neutral-800 bg-neutral-900/40 py-1.5"
    >
      {windows.map((window) => {
        const lit = open.has(window.id)
        return (
          <button
            key={window.id}
            type="button"
            onClick={() => onToggle(window.id)}
            title={t.windows[window.id] ?? window.label}
            aria-pressed={lit}
            /*
              A lit button carries a bar down its left edge as well as a wash,
              which is how an IDE's activity bar says "this one is open": the
              wash alone is two shades apart from hover, and at a glance down
              a column of twelve that is not a difference a person can count.
            */
            className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors before:absolute before:-left-1.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:transition-colors ${
              lit
                ? 'bg-violet-500/15 text-violet-200 before:bg-violet-400'
                : 'text-neutral-500 before:bg-transparent hover:bg-white/5 hover:text-neutral-200'
            }`}
          >
            <Icon glyph={window.icon} />
          </button>
        )
      })}

      {actions.length > 0 ? (
        <>
          {/*
            Pushed to the bottom rather than sitting directly under the last
            toggle. The gap is the point: a rule with nothing either side of it
            is a line somebody reads past, and eight pixels of separation is not
            enough distance for "this one is not undoable".
          */}
          <div className="mt-auto w-6 border-t border-neutral-800 pt-1" />
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                if (action.confirm && !window.confirm(action.confirm)) return
                action.onSelect()
              }}
              title={action.label}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-300 shadow-sm transition-colors hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-100 disabled:cursor-not-allowed disabled:border-neutral-900 disabled:text-neutral-700 disabled:hover:bg-neutral-900 disabled:hover:text-neutral-700"
            >
              <Icon glyph={action.icon} />
            </button>
          ))}
        </>
      ) : null}
    </nav>
  )
}

/**
 * The strip along the bottom.
 *
 * A breadcrumb on the left and state on the right, which is where every IDE
 * puts them and therefore where people look. What goes in it is chosen by one
 * rule: **things you want to glance at, never things you want to click.** A
 * status bar with controls in it is a toolbar in the wrong place, and the eye
 * stops trusting it as a readout.
 */
export function StatusBar({
  crumbs,
  right,
}: {
  crumbs: readonly string[]
  right?: React.ReactNode
}) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-1 overflow-hidden border-t border-neutral-800 bg-neutral-900/60 px-3 font-mono text-[10px] text-neutral-500">
      {/*
        On a phone only the last crumb: the trail is `xp › <id> › <selection>`
        and at 375 pixels the id alone is most of the bar. What somebody
        glances down for is the third word - what is selected, or which
        height they are building at - so that is the one that stays.
      */}
      {crumbs.map((crumb, index) => (
        <span
          key={`${crumb}-${index}`}
          className={`items-center gap-1 ${index === crumbs.length - 1 ? 'flex min-w-0' : 'hidden sm:flex'}`}
        >
          {index > 0 ? <span className="hidden text-neutral-700 sm:inline">›</span> : null}
          <span className={index === crumbs.length - 1 ? 'truncate text-neutral-300' : undefined}>
            {crumb}
          </span>
        </span>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-3 [&>span:not(:last-child)]:hidden sm:[&>span:not(:last-child)]:inline">
        {right}
      </span>
    </footer>
  )
}
