import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Band,
  Figures,
  MarketingShell,
  NotYet,
  PageHero,
  PageOutro,
  Rack,
  Shot,
  Spec,
  Traits,
} from '@/app/components/marketing-shell'
import { resolveLook } from '@/app/components/look'
import { MAX_MESSAGE_LENGTH } from '@/domain/chat/events'
import { AVATARS } from '@/domain/lounge/avatars'
import { EMOTE_COUNT } from '@/domain/world/emotes'
import { MAX_FACES } from '@/domain/world/faces'

/**
 * What there is to do, once somebody is standing in the room.
 *
 * ---------------------------------------------------------------------------
 * Why this page exists
 * ---------------------------------------------------------------------------
 * The landing page used to carry nine feature cards and six use-case rows, and
 * a stranger had to scroll all of it to find out whether the football was real.
 * That detail was not wrong, it was in the wrong place: it is what somebody
 * reads *after* deciding the idea is interesting, not before.
 *
 * So the landing page kept four rows and three doors, and this is one of the
 * doors. Everything on it is playable today by anybody standing in the room,
 * with or without an account - which is the sentence the hero makes, and the
 * bar every section below had to clear to be on the page.
 *
 * ---------------------------------------------------------------------------
 * The shape of the page is an argument about the content
 * ---------------------------------------------------------------------------
 * Battles and football take the full width and carry the page's two structured
 * blocks - a comparison and four behaviours - because they are what most of this
 * page's traffic came for. Races, tournaments, the café and the house pair up at
 * half width: they are each one idea, and a pair reads as "and also these" rather
 * than as two more rungs on a ladder. The lounge closes because it is the half of
 * the arcade nobody arrives asking about and everybody stays for.
 *
 * The numbers are read off the code rather than chosen - `AVATARS.length`,
 * `EMOTE_COUNT` - and the five modes below are the five in `battleModeSchema`. A
 * marketing page that invents a number is a marketing page somebody has to
 * fact-check before every edit.
 */

export const metadata: Metadata = {
  title: 'Play — football, battles, karts, a café and a house',
  description:
    'Football with real goalposts, five battle modes, karts you get into, races and parkour, tournaments, a café to run and a house to go home to. Talk to the room with your voice, your camera or your hands. All in a browser, none of it needing an account.',
}

/**
 * The five modes, and what each one actually is.
 *
 * A spec rather than five paragraphs, because the question this answers is
 * comparative - somebody is picking one - and five prose blocks make a reader
 * hold four of them in their head to compare the fifth.
 */
const MODES = [
  ['All against all', 'Everyone for themselves. Last one standing, or highest when the clock runs out.'],
  ['Teams', 'Red and blue. Pick a side in the lobby, or get put in one.'],
  ['One against everyone', 'A champion, and everybody else. Uneven on purpose.'],
  ['Football', 'Two goals, one ball, a clock and a score limit.'],
  ['Race', 'A start line, a finish line, and dashing allowed.'],
] as const

/** How the ball behaves, which is the whole of why the football is any good. */
const BALL = [
  {
    mark: 'momentum',
    title: 'Momentum, not a fixed kick',
    body: 'The ball leaves at the speed you hit it. Walk into it and it trickles. Dash into it and it flies.',
  },
  {
    mark: 'owner',
    title: 'One browser owns it',
    body: 'The room elects a client to run the physics and broadcast the truth. If they close the tab, ownership fails over instantly to the next player. Nobody plays against the lag.',
  },
  {
    mark: 'sweep',
    title: 'The goal line is swept, not sampled',
    body: 'A dashed ball can cross thirty-four blocks in a second, so the game checks the whole path the ball travelled last frame rather than where it happened to land. Fast shots don’t phase through the net.',
  },
  {
    mark: 'clock',
    title: 'Ten seconds after a goal',
    body: 'A kickoff pause, so everybody can get back to the middle before it restarts.',
  },
] as const

/**
 * The vehicles, as they come out of the catalogue.
 *
 * Twelve of the fifty in the `cars` pack, and the file names are the whole
 * check on this section: the page cannot show a fire engine the product does
 * not ship, because `/xp/thumbs/cars/firetruck.webp` is drawn off the same glTF
 * a space summons. Labelled by hand rather than off `modelLabel`, because a
 * catalogue label is a filename tidied up ("Kart Oobi") and these are captions.
 */
