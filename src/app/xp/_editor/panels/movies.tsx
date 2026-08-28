'use client'

import { useState } from 'react'
import { MAIN_SCENE, type XpDocument } from '@kxb/xp'
import { sequenceLength, type XpSequence } from '@kxb/xp/movie'
import type { PlaceTarget } from '@kxb/xp/edit'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { FIELD, Hint, PanelLabel } from '@/app/xp/_editor/chrome'

/**
 * The shots this document holds, and the cuts made out of them.
 *
 * ---------------------------------------------------------------------------
 * Why this is a section of the Document window and not a window of its own
 * ---------------------------------------------------------------------------
 * The same argument the Places list is here on: which places are shots and
 * which cuts exist are facts about the *file*, not about whatever is selected.
 * It sits directly under Places because the two are one thought - a shot **is**
 * a place - and a reader who has just seen the list of rooms is exactly the
 * reader who needs to be told that one of them can play itself.
 *
 * ---------------------------------------------------------------------------
 * The entry point, and why it is two buttons rather than a mode switch
 * ---------------------------------------------------------------------------
 * There are two things to open and they are different documents: a **shot**,
 * which is one place over time, and a **cut**, which is shots in order. A
 * single "movie mode" button would have to guess which, and the guess would be
 * wrong for whoever came looking for the other one.
 *
 * So every place gets `open`, every cut gets `compose`, and both take over the
 * screen. Neither is on the icon rail: the rail's stated rule is that closing
 * something is undoable by clicking the same icon, and neither of these is a
 * toggle - Escape is what ends them, the way it ends Try.
 *
 * ---------------------------------------------------------------------------
 * A movie starts empty, and imports what it needs
 * ---------------------------------------------------------------------------
 * The first version of this panel listed every place with a "make a movie"
 * button on it, on the grounds that the format's whole design is that a shot
 * *is* a scene - which is true, and made the panel invite the wrong thing. The
 * first act of making a movie was committing your level to being one, and every
 * body added for the camera was a body standing in the game.
 *
 * So the list is **movies**, `+ new movie` makes an empty stage, and a set that
 * already exists is *imported* into it. A film is a thing you build, not a hat
 * you put on your level.
 *
 * The rooms are still reachable through Import, which is the honest place for
 * them: "film what I built" is a thing somebody asks for once they have a movie
 * to film it into.
 */

export interface MoviesProps {
  document: XpDocument
  /** Which place the editor is working in, so its row can say so. */
  standing: PlaceTarget
  /** A new, empty stage with a timeline on it. */
  onNew: () => void
  /** And take one away, with everything keyed on it. */
  onStop: (where: PlaceTarget) => void
  /** Open a shot full-screen. */
  onOpen: (where: PlaceTarget) => void
  /** Copy another place's set and cast into this movie. */
  onImport: (into: PlaceTarget, from: string) => void
  onAddCut: () => void
  onRenameCut: (id: string, name: string) => void
  onRemoveCut: (id: string) => void
  /** Open a cut in the composer, full-screen. */
  onCompose: (id: string) => void
}

/** Every place in the document, the root first, whether or not it is a shot. */
function placesOf(document: XpDocument): { key: string; where: PlaceTarget }[] {
  const places: { key: string; where: PlaceTarget }[] = [
    { key: MAIN_SCENE, where: undefined },
  ]
  for (const [name, scene] of Object.entries(document.scenes ?? {})) {
    // A door is somewhere else entirely - no world to shoot and no timeline to
    // give it. `placeIn` refuses one too; this is the half that keeps it off
    // the screen rather than the half that keeps it out of the file.
    if (typeof scene !== 'string') places.push({ key: name, where: name })
  }
  return places
}

