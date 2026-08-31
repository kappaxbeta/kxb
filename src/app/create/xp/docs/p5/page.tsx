import type { Metadata } from 'next'
import Link from 'next/link'

import { C, Code, DocsShell, DocTitle, Em, P, Pairs, Section } from '../shell'

/**
 * The p5 sketch, for the person writing one.
 *
 * The same bargain as the scripts page: written from the SDK the container
 * actually inlines (`src/app/xp/_sketch/sdk.ts`), and if this page and that
 * file disagree, the file and its tests are right and this page is stale.
 */

export const metadata: Metadata = {
  title: 'XP docs — p5.js sketches',
  description:
    'An XP that is code: p5.js in a sandboxed container, the window.xp wrapper — players, avatars, one input axis, shared objects, the flow, packs and translation.',
}

const SECTIONS = [
  { id: 'what', label: 'What a sketch XP is' },
  { id: 'project', label: 'The project' },
  { id: 'players', label: 'Players & avatars' },
  { id: 'input', label: 'One input axis' },
  { id: 'keys', label: 'Keys that become buttons' },
  { id: 'objects', label: 'Shared objects' },
  { id: 'flow', label: 'The flow' },
  { id: 'assets', label: 'Loading from packs' },
  { id: 'words', label: 'Translation' },
  { id: 'cannot', label: 'What a sketch cannot do' },
] as const