const CARS = [
  { src: '/xp/thumbs/cars/kart-oobi.webp', label: 'Kart' },
  { src: '/xp/thumbs/cars/race-future.webp', label: 'Racer' },
  { src: '/xp/thumbs/cars/sedan-sports.webp', label: 'Sports' },
  { src: '/xp/thumbs/cars/taxi.webp', label: 'Taxi' },
  { src: '/xp/thumbs/cars/police.webp', label: 'Police' },
  { src: '/xp/thumbs/cars/ambulance.webp', label: 'Ambulance' },
  { src: '/xp/thumbs/cars/firetruck.webp', label: 'Fire engine' },
  { src: '/xp/thumbs/cars/garbage-truck.webp', label: 'Bin lorry' },
  { src: '/xp/thumbs/cars/tractor.webp', label: 'Tractor' },
  { src: '/xp/thumbs/cars/van.webp', label: 'Van' },
  { src: '/xp/thumbs/cars/suv-luxury.webp', label: 'SUV' },
  { src: '/xp/thumbs/cars/truck.webp', label: 'Truck' },
] as const

/** What being behind the wheel of one is actually like. */
const DRIVING = [
  {
    mark: 'vehicle',
    title: 'The first seat is the wheel',
    body: 'Seats are where bodies go, and seat one is the driver’s — a rule rather than a field, so every surface that asks who is driving gets the same answer. Eight aboard at most, and the other seven are along for it.',
  },
  {
    mark: 'momentum',
    title: 'Top speed is set per vehicle',
    body: 'In cells a second, floored just above walking pace and capped just under a dashing player. The fastest thing in the room is still somebody who committed to something.',
  },
  {
    mark: 'pieces',
    title: 'Wheels are attachments',
    body: 'A model that came with wheels spins them — they are found by name inside the file, nobody has to say so. Anything else takes wheels bolted on at a joint, front ones steering and back ones not, which is how a crate becomes a soapbox.',
  },
  {
    mark: 'home',
    title: 'A roof hides everyone under it',
    body: 'A kart carries you out in the open. A car with a roof — or a giant football you are rolling about as — draws nobody aboard at all. Your name and anything you say still float over it, because somebody is obviously still in there.',
  },
] as const

/**
 * The three ways to say something, and the one thing they have in common.
 *
 * Ordered by how little they ask of you: your voice needs a key held, your
 * camera needs switching on, typing needs a sentence, and a face needs nothing
 * at all. The emote is last rather than first because it is the one everybody
 * meets on their own within a minute of arriving.
 */
const TALKING = [
  {
    mark: 'voice',
    title: 'A voice that falls off with distance',
    body: 'Hold T and talk. It comes out of where you are standing — full volume up close, gone by the far wall — so one room holds as many conversations as it has corners and the second one is not called interrupting. Open mic is a setting; push-to-talk is the default, because the two ways of getting that wrong are not the same size.',
  },
  {
    mark: 'face',
    title: 'Your camera, worn as a face',
    body: 'Switch it on and your picture is a disc floating over your animal’s head, turned toward whoever is looking rather than toward the way you happen to be walking. Nobody dials anybody: both ends work out the same roster and the lower connection id makes the offer, so there is no ringing and nothing to accept.',
  },
  {
    mark: 'chat',
    title: 'Typed, per room, and kept',
    body: 'Moving rooms moves the conversation. It is written down — not for the scrollback, but because a sentence that only ever existed in six browser tabs is one nobody can report, and the name on it is the name you had when you said it rather than the one you have now.',
  },
  {
    mark: 'emote',
    title: 'Or say nothing and pull a face',
    body: 'The emote wheel is faster than a sentence and reads from the far end of a pitch. Nothing about it is written anywhere: a face lives about three seconds and is then gone for good, which is the right deal for a shrug.',
  },
] as const

