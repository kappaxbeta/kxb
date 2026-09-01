'use client'

import { useEffect, useRef, useState } from 'react'
import {
  accept,
  completionsFor,
  type Completions,
  type Suggestion,
} from '@/app/xp/_editor/code/completions'
import { PAINT, tokenise } from '@/app/xp/_editor/code/highlight'
import { scriptsOf, usedBy } from '@kxb/xp/edit'
import {
  describeProblems,
  isScriptName,
  MAX_SCRIPT_LENGTH,
  type XpDocument,
  type XpProblem,
} from '@kxb/xp'
import { spawnEntities } from '@kxb/xp/engine'
import type { ScriptFailure } from '@kxb/xp/script'
import { scriptEngine } from '@/app/xp/_hosts/scripting'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * Writing the code a level runs.
 *
 * A list of the document's scripts, an editor for the one you picked, and the
 * blueprints it is attached to. The three are one panel because they are one
 * question - *what does this thing do* - and splitting them would mean a name in
 * one window, its source in another and the thing it runs on in a third.
 *
 * ---------------------------------------------------------------------------
 * A textarea, and not an editor component
 * ---------------------------------------------------------------------------
 * No bracket matching, no folding, no language server. That is a decision and
 * not a shortcut: a code editor worth having is CodeMirror or Monaco, which is
 * 300 KB to 5 MB of bundle for a panel in an operator tool where a script is
 * thirty lines and the author has a real editor open on the other monitor.
 *
 * What a script actually needs from a panel is the thing a highlighter does not
 * give: **to be told what is wrong with it, at the line it is wrong on.** That
 * is below, it runs the real interpreter, and it is worth more than colour.
 *
 * It has colour as well now, and the same argument is why: `highlight.ts` is a
 * scanner and a palette painted behind the textarea, and it exists for the two
 * mistakes a monochrome panel hides - a quote nobody closed, and a misspelling
 * of one of the four names a script is handed. The textarea is untouched
 * underneath it, which is what keeps this a panel rather than an editor.
 *
 * The gutter is here because of that - an error says `turret.js:12` and
 * counting to twelve by eye in a textarea is exactly the small misery this is
 * for.
 *
 * **The suggestions are the other half of the same argument**, and they arrived
 * later for a good reason: `xp-editor.md` §2c said this refusal has an expiry
 * date, and named the two asks that expire it. Autocomplete is one of them, and
 * it turns out not to need a code editor at all - what a script can reach is a
 * closed list (see `completions.ts`), so it is a menu over a textarea rather
 * than a language server. The other, running a script without a session, is
 * still open.
 */

export interface ScriptsPanelProps {
  document: XpDocument
  /** Which script is open, held above so it survives the panel being dragged. */
  open: string | null
  onOpen: (name: string | null) => void
  onAdd: (name: string) => void
  onWrite: (name: string, source: string) => void
  onRename: (from: string, to: string) => void
  onDelete: (name: string) => void
  onAttach: (blueprint: string, name: string | null) => void
}

export function ScriptsPanel({
  document,
  open,
  onOpen,
  onAdd,
  onWrite,
  onRename,
  onDelete,
  onAttach,
}: ScriptsPanelProps) {
  const t = xpEditorDict(useLocale()).scripts
  const scripts = scriptsOf(document)
  const names = Object.keys(scripts)
  const current = open !== null && open in scripts ? open : null
  const source = current ? scripts[current] : ''

  const problems = useCompileProblems(document)
  const mine = problems.filter((problem) => problem.at === `scripts.${current}`)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Names
        names={names}
        current={current}
        document={document}
        broken={new Set(problems.map((problem) => problem.at.replace(/^scripts\./, '')))}
        onOpen={onOpen}
        onAdd={onAdd}
      />

      {current === null ? (
        <Hint className="px-1">{t.blurb}</Hint>
      ) : (
        <>
          <Source
            key={current}
            name={current}
            source={source}
            document={document}
            onWrite={(next) => onWrite(current, next)}
          />
          <Problems problems={mine} />
          <DryRun document={document} name={current} />
          <Attached document={document} name={current} onAttach={onAttach} />
          <Actions
            name={current}
            taken={names}
            onRename={(to) => {
              onRename(current, to)
              onOpen(to)
            }}
            onDelete={() => {
              onDelete(current)
              onOpen(null)
            }}
          />
        </>
      )}
    </div>
  )
}

