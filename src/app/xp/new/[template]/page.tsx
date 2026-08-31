import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditorClient } from '@/app/xp/_editor/shell/client'
import { SketchEditorClient } from '@/app/xp/_sketch/editor/client'
import { requireXpAccess } from '@/app/xp/gate'
import { forOnePlayer, readAudience } from '@/app/xp/new/audience'
import { templateById } from '@kxb/xp'

/**
 * A new XP, built from a template.
 *
 * The sibling route reads a `.xp.json` off disk; this one builds a document in
 * memory instead. Everything downstream is identical, deliberately: the editor
 * takes a *parsed* document either way, so nothing in it has to know whether
 * what it is holding came from a file or from a function.
 *
 * ---------------------------------------------------------------------------
 * The id is the template's, and that is a decision
 * ---------------------------------------------------------------------------
 * A fresh document needs an id before it has a name, because the id is what the
 * draft autosaves under (`xp:draft:<id>`) and what Save names the download. The
 * options were a random one, a typed one, or the template's.
 *
 * The template's, because the other two are both worse in the same way. A random
 * id means somebody who closes the tab cannot find their draft again - the key
 * is gone and nothing on the page ever showed it. A typed one puts a form
 * between a person and the thing they came to do, to answer a question they do
 * not have an opinion about yet.
 *
 * What it costs is that two new races share a draft. That is the honest trade:
 * the draft is a safety net for the tab you are in, not storage, and the moment
 * a level is worth keeping it is a file on disk with whatever name you gave it.
 */

export const metadata: Metadata = {
  title: 'XP · New',
  robots: { index: false, follow: false },
}

export default async function NewFromTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ template: string }>
  searchParams: Promise<{ for?: string | string[] }>
}) {
  await requireXpAccess()

  const { template: id } = await params
  const audience = readAudience((await searchParams).for)
  const template = templateById(id)
  // Not a 500 and not a blank editor: an id nobody wrote is a URL somebody
  // typed or a link that has rotted, and both are a missing page.
  if (!template) notFound()

  /**
   * Built here rather than memoised anywhere.
   *
   * `build` throws if what it produces would not parse, so a broken template
   * fails on this page with a stack pointing at the template rather than
   * handing the editor half a document. It is three dozen placements; there is
   * nothing to save by caching it.
   */
  const built = template.build(`new-${template.id}`, template.name)

  /**
   * The wizard's one question, answered into the document.
   *
   * Applied here rather than in the picker because this is where the document
   * comes into being, and a cap written anywhere else would be a second place
   * that decides what "on your own" means. `together` writes nothing at all:
   * absent already means as many as the transport will carry, and a document
   * that said so would be a document carrying a field its author never chose -
   * the same trade `isDefaultRules` makes on every other rules field.
   */
  const document = audience === 'one' ? forOnePlayer(built) : built

  // A sketch template opens in the project view, same fork as `[id]/edit`.
  if (document.sketch) {
    return <SketchEditorClient id={`new-${template.id}`} document={document} />
  }

  return <EditorClient id={`new-${template.id}`} document={document} />
}