const NOT_YET = [
  'Nothing ranks anybody, so there is no ladder and no history of who beat whom.',
  'Football has no offside, no fouls and no referee. It has a ball and two goals.',
  'The café’s barista is capable but not clever. If the room makes no sense, neither will they.',
  'Damage in a battle is self-reported by the players’ own browsers. It is a game between people who came to play, not a competitive ranked ladder.',
  `Cameras are peer to peer and cost every pair a connection, so the room draws ${MAX_FACES} of them at once. Voices are not capped, because distance already is the cap.`,
  'Chat is per room and it is text. No files, no threads, no replies — the room is the thread.',
] as const

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ look?: string }>
}) {
  const { look, variant } = await resolveLook((await searchParams).look)

  return (
    <MarketingShell>
      {/* No `active` here any more. The nav lost these three pills upstream — the
          pages they marked moved into a section this repository does not carry —
          so the prop narrowed to the one value left. This page is still real and
          still wears the shell; it simply has nothing in the header to light up,
          which is the honest state rather than a marker pointing at nothing. */}
      {/* `data-look` is the whole of the art-direction switch - see the note in
          globals.css. The markup below is identical in both arms. */}
      <div className="bento doc" data-look={look} data-variant={variant ?? undefined}>
        <PageHero
          eyebrow="Play"
          mark="football"
          title="There is always something to do"
          sub="A lounge is only good for about ten minutes if there’s nothing in it. So there’s a pitch, an arena, a track, a café to run and a house to go home to. Everything below is playable today, by anybody standing in the room, whether or not they have an account."
          hue={145}
          cta={{ href: '/demo', label: 'Walk into the demo' }}
          art="/xo/scenes/heap-play.webp"
        />

        {/* The pitch first, and the picture with it. It is the surface most of
            this page's traffic arrived to see - see the landing page's first
            row, which is the link most of them came through. */}
        <section className="usecases col-span-6">
          <article className="usecase" style={{ '--box-hue': 145 } as React.CSSProperties}>
            <div className="usecase-art">
              <Image
                src="/xo/scenes/football-crowd.webp"
                alt="Six animals converging on a football from all sides of a grass pitch"
                width={1600}
                height={1000}
                className="usecase-shot"
                sizes="(max-width: 900px) 100vw, 55vw"
              />
            </div>
            <div>
              <p className="usecase-kicker">The icebreaker</p>
              <h2 className="usecase-title">
                The game starts when the second person walks in
              </h2>
              <p className="usecase-body text-sm">
                No lobby to fill, no teams to pick first, no ready check. Somebody lays a pitch,
                somebody else wanders onto it, and that is a match. Everything on this page works
                the same way — it is an arcade, so the barrier between standing there and playing
                is meant to be about one step wide.
              </p>
            </div>
          </article>
        </section>

        <Band
          id="battles"
          kicker="Battles"
          mark="battles"
          title="Pick a fight, pick a stage"
          hue={25}
          index={0}
          peep={{ avatar: 'tiger', angle: 'low' }}
        >
          <p>
            A match is a room with a scoreboard. Five modes, and two to sixteen players in any of
            them. You can fight in your own lounge, in a battlefield somebody else built and
            published, or inside an xp level.
          </p>
          <p>
            Damage is self-reported: the attacker says <em>hit</em> and the victim’s own browser
            decides what it cost them. Going down isn’t the end of you — it’s the walk back.
          </p>

          <Spec rows={MODES} />

          {/* A match before it starts, which is the half of it nobody
              screenshots and the half that decides whether anybody plays. The
              clock is already running, the level is already there, and the panel
              is counting people at the line rather than asking anybody to
              accept anything. */}
          <Shot
            src="/img/level-lobby.webp"
            alt="A parkour level called Ladder Run waiting to start: a clock running above it, a panel reading nobody has taken a seat yet with a join button, and a right rail of guest links with a QR code"
            width={2200}
            height={1062}
            cutRight="3%"
            caption={
              <>
                A race on an xp level, before the off. Nobody has taken a seat yet, two at the line
                is enough to start it, and sixteen is as many as it holds. You can walk around the
                course while you wait — a lobby here is somewhere you stand, not a screen you sit
                in front of.
              </>
            }
          />

          <p>
            <strong>Whoever set the match up starts it, and only they can call it off.</strong> That
            is a rule in the log rather than a check in the browser, so a client cannot talk its way
            past it — which matters the moment somebody who is losing would rather the match ended.
          </p>
        </Band>

        <Band
          id="football"
          kicker="Football"
          mark="football"
          title="A pitch needs two goalposts, and you put them there"
          hue={145}
          index={1}
        >
          <p>
            Football is the one game that needs something built before it works, and it is
            deliberately only one thing: a goal at each end. You place them the way you place a
            block, standing in the world. Until they’re down there’s a ball, a field, and nowhere
            to score.
          </p>
          <p>
            Worlds in the catalogue tagged <strong>Pitch</strong> already have room for goals at
            each end. Drop one into your space, put the posts down, and you have a ground.
          </p>

          <Traits items={BALL} />
        </Band>

        {/* Between the football and the pairs, and full width for one reason:
            the rack. A row of the actual models is the only picture on this
            page that could not be faked, and at half width it is three tiles
            and a scrollbar. */}
        <Band
          id="drive"
          kicker="Vehicles"
          mark="vehicle"
          title="Anything on the shelf can be given an engine"
          hue={195}
          index={2}
        >
          <p>
            A kart is a bench with an engine. It stands in a cell, it is summoned and dismissed
            like anything else, and you get into it with the same <strong>E</strong> that sits you
            on a chair — so driving is not a second game with its own rules, it is one more thing a
            piece of furniture can be told that it does.
          </p>

          <Rack label="Vehicles in the catalogue" items={CARS} />

          <Traits items={DRIVING} />

          <p>
            Which means the interesting part is not the cars. It is that the same three lines that
            make a kart drive will make a wheelbarrow drive, or a sofa, or the fountain — and
            somebody in your space is going to find that out on a Tuesday and not tell anybody
            until it comes round the corner.
          </p>
        </Band>

        <Band
          id="boardgames"
          kicker="Board games"
          mark="boardgames"
          title="Nothing moves your piece for you"
          hue={75}
          index={3}
          span="half"
        >
          <p>
            Four seats, four colours, and a die each. You are dealt a chair when the table fills and
            you arrive standing in it, with your own pieces in front of you and your own die beside
            them.
          </p>
          <p>
            <strong>You move the pieces yourself.</strong> Walk to one, take it, carry it to the
            field you meant, and put it down. Tap to pick up and tap to let go, or hold if you would
            rather feel what you are carrying. Then say you are done, and it is the next
            player&rsquo;s turn.
          </p>
          <p>
            The roll is advice. Nothing checks that you moved four on a four, or that you needed a
            six to come out — the same latitude a real table gives, in front of people who can see
            you take it. Knocking somebody back to their yard is a thing you do with your hands, not
            something the board does on your behalf.
          </p>
        </Band>

        <Band
          id="races"
          kicker="Races"
          mark="races"
          title="Start line, finish line, and a route to the top"
          hue={90}
          index={3}
          span="half"
        >
          <p>
            A race is the start line, the finish line and whatever you put between them. Dashing is
            allowed. Going down costs you the walk back to the line rather than the race — there is
            no elimination, so the person in last place is still racing at the end, which is the
            entire reason anybody finishes.
          </p>
          <p>
            Worlds tagged <strong>Parkour</strong> in the catalogue are built for exactly this:
            jumps, gaps, and a route to the top. Tagged <strong>Maze</strong> if getting lost is the
            point.
          </p>
        </Band>

        <Band
          id="tournaments"
          kicker="Tournaments"
          mark="tournaments"
          title="A bracket, and nothing that ranks anybody"
          hue={55}
          index={4}
          span="half"
        >
          <p>
            Single elimination. Byes are handled, rematches are on tap, and pairing follows the
            order people signed up in.
          </p>
          <p>
            Nothing here ranks anybody, and that is on purpose. A ladder turns an afternoon into a
            season, and a season is a thing you have to keep up with. This is for the two hours
            everybody is already in the room.
          </p>
        </Band>

        <Band
          id="cafe"
          kicker="Café"
          mark="cafe"
          title="Pull the shot, take the order, keep up"
          hue={40}
          index={4}
          span="half"
        >
          <p>
            A whole small game inside the world. Customers come in, sit down and want something. You
            pull espresso, plate a burger, run it over, and clear the table before the next one
            arrives.
          </p>
          <p>
            There is a barista who works the station when you don’t. Build the room so they can
            still get through — wall a station off completely and they will just stand there,
            quietly, forever.
          </p>
        </Band>

        <Band
          id="home"
          kicker="Home"
          mark="home"
          title="Then travel home and put your feet up"
          hue={75}
          index={5}
          span="half"
        >
          <p>
            A place you furnish and a plot you tend, off the same world and the same save. Buy the
            ground, put the props where you want them, grow things.
          </p>
          <p>
            It is the quiet half of the arcade and it is not the waiting room for the loud half.
            Some evenings the whole point is that nobody is keeping score.
          </p>
        </Band>

        <Band
          id="lounge"
          kicker="Lounge"
          mark="lounge"
          title="And when you just want to stand around"
          hue={320}
          index={6}
          peep={{ avatar: 'panda', angle: 'three' }}
        >
          <p>
            Animals to be, faces to pull over your head, a radio you can put a track on, and{' '}
            <a href="#talk" className="text-accent transition hover:opacity-80">
              three ways to say something
            </a>{' '}
            if a face will not cover it.
          </p>

          {/* Counted off the domain rather than written out, because these are
              the two numbers on this page somebody might actually check. */}
          <Figures
            items={[
              { value: String(AVATARS.length), label: 'animals to be', note: 'pick one at the door' },
              { value: String(EMOTE_COUNT), label: 'faces to pull', note: 'over your head, in the room' },
            ]}
          />

          {/* The one capture on this page of the app rather than of the world,
              and it is here because this is the band about standing around: the
              rails are most of what standing around actually looks like. */}
          <Shot
            src="/img/lounge-room.webp"
            alt="The app in a browser: a panda standing in a brick-walled lounge, a left rail listing the rooms, a right rail showing who is here, the room and visitor tabs, and a radio track playing"
            width={2200}
            height={1064}
            caption={
              <>
                One page, and the room is in the middle of it. Places down the left, whoever is here
                down the right, the record that is on at the bottom of it — and the switch in the
                top corner turns this same room into a battle and back again without moving anybody
                out of it.
              </>
            }
          />

          <p>
            And party mode: an owner flips it, everybody lights the place up in their own colour,
            the rig sweeps the floor, and the neon rail at the top of every page starts cycling so
            the people who aren’t in the canvas know something is happening. It is a broadcast
            rather than a setting, which means it survives no reload and leaves nothing to clean up
            — a party is something happening, not something a space is.
          </p>
          <p>
            The lounge is walkable in a headset today. Same room, same people, no separate app.
          </p>
        </Band>

        {/* Last, and after the lounge rather than inside it.

            Chat, voice and video are the three features a stranger is most
            likely to arrive already believing they understand, because four
            other products have taught them what those words mean. Putting them
            at the end means they are read by somebody who has just spent a page
            learning that this is a room - which is the only context in which
            "a voice that gets quieter as you walk away" is a feature rather
            than a bug report. */}
        <Band
          id="talk"
          kicker="Talking"
          mark="chat"
          title="Three ways to say something, and none of them is a call"
          hue={210}
          index={7}
          peep={{ avatar: 'parrot', angle: 'front' }}
        >
          <p>
            Nobody sends an invite, nobody joins anything, and nothing ends when the host leaves.
            You walked into a room, and the people standing in it can hear you.
          </p>

          <Traits items={TALKING} />

          {/* Both read off the domain, like the two in the lounge band above:
              these are the numbers on this page a reader is most likely to
              want to check, and they are one import away from being wrong. */}
          <Figures
            items={[
              {
                value: String(MAX_FACES),
                label: 'cameras at once',
                note: 'per room, peer to peer',
              },
              {
                value: String(MAX_MESSAGE_LENGTH),
                label: 'characters a message',
                note: 'four hundred is a paragraph',
              },
            ]}
          />

          <p>
            The mic switch starts off and stays off until somebody presses it, and the mode is kept
            per device rather than per account — open mic on headphones at home is not open mic on
            the laptop in a shared office, and a setting that followed you between the two would be
            wrong in one of them every time, in the direction that broadcasts your kitchen.
          </p>
        </Band>

        <NotYet items={NOT_YET} hue={225} />

        <PageOutro
          title="The demo has a pitch in it right now."
          hue={145}
          secondary={{ href: '/create', label: 'Learn how to build one' }}
        />

        {/* One line out to the sibling pages rather than a second nav: somebody
            who read to the bottom of this has a next question, and it is
            reliably either "how do I make one" or "how do I get people in". */}
        <p className="col-span-6 text-center text-sm text-ink-muted">
          Next:{' '}
          <Link href="/create" className="text-accent transition hover:opacity-80">
            build the room it happens in
          </Link>{' '}
          ·{' '}
          <Link href="/share" className="text-accent transition hover:opacity-80">
            get everybody into it
          </Link>
        </p>
      </div>
    </MarketingShell>
  )
}
