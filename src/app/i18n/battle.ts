import type { BattleMode } from '@/domain/battle/events'
import type { Locale } from '@/domain/i18n/locale'

/**
 * Matches: the hub, the wizard that makes one, the room you fight in, and the
 * three lists beside them - tournaments, challenges and battlefields.
 *
 * Its own dictionary because it is the largest surface in the app that is not a
 * world, and because its vocabulary is its own: a summon, an arena, a fixture,
 * a scrap. The rail already carries a small piece of it - `roomTab.modes`, five
 * words the Room tab prints - and those are deliberately the *short* forms. The
 * long ones are here, because a lobby has room for "one against everyone" and a
 * rail does not.
 *
 * A battle's own name is never translated, and neither is a preset: presets
 * come out of `@kxb/xp` and belong with the rest of that package.
 */
export interface BattleDict {
  title: string
  heading: string
  body: string
  tournaments: string
  challenges: string
  worlds: string
  battlefields: string
  scraps: string
  /** The way back, from a page beside the hub. */
  backToBattle: string

  /** The long form of each mode. The rail prints the short one. */
  modes: Record<BattleMode, string>

  lobby: {
    summon: string
    noMatches: string
    /** `{running}` of `{cap}` matches in play. */
    someRunning: string
    fourSteps: string
    full: string
    open: string
    /** `{n}` matches live right now. */
    liveNow: string
    nothingLive: string
    jumpIn: string
    nobodyFighting: string
    nobodyFightingYet: string
    joinAMatch: string
    onNow: string
    nothingRunning: string
    summonOneAbove: string
    watch: string
    join: string
    /** `{mode}`, `{arena}`, `{n}` fighters of `{cap}`. */
    meta: string
    lately: string

    theLounge: string
    anArena: string
    calledOff: string
    nobodyCameBack: string
    /** `{name}` was ahead when it lapsed. */
    aheadAbandoned: string
    aDraw: string
    /** `{name}` won it. */
    won: string
    somebody: string

    close: string
    closing: string
    really: string
    keep: string
  }

  /** Asking another space for a match. */
  challengeBoard: {
    title: string
    heading: string
    body: string
    toTournaments: string

    needOpenGround: string
    needAGround: string
    battlefields: string
    challengeASpace: string
    challengeBlurb: string
    open: string
    /** `{n}` challenges are waiting on you. */
    waitingCount: string
    nothingWaiting: string
    someoneAsked: string
    nobodyAsked: string
    answerThem: string
    waitingOnYou: string
    noneWaiting: string
    anotherSpace: string
    theirArena: string
    accept: string
    decline: string
    sent: string
    aSpace: string
    acceptedGo: string
    thatDidNotWork: string

    sending: string
    sendIt: string
    whoAreYouAsking: string
    pickAGround: string
    theyDecideNext: string
    noGroundYet: string
    theirAddress: string
    addressExample: string
    mode: string
    foughtOn: string
    onlyOpenGrounds: string
  }

  /** The football settings both the challenge sheet and the wizard ask for. */
  football: {
    /** `{n}` minutes on the clock. */
    clock: string
    /** `{n}` is the option, in minutes. */
    minutes: string
    firstTo: string
    goalsEndIt: string
    extras: string
    chargesHurt: string
    respawn: string
    chargesNote: string
  }

  /** A knockout bracket. */
  /** `{won}` of `{played}` matches, on the battle hub's board. */
  wonOf: string

  bracket: {
    title: string
    heading: string
    body: string
    toChallenges: string

    buildOne: string
    setUp: string
    setUpBlurb: string
    signUpWhileOpen: string
    noBracket: string
    noBracketVisitor: string
    enterABracket: string
    onTheBoard: string
    setOneUpAbove: string
    watch: string
    enter: string
    lately: string
    settingUp: string
    setItUp: string
    untitledCup: string
    sidesFromMarks: string
    everyRoundHere: string

    /** The four states a bracket can be in. */
    states: {
      signing: string
      running: string
      finished: string
      calledOff: string
    }

    withdraw: string
    enterIt: string
    drawBracket: string
    callItOff: string
    entrants: string
    nobodyYet: string
    final: string
    putItOn: string
    goFight: string
    takeResult: string
    replayIt: string
    thatDidNotWork: string

    /** The board itself: two doors, two lists. */
    one: string
    backToTournaments: string
    needsBattlefield: string
    open: string
    /** `{n}` brackets are on the board. */
    onTheBoardCount: string
    nothingOnTheBoard: string
    nothingRunning: string
    /** Singular and plural, because the translations have their own pairs. */
    entrantOne: string
    entrantMany: string
    /** Fallbacks for a ground the bracket names and the space no longer has. */
    aLevel: string
    anArena: string

    /** The set-up sheet. */
    nameTheTournament: string
    mode: string
    foughtOn: string
    orALevel: string
    noGroundYet: string
    levelsOwn: string
    /** Follows the level's name, which is drawn in its own span. */
    bringsItsOwn: string
    /** `{sides}` is one of the mode words. */
    itIs: string
    nameItFirst: string
    pickAGround: string
    openTheSignUps: string

    /** The bracket itself. */
    /** Follows the winner's name, which is drawn in its own span. */
    tookIt: string
    /** `{n}` is which round, counting from one. */
    round: string
    waitingOnEarlier: string
    bye: string
  }

  /** The two sides a mode can have, plus the two a champion match has. */
  sides: Record<'red' | 'blue' | 'champion' | 'challengers', string>

  /** The room a match is fought in. */
  room: {
    /** `{name}` is the match, `{n}` a count, `{time}` a clock reading. */
    calledOffBeforeStart: string
    raceNobodyHome: string
    /** `{time}` is ` in 1:23`, or empty. */
    homeFirst: string
    /** `{name}` got home first, `{time}` optional, `{tail}` what you did. */
    someoneHomeFirst: string
    /** `{place}` is an ordinal. */
    youCame: string
    youDidNotFinish: string
    /** `{line}` is the scoreline. */
    aDrawScore: string
    yourSideTookIt: string
    /** `{line}` and `{side}`. */
    scoreTo: string
    nobodyStanding: string
    lastStanding: string
    /** `{name}` was last standing. */
    someoneLastStanding: string
    /** `{side}` took it. */
    sideTookItYours: string
    sideTookIt: string

    /** The mode line on the strip and in the menu. */
    ffa: string
    team: string
    oneVsAll: string
    /** `{n}` minutes, `{tag}` a friendly/clean marker or empty. */
    football: string
    race: string
    friendly: string
    clean: string

    waitingToStart: string
    running: string
    fighting: string
    over: string
    calledOff: string

    noGoals: string
    noGoalsBody: string
    noGoalsLounge: string
    openArenaEditor: string
    noGoalsArena: string
    noCourse: string
    noCourseBody: string
    noCourseLounge: string
    noCourseArena: string
    knockoutLost: string
    goalLost: string
    finishLost: string
    finishNotCounted: string
    finishNotReached: string
    thatDidNotWork: string
    close: string

    time: string
    /** `{n}` home of `{of}`. */
    homeOf: string
    ft: string
    /** `{n}` is the score that ends it. */
    firstTo: string

    youWon: string
    aDraw: string
    matchOver: string
    rematchOn: string
    nobodyAskedRematch: string
    /** `{names}` want another go. */
    wantsAnotherGo: string
    wantAnotherGo: string
    rematch: string
    startRematch: string
    waitingForOneMore: string
    lookAround: string
    leave: string

    watchWithoutJoining: string
    alreadyFighting: string
    startedWithoutYou: string
    inRoomNotMatch: string
    joining: string
    joinTheMatch: string
    /** `{side}` to join. */
    joinSide: string
    onSide: string
    watch: string
    justWatch: string
    backToLobby: string

    closeMenu: string
    leaveTheRoom: string
    aDrawNobodyStanding: string
    /** `{name}` won it. */
    someoneWon: string
    nobodyYet: string
    join: string
    ready: string
    iAmReady: string
    forfeitWarning: string
    forfeit: string
    /** `{n}` people have to be ready. */
    needReady: string
    start: string
    /** `{n}` ready so far. */
    startCount: string
    endTheMatch: string
    callItOff: string
    backToTheMatch: string
    somebody: string
  }

  /** The room an XP match is fought in, which is a different game. */
  xpRoom: {
    /** The plain one, for a level whose rules give it no sides. */
    join: string
    joinRed: string
    joinBlue: string
    beChampion: string
    joinChallengers: string
    thatDidNotWork: string
    /** `{ready}` of `{needed}`, and `{here}` of `{seats}` in. */
    readyLine: string
    you: string
    iAmReady: string
    /** `{n}` at the line, `{tag}` naming the level when it wants more. */
    /**
     * `{seats}` fighters are already in it, so there is nowhere to stand.
     *
     * The room's own phrase, said *before* anybody presses anything. The server
     * has a refusal for this too, and by the time a visitor reads that one they
     * have already pressed the only two buttons they were offered.
     */
    battleFull: string
    needAtLine: string
    /** `{name}` is the level, `{n}` what it is built for. */
    builtFor: string
    /** `{names}` dropped out. */
    hasDropped: string
    haveDropped: string
    /** `{n}` seconds still held. */
    holdingOne: string
    holdingMany: string
    seatsHeld: string
    glow: string
    glowOn: string
    ready: string
    start: string
    waitingToStart: string
    nobodySeated: string
    everybodyReady: string
    everybodyReadyHost: string
    stillNotBack: string
    holdOn: string
    theirSeatIs: string
    theirSeatsAre: string
    playOn: string
    restarting: string
    restartMatch: string
    somebody: string
    /** `{names}` are back in the room. */
    isBack: string
    areBack: string
    matchOver: string
    startingAgain: string
    calledOff: string
    linedUpAgain: string
    nobodyCameBack: string
    noScoreOut: string
    rematchOn: string
    nobodyAskedRematch: string
    /** `{names}` want another go. */
    wantsAnotherGo: string
    wantAnotherGo: string
    playAgain: string
    startRematch: string
    waitingForOneMore: string
    backToLobby: string
  }

  /** What a match page says when its level will not load. */
  broken: {
    title: string
    label: string
    /** `{id}` is the reference the match names. */
    heading: string
    body: string
    /** Shown when the level is fine and the space's plan is not. */
    lockedHeading: string
    lockedBody: string
    backToLobby: string
    someone: string
  }

