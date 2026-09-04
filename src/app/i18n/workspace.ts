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
    thingiverse: string
  }

  /**
   * The thingiverse: the shelf, and the packs it is cut from.
   *
   * The third dictionary this one feature reaches, and the split is by *mood*
   * rather than by feature. `world.ts` has what you read while holding a bench
   * over a floor; `rail.ts` has the tab you summon from; this has the page you
   * read while deciding what a thing should be. A single block would put a
   * button label from a HUD next to a paragraph about licences.
   */
  thingiverse: {
    heading: string
    intro: string
    /** The two halves of the page. */
    shelfTab: string
    packsTab: string
    search: string
    /**
     * The submit button beside it.
     *
     * Its own word rather than `search` reused: the box already says "Search
     * every pack" as its placeholder, and a button repeating that reads as the
     * page having drawn one control twice.
     */
    searchGo: string
    searchHint: string
    /** `{n}` models in `{pack}`. */
    packSize: string
    /**
     * The two catalogues, as headings over the chips.
     *
     * Labelled because they collide: both ship a pack called Prototype and both
     * ship one called Peeps, and a single row of fifty-one chips listed each
     * name twice with nothing to tell them apart. See `MODEL_PACKS`.
     */
    roomPacks: string
    levelPacks: string
    /** The chip that clears the pack filter, across both catalogues. */
    everyPack: string
    /** How many packs are folded away behind the level row. `{n}` of them. */
    packCount: string
    /** How much of the search is drawn: `{shown}` of `{total}`. */
    showing: string
    /** Nothing in either catalogue matches `{q}`. */
    noModels: string
    make: string
    making: string
    /** Nobody has cut anything from the packs yet. */
    emptyShelf: string
    /** The editor. */
    name: string
    /** What is wrong with the name. `{n}` is the bound. */
    nameNeeded: string
    nameTooLong: string
    model: string
    size: string
    blocks: string
    blocksHint: string
    falls: string
    fallsHint: string
    gravity: string
    bounce: string
    mass: string
    clip: string
    clipHint: string
    tags: string
    tagsHint: string
    actions: string
    actionsHint: string
    addAction: string
    /**
     * The `use` block: a thing you get into rather than walk past.
     *
     * Three clips because using something has three moments - see `UseSpec`.
     */
    use: string
    useHint: string
    enterClip: string
    loopClip: string
    leaveClip: string
    /** The empty option in a clip picker: it plays nothing. */
    noClip: string
    seats: string
    seatHint: string
    addSeat: string
    inputs: string
    inputsHint: string
    key: string
    addInput: string
    remove: string
    save: string
    saved: string
    share: string
    unshare: string
    retire: string
    mine: string
    shared: string
    /** Reporting something somebody else made. See `content_reports`. */
    report: string
    reportHint: string
    reportSend: string
    reportSent: string
    /** The words an action is built out of. */
    when: Record<string, string>
    deed: Record<string, string>
    /** Under the pack grid: who drew it, and what we may do with it. */
    credit: string
    /**
     * The catalogue's podium: one canvas over the grid.
     */
    browser: {
      nothingPicked: string
      /** `{n}` animations this model carries. */
      plays: string
      still: string
      onTheShelf: string
    }

    /**
     * Who you are, at the top of the page.
     *
     * An account has two bodies and keeps both - a peep and an XP skin - and
     * `show_xp` is the mode that decides which a world draws. The words have
     * to keep those two ideas apart, because conflating them is what put a
     * Knight in the lounge. See `readXpBody`.
     */
    you: {
      /** The arrows, which move between the two bodies rather than through a list. */
      otherBody: string
      /** Which body is on screen, said underneath it. */
      peepBody: string
      xpBody: string
      /** What the mirror is playing. `{name}` is the clip. */
      rehearsing: string
      /** Hand the body back to the chips. */
      stop: string
      changePeep: string
      /** `{n}` animals to choose from. */
      pickPeep: string
      shop: string
      saving: string
    }

    /**
     * The three doors, and what each one makes.
     */
    hub: {
      doorsLabel: string
      blueprints: string
      blueprintsNote: string
      clips: string
      clipsNote: string
      vehicles: string
      vehiclesNote: string
      emotes: string
      emotesNote: string
      models: string
      modelsNote: string
      /** The catalogue is a reference; things are picked at the bench. */
      modelsHint: string
      /** What a blueprint is called before anybody has named it. */
      untitled: string
      /** The example the vehicles door builds. See `exampleCar`. */
      exampleCarName: string
      newVehicle: string
      newBlueprint: string
      starting: string
      newClip: string
      sets: string
      setsNote: string
    }

    /**
     * Sets of things we already made, added to a shelf whole.
     *
     * The chrome only. What the sets are *called* - "The kitchen", "Bun" - lives
     * in `@/domain/thingiverse/starters` in English and stays there, because a
     * starter's name is not a label: it is written onto the space's shelf as the
     * blueprint's name, and it is the word a recipe resolves against. A German
     * space whose board asks for `Brötchen` while the crate hands out `Bun` is a
     * kitchen that cannot cook, and the fix for a space that wants its own words
     * is the one it already has - rename both, on the shelf.
     */
    sets: {
      intro: string
      /** How many things are in one. `{n}`. */
      count: string
      add: string
      adding: string
      /** What landed. `{n}`. */
      added: string
      /** And what was already there under the same name. `{n}`. */
      already: string
      /** Every one of them was already on the shelf. */
      allThere: string
      /** The tag they all carry. `{tag}`. */
      tagged: string
    }

    /**
     * The emote menu: clips in branches, reached by keys.
     */
    emotes: {
      intro: string
      empty: string
      addBranch: string
      addInside: string
      remove: string
      /** `{label}` is the row being taken out. */
      removeRow: string
      key: string
      label: string
      plays: string
      opensOnly: string
      save: string
      saving: string
      saved: string
      /** `{n}` rows in the whole menu. */
      rows: string
      /** Typing the keys to see where they land. */
      tryIt: string
      tryHint: string
      reachesNothing: string
      /** `{label}` opens, or `{label}` plays `{clip}`. */
      reachesBranch: string
      reachesClip: string
    }

    /**
     * The bench a thing is built on: `/thingiverse/blueprint/[id]`.
     *
     * Its own block rather than more keys on the one above, because it is a
     * different page in the same sense the pose editor is: that one is "what
     * could this be made of", the shelf is "what is this like", and this is
     * "what is this made *of*, and where does each piece go".
     */
    composer: {
      heading: string
      intro: string
      backToShelf: string
      /** `{n}` pieces, the root included. */
      pieces: string
      theRoot: string
      size: string
      turn: string
      /** The pad and the keys beside it. Labels for the ones drawn as a glyph. */
      move: string
      up: string
      down: string
      bigger: string
      smaller: string
      removePiece: string
      addPiece: string
      /** Changing what the selected piece is. `{where}` is what it is now. */
      swapFor: string
      searchPieces: string
      look: string
      looking: string
      /** Nothing in either catalogue matches `{q}`. */
      noPieces: string
      /** `{where}` is the piece the sockets belong to. */
      socketsOn: string
      socketsHint: string
      socketName: string
      addSocket: string
      remove: string
      /** Which socket a seat sits on, and the option for none. */
      onSocket: string
      looseSeat: string
      /** The viewport's own switches, and what it says nothing is picked. */
      showSockets: string
      showSeats: string
      showCollide: string
      nothingPicked: string
      /**
       * Blocking a thing out by hand: the panel, its boxes and the two handles.
       *
       * `collideHint` is the whole argument in one line - the measured box is
       * the model's bounds, and a model is rarely a box.
       */
      collide: string
      collideHint: string
      /**
       * The seat pickers: what a body plays there, and the two empty options.
       *
       * `noClip` is "play nothing" and `inheritClip` is "whatever the thing
       * says" - two different empties, which is why they are two words.
       */
      seatClip: string
      noClip: string
      inheritClip: string
      blocks: string
      blocksHint: string
      addBox: string
      fitBox: string
      boxMoved: string
      boxSized: string
      pickBox: string
      measuredAs: string
      /** The vehicle block: the switch, its tuning, and the wheels. */
      vehicle: string
      vehicleLabel: string
      vehicleHint: string
      topSpeed: string
      turnRate: string
      addWheel: string
      steers: string
      /** `hideDriver`: the vehicle swallows whoever is aboard. */
      hideDriver: string
      hideDriverHint: string
      /**
       * Standing the reader's own body up in the first seat.
       *
       * The runtime has no seated pose - the four clips are idle, walk, run,
       * dance - so this shows where a body *stands*, at the seat's own
       * numbers, rather than pretending to sit one down. Answers the question
       * that matters at build time: is the seat roughly where a rider's feet
       * would be.
       */
      previewDriver: string

      /**
       * The machine: what a thing can be, and what makes it something else.
       *
       * Its own group inside the composer's dict rather than thirty more flat
       * keys, because the panel is a list of cards with a list inside each card
       * and every flat name was going to start with `state`.
       */
      machine: {
        heading: string
        label: string
        hint: string
        state: string
        name: string
        starts: string
        looksLike: string
        sameAsThing: string
        plays: string
        nothing: string
        /** The play button beside the clip field, and the two things it says. */
        preview: string
        stopPreview: string
        /** The clip is typed and this model's glTF has no track by that name. */
        notOnModel: string
        hidden: string
        hiddenHint: string
        solid: string
        shouts: string
        healsUp: string
        addState: string
        changes: string
        addChange: string
        goesTo: string
        /** The words a change waits for, in the order `CHANGE_WHENS` has them. */
        when: {
          after: string
          signal: string
          use: string
          touch: string
          broken: string
          filled: string
          emptied: string
        }
        seconds: string
        showBar: string
        onlyOnce: string
        preset: string
        presetRespawn: string
      }

      /** The fight block: what it can take, and what it can dish out. */
      fight: {
        heading: string
        hint: string
        health: string
        healthLabel: string
        max: string
        showBar: string
        hurtBy: string
        hurt: { dash: string; kick: string; shot: string; bump: string }
        weapon: string
        weaponLabel: string
        damage: string
        reach: string
        every: string
        aimsAt: string
        at: { people: string; things: string; all: string }
        fires: string
        firesHint: string
        speed: string
        fromSocket: string
        middle: string
      }

      /** The craft block: places to put things, and what they make together. */
      craft: {
        heading: string
        hint: string
        label: string
        slots: string
        addSlot: string
        onSocket: string
        takes: string
        anything: string
        alreadyHolds: string
        nothingHeld: string
        shouts: string
        recipes: string
        addRecipe: string
        needs: string
        makes: string
        seconds: string
        atOnce: string
        landsOn: string
        whereItWasMade: string
        /** Prices, in the play money the café and the house already run on. */
        price: string
        free: string
        toSummon: string
        priceHint: string
      }
      saving: string
      /** `{n}` things are wrong, said beside a Save that will not go. */
      problems: string
      /**
       * Where a thing sits when somebody is holding it.
       *
       * Its own group of words rather than reusing the seat's, because the two
       * mean opposite things: a seat is where a *body* goes on the thing, and a
       * grip is where the *thing* goes on the body.
       */
      grip: string
      gripOn: string
      gripHint: string
      rightHand: string
      leftHand: string
      /** Nudges, prefixed onto an axis: "Hand X", "Tilt Y". */
      gripAt: string
      gripTurn: string
      gripScale: string
      /**
       * Where a thing goes on its own - the lift, the crusher, the platform.
       *
       * Separate words from the timeline's, because the two are different
       * promises: a timeline is a performance every client draws for itself,
       * and this is a position the whole room agrees on.
       */
      moves: string
      movesOn: string
      movesHint: string
      aLift: string
      aCrusher: string
      /** Prefixed onto an axis: "Goes X". */
      movesBy: string
      movesOut: string
      movesBack: string
      waitsThere: string
      waitsHome: string
      eases: string
    }

    /**
     * The pose editor, and the clips it fills the shelf with.
     *
     * Its own little block rather than more keys on the one above, because it
     * is a different page: that one is "what could this be made of", this one
     * is "what can it do".
     */
    clips: {
      heading: string
      intro: string
      open: string
      newClip: string
      yours: string
      shared: string
      none: string
      save: string
      /** The same button once the editor is writing to a clip that exists. */
      saveOver: string
      saved: string
      /** Said the once, when a save first turns a blank editor into a clip. */
      kept: string
      rename: string
      retire: string
      share: string
      unshare: string
      /** `{rig}` is the body it was keyed on. */
      playsOn: string
      playsOnLabel: string
      allBodies: string
      noneForBody: string
      /** Which parts of the body the clip is allowed to drive. */
      parts: string
      partsHint: string
      groups: { torso: string; arms: string; legs: string }
      /** The play button's label. `{name}` is the clip. */
      playing: string
      /** And its label once it is the thing that stops. `{name}` is the clip. */
      stopping: string
      /**
       * The camera recorder, folded away under the shelf.
       *
       * Four strings and no more, because the recorder itself is the
       * backoffice's component embedded whole - exactly as the editor above it
       * is - and its own dials stay in English. What is translated is the part
       * this page owns: whether the camera is open, and what happens to a take.
       */
      capture: string
      captureIntro: string
      captureUse: string
      captureClose: string
    }
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

    /**
     * The two balances, and moving coins between them.
     *
     * `docs/product/economy.md` §3. A *purse* is what you have in this space; a
     * *wallet* is what you have as a person, everywhere. The words have to keep
     * that distinction visible - "your coins" for both would make the card
     * unreadable, which is the whole reason it draws two numbers.
     */
    money: string
    /** The balance that belongs to this space. */
    hereLabel: string
    /** The balance that follows you between spaces. */
    walletLabel: string
    /** Take coins out of this space and into the wallet. */
    toWallet: string
    /** Bring coins from the wallet into this space. */
    toSpace: string
    howMuch: string
    move: string
    /** `{n}` coins moved. */
    moved: string
    /** Why the buttons are not there: this space is not running the economy. */
    noMoving: string
    /** The way to go and earn some: a shift in the café. */
    goEarn: string

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
    /** A toll on this room's door. `docs/product/economy.md` §11. */
    doorPrice: string
    /** Said under it, so nobody has to guess where the coins go. */
    doorPriceNote: string

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
    /** The row's overflow, which holds the copies, the moves and the delete. */
    more: string
    /** Browser `confirm`, so no markup. */
    confirmDelete: string

    /**
     * Starting a page, and copying one.
     *
     * `blankPage` only appears once there is something to choose it *against* -
     * a space with no templates keeps the plain `+`, so this string is unused
     * there rather than drawn in a menu of one.
     *
     * `templates` is keyed by template id and is the one place a template's
     * name is translated; what a template writes into the episode is a draft,
     * and a draft arrives in English because it is rewritten immediately. See
     * `src/domain/channels/templates/kind.ts`.
     *
     * `startFrom` introduces that row under the name field, and is drawn only
     * where there is a template to introduce - a lead-in over nothing is worse
     * than no lead-in.
     */
    blankPage: string
    duplicate: string
    nextEpisode: string
    templates: Record<string, string>
    startFrom: string

    /** Shown instead of `body` on a space that has written nothing yet. */
    bodyEmpty: string

    /** The editor itself. */
    titleLabel: string
    writePlaceholder: string
    archivedNote: string
    saved: string
    saving: string
    notSaved: string

    /**
     * The margin.
     *
     * `notesSettled` carries `{n}`: how many notes are folded away under it.
     * No plural form, because the string is a count and a word rather than a
     * sentence - see the fold in `comments.tsx`.
     */
    notes: string
    notesShow: string
    notesHide: string
    notesEmpty: string
    notesEmptyHint: string
    notesEmptyRead: string
    notesPlaceholder: string
    notesPost: string
    notesPosting: string
    notesResolve: string
    notesReopen: string
    notesSettled: string

    /**
     * The storyboard: this episode's scenes, in running order.
     *
     * `boardBeats` carries `{n}` - how many things are said or done in a
     * scene. No plural form, for the reason `notesSettled` gives: it is a
     * count and a word, not a sentence.
     */
    board: string
    boardShow: string
    boardHide: string
    boardEmpty: string
    boardEmptyHint: string
    boardUnheaded: string
    boardOpenScene: string
    boardBeats: string
    /** On the running total, which is an estimate and must say so somewhere. */
    boardEstimate: string

    /**
     * The four steps from an idea to a room somebody is standing in.
     *
     * Each step has a label, a line of body, and a line for when the surface
     * behind it is switched off - and the third is not optional. A step drawn
     * with no explanation is a hole in a numbered sequence; a step drawn as a
     * live link to a flag that is off is a 404.
     */
    flowHeading: string
    flowBody: string
    flowWrite: string
    flowWriteBody: string
    flowCast: string
    flowCastBody: string
    flowWorld: string
    flowWorldBody: string
    flowPlay: string
    flowPlayBody: string
    flowOffPages: string
    flowOffChannels: string
    flowOffWorlds: string
    flowOffLounge: string

    /**
     * Projects, seasons and episodes - the tree, and the strip over an episode.
     * `projectLive` and `airDrafts` carry `{n}`.
     */
    projectName: string
    projectStart: string
    projectStarting: string
    cancel: string
    projectLive: string
    addSeason: string
    addEpisode: string
    untitledEpisode: string
    seasonEmpty: string
    projectNoSeasons: string
    statusDraft: string
    statusInReview: string
    statusOnAir: string
    statusChanged: string
    statusRejected: string
    costs: string
    coins: string
    inChannels: string
    sendToAir: string
    changedNote: string
    /** Followed by the language code: "Write the version in" de. */
    writeVersion: string

    /** The channel, which is the air queue. */
    airHeading: string
    airBody: string
    airToPages: string
    airEmpty: string
    airRejected: string
    airChanged: string
    airWaiting: string
    airOnAir: string
    airWatch: string
    airEdit: string
    airDrafts: string

    /**
     * The home screen: start one, carry on with one, find one.
     * `projectEpisodes` carries `{n}`; `filterNothing` carries `{q}`.
     */
    startHeading: string
    startBody: string
    allHeading: string
    filterPlaceholder: string
    filterNothing: string
    projectEpisodes: string
    /** Offered when the month's free season is used up. `{n}` is the price. */
    buySeason: string
  }

  /** Days running, per space. */
  streaks: {
    heading: string
    /** `{space}` is the space's own name. */
    body: string
    empty: string
    /** The coins board, above the streaks. `docs/product/economy.md` §13. */
    coins: string
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
    thingiverse: 'Thingiverse',
  },

  thingiverse: {
    heading: 'Thingiverse',
    intro: 'Everything a room can be furnished with: what this space has made, and the packs it is all cut from.',
    shelfTab: 'The shelf',
    packsTab: 'The packs',
    search: 'Search every pack',
    searchGo: 'Search',
    roomPacks: 'For rooms',
    levelPacks: 'For levels',
    everyPack: 'Every pack',
    packCount: '{n} packs',
    showing: 'Showing {shown} of {total}',
    noModels: 'No model matches “{q}”. Try a plainer word — chair, tree, box.',
    searchHint: 'Type a word — bench, lamp, ball.',
    packSize: '{n} models',
    make: 'Make a blueprint',
    making: 'Making…',
    emptyShelf: 'Nothing has been cut from the packs yet. Find a model and make a blueprint of it.',
    name: 'Name',
    nameNeeded: 'A thing on the shelf needs a name.',
    nameTooLong: 'A name is at most {n} characters.',
    model: 'Model',
    size: 'Size',
    blocks: 'Blocks the way',
    blocksHint: 'Off, you walk straight through it. A coin, a rug, a banner.',
    falls: 'Falls',
    fallsHint: 'Off, it stands where it is put forever. On, gravity has an opinion.',
    gravity: 'Gravity',
    bounce: 'Bounce',
    mass: 'Mass',
    clip: 'Clip',
    clipHint: 'An animation it plays while it stands there. Leave empty for a still model.',
    tags: 'Tags',
    tagsHint: 'Words to find it by later. Comma separated.',
    actions: 'What it does',
    actionsHint: 'At most four. Every one of these happens in the room, with nobody keeping score — a thing that has to keep score is an XP.',
    addAction: 'Add',
    use: 'Can be used',
    useHint: 'A chair you sit in, a turntable you play, a kart you drive. E gets in while playing; E in creative mode picks the thing up instead.',
    enterClip: 'Getting in',
    loopClip: 'While in it',
    leaveClip: 'Getting out',
    noClip: 'Nothing',
    seats: 'Where the bodies stand',
    addSeat: 'Add a seat',
    seatHint: 'Cells from the thing itself, one row per person. They turn with the thing, so a bench turned round still seats people on the bench.',
    inputs: 'Extra animations',
    inputsHint: 'One key each, played while somebody is in it. The key is eaten while they are, so it cannot also do whatever it usually does.',
    key: 'Key',
    addInput: 'Add a key',
    remove: 'Remove',
    save: 'Save',
    saved: 'Saved',
    share: 'Share with the space',
    unshare: 'Keep to yourself',
    retire: 'Retire',
    mine: 'Yours',
    shared: 'Shared with the space',
    report: 'Report',
    reportHint: 'Say what is wrong with it. Nobody is told who reported it.',
    reportSend: 'Send report',
    reportSent: 'Reported. Thank you.',
    when: { touch: 'When somebody walks into it', near: 'When somebody stands near it', always: 'All the time' },
    deed: {
      play: 'play a clip',
      spin: 'spin',
      bob: 'bob up and down',
      vanish: 'vanish',
    },
    credit: 'Every pack we ship is CC0: use it, change it, sell what you make. The link goes to whoever drew it.',
    browser: {
      nothingPicked: 'Pick a model and it stands here, at the size a room would draw it.',
      plays: 'Plays ({n})',
      still: 'Still',
      onTheShelf: 'Already on the shelf',
    },
    you: {
      otherBody: 'Your other body',
      peepBody: 'Your peep. This is what a room draws you as.',
      xpBody: 'Your XP body. Rooms draw this one until you switch back.',
      rehearsing: 'Playing {name}',
      stop: 'Stop',
      changePeep: 'Change',
      pickPeep: 'Pick one of {n}',
      shop: 'Shop',
      saving: 'Saving…',
    },
    hub: {
      doorsLabel: 'What this space makes',
      blueprints: 'Blueprints',
      blueprintsNote: 'Things a room can be furnished with.',
      clips: 'Clips',
      clipsNote: 'Poses a body can play.',
      vehicles: 'Vehicles',
      vehiclesNote: 'Things you get in and drive.',
      emotes: 'Menu',
      emotesNote: 'Clips in branches, reached by keys.',
      models: 'Models',
      modelsNote: 'Everything we ship, to look through.',
      modelsHint: 'A reference, not a shelf — models are picked at the bench, inside the blueprint they go into.',
      untitled: 'Untitled thing',
      exampleCarName: 'Little hatchback',
      newVehicle: 'Build a car',
      newBlueprint: 'Start a blueprint',
      starting: 'Starting…',
      newClip: 'Open the pose editor',
      sets: 'Sets',
      setsNote: 'Things we already made, by theme.',
    },
    sets: {
      intro: 'Things that are already something. A set lands on your shelf as ordinary blueprints — open any of them at the bench and change what you like.',
      count: '{n} things',
      add: 'Add to my shelf',
      adding: 'Adding…',
      added: '{n} added',
      already: '{n} already there',
      allThere: 'All of them are already on your shelf',
      tagged: 'Tagged {tag}',
    },
    emotes: {
      intro: 'Put the clips into branches and give each one a key. In a world, the keys reach them — D then R plays the robot dance.',
      empty: 'No menu yet. Add a branch and put a clip in it.',
      addBranch: 'Add a branch',
      addInside: 'Add inside',
      remove: 'Remove',
      removeRow: 'Remove {label}',
      key: 'Key',
      label: 'Name',
      plays: 'Plays',
      opensOnly: 'just opens',
      save: 'Save the menu',
      saving: 'Saving…',
      saved: 'Saved',
      rows: '{n} rows',
      tryIt: 'Try it',
      tryHint: 'Type the keys and see where they land.',
      reachesNothing: 'Reaches nothing.',
      reachesBranch: 'Opens {label}.',
      reachesClip: '{label} — plays {clip}.',
    },
    composer: {
      heading: 'The bench',
      intro: 'Bolt pieces together, name the places things attach, and put the seats where the bodies go.',
      backToShelf: 'Back to the shelf',
      pieces: 'Pieces ({n})',
      theRoot: 'the thing itself',
      size: 'Size',
      turn: 'Turn',
      move: 'Drag to move it',
      up: 'Up',
      down: 'Down',
      bigger: 'Bigger',
      smaller: 'Smaller',
      removePiece: 'Take this piece off',
      addPiece: 'Add a piece',
      swapFor: 'Use a different model for {where}',
      searchPieces: 'crate, lamp, wheel',
      look: 'Look',
      looking: 'Looking…',
      noPieces: 'Nothing matches “{q}”.',
      socketsOn: 'Sockets on {where}',
      socketsHint: 'A named place something attaches to — a seat, or the grip of a held item. It turns and moves with its piece.',
      socketName: 'name it',
      addSocket: 'Add a socket',
      remove: 'Remove',
      onSocket: 'Sits on',
      looseSeat: 'nowhere in particular',
      showSockets: 'Sockets',
      showSeats: 'Seats',
      showCollide: 'Collide',
      collide: 'What you bump into',
      collideHint:
        'Left alone, a thing stops you wherever its model measures - which is a box, and a model is rarely a box. Draw the boxes yourself for an arch you should be able to walk through, or a table you should be able to walk under.',
      seatClip: 'In this seat',
      noClip: 'Nothing',
      inheritClip: 'Same as the thing',
      blocks: 'Solid',
      blocksHint: 'Off, and people walk straight through it.',
      addBox: 'Add a box',
      fitBox: 'Start from the model',
      boxMoved: 'Move',
      boxSized: 'Resize',
      pickBox: 'Box {n}',
      measuredAs: 'The model measures {w} x {h} x {d} cells.',
      nothingPicked: 'click a piece',
      vehicle: 'Vehicle',
      vehicleLabel: 'You can drive it',
      vehicleHint:
        'The first seat is the wheel. Summon it with /vehicle and its name — W and S drive, A and D steer, G gets out.',
      topSpeed: 'Top speed',
      turnRate: 'Turning',
      addWheel: 'Add a wheel',
      steers: 'Turns with the steering',
      hideDriver: 'It swallows whoever is aboard',
      hideDriverHint:
        'No body is drawn while somebody is in it — the room sees only the vehicle move. For cars with roofs, or things you drive as.',
      previewDriver: 'Preview a driver in the seat',
      machine: {
        heading: 'What it can be',
        label: 'It changes',
        hint: 'A burger that cooks, a crate that breaks, a target that comes back. Each state can wear a different model.',
        state: 'State',
        name: 'Called',
        starts: 'Starts here',
        looksLike: 'Looks like',
        sameAsThing: 'The thing itself',
        plays: 'Plays',
        nothing: 'Nothing',
        preview: 'Preview',
        stopPreview: 'Stop',
        notOnModel: 'This model has no clip by that name',
        hidden: 'Not there',
        hiddenHint: 'Still standing and still counting down — just invisible, and not solid.',
        solid: 'Solid',
        shouts: 'Shouts',
        healsUp: 'Full health again',
        addState: 'Add a state',
        changes: 'Ways out',
        addChange: 'Add a way out',
        goesTo: 'becomes',
        when: {
          after: 'after a while',
          signal: 'on a word',
          use: 'when used',
          touch: 'when touched',
          broken: 'when broken',
          filled: 'when something is put on it',
          emptied: 'when something is taken off',
        },
        seconds: 'Seconds',
        showBar: 'Draw a bar',
        onlyOnce: 'Only once',
        preset: 'Start from',
        presetRespawn: 'Breaks and comes back',
      },
      fight: {
        heading: 'Fighting',
        hint: 'Only in battle mode. In creative mode the same key picks it up instead.',
        health: 'It can be hurt',
        healthLabel: 'Health',
        max: 'Full',
        showBar: 'Draw a bar once it has been hurt',
        hurtBy: 'Hurt by',
        hurt: { dash: 'a dash', kick: 'a kick', shot: 'a shot', bump: 'being run into' },
        weapon: 'It hits back',
        weaponLabel: 'Weapon',
        damage: 'Damage',
        reach: 'Reach',
        every: 'Every',
        aimsAt: 'Aims at',
        at: { people: 'people', things: 'things', all: 'everything' },
        fires: 'It shoots',
        firesHint: 'Leave this off and it swings instead.',
        speed: 'Speed',
        fromSocket: 'Fires from',
        middle: 'the middle of it',
      },
      craft: {
        heading: 'Things on it',
        hint: 'Places to put something, and what those things make together.',
        label: 'Things can be put on it',
        slots: 'Places',
        addSlot: 'Add a place',
        onSocket: 'On socket',
        takes: 'Takes',
        anything: 'anything',
        alreadyHolds: 'Already holds',
        nothingHeld: 'nothing',
        shouts: 'Shouts',
        recipes: 'Recipes',
        addRecipe: 'Add a recipe',
        needs: 'Needs',
        makes: 'Makes',
        seconds: 'Takes',
        atOnce: 'at once',
        landsOn: 'Lands on',
        whereItWasMade: 'where it was made',
        price: 'Costs',
        free: 'free',
        toSummon: 'Costs to summon',
        priceHint:
          'Coins, the same ones the café and the house use. Spent from your own till.',
      },
      saving: 'Saving…',
      problems: '{n} to fix',
      grip: 'Held',
      gripOn: 'Somebody can hold this',
      gripHint: 'Where it sits in a hand once it is in a pocket — and, if it has a weapon, what gets swung.',
      rightHand: 'Right hand',
      leftHand: 'Left hand',
      gripAt: 'Hand',
      gripTurn: 'Tilt',
      gripScale: 'Size in hand',
      moves: 'Moves',
      movesOn: 'It goes somewhere and comes back',
      movesHint: 'A lift, a crusher, a sliding platform. Everybody in the room sees it in the same place — unlike a bob, which each screen draws for itself.',
      aLift: 'Make it a lift',
      aCrusher: 'Make it a crusher',
      movesBy: 'Goes',
      movesOut: 'Seconds out',
      movesBack: 'Seconds back',
      waitsThere: 'Waits there',
      waitsHome: 'Waits home',
      eases: 'Eases in and out',
    },
    clips: {
      heading: 'Poses',
      intro: 'Drag the dots to pose a body, key the pose on the strip, and save the clip here. A blueprint names it, and a thing plays it.',
      open: 'Poses',
      newClip: 'New clip',
      yours: 'Yours',
      shared: 'Shared with the space',
      none: 'No clips yet. Pose something and save it.',
      save: 'Save to the space',
      saveOver: 'Save over it',
      saved: 'Saved',
      kept: 'Kept. This editor writes over that clip now.',
      rename: 'Rename',
      retire: 'Retire',
      share: 'Share with the space',
      unshare: 'Keep to yourself',
      playsOn: 'Plays on the {rig}',
      playsOnLabel: 'Body',
      allBodies: 'All ({n})',
      noneForBody: 'Nothing keyed for the {body} yet.',
      parts: 'Drives',
      partsHint: 'A clip that leaves part of the body alone plays over the walk instead of stopping it — so a wave is a wave while you cross the room.',
      groups: { torso: 'Body', arms: 'Arms', legs: 'Legs' },
      playing: 'Play {name} on the body above',
      stopping: 'Stop {name}',
      capture: 'Record from a camera',
      captureIntro: 'Stand where the camera can see all of you and do the movement. What comes back lands in the editor above, to fix by hand and save like any other clip. Nothing is uploaded — the video never leaves this machine.',
      captureUse: 'Use this take',
      captureClose: 'Close the camera',
    },
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

    money: 'Money',
    hereLabel: 'Here',
    walletLabel: 'Wallet',
    toWallet: 'To wallet',
    toSpace: 'To this space',
    howMuch: 'How much',
    move: 'Move',
    moved: '{n} moved',
    noMoving: 'This space keeps its coins - they do not travel',
    goEarn: 'Go and earn',

    news: 'From kxb.team',
    hideAnnouncement: 'Hide this announcement',
    hideIt: 'Hide it — it stays under News',
    noNews: 'Nothing from kxb.team yet.',

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
    coins: 'Coins',
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
    doorPrice: 'Coins to enter',
    doorPriceNote: 'Paid once a day by everyone who walks in, into the space bank.',

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
    blankPage: 'Blank page',
    duplicate: 'Duplicate',
    nextEpisode: 'Next episode',
    templates: { news: 'News broadcast' },
    startFrom: 'or start from',
    heading: 'Pages',
    welcome: 'Welcome to {space}’s pages',
    body: 'Every project this space is making. Pick one on the left, or start one below.',
    recent: 'Recently worked on',
    untitled: 'Untitled project',
    pick: 'Pick a project on the left, or start one, to begin writing.',
    sidebar: 'Pages',
    collapse: 'Collapse sidebar',
    expand: 'Expand Sidebar',
    newTopLevel: 'Start a project',
    page: 'Project',
    empty: 'No projects here yet.',
    createFirst: 'Start your first project',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    addSubpage: 'Add a part',
    deletePage: 'Delete project',
    more: 'More',
    confirmDelete:
      'Delete this project and remove it from your space?',

    bodyEmpty:
      'Nothing started yet. A project is a series: its cast, its seasons, and the episodes inside them.',

    titleLabel: 'Project title',
    writePlaceholder: 'Write, or press / for blocks',
    archivedNote: 'This space is archived. The project can be read, not changed.',
    saved: 'Saved',
    saving: 'Saving…',
    notSaved: 'Not saved',

    notes: 'Notes',
    notesShow: 'Show notes',
    notesHide: 'Hide notes',
    notesEmpty: 'Nothing in the margin',
    notesEmptyHint:
      'Leave a note for whoever reads this next. Notes are about the project, and everybody in the space can see them.',
    notesEmptyRead: 'Nobody has left a note on this project.',
    notesPlaceholder: 'Leave a note…',
    notesPost: 'Post',
    notesPosting: 'Posting…',
    notesResolve: 'Mark settled',
    notesReopen: 'Put it back',
    notesSettled: '{n} settled',

    board: 'Board',
    boardShow: 'Show the storyboard',
    boardHide: 'Hide the storyboard',
    boardEmpty: 'No scenes yet',
    boardEmptyHint:
      'Press / and pick Scene. Every scene you write shows up here, in the order it runs.',
    boardUnheaded: 'Untitled scene',
    boardOpenScene: 'Show this scene in the page',
    boardBeats: '{n} beats',
    boardEstimate: 'An estimate from the words, not a running time.',

    flowHeading: 'From a page to a room',
    flowBody:
      'Four steps, in this order. This is where a series starts; the other three are where it gets built and walked into.',
    flowWrite: 'Start the project',
    flowWriteBody:
      'Notes, an outline, a script. A project nests, so a season can hold its episodes.',
    flowCast: 'Cast it',
    flowCastBody:
      'Who is in it, where it happens, what they carry. The bible your scenes pick their names from.',
    flowWorld: 'Build the world',
    flowWorldBody: 'Lay the place out block by block, then save it to the space.',
    flowPlay: 'Walk into it',
    flowPlayBody: 'Load the world into a room and stand in it with everybody else.',
    flowOffPages: 'Projects are off for this space.',
    flowOffChannels: 'Channels are off for this space. An admin can turn them on.',
    flowOffWorlds: 'The world catalogue is off for this space. An admin can turn it on.',
    flowOffLounge: 'The lounge is off for this space.',
    projectName: 'What is it called?',
    projectStart: 'Start it',
    projectStarting: 'Starting…',
    cancel: 'Cancel',
    projectLive: '{n} on air or on the way',
    addSeason: 'Add a season',
    addEpisode: 'Add an episode',
    untitledEpisode: 'Untitled episode',
    seasonEmpty: 'Nothing in this season yet',
    projectNoSeasons: 'No seasons yet',
    statusDraft: 'draft',
    statusInReview: 'in review',
    statusOnAir: 'on air',
    statusChanged: 'edited since it aired',
    statusRejected: 'sent back',
    costs: 'Costs',
    coins: 'coins',
    inChannels: 'In review · Channels',
    sendToAir: 'Send to air',
    changedNote: 'Readers are still seeing the last approved version. Send it to air again to update them.',
    writeVersion: 'Write the version in',
    airHeading: 'Channel',
    airBody: 'What is going out, and what is already out. Everything is made under',
    airToPages: 'Pages →',
    airEmpty: 'Nothing on the air yet. Send an episode from its page when it is ready.',
    airRejected: 'Sent back',
    airChanged: 'Edited since it aired',
    airWaiting: 'In review',
    airOnAir: 'On air',
    airWatch: 'Watch',
    airEdit: 'Edit',
    airDrafts: '{n} drafts are still being written in',
    startHeading: 'Start something',
    startBody: 'A project is a production: its cast, its seasons, and the episodes inside them. Name it and you are writing the first one.',
    allHeading: 'Everything',
    filterPlaceholder: 'Filter projects and episodes',
    filterNothing: 'Nothing matches “{q}”.',
    projectEpisodes: '{n} episodes',
    buySeason: 'Start it now · {n} coins',
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
    thingiverse: 'Thingiverse',
  },

  thingiverse: {
    heading: 'Thingiverse',
    intro: 'Alles, womit ein Raum eingerichtet werden kann: was dieser Space gebaut hat, und die Pakete, aus denen alles geschnitten ist.',
    shelfTab: 'Das Regal',
    packsTab: 'Die Pakete',
    search: 'Alle Pakete durchsuchen',
    searchGo: 'Suchen',
    roomPacks: 'Für Räume',
    levelPacks: 'Für Level',
    everyPack: 'Alle Pakete',
    packCount: '{n} Pakete',
    showing: '{shown} von {total} werden gezeigt',
    noModels: 'Kein Modell passt zu „{q}“. Versuchen Sie ein einfacheres Wort — Stuhl, Baum, Kiste.',
    searchHint: 'Ein Wort eintippen — Bank, Lampe, Ball.',
    packSize: '{n} Modelle',
    make: 'Blaupause anlegen',
    making: 'Wird angelegt …',
    emptyShelf: 'Noch nichts aus den Paketen geschnitten. Suchen Sie ein Modell und legen Sie eine Blaupause an.',
    name: 'Name',
    nameNeeded: 'Ein Ding im Regal braucht einen Namen.',
    nameTooLong: 'Ein Name hat höchstens {n} Zeichen.',
    model: 'Modell',
    size: 'Größe',
    blocks: 'Versperrt den Weg',
    blocksHint: 'Aus: Sie gehen hindurch. Eine Münze, ein Teppich, ein Banner.',
    falls: 'Fällt',
    fallsHint: 'Aus: es steht für immer, wo es abgesetzt wurde. An: die Schwerkraft hat eine Meinung.',
    gravity: 'Schwerkraft',
    bounce: 'Sprungkraft',
    mass: 'Masse',
    clip: 'Clip',
    clipHint: 'Eine Animation, die läuft, während es dasteht. Leer lassen für ein stilles Modell.',
    tags: 'Schlagworte',
    tagsHint: 'Wörter zum Wiederfinden. Mit Komma getrennt.',
    actions: 'Was es tut',
    actionsHint: 'Höchstens vier. Alles davon passiert im Raum, ohne dass jemand zählt — was zählen muss, ist ein XP.',
    addAction: 'Hinzufügen',
    use: 'Kann benutzt werden',
    useHint: 'Ein Stuhl zum Sitzen, ein Plattenspieler, ein Kart. Im Spiel steigt E ein; im Kreativmodus hebt E das Ding stattdessen auf.',
    enterClip: 'Einsteigen',
    loopClip: 'Währenddessen',
    leaveClip: 'Aussteigen',
    noClip: 'Nichts',
    seats: 'Wo die Körper stehen',
    addSeat: 'Platz hinzufügen',
    seatHint: 'Zellen vom Ding aus, eine Zeile pro Person. Dreht sich mit: eine gedrehte Bank setzt trotzdem alle auf die Bank.',
    inputs: 'Weitere Animationen',
    inputsHint: 'Je eine Taste, abgespielt, solange jemand drin ist. Die Taste wird so lange abgefangen und tut nichts anderes.',
    key: 'Taste',
    addInput: 'Taste hinzufügen',
    remove: 'Entfernen',
    save: 'Speichern',
    saved: 'Gespeichert',
    share: 'Mit dem Space teilen',
    unshare: 'Für sich behalten',
    retire: 'Aus dem Regal',
    mine: 'Ihres',
    shared: 'Mit dem Space geteilt',
    report: 'Melden',
    reportHint: 'Sagen Sie, was daran nicht in Ordnung ist. Niemand erfährt, wer gemeldet hat.',
    reportSend: 'Meldung senden',
    reportSent: 'Gemeldet. Danke.',
    when: { touch: 'Wenn jemand hineinläuft', near: 'Wenn jemand danebensteht', always: 'Die ganze Zeit' },
    deed: {
      play: 'einen Clip spielen',
      spin: 'sich drehen',
      bob: 'auf und ab wippen',
      vanish: 'verschwinden',
    },
    credit: 'Jedes Paket, das wir ausliefern, ist CC0: benutzen, verändern, verkaufen. Der Link führt zu denen, die es gezeichnet haben.',
    browser: {
      nothingPicked: 'Wählen Sie ein Modell — es steht hier, in der Größe, in der ein Raum es zeichnet.',
      plays: 'Spielt ({n})',
      still: 'Still',
      onTheShelf: 'Schon im Regal',
    },
    you: {
      otherBody: 'Ihr anderer Körper',
      peepBody: 'Ihr Peep. So zeichnet ein Raum Sie.',
      xpBody: 'Ihr XP-Körper. Räume zeichnen diesen, bis Sie zurückschalten.',
      rehearsing: '{name} läuft',
      stop: 'Anhalten',
      changePeep: 'Ändern',
      pickPeep: 'Eines von {n} wählen',
      shop: 'Laden',
      saving: 'Wird gespeichert …',
    },
    hub: {
      doorsLabel: 'Was dieser Space macht',
      blueprints: 'Blaupausen',
      blueprintsNote: 'Dinge, mit denen ein Raum eingerichtet wird.',
      clips: 'Clips',
      clipsNote: 'Posen, die ein Körper abspielen kann.',
      vehicles: 'Fahrzeuge',
      vehiclesNote: 'Dinge, in die man steigt und fährt.',
      emotes: 'Menü',
      emotesNote: 'Clips in Ästen, über Tasten erreichbar.',
      models: 'Modelle',
      modelsNote: 'Alles, was wir mitliefern, zum Durchsehen.',
      modelsHint: 'Eine Übersicht, kein Regal — Modelle werden an der Werkbank gewählt, in der Blaupause, in die sie gehören.',
      untitled: 'Unbenanntes Ding',
      exampleCarName: 'Kleiner Flitzer',
      newVehicle: 'Auto bauen',
      newBlueprint: 'Blaupause beginnen',
      starting: 'Wird begonnen …',
      newClip: 'Pose-Editor öffnen',
      sets: 'Sets',
      setsNote: 'Fertige Dinge, nach Thema.',
    },
    sets: {
      intro: 'Dinge, die schon etwas sind. Ein Set landet als gewöhnliche Blaupausen in Ihrem Regal — öffnen Sie jede davon an der Werkbank und ändern Sie, was Sie möchten.',
      count: '{n} Dinge',
      add: 'Ins Regal legen',
      adding: 'Wird hinzugefügt …',
      added: '{n} hinzugefügt',
      already: '{n} schon vorhanden',
      allThere: 'Alle liegen schon in Ihrem Regal',
      tagged: 'Getaggt mit {tag}',
    },
    emotes: {
      intro: 'Ordnen Sie die Clips in Äste und geben Sie jedem eine Taste. In einer Welt erreichen die Tasten sie — D, dann R spielt den Robotertanz.',
      empty: 'Noch kein Menü. Legen Sie einen Ast an und einen Clip hinein.',
      addBranch: 'Ast hinzufügen',
      addInside: 'Darin hinzufügen',
      remove: 'Entfernen',
      removeRow: '{label} entfernen',
      key: 'Taste',
      label: 'Name',
      plays: 'Spielt',
      opensOnly: 'öffnet nur',
      save: 'Menü speichern',
      saving: 'Wird gespeichert …',
      saved: 'Gespeichert',
      rows: '{n} Zeilen',
      tryIt: 'Ausprobieren',
      tryHint: 'Tasten tippen und sehen, wo sie landen.',
      reachesNothing: 'Erreicht nichts.',
      reachesBranch: 'Öffnet {label}.',
      reachesClip: '{label} — spielt {clip}.',
    },
    composer: {
      heading: 'Die Werkbank',
      intro: 'Teile zusammensetzen, Andockpunkte benennen und die Sitze dorthin legen, wo die Körper stehen.',
      backToShelf: 'Zurück zum Regal',
      pieces: 'Teile ({n})',
      theRoot: 'das Ding selbst',
      size: 'Größe',
      turn: 'Drehung',
      move: 'Ziehen zum Bewegen',
      up: 'Hoch',
      down: 'Runter',
      bigger: 'Größer',
      smaller: 'Kleiner',
      removePiece: 'Teil abnehmen',
      addPiece: 'Teil hinzufügen',
      swapFor: 'Anderes Modell für {where}',
      searchPieces: 'Kiste, Lampe, Rad',
      look: 'Suchen',
      looking: 'Wird gesucht …',
      noPieces: 'Nichts passt zu „{q}“.',
      socketsOn: 'Andockpunkte an {where}',
      socketsHint: 'Ein benannter Punkt, an dem etwas ansetzt — ein Sitz oder der Griff eines gehaltenen Dings. Er dreht und bewegt sich mit seinem Teil.',
      socketName: 'benennen',
      addSocket: 'Andockpunkt hinzufügen',
      remove: 'Entfernen',
      onSocket: 'Sitzt auf',
      looseSeat: 'nirgends besonders',
      showSockets: 'Andockpunkte',
      showSeats: 'Sitze',
      showCollide: 'Kollision',
      collide: 'Woran du hängen bleibst',
      collideHint:
        'Ohne Zutun stoppt dich ein Ding dort, wo sein Modell misst - und das ist ein Quader, ein Modell aber selten. Zeichne die Quader selbst: für einen Torbogen, durch den man gehen soll, oder einen Tisch, unter den man passt.',
      seatClip: 'Auf diesem Platz',
      noClip: 'Nichts',
      inheritClip: 'Wie das Ding',
      blocks: 'Fest',
      blocksHint: 'Aus, und man läuft einfach hindurch.',
      addBox: 'Quader hinzufügen',
      fitBox: 'Vom Modell übernehmen',
      boxMoved: 'Verschieben',
      boxSized: 'Größe',
      pickBox: 'Quader {n}',
      measuredAs: 'Das Modell misst {w} x {h} x {d} Zellen.',
      nothingPicked: 'Teil anklicken',
      vehicle: 'Fahrzeug',
      vehicleLabel: 'Du kannst es fahren',
      vehicleHint:
        'Der erste Sitz ist das Lenkrad. Ruf es mit /vehicle und seinem Namen — W und S fahren, A und D lenken, G steigt aus.',
      topSpeed: 'Höchsttempo',
      turnRate: 'Lenkung',
      addWheel: 'Rad hinzufügen',
      steers: 'Dreht mit der Lenkung',
      hideDriver: 'Es verschluckt, wer an Bord ist',
      hideDriverHint:
        'Solange jemand drin sitzt, wird kein Körper gezeichnet — der Raum sieht nur das Fahrzeug fahren. Für Autos mit Dach, oder Dinge, als die man fährt.',
      previewDriver: 'Fahrer auf dem Sitz zeigen',
      machine: {
        heading: 'Was es sein kann',
        label: 'Es verändert sich',
        hint: 'Ein Burger, der brät, eine Kiste, die zerbricht, eine Zielscheibe, die wiederkommt. Jeder Zustand kann ein anderes Modell tragen.',
        state: 'Zustand',
        name: 'Heißt',
        starts: 'Fängt hier an',
        looksLike: 'Sieht aus wie',
        sameAsThing: 'Das Ding selbst',
        plays: 'Spielt',
        nothing: 'Nichts',
        preview: 'Vorschau',
        stopPreview: 'Stopp',
        notOnModel: 'Dieses Modell hat keinen Clip mit diesem Namen',
        hidden: 'Nicht da',
        hiddenHint: 'Steht weiter da und zählt weiter — nur unsichtbar und nicht fest.',
        solid: 'Fest',
        shouts: 'Ruft',
        healsUp: 'Wieder volle Gesundheit',
        addState: 'Zustand hinzufügen',
        changes: 'Wege hinaus',
        addChange: 'Weg hinaus hinzufügen',
        goesTo: 'wird zu',
        when: {
          after: 'nach einer Weile',
          signal: 'auf ein Wort',
          use: 'beim Benutzen',
          touch: 'bei Berührung',
          broken: 'wenn kaputt',
          filled: 'wenn etwas daraufgelegt wird',
          emptied: 'wenn etwas heruntergenommen wird',
        },
        seconds: 'Sekunden',
        showBar: 'Balken zeigen',
        onlyOnce: 'Nur einmal',
        preset: 'Anfangen mit',
        presetRespawn: 'Zerbricht und kommt wieder',
      },
      fight: {
        heading: 'Kämpfen',
        hint: 'Nur im Kampfmodus. Im Kreativmodus hebt dieselbe Taste es stattdessen auf.',
        health: 'Es kann verletzt werden',
        healthLabel: 'Gesundheit',
        max: 'Voll',
        showBar: 'Balken zeigen, sobald es verletzt ist',
        hurtBy: 'Verletzt durch',
        hurt: { dash: 'einen Sprint', kick: 'einen Tritt', shot: 'einen Schuss', bump: 'Anrennen' },
        weapon: 'Es schlägt zurück',
        weaponLabel: 'Waffe',
        damage: 'Schaden',
        reach: 'Reichweite',
        every: 'Alle',
        aimsAt: 'Zielt auf',
        at: { people: 'Leute', things: 'Dinge', all: 'alles' },
        fires: 'Es schießt',
        firesHint: 'Aus lassen, dann schlägt es stattdessen zu.',
        speed: 'Geschwindigkeit',
        fromSocket: 'Schießt aus',
        middle: 'der Mitte',
      },
      craft: {
        heading: 'Dinge darauf',
        hint: 'Plätze, um etwas abzulegen, und was diese Dinge zusammen ergeben.',
        label: 'Man kann Dinge darauflegen',
        slots: 'Plätze',
        addSlot: 'Platz hinzufügen',
        onSocket: 'Auf Anschluss',
        takes: 'Nimmt',
        anything: 'alles',
        alreadyHolds: 'Hält bereits',
        nothingHeld: 'nichts',
        shouts: 'Ruft',
        recipes: 'Rezepte',
        addRecipe: 'Rezept hinzufügen',
        needs: 'Braucht',
        makes: 'Macht',
        seconds: 'Dauert',
        atOnce: 'sofort',
        landsOn: 'Landet auf',
        whereItWasMade: 'wo es gemacht wurde',
        price: 'Kostet',
        free: 'gratis',
        toSummon: 'Kostet beim Herbeirufen',
        priceHint:
          'Münzen, dieselben wie im Café und im Haus. Von Ihrer eigenen Kasse.',
      },
      saving: 'Wird gespeichert …',
      problems: '{n} zu beheben',
      grip: 'In der Hand',
      gripOn: 'Man kann es tragen',
      gripHint: 'Wie es in der Hand liegt, sobald es in der Tasche ist — und, wenn es eine Waffe hat, was geschwungen wird.',
      rightHand: 'Rechte Hand',
      leftHand: 'Linke Hand',
      gripAt: 'Hand',
      gripTurn: 'Neigung',
      gripScale: 'Größe in der Hand',
      moves: 'Bewegt sich',
      movesOn: 'Es fährt hin und kommt zurück',
      movesHint: 'Ein Aufzug, eine Presse, eine fahrende Plattform. Alle im Raum sehen es an derselben Stelle — anders als beim Wippen, das jeder Bildschirm selbst zeichnet.',
      aLift: 'Als Aufzug',
      aCrusher: 'Als Presse',
      movesBy: 'Fährt',
      movesOut: 'Sekunden hin',
      movesBack: 'Sekunden zurück',
      waitsThere: 'Wartet dort',
      waitsHome: 'Wartet daheim',
      eases: 'Sanft anfahren und anhalten',
    },
    clips: {
      heading: 'Posen',
      intro: 'Ziehen Sie die Punkte, um einen Körper zu posieren, setzen Sie die Pose auf die Leiste und speichern Sie den Clip hier. Eine Blaupause nennt ihn, ein Ding spielt ihn.',
      open: 'Posen',
      newClip: 'Neuer Clip',
      yours: 'Ihre',
      shared: 'Mit dem Space geteilt',
      none: 'Noch keine Clips. Posieren Sie etwas und speichern Sie es.',
      save: 'Im Space speichern',
      saveOver: 'Überschreiben',
      saved: 'Gespeichert',
      kept: 'Gemerkt. Dieser Editor überschreibt jetzt diesen Clip.',
      rename: 'Umbenennen',
      retire: 'Aus dem Regal',
      share: 'Mit dem Space teilen',
      unshare: 'Für sich behalten',
      playsOn: 'Läuft auf: {rig}',
      playsOnLabel: 'Körper',
      allBodies: 'Alle ({n})',
      noneForBody: 'Noch nichts für {body} angelegt.',
      parts: 'Bewegt',
      partsHint: 'Ein Clip, der einen Teil des Körpers auslässt, läuft über dem Gehen statt es zu stoppen — winken bleibt winken, auch unterwegs.',
      groups: { torso: 'Körper', arms: 'Arme', legs: 'Beine' },
      playing: '{name} am Körper oben abspielen',
      stopping: '{name} anhalten',
      capture: 'Mit der Kamera aufnehmen',
      captureIntro: 'Stellen Sie sich so hin, dass die Kamera Sie ganz sieht, und machen Sie die Bewegung. Was zurückkommt, landet im Editor oben — dort können Sie es von Hand nachbessern und wie jeden anderen Clip speichern. Es wird nichts hochgeladen: Das Video verlässt diesen Rechner nicht.',
      captureUse: 'Aufnahme übernehmen',
      captureClose: 'Kamera schließen',
    },
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

    money: 'Geld',
    hereLabel: 'Hier',
    walletLabel: 'Geldbeutel',
    toWallet: 'In den Geldbeutel',
    toSpace: 'In diesen Raum',
    howMuch: 'Wie viel',
    move: 'Verschieben',
    moved: '{n} verschoben',
    noMoving: 'Dieser Raum behält seine Münzen - sie reisen nicht mit',
    goEarn: 'Geld verdienen',

    news: 'Von kxb.team',
    hideAnnouncement: 'Diese Ankündigung ausblenden',
    hideIt: 'Ausblenden — sie bleibt unter Neuigkeiten',
    noNews: 'Noch nichts von kxb.team.',

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
    coins: 'Münzen',
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
    doorPrice: 'Münzen zum Eintreten',
    doorPriceNote: 'Einmal am Tag von allen bezahlt, die hereinkommen - in die Raumkasse.',

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
    blankPage: 'Leere Seite',
    duplicate: 'Duplizieren',
    nextEpisode: 'Nächste Folge',
    templates: { news: 'Nachrichtensendung' },
    startFrom: 'oder anfangen mit',
    heading: 'Seiten',
    welcome: 'Willkommen bei den Seiten von {space}',
    body: 'Alle Projekte dieses Space. Links eines wählen — oder unten eines anlegen.',
    recent: 'Zuletzt bearbeitet',
    untitled: 'Unbenanntes Projekt',
    pick: 'Wählen Sie links ein Projekt oder legen Sie eines an, um zu schreiben.',
    sidebar: 'Seiten',
    collapse: 'Leiste einklappen',
    expand: 'Leiste ausklappen',
    newTopLevel: 'Projekt anlegen',
    page: 'Projekt',
    empty: 'Noch keine Projekte hier.',
    createFirst: 'Legen Sie Ihr erstes Projekt an',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    addSubpage: 'Teil hinzufügen',
    deletePage: 'Projekt löschen',
    more: 'Mehr',
    confirmDelete:
      'Dieses Projekt löschen und aus Ihrem Space entfernen?',

    bodyEmpty:
      'Noch nichts angefangen. Ein Projekt ist eine Serie: ihre Besetzung, ihre Staffeln und die Folgen darin.',

    titleLabel: 'Projekttitel',
    writePlaceholder: 'Schreiben, oder / für Blöcke',
    archivedNote:
      'Dieser Space ist archiviert. Das Projekt lässt sich lesen, nicht ändern.',
    saved: 'Gespeichert',
    saving: 'Speichert…',
    notSaved: 'Nicht gespeichert',

    notes: 'Notizen',
    notesShow: 'Notizen zeigen',
    notesHide: 'Notizen ausblenden',
    notesEmpty: 'Nichts am Rand',
    notesEmptyHint:
      'Hinterlassen Sie eine Notiz für die nächste Person. Notizen gehören zum Projekt und sind für alle im Space sichtbar.',
    notesEmptyRead: 'Niemand hat eine Notiz an diesem Projekt hinterlassen.',
    notesPlaceholder: 'Notiz hinterlassen…',
    notesPost: 'Senden',
    notesPosting: 'Sendet…',
    notesResolve: 'Als erledigt markieren',
    notesReopen: 'Zurückholen',
    notesSettled: '{n} erledigt',

    board: 'Board',
    boardShow: 'Storyboard zeigen',
    boardHide: 'Storyboard ausblenden',
    boardEmpty: 'Noch keine Szenen',
    boardEmptyHint:
      '/ drücken und Szene wählen. Jede Szene erscheint hier, in der Reihenfolge, in der sie läuft.',
    boardUnheaded: 'Szene ohne Titel',
    boardOpenScene: 'Diese Szene auf der Seite zeigen',
    boardBeats: '{n} Beats',
    boardEstimate: 'Aus den Wörtern geschätzt, keine Laufzeit.',

    flowHeading: 'Von einer Seite in einen Raum',
    flowBody:
      'Vier Schritte, in dieser Reihenfolge. Hier fängt eine Serie an; die anderen drei bauen sie und stellen euch hinein.',
    flowWrite: 'Projekt anlegen',
    flowWriteBody:
      'Notizen, Gliederung, Drehbuch. Ein Projekt verschachtelt sich, eine Staffel hält ihre Folgen.',
    flowCast: 'Besetzen',
    flowCastBody:
      'Wer mitspielt, wo es passiert, was sie tragen. Die Bibel, aus der die Szenen ihre Namen ziehen.',
    flowWorld: 'Welt bauen',
    flowWorldBody: 'Den Ort Block für Block auslegen und im Space speichern.',
    flowPlay: 'Hineingehen',
    flowPlayBody: 'Die Welt in einen Raum laden und mit allen darin stehen.',
    flowOffPages: 'Projekte sind für diesen Space aus.',
    flowOffChannels:
      'Kanäle sind für diesen Space aus. Ein Admin kann sie einschalten.',
    flowOffWorlds:
      'Der Weltkatalog ist für diesen Space aus. Ein Admin kann ihn einschalten.',
    flowOffLounge: 'Die Lounge ist für diesen Space aus.',
    projectName: 'Wie heißt es?',
    projectStart: 'Anlegen',
    projectStarting: 'Legt an…',
    cancel: 'Abbrechen',
    projectLive: '{n} auf Sendung oder unterwegs',
    addSeason: 'Staffel hinzufügen',
    addEpisode: 'Folge hinzufügen',
    untitledEpisode: 'Folge ohne Titel',
    seasonEmpty: 'Noch nichts in dieser Staffel',
    projectNoSeasons: 'Noch keine Staffeln',
    statusDraft: 'Entwurf',
    statusInReview: 'in Prüfung',
    statusOnAir: 'auf Sendung',
    statusChanged: 'seit Ausstrahlung geändert',
    statusRejected: 'zurückgeschickt',
    costs: 'Kostet',
    coins: 'Coins',
    inChannels: 'In Prüfung · Kanal',
    sendToAir: 'Auf Sendung schicken',
    changedNote: 'Leser sehen noch die zuletzt freigegebene Fassung. Erneut auf Sendung schicken, um sie zu aktualisieren.',
    writeVersion: 'Fassung schreiben in',
    airHeading: 'Kanal',
    airBody: 'Was rausgeht, und was schon draußen ist. Gemacht wird alles unter',
    airToPages: 'Seiten →',
    airEmpty: 'Noch nichts auf Sendung. Schicken Sie eine Folge von ihrer Seite aus, wenn sie fertig ist.',
    airRejected: 'Zurückgeschickt',
    airChanged: 'Seit Ausstrahlung geändert',
    airWaiting: 'In Prüfung',
    airOnAir: 'Auf Sendung',
    airWatch: 'Ansehen',
    airEdit: 'Bearbeiten',
    airDrafts: '{n} Entwürfe werden noch geschrieben unter',
    startHeading: 'Etwas anfangen',
    startBody: 'Ein Projekt ist eine Produktion: die Besetzung, die Staffeln und die Folgen darin. Benennen Sie es, und Sie schreiben schon die erste.',
    allHeading: 'Alles',
    filterPlaceholder: 'Projekte und Folgen filtern',
    filterNothing: 'Nichts passt zu „{q}“.',
    projectEpisodes: '{n} Folgen',
    buySeason: 'Jetzt anlegen · {n} Coins',
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
    thingiverse: 'Thingiverse',
  },

  thingiverse: {
    heading: 'Thingiverse',
    intro: 'Всичко, с което може да се обзаведе стая: каквото този спейс е направил, и пакетите, от които е изрязано.',
    shelfTab: 'Рафтът',
    packsTab: 'Пакетите',
    search: 'Търсене във всички пакети',
    searchGo: 'Търси',
    roomPacks: 'За стаи',
    levelPacks: 'За нива',
    everyPack: 'Всички пакети',
    packCount: '{n} пакета',
    showing: 'Показани {shown} от {total}',
    noModels: 'Няма модел, който да съвпада с „{q}“. Опитайте по-проста дума — стол, дърво, кутия.',
    searchHint: 'Напишете дума — пейка, лампа, топка.',
    packSize: '{n} модела',
    make: 'Направи блупринт',
    making: 'Създава се…',
    emptyShelf: 'Още нищо не е изрязано от пакетите. Намерете модел и направете блупринт.',
    name: 'Име',
    nameNeeded: 'Нещо на рафта се нуждае от име.',
    nameTooLong: 'Името е най-много {n} знака.',
    model: 'Модел',
    size: 'Размер',
    blocks: 'Препречва пътя',
    blocksHint: 'Изключено: минавате през него. Монета, килим, банер.',
    falls: 'Пада',
    fallsHint: 'Изключено: стои завинаги там, където е сложено. Включено: гравитацията има мнение.',
    gravity: 'Гравитация',
    bounce: 'Отскок',
    mass: 'Маса',
    clip: 'Клип',
    clipHint: 'Анимация, докато стои там. Оставете празно за неподвижен модел.',
    tags: 'Етикети',
    tagsHint: 'Думи, по които да го намерите. Разделени със запетая.',
    actions: 'Какво прави',
    actionsHint: 'Най-много четири. Всичко това се случва в стаята, без някой да брои — нещо, което брои, е XP.',
    addAction: 'Добави',
    use: 'Може да се използва',
    useHint: 'Стол, на който сядате, грамофон, количка. В игра E влиза; в творчески режим E вдига нещото.',
    enterClip: 'Влизане',
    loopClip: 'Докато си вътре',
    leaveClip: 'Излизане',
    noClip: 'Нищо',
    seats: 'Къде застават телата',
    addSeat: 'Добави място',
    seatHint: 'Клетки спрямо самото нещо, по един ред на човек. Въртят се с него, така че обърната пейка пак слага хората на пейката.',
    inputs: 'Още анимации',
    inputsHint: 'По един клавиш всяка, докато някой е вътре. Клавишът се прихваща и не прави нищо друго.',
    key: 'Клавиш',
    addInput: 'Добави клавиш',
    remove: 'Премахни',
    save: 'Запази',
    saved: 'Запазено',
    share: 'Сподели със спейса',
    unshare: 'Запази за себе си',
    retire: 'Свали от рафта',
    mine: 'Ваше',
    shared: 'Споделено със спейса',
    report: 'Докладвай',
    reportHint: 'Кажете какво не е наред. Никой не научава кой е докладвал.',
    reportSend: 'Изпрати доклад',
    reportSent: 'Докладвано. Благодарим.',
    when: { touch: 'Когато някой се блъсне в него', near: 'Когато някой стои наблизо', always: 'През цялото време' },
    deed: {
      play: 'пуска клип',
      spin: 'се върти',
      bob: 'подскача',
      vanish: 'изчезва',
    },
    credit: 'Всеки пакет, който доставяме, е CC0: използвайте, променяйте, продавайте. Връзката води към авторите.',
    browser: {
      nothingPicked: 'Изберете модел — застава тук, в размера, в който стая би го нарисувала.',
      plays: 'Играе ({n})',
      still: 'Неподвижно',
      onTheShelf: 'Вече на рафта',
    },
    you: {
      otherBody: 'Другото ви тяло',
      peepBody: 'Вашият пийп. Така ви рисува стаята.',
      xpBody: 'Вашето XP тяло. Стаите рисуват него, докато не превключите обратно.',
      rehearsing: 'Възпроизвежда {name}',
      stop: 'Спри',
      changePeep: 'Смени',
      pickPeep: 'Изберете едно от {n}',
      shop: 'Магазин',
      saving: 'Запазва се…',
    },
    hub: {
      doorsLabel: 'Какво прави този спейс',
      blueprints: 'Чертежи',
      blueprintsNote: 'Неща, с които се обзавежда стая.',
      clips: 'Клипове',
      clipsNote: 'Пози, които тялото може да изиграе.',
      vehicles: 'Превозни средства',
      vehiclesNote: 'Неща, в които се качвате и карате.',
      emotes: 'Меню',
      emotesNote: 'Клипове в клони, достъпни с клавиши.',
      models: 'Модели',
      modelsNote: 'Всичко, което доставяме, за разглеждане.',
      modelsHint: 'Справочник, не рафт — моделите се избират на работната маса, в чертежа, за който са.',
      untitled: 'Ненаименувано нещо',
      exampleCarName: 'Малко хече',
      newVehicle: 'Направи кола',
      newBlueprint: 'Започни чертеж',
      starting: 'Започва се…',
      newClip: 'Отвори редактора на пози',
      sets: 'Комплекти',
      setsNote: 'Готови неща, по теми.',
    },
    sets: {
      intro: 'Неща, които вече са нещо. Комплектът влиза в рафта ви като обикновени чертежи — отворете който и да е на работната маса и променете каквото искате.',
      count: '{n} неща',
      add: 'Сложи в рафта ми',
      adding: 'Добавя се…',
      added: '{n} добавени',
      already: '{n} вече ги има',
      allThere: 'Всички вече са в рафта ви',
      tagged: 'С етикет {tag}',
    },
    emotes: {
      intro: 'Подредете клиповете в клони и дайте на всеки клавиш. В света клавишите ги достигат — D, после R пуска робота.',
      empty: 'Още няма меню. Добавете клон и сложете клип в него.',
      addBranch: 'Добави клон',
      addInside: 'Добави вътре',
      remove: 'Премахни',
      removeRow: 'Премахни {label}',
      key: 'Клавиш',
      label: 'Име',
      plays: 'Играе',
      opensOnly: 'само отваря',
      save: 'Запази менюто',
      saving: 'Запазва се…',
      saved: 'Запазено',
      rows: '{n} реда',
      tryIt: 'Пробвайте',
      tryHint: 'Напишете клавишите и вижте къде водят.',
      reachesNothing: 'Не води до нищо.',
      reachesBranch: 'Отваря {label}.',
      reachesClip: '{label} — играе {clip}.',
    },
    composer: {
      heading: 'Работната маса',
      intro: 'Сглобете части, наименувайте местата за закачане и сложете седалките там, където стоят телата.',
      backToShelf: 'Обратно към рафта',
      pieces: 'Части ({n})',
      theRoot: 'самото нещо',
      size: 'Размер',
      turn: 'Завъртане',
      move: 'Плъзнете, за да местите',
      up: 'Нагоре',
      down: 'Надолу',
      bigger: 'По-голямо',
      smaller: 'По-малко',
      removePiece: 'Махни тази част',
      addPiece: 'Добави част',
      swapFor: 'Друг модел за {where}',
      searchPieces: 'щайга, лампа, колело',
      look: 'Търси',
      looking: 'Търси се…',
      noPieces: 'Нищо не съвпада с „{q}“.',
      socketsOn: 'Гнезда на {where}',
      socketsHint: 'Наименувано място, където нещо се закача — седалка или дръжката на държан предмет. Върти се и се мести заедно със своята част.',
      socketName: 'име',
      addSocket: 'Добави гнездо',
      remove: 'Премахни',
      onSocket: 'Стои на',
      looseSeat: 'никъде конкретно',
      showSockets: 'Гнезда',
      showSeats: 'Седалки',
      showCollide: 'Сблъсък',
      collide: 'В какво се удряш',
      collideHint:
        'Само по себе си нещото те спира там, където моделът му се измерва - а това е кутия, докато моделът рядко е кутия. Начертай кутиите сам: за арка, през която трябва да се минава, или маса, под която трябва да се провираш.',
      seatClip: 'На това място',
      noClip: 'Нищо',
      inheritClip: 'Като нещото',
      blocks: 'Плътно',
      blocksHint: 'Изключено - и хората минават право през него.',
      addBox: 'Добави кутия',
      fitBox: 'Вземи от модела',
      boxMoved: 'Местене',
      boxSized: 'Размер',
      pickBox: 'Кутия {n}',
      measuredAs: 'Моделът е {w} x {h} x {d} клетки.',
      nothingPicked: 'щракнете върху част',
      vehicle: 'Превозно средство',
      vehicleLabel: 'Можеш да го караш',
      vehicleHint:
        'Първата седалка е воланът. Извикай го с /vehicle и името му — W и S карат, A и D завиват, G слиза.',
      topSpeed: 'Максимална скорост',
      turnRate: 'Завиване',
      addWheel: 'Добави колело',
      steers: 'Върти се с волана',
      hideDriver: 'Поглъща този, който е вътре',
      hideDriverHint:
        'Докато някой е вътре, тяло не се рисува — стаята вижда само превозното средство. За коли с покрив или неща, като които караш.',
      previewDriver: 'Покажи шофьор на седалката',
      machine: {
        heading: 'Какво може да бъде',
        label: 'То се променя',
        hint: 'Бургер, който се пече, щайга, която се чупи, мишена, която се връща. Всяко състояние може да носи различен модел.',
        state: 'Състояние',
        name: 'Казва се',
        starts: 'Започва тук',
        looksLike: 'Изглежда като',
        sameAsThing: 'Самото нещо',
        plays: 'Пуска',
        nothing: 'Нищо',
        preview: 'Преглед',
        stopPreview: 'Спри',
        notOnModel: 'Този модел няма клип с това име',
        hidden: 'Няма го',
        hiddenHint: 'Още стои и още брои — само че невидимо и не е плътно.',
        solid: 'Плътно',
        shouts: 'Вика',
        healsUp: 'Отново пълно здраве',
        addState: 'Добави състояние',
        changes: 'Изходи',
        addChange: 'Добави изход',
        goesTo: 'става',
        when: {
          after: 'след време',
          signal: 'при дума',
          use: 'при използване',
          touch: 'при допир',
          broken: 'когато се счупи',
          filled: 'когато сложат нещо върху него',
          emptied: 'когато вземат нещо от него',
        },
        seconds: 'Секунди',
        showBar: 'Показвай лента',
        onlyOnce: 'Само веднъж',
        preset: 'Започни от',
        presetRespawn: 'Чупи се и се връща',
      },
      fight: {
        heading: 'Битка',
        hint: 'Само в режим на битка. В творчески режим същият клавиш го вдига вместо това.',
        health: 'Може да бъде наранено',
        healthLabel: 'Здраве',
        max: 'Пълно',
        showBar: 'Показвай лента, щом бъде наранено',
        hurtBy: 'Наранява се от',
        hurt: { dash: 'засилване', kick: 'ритник', shot: 'изстрел', bump: 'блъскане' },
        weapon: 'То отвръща',
        weaponLabel: 'Оръжие',
        damage: 'Щета',
        reach: 'Обхват',
        every: 'На всеки',
        aimsAt: 'Цели се в',
        at: { people: 'хора', things: 'неща', all: 'всичко' },
        fires: 'То стреля',
        firesHint: 'Остави изключено и то ще удря вместо това.',
        speed: 'Скорост',
        fromSocket: 'Стреля от',
        middle: 'средата му',
      },
      craft: {
        heading: 'Неща върху него',
        hint: 'Места, където да оставиш нещо, и какво правят тези неща заедно.',
        label: 'Върху него може да се слагат неща',
        slots: 'Места',
        addSlot: 'Добави място',
        onSocket: 'На гнездо',
        takes: 'Приема',
        anything: 'всичко',
        alreadyHolds: 'Вече държи',
        nothingHeld: 'нищо',
        shouts: 'Вика',
        recipes: 'Рецепти',
        addRecipe: 'Добави рецепта',
        needs: 'Нужни са',
        makes: 'Прави',
        seconds: 'Отнема',
        atOnce: 'веднага',
        landsOn: 'Каца върху',
        whereItWasMade: 'където е направено',
        price: 'Струва',
        free: 'безплатно',
        toSummon: 'Струва при призоваване',
        priceHint:
          'Монети, същите като в кафето и къщата. От вашата каса.',
      },
      saving: 'Запазва се…',
      problems: '{n} за поправка',
      grip: 'В ръката',
      gripOn: 'Може да се държи',
      gripHint: 'Как стои в ръката, щом е в джоба — и ако има оръжие, какво се замахва.',
      rightHand: 'Дясна ръка',
      leftHand: 'Лява ръка',
      gripAt: 'Ръка',
      gripTurn: 'Наклон',
      gripScale: 'Размер в ръката',
      moves: 'Движи се',
      movesOn: 'Отива някъде и се връща',
      movesHint: 'Асансьор, преса, движеща се платформа. Всички в стаята го виждат на едно и също място — за разлика от подскачането, което всеки екран рисува сам.',
      aLift: 'Като асансьор',
      aCrusher: 'Като преса',
      movesBy: 'Отива',
      movesOut: 'Секунди натам',
      movesBack: 'Секунди обратно',
      waitsThere: 'Чака там',
      waitsHome: 'Чака у дома',
      eases: 'Плавно тръгва и спира',
    },
    clips: {
      heading: 'Пози',
      intro: 'Влачете точките, за да позирате тяло, сложете позата на лентата и запазете клипа тук. Блупринт го назовава, а нещо го пуска.',
      open: 'Пози',
      newClip: 'Нов клип',
      yours: 'Ваши',
      shared: 'Споделени със спейса',
      none: 'Още няма клипове. Позирайте нещо и го запазете.',
      save: 'Запази в спейса',
      saveOver: 'Презапиши',
      saved: 'Запазено',
      kept: 'Запазен. Оттук нататък редакторът презаписва този клип.',
      rename: 'Преименувай',
      retire: 'Свали от рафта',
      share: 'Сподели със спейса',
      unshare: 'Запази за себе си',
      playsOn: 'Върви на: {rig}',
      playsOnLabel: 'Тяло',
      allBodies: 'Всички ({n})',
      noneForBody: 'Още нищо не е направено за {body}.',
      parts: 'Движи',
      partsHint: 'Клип, който не докосва част от тялото, върви върху ходенето, вместо да го спира — махането си остава махане в движение.',
      groups: { torso: 'Тяло', arms: 'Ръце', legs: 'Крака' },
      playing: 'Възпроизведи {name} върху тялото горе',
      stopping: 'Спри {name}',
      capture: 'Запис с камера',
      captureIntro: 'Застанете така, че камерата да ви вижда целите, и направете движението. Записът се появява в редактора горе — там можете да го поправите на ръка и да го запазите като всеки друг клип. Нищо не се качва: видеото не напуска този компютър.',
      captureUse: 'Вземи този запис',
      captureClose: 'Затвори камерата',
    },
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

    money: 'Пари',
    hereLabel: 'Тук',
    walletLabel: 'Портфейл',
    toWallet: 'Към портфейла',
    toSpace: 'Към това пространство',
    howMuch: 'Колко',
    move: 'Премести',
    moved: '{n} преместени',
    noMoving: 'Това пространство запазва монетите си - те не пътуват',
    goEarn: 'Иди изкарай',

    news: 'От kxb.team',
    hideAnnouncement: 'Скрий това съобщение',
    hideIt: 'Скрий го — остава под Новини',
    noNews: 'Още нищо от kxb.team.',

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
    coins: 'Монети',
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
    doorPrice: 'Монети за вход',
    doorPriceNote: 'Плаща се веднъж дневно от всеки, който влиза - в касата на пространството.',

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
    blankPage: 'Празна страница',
    duplicate: 'Дублиране',
    nextEpisode: 'Следващ епизод',
    templates: { news: 'Новинарска емисия' },
    startFrom: 'или започнете от',
    heading: 'Страници',
    welcome: 'Добре дошли в страниците на {space}',
    body: 'Всички проекти на този спейс. Изберете един вляво — или започнете отдолу.',
    recent: 'Наскоро работено',
    untitled: 'Проект без заглавие',
    pick: 'Изберете проект вляво или създайте нов, за да започнете да пишете.',
    sidebar: 'Страници',
    collapse: 'Свий лентата',
    expand: 'Разгъни лентата',
    newTopLevel: 'Създай проект',
    page: 'Проект',
    empty: 'Още няма проекти тук.',
    createFirst: 'Създайте първия си проект',
    moveUp: 'Нагоре',
    moveDown: 'Надолу',
    addSubpage: 'Добави част',
    deletePage: 'Изтрий проекта',
    more: 'Още',
    confirmDelete:
      'Да изтрием ли този проект и да го премахнем от спейса ви?',

    bodyEmpty:
      'Още нищо не е започнато. Проектът е поредица: нейният състав, сезоните и епизодите в тях.',

    titleLabel: 'Заглавие на проекта',
    writePlaceholder: 'Пишете или натиснете / за блокове',
    archivedNote:
      'Този спейс е архивиран. Проектът може да се чете, но не и да се променя.',
    saved: 'Запазено',
    saving: 'Запазва…',
    notSaved: 'Незапазено',

    notes: 'Бележки',
    notesShow: 'Покажи бележките',
    notesHide: 'Скрий бележките',
    notesEmpty: 'Нищо в полето',
    notesEmptyHint:
      'Оставете бележка за следващия, който ще чете. Бележките са за проекта и се виждат от всички в спейса.',
    notesEmptyRead: 'Никой не е оставял бележка по този проект.',
    notesPlaceholder: 'Оставете бележка…',
    notesPost: 'Изпрати',
    notesPosting: 'Изпраща…',
    notesResolve: 'Отбележи като решена',
    notesReopen: 'Върни я',
    notesSettled: '{n} решени',

    board: 'Борд',
    boardShow: 'Покажи сторибордa',
    boardHide: 'Скрий сториборда',
    boardEmpty: 'Още няма сцени',
    boardEmptyHint:
      'Натиснете / и изберете Сцена. Всяка сцена се появява тук, в реда, в който върви.',
    boardUnheaded: 'Сцена без заглавие',
    boardOpenScene: 'Покажи тази сцена на страницата',
    boardBeats: '{n} такта',
    boardEstimate: 'Оценка по думите, не реално времетраене.',

    flowHeading: 'От страница до стая',
    flowBody:
      'Четири стъпки, в този ред. Тук започва поредицата; останалите три я построяват и ви вкарват вътре.',
    flowWrite: 'Създайте проекта',
    flowWriteBody:
      'Бележки, план, сценарий. Проектът се влага — сезонът пази епизодите си.',
    flowCast: 'Разпределете ролите',
    flowCastBody:
      'Кой участва, къде се случва, какво носят. Библията, от която сцените взимат имената.',
    flowWorld: 'Постройте света',
    flowWorldBody:
      'Подредете мястото блок по блок и го запазете в спейса.',
    flowPlay: 'Влезте вътре',
    flowPlayBody:
      'Заредете света в стая и застанете в него заедно с всички.',
    flowOffPages: 'Проектите са изключени за този спейс.',
    flowOffChannels:
      'Каналите са изключени за този спейс. Админ може да ги включи.',
    flowOffWorlds:
      'Каталогът на световете е изключен за този спейс. Админ може да го включи.',
    flowOffLounge: 'Лаунджът е изключен за този спейс.',
    projectName: 'Как се казва?',
    projectStart: 'Създай',
    projectStarting: 'Създава…',
    cancel: 'Отказ',
    projectLive: '{n} в ефир или на път',
    addSeason: 'Добави сезон',
    addEpisode: 'Добави епизод',
    untitledEpisode: 'Епизод без заглавие',
    seasonEmpty: 'Още нищо в този сезон',
    projectNoSeasons: 'Още няма сезони',
    statusDraft: 'чернова',
    statusInReview: 'на преглед',
    statusOnAir: 'в ефир',
    statusChanged: 'променен след излъчване',
    statusRejected: 'върнат',
    costs: 'Струва',
    coins: 'монети',
    inChannels: 'На преглед · Канал',
    sendToAir: 'Изпрати в ефир',
    changedNote: 'Читателите още виждат последната одобрена версия. Изпратете отново в ефир, за да я обновите.',
    writeVersion: 'Напишете версията на',
    airHeading: 'Канал',
    airBody: 'Какво излиза и какво вече е излязло. Всичко се прави в',
    airToPages: 'Страници →',
    airEmpty: 'Още нищо в ефир. Изпратете епизод от страницата му, когато е готов.',
    airRejected: 'Върнати',
    airChanged: 'Променени след излъчване',
    airWaiting: 'На преглед',
    airOnAir: 'В ефир',
    airWatch: 'Гледай',
    airEdit: 'Редактирай',
    airDrafts: '{n} чернови още се пишат в',
    startHeading: 'Започнете нещо',
    startBody: 'Проектът е продукция: съставът, сезоните и епизодите в тях. Дайте му име и вече пишете първия.',
    allHeading: 'Всичко',
    filterPlaceholder: 'Филтрирай проекти и епизоди',
    filterNothing: 'Нищо не съвпада с „{q}“.',
    projectEpisodes: '{n} епизода',
    buySeason: 'Създай сега · {n} монети',
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
