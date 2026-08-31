import type { Locale } from '@/domain/i18n/locale'
import type { TenantRoleName } from '@/lib/supabase/types'

/**
 * The flat pages inside a space: the board, the people, the streaks, the tasks.
 *
 * Not the rail (that is `@/app/i18n/rail`), not the rooms you walk into (that
 * is `@/app/i18n/world`), and not settings. What is left is the part of a
 * workspace that is a website - a column of text you read and type into - and
 * it shares one dictionary because it shares one shape.
 *
 * `titles` is here rather than in each page, because every one of them is a
 * `generateMetadata` now: a static `metadata` export cannot be two languages,
 * and the layout's `%s · Acme` template puts the space's name after whichever
 * of these it gets.
 */
export interface WorkspaceDict {
  titles: {
    overview: string
    dashboard: string
    people: string
    streaks: string
    tasks: string
    rooms: string
    pages: string
    worlds: string
    world: string
    room: string
    welcome: string
    builder: string
    skins: string
  }

  /** The space's front page: a masthead, a wire of notices, and two shelves. */
  board: {
    heading: string
    newsTab: string
    walkIn: string
    theRadio: string
    /** With a track title appended when there is one. */
    lightsAreOn: string
    /** `{name}` is what is playing. */
    isOn: string
    /** The streak chip, for somebody who has not started one. */
    noStreak: string
    /** And for somebody who has. `{n}` days, and `{n}` again for the best. */
    daysInARowOne: string
    daysInARowMany: string
    bestStreak: string
    seeTheBoard: string

    news: string
    hideAnnouncement: string
    hideIt: string
    noNews: string

    studio: string
    openStudio: string
    nothingMade: string
    makeOne: string
    shared: string

    emptyCanPost: string
    empty: string
    compose: string
    keepAtTop: string
    post: string
    posting: string
    pinned: string
    pin: string
    unpin: string
    edited: string
    edit: string
    cancel: string
    remove: string
    save: string
    someone: string
    addEmote: string
    closeEmotes: string
  }

  /** Places a space made for itself, beside the lounge it always had. */
  rooms: {
    heading: string
    body: string
    theLounge: string
    theLoungeBody: string

    namePlaceholder: string
    opening: string
    openRoom: string
    emptyCanManage: string
    empty: string
    full: string
    fullBody: string
    ownWorld: string
    delete: string
    close: string
    /** Browser `confirm`, so no markup. `{name}` is the room. */
    confirmDelete: string
    confirmClose: string
    cap: string
    guestsMayBuild: string

    /** Walking into a room that has no space left. */
    otherRoomsNote: string
    openingAnother: string
    openingAnotherBody: string
    /** `{name}` is the room that was full. */
    isFull: string
    cappedBody: string

    /** A round is on, so the door is shut. */
    roundLabel: string
    /** `{name}` is the room. */
    roundStarted: string
    roundBody: string
    openTheDoor: string

    /** The room plays a level that will not load. */
    levelLabel: string
    /** `{name}` is the room. */
    notOpen: string
    neverSaved: string
    cannotLoad: string
    openInEditor: string
    backToRooms: string

    /** The one control over a level being played in a room: the way out. */
    leave: string
  }

  /** Who is in the space, and the four things an owner can do about it. */
  members: {
    heading: string
    you: string
    /** `{name}` is whose role is being changed. */
    roleFor: string
    remove: string
    pending: string
    revoke: string
    roles: Record<TenantRoleName, string>
    roleHelp: Record<TenantRoleName, string>

    invite: string
    inviteePlaceholder: string
    inviteeLabel: string
    roleLabel: string
    send: string
    inviteNote: string

    rename: string
    newName: string
    renameCta: string
    /** Split around the URL, which is drawn in monospace. */
    urlStaysLead: string
    urlStaysTail: string

    leave: string
    leaveNote: string
    leaveCta: string
    archiveNote: string
    archive: string
  }

  /** Making something with the animals. */
  studio: {
    title: string
    body: string
    /**
     * `picture` was a door and is one no longer: a still is one frame of what
     * the video studio already does, so its card was folded into the suite's
     * blurb (the route itself stays). `sketch` opens a fresh p5.js project -
     * a door straight to the new-project form with the engine pre-chosen.
     */
    doors: Record<'video' | 'banner' | 'game' | 'sketch', { title: string; blurb: string }>
    startFrom: string
    /**
     * The recents strip, and the filter over it.
     *
     * `recent` is one list of two kinds - the space's games and its movies -
     * because a studio is where somebody carries on with whatever they were
     * doing yesterday, and which *sort* of thing that was is not usually the
     * first thing they remember about it.
     */
    recent: string
    recentFilters: Record<'all' | 'game' | 'movie', string>
    kinds: Record<'game' | 'movie', string>
    nothingRecent: string
    /** On a movie anybody with the link may open. */
    sharedChip: string
    kept: string
    empty: string
    /** The space's games, listed here as well as on the workbench. */
    games: string
    /** `{n}` is how many. */
    gamesCount: string
    noGames: string
    gamesEmpty: string
    newGame: string
    allGames: string
    /** The ten scene templates, keyed on the ids `TEMPLATES` records. */
    templates: Record<string, { name: string; teaches: string }>

    videoTitle: string
    videoBody: string
    pictureTitle: string
    pictureBody: string
    bannerTitle: string
    bannerBody: string
    keptHere: string
    /** The three sub-studios, in a browser tab. */
    metaVideo: string
    metaPicture: string
    metaBanner: string

    /** The editor, and the two screens that stand in for it. */
    metaStudio: string
    metaEditor: string
    lockedTitle: string
    /** `{name}` is whoever has it open. */
    lockedBody: string
    /** `{time}` is when the lock lapses, in the reader's clock. */
    freesUp: string
    checking: string
    tryAgain: string
    backToProject: string
    refusedLabel: string
    /** `{name}` is the project. */
    refusedTitle: string
    refusedBody: string
    oneProblem: string
    manyProblems: string
  }

  /** The card that greets a brand-new member of a space. */
  welcome: {
    youreIn: string
    /** `{space}` is the space's name. */
    heading: string
    close: string
    body: string
    /** Split around the animal, which is a pack id and stays as it is. */
    youAreLead: string
    youAreTail: string
    saving: string
    /** `{space}` again. */
    enter: string
  }

  /** Laying out a place block by block. */
  builder: {
    heading: string
    /** `{name}` is the world being edited. */
    editing: string
    /** Split around the link to the public catalogue. */
    bodyLead: string
    everybody: string
    bodyTail: string
    yourWorlds: string
    openOneLabel: string
    openOne: string
    draft: string
    touchNote: string
  }

  /** The wall a space goes behind when its plan lapses. */
  paused: {
    /** `{name}` is the space. */
    heading: string
    body: string
    /** `{date}` is what it was paid through. */
    paidThrough: string
    nothingDeleted: string
    nothingDeletedRest: string
    /** `{name}` is the space, `{date}` when the free month runs to. */
    welcomeBack: string
    claiming: string
    claim: string
    claimNote: string
    openingStripe: string
    /** `{tier}` and `{price}` come from the tiers table, never from here. */
    restart: string
    ownerOnly: string
    backToSpaces: string
  }

  /** The strip above every page inside an event. */
  event: {
    label: string
    opens: string
    live: string
    ended: string
    /** `{when}` is the door time, formatted in the reader's locale. */
    opensLine: string
    runningLine: string
    endedLine: string
    hide: string
  }

  /** The nudge to confirm the address on the account. Never shown to guests. */
  verifyEmail: {
    label: string
    /** `{email}` is the address on the account. */
    body: string
    /** The reason a mail that was sent may not have been seen. */
    spam: string
    send: string
    sending: string
    /** `{email}` again - the address the link just went to. */
    sent: string
    /** A change is already in flight; `{email}` is where it is going. */
    pending: string
    hide: string
  }

