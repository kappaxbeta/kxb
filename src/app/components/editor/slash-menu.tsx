'use client'

import type { Editor, Range } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  filterSlashItems,
  SLASH_ITEMS,
  type SlashItem,
} from '@/app/components/editor/slash-command'

/**
 * The popup for the `/` menu.
 *
 * Rendered imperatively into a floating div rather than as part of the React
 * tree, because Suggestion's lifecycle is a ProseMirror plugin: it tells us to
 * appear, update and disappear from inside an editor transaction, which is not
 * a place React state can be driven from.
 *
 * Keyboard handling is the part worth getting right. Arrow keys and Enter must
 * be swallowed *before* ProseMirror sees them, or Enter inserts a paragraph
 * while also running the command, and the arrows move the cursor instead of the
 * selection. `onKeyDown` returning true is what stops that.
 */

interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

function SlashMenu({
  items,
  command,
  handleRef,
}: {
  items: SlashItem[]
  command: (item: SlashItem) => void
  handleRef: { current: MenuHandle | null }
}) {
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // A fresh query means the old highlight index may not exist any more.
  //
  // Adjusted during render by comparing against the previous list rather than
  // in an effect: setState inside an effect renders once with a stale
  // highlight, then again to correct it, and tears under concurrent rendering.
  const [prevItems, setPrevItems] = useState(items)
  if (prevItems !== items) {
    setPrevItems(items)
    setSelected(0)
  }

  const select = useCallback(
    (index: number) => {
      const item = items[index]
      if (item) command(item)
    },
    [items, command],
  )

  useImperativeHandle(
    handleRef,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
          setSelected((current) => (current + 1) % items.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setSelected((current) => (current + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          select(selected)
          return true
        }
        return false
      },
    }),
    [items, selected, select],
  )

  // Keep the highlighted row visible when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-xl border border-line bg-surface-raised p-3 text-sm text-ink-muted shadow-xl">
        No matching blocks
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface-raised p-1 shadow-xl"
    >
      {items.map((item, index) => {
        // First occurrence of a group gets the heading. Derived from the list
        // rather than tracked in a variable that render mutates as it goes.
        const showGroup = index === 0 || items[index - 1]?.group !== item.group

        return (
          <div key={item.title}>
            {showGroup && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                {item.group}
              </div>
            )}
            <button
              type="button"
              data-index={index}
              // Mouse-down, not click: click fires after blur, and losing the
              // selection first makes the command apply at the wrong place.
              onMouseDown={(event) => {
                event.preventDefault()
                command(item)
              }}
              onMouseEnter={() => setSelected(index)}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                index === selected ? 'bg-accent/10' : 'hover:bg-surface'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.description}
                </span>
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Glue between Suggestion's imperative lifecycle and React.
 *
 * Positioned with plain `getBoundingClientRect` rather than a positioning
 * library: the menu is one small popup anchored to a caret, and pulling in
 * Floating UI for it would be more dependency than the problem deserves. The
 * flip-up-when-near-the-bottom case is handled by hand below.
 */
export function slashSuggestionRender(
  items: SlashItem[] = SLASH_ITEMS,
): SuggestionOptions['render'] {
  return () => {
    let container: HTMLDivElement | null = null
    let root: Root | null = null
    const handleRef: { current: MenuHandle | null } = { current: null }

    const position = (rect: DOMRect | null | undefined) => {
      if (!container || !rect) return

      const menuHeight = container.offsetHeight || 320
      const spaceBelow = window.innerHeight - rect.bottom
      const flip = spaceBelow < menuHeight + 16

      container.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
      container.style.top = flip
        ? `${rect.top - menuHeight - 8}px`
        : `${rect.bottom + 8}px`
    }

    const paint = (items: SlashItem[], command: (item: SlashItem) => void) => {
      root?.render(
        <SlashMenu items={items} command={command} handleRef={handleRef} />,
      )
    }

    return {
      onStart: (props) => {
        container = document.createElement('div')
        container.style.position = 'fixed'
        container.style.zIndex = '50'
        document.body.appendChild(container)
        root = createRoot(container)

        paint(filterSlashItems(items, props.query), (item) =>
          props.command(item as unknown as Record<string, unknown>),
        )
        position(props.clientRect?.())
      },

      onUpdate: (props) => {
        paint(filterSlashItems(items, props.query), (item) =>
          props.command(item as unknown as Record<string, unknown>),
        )
        position(props.clientRect?.())
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') return true
        return handleRef.current?.onKeyDown(props.event) ?? false
      },

      onExit: () => {
        // Unmount on a later tick. React refuses to unmount a root while it is
        // rendering, and this can fire from inside a transaction that React is
        // still committing.
        const dyingRoot = root
        const dyingContainer = container
        root = null
        container = null
        setTimeout(() => {
          dyingRoot?.unmount()
          dyingContainer?.remove()
        }, 0)
      },
    }
  }
}

export type { SlashItem, Editor, Range }
