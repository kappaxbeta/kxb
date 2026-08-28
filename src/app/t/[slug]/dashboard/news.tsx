'use client'

import { X } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { NewsItem } from '@/domain/news/queries'
import { NEWS_BANNER_HEIGHT } from '@/domain/news/links'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * Platform announcements, where a space will actually see them.
 *
 * The same rows twice, deliberately: a banner over the board until it is waved
 * away, and a tab that keeps every one of them. Dismissing is "I have read
 * this", so it must not be the only copy - the tab is where somebody goes to
 * find the thing they closed last week without reading.
 *
 * ---------------------------------------------------------------------------
 * Where "dismissed" lives
 * ---------------------------------------------------------------------------
 * `localStorage`, keyed by row id, argued in the migration: a dismissals table
 * would be the widest table in the schema, written on a click nobody queries,
 * to save one click on one browser.
 *
 * Storage is not read until the component knows it is in a browser. The board
 * is server-rendered, and reading it while rendering would give the server one
 * answer and the client another - which React would rightly call a hydration
 * mismatch. So the first paint has no banner and the second one has it, which
 * is also why the banner does not shove the board down as it appears: it is the
 * first thing in the column, so the only thing that moves is what was already
 * below it.
 */

const STORAGE_KEY = 'kxb.news.dismissed'

/**
 * Which announcements this browser has waved away.
 *
 * Everything is inside a try: storage throws in a private window in some
 * browsers and when a quota is full, and an announcement banner is not worth a
 * broken board. A throw reads as "nothing dismissed", which shows one card too
 * many rather than none.
 */
function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Nothing to subscribe to: the answer only differs between server and client. */
const noop = () => () => {}

function useDismissed(): [string[] | null, (id: string) => void] {
  /**
   * Whether this is the browser yet.
   *
   * `useSyncExternalStore` rather than a `setState` in an effect, which is the
   * same trick with an extra render and a lint rule against it. The server
   * snapshot is `false` and the client's is `true`, so the first paint matches
   * what was sent and the second one knows about storage.
   */
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )

  /** Waved away during this page's life, before storage has been re-read. */
  const [justDismissed, setJustDismissed] = useState<string[]>([])

  const dismiss = useCallback((id: string) => {
    setJustDismissed((current) => [...current, id])
    try {
      // Trimmed to the last fifty. The list only grows, and nobody needs to
      // remember dismissing an announcement from two years ago - the ones that
      // matter are the ones still being shown.
      const next = [...new Set([...readDismissed(), id])].slice(-50)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Kept in state for this page regardless, so the x still works.
    }
  }, [])

  // Null means "not known yet", which is not the same as "none dismissed" -
  // the banner draws nothing until it can tell the two apart.
  return [mounted ? [...readDismissed(), ...justDismissed] : null, dismiss]
}

/**
 * The newest announcement this reader has not waved away.
 *
 * One at a time, never a stack. Two banners over a board is a takeover, and
 * the second one is in the News tab where it can be read at leisure.
 */
export function NewsBanner({ news }: { news: NewsItem[] }) {
  const t = workspaceDict(useLocale()).board
  const [dismissed, dismiss] = useDismissed()

  if (dismissed === null) return null

  const item = news.find((entry) => !dismissed.includes(entry.id))
  if (!item) return null

  return (
    <article
      // Capped rather than fixed: a headline with no picture and no body should
      // be a strip, not 300px of empty card. The number is the ceiling the
      // design asked for, and it lives in one place both ends import.
      style={{ maxHeight: NEWS_BANNER_HEIGHT }}
      // Cyan, not fuchsia. The two neons have one job each here: fuchsia means
      // you can press it, and this is a card you read. Framing an announcement
      // in the interaction colour made the whole banner look like a button and
      // left the links inside it with nothing louder to be.
      className="relative flex gap-4 overflow-hidden rounded-2xl border border-accent-2/30 bg-gradient-to-br from-accent-2/[0.08] via-surface-raised/40 to-transparent"
    >
      {item.image && (
        // Deliberately not `next/image`: these are small static files served
        // from /public, the box is fixed, and the optimiser would add a request
        // through a route to save nothing on a 40kB webp.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="hidden w-44 shrink-0 self-stretch object-cover sm:block"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-5 pr-12">
        {/* The one place on this page a label above a heading earns its keep:
            it is not describing the headline, it is naming who is speaking.
            This is the platform talking into somebody else's space, and without
            it the card reads as a notice the space wrote itself. Cyan, because
            "ours" is exactly what it means. */}
        <p className="font-pixel text-[0.6rem] tracking-[0.18em] text-accent-2 uppercase">
          {t.news}
        </p>
        <h3 className="text-base leading-snug font-medium">{item.headline}</h3>
        {item.body && (
          <p className="line-clamp-4 text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">
            {item.body}
          </p>
        )}
        <NewsLinks item={item} />
      </div>

      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t.hideAnnouncement}
        title={t.hideIt}
        className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>
    </article>
  )
}

/** Every announcement, dismissed or not. The archive half. */
export function NewsList({ news }: { news: NewsItem[] }) {
  const t = workspaceDict(useLocale()).board

  if (news.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line/70 p-8 text-center text-sm text-ink-muted">
        {t.noNews}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {news.map((item) => (
        <li
          key={item.id}
          className="flex gap-4 overflow-hidden rounded-2xl border border-line/60 bg-surface-raised/20 p-4"
        >
          {item.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt=""
              className="hidden size-20 shrink-0 rounded-xl object-cover sm:block"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-xs text-ink-muted">
              <PostedOn at={item.createdAt} />
            </p>
            <h3 className="text-sm leading-snug font-medium">{item.headline}</h3>
            {item.body && (
              <p className="text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">
                {item.body}
              </p>
            )}
            <NewsLinks item={item} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Where an announcement points.
 *
 * An external link opens in a new tab and says so to a screen reader; an
 * internal one navigates normally, because taking somebody out of their space
 * to show them a page of their space is the kind of thing that loses a draft.
 */
function NewsLinks({ item }: { item: NewsItem }) {
  if (item.links.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {item.links.map((link) => {
        const external = link.href.startsWith('https://')
        return (
          <a
            key={`${link.href}:${link.label}`}
            href={link.href}
            {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="rounded-lg border border-line/70 px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
          >
            {link.label}
          </a>
        )
      })}
    </div>
  )
}

/** Client-formatted, for the reason `PostedAt` on the board gives. */
function PostedOn({ at }: { at: string }) {
  return (
    <time dateTime={at} suppressHydrationWarning>
      {new Date(at).toLocaleDateString()}
    </time>
  )
}
