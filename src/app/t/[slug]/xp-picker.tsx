'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { CartridgeSheet } from '@/app/components/cartridge/sheet'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'
import { putBackXp, restockXp, takeInXp } from '@/domain/magazine/actions'
import type { ShelfRow } from '@/domain/magazine/shelf'
import type { PlayableXp } from '@/domain/xps/playable'
import { MAX_DECLARED_PLAYERS } from '@kxb/xp'
import { describeNeed } from '@kxb/xp/host'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict, type RailDict } from '@/app/i18n/rail'
import { xpDict } from '@/app/i18n/xp'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * One list of levels, with a line through it where this space's own shelf ends.
 *
 * ---------------------------------------------------------------------------
 * Shelf first, catalogue after
 * ---------------------------------------------------------------------------
 * `docs/product/pricing.md` §3 puts the magazine between the public list and a
 * place: `/browse ──take in──▶ magazine ──load──▶ place`. This is that middle
 * box drawn, and the ordering is the argument: what a space collected is what
 * it is most likely to want, and everything else is the drawer under it. Two
 * separate lists would ask somebody to know which one a level was in before
 * they could look for it - which is the question they opened the picker to have
 * answered.
 *
 * ---------------------------------------------------------------------------
 * It owns the magazine's verbs and nothing else
 * ---------------------------------------------------------------------------
 * Taking in and putting back are the same gesture wherever this is mounted, so
 * they live here, once. What to *do* with a level - open a room, run a match,
 * take a copy - is different on every surface, so it arrives as `controls` and
 * is drawn under the row. That split is what lets the Play rail keep its own
 * careful two-button explanation of match versus room while the shelf half of
 * it stops being a copy of this file.
 *
 * ---------------------------------------------------------------------------
 * The words are the log's, on purpose
 * ---------------------------------------------------------------------------
 * "Took in" and "put back", which is what `MAGAZINE_EVENT_LABELS` says, rather
 * than either metaphor in §3's "Which magazine this is". That test cannot run
 * until `look` is finished (see `analytics/experiment.ts`), and half a metaphor
 * is worse than none - so this surface stays in words that are true under both
 * readings, and the arm that wins replaces them.
 *
 * ---------------------------------------------------------------------------
 * `useState` and a rollback, not `useOptimistic`
 * ---------------------------------------------------------------------------
 * The house rule for anything that can be drawn over a scene, and load-bearing
 * for one of the two mounts: the Play rail's list came from an action rather
 * than a render, so nothing revalidates it and an optimistic value would have
 * nothing to be confirmed against. It would snap back, silently.
 */

/**
 * What the document itself knows, in one line.
 *
 * Exported because the Play rail drew this before the picker existed and its
 * own copy would drift. Every clause is conditional for the same reason: a
 * summary that guessed would be describing a level rather than reading one.
 */
export function describeRules(xp: PlayableXp, words: RailDict['shelf']['rules']): string {
  // The preset is a word out of `@kxb/xp` and stays as it is, exactly as the
  // wizard's own summary leaves it.
  const parts: string[] = [xp.preset]
  if (xp.sides !== null) parts.push(words.sides[xp.sides])
  if (xp.scoreLimit !== null) parts.push(fill(words.firstTo, { n: xp.scoreLimit }))
  if (xp.timeLimit !== null) {
    parts.push(fill(words.minutes, { n: Math.round(xp.timeLimit / 60) }))
  }

  const { min, max } = xp.players
  if (max < MAX_DECLARED_PLAYERS || min > 1) {
    parts.push(
      min === max
        ? fill(words.players, { n: max })
        : fill(words.playersRange, { min, max }),
    )
  }

  return parts.join(' · ')
}

