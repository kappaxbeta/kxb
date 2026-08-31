import type { BattleMode } from '@/domain/battle/events'
import type { RoomIcon, RoomTint } from '@/domain/rooms/look'
import type { PlaceId } from '@kxb/peepz-world/places'
import type { Locale } from '@/domain/i18n/locale'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * The rail: the panel every page inside a space is read next to.
 *
 * The first surface behind the login to be translated, and deliberately so -
 * it is on screen the entire time somebody is in a workspace, so an English
 * rail beside a German page would make the whole app look half-done no matter
 * how much of the rest was finished.
 *
 * Two shapes in here are worth explaining, because both are the reason this is
 * hand-written TypeScript rather than a bag of keys:
 *
 *  - `inPlace` is a phrase per place rather than "In the {place}". German puts
 *    the article inside the phrase and it disagrees with itself by gender: *in
 *    der Lounge*, *im Café*, *im Garten* - and "home" is not a place-with-an-
 *    article at all, it is *zu Hause*. A template with a slot cannot say that,
 *    and would produce "In der Home" for somebody who has done nothing wrong.
 *    Bulgarian breaks the same way and in the same place: the article is a
 *    suffix on the noun, and *вкъщи* is not a preposition and a place at all.
 *  - `roles` translates what the account block prints under your name. It was
 *    rendering the database's own enum, which is English by construction.
 *
 * `RAIL_BG` carries the note on which person the app speaks in, because this is
 * the surface that set it - the rail is on screen the whole time, so whatever
 * it does, the app does.
 */
export interface RailDict {
  /** Screen-reader names for the four ways this panel opens and shuts. */
  openNav: string
  closeNav: string
  bringBack: string
  foldAway: string
  foldAwayLabel: string
  archived: string

  bands: {
    match: string
    thisEvent: string
    main: string
    places: string
    people: string
    whoIsHere: string
    /** "In the lounge" and friends. See the note above. */
    inPlace: Record<PlaceId, string>
  }

  /** The surfaces. Keyed by route rather than by position, so a reorder is free. */
  surfaces: {
    dashboard: string
    board: string
    pages: string
    tasks: string
    battle: string
    browse: string
    worlds: string
    studio: string
    streaks: string
    inMatch: string
  }

  places: Record<PlaceId, string>

  rooms: {
    /** `{n}` is how many rooms did not fit. */
    more: string
    newRoom: string
    namePlaceholder: string
    cancel: string
    open: string
    opening: string
    /** `{name}` is whose place you are standing in. */
    visitingLead: string
    visitingTail: string
    goHome: string

    /** The caption over the rooms kept at the top of the list. */
    pinnedHeading: string
    /**
     * The caption over the rooms in no group.
     *
     * Drawn only when there is at least one group above them - without one they
     * would look like the last group's rooms, and with no groups at all a
     * caption over the whole list says nothing.
     */
    ungroupedHeading: string
    /** `{name}` is the room. The title on your own pin control. */
    pin: string
    unpin: string
    /** The title on a room the space pinned. There is no control to offer. */
    pinnedBySpace: string
  }

  who: {
    walkIn: string
    /**
     * A match with no fighters seated yet.
     *
     * Its own phrase rather than reusing `walkIn`, which is advice for somebody
     * who is nowhere - and telling a person standing in a match to go into a
     * place is telling them to leave the one they are in.
     */
    noSeats: string
    nobodyElse: string
    you: string
    /** `{name}` is the person being shown out. */
    showOutTitle: string
    showOut: string
    here: string
  }

  /** How somebody's front door reads before you travel to it. */
  doors: {
    open: { word: string; title: string }
    knock: { word: string; title: string }
    closed: { word: string; title: string }
  }

  account: {
    menu: string
    members: string
    billing: string
    profile: string
    spaceSettings: string
    switchSpace: string
    signOut: string
    /** Under a name where the account has no address to print - a guest. */
    signedIn: string
    /** What you are in this space, printed under your name. */
    roles: Record<TenantRoleName, string>
  }

  /** Handing out a way in, and seeing who used one. */
  guests: {
    guestsIn: string
    /** `{name}` is the guest. */
    kickTitle: string
    kick: string

    links: string
    singleUse: string
    mustKnock: string
    intoMatch: string
    intoRoom: string
    knockNote: string
    createLink: string
    somethingWrong: string
    noLinks: string

    open: string
    singleEntry: string
    knockTag: string
    copy: string
    copied: string
    showCode: string
    hide: string
    revoke: string
    revokeTitle: string
    /** `{n}` is how many guests that link let in and are still inside. */
    revokeTitleWith: string
    /** `{uses}` entered, `{live}` still online, `{max}` the cap when there is one. */
    counts: string
    countsCapped: string

    /** Where a link puts somebody. A room keeps its own name. */
    landing: { room: string; match: string; lounge: string }
  }

  /**
   * The radio: what is on, who may change it, and what it can and cannot do.
   *
   * `inPlace` here is a *dative* phrase - "in the lounge", "at home" - rather
   * than a name, for the reason `bands.inPlace` is one: German needs the
   * article inside, and it disagrees by gender. Three sentences below take one.
   */
  radio: {
    tapTitle: string
    tapNote: string
    someoneOn: string
    playIt: string
    notNow: string
    neverAsk: string

    nothingOn: string
    onAir: string
    stopped: string
    aTrack: string
    /** `{place}` is one of `inPlace`. */
    onlyIn: string
    playingIn: string
    quietOutHere: string
    notInStep: string
    forRoomNotYou: string
    join: string
    muteForMe: string

    linkLabel: string
    linkPlaceholder: string
    onlyInHere: string
    narrowOn: string
    narrowOff: string
    cannotNarrow: string
    cannotNarrowNote: string
    putItOn: string
    stop: string
    resume: string
    refused: string

    help: {
      summary: string
      lead: string
      supported: string
      inStep: string
      outOfStep: string
      embedNote: string
      artistNote: string
      iphoneNote: string
    }

    inPlace: Record<PlaceId, string>
    thisRoom: string
    anotherRoom: string
  }

  /** The Play door: the shelf of levels, and what pressing one makes. */
  play: {
    looking: string
    emptyBody: string
    emptyCta: string
    opening: string
    runBattle: string
    battleNote: string
    standingNote: string
    takeDown: string
    nameLabel: string
    keepAsRoom: string
    keepNote: string
    /** A level whose author took "as a room" off it. */
    battleOnly: string
    /**
     * The other half: a cartridge with no match in it.
     *
     * Not the same sentence turned round, because it is not the same fact. A
     * `battleOnly` level is an author's choice about a world that could have
     * been a room; this is a *game whose rules are code* - the café, the house -
     * where there is nothing two sides could fight over. See `fightable`.
     */
    roomOnly: string
  }

  /** The way out of a wall you have been built into. */
  stuck: {
    ask: string
    done: string
    ballAsk: string
    ballDone: string
    noteWithBall: string
    note: string
  }

  /**
   * The Room tab: where you can go, what the one you are in plays, and how to
   * open another.
   *
   * `modes` is the battle lobby's own vocabulary, kept here so the rail does
   * not teach a second set of words for the same five games.
   */
  roomTab: {
    heading: string
    theLounge: string
    /** `{name}` is the room. Both the button's title and the field's label. */
    rename: string
    renameShort: string
    unlistedTag: string
    noneYet: string

    thisRoom: string
    unlisted: string
    unlistedNote: string
    unlistedNewNote: string

    plays: string
    /** `{to}` and `{from}` are version numbers. */
    updateOut: string
    updateOn: string
    updateDraft: string
    updateCta: string
    updateNote: string

    looking: string
    nothingElse: string
    now: string
    madeForThis: string
    cancel: string

    runMatch: string
    runMatchNote: string
    matchOn: string
    matchWaiting: string
    /** `{mode}` is one of `modes`, `{n}` the head count. */
    matchMeta: string
    turnOff: string
    playSomethingElse: string
    swapNote: string

    /** `{name}` is the room. Browser `confirm` text, so no markup. */
    confirmDeleteLevel: string
    confirmCloseRoom: string
    deleteRoom: string
    closeRoom: string

    changeLevel: string
    copying: string
    makeCopy: string
    copyNoteAdmin: string
    copyNoteMember: string

    namePlaceholder: string
    open: string
    opening: string
    openAnother: string

    pinForEveryone: string
    pinNote: string
    groupLabel: string
    groupPlaceholder: string
    groupNote: string
    /** Above the captions this space already uses. */
    groupExisting: string
    /** `{name}` is the room. The title on the row's face button. */
    faceOf: string
    /** The button's own word, beside "Rename". */
    faceShort: string
    iconLabel: string
    colourLabel: string
    /** The swatch that takes the colour off again. */
    colourNone: string
    /** Both pickers, one sentence: what these change and for whom. */
    faceNote: string
    /**
     * What each glyph is, for the picker's buttons.
     *
     * Named rather than left to a `title` on an English identifier, because a
     * grid of twenty-five line drawings is exactly the control a screen reader
     * user cannot guess their way around - and because `watergun` is not a word
     * in two of the three languages here.
     */
    icons: Record<RoomIcon, string>
    /** And each colour. */
    tints: Record<RoomTint, string>

    modes: Record<BattleMode, string>
  }