  /** The four- or five-step sheet that makes a match. */
  wizard: {
    heading: string
    close: string
    /** `{at}` of `{of}` steps, then what has been chosen so far. */
    stepOf: string
    steps: Record<'kind' | 'mode' | 'arena' | 'rules' | 'fighters' | 'xp' | 'config', string>

    /** Each mode, with the line under it in the picker. */
    modeBlurbs: Record<BattleMode, string>

    xoTitle: string
    xoBlurb: string
    xpTitle: string
    xpBlurb: string
    xpLockedBlurb: string
    /** `{price}` comes from the tiers table. */
    moveToXp: string
    comingSoon: string

    findALevel: string
    /** The five filters over the level list. */
    filters: Record<'yours' | 'magazine' | 'builtin' | 'space' | 'store', string>
    /**
     * Where a level came from, in the corner of its row.
     *
     * Lowercase and worded differently from `filters`, which is the same three
     * sources on a button. A chip beside a name is not a control.
     */
    sources: Record<'builtin' | 'space' | 'store', string>
    magazineChip: string
    thisSpaceDraft: string
    copying: string
    sharedWorld: string
    /** `{n}` is the score a level ends at. */
    ruleFirstTo: string
    ruleMinutes: string
    taking: string
    addToMagazine: string
    placesFull: string
    nothingMatches: string
    /**
     * The shelf, read out where the canvas cannot be.
     *
     * A `<canvas>` is one element with no children to assistive technology, so
     * the cartridges exist a second time as plain buttons and this names that
     * list. See `components/cartridge/shelf.tsx`.
     */
    shelfLabel: string
    /** The sheet a cartridge opens: its one loud button, and the way out. */
    pickThisLevel: string
    picked: string
    noPicture: string
    /** `{n}` more cards. */
    showMore: string
    showLess: string
    expand: string
    /** `{shown}` of `{total}`, and `{n}` more elsewhere. */
    counted: string
    moreInBrowse: string

    mode: string
    levelsOwn: string
    notOffered: string
    endsAt: string
    scoreTarget: string
    pointsNote: string
    clock: string
    timeLimitLabel: string
    minNote: string
    people: string
    fewest: string
    most: string
    /** `{min}` before it starts, `{max}` the level's own ceiling. */
    peopleNote: string
    thisMatchOnly: string
    fromTheLevel: string
    backToLevels: string
    pickALevelFirst: string
    /** `{name}` is the level. */
    levelRun: string
    fridayNight: string
    untitledSkirmish: string

    readyMadeCourse: string
    matchLength: string
    /** `{n}` minutes on the clock. */
    timeLimit: string
    raceEnds: string
    raceCharges: string
    /** `{mode}` has nothing to set. */
    nothingToSet: string

    /** `{n}` seats in the roster. */
    roster: string
    firstSeat: string
    onNow: string
    firstSeatTail: string
    recapMode: string
    recapArena: string
    recapRules: string
    /** `{n}` minutes, and `{score}` when there is a target. */
    recapMinutes: string
    recapFirstTo: string
    lastStanding: string

    cancel: string
    back: string
    summoning: string
    layingGround: string
    openTheDoors: string
    /** `{step}` is the next one's name. */
    next: string
    nameItFirst: string
    summon: string
    continue: string

    nameTheMatch: string
    whatIsItCalled: string
    anotherOne: string

    theLounge: string
    theLoungeBlurb: string
    loungeNote: string
    aGround: string
    hasGoals: string
    startAndFinish: string
    standardGround: string
    /** `{name}` is the arena. */
    yourArena: string
    fromAnotherSpace: string
    yours: string
    publishedByOthers: string
    searchArenas: string
    searchArenasLabel: string
    looking: string
    nothingPublished: string
    anotherSpace: string
    fromCatalogue: string
    searchShared: string
    searchSharedLabel: string
    catalogueNote: string
    nothingShared: string
  }

  /** The arenas a space keeps, and the ones other spaces have opened up. */
  fields: {
    title: string
    heading: string
    body: string
    buildTitle: string

    catalogueHeading: string
    catalogueBody: string
    browseAllWorlds: string
    /** `{name}` is the world being copied. */
    copying: string
    useAsBattlefield: string

    namePlaceholder: string
    working: string
    create: string
    yours: string
    noneYet: string
    nameOneAbove: string
    adminCanCreate: string
    empty: string
    /** `{n}` blocks, already grouped for the locale. */
    blocks: string
    openToOtherSpaces: string
    build: string
    makePrivate: string
    openToOthers: string
    /** `{name}` is the arena being retired. */
    retireConfirm: string
    retire: string

    openToEveryone: string
    searchPlaceholder: string
    search: string
    /** `{term}` is what was typed. */
    nothingMatching: string
    noneOpened: string
    /** `{name}` is the space it belongs to. */
    fromSpace: string
    fromAnotherSpace: string
    /** `{name}` is the world being reported. */
    reportPrompt: string
    reportSent: string
    reportThis: string
    thatDidNotWork: string
  }

  /** The panel a wizard step is drawn in. */
  sheet: { close: string; cancel: string }
}

