import type { Metadata } from 'next'
import Link from 'next/link'
import { TEMPLATES } from '@kxb/xp'
import { NewProjectForm } from '@/app/t/[slug]/browse/new/new-project-form'
import { requireFeature, requireTenant, requireTier } from '@/lib/tenant'
import { browseDict } from '@/app/i18n/browse'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: browseDict(await readLocale()).create.title }
}

export const dynamic = 'force-dynamic'

/**
 * A name, and what it starts as.
 *
 * The temptation on a "new project" screen is to ask for everything the store
 * page will eventually want — a blurb, a cover, a visibility. Every one of
 * those is a question somebody cannot answer yet, because they have not made
 * the thing. Asking them at the start turns a two-second decision into a form,
 * and a form is where an idea goes to be reconsidered.
 *
 * The template is the exception, and this is the screen for it. The editor's
 * own note says so — it opens a never-saved project on an empty room and calls
 * anything more "a template, and templates are a thing somebody chooses" — so
 * the choice belongs here, at the one moment it is free. Afterwards it is not:
 * a template swapped on day two is a level thrown away.
 *
 * Empty stays the first option rather than the only one. It is the honest
 * answer for somebody who already knows what they are building, and picking it
 * costs one click — which is the price of making the other four visible to
 * everybody who does not.
 *
 * `TEMPLATES` is read here rather than in the form so the client is handed
 * three strings per option instead of the whole `@kxb/xp` document builder —
 * the picker needs a label, and `build()` runs on the way into the editor.
 */
export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ engine?: string | string[] }>
}) {
  const { slug } = await params
  // The studio's "XP p5.js" door arrives with its answer to the engine
  // pills already given; anything else falls back to the default.
  const wanted = (await searchParams).engine
  const engine = wanted === 'p5' ? ('p5' as const) : ('xp' as const)

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  /*
    `xo`, matching the shelf this is reached from. How many projects the plan
    allows is `projectsFull`'s to answer and it answers on submit, with the
    number in words - which is the right shape for a cap: the form is the wall
    docs/product/pricing.md §8 names, and a wall says why.
  */
  requireTier(context, 'xo')

  const t = browseDict(await readLocale()).create

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <p className="text-sm">
        <Link href={`/t/${slug}/browse`} className="text-ink-muted transition hover:text-ink">
          ← Browse
        </Link>
      </p>

      <h1 className="mt-6 font-pixel text-2xl uppercase leading-tight">{t.title}</h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {t.blurbLead} <span className="text-ink">{context.tenant.name}</span>
        {t.blurbTail}
      </p>

      <NewProjectForm
        slug={slug}
        engine={engine}
        /*
          The package's English, overlaid with the reader's language where the
          dictionary has it. A starter it has never heard of keeps the name
          `TEMPLATES` gives it, which is the same promise `t()` makes a level.
        */
        templates={TEMPLATES.map(({ id, name, blurb, engine }) => ({
          id,
          ...(t.templates[id] ?? { name, blurb }),
          // Not translated: it is the engine's own name, and the badge is
          // there so the two kinds of project cannot be mistaken for each
          // other on this screen.
          ...(engine ? { engine } : {}),
        }))}
      />
    </main>
  )
}
