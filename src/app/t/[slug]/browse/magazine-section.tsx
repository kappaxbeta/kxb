'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { XpPicker } from '@/app/t/[slug]/xp-picker'
import { attempt } from '@/app/components/connection'
import type { ShelfRow } from '@/domain/magazine/shelf'
import { remixXp } from '@/domain/xps/actions'
import { openXpHere, pinXp } from '@/domain/xps/place-actions'
import { fightable } from '@/domain/battle/xp-rules'
import { OFFERED_IN_A_ROOM } from '@/domain/xps/room'
import { describeNeed, unsupported } from '@kxb/xp/host'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'
import { fill } from '@/app/i18n/fill'
import { xpDict } from '@/app/i18n/xp'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The shelf on the space's own workbench, and what this page does with a row.
 *
 * ---------------------------------------------------------------------------
 * It replaced the kxb.team shelf rather than joining it
 * ---------------------------------------------------------------------------
 * That section listed the levels we ship and offered exactly these two
 * controls. Once the magazine exists it is a second list of the same eight
 * things, with the first step missing: its primary button was "put it in our
 * place", and `docs/product/pricing.md` §3 puts taking one in *before* loading
 * it. So the two controls moved here, where the list they belong to is, and the
 * badge on a row says `ours` where the section heading used to.
 *
 * ---------------------------------------------------------------------------
 * Both controls, and the refusal that has to come with them
 * ---------------------------------------------------------------------------
 * `OFFERED_IN_A_ROOM` is the whole reason this is not two buttons in a loop. A
 * level asking for something a builtin cannot be given - `steal-a-plant` and
 * `persistence` - pins cleanly, opens a room, and says "Not here" to everybody
 * who walked into it. The button is where that has to be said, because it is
 * the thing somebody is about to press, and remixing is what gives the level
 * the row it has been asking for.
 */
