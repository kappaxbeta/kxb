import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Code } from '@/app/create/xp/docs/shell'

/**
 * The shooter, taken apart.
 *
 * ---------------------------------------------------------------------------
 * Written from the document, not about it
 * ---------------------------------------------------------------------------
 * Every number and every rule quoted on this page is copied out of
 * `public/xp/xps/shooter.xp.json` - the same file the runtime plays and the
 * home page's screenshot is drawn from. That is the discipline the whole
 * showcase runs on: if the document changes, this page is wrong and should be
 * corrected from it, never the other way round. A walkthrough that drifts
 * from its game is worse than no walkthrough, because it teaches with
 * confidence things that are no longer true.
 *
 * The order is the order a reader could rebuild it in - gun, targets, the
 * respawn trick, the two scripts, the pickups - not the order the file lists
 * things, which is alphabetical and pedagogically nothing.
 */

export const metadata: Metadata = {
  title: 'How the shooter is made',
  description:
    'A range on two floors, taken apart rule by rule: targets that get back up without a script, a runner on a clock, a mine that comes looking for you, and what each one scores.',
}


function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{children}</p>
}

function Em({ children }: { children: React.ReactNode }) {
  return <em className="not-italic text-ink">{children}</em>
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 border-t border-line/40 pt-10 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  )
}

