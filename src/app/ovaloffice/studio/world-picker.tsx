'use client'

import { Download, Globe, Search, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Add, Section } from '@/app/ovaloffice/studio/parts'
import { primeSet } from '@/app/world/shots/world-set'
import { worldSet } from '@/domain/scenes/actions'
import type { BlockSpec } from '@/domain/studio/scene'

/**
 * Somebody else's world, as this scene's set.
 *
 * ---------------------------------------------------------------------------
 * A browser, not a dropdown
 * ---------------------------------------------------------------------------
 * A select carries ids, which are unreadable, and forces a decision about a
 * *place* to be made from its name alone - which is the one thing about a world
 * that does not tell you what it looks like. These are the same stills the
 * discovery page draws, and they came down with the page, so the picture costs
 * nothing to show and is the only thing anybody actually chooses by.
 *
 * ---------------------------------------------------------------------------
 * Choosing a world is not copying one
 * ---------------------------------------------------------------------------
 * It was, and the world arrived as its middle hundred and twenty blocks because
 * the document goes in the URL - see `SetSpec` in `@/domain/studio/scene` for
 * why that stopped being tenable. Now the document names the world and the
 * renderer fetches it, so what lands is the whole place.
 *
 * The blocks still come back to the caller here, because two things want them
 * at the moment of choosing and neither can wait for the render: the camera has
 * to be aimed at where the world actually is, and the cache wants priming so
 * the viewport does not fetch the identical list a second time.
 *
 * ---------------------------------------------------------------------------
 * Why it is one component used by two panels
 * ---------------------------------------------------------------------------
 * Both studios want the same set from the same catalogue; what differs is what
 * each does about its camera - a still has one framing to re-aim, a shot has a
 * list of them somebody authored. So the picker owns the browsing and each
 * panel decides what a chosen world means for its own document.
 */
export interface ImportableWorld {
  id: string
  name: string
  blocks: number
  /** A still of the world, as a data URL, or null for a placeholder. */
  poster: string | null
  /** 'platform' is the kxb.team team's own; 'space' is a workspace's. */
  origin: 'platform' | 'space'
  spaceName: string | null
}

export function WorldPicker({
  worlds,
  current,
  onPick,
  onClear,
}: {
  worlds: ImportableWorld[]
  /** The world standing in the scene now, if any. */
  current: string | null
  /**
   * What to do with the chosen world. Returns a line to show, or nothing.
   *
   * The caller writes the note because only it knows what it did - a still
   * re-frames its camera, a shot may have left a camera move alone - and a
   * message written here would have to guess.
   */
  onPick: (
    worldId: string,
    blocks: BlockSpec[],
    counts: { props: number; dropped: number },
  ) => string | null
  /** Take the world away again, leaving whatever was placed by hand. */
  onClear: () => void
}) {
  // Starts on whatever is already standing, so the panel opens describing the
  // scene rather than describing nothing.
  const [chosen, setChosen] = useState<string | null>(current)
  const [term, setTerm] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const world = worlds.find((candidate) => candidate.id === chosen)

  /**
   * Filtered here rather than on the server.
   *
   * Forty worlds arrived with the page and a keystroke should not be a round
   * trip. When forty becomes four hundred this wants the search the discovery
   * page already has - and at that point the picker wants to *be* that page in
   * a dialog rather than growing a second copy of it.
   */
  const shown = term.trim()
    ? worlds.filter((candidate) =>
        candidate.name.toLowerCase().includes(term.trim().toLowerCase()),
      )
    : worlds

  return (
    <Section
      title="The set"
      summary={
        current
          ? (worlds.find((candidate) => candidate.id === current)?.name ?? 'a world')
          : `${worlds.length} to choose from`
      }
      icon={Globe}
    >
      {worlds.length > 6 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-line/50 px-2 py-1">
          <Search className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
          <input
            value={term}
            placeholder="Find a world"
            onChange={(event) => setTerm(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-ink focus:outline-none"
          />
        </div>
      )}

      <ul className="-mx-1 grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto px-1 py-0.5">
        {shown.map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              onClick={() => setChosen(candidate.id)}
              title={candidate.name}
              className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition ${
                chosen === candidate.id ? 'border-accent' : 'border-line/40 hover:border-accent/60'
              }`}
            >
              <span className="flex aspect-video w-full items-center justify-center bg-surface-raised/60">
                {candidate.poster ? (
                  /* A data URL already in this payload, so a plain <img>:
                     next/image would ask the optimiser to fetch a URL that
                     cannot be fetched. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={candidate.poster} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Globe className="size-5 text-ink-muted" aria-hidden />
                )}
              </span>
              <span className="block truncate px-1.5 pt-1 text-xs">{candidate.name}</span>
              <span className="flex items-baseline gap-1 px-1.5 pb-1 font-mono text-[10px] text-ink-muted">
                {candidate.blocks}
                <span className="truncate opacity-70">
                  {candidate.origin === 'platform' ? 'ours' : (candidate.spaceName ?? 'a space')}
                </span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="col-span-2 py-4 text-center text-xs text-ink-muted">
            Nothing by that name.
          </li>
        )}
      </ul>

      <Add
        label={pending ? 'Fetching…' : world ? `Use ${world.name}` : 'Pick one above'}
        icon={Download}
        disabled={pending || !world}
        onClick={() => {
          if (!world) return
          setNote(null)
          start(async () => {
            const result = await worldSet(world.id)
            if (!result.ok) {
              setNote(result.error)
              return
            }
            // Into the cache before the document changes, so the viewport draws
            // the world it was just handed rather than asking for it again.
            primeSet(world.id, {
              blocks: result.blocks,
              name: result.name,
              dropped: result.dropped,
              props: result.props,
            })
            setNote(
              onPick(world.id, result.blocks, { props: result.props, dropped: result.dropped }) ??
                `${result.blocks.length} blocks`,
            )
          })
        }}
      />

      {current && (
        <button
          type="button"
          onClick={() => {
            onClear()
            setNote('the set is gone — whatever you placed by hand is still there')
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line/50 px-2 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
          Empty the stage
        </button>
      )}

      {note && <p className="text-xs leading-relaxed text-ink-muted">{note}</p>}
    </Section>
  )
}

/** What to say about what did not survive the trip. Shared, so both panels say it the same way. */
export function importNote(kept: number, counts: { props: number; dropped: number }): string {
  if (counts.dropped > 0) {
    // Only reachable by a world above `SET_BLOCK_CAP`, which is thousands of
    // blocks - so this is now a remark about a very large world rather than the
    // apology it used to be for every world.
    return `${kept} blocks, nearest the middle — ${counts.dropped} left behind`
  }
  return `the whole world — ${kept} blocks${counts.props > 0 ? `, ${counts.props} props skipped` : ''}`
}