  /** The match you are standing in, at the top of the rail. */
  match: {
    /** The heading over the block, with a live dot beside it. */
    inThisMatch: string
    hideCode: string
    showCode: string
    copyLink: string
    /** `{host}` is the app's own address. */
    atJoin: string
    guestLinkLabel: string
    linkReady: string
    inviteGuest: string
    leave: string
    backToMatches: string
    restart: string
    restarting: string
    startsEveryoneOver: string
    endTheMatch: string
    ending: string
    endsForEveryone: string
    couldNotMakeLink: string
    thatDidNotWork: string
  }

  /** The shelf of levels, wherever it is drawn. */
  shelf: {
    taking: string
    takeIn: string
    gone: string
    updating: string
    /** `{v}` is the version being taken. */
    takeVersion: string
    puttingBack: string
    putBack: string
    freeplay: string
    noneTakenIn: string
    everythingElse: string
    /**
     * The words the shelf-of-cartridges view needs and the list does not.
     *
     * `shelfLabel` names the plain-button list that exists alongside the canvas
     * for anybody not using a pointer - see `components/cartridge/shelf.tsx`.
     */
    shelfLabel: string
    close: string
    noPicture: string

    /** Where a level came from, in the corner of its row. */
    sources: Record<'builtin' | 'space' | 'store', string>
    /** The store shelf's controls: the search box, and the chip that undoes
     * a source filter. The chips themselves reuse `sources`. */
    findALevel: string
    fromAll: string
    draft: string
    goneChip: string
    notHereAnyMore: string
    inYourMagazine: string
    /** `{from}` is the version held, `{to}` the one published. */
    updateOut: string
    /** `{n}` more than the picker's cap would draw. */
    moreInBrowse: string

    /**
     * The one-line summary of what a level is, read off the document.
     *
     * Its own words rather than the battle wizard's: this is the *short* form -
     * "1 vs all" where the wizard says "one against everyone" - because it goes
     * in a row that is already carrying a name and a source.
     */
    rules: {
      sides: Record<'ffa' | 'team' | 'one-vs-all', string>
      /** `{n}` is the score that ends it. */
      firstTo: string
      minutes: string
      /** `{n}` exactly, or `{min}` to `{max}`. */
      players: string
      playersRange: string
    }
  }

  /** What a notification says when the tab is in the background. */
  notify: {
    someone: string
    chat: string
    radio: string
    /** `{track}` is whatever the other tab is playing. */
    nowPlayingElsewhere: string
    trackBlocked: string
    playerFailed: string
  }

  /** The conversation panel, and the report form inside it. */
  chat: {
    talkingIn: string
    theLounge: string
    catchingUp: string
    nothingSaid: string
    say: string
    message: string
    send: string
    sending: string
    notSent: string
    report: string
    reportPlaceholder: string
    reportLabel: string
    sendReport: string
    reportSending: string
    reported: string
    cancel: string
  }

  /** `/battle` in the chat: the summon menu, and the interception it sends. */
  summon: {
    title: string
    who: string
    what: string
    nobodyHere: string
    loadingLevels: string
    noLevels: string
    summon: string
    summoning: string
    cancel: string
    /** `{name}` is the summoner, resolved from the room's roster. */
    inviteTitle: string
    inviteHint: string
    confirm: string
    deny: string
    someone: string
  }

  /** Answering the door, and letting yourself out of a space you were let into. */
  visitors: {
    atTheDoor: string
    letIn: string
    notNow: string
    thatDidNotWork: string
  }

  exit: {
    leaveSpace: string
    warning: string
    stay: string
    leave: string
    leaving: string
  }

  /** Which animal you are, chosen from the rail rather than from settings. */
  avatar: {
    youAre: string
    justHere: string
    onlyHere: string
    everywhere: string
    /** The door to the skin shop. No prices here - the shop quotes its own. */
    skinsLink: string
    skinsHint: string
  }

  /** The tools at the foot of the rail, and the door above them. */
  tabs: {
    chat: string
    room: string
    visitors: string
    toolsLabel: string
    play: string
    playHint: string
    close: string
    levels: string
    guestLinksNote: string
    party: { label: string; on: string; off: string }
    rainbow: { label: string; on: string; off: string }
    door: {
      away: string
      /** `{where}` is either this space's name or the space the door is in. */
      applies: string
      thisSpace: string
      letIn: string
      notNow: string
    }
  }
}

