'use client'

import type { Tool } from '@/app/xp/_editor/stage/stage'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'

/**
 * The tools, as a strip under the title bar.
 *
 * They were a two-column grid of words in a dockable panel, which is the wrong
 * home for them twice over. A tool is not a *view* - it is the thing your hand
 * is holding, so it should be in the same place every time you look for it
 * rather than wherever the panel was last dragged, and it should be one glance
 * rather than a list to read. A panel that can be closed is also a panel that
 * can be closed by accident, and closing your toolbox is not an interface state
 * anybody wants to be in.
 *
 * Drawn rather than lettered, for the reason the gizmo handles already are: a
 * row of eight words is eight things to read and a row of eight shapes is one
 * glance. The letter stays on each as a tooltip, because somebody who has
 * learned `B` will never look at this again and somebody who has not needs
 * telling once.
 *
 * `currentColor` throughout, so the pressed state below is the only place a
 * colour is decided.
 */

export interface ToolSpec {
  id: Tool
  label: string
  /** The key that reaches it, for the tooltip. Empty when it has none yet. */
  key: string
  icon: () => React.ReactElement
}

export const TOOLS: readonly ToolSpec[] = [
  { id: 'select', label: 'Select', key: '', icon: SelectIcon },
  { id: 'hand', label: 'Hand', key: '', icon: HandIcon },
  { id: 'place', label: 'Place', key: 'B', icon: PlaceIcon },
  { id: 'draw', label: 'Draw', key: 'B', icon: DrawIcon },
  { id: 'erase', label: 'Erase', key: 'E', icon: EraseIcon },
  { id: 'line', label: 'Line', key: '', icon: LineIcon },
  { id: 'rect', label: 'Fill', key: '', icon: FillIcon },
  { id: 'room', label: 'Room', key: '', icon: RoomIcon },
]

export function ToolBar({
  tool,
  onTool,
}: {
  tool: Tool
  onTool: (tool: Tool) => void
}) {
  const t = xpEditorDict(useLocale()).shell
  return (
    <div
      role="toolbar"
      aria-label={t.tools}
      /*
        One grouped strip rather than eight loose buttons: a hairline box around
        the set says "these are the things your hand can hold" and separates
        them from whatever else the bar gains, which is how a toolbar stays a
        toolbar when a second group arrives beside it.
      */
      className="flex items-center gap-0.5 rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-0.5"
    >
      {TOOLS.map(({ id, label, key, icon: Icon }) => {
        // The dictionary's word, or the table's own - see `boneLabel` in the
        // animator for the same arrangement and the reason for it.
        const name = t.toolNames[id] ?? label
        return (
        <button
          key={id}
          type="button"
          title={key ? `${name} (${key})` : name}
          aria-label={name}
          aria-pressed={tool === id}
          onClick={() => onTool(id)}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            tool === id
              ? 'bg-violet-500/20 text-violet-100 shadow-[inset_0_0_0_1px_rgb(139_92_246/0.35)]'
              : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
          }`}
        >
          <Icon />
        </button>
        )
      })}
    </div>
  )
}

/* Sixteen-pixel glyphs, hand-drawn for the same reason the gizmo's are: the
   shape has to say what the tool does to *this* editor, and a stock icon set
   has no idea what "room" means here. */

const stroke = {
  className: 'h-4 w-4',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** An arrow. The one tool everybody already knows the shape of. */
function SelectIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M3 2.5 12 8l-3.6 1.1L6.6 13z" />
    </svg>
  )
}

/** An open hand: the tool that takes hold of nothing and moves you instead. */
function HandIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M6 7V3.4a1 1 0 0 1 2 0V7" />
      <path d="M8 7V2.8a1 1 0 0 1 2 0V7" />
      <path d="M10 7.2V4.2a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-4.5 4.5H7A4 4 0 0 1 3.4 11L2.6 9.2a1 1 0 0 1 1.7-1L6 10.2" />
    </svg>
  )
}

/** One block, coming down onto a surface. */
function PlaceIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M2 12.5h12" />
      <rect x="5" y="6" width="6" height="4" rx="0.6" />
      <path d="M8 2v2.6M8 4.6 6.9 3.4M8 4.6 9.1 3.4" />
    </svg>
  )
}

/** A brush, because Draw is the one that keeps going while you hold it. */
function DrawIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M11.2 2.6 13.4 4.8 6.6 11.6 3.8 12.4 4.6 9.6z" />
      <path d="M2.6 13.6h3" />
    </svg>
  )
}

/** An eraser, tipped the way a hand holds one. */
function EraseIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M6.4 12.6 2.9 9.1a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0l3.5 3.5a1 1 0 0 1 0 1.4l-4 4z" />
      <path d="M13.4 12.6h-7" />
    </svg>
  )
}

/** Two ends and the run between them. */
function LineIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M4.6 11.4 11.4 4.6" />
      <circle cx="3.6" cy="12.4" r="1.4" />
      <circle cx="12.4" cy="3.6" r="1.4" />
    </svg>
  )
}

/** A filled rectangle: everything inside the drag, not just its edge. */
function FillIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
      <path d="M4.6 6.5h6.8M4.6 9h6.8M4.6 11.4h6.8" />
    </svg>
  )
}

/** A rectangle with walls and a gap in one: the outline, and a way in. */
function RoomIcon() {
  return (
    <svg viewBox="0 0 16 16" {...stroke}>
      <path d="M2.5 3.5v9h4M9.5 12.5h4v-9h-11" />
    </svg>
  )
}
