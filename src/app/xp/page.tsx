import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Link from 'next/link'
import type { Metadata } from 'next'
import { requireXpAccess } from '@/app/xp/gate'
import { CATALOGUE, packModels, packSize } from '@kxb/xp/catalogue'
import { parseXp } from '@kxb/xp'
import { credits, PACK_ORDER, PACKS, thumbnailUrl } from '@kxb/xp/packs'

/**
 * What the XP creator has to build with.
 *
 * The first thing in this route, and deliberately the dullest: every model in
 * the decoupled catalogue, drawn from the decoupled asset folder, with the two
 * facts about each one that the rest of the editor will depend on - how big it
 * is on the grid, and whether it stands on the floor or hangs from its middle.
 *
 * It exists to be *looked at*. The catalogue drift test proves the list matches
 * the disk and the measurement script proves the scale, but neither can tell
 * you that a tile is drawing the wrong model or that a wall and a half wall are
 * indistinguishable in the picker. That is what an eye is for, and it is why
 * this page comes before the editor rather than inside it.
 */

export const metadata: Metadata = {
  title: 'XP · Catalogue',
  robots: { index: false, follow: false },
}

const XPS = path.join(process.cwd(), 'public', 'xp', 'xps')

/**
 * The XPs on disk, with their names read out of them.
 *
 * A directory listing rather than a table, because an XP is a file for all of
 * v1 (docs/xp/creator.md §3.1). A document that no longer parses still gets a
 * row here - with its problem instead of its name - because the alternative is
 * a file that quietly stops being listed, which is the hardest kind of missing
 * to notice.
 */
async function listXps(): Promise<{ id: string; name: string; blurb?: string; ok: boolean }[]> {
  let files: string[]
  try {
    files = await readdir(XPS)
  } catch {
    return []
  }

  const found = await Promise.all(
    files
      .filter((f) => f.endsWith('.xp.json'))
      .sort()
      .map(async (f) => {
        const id = f.slice(0, -'.xp.json'.length)
        try {
          const parsed = parseXp(JSON.parse(await readFile(path.join(XPS, f), 'utf8')))
          if (!parsed.ok) {
            return {
              id,
              name: id,
              blurb: `${parsed.problems.length} problem${parsed.problems.length === 1 ? '' : 's'} — open it to see them`,
              ok: false,
            }
          }
          return {
            id,
            name: parsed.document.name,
            blurb: parsed.document.blurb,
            ok: true,
          }
        } catch {
          return { id, name: id, blurb: 'could not be read', ok: false }
        }
      }),
  )

  return found
}

export default async function XpCataloguePage() {
  await requireXpAccess()

  const xps = await listXps()

  return (
    <div className="dark min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            XP creator
          </p>
          <h1 className="mt-2 text-2xl font-medium">Catalogue</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
            {CATALOGUE.length} models across {PACK_ORDER.length} packs, served from{' '}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300">
              /xp/packs/
            </code>
            . One cell is one metre, and the prototype kit is authored to match — so a
            wall is four cells wide with nothing to convert.
          </p>
        </header>

        {xps.length > 0 ? (
          <section className="mb-14">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-medium">Experiences</h2>
              <span className="font-mono text-xs text-neutral-500">
                {xps.length} · from /xp/xps/
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {xps.map((xp) => (
                <li key={xp.id}>
                  <Link
                    href={`/xp/${xp.id}`}
                    className="block rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 transition-colors hover:border-neutral-600"
                  >
                    <p className="text-sm text-neutral-100">{xp.name}</p>
                    {xp.blurb ? (
                      <p
                        className={`mt-1 text-xs leading-relaxed ${
                          xp.ok ? 'text-neutral-500' : 'text-amber-400'
                        }`}
                      >
                        {xp.blurb}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-[10px] leading-tight text-neutral-600">
                      {xp.id}.xp.json
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {PACK_ORDER.map((packId) => {
          const pack = PACKS[packId]
          const models = packModels(packId)

          return (
            <section key={packId} className="mb-14">
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-800 pb-3">
                <h2 className="text-lg font-medium">{pack.label}</h2>
                <span className="font-mono text-xs text-neutral-500">
                  {packSize(packId)} models · scale {pack.scale} · lift {pack.lift}
                </span>
                <a
                  href={pack.source}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ml-auto text-xs text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
                >
                  {pack.author} · {pack.licence}
                </a>
              </div>

              <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
                {models.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2 transition-colors hover:border-neutral-600"
                  >
                    <div className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          checked-in thumbnail, already the exact size it is drawn
                          at; the optimiser has nothing to do here. */}
                      <img
                        src={thumbnailUrl(entry.id)}
                        alt={entry.label}
                        width={192}
                        height={192}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                      {entry.centred ? (
                        <span
                          title="Pivoted at its middle — a socket item, not a floor prop"
                          className="absolute right-0 top-0 rounded bg-amber-500/15 px-1 font-mono text-[10px] leading-tight text-amber-400"
                        >
                          ctr
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-[11px] leading-tight text-neutral-300">
                      {entry.label}
                    </p>
                    {/* The size is what tells a wall from a half wall - the
                        picture cannot, because every tile is fitted to its
                        frame. Cells, so it is comparable across packs. */}
                    <p className="font-mono text-[10px] leading-tight text-neutral-500">
                      {entry.size.w} × {entry.size.h} × {entry.size.d}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <footer className="border-t border-neutral-800 pt-6">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Credits
          </p>
          <ul className="space-y-1 text-xs text-neutral-500">
            {credits().map((credit) => (
              <li key={credit.label}>
                {credit.label} — {credit.author}, {credit.licence},{' '}
                <a
                  href={credit.source}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline-offset-4 hover:text-neutral-300 hover:underline"
                >
                  {credit.source}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-neutral-600">
            Every pack is CC0 — a waiver rather than a licence with conditions — so an
            XP built here can be handed to anyone, art included. Credit is asked for and
            required by none of it.
          </p>
        </footer>
      </div>
    </div>
  )
}