export const RAIL_EN: RailDict = {
  openNav: 'Open navigation',
  closeNav: 'Close navigation',
  bringBack: 'Bring the navigation back',
  foldAway: 'Fold the navigation away',
  foldAwayLabel: 'Fold away',
  archived: 'archived',

  bands: {
    match: 'Match',
    thisEvent: 'This event',
    main: 'Main navigation',
    places: 'Places',
    people: 'People',
    whoIsHere: 'Who is here',
    inPlace: {
      lounge: 'In the lounge',
      cafe: 'In the café',
      home: 'At home',
      outdoor: 'In the garden',
    },
  },

  surfaces: {
    dashboard: 'Dashboard',
    board: 'Board',
    pages: 'Pages',
    tasks: 'Tasks',
    battle: 'Battle',
    browse: 'Browse',
    worlds: 'Worlds',
    studio: 'Studio',
    streaks: 'Streaks',
    inMatch: 'In the match',
  },

  places: {
    lounge: 'Lounge',
    cafe: 'Café',
    home: 'Home',
    outdoor: 'Garden',
  },

  rooms: {
    more: '{n} more',
    newRoom: 'New room',
    namePlaceholder: 'Name the room',
    cancel: 'Cancel',
    open: 'Open',
    opening: 'Opening…',
    visitingLead: 'You are in',
    visitingTail: '’s place.',
    goHome: 'Go home',
    pinnedHeading: 'Pinned',
    ungroupedHeading: 'Other rooms',
    pin: 'Keep {name} at the top',
    unpin: 'Stop keeping {name} at the top',
    pinnedBySpace: 'Pinned for the whole space',
  },

  who: {
    walkIn: 'Walk into a place to see who is around.',
    noSeats: 'Nobody has taken a seat in this match yet.',
    nobodyElse: 'Nobody else, for now.',
    you: 'you',
    showOutTitle: 'Show {name} out',
    showOut: 'Show out',
    here: 'here',
  },

  doors: {
    open: { word: 'open', title: 'Open - walk straight in' },
    knock: { word: 'knock', title: 'Knock - they have to be home to answer' },
    closed: { word: 'closed', title: 'Closed - not letting anyone in' },
  },

  account: {
    menu: 'Account',
    members: 'Members',
    billing: 'Billing',
    profile: 'Your profile',
    spaceSettings: 'Space settings',
    switchSpace: 'Switch space',
    signOut: 'Sign out',
    signedIn: 'Signed in',
    roles: { owner: 'owner', admin: 'admin', member: 'member', guest: 'guest' },
  },

  tabs: {
    chat: 'Chat',
    room: 'Room',
    visitors: 'Visitors',
    toolsLabel: 'Rail tools',
    play: 'Play',
    playHint: 'a level →',
    close: 'Close',
    levels: 'Levels',
    guestLinksNote:
      'Guest links are an owner or admin thing. You can still answer the door for anybody who has been sent one.',
    party: {
      label: 'Party mode',
      on: 'Everyone is lit. Yours cycles — you started it.',
      off: 'Light everybody up. Nothing is saved.',
    },
    rainbow: {
      label: 'Rainbow world',
      on: 'The build is glass. Peeps and furniture are not.',
      off: 'Turn the blocks to rainbow glass. Nothing is saved.',
    },
    door: {
      away: 'Walk into your own home or garden to set the door. Out here there is no door that is yours to answer.',
      applies:
        'Applies to {where} and to your place only. Rooms that belong to nobody — the lounge — have no door.',
      thisSpace: 'this space',
      letIn: 'Let in',
      notNow: 'Not now',
    },
  },

  chat: {
    talkingIn: 'Talking in',
    theLounge: 'The lounge',
    catchingUp: 'Catching up…',
    nothingSaid: 'Nothing said yet.',
    say: 'Say something',
    message: 'Message',
    send: 'Send',
    sending: 'sending…',
    notSent: 'not sent',
    report: 'Report',
    reportPlaceholder: 'What is wrong with it?',
    reportLabel: 'Reason for reporting',
    sendReport: 'Send report',
    reportSending: 'Sending…',
    reported: 'Reported. An admin will look at it — the sender is not told who reported it.',
    cancel: 'Cancel',
  },

  summon: {
    title: 'Summon a match',
    who: 'Who fights',
    what: 'Which battle',
    nobodyHere: 'Nobody else is in the room with you. You can still summon a match and they can walk in.',
    loadingLevels: 'Looking at the shelf…',
    noLevels: 'No battle levels to summon here.',
    summon: 'Summon',
    summoning: 'Summoning…',
    cancel: 'Cancel',
    inviteTitle: '{name} summons you',
    inviteHint: 'Confirm and you are in the arena. Enter works too.',
    confirm: 'Fight',
    deny: 'Not now',
    someone: 'Somebody',
  },

  visitors: {
    atTheDoor: 'At the door',
    letIn: 'Let in',
    notNow: 'Not now',
    thatDidNotWork: 'That did not work',
  },

  exit: {
    leaveSpace: 'Leave this space',
    warning: 'This ends your visit. You will need a new link to come back.',
    stay: 'Stay',
    leave: 'Leave',
    leaving: 'Leaving…',
  },

  avatar: {
    youAre: 'You are',
    justHere: 'Just in this space',
    onlyHere: 'Only here. Everywhere else you are whatever your profile says.',
    everywhere:
      'Follows your account everywhere — the lounge, the café, and any level that asks for your own animal.',
    skinsLink: 'Skins',
    skinsHint: 'Character skins for levels and matches — bound to your account.',
  },

  roomTab: {
    heading: 'Rooms',
    theLounge: 'The lounge',
    rename: 'Rename {name}',
    renameShort: 'Rename',
    unlistedTag: 'unlisted',
    noneYet: 'No rooms yet — just the lounge.',

    thisRoom: 'This room',
    unlisted: 'Unlisted',
    unlistedNote:
      'Hidden from everyone else’s list. Anyone with the link can still come in.',
    unlistedNewNote: 'Only you and other admins see it in the list.',

    plays: 'Plays',
    updateOut: 'v{to} is out',
    updateOn: 'you are on v{from}',
    updateDraft: 'An unpublished draft — nobody has reviewed it.',
    updateCta: 'Update this room to v{to}',
    updateNote:
      'Ends any round in play. Only this room — another room on the same level stays where it is.',

    looking: 'Looking…',
    nothingElse: 'Nothing else to play here yet.',
    now: 'now',
    madeForThis: 'made for this',
    cancel: 'Cancel',

    runMatch: 'Run a match of this',
    runMatchNote:
      'A fixture in Battle, on this level. The room stays either way; the match closes when you do, or a day after kick-off.',
    matchOn: 'A match is on',
    matchWaiting: 'A match is waiting',
    matchMeta: '{mode} · {n} in →',
    turnOff: 'Turn the match off',
    playSomethingElse: 'Play something else here',
    swapNote: 'Ends any round in play. People already here see it when they reload.',

    confirmDeleteLevel:
      'Delete "{name}"? The room and its link go; the level itself is untouched.',
    confirmCloseRoom: 'Close "{name}"? What was built here is kept.',
    deleteRoom: 'Delete this room',
    closeRoom: 'Close this room',

    changeLevel: 'Change the level',
    copying: 'Copying…',
    makeCopy: 'Make my own copy',
    copyNoteAdmin:
      'Opens the editor on a copy. This room keeps playing what it plays until you point it at the copy.',
    copyNoteMember:
      'Opens the editor on a copy. This room is unchanged — an admin can point it at yours.',

    namePlaceholder: 'Name the room',
    open: 'Open',
    opening: 'Opening…',
    openAnother: '+ Open a room',

    pinForEveryone: 'Keep at the top for everyone',
    pinNote: 'Pinned rooms lead the Places list for everybody in the space.',
    groupLabel: 'Group',
    groupPlaceholder: 'No group',
    groupNote: 'Rooms sharing a group name are listed together. Empty for none.',
    groupExisting: 'Already in use',
    faceOf: 'How {name} is listed',
    faceShort: 'Look',
    iconLabel: 'Icon',
    colourLabel: 'Colour',
    colourNone: 'No colour',
    faceNote: 'How this room is drawn in everybody’s Places list.',
    icons: {
      lounge: 'Couch',
      cafe: 'Cup',
      home: 'House',
      hearth: 'Fireplace',
      stage: 'Stage',
      garden: 'Sprig',
      plant: 'Potted plant',
      sun: 'Sun',
      moon: 'Moon',
      globe: 'Globe',
      desk: 'Desk',
      board: 'Board',
      flask: 'Flask',
      music: 'Music',
      chat: 'Speech bubble',
      ball: 'Football',
      club: 'Club crest',
      battle: 'Crossed swords',
      watergun: 'Water pistol',
      cards: 'Cards',
      trophy: 'Trophy',
      tools: 'Spanner',
      book: 'Book',
      rocket: 'Rocket',
      star: 'Star',
    },
    tints: {
      violet: 'Violet',
      cyan: 'Cyan',
      emerald: 'Emerald',
      lime: 'Lime',
      amber: 'Amber',
      rose: 'Rose',
      fuchsia: 'Fuchsia',
      sky: 'Sky',
    },

    modes: {
      ffa: 'all vs all',
      team: 'teams',
      one_vs_all: '1 vs all',
      football: 'football',
      race: 'race',
    },
  },

  play: {
    looking: 'Looking…',
    emptyBody: 'No levels here yet. One takes an afternoon.',
    emptyCta: 'Make one →',
    opening: 'Opening…',
    runBattle: 'Run a battle',
    battleNote: 'A match in Battle. Closes when the host does, or a day after kick-off.',
    standingNote: 'Standing as a room, in Places and Rooms.',
    takeDown: 'Take the room down',
    nameLabel: 'What to call the room',
    keepAsRoom: 'Keep it as a room',
    keepNote: 'Stays in Places and Rooms until somebody takes it down.',
    battleOnly: 'This level is a game, not a place - its author set it to battles only.',
    roomOnly: 'This one is a place, not a match - keep it as a room and walk in.',
  },

  stuck: {
    ask: 'Stuck? Put me back at the door',
    done: 'Back at the door',
    ballAsk: '⚽ Ball stuck? Bring it back',
    ballDone: 'Fetching the ball…',
    noteWithBall: 'You go back to where you came in; the ball goes to the centre spot.',
    note: 'Moves you to where you came in. Nothing you have built is touched.',
  },

  radio: {
    tapTitle: 'Tap to start the radio',
    tapNote: 'Your browser will not start audio on its own — this is normal on iPhone.',
    someoneOn: 'Someone put the radio on.',
    playIt: 'Play it',
    notNow: 'Not now',
    neverAsk: 'Never ask me again',

    nothingOn:
      'Nothing on the radio. An owner or admin can put a track on and everybody here hears it from the same place.',
    onAir: 'On the radio',
    stopped: 'Stopped',
    aTrack: 'A track',
    onlyIn: 'Only {place} — the rest of the space is quiet.',
    playingIn: 'Playing {place}, not here. Walk in to hear it.',
    quietOutHere: 'Quiet out here — the radio plays in the rooms. Walk into one to hear it.',
    notInStep: ' · everyone starts at the beginning',
    forRoomNotYou: 'Playing for the room, not for you.',
    join: 'Join',
    muteForMe: 'Mute the radio for me',

    linkLabel: 'SoundCloud link',
    linkPlaceholder: 'Paste a SoundCloud link',
    onlyInHere: 'Only {place}',
    narrowOn: 'Just the people in here. Everywhere else stays quiet.',
    narrowOff: 'Off — everybody in the space hears it, wherever they are.',
    cannotNarrow: 'Only in this room',
    cannotNarrowNote:
      'Walk into a room to use this. Out here there is nowhere to narrow it to.',
    putItOn: 'Put it on',
    stop: 'Stop',
    resume: 'Resume',
    refused: 'That did not go through.',

    help: {
      summary: 'How the radio works',
      lead: 'Paste a link to a single track. Everybody in the space is asked before it plays for them — nobody is played at. Stopping remembers where the track got to, so resuming picks it up there.',
      supported: 'Supported',
      inStep: ' — in step for everyone',
      outOfStep: ' — plays, but not in step',
      embedNote:
        'Audiomack and hearthis.at only hand out an embed, with no way to move the playhead — so those start at the beginning for each person and the volume slider does not reach them. SoundCloud and Mixcloud can be steered, so everybody stays within about half a second of each other.',
      artistNote:
        'A link to an artist page rather than a track will be refused: it names a queue, not a song, and two people can end up on different items of it. Open the track itself and copy that address.',
      iphoneNote:
        'On iPhone, Safari will not let a page start audio by itself, so the radio asks for one tap before it plays. iOS also ignores in-page volume — use the phone’s own volume buttons.',
    },

    inPlace: {
      lounge: 'in the lounge',
      cafe: 'in the café',
      home: 'at home',
      outdoor: 'in the garden',
    },
    thisRoom: 'in this room',
    anotherRoom: 'in another room',
  },

  guests: {
    guestsIn: 'Guests in',
    kickTitle: 'Removes {name} now. They can return if their link is still live.',
    kick: 'Kick',

    links: 'Guest links',
    singleUse: 'Single entry only',
    mustKnock: 'Make them knock',
    intoMatch: 'Straight into this match',
    intoRoom: 'Straight into this room',
    knockNote:
      'They pick a name and an animal, then wait. Anyone in this space can let them in from the rail.',
    createLink: 'Create link',
    somethingWrong: 'Something went wrong',
    noLinks: 'No links yet.',

    open: 'Open',
    singleEntry: 'Single entry',
    knockTag: 'knock',
    copy: 'Copy',
    copied: 'Copied',
    showCode: 'Show code',
    hide: 'Hide',
    revoke: 'Revoke',
    revokeTitle: 'Kills the link',
    revokeTitleWith: 'Kills the link and removes {n} guest(s)',
    counts: '{uses} entered · {live} online',
    countsCapped: ' · {uses}/{max} used',

    landing: { room: 'A room', match: 'A match', lounge: 'The lounge' },
  },

  match: {
    inThisMatch: 'In this match',
    hideCode: 'Hide code',
    showCode: 'Show code',
    copyLink: 'Copy the link',
    atJoin: 'at {host}/join',
    guestLinkLabel: 'Guest link for this match',
    linkReady: 'Link ready',
    inviteGuest: 'Invite guest',
    leave: 'Leave',
    backToMatches: 'Back to matches',
    restart: 'Restart',
    restarting: 'Restarting…',
    startsEveryoneOver: 'Starts everyone over',
    endTheMatch: 'End the match',
    ending: 'Ending…',
    endsForEveryone: 'Ends it for everyone',
    couldNotMakeLink: 'Could not make a link',
    thatDidNotWork: 'That did not work',
  },

  shelf: {
    taking: 'Taking…',
    takeIn: 'Take in',
    shelfLabel: 'The levels this space can reach',
    close: 'Close',
    noPicture: 'Nobody has photographed this one yet.',
    gone: 'Whatever this named is not in this space any more. Nothing here can open it.',
    updating: 'Updating…',
    takeVersion: 'Take v{v}',
    puttingBack: 'Putting it back…',
    putBack: 'Put it back',
    freeplay: 'freeplay',
    noneTakenIn: 'Nothing taken in yet. Anything below can be, free, as many as you like.',
    everythingElse: 'Everything else',

    sources: { builtin: 'ours', space: 'this space', store: 'store' },
    findALevel: 'Find a level…',
    fromAll: 'all',
    draft: 'draft',
    goneChip: 'gone',
    notHereAnyMore: 'not here any more',
    inYourMagazine: 'In your magazine',
    updateOut: 'You have v{from}. v{to} is out.',
    moreInBrowse: '{n} more in Browse',

    rules: {
      sides: { ffa: 'all vs all', team: 'teams', 'one-vs-all': '1 vs all' },
      firstTo: 'first to {n}',
      minutes: '{n} min',
      players: '{n} players',
      playersRange: '{min}-{max} players',
    },
  },

  notify: {
    someone: 'Someone',
    chat: 'Chat',
    radio: 'Radio',
    nowPlayingElsewhere: 'Now playing in another tab: {track}',
    trackBlocked:
      'This track will not play here. It may be blocked in your region, or the uploader may have turned embedding off.',
    playerFailed: 'That player could not be loaded.',
  },
}

