import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketingShell } from '@/app/components/marketing-shell'
import { describeCapability } from '@kxb/xp'
import { PACKS } from '@kxb/xp/packs'
import { findXp, readXpDocument } from '@/domain/xps/catalogue'
import { readXpViewer, type XpViewer } from '@/domain/xps/viewer'
import { createClient, getUser } from '@/lib/supabase/server'
import { readLocale } from '@/app/i18n/preference'
import { storeDict, type StoreDict } from '@/app/i18n/store'

/**
 * One XP, for somebody deciding whether to spend ten minutes on it.
 *
 * ---------------------------------------------------------------------------
 * What this page is instead of, for now
 * ---------------------------------------------------------------------------
 * `docs/xp/backend.md` §8.3 describes this page with the front picture large,
 * the rest of the previews under it, `vision.json` rendered, and one control:
 * play. Two of those four do not exist yet - a folder has no `preview/` and no
 * `vision.json` until B0 and B2 land - so what fills the gap is what the
 * document already knows about itself: what the product may do with it, how big
 * it is, what art it was built from, and who made that art.
 *
 * That is deliberately *not* a placeholder. Every line on this page is read off
 * the parsed document, so it cannot describe a level that is not there, and
 * when the prose arrives it goes above these facts rather than replacing them.
 * A store page that is only a picture and a paragraph is one nobody can check.
 *
 * ---------------------------------------------------------------------------
 * The play control, and why it is honest about a locked door
 * ---------------------------------------------------------------------------
 * `/xp/<id>` is `requireXpAccess` - a backoffice admin, or a developer's own
 * machine. So for almost everybody who reads this page, there is currently
 * nowhere to press play, and the page says so in one line rather than offering
 * a button that 404s. Being told "not yet, and here is what it will be" is
 * recoverable; pressing a button and getting a missing page is not.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const xp = await findXp((await params).id, await createClient())
  if (!xp) return { title: storeDict(await readLocale()).notFound }

  return {
    title: `${xp.name} — XP`,
    description: xp.blurb ?? storeDict(await readLocale()).defaultBlurb,
    openGraph: xp.cover ? { images: [{ url: xp.cover }] } : undefined,
  }
}

export const dynamic = 'force-dynamic'

export default async function XpStorePage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await readLocale()
  const t = storeDict(locale)
  const { id } = await params

  const supabase = await createClient()

  // Both with the client, so a level taken off the shelf 404s here as well as
  // vanishing from the list - a shared link to an unlisted level should not be
  // the way back in.
  const [xp, document] = await Promise.all([
    findXp(id, supabase),
    readXpDocument(id, supabase),
  ])
  if (!xp || !document) notFound()

  const user = await getUser()
  const viewer = await readXpViewer(supabase, user?.id ?? null)

  // Only the packs this level actually draws from, so the credit line is about
  // the thing being looked at rather than about everything we ship - which is
  // what `credits()` returns and what the operator catalogue correctly wants.
  const attribution = document.packs
    .map((ref) => PACKS[ref.id])
    .filter((pack): pack is NonNullable<typeof pack> => Boolean(pack))

  return (
    <MarketingShell locale={locale}>
      <div className="pb-4">
        <p className="pt-6 text-sm sm:pt-10">
          <Link href="/browse" className="text-ink-muted transition hover:text-ink">
            {t.back}
          </Link>
        </p>

        {/*
          Three children, and the DOM order is the phone's order: picture, then
          what it is, then what it is made of. On a wide screen the third is
          pulled back under the first with explicit placement rather than
          reordered, because `order` on a grid moves the *paint* and leaves the
          tab order where it was - and here the two would disagree.

          The DOM order is the load-bearing half. Nesting the facts inside the
          picture column reads correctly on a desktop and puts four numbers
          between the photograph and the name of the thing on every phone, which
          is what it did.
        */}
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-6">
          {/* --- the picture ---------------------------------------------- */}
          <div className="lg:col-start-1 lg:row-start-1">
            <div className="relative isolate overflow-hidden rounded-2xl border border-line/50 bg-[oklch(0.06_0.02_265)]">
              {xp.cover ? (
                /* eslint-disable-next-line @next/next/no-img-element -- drawn by
                   our own rasteriser and checked in; see the note on XpCard. */
                <img
                  src={xp.cover}
                  alt={`${xp.name}, drawn from inside the level`}
                  className="aspect-[16/10] w-full object-cover"
                />
              ) : (
                <div className="relative isolate aspect-[16/10] w-full">
                  <span aria-hidden className="neon-horizon" />
                  <span aria-hidden className="neon-floor" />
                  <span className="sr-only">{t.noPicture}</span>
                </div>
              )}
            </div>
          </div>

          {/* --- what it is ----------------------------------------------- */}
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-1">
            <h1 className="font-pixel text-[clamp(1.5rem,5.2vw,2.25rem)] uppercase leading-[1.18]">
              {xp.name}
            </h1>

            {xp.blurb && (
              <p className="mt-4 max-w-[62ch] text-base leading-relaxed">{xp.blurb}</p>
            )}

            <PlayDoor t={t} id={xp.id} viewer={viewer} />

            {/* Capabilities as sentences rather than chips, because on this page
                there is room for the sentence and the sentence is the answer -
                "two sides, a score and an end condition" is what somebody wants
                to know, and `match` is not. */}
            {xp.capabilities.length > 0 && (
              <section className="mt-8 border-t border-line/40 pt-6">
                <h2 className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
                  {t.goodFor}
                </h2>
                <ul className="mt-3 space-y-2.5">
                  {xp.capabilities.map((capability) => (
                    <li key={capability} className="flex gap-3 text-sm leading-relaxed">
                      <span
                        aria-hidden
                        className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-accent-2"
                      />
                      <span className="text-ink-muted">
                        {describeCapability(capability)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {attribution.length > 0 && (
              <section className="mt-8 border-t border-line/40 pt-6">
                <h2 className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
                  {t.builtFrom}
                </h2>
                <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-ink-muted">
                  {attribution.map((pack) => (
                    <li key={pack.label}>
                      {pack.label} — {pack.author},{' '}
                      <a
                        href={pack.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline-offset-4 transition hover:text-ink hover:underline"
                      >
                        {pack.licence}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/*
            What it is made of. Last in the DOM and pulled back under the
            picture on a wide screen - this is the material somebody reads after
            they have decided the picture is interesting, so it must not stand
            between the picture and the name on a phone.
          */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:col-start-1 lg:row-start-2">
            <Fact
              label={t.piecesLabel}
              value={xp.pieces.toLocaleString(locale)}
              note={t.architecture}
            />
            <Fact
              label={t.thingsLabel}
              value={xp.things.toLocaleString(locale)}
              note={t.withRules}
            />
            <Fact
              label={t.kinds}
              value={Object.keys(document.blueprints).length.toLocaleString(locale)}
              note={t.namedBlueprints}
            />
            <Fact
              label={t.scripts}
              value={Object.keys(document.scripts ?? {}).length.toLocaleString(locale)}
              note={xp.scripted ? t.inTheSandbox : t.rulesOnly}
            />
          </dl>
        </div>
      </div>
    </MarketingShell>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-xl tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-xs leading-snug text-ink-muted">{note}</dd>
    </div>
  )
}

/**
 * Press play, or find out why not.
 *
 * The three states are the three the store already knows about, plus the one
 * this page adds: an operator can open it now, and nobody else can open it at
 * all. `docs/xp/backend.md` §7.4 is where that stops being true - a published
 * XP needs no account to play, including no space - and this control is the
 * thing that changes when B5 lands.
 */
function PlayDoor({ id, viewer, t }: { id: string; viewer: XpViewer; t: StoreDict }) {
  if (viewer.operator) {
    return (
      <div className="mt-7">
        <Link href={`/xp/${id}`} className="summon-cta inline-flex">
          {t.playIt}
        </Link>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          {t.yoursBecauseTeam}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-7 rounded-xl border border-line/60 bg-surface/40 px-4 py-4">
      <p className="text-sm leading-relaxed">
        <span className="font-medium">{t.notOpenYet}</span> {t.notOpenBody}
      </p>
      <p className="mt-2 text-sm">
        <Link
          href={viewer.upgradable ? `/t/${viewer.upgradable.slug}/billing` : '/create/xp'}
          className="text-accent transition hover:opacity-80"
        >
          {viewer.upgradable ? t.comparePlans : t.seeWhatItDoes} →
        </Link>
      </p>
    </div>
  )
}
