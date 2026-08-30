import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  describeProblems,
  parseXp,
  templateById,
  type Finish,
  type XpDocument,
  type XpProblem,
} from '@kxb/xp'
import { SpaceEditor, type OpeningClaim } from '@/app/t/[slug]/studio/xp/[xpId]/editor-client'
import { FixedSurface } from '@/app/xp/fixed'
import { mayDo } from '@/domain/xps/access'
import { RENEW_SECONDS, takeClaim } from '@/domain/xps/claims'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import type { XpEvent } from '@/domain/xps/events'
import { readGrant } from '@/domain/xps/grants'
import { xpsProjection } from '@/domain/xps/projection'
import { findXpProject, readXpVersion } from '@/domain/xps/queries'
import { runProjection } from '@/es/projection'
import { loadStream } from '@/es/store'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict, type WorkspaceDict } from '@/app/i18n/workspace'

export const dynamic = 'force-dynamic'

/**
 * The page held still, same as `/xp/<id>/edit`.
 *
 * The editor mounted here is the one from `src/app/xp/_editor`, but this route
 * lives under `/t/[slug]` and so gets none of what `src/app/xp/layout.tsx`
 * declares - which is exactly how "the editor doesn't scroll any more" stayed
 * true on one of its two doors and not the other: on a phone a pinch over the
 * stage zoomed the page, and once zoomed every drag panned it. Next resolves
 * `viewport` per segment, so this export covers the editor and leaves the rest
 * of the workspace - pages made of text, where zoom is an affordance - alone.
 * See the notes on the `/xp` layout for why both fields, and `FixedSurface`
 * below for the Safari half a meta tag cannot express.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

/**
 * The tab, and the one instruction a crawler gets.
 *
 * `generateMetadata` because the title is two languages now. The editor is a
 * working surface behind a membership: there is nothing to index, and a URL
 * with a project id in it is not a thing to spread.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: workspaceDict(await readLocale()).studio.metaEditor,
    robots: { index: false, follow: false },
  }
}

/**
 * The editor, in the space's Studio.
 *
 * ---------------------------------------------------------------------------
 * Why Studio and not its own tab
 * ---------------------------------------------------------------------------
 * Studio is already where things get *made* here — scenes, stills, videos — and
 * a project is the same act at a larger size. Browse is where work is found and
 * decided about; this is where it is built. Two verbs, two places, and putting
 * the editor under Browse would have made that page both.
 *
 * ---------------------------------------------------------------------------
 * What loads, and what deliberately does not
 * ---------------------------------------------------------------------------
 * The **current** version, always — never `published_version`. The editor edits
 * the draft, and a project whose live release is v4 while the author is on v6
 * must open on v6 or the next save would silently revert two versions of work.
 *
 * A project with nothing saved opens on a starter document rather than
 * refusing. `createXp` mints a project before there is anything in it, which is
 * the right order — a name is the only thing that has to exist before the
 * editor can open — and this is the other half of that decision.
 */
