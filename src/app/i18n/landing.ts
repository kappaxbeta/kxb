/**
 * What the landing page says, in one place per language.
 *
 * Only the words are in here. Hues, column spans, avatars, scene filenames and
 * the deco coordinates stay in `landing.tsx`, because none of them change
 * between languages and a translator handed a file full of `{ x: 92, y: 74 }`
 * will eventually edit one. The shapes below are keyed by the same ids the page
 * uses, so a card cannot lose its picture by being translated.
 *
 * `LandingDict` is declared rather than inferred from the English file, so a
 * key missing from German is a type error at build time instead of an
 * `undefined` rendered into the page. That is the whole reason to do this now,
 * with two languages, rather than after the copy settles: it is the check that
 * makes the third language cheap.
 *
 * ---------------------------------------------------------------------------
 * The shape below is the announcement post, not the old sales page
 * ---------------------------------------------------------------------------
 * The page used to open with a sales ask - the hero's second button said "Plan
 * an event", three cards said "Tell us the date", and the first section under
 * the fold was "Who it is for / Nobody has to move in", which is
 * objection-handling before anybody has objected. A stranger's first thirty
 * seconds went on being sold to rather than on being shown the arcade.
 *
 * So the order changed rather than the vocabulary: three doors (play, create,
 * share), four rows of the thing actually happening, the plan said out loud,
 * and only then the price. What used to be nine feature cards and six use-case
 * rows now lives on /play, /create and /share, which is where somebody who
 * wants that much detail is already heading.
 */
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'

/** The three doors under the hero. Each one is a page. */
export type DoorId = 'play' | 'create' | 'share'

/** The four alternating picture rows. */
export type RowId = 'football' | 'party' | 'build' | 'link'

/**
 * The four screenshots: the room, a game in it, the board, and the studio.
 *
 * The only pictures on this page that are of the *software* rather than of the
 * world. Everything else here is shot in `/world/shots` off the same models the
 * lounge loads - a room, animals, a pitch - and a stranger can come away from
 * all of it without a picture of the thing they would actually be paying five
 * euros a month to keep.
 *
 * It started as two - the board and the studio - and both of those are the
 * space *between* visits. Somebody could read the whole band and still not know
 * what the app looks like while the thing everything above it promises is
 * actually happening, because neither picture had a room in it. So `lounge` and
 * `level` go first, in that order: the room standing still, then the room with a
 * clock on it and a door you can hand to somebody.
 */
export type ScreenId = 'lounge' | 'level' | 'space' | 'studio'

/**
 * The four controls sitting on the studio's picture, rebuilt as buttons.
 *
 * The same four, in the same order, with the same icons the editor draws them
 * with - so the row under the screenshot is the row *in* the screenshot, and
 * pressing one says what it does. A caption can only claim the studio is
 * approachable; four controls that answer when you press them let somebody
 * find out in three seconds.
 */
export type CueId = 'walk' | 'drive' | 'lock' | 'key'

/** The three beats of the plan. */
export type PlanId = 'xo' | 'xp' | 'runtime'

/**
 * The chip strip under the hero.
 *
 * Every one of these now points into /play rather than at a card further down
 * this page. They were anchors when the surfaces were cards here; the cards
 * moved, and a chip row that scrolls you to somewhere that no longer exists is
 * worse than no chip row.
 */
export type ChipId =
  | 'lounge'
  | 'football'
  | 'battles'
  | 'boardgames'
  | 'races'
  | 'tournaments'
  | 'cafe'

export interface LandingDict {
  meta: { title: string; description: string }
  nav: {
    play: string
    create: string
    share: string
    pricing: string
    signIn: string
    join: string
  }
  hero: {
    eyebrowOpen: string
    eyebrowClosed: string
    /** Split so the second clause can keep its own `<span>` and never wrap mid-phrase. */
    headlineLead: string
    headlineAccent: string
    sub: string
    ctaDemo: string
    ctaJoin: string
  }
  /** The recording offered under the hero's two buttons. See `<IntroVideo>`. */
  intro: { watch: string; dialogTitle: string; aiNote: string; close: string }
  terms: {
    unlimitedMembers: string
    /** `{n}` is the seat cap. */
    upToMembers: string
    perSpace: string
  }
  chips: Record<ChipId, string>
  /** The two angled panes flanking the hero stage. */
  holo: {
    loungeTitle: string
    loungeNote: string
    paletteTitle: string
    /** Follows the block count, which is read from the real palette. */
    paletteBlocks: string
  }
  /** The dotted world map band. */
  world: { tag: string; title: string; body: string }
  /** The "happening here" strip, which only renders when something is featured. */
  featured: {
    sectionLabel: string
    tag: string
    openNow: string
    /** `{date}` is formatted in the page's locale. */
    opens: string
    seeEvent: string
  }
  doorsHeader: { tag: string; title: string; body: string }
  doors: Record<DoorId, { name: string; blurb: string; cta: string }>
  rows: Record<RowId, { kicker: string; title: string; body: string; cta: string; alt: string }>
  /** The band of screenshots. Same five fields as a row - it is the same job. */
  screensHeader: { tag: string; title: string; body: string }
  screens: Record<ScreenId, { kicker: string; title: string; body: string; cta: string; alt: string }>
  /** The four studio controls, as a row you can press. `lead` is the prompt over it. */
  cues: { lead: string; items: Record<CueId, { label: string; note: string }> }
  plan: {
    tag: string
    title: string
    items: Record<PlanId, { name: string; when: string; body: string }>
    closing: string
  }
  pricing: {
    tag: string
    title: string
    body: string
    event: {
      tag: string
      price: string
      note: string
      lines: readonly string[]
      cta: string
    }
    monthly: {
      per: string
      unlimitedLine: string
      /** `{n}` is the seat cap. */
      cappedLine: string
      ctaOpen: string
      ctaClosed: string
      /**
       * One block per tier, and deliberately no `price` in either.
       *
       * The numbers come from `TIER_DETAILS` via `tierPrice()`, so €5 and €10
       * are written once in the codebase rather than once per language. What
       * lives here is only the part that actually differs between English and
       * German - the sentences. A price in a dictionary is a price that gets
       * changed in one locale and not the other, which is the sort of bug that
       * gets found by a customer rather than a test.
       */
      free: { tag: string; note: string; lines: readonly string[] }
      xo: { tag: string; note: string; lines: readonly string[] }
      /**
       * `soon` lists the parts of xp that are not built yet, and it is a
       * separate array rather than a marker inside `lines` for one reason: the
       * landing page is the surface a stranger judges us on, and a mixed list
       * where three of six items quietly carry a badge is a list most people
       * read as six. Two headed groups cannot be misread that way.
       */
      xp: { tag: string; note: string; lines: readonly string[]; soon: readonly string[] }
      /** Heading over the not-yet-built group, and the badge on the card. */
      soonLabel: string
    }
  }
  /** The numbered strip: how somebody actually gets in. */
  steps: {
    title: string
    items: readonly { title: string; body: string }[]
    /** The promo code, printed as it is stored. Not translated. */
    code: string
  }
  faq: {
    title: string
    items: readonly { q: string; a: string }[]
  }
  closing: {
    title: string
    body: string
    ctaDemo: string
    ctaJoin: string
  }
  footer: {
    impressum: string
    terms: string
    privacy: string
    contact: string
    signIn: string
    events: string
  }
}

