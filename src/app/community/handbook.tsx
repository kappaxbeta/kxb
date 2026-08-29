import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  blogIndex,
  blogBySlug,
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
  STARTER,
  STARTER_SLUG,
  type Text,
} from '@kxb/community'
import Logo from '@/app/components/logo'
import { ShootingStars } from '@/app/components/shooting-stars'
import { Spec } from '@/app/components/marketing-shell'
import { GeoCountry } from '@/app/community/geo-country'

/**
 * The community handbook, drawn from `@kxb/community`.
 *
 * ---------------------------------------------------------------------------
 * The seam
 * ---------------------------------------------------------------------------
 * Every word on these pages comes out of the package - the guides, the blog,
 * the roster, the chrome dictionary. This file owns what the package
 * deliberately does not: layout, hues, which section shape gets which markup,
 * and the URL prefixes. The package is bound for its own repository and must
 * not know this app's routes or components exist.
 *
 * ---------------------------------------------------------------------------
 * The look: a game menu, not a card catalogue
 * ---------------------------------------------------------------------------
 * Three revisions got it here. Marketing shell first; then a docs layout in
 * neon bento cards; then the cards went too, at the owner's call: no boxes.
 * What is left is the shape of a game's menu screen - the pixel display face
 * on every title, entries as glowing text rows that light and shift on hover,
 * sections separated by air rather than rules, and the starfield behind it
 * all. The one framed element is the sidebar's starter block, which is the
 * eye-catcher on purpose; everything else flows.
 *
 * ---------------------------------------------------------------------------
 * Language, twice over
 * ---------------------------------------------------------------------------
 * The *page* is English at /community and German at /de/community - chrome,
 * dictionary-shaped, always complete. The *document* is whatever the package
 * has: `pick` falls back to English and says so, and the page prints that
 * admission as a banner. See `packages/community/src/text.ts`.
 */

/** The handbook's path in each page language. */
function base(lang: Lang): string {
  return lang === 'de' ? '/de/community' : '/community'
}

function countryName(country: Country, t: CommunityDict): string {
  return t.countryNames[country.slug] ?? country.name
}

/**
 * Hues per section kind - one accent colour on the kicker, so the same kind
 * of thing wears the same colour on every page without a card around it.
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

function kickerColor(kind: Section['kind']): React.CSSProperties {
  return { color: `oklch(0.78 0.14 ${KIND_HUE[kind]})` }
}

/** The kicker over each section, chrome in both page languages. */
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
/* The shell                                                                 */
/* ------------------------------------------------------------------------- */

/** What the sidebar can mark as the current page. */
type Active = 'home' | 'blog' | string