  /** The catalogue of built places, this space's and everybody else's. */
  worlds: {
    heading: string
    body: string
    /** `{name}` is the room a world is being picked for. */
    forRoom: string
    backToRoom: string
    build: string
    yours: string
    yoursEmpty: string
    openInBuilder: string
    kept: string
    fromEveryone: string
    publicCatalogue: string
    filterLabel: string
    everything: string
    newest: string
    saved: string
    keptEmpty: string
    taggedEmpty: string
    publishedEmpty: string
    /** The twelve tags, keyed on the id `WORLD_TAGS` records. */
    tags: Record<string, { label: string; hint: string }>
    /** The line under a world card. `{n}` is already grouped for the locale. */
    blocks: string
    usedTimes: string
    seenTimes: string
    notPublished: string
    aFork: string
  }

  /** The wiki half: nested documents with a sidebar. */
  pages: {
    heading: string
    /** `{space}` is the space's own name. */
    welcome: string
    body: string
    recent: string
    untitled: string
    pick: string
    sidebar: string
    collapse: string
    expand: string
    newTopLevel: string
    page: string
    empty: string
    createFirst: string
    moveUp: string
    moveDown: string
    addSubpage: string
    deletePage: string
    /** Browser `confirm`, so no markup. */
    confirmDelete: string
  }

  /** Days running, per space. */
  streaks: {
    heading: string
    /** `{space}` is the space's own name. */
    body: string
    empty: string
  }

  /** The task list, which is the app's oldest surface. */
  tasks: {
    archived: string
    placeholder: string
    add: string
    syncing: string
    empty: string
    save: string
    cancel: string
    edit: string
    delete: string
    /** The `v3` chip beside a task. */
    versionTitle: string
    /** `{title}` is the task. Two verbs, because the box is a toggle. */
    markComplete: string
    markIncomplete: string
    /** `{name}` is whoever wrote it. */
    addedBy: string
  }
}