export const RAIL_DE: RailDict = {
  openNav: 'Navigation öffnen',
  closeNav: 'Navigation schließen',
  bringBack: 'Navigation zurückholen',
  foldAway: 'Navigation einklappen',
  foldAwayLabel: 'Einklappen',
  archived: 'archiviert',

  bands: {
    match: 'Match',
    thisEvent: 'Dieses Event',
    main: 'Hauptnavigation',
    places: 'Orte',
    people: 'Leute',
    whoIsHere: 'Wer ist da',
    inPlace: {
      lounge: 'In der Lounge',
      cafe: 'Im Café',
      home: 'Zu Hause',
      outdoor: 'Im Garten',
    },
  },

  surfaces: {
    dashboard: 'Übersicht',
    board: 'Pinnwand',
    pages: 'Seiten',
    tasks: 'Aufgaben',
    battle: 'Battle',
    browse: 'Stöbern',
    worlds: 'Welten',
    studio: 'Studio',
    streaks: 'Serien',
    inMatch: 'Im Match',
  },

  places: {
    lounge: 'Lounge',
    cafe: 'Café',
    home: 'Zuhause',
    outdoor: 'Garten',
  },

  rooms: {
    more: '{n} weitere',
    newRoom: 'Neuer Raum',
    namePlaceholder: 'Wie soll der Raum heißen?',
    cancel: 'Abbrechen',
    open: 'Öffnen',
    opening: 'Wird geöffnet …',
    visitingLead: 'Sie sind bei',
    visitingTail: ' zu Besuch.',
    goHome: 'Nach Hause',
    pinnedHeading: 'Angeheftet',
    ungroupedHeading: 'Weitere Räume',
    pin: '{name} oben behalten',
    unpin: '{name} nicht mehr oben behalten',
    pinnedBySpace: 'Für den ganzen Space angeheftet',
  },

  who: {
    walkIn: 'Gehen Sie in einen Ort, um zu sehen, wer da ist.',
    noSeats: 'Noch hat niemand in diesem Match einen Platz genommen.',
    nobodyElse: 'Sonst niemand, im Moment.',
    you: 'Sie',
    showOutTitle: '{name} hinausbegleiten',
    showOut: 'Hinausbegleiten',
    here: 'hier',
  },

  doors: {
    open: { word: 'offen', title: 'Offen – einfach hineingehen' },
    knock: { word: 'klopfen', title: 'Klopfen – es muss jemand zu Hause sein' },
    closed: { word: 'zu', title: 'Zu – niemand wird hereingelassen' },
  },

  account: {
    menu: 'Konto',
    members: 'Mitglieder',
    billing: 'Abrechnung',
    profile: 'Ihr Profil',
    spaceSettings: 'Space-Einstellungen',
    switchSpace: 'Space wechseln',
    signOut: 'Abmelden',
    signedIn: 'Angemeldet',
    roles: {
      owner: 'Inhaber',
      admin: 'Admin',
      member: 'Mitglied',
      guest: 'Gast',
    },
  },

  tabs: {
    chat: 'Chat',
    room: 'Raum',
    visitors: 'Besuch',
    toolsLabel: 'Werkzeuge der Leiste',
    play: 'Spielen',
    playHint: 'ein Level →',
    close: 'Schließen',
    levels: 'Level',
    guestLinksNote:
      'Gastlinks sind Sache der Inhaber und Admins. Die Tür aufmachen können Sie trotzdem, für alle, die einen bekommen haben.',
    party: {
      label: 'Partymodus',
      on: 'Alle leuchten. Ihre Farbe wechselt — Sie haben angefangen.',
      off: 'Alle zum Leuchten bringen. Nichts wird gespeichert.',
    },
    rainbow: {
      label: 'Regenbogenwelt',
      on: 'Der Bau ist aus Glas. Peeps und Möbel nicht.',
      off: 'Die Blöcke in Regenbogenglas verwandeln. Nichts wird gespeichert.',
    },
    door: {
      away: 'Gehen Sie in Ihr eigenes Zuhause oder Ihren Garten, um die Tür einzustellen. Hier draußen gibt es keine Tür, die Ihnen gehört.',
      applies:
        'Gilt für {where} und nur für Ihren eigenen Ort. Räume, die niemandem gehören — die Lounge — haben keine Tür.',
      thisSpace: 'diesen Space',
      letIn: 'Hereinlassen',
      notNow: 'Jetzt nicht',
    },
  },

  chat: {
    talkingIn: 'Gespräch in',
    theLounge: 'Die Lounge',
    catchingUp: 'Wird nachgeladen …',
    nothingSaid: 'Noch nichts gesagt.',
    say: 'Nachricht …',
    message: 'Nachricht',
    send: 'Senden',
    sending: 'wird gesendet …',
    notSent: 'nicht gesendet',
    report: 'Melden',
    reportPlaceholder: 'Was stimmt damit nicht?',
    reportLabel: 'Grund für die Meldung',
    sendReport: 'Meldung senden',
    reportSending: 'Wird gesendet …',
    reported:
      'Gemeldet. Ein Admin sieht sich das an — der Absender erfährt nicht, wer gemeldet hat.',
    cancel: 'Abbrechen',
  },

  summon: {
    title: 'Match einberufen',
    who: 'Wer kämpft',
    what: 'Welches Battle',
    nobodyHere:
      'Sonst ist niemand im Raum. Du kannst trotzdem ein Match einberufen — reinkommen geht immer.',
    loadingLevels: 'Regal wird durchgesehen …',
    noLevels: 'Hier gibt es keine Battle-Level zum Einberufen.',
    summon: 'Einberufen',
    summoning: 'Wird einberufen …',
    cancel: 'Abbrechen',
    inviteTitle: '{name} ruft dich',
    inviteHint: 'Bestätigen, und du bist in der Arena. Enter geht auch.',
    confirm: 'Kämpfen',
    deny: 'Jetzt nicht',
    someone: 'Jemand',
  },

  visitors: {
    atTheDoor: 'An der Tür',
    letIn: 'Hereinlassen',
    notNow: 'Jetzt nicht',
    thatDidNotWork: 'Das hat nicht geklappt',
  },

  exit: {
    leaveSpace: 'Diesen Space verlassen',
    warning: 'Damit endet Ihr Besuch. Sie brauchen einen neuen Link, um zurückzukommen.',
    stay: 'Bleiben',
    leave: 'Verlassen',
    leaving: 'Wird verlassen …',
  },

  avatar: {
    youAre: 'Sie sind',
    justHere: 'Nur in diesem Space',
    onlyHere: 'Nur hier. Überall sonst sind Sie das, was Ihr Profil sagt.',
    everywhere:
      'Gilt überall in Ihrem Konto — in der Lounge, im Café und in jedem Level, das nach Ihrem eigenen Tier fragt.',
    skinsLink: 'Skins',
    skinsHint: 'Charakter-Skins für Level und Matches — an Ihr Konto gebunden.',
  },

  roomTab: {
    heading: 'Räume',
    theLounge: 'Die Lounge',
    rename: '{name} umbenennen',
    renameShort: 'Umbenennen',
    unlistedTag: 'ungelistet',
    noneYet: 'Noch keine Räume — nur die Lounge.',

    thisRoom: 'Dieser Raum',
    unlisted: 'Ungelistet',
    unlistedNote:
      'Aus den Listen der anderen ausgeblendet. Wer den Link hat, kommt trotzdem herein.',
    unlistedNewNote: 'Nur Sie und andere Admins sehen ihn in der Liste.',

    plays: 'Spielt',
    updateOut: 'v{to} ist da',
    updateOn: 'Sie sind auf v{from}',
    updateDraft: 'Ein unveröffentlichter Entwurf — niemand hat ihn geprüft.',
    updateCta: 'Diesen Raum auf v{to} bringen',
    updateNote:
      'Beendet eine laufende Runde. Nur dieser Raum — ein anderer Raum auf demselben Level bleibt, wo er ist.',

    looking: 'Wird gesucht …',
    nothingElse: 'Hier gibt es noch nichts anderes zu spielen.',
    now: 'jetzt',
    madeForThis: 'dafür gemacht',
    cancel: 'Abbrechen',

    runMatch: 'Ein Match davon starten',
    runMatchNote:
      'Ein Spiel in Battle, auf diesem Level. Der Raum bleibt so oder so; das Match endet, wenn Sie gehen, oder einen Tag nach dem Anpfiff.',
    matchOn: 'Ein Match läuft',
    matchWaiting: 'Ein Match wartet',
    matchMeta: '{mode} · {n} dabei →',
    turnOff: 'Match beenden',
    playSomethingElse: 'Hier etwas anderes spielen',
    swapNote:
      'Beendet eine laufende Runde. Wer schon hier ist, sieht es beim Neuladen.',

    confirmDeleteLevel:
      '„{name}“ löschen? Der Raum und sein Link verschwinden; das Level selbst bleibt unberührt.',
    confirmCloseRoom: '„{name}“ schließen? Was hier gebaut wurde, bleibt erhalten.',
    deleteRoom: 'Diesen Raum löschen',
    closeRoom: 'Diesen Raum schließen',

    changeLevel: 'Level ändern',
    copying: 'Wird kopiert …',
    makeCopy: 'Eigene Kopie anlegen',
    copyNoteAdmin:
      'Öffnet den Editor mit einer Kopie. Dieser Raum spielt weiter, was er spielt, bis Sie ihn auf die Kopie zeigen lassen.',
    copyNoteMember:
      'Öffnet den Editor mit einer Kopie. Dieser Raum bleibt unverändert — ein Admin kann ihn auf Ihre Kopie zeigen lassen.',

    namePlaceholder: 'Wie soll der Raum heißen?',
    open: 'Öffnen',
    opening: 'Wird geöffnet …',
    openAnother: '+ Raum öffnen',

    pinForEveryone: 'Für alle oben behalten',
    pinNote: 'Angeheftete Räume stehen bei allen im Space ganz oben unter Orte.',
    groupLabel: 'Gruppe',
    groupPlaceholder: 'Keine Gruppe',
    groupNote: 'Räume mit demselben Gruppennamen stehen zusammen. Leer lassen für keine.',
    groupExisting: 'Bereits vergeben',
    faceOf: 'Wie {name} gelistet wird',
    faceShort: 'Aussehen',
    iconLabel: 'Symbol',
    colourLabel: 'Farbe',
    colourNone: 'Keine Farbe',
    faceNote: 'So wird dieser Raum in der Orte-Liste aller dargestellt.',
    icons: {
      lounge: 'Sofa',
      cafe: 'Tasse',
      home: 'Haus',
      hearth: 'Kamin',
      stage: 'Bühne',
      garden: 'Zweig',
      plant: 'Topfpflanze',
      sun: 'Sonne',
      moon: 'Mond',
      globe: 'Globus',
      desk: 'Schreibtisch',
      board: 'Tafel',
      flask: 'Kolben',
      music: 'Musik',
      chat: 'Sprechblase',
      ball: 'Fußball',
      club: 'Vereinswappen',
      battle: 'Gekreuzte Schwerter',
      watergun: 'Wasserpistole',
      cards: 'Karten',
      trophy: 'Pokal',
      tools: 'Schraubenschlüssel',
      book: 'Buch',
      rocket: 'Rakete',
      star: 'Stern',
    },
    tints: {
      violet: 'Violett',
      cyan: 'Cyan',
      emerald: 'Smaragd',
      lime: 'Limette',
      amber: 'Bernstein',
      rose: 'Rosé',
      fuchsia: 'Fuchsia',
      sky: 'Himmelblau',
    },

    modes: {
      ffa: 'alle gegen alle',
      team: 'Teams',
      one_vs_all: '1 gegen alle',
      football: 'Fußball',
      race: 'Rennen',
    },
  },

  play: {
    looking: 'Wird gesucht …',
    emptyBody: 'Hier gibt es noch keine Level. Eines ist an einem Nachmittag gemacht.',
    emptyCta: 'Eines bauen →',
    opening: 'Wird geöffnet …',
    runBattle: 'Battle starten',
    battleNote:
      'Ein Match in Battle. Endet, wenn der Host geht, oder einen Tag nach dem Anpfiff.',
    standingNote: 'Steht als Raum, in Orte und Räume.',
    takeDown: 'Raum abbauen',
    nameLabel: 'Wie der Raum heißen soll',
    keepAsRoom: 'Als Raum behalten',
    keepNote: 'Bleibt in Orte und Räume, bis jemand ihn abbaut.',
    battleOnly: 'Dieses Level ist ein Spiel, kein Ort - der Autor hat es auf Battles beschränkt.',
    roomOnly: 'Das hier ist ein Ort, kein Match - behalte es als Raum und geh hinein.',
  },

  stuck: {
    ask: 'Fest? Zurück an die Tür',
    done: 'Wieder an der Tür',
    ballAsk: '⚽ Ball fest? Zurückholen',
    ballDone: 'Ball wird geholt …',
    noteWithBall:
      'Sie kommen dorthin zurück, wo Sie hereingekommen sind; der Ball geht auf den Anstoßpunkt.',
    note: 'Bringt Sie dorthin zurück, wo Sie hereingekommen sind. Gebautes bleibt unberührt.',
  },

  radio: {
    tapTitle: 'Zum Starten des Radios tippen',
    tapNote:
      'Ihr Browser startet Ton nicht von allein — auf dem iPhone ist das normal.',
    someoneOn: 'Jemand hat das Radio angemacht.',
    playIt: 'Abspielen',
    notNow: 'Jetzt nicht',
    neverAsk: 'Nicht mehr fragen',

    nothingOn:
      'Nichts im Radio. Inhaber und Admins können einen Track auflegen, und alle hier hören ihn von derselben Stelle.',
    onAir: 'Im Radio',
    stopped: 'Gestoppt',
    aTrack: 'Ein Track',
    onlyIn: 'Nur {place} — im Rest des Space bleibt es still.',
    playingIn: 'Läuft {place}, nicht hier. Gehen Sie hinein, um es zu hören.',
    quietOutHere:
      'Hier draußen ist es still — das Radio spielt in den Räumen. Gehen Sie in einen hinein.',
    notInStep: ' · alle fangen von vorn an',
    forRoomNotYou: 'Läuft für den Raum, nicht für Sie.',
    join: 'Mithören',
    muteForMe: 'Radio für mich stummschalten',

    linkLabel: 'SoundCloud-Link',
    linkPlaceholder: 'SoundCloud-Link einfügen',
    onlyInHere: 'Nur {place}',
    narrowOn: 'Nur die Leute hier drin. Überall sonst bleibt es still.',
    narrowOff: 'Aus — alle im Space hören mit, wo sie auch sind.',
    cannotNarrow: 'Nur in diesem Raum',
    cannotNarrowNote:
      'Gehen Sie dafür in einen Raum. Hier draußen gibt es nichts, worauf man es eingrenzen könnte.',
    putItOn: 'Auflegen',
    stop: 'Stopp',
    resume: 'Weiter',
    refused: 'Das ist nicht durchgegangen.',

    help: {
      summary: 'Wie das Radio funktioniert',
      lead: 'Fügen Sie den Link zu einem einzelnen Track ein. Alle im Space werden gefragt, bevor er bei ihnen spielt — niemand wird beschallt. Beim Stoppen wird gemerkt, wo der Track war, und es geht dort weiter.',
      supported: 'Unterstützt',
      inStep: ' — für alle im Gleichtakt',
      outOfStep: ' — spielt, aber nicht im Gleichtakt',
      embedNote:
        'Audiomack und hearthis.at geben nur ein Embed heraus, ohne Zugriff auf die Abspielposition — dort fängt es bei jedem von vorn an, und der Lautstärkeregler erreicht sie nicht. SoundCloud und Mixcloud lassen sich steuern, da bleiben alle etwa eine halbe Sekunde beieinander.',
      artistNote:
        'Ein Link auf eine Künstlerseite statt auf einen Track wird abgelehnt: er benennt eine Warteschlange, kein Lied, und zwei Leute können bei verschiedenen Stücken landen. Öffnen Sie den Track selbst und kopieren Sie dessen Adresse.',
      iphoneNote:
        'Auf dem iPhone lässt Safari eine Seite den Ton nicht selbst starten, deshalb bittet das Radio um ein Tippen. iOS ignoriert außerdem die Lautstärke in der Seite — nehmen Sie die Tasten am Telefon.',
    },

    inPlace: {
      lounge: 'in der Lounge',
      cafe: 'im Café',
      home: 'zu Hause',
      outdoor: 'im Garten',
    },
    thisRoom: 'in diesem Raum',
    anotherRoom: 'in einem anderen Raum',
  },

  guests: {
    guestsIn: 'Gäste da',
    kickTitle:
      'Entfernt {name} sofort. Solange der Link lebt, können sie zurückkommen.',
    kick: 'Rauswerfen',

    links: 'Gastlinks',
    singleUse: 'Nur ein Eintritt',
    mustKnock: 'Anklopfen lassen',
    intoMatch: 'Direkt in dieses Match',
    intoRoom: 'Direkt in diesen Raum',
    knockNote:
      'Sie wählen einen Namen und ein Tier und warten dann. Jede und jeder in diesem Space kann sie aus der Leiste hereinlassen.',
    createLink: 'Link erstellen',
    somethingWrong: 'Da ist etwas schiefgegangen',
    noLinks: 'Noch keine Links.',

    open: 'Offen',
    singleEntry: 'Ein Eintritt',
    knockTag: 'klopfen',
    copy: 'Kopieren',
    copied: 'Kopiert',
    showCode: 'Code zeigen',
    hide: 'Ausblenden',
    revoke: 'Zurückziehen',
    revokeTitle: 'Beendet den Link',
    revokeTitleWith: 'Beendet den Link und entfernt {n} Gast/Gäste',
    counts: '{uses} eingetreten · {live} online',
    countsCapped: ' · {uses}/{max} genutzt',

    landing: { room: 'Ein Raum', match: 'Ein Match', lounge: 'Die Lounge' },
  },

  match: {
    inThisMatch: 'In diesem Match',
    hideCode: 'Code ausblenden',
    showCode: 'Code zeigen',
    copyLink: 'Link kopieren',
    atJoin: 'auf {host}/join',
    guestLinkLabel: 'Gastlink für dieses Match',
    linkReady: 'Link bereit',
    inviteGuest: 'Gast einladen',
    leave: 'Verlassen',
    backToMatches: 'Zurück zu den Matches',
    restart: 'Neu starten',
    restarting: 'Wird neu gestartet …',
    startsEveryoneOver: 'Fängt für alle von vorn an',
    endTheMatch: 'Match beenden',
    ending: 'Wird beendet …',
    endsForEveryone: 'Beendet es für alle',
    couldNotMakeLink: 'Es konnte kein Link erstellt werden',
    thatDidNotWork: 'Das hat nicht geklappt',
  },

  shelf: {
    taking: 'Wird aufgenommen …',
    takeIn: 'Aufnehmen',
    shelfLabel: 'Die Level, die dieser Raum erreichen kann',
    close: 'Schließen',
    noPicture: 'Dieses Level hat noch niemand fotografiert.',
    gone: 'Was das hier benannt hat, ist nicht mehr in diesem Space. Nichts hier kann es öffnen.',
    updating: 'Wird aktualisiert …',
    takeVersion: 'v{v} nehmen',
    puttingBack: 'Wird zurückgelegt …',
    putBack: 'Zurücklegen',
    freeplay: 'freies Spiel',
    noneTakenIn:
      'Noch nichts aufgenommen. Alles unten kann es sein, kostenlos und so viel Sie wollen.',
    everythingElse: 'Alles andere',

    sources: { builtin: 'von uns', space: 'dieser Raum', store: 'Laden' },
    findALevel: 'Level finden …',
    fromAll: 'alle',
    draft: 'Entwurf',
    goneChip: 'weg',
    notHereAnyMore: 'nicht mehr hier',
    inYourMagazine: 'In Ihrem Magazin',
    updateOut: 'Sie haben v{from}. v{to} ist draußen.',
    moreInBrowse: '{n} weitere in Browse',

    rules: {
      sides: { ffa: 'alle gegen alle', team: 'Teams', 'one-vs-all': '1 gegen alle' },
      firstTo: 'erster bei {n}',
      minutes: '{n} Min.',
      players: '{n} Spielende',
      playersRange: '{min}-{max} Spielende',
    },
  },

  notify: {
    someone: 'Jemand',
    chat: 'Chat',
    radio: 'Radio',
    nowPlayingElsewhere: 'Läuft gerade in einem anderen Tab: {track}',
    trackBlocked:
      'Dieser Track lässt sich hier nicht abspielen. Vielleicht ist er in Ihrer Region gesperrt, oder die hochladende Person hat das Einbetten abgeschaltet.',
    playerFailed: 'Dieser Player konnte nicht geladen werden.',
  },
}

