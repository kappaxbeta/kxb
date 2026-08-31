import Link from 'next/link'

/**
 * The docs' shared frame: one sidebar, one set of building blocks.
 *
 * ---------------------------------------------------------------------------
 * The nav is data, and every page renders it itself
 * ---------------------------------------------------------------------------
 * A layout cannot know which page it is wrapping without going client-side for
 * `usePathname`, and an active-state underline is not worth the section's
 * first client bundle. So each page hands `DocsShell` its own slug, and the
 * sidebar is a server-rendered list with the current page lit and that page's
 * section anchors unfolded beneath it - the same shape every docs site
 * converges on, for the same reason: the reader sees where they are and what
 * else exists in one glance.
 *
 * The building blocks (`P`, `Pairs`, `Code`, …) live here rather than being
 * copied per page so that the docs cannot drift apart typographically - the
 * one way a hand-written docs section always dies.
 */

export const DOCS_NAV = [
  {
    group: 'Start here',
    pages: [{ slug: '', label: 'How to make an XP' }],
  },
  {
    group: 'The editor',
    pages: [
      { slug: 'editor', label: 'The window' },
      { slug: 'tools', label: 'Tools & building' },
      { slug: 'blueprints', label: 'Blueprints' },
      { slug: 'player', label: 'The player' },
      { slug: 'flow', label: 'The flow editor' },
      { slug: 'animator', label: 'The animator' },
      { slug: 'words', label: 'Words & translation' },
    ],
  },
  {
    group: 'Reference',
    pages: [
      { slug: 'rules', label: 'Rules & verbs' },
      { slug: 'scripts', label: 'The script API' },
      { slug: 'p5', label: 'p5.js sketches' },
    ],
  },
] as const

export type DocSection = { id: string; label: string }

function pageHref(slug: string) {
  return slug ? `/create/xp/docs/${slug}` : '/create/xp/docs'
}

/** The nav flattened, which is what prev/next is asked against. */
const FLAT_PAGES: readonly { slug: string; label: string }[] = DOCS_NAV.flatMap((group) => [
  ...group.pages,
])

/**
 * Three columns, the shape the Tailwind docs settled on and for their
 * reasons: the left column answers "what else exists", the right answers
 * "where am I on this page", and folding the second into the first makes
 * both questions harder to answer at a glance. The right column only exists
 * past `xl` - on anything narrower it is the first thing worth losing.
 */