export function MagazineSection({
  slug,
  inMagazine,
  catalogue,
  hidden,
  blocked,
  show = 'both',
}: {
  slug: string
  inMagazine: ShelfRow[]
  catalogue: ShelfRow[]
  hidden: number
  blocked: string | null
  /**
   * Which half this mount draws. Passed straight through to the picker.
   *
   * Two mounts on one page - the Magazine tab and the Store tab - rather than
   * one that switches, because only the open tab is mounted and the controls
   * differ by half in ways that will keep diverging. Both are still handed both
   * lists; see the prop's note on the picker for why that is not waste.
   */
  show?: 'both' | 'shelf' | 'catalogue'
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = browseDict(locale).shelf
  const needWords = xpDict(locale).needs
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [placing, setPlacing] = useState<string | null>(null)
  /** And the one being copied. Not the same state: a row offers both. */
  const [remixing, setRemixing] = useState<string | null>(null)
  /** ...and the one being started. Three controls, three states. */
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * What has been put out in this visit.
   *
   * `pinXp` revalidates the layout - the rail has to grow a row - but this
   * page's own render is not on that path, so the row would go on offering a
   * place that already exists. `useState` with a rollback rather than
   * `useOptimistic`, which is the house rule for anything whose action does not
   * revalidate the list it is drawn from.
   */
  const [placed, setPlaced] = useState<string[]>([])

  function place(row: ShelfRow) {
    setError(null)
    setPlacing(row.ref)

    startTransition(async () => {
      const result = await attempt(() => pinXp(slug, row.ref))
      setPlacing(null)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      setPlaced((already) => [...already, row.ref])
      // The rail and the rooms list are both elsewhere on this page's layout,
      // and both have just changed.
      router.refresh()
    })
  }

  /**
   * Start a match in it, from the shelf, and go straight there.
   *
   * ---------------------------------------------------------------------------
   * The step this list was missing
   * ---------------------------------------------------------------------------
   * Both halves of this page - the Magazine tab and the Store tab - offered
   * *put it out* and *remix*, and the first of those is a two-step: put it in
   * the place, find it in the Play rail, press *Run a battle*. That is the
   * right order for a level somebody wants to keep. It is the wrong order for a
   * game somebody wants to play *now*, which for a cartridge is most of them -
   * `docs/product/pricing.md` §3 puts taking one in before loading it, and says
   * nothing about a match being three clicks away from a shelf.
   *
   * `openXpHere` is the same action the Play rail's button calls, unchanged.
   * That is deliberate rather than convenient: it resolves the reference
   * against this space's own playable list, so the four checks that matter -
   * the tier, the feature, the write block, and whether this space may see the
   * document at all - are the ones `createBattle` already makes. A second path
   * would be a second place for those to be got right.
   *
   * **It does not put the level out.** A match is a session and a shelf is a
   * shelf; starting one here leaves the row exactly where it was, which is what
   * lets somebody try a game before deciding whether their space keeps it.
   */
  function start(row: ShelfRow) {
    setError(null)
    setStarting(row.ref)

    startTransition(async () => {
      const result = await attempt(() => openXpHere(slug, row.ref))
      if (!result.ok) {
        setStarting(null)
        setError(refusal(result.error))
        return
      }
      // Refreshed before the push for the reason the Play rail gives: the
      // match is now in lists this page is rendered beside, and without it they
      // stay stale until something else happens.
      router.refresh()
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  /**
   * Take our copy of it, and land on the copy.
   *
   * The destination is the point rather than a convenience: the next thing
   * anybody does with a level they just took is open it, which is the ending
   * `copyXp` chose for the same gesture from the project page.
   */
  function remix(row: ShelfRow) {
    setError(null)
    setRemixing(row.ref)

    startTransition(async () => {
      const result = await attempt(() => remixXp(slug, row.ref))
      if (!result.ok) {
        setRemixing(null)
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/browse/${result.xpId}`)
    })
  }

  return (
    <>
      <XpPicker
        slug={slug}
        inMagazine={inMagazine}
        catalogue={catalogue}
        hidden={hidden}
        blocked={blocked}
        show={show}
        /*
          Cartridges, not rows. This is the page with room for the object -
          the Play rail is a column beside a scene and keeps the list. See the
          prop's own note on the picker.
        */
        view="shelf"
        controls={(row) => {
          const missing = unsupported(row.needs, OFFERED_IN_A_ROOM)
          const here = placed.includes(row.ref)
          /*
           * Anything on this list can be remixed, which is the point of the
           * list. It only ever offered this for the levels we ship, because
           * the action took a filename - so a published level somebody else
           * wrote could be played and not forked, which is backwards: being
           * forkable is most of what publishing is for.
           *
           * `remixXp` resolves through `loadPlayableXp`, so the refusal for a
           * draft in another space is the same null as for a level that does
           * not exist. A row that names something gone has nothing to copy.
           */
          const remixable = row.xp !== null
          /**
           * Whether a match can be had in this at all.
           *
           * `fightable` and not "is it a cartridge": half the shelf declares
           * only `freeplay` and every one of those opens by starting a match,
           * because a match is the room mechanism this product has. What it
           * refuses is the other asymmetry that function exists for - a
           * cartridge whose rules are code and which has no match in it, like
           * the café and the house. Asked here so the button is absent rather
           * than drawn and then refused by `createBattle`.
           *
           * Guarded on `missing` too: a level this space cannot satisfy is one
           * where *Remix* is the useful control, and offering a match beside
           * that sentence would be offering the thing it just said no to.
           */
          const playable = row.xp !== null && fightable(row.xp) && missing.length === 0

          return (
            <div className="flex flex-wrap items-center gap-2">
              {playable ? (
                <button
                  type="button"
                  onClick={() => start(row)}
                  disabled={pending}
                  className="rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
                >
                  {starting === row.ref ? t.starting : t.runBattle}
                </button>
              ) : row.xp !== null && missing.length === 0 ? (
                <p className="text-[11px] text-ink-muted/80">{t.roomOnly}</p>
              ) : null}

              {missing.length > 0 ? (
                <p className="text-[11px] leading-relaxed text-amber-200/80">
                  {fill(t.remixFirst, {
                    needs: missing
                      .map((need) => describeNeed(need, needWords))
                      .join(' · '),
                  })}
                </p>
              ) : here ? (
                <p className="text-[11px] text-accent-2">
                  {t.inYourPlace}
                </p>
              ) : row.xp !== null && !row.xp.capabilities.includes('freeplay') ? (
                /*
                  The rule the play rail already states: only a level that
                  says it can be a room offers to be one. This site offered
                  "put it in our place" to battle-only levels anyway, which
                  is a button `createXpRoom` would honour into a room nobody
                  can freely walk around in. Absent beats drawn-and-wrong;
                  the match button above is still the way to play it.
                */
                null
              ) : (
                <button
                  type="button"
                  onClick={() => place(row)}
                  disabled={pending}
                  className="rounded-full border border-accent/60 px-3 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
                >
                  {placing === row.ref ? t.puttingOut : t.putOut}
                </button>
              )}

              {remixable && (
                <button
                  type="button"
                  onClick={() => remix(row)}
                  disabled={pending}
                  className={
                    missing.length > 0
                      ? 'rounded-full border border-accent/60 px-3 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50'
                      : 'rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-ink-muted hover:text-ink disabled:opacity-50'
                  }
                >
                  {remixing === row.ref ? t.takingCopy : t.remix}
                </button>
              )}
            </div>
          )
        }}
      />

      {error && <p className="mt-3 text-xs text-amber-200">{error}</p>}
    </>
  )
}
