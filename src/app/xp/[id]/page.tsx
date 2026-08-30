import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireXpAccess } from '@/app/xp/gate'
import { roomId } from '@/lib/xp-rooms'
import { XpScene } from '@/app/xp/_runtime/scene'
import { SceneDebug } from '@/app/xp/_runtime/hud/scene-debug'
import { readWornLook } from '@/domain/skins/queries'
import { createClient } from '@/lib/supabase/server'
import { describeProblems, parseXp, type XpProblem } from '@kxb/xp'
import {
  builtinOverride,
  readBuiltinDocument,
  readBuiltinOverlays,
} from '@/domain/xps/builtins'

/**
 * One XP, loaded from a file and played.
 *
 * ---------------------------------------------------------------------------
 * A file, not a row
 * ---------------------------------------------------------------------------
 * docs/xp/creator.md §3.1: an XP is a `.xp.json` for all of v1. No table, no
 * migration and no permission story, because this is an operator tool behind a
 * gate and there is nobody to share with. The file lives in `public/xp/xps/`
 * and is read here on the server rather than fetched by the browser, so a
 * document that does not parse is a page that says why instead of a canvas that
 * silently draws nothing.
 *
 * When the editor arrives it writes to `localStorage` and this route grows a
 * "load the draft instead" branch. When an XP eventually needs an audience it
 * grows the battlefield's shape - a stream for identity, the document as a
 * blob - and that is a decision to make with a specific XP in hand.
 */

const XPS = path.join(process.cwd(), 'public', 'xp', 'xps')

/** Only `[a-z0-9-]`, so an id cannot walk out of the directory it names. */
function safeId(id: string): string | null {
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null
}