export default async function SpaceEditorPage({
  params,
}: {
  params: Promise<{ slug: string; xpId: string }>
}) {
  const { slug, xpId } = await params

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  /*
    No tier gate, for the reason `spaceCanHold` gives: the editor opens a
    project that exists, and only `mayDo(…, 'edit')` below decides that. It
    used to ask for `xp` here as well, which would now turn away an xo space
    holding the three projects its plan allows.
  */

  /**
   * Caught up before it is looked up.
   *
   * The row this page opens is a projection of the log, and a projection can
   * be behind it: the inline run after `createXp` is one request, and a
   * request can fail, race a concurrent write, or be cut off - after which
   * nothing re-runs it until the next *write* in this space. It happened: a
   * project was minted, the redirect landed here, and the editor said 404 to
   * the person who had just named the thing, because the read model had
   * stopped two events short and every page about projects only ever read it.
   *
   * So this page does what the rooms, the chat and the battle pages already
   * do at their door - a run of the projection, which is a no-op when it is
   * current and the missing row when it is not. As the viewer, under RLS,
   * like every other inline run.
   */
  await runProjection(context.supabase, xpsProjection, context.tenant.id)

  const project = await findXpProject(context.supabase, xpId)
  if (!project || project.tenantId !== context.tenant.id) notFound()

  const verdict = mayDo(project, 'edit', {
    accountId: context.user.id,
    space: context,
    grant: await readGrant(context.supabase, xpId, context.user.id),
    operator: false,
  })
  /**
   * A 404 rather than the reason.
   *
   * The project page says why in words and is the right place to read it —
   * "this space is on xo" belongs beside the plan, not on a blank editor. This
   * route only has to refuse, and refusing without confirming the id exists is
   * the same posture every other gated surface here takes.
   */
  if (!verdict.allowed) notFound()

  const opened = await openingDocument(context.supabase, context.tenant.id, project)
  /**
   * A document that will not parse gets its reasons, not the 404 above.
   *
   * The 404 for a refusal is right and this is not one: whoever is reading this
   * has already been told yes by `mayDo`, and the thing in their way is their
   * own file. A blank not-found for that is the worst screen in the app - it
   * says the project is gone when it is sitting in the table, and the only way
   * to the actual reason was a database session. This costs one component.
   */
  if (opened.at === 'unreadable') {
    return (
      <Unreadable
        name={project.name}
        problems={opened.problems}
        backHref={`/t/${slug}/browse/${xpId}`}
        t={workspaceDict(await readLocale()).studio}
      />
    )
  }
  if (opened.at === 'missing') notFound()
  const document = opened.document

  /**
   * The claim is taken here, during the render, rather than by the editor on
   * mount.
   *
   * Two things follow, and both are the reason. There is no moment where a
   * working editor is on screen before anybody knows whether this person may
   * type into it — which matters because a read-only 3D editor is
   * indistinguishable from a writable one until you try to save. And there is
   * no "asking…" state to design, because by the time anything renders the
   * answer is already known.
   */
  const outcome = await takeClaim(context.supabase, xpId, context.user.id)

  const opening: OpeningClaim = outcome.ok
    ? { at: 'held', renewSeconds: RENEW_SECONDS }
    : {
        at: 'taken',
        // A name, because "held by 8f3c-…" is "no" with extra characters, and
        // in a space of four people knowing it is Ana usually settles it
        // without us.
        by: displayNameFrom(
          await readUsernames(context.supabase, [outcome.heldBy]),
          outcome.heldBy,
        ),
        freeAt: outcome.expiresAt,
      }

  return (
    <>
      <FixedSurface />
      <SpaceEditor
        xpId={xpId}
        slug={slug}
        name={project.name}
        document={document}
        base={project.currentVersion}
        backHref={`/t/${slug}/browse/${xpId}`}
        opening={opening}
      />
    </>
  )
}

/**
 * What the editor opens on.
 *
 * The saved document goes back through `parseXp` rather than being cast. It
 * came out of a `jsonb` column, which means it was valid when it went in and
 * says nothing about whether it still is — the format moves, and a document
 * written against last month's parser is exactly the input this check exists
 * for. Refusing to open is better than opening something the editor will
 * throw on halfway through a render.
 *
 * A project with nothing saved opens on what was picked when it was made, and
 * `startedFrom` is how that answer gets here.
 */
async function openingDocument(
  supabase: Awaited<ReturnType<typeof requireTenant>>['supabase'],
  tenantId: string,
  project: { id: string; name: string; currentVersion: number },
): Promise<Opened> {
  if (project.currentVersion === 0) {
    const started = await startedFrom(supabase, tenantId, project.id)
    const template = started.template ? templateById(started.template) : null
    // `build` throws if what it produces would not parse, and a template that
    // does not parse is a bug in `templates.ts` rather than an editor that
    // should quietly open on something else. The empty room is the answer for
    // *no* template, not for a broken one.
    const document = template ? template.build('draft', project.name) : blank(project.name)
    if (!document) return { at: 'missing' }

    /*
      The shell the author picked on the create form, stamped on here.

      Spread rather than assigned, and only when there is something to say: the
      whole point of both fields being optional is that a document which never
      had an opinion carries no key - see `readFinish`. A starter that
      materialised `plastic` would put a line in the first diff of every project
      anybody makes.

      This is also the moment the choice stops living in the log. From the first
      save it is in the document, which is the only place anything else reads.
    */
    return {
      at: 'open',
      document: {
        ...document,
        ...(started.finish ? { finish: started.finish } : {}),
        ...(started.hue === undefined ? {} : { hue: started.hue }),
      },
    }
  }

  const saved = await readXpVersion(supabase, project.id, project.currentVersion)
  // A version the row says exists and the table does not have. Nothing to say
  // about that in words, and nothing an author can do with it either.
  if (!saved) return { at: 'missing' }

  const parsed = parseXp(saved.document)
  return parsed.ok
    ? { at: 'open', document: parsed.document }
    : { at: 'unreadable', problems: parsed.problems }
}

