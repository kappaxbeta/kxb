'use client'

import { useEffect, useMemo, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { Navigate, PANELS } from '@/app/xp/_editor/shell/dock'
import { Icon, type RailAction, type ToolWindow } from '@/app/xp/_editor/shell/rail'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'

/**
 * The editor on a phone: the level, and one panel under it.
 *
 * ---------------------------------------------------------------------------
 * Why not the dock, smaller
 * ---------------------------------------------------------------------------
 * The dock is a sixth, four sixths, a sixth - three columns and a drawer - and
 * at 375 pixels a sixth is 62 of them, which is a column you can see is there
 * and cannot read. It was tried: panels tabbed behind each other, tabs whose
 * titles did not fit, the viewport a postage stamp in the middle. A docked
 * layout is a layout for a screen with room to arrange things in, and a phone
 * is the case where arranging is the wrong verb - there is room for one thing
 * at a time, and the job is choosing which.
 *
 * So below `md` the editor is a column: the level at the top, always, because
 * every panel is *about* the level and a form you cannot see the effect of is a
 * form you fill in twice; a strip of the panels by name, which is the rail
 * turned sideways and given its words back; and the chosen panel, full width,
 * scrolling on its own. Nothing is torn down on a switch - the panels are the
 * same components the dock mounts, reading the same context, so the document
 * and the selection are exactly what they were.
 *
 * ---------------------------------------------------------------------------
 * The split is a thumb, not a number
 * ---------------------------------------------------------------------------
 * Two heights for the level, and a control that swaps them. Tall enough to
 * place things in by default; short when somebody is reading a long form and
 * wants the room. Not a drag handle: a drag between two scrolling regions on a
 * touch screen is a gesture that fights both of them, and two sizes cover
 * every case anybody has asked for.
 *
 * `Navigate` is honoured, so a link in one panel that says "open Blueprints"
 * switches the strip rather than doing nothing - which is what it would do
 * under the dock's own provider, which is not mounted here.
 */

/** The same breakpoint the workspace's drawer uses, in the same units. */
const NARROW = '(max-width: 47.999rem)'

/**
 * Whether the screen is one the dock cannot fit on.
 *
 * `false` on the first render and corrected in an effect rather than read
 * synchronously, so the server and the client agree about the first frame -
 * the editor is `ssr: false` anyway, but a hook that reads `window` during
 * render is a hook that breaks the day it is not.
 */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return narrow
}

export function MobileShell({
  windows,
  actions,
}: {
  windows: readonly ToolWindow[]
  /** The rail's second zone - Try, and whatever joins it. Drawn at the end of the strip. */
  actions: readonly RailAction[]
}) {
  const t = xpEditorDict(useLocale())
  const titles = t.chrome.windows
  const [active, setActive] = useState<string>(windows[0]?.id ?? 'scene')
  const [stage, setStage] = useState<'tall' | 'short'>('tall')

  const Viewport = PANELS.viewport as React.FunctionComponent<Partial<IDockviewPanelProps>>
  const Panel = PANELS[active] as React.FunctionComponent<Partial<IDockviewPanelProps>> | undefined

  // A panel asking for another by id - honoured only for ids the strip knows.
  const show = useMemo(
    () => (id: string) => {
      if (windows.some((window) => window.id === id)) setActive(id)
    },
    [windows],
  )

  return (
    <Navigate.Provider value={show}>
      <div className="flex h-full min-h-0 flex-col">
        {/* The level. Always there, because every panel below is about it. */}
        <div
          className={`relative shrink-0 border-b border-neutral-800 transition-[height] duration-200 ${
            stage === 'tall' ? 'h-[42%]' : 'h-[22%]'
          }`}
        >
          <Viewport />
          <button
            type="button"
            onClick={() => setStage(stage === 'tall' ? 'short' : 'tall')}
            aria-label={stage === 'tall' ? t.shell.lessLevel : t.shell.moreLevel}
            title={stage === 'tall' ? t.shell.lessLevel : t.shell.moreLevel}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-neutral-950/70 text-neutral-300 backdrop-blur-sm active:bg-neutral-800"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {stage === 'tall' ? (
                <path d="M4 6.5 8 10.5l4-4" />
              ) : (
                <path d="M4 9.5 8 5.5l4 4" />
              )}
            </svg>
          </button>
        </div>

        {/*
          The strip: the rail, turned sideways and given its words back.

          A pictogram with its name under it, because on a phone there is no
          hover and therefore no tooltip, and twelve unlabelled shapes in a row
          is a guessing game. Scrolls sideways; the active one is brought into
          view when a panel link changes it.
        */}
        <nav
          aria-label={t.chrome.toolWindows}
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-neutral-800 bg-neutral-900/40 px-1 py-1 [&::-webkit-scrollbar]:hidden"
          // Inline, because globals.css sets `scrollbar-width: thin` on every
          // element from an unlayered rule, which beats a utility of the same
          // specificity - and a pink scrollbar under a row of tabs reads as a
          // second active-tab indicator.
          style={{ scrollbarWidth: 'none' }}
        >
          {windows.map((window) => {
            const on = window.id === active
            return (
              <button
                key={window.id}
                type="button"
                onClick={() => setActive(window.id)}
                aria-pressed={on}
                aria-label={titles[window.id] ?? window.label}
                ref={(node) => {
                  if (on && node) node.scrollIntoView({ inline: 'nearest', block: 'nearest' })
                }}
                className={`flex min-w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors ${
                  on
                    ? 'bg-violet-500/15 text-violet-200'
                    : 'text-neutral-500 active:bg-neutral-800 active:text-neutral-200'
                }`}
              >
                <Icon glyph={window.icon} />
                <span className="font-mono text-[10px] leading-none">
                  {titles[window.id] ?? window.label}
                </span>
              </button>
            )
          })}
          {actions.length > 0 ? <span className="mx-1 w-px shrink-0 self-stretch bg-neutral-800" /> : null}
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                if (action.confirm && !window.confirm(action.confirm)) return
                action.onSelect()
              }}
              className="flex min-w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300 transition-colors active:border-violet-500/60 active:text-violet-200 disabled:opacity-40"
            >
              <Icon glyph={action.icon} />
              <span className="font-mono text-[10px] leading-none">{action.label}</span>
            </button>
          ))}
        </nav>

        {/* The chosen panel, and the room it needs. */}
        <div className="min-h-0 flex-1 overflow-hidden">{Panel ? <Panel /> : null}</div>
      </div>
    </Navigate.Provider>
  )
}
