'use client'

import { useState, type ReactNode } from 'react'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * The workbench, as three questions instead of one scroll.
 *
 * ---------------------------------------------------------------------------
 * Why tabs here, when stacked sections are usually the honest answer
 * ---------------------------------------------------------------------------
 * Because these three are not degrees of the same thing. *Magazine* is what
 * this space collected, *Store* is everything it could collect, and *Projects*
 * is what it is building - three different verbs, and somebody arriving has
 * already decided which one they came for. Stacked, the store is the longest
 * list on the page and sat between the other two, so the shelf you own scrolled
 * off the top the moment the catalogue filled up. That is what made "you cannot
 * remove anything from the magazine" a reasonable thing to conclude: the
 * magazine was an empty two-line section above eleven rows of store.
 *
 * The counts are on the tabs for the same reason. A tab that might be empty and
 * does not say so is a tab nobody presses twice.
 *
 * ---------------------------------------------------------------------------
 * Client state rather than a route
 * ---------------------------------------------------------------------------
 * `?tab=store` would survive a refresh and be linkable, which sounds strictly
 * better and is not: this page is `force-dynamic` and every one of those
 * navigations is a round trip that re-runs four queries to change which of
 * three already-rendered panels is visible. The panels are cheap and already
 * here. What a URL would buy - linking somebody to the store - is not something
 * anybody does; they link to a level.
 */

export interface BrowseTab {
  id: string
  label: string
  /** Shown beside the label. Omitted rather than zero - see the note above. */
  count?: number
  panel: ReactNode
}

export function BrowseTabs({ tabs }: { tabs: BrowseTab[] }) {
  const [open, setOpen] = useState(tabs[0]?.id ?? '')
  const current = tabs.find((tab) => tab.id === open) ?? tabs[0]

  return (
    <div>
      <div
        role="tablist"
        aria-label={browseDict(useLocale()).heading}
        className="flex flex-wrap gap-1 border-b border-line/40"
      >
        {tabs.map((tab) => {
          const active = tab.id === current?.id

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`browse-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`browse-panel-${tab.id}`}
              onClick={() => setOpen(tab.id)}
              // An underline, not a card: `border-b-2` sits on the tablist's
              // own bottom rule, which `-mb-px` pulls it over. No radius —
              // there is no background or full border for one to round, so it
              // only made this read as a card edge that it is not.
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 font-mono text-xs tabular-nums text-ink-muted/70">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/*
        Only the open one is mounted.

        The panels hold pickers with their own transition state - a row halfway
        through being taken in - and keeping three mounted would mean three
        copies of that state, only one of which anybody can see. Remounting
        loses an in-flight optimistic move on tab switch, which is the correct
        thing to lose: the server has the answer either way.
      */}
      {current && (
        <div
          role="tabpanel"
          id={`browse-panel-${current.id}`}
          aria-labelledby={`browse-tab-${current.id}`}
          className="pt-6"
        >
          {current.panel}
        </div>
      )}
    </div>
  )
}