function NavLink({
  href,
  current,
  children,
}: {
  href: string
  current: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`block px-3 py-1 text-sm transition hover:translate-x-0.5 ${
        current ? 'font-medium text-accent' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}

function NavHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  )
}

/**
 * The shell: sticky header, sticky sidebar, flowing main column, starfield.
 *
 * The sidebar's top block is the deliberate eye-catcher - the glowing CTA
 * class on the two doors a new reader should see first. Below it, quiet
 * text navigation: the chapters, then the written countries grouped under
 * their continents, then blog and resources.
 */
function CommunityShell({
  lang,
  active,
  children,
}: {
  lang: Lang
  active: Active
  children: React.ReactNode
}) {
  const t = communityDict(lang)
  const root = base(lang)
  const shelves = countriesByContinent()
  const otherLang: Lang = lang === 'de' ? 'en' : 'de'

  const sidebar = (
    <nav className="space-y-7">
      {/* The eye-catcher: the site's glowing CTA on the two first doors. */}
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-accent">
          ★ {t.nav.important}
        </p>
        <Link
          href={`${root}/${STARTER_SLUG}`}
          className="summon-cta block rounded-full px-4 py-3 text-center text-sm font-semibold"
        >
          🚀 {t.nav.starter}
        </Link>
        <p className="px-1 text-xs text-ink-muted">{t.nav.starterHint}</p>
        <Link
          href={`${root}/legal-shell`}
          className="block rounded-full border border-accent-2/60 px-4 py-3 text-center text-sm font-semibold text-accent-2 transition hover:bg-accent-2/10"
        >
          ⚖️ {t.nav.legal}
        </Link>
        <p className="px-1 text-xs text-ink-muted">{t.nav.legalHint}</p>
      </div>

      <div>
        <NavHeading>{t.nav.guides}</NavHeading>
        {CHAPTERS.map((chapter) => (
          <NavLink key={chapter.slug} href={`${root}/${chapter.slug}`} current={active === chapter.slug}>
            {pick(chapter.guide, lang).doc.title}
          </NavLink>
        ))}
      </div>

      {/* The written countries as a tree: one closed branch per continent,
          and only the branch holding the page you are on starts open. Native
          <details>, so the fold needs no client code and survives static
          rendering. The planned countries stay off the rail entirely -
          "show more" is the link to the full roster on the index. */}
      <div>
        <NavHeading>{t.nav.countries}</NavHeading>
        <div className="space-y-1">
          {shelves.map((shelf) => {
            const written = shelf.countries.filter((country) => country.guide)
            if (written.length === 0) return null
            const holdsActive = written.some((country) => country.slug === active)
            return (
              <details key={shelf.continent} open={holdsActive}>
                <summary className="cursor-pointer list-none px-3 py-1 text-sm text-ink-muted transition hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="mr-1.5 inline-block text-xs">
                    ▸
                  </span>
                  {t.continents[shelf.continent]}
                  <span className="ml-1.5 text-xs text-ink-muted/60">{written.length}</span>
                </summary>
                <div className="pl-4">
                  {written.map((country) => (
                    <NavLink
                      key={country.slug}
                      href={`${root}/${country.slug}`}
                      current={active === country.slug}
                    >
                      <span aria-hidden className="mr-1.5">
                        {country.flag}
                      </span>
                      {countryName(country, t)}
                    </NavLink>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
        <Link
          href={`${root}#countries`}
          className="mt-2 block px-3 text-xs text-ink-muted hover:text-ink"
        >
          {t.index.plannedHeading} →
        </Link>
      </div>

      <div>
        <NavHeading>{t.nav.blog}</NavHeading>
        <NavLink href={`${root}/blog`} current={active === 'blog'}>
          {t.blog.title}
        </NavLink>
      </div>

      <div>
        <NavHeading>{t.nav.resources}</NavHeading>
        <NavLink href="/create/xp/docs" current={false}>
          {t.nav.editorGuide} ↗
        </NavLink>
        <a
          href="https://github.com/kappaxbeta/kxb"
          className="block px-3 py-1 text-sm text-ink-muted transition hover:translate-x-0.5 hover:text-ink"
        >
          {t.nav.repo} ↗
        </a>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen text-ink">
      <ShootingStars />
      <header className="sticky top-0 z-20 border-b border-line/30 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2" title={t.nav.backToSite}>
              <Logo badge />
            </Link>
            <Link href={root} className="font-semibold tracking-wide text-ink hover:text-accent">
              Community
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href={base(otherLang)} hrefLang={otherLang} lang={otherLang} className="nav-link">
              {otherLang === 'de' ? 'Deutsch' : 'English'}
            </Link>
            <Link href="/" className="nav-link hidden sm:block">
              {t.nav.backToSite}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 py-8 sm:px-6">
        <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-64 shrink-0 self-start overflow-y-auto pb-8 lg:block">
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 pb-16">
          {/* Below lg the sidebar folds into a disclosure above the content -
              same links, no second implementation. */}
          <details className="mb-6 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              ★ {t.nav.guides} · {t.nav.countries} · {t.nav.blog}
            </summary>
            <div className="mt-4">{sidebar}</div>
          </details>
          {children}
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* The index                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * A game-menu row: text that lights up and steps forward, an arrow that
 * arrives on hover. The whole index is these - no cards.
 */
function MenuRow({
  href,
  lead,
  title,
  sub,
}: {
  href: string
  /** The flag or glyph in front. */
  lead?: string
  title: string
  sub?: string
}) {
  return (
    <Link
      href={href}
      className="group block py-2 transition hover:translate-x-1"
    >
      <span className="flex items-baseline gap-3">
        {lead && (
          <span aria-hidden className="text-2xl leading-none">
            {lead}
          </span>
        )}
        <span className="text-lg font-semibold text-ink transition group-hover:text-accent">
          {title}
        </span>
        <span aria-hidden className="text-accent opacity-0 transition group-hover:opacity-100">
          →
        </span>
      </span>
      {sub && <span className="mt-0.5 block max-w-xl text-sm text-ink-muted">{sub}</span>}
    </Link>
  )
}

export function CommunityIndex({ lang }: { lang: Lang }) {
  const t = communityDict(lang)
  const root = base(lang)
  const shelves = countriesByContinent()
  const writtenForGeo = shelves
    .flatMap((shelf) => shelf.countries.filter((country) => country.guide))
    .map((country) => ({
      slug: country.slug,
      name: countryName(country, t),
      flag: country.flag,
      standfirst: pick(country.guide!, lang).doc.standfirst,
    }))
  return (
    <CommunityShell lang={lang} active="home">
      <div className="space-y-14">
        <div>
          <h1 className="page-hero-title enter">{t.index.title}</h1>
          <p className="enter mt-4 max-w-2xl text-lg text-ink-muted" style={{ '--i': 2 } as React.CSSProperties}>
            {t.index.standfirst}
          </p>
        </div>

        <GeoCountry countries={writtenForGeo} labels={t.geo} base={root} />

        <section id="chapters">
          <h2 className="text-xl font-semibold text-accent-2">{t.index.chaptersHeading}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.index.chaptersIntro}</p>
          <div className="mt-4">
            {CHAPTERS.map((chapter) => {
              const doc = pick(chapter.guide, lang)
              return (
                <MenuRow
                  key={chapter.slug}
                  href={`${root}/${chapter.slug}`}
                  title={doc.doc.title}
                  sub={doc.doc.standfirst}
                />
              )
            })}
          </div>
        </section>

        <section id="countries">
          <h2 className="text-xl font-semibold text-accent-2">{t.index.countriesHeading}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.index.countriesIntro}</p>
          <p className="max-w-2xl text-sm text-ink-muted">{t.index.plannedIntro}</p>
          <div className="mt-6 space-y-10">
            {shelves.map((shelf) => {
              const written = shelf.countries.filter((country) => country.guide)
              const planned = shelf.countries.filter((country) => !country.guide)
              return (
                <div key={shelf.continent}>
                  <h3 className="text-base font-semibold uppercase tracking-widest text-ink-muted">
                    {t.continents[shelf.continent]}
                  </h3>
                  {written.length > 0 && (
                    <div className="mt-2 sm:columns-2 sm:gap-10">
                      {written.map((country) => (
                        <div key={country.slug} className="break-inside-avoid">
                          <MenuRow
                            href={`${root}/${country.slug}`}
                            lead={country.flag}
                            title={countryName(country, t)}
                            sub={`${t.index.inLangs} ${countryLangs(country).join(' · ')}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {planned.length > 0 && (
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted/70">
                      {planned.map((country, i) => (
                        <span key={country.slug} title={t.index.plannedBadge}>
                          {i > 0 && ' · '}
                          <span aria-hidden>{country.flag}</span> {countryName(country, t)}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <p className="max-w-2xl text-sm text-ink-muted">{t.disclaimer}</p>
      </div>
    </CommunityShell>
  )
}

/* ------------------------------------------------------------------------- */
/* A document                                                                */
/* ------------------------------------------------------------------------- */

/** Resolve a slug to a document: the starter guide, a chapter, or a country. */
export function resolveDoc(slug: string): Text<Guide> | undefined {
  if (slug === STARTER_SLUG) return STARTER
  return chapterBySlug(slug)?.guide ?? countryBySlug(slug)?.guide
}

/** One flowing document section: coloured kicker, heading, content. Air, not rules. */
function DocSection({
  section,
  lang,
  t,
}: {
  section: Section
  lang: Lang
  t: CommunityDict
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <p className="text-xs font-semibold uppercase tracking-widest" style={kickerColor(section.kind)}>
        ● {KIND_LABEL[section.kind][lang === 'de' ? 'de' : 'en']}
      </p>
      <h2 className="mt-1 mb-4 text-2xl font-semibold tracking-tight">{section.heading}</h2>
      <div className="leading-relaxed text-ink-muted">
        <SectionBody section={section} t={t} />
      </div>
    </section>
  )
}

export function CommunityDoc({ lang, slug }: { lang: Lang; slug: string }) {
  const text = resolveDoc(slug)
  if (!text) notFound()
  const t = communityDict(lang)
  const { doc, translated } = pick(text, lang)
  return (
    <CommunityShell lang={lang} active={slug}>
      <article className="max-w-3xl space-y-12">
        <div>
          <h1 className="page-hero-title enter">{doc.title}</h1>
          <p className="enter mt-4 text-lg text-ink-muted" style={{ '--i': 2 } as React.CSSProperties}>
            {doc.standfirst}
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            {t.doc.checked} {doc.checked}
          </p>
        </div>

        {!translated && (
          <p className="border-l-2 border-amber-600/60 pl-4 text-sm text-amber-600">
            {t.doc.untranslated}
          </p>
        )}

        <nav aria-label={t.doc.contents} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {doc.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="nav-link">
              {section.heading}
            </a>
          ))}
        </nav>

        {doc.sections.map((section) => (
          <DocSection key={section.id} section={section} lang={lang} t={t} />
        ))}

        <p className="text-sm text-ink-muted/70">{t.disclaimer}</p>
      </article>
    </CommunityShell>
  )
}

/* ------------------------------------------------------------------------- */
/* The blog                                                                  */
/* ------------------------------------------------------------------------- */

export function CommunityBlogIndex({ lang }: { lang: Lang }) {
  const t = communityDict(lang)
  const root = base(lang)
  const posts = blogIndex(lang)
  return (
    <CommunityShell lang={lang} active="blog">
      <div className="max-w-3xl space-y-10">
        <div>
          <h1 className="page-hero-title enter">{t.blog.title}</h1>
          <p className="enter mt-4 text-lg text-ink-muted" style={{ '--i': 2 } as React.CSSProperties}>
            {t.blog.standfirst}
          </p>
        </div>
        <div>
          {posts.map((entry) => (
            <div key={entry.slug} className="py-2">
              <p className="text-xs uppercase tracking-wide text-ink-muted/70">
                {t.blog.posted} {entry.doc.date}
              </p>
              <MenuRow
                href={`${root}/blog/${entry.slug}`}
                title={entry.doc.title}
                sub={entry.doc.standfirst}
              />
            </div>
          ))}
        </div>
      </div>
    </CommunityShell>
  )
}

export function CommunityBlogPost({ lang, slug }: { lang: Lang; slug: string }) {
  const entry = blogBySlug(slug)
  if (!entry) notFound()
  const t = communityDict(lang)
  const { doc, translated } = pick(entry.post, lang)
  return (
    <CommunityShell lang={lang} active="blog">
      <article className="max-w-3xl space-y-12">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            {t.blog.posted} {doc.date}
          </p>
          <h1 className="page-hero-title enter mt-1">{doc.title}</h1>
          <p className="enter mt-4 text-lg text-ink-muted" style={{ '--i': 2 } as React.CSSProperties}>
            {doc.standfirst}
          </p>
        </div>

        {!translated && (
          <p className="border-l-2 border-amber-600/60 pl-4 text-sm text-amber-600">
            {t.doc.untranslated}
          </p>
        )}

        {doc.sections.map((section) => (
          <DocSection key={section.id} section={section} lang={lang} t={t} />
        ))}
      </article>
    </CommunityShell>
  )
}

/* ------------------------------------------------------------------------- */
/* Sections                                                                  */
/* ------------------------------------------------------------------------- */

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
                    <p className="mt-3 border-l-2 border-amber-600/60 pl-3 text-sm">
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
                <div className="space-y-4">
                  {choice.options.map((option) => (
                    <div key={option.name} className="border-l-2 border-line/50 pl-4">
                      <p className="font-semibold text-ink">{option.name}</p>
                      <p className="mt-1 text-sm text-ink-muted">{option.when}</p>
                      {option.costs && (
                        <p className="mt-1 text-sm text-emerald-600">{option.costs}</p>
                      )}
                      {option.catch && <p className="mt-1 text-sm text-amber-600">{option.catch}</p>}
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