/**
 * Compile the document's scripts, a beat after typing stops.
 *
 * The real interpreter rather than a parser of our own: anything less agrees
 * with QuickJS until the day it does not, and the failure then is a level that
 * looked fine in the editor and refuses to load. It costs a runtime and a
 * context each time, which is why it waits for a pause rather than running on
 * every keystroke.
 */
function useCompileProblems(document: XpDocument): XpProblem[] {
  const [problems, setProblems] = useState<XpProblem[]>([])
  const scripts = document.scripts
  const any = scripts !== undefined && Object.keys(scripts).length > 0

  useEffect(() => {
    // Nothing to compile, and nothing to *say* either - the empty case is
    // handled by the return below rather than by clearing the state here,
    // because a `setState` in an effect is a second render for a value that was
    // always derivable from the props.
    if (!any) return

    let live = true
    const timer = setTimeout(() => {
      scriptEngine()
        .then((engine) => {
          if (!live) return
          const opened = engine.open(document)
          if (opened.ok) {
            opened.scripts.close()
            setProblems([])
            return
          }
          setProblems(opened.problems)
        })
        .catch((reason: unknown) => {
          if (live) setProblems([{ at: 'scripts', message: String(reason) }])
        })
    }, 400)

    return () => {
      live = false
      clearTimeout(timer)
    }
    // `document` changes identity on every edit, which is exactly the trigger
    // wanted here - the whole document is what `open` needs, because a script
    // is compiled in the company of the blueprints that name it.
  }, [document, any])

  return any ? problems : []
}