export const WORKSPACE_EN: WorkspaceDict = {
  titles: {
    overview: 'Overview',
    dashboard: 'Dashboard',
    people: 'People',
    streaks: 'Streaks',
    tasks: 'Tasks',
    rooms: 'Rooms',
    pages: 'Pages',
    worlds: 'Worlds',
    world: 'World',
    room: 'Room',
    welcome: 'Welcome',
    builder: 'World builder',
    skins: 'Skins',
  },

  board: {
    heading: 'Board',
    newsTab: 'News',
    walkIn: 'Walk in',
    theRadio: 'The radio',
    lightsAreOn: 'The lights are on',
    isOn: '{name} is on',
    noStreak: 'Show up daily to start a streak',
    daysInARowOne: 'day in a row',
    daysInARowMany: 'days in a row',
    bestStreak: '· best {n}',
    seeTheBoard: '— see the board',

    news: 'From the platform',
    hideAnnouncement: 'Hide this announcement',
    hideIt: 'Hide it — it stays under News',
    noNews: 'Nothing from the platform yet.',

    studio: 'From the studio',
    openStudio: 'Open the studio',
    nothingMade:
      'Nothing made here yet. The studio walks the animals about, takes a picture, or builds a banner.',
    makeOne: 'Make one',
    shared: 'Shared',

    emptyCanPost:
      'Nothing on the board yet. Write the first notice, or make something in the studio and pin it here.',
    empty: 'Nothing on the board yet.',
    compose: 'Tell the space something',
    keepAtTop: 'Keep it at the top',
    post: 'Post',
    posting: 'Posting…',
    pinned: 'Pinned',
    pin: 'Pin',
    unpin: 'Unpin',
    edited: 'edited',
    edit: 'Edit',
    cancel: 'Cancel',
    remove: 'Remove',
    save: 'Save',
    someone: 'someone',
    addEmote: 'Add an emote',
    closeEmotes: 'Close the emotes',
  },

  members: {
    heading: 'Members',
    you: 'you',
    roleFor: 'Role for {name}',
    remove: 'Remove',
    pending: 'Pending invitations',
    revoke: 'Revoke',
    roles: { owner: 'owner', admin: 'admin', member: 'member', guest: 'guest' },
    roleHelp: {
      owner: 'Full control, including roles and archiving',
      admin: 'Can invite and remove members',
      member: 'Can work on tasks',
      guest: 'Visiting on a link — cannot change anything',
    },

    invite: 'Invite someone',
    inviteePlaceholder: 'username or email',
    inviteeLabel: 'Username or email address',
    roleLabel: 'Role',
    send: 'Send invitation',
    inviteNote:
      'No email is sent — the invitation appears on their /invitations page when they next sign in. Inviting by address works whether or not they already have an account; if they do, only their username is recorded.',

    rename: 'Rename space',
    newName: 'New name',
    renameCta: 'Rename',
    urlStaysLead: 'The URL stays ',
    urlStaysTail:
      ' — it was reserved when the space was created, and re-pointing it would break every link anyone has saved.',

    leave: 'Leave space',
    leaveNote:
      'You keep nothing and lose nothing — the events you wrote stay in the log, attributed to you.',
    leaveCta: 'Leave',
    archiveNote: 'Archiving stops new events without deleting anything.',
    archive: 'Archive space',
  },

  streaks: {
    heading: 'Streaks',
    body: 'Days in a row you have shown up in {space}. Open the space any day to keep yours going — miss a day and it starts again at one.',
    empty: 'Nobody is on the board yet. Showing up today is day one.',
  },

  tasks: {
    archived:
      'This space is archived. Its history is intact and still readable, but no new events can be written.',
    placeholder: 'What needs doing?',
    add: 'Add',
    syncing: 'Syncing to the event log…',
    empty: 'No tasks yet. Add one and watch the event log fill up.',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    versionTitle: 'Aggregate version — how many events this task has',
    markComplete: 'Mark "{title}" complete',
    markIncomplete: 'Mark "{title}" incomplete',
    addedBy: 'Added by {name}',
  },

  rooms: {
    heading: 'Rooms',
    body: 'More than one place to be. Each room has its own world and its own channel, so two things can happen at once.',
    theLounge: 'The lounge',
    theLoungeBody: 'The room everybody shares. Always here.',

    namePlaceholder: 'Name a new room',
    opening: 'Opening…',
    openRoom: 'Open a room',
    emptyCanManage: 'No rooms yet. Name one above and you land straight inside it.',
    empty: 'No rooms yet. An owner or admin can open one.',
    full: 'Full',
    fullBody: 'This one is full. Walking in sends you to the emptiest room with space.',
    ownWorld: 'Its own world, and its own channel — whoever is in here is not in the lounge.',
    delete: 'Delete',
    close: 'Close',
    confirmDelete: 'Delete "{name}"?',
    confirmClose: 'Close "{name}"?',
    cap: 'Cap',
    guestsMayBuild: 'Visitors may build here',

    otherRoomsNote:
      'This list refreshes on its own. The moment somebody leaves, their room lights up.',
    openingAnother: 'Opening another room…',
    openingAnotherBody: 'Every room had a full house, so a new one is going up for you.',
    isFull: '{name} is full',
    cappedBody:
      'Rooms are capped so that everybody in the space keeps a smooth connection — a crowded room slows down every other room too.',

    roundLabel: 'Room · Round in play',
    roundStarted: '{name} has started',
    roundBody:
      'A round is being played in here, so the door is shut. It opens again when the round ends — or you can open it now, which lets you in and lets everybody else keep playing.',
    openTheDoor: 'Open the door',

    levelLabel: 'Room · Level',
    notOpen: '{name} is not open',
    neverSaved:
      'This room was pointed at a level before it had ever been saved, so there is nothing here to load yet. The room itself is fine — save the level and point the room at it again.',
    cannotLoad:
      'The level this room plays cannot be loaded here — it may have been taken down, or this space may no longer include XP. The room itself is fine.',
    openInEditor: 'Open the level in the editor →',
    backToRooms: '← Rooms',

    leave: 'Leave',
  },

  worlds: {
    heading: 'Worlds',
    body: 'Places this space has built, and places anybody can borrow.',
    forRoom: 'Pick one to load into “{name}”.',
    backToRoom: 'Back to the room',
    build: 'Build a world',
    yours: 'Yours',
    yoursEmpty: 'Nothing yet. The builder starts empty and a floor is one drag.',
    openInBuilder: 'Open in the builder',
    kept: 'Kept by you',
    fromEveryone: 'From everybody else',
    publicCatalogue: 'The public catalogue ↗',
    filterLabel: 'Filter worlds',
    everything: 'Everything',
    newest: 'Newest',
    saved: 'Saved',
    keptEmpty: 'Nothing kept yet. The heart on a card puts it here.',
    taggedEmpty: 'Nothing tagged that yet.',
    publishedEmpty: 'Nothing published yet.',
    tags: {
      arena: { label: 'Arena', hint: 'Built to fight in — cover, sightlines, no dead ends.' },
      pitch: { label: 'Pitch', hint: 'A football ground, with room for goals at each end.' },
      hangout: { label: 'Hangout', hint: 'Somewhere to stand around and talk.' },
      showcase: { label: 'Showcase', hint: 'Built to be looked at rather than played in.' },
      event: { label: 'Event', hint: 'A stage, seating, a room for a crowd.' },
      office: { label: 'Office', hint: 'Desks, meeting rooms, a place that reads as work.' },
      nature: { label: 'Nature', hint: 'Parks, trees, water, terrain.' },
      city: { label: 'City', hint: 'Streets and buildings.' },
      maze: { label: 'Maze', hint: 'Getting lost is the point.' },
      parkour: { label: 'Parkour', hint: 'Jumps, gaps, a route to the top.' },
      small: { label: 'Small', hint: 'A few hundred blocks — quick to drop into a space.' },
      seasonal: {
        label: 'Seasonal',
        hint: 'Snow, holidays, something that comes round once a year.',
      },
    },
    blocks: '{n} blocks',
    usedTimes: '· used {n}×',
    seenTimes: '· seen {n}×',
    notPublished: '· not published',
    aFork: '· a fork',
  },

  pages: {
    heading: 'Pages',
    welcome: 'Welcome to {space}’s pages',
    body: 'Create nested pages, organize docs, and write rich text using TipTap. All state changes are recorded as events.',
    recent: 'Recent Pages',
    untitled: 'Untitled Page',
    pick: 'Select or create a page in the sidebar on the left to start writing.',
    sidebar: 'Pages',
    collapse: 'Collapse sidebar',
    expand: 'Expand Sidebar',
    newTopLevel: 'Create new top-level page',
    page: 'Page',
    empty: 'No pages in space.',
    createFirst: 'Create your first page',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    addSubpage: 'Add subpage',
    deletePage: 'Delete page',
    confirmDelete:
      'Are you sure you want to delete this page and remove it from your space?',
  },

  paused: {
    heading: '{name} is paused',
    body: 'The subscription for this space is no longer active, so it has stopped accepting changes.',
    paidThrough: ' It was paid through {date}.',
    nothingDeleted: 'Nothing has been deleted.',
    nothingDeletedRest:
      ' Every task, every event and every block is still here. Renewing brings it all back exactly as it was — there is no restore step.',
    welcomeBack:
      'Welcome back — {name} is open again until {date}. No card, and nothing is charged when it ends.',
    claiming: 'Opening it back up…',
    claim: 'Try a month of xo, free',
    claimNote:
      '30 days of xo, no card, nothing charged when it ends — it just pauses again. One free month per account.',
    openingStripe: 'Opening Stripe…',
    restart: 'Restart on {tier} — {price}',
    ownerOnly:
      'Only the space owner can renew it. Ask them to sign in and restart the subscription.',
    backToSpaces: 'Back to your spaces',
  },

  event: {
    label: 'Event',
    opens: 'Opens',
    live: 'Live',
    ended: 'Ended',
    opensLine: 'Doors open {when}. You can build now — visitors cannot get in until then.',
    runningLine: 'Running until {when}.',
    endedLine:
      'Ended {when}. Everything built here is still here and still readable — the doors are just shut.',
    hide: 'Hide this until the event says something new',
  },

  verifyEmail: {
    label: 'Confirm your email',
    body:
      'We have never checked that {email} reaches you. Send yourself a link and open it — that is the whole thing, and it is what lets you get back in if you ever lose your password.',
    spam: 'Already sent one? Have a look in spam or promotions — the first mail from a new sender often lands there.',
    send: 'Send me the link',
    sending: 'Sending…',
    sent: 'Sent to {email}. Open the link in it and this is done.',
    pending: 'Waiting on the link we sent to {email}. Opening it finishes the move — until then, this account keeps the address above.',
    hide: 'Not now',
  },

  welcome: {
    youreIn: 'You’re in',
    heading: 'Welcome to {space}',
    close: 'Close',
    body: 'Pick the peep everyone here will see you as. It follows your account — same animal in every Lounge you belong to, the Café, and the house — and you can change it any time in Settings.',
    youAreLead: 'You are the ',
    youAreTail: '.',
    saving: 'Saving…',
    enter: 'Enter {space}',
  },

  builder: {
    heading: 'World builder',
    editing: 'Editing “{name}”',
    bodyLead:
      'Lay out a place block by block — the blocks a world keeps when a space stands it up — then publish it to your space, or to ',
    everybody: 'everybody',
    bodyTail: '.',
    yourWorlds: 'Your worlds →',
    openOneLabel: 'Your worlds',
    openOne: 'Open one of yours',
    draft: 'draft',
    touchNote:
      'On a phone: one finger draws, two fingers pinch and pan, and the buttons on the picture are look and erase. The panel is below the viewport, and the keyboard shortcuts are the thing you are missing.',
  },

  studio: {
    title: 'Studio',
    body: 'Make something with the animals, then pin it to the board or send the link to anyone.',
    doors: {
      video: {
        title: 'XO Suite',
        blurb:
          'Walk the cast about, let them talk, move the camera. Record it — or export a single frame as a picture.',
      },
      banner: {
        title: 'Banner',
        blurb: 'A sky, blocks drifting through it, and a headline you can edit.',
      },
      game: {
        title: 'XP Creator',
        blurb: 'A place to walk around, things that count, and rules that end it.',
      },
      sketch: {
        title: 'XP p5.js',
        blurb: 'A game that is code, drawn on its own canvas. Opens a fresh sketch project.',
      },
    },
    startFrom: 'Start from one of these',
    recent: 'Where you left off',
    recentFilters: { all: 'all', game: 'games', movie: 'movies' },
    kinds: { game: 'game', movie: 'movie' },
    nothingRecent: 'Nothing yet. Open a door above, or start from a template.',
    sharedChip: 'shared',
    kept: 'Kept',
    empty: 'Nothing saved yet.',
    games: 'Games',
    gamesCount: '{n} in this space',
    noGames: 'None yet',
    gamesEmpty: 'No game in this space yet. Start one and it opens here next time.',
    newGame: 'New game',
    allGames: 'All projects, the magazine and the store →',
    templates: {
      rock: {
        name: 'Kick the rock',
        teaches: 'A keyed prop, reacting to something an animal did',
      },
      standoff: {
        name: 'The standoff',
        teaches: 'Two actors talking in turn, and a camera that closes in',
      },
      entrance: {
        name: 'The big entrance',
        teaches: 'A run, a jump, and everybody reacting on the same beat',
      },
      'dance-off': {
        name: 'Dance-off',
        teaches: 'Overlapping dances, and a light that changes with them',
      },
      delivery: {
        name: 'The delivery',
        teaches: 'A prop that travels, keyed alongside somebody carrying it',
      },
      flyby: { name: 'Flyby', teaches: 'Three camera keys, and why easing matters' },
      penalty: { name: 'The penalty', teaches: 'A ball keyed to a kick, and a goal' },
      queue: {
        name: 'The queue',
        teaches: 'Timing four actors so they move one after another',
      },
      growth: {
        name: 'Growth spurt',
        teaches: 'Keying an actor’s size, which no verb can do',
      },
      'night-shift': {
        name: 'Night shift',
        teaches: 'A dark rig, a backdrop, and one animal alone',
      },
    },

    videoTitle: 'Video',
    videoBody: 'Take control of an animal and perform, or lay the timeline out by hand.',
    pictureTitle: 'Picture',
    pictureBody:
      'Arrange the animals and export the frame with a transparent background.',
    bannerTitle: 'Banner',
    bannerBody:
      'Reroll the drift until the arrangement lands, then keep it — a saved banner is what an event page shows.',
    keptHere: 'Kept in this space',
    metaVideo: 'Video studio',
    metaPicture: 'Picture studio',
    metaBanner: 'Banner studio',

    metaStudio: 'Studio',
    metaEditor: 'Editor',
    lockedTitle: 'Open somewhere else',
    lockedBody:
      '{name} has this project open. Only one person can edit at a time — we have not built collaboration yet, and pretending otherwise would mean one of you losing work.',
    freesUp: 'If they have closed it, it frees up on its own at {time}.',
    checking: 'Checking…',
    tryAgain: 'Try again',
    backToProject: 'Back to the project',
    refusedLabel: 'Editor · refused',
    refusedTitle: '{name} did not open',
    refusedBody:
      'The saved version is valid for the parser it was written against and not for this one. Nothing has been lost — the file is exactly as it was saved, and it can still be exported.',
    oneProblem: 'The problem is below.',
    manyProblems: 'The problems are below.',
  },
}