/**
 * The three answers, because two of them are not the same "no".
 *
 * `missing` is the route being wrong about what exists; `unreadable` is the
 * document being behind the parser, which is a sentence somebody can act on and
 * is the whole reason this is not a boolean.
 */
type Opened =
  | { at: 'open'; document: XpDocument }
  | { at: 'missing' }
  | { at: 'unreadable'; problems: XpProblem[] }

/**
 * The screen for a project the parser will not open.
 *
 * Deliberately plain, and deliberately not the editor with an error in it: the
 * editor holds a claim and saves what it is holding, so putting one on screen
 * over a document it could not read is how a repair becomes an overwrite.
 *
 * The problems are printed as they are. `describeProblems` addresses each one at
 * the field that caused it, which is the same text an export would be debugged
 * with - and an author who has this on screen is one message away from somebody
 * who can read it.
 */
function Unreadable({
  name,
  problems,
  backHref,
  t,
}: {
  name: string
  problems: XpProblem[]
  backHref: string
  /** Resolved by the page. A server component, so there is no context to read. */
  t: WorkspaceDict['studio']
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {t.refusedLabel}
      </p>
      <h1 className="mt-2 text-2xl font-medium">{fill(t.refusedTitle, { name })}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t.refusedBody}{' '}
        {problems.length === 1 ? t.oneProblem : t.manyProblems}
      </p>
      <pre className="mt-6 overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-[11px] leading-relaxed">
        {describeProblems(problems)}
      </pre>
      <Link
        href={backHref}
        className="mt-6 inline-block text-sm underline underline-offset-4 hover:no-underline"
      >
        {t.backToProject}
      </Link>
    </main>
  )
}

/**
 * What the create form said, off the log rather than a column.
 *
 * `XpCreated` has carried `template` since the picker on `browse/new` was
 * written, and the read model deliberately does not: one screen needs it, once,
 * on the one path where nothing has been saved yet — and a column would be a
 * migration, a `COLUMNS` entry and a projection branch to answer a question
 * that stops being asked the moment somebody presses Save. `queries.ts` says
 * what the cost of a `COLUMNS` entry is: the schema and the image reach
 * production by separate hands, and the space library is a five-hundred in
 * between.
 *
 * Reading the stream costs one query on a stream that is one event long, and it
 * is the same stream the next command will load anyway.
 *
 * The cartridge's finish and colour ride along for exactly the same reason and
 * are answered by the same read: they were chosen on the create form, before
 * there was a document to hold them, and this is the render that finally has
 * one to put them in.
 */
async function startedFrom(
  supabase: Awaited<ReturnType<typeof requireTenant>>['supabase'],
  tenantId: string,
  xpId: string,
): Promise<{ template: string | null; finish?: Finish; hue?: number }> {
  const events = await loadStream<XpEvent>(supabase, tenantId, xpId)
  const created = events.find((event) => event.type === 'XpCreated')
  if (!created) return { template: null }

  return {
    template: created.data.template ?? null,
    ...(created.data.finish ? { finish: created.data.finish } : {}),
    // A presence check, because zero is red.
    ...(created.data.hue === undefined ? {} : { hue: created.data.hue }),
  }
}

/**
 * An empty room, for a project started from no template at all.
 *
 * Deliberately nearly nothing: a floor to stand on and somewhere to arrive.
 * Anything more is a template, and the picker on `browse/new` is where those
 * are chosen — this is what it means to have declined them.
 *
 * The name is the project's, not "Untitled", because the editor puts the
 * document's name on the screen and the project already has one somebody typed.
 */
function blank(name: string): XpDocument | null {
  const parsed = parseXp({
    format: 'xp/1',
    id: 'draft',
    name,
    packs: [{ id: 'proto' }],
    capabilities: ['freeplay'],
    spawn: { x: 0, y: 1, z: 2, facing: 180 },
    blueprints: {},
    entities: [],
    world: { floorY: 0, ground: true, placements: [], marks: [] },
  })
  return parsed.ok ? parsed.document : null
}
