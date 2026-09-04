import { ContestDocument } from '@/app/gewinnspiel/document'
import { contestMetadata } from '@/app/gewinnspiel/metadata'

/**
 * The binding version of the contest conditions, at the bare path.
 *
 * German sits here rather than under `/gewinnspiel/de` for the same reason the
 * Impressum does: it is the document, and the other four are translations of
 * it. The URL has also already gone out in a post, which is the sort of thing
 * that stops being a preference and becomes a fact.
 *
 * The prose is in `copy/de.tsx`, the pictures are in `intro.tsx`, and the notes
 * on why individual clauses read the way they do are in the German copy file.
 */
/**
 * Rendered per request, because the facts on it are a row and the build cannot
 * read rows.
 *
 * This page was prerendered for as long as its dates and amounts were constants
 * in `contest.ts`. `contest_settings` moved them into the database so that
 * running a campaign stops being a deploy - and a page baked at build time gets
 * the opposite of that: the image build has no `SUPABASE_SERVICE_ROLE_KEY` (see
 * `readContestSettings`), so every prerender would freeze the six documents at
 * `CONTEST_DEFAULTS` until somebody happened to press Save in the backoffice.
 * A legal deadline that reverts on deploy is worse than one rendered per
 * request, and this is a contest page read a few thousand times, not a feed.
 *
 * The backoffice's `revalidatePath` calls are now belt to this braces: harmless
 * where nothing is cached, and still correct if this ever goes back to static.
 */
export const dynamic = 'force-dynamic'

/*
  `generateMetadata` rather than a `metadata` constant, because the card quotes
  the contest's facts and those are a row now. Same output, one await later.
*/
export function generateMetadata() {
  return contestMetadata('de')
}

export default function GewinnspielPage() {
  return <ContestDocument locale="de" />
}