function Names({
  names,
  current,
  document,
  broken,
  onOpen,
  onAdd,
}: {
  names: string[]
  current: string | null
  document: XpDocument
  broken: Set<string>
  onOpen: (name: string | null) => void
  onAdd: (name: string) => void
}) {
  const t = xpEditorDict(useLocale()).scripts
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const ok = isScriptName(draft) && !names.includes(draft)

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <PanelLabel>{t.heading} {names.length}</PanelLabel>
        <button
          type="button"
          onClick={() => {
            setAdding((was) => !was)
            setDraft('')
          }}
          className="text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
        >
          {adding ? t.cancel : t.new}
        </button>
      </div>

      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!ok) return
            onAdd(draft)
            onOpen(draft)
            setAdding(false)
            setDraft('')
          }}
          className="mb-1.5 flex gap-1.5 px-1"
        >
          {/* Focused on purpose: the field only exists because somebody just
              pressed New, so putting the cursor in it is what they asked for -
              leaving it unfocused is a second click for nothing. */}
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.newName}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ok}
            className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300 disabled:text-neutral-700 enabled:hover:border-violet-500 enabled:hover:text-violet-200"
          >
            {t.add}
          </button>
        </form>
      ) : null}

      {/* Named before it is written: the name is what a blueprint points at, so
          "letters, digits, dash and underscore" is a rule worth saying at the
          moment it applies rather than on save. */}
      {adding && draft.length > 0 && !ok ? (
        <p className="mb-1.5 px-1 font-mono text-[10px] text-amber-400/80">
          {names.includes(draft) ? t.alreadyAScript : t.nameRules}
        </p>
      ) : null}

      {names.length === 0 ? (
        <p className="px-1 font-mono text-[10px] text-neutral-600">{t.noneYet}</p>
      ) : (
        <ul className="max-h-32 overflow-y-auto pr-1">
          {names.map((name) => {
            const users = usedBy(document, name)
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onOpen(current === name ? null : name)}
                  className={`flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                    current === name
                      ? 'bg-violet-500/15 text-violet-200'
                      : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  <span className="truncate font-mono">{name}</span>
                  {broken.has(name) ? (
                    <span className="shrink-0 font-mono text-[10px] text-rose-400">✕</span>
                  ) : null}
                  {/* Not "0 uses" but the word: a script attached to nothing is
                      a script that never runs, and that is the single most
                      likely reason a level does nothing. */}
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-600">
                    {users.length === 0 ? 'unused' : `${users.length}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * The source, with a gutter that counts the lines.
 *
 * The gutter is a second element scrolled in step with the textarea rather than
 * anything cleverer: a textarea cannot hold decorations, and the alternative -
 * a contenteditable with rendered lines behind it - is the beginning of writing
 * a code editor, which is the thing this panel deliberately does not do.
 */
function Source({
  name,
  source,
  document,
  onWrite,
}: {
  name: string
  source: string
  document: XpDocument
  onWrite: (source: string) => void
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  const lines = source.split('\n').length

  /**
   * The suggestion popup: what is in scope, and nothing else.
   *
   * The panel's own header argues against an editor component and that stands -
   * this is not one. There is no highlighter, no parser and no language server;
   * `completionsFor` looks at the characters before the caret and picks one of
   * four closed lists. What it buys is the error people actually hit in thirty
   * lines: a misspelled entity name, and a method that does not exist.
   *
   * Held as the completions object rather than as an index, because the
   * position it replaces from is part of the answer - recomputing it when the
   * suggestion is accepted would be reading a caret that has since moved.
   */
  const [menu, setMenu] = useState<Completions | null>(null)
  const [chosen, setChosen] = useState(0)

  const offer = (element: HTMLTextAreaElement) => {
    const next = completionsFor(element.value, element.selectionStart, document)
    setMenu(next.items.length > 0 ? next : null)
    setChosen(0)
  }

  const take = (suggestion: Suggestion) => {
    const element = box.current
    if (!element || !menu) return
    const next = accept(element.value, menu, suggestion, element.selectionStart)
    onWrite(next.source)
    setMenu(null)
    // After the write, not with it: the value the textarea holds is the one
    // React is about to give it, and setting a caret into the old string puts
    // it in the wrong place by however many characters were inserted.
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <PanelLabel>{name}.js</PanelLabel>
        <p className="font-mono text-[10px] text-neutral-600">
          {source.length.toLocaleString()} / {MAX_SCRIPT_LENGTH.toLocaleString()}
        </p>
      </div>

      {/*
        One scroller holding three layers that must agree to the pixel.

        The gutter used to be a sibling with its `scrollTop` copied by hand;
        now it is inside the box that scrolls, which is both less code and one
        fewer way for the numbers to sit a line off. The painted source and the
        textarea are stacked in the same column: the `pre` is in the flow and
        gives the column its height, and the textarea lies over it at `inset-0`
        with its own overflow hidden, so there is exactly one scrollbar and the
        two layers cannot drift.

        `h-max min-h-full` on that column, and on the gutter, is what makes the
        last sentence true - it was not. The column is a flex item, so the row
        stretched it to the *panel's* height while the `pre` inside it stood as
        tall as the script; the textarea, stretched to the column, was then
        hundreds of pixels shorter than its own text, and a textarea shorter
        than its text scrolls - silently, with `overflow-hidden`, the moment the
        caret leaves the visible part. The paint behind it stayed put, and from
        then on a click landed fifty lines from the line it pointed at. Sized to
        the script, the textarea's content always fits and neither layer ever
        scrolls; the box around all three does.

        Everything that decides where a glyph lands is repeated on both - the
        font, the size, the leading, the padding, and `break-words` to match how
        a textarea breaks a word too long for the line. A difference in any one
        of them is not a small visual bug: it is coloured text sliding out from
        under the characters it belongs to.
      */}
      {/* `code-stack`: on a touch screen the 16px input floor in `globals.css`
          would otherwise raise the caret's text and leave the paint at 11px.
          The class hands the floor to both layers at once - see the rule. */}
      <div className="code-stack flex min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-neutral-950/60 focus-within:border-neutral-600">
        <pre
          aria-hidden
          className="h-max min-h-full shrink-0 border-r border-neutral-900 bg-neutral-950 px-1.5 py-1 text-right font-mono text-[11px] leading-[1.45] text-neutral-700"
        >
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </pre>
        <div className="relative h-max min-h-full min-w-0 flex-1">
          <pre
            aria-hidden
            className="whitespace-pre-wrap break-words px-2 py-1 font-mono text-[11px] leading-[1.45] text-neutral-200"
          >
            {tokenise(source).map((token, index) => (
              <span key={index} className={PAINT[token.kind]}>
                {token.text}
              </span>
            ))}
            {/* A source ending in a newline has a last line that is empty, and
                an empty last line in a `pre` has no height - so without this the
                painted column is a row shorter than the textarea and the caret
                on that line has nothing under it. */}
            {'\n'}
          </pre>
          <textarea
            ref={box}
            value={source}
            spellCheck={false}
            onChange={(event) => {
              onWrite(event.target.value)
              offer(event.currentTarget)
            }}
          onKeyDown={(event) => {
            if (!menu) return
            /**
             * Tab and Enter accept, arrows move, Escape closes.
             *
             * Tab first because it is what an editor binds and nothing in a
             * textarea wants it. Enter accepts *only while the menu is open* -
             * which is the rule that keeps a newline a newline the other 99%
             * of the time, and the reason Escape has to work: dismissing the
             * menu has to be one key, not a click somewhere else.
             */
            if (event.key === 'Escape') {
              event.preventDefault()
              setMenu(null)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : menu.items.length - 1
              setChosen((at) => (at + step) % menu.items.length)
            } else if (event.key === 'Tab' || event.key === 'Enter') {
              event.preventDefault()
              take(menu.items[chosen])
            }
          }}
            onBlur={() => setMenu(null)}
            /**
             * Transparent text over the painted layer, and a caret that is not.
             *
             * The textarea keeps every key it ever had - selection, undo,
             * spellcheck off, the completion menu's Tab and Escape - because it
             * is still a textarea. All that changed is that its own glyphs are
             * invisible and the ones you read are behind it. The selection tint
             * has to be stated: over transparent text the browser's default is
             * a block of colour with nothing legible in it.
             */
            className="absolute inset-0 h-full w-full resize-none overflow-hidden break-words bg-transparent px-2 py-1 font-mono text-[11px] leading-[1.45] text-transparent caret-neutral-100 selection:bg-violet-500/30 focus:outline-none"
          />
        </div>
      </div>

      {/*
        Under the box rather than floating at the caret.

        A popup positioned on the caret means measuring text in a textarea,
        which cannot be done without a mirror element that duplicates every font
        rule - and that mirror is the first three hundred lines of a code
        editor, which is the thing this panel does not build. Under the box it
        is always readable, never covers the line being typed, and costs one
        row of height that is empty the rest of the time.

        `onMouseDown` rather than `onClick`: the textarea's blur closes the menu,
        and blur lands first.
      */}
      {menu ? (
        <ul className="mt-1 flex flex-col rounded border border-neutral-800 bg-neutral-900/90">
          {menu.items.map((item, index) => (
            <li key={item.text}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  take(item)
                }}
                onMouseEnter={() => setChosen(index)}
                className={`flex w-full items-baseline gap-2 px-1.5 py-0.5 text-left font-mono text-[10px] ${
                  index === chosen ? 'bg-violet-500/15 text-violet-200' : 'text-neutral-400'
                }`}
              >
                <span className="shrink-0">{item.text}</span>
                {/* Lifted on the highlighted row: neutral-600 over the violet
                    tint is the one place in this panel where the hint stops
                    being readable. */}
                <span
                  className={`truncate ${index === chosen ? 'text-violet-300/70' : 'text-neutral-600'}`}
                >
                  {item.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * Run it, without starting a session.
 *
 * The second of `xp-editor.md` §2c's two asks, and the one that decides whether
 * a script does what its author thinks. Compiling already happens on every
 * pause — that catches a syntax error and nothing else, and *almost every real
 * mistake in a script compiles perfectly*: a name that resolves to null, an
 * `onTick` that never fires because the blueprint has no instances in the
 * level, a condition that is never true.
 *
 * So this presses play on the document's entities alone: spawn them, step the
 * scripts a second of simulated time, and show what they said and what threw.
 * There is no renderer, no player and no room — which is exactly the point, and
 * why it is a button rather than the `Try` overlay. Trying the level answers
 * *does this feel right*; this answers *did my script run at all*.
 *
 * ---------------------------------------------------------------------------
 * A second, and a fixed step
 * ---------------------------------------------------------------------------
 * Sixty steps of a sixtieth, so `world.time` reads one second and a cooldown
 * written as `if (world.time - last > 2)` is visibly *not* reached rather than
 * accidentally reached — a run long enough to trip every timer would make a
 * script that only works at second three look fine. The step is fixed rather
 * than measured because a dry run has no frames to measure.
 *
 * The context is opened and closed around the run. It costs a QuickJS runtime
 * per press, which is the same cost the compile check pays on every pause, and
 * leaving one open would mean a panel holding wasm state across an edit that
 * invalidated it.
 */
function DryRun({ document, name }: { document: XpDocument; name: string }) {
  const t = xpEditorDict(useLocale()).scripts
  const [result, setResult] = useState<
    | { at: 'never' }
    | { at: 'running' }
    | { at: 'done'; logs: readonly string[]; failures: readonly ScriptFailure[]; ticks: number }
    | { at: 'refused'; why: string }
  >({ at: 'never' })

  // A new script, a new question. Without this the panel keeps last script's
  // output under this one's name, which reads as this one having said it.
  const [seen, setSeen] = useState(name)
  if (seen !== name) {
    setSeen(name)
    setResult({ at: 'never' })
  }

  const run = () => {
    setResult({ at: 'running' })
    void scriptEngine()
      .then((engine) => {
        const opened = engine.open(document)
        if (!opened.ok) {
          setResult({ at: 'refused', why: describeProblems(opened.problems) })
          return
        }
        const scripts = opened.scripts
        try {
          const world = spawnEntities(document)
          for (let i = 0; i < TICKS; i++) scripts.step(world, document.blueprints, 1 / 60)
          setResult({
            at: 'done',
            logs: [...scripts.logs],
            failures: [...scripts.failures],
            ticks: TICKS,
          })
        } finally {
          scripts.close()
        }
      })
      .catch((reason: unknown) => setResult({ at: 'refused', why: String(reason) }))
  }

  /**
   * Whether this script is on anything at all.
   *
   * The most likely reason a run says nothing, and worth saying *before* the
   * run rather than leaving somebody to read an empty result: a script attached
   * to no blueprint has no instances, so no hook of it is ever called.
   */
  const attached = usedBy(document, name).length > 0

  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <PanelLabel>{t.run}</PanelLabel>
        <button
          type="button"
          onClick={run}
          disabled={result.at === 'running'}
          className="text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline disabled:text-neutral-700 disabled:no-underline"
        >
          {result.at === 'running' ? 'running…' : 'one second'}
        </button>
      </div>

      {!attached ? (
        <Hint className="px-1">{t.notAttached}</Hint>
      ) : null}

      {result.at === 'refused' ? (
        <pre className="whitespace-pre-wrap rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-rose-300">
          {result.why}
        </pre>
      ) : null}

      {result.at === 'done' ? (
        <div className="rounded border border-neutral-800 bg-neutral-950/60 px-2 py-1.5">
          <p className="font-mono text-[10px] text-neutral-600">
            {fill(t.frames, { n: result.ticks })}
          </p>
          {result.failures.map((failure, index) => (
            <p
              key={index}
              className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-rose-300"
            >
              {failure.hook}: {failure.message}
            </p>
          ))}
          {result.logs.map((line, index) => (
            <p
              key={index}
              className="mt-0.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-neutral-300"
            >
              {line}
            </p>
          ))}
          {result.logs.length === 0 && result.failures.length === 0 ? (
            <Hint className="mt-1">{t.ranAndSaidNothing}</Hint>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** A second at sixty a second. See the note above for why exactly one. */
const TICKS = 60

/**
 * What the interpreter said, if anything.
 *
 * Nothing at all when it compiles - a green tick for code that merely parses is
 * a reassurance about the wrong thing, since almost every real mistake in a
 * script is one that compiles perfectly.
 */
function Problems({ problems }: { problems: XpProblem[] }) {
  if (problems.length === 0) return null
  return (
    <section className="rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5">
      {problems.map((problem) => (
        <p
          key={problem.message}
          className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-rose-300"
        >
          {problem.message}
        </p>
      ))}
    </section>
  )
}

/** Which blueprints run this. */
function Attached({
  document,
  name,
  onAttach,
}: {
  document: XpDocument
  name: string
  onAttach: (blueprint: string, name: string | null) => void
}) {
  const t = xpEditorDict(useLocale()).scripts
  const blueprints = Object.keys(document.blueprints)

  return (
    <section>
      <PanelLabel className="mb-1 px-1">{t.runsOn}</PanelLabel>
      {blueprints.length === 0 ? (
        <p className="px-1 font-mono text-[10px] text-neutral-600">
          {t.noBlueprints}
        </p>
      ) : (
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto px-1">
          {blueprints.map((blueprint) => {
            const on = document.blueprints[blueprint].script === name
            /**
             * A blueprint already running a *different* script.
             *
             * One script per blueprint, so attaching here would silently
             * replace the other one. Said out loud instead - a chip that
             * quietly detaches something else is how a level loses a rule
             * nobody notices is gone.
             */
            const busy = !on && document.blueprints[blueprint].script !== undefined
            return (
              <button
                key={blueprint}
                type="button"
                title={busy ? `Replaces ${document.blueprints[blueprint].script}` : undefined}
                onClick={() => onAttach(blueprint, on ? null : name)}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  on
                    ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                    : busy
                      ? 'border-amber-500/40 text-amber-400/70 hover:border-amber-400'
                      : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
                }`}
              >
                {blueprint}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Actions({
  name,
  taken,
  onRename,
  onDelete,
}: {
  name: string
  taken: string[]
  onRename: (to: string) => void
  onDelete: () => void
}) {
  const t = xpEditorDict(useLocale()).scripts
  const [draft, setDraft] = useState<string | null>(null)
  const ok = draft !== null && isScriptName(draft) && !taken.includes(draft)

  return (
    <section className="flex items-center gap-1.5 px-1">
      {draft === null ? (
        <>
          <button
            type="button"
            onClick={() => setDraft(name)}
            className="text-[10px] text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
          >
            {t.rename}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-[10px] text-neutral-500 underline-offset-4 hover:text-red-400 hover:underline"
          >
            {t.delete}
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!ok) return
            onRename(draft)
            setDraft(null)
          }}
          className="flex flex-1 gap-1.5"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ok}
            className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300 disabled:text-neutral-700 enabled:hover:border-violet-500"
          >
            {t.rename}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="text-[10px] text-neutral-500 hover:text-neutral-300"
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}