export function DocsShell({
  current,
  sections,
  children,
}: {
  /** The current page's slug in DOCS_NAV ('' for the index). */
  current: string
  /** This page's anchor list, shown as "On this page" in the right column. */
  sections?: readonly DocSection[]
  children: React.ReactNode
}) {
  const index = FLAT_PAGES.findIndex((page) => page.slug === current)
  const previous = index > 0 ? FLAT_PAGES[index - 1] : undefined
  const next = index >= 0 && index < FLAT_PAGES.length - 1 ? FLAT_PAGES[index + 1] : undefined

  return (
    <main className="mx-auto flex max-w-6xl gap-10 px-6 py-12">
      <aside className="hidden w-52 shrink-0 lg:block">
        <nav className="sticky top-24 space-y-6">
          {DOCS_NAV.map((group) => (
            <div key={group.group}>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
                {group.group}
              </p>
              <ul className="mt-2 space-y-0.5 border-l border-line/60 text-sm">
                {group.pages.map((page) => {
                  const active = page.slug === current
                  return (
                    <li key={page.slug}>
                      <Link
                        href={pageHref(page.slug)}
                        aria-current={active ? 'page' : undefined}
                        className={
                          active
                            ? '-ml-px block border-l border-accent py-1 pl-4 font-medium text-ink'
                            : '-ml-px block border-l border-transparent py-1 pl-4 text-ink-muted transition-colors hover:border-accent hover:text-ink'
                        }
                      >
                        {page.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 flex-1 pb-16">
        {children}

        {/* Prev / next: the reading order is the sidebar's order, said again
            at the moment the reader actually needs it - the bottom. */}
        {(previous || next) && (
          <nav className="mt-16 flex gap-4 border-t border-line/40 pt-6 text-sm">
            {previous && (
              <Link
                href={pageHref(previous.slug)}
                className="group flex-1 rounded-xl border border-line/60 p-4 transition-colors hover:border-accent/60"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-muted">
                  ← Previous
                </span>
                <span className="mt-1 block font-medium text-ink-muted transition-colors group-hover:text-ink">
                  {previous.label}
                </span>
              </Link>
            )}
            {next && (
              <Link
                href={pageHref(next.slug)}
                className="group flex-1 rounded-xl border border-line/60 p-4 text-right transition-colors hover:border-accent/60"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-muted">
                  Next →
                </span>
                <span className="mt-1 block font-medium text-ink-muted transition-colors group-hover:text-ink">
                  {next.label}
                </span>
              </Link>
            )}
          </nav>
        )}
      </article>

      {sections && sections.length > 0 && (
        <aside className="hidden w-48 shrink-0 xl:block">
          <nav className="sticky top-24">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-2">
              On this page
            </p>
            <ul className="mt-2 space-y-0.5 border-l border-line/60 text-[11px]">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-4 leading-snug text-ink-muted transition-colors hover:border-accent-2 hover:text-ink"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </main>
  )
}

/* --- building blocks ------------------------------------------------------ */

export function DocTitle({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <header>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">{kicker}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h1>
    </header>
  )
}

export function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  /* `scroll-mt` clears the sticky nav, or every anchor lands with its heading
     hidden underneath it. */
  return (
    <section id={id} className="mt-12 scroll-mt-24 border-t border-line/40 pt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{children}</p>
}

/** Inline emphasis for the word the sentence turns on. */
export function Em({ children }: { children: React.ReactNode }) {
  return <em className="not-italic text-ink">{children}</em>
}

export function C({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-sm text-ink">{children}</code>
}

export function K({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line/60 bg-surface-raised/60 px-1.5 py-0.5 font-mono text-[11px] text-ink">
      {children}
    </kbd>
  )
}

type CodeLang = 'js' | 'data' | 'rules'

/**
 * Server-side syntax colour, three token kinds and no dependency.
 *
 * One alternation walked left to right: comments, then strings, then numbers,
 * then the language's keywords - order matters, because a string inside a
 * comment is a comment. The palette is the site's two neons doing the same
 * jobs they do everywhere else: fuchsia for the words that act, cyan for the
 * values. Anything fancier (scopes, member access, nesting) is a code editor's
 * job, and these are readings, not editors.
 */
function highlight(source: string, lang: CodeLang): React.ReactNode[] {
  const keywords =
    lang === 'js'
      ? /\b(?:const|let|var|function|return|if|else|for|while|of|in|new|typeof|true|false|null|undefined)\b/
      : lang === 'data'
        ? /\b(?:true|false|null)\b/
        : /\b(?:on|when|do|allow|next|does|go|wins)(?=:)/
  const pattern = new RegExp(
    [
      String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)`, // 1: comment
      String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`, // 2: string
      String.raw`(-?\b\d+(?:\.\d+)?\b)`, // 3: number
      `(${keywords.source})`, // 4: keyword
    ].join('|'),
    'g',
  )

  const out: React.ReactNode[] = []
  let last = 0
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) out.push(source.slice(last, match.index))
    const [text, comment, string, number, keyword] = match
    if (comment) out.push(<span key={match.index} className="text-ink-muted/80">{text}</span>)
    else if (string) out.push(<span key={match.index} className="text-accent-2">{text}</span>)
    else if (number) out.push(<span key={match.index} className="text-accent-2">{text}</span>)
    else if (keyword) out.push(<span key={match.index} className="text-accent">{text}</span>)
    last = match.index + text.length
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

export function Code({
  children,
  lang = 'js',
  title,
}: {
  children: string
  lang?: CodeLang
  title?: string
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-line/60 bg-surface-raised/40">
      {title && (
        <p className="border-b border-line/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-muted">
          {title}
        </p>
      )}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-ink">{highlight(children, lang)}</code>
      </pre>
    </div>
  )
}

/** A two-column term/definition table, the docs' most common shape. */
export function Pairs({
  rows,
}: {
  rows: readonly (readonly [React.ReactNode, React.ReactNode])[]
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line/60">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line/40">
          {rows.map(([term, body], index) => (
            <tr key={index} className="align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium">{term}</td>
              <td className="px-4 py-2.5 leading-relaxed text-ink-muted">{body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type FigureMarker = { x: number; y: number; label: React.ReactNode }

/**
 * A screenshot with numbered markers and a legend.
 *
 * The numbers are HTML positioned over the image in percentages rather than
 * baked into the pixels: they stay sharp at any size, they can be edited
 * without re-shooting, and the legend text under the figure is real text a
 * reader can search and a screen reader can read. Marker badges repeat in the
 * legend so the eye can travel both ways.
 */
export function AnnotatedFigure({
  src,
  alt,
  width,
  height,
  caption,
  markers,
}: {
  src: string
  alt: string
  width: number
  height: number
  caption?: string
  markers: readonly FigureMarker[]
}) {
  return (
    <figure className="mt-6">
      <div className="relative overflow-hidden rounded-xl border border-line/60 bg-surface-raised/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>:
            next/image would need per-call sizes for zero gain on a local,
            already-compressed webp */}
        <img src={src} alt={alt} width={width} height={height} className="h-auto w-full" />
        {markers.map((marker, index) => (
          <span
            key={index}
            aria-hidden
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-surface shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
          >
            {index + 1}
          </span>
        ))}
      </div>
      <figcaption className="mt-3">
        {caption && (
          <p className="max-w-2xl font-mono text-[11px] leading-relaxed text-ink-muted">
            {caption}
          </p>
        )}
        <ol className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
          {markers.map((marker, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-surface">
                {index + 1}
              </span>
              <span>{marker.label}</span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}

/**
 * The "how it works" flow: labelled boxes joined by arrows, drawn with markup
 * rather than an image so it reflows on a phone and follows the theme.
 */
export function Flow({
  steps,
}: {
  steps: readonly { title: string; body: string }[]
}) {
  return (
    <div className="mt-6 flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
      {steps.map((step, index) => (
        <div key={step.title} className="contents">
          {index > 0 && (
            <span
              aria-hidden
              className="self-center font-mono text-lg text-accent-2 max-lg:rotate-90"
            >
              →
            </span>
          )}
          <div className="flex-1 rounded-xl border border-line/60 bg-surface-raised/40 p-4">
            <p className="text-sm font-medium">{step.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{step.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** A table with a header row, for the reference pages. */
export function Grid({
  head,
  rows,
}: {
  head: readonly React.ReactNode[]
  rows: readonly (readonly React.ReactNode[])[]
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/60 text-left">
            {head.map((cell, index) => (
              <th key={index} className="px-4 py-2.5 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/40">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 leading-relaxed text-ink-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