/**
 * The invite code, in both languages because it is the same string in both.
 *
 * Stored uppercase - `normaliseCode` uppercases and strips spaces before it
 * looks anything up - so it is printed uppercase too. Somebody reading it off
 * the page and typing it back should be typing the thing that is in the table.
 *
 * It still has to be *minted* before this page is worth reading. See
 * docs/marketing/copy-script.md §5.
 */
export const BETA_CODE = 'THEMOMENT2026'

export const EN: LandingDict = {
  meta: {
    title: 'Not here to chat <3 here to play.',
    description:
      'The fastest way to hang out online. A virtual arcade for your crew, game jam or community. No downloads — drop a link and you are in the action in seconds.',
  },
  nav: {
    play: 'Play',
    create: 'Create',
    share: 'Share',
    pricing: 'Pricing',
    signIn: 'Sign in',
    join: 'Join the beta',
  },
  hero: {
    // The badge is on the eyebrow rather than in the headline: the headline is
    // the position and has been earning its place for months, and "closed beta"
    // is news, which belongs in the line news goes on.
    eyebrowOpen: '👾 Closed beta — come in, it’s open',
    eyebrowClosed: '👾 Closed beta — and you’re invited',
    headlineLead: 'Not here to chat <3',
    headlineAccent: 'here to play.',
    sub: 'The fastest way to hang out online. A virtual arcade for your crew, game jam, or community. Zero downloads — just drop a link and jump straight into the action in seconds.',
    ctaDemo: 'Come and play — free',
    ctaJoin: 'Join the beta',
  },
  intro: {
    watch: 'Watch the tour',
    dialogTitle: 'How it works',
    aiNote:
      'Contains AI-generated content: the voice and the script are AI-made, and the screen footage — recorded from the real app — has been AI-enhanced.',
    close: 'Close the video',
  },
  terms: {
    unlimitedMembers: 'As many people as you like',
    upToMembers: 'Up to {n} people',
    perSpace: 'per space, and guests on a link aren’t members. Two of you at 3am counts.',
  },
  chips: {
    lounge: 'Lounge',
    football: 'Football',
    battles: 'Battles',
    boardgames: 'Board games',
    races: 'Races',
    tournaments: 'Tournaments',
    cafe: 'Café',
  },
  holo: {
    loungeTitle: 'In the lounge',
    loungeNote: 'Say it without typing',
    paletteTitle: 'The palette',
    paletteBlocks: 'blocks to build with',
  },
  world: {
    tag: 'People in the world',
    title: 'A space is a link, not a room in a building',
    body: 'Two colleagues at one table or six across three time zones walk into the same lounge the same way, and nobody installs anything. You see the others move as they move, and nobody types, they pull a face and you see it over their head.',
  },
  featured: {
    sectionLabel: 'Happening now',
    tag: 'Happening here',
    openNow: 'Open now',
    opens: 'Opens {date}',
    seeEvent: 'See the event',
  },
  doorsHeader: {
    tag: 'Enjoy',
    title: 'Play. Create. Share.',
    body: 'That’s the whole thing, roughly in the order you’ll meet it.',
  },
  doors: {
    play: {
      name: 'Play',
      blurb:
        'Kick a ball, run a parkour route, fight a match, sit down to a board game, pull espresso in the café, or just tend the garden. It’s all built already. You just walk in.',
      cta: 'Have a look',
    },
    create: {
      name: 'Create',
      blurb:
        'The room you are standing in is the editor. Place blocks while people are standing on them, move the goalposts, and save it. With xp, you can build a whole game with its own rules.',
      cta: 'See how',
    },
    share: {
      name: 'Share',
      blurb:
        'Send an invite link that expires when you say. Publish a world so strangers can play it, or keep it private for your crew. Make a film of your space and send it anywhere.',
      cta: 'See how',
    },
  },
  rows: {
    football: {
      kicker: 'The icebreaker',
      title: '10 strangers, one ball, no name tags',
      body: 'Nobody wants to introduce themselves in a circle. Lay a pitch instead. The game starts the moment the second person walks in, one browser owns the ball so nobody plays against the lag, and nothing anywhere keeps a ranking. By half time they’ve got something to talk about.',
      cta: 'Football, battles and races',
      alt: 'Six animals converging on a football from all sides of a grass pitch',
    },
    party: {
      kicker: 'The closing party',
      title: 'The bit everyone actually remembers',
      body: 'Lay the club, put a track on, flip the room into party mode. Everybody in it lights the place up in their own colour, the rig sweeps the floor, and whoever started it gets the rainbow. It’s a broadcast, not a setting — when it stops, there’s nothing to clean up.',
      cta: 'What’s in the lounge',
      alt: 'Two animals standing on a lit checkerboard dancefloor in a brick hall, coloured spotlights sweeping the walls behind them',
    },
    build: {
      kicker: 'Building',
      title: 'The room is the level editor',
      body: 'There is no separate build mode to go to. Fifty-eight pieces in the palette, and you place them standing in the world with everyone else still standing in it. Put the goalposts down and it’s a pitch. Save it, and it’s an arena you can drop into any space you own.',
      cta: 'How building works',
      alt: 'Three animals on a stone floor between two brick workstations with monitors on them',
    },
    link: {
      kicker: 'Doors open',
      title: 'One link, and they’re already inside',
      body: 'Put the door in the calendar invite, the Discord announcement, the group chat. Whoever opens it types a name, picks one of twenty-four animals, and walks in. Nothing to accept, nothing to install, no password to invent. Set it to knock first if you’d rather be asked.',
      cta: 'Links, rooms and members',
      alt: 'A panda, a penguin and a fox standing together on a small grass island, each with an emote over their head',
    },
  },
  screensHeader: {
    tag: 'Inside',
    title: 'And this is what it looks like when it’s yours',
    body: 'Four captures of the running thing: the room you walk around in, a game with a clock on it and a door into it, the page you post on between visits, and the studio for making a film of the place to send to whoever wasn’t there.',
  },
  screens: {
    lounge: {
      kicker: 'The room',
      title: 'It’s one page, and the room is in it',
      body: 'No launcher, no second window, nothing to install. Down the left are the places you can walk into, in the middle you are standing in one of them, and down the right is whoever else is. The switch in the corner turns the same room into a battle and back again. Put a record on and the radio plays into the room rather than into your headphones — so walking in is how you hear it.',
      cta: 'What there is to do',
      alt: 'The app in a browser: a panda standing in a brick-walled lounge in the middle, a left rail listing the rooms and tools, a right rail showing who is here and what is on the radio, and a switch in the corner reading Battle, switch to creative',
    },
    level: {
      kicker: 'A game, and a door into it',
      title: 'Hand somebody the link and they’re on the start line',
      body: 'A level is a room with a clock. Two people at the line is enough to start, and nothing eliminates you — the person in last place is still running at the end, which is the whole reason anybody finishes. The rail on the right makes a door into exactly this one: a link, or a code somebody points a phone at. No account, no install, no password to invent.',
      cta: 'Links, rooms and members',
      alt: 'A parkour level called Ladder Run waiting to start, a clock running above it, a panel saying nobody has taken a seat yet, and a right rail of guest links with a QR code to point a camera at',
    },
    space: {
      kicker: 'The space',
      title: 'A board, the places, and whoever is around',
      body: 'Somebody posts the clip of the goal. Somebody says the radio is on all afternoon and they are ignoring most of the requests. Somebody left a crate in the middle of the lounge again. Down the left are the places you can walk into, down the right is who is in them — and the radio plays into the rooms rather than into your headphones, so walking into one is how you hear it.',
      cta: 'Rooms, members and links',
      alt: 'The board of a space called Alpha: a left rail listing the rooms and tools, three posts in the middle — one of them a clip of a goal scored in the world — and a right rail showing who is here and what is on the radio',
    },
    studio: {
      kicker: 'The studio',
      title: 'Give the cast a timeline, then press record',
      body: 'One row per animal, one for the camera, one for every block on the set. Scrub to a second and walk somebody across the floor, and it writes the walk that arrives exactly there. Hand them a line and they say it. What comes out is a film of your own space, with your own cast in it.',
      cta: 'What the studio makes',
      alt: 'The scene studio: a grass island with a penguin and a panda on it, and beside it a timeline where every animal has a row of coloured actions, over a panel of settings for the selected penguin',
    },
  },
  cues: {
    lead: 'The four controls sitting on that picture. Press one.',
    items: {
      walk: {
        label: 'Walk here',
        note: 'Click a spot on the ground, and it writes the walk that gets them there by the second the playhead is parked on. No numbers to type and no path to draw.',
      },
      drive: {
        label: 'Take control',
        note: 'Drive them yourself with WASD while the clock runs. Whatever they did is kept as a take — including the bit where you overshot and had to come back.',
      },
      lock: {
        label: 'Camera lock',
        note: 'The camera is riding the shot’s own keys. Let go of it and you can orbit the scene to look at something without moving a single one of them.',
      },
      key: {
        label: 'Key here',
        note: 'Frame it by eye, then save that framing as a camera key where the playhead is. The diamond that appears on the camera row is the one you just made.',
      },
    },
  },
  plan: {
    tag: 'The plan, out loud',
    title: 'A linkable web of 3D worlds',
    items: {
      xo: {
        name: 'xo',
        when: 'now',
        body: 'A lightweight multiplayer arcade. Games, a lounge, and VR. Join from a bare link in five seconds, without an account.',
      },
      xp: {
        name: 'xp',
        when: 'soon',
        body: 'The evolution. A web-based multiplayer creator for scenes that run on desktop, mobile, VR, and anything else with a screen. Even your fridge.',
      },
      runtime: {
        name: 'The Open Runtime',
        when: 'planned',
        body: 'The web’s superpower is linking. We plan to open-source the runtime and the adapters, so you can build your own spaces in whatever framework you already like.',
      },
    },
    closing:
      'That’s the end goal: worlds you can link to the way you link to a page. We are at the very start of it, and this is the part where you get to shape it.',
  },
  pricing: {
    tag: 'And yes, it costs something',
    title: 'Making a space is free. Keeping one isn’t.',
    body: 'You can make a space and look around it without paying anything — it just stays read-only until it has a plan. Joining somebody else’s space is always free, forever, for everyone.',
    event: {
      tag: 'Per event',
      price: 'from €200',
      note: 'One date, one room, one link. Quoted per event. Tell us the shape of it.',
      lines: [
        'The venue built to your brief before the doors open',
        'Your logos and posters on the walls, your colours in the lights',
        'One guest link for everyone you invited, with no accounts to create',
        'A pitch, a stage and a club in the same world, ready to switch to',
        'Someone reachable while it is actually running',
      ],
      cta: 'Tell us the date',
    },
    monthly: {
      per: '/ month',
      unlimitedLine: 'Invite as many people as you like, and members are free',
      cappedLine: 'Up to {n} people per space, and members are free',
      ctaOpen: 'Start now',
      ctaClosed: 'Join the beta',
      free: {
        tag: 'Try one',
        note: 'One space of your own, for you and somebody else. Yours, and it stays here.',
        lines: [
          'The lounge, with emotes and chat',
          'All against all, and races',
          'Shelve as many XPs as you like — play them when you upgrade',
          'Joining someone else’s space always costs nothing',
        ],
      },
      xo: {
        tag: 'Keep one',
        note: 'Per space you own. For the room that stays put — a server, a class, a crew that keeps turning up.',
        lines: [
          'Enough of you for teams and football',
          '20 rooms, plus your own worlds, scenes and radio',
          '4 XP places, and 3 XPs you can edit',
          '15 matches at once',
        ],
      },
      xp: {
        tag: 'Build one',
        note: 'Everything in xo, with room to build without counting.',
        lines: [
          'Everything in xo',
          '10 XP places, and as many XPs as you like to edit',
          '30 matches at once',
          'The XP player',
        ],
        soon: ['The XP editor', 'XP story', 'XP VR'],
      },
      soonLabel: 'Soon',
    },
  },
  steps: {
    title: 'Three steps and you’re in',
    items: [
      {
        title: 'Walk into the arcade.',
        body: 'The demo is a real space, open right now, with nothing to sign. Fight the greeters — Mo and Suri take it well. Take as long as you like.',
      },
      {
        title: 'Join the beta.',
        body: 'Use the code below once you’re in, and the first month is on us.',
      },
      {
        title: 'Send the link.',
        body: 'Bring somebody. It’s not much of an arcade on your own.',
      },
    ],
    code: BETA_CODE,
  },
  faq: {
    title: 'Questions? Fair enough.',
    items: [
      {
        q: 'Do my friends need an account?',
        a: 'No, and they never will. A guest opens the link, types a name, picks an animal and is standing in the room. No email is asked for at the door, because the room doesn’t need one — it needs something to write on their nameplate.',
      },
      {
        q: 'Do I have to install anything?',
        a: 'No. It’s a browser. Desktop, phone, tablet, headset.',
      },
      {
        q: 'What happens if I stop paying?',
        a: 'Nothing is closed. Every space, page and block stays exactly where it is and stays readable forever — only writing stops, and resuming brings it straight back with no migration and no restore step. That isn’t generosity: it falls out of an append-only log, where there is no delete to undo. The room your event happened in is still standing next year.',
      },
      {
        q: 'How many people fit?',
        a: 'Rooms have their own caps, and when one fills up new arrivals are routed to the emptiest room instead of being bounced. Guests on a link sit on top of your member count.',
      },
      {
        q: 'Is there VR?',
        a: 'Yes, in xo today — the lounge is walkable in a headset. The xp side gets it soon, and that one is said out loud on the Create page rather than buried here.',
      },
      {
        q: 'Can I run a conference, jam or party on it?',
        a: 'Yes, and we’ll build the venue to your brief before the doors open. That’s the €200 one — tell us about it and we’ll quote it.',
      },
      {
        q: 'Is it finished?',
        a: 'No. It’s a closed beta and there are things on this page marked soon because they are. Every page on this site has a “what it doesn’t do yet” section, and they are the sections worth reading.',
      },
    ],
  },
  closing: {
    title: 'Come and play. Bring somebody.',
    body: 'We’re just starting the closed beta and honestly, I’m happy to finally show it to anyone. Walk into the arcade first — it costs nothing and asks nothing. If you like it, join, and help me shape where it goes next.',
    ctaDemo: 'Come and play — free',
    ctaJoin: 'Join the beta',
  },
  footer: {
    impressum: 'Imprint',
    terms: 'Terms',
    privacy: 'Privacy',
    contact: 'Contact',
    signIn: 'Sign in',
    events: 'Events',
  },
}