export const WORKSPACE_DE: WorkspaceDict = {
  titles: {
    overview: 'Übersicht',
    dashboard: 'Übersicht',
    people: 'Leute',
    streaks: 'Serien',
    tasks: 'Aufgaben',
    rooms: 'Räume',
    pages: 'Seiten',
    worlds: 'Welten',
    world: 'Welt',
    room: 'Raum',
    welcome: 'Willkommen',
    builder: 'Weltenbaukasten',
    skins: 'Skins',
  },

  board: {
    heading: 'Pinnwand',
    newsTab: 'Neuigkeiten',
    walkIn: 'Hineingehen',
    theRadio: 'Das Radio',
    lightsAreOn: 'Das Licht ist an',
    isOn: '{name} läuft',
    noStreak: 'Täglich vorbeischauen und eine Serie starten',
    daysInARowOne: 'Tag in Folge',
    daysInARowMany: 'Tage in Folge',
    bestStreak: '· Bestwert {n}',
    seeTheBoard: '— zur Tafel',

    news: 'Von der Plattform',
    hideAnnouncement: 'Diese Ankündigung ausblenden',
    hideIt: 'Ausblenden — sie bleibt unter Neuigkeiten',
    noNews: 'Noch nichts von der Plattform.',

    studio: 'Aus dem Studio',
    openStudio: 'Studio öffnen',
    nothingMade:
      'Hier wurde noch nichts gemacht. Im Studio spazieren die Tiere umher, wird ein Bild aufgenommen oder ein Banner gebaut.',
    makeOne: 'Eines machen',
    shared: 'Geteilt',

    emptyCanPost:
      'Noch nichts an der Pinnwand. Schreiben Sie den ersten Aushang, oder machen Sie etwas im Studio und heften Sie es hierher.',
    empty: 'Noch nichts an der Pinnwand.',
    compose: 'Sagen Sie dem Space etwas',
    keepAtTop: 'Oben festhalten',
    post: 'Anschlagen',
    posting: 'Wird angeschlagen …',
    pinned: 'Angeheftet',
    pin: 'Anheften',
    unpin: 'Lösen',
    edited: 'bearbeitet',
    edit: 'Bearbeiten',
    cancel: 'Abbrechen',
    remove: 'Entfernen',
    save: 'Speichern',
    someone: 'jemand',
    addEmote: 'Ein Emote hinzufügen',
    closeEmotes: 'Emotes schließen',
  },

  members: {
    heading: 'Mitglieder',
    you: 'Sie',
    roleFor: 'Rolle von {name}',
    remove: 'Entfernen',
    pending: 'Offene Einladungen',
    revoke: 'Zurückziehen',
    roles: { owner: 'Inhaber', admin: 'Admin', member: 'Mitglied', guest: 'Gast' },
    roleHelp: {
      owner: 'Volle Kontrolle, einschließlich Rollen und Archivierung',
      admin: 'Kann Mitglieder einladen und entfernen',
      member: 'Kann an Aufgaben arbeiten',
      guest: 'Zu Besuch über einen Link — kann nichts ändern',
    },

    invite: 'Jemanden einladen',
    inviteePlaceholder: 'Benutzername oder E-Mail',
    inviteeLabel: 'Benutzername oder E-Mail-Adresse',
    roleLabel: 'Rolle',
    send: 'Einladung senden',
    inviteNote:
      'Es wird keine E-Mail verschickt — die Einladung erscheint bei der nächsten Anmeldung auf der Seite /invitations. Eine Einladung per Adresse funktioniert auch ohne bestehendes Konto; gibt es eines, wird nur der Benutzername vermerkt.',

    rename: 'Space umbenennen',
    newName: 'Neuer Name',
    renameCta: 'Umbenennen',
    urlStaysLead: 'Die Adresse bleibt ',
    urlStaysTail:
      ' — sie wurde beim Anlegen des Space reserviert, und sie umzuhängen würde jeden gespeicherten Link zerreißen.',

    leave: 'Space verlassen',
    leaveNote:
      'Sie behalten nichts und verlieren nichts — was Sie geschrieben haben, bleibt im Protokoll und trägt Ihren Namen.',
    leaveCta: 'Verlassen',
    archiveNote: 'Archivieren stoppt neue Ereignisse, ohne etwas zu löschen.',
    archive: 'Space archivieren',
  },

  streaks: {
    heading: 'Serien',
    body: 'Tage in Folge, an denen Sie in {space} da waren. Öffnen Sie den Space an jedem Tag, um Ihre Serie zu halten — ein Tag Pause, und sie fängt wieder bei eins an.',
    empty: 'Noch niemand auf der Tafel. Heute vorbeizuschauen ist Tag eins.',
  },

  tasks: {
    archived:
      'Dieser Space ist archiviert. Seine Geschichte ist vollständig und weiter lesbar, aber es können keine neuen Ereignisse geschrieben werden.',
    placeholder: 'Was ist zu tun?',
    add: 'Hinzufügen',
    syncing: 'Wird ins Ereignisprotokoll übertragen …',
    empty: 'Noch keine Aufgaben. Legen Sie eine an und sehen Sie zu, wie sich das Protokoll füllt.',
    save: 'Speichern',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    versionTitle: 'Aggregat-Version — wie viele Ereignisse diese Aufgabe hat',
    markComplete: '„{title}“ als erledigt markieren',
    markIncomplete: '„{title}“ als offen markieren',
    addedBy: 'Angelegt von {name}',
  },

  rooms: {
    heading: 'Räume',
    body: 'Mehr als ein Ort zum Sein. Jeder Raum hat seine eigene Welt und seinen eigenen Kanal, es können also zwei Dinge gleichzeitig passieren.',
    theLounge: 'Die Lounge',
    theLoungeBody: 'Der Raum, den alle teilen. Immer da.',

    namePlaceholder: 'Wie soll der neue Raum heißen?',
    opening: 'Wird geöffnet …',
    openRoom: 'Raum öffnen',
    emptyCanManage: 'Noch keine Räume. Benennen Sie oben einen, und Sie landen direkt darin.',
    empty: 'Noch keine Räume. Inhaber und Admins können einen öffnen.',
    full: 'Voll',
    fullBody:
      'Dieser ist voll. Wer hineingeht, landet im leersten Raum, in dem noch Platz ist.',
    ownWorld:
      'Eigene Welt, eigener Kanal — wer hier drin ist, ist nicht in der Lounge.',
    delete: 'Löschen',
    close: 'Schließen',
    confirmDelete: '„{name}“ löschen?',
    confirmClose: '„{name}“ schließen?',
    cap: 'Grenze',
    guestsMayBuild: 'Gäste dürfen hier bauen',

    otherRoomsNote:
      'Diese Liste aktualisiert sich von selbst. Sobald jemand geht, leuchtet der Raum auf.',
    openingAnother: 'Ein weiterer Raum wird geöffnet …',
    openingAnotherBody:
      'Alle Räume waren voll, deshalb geht gerade ein neuer für Sie auf.',
    isFull: '{name} ist voll',
    cappedBody:
      'Räume sind begrenzt, damit alle im Space eine flüssige Verbindung behalten — ein überfüllter Raum bremst auch jeden anderen.',

    roundLabel: 'Raum · Runde läuft',
    roundStarted: '{name} hat begonnen',
    roundBody:
      'Hier drin läuft eine Runde, deshalb ist die Tür zu. Sie geht wieder auf, wenn die Runde endet — oder Sie öffnen sie jetzt, dann kommen Sie hinein und alle anderen spielen weiter.',
    openTheDoor: 'Tür öffnen',

    levelLabel: 'Raum · Level',
    notOpen: '{name} ist nicht offen',
    neverSaved:
      'Dieser Raum wurde auf ein Level gezeigt, bevor es je gespeichert wurde, es gibt hier also noch nichts zu laden. Mit dem Raum ist alles in Ordnung — speichern Sie das Level und zeigen Sie den Raum erneut darauf.',
    cannotLoad:
      'Das Level, das dieser Raum spielt, lässt sich hier nicht laden — vielleicht wurde es zurückgezogen, oder dieser Space hat XP nicht mehr. Mit dem Raum ist alles in Ordnung.',
    openInEditor: 'Das Level im Editor öffnen →',
    backToRooms: '← Räume',

    leave: 'Verlassen',
  },

  worlds: {
    heading: 'Welten',
    body: 'Orte, die dieser Space gebaut hat, und Orte, die sich alle ausleihen können.',
    forRoom: 'Wählen Sie eine, die in „{name}“ geladen wird.',
    backToRoom: 'Zurück in den Raum',
    build: 'Eine Welt bauen',
    yours: 'Ihre',
    yoursEmpty: 'Noch nichts. Der Baukasten fängt leer an, und ein Boden ist ein Zug.',
    openInBuilder: 'Im Baukasten öffnen',
    kept: 'Von Ihnen behalten',
    fromEveryone: 'Von allen anderen',
    publicCatalogue: 'Der öffentliche Katalog ↗',
    filterLabel: 'Welten filtern',
    everything: 'Alles',
    newest: 'Neueste',
    saved: 'Gemerkt',
    keptEmpty: 'Noch nichts gemerkt. Das Herz auf einer Karte legt sie hierher.',
    taggedEmpty: 'Noch nichts mit diesem Schlagwort.',
    publishedEmpty: 'Noch nichts veröffentlicht.',
    tags: {
      arena: {
        label: 'Arena',
        hint: 'Zum Kämpfen gebaut — Deckung, Sichtlinien, keine Sackgassen.',
      },
      pitch: {
        label: 'Platz',
        hint: 'Ein Fußballplatz, mit Raum für ein Tor an jedem Ende.',
      },
      hangout: { label: 'Treffpunkt', hint: 'Ein Ort zum Herumstehen und Reden.' },
      showcase: { label: 'Schaustück', hint: 'Zum Anschauen gebaut, nicht zum Spielen.' },
      event: { label: 'Event', hint: 'Eine Bühne, Sitzplätze, ein Raum für viele.' },
      office: {
        label: 'Büro',
        hint: 'Schreibtische, Besprechungsräume, ein Ort, der nach Arbeit aussieht.',
      },
      nature: { label: 'Natur', hint: 'Parks, Bäume, Wasser, Gelände.' },
      city: { label: 'Stadt', hint: 'Straßen und Gebäude.' },
      maze: { label: 'Labyrinth', hint: 'Sich zu verlaufen ist der Sinn der Sache.' },
      parkour: { label: 'Parkour', hint: 'Sprünge, Lücken, ein Weg nach oben.' },
      small: {
        label: 'Klein',
        hint: 'Ein paar hundert Blöcke — schnell in einen Space gesetzt.',
      },
      seasonal: {
        label: 'Saisonal',
        hint: 'Schnee, Feiertage, etwas, das einmal im Jahr wiederkommt.',
      },
    },
    blocks: '{n} Blöcke',
    usedTimes: '· {n}× genutzt',
    seenTimes: '· {n}× gesehen',
    notPublished: '· nicht veröffentlicht',
    aFork: '· eine Abzweigung',
  },

  pages: {
    heading: 'Seiten',
    welcome: 'Willkommen bei den Seiten von {space}',
    body: 'Verschachtelte Seiten anlegen, Dokumente ordnen und mit TipTap formatiert schreiben. Jede Änderung wird als Ereignis festgehalten.',
    recent: 'Zuletzt bearbeitet',
    untitled: 'Unbenannte Seite',
    pick: 'Wählen Sie links in der Leiste eine Seite oder legen Sie eine an, um zu schreiben.',
    sidebar: 'Seiten',
    collapse: 'Leiste einklappen',
    expand: 'Leiste ausklappen',
    newTopLevel: 'Neue oberste Seite anlegen',
    page: 'Seite',
    empty: 'Keine Seiten in diesem Space.',
    createFirst: 'Legen Sie Ihre erste Seite an',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    addSubpage: 'Unterseite hinzufügen',
    deletePage: 'Seite löschen',
    confirmDelete:
      'Möchten Sie diese Seite wirklich löschen und aus Ihrem Space entfernen?',
  },

  paused: {
    heading: '{name} ist pausiert',
    body: 'Das Abo für diesen Space ist nicht mehr aktiv, deshalb nimmt er keine Änderungen mehr an.',
    paidThrough: ' Bezahlt war er bis {date}.',
    nothingDeleted: 'Es wurde nichts gelöscht.',
    nothingDeletedRest:
      ' Jede Aufgabe, jedes Ereignis und jeder Block ist noch da. Eine Verlängerung bringt alles genau so zurück — es gibt keinen Wiederherstellungsschritt.',
    welcomeBack:
      'Willkommen zurück — {name} ist wieder offen bis {date}. Keine Karte, und am Ende wird nichts abgebucht.',
    claiming: 'Wird wieder geöffnet …',
    claim: 'Einen Monat xo gratis testen',
    claimNote:
      '30 Tage xo, keine Karte, am Ende wird nichts abgebucht — es pausiert einfach wieder. Ein Gratismonat pro Konto.',
    openingStripe: 'Stripe wird geöffnet …',
    restart: 'Mit {tier} neu starten — {price}',
    ownerOnly:
      'Nur der Inhaber des Space kann verlängern. Bitten Sie ihn, sich anzumelden und das Abo neu zu starten.',
    backToSpaces: 'Zurück zu Ihren Spaces',
  },

  event: {
    label: 'Event',
    opens: 'Öffnet',
    live: 'Live',
    ended: 'Vorbei',
    opensLine:
      'Die Türen öffnen {when}. Sie können jetzt schon bauen — Besuchende kommen bis dahin nicht herein.',
    runningLine: 'Läuft bis {when}.',
    endedLine:
      'Zu Ende {when}. Alles hier Gebaute ist noch da und weiter lesbar — nur die Türen sind zu.',
    hide: 'Ausblenden, bis das Event etwas Neues sagt',
  },

  verifyEmail: {
    label: 'Bestätigen Sie Ihre E-Mail-Adresse',
    body:
      'Wir haben nie geprüft, ob {email} Sie wirklich erreicht. Schicken Sie sich einen Link und öffnen Sie ihn — mehr ist es nicht, und genau das bringt Sie zurück ins Konto, falls Sie Ihr Passwort einmal verlieren.',
    spam: 'Schon einen bekommen? Sehen Sie im Spam- oder Werbeordner nach — die erste Mail von einem neuen Absender landet oft dort.',
    send: 'Link schicken',
    sending: 'Wird gesendet …',
    sent: 'An {email} geschickt. Öffnen Sie den Link darin, dann ist es erledigt.',
    pending:
      'Wir warten auf den Link an {email}. Ihn zu öffnen schließt den Wechsel ab — bis dahin behält dieses Konto die Adresse oben.',
    hide: 'Später',
  },

  welcome: {
    youreIn: 'Sie sind drin',
    heading: 'Willkommen bei {space}',
    close: 'Schließen',
    body: 'Wählen Sie den Peep, als den alle hier Sie sehen. Er gilt für Ihr Konto — dasselbe Tier in jeder Lounge, zu der Sie gehören, im Café und im Haus — und Sie können ihn jederzeit in den Einstellungen ändern.',
    youAreLead: 'Sie sind ',
    youAreTail: '.',
    saving: 'Wird gespeichert …',
    enter: 'Zu {space}',
  },

  builder: {
    heading: 'Weltenbaukasten',
    editing: '„{name}“ wird bearbeitet',
    bodyLead:
      'Legen Sie einen Ort Block für Block an — die Blöcke, die eine Welt behält, wenn ein Space sie aufstellt — und veröffentlichen Sie ihn dann in Ihrem Space oder für ',
    everybody: 'alle',
    bodyTail: '.',
    yourWorlds: 'Ihre Welten →',
    openOneLabel: 'Ihre Welten',
    openOne: 'Eine von Ihren öffnen',
    draft: 'Entwurf',
    touchNote:
      'Auf dem Handy: ein Finger zeichnet, zwei Finger zoomen und schieben, und die Knöpfe auf dem Bild sind Umsehen und Radieren. Die Leiste liegt unter dem sichtbaren Bereich, und was Ihnen fehlt, sind die Tastenkürzel.',
  },

  studio: {
    title: 'Studio',
    body: 'Machen Sie etwas mit den Tieren und heften Sie es an die Pinnwand oder schicken Sie den Link an wen Sie wollen.',
    doors: {
      video: {
        title: 'XO Suite',
        blurb:
          'Die Darsteller umherlaufen lassen, sie reden lassen, die Kamera bewegen. Aufnehmen — oder ein Einzelbild als Bild exportieren.',
      },
      banner: {
        title: 'Banner',
        blurb: 'Ein Himmel, Blöcke, die hindurchtreiben, und eine Überschrift zum Bearbeiten.',
      },
      game: {
        title: 'XP Creator',
        blurb: 'Ein Ort zum Herumlaufen, Dinge, die zählen, und Regeln, die es beenden.',
      },
      sketch: {
        title: 'XP p5.js',
        blurb: 'Ein Spiel als Code, auf eigener Leinwand gezeichnet. Öffnet ein neues Sketch-Projekt.',
      },
    },
    startFrom: 'Mit einer davon anfangen',
    recent: 'Wo Sie aufgehört haben',
    recentFilters: { all: 'alle', game: 'Spiele', movie: 'Filme' },
    kinds: { game: 'Spiel', movie: 'Film' },
    nothingRecent: 'Noch nichts. Öffnen Sie oben eine Tür, oder fangen Sie mit einer Vorlage an.',
    sharedChip: 'geteilt',
    kept: 'Behalten',
    empty: 'Noch nichts gespeichert.',
    games: 'Spiele',
    gamesCount: '{n} in diesem Space',
    noGames: 'Noch keins',
    gamesEmpty: 'Noch kein Spiel in diesem Space. Fang eins an, dann steht es beim nächsten Mal hier.',
    newGame: 'Neues Spiel',
    allGames: 'Alle Projekte, das Magazin und der Store →',
    templates: {
      rock: {
        name: 'Den Stein kicken',
        teaches: 'Ein gekeyter Gegenstand, der auf etwas reagiert, das ein Tier getan hat',
      },
      standoff: {
        name: 'Das Duell',
        teaches: 'Zwei Darsteller, die abwechselnd reden, und eine Kamera, die näher kommt',
      },
      entrance: {
        name: 'Der große Auftritt',
        teaches: 'Ein Anlauf, ein Sprung, und alle reagieren auf denselben Schlag',
      },
      'dance-off': {
        name: 'Tanzduell',
        teaches: 'Überlappende Tänze, und ein Licht, das sich mit ihnen ändert',
      },
      delivery: {
        name: 'Die Lieferung',
        teaches: 'Ein Gegenstand, der wandert, gekeyt neben jemandem, der ihn trägt',
      },
      flyby: { name: 'Vorbeiflug', teaches: 'Drei Kamera-Keys, und warum Easing zählt' },
      penalty: {
        name: 'Der Elfmeter',
        teaches: 'Ein Ball, der an einen Schuss gekeyt ist, und ein Tor',
      },
      queue: {
        name: 'Die Schlange',
        teaches: 'Vier Darsteller so timen, dass sie nacheinander loslaufen',
      },
      growth: {
        name: 'Wachstumsschub',
        teaches: 'Die Größe eines Darstellers keyen, was kein Verb kann',
      },
      'night-shift': {
        name: 'Nachtschicht',
        teaches: 'Ein dunkles Licht, ein Hintergrund, und ein Tier allein',
      },
    },

    videoTitle: 'Video',
    videoBody:
      'Übernehmen Sie ein Tier und spielen Sie, oder legen Sie die Zeitleiste von Hand.',
    pictureTitle: 'Bild',
    pictureBody:
      'Ordnen Sie die Tiere an und exportieren Sie das Bild mit transparentem Hintergrund.',
    bannerTitle: 'Banner',
    bannerBody:
      'Würfeln Sie den Flug neu, bis die Anordnung sitzt, und behalten Sie sie — ein gespeichertes Banner ist das, was eine Event-Seite zeigt.',
    keptHere: 'In diesem Space behalten',
    metaVideo: 'Video-Studio',
    metaPicture: 'Bild-Studio',
    metaBanner: 'Banner-Studio',

    metaStudio: 'Studio',
    metaEditor: 'Editor',
    lockedTitle: 'Woanders geöffnet',
    lockedBody:
      '{name} hat dieses Projekt offen. Es kann immer nur eine Person bearbeiten — Zusammenarbeit haben wir noch nicht gebaut, und so zu tun als ob hieße, dass einer von Ihnen Arbeit verliert.',
    freesUp: 'Wenn es geschlossen wurde, wird es um {time} von allein wieder frei.',
    checking: 'Wird geprüft …',
    tryAgain: 'Nochmal versuchen',
    backToProject: 'Zurück zum Projekt',
    refusedLabel: 'Editor · abgelehnt',
    refusedTitle: '{name} ließ sich nicht öffnen',
    refusedBody:
      'Die gespeicherte Fassung passt zu dem Parser, gegen den sie geschrieben wurde, und nicht zu diesem. Es ist nichts verloren — die Datei ist genau so, wie sie gespeichert wurde, und lässt sich weiterhin exportieren.',
    oneProblem: 'Das Problem steht unten.',
    manyProblems: 'Die Probleme stehen unten.',
  },
}

