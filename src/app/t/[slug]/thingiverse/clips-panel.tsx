'use client'

import Link from 'next/link'
import { useState } from 'react'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import type { ClipView } from '@/domain/thingiverse/queries'

/**
 * What this space has animated, as a list you open one of.
 *
 * ---------------------------------------------------------------------------
 * A list rather than the editor
 * ---------------------------------------------------------------------------
 * The pose editor is a rig in a viewport with a timeline under it - the same
 * kind of page the bench is, and for the same reason it is not a panel: posing
 * is a spatial act and needs the screen. So this door lists what exists and
 * every row is a way into that page; making a new one is the button above.
 *
 * ---------------------------------------------------------------------------
 * No preview, and that is the honest version
 * ---------------------------------------------------------------------------
 * A row would love to show the pose. It cannot cheaply: a clip is baked samples
 * against a *rig*, and drawing one means loading a body's glTF and running the
 * clip on it - twenty rows would be twenty WebGL contexts, or one shared canvas
 * and a scheduler, for a thumbnail.
 *
 * What a row can say truthfully is what it plays on and how long it runs, which
 * is most of what somebody scanning for the right wave actually needs. A still
 * of frame zero would be worse than nothing: every clip starts from rest, so
 * twenty of them would be twenty identical pictures.
 */
export function ClipsPanel({
  slug,
  clips,
  t,
}: {
  slug: string
  clips: ClipView[]
  t: WorkspaceDict['thingiverse']['clips']
}) {
  /**
   * Which body's clips to show.
   *
   * Null is all of them, and it is the default because a space with one rig has
   * nothing to filter and should not be asked to.
   *
   * The filter exists because a clip is *not* portable between bodies, however
   * much it looks like it should be: it is baked samples keyed by bone name
   * against one rig, and the two this product ships are not the same skeleton -
   * the lounge's animals carry four clips of their own, and the XP rig carries a
   * hundred and thirty-nine on twenty-three joints. A wave authored on one plays
   * nothing on the other. So "which body" is not a tag, it is the first thing
   * that decides whether a clip is any use to you, which is why it is a row of
   * chips above the list rather than a line of small print inside each row.
   */
  const [body, setBody] = useState<string | null>(null)

  if (clips.length === 0) {
    return (
      <p className="rounded-xl border border-line/60 bg-surface px-4 py-6 text-sm text-ink-muted">
        {t.none}
      </p>
    )
  }

  /**
   * The rigs actually present, rather than every rig the product has.
   *
   * A chip for a body this space has never animated for is a filter that can
   * only ever empty the list - the same reason the pack chips are built from
   * `MODEL_PACKS` and not from a hand-written enum.
   */
  const bodies = [...new Set(clips.map((clip) => clip.skeleton))].sort()

  const shown = body === null ? clips : clips.filter((clip) => clip.skeleton === body)
  const mine = shown.filter((clip) => clip.mine)
  const shared = shown.filter((clip) => !clip.mine)

  return (
    <div className="space-y-4">
      {bodies.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            {t.playsOnLabel}
          </span>
          <Chip on={body === null} onClick={() => setBody(null)}>
            {fill(t.allBodies, { n: String(clips.length) })}
          </Chip>
          {bodies.map((rig) => (
            <Chip key={rig} on={body === rig} onClick={() => setBody(rig)}>
              {rig}
              <span className="ml-1 font-mono text-[10px] tabular-nums text-ink-muted">
                {clips.filter((clip) => clip.skeleton === rig).length}
              </span>
            </Chip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-[11px] text-ink-muted">{fill(t.noneForBody, { body: body ?? '' })}</p>
      ) : (
        <div className="space-y-5">
          <Band label={t.yours} clips={mine} slug={slug} />
          <Band label={t.shared} clips={shared} slug={slug} />
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        on
          ? 'border-accent/60 bg-accent/20 text-ink'
          : 'border-line/60 text-ink-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Band({
  label,
  clips,
  slug,
}: {
  label: string
  clips: ClipView[]
  slug: string
}) {
  if (clips.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => (
          <li key={clip.id}>
            <Link
              href={`/t/${slug}/thingiverse/clips?edit=${clip.id}`}
              className="block rounded-xl border border-line/60 bg-surface p-3 transition hover:border-accent/50 hover:bg-surface-raised"
            >
              <p className="truncate text-sm text-ink">{clip.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                {/*
                  The rig and the length, which are the two facts that decide
                  whether this is the clip you meant. `duration` comes off the
                  baked samples rather than off a stored field, so it cannot
                  disagree with what actually plays.
                */}
                {clip.skeleton} · {clip.clip.duration.toFixed(1)}s
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