export default function P5Page() {
  return (
    <DocsShell current="p5" sections={SECTIONS}>
      <DocTitle kicker="Reference">p5.js sketches</DocTitle>
      <P>
        The other kind of cartridge: an XP whose whole content is <Em>code you wrote</Em>, drawn
        by <C>p5.js</C> on its own canvas. It is still an XP — the store lists it, the battle
        wizard picks it, a room keeps it standing — but instead of a world of blueprints it
        carries JavaScript files, and instead of the{' '}
        <Link href="/create/xp/docs/scripts" className="text-accent hover:underline">
          script sandbox
        </Link>{' '}
        it runs in a sealed container with a real DOM, a real canvas and{' '}
        <C>requestAnimationFrame</C>. Ordinary p5: <C>setup()</C>, <C>draw()</C>,{' '}
        <C>mouseX</C>, <C>keyIsDown</C> — all of it works untouched.
      </P>
      <P>
        What the platform adds is <C>window.xp</C>: the wrapper every sketch wakes up inside,
        which is how a hundred lines of p5 becomes a multiplayer game without a line of
        netcode.
      </P>

      <Section id="what" title="What a sketch XP is">
        <P>
          A document with a <C>sketch</C> block instead of a world. The sources live{' '}
          <Em>inside</Em> the document as strings — there is no file upload and no second
          format — and they only ever run inside an iframe with an opaque origin and a strict
          content policy. That containment is why a sketch somebody else wrote is a sketch you
          can safely open: it cannot see your cookies, cannot reach the page around it, and
          cannot phone home — the only network it has is the platform&apos;s own art.
        </P>
        <Code lang="data">{`{
  "format": "xp/1",
  "id": "neon-pond",
  "name": "Neon Pond",
  "player": { "keys": [{ "key": "KeyE", "does": "boost" }] },
  "sketch": {
    "engine": "p5",
    "entry": "main.js",
    "stick": true,
    "files": { "pond.js": "…", "main.js": "…" }
  }
}`}</Code>
        <P>
          Up to sixteen files, half a megabyte across the project. Every file runs in the order
          written; <C>entry</C> runs <Em>last</Em>, so helpers exist by the time the main file
          does. Ship-along examples to read: <C>neon-pond</C> (2D, a flow with rounds),{' '}
          <C>peep-beat</C> (a rhythm game — lanes, pack art, a live scoreboard), and{' '}
          <C>cube-yard</C> (p5&apos;s WEBGL mode).
        </P>
      </Section>

      <Section id="project" title="The project">
        <P>
          Pick <Em>p5.js</Em> when creating a project and you get the project view instead of
          the 3D editor: the file list on the left, the code in the middle, the sketch running
          on the right with a console under it. <Em>Run</Em> rebuilds the preview from what you
          typed; <Em>Save</Em> refuses, with the parser&apos;s own words, anything that would
          not open — the same bargain the level editor strikes. On a phone the three panes
          become tabs, so whichever one you are in has the whole screen.
        </P>
      </Section>

      <Section id="players" title="Players & avatars">
        <P>
          The roster is live and the avatar syncs itself: write your own position every frame,
          read everybody else&apos;s. Ten times a second yours goes out; theirs arrive smoothed,
          so movement reads as movement rather than teleporting.
        </P>
        <Pairs
          rows={[
            [<C key="1">xp.me · xp.players</C>, 'Who you are; everybody here, you included.'],
            [
              <C key="2">xp.avatar</C>,
              <>
                Yours: <C>x</C>, <C>y</C>, <C>angle</C>, and a free <C>data</C> object that
                travels with it — a score, a colour, a state.
              </>,
            ],
            [
              <C key="3">player.avatar</C>,
              'Theirs, already eased. Draw it; never write it.',
            ],
            [
              <C key="4">player.image</C>,
              'A picture of their skin, for image() — a peep face over a dot.',
            ],
            [
              <C key="5">xp.on(&apos;join&apos; / &apos;leave&apos;, fn)</C>,
              'Somebody arrived or went. Their held buttons are released for you.',
            ],
          ]}
        />
        <Code>{`function draw() {
  background(6, 2, 20)
  xp.avatar.x += xp.input.x * 4   // mine: written
  xp.players.forEach(function (p) {
    circle(p.avatar.x, p.avatar.y, 26)  // everybody's: read
    text(p.name, p.avatar.x, p.avatar.y - 24)
  })
}`}</Code>
        <P>
          A live scoreboard is one line, because <C>avatar.data</C> rides the same sync:{' '}
          <C>xp.avatar.data.score += 1</C> on your machine is{' '}
          <C>p.avatar.data.score</C> on everybody&apos;s.
        </P>
      </Section>

      <Section id="input" title="One input axis">
        <P>
          <C>xp.input</C> is <C>{'{ x, y }'}</C> in −1..1, clamped to the unit circle, +y
          down like a canvas. On a keyboard it is the arrows and WASD; on a phone it is the
          thumbstick, when the document set <C>sketch.stick</C>. A sketch written against it is
          playable on both without a line of device code — and <C>player.input</C> gives you
          everybody else&apos;s axis too, synced with their avatar.
        </P>
        <Code>{`var pace = xp.pressed('boost') ? 7 : 3.5
xp.avatar.x = constrain(xp.avatar.x + xp.input.x * pace, 0, width)
xp.avatar.y = constrain(xp.avatar.y + xp.input.y * pace, 0, height)`}</Code>
      </Section>

      <Section id="keys" title="Keys that become buttons">
        <P>
          The document&apos;s <C>player.keys</C> — the same five-key vocabulary a level binds —
          arrive as named controls: from this keyboard, from an on-screen button on a phone,
          and <Em>from the wire for every other player</Em>. A press is a trigger everybody
          hears, which is what makes &quot;glow while boosting&quot; visible on every screen,
          not just your own.
        </P>
        <Pairs
          rows={[
            [
              <C key="1">xp.on(&apos;press&apos; / &apos;release&apos;, fn)</C>,
              <>
                <C>fn(name, player)</C> — fires for every player&apos;s edges, yours included.
              </>,
            ],
            [
              <C key="2">xp.pressed(name, player?)</C>,
              'Held right now. Yours if no player is given.',
            ],
          ]}
        />
        <Code>{`xp.on('press', function (name, p) {
  if (name === 'boost') ripples.push({ x: p.avatar.x, y: p.avatar.y, age: 0 })
})`}</Code>
      </Section>

      <Section id="objects" title="Shared objects — the ball rule">
        <P>
          For a thing that is nobody&apos;s body — a ball, a puck, a crown — declare a shared
          object. Exactly one client moves it and everybody else watches it smoothed, which is
          the same election the 3D engine uses for its own balls: no owner messages, the lowest
          id starts as owner, and <C>claim()</C> takes it — touching it, catching it.
        </P>
        <Code>{`var ball

function setup() {
  ball = xp.object('ball', { x: 240, y: 200, dx: 0, dy: 0 })
}

function draw() {
  if (dist(xp.avatar.x, xp.avatar.y, ball.x, ball.y) < 36) {
    ball.claim()                        // it is yours now, on every screen
    ball.dx = (ball.x - xp.avatar.x) * 0.4
    ball.dy = (ball.y - xp.avatar.y) * 0.4
  }
  if (ball.mine) {                      // only the owner integrates
    ball.x += ball.dx
    ball.y += ball.dy
  }
  circle(ball.x, ball.y, 22)            // everybody draws
}`}</Code>
        <P>
          For everything else there is <C>xp.send(data)</C> and{' '}
          <C>xp.on(&apos;message&apos;, fn)</C> — fire-and-forget to everybody, capped at
          twenty a second and 8 kB, which is a game loop&apos;s worth of state and not a
          firehose.
        </P>
      </Section>

      <Section id="flow" title="The flow — rounds the platform runs">
        <P>
          Give the document a{' '}
          <Link href="/create/xp/docs/flow" className="text-accent hover:underline">
            flow
          </Link>{' '}
          and the platform runs it over your sketch: the strip above the canvas shows the
          round, the phase, the countdown and the phase&apos;s <C>says</C> line, and a
          phase&apos;s <C>allow</C> really does silence the keys it takes away. One client
          drives, everybody follows, late joiners land in the right phase.
        </P>
        <Pairs
          rows={[
            [
              <C key="1">xp.phase</C>,
              <>
                <C>{'{ name, round, left, over, says, allowed }'}</C> — or <C>null</C> when the
                document has no flow.
              </>,
            ],
            [<C key="2">xp.on(&apos;phase&apos;, fn)</C>, 'The run moved.'],
            [
              <C key="3">xp.emit(&apos;goal&apos;)</C>,
              <>
                Raise an event a flow step is listening for — a step written{' '}
                <C>{'{ "on": "goal", "go": "celebrate" }'}</C> fires on it.
              </>,
            ],
            [
              <C key="4">xp.match</C>,
              <>
                What scheduled this, if anything did: <C>started</C>, <C>timeLimit</C>,{' '}
                <C>scoreLimit</C> from the battle wizard. Nulls mean <Em>you decide</Em>.
              </>,
            ],
          ]}
        />
        <P>
          What of a flow a sketch cannot honour, it refuses honestly: steps with a{' '}
          <C>when</C> condition never hold (they read a data block your code replaces), and a
          phase&apos;s <C>does</C> verbs fire at nothing — there are no entities in here to
          fire at.
        </P>
      </Section>

      <Section id="assets" title="Loading from packs">
        <P>
          The shipped art is reachable from inside the container — and it is the <Em>only</Em>{' '}
          network the container has.
        </P>
        <Pairs
          rows={[
            [
              <C key="1">xp.load.image(&apos;peepz/bunny&apos;)</C>,
              'A catalogue model&apos;s picture as a stable handle: check .ready, draw .image. (p5 2.x hands back a Promise and 1.x an image; the handle spares you caring which.)',
            ],
            [
              <C key="6">xp.load.model(&apos;proto/Barrel_A&apos;)</C>,
              'The model itself, for WEBGL mode: a handle whose .draw() feeds p5 the mesh with its base-colour texture once .ready. A prop, standing still — no skinning, no animation, no extensions.',
            ],
            [
              <C key="2">xp.load.sound(&apos;hit&apos;).play()</C>,
              'A player that cycles the sound&apos;s takes — five punches cycled read as a fight; one punch five times reads as a bug.',
            ],
            [
              <C key="7">xp.tone(660, 0.12, &apos;square&apos;)</C>,
              'A sound made rather than loaded — for the blip whose pitch is data: a streak, a countdown. Peep Beat&apos;s verdicts are these.',
            ],
            [
              <C key="8">player.skin</C>,
              'The model id behind a player&apos;s look — hand it to xp.load.model and the actual peep stands in your sketch, as Cube Yard&apos;s players do.',
            ],
            [
              <C key="3">xp.imageUrl · xp.soundUrl</C>,
              'The bare URLs, when you want them raw.',
            ],
            [
              <C key="4">xp.file(&apos;glow.frag&apos;)</C>,
              <>
                A file the project <Em>carries</Em> rather than runs — <C>.frag</C>,{' '}
                <C>.vert</C> and <C>.glsl</C> are legal beside your <C>.js</C> — returned as
                the string <C>createShader(vert, frag)</C> wants.
              </>,
            ],
            [
              <C key="5">xp.timeline</C>,
              <>
                <C>{'{ seconds }'}</C> when the document declared how long one pass of the
                sketch is — a composition can loop itself to it, and it is what a render of
                the sketch will run to.
              </>,
            ],
          ]}
        />
        <Code>{`var glow

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL)
  glow = createShader(xp.file('basic.vert'), xp.file('glow.frag'))
}

function draw() {
  shader(glow)
  glow.setUniform('t', millis() / 1000)
  rect(-width / 2, -height / 2, width, height)
}`}</Code>
        <Code>{`var face, barrel

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL)
  face = xp.load.image('peepz/bunny')
  barrel = xp.load.model('proto/Barrel_A')
}

function draw() {
  if (face.ready) image(face.image, 100, 100, 60, 60)
  if (barrel.ready) {
    push()
    translate(0, 60, 0)
    scale(60)
    barrel.draw()   // textured, lit by your lights
    pop()
  }
  if (somethingLanded) xp.load.sound('thud').play()
}`}</Code>
      </Section>

      <Section id="words" title="Translation">
        <P>
          The document&apos;s{' '}
          <Link href="/create/xp/docs/words" className="text-accent hover:underline">
            words block
          </Link>{' '}
          works here too: <C>xp.t(&apos;Catch the ball&apos;)</C> returns the reader&apos;s
          sentence, resolved for their language before your code ever runs. The same warning
          the script API carries: it differs per reader, so <Em>draw</Em> what it returns —
          never compare against it, never name a signal by it.
        </P>
      </Section>

      <Section id="cannot" title="What a sketch cannot do">
        <P>
          The container is the deal: no cookies, no storage of the page&apos;s, no network
          beyond the platform&apos;s own art, no reaching the page around it. Two honest gaps
          beyond that, both by design rather than by accident. The <Em>arbiter</Em> — the
          server-decided rules a board game&apos;s rolls and turns run through — is not exposed
          to sketches yet; what a sketch has is the elected-owner object above, which is the{' '}
          <C>elected</C> tier, not the <C>server</C> one, so a sketch&apos;s facts are as
          honest as its players&apos; machines. And p5 reads OBJ and STL, not the{' '}
          <C>.glb</C> our packs ship — so &quot;the real 3D model&quot; in a sketch is
          p5&apos;s own geometry (see <C>cube-yard</C>), with pack <Em>pictures</Em> for
          faces and floors.
        </P>
      </Section>
    </DocsShell>
  )
}