/**
 * German.
 *
 * ---------------------------------------------------------------------------
 * "du", not "Sie" - and that is the repositioning, not a style preference
 * ---------------------------------------------------------------------------
 * This file used formal "Sie" throughout, for a stated reason: the page quoted
 * €200 events to conference organisers, and "du" picks a register the English
 * did not. That reason has gone. The page now opens with an arcade and puts
 * the event quote in a card near the bottom, and a German arcade that addresses
 * a stranger as "Sie" while inviting them to kick a ball about at 3am is
 * reading its own room wrong. The one place formality still belongs - the event
 * card, which is a business enquiry - keeps a plainer, less matey line rather
 * than switching register mid-page.
 *
 * Written rather than translated in a couple of places, and those are the ones
 * worth knowing about. The headline is the whole positioning and a literal
 * "Nicht zum Reden" loses the turn the "<3" is doing, so it is set as a pair of
 * clauses that still work as a stance. "Room" is the load-bearing word on the
 * English page and German has no single word that is both the physical room and
 * the informal one - "Raum" carries the space, which is the half that matters
 * here, so it is used throughout rather than alternated with "Zimmer".
 */
export const DE: LandingDict = {
  meta: {
    title: 'Nicht hier zum Reden <3 zum Spielen.',
    description:
      'Der schnellste Weg, online zusammen abzuhängen. Eine virtuelle Spielhalle für deine Crew, deinen Game Jam oder deine Community. Keine Downloads – Link schicken und in Sekunden mittendrin sein.',
  },
  nav: {
    play: 'Spielen',
    create: 'Bauen',
    share: 'Teilen',
    pricing: 'Preise',
    signIn: 'Anmelden',
    join: 'Beta beitreten',
  },
  hero: {
    eyebrowOpen: '👾 Closed Beta — komm rein, es ist offen',
    eyebrowClosed: '👾 Closed Beta — und du bist eingeladen',
    headlineLead: 'Nicht hier zum Reden <3',
    headlineAccent: 'zum Spielen.',
    sub: 'Der schnellste Weg, online zusammen abzuhängen. Eine virtuelle Spielhalle für deine Crew, deinen Game Jam oder deine Community. Keine Downloads – einfach einen Link schicken und in Sekunden mittendrin sein.',
    ctaDemo: 'Komm spielen – kostenlos',
    ctaJoin: 'Beta beitreten',
  },
  intro: {
    watch: 'Tour ansehen',
    dialogTitle: 'So funktioniert es',
    aiNote:
      'Enthält KI-generierte Inhalte: Stimme und Text stammen von einer KI, und die Bildschirmaufnahmen der echten App wurden mit KI nachbearbeitet.',
    close: 'Video schließen',
  },
  terms: {
    unlimitedMembers: 'So viele Leute, wie du magst',
    upToMembers: 'Bis zu {n} Leute',
    perSpace:
      'pro Space, und Gäste mit Link sind keine Mitglieder. Zu zweit um 3 Uhr nachts zählt auch.',
  },
  chips: {
    lounge: 'Lounge',
    football: 'Fußball',
    boardgames: 'Brettspiele',
    battles: 'Kämpfe',
    races: 'Rennen',
    tournaments: 'Turniere',
    cafe: 'Café',
  },
  holo: {
    loungeTitle: 'In der Lounge',
    loungeNote: 'Sag es ohne zu tippen',
    paletteTitle: 'Die Palette',
    paletteBlocks: 'Blöcke zum Bauen',
  },
  world: {
    tag: 'Menschen auf der Welt',
    title: 'Ein Space ist ein Link, kein Raum in einem Gebäude',
    body: 'Zwei Kollegen an einem Tisch oder sechs über drei Zeitzonen hinweg betreten dieselbe Lounge auf dieselbe Weise, und niemand installiert etwas. Du siehst die anderen sich bewegen, während sie sich bewegen, und niemand tippt – sie ziehen eine Grimasse, und du siehst sie über ihrem Kopf.',
  },
  featured: {
    sectionLabel: 'Jetzt los',
    tag: 'Hier ist was los',
    openNow: 'Jetzt geöffnet',
    opens: 'Öffnet am {date}',
    seeEvent: 'Event ansehen',
  },
  doorsHeader: {
    tag: 'Viel Spaß',
    title: 'Spielen. Bauen. Teilen.',
    body: 'Das ist im Grunde alles – ungefähr in der Reihenfolge, in der du es kennenlernst.',
  },
  doors: {
    play: {
      name: 'Spielen',
      blurb:
        'Einen Ball kicken, eine Parkour-Runde drehen, ein Match austragen, sich an ein Brettspiel setzen, im Café Espresso ziehen oder einfach den Garten pflegen. Ist alles schon gebaut. Du gehst einfach rein.',
      cta: 'Schau rein',
    },
    create: {
      name: 'Bauen',
      blurb:
        'Der Raum, in dem du stehst, ist der Editor. Setz Blöcke, während Leute darauf stehen, stell die Tore um und speichere es. Mit xp baust du ein ganzes Spiel mit eigenen Regeln.',
      cta: 'So geht’s',
    },
    share: {
      name: 'Teilen',
      blurb:
        'Schick einen Link, der abläuft, wann du sagst. Veröffentliche eine Welt, damit Fremde darin spielen können – oder behalte sie für deine Crew. Mach einen Film von deinem Space und schick ihn überallhin.',
      cta: 'So geht’s',
    },
  },
  rows: {
    football: {
      kicker: 'Das Eis brechen',
      title: '10 Fremde, ein Ball, keine Namensschilder',
      body: 'Niemand stellt sich gern im Stuhlkreis vor. Leg stattdessen ein Spielfeld aus. Das Spiel beginnt, sobald die zweite Person hereinkommt, ein Browser besitzt den Ball, also spielt niemand gegen die Latenz, und nirgendwo wird irgendwer bewertet. Zur Halbzeit haben sie ein Thema.',
      cta: 'Fußball, Kämpfe und Rennen',
      alt: 'Sechs Tiere laufen von allen Seiten eines Rasenfeldes auf einen Fußball zu',
    },
    party: {
      kicker: 'Die Abschlussparty',
      title: 'Das, woran sich am Ende wirklich alle erinnern',
      body: 'Bau den Club, leg einen Track auf, schalte den Raum in den Party-Modus. Jede Person darin leuchtet den Ort in ihrer eigenen Farbe aus, die Traverse streicht über den Boden, und wer angefangen hat, bekommt den Regenbogen. Es ist eine Übertragung, keine Einstellung – wenn sie aufhört, bleibt nichts aufzuräumen.',
      cta: 'Was in der Lounge steckt',
      alt: 'Zwei Tiere stehen auf einer beleuchteten Schachbrett-Tanzfläche in einer Backsteinhalle, farbige Scheinwerfer streichen über die Wände hinter ihnen',
    },
    build: {
      kicker: 'Bauen',
      title: 'Der Raum ist der Level-Editor',
      body: 'Es gibt keinen separaten Baumodus, in den du wechselst. Achtundfünfzig Teile in der Palette, und du setzt sie, während du selbst in der Welt stehst und alle anderen auch. Stell die Tore auf, und es ist ein Spielfeld. Speichere es, und es ist eine Arena, die du in jeden deiner Spaces laden kannst.',
      cta: 'Wie Bauen funktioniert',
      alt: 'Drei Tiere auf einem Steinboden zwischen zwei gemauerten Arbeitsplätzen mit Monitoren darauf',
    },
    link: {
      kicker: 'Türen auf',
      title: 'Ein Link, und sie stehen schon drin',
      body: 'Setz die Tür in die Kalendereinladung, die Discord-Ankündigung, den Gruppenchat. Wer sie öffnet, tippt einen Namen, wählt eines von vierundzwanzig Tieren und geht hinein. Nichts zu akzeptieren, nichts zu installieren, kein Passwort auszudenken. Stell den Link auf Anklopfen, wenn du lieber gefragt wirst.',
      cta: 'Links, Räume und Mitglieder',
      alt: 'Ein Panda, ein Pinguin und ein Fuchs stehen zusammen auf einer kleinen Grasinsel, jeder mit einem Emote über dem Kopf',
    },
  },
  screensHeader: {
    tag: 'Von innen',
    title: 'Und so sieht es aus, wenn es deins ist',
    body: 'Vier Aufnahmen vom laufenden Ding: der Raum, in dem du herumläufst, ein Spiel mit einer Uhr darüber und einer Tür hinein, die Seite, auf der ihr zwischen den Besuchen postet, und das Studio, um einen Film von dem Ort zu machen – für alle, die nicht dabei waren.',
  },
  screens: {
    lounge: {
      kicker: 'Der Raum',
      title: 'Es ist eine Seite, und der Raum ist darin',
      body: 'Kein Launcher, kein zweites Fenster, nichts zu installieren. Links sind die Orte, in die du gehen kannst, in der Mitte stehst du in einem davon, rechts steht, wer sonst noch da ist. Der Schalter in der Ecke macht aus demselben Raum eine Battle und wieder zurück. Leg eine Platte auf, und das Radio läuft in den Raum statt in deine Kopfhörer – du hörst es also, indem du hineingehst.',
      cta: 'Was es zu tun gibt',
      alt: 'Die App im Browser: ein Panda steht in der Mitte in einer Lounge mit Backsteinwand, links eine Leiste mit den Räumen und Werkzeugen, rechts eine Leiste mit allen Anwesenden und dem laufenden Radio, und in der Ecke ein Schalter mit Battle, zurück zu kreativ',
    },
    level: {
      kicker: 'Ein Spiel, und eine Tür hinein',
      title: 'Gib jemandem den Link, und er steht an der Startlinie',
      body: 'Ein Level ist ein Raum mit einer Uhr. Zwei Leute an der Linie reichen zum Start, und niemand fliegt raus – wer letzter ist, läuft am Ende immer noch, und genau deshalb kommt überhaupt jemand ins Ziel. Die Leiste rechts macht eine Tür in genau dieses Level: ein Link oder ein Code, auf den jemand sein Handy hält. Kein Konto, keine Installation, kein Passwort auszudenken.',
      cta: 'Links, Räume und Mitglieder',
      alt: 'Ein Parkour-Level namens Ladder Run wartet auf den Start, darüber läuft eine Uhr, ein Panel sagt, dass noch niemand Platz genommen hat, und rechts eine Leiste mit Gast-Links und einem QR-Code zum Draufhalten',
    },
    space: {
      kicker: 'Der Space',
      title: 'Ein Board, die Orte und wer gerade da ist',
      body: 'Jemand postet den Clip vom Tor. Jemand schreibt, das Radio läuft den ganzen Nachmittag und die meisten Wünsche werden ignoriert. Jemand hat schon wieder eine Kiste mitten in der Lounge stehen lassen. Links sind die Orte, in die du gehen kannst, rechts steht, wer drin ist – und das Radio läuft in die Räume statt in deine Kopfhörer, du hörst es also, indem du hineingehst.',
      cta: 'Räume, Mitglieder und Links',
      alt: 'Das Board eines Space namens Alpha: links eine Leiste mit den Räumen und Werkzeugen, in der Mitte drei Beiträge – einer davon ein Clip von einem Tor aus der Welt – und rechts eine Leiste mit allen Anwesenden und dem laufenden Radio',
    },
    studio: {
      kicker: 'Das Studio',
      title: 'Gib dem Ensemble eine Timeline und drück auf Aufnahme',
      body: 'Eine Zeile pro Tier, eine für die Kamera, eine für jeden Block im Set. Spul zu einer Sekunde und lauf jemanden über den Boden – und es schreibt den Weg, der genau dort ankommt. Gib ihnen einen Satz, und sie sagen ihn. Heraus kommt ein Film von deinem eigenen Space, mit deinem eigenen Ensemble darin.',
      cta: 'Was das Studio macht',
      alt: 'Das Szenen-Studio: links eine Grasinsel mit einem Pinguin und einem Panda, daneben eine Timeline, in der jedes Tier eine Zeile mit farbigen Aktionen hat, darüber ein Einstellungs-Panel für den ausgewählten Pinguin',
    },
  },
  cues: {
    lead: 'Die vier Regler, die auf diesem Bild liegen. Drück einen.',
    items: {
      walk: {
        label: 'Walk here',
        note: 'Klick auf eine Stelle am Boden, und es schreibt den Weg, der sie genau zu der Sekunde dorthin bringt, auf der der Playhead steht. Keine Zahlen zum Eintippen, kein Pfad zum Zeichnen.',
      },
      drive: {
        label: 'Take control',
        note: 'Steuere sie selbst mit WASD, während die Uhr läuft. Was dabei herauskommt, wird als Take behalten – auch die Stelle, an der du übers Ziel hinaus bist und zurückmusstest.',
      },
      lock: {
        label: 'Camera lock',
        note: 'Die Kamera hängt an den Keys des Shots. Lass sie los, und du kannst die Szene umkreisen und dir etwas ansehen, ohne einen einzigen davon zu verschieben.',
      },
      key: {
        label: 'Key here',
        note: 'Stell das Bild nach Augenmaß ein und sichere die Einstellung als Kamera-Key an der Stelle des Playheads. Der Diamant, der in der Kamera-Zeile auftaucht, ist der, den du gerade gemacht hast.',
      },
    },
  },
  plan: {
    tag: 'Der Plan, laut ausgesprochen',
    title: 'Ein verlinkbares Web aus 3D-Welten',
    items: {
      xo: {
        name: 'xo',
        when: 'jetzt',
        body: 'Eine leichtgewichtige Multiplayer-Spielhalle. Spiele, eine Lounge und VR. Aus einem nackten Link in fünf Sekunden drin, ganz ohne Konto.',
      },
      xp: {
        name: 'xp',
        when: 'bald',
        body: 'Die Weiterentwicklung. Ein webbasierter Multiplayer-Creator für Szenen, die auf Desktop, Handy, VR und allem anderen mit einem Bildschirm laufen. Auch auf deinem Kühlschrank.',
      },
      runtime: {
        name: 'Die Open Runtime',
        when: 'geplant',
        body: 'Die Superkraft des Webs ist das Verlinken. Wir wollen die Runtime und die Adapter quelloffen machen, damit du deine eigenen Spaces in dem Framework baust, das du ohnehin magst.',
      },
    },
    closing:
      'Das ist das Ziel: Welten, die man verlinken kann wie eine Seite. Wir stehen ganz am Anfang davon, und das ist der Teil, den du mitgestalten kannst.',
  },
  pricing: {
    tag: 'Und ja, es kostet etwas',
    title: 'Einen Space anzulegen ist kostenlos. Ihn zu behalten nicht.',
    body: 'Du kannst einen Space anlegen und dich darin umsehen, ohne etwas zu zahlen – er bleibt nur schreibgeschützt, bis er einen Tarif hat. Den Space von jemand anderem zu betreten ist immer kostenlos, für alle, für immer.',
    event: {
      tag: 'Pro Event',
      price: 'ab 200 €',
      note: 'Ein Datum, ein Raum, ein Link. Angebot pro Event. Sagt uns, wie es aussehen soll.',
      lines: [
        'Der Ort nach eurem Briefing gebaut, bevor die Türen aufgehen',
        'Eure Logos und Poster an den Wänden, eure Farben im Licht',
        'Ein Gäste-Link für alle Eingeladenen, ohne dass Konten angelegt werden',
        'Spielfeld, Bühne und Club in derselben Welt, jederzeit umschaltbar',
        'Jemand erreichbar, während es tatsächlich läuft',
      ],
      cta: 'Sagt uns das Datum',
    },
    monthly: {
      per: '/ Monat',
      unlimitedLine: 'Lade so viele Leute ein, wie du magst – Mitglieder sind kostenlos',
      cappedLine: 'Bis zu {n} Leute pro Space – Mitglieder sind kostenlos',
      ctaOpen: 'Jetzt starten',
      ctaClosed: 'Beta beitreten',
      free: {
        tag: 'Einen ausprobieren',
        note: 'Ein eigener Space, für dich und noch jemanden. Er gehört dir und er bleibt.',
        lines: [
          'Die Lounge, mit Emotes und Chat',
          'Jeder gegen jeden, und Rennen',
          'So viele XPs ins Magazin, wie du willst – spielen kannst du sie ab xo',
          'Der Space von jemand anderem kostet dich nie etwas',
        ],
      },
      xo: {
        tag: 'Einen behalten',
        note: 'Pro Space, der dir gehört. Für den Raum, der bleibt: ein Server, eine Klasse, eine Crew, die immer wieder auftaucht.',
        lines: [
          'Genug Leute für Teams und Fußball',
          '20 Räume, dazu eigene Welten, Szenen und Radio',
          '4 XP-Plätze und 3 XPs, die du bearbeiten kannst',
          '15 Matches gleichzeitig',
        ],
      },
      xp: {
        tag: 'Einen bauen',
        note: 'Alles aus xo, mit Platz zum Bauen, ohne zu zählen.',
        lines: [
          'Alles aus xo',
          '10 XP-Plätze und so viele XPs zum Bearbeiten, wie du willst',
          '30 Matches gleichzeitig',
          'Der XP-Player',
        ],
        soon: ['Der XP-Editor', 'XP Story', 'XP VR'],
      },
      soonLabel: 'Bald',
    },
  },
  steps: {
    title: 'Drei Schritte, und du bist drin',
    items: [
      {
        title: 'Geh in die Spielhalle.',
        body: 'Die Demo ist ein echter Space, gerade offen, ohne dass du etwas unterschreibst. Hau die Begrüßer um – Mo und Suri nehmen es sportlich. Lass dir Zeit.',
      },
      {
        title: 'Tritt der Beta bei.',
        body: 'Nutz den Code unten, sobald du drin bist, dann geht der erste Monat auf uns.',
      },
      {
        title: 'Schick den Link.',
        body: 'Bring jemanden mit. Allein ist es keine besonders gute Spielhalle.',
      },
    ],
    code: BETA_CODE,
  },
  faq: {
    title: 'Fragen? Verständlich.',
    items: [
      {
        q: 'Brauchen meine Leute ein Konto?',
        a: 'Nein, und das wird auch so bleiben. Ein Gast öffnet den Link, tippt einen Namen, wählt ein Tier und steht im Raum. An der Tür wird keine E-Mail-Adresse verlangt, weil der Raum keine braucht – er braucht nur etwas für das Namensschild.',
      },
      {
        q: 'Muss ich etwas installieren?',
        a: 'Nein. Es ist ein Browser. Desktop, Handy, Tablet, Headset.',
      },
      {
        q: 'Was passiert, wenn ich aufhöre zu zahlen?',
        a: 'Nichts wird geschlossen. Jeder Space, jede Seite und jeder Block bleibt genau dort, wo er ist, und bleibt für immer lesbar – nur das Schreiben endet, und wer fortsetzt, bekommt alles sofort zurück, ohne Migration und ohne Wiederherstellungsschritt. Das ist keine Großzügigkeit: Es folgt aus einem Append-only-Log, in dem es kein Löschen gibt, das man rückgängig machen müsste. Der Raum, in dem euer Event stattfand, steht nächstes Jahr noch.',
      },
      {
        q: 'Wie viele Leute passen rein?',
        a: 'Räume haben eigene Obergrenzen, und wenn einer voll ist, landen neue Gäste im leersten Raum statt vor der Tür. Gäste mit Link kommen zusätzlich zu deinen Mitgliedern dazu.',
      },
      {
        q: 'Gibt es VR?',
        a: 'Ja, heute schon in xo – die Lounge lässt sich mit dem Headset betreten. Die xp-Seite bekommt es bald, und das steht auf der Bauen-Seite ausdrücklich da statt hier versteckt.',
      },
      {
        q: 'Kann ich eine Konferenz, einen Jam oder eine Party darauf laufen lassen?',
        a: 'Ja, und wir bauen den Ort nach eurem Briefing, bevor die Türen aufgehen. Das ist der 200-€-Fall – sagt uns Bescheid, und wir machen ein Angebot.',
      },
      {
        q: 'Ist es fertig?',
        a: 'Nein. Es ist eine Closed Beta, und was auf dieser Seite „bald“ heißt, heißt auch wirklich bald. Auf jeder Seite hier steht ein Abschnitt „Was es noch nicht kann“ – und das sind die Abschnitte, die sich zu lesen lohnen.',
      },
    ],
  },
  closing: {
    title: 'Komm spielen. Bring jemanden mit.',
    body: 'Wir starten gerade erst in die Closed Beta, und ehrlich gesagt freue ich mich, es endlich zeigen zu können. Geh erst mal in die Spielhalle – das kostet nichts und verlangt nichts. Wenn es dir gefällt, komm dazu und hilf mir, zu gestalten, wohin es geht.',
    ctaDemo: 'Komm spielen – kostenlos',
    ctaJoin: 'Beta beitreten',
  },
  footer: {
    impressum: 'Impressum',
    terms: 'AGB',
    privacy: 'Datenschutz',
    contact: 'Kontakt',
    signIn: 'Anmelden',
    events: 'Events',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English page. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, LandingDict> = { en: EN, de: DE }

export function landingDict(locale: Locale): LandingDict {
  return DICTS[publicLocale(locale)]
}

/** Lives in `./fill` now; re-exported so this module's callers keep one import. */
export { fill } from '@/app/i18n/fill'
