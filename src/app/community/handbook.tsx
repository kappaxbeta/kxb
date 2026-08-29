import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CHAPTERS,
  chapterBySlug,
  type CommunityDict,
  communityDict,
  countriesByContinent,
  countryBySlug,
  countryLangs,
  type Country,
  type Guide,
  type Lang,
  pick,
  type Section,
  type Text,
} from '@kxb/community'
import { Band, MarketingShell, PageHero, Spec } from '@/app/components/marketing-shell'

/**
 * The community handbook, drawn from `@kxb/community`.
 *
 * ---------------------------------------------------------------------------
 * The seam
 * ---------------------------------------------------------------------------
 * Every word on these pages comes out of the package - the guides, the country
 * roster, the chrome dictionary. This file owns what the package deliberately
 * does not: hues, spans, which section shape gets which markup, and the two URL
 * prefixes. Same split as the landing page ("a translator never touches a
 * coordinate"), with the extra reason that the package is bound for its own
 * repository and must not know this app's routes or components exist.
 *
 * ---------------------------------------------------------------------------
 * Language, twice over
 * ---------------------------------------------------------------------------
 * Two languages are at work and they are not the same axis. The *page* is
 * English at `/community` and German at `/de/community` - that pair is chrome,
 * dictionary-shaped, and always complete. The *document* is whatever the
 * package has: `pick` answers with the asked-for language or falls back to
 * English and says so, and the page prints that admission as a banner rather
 * than serving English under a German heading in silence. See the note in
 * `packages/community/src/text.ts` for why guides are whole documents per
 * language and not keyed slots.
 */

/** The handbook's path in each page language. */
function base(lang: Lang): string {
  return lang === 'de' ? '/de/community' : '/community'
}

function countryName(country: Country, t: CommunityDict): string {
  return t.countryNames[country.slug] ?? country.name
}

/**
 * Hues per section kind, so the same kind of thing wears the same colour on
 * every page - a reader who has seen one guide can skim the second by colour.
 * The values walk the same wheel the landing rows use.
 */
const KIND_HUE: Record<Section['kind'], number> = {
  prose: 285,
  steps: 322,
  choice: 195,
  terms: 260,
  costs: 45,
  watch: 20,
  sources: 165,
}

/**
 * The kicker over each section, named by kind rather than repeated per
 * document. Chrome, so it lives beside the hues rather than in the package -
 * but it is words, so it exists in both page languages.
 */
const KIND_LABEL: Record<Section['kind'], { en: string; de: string }> = {
  prose: { en: 'Read first', de: 'Zuerst lesen' },
  steps: { en: 'Procedure', de: 'Ablauf' },
  choice: { en: 'Decision', de: 'Entscheidung' },
  terms: { en: 'Vocabulary', de: 'Vokabular' },
  costs: { en: 'Costs', de: 'Kosten' },
  watch: { en: 'Traps', de: 'Fallen' },
  sources: { en: 'Sources', de: 'Quellen' },
}

/* ------------------------------------------------------------------------- */
/* The index                                                                 */
/* ------------------------------------------------------------------------- */

