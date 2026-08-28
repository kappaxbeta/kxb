'use client'

import { Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

/**
 * Fill the whole dock with one panel, and put it back.
 *
 * The animator is the panel this was written for: it is a 3D stage, a timeline
 * and forty controls, and a sixth of the editor's width is not enough of a
 * screen to pose a body in. `HOME` in ./dock already puts it in the viewport's
 * own group for that reason - this is the rest of the answer, which is a way to
 * say "just this, all of it" without dragging the splitters about and then
 * dragging them back.
 *
 * ---------------------------------------------------------------------------
 * Dockview's maximize, not an overlay of our own
 * ---------------------------------------------------------------------------
 * The obvious alternative is a portal that covers the editor. It is the wrong
 * one: a panel rendered somewhere other than where dockview put it is a panel
 * whose 3D canvas is unmounted and remounted - the animator would lose its
 * camera, its selection and its GL context every time somebody pressed this -
 * and the dock's own layout would still be underneath, unaware.
 *
 * `api.maximize()` moves nothing. The group keeps its DOM, dockview lays it
 * over the grid, and `exitMaximized()` gives the splitters back exactly where
 * they were. It also means the state is dockview's rather than a second copy of
 * it here, which matters for the one case a local `useState` would get wrong:
 * the group can be un-maximized by things that are not this button - loading a
 * layout, or dragging the panel elsewhere. So the label follows the dock rather
 * than the click, via `onDidMaximizedGroupChange`.
 *
 * Returns null when there is no dock at all. The phone shell draws these same
 * components one at a time with no props (see ./mobile), where every panel
 * already fills the screen and a Fill button would be a control that does
 * nothing.
 */
export function useFill(props: Partial<IDockviewPanelProps>) {
  const { api, containerApi } = props

  /*
   * `useSyncExternalStore` and not a `useState` kept in step by an effect: the
   * dock *is* the store, and mirroring it into React state means a render
   * where the two disagree - plus the lint rule that says so.
   */
  const filled = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (!containerApi) return () => {}
        const sub = containerApi.onDidMaximizedGroupChange(onChange)
        return () => sub.dispose()
      },
      [containerApi],
    ),
    () => api?.isMaximized() ?? false,
    // Nothing is maximized before the dock exists, which is what the server
    // renders and what the first client render has to match.
    () => false,
  )

  const toggle = useCallback(() => {
    if (!api) return
    if (api.isMaximized()) api.exitMaximized()
    else api.maximize()
  }, [api])

  if (!api) return null
  return { filled, toggle }
}

/**
 * The control itself: one button with two states, not two buttons.
 *
 * Fill and Normalize are the same idea pointed in opposite directions, and only
 * ever one of them is available - a Normalize beside a filled panel is a button
 * that is disabled half the time it is on screen. The icon carries the
 * direction and the word says which one it is.
 */
export function FillButton({
  filled,
  onToggle,
  fillLabel,
  normalizeLabel,
}: {
  filled: boolean
  onToggle: () => void
  fillLabel: string
  normalizeLabel: string
}) {
  const label = filled ? normalizeLabel : fillLabel
  const Icon = filled ? Minimize2 : Maximize2
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-pressed={filled}
      className="flex shrink-0 items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-neutral-300 uppercase transition-colors hover:border-neutral-600 hover:text-neutral-100"
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </button>
  )
}