export function Movies({
  document,
  standing,
  onNew,
  onStop,
  onOpen,
  onImport,
  onAddCut,
  onRenameCut,
  onRemoveCut,
  onCompose,
}: MoviesProps) {
  const t = xpEditorDict(useLocale()).movies
  const places = placesOf(document)
  const sequences = Object.entries(document.sequences ?? {})

  const timelineOf = (where: PlaceTarget) =>
    where === undefined ? document.timeline : (() => {
      const scene = document.scenes?.[where]
      return typeof scene === 'string' ? undefined : scene?.timeline
    })()

  /** The places that are shots. Everything else is a room, and Import's business. */
  const movies = places.filter(({ where }) => timelineOf(where) !== undefined)
  const anyShot = movies.length > 0

  return (
    <section className="mt-4 border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>
      <Hint className="mb-2">{t.lead}</Hint>

      <ul className="space-y-1">
        {movies.map(({ key, where }) => (
          <PlaceRow
            key={key}
            name={key}
            timeline={timelineOf(where)}
            standing={standing === where}
            /* Everywhere that is not this movie, which is what it can film. */
            sources={places.filter((one) => one.key !== key).map((one) => one.key)}
            onStop={() => onStop(where)}
            onOpen={() => onOpen(where)}
            onImport={(from) => onImport(where, from)}
          />
        ))}
      </ul>

      {movies.length === 0 ? <Hint className="mt-1">{t.noMoviesYet}</Hint> : null}

      <button
        type="button"
        onClick={onNew}
        title={t.newMovieTitle}
        className="mt-1.5 rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-violet-600 hover:text-violet-300"
      >
        {t.newMovie}
      </button>

      {/*
        The cuts, under the shots and not beside them.

        Order is the argument: a cut is *made out of* shots, so a reader who has
        not yet grasped that a place can be a shot has nothing to compose. The
        button says so rather than being merely disabled, because a greyed
        button with no reason next to it is a question every author asks once.
      */}
      <PanelLabel className="mb-1 mt-4 text-neutral-500">{t.cuts}</PanelLabel>
      <Hint className="mb-2">{t.cutsLead}</Hint>

      {sequences.length === 0 && !anyShot ? (
        <p className="mb-2 font-mono text-[10px] leading-relaxed text-neutral-600">
          {t.needAShotFirst}
        </p>
      ) : null}

      <ul className="space-y-1">
        {sequences.map(([id, sequence]) => (
          <CutRow
            key={id}
            id={id}
            sequence={sequence}
            onRename={(name) => onRenameCut(id, name)}
            onRemove={() => onRemoveCut(id)}
            onCompose={() => onCompose(id)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onAddCut}
        disabled={!anyShot}
        className="mt-1.5 rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t.addACut}
      </button>
    </section>
  )
}

function PlaceRow({
  name,
  timeline,
  standing,
  sources,
  onStop,
  onOpen,
  onImport,
}: {
  name: string
  timeline: XpDocument['timeline']
  standing: boolean
  /** Places this one can import from. */
  sources: string[]
  onStop: () => void
  onOpen: () => void
  onImport: (from: string) => void
}) {
  const t = xpEditorDict(useLocale()).movies
  /**
   * Taking a movie away is armed, because it cannot be clicked back.
   *
   * Undo reaches it, and undo is not where somebody looks in the second after
   * a row of keys they spent an afternoon on disappeared. The same second-press
   * pattern the rail uses for anything irreversible.
   */
  const [sure, setSure] = useState(false)

  return (
    <li
      className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
        standing ? 'border-neutral-700 bg-neutral-900/60' : 'border-neutral-900'
      }`}
    >
      {/* `basis-0` with the flex, or a long name refuses to shrink and takes
          the row apart from the left instead of the right. */}
      <span className="min-w-0 flex-1 basis-0 truncate font-mono text-[11px] text-neutral-300">
        {name}
      </span>

      {timeline ? (
        <>
          <span className="shrink-0 font-mono text-[10px] text-neutral-600">
            {fill(t.runsFor, { seconds: String(timeline.duration), fps: String(timeline.fps) })}
          </span>
          {/*
            Import, as a select that fires on choosing rather than a picker and
            a confirm. It is additive and undoable, which is what makes one
            click safe - and a two-step for something you may do three times
            while dressing a set is two steps too many.
          */}
          {sources.length > 0 ? (
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) onImport(event.target.value)
                // Back to the placeholder, so importing the same room twice is
                // two choices rather than one choice and a stuck select.
                event.currentTarget.value = ''
              }}
              title={t.importTitle}
              /*
                Capped, because this is the widest thing in the row and the row
                has four other controls in it. Left to itself the select takes
                its longest option - a room called something descriptive - and
                pushes the buttons off the panel's edge.
              */
              className="w-20 shrink-0 truncate rounded border border-neutral-800 bg-neutral-900/60 px-1 py-0.5 font-mono text-[10px] text-neutral-400 focus:border-neutral-600 focus:outline-none"
            >
              <option value="">{t.importFrom}</option>
              {sources.map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            title={t.openItTitle}
            className="shrink-0 rounded bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] text-violet-300 transition-colors hover:bg-violet-500/25"
          >
            {t.openIt}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!sure) {
                setSure(true)
                return
              }
              setSure(false)
              onStop()
            }}
            onBlur={() => setSure(false)}
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
              sure ? 'bg-red-500/20 text-red-300' : 'text-neutral-600 hover:text-neutral-300'
            }`}
          >
            {sure ? t.stopSure : t.stopBeingAMovie}
          </button>
        </>
      ) : null}
    </li>
  )
}

function CutRow({
  id,
  sequence,
  onRename,
  onRemove,
  onCompose,
}: {
  id: string
  sequence: XpSequence
  onRename: (name: string) => void
  onRemove: () => void
  onCompose: () => void
}) {
  const t = xpEditorDict(useLocale()).movies
  const [sure, setSure] = useState(false)
  const takes = sequence.takes.length
  // Rounded here rather than in the writer: the number is a label, and a cut
  // whose length is 4.833333 is one nobody can read at ten pixels.
  const seconds = Math.round(sequenceLength(sequence) * 10) / 10

  return (
    <li className="rounded border border-neutral-900 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          value={sequence.name ?? ''}
          onChange={(event) => onRename(event.target.value)}
          placeholder={t.cutNamePlaceholder}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={onCompose}
          title={t.openComposerTitle}
          className="shrink-0 rounded bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] text-violet-300 transition-colors hover:bg-violet-500/25"
        >
          {t.openComposer}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!sure) {
              setSure(true)
              return
            }
            setSure(false)
            onRemove()
          }}
          onBlur={() => setSure(false)}
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
            sure ? 'bg-red-500/20 text-red-300' : 'text-neutral-600 hover:text-neutral-300'
          }`}
        >
          {sure ? t.removeCutSure : t.removeCut}
        </button>
      </div>
      <p className="mt-1 font-mono text-[10px] text-neutral-600">
        {takes === 0
          ? t.emptyCut
          : fill(takes === 1 ? t.takeCountOne : t.takeCount, {
              n: String(takes),
              seconds: String(seconds),
            })}
        <span className="ml-2 text-neutral-700">{id}</span>
      </p>
    </li>
  )
}
