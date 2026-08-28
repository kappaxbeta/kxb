import type { Metadata } from 'next'
import Link from 'next/link'
import { requireXpAccess } from '@/app/xp/gate'
import { playableAlone, readAudience, type Audience } from '@/app/xp/new/audience'
import { TEMPLATES } from '@kxb/xp'

/**
 * Starting one.
 *
 * There was no way to start an XP except to write JSON by hand and put it in
 * `public/xp/xps/`, which is fine for the four we ship and hopeless as a first
 * five minutes. The editor could only ever *open* something.
 *
 * ---------------------------------------------------------------------------
 * Three finished documents, not a blank one
 * ---------------------------------------------------------------------------
 * A blank XP is legal and useless: no ground, so the first thing it does is drop
 * you out of the bottom of your own level, and nothing in it shows that marks,
 * rules or capabilities exist. Each of these is complete and walkable, and small
 * enough that every piece in it is there to be moved.
 *
 * `/xp/new` shadows the `[id]` route for the literal id "new", which is fine -
 * a document called `new.xp.json` would be a document nobody could open here,
 * and that is a better trade than a longer path on the page people start from.
 *
 * ---------------------------------------------------------------------------
 * A question in front of the picker, and only one
 * ---------------------------------------------------------------------------
 * The wizard was asked for as *"movie, singleplayer, see templates"*.
 * docs/xp/backlog.md §1b takes that apart and the answer is in ./audience: a
 * movie is §8 rather than a kind of document, singleplayer is a people cap, and
 * only the templates are documents. So one question is asked, it is the one
 * that changes what gets built, and it has two answers rather than three.
 *
 * **The question filters as well as sets.** Answering "on your own" both writes
 * `rules.players` and takes the two-sided templates off the list, because a
 * capture-the-flag declared for one player is a document that parses and a game
 * that cannot be played - the worst of the two ways to be wrong.
 *
 * Unanswered is a state, not a redirect. The templates stay on the page under
 * the question, so somebody who knows what they want is one click from it and
 * nobody is made to answer a question about a level they have not seen yet.
 */

export const metadata: Metadata = {
  title: 'XP · Start one',
  robots: { index: false, follow: false },
}

const ANSWERS: { id: Audience; title: string; blurb: string }[] = [
  {
    id: 'one',
    title: 'On your own',
    blurb: 'A course, a room, something to time yourself against. The door only lets one in.',
  },
  {
    id: 'together',
    title: 'With other people',
    blurb: 'Sides, scores and somebody to lose to. Up to twenty-five in one level.',
  },
]

export default async function NewXpPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[] }>
}) {
  await requireXpAccess()

  const audience = readAudience((await searchParams).for)

  /**
   * Built to be read, not to be kept.
   *
   * `build` is a pure function over a literal - the sibling route's note says
   * there is nothing to save by caching one - and asking the document itself
   * whether it needs company is what keeps this list honest when a fifth
   * template arrives.
   */
  const offered = TEMPLATES.filter(
    (template) => audience !== 'one' || playableAlone(template.build('probe', 'Probe')),
  )

  return (
    <main className="dark min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          XP · start one
        </p>
        <h1 className="mt-2 text-2xl font-medium">Something to build on</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
          Each of these is a finished document rather than a skeleton — you can
          walk around in it before you change anything. Pick the one whose shape
          is closest and move its pieces.
        </p>

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Who is playing
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {ANSWERS.map((answer) => {
              const on = audience === answer.id
              return (
                <li key={answer.id}>
                  <Link
                    /*
                      The answer clears itself when it is pressed again, so the
                      question is askable a second time without a back button -
                      the same shape the blueprint list in the editor uses for
                      its open row.
                    */
                    href={on ? '/xp/new' : `/xp/new?for=${answer.id}`}
                    aria-pressed={on}
                    className={`flex h-full flex-col gap-1 rounded-lg border px-4 py-3 transition-colors ${
                      on
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <span className={`text-sm ${on ? 'text-violet-200' : 'text-neutral-200'}`}>
                      {answer.title}
                    </span>
                    <span className="text-xs leading-relaxed text-neutral-500">
                      {answer.blurb}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {audience === 'one' ? (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-neutral-600">
              The level is written for one — the two-sided templates are hidden,
              and the door turns away a second person rather than admitting them
              into a game with no seat for them. Changeable later, under Document.
            </p>
          ) : null}
        </section>

        <ul className="mt-8 space-y-3">
          {offered.map((template) => (
            <li key={template.id}>
              <Link
                href={
                  audience ? `/xp/new/${template.id}?for=${audience}` : `/xp/new/${template.id}`
                }
                className="group flex items-baseline gap-4 rounded-lg border border-neutral-800 px-4 py-3 transition-colors hover:border-violet-500/60"
              >
                <span className="text-sm text-neutral-200 group-hover:text-violet-200">
                  {template.name}
                </span>
                <span className="text-xs leading-relaxed text-neutral-500">
                  {template.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/*
          Said here rather than discovered at the save button: the editor's Save
          downloads a file, and where that file goes is how you decide the level
          is finished. Somebody who does not know that will assume their work is
          on a server somewhere.
        */}
        <p className="mt-8 max-w-xl font-mono text-[11px] leading-relaxed text-neutral-600">
          Your work autosaves in this browser as you go. Save downloads the
          document — put it in <code>public/xp/xps/</code> to keep it, which is
          also how you decide it is finished.
        </p>
      </div>
    </main>
  )
}