export const BATTLE_EN: BattleDict = {
  title: 'Battle',
  heading: 'Battle',
  body: 'Scrap freely in the lounge, or make it a match.',
  tournaments: 'Tournaments',
  challenges: 'Challenges',
  worlds: 'Worlds',
  battlefields: 'Battlefields →',
  scraps: 'Scraps',
  backToBattle: '← Battle',

  modes: {
    ffa: 'all against all',
    team: 'teams',
    one_vs_all: 'one against everyone',
    football: 'football',
    race: 'race',
  },

  lobby: {
    summon: 'Summon a match',
    noMatches: 'This plan does not include matches.',
    someRunning: '{running} of {cap} running. Finish one to summon another.',
    fourSteps: 'Four steps. Mode, arena, rules, fighters.',
    full: 'Full',
    open: 'Open',
    liveNow: '{n} live now',
    nothingLive: 'nothing live',
    jumpIn: 'Jump straight into a running battle.',
    nobodyFighting: 'Nobody is fighting. Summon one and they will come.',
    nobodyFightingYet: 'Nobody is fighting yet. Check back in a bit.',
    joinAMatch: 'Join a match',
    onNow: 'On now',
    nothingRunning: 'Nothing running.',
    summonOneAbove: 'Summon one above.',
    watch: 'Watch',
    join: 'Join',
    meta: '{mode} · {arena} · {n}/{cap} fighters',
    lately: 'Lately',

    theLounge: 'the lounge',
    anArena: 'an arena',
    calledOff: 'called off',
    nobodyCameBack: 'nobody came back',
    aheadAbandoned: '{name} ahead, abandoned',
    aDraw: 'a draw',
    won: '{name} won',
    somebody: 'Somebody',

    close: 'Close',
    closing: 'Closing…',
    really: 'Really',
    keep: 'Keep',
  },

  fields: {
    title: 'Battlefields',
    heading: 'Battlefields',
    body: 'Worlds you build once and fight on many times.',
    buildTitle: 'Building a battlefield',

    catalogueHeading: 'Stages from the world catalogue',
    catalogueBody:
      'Places built in the block builder. Using one copies its blocks into a battlefield of your own — the original stays where it is.',
    browseAllWorlds: 'Browse all worlds →',
    copying: 'Copying “{name}”…',
    useAsBattlefield: 'Use as a battlefield',

    namePlaceholder: 'Name a new battlefield',
    working: 'Working…',
    create: 'Create',
    yours: 'Yours',
    noneYet: 'No battlefields yet.',
    nameOneAbove: 'Name one above and you land straight in the editor.',
    adminCanCreate: 'An owner or admin can create one.',
    empty: 'empty',
    blocks: '{n} blocks',
    openToOtherSpaces: 'open to other spaces',
    build: 'Build',
    makePrivate: 'Make private',
    openToOthers: 'Open to others',
    retireConfirm: 'Retire “{name}”?',
    retire: 'Retire',

    openToEveryone: 'Open to everyone',
    searchPlaceholder: 'Search arenas from other spaces',
    search: 'Search',
    nothingMatching: 'Nothing matching “{term}”.',
    noneOpened: 'No other space has opened up an arena yet.',
    fromSpace: 'from {name}',
    fromAnotherSpace: 'from another space',
    reportPrompt: 'What is wrong with “{name}”?',
    reportSent: 'Sent. An admin will take a look.',
    reportThis: 'Report this world',
    thatDidNotWork: 'That did not work',
  },

  sheet: { close: 'Close', cancel: 'Cancel' },

  challengeBoard: {
    title: 'Challenges',
    heading: 'Challenges',
    body: 'Ask another space for a match — friendly, but on the record.',
    toTournaments: 'Tournaments',

    needOpenGround:
      'Open one of your battlefields to other spaces first — a private one is a void to whoever you invite.',
    needAGround: 'Build a battlefield and open it to other spaces first.',
    battlefields: 'Battlefields',
    challengeASpace: 'Challenge a space',
    challengeBlurb: 'Their address, the mode, your ground.',
    open: 'Open',
    waitingCount: '{n} waiting on you',
    nothingWaiting: 'nothing waiting',
    someoneAsked: 'Another space has asked for a match. Accepting starts it.',
    nobodyAsked: 'Nobody has challenged you. Send one and see who bites.',
    answerThem: 'Answer them',
    waitingOnYou: 'Waiting on you',
    noneWaiting: 'Nobody has challenged you.',
    anotherSpace: 'Another space',
    theirArena: 'their arena',
    accept: 'Accept',
    decline: 'Decline',
    sent: 'Sent',
    aSpace: 'A space',
    acceptedGo: 'accepted — go →',
    thatDidNotWork: 'That did not work',

    sending: 'Sending…',
    sendIt: 'Send it',
    whoAreYouAsking: 'who are you asking?',
    pickAGround: 'pick a ground',
    theyDecideNext: 'they decide next',
    noGroundYet: 'no ground yet',
    theirAddress: 'Their space address',
    addressExample: 'acme',
    mode: 'Mode',
    foughtOn: 'Fought on',
    onlyOpenGrounds:
      'Only your grounds that are already open to other spaces — a private one is a void to whoever you invite.',
  },

  football: {
    clock: 'Clock · {n} min',
    minutes: '{n} min',
    firstTo: 'First to',
    goalsEndIt: 'goals ends it early. Empty leaves it to the clock.',
    extras: 'Extras',
    chargesHurt: 'Charges hurt',
    respawn: 'Respawn',
    chargesNote:
      'With charges off, the dash only moves the ball and no health drops. Either way nobody is knocked out of a football match — the score decides it.',
  },

  wonOf: '{won} won of {played}',

  bracket: {
    title: 'Tournaments',
    heading: 'Tournaments',
    body: 'A knockout bracket. Pairings are sign-up order — nothing here ranks anybody.',
    toChallenges: 'Challenges',

    buildOne: 'Build one',
    setUp: 'Set up a bracket',
    setUpBlurb: 'Three answers. Name, mode, ground.',
    signUpWhileOpen: 'Sign up while the bracket is still open.',
    noBracket: 'No bracket is running. Set one up and fill it.',
    noBracketVisitor: 'No bracket is running. Check back in a bit.',
    enterABracket: 'Enter a bracket',
    onTheBoard: 'On the board',
    setOneUpAbove: 'Set one up above.',
    watch: 'Watch',
    enter: 'Enter',
    lately: 'Lately',
    settingUp: 'Setting up…',
    setItUp: 'Set it up',
    untitledCup: 'Untitled cup',
    sidesFromMarks: 'Its sides are read off the spawn marks its author placed.',
    everyRoundHere:
      'Every round of the bracket is fought here. Pairings are sign-up order — nothing seeds anybody.',

    states: {
      signing: 'Signing up',
      running: 'Running',
      finished: 'Finished',
      calledOff: 'Called off',
    },

    withdraw: 'Withdraw',
    enterIt: 'Enter',
    drawBracket: 'Draw the bracket',
    callItOff: 'Call it off',
    entrants: 'Entrants',
    nobodyYet: 'Nobody yet.',
    final: 'Final',
    putItOn: 'Put it on',
    goFight: 'Go fight',
    takeResult: 'Take the result',
    replayIt: 'Replay it',
    thatDidNotWork: 'That did not work',

    one: 'Tournament',
    backToTournaments: '← Tournaments',
    needsBattlefield: 'A tournament needs a battlefield to be fought on.',
    open: 'Open',
    onTheBoardCount: '{n} on the board',
    nothingOnTheBoard: 'nothing on the board',
    nothingRunning: 'Nothing running.',
    entrantOne: 'entrant',
    entrantMany: 'entrants',
    aLevel: 'a level',
    anArena: 'an arena',

    nameTheTournament: 'Name the tournament',
    mode: 'Mode',
    foughtOn: 'Fought on',
    orALevel: 'or a level',
    noGroundYet: 'no ground yet',
    levelsOwn: "the level's own",
    bringsItsOwn: 'brings its own.',
    itIs: 'It is {sides}.',
    nameItFirst: 'name it first',
    pickAGround: 'pick a ground',
    openTheSignUps: 'open the sign-ups',

    tookIt: 'took it.',
    round: 'Round {n}',
    waitingOnEarlier: 'waiting on an earlier round',
    bye: 'bye',
  },

  wizard: {
    heading: 'Summon a match',
    close: 'Close',
    stepOf: 'Step {at} of {of}',
    steps: {
      kind: 'kind',
      mode: 'mode',
      arena: 'arena',
      rules: 'rules',
      fighters: 'fighters',
      xp: 'level',
      config: 'rules',
    },

    modeBlurbs: {
      ffa: 'Everyone for themselves. Last one standing takes it.',
      team: 'Split the room in two. Colours decide loyalty.',
      one_vs_all: 'One champion, the whole lounge against them.',
      football: 'Red against blue, with a ball. Most goals on the clock wins.',
      race: 'Start line to finish line. Everyone for themselves, dashing allowed.',
    },

    xoTitle: 'One of the built-in games',
    xoBlurb:
      'All against all, teams, one against everyone, football or a race — fought on a ground you pick.',
    xpTitle: 'Inside an XP',
    xpBlurb:
      'A level somebody made, with its own rules. It brings the mode with it, so there is less to decide.',
    xpLockedBlurb: 'A level somebody made, with its own rules. Part of the xp plan.',
    moveToXp: 'Move this space to xp — {price} →',
    comingSoon: 'Coming soon',

    findALevel: 'Find a level',
    sources: { builtin: 'ours', space: 'this space', store: 'store' },
    magazineChip: 'magazine',
    thisSpaceDraft: 'this space · draft',
    copying: 'copying…',
    sharedWorld: 'a shared world',
    filters: {
      yours: 'yours',
      magazine: 'magazine',
      builtin: 'ours',
      space: 'saved',
      store: 'store',
    },
    ruleFirstTo: 'first to {n}',
    ruleMinutes: '{n} min',
    taking: 'Taking…',
    addToMagazine: 'Add to magazine',
    placesFull: 'Your XP places are full — free one up to play it.',
    nothingMatches: 'Nothing matches. Clear the search, or try another source.',
    shelfLabel: 'Levels you can fight in',
    pickThisLevel: 'Fight in this one',
    picked: 'Picked',
    noPicture: 'Nobody has photographed this one yet.',
    showMore: 'Show {n} more',
    showLess: 'Show less',
    expand: 'Expand',
    counted: '{shown} of {total}',
    moreInBrowse: ' · {n} more in Browse',

    mode: 'Mode',
    levelsOwn: 'level’s own',
    notOffered: ' The modes this level has nothing to score on are not offered.',
    endsAt: 'Ends at',
    scoreTarget: 'Score target',
    pointsNote: 'points. Empty is a tally rather than a race.',
    clock: 'Clock',
    timeLimitLabel: 'Time limit in minutes',
    minNote: 'min. Empty leaves it to the score.',
    people: 'People',
    fewest: 'Fewest players',
    most: 'Most players',
    peopleNote:
      'Nobody starts it until {min} are ready. The level is built for up to {max}.',
    thisMatchOnly: 'This match only. The level itself is not changed.',
    fromTheLevel: 'These come from the level. Change any of them for this match.',
    backToLevels: 'Back to the level’s own',
    pickALevelFirst: 'Pick a level first.',
    levelRun: '{name} run',
    fridayNight: 'Friday night',
    untitledSkirmish: 'Untitled skirmish',

    readyMadeCourse: 'Or take a ready-made course ↗',
    matchLength: 'Match length in minutes',
    timeLimit: 'Time limit · {n} min',
    raceEnds:
      'The race ends when everyone is home, or when this runs out — whoever is still going is recorded as not having finished.',
    raceCharges:
      'Knock somebody out and they restart from the line, which is what makes a late dash worth landing. With charges off the dash only shoves — which on a narrow ledge is its own kind of rough.',
    nothingToSet:
      '{mode} has no clock and no target — it runs until there is one fighter, or one side, left standing. Nothing else to set.',

    roster: 'The roster · 1 of {n}',
    firstSeat:
      'You take the first seat. The rest fill from the hub — the match shows up under ',
    onNow: 'On now',
    firstSeatTail:
      ' the moment it exists, and anyone in the space can walk in until it starts.',
    recapMode: 'Mode',
    recapArena: 'Arena',
    recapRules: 'Rules',
    recapMinutes: '{n} min',
    recapFirstTo: ', first to {score}',
    lastStanding: 'Last one standing',

    cancel: 'Cancel',
    back: '← Back',
    summoning: 'Summoning…',
    layingGround: 'Laying the ground…',
    openTheDoors: 'open the doors',
    next: 'next: {step}',
    nameItFirst: 'name it first',
    summon: 'Summon',
    continue: 'Continue',

    nameTheMatch: 'Name the match',
    whatIsItCalled: 'What is it called?',
    anotherOne: 'Another one',

    theLounge: 'The lounge',
    theLoungeBlurb: 'Whatever your space has built. Bring your own goals.',
    loungeNote: 'The lounge, as your space has built it. Bring your own goals.',
    aGround: 'a ground',
    hasGoals: 'has goals',
    startAndFinish: 'start & finish',
    standardGround: 'A standard ground.',
    yourArena: 'Your arena “{name}”.',
    fromAnotherSpace: '“{name}”, from another space.',
    yours: 'Yours',
    publishedByOthers: 'Published by other spaces',
    searchArenas: 'Search arenas by name…',
    searchArenasLabel: 'Search published arenas by name',
    looking: 'Looking…',
    nothingPublished: 'Nothing published under that name.',
    anotherSpace: 'another space',
    fromCatalogue: 'From the world catalogue',
    searchShared: 'Search shared worlds by name…',
    searchSharedLabel: 'Search the world catalogue by name',
    catalogueNote:
      'Picking one copies it into this space as an arena, so it is yours to edit and to fight on again. Owners and admins only.',
    nothingShared: 'Nothing shared under that name.',
  },

  sides: { red: 'Red', blue: 'Blue', champion: 'The champion', challengers: 'Challengers' },

  room: {
    calledOffBeforeStart: 'The host called it off before it started.',
    raceNobodyHome: 'Time ran out with nobody home.',
    homeFirst: 'Home first{time}.',
    someoneHomeFirst: '{name} got home first{time}.{tail}',
    youCame: ' You came {place}.',
    youDidNotFinish: ' You did not finish.',
    aDrawScore: '{line}. A draw.',
    yourSideTookIt: '{line} — your side took it.',
    scoreTo: '{line} to {side}.',
    nobodyStanding: 'Nobody was left standing.',
    lastStanding: 'Last one standing.',
    someoneLastStanding: '{name} was the last one standing.',
    sideTookItYours: '{side} took it — your side.',
    sideTookIt: '{side} took it.',

    ffa: 'All against all',
    team: 'Red against blue',
    oneVsAll: 'One against everyone',
    football: 'Football · {n} min{tag}',
    race: 'Race · {n} min{tag}',
    friendly: ' · friendly',
    clean: ' · clean',

    waitingToStart: 'waiting to start',
    running: 'running',
    fighting: 'fighting',
    over: 'over',
    calledOff: 'called off',

    noGoals: 'This ground has no goals to score in.',
    noGoalsBody: 'A match needs a red and a blue goal. ',
    noGoalsLounge:
      'Open the lounge’s block picker — its Goals section stands both in one click.',
    openArenaEditor: 'Open this arena’s editor',
    noGoalsArena:
      ' and use the Goals section — or re-save the lounge as an arena, now that goals travel with it.',
    noCourse: 'This ground has no course on it.',
    noCourseBody: 'A race needs a start to line up on and a finish to run through. ',
    noCourseLounge:
      'Open the lounge’s block picker — its Marks section stands both, where you are standing.',
    noCourseArena:
      ' and use the Marks section: walk to the line, stand a start, walk the course, stand a finish.',
    knockoutLost:
      'Your knockout did not reach the server — the match may not end on its own.',
    goalLost: 'That goal did not reach the server.',
    finishLost: 'That finish did not register',
    finishNotCounted: 'The line did not count that yet. Run back through it.',
    finishNotReached: 'That finish did not reach the server. Run back through the line.',
    thatDidNotWork: 'That did not work',
    close: 'Close',

    time: 'Time',
    homeOf: '{n} home of {of}',
    ft: 'FT',
    firstTo: 'first to {n}',

    youWon: '🏆 You won',
    aDraw: 'A draw',
    matchOver: 'Match over',
    rematchOn: 'The rematch is on — go →',
    nobodyAskedRematch: 'Nobody has asked for another go yet.',
    wantsAnotherGo: '{names} wants another go.',
    wantAnotherGo: '{names} want another go.',
    rematch: 'Rematch',
    startRematch: 'Start the rematch',
    waitingForOneMore: 'You are in — waiting for one more.',
    lookAround: 'Look around',
    leave: 'Leave',

    watchWithoutJoining: 'Watch without joining',
    alreadyFighting: 'Already fighting',
    startedWithoutYou:
      'This one started without you — you can watch it out, or go back and find another.',
    inRoomNotMatch: 'You are in the room but not in the match. Want in?',
    joining: 'Joining…',
    joinTheMatch: 'Join the match',
    joinSide: 'Join {side}',
    onSide: 'On {side}',
    watch: 'Watch',
    justWatch: 'Just watch',
    backToLobby: 'Back to the lobby',

    closeMenu: 'Close the match menu',
    leaveTheRoom: 'Leave the room',
    aDrawNobodyStanding: 'A draw — nobody was left standing.',
    someoneWon: '{name} won.',
    nobodyYet: 'Nobody yet.',
    join: 'Join',
    ready: 'Ready ✓',
    iAmReady: 'I am ready',
    forfeitWarning: 'Leaving a live match counts as a defeat. Go?',
    forfeit: 'Forfeit',
    needReady: '{n} people have to be ready',
    start: 'Start',
    startCount: ' ({n} ready)',
    endTheMatch: 'End the match',
    callItOff: 'Call it off',
    backToTheMatch: 'Back to the match',
    somebody: 'Somebody',
  },

  xpRoom: {
    join: 'Join',
    joinRed: 'Join red',
    joinBlue: 'Join blue',
    beChampion: 'Be the champion',
    joinChallengers: 'Join the challengers',
    thatDidNotWork: 'That did not work',
    readyLine: '{ready}/{needed} ready · {here} of {seats} in',
    you: 'You',
    iAmReady: 'I am ready',
    battleFull:
      'This match already has its {seats} fighters. You can watch, or start one of your own.',
    needAtLine: '{n} people have to be at the line before this can start{tag}. You can walk around while you wait.',
    builtFor: ' — “{name}” is built for {n}',
    hasDropped: '{names} has dropped out.',
    haveDropped: '{names} have dropped out.',
    holdingOne: 'Holding the match for {n}s in case they come back.',
    holdingMany: 'Holding the match for {n}s in case they all come back.',
    seatsHeld: ' still held — they can walk straight back in. Or line up again without them.',
    glow: 'Glow',
    glowOn: 'Glow ✓',
    ready: 'Ready ✓',
    start: 'Start',
    waitingToStart: 'Waiting to start',
    nobodySeated: 'Nobody has taken a seat yet.',
    everybodyReady: 'Everybody is ready. Blow the whistle.',
    everybodyReadyHost: 'Everybody is ready — waiting for the host to start it.',
    stillNotBack: 'Still not back',
    holdOn: 'Hold on',
    theirSeatIs: 'Their seat is',
    theirSeatsAre: 'Their seats are',
    playOn: 'Play on',
    restarting: 'Restarting…',
    restartMatch: 'Restart the match',
    somebody: 'Somebody',
    isBack: '{names} is back.',
    areBack: '{names} are back.',
    matchOver: 'Match over',
    startingAgain: 'Starting again',
    calledOff: 'Called off',
    linedUpAgain: 'Somebody lined this one up again — taking you to it.',
    nobodyCameBack: 'Nobody came back to it, so it was closed a day later.',
    noScoreOut:
      'No score comes back out of an XP yet, so there is no result to print.',
    rematchOn: 'The rematch is on — go →',
    nobodyAskedRematch: 'Nobody has asked for another go yet.',
    wantsAnotherGo: '{names} wants another go.',
    wantAnotherGo: '{names} want another go.',
    playAgain: 'Play again',
    startRematch: 'Start the rematch',
    waitingForOneMore: 'You are in — waiting for one more.',
    backToLobby: 'Back to the lobby',
  },

  broken: {
    title: 'Match',
    label: 'Match · XP',
    heading: '{id} could not be loaded',
    body: 'This match is fought inside an XP that is missing or no longer parses. The match is still here; the level is not.',
    lockedHeading: 'This match is fought inside an XP',
    lockedBody: 'XP levels are part of the xp plan and this space is not on it, so there is nothing here to walk into. Move the space to xp and the match opens where it was meant to.',
    backToLobby: 'Back to the lobby',
    someone: 'Someone',
  },
}