/**
 * Bulgarian, and the register the rest of the app follows.
 *
 * Formal - second person plural - everywhere except the tour, and that split is
 * inherited rather than invented: the German has made it since it was written,
 * and it is a decision about who is being spoken to rather than about how
 * casual the product is. Inside a space you are talking to somebody who has an
 * account, a role and other people's work in front of them; the tour is the one
 * screen that runs before any of that exists, and it is also meant for the
 * landing page, so it speaks the way marketing does. `promo/application.ts`
 * points here for the same reason.
 *
 * The product's own nouns are transliterated rather than left in Latin script -
 * спейс, пийп, лоундж - because Bulgarian declines them and a Latin word in the
 * middle of a Cyrillic sentence cannot take an ending. `xo`, `xp` and `XP` stay
 * as they are: those are names of things we sell, not words.
 */
export const RAIL_BG: RailDict = {
  openNav: 'Отвори навигацията',
  closeNav: 'Затвори навигацията',
  bringBack: 'Върни навигацията',
  foldAway: 'Прибери навигацията',
  foldAwayLabel: 'Прибери',
  archived: 'архивиран',

  bands: {
    match: 'Мач',
    thisEvent: 'Това събитие',
    main: 'Основна навигация',
    places: 'Места',
    people: 'Хора',
    whoIsHere: 'Кой е тук',
    inPlace: {
      lounge: 'В лоунджа',
      cafe: 'В кафенето',
      home: 'Вкъщи',
      outdoor: 'В градината',
    },
  },

  surfaces: {
    dashboard: 'Табло',
    board: 'Дъска',
    pages: 'Страници',
    tasks: 'Задачи',
    battle: 'Битка',
    browse: 'Разглеждане',
    worlds: 'Светове',
    studio: 'Студио',
    streaks: 'Серии',
    inMatch: 'В мача',
  },

  places: {
    lounge: 'Лоундж',
    cafe: 'Кафене',
    home: 'Дом',
    outdoor: 'Градина',
  },

  rooms: {
    more: 'още {n}',
    newRoom: 'Нова стая',
    namePlaceholder: 'Как да се казва стаята?',
    cancel: 'Отказ',
    open: 'Отвори',
    opening: 'Отваря се…',
    visitingLead: 'На гости сте при',
    visitingTail: '.',
    goHome: 'Към дома',
    pinnedHeading: 'Закачени',
    ungroupedHeading: 'Други стаи',
    pin: 'Дръж {name} най-отгоре',
    unpin: 'Не дръж {name} най-отгоре',
    pinnedBySpace: 'Закачена за целия екип',
  },

  who: {
    walkIn: 'Влезте в някое място, за да видите кой е наоколо.',
    noSeats: 'Още никой не е заел място в този мач.',
    nobodyElse: 'Никой друг, засега.',
    you: 'вие',
    showOutTitle: 'Изпратете {name} навън',
    showOut: 'Изпрати навън',
    here: 'тук',
  },

  doors: {
    open: { word: 'отворена', title: 'Отворена – влиза се направо' },
    knock: { word: 'чука се', title: 'Чука се – трябва да си е вкъщи, за да отвори' },
    closed: { word: 'затворена', title: 'Затворена – никого не пуска' },
  },

  account: {
    menu: 'Акаунт',
    members: 'Членове',
    billing: 'Плащания',
    profile: 'Вашият профил',
    spaceSettings: 'Настройки на спейса',
    switchSpace: 'Смени спейса',
    signOut: 'Изход',
    signedIn: 'Влезли сте',
    roles: {
      owner: 'собственик',
      admin: 'админ',
      member: 'член',
      guest: 'гост',
    },
  },

  tabs: {
    chat: 'Чат',
    room: 'Стая',
    visitors: 'Посетители',
    toolsLabel: 'Инструменти на лентата',
    play: 'Игра',
    playHint: 'ниво →',
    close: 'Затвори',
    levels: 'Нива',
    guestLinksNote:
      'Гост-линковете са работа на собственик или админ. Вратата пак може да отваряте — за всеки, на когото е бил изпратен един.',
    party: {
      label: 'Парти режим',
      on: 'Всички светят. Вашият цвят се сменя — вие започнахте.',
      off: 'Накарайте всички да светнат. Нищо не се запазва.',
    },
    rainbow: {
      label: 'Дъгов свят',
      on: 'Постройката е от стъкло. Пийповете и мебелите не са.',
      off: 'Превърнете блоковете в дъгово стъкло. Нищо не се запазва.',
    },
    door: {
      away: 'Влезте в собствения си дом или градина, за да настроите вратата. Тук навън няма врата, която да е ваша.',
      applies:
        'Важи за {where} и само за вашето място. Стаите, които не са на никого — лоунджът — нямат врата.',
      thisSpace: 'този спейс',
      letIn: 'Пусни',
      notNow: 'Не сега',
    },
  },

  chat: {
    talkingIn: 'Разговор в',
    theLounge: 'Лоунджът',
    catchingUp: 'Догонва се…',
    nothingSaid: 'Още нищо не е казано.',
    say: 'Съобщение…',
    message: 'Съобщение',
    send: 'Изпрати',
    sending: 'изпраща се…',
    notSent: 'не е изпратено',
    report: 'Докладвай',
    reportPlaceholder: 'Какво не е наред с него?',
    reportLabel: 'Причина за доклада',
    sendReport: 'Изпрати доклада',
    reportSending: 'Изпраща се…',
    reported:
      'Докладвано. Админ ще го погледне — подателят не разбира кой е докладвал.',
    cancel: 'Отказ',
  },

  summon: {
    title: 'Свикай мач',
    who: 'Кой се бие',
    what: 'Кое battle',
    nobodyHere:
      'Няма никой друг в стаята. Пак можеш да свикаш мач — влизането е винаги отворено.',
    loadingLevels: 'Преглеждане на рафта…',
    noLevels: 'Тук няма battle нива за свикване.',
    summon: 'Свикай',
    summoning: 'Свиква се…',
    cancel: 'Отказ',
    inviteTitle: '{name} те вика',
    inviteHint: 'Потвърди и си на арената. Enter също върши работа.',
    confirm: 'Бий се',
    deny: 'Не сега',
    someone: 'Някой',
  },

  visitors: {
    atTheDoor: 'На вратата',
    letIn: 'Пусни',
    notNow: 'Не сега',
    thatDidNotWork: 'Това не се получи',
  },

  exit: {
    leaveSpace: 'Напусни този спейс',
    warning: 'Това приключва посещението ви. Ще ви трябва нов линк, за да се върнете.',
    stay: 'Остани',
    leave: 'Напусни',
    leaving: 'Напуска се…',
  },

  avatar: {
    youAre: 'Вие сте',
    justHere: 'Само в този спейс',
    onlyHere: 'Само тук. Навсякъде другаде сте това, което казва профилът ви.',
    everywhere:
      'Следва акаунта ви навсякъде — лоунджа, кафенето и всяко ниво, което иска вашето собствено животно.',
    skinsLink: 'Скинове',
    skinsHint: 'Скинове за героя в нивата и мачовете — вързани към акаунта ви.',
  },

  roomTab: {
    heading: 'Стаи',
    theLounge: 'Лоунджът',
    rename: 'Преименувай {name}',
    renameShort: 'Преименувай',
    unlistedTag: 'скрита',
    noneYet: 'Още няма стаи — само лоунджът.',

    thisRoom: 'Тази стая',
    unlisted: 'Скрита',
    unlistedNote:
      'Скрита от списъка на всички останали. Всеки с линка пак може да влезе.',
    unlistedNewNote: 'Само вие и другите админи я виждате в списъка.',

    plays: 'Играе',
    updateOut: 'v{to} е излязла',
    updateOn: 'вие сте на v{from}',
    updateDraft: 'Непубликувана чернова — никой не я е проверявал.',
    updateCta: 'Обнови тази стая до v{to}',
    updateNote:
      'Прекратява всеки текущ рунд. Само тази стая — друга стая на същото ниво си остава, където е.',

    looking: 'Търси се…',
    nothingElse: 'Още няма какво друго да се играе тук.',
    now: 'сега',
    madeForThis: 'направено за това',
    cancel: 'Отказ',

    runMatch: 'Пусни мач по това',
    runMatchNote:
      'Среща в Битка, на това ниво. Стаята остава и в двата случая; мачът се затваря, когато затворите вие, или ден след началото.',
    matchOn: 'Върви мач',
    matchWaiting: 'Мач чака',
    matchMeta: '{mode} · {n} вътре →',
    turnOff: 'Изключи мача',
    playSomethingElse: 'Играй нещо друго тук',
    swapNote: 'Прекратява всеки текущ рунд. Хората вече тук го виждат при презареждане.',

    confirmDeleteLevel:
      'Да изтрия ли „{name}“? Стаята и линкът ѝ си отиват; самото ниво остава непокътнато.',
    confirmCloseRoom: 'Да затворя ли „{name}“? Построеното тук се запазва.',
    deleteRoom: 'Изтрий тази стая',
    closeRoom: 'Затвори тази стая',

    changeLevel: 'Смени нивото',
    copying: 'Копира се…',
    makeCopy: 'Направи мое копие',
    copyNoteAdmin:
      'Отваря редактора върху копие. Тази стая продължава да играе каквото играе, докато не я насочите към копието.',
    copyNoteMember:
      'Отваря редактора върху копие. Тази стая не се променя — админ може да я насочи към вашето.',

    namePlaceholder: 'Как да се казва стаята?',
    open: 'Отвори',
    opening: 'Отваря се…',
    openAnother: '+ Отвори стая',

    pinForEveryone: 'Дръж най-отгоре за всички',
    pinNote: 'Закачените стаи водят списъка „Места“ за всички в екипа.',
    groupLabel: 'Група',
    groupPlaceholder: 'Без група',
    groupNote: 'Стаите с едно и също име на група стоят заедно. Празно — без група.',
    groupExisting: 'Вече се използват',
    faceOf: 'Как е показана {name}',
    faceShort: 'Вид',
    iconLabel: 'Икона',
    colourLabel: 'Цвят',
    colourNone: 'Без цвят',
    faceNote: 'Така изглежда тази стая в списъка „Места“ на всички.',
    icons: {
      lounge: 'Диван',
      cafe: 'Чаша',
      home: 'Къща',
      hearth: 'Камина',
      stage: 'Сцена',
      garden: 'Клонка',
      plant: 'Саксия',
      sun: 'Слънце',
      moon: 'Луна',
      globe: 'Глобус',
      desk: 'Бюро',
      board: 'Дъска',
      flask: 'Колба',
      music: 'Музика',
      chat: 'Балонче',
      ball: 'Футболна топка',
      club: 'Клубен герб',
      battle: 'Кръстосани мечове',
      watergun: 'Воден пистолет',
      cards: 'Карти',
      trophy: 'Купа',
      tools: 'Гаечен ключ',
      book: 'Книга',
      rocket: 'Ракета',
      star: 'Звезда',
    },
    tints: {
      violet: 'Виолетово',
      cyan: 'Циан',
      emerald: 'Изумрудено',
      lime: 'Лайм',
      amber: 'Кехлибарено',
      rose: 'Розово',
      fuchsia: 'Фуксия',
      sky: 'Небесно',
    },

    modes: {
      ffa: 'всеки срещу всеки',
      team: 'отбори',
      one_vs_all: '1 срещу всички',
      football: 'футбол',
      race: 'състезание',
    },
  },

  play: {
    looking: 'Търси се…',
    emptyBody: 'Още няма нива тук. Едно отнема един следобед.',
    emptyCta: 'Направете едно →',
    opening: 'Отваря се…',
    runBattle: 'Пусни битка',
    battleNote:
      'Мач в Битка. Затваря се, когато затвори домакинът, или ден след началото.',
    standingNote: 'Стои като стая, в Места и Стаи.',
    takeDown: 'Свали стаята',
    nameLabel: 'Как да се казва стаята',
    keepAsRoom: 'Задръж я като стая',
    keepNote: 'Остава в Места и Стаи, докато някой не я свали.',
    battleOnly:
      'Това ниво е игра, а не място - авторът му го е пуснал само за битки.',
    roomOnly:
      'Това е място, а не мач - задръжте го като стая и влезте вътре.',
  },

  stuck: {
    ask: 'Заклещени? Върнете ме на вратата',
    done: 'Обратно на вратата',
    ballAsk: '⚽ Топката е заклещена? Върнете я',
    ballDone: 'Топката се прибира…',
    noteWithBall: 'Вие се връщате там, откъдето влязохте; топката отива в центъра.',
    note: 'Премества ви там, откъдето влязохте. Нищо построено не се пипа.',
  },

  radio: {
    tapTitle: 'Докоснете, за да пуснете радиото',
    tapNote: 'Браузърът ви няма да пусне звук сам — това е нормално на iPhone.',
    someoneOn: 'Някой пусна радиото.',
    playIt: 'Пусни го',
    notNow: 'Не сега',
    neverAsk: 'Никога не ме питай пак',

    nothingOn:
      'Радиото мълчи. Собственик или админ може да пусне парче и всички тук го чуват от едно и също място.',
    onAir: 'По радиото',
    stopped: 'Спряно',
    aTrack: 'Парче',
    onlyIn: 'Само {place} — останалата част от спейса е тиха.',
    playingIn: 'Свири {place}, не тук. Влезте, за да го чуете.',
    quietOutHere: 'Тук навън е тихо — радиото свири в стаите. Влезте в някоя, за да го чуете.',
    notInStep: ' · всички започват от началото',
    forRoomNotYou: 'Свири за стаята, не за вас.',
    join: 'Присъедини се',
    muteForMe: 'Заглуши радиото за мен',

    linkLabel: 'Линк към SoundCloud',
    linkPlaceholder: 'Поставете линк към SoundCloud',
    onlyInHere: 'Само {place}',
    narrowOn: 'Само хората тук. Навсякъде другаде остава тихо.',
    narrowOff: 'Изключено — всички в спейса го чуват, където и да са.',
    cannotNarrow: 'Само в тази стая',
    cannotNarrowNote:
      'Влезте в стая, за да използвате това. Тук навън няма към какво да го стесните.',
    putItOn: 'Пусни го',
    stop: 'Спри',
    resume: 'Продължи',
    refused: 'Това не мина.',

    help: {
      summary: 'Как работи радиото',
      lead: 'Поставете линк към едно парче. Всеки в спейса бива питан, преди да засвири за него — на никого не се пуска насила. Спирането помни докъде е стигнало парчето, така че продължаването го подхваща оттам.',
      supported: 'Поддържани',
      inStep: ' — в такт за всички',
      outOfStep: ' — свири, но не в такт',
      embedNote:
        'Audiomack и hearthis.at дават само вграждане, без начин да се мести главата — затова там всеки започва от началото, а плъзгачът за силата не ги достига. SoundCloud и Mixcloud може да се управляват, така че всички остават в рамките на около половин секунда един от друг.',
      artistNote:
        'Линк към страница на изпълнител, а не към парче, ще бъде отказан: той назовава опашка, не песен, и двама души може да свършат на различни неща от нея. Отворете самото парче и копирайте онзи адрес.',
      iphoneNote:
        'На iPhone Safari не позволява на страница да пусне звук сама, затова радиото иска едно докосване, преди да засвири. iOS освен това пренебрегва силата на звука в страницата — ползвайте бутоните на самия телефон.',
    },

    inPlace: {
      lounge: 'в лоунджа',
      cafe: 'в кафенето',
      home: 'вкъщи',
      outdoor: 'в градината',
    },
    thisRoom: 'в тази стая',
    anotherRoom: 'в друга стая',
  },

  guests: {
    guestsIn: 'Гости в',
    kickTitle: 'Премахва {name} веднага. Може да се върне, ако линкът му още е жив.',
    kick: 'Изгони',

    links: 'Гост-линкове',
    singleUse: 'Само едно влизане',
    mustKnock: 'Нека чукат',
    intoMatch: 'Направо в този мач',
    intoRoom: 'Направо в тази стая',
    knockNote:
      'Избират си име и животно, после чакат. Всеки в този спейс може да ги пусне от лентата.',
    createLink: 'Създай линк',
    somethingWrong: 'Нещо се обърка',
    noLinks: 'Още няма линкове.',

    open: 'Отворен',
    singleEntry: 'Едно влизане',
    knockTag: 'чукане',
    copy: 'Копирай',
    copied: 'Копирано',
    showCode: 'Покажи кода',
    hide: 'Скрий',
    revoke: 'Оттегли',
    revokeTitle: 'Убива линка',
    revokeTitleWith: 'Убива линка и премахва {n} гост(и)',
    counts: '{uses} влезли · {live} онлайн',
    countsCapped: ' · {uses}/{max} използвани',

    landing: { room: 'Стая', match: 'Мач', lounge: 'Лоунджът' },
  },

  match: {
    inThisMatch: 'В този мач',
    hideCode: 'Скрий кода',
    showCode: 'Покажи кода',
    copyLink: 'Копирай линка',
    atJoin: 'на {host}/join',
    guestLinkLabel: 'Гост-линк за този мач',
    linkReady: 'Линкът е готов',
    inviteGuest: 'Покани гост',
    leave: 'Напусни',
    backToMatches: 'Обратно към мачовете',
    restart: 'Рестарт',
    restarting: 'Рестартира се…',
    startsEveryoneOver: 'Започва всички отначало',
    endTheMatch: 'Прекрати мача',
    ending: 'Прекратява се…',
    endsForEveryone: 'Прекратява го за всички',
    couldNotMakeLink: 'Линкът не можа да се направи',
    thatDidNotWork: 'Това не се получи',
  },

  shelf: {
    taking: 'Прибира се…',
    takeIn: 'Прибери',
    shelfLabel: 'Нивата, до които този спейс стига',
    close: 'Затвори',
    noPicture: 'Това още никой не го е снимал.',
    gone: 'Каквото и да е назовавало това, вече не е в този спейс. Нищо тук не може да го отвори.',
    updating: 'Обновява се…',
    takeVersion: 'Вземи v{v}',
    puttingBack: 'Връща се…',
    putBack: 'Върни го',
    freeplay: 'свободна игра',
    noneTakenIn:
      'Още нищо не е прибрано. Всичко по-долу може да бъде, безплатно и колкото поискате.',
    everythingElse: 'Всичко останало',

    sources: { builtin: 'наше', space: 'този спейс', store: 'магазин' },
    findALevel: 'Намерете ниво…',
    fromAll: 'всички',
    draft: 'чернова',
    goneChip: 'няма го',
    notHereAnyMore: 'вече не е тук',
    inYourMagazine: 'В списанието ви',
    updateOut: 'Имате v{from}. v{to} е излязла.',
    moreInBrowse: 'още {n} в Разглеждане',

    rules: {
      sides: { ffa: 'всеки срещу всеки', team: 'отбори', 'one-vs-all': '1 срещу всички' },
      firstTo: 'първи до {n}',
      minutes: '{n} мин',
      players: '{n} играчи',
      playersRange: '{min}-{max} играчи',
    },
  },

  notify: {
    someone: 'Някой',
    chat: 'Чат',
    radio: 'Радио',
    nowPlayingElsewhere: 'Сега свири в друг таб: {track}',
    trackBlocked:
      'Това парче няма да свири тук. Може да е блокирано във вашия регион или качилият го да е изключил вграждането.',
    playerFailed: 'Този плейър не можа да се зареди.',
  },
}

const DICTS: Record<Locale, RailDict> = { en: RAIL_EN, de: RAIL_DE, bg: RAIL_BG }

export function railDict(locale: Locale): RailDict {
  return DICTS[locale]
}