async function load(id: string) {
  const safe = safeId(id)
  if (!safe) return null
  try {
    return JSON.parse(await readFile(path.join(XPS, `${safe}.xp.json`), 'utf8')) as unknown
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  try {
    const files = await readdir(XPS)
    return files
      .filter((f) => f.endsWith('.xp.json'))
      .map((f) => ({ id: f.slice(0, -'.xp.json'.length) }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  // Through the overlay, like the page below it. A tab still naming the shipped
  // level while the canvas draws the one somebody put in is the kind of small
  // disagreement that makes an operator distrust the whole surface.
  const document = await readBuiltinDocument(
    id,
    await readBuiltinOverlays(await createClient()),
  )
  return {
    title: document ? `${document.name} · XP` : 'XP',
    robots: { index: false, follow: false },
  }
}

export default async function XpPlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  /**
   * A workbench, and only a workbench.
   *
   * This route is the creator's own: open a document, walk around it, check that
   * a slope is walkable and a target is hittable. It is gated to an operator in
   * production and stays that way, because the people who *play* an XP never
   * come here - a match is played in the battle route, which imports the same
   * runtime and brings its own roster (`/t/<slug>/battle/<battleId>`).
   *
   * `?room=` still works, and it is what makes two tabs two players while a
   * level is being built. That is a development affordance rather than a way in:
   * everybody who can open this page can already open every document on it.
   */
  await requireXpAccess()

  const { id } = await params
  const query = await searchParams
  const room = roomId(first(query.room))
  /**
   * `?debug=1`, and the numbers a level author wants are on the screen.
   *
   * They exist already - `<SceneDebug>` in the rooms rail, fed by the store the
   * HUD publishes to - and a level opened *here* could not see any of them,
   * which is backwards: `/xp/<id>` is where a document is opened while it is
   * being worked on, and a room is where it is played. Somebody debugging a
   * level had the readout only if they happened to be inside a space.
   *
   * Behind a flag rather than always on, because this is the page a stranger is
   * handed a game on. Opt-in costs a query parameter and nothing else, and the
   * alternative - a collapsed panel in the corner of everybody's game - is the
   * compromise the readout was moved out of the scene to escape.
   */
  const debug = first(query.debug) === '1'

  /**
   * The document an operator dropped in over the shipped one, if there is one.
   *
   * `published` is deliberately *not* consulted here. This is the workbench, and
   * the reason a level gets taken off the shelf is usually that somebody needs
   * to go and stand in it - a page that refused to open an unlisted level would
   * make the switch a door the operator locked themselves behind. The store and
   * the picker are where unlisted means gone.
   */
  const override = builtinOverride(await readBuiltinOverlays(await createClient()), id)

  const raw = override ?? (await load(id))
  if (raw === null) notFound()

  const parsed = override ? { ok: true as const, document: override } : parseXp(raw)
  if (!parsed.ok) return <Refused id={id} problems={parsed.problems} />

  /**
   * Who else is here, if anybody.
   *
   * A signed-in person, because the Realtime topic is private and its policy is
   * `to authenticated` - a client with nobody behind it would be refused at the
   * transport, and the only difference checking here makes is that it is refused
   * before it tries.
   */
  const me = room ? await whoAmI() : null

  /**
   * The animal this player has chosen, off their profile.
   *
   * Read whether or not there is a room: being a fox is a fact about *you*, not
   * about who else is watching, so a level played alone draws you the same way
   * the lounge does. Null for a signed-out visitor, which falls back to the
   * built-in dummy - see `bodiesFor`.
   */
  const avatar = await myAvatar(null)

  return (
    /**
     * No background of its own, and a margin rather than the full viewport.
     *
     * The scene draws a *transparent* canvas so the page's own sky shows through
     * its feathered edge - which is exactly what an opaque `bg-neutral-950` here
     * threw away. The rounded frame was landing correctly and being painted over
     * by the one element above it, which is a good reminder that "make it
     * transparent" is only half the change: something has to be behind it.
     *
     * The height is the lounge's own, so the world sits *in* the page with a
     * band of it visible above and below rather than filling the window edge to
     * edge. Same reason the corners are round: a level here is a thing on a
     * page, not a window cut into one.
     */
    <main className="h-viewport-inset relative w-full">
      <XpScene
        xp={parsed.document}
        {...(room && me ? { room, me } : {})}
        {...(avatar ? { avatar } : {})}
      />
      {/*
        Over the level rather than beside it, because there is no beside here -
        this page is one canvas and no rail. Bottom left is the one corner the
        HUD leaves alone: the clock and score are top left, health and ammo
        bottom right, and the controls chip top right.
      */}
      {debug ? (
        <div className="pointer-events-auto absolute bottom-4 left-4 w-56 rounded-lg border border-white/10 bg-black/70 px-3 pb-2 backdrop-blur">
          <SceneDebug open />
        </div>
      ) : null}
    </main>
  )
}

/** A query parameter is a string or a list of them; a room is one string. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Whoever is signed in, as a player.
 *
 * The user id is the presence key, so it has to be the same string every tab of
 * the same person produces - which is exactly what an auth id is and exactly what
 * a generated one is not.
 */
async function whoAmI(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return {
    id: user.id,
    // Whatever they are called, and something rather than nothing: a nameless
    // body in a room is one nobody can refer to.
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split('@')[0] ??
      'Someone',
  }
}

/**
 * What this account wears, or null.
 *
 * The *profile's*, which is the same rows the lounge and the shop write - so
 * somebody who picked a penguin in their settings is a penguin here without
 * having chosen twice, and somebody who equipped a bought skin arrives in it.
 * `readWornLook` is where the precedence lives: skin over animal, animal over
 * dummy. Silent on failure rather than throwing: a body is the last thing
 * that should be able to stop a level loading.
 */
async function myAvatar(tenantId: string | null): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    /**
     * The space's answer if this level is being played in one, otherwise the
     * account's - a level reached at `/xp/<id>` with no room is nobody's
     * space, and the profile is the only answer there is.
     */
    return await readWornLook(supabase, user.id, tenantId)
  } catch {
    return null
  }
}

/**
 * A document that did not parse, with everything wrong with it.
 *
 * A page rather than a thrown error, because this is the screen somebody
 * hand-editing a document will see most often, and "six typos" is more useful
 * than "the first typo". It is the whole reason `parseXp` collects problems
 * instead of throwing on the first one.
 */
function Refused({ id, problems }: { id: string; problems: XpProblem[] }) {
  return (
    <main className="dark min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          XP · refused
        </p>
        <h1 className="mt-2 text-2xl font-medium">{id}.xp.json did not load</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          {problems.length} {problems.length === 1 ? 'problem' : 'problems'}. Each one is
          addressed, so it can be found in the file.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 font-mono text-[11px] leading-relaxed text-amber-300">
          {describeProblems(problems)}
        </pre>
      </div>
    </main>
  )
}