export const BATTLE_DE: BattleDict = {
  title: 'Battle',
  heading: 'Battle',
  body: 'Rauft frei in der Lounge, oder macht ein Match daraus.',
  tournaments: 'Turniere',
  challenges: 'Herausforderungen',
  worlds: 'Welten',
  battlefields: 'Schlachtfelder →',
  scraps: 'Raufereien',
  backToBattle: '← Battle',

  modes: {
    ffa: 'alle gegen alle',
    team: 'Teams',
    one_vs_all: 'einer gegen alle',
    football: 'Fußball',
    race: 'Rennen',
  },

  lobby: {
    summon: 'Ein Match rufen',
    noMatches: 'Dieser Tarif enthält keine Matches.',
    someRunning: '{running} von {cap} laufen. Beenden Sie eines, um ein weiteres zu rufen.',
    fourSteps: 'Vier Schritte. Modus, Arena, Regeln, Kämpfer.',
    full: 'Voll',
    open: 'Öffnen',
    liveNow: '{n} laufen gerade',
    nothingLive: 'nichts läuft',
    jumpIn: 'Direkt in ein laufendes Battle springen.',
    nobodyFighting: 'Es kämpft niemand. Rufen Sie eines, und sie kommen.',
    nobodyFightingYet: 'Es kämpft noch niemand. Schauen Sie gleich noch mal vorbei.',
    joinAMatch: 'Einem Match beitreten',
    onNow: 'Läuft gerade',
    nothingRunning: 'Nichts läuft.',
    summonOneAbove: 'Rufen Sie oben eines.',
    watch: 'Zusehen',
    join: 'Mitmachen',
    meta: '{mode} · {arena} · {n}/{cap} Kämpfer',
    lately: 'Zuletzt',

    theLounge: 'der Lounge',
    anArena: 'einer Arena',
    calledOff: 'abgesagt',
    nobodyCameBack: 'niemand kam zurück',
    aheadAbandoned: '{name} vorn, abgebrochen',
    aDraw: 'unentschieden',
    won: '{name} hat gewonnen',
    somebody: 'Jemand',

    close: 'Schließen',
    closing: 'Wird geschlossen …',
    really: 'Wirklich',
    keep: 'Behalten',
  },

  fields: {
    title: 'Schlachtfelder',
    heading: 'Schlachtfelder',
    body: 'Welten, die Sie einmal bauen und viele Male bekämpfen.',
    buildTitle: 'Ein Schlachtfeld bauen',

    catalogueHeading: 'Bühnen aus dem Weltenkatalog',
    catalogueBody:
      'Orte, die im Blockbauer entstanden sind. Wer einen verwendet, kopiert seine Blöcke in ein eigenes Schlachtfeld — das Original bleibt, wo es ist.',
    browseAllWorlds: 'Alle Welten ansehen →',
    copying: '„{name}“ wird kopiert …',
    useAsBattlefield: 'Als Schlachtfeld verwenden',

    namePlaceholder: 'Ein neues Schlachtfeld benennen',
    working: 'Läuft …',
    create: 'Anlegen',
    yours: 'Ihre',
    noneYet: 'Noch keine Schlachtfelder.',
    nameOneAbove: 'Benennen Sie oben eines, und Sie landen direkt im Editor.',
    adminCanCreate: 'Eine Inhaberin oder ein Admin kann eines anlegen.',
    empty: 'leer',
    blocks: '{n} Blöcke',
    openToOtherSpaces: 'offen für andere Räume',
    build: 'Bauen',
    makePrivate: 'Privat machen',
    openToOthers: 'Für andere öffnen',
    retireConfirm: '„{name}“ ausmustern?',
    retire: 'Ausmustern',

    openToEveryone: 'Für alle offen',
    searchPlaceholder: 'Arenen aus anderen Räumen suchen',
    search: 'Suchen',
    nothingMatching: 'Nichts zu „{term}“.',
    noneOpened: 'Noch kein anderer Raum hat eine Arena geöffnet.',
    fromSpace: 'aus {name}',
    fromAnotherSpace: 'aus einem anderen Raum',
    reportPrompt: 'Was stimmt mit „{name}“ nicht?',
    reportSent: 'Gesendet. Ein Admin schaut sich das an.',
    reportThis: 'Diese Welt melden',
    thatDidNotWork: 'Das hat nicht geklappt',
  },

  sheet: { close: 'Schließen', cancel: 'Abbrechen' },

  challengeBoard: {
    title: 'Herausforderungen',
    heading: 'Herausforderungen',
    body: 'Einen anderen Space um ein Match bitten — freundschaftlich, aber verbindlich.',
    toTournaments: 'Turniere',

    needOpenGround:
      'Öffnen Sie zuerst eines Ihrer Schlachtfelder für andere Spaces — ein privates ist für die Eingeladenen ein Nichts.',
    needAGround: 'Bauen Sie zuerst ein Schlachtfeld und öffnen Sie es für andere Spaces.',
    battlefields: 'Schlachtfelder',
    challengeASpace: 'Einen Space herausfordern',
    challengeBlurb: 'Ihre Adresse, der Modus, Ihr Boden.',
    open: 'Öffnen',
    waitingCount: '{n} warten auf Sie',
    nothingWaiting: 'nichts wartet',
    someoneAsked: 'Ein anderer Space hat um ein Match gebeten. Annehmen startet es.',
    nobodyAsked: 'Niemand hat Sie herausgefordert. Schicken Sie eine und sehen Sie, wer anbeißt.',
    answerThem: 'Antworten',
    waitingOnYou: 'Warten auf Sie',
    noneWaiting: 'Niemand hat Sie herausgefordert.',
    anotherSpace: 'Ein anderer Space',
    theirArena: 'ihre Arena',
    accept: 'Annehmen',
    decline: 'Ablehnen',
    sent: 'Gesendet',
    aSpace: 'Ein Space',
    acceptedGo: 'angenommen — los →',
    thatDidNotWork: 'Das hat nicht geklappt',

    sending: 'Wird gesendet …',
    sendIt: 'Abschicken',
    whoAreYouAsking: 'wen fragen Sie?',
    pickAGround: 'wählen Sie einen Boden',
    theyDecideNext: 'jetzt entscheiden sie',
    noGroundYet: 'noch kein Boden',
    theirAddress: 'Adresse ihres Space',
    addressExample: 'acme',
    mode: 'Modus',
    foughtOn: 'Ausgetragen auf',
    onlyOpenGrounds:
      'Nur Ihre Böden, die bereits für andere Spaces offen sind — ein privater ist für die Eingeladenen ein Nichts.',
  },

  football: {
    clock: 'Uhr · {n} Min',
    minutes: '{n} Min',
    firstTo: 'Bis',
    goalsEndIt: 'Toren ist vorzeitig Schluss. Leer lassen, dann entscheidet die Uhr.',
    extras: 'Extras',
    chargesHurt: 'Stürme verletzen',
    respawn: 'Neu einsteigen',
    chargesNote:
      'Ohne Stürme bewegt der Sturmangriff nur den Ball, und es fällt kein Leben. So oder so wird beim Fußball niemand ausgeknockt — der Spielstand entscheidet.',
  },

  wonOf: '{won} von {played}',

  bracket: {
    title: 'Turniere',
    heading: 'Turniere',
    body: 'Ein K.-o.-Baum. Die Paarungen sind die Reihenfolge der Anmeldung — hier wird niemand gesetzt.',
    toChallenges: 'Herausforderungen',

    buildOne: 'Eines bauen',
    setUp: 'Einen Baum aufsetzen',
    setUpBlurb: 'Drei Antworten. Name, Modus, Boden.',
    signUpWhileOpen: 'Melden Sie sich an, solange der Baum noch offen ist.',
    noBracket: 'Kein Baum läuft. Setzen Sie einen auf und füllen Sie ihn.',
    noBracketVisitor: 'Kein Baum läuft. Schauen Sie gleich noch mal vorbei.',
    enterABracket: 'In einen Baum einsteigen',
    onTheBoard: 'Auf der Tafel',
    setOneUpAbove: 'Setzen Sie oben einen auf.',
    watch: 'Zusehen',
    enter: 'Einsteigen',
    lately: 'Zuletzt',
    settingUp: 'Wird aufgesetzt …',
    setItUp: 'Aufsetzen',
    untitledCup: 'Namenloser Pokal',
    sidesFromMarks:
      'Die Seiten werden von den Startmarkierungen abgelesen, die der Autor gesetzt hat.',
    everyRoundHere:
      'Jede Runde des Baums wird hier ausgetragen. Die Paarungen sind die Reihenfolge der Anmeldung — hier wird niemand gesetzt.',

    states: {
      signing: 'Anmeldung',
      running: 'Läuft',
      finished: 'Beendet',
      calledOff: 'Abgesagt',
    },

    withdraw: 'Zurückziehen',
    enterIt: 'Einsteigen',
    drawBracket: 'Den Baum auslosen',
    callItOff: 'Absagen',
    entrants: 'Teilnehmende',
    nobodyYet: 'Noch niemand.',
    final: 'Finale',
    putItOn: 'Aufsetzen',
    goFight: 'Los kämpfen',
    takeResult: 'Ergebnis übernehmen',
    replayIt: 'Wiederholen',
    thatDidNotWork: 'Das hat nicht geklappt',

    one: 'Turnier',
    backToTournaments: '← Turniere',
    needsBattlefield: 'Ein Turnier braucht ein Schlachtfeld, auf dem es ausgetragen wird.',
    open: 'Öffnen',
    onTheBoardCount: '{n} auf der Tafel',
    nothingOnTheBoard: 'nichts auf der Tafel',
    nothingRunning: 'Nichts läuft.',
    entrantOne: 'Teilnehmer',
    entrantMany: 'Teilnehmende',
    aLevel: 'ein Level',
    anArena: 'eine Arena',

    nameTheTournament: 'Turnier benennen',
    mode: 'Modus',
    foughtOn: 'Ausgetragen auf',
    orALevel: 'oder ein Level',
    noGroundYet: 'noch kein Boden',
    levelsOwn: 'der eigene des Levels',
    bringsItsOwn: 'bringt den eigenen mit.',
    itIs: 'Es ist {sides}.',
    nameItFirst: 'erst benennen',
    pickAGround: 'einen Boden wählen',
    openTheSignUps: 'die Anmeldung öffnen',

    tookIt: 'hat es geholt.',
    round: 'Runde {n}',
    waitingOnEarlier: 'wartet auf eine frühere Runde',
    bye: 'Freilos',
  },

  wizard: {
    heading: 'Ein Match rufen',
    close: 'Schließen',
    stepOf: 'Schritt {at} von {of}',
    steps: {
      kind: 'Art',
      mode: 'Modus',
      arena: 'Arena',
      rules: 'Regeln',
      fighters: 'Kämpfer',
      xp: 'Level',
      config: 'Regeln',
    },

    modeBlurbs: {
      ffa: 'Jede und jeder für sich. Wer zuletzt steht, gewinnt.',
      team: 'Teilt den Raum in zwei. Die Farbe entscheidet die Treue.',
      one_vs_all: 'Ein Champion, die ganze Lounge dagegen.',
      football: 'Rot gegen Blau, mit einem Ball. Die meisten Tore auf der Uhr gewinnen.',
      race: 'Von der Start- zur Ziellinie. Jede und jeder für sich, Sturmangriff erlaubt.',
    },

    xoTitle: 'Eines der eingebauten Spiele',
    xoBlurb:
      'Alle gegen alle, Teams, einer gegen alle, Fußball oder ein Rennen — ausgetragen auf einem Boden, den Sie wählen.',
    xpTitle: 'In einem XP',
    xpBlurb:
      'Ein Level, das jemand gemacht hat, mit eigenen Regeln. Es bringt den Modus mit, es bleibt also weniger zu entscheiden.',
    xpLockedBlurb:
      'Ein Level, das jemand gemacht hat, mit eigenen Regeln. Teil des xp-Tarifs.',
    moveToXp: 'Diesen Space auf xp umstellen — {price} →',
    comingSoon: 'Bald verfügbar',

    findALevel: 'Ein Level finden',
    sources: { builtin: 'von uns', space: 'dieser Raum', store: 'Laden' },
    magazineChip: 'Magazin',
    thisSpaceDraft: 'dieser Raum · Entwurf',
    copying: 'wird kopiert …',
    sharedWorld: 'eine geteilte Welt',
    filters: {
      yours: 'Ihre',
      magazine: 'Magazin',
      builtin: 'unsere',
      space: 'gespeichert',
      store: 'Laden',
    },
    ruleFirstTo: 'bis {n}',
    ruleMinutes: '{n} Min',
    taking: 'Wird aufgenommen …',
    addToMagazine: 'Ins Magazin legen',
    shelfLabel: 'Level, in denen Sie kämpfen können',
    pickThisLevel: 'Hierin kämpfen',
    picked: 'Gewählt',
    noPicture: 'Dieses Level hat noch niemand fotografiert.',
    placesFull: 'Ihre XP-Plätze sind voll — machen Sie einen frei, um es zu spielen.',
    nothingMatches: 'Nichts passt. Leeren Sie die Suche, oder probieren Sie eine andere Quelle.',
    showMore: '{n} weitere zeigen',
    showLess: 'Weniger zeigen',
    expand: 'Ausklappen',
    counted: '{shown} von {total}',
    moreInBrowse: ' · {n} weitere unter Stöbern',

    mode: 'Modus',
    levelsOwn: 'wie im Level',
    notOffered:
      ' Modi, für die dieses Level nichts zu werten hat, werden nicht angeboten.',
    endsAt: 'Endet bei',
    scoreTarget: 'Punkteziel',
    pointsNote: 'Punkten. Leer ist eine Zählung statt eines Wettlaufs.',
    clock: 'Uhr',
    timeLimitLabel: 'Zeitlimit in Minuten',
    minNote: 'Min. Leer überlässt es dem Punktestand.',
    people: 'Leute',
    fewest: 'Wenigste Mitspielende',
    most: 'Meiste Mitspielende',
    peopleNote:
      'Es beginnt erst, wenn {min} bereit sind. Das Level ist für bis zu {max} gebaut.',
    thisMatchOnly: 'Nur für dieses Match. Das Level selbst wird nicht geändert.',
    fromTheLevel:
      'Diese kommen aus dem Level. Ändern Sie beliebige davon für dieses Match.',
    backToLevels: 'Zurück zu denen des Levels',
    pickALevelFirst: 'Wählen Sie zuerst ein Level.',
    levelRun: '{name}-Runde',
    fridayNight: 'Freitagabend',
    untitledSkirmish: 'Namenloses Scharmützel',

    readyMadeCourse: 'Oder eine fertige Strecke nehmen ↗',
    matchLength: 'Matchlänge in Minuten',
    timeLimit: 'Zeitlimit · {n} Min',
    raceEnds:
      'Das Rennen endet, wenn alle im Ziel sind, oder wenn dies abläuft — wer dann noch unterwegs ist, wird als nicht angekommen vermerkt.',
    raceCharges:
      'Wer umgehauen wird, startet wieder an der Linie — das macht einen späten Sturmangriff lohnend. Ohne Stürme schiebt der Angriff nur, was auf einem schmalen Sims seine eigene Art von grob ist.',
    nothingToSet:
      '{mode} hat weder Uhr noch Ziel — es läuft, bis eine Person oder eine Seite übrig ist. Sonst gibt es nichts einzustellen.',

    roster: 'Die Aufstellung · 1 von {n}',
    firstSeat:
      'Sie nehmen den ersten Platz. Der Rest füllt sich vom Hub aus — das Match steht unter ',
    onNow: 'Läuft gerade',
    firstSeatTail:
      ', sobald es existiert, und alle im Space können hineingehen, bis es losgeht.',
    recapMode: 'Modus',
    recapArena: 'Arena',
    recapRules: 'Regeln',
    recapMinutes: '{n} Min',
    recapFirstTo: ', bis {score}',
    lastStanding: 'Wer zuletzt steht',

    cancel: 'Abbrechen',
    back: '← Zurück',
    summoning: 'Wird gerufen …',
    layingGround: 'Der Boden wird gelegt …',
    openTheDoors: 'Türen auf',
    next: 'weiter: {step}',
    nameItFirst: 'geben Sie ihm erst einen Namen',
    summon: 'Rufen',
    continue: 'Weiter',

    nameTheMatch: 'Das Match benennen',
    whatIsItCalled: 'Wie heißt es?',
    anotherOne: 'Noch eins',

    theLounge: 'Die Lounge',
    theLoungeBlurb: 'Was Ihr Space gebaut hat. Bringen Sie eigene Tore mit.',
    loungeNote:
      'Die Lounge, so wie Ihr Space sie gebaut hat. Bringen Sie eigene Tore mit.',
    aGround: 'einem Boden',
    hasGoals: 'hat Tore',
    startAndFinish: 'Start & Ziel',
    standardGround: 'Ein Standardboden.',
    yourArena: 'Ihre Arena „{name}“.',
    fromAnotherSpace: '„{name}“, aus einem anderen Space.',
    yours: 'Ihre',
    publishedByOthers: 'Von anderen Spaces veröffentlicht',
    searchArenas: 'Arenen nach Namen suchen …',
    searchArenasLabel: 'Veröffentlichte Arenen nach Namen suchen',
    looking: 'Wird gesucht …',
    nothingPublished: 'Nichts unter diesem Namen veröffentlicht.',
    anotherSpace: 'ein anderer Space',
    fromCatalogue: 'Aus dem Weltenkatalog',
    searchShared: 'Geteilte Welten nach Namen suchen …',
    searchSharedLabel: 'Den Weltenkatalog nach Namen durchsuchen',
    catalogueNote:
      'Eine auszuwählen kopiert sie als Arena in diesen Space, sie gehört Ihnen dann zum Bearbeiten und für weitere Kämpfe. Nur Inhaber und Admins.',
    nothingShared: 'Nichts unter diesem Namen geteilt.',
  },

  sides: { red: 'Rot', blue: 'Blau', champion: 'Der Champion', challengers: 'Die Herausforderer' },

  room: {
    calledOffBeforeStart: 'Der Host hat es abgesagt, bevor es losging.',
    raceNobodyHome: 'Die Zeit lief ab, ohne dass jemand im Ziel war.',
    homeFirst: 'Als Erste{time} im Ziel.',
    someoneHomeFirst: '{name} war als Erste{time} im Ziel.{tail}',
    youCame: ' Sie wurden {place}',
    youDidNotFinish: ' Sie sind nicht angekommen.',
    aDrawScore: '{line}. Unentschieden.',
    yourSideTookIt: '{line} — Ihre Seite hat es geholt.',
    scoreTo: '{line} für {side}.',
    nobodyStanding: 'Niemand blieb stehen.',
    lastStanding: 'Als Letzte stehen geblieben.',
    someoneLastStanding: '{name} ist als Letzte stehen geblieben.',
    sideTookItYours: '{side} hat es geholt — Ihre Seite.',
    sideTookIt: '{side} hat es geholt.',

    ffa: 'Alle gegen alle',
    team: 'Rot gegen Blau',
    oneVsAll: 'Einer gegen alle',
    football: 'Fußball · {n} Min{tag}',
    race: 'Rennen · {n} Min{tag}',
    friendly: ' · freundschaftlich',
    clean: ' · sauber',

    waitingToStart: 'wartet auf den Start',
    running: 'läuft',
    fighting: 'kämpft',
    over: 'vorbei',
    calledOff: 'abgesagt',

    noGoals: 'Dieser Boden hat keine Tore zum Treffen.',
    noGoalsBody: 'Ein Match braucht ein rotes und ein blaues Tor. ',
    noGoalsLounge:
      'Öffnen Sie die Blockauswahl der Lounge — der Bereich Tore stellt beide mit einem Klick auf.',
    openArenaEditor: 'Den Editor dieser Arena öffnen',
    noGoalsArena:
      ' und den Bereich Tore benutzen — oder die Lounge erneut als Arena speichern, jetzt wo Tore mitwandern.',
    noCourse: 'Dieser Boden hat keine Strecke.',
    noCourseBody: 'Ein Rennen braucht einen Start zum Aufstellen und ein Ziel zum Durchlaufen. ',
    noCourseLounge:
      'Öffnen Sie die Blockauswahl der Lounge — der Bereich Markierungen stellt beide dort auf, wo Sie stehen.',
    noCourseArena:
      ' und den Bereich Markierungen benutzen: zur Linie gehen, einen Start setzen, die Strecke ablaufen, ein Ziel setzen.',
    knockoutLost:
      'Ihr K.o. hat den Server nicht erreicht — das Match endet vielleicht nicht von allein.',
    goalLost: 'Dieses Tor hat den Server nicht erreicht.',
    finishLost: 'Dieser Zieleinlauf wurde nicht erfasst',
    finishNotCounted: 'Die Linie hat das noch nicht gewertet. Laufen Sie noch einmal hindurch.',
    finishNotReached:
      'Dieser Zieleinlauf hat den Server nicht erreicht. Laufen Sie noch einmal durch die Linie.',
    thatDidNotWork: 'Das hat nicht geklappt',
    close: 'Schließen',

    time: 'Zeit',
    homeOf: '{n} von {of} im Ziel',
    ft: 'Ende',
    firstTo: 'bis {n}',

    youWon: '🏆 Sie haben gewonnen',
    aDraw: 'Unentschieden',
    matchOver: 'Match vorbei',
    rematchOn: 'Die Revanche läuft — los →',
    nobodyAskedRematch: 'Noch niemand hat um eine Revanche gebeten.',
    wantsAnotherGo: '{names} will noch eine Runde.',
    wantAnotherGo: '{names} wollen noch eine Runde.',
    rematch: 'Revanche',
    startRematch: 'Die Revanche starten',
    waitingForOneMore: 'Sie sind dabei — es fehlt noch eine Person.',
    lookAround: 'Umsehen',
    leave: 'Verlassen',

    watchWithoutJoining: 'Zusehen, ohne mitzumachen',
    alreadyFighting: 'Kämpft schon',
    startedWithoutYou:
      'Das hier hat ohne Sie angefangen — Sie können zusehen, oder zurückgehen und ein anderes suchen.',
    inRoomNotMatch: 'Sie sind im Raum, aber nicht im Match. Wollen Sie mitmachen?',
    joining: 'Wird beigetreten …',
    joinTheMatch: 'Dem Match beitreten',
    joinSide: '{side} beitreten',
    onSide: 'Bei {side}',
    watch: 'Zusehen',
    justWatch: 'Nur zusehen',
    backToLobby: 'Zurück zur Lobby',

    closeMenu: 'Das Matchmenü schließen',
    leaveTheRoom: 'Den Raum verlassen',
    aDrawNobodyStanding: 'Unentschieden — niemand blieb stehen.',
    someoneWon: '{name} hat gewonnen.',
    nobodyYet: 'Noch niemand.',
    join: 'Mitmachen',
    ready: 'Bereit ✓',
    iAmReady: 'Ich bin bereit',
    forfeitWarning: 'Ein laufendes Match zu verlassen zählt als Niederlage. Trotzdem gehen?',
    forfeit: 'Aufgeben',
    needReady: '{n} Personen müssen bereit sein',
    start: 'Starten',
    startCount: ' ({n} bereit)',
    endTheMatch: 'Match beenden',
    callItOff: 'Absagen',
    backToTheMatch: 'Zurück ins Match',
    somebody: 'Jemand',
  },

  xpRoom: {
    join: 'Mitmachen',
    joinRed: 'Zu Rot',
    joinBlue: 'Zu Blau',
    beChampion: 'Der Champion sein',
    joinChallengers: 'Zu den Herausforderern',
    thatDidNotWork: 'Das hat nicht geklappt',
    readyLine: '{ready}/{needed} bereit · {here} von {seats} dabei',
    you: 'Sie',
    iAmReady: 'Ich bin bereit',
    battleFull:
      'Dieses Match hat seine {seats} Kämpfer schon. Sie können zusehen oder selbst eines starten.',
    needAtLine:
      '{n} Personen müssen an der Linie stehen, bevor es losgehen kann{tag}. Sie können in der Zwischenzeit herumlaufen.',
    builtFor: ' — „{name}“ ist für {n} gebaut',
    hasDropped: '{names} ist rausgeflogen.',
    haveDropped: '{names} sind rausgeflogen.',
    holdingOne: 'Das Match wartet {n} Sekunden, falls die Person zurückkommt.',
    holdingMany: 'Das Match wartet {n} Sekunden, falls alle zurückkommen.',
    seatsHeld:
      ' noch frei gehalten — sie können direkt wieder hereinkommen. Oder Sie stellen sich ohne sie neu auf.',
    glow: 'Leuchten',
    glowOn: 'Leuchten ✓',
    ready: 'Bereit ✓',
    start: 'Starten',
    waitingToStart: 'Wartet auf den Start',
    nobodySeated: 'Noch hat niemand einen Platz genommen.',
    everybodyReady: 'Alle sind bereit. Pfeifen Sie an.',
    everybodyReadyHost: 'Alle sind bereit — es wartet auf den Anpfiff des Hosts.',
    stillNotBack: 'Immer noch nicht zurück',
    holdOn: 'Warten',
    theirSeatIs: 'Ihr Platz ist',
    theirSeatsAre: 'Ihre Plätze sind',
    playOn: 'Weiterspielen',
    restarting: 'Wird neu gestartet …',
    restartMatch: 'Das Match neu starten',
    somebody: 'Jemand',
    isBack: '{names} ist zurück.',
    areBack: '{names} sind zurück.',
    matchOver: 'Match vorbei',
    startingAgain: 'Beginnt neu',
    calledOff: 'Abgesagt',
    linedUpAgain: 'Jemand hat es noch einmal aufgesetzt — Sie werden hingebracht.',
    nobodyCameBack: 'Niemand kam zurück, deshalb wurde es einen Tag später geschlossen.',
    noScoreOut:
      'Aus einem XP kommt noch kein Punktestand zurück, es gibt also kein Ergebnis zu drucken.',
    rematchOn: 'Die Revanche läuft — los →',
    nobodyAskedRematch: 'Noch niemand hat um eine Revanche gebeten.',
    wantsAnotherGo: '{names} will noch eine Runde.',
    wantAnotherGo: '{names} wollen noch eine Runde.',
    playAgain: 'Noch einmal spielen',
    startRematch: 'Die Revanche starten',
    waitingForOneMore: 'Sie sind dabei — es fehlt noch eine Person.',
    backToLobby: 'Zurück zur Lobby',
  },

  broken: {
    title: 'Match',
    label: 'Match · XP',
    heading: '{id} konnte nicht geladen werden',
    body: 'Dieses Match wird in einem XP ausgetragen, das fehlt oder sich nicht mehr lesen lässt. Das Match ist noch da; das Level nicht.',
    lockedHeading: 'Dieses Match wird in einem XP ausgetragen',
    lockedBody: 'XP-Level gehören zum xp-Tarif, und dieser Space ist nicht darauf - hier gibt es also nichts zu betreten. Stell den Space auf xp um, dann öffnet sich das Match dort, wo es gedacht war.',
    backToLobby: 'Zurück zur Lobby',
    someone: 'Jemand',
  },
}

