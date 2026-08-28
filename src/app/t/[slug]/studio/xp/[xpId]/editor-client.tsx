'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { XpDocument } from '@kxb/xp'
import { openRail } from '@/app/t/[slug]/open-rail'
import { saveFolder } from '@/app/t/[slug]/studio/xp/[xpId]/save-folder'
import { renameXp } from '@/domain/xps/actions'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * The editor, in a space, with the claim around it.
 *
 * Same component as the operator route — `src/app/xp/_editor` — given a place
 * for Save to go. Everything about editing a level is identical here and a
 * second copy would drift within a week; what differs is one prop.
 */
const Editor = dynamic(() => import('@/app/xp/_editor/editor').then((m) => m.Editor), {
  ssr: false,
  // The same height the editor itself takes - see `WindowChrome`. A loading
  // screen that is a hair taller than what replaces it is a page that scrolls
  // for a second and then does not, which reads as a jump.
  loading: () => (
    <div className="dark flex h-viewport-inset w-full items-center justify-center bg-neutral-950">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">opening</p>
    </div>
  ),
})

/**
 * Who holds the editor, as the *server* found it when the page rendered.
 *
 * Decided there rather than here on mount, and that is worth stating: it means
 * there is no moment where the editor is on screen before anybody knows whether
 * this person may type into it, and no "asking…" state to design. The client's
 * job is only to keep the claim alive and to notice if it is ever lost.
 */
export type OpeningClaim =
  | { at: 'held'; renewSeconds: number }
  | { at: 'taken'; by: string; freeAt: string }

export function SpaceEditor({
  xpId,
  slug,
  name,
  document,
  base: openedAt,
  backHref,
  opening,
}: {
  xpId: string
  slug: string
  /**
   * What the library calls this project.
   *
   * Passed separately from the document because they are separate names — see
   * the note on `EditorProps.name`. This is the one the title bar shows and the
   * one Rename writes.
   */
  name: string
  document: XpDocument
  /**
   * The version the page loaded, sent back with every save.
   *
   * It travels from the server render rather than being read here, because the
   * whole point of it is to say *what this screen is looking at* — a number
   * fetched on mount would drift from the document beside it the first time a
   * request was slow.
   */
  base: number
  backHref: string
  opening: OpeningClaim
}) {
  const [claim, setClaim] = useState<OpeningClaim>(opening)
  /**
   * What the *next* save is based on, which moves as saves land.
   *
   * The prop is only the starting point: after saving v6 this screen is looking
   * at v6, and holding the page's number would make the second save of a
   * sitting look stale and be refused. The server is the one that says which
   * version was written, so that is the number kept rather than one counted up
   * here.
   */
  const [base, setBase] = useState(openedAt)

  /**
   * Take the claim, then keep taking it.
   *
   * The renew interval comes from the server rather than being a constant here,
   * because the *lifetime* is the server's and the two have to stay in
   * proportion. A client that renewed on its own schedule would be one deploy
   * away from renewing slower than the claim expires.
   */
  const renewing = useRef<ReturnType<typeof setInterval> | null>(null)

  const ask = useCallback(async () => {
    try {
      const response = await fetch(`/api/xp/${xpId}/claim`, { method: 'POST' })
      const body = (await response.json()) as Record<string, unknown>

      if (body.held === true) {
        setClaim({ at: 'held', renewSeconds: Number(body.renewSeconds ?? 20) })
        return true
      }
      setClaim({
        at: 'taken',
        by: String(body.by ?? 'somebody else'),
        freeAt: String(body.freeAt ?? ''),
      })
      return false
    } catch {
      /**
       * The network, not a refusal. Editing continues: the claim is
       * bookkeeping, and the things that actually protect the document are the
       * permission ladder and `expected_version` on the save. Locking somebody
       * out of their own work because a status call failed would be the wrong
       * trade in the wrong direction.
       */
      setClaim({ at: 'held', renewSeconds: 20 })
      return true
    }
  }, [xpId])

  const renewSeconds = opening.at === 'held' ? opening.renewSeconds : 0

  useEffect(() => {
    // Nothing to renew if we never had it. The screen below says so and offers
    // a retry, which is a button rather than a poll on purpose: a page that
    // silently grabs a project the moment a colleague's laptop sleeps is worse
    // than one that waits to be asked.
    if (renewSeconds <= 0) return

    // Only the interval is set up here. The state it eventually writes is
    // written from a timer, not from a render — which is the difference this
    // restructure was for.
    renewing.current = setInterval(() => void ask(), renewSeconds * 1000)

    return () => {
      if (renewing.current) clearInterval(renewing.current)

      /**
       * Give it back on the way out, best effort.
       *
       * `keepalive` because a normal `fetch` is cancelled when the page goes,
       * which is exactly when this fires. It is an optimisation either way —
       * the claim expires on its own, so a release that never lands costs a
       * colleague ninety seconds rather than costing anybody the project.
       */
      void fetch(`/api/xp/${xpId}/claim`, { method: 'DELETE', keepalive: true }).catch(() => {})
    }
  }, [ask, renewSeconds, xpId])

  const onSave = useCallback(
    async (next: XpDocument) => {
      const result = await saveFolder(xpId, next, base)
      if (!result.ok) return { ok: false, error: result.error } as const
      setBase(result.version)
      // Handed back so the editor can stamp its draft with it. Without the
      // number, a draft cannot know whether it is this session's work or a
      // stale copy from before somebody else saved.
      return { ok: true, version: result.version } as const
    },
    [base, xpId],
  )

  /**
   * Rename, straight to the action.
   *
   * No `revalidatePath` reaching this screen — the action revalidates the
   * library and the project page, which are the pages that list the name, and
   * this one is a client editor holding a document it must not have swapped
   * under it mid-sentence. The editor keeps its own copy of the answer.
   */
  const onRename = useCallback(
    async (wanted: string) => renameXp(slug, xpId, wanted),
    [slug, xpId],
  )

  if (claim.at === 'taken') {
    return <TakenOver by={claim.by} freeAt={claim.freeAt} backHref={backHref} onRetry={ask} />
  }

  /*
    The editor takes the window, bar the left rail.

    `data-surface` is read by globals.css - it drops the right panel and
    unclamps the middle column. Here rather than inside `Editor`, because the
    same editor is also mounted at `/xp/<id>`, which has no rail to remove and
    no clamp to undo: this is a fact about the *page* the editor is on.

    `data-rail="icons"` says the surface has a rail of its own down the left
    edge, which the workspace's drawer tab needs to know about - on a phone the
    two were the same 35 pixels. Its own attribute rather than a second meaning
    for `wide`, because the hero maker and the shot studio are `wide` too and
    neither has a rail to collide with.
  */
  return (
    <div data-surface="wide" data-rail="icons">
      <Editor
        id={xpId}
        name={name}
        document={document}
        onSave={onSave}
        onRename={onRename}
        // The way out, on the window's own red light. Until now the only way
        // back to the space from a phone was the workspace drawer's tab, which
        // is a control about the *rail* rather than about this editor.
        backHref={backHref}
        // And the way into the workspace's menu from the same bar, which is
        // what the drawer's tab used to be for before it was hidden here -
        // see ./open-rail and the note in globals.css.
        onMenu={openRail}
        version={openedAt}
      />
    </div>
  )
}

