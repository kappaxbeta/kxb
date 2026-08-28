'use client'

import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { TEMPLATES } from '@/domain/studio/templates'
import { encodeShot } from '@/domain/studio/shot'
import type { WorkspaceDict } from '@/app/i18n/workspace'

/**
 * The ten worked examples, folded away.
 *
 * ---------------------------------------------------------------------------
 * Why they stopped being a section
 * ---------------------------------------------------------------------------
 * They were ten rows, permanently open, directly under the doors - which is
 * the right amount of room for the hardest problem the studio has, an empty
 * one, and far too much for everybody after their first afternoon. A page
 * whose top half is a tutorial is a page that thinks you have never been here,
 * every time you come back.
 *
 * So the examples keep their whole argument - the name, what each one teaches,
 * how long it runs - and give up their position. Open, they are exactly the
 * list that was here. Closed, they are one line, and the space above them
 * belongs to what this space has actually made.
 *
 * ---------------------------------------------------------------------------
 * `<details>`, not a menu
 * ---------------------------------------------------------------------------
 * The obvious build is a button and a floating panel, and it would be worse in
 * three ways for no gain: it needs its own focus trap, its own Escape, and its
 * own answer for a phone. A native disclosure has all three already, is
 * keyboard-reachable without any code here, and prints. The one thing it does
 * not do is float over the content - and on a page that is a vertical stack of
 * sections, pushing the rest down is the correct behaviour rather than a
 * compromise.
 */
export function TemplatePicker({
  slug,
  t,
}: {
  slug: string
  t: WorkspaceDict['studio']
}) {
  return (
    <details className="group rounded-xl border border-line/50 bg-surface-raised/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm transition hover:text-ink [&::-webkit-details-marker]:hidden">
        <Clapperboard className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="flex-1">{t.startFrom}</span>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {TEMPLATES.length}
        </span>
        {/* Rotated rather than swapped, so the control reads as one thing
            turning instead of two icons taking turns. */}
        <span
          aria-hidden
          className="text-ink-muted transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>

      <ul className="grid gap-2 border-t border-line/40 p-2 sm:grid-cols-2">
        {TEMPLATES.map((template) => (
          <li key={template.id}>
            {/*
              A plain link carrying the document, exactly as before: opening one
              makes it yours the moment you change anything, and saving it makes
              a row of your own rather than editing the template.
            */}
            <Link
              href={`/t/${slug}/studio/video?v=${encodeShot(template.shot)}`}
              className="flex h-full items-start gap-3 rounded-lg border border-line/50 bg-surface-raised/30 px-3 py-2.5 transition hover:border-accent/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  {t.templates[template.id]?.name ?? template.name}
                </span>
                <span className="block text-xs text-ink-muted">
                  {t.templates[template.id]?.teaches ?? template.teaches}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-muted">
                {template.shot.duration}s
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}