export function XpPicker({
  slug,
  inMagazine,
  catalogue,
  hidden,
  blocked,
  dense = false,
  show = 'both',
  view = 'list',
  controls,
  footer,
}: {
  slug: string
  inMagazine: ShelfRow[]
  catalogue: ShelfRow[]
  /** Projects the picker's cap left out, said out loud rather than dropped. */
  hidden: number
  /**
   * Why the magazine's own buttons are dead, or null when they are live.
   *
   * A sentence rather than a disabled button, which is the rule the Play rail
   * already argues for: a guest on a link may look at what a space collected
   * and may not change it, and being told so is recoverable in a way that a
   * button failing on click is not.
   */
  blocked: string | null
  /** The rail draws smaller than the page does. */
  dense?: boolean
  /**
   * A shelf of cartridges, or the rows.
   *
   * Same state, same verbs, same `controls` - the difference is entirely what a
   * level *looks* like while you are deciding about it. The page has room for
   * the object and gets the shelf; the Play rail is a 20rem column beside a
   * scene and gets the rows, because a cartridge shrunk to fit that is a
   * thumbnail with a name under it, which is a row that costs a WebGL context.
   */
  view?: 'list' | 'shelf'
  /**
   * Which half to draw. Both, unless something outside already says which.
   *
   * Both lists are still *passed* either way, and that is the point rather than
   * laziness: `moved` and `justIn` track a row across the line during a visit,
   * so a picker handed only one half would forget where a row came from the
   * moment somebody took it in. The prop hides a section; it does not narrow
   * what this component knows.
   */
  show?: 'both' | 'shelf' | 'catalogue'
  /**
   * What this mount does with a row, drawn inside the opened row.
   *
   * Given the row rather than the reference, so a mount can refuse a level it
   * cannot host - see the browse mount, which reads `needs`.
   */
  controls?: (row: ShelfRow, shelved: boolean) => React.ReactNode
  /** Anything the mount wants under the whole list. */
  footer?: React.ReactNode
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = railDict(locale).shelf
  const needWords = xpDict(locale).needs
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  /** The row that has been opened up, if any. One at a time. */
  const [reading, setReading] = useState<string | null>(null)
  /** The one being taken in or put back, so only its own button says so. */
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Which side of the line a row is on, where this visit has moved it.
   *
   * An override on top of the server's answer rather than a copy of the two
   * lists: a copy would have to be reset whenever the props changed, and the
   * browse mount *does* revalidate - so the override quietly becomes redundant
   * there and stays load-bearing in the rail.
   */
  const [moved, setMoved] = useState<Record<string, boolean>>({})
  /** Taken in during this visit, so a new row lands where the shelf is sorted. */
  const [justIn, setJustIn] = useState<string[]>([])

  const { shelved, rest } = useMemo(() => {
    const all = [...inMagazine, ...catalogue]
    const onShelf = (row: ShelfRow) => moved[row.ref] ?? row.shelvedAs !== null

    const on = all.filter(onShelf)
    // Newest first is what the shelf is sorted by, so something taken in a
    // second ago belongs at the top rather than wherever it sat in the drawer.
    const fresh = [...justIn]
      .reverse()
      .map((ref) => on.find((row) => row.ref === ref))
      .filter((row): row is ShelfRow => row !== undefined)

    return {
      shelved: [...fresh, ...on.filter((row) => !justIn.includes(row.ref))],
      rest: all.filter((row) => !onShelf(row)),
    }
  }, [inMagazine, catalogue, moved, justIn])

  function takeIn(row: ShelfRow) {
    setError(null)
    setBusy(row.ref)
    setMoved((all) => ({ ...all, [row.ref]: true }))
    setJustIn((all) => [...all, row.ref])

    startTransition(async () => {
      const result = await attempt(() => takeInXp(slug, row.ref))
      setBusy(null)
      if (!result.ok) {
        // Put it back where it was. The row is the only thing that moved.
        setMoved((all) => ({ ...all, [row.ref]: false }))
        setJustIn((all) => all.filter((ref) => ref !== row.ref))
        setError(refusal(result.error))
      }
    })
  }

  function putBack(row: ShelfRow) {
    setError(null)
    setBusy(row.ref)
    setMoved((all) => ({ ...all, [row.ref]: false }))
    setJustIn((all) => all.filter((ref) => ref !== row.ref))

    startTransition(async () => {
      /*
       * The reference the shelf holds, not the one a place would play.
       *
       * They differ as soon as somebody saves the project - see `splitShelf`.
       * Putting back the resolved reference would name a row that is not there,
       * and the decider is deliberately strict about exactly that: it throws
       * rather than quietly succeeding, so this would surface as an error on a
       * shelf that had not changed.
       */
      const result = await attempt(() => putBackXp(slug, row.shelvedAs ?? row.ref))
      setBusy(null)
      if (!result.ok) {
        setMoved((all) => ({ ...all, [row.ref]: true }))
        setError(refusal(result.error))
      }
    })
  }

  /**
   * Take the newer version this space may now play.
   *
   * No optimistic move, unlike the two above. Those flip a row from one side of
   * the line to the other and the whole answer is which side it is on; this
   * changes the *reference* a row carries, and guessing the new one on the
   * client would mean rendering a version this space might not have. The row
   * says "Updating…" and waits for the server's list.
   */
  function restock(row: ShelfRow) {
    if (!row.shelvedAs) return

    setError(null)
    setBusy(row.ref)

    startTransition(async () => {
      const result = await attempt(() => restockXp(slug, row.shelvedAs!))
      setBusy(null)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      // The shelf row now names a different version, and this list is drawn
      // from the server's. The rail does not revalidate on its own - see the
      // note on `moved` - so ask for the new one.
      router.refresh()
    })
  }

  const text = dense ? 'text-xs' : 'text-sm'
  const small = dense ? 'text-[10px]' : 'text-[11px]'

  /**
   * What a level is asking for, and what is standing in the way.
   *
   * Pulled out of the opened row when the same picker grew a second face: the
   * shelf shows this inside the panel a cartridge opens, and the list shows it
   * inside the row that unfolds. One copy, because the interesting line here is
   * `needs` - a level that will not open in a room has to say so *before*
   * somebody presses, and two copies of that rule is one copy that goes stale.
   */
  function notes(row: ShelfRow) {
    const gone = row.xp === null

    return (
      <div className="space-y-1.5">
        {gone ? (
          /*
            The shelf entry outlived the thing it names.

            It says so and offers the one control that still means anything.
            The name is the one the magazine kept - see `splitShelf` - which
            is the only word anybody has left for it.
          */
          <p className={`${small} leading-snug text-ink-muted`}>{t.gone}</p>
        ) : (
          <>
            <p className={`font-mono ${small} text-ink-muted/70`}>
              {row.xp!.capabilities.length > 0
                ? row.xp!.capabilities.join(', ')
                : t.freeplay}
            </p>
            {row.needs.length > 0 && (
              <p className={`${small} text-ink-muted`}>
                {row.needs.map((need) => describeNeed(need, needWords)).join(' · ')}
              </p>
            )}
          </>
        )}

        {blocked !== null && <p className={`${small} text-ink-muted`}>{blocked}</p>}
      </div>
    )
  }

  /**
   * The magazine's verbs, and whatever the mount added under them.
   *
   * `takeIn` is a parameter rather than a fact about the row because the two
   * views put it in different places for the same reason: it is one press from
   * the *list*, in the row's own header, because taking one in is free and
   * unlimited (§3) - and there is no header on a cartridge, so on the shelf it
   * joins the other buttons in the panel.
   */
  function verbs(row: ShelfRow, onShelf: boolean, withTakeIn: boolean) {
    if (blocked !== null) return null

    const working = busy === row.ref
    const gone = row.xp === null

    return (
      <>
        {withTakeIn && !onShelf && !gone && (
          <button
            type="button"
            onClick={() => takeIn(row)}
            disabled={pending}
            className={`rounded-full border border-accent/60 px-3 py-1 ${small} text-accent transition hover:bg-accent/10 disabled:opacity-40`}
          >
            {working ? t.taking : t.takeIn}
          </button>
        )}

        {/*
          Above the mount's own controls, because it changes what those
          controls would do. "Put it in our place" already sends the newest
          version; this is what makes the *shelf* say so, and reading it after
          pressing place would be reading it too late.
        */}
        {onShelf && row.update && (
          <div className="flex flex-wrap items-center gap-2">
            <p className={`${small} leading-snug text-ink-muted`}>
              {fill(t.updateOut, { from: row.update.from, to: row.update.to })}
            </p>
            <button
              type="button"
              onClick={() => restock(row)}
              disabled={pending}
              className={`rounded-full border border-accent-2/60 px-2.5 py-0.5 ${small} text-accent-2 transition hover:bg-accent-2/10 disabled:opacity-40`}
            >
              {working ? t.updating : fill(t.takeVersion, { v: row.update.to })}
            </button>
          </div>
        )}

        {!gone && controls?.(row, onShelf)}

        {onShelf && (
          <button
            type="button"
            onClick={() => putBack(row)}
            disabled={pending}
            className={`px-0.5 py-0.5 text-left ${small} text-ink-muted transition hover:text-ink disabled:opacity-40`}
          >
            {working ? t.puttingBack : t.putBack}
          </button>
        )}
      </>
    )
  }

  /**
   * A shelf of cartridges, and the one that has been picked up.
   *
   * The panel is drawn under the section that owns the open row rather than
   * once at the bottom of the page: a cartridge in the magazine and a cartridge
   * in the drawer are two shelves apart, and reading about one of them six rows
   * below the other is how somebody loses track of which they clicked.
   */
  function drawShelf(rows: ShelfRow[], onShelf: boolean) {
    const items: ShelfItem[] = rows.map((row) => ({
      ref: row.ref,
      name: row.name,
      cover: row.xp?.cover ?? null,
      finish: row.xp?.finish ?? undefined,
      // A presence check, not a truthiness one: zero is red.
      ...(row.xp?.hue === undefined || row.xp.hue === null ? {} : { hue: row.xp.hue }),
      // A shelf entry whose level is gone. Held back, still openable - the
      // panel is where "not here any more" is said and where putting the entry
      // back is offered, which is the only thing left to do with it.
      dimmed: row.xp === null,
    }))

    const open = rows.find((row) => row.ref === reading) ?? null

    return (
      <>
        <CartridgeShelf
          items={items}
          selected={reading}
          onOpen={(ref) => setReading(reading === ref ? null : ref)}
          label={t.shelfLabel}
        />

        {open && (
          <CartridgeSheet
            reference={open.ref}
            {...(open.xp?.hue === undefined || open.xp.hue === null
              ? {}
              : { hue: open.xp.hue })}
            name={open.name}
            blurb={open.blurb}
            cover={open.xp?.cover ?? null}
            facts={open.xp === null ? t.notHereAnyMore : describeRules(open.xp, t.rules)}
            badge={
              open.xp === null
                ? t.goneChip
                : open.xp.draft
                  ? t.draft
                  : t.sources[open.xp.source]
            }
            note={notes(open)}
            closeLabel={t.close}
            noPicture={t.noPicture}
            onClose={() => setReading(null)}
          >
            {verbs(open, onShelf, true)}
          </CartridgeSheet>
        )}
      </>
    )
  }

  /**
   * A row, as a function that is *called* rather than a component.
   *
   * Deliberate, and the bug it avoids is not subtle: a component declared
   * inside another one is a new type on every render, so React unmounts and
   * remounts its whole subtree whenever anything here changes. The subtree
   * includes whatever `controls` returned - which for the Play rail is a text
   * field somebody is typing the room's name into. It would lose focus after
   * every character.
   */
  function drawRow(row: ShelfRow, onShelf: boolean) {
    const expanded = reading === row.ref
    const working = busy === row.ref
    /** Nothing playable answers to it any more. See `splitShelf`. */
    const gone = row.xp === null

    return (
      <li
        key={row.ref}
        className={`rounded-lg border bg-surface-raised/40 ${dense ? 'p-2' : 'px-3 py-2'} ${
          gone ? 'border-line/40 opacity-70' : 'border-line/60'
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setReading(expanded ? null : row.ref)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className={`truncate font-medium ${text}`}>{row.name}</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {/*
                  On the closed row, because the whole point is being told
                  without going looking. Putting one out already uses the new
                  version - `ShelfRow.ref` is resolved - so this is the only
                  place anybody learns that the level changed under them.
                */}
                {row.update && (
                  <span
                    className={`font-mono ${small} uppercase tracking-[0.15em] text-accent-2`}
                  >
                    v{row.update.to}
                  </span>
                )}
                <span
                  className={`font-mono ${small} uppercase tracking-[0.15em] text-ink-muted/70`}
                >
                  {gone ? t.goneChip : row.xp!.draft ? t.draft : t.sources[row.xp!.source]}
                </span>
              </span>
            </span>
            <span className={`font-mono ${small} text-ink-muted/70`}>
              {gone ? t.notHereAnyMore : describeRules(row.xp!, t.rules)}
            </span>
          </button>

          {/*
            The magazine's own verb, in the row rather than in the expansion.

            Taking one in is the thing this list is for and it costs nothing -
            §3's "free and unlimited on every tier" - so it is one press from
            the list. Putting one back is not: it is in the opened row, because
            a control that removes something should take the same two presses
            everything else destructive here takes.
          */}
          {!onShelf && !gone && blocked === null && (
            <button
              type="button"
              onClick={() => takeIn(row)}
              disabled={pending}
              className={`shrink-0 rounded-full border border-accent/60 px-2.5 py-0.5 ${small} text-accent transition hover:bg-accent/10 disabled:opacity-40`}
            >
              {working ? t.taking : t.takeIn}
            </button>
          )}
        </div>

        {expanded && (
          <div className="mt-1.5 space-y-1.5 border-t border-line/40 pt-1.5">
            {row.blurb && (
              <p className={`${small} leading-snug text-ink-muted`}>{row.blurb}</p>
            )}

            {notes(row)}

            {verbs(row, onShelf, false)}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className={dense ? 'space-y-3 px-1.5 pb-2' : 'space-y-5'}>
      {show !== 'catalogue' && (
      <section>
        {/*
          The heading earns its place when both halves are on screen and stops
          earning it when a tab already says which half this is. Kept for the
          count, which the tab does not carry.
        */}
        <h3
          className={`mb-1.5 font-mono ${small} uppercase tracking-[0.15em] text-ink-muted/70`}
        >
          {t.inYourMagazine}
          {shelved.length > 0 && <span className="tabular-nums"> · {shelved.length}</span>}
        </h3>

        {shelved.length === 0 ? (
          /*
            Empty on the day this ships, for every space there is.

            So it says what the shelf is and what fills it, rather than reading
            as a feature that failed - the same argument `/browse`'s own empty
            state makes, and the reason the list below it is on the same screen:
            the answer to "nothing here" is two inches down.
          */
          <p className={`${small} leading-relaxed text-ink-muted`}>
            {t.noneTakenIn}
          </p>
        ) : (
          view === 'shelf' ? (
            drawShelf(shelved, true)
          ) : (
            <ul className="space-y-1.5">{shelved.map((row) => drawRow(row, true))}</ul>
          )
        )}
      </section>
      )}

      {show !== 'shelf' && rest.length > 0 && (
        <section className={show === 'both' ? 'border-t border-line/40 pt-4' : undefined}>
          {show === 'both' && (
            <h3
              className={`mb-1.5 font-mono ${small} uppercase tracking-[0.15em] text-ink-muted/70`}
            >
              {t.everythingElse}
            </h3>
          )}
          {view === 'shelf' ? (
            drawShelf(rest, false)
          ) : (
            <ul className="space-y-1.5">{rest.map((row) => drawRow(row, false))}</ul>
          )}
        </section>
      )}

      {hidden > 0 && (
        /* The cap, said out loud rather than a list that quietly stops. */
        <p className={`${small} text-ink-muted tabular-nums`}>
          {fill(t.moreInBrowse, { n: hidden })}
        </p>
      )}

      {footer}

      {error && (
        <p role="alert" className={`${small} text-rose-300`}>
          {error}
        </p>
      )}
    </div>
  )
}