export default function ShooterShowcasePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <article className="pb-16">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Showcase · Shooter
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            How the shooter is made
          </h1>
          <P>
            A range you have to move around: forty cells on two floors, a gallery of targets that
            get back up, two that run, a bunker you shoot into through a window, and mines that come
            looking for you. Fifty-seven things, three short scripts, and{' '}
            <Em>no shooter code anywhere in the engine</Em> — everything on this page is a rule or a
            script in one document.
          </P>
        </header>

        <figure className="mt-10">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line/60 bg-surface-raised/40">
            <Image
              src="/xp/shots/shooter.png"
              alt="A prototype arena on two floors: a catwalk down one side, a gallery of targets on the far wall, breakable cover, crates and barrels"
              width={900}
              height={900}
              className="h-auto w-full"
              priority
            />
          </div>
          <figcaption className="mx-auto mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-ink-muted">
            The document, drawn by the software rasteriser the tests use — a picture of the file,
            not a screenshot of a good moment.
          </figcaption>
        </figure>

        <H2>The gun is two properties</H2>
        <P>
          The player&apos;s body is a blueprint called <Em>marksman</Em> with{' '}
          <code className="font-mono text-sm text-ink">hp: 100</code> and{' '}
          <code className="font-mono text-sm text-ink">ammo: 30</code>, and the pistol hangs on its
          hand socket. What makes the pistol a weapon and not a prop is nothing but its properties —{' '}
          <code className="font-mono text-sm text-ink">damage: 25</code> and{' '}
          <code className="font-mono text-sm text-ink">range: 60</code>, read when the trigger is
          pulled. Ammo lives on the player rather than the gun, which is what lets an ammo box hand
          rounds to whoever walks in.
        </P>

        <H2>A target is one rule</H2>
        <P>
          The basic gallery target has <code className="font-mono text-sm text-ink">hp: 100</code>{' '}
          and a single rule, and it is the shape almost every rule in the game takes — on{' '}
          <code className="font-mono text-sm text-ink">damaged</code>, when{' '}
          <code className="font-mono text-sm text-ink">hp &lt;= 0</code>:
        </P>
        <Code lang="rules">{`on: damaged   when: hp <= 0
do: spawn shard   ·  spawn shard   ·  score 1
    emit "target down"  ·  despawn`}</Code>
        <P>
          The two shards are the pieces left behind; the emit is the line on everybody&apos;s HUD.{' '}
          <code className="font-mono text-sm text-ink">despawn</code> comes last because a rule
          stops there — anything after it would be writing to a corpse.
        </P>

        <H2>Getting back up, without a script</H2>
        <P>
          The poppers do something the basic target cannot: they return. The trick is that dying is
          not <code className="font-mono text-sm text-ink">despawn</code> but{' '}
          <code className="font-mono text-sm text-ink">deactivate</code> for six seconds — and{' '}
          <code className="font-mono text-sm text-ink">returned</code> is an event, so coming back
          can have a rule of its own:
        </P>
        <Code lang="rules">{`on: damaged   when: hp <= 0
do: spawn shard  ·  score 2  ·  emit "popper down"
    deactivate self, 6 seconds

on: returned
do: heal self 999  ·  emit "popper up"`}</Code>
        <P>
          Heal by 999 rather than &quot;set hp to full&quot; because heal clamps — it is the
          document&apos;s way of saying <Em>whatever full is</Em>. Two rows in a panel, and the
          range never empties.
        </P>

        <H2>The runner is on a clock</H2>
        <P>
          Two targets sweep the gallery, and their script is the first multiplayer lesson in the
          file. Where a runner is, is computed from{' '}
          <code className="font-mono text-sm text-ink">world.time</code> — the one number every
          browser in the room agrees about — rather than accumulated frame by frame:
        </P>
        <Code>{`const PACE = 0.42
let phase = 0

function onSpawn() {
  // Staggered by where it starts, so two runners are not one thick runner.
  phase = self.x * 0.21
}

function onTick() {
  self.x = self.get('centre') + Math.sin(world.time * PACE + phase) * self.get('span')
}`}</Code>
        <P>
          Four browsers draw this in the same place without anybody sending anything, and a runner
          that was shot down rejoins the sweep where the sweep is now — not where it happened to
          die. The centre and span are properties on the blueprint, so the route moves without
          touching the code.
        </P>

        <H2>The thing that comes for you</H2>
        <P>
          A script can measure a distance and take health off; it cannot cast a ray, so it cannot
          shoot back. What it can do is <Em>come to you</Em> — so the mine circles its patch of the
          pit until somebody walks inside its reach, closes the distance, and goes off in their
          face. Three numbers make it fair rather than annoying: it flies at 3.6 — above head height
          and above every crate, so what it costs you is the open ground rather than the cover; it
          reloads for seven seconds, so being caught once is a hit and not a grinder; and at 40 hp
          against a 25-damage pistol it is two shots to bring down, which is why it scores 8 while a
          gallery target scores 1.
        </P>
        <Code>{`const RING = 5      // its circuit, when nobody is near
const HEIGHT = 3.6  // above the cover, so cover still works
const AGGRO = 11    // how far it notices
const STING = 2     // how close it has to get
const HURT = 18
const RELOAD = 7

function onTick(dt) {
  const player = getEntityByName('player')
  const reach = player ? self.flatDistanceTo(player) : 999

  if (player && world.time >= ready && reach < AGGRO) {
    // close the distance...
    if (reach < STING) {
      player.damage(HURT)
      self.emit('a mine went off')
      ready = world.time + RELOAD
    }
  }
  // ...otherwise, back to the circuit, eased rather than snapped.
}`}</Code>
        <P>
          Its death is still just a rule — rubble, a thud, score 8, deactivate for twelve seconds,
          and the <code className="font-mono text-sm text-ink">returned</code> heal puts it back on
          patrol.
        </P>

        <H2>Cover that fights back, pickups that meter themselves</H2>
        <P>
          The barrels are the range&apos;s one joke, and it is a rule:{' '}
          <code className="font-mono text-sm text-ink">on damaged, when hp &lt;= 0 — damage other
          by 20</code>. <code className="font-mono text-sm text-ink">other</code> is whoever set the
          rule off, so shooting a barrel you are standing next to is a decision you made.
        </P>
        <P>
          The ammo box and the stim use the same deactivate trick as the poppers, pointed the other
          way: walking in adds{' '}
          <code className="font-mono text-sm text-ink">ammo +12</code> (or heals 40), and the box
          deactivates for fifteen seconds (the stim, twenty-five). That one number is the whole
          supply economy — no cooldown system, no spawner, just a thing that is briefly not there.
        </P>

        <H2>What the scoring says</H2>
        <P>
          A still target scores 1, a popper 2, a mine 8. The prices are the difficulty curve stated
          out loud — and the host decides what a score <Em>means</Em>, which is what lets the same
          document be a practice range in freeplay and a match with a winner. The level does not
          know. It just says what happened.
        </P>

        <footer className="mt-12 border-t border-line/40 pt-8">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
            Everything above is buildable from the{' '}
            <Link href="/create/xp/docs" className="text-accent hover:underline">
              docs
            </Link>
            : the targets are the rules panel, the runner and the mine are the scripts section, and
            the pickups are one verb each. Back to the{' '}
            <Link href="/create/xp/showcase" className="text-accent hover:underline">
              showcase
            </Link>
            .
          </p>
        </footer>
      </article>
    </main>
  )
}