export const WORKSPACE_BG: WorkspaceDict = {
  titles: {
    overview: 'Общ преглед',
    dashboard: 'Табло',
    people: 'Хора',
    streaks: 'Серии',
    tasks: 'Задачи',
    rooms: 'Стаи',
    pages: 'Страници',
    worlds: 'Светове',
    world: 'Свят',
    room: 'Стая',
    welcome: 'Добре дошли',
    builder: 'Строител на светове',
    skins: 'Скинове',
  },

  board: {
    heading: 'Дъска',
    newsTab: 'Новини',
    walkIn: 'Влезте',
    theRadio: 'Радиото',
    lightsAreOn: 'Светлините са включени',
    isOn: '{name} свири',
    noStreak: 'Наминавайте всеки ден, за да започнете серия',
    daysInARowOne: 'ден поред',
    daysInARowMany: 'дни поред',
    bestStreak: '· най-добро {n}',
    seeTheBoard: '— към дъската',

    news: 'От платформата',
    hideAnnouncement: 'Скрий това съобщение',
    hideIt: 'Скрий го — остава под Новини',
    noNews: 'Още нищо от платформата.',

    studio: 'От студиото',
    openStudio: 'Отвори студиото',
    nothingMade:
      'Тук още нищо не е направено. Студиото разхожда животните, прави снимка или сглобява банер.',
    makeOne: 'Направете едно',
    shared: 'Споделено',

    emptyCanPost:
      'Още няма нищо на дъската. Напишете първото съобщение или направете нещо в студиото и го закачете тук.',
    empty: 'Още няма нищо на дъската.',
    compose: 'Кажете нещо на спейса',
    keepAtTop: 'Дръж го най-отгоре',
    post: 'Публикувай',
    posting: 'Публикува се…',
    pinned: 'Закачено',
    pin: 'Закачи',
    unpin: 'Откачи',
    edited: 'редактирано',
    edit: 'Редактирай',
    cancel: 'Отказ',
    remove: 'Премахни',
    save: 'Запази',
    someone: 'някой',
    addEmote: 'Добави жест',
    closeEmotes: 'Затвори жестовете',
  },

  members: {
    heading: 'Членове',
    you: 'вие',
    roleFor: 'Роля за {name}',
    remove: 'Премахни',
    pending: 'Чакащи покани',
    revoke: 'Оттегли',
    roles: { owner: 'собственик', admin: 'админ', member: 'член', guest: 'гост' },
    roleHelp: {
      owner: 'Пълен контрол, включително ролите и архивирането',
      admin: 'Може да кани и премахва членове',
      member: 'Може да работи по задачите',
      guest: 'На посещение с линк — не може да променя нищо',
    },

    invite: 'Поканете някого',
    inviteePlaceholder: 'потребителско име или имейл',
    inviteeLabel: 'Потребителско име или имейл адрес',
    roleLabel: 'Роля',
    send: 'Изпрати поканата',
    inviteNote:
      'Не се изпраща имейл — поканата се появява на страницата им /invitations при следващото им влизане. Каненето по адрес работи независимо дали вече имат акаунт; ако имат, се записва само потребителското им име.',

    rename: 'Преименувай спейса',
    newName: 'Ново име',
    renameCta: 'Преименувай',
    urlStaysLead: 'Адресът остава ',
    urlStaysTail:
      ' — беше запазен при създаването на спейса, а пренасочването му би счупило всеки линк, който някой е запазил.',

    leave: 'Напусни спейса',
    leaveNote:
      'Нищо не задържате и нищо не губите — събитията, които сте написали, остават в лога, приписани на вас.',
    leaveCta: 'Напусни',
    archiveNote: 'Архивирането спира новите събития, без да изтрива нищо.',
    archive: 'Архивирай спейса',
  },

  streaks: {
    heading: 'Серии',
    body: 'Дни поред, в които сте се появявали в {space}. Отваряйте спейса всеки ден, за да продължи вашата — пропуснете ден и започва пак от едно.',
    empty: 'Още никой не е на таблото. Да се появите днес е ден първи.',
  },

  tasks: {
    archived:
      'Този спейс е архивиран. Историята му е непокътната и още се чете, но нови събития не могат да се пишат.',
    placeholder: 'Какво трябва да се свърши?',
    add: 'Добави',
    syncing: 'Синхронизира се с дневника на събитията…',
    empty: 'Още няма задачи. Добавете една и гледайте как дневникът се пълни.',
    save: 'Запази',
    cancel: 'Отказ',
    edit: 'Редактирай',
    delete: 'Изтрий',
    versionTitle: 'Версия на агрегата — колко събития има тази задача',
    markComplete: 'Отбележи „{title}“ като готова',
    markIncomplete: 'Отбележи „{title}“ като незавършена',
    addedBy: 'Добавена от {name}',
  },

  rooms: {
    heading: 'Стаи',
    body: 'Повече от едно място, на което да си. Всяка стая има свой свят и свой канал, така че две неща може да се случват едновременно.',
    theLounge: 'Лоунджът',
    theLoungeBody: 'Стаята, която всички споделят. Винаги е тук.',

    namePlaceholder: 'Наименувайте нова стая',
    opening: 'Отваря се…',
    openRoom: 'Отвори стая',
    emptyCanManage: 'Още няма стаи. Наименувайте една горе и попадате направо вътре.',
    empty: 'Още няма стаи. Собственик или админ може да отвори една.',
    full: 'Пълна',
    fullBody: 'Тази е пълна. Влизането ви праща в най-празната стая с място.',
    ownWorld: 'Свой свят и свой канал — който е тук, не е в лоунджа.',
    delete: 'Изтрий',
    close: 'Затвори',
    confirmDelete: 'Да изтрия ли „{name}“?',
    confirmClose: 'Да затворя ли „{name}“?',
    cap: 'Таван',
    guestsMayBuild: 'Посетителите може да строят тук',

    otherRoomsNote:
      'Този списък се обновява сам. В момента, в който някой излезе, стаята му светва.',
    openingAnother: 'Отваря се друга стая…',
    openingAnotherBody: 'Всяка стая беше пълна, затова за вас се вдига нова.',
    isFull: '{name} е пълна',
    cappedBody:
      'Стаите имат таван, за да запази всеки в спейса плавна връзка — една претъпкана стая забавя и всяка друга.',

    roundLabel: 'Стая · Тече рунд',
    roundStarted: '{name} започна',
    roundBody:
      'Тук се играе рунд, затова вратата е затворена. Отваря се пак, когато рундът свърши — или може да я отворите сега, което пуска вас, а на всички останали позволява да продължат.',
    openTheDoor: 'Отвори вратата',

    levelLabel: 'Стая · Ниво',
    notOpen: '{name} не е отворена',
    neverSaved:
      'Тази стая беше насочена към ниво, преди то изобщо да е било запазвано, така че още няма какво да се зареди. Самата стая е наред — запазете нивото и я насочете пак към него.',
    cannotLoad:
      'Нивото, което тази стая играе, не може да се зареди тук — може да е свалено или този спейс вече да не включва XP. Самата стая е наред.',
    openInEditor: 'Отвори нивото в редактора →',
    backToRooms: '← Стаи',

    leave: 'Напусни',
  },

  worlds: {
    heading: 'Светове',
    body: 'Места, които този спейс е построил, и места, които всеки може да заеме.',
    forRoom: 'Изберете един, който да се зареди в „{name}“.',
    backToRoom: 'Обратно в стаята',
    build: 'Построй свят',
    yours: 'Ваши',
    yoursEmpty: 'Още нищо. Строителят започва празен, а подът е едно влачене.',
    openInBuilder: 'Отвори в строителя',
    kept: 'Запазени от вас',
    fromEveryone: 'От всички останали',
    publicCatalogue: 'Публичният каталог ↗',
    filterLabel: 'Филтрирай световете',
    everything: 'Всичко',
    newest: 'Най-нови',
    saved: 'Запазени',
    keptEmpty: 'Още нищо не е запазено. Сърцето върху картата го слага тук.',
    taggedEmpty: 'Още нищо не е с този етикет.',
    publishedEmpty: 'Още нищо не е публикувано.',
    tags: {
      arena: { label: 'Арена', hint: 'Построена за бой — прикритие, видимост, без задънени места.' },
      pitch: { label: 'Игрище', hint: 'Футболен терен, с място за врати на всеки край.' },
      hangout: { label: 'Сборно място', hint: 'Място, на което да стоиш и да говориш.' },
      showcase: { label: 'Витрина', hint: 'Построена, за да се гледа, а не да се играе в нея.' },
      event: { label: 'Събитие', hint: 'Сцена, места за сядане, зала за тълпа.' },
      office: { label: 'Офис', hint: 'Бюра, зали за срещи, място, което се чете като работа.' },
      nature: { label: 'Природа', hint: 'Паркове, дървета, вода, терен.' },
      city: { label: 'Град', hint: 'Улици и сгради.' },
      maze: { label: 'Лабиринт', hint: 'Да се загубиш е целта.' },
      parkour: { label: 'Паркур', hint: 'Скокове, пропасти, маршрут до върха.' },
      small: { label: 'Малък', hint: 'Няколко стотин блока — бързо се пуска в спейс.' },
      seasonal: {
        label: 'Сезонен',
        hint: 'Сняг, празници, нещо, което идва веднъж годишно.',
      },
    },
    blocks: '{n} блока',
    usedTimes: '· използван {n}×',
    seenTimes: '· видян {n}×',
    notPublished: '· не е публикуван',
    aFork: '· разклонение',
  },

  pages: {
    heading: 'Страници',
    welcome: 'Добре дошли в страниците на {space}',
    body: 'Създавайте вложени страници, подреждайте документи и пишете форматиран текст с TipTap. Всяка промяна на състоянието се записва като събитие.',
    recent: 'Скорошни страници',
    untitled: 'Страница без заглавие',
    pick: 'Изберете или създайте страница в лентата вляво, за да започнете да пишете.',
    sidebar: 'Страници',
    collapse: 'Свий лентата',
    expand: 'Разгъни лентата',
    newTopLevel: 'Създай нова страница от най-горно ниво',
    page: 'Страница',
    empty: 'Няма страници в спейса.',
    createFirst: 'Създайте първата си страница',
    moveUp: 'Нагоре',
    moveDown: 'Надолу',
    addSubpage: 'Добави подстраница',
    deletePage: 'Изтрий страницата',
    confirmDelete:
      'Сигурни ли сте, че искате да изтриете тази страница и да я премахнете от спейса си?',
  },

  paused: {
    heading: '{name} е на пауза',
    body: 'Абонаментът за този спейс вече не е активен, затова той спря да приема промени.',
    paidThrough: ' Беше платен до {date}.',
    nothingDeleted: 'Нищо не е изтрито.',
    nothingDeletedRest:
      ' Всяка задача, всяко събитие и всеки блок са още тук. Подновяването връща всичко точно както си беше — няма стъпка по възстановяване.',
    welcomeBack:
      'Добре дошли отново — {name} е отворен пак до {date}. Без карта, и в края нищо не се таксува.',
    claiming: 'Отваря се пак…',
    claim: 'Пробвайте един месец xo, безплатно',
    claimNote:
      '30 дни xo, без карта, в края нищо не се таксува — просто пак застава на пауза. По един безплатен месец на акаунт.',
    openingStripe: 'Stripe се отваря…',
    restart: 'Започни отново на {tier} — {price}',
    ownerOnly:
      'Само собственикът на спейса може да го поднови. Помолете го да влезе и да рестартира абонамента.',
    backToSpaces: 'Обратно към спейсовете ви',
  },

  event: {
    label: 'Събитие',
    opens: 'Отваря',
    live: 'На живо',
    ended: 'Приключи',
    opensLine: 'Вратите отварят {when}. Може да строите отсега — посетителите не влизат дотогава.',
    runningLine: 'Тече до {when}.',
    endedLine:
      'Приключи {when}. Всичко построено тук още е тук и още се чете — просто вратите са затворени.',
    hide: 'Скрий това, докато събитието не каже нещо ново',
  },

  verifyEmail: {
    label: 'Потвърдете имейла си',
    body:
      'Никога не сме проверявали дали {email} стига до вас. Пратете си линк и го отворете — това е всичко, и точно то ви връща обратно, ако някога загубите паролата си.',
    spam: 'Вече сте пратили един? Погледнете в спам или в промоции — първото писмо от нов подател често пада там.',
    send: 'Прати ми линка',
    sending: 'Изпраща се…',
    sent: 'Изпратено до {email}. Отворете линка вътре и това е готово.',
    pending:
      'Чакаме линка, който изпратихме до {email}. Отворите ли го, смяната приключва — дотогава акаунтът пази адреса отгоре.',
    hide: 'Не сега',
  },

  welcome: {
    youreIn: 'Влязохте',
    heading: 'Добре дошли в {space}',
    close: 'Затвори',
    body: 'Изберете пийпа, като когото всички тук ще ви виждат. Той следва акаунта ви — същото животно във всеки лоундж, към който принадлежите, в кафенето и в къщата — и може да го смените по всяко време в Настройки.',
    youAreLead: 'Вие сте ',
    youAreTail: '.',
    saving: 'Запазва се…',
    enter: 'Влез в {space}',
  },

  builder: {
    heading: 'Строител на светове',
    editing: 'Редактира се „{name}“',
    bodyLead:
      'Подредете едно място блок по блок — блоковете, които светът пази, когато спейс го вдигне — и после го публикувайте в своя спейс или за ',
    everybody: 'всички',
    bodyTail: '.',
    yourWorlds: 'Вашите светове →',
    openOneLabel: 'Вашите светове',
    openOne: 'Отвори някой ваш',
    draft: 'чернова',
    touchNote:
      'На телефон: един пръст рисува, два пръста мащабират и местят, а бутоните върху картината са оглеждане и триене. Панелът е под изгледа, а клавишните комбинации са това, което ви липсва.',
  },

  studio: {
    title: 'Студио',
    body: 'Направете нещо с животните, после го закачете на дъската или пратете линка на когото поискате.',
    doors: {
      video: {
        title: 'XO Suite',
        blurb:
          'Разходете състава, оставете ги да говорят, местете камерата. Запишете го — или изнесете един кадър като снимка.',
      },
      banner: {
        title: 'Банер',
        blurb: 'Небе, блокове, които се носят през него, и заглавие, което може да редактирате.',
      },
      game: {
        title: 'XP Creator',
        blurb: 'Място, из което да се ходи, неща, които се броят, и правила, които я приключват.',
      },
      sketch: {
        title: 'XP p5.js',
        blurb: 'Игра, която е код, върху собствено платно. Отваря нов скеч проект.',
      },
    },
    startFrom: 'Започнете от някое от тези',
    recent: 'Докъдето стигнахте',
    recentFilters: { all: 'всичко', game: 'игри', movie: 'филми' },
    kinds: { game: 'игра', movie: 'филм' },
    nothingRecent: 'Още нищо. Отворете врата отгоре или започнете от шаблон.',
    sharedChip: 'споделено',
    kept: 'Запазени',
    empty: 'Още нищо не е запазено.',
    games: 'Игри',
    gamesCount: '{n} в този спейс',
    noGames: 'Още няма',
    gamesEmpty: 'В този спейс още няма игра. Започнете една и следващия път се отваря тук.',
    newGame: 'Нова игра',
    allGames: 'Всички проекти, списанието и магазинът →',
    templates: {
      rock: {
        name: 'Ритни камъка',
        teaches: 'Реквизит на ключове, който отвръща на нещо, направено от животно',
      },
      standoff: {
        name: 'Двубоят',
        teaches: 'Двама актьори, които говорят на смени, и камера, която се приближава',
      },
      entrance: {
        name: 'Голямото влизане',
        teaches: 'Засилване, скок и всички, които отвръщат в един и същи такт',
      },
      'dance-off': {
        name: 'Танцов двубой',
        teaches: 'Застъпващи се танци и светлина, която се сменя с тях',
      },
      delivery: {
        name: 'Доставката',
        teaches: 'Реквизит, който пътува, с ключове успоредно на този, който го носи',
      },
      flyby: { name: 'Прелитане', teaches: 'Три ключа на камерата и защо забавянето има значение' },
      penalty: { name: 'Дузпата', teaches: 'Топка на ключове спрямо ритник, и гол' },
      queue: {
        name: 'Опашката',
        teaches: 'Разчитане на времето на четирима актьори, за да тръгнат един след друг',
      },
      growth: {
        name: 'Израстване',
        teaches: 'Ключове върху размера на актьор, което никой глагол не може',
      },
      'night-shift': {
        name: 'Нощна смяна',
        teaches: 'Тъмна светлина, декор и едно животно само',
      },
    },

    videoTitle: 'Видео',
    videoBody: 'Поемете едно животно и изиграйте сцената, или подредете времевата линия на ръка.',
    pictureTitle: 'Снимка',
    pictureBody: 'Подредете животните и изнесете кадъра с прозрачен фон.',
    bannerTitle: 'Банер',
    bannerBody:
      'Разбърквайте носенето, докато подредбата легне, после я задръжте — запазеният банер е това, което показва страницата на едно събитие.',
    keptHere: 'Запазени в този спейс',
    metaVideo: 'Видео студио',
    metaPicture: 'Снимково студио',
    metaBanner: 'Банер студио',

    metaStudio: 'Студио',
    metaEditor: 'Редактор',
    lockedTitle: 'Отворено някъде другаде',
    lockedBody:
      '{name} държи този проект отворен. Само един човек може да редактира наведнъж — още не сме направили съвместна работа, а да се преструваме на обратното би означавало един от вас да загуби работата си.',
    freesUp: 'Ако го е затворил, се освобождава само в {time}.',
    checking: 'Проверява се…',
    tryAgain: 'Опитайте пак',
    backToProject: 'Обратно към проекта',
    refusedLabel: 'Редактор · отказано',
    refusedTitle: '{name} не се отвори',
    refusedBody:
      'Запазената версия е валидна за парсера, срещу който е писана, но не и за този. Нищо не е загубено — файлът е точно както е бил запазен и още може да се експортира.',
    oneProblem: 'Проблемът е по-долу.',
    manyProblems: 'Проблемите са по-долу.',
  },
}

const DICTS: Record<Locale, WorkspaceDict> = {
  en: WORKSPACE_EN,
  de: WORKSPACE_DE,
  bg: WORKSPACE_BG,
}

export function workspaceDict(locale: Locale): WorkspaceDict {
  return DICTS[locale]
}