export function CommunityIndex({ lang }: { lang: Lang }) {
  const t = communityDict(lang)
  const shelves = countriesByContinent()
  return (
    <MarketingShell locale={lang}>
      <div className="bento">
        <PageHero eyebrow="Community" title={t.index.title} sub={t.index.standfirst} hue={322} />

        <Band
          id="chapters"
          kicker={t.index.chaptersKicker}
          mark="rules"
          title={t.index.chaptersHeading}
          hue={195}
          index={1}
        >
          <p className="mb-5 max-w-2xl">{t.index.chaptersIntro}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHAPTERS.map((chapter, i) => {
              const doc = pick(chapter.guide, lang)
              return (
                <Link
                  key={chapter.slug}
                  href={`${base(lang)}/${chapter.slug}`}
                  className="box box-interactive rise flex flex-col gap-2 p-5"
                  style={{ '--box-hue': 195 + i * 40, '--i': i + 2 } as React.CSSProperties}
                >
                  <span className="text-lg font-semibold text-ink">{doc.doc.title}</span>
                  <span className="text-sm text-ink-muted">{doc.doc.standfirst}</span>
                </Link>
              )
            })}
          </div>
        </Band>

        <Band
          id="countries"
          kicker={t.index.countriesKicker}
          mark="catalogue"
          title={t.index.countriesHeading}
          hue={322}
          index={4}
        >
          <p className="mb-2 max-w-2xl">{t.index.countriesIntro}</p>
          <p className="mb-5 max-w-2xl text-sm text-ink-muted">{t.index.plannedIntro}</p>
          {/* One shelf per continent, written countries first on each. The
              written ones are full cards and links; the rest are chips on the
              same shelf - a promise beside its neighbours rather than a
              separate apology section at the bottom of the page. */}
          <div className="space-y-8">
            {shelves.map((shelf, s) => {
              const written = shelf.countries.filter((country) => country.guide)
              const planned = shelf.countries.filter((country) => !country.guide)
              return (
                <div key={shelf.continent}>
                  <h3 className="mb-3 text-base font-semibold text-ink">
                    {t.continents[shelf.continent]}
                  </h3>
                  {written.length > 0 && (
                    <div className="mb-3 grid gap-3 sm:grid-cols-2">
                      {written.map((country, i) => {
                        const doc = pick(country.guide!, lang)
                        return (
                          <Link
                            key={country.slug}
                            href={`${base(lang)}/${country.slug}`}
                            className="box box-interactive rise flex items-start gap-4 p-5"
                            style={{ '--box-hue': 322 - s * 60, '--i': i + 5 } as React.CSSProperties}
                          >
                            <span aria-hidden className="text-4xl leading-none">
                              {country.flag}
                            </span>
                            <span className="flex flex-col gap-1">
                              <span className="text-lg font-semibold text-ink">
                                {countryName(country, t)}
                              </span>
                              <span className="text-sm text-ink-muted">{doc.doc.standfirst}</span>
                              <span className="mt-1 text-xs uppercase tracking-wide text-accent-2">
                                {t.index.inLangs} {countryLangs(country).join(' · ')}
                              </span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {planned.length > 0 && (
                    <ul className="tagfield">
                      {planned.map((country) => (
                        <li
                          key={country.slug}
                          className="tagfield-chip"
                          title={t.index.plannedBadge}
                        >
                          <span aria-hidden className="mr-1.5">
                            {country.flag}
                          </span>
                          {countryName(country, t)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </Band>

        <p className="col-span-6 mx-auto mt-4 max-w-2xl text-center text-sm text-ink-muted">
          {t.disclaimer}
        </p>
      </div>
    </MarketingShell>
  )
}

/* ------------------------------------------------------------------------- */
/* A document                                                                */
/* ------------------------------------------------------------------------- */

/** Resolve a slug to a document, chapters first. Slugs cannot collide: chapter
 *  slugs are words, country slugs are two letters. */
export function resolveDoc(slug: string): Text<Guide> | undefined {
  return chapterBySlug(slug)?.guide ?? countryBySlug(slug)?.guide
}

export function CommunityDoc({ lang, slug }: { lang: Lang; slug: string }) {
  const text = resolveDoc(slug)
  if (!text) notFound()
  const t = communityDict(lang)
  const { doc, translated } = pick(text, lang)
  const label = (kind: Section['kind']) => KIND_LABEL[kind][lang === 'de' ? 'de' : 'en']
  return (
    <MarketingShell locale={lang}>
      <div className="bento">
        <PageHero
          eyebrow={t.doc.back.replace('← ', '')}
          title={doc.title}
          sub={doc.standfirst}
          hue={322}
        />

        <div className="col-span-6 -mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
          <Link href={base(lang)} className="nav-link">
            {t.doc.back}
          </Link>
          <span>
            {t.doc.checked} {doc.checked}
          </span>
        </div>

        {!translated && (
          <p className="col-span-6 rounded-xl border border-amber-600/40 bg-amber-600/10 px-4 py-3 text-sm text-ink">
            {t.doc.untranslated}
          </p>
        )}

        {/* The on-page nav: a document long enough to need one, short enough
            that anchors beat a sidebar. */}
        <nav aria-label={t.doc.contents} className="col-span-6 flex flex-wrap gap-2">
          {doc.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="tagfield-chip">
              {section.heading}
            </a>
          ))}
        </nav>

        {doc.sections.map((section, i) => (
          <Band
            key={section.id}
            id={section.id}
            kicker={label(section.kind)}
            title={section.heading}
            hue={KIND_HUE[section.kind]}
            index={i + 2}
          >
            <SectionBody section={section} t={t} />
          </Band>
        ))}

        <p className="col-span-6 mx-auto mt-4 max-w-2xl text-center text-sm text-ink-muted">
          {t.disclaimer}
        </p>
      </div>
    </MarketingShell>
  )
}

/** One section, drawn by its kind. Exhaustive: a new `kind` in the package is
 *  a type error here, not a blank space on the page. */
function SectionBody({ section, t }: { section: Section; t: CommunityDict }) {
  switch (section.kind) {
    case 'prose':
      return <Paragraphs body={section.body} />
    case 'steps':
      return (
        <>
          {section.intro && <Paragraphs body={section.intro} />}
          <ol className="steps">
            {section.steps.map((step, i) => (
              <li key={step.title} className="step">
                <span className="step-n" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="step-title">{step.title}</p>
                  {(step.where || step.cost || step.takes) && (
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {step.where && (
                        <span>
                          <span className="text-accent-2">{t.doc.where}:</span> {step.where}
                        </span>
                      )}
                      {step.cost && (
                        <span>
                          <span className="text-accent-2">{t.doc.cost}:</span> {step.cost}
                        </span>
                      )}
                      {step.takes && (
                        <span>
                          <span className="text-accent-2">{t.doc.takes}:</span> {step.takes}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="step-body space-y-2">
                    {step.body.map((p) => (
                      <p key={p.slice(0, 40)}>{p}</p>
                    ))}
                  </div>
                  {step.fields && (
                    <Spec rows={step.fields.map((field) => [field.label, field.means] as const)} />
                  )}
                  {step.watch && (
                    <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-amber-600">{t.doc.watch}: </span>
                      {step.watch}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )
    case 'choice':
      return (
        <>
          {section.intro && <Paragraphs body={section.intro} />}
          <div className="space-y-6">
            {section.choices.map((choice) => (
              <div key={choice.question}>
                <h3 className="mb-3 text-base font-semibold text-ink">{choice.question}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {choice.options.map((option) => (
                    <div
                      key={option.name}
                      className="rounded-xl border border-line/50 bg-surface-raised p-4"
                    >
                      <p className="font-semibold text-ink">{option.name}</p>
                      <p className="mt-1 text-sm text-ink-muted">{option.when}</p>
                      {option.costs && (
                        <p className="mt-2 text-sm text-emerald-600">{option.costs}</p>
                      )}
                      {option.catch && <p className="mt-2 text-sm text-amber-600">{option.catch}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )
    case 'terms':
      return (
        <>
          {section.intro && <Paragraphs body={section.intro} />}
          <Spec rows={section.terms.map((term) => [term.term, term.means] as const)} />
        </>
      )
    case 'costs':
      return (
        <>
          {section.intro && <Paragraphs body={section.intro} />}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/50 text-left text-ink-muted">
                  <th className="py-2 pr-4 font-medium">{t.doc.what}</th>
                  <th className="py-2 font-medium">{t.doc.amount}</th>
                </tr>
              </thead>
              <tbody>
                {section.costs.map((cost) => (
                  <tr key={cost.what} className="border-b border-line/30 align-top">
                    <td className="py-2.5 pr-4">
                      <span className="text-ink">{cost.what}</span>
                      {cost.note && <span className="block text-xs text-ink-muted">{cost.note}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2.5 font-semibold text-ink">
                      {cost.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )
    case 'watch':
      return (
        <ul className="not-yet-list">
          {section.items.map((item) => (
            <li key={item.slice(0, 40)}>{item}</li>
          ))}
        </ul>
      )
    case 'sources':
      return (
        <ul className="space-y-3">
          {section.sources.map((source) => (
            <li key={source.href}>
              {/* External by nature; the one internal href the package holds
                  ('/community') is relative and renders the same way. */}
              <a href={source.href} className="text-accent hover:underline" rel="noopener">
                {source.label}
              </a>
              {source.note && <span className="block text-sm text-ink-muted">{source.note}</span>}
            </li>
          ))}
        </ul>
      )
  }
}

function Paragraphs({ body }: { body: string[] }) {
  return (
    <div className="mb-4 max-w-2xl space-y-3">
      {body.map((p) => (
        <p key={p.slice(0, 40)}>{p}</p>
      ))}
    </div>
  )
}