export const BATTLE_BG: BattleDict = {
  title: 'Битка',
  heading: 'Битка',
  body: 'Спречквайте се свободно в лоунджа или го направете мач.',
  tournaments: 'Турнири',
  challenges: 'Предизвикателства',
  worlds: 'Светове',
  battlefields: 'Бойни полета →',
  scraps: 'Схватки',
  backToBattle: '← Битка',

  modes: {
    ffa: 'всеки срещу всеки',
    team: 'отбори',
    one_vs_all: 'един срещу всички',
    football: 'футбол',
    race: 'състезание',
  },

  lobby: {
    summon: 'Свикай мач',
    noMatches: 'Този план не включва мачове.',
    someRunning: '{running} от {cap} вървят. Довършете един, за да свикате друг.',
    fourSteps: 'Четири стъпки. Режим, арена, правила, бойци.',
    full: 'Пълен',
    open: 'Отворен',
    liveNow: '{n} на живо сега',
    nothingLive: 'нищо на живо',
    jumpIn: 'Скочете направо в течаща битка.',
    nobodyFighting: 'Никой не се бие. Свикайте един и ще дойдат.',
    nobodyFightingYet: 'Още никой не се бие. Наминете пак след малко.',
    joinAMatch: 'Включи се в мач',
    onNow: 'Сега върви',
    nothingRunning: 'Нищо не върви.',
    summonOneAbove: 'Свикайте един отгоре.',
    watch: 'Гледай',
    join: 'Включи се',
    meta: '{mode} · {arena} · {n}/{cap} бойци',
    lately: 'Наскоро',

    theLounge: 'лоунджът',
    anArena: 'арена',
    calledOff: 'отменен',
    nobodyCameBack: 'никой не се върна',
    aheadAbandoned: '{name} водеше, изоставен',
    aDraw: 'равен',
    won: '{name} спечели',
    somebody: 'Някой',

    close: 'Затвори',
    closing: 'Затваря се…',
    really: 'Наистина',
    keep: 'Задръж',
  },

  fields: {
    title: 'Бойни полета',
    heading: 'Бойни полета',
    body: 'Светове, които строите веднъж и на които се биете много пъти.',
    buildTitle: 'Строеж на бойно поле',

    catalogueHeading: 'Сцени от каталога със светове',
    catalogueBody:
      'Места, построени в блоковия строител. Използването на едно копира блоковете му във ваше собствено бойно поле — оригиналът си остава, където е.',
    browseAllWorlds: 'Разгледай всички светове →',
    copying: 'Копира се „{name}“…',
    useAsBattlefield: 'Използвай като бойно поле',

    namePlaceholder: 'Наименувайте ново бойно поле',
    working: 'Изпълнява се…',
    create: 'Създай',
    yours: 'Ваши',
    noneYet: 'Още няма бойни полета.',
    nameOneAbove: 'Наименувайте едно горе и попадате направо в редактора.',
    adminCanCreate: 'Собственик или админ може да създаде едно.',
    empty: 'празно',
    blocks: '{n} блока',
    openToOtherSpaces: 'отворено за други спейсове',
    build: 'Строй',
    makePrivate: 'Направи го частно',
    openToOthers: 'Отвори за други',
    retireConfirm: 'Да пенсионирам ли „{name}“?',
    retire: 'Пенсионирай',

    openToEveryone: 'Отворени за всички',
    searchPlaceholder: 'Търсене на арени от други спейсове',
    search: 'Търси',
    nothingMatching: 'Нищо не съвпада с „{term}“.',
    noneOpened: 'Още никой друг спейс не е отворил арена.',
    fromSpace: 'от {name}',
    fromAnotherSpace: 'от друг спейс',
    reportPrompt: 'Какво не е наред с „{name}“?',
    reportSent: 'Изпратено. Админ ще погледне.',
    reportThis: 'Докладвай този свят',
    thatDidNotWork: 'Това не се получи',
  },

  sheet: { close: 'Затвори', cancel: 'Отказ' },

  challengeBoard: {
    title: 'Предизвикателства',
    heading: 'Предизвикателства',
    body: 'Поискайте мач от друг спейс — приятелски, но записан.',
    toTournaments: 'Турнири',

    needOpenGround:
      'Първо отворете едно от бойните си полета за други спейсове — частното е празнота за онзи, когото каните.',
    needAGround: 'Първо постройте бойно поле и го отворете за други спейсове.',
    battlefields: 'Бойни полета',
    challengeASpace: 'Предизвикай спейс',
    challengeBlurb: 'Техният адрес, режимът, вашият терен.',
    open: 'Отвори',
    waitingCount: '{n} чакат вас',
    nothingWaiting: 'нищо не чака',
    someoneAsked: 'Друг спейс поиска мач. Приемането го започва.',
    nobodyAsked: 'Никой не ви е предизвикал. Пратете едно и вижте кой ще клъвне.',
    answerThem: 'Отговорете им',
    waitingOnYou: 'Чакат вас',
    noneWaiting: 'Никой не ви е предизвикал.',
    anotherSpace: 'Друг спейс',
    theirArena: 'тяхната арена',
    accept: 'Приеми',
    decline: 'Откажи',
    sent: 'Изпратено',
    aSpace: 'Един спейс',
    acceptedGo: 'прие — давай →',
    thatDidNotWork: 'Това не се получи',

    sending: 'Изпраща се…',
    sendIt: 'Изпрати',
    whoAreYouAsking: 'кого питате?',
    pickAGround: 'изберете терен',
    theyDecideNext: 'те решават следващото',
    noGroundYet: 'още няма терен',
    theirAddress: 'Адресът на техния спейс',
    addressExample: 'acme',
    mode: 'Режим',
    foughtOn: 'Играе се на',
    onlyOpenGrounds:
      'Само вашите терени, които вече са отворени за други спейсове — частният е празнота за онзи, когото каните.',
  },

  football: {
    clock: 'Часовник · {n} мин',
    minutes: '{n} мин',
    firstTo: 'Първи до',
    goalsEndIt: 'гола го приключват по-рано. Празно го оставя на часовника.',
    extras: 'Допълнително',
    chargesHurt: 'Засилванията болят',
    respawn: 'Възраждане',
    chargesNote:
      'При изключени засилвания ударът само мести топката и здраве не пада. И в двата случая никой не отпада от футболен мач — резултатът решава.',
  },

  wonOf: '{won} спечелени от {played}',

  bracket: {
    title: 'Турнири',
    heading: 'Турнири',
    body: 'Схема на елиминации. Двойките са по реда на записване — нищо тук не класира никого.',
    toChallenges: 'Предизвикателства',

    buildOne: 'Постройте един',
    setUp: 'Настройте схема',
    setUpBlurb: 'Три отговора. Име, режим, терен.',
    signUpWhileOpen: 'Запишете се, докато схемата е още отворена.',
    noBracket: 'Не върви схема. Настройте една и я напълнете.',
    noBracketVisitor: 'Не върви схема. Наминете пак след малко.',
    enterABracket: 'Влез в схема',
    onTheBoard: 'На таблото',
    setOneUpAbove: 'Настройте една отгоре.',
    watch: 'Гледай',
    enter: 'Влез',
    lately: 'Наскоро',
    settingUp: 'Настройва се…',
    setItUp: 'Настрой я',
    untitledCup: 'Купа без име',
    sidesFromMarks: 'Страните ѝ се четат от началните знаци, поставени от автора ѝ.',
    everyRoundHere:
      'Всеки кръг от схемата се играе тук. Двойките са по реда на записване — нищо не поставя никого.',

    states: {
      signing: 'Записване',
      running: 'Тече',
      finished: 'Приключил',
      calledOff: 'Отменен',
    },

    withdraw: 'Оттегли се',
    enterIt: 'Влез',
    drawBracket: 'Изтегли схемата',
    callItOff: 'Отмени го',
    entrants: 'Участници',
    nobodyYet: 'Още никой.',
    final: 'Финал',
    putItOn: 'Пусни го',
    goFight: 'Върви се бий',
    takeResult: 'Вземи резултата',
    replayIt: 'Изиграй го пак',
    thatDidNotWork: 'Това не се получи',

    one: 'Турнир',
    backToTournaments: '← Турнири',
    needsBattlefield: 'На турнира му трябва бойно поле, на което да се играе.',
    open: 'Отвори',
    onTheBoardCount: '{n} на таблото',
    nothingOnTheBoard: 'нищо на таблото',
    nothingRunning: 'Нищо не върви.',
    entrantOne: 'участник',
    entrantMany: 'участници',
    aLevel: 'ниво',
    anArena: 'арена',

    nameTheTournament: 'Наименувайте турнира',
    mode: 'Режим',
    foughtOn: 'Играе се на',
    orALevel: 'или ниво',
    noGroundYet: 'още няма терен',
    levelsOwn: 'собствените на нивото',
    bringsItsOwn: 'си носи свои.',
    itIs: 'Той е {sides}.',
    nameItFirst: 'първо го наименувайте',
    pickAGround: 'изберете терен',
    openTheSignUps: 'отворете записването',

    tookIt: 'го спечели.',
    round: 'Кръг {n}',
    waitingOnEarlier: 'чака по-ранен кръг',
    bye: 'служебно',
  },

  wizard: {
    heading: 'Свикай мач',
    close: 'Затвори',
    stepOf: 'Стъпка {at} от {of}',
    steps: {
      kind: 'вид',
      mode: 'режим',
      arena: 'арена',
      rules: 'правила',
      fighters: 'бойци',
      xp: 'ниво',
      config: 'правила',
    },

    modeBlurbs: {
      ffa: 'Всеки за себе си. Последният прав го взима.',
      team: 'Разделете стаята на две. Цветовете решават верността.',
      one_vs_all: 'Един шампион, целият лоундж срещу него.',
      football: 'Червено срещу синьо, с топка. Най-много голове в срока печели.',
      race: 'От старта до финала. Всеки за себе си, засилването е разрешено.',
    },

    xoTitle: 'Една от вградените игри',
    xoBlurb:
      'Всеки срещу всеки, отбори, един срещу всички, футбол или състезание — на терен по ваш избор.',
    xpTitle: 'Вътре в едно XP',
    xpBlurb:
      'Ниво, направено от някого, със свои правила. Носи режима със себе си, така че има по-малко за решаване.',
    xpLockedBlurb: 'Ниво, направено от някого, със свои правила. Част от плана xp.',
    moveToXp: 'Преместете този спейс на xp — {price} →',
    comingSoon: 'Очаквайте скоро',

    findALevel: 'Намерете ниво',
    sources: { builtin: 'наше', space: 'този спейс', store: 'магазин' },
    magazineChip: 'списание',
    thisSpaceDraft: 'този спейс · чернова',
    copying: 'копира се…',
    sharedWorld: 'споделен свят',
    filters: {
      yours: 'ваши',
      magazine: 'списание',
      builtin: 'наши',
      space: 'запазени',
      store: 'магазин',
    },
    ruleFirstTo: 'първи до {n}',
    ruleMinutes: '{n} мин',
    taking: 'Прибира се…',
    addToMagazine: 'Добави в списанието',
    placesFull: 'XP местата ви са пълни — освободете едно, за да го играете.',
    nothingMatches: 'Нищо не съвпада. Изчистете търсенето или пробвайте друг източник.',
    shelfLabel: 'Нива, в които може да се биете',
    pickThisLevel: 'Бий се в това',
    picked: 'Избрано',
    noPicture: 'Това още никой не го е снимал.',
    showMore: 'Покажи още {n}',
    showLess: 'Покажи по-малко',
    expand: 'Разгъни',
    counted: '{shown} от {total}',
    moreInBrowse: ' · още {n} в Разглеждане',

    mode: 'Режим',
    levelsOwn: 'собствен на нивото',
    notOffered: ' Режимите, в които това ниво няма какво да точкува, не се предлагат.',
    endsAt: 'Свършва на',
    scoreTarget: 'Целеви резултат',
    pointsNote: 'точки. Празно е броене, а не надпревара.',
    clock: 'Часовник',
    timeLimitLabel: 'Ограничение във времето, в минути',
    minNote: 'мин. Празно го оставя на резултата.',
    people: 'Хора',
    fewest: 'Най-малко играчи',
    most: 'Най-много играчи',
    peopleNote:
      'Никой не го започва, докато {min} не са готови. Нивото е построено за до {max}.',
    thisMatchOnly: 'Само за този мач. Самото ниво не се променя.',
    fromTheLevel: 'Тези идват от нивото. Сменете което и да е от тях за този мач.',
    backToLevels: 'Обратно към собствените на нивото',
    pickALevelFirst: 'Първо изберете ниво.',
    levelRun: 'обиколка на {name}',
    fridayNight: 'Петък вечер',
    untitledSkirmish: 'Схватка без име',

    readyMadeCourse: 'Или вземете готова писта ↗',
    matchLength: 'Дължина на мача в минути',
    timeLimit: 'Ограничение · {n} мин',
    raceEnds:
      'Състезанието свършва, когато всички са у дома, или когато това изтече — който още върви, се записва като нефиниширал.',
    raceCharges:
      'Съборите ли някого, той тръгва отново от линията, което прави късното засилване си струващо. При изключени засилвания ударът само бута — което на тесен ръб си е своя грубост.',
    nothingToSet:
      '{mode} няма часовник и няма цел — върви, докато не остане един боец или една страна прави. Няма какво друго да се задава.',

    roster: 'Съставът · 1 от {n}',
    firstSeat:
      'Вие заемате първото място. Останалите се пълнят от хъба — мачът се появява под ',
    onNow: 'Сега върви',
    firstSeatTail:
      ' в мига, в който съществува, и всеки в спейса може да влезе, докато не започне.',
    recapMode: 'Режим',
    recapArena: 'Арена',
    recapRules: 'Правила',
    recapMinutes: '{n} мин',
    recapFirstTo: ', първи до {score}',
    lastStanding: 'Последният прав',

    cancel: 'Отказ',
    back: '← Назад',
    summoning: 'Свиква се…',
    layingGround: 'Полага се теренът…',
    openTheDoors: 'отворете вратите',
    next: 'следва: {step}',
    nameItFirst: 'първо го наименувайте',
    summon: 'Свикай',
    continue: 'Напред',

    nameTheMatch: 'Наименувайте мача',
    whatIsItCalled: 'Как се казва?',
    anotherOne: 'Още един',

    theLounge: 'Лоунджът',
    theLoungeBlurb: 'Каквото вашият спейс е построил. Носете си свои врати.',
    loungeNote: 'Лоунджът, както го е построил вашият спейс. Носете си свои врати.',
    aGround: 'терен',
    hasGoals: 'има врати',
    startAndFinish: 'старт и финал',
    standardGround: 'Стандартен терен.',
    yourArena: 'Вашата арена „{name}“.',
    fromAnotherSpace: '„{name}“, от друг спейс.',
    yours: 'Ваши',
    publishedByOthers: 'Публикувани от други спейсове',
    searchArenas: 'Търсене на арени по име…',
    searchArenasLabel: 'Търсене на публикувани арени по име',
    looking: 'Търси се…',
    nothingPublished: 'Нищо публикувано под това име.',
    anotherSpace: 'друг спейс',
    fromCatalogue: 'От каталога със светове',
    searchShared: 'Търсене на споделени светове по име…',
    searchSharedLabel: 'Търсене в каталога със светове по име',
    catalogueNote:
      'Изборът на един го копира в този спейс като арена, така че е ваш за редактиране и за нови битки. Само за собственици и админи.',
    nothingShared: 'Нищо споделено под това име.',
  },

  sides: { red: 'Червените', blue: 'Сините', champion: 'Шампионът', challengers: 'Претендентите' },

  room: {
    calledOffBeforeStart: 'Домакинът го отмени, преди да започне.',
    raceNobodyHome: 'Времето изтече, без никой да стигне у дома.',
    homeFirst: 'Първи у дома{time}.',
    someoneHomeFirst: '{name} стигна пръв у дома{time}.{tail}',
    youCame: ' Вие бяхте {place}.',
    youDidNotFinish: ' Вие не финиширахте.',
    aDrawScore: '{line}. Равен.',
    yourSideTookIt: '{line} — вашата страна го взе.',
    scoreTo: '{line} за {side}.',
    nobodyStanding: 'Никой не остана прав.',
    lastStanding: 'Последният прав.',
    someoneLastStanding: '{name} остана последен прав.',
    sideTookItYours: '{side} го взеха — вашата страна.',
    sideTookIt: '{side} го взеха.',

    ffa: 'Всеки срещу всеки',
    team: 'Червени срещу сини',
    oneVsAll: 'Един срещу всички',
    football: 'Футбол · {n} мин{tag}',
    race: 'Състезание · {n} мин{tag}',
    friendly: ' · приятелски',
    clean: ' · чист',

    waitingToStart: 'чака да започне',
    running: 'тече',
    fighting: 'бие се',
    over: 'свърши',
    calledOff: 'отменен',

    noGoals: 'Този терен няма врати, в които да се бележи.',
    noGoalsBody: 'На мача му трябват червена и синя врата. ',
    noGoalsLounge:
      'Отворете избора на блокове в лоунджа — секцията Цели поставя и двете с едно щракване.',
    openArenaEditor: 'Отворете редактора на тази арена',
    noGoalsArena:
      ' и използвайте секцията Цели — или запазете лоунджа наново като арена, вече когато вратите пътуват с него.',
    noCourse: 'Този терен няма писта върху себе си.',
    noCourseBody: 'На състезанието му трябва старт, на който да се строите, и финал, през който да минете. ',
    noCourseLounge:
      'Отворете избора на блокове в лоунджа — секцията Знаци поставя и двете там, където стоите.',
    noCourseArena:
      ' и използвайте секцията Знаци: идете до линията, поставете старт, минете пистата, поставете финал.',
    knockoutLost:
      'Вашето сваляне не стигна до сървъра — мачът може да не свърши сам.',
    goalLost: 'Този гол не стигна до сървъра.',
    finishLost: 'Този финал не беше отчетен',
    finishNotCounted: 'Линията още не отчете това. Минете пак през нея.',
    finishNotReached: 'Този финал не стигна до сървъра. Минете пак през линията.',
    thatDidNotWork: 'Това не се получи',
    close: 'Затвори',

    time: 'Време',
    homeOf: '{n} у дома от {of}',
    ft: 'КР',
    firstTo: 'първи до {n}',

    youWon: '🏆 Спечелихте',
    aDraw: 'Равен',
    matchOver: 'Мачът свърши',
    rematchOn: 'Реваншът е насрочен — давай →',
    nobodyAskedRematch: 'Още никой не е поискал още един път.',
    wantsAnotherGo: '{names} иска още един път.',
    wantAnotherGo: '{names} искат още един път.',
    rematch: 'Реванш',
    startRematch: 'Започни реванша',
    waitingForOneMore: 'Вие сте вътре — чакаме още един.',
    lookAround: 'Огледайте се',
    leave: 'Напусни',

    watchWithoutJoining: 'Гледай, без да се включваш',
    alreadyFighting: 'Вече се бият',
    startedWithoutYou:
      'Този започна без вас — може да го изгледате или да се върнете и да намерите друг.',
    inRoomNotMatch: 'Вие сте в стаята, но не и в мача. Искате ли да влезете?',
    joining: 'Включва се…',
    joinTheMatch: 'Включи се в мача',
    joinSide: 'Влез при {side}',
    onSide: 'При {side}',
    watch: 'Гледай',
    justWatch: 'Само гледай',
    backToLobby: 'Обратно във фоайето',

    closeMenu: 'Затвори менюто на мача',
    leaveTheRoom: 'Напусни стаята',
    aDrawNobodyStanding: 'Равен — никой не остана прав.',
    someoneWon: '{name} спечели.',
    nobodyYet: 'Още никой.',
    join: 'Включи се',
    ready: 'Готов ✓',
    iAmReady: 'Готов съм',
    forfeitWarning: 'Напускането на течащ мач се брои за загуба. Тръгвате ли?',
    forfeit: 'Предай се',
    needReady: '{n} души трябва да са готови',
    start: 'Започни',
    startCount: ' ({n} готови)',
    endTheMatch: 'Прекрати мача',
    callItOff: 'Отмени го',
    backToTheMatch: 'Обратно в мача',
    somebody: 'Някой',
  },

  xpRoom: {
    join: 'Включи се',
    joinRed: 'Влез при червените',
    joinBlue: 'Влез при сините',
    beChampion: 'Бъди шампионът',
    joinChallengers: 'Влез при претендентите',
    thatDidNotWork: 'Това не се получи',
    readyLine: '{ready}/{needed} готови · {here} от {seats} вътре',
    you: 'Вие',
    iAmReady: 'Готов съм',
    battleFull:
      'Този мач вече има своите {seats} бойци. Може да гледате или да започнете свой.',
    needAtLine:
      '{n} души трябва да са на линията, преди това да започне{tag}. Може да се разхождате, докато чакате.',
    builtFor: ' — „{name}“ е построено за {n}',
    hasDropped: '{names} отпадна.',
    haveDropped: '{names} отпаднаха.',
    holdingOne: 'Мачът се задържа {n}с, в случай че се върне.',
    holdingMany: 'Мачът се задържа {n}с, в случай че се върнат всички.',
    seatsHeld: ' още са запазени — може да влязат направо обратно. Или се пребройте пак без тях.',
    glow: 'Сияние',
    glowOn: 'Сияние ✓',
    ready: 'Готов ✓',
    start: 'Започни',
    waitingToStart: 'Чака да започне',
    nobodySeated: 'Още никой не е заел място.',
    everybodyReady: 'Всички са готови. Изсвирете началото.',
    everybodyReadyHost: 'Всички са готови — чака се домакинът да започне.',
    stillNotBack: 'Още го няма',
    holdOn: 'Изчакай',
    theirSeatIs: 'Мястото му е',
    theirSeatsAre: 'Местата им са',
    playOn: 'Играйте нататък',
    restarting: 'Рестартира се…',
    restartMatch: 'Рестартирай мача',
    somebody: 'Някой',
    isBack: '{names} се върна.',
    areBack: '{names} се върнаха.',
    matchOver: 'Мачът свърши',
    startingAgain: 'Започва отново',
    calledOff: 'Отменен',
    linedUpAgain: 'Някой нареди този пак — водим ви към него.',
    nobodyCameBack: 'Никой не се върна към него, затова беше затворен ден по-късно.',
    noScoreOut:
      'От едно XP още не излиза резултат, така че няма какво да се отпечата.',
    rematchOn: 'Реваншът е насрочен — давай →',
    nobodyAskedRematch: 'Още никой не е поискал още един път.',
    wantsAnotherGo: '{names} иска още един път.',
    wantAnotherGo: '{names} искат още един път.',
    playAgain: 'Играй пак',
    startRematch: 'Започни реванша',
    waitingForOneMore: 'Вие сте вътре — чакаме още един.',
    backToLobby: 'Обратно във фоайето',
  },

  broken: {
    title: 'Мач',
    label: 'Мач · XP',
    heading: '{id} не можа да се зареди',
    body: 'Този мач се играе вътре в XP, което липсва или вече не се разчита. Мачът още е тук; нивото не е.',
    lockedHeading: 'Този мач се играе вътре в XP',
    lockedBody:
      'XP нивата са част от плана xp, а този спейс не е на него, така че тук няма в какво да се влезе. Преместете спейса на xp и мачът се отваря там, където му е мястото.',
    backToLobby: 'Обратно във фоайето',
    someone: 'Някой',
  },
}

const DICTS: Record<Locale, BattleDict> = {
  en: BATTLE_EN,
  de: BATTLE_DE,
  bg: BATTLE_BG,
}

export function battleDict(locale: Locale): BattleDict {
  return DICTS[locale]
}
