import 'server-only'
import { describeNeed, type HostCapability } from '@kxb/xp/host'
import { projectCover } from '@/domain/xps/covers'
import type { Shell, XpProjectRow } from '@/domain/xps/queries'
import type { ProjectCartridge } from '@/app/t/[slug]/browse/project-shelf'
import type { BrowseDict } from '@/app/i18n/browse'
import type { XpDict } from '@/app/i18n/xp'
import { fill as fillWords } from '@/app/i18n/fill'

/**
 * A project row, turned into the cartridge a shelf can draw.
 *
 * Its own module because two pages draw the same shelf now - the workbench and
 * the studio - and a project that said `v3 · v2 live` on one and something
 * else on the other would be exactly the drift the studio's own comment warns
 * about when it explains why its games list is the same query as /browse's.
 *
 * Server-only, and that is what keeps the split honest: `projectCover` reads
 * the filesystem rule for where a cover lives, so this cannot accidentally be
 * imported into the client half and start composing strings twice.
 */

/**
 * A project, as the cartridge the shelf draws.
 *
 * Every string is finished here rather than in the client component, which is
 * the whole reason this function exists: the shelf is already paying for a
 * WebGL context, and shipping `describeNeed` and two dictionaries into the
 * browser to reassemble sentences that never change afterwards is a second
 * bill for nothing.
 */
export function cartridgeOf(
  project: XpProjectRow,
  href: string,
  needs: Map<string, readonly HostCapability[]>,
  shells: Map<string, Shell>,
  t: BrowseDict,
  needWords: XpDict['needs'],
): ProjectCartridge {
  const word = STATE_WORDS[project.state]
  const asked = needs.get(project.id) ?? []

  /*
    The saved version and the live one, which are different questions.

    A draft moves and the store does not: somebody who has saved four times
    since publishing needs to see both numbers, and somebody who has not needs
    to see one. The card made this argument first; the wording is its.
  */
  const version =
    project.currentVersion === 0 ? t.neverSaved : `v${project.currentVersion}`
  const live =
    project.publishedVersion !== null && project.publishedVersion !== project.currentVersion
      ? ` · ${fillWords(t.liveVersion, { v: project.publishedVersion })}`
      : ''

  return {
    id: project.id,
    name: project.name,
    blurb: project.blurb,
    cover: projectCover(project.id, project.coverPath),
    finish: shells.get(project.id)?.finish ?? null,
    hue: shells.get(project.id)?.hue ?? null,
    href,
    facts: `${version}${live}`,
    badge: word ? t.states[word] : project.state,
    needs: asked.map((need) => describeNeed(need, needWords)).join(' · '),
  }
}

/**
 * Which word each state wears.
 *
 * Lifted off the project card, which owned it while it was the only thing
 * drawing a project. Its tone table did not come with it: a cartridge is
 * already lit in its own colour and does not want a second one.
 */
const STATE_WORDS: Record<string, keyof BrowseDict['states']> = {
  draft: 'draft',
  submitted: 'review',
  published: 'live',
  unlisted: 'takenDown',
  removed: 'removed',
  archived: 'archived',
}