/**
 * Somebody else has it open.
 *
 * A whole screen rather than a banner over a working editor, and that is the
 * decision: a read-only 3D editor looks exactly like a writable one until you
 * try to save, and finding out then is finding out after the work. §12.7 chose
 * one editor at a time; this is what that has to look like to be true.
 */
function TakenOver({
  by,
  freeAt,
  backHref,
  onRetry,
}: {
  by: string
  freeAt: string
  backHref: string
  onRetry: () => Promise<boolean>
}) {
  const locale = useLocale()
  const t = workspaceDict(locale).studio
  const [checking, setChecking] = useState(false)
  const free = freeAt ? new Date(freeAt) : null

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-16">
      <h1 className="font-pixel text-xl uppercase leading-tight">{t.lockedTitle}</h1>
      {/* The name keeps its own colour, so the sentence is split on its slot. */}
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        {t.lockedBody.split('{name}').map((part, index) => (
          <span key={index}>
            {index > 0 && <span className="text-ink">{by}</span>}
            {part}
          </span>
        ))}
      </p>
      {free && (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {t.freesUp.split('{time}').map((part, index) => (
            <span key={index}>
              {index > 0 && (
                <span className="tabular-nums text-ink">
                  {free.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              {part}
            </span>
          ))}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={checking}
          onClick={() => {
            setChecking(true)
            void onRetry().finally(() => setChecking(false))
          }}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60"
        >
          {checking ? t.checking : t.tryAgain}
        </button>
        <a
          href={backHref}
          className="rounded-full border border-line px-5 py-2 text-sm text-ink-muted transition hover:text-ink"
        >
          {t.backToProject}
        </a>
      </div>
    </main>
  )
}
