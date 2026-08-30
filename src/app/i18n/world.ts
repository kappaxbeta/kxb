import type { GoalKind } from '@/domain/lounge/goal-events'
import type { PaletteGroupId } from '@/domain/lounge/palette'
import type { WorldTemplateId } from '@/domain/lounge/templates'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The words drawn over a running world.
 *
 * One dictionary for all four scenes rather than one each, because the HUD kit
 * they share is the reason `hud.tsx` exists at all: the controls panel, the
 * keycaps and the chip vocabulary are the same in the lounge, the house and the
 * café, and three dictionaries would let them drift apart in translation
 * exactly the way they had drifted apart in English before that file was
 * written.
 *
 * ---------------------------------------------------------------------------
 * Keycaps are not words
 * ---------------------------------------------------------------------------
 * `W`, `A`, `S`, `D`, `Space`, `Shift`, `Esc` and the letter keys stay as they
 * are. They are the labels *printed on the hardware in front of the reader*,
 * and a German keyboard has `Esc` and `Shift` on it too. Translating a keycap
 * would tell somebody to press a key that does not exist. What is translated is
 * the half of each row that says what the key does.
 *
 * The two soft buttons a phone draws - Place, Break, Dash, Kick, Dance - are
 * the exception, because those are drawn by us rather than moulded by Cherry.
 * They live in `softKeys`.
 */
export interface WorldDict {
  /** The panel that is also the door into every scene. */
  hud: {
    title: string
    close: string
    enter: string
    tapEnter: string
    tapAnywhere: string
    clickAnywhere: string
    showControls: string
    controlsTitle: string
    /** How a row is read aloud. `{keys}` then `{does}`. */
    spoken: string
    or: string
    leftClick: string
    rightClick: string
    dragAnywhere: string
    onScreenStick: string
  }

  /** What each control does. The keycap beside it is never translated. */
  controls: {
    move: string
    dragToLook: string
    jump: string
    doubleJump: string
    fly: string
    up: string
    down: string
    faster: string
    sprint: string
    build: string
    mine: string
    breakPlace: string
    blocks: string
    attack: string
    dashAttack: string
    shove: string
    kick: string
    dance: string
    view: string
    lookAtYourself: string
    seeTheRoom: string
    mouseLook: string
    controls: string
    leave: string
  }

  /** The soft buttons a phone draws, which are ours to name. */
  softKeys: {
    jump: string
    place: string
    break: string
    chip: string
    dash: string
    kick: string
    dance: string
    /** The sprint burst over the thumbstick. A name, because ⚡ says nothing aloud. */
    turbo: string
  }

  /** The button that puts a headset on, and the two lines beside it. */
  vr: {
    enter: string
    noSession: string
    sticks: string
    triggers: string
  }

  /**
   * The older showcase lounge at `/v/[slug]/lounge`.
   *
   * Its own keys rather than the lounge's, because it draws its own gate: three
   * lines of shorthand where the shared kit draws a table of keycaps. Reaching
   * for `hud` here would either widen those keys to cover both shapes or make
   * this file lie about what the panel says.
   */
  showcase: {
    tapEnter: string
    touchLines: readonly string[]
    clickEnter: string
    mouseLines: readonly string[]
    /** Two halves around the `E` cap, which is not a word. */
    chooseLead: string
    chooseTail: string
  }

  /**
   * Somebody's front door, from both sides.
   *
   * `place` is a phrase rather than a name for the reason the rail's is: the
   * two sentences it appears in need the German article, and it differs by
   * gender. "Go to your own café" and "Finding Sam's garden" are built from
   * `yourOwn` and `theirs`, which carry the whole noun.
   */
  door: {
    /** The owner's three settings. */
    open: string
    knock: string
    closed: string
    openHint: string
    knockHint: string
    closedHint: string
    whoMayComeIn: string

    /** What a visitor is told. `{name}` is the owner, `{place}` one of `theirs`. */
    walkingUp: string
    walkingUpBody: string
    knocking: string
    knockingBody: string
    nobodyHome: string
    nobodyHomeBody: string
    notNow: string
    notNowBody: string
    bolted: string
    boltedBody: string
    shownOut: string
    shownOutBody: string
    unreachable: string
    unreachableBody: string
    knockAgain: string
    /** `{place}` is one of `yourOwn`. */
    goToYourOwn: string

    theirs: Record<'cafe' | 'home' | 'outdoor', string>
    yourOwn: Record<'cafe' | 'home' | 'outdoor', string>
  }

  /** The floating buttons in the bottom corner of a scene. */
  dock: {
    emotes: string
    emotesTitle: string
    openEmotes: string
    closeEmotes: string
    chat: string
    mirror: string
    mirrorOn: string
    /** The peep switcher beside the mirror. */
    peep: string
    /** The wardrobe's other half: your bought skin, worn here instead of the animal. */
    skin: string
    peepLabel: string
    /** Emotes have no names - see `emotes.ts` - so the number is the label. */
    emoteNumber: string
    say: string
    message: string
    send: string

    creatures: string
    openCreatures: string
    closeCreatures: string
    /** `{name}` is the creature being released. */
    letGoOf: string
    letGo: string
    full: string
    theyWander: string
    adopt: string

    driftOn: string
    driftOff: string
    driftOnTitle: string
    driftOffTitle: string

    /** Somebody whose name we never learned. */
    someone: string
    noEcho: string
    perfTitle: string
  }

  /**
   * The block picker, and the three other tabs that live in it.
   *
   * The block *names* are deliberately absent. They are asset ids from the
   * pack, prettified mechanically - `dirt_with_grass` becomes "Dirt with
   * grass" - and the tile's actual label is the picture on it. Translating
   * fifty-eight of them by hand would be a glossary nobody reads, kept in step
   * with a folder of GLBs by nothing at all.
   */
  picker: {
    closePicker: string
    dialog: string
    close: string
    tabs: { blocks: string; goals: string; spawn: string; worlds: string }
    groups: Record<PaletteGroupId, string>
    /**
     * The fifty-two blocks on those three shelves, by palette id.
     *
     * The shelf headings have been translated since the picker was; the blocks
     * under them were not, because the picker builds their labels out of the id
     * itself - `dirt_with_grass` becomes `Dirt with grass`. Two halves of one
     * list, the second of them hand-written per language, which is the same
     * shape the world cards' tags were in.
     *
     * A block this has never heard of falls back to that prettified id. The
     * ids stay as they are everywhere else: they are what a placement stores.
     */
    blocks: Readonly<Record<string, string | undefined>>
    searchPlaceholder: string
    searchLabel: string
    tapToChange: string
    pressE: string

    /** The grounds. `{n}` is the world's edge, for the bare floor. */
    templates: Record<WorldTemplateId, { name: string; blurb: string }>
    startWorld: string
    startWorldNote: string
    default: string
    confirmLay: string
    cancel: string
    laying: string
    layIt: string
    working: string
    useThis: string
    empty: string
    confirmEmpty: string
    emptyBlurb: string
    clearing: string
    emptyIt: string

    arenas: string
    arenasNote: string
    findArena: string
    findArenaLabel: string
    /** `{name}` is the arena being loaded over this world. */
    replaceTitle: string
    load: string
    /** `{query}` is what was typed. */
    noMatches: string
    nothingSaved: string
    saveArena: string

    elsewhere: string
    elsewhereNote: string
    discover: string

    marks: string
    marksNote: string
    kinds: Record<GoalKind, string>
    noMarks: string
    standing: string
    standBoth: string
    standBothNote: string
    changeMark: string
    turnMark: string
    removeMark: string
    /** `{axis}` is W or H, which are not translated - they label a number. */
    narrower: string
    wider: string

    arrival: string
    arrivalNote: string
    /** `{x}` and `{z}` are the cell they land on. */
    arriveAt: string
    arriveMiddle: string
    movingDoor: string
    arriveHere: string
    backToMiddle: string
    arrivalHint: string
    showRing: string
    forEveryone: string
  }

  /** Fighting: the health bar, the cooldowns, and being put down. */
  combat: {
    health: string
    dash: string
    kick: string
    charging: string
    ready: string
    wentDown: string
    lava: string
    /** `{name}` is whoever landed the last hit. */
    byPlayer: string
    takenOut: string
    respawn: string
    /** `{n}` seconds of being untouchable. */
    respawnNote: string
    outOfThisOne: string
    kickoffIn: string
    hostStalled: string
  }

  /** Moving a picture that has been hung on a wall. */
  image: {
    heading: string
    done: string
    move: string
    turn: string
    size: string
    delete: string
    working: string
    /** Fallbacks for a refusal the server did not word itself. */
    refused: string
    uploadFailed: string
    networkError: string
  }

  /** The tab a lounge is opened in. */
  meta: { lounge: string }

  /** The world's own chrome, outside the HUD kit. */
  world: {
    nameArena: string
    layFailed: string
    emptyFailed: string
    stopDancing: string
  }

  /** The lounge's own readouts and chips. */
  lounge: {
    /** `{n}` blocks in this world. */
    blocks: string
    queued: string
    saving: string
    offline: string
    offlineTitle: string
    connecting: string
    onlyYou: string
    /** `{n}` other people in the room. */
    othersHere: string
    readOnly: string
    walkNotChange: string
    battle: string
    creative: string
    toCreative: string
    toBattle: string
    /** The banner over a desync. `{error}` is the refusal itself. */
    errorTail: string
    shutter: string
    shutterTitle: string
    /** `{name}` is the file that was written. */
    saved: string
    layingFloor: string
    /** `{n}` is the world's edge in blocks. */
    generateFloor: string
    floorNote: string

    /**
     * The camera switch, and the four things it can be.
     *
     * Four rather than two because the two failures need different sentences:
     * a refused permission is a decision to change in the browser, a missing
     * device is a camera to plug in, and sending everybody who hits either to
     * the same "off, sorry" sends half of them to the wrong place.
     */
    cameraOn: string
    cameraOnTitle: string
    cameraOff: string
    cameraOffTitle: string
    cameraAsking: string
    cameraDenied: string
    cameraDeniedTitle: string
    cameraMissing: string
    cameraMissingTitle: string

    /** The microphone switch. The mode it obeys is chosen at the door. */
    micOn: string
    micOnPush: string
    micOnTitle: string
    micOnPushTitle: string
    micOff: string
    micOffTitle: string
    micDenied: string
    micDeniedTitle: string
    micMissing: string
    micMissingTitle: string
  }
}

export const WORLD_EN: WorldDict = {
  meta: { lounge: 'Lounge' },

  hud: {
    title: 'Game controls',
    close: 'Close controls',
    enter: 'Enter',
    tapEnter: 'Tap to enter',
    tapAnywhere: 'Tap anywhere to enter',
    clickAnywhere: 'Click anywhere to enter',
    showControls: 'Show controls',
    controlsTitle: 'Controls (H)',
    spoken: '{keys}: {does}',
    or: ' or ',
    leftClick: 'left click',
    rightClick: 'right click',
    dragAnywhere: 'drag anywhere on the screen',
    onScreenStick: 'the on-screen stick',
  },

  controls: {
    move: 'Move',
    dragToLook: 'Drag to look',
    jump: 'Jump',
    doubleJump: 'Jump ×2',
    fly: 'Fly',
    up: 'Up',
    down: 'Down',
    faster: 'Faster',
    sprint: 'Sprint',
    build: 'Build',
    mine: 'Mine',
    breakPlace: 'Break / place',
    blocks: 'Blocks',
    attack: 'Attack',
    dashAttack: 'Dash attack',
    shove: 'Shove',
    kick: 'Kick',
    dance: 'Dance',
    view: 'View',
    lookAtYourself: 'Look at yourself',
    seeTheRoom: 'See the whole room',
    mouseLook: 'Mouse look on / off',
    controls: 'Controls',
    leave: 'Leave',
  },

  softKeys: {
    jump: 'Jump',
    place: 'Place',
    break: 'Break',
    chip: 'Chip',
    dash: 'Dash',
    kick: 'Kick',
    dance: 'Dance',
    turbo: 'Turbo',
  },

  lounge: {
    blocks: '{n} blocks',
    queued: '{n} queued',
    saving: 'saving…',
    offline: 'offline',
    offlineTitle: 'Presence channel unavailable',
    connecting: 'connecting…',
    onlyYou: 'only you',
    othersHere: '+{n} here',
    readOnly: 'Read-only',
    walkNotChange: 'A world you can walk but not change',
    battle: '⚔ Battle',
    creative: '✎ Creative',
    toCreative: 'Switch to creative',
    toBattle: 'Switch to battle',
    errorTail: '{error} — reload to resync.',
    shutter: 'Save a picture of this room',
    shutterTitle: 'Save a picture — the world, without any of this',
    saved: 'saved {name}',
    cameraOn: 'Turn your camera off',
    cameraOnTitle: 'Your camera is on. Everybody in this room can see you.',
    cameraOff: 'Show your face',
    cameraOffTitle: 'Put your camera on your body, for the people in this room',
    cameraAsking: 'Asking…',
    cameraDenied: 'Camera blocked',
    cameraDeniedTitle:
      'Your browser is refusing the camera for this site. The permission is in the address bar.',
    cameraMissing: 'No camera',
    cameraMissingTitle: 'No camera the browser can reach from here.',
    micOn: 'Turn your microphone off',
    micOnPush: 'Turn your microphone off — hold T to talk',
    micOnTitle: 'Your microphone is open. People near you can hear you.',
    micOnPushTitle: 'Your microphone is ready. Hold T to talk; nothing is sent otherwise.',
    micOff: 'Be heard',
    micOffTitle: 'Let the people near you hear you. Voice fades with distance.',
    micDenied: 'Mic blocked',
    micDeniedTitle:
      'Your browser is refusing the microphone for this site. The permission is in the address bar.',
    micMissing: 'No microphone',
    micMissingTitle: 'No microphone the browser can reach from here.',
    layingFloor: 'Laying the floor…',
    generateFloor: 'Generate {n}×{n} grass floor',
    floorNote: '{blocks} blocks as ~16 events, centred on the origin.',
  },

  combat: {
    health: 'Health',
    dash: 'Dash',
    kick: 'Kick',
    charging: 'charging…',
    ready: 'ready',
    wentDown: 'You went down',
    lava: 'You burned up in the lava.',
    byPlayer: '{name} put you down.',
    takenOut: 'Taken out.',
    respawn: 'Respawn',
    respawnNote: 'Back at the spawn point, untouchable for {n}s.',
    outOfThisOne: 'You are out of this one. Stay and watch how it ends.',
    kickoffIn: 'Kickoff in',
    hostStalled: 'Host is not responding — the ball is frozen',
  },

  image: {
    heading: 'Image',
    done: 'Done',
    move: 'Move',
    turn: 'Turn',
    size: 'Size',
    delete: 'Delete',
    working: 'Working…',
    refused: 'That change was refused',
    uploadFailed: 'Could not upload that image',
    networkError: 'Network error while uploading',
  },

  world: {
    nameArena: 'Name this arena',
    layFailed: 'That world could not be laid',
    emptyFailed: 'That world could not be emptied',
    stopDancing: 'Stop',
  },

  picker: {
    closePicker: 'Close block picker',
    dialog: 'Blocks and worlds',
    close: 'Close',
    tabs: { blocks: 'Blocks', goals: 'Goals', spawn: 'Arrival', worlds: 'Worlds' },
    groups: { terrain: 'Terrain', colour: 'Colour', props: 'Props' },
    blocks: {
      dirt: 'Dirt',
      dirt_with_grass: 'Dirt with grass',
      dirt_with_snow: 'Dirt with snow',
      grass: 'Grass',
      grass_with_snow: 'Grass with snow',
      sand_with_grass: 'Sand with grass',
      sand_with_snow: 'Sand with snow',
      snow: 'Snow',
      gravel: 'Gravel',
      gravel_with_grass: 'Gravel with grass',
      gravel_with_snow: 'Gravel with snow',
      stone: 'Stone',
      stone_dark: 'Stone dark',
      stone_with_copper: 'Stone with copper',
      stone_with_gold: 'Stone with gold',
      stone_with_silver: 'Stone with silver',
      wood: 'Wood',
      metal: 'Metal',
      metalframe: 'Metalframe',
      glass: 'Glass',
      hay: 'Hay',
      lava: 'Lava',
      water: 'Water',
      prototype: 'Prototype',
      bricks_A: 'Bricks A',
      bricks_B: 'Bricks B',
      sand_A: 'Sand A',
      sand_B: 'Sand B',
      colored_block_blue: 'Colored block blue',
      colored_block_green: 'Colored block green',
      colored_block_red: 'Colored block red',
      colored_block_yellow: 'Colored block yellow',
      decorative_block_blue: 'Decorative block blue',
      decorative_block_green: 'Decorative block green',
      decorative_block_red: 'Decorative block red',
      decorative_block_yellow: 'Decorative block yellow',
      striped_block_blue: 'Striped block blue',
      striped_block_green: 'Striped block green',
      striped_block_red: 'Striped block red',
      striped_block_yellow: 'Striped block yellow',
      anvil: 'Anvil',
      apple: 'Apple',
      barrel: 'Barrel',
      battery: 'Battery',
      chest: 'Chest',
      computer: 'Computer',
      crate: 'Crate',
      dynamite: 'Dynamite',
      gift: 'Gift',
      hay_bale: 'Hay bale',
      melon: 'Melon',
      pipe: 'Pipe',
      trashcan: 'Trashcan',
      tree: 'Tree',
      tree_with_snow: 'Tree with snow',
      books_A: 'Books A',
      books_B: 'Books B',
      vault: 'Vault',
    },
    searchPlaceholder: 'Search blocks…',
    searchLabel: 'Search blocks',
    tapToChange: 'Tap to change',
    pressE: 'Press E',

    templates: {
      pitch: {
        name: 'Football pitch',
        blurb: 'Walled, marked out, a goal at each end. Ready to kick off.',
      },
      race: {
        name: 'Race course',
        blurb: 'Sixteen pads over the water, with a start gate and a finish gate.',
      },
      cage: { name: 'Duelling cage', blurb: 'A round walled pit. No goals, nowhere to run.' },
      club: { name: 'The club', blurb: 'A dark hall, a lit dancefloor, a booth and a bar.' },
      'living-room': {
        name: 'Living room',
        blurb: 'Sofa, rug, telly, bookshelf. A room at the scale of a conversation.',
      },
      'demo-island': {
        name: 'Demo island',
        blurb: 'The island from the public demo: plaza, fountain, stage and trees.',
      },
      flats: {
        name: 'Flat ground',
        blurb: 'A bare {n}×{n} floor, centred on the origin. Build it yourself.',
      },
    },
    startWorld: 'Start a world',
    startWorldNote: 'Each of these clears what is here first. The log keeps the history.',
    default: 'default',
    confirmLay: 'Everything built here goes. Sure?',
    cancel: 'Cancel',
    laying: 'Laying it…',
    layIt: 'Lay it down',
    working: 'Working…',
    useThis: 'Use this',
    empty: 'Empty',
    confirmEmpty: 'Everything built here goes, and nothing replaces it. Sure?',
    emptyBlurb: 'Bare ground, gone. Nothing to stand on until you build it.',
    clearing: 'Clearing it…',
    emptyIt: 'Empty it',

    arenas: 'Saved arenas',
    arenasNote:
      'Both directions are copies — saving keeps the lounge, loading keeps the arena.',
    findArena: 'Find an arena by name…',
    findArenaLabel: 'Find an arena by name',
    replaceTitle: 'Replace this world with “{name}”',
    load: 'Load',
    noMatches: 'Nothing matching “{query}”.',
    nothingSaved: 'Nothing saved yet. Build something, then keep it.',
    saveArena: 'Save this world as an arena',

    elsewhere: 'Somewhere else',
    elsewhereNote:
      'Places other people built — arenas, pitches, hangouts. Anything you take arrives as a battlefield of your own, so this room stays as it is.',
    discover: 'Discover worlds →',

    marks: 'Marks',
    marksNote:
      'Stood where you are standing. Red defends its own; blue scores in it. A race needs a start to line up on and a finish to run through.',
    kinds: { red: 'red goal', blue: 'blue goal', start: 'start', finish: 'finish' },
    noMarks: 'No marks yet — football needs a goal at each end, a race a start and a finish.',
    standing: 'Standing them…',
    standBoth: 'Stand both goals',
    standBothNote:
      'A red and a blue, facing each other across the middle of the world. Nothing else is touched — the pitch on the worlds tab is the one that clears first. A course is laid by hand: walk to the line and stand a start, then walk the course and stand a finish.',
    changeMark: 'Change what this mark is',
    turnMark: 'Turn it a quarter turn',
    removeMark: 'Take it away',
    narrower: 'Narrower {axis}',
    wider: 'Wider {axis}',

    arrival: 'Arrival',
    arrivalNote:
      'Where people appear when they walk into this world. Nothing to do with a race’s start line — that is a mark, and it lives under Goals.',
    arriveAt: 'They arrive at {x}, {z} — the ring on the floor.',
    arriveMiddle: 'They arrive in the middle of the world.',
    movingDoor: 'Moving the door…',
    arriveHere: 'Arrive where I am standing',
    backToMiddle: 'Back to the middle',
    arrivalHint:
      'Close the picker and walk somewhere first — the door goes on the cell under your feet. Everybody arriving at once is spread around it, so a spot with room to stand beats a doorway.',
    showRing: 'Show the ring on the floor',
    forEveryone: '(for everyone)',
  },

  dock: {
    emotes: 'Emotes',
    emotesTitle: 'Emotes (Z)',
    openEmotes: 'Open emotes',
    closeEmotes: 'Close emotes',
    chat: 'Chat',
    mirror: 'Look at yourself',
    mirrorOn: 'on',
    peep: 'Change peep',
    skin: 'Skins',
    peepLabel: 'Peeps',
    emoteNumber: 'Emote {n}',
    say: 'Say something',
    message: 'Message',
    send: 'Send',

    creatures: 'Creatures',
    openCreatures: 'Open creatures',
    closeCreatures: 'Close creatures',
    letGoOf: 'Let {name} go',
    letGo: 'let go',
    full: 'There is no room for another one in here.',
    theyWander: 'They will find their own way around.',
    adopt: 'Adopt a creature',

    driftOn: 'Take back the controls',
    driftOff: 'Let your body wander',
    driftOnTitle: 'Wandering — move to take over',
    driftOffTitle: 'Wander on its own',

    someone: 'Someone',
    noEcho: 'no echo',
    perfTitle:
      "This room's frame rate, traffic and round trip, measured in your own browser over the last fifteen seconds. Round trip is a message out to another player and straight back, timed on this machine's clock.",
  },

  door: {
    open: 'Open',
    knock: 'Knock',
    closed: 'Closed',
    openHint: 'Anyone in the space can walk in.',
    knockHint: 'They ask, you answer.',
    closedHint: 'Nobody gets in, and nobody can ask.',
    whoMayComeIn: 'Who may come in',

    walkingUp: 'Walking up the path…',
    walkingUpBody: 'Finding {name}’s {place}.',
    knocking: 'Knocking…',
    knockingBody: '{name} has been asked. They have to be at the door to answer.',
    nobodyHome: 'Nobody home',
    nobodyHomeBody:
      '{name} is not here right now, so there is nobody to let you in. You can wait - if they arrive, you will knock again automatically.',
    notNow: 'Not right now',
    notNowBody: '{name} turned you away.',
    bolted: 'The door is bolted',
    boltedBody: '{name} has their homestead closed, so there is not even a knock to make.',
    shownOut: 'Shown out',
    shownOutBody: '{name} asked you to leave.',
    unreachable: 'Could not reach the door',
    unreachableBody: 'The connection to this space failed. Reloading usually sorts it.',
    knockAgain: 'Knock again',
    goToYourOwn: 'Go to your own {place}',

    theirs: { cafe: 'café', home: 'home', outdoor: 'garden' },
    yourOwn: { cafe: 'café', home: 'home', outdoor: 'garden' },
  },

  showcase: {
    tapEnter: 'Tap to enter',
    touchLines: [
      'Drag to look · stick to move',
      '▲▼ fly · Place / Break to build',
      'Tap the block chip to change block',
    ],
    clickEnter: 'Click to enter the lounge',
    mouseLines: [
      'WASD move · Space up · Ctrl down · Shift sprint',
      'Right-click place · Left-click break',
    ],
    chooseLead: '',
    chooseTail: ' to choose a block · Esc to leave',
  },

  vr: {
    enter: 'Enter VR',
    noSession: 'The headset did not start a session.',
    sticks: 'Left stick walks, right stick turns.',
    triggers: 'Trigger breaks a block, grip places one.',
  },
}

export const WORLD_DE: WorldDict = {
  meta: { lounge: 'Lounge' },

  hud: {
    title: 'Steuerung',
    close: 'Steuerung schließen',
    enter: 'Hinein',
    tapEnter: 'Zum Hineingehen tippen',
    tapAnywhere: 'Irgendwo tippen, um hineinzugehen',
    clickAnywhere: 'Irgendwohin klicken, um hineinzugehen',
    showControls: 'Steuerung anzeigen',
    controlsTitle: 'Steuerung (H)',
    spoken: '{keys}: {does}',
    or: ' oder ',
    leftClick: 'linke Maustaste',
    rightClick: 'rechte Maustaste',
    dragAnywhere: 'irgendwo über den Bildschirm ziehen',
    onScreenStick: 'der Stick auf dem Bildschirm',
  },

  controls: {
    move: 'Bewegen',
    dragToLook: 'Ziehen zum Umsehen',
    jump: 'Springen',
    doubleJump: 'Doppelsprung',
    fly: 'Fliegen',
    up: 'Hoch',
    down: 'Runter',
    faster: 'Schneller',
    sprint: 'Sprinten',
    build: 'Bauen',
    mine: 'Abbauen',
    breakPlace: 'Abbauen / setzen',
    blocks: 'Blöcke',
    attack: 'Angriff',
    dashAttack: 'Sturmangriff',
    shove: 'Stoßen',
    kick: 'Treten',
    dance: 'Tanzen',
    view: 'Ansicht',
    lookAtYourself: 'Sich selbst ansehen',
    seeTheRoom: 'Den ganzen Raum sehen',
    mouseLook: 'Mausblick an / aus',
    controls: 'Steuerung',
    leave: 'Verlassen',
  },

  softKeys: {
    jump: 'Sprung',
    place: 'Setzen',
    break: 'Abbauen',
    chip: 'Auswahl',
    dash: 'Sturm',
    kick: 'Tritt',
    dance: 'Tanz',
    turbo: 'Turbo',
  },

  lounge: {
    blocks: '{n} Blöcke',
    queued: '{n} in der Schlange',
    saving: 'wird gespeichert …',
    offline: 'offline',
    offlineTitle: 'Anwesenheitskanal nicht erreichbar',
    connecting: 'wird verbunden …',
    onlyYou: 'nur Sie',
    othersHere: '+{n} hier',
    readOnly: 'Nur lesen',
    walkNotChange: 'Eine Welt zum Durchlaufen, nicht zum Ändern',
    battle: '⚔ Kampf',
    creative: '✎ Kreativ',
    toCreative: 'Auf Kreativ umschalten',
    toBattle: 'Auf Kampf umschalten',
    errorTail: '{error} — zum Abgleichen neu laden.',
    shutter: 'Ein Bild von diesem Raum speichern',
    shutterTitle: 'Bild speichern — die Welt, ohne all das hier',
    saved: '{name} gespeichert',
    cameraOn: 'Kamera ausschalten',
    cameraOnTitle: 'Deine Kamera ist an. Alle in diesem Raum sehen dich.',
    cameraOff: 'Zeig dein Gesicht',
    cameraOffTitle: 'Deine Kamera auf deinen Körper legen, für alle in diesem Raum',
    cameraAsking: 'Wird gefragt …',
    cameraDenied: 'Kamera blockiert',
    cameraDeniedTitle:
      'Dein Browser verweigert die Kamera für diese Seite. Die Berechtigung steht in der Adressleiste.',
    cameraMissing: 'Keine Kamera',
    cameraMissingTitle: 'Von hier aus erreicht der Browser keine Kamera.',
    micOn: 'Mikrofon ausschalten',
    micOnPush: 'Mikrofon ausschalten — zum Sprechen T halten',
    micOnTitle: 'Dein Mikrofon ist offen. Wer in der Nähe steht, hört dich.',
    micOnPushTitle:
      'Dein Mikrofon ist bereit. Zum Sprechen T halten; sonst wird nichts gesendet.',
    micOff: 'Lass dich hören',
    micOffTitle:
      'Wer in deiner Nähe steht, kann dich hören. Die Stimme wird mit der Entfernung leiser.',
    micDenied: 'Mikrofon blockiert',
    micDeniedTitle:
      'Dein Browser verweigert das Mikrofon für diese Seite. Die Berechtigung steht in der Adressleiste.',
    micMissing: 'Kein Mikrofon',
    micMissingTitle: 'Von hier aus erreicht der Browser kein Mikrofon.',
    layingFloor: 'Der Boden wird gelegt …',
    generateFloor: '{n}×{n} Grasboden erzeugen',
    floorNote: '{blocks} Blöcke als ~16 Ereignisse, um den Ursprung zentriert.',
  },

  combat: {
    health: 'Leben',
    dash: 'Sturm',
    kick: 'Tritt',
    charging: 'lädt …',
    ready: 'bereit',
    wentDown: 'Sie sind umgefallen',
    lava: 'Sie sind in der Lava verbrannt.',
    byPlayer: '{name} hat Sie umgehauen.',
    takenOut: 'Erwischt.',
    respawn: 'Neu einsteigen',
    respawnNote: 'Zurück am Startpunkt, {n} Sekunden lang unverwundbar.',
    outOfThisOne: 'Für diese Runde sind Sie raus. Bleiben Sie da und sehen Sie zu, wie es ausgeht.',
    kickoffIn: 'Anstoß in',
    hostStalled: 'Der Host antwortet nicht — der Ball ist eingefroren',
  },

  image: {
    heading: 'Bild',
    done: 'Fertig',
    move: 'Bewegen',
    turn: 'Drehen',
    size: 'Größe',
    delete: 'Löschen',
    working: 'Wird erledigt …',
    refused: 'Diese Änderung wurde abgelehnt',
    uploadFailed: 'Dieses Bild konnte nicht hochgeladen werden',
    networkError: 'Netzwerkfehler beim Hochladen',
  },

  world: {
    nameArena: 'Wie soll diese Arena heißen?',
    layFailed: 'Diese Welt konnte nicht gelegt werden',
    emptyFailed: 'Diese Welt konnte nicht geleert werden',
    stopDancing: 'Stopp',
  },

  picker: {
    closePicker: 'Blockauswahl schließen',
    dialog: 'Blöcke und Welten',
    close: 'Schließen',
    tabs: { blocks: 'Blöcke', goals: 'Tore', spawn: 'Ankunft', worlds: 'Welten' },
    groups: { terrain: 'Gelände', colour: 'Farbe', props: 'Objekte' },
    blocks: {
      dirt: 'Erde',
      dirt_with_grass: 'Erde mit Gras',
      dirt_with_snow: 'Erde mit Schnee',
      grass: 'Gras',
      grass_with_snow: 'Gras mit Schnee',
      sand_with_grass: 'Sand mit Gras',
      sand_with_snow: 'Sand mit Schnee',
      snow: 'Schnee',
      gravel: 'Kies',
      gravel_with_grass: 'Kies mit Gras',
      gravel_with_snow: 'Kies mit Schnee',
      stone: 'Stein',
      stone_dark: 'Dunkler Stein',
      stone_with_copper: 'Stein mit Kupfer',
      stone_with_gold: 'Stein mit Gold',
      stone_with_silver: 'Stein mit Silber',
      wood: 'Holz',
      metal: 'Metall',
      metalframe: 'Metallrahmen',
      glass: 'Glas',
      hay: 'Heu',
      lava: 'Lava',
      water: 'Wasser',
      prototype: 'Prototyp',
      bricks_A: 'Ziegel A',
      bricks_B: 'Ziegel B',
      sand_A: 'Sand A',
      sand_B: 'Sand B',
      colored_block_blue: 'Farbblock blau',
      colored_block_green: 'Farbblock grün',
      colored_block_red: 'Farbblock rot',
      colored_block_yellow: 'Farbblock gelb',
      decorative_block_blue: 'Zierblock blau',
      decorative_block_green: 'Zierblock grün',
      decorative_block_red: 'Zierblock rot',
      decorative_block_yellow: 'Zierblock gelb',
      striped_block_blue: 'Streifenblock blau',
      striped_block_green: 'Streifenblock grün',
      striped_block_red: 'Streifenblock rot',
      striped_block_yellow: 'Streifenblock gelb',
      anvil: 'Amboss',
      apple: 'Apfel',
      barrel: 'Fass',
      battery: 'Batterie',
      chest: 'Truhe',
      computer: 'Computer',
      crate: 'Kiste',
      dynamite: 'Dynamit',
      gift: 'Geschenk',
      hay_bale: 'Heuballen',
      melon: 'Melone',
      pipe: 'Rohr',
      trashcan: 'Mülleimer',
      tree: 'Baum',
      tree_with_snow: 'Baum mit Schnee',
      books_A: 'Bücher A',
      books_B: 'Bücher B',
      vault: 'Tresor',
    },
    searchPlaceholder: 'Blöcke suchen …',
    searchLabel: 'Blöcke suchen',
    tapToChange: 'Zum Wechseln tippen',
    pressE: 'E drücken',

    templates: {
      pitch: {
        name: 'Fußballplatz',
        blurb: 'Umzäunt, aufgezeichnet, an jedem Ende ein Tor. Bereit zum Anpfiff.',
      },
      race: {
        name: 'Rennstrecke',
        blurb: 'Sechzehn Plattformen über dem Wasser, mit Start- und Zieltor.',
      },
      cage: {
        name: 'Duellkäfig',
        blurb: 'Eine runde, ummauerte Grube. Keine Tore, kein Entkommen.',
      },
      club: {
        name: 'Der Club',
        blurb: 'Eine dunkle Halle, eine beleuchtete Tanzfläche, eine Nische und eine Bar.',
      },
      'living-room': {
        name: 'Wohnzimmer',
        blurb: 'Sofa, Teppich, Fernseher, Bücherregal. Ein Raum in Gesprächsgröße.',
      },
      'demo-island': {
        name: 'Demo-Insel',
        blurb: 'Die Insel aus der öffentlichen Demo: Platz, Brunnen, Bühne und Bäume.',
      },
      flats: {
        name: 'Ebener Boden',
        blurb: 'Ein nackter {n}×{n}-Boden, um den Ursprung zentriert. Bauen Sie selbst.',
      },
    },
    startWorld: 'Eine Welt beginnen',
    startWorldNote:
      'Jede davon räumt zuerst weg, was hier steht. Das Protokoll behält die Geschichte.',
    default: 'Standard',
    confirmLay: 'Alles, was hier gebaut wurde, verschwindet. Sicher?',
    cancel: 'Abbrechen',
    laying: 'Wird gelegt …',
    layIt: 'Hinlegen',
    working: 'Wird erledigt …',
    useThis: 'Diese nehmen',
    empty: 'Leer',
    confirmEmpty:
      'Alles, was hier gebaut wurde, verschwindet, und nichts kommt an seine Stelle. Sicher?',
    emptyBlurb: 'Nackter Boden, weg. Nichts zum Draufstehen, bis Sie es bauen.',
    clearing: 'Wird geräumt …',
    emptyIt: 'Leeren',

    arenas: 'Gespeicherte Arenen',
    arenasNote:
      'In beide Richtungen wird kopiert — beim Speichern bleibt die Lounge, beim Laden bleibt die Arena.',
    findArena: 'Arena nach Namen suchen …',
    findArenaLabel: 'Arena nach Namen suchen',
    replaceTitle: 'Diese Welt durch „{name}“ ersetzen',
    load: 'Laden',
    noMatches: 'Nichts passt zu „{query}“.',
    nothingSaved: 'Noch nichts gespeichert. Bauen Sie etwas und behalten Sie es.',
    saveArena: 'Diese Welt als Arena speichern',

    elsewhere: 'Woanders',
    elsewhereNote:
      'Orte, die andere gebaut haben — Arenen, Plätze, Treffpunkte. Was Sie mitnehmen, kommt als eigenes Schlachtfeld an, dieser Raum bleibt also, wie er ist.',
    discover: 'Welten entdecken →',

    marks: 'Markierungen',
    marksNote:
      'Dort aufgestellt, wo Sie stehen. Rot verteidigt sein eigenes; Blau trifft hinein. Ein Rennen braucht einen Start zum Aufstellen und ein Ziel zum Durchlaufen.',
    kinds: { red: 'rotes Tor', blue: 'blaues Tor', start: 'Start', finish: 'Ziel' },
    noMarks:
      'Noch keine Markierungen — Fußball braucht an jedem Ende ein Tor, ein Rennen einen Start und ein Ziel.',
    standing: 'Werden aufgestellt …',
    standBoth: 'Beide Tore aufstellen',
    standBothNote:
      'Ein rotes und ein blaues, einander gegenüber quer durch die Mitte der Welt. Sonst wird nichts angefasst — der Platz im Welten-Tab ist der, der zuerst räumt. Eine Strecke wird von Hand gelegt: zur Linie gehen und einen Start setzen, dann die Strecke ablaufen und ein Ziel setzen.',
    changeMark: 'Ändern, was diese Markierung ist',
    turnMark: 'Um eine Vierteldrehung drehen',
    removeMark: 'Wegnehmen',
    narrower: '{axis} schmaler',
    wider: '{axis} breiter',

    arrival: 'Ankunft',
    arrivalNote:
      'Wo Leute auftauchen, wenn sie in diese Welt kommen. Hat nichts mit der Startlinie eines Rennens zu tun — das ist eine Markierung und steht unter Tore.',
    arriveAt: 'Sie kommen bei {x}, {z} an — dem Ring auf dem Boden.',
    arriveMiddle: 'Sie kommen in der Mitte der Welt an.',
    movingDoor: 'Die Tür wird versetzt …',
    arriveHere: 'Dort ankommen, wo ich stehe',
    backToMiddle: 'Zurück in die Mitte',
    arrivalHint:
      'Schließen Sie die Auswahl und gehen Sie erst irgendwohin — die Tür kommt auf die Zelle unter Ihren Füßen. Wer gleichzeitig ankommt, wird darum herum verteilt, ein Platz mit Standfläche ist also besser als ein Türrahmen.',
    showRing: 'Den Ring auf dem Boden zeigen',
    forEveryone: '(für alle)',
  },

  dock: {
    emotes: 'Emotes',
    emotesTitle: 'Emotes (Z)',
    openEmotes: 'Emotes öffnen',
    closeEmotes: 'Emotes schließen',
    chat: 'Chat',
    mirror: 'Sich selbst ansehen',
    mirrorOn: 'an',
    peep: 'Peep wechseln',
    skin: 'Skins',
    peepLabel: 'Peeps',
    emoteNumber: 'Emote {n}',
    say: 'Sagen Sie etwas',
    message: 'Nachricht',
    send: 'Senden',

    creatures: 'Tiere',
    openCreatures: 'Tiere öffnen',
    closeCreatures: 'Tiere schließen',
    letGoOf: '{name} gehen lassen',
    letGo: 'gehen lassen',
    full: 'Hier drin ist kein Platz für noch eins.',
    theyWander: 'Sie finden ihren eigenen Weg.',
    adopt: 'Ein Tier aufnehmen',

    driftOn: 'Die Steuerung zurücknehmen',
    driftOff: 'Den Körper wandern lassen',
    driftOnTitle: 'Wandert — bewegen Sie sich, um zu übernehmen',
    driftOffTitle: 'Von allein wandern lassen',

    someone: 'Jemand',
    noEcho: 'kein Echo',
    perfTitle:
      'Bildrate, Datenverkehr und Umlaufzeit dieses Raums, in Ihrem eigenen Browser über die letzten fünfzehn Sekunden gemessen. Die Umlaufzeit ist eine Nachricht zu einer anderen Person und direkt zurück, gestoppt auf der Uhr dieses Rechners.',
  },

  door: {
    open: 'Offen',
    knock: 'Klopfen',
    closed: 'Zu',
    openHint: 'Alle im Space können einfach hereinkommen.',
    knockHint: 'Sie fragen, Sie antworten.',
    closedHint: 'Niemand kommt herein, und niemand kann fragen.',
    whoMayComeIn: 'Wer hereinkommen darf',

    walkingUp: 'Der Weg wird hochgegangen …',
    walkingUpBody: '{name}s {place} wird gesucht.',
    knocking: 'Es wird geklopft …',
    knockingBody: '{name} wurde gefragt. Es muss jemand an der Tür sein, um zu antworten.',
    nobodyHome: 'Niemand zu Hause',
    nobodyHomeBody:
      '{name} ist gerade nicht da, es kann Sie also niemand hereinlassen. Sie können warten — wenn jemand kommt, wird automatisch noch einmal geklopft.',
    notNow: 'Gerade nicht',
    notNowBody: '{name} hat Sie abgewiesen.',
    bolted: 'Die Tür ist verriegelt',
    boltedBody: '{name} hat den eigenen Hof zugemacht, da gibt es nicht einmal etwas zum Anklopfen.',
    shownOut: 'Hinausbegleitet',
    shownOutBody: '{name} hat Sie gebeten zu gehen.',
    unreachable: 'Die Tür war nicht erreichbar',
    unreachableBody:
      'Die Verbindung zu diesem Space ist fehlgeschlagen. Neu laden hilft meistens.',
    knockAgain: 'Noch einmal klopfen',
    goToYourOwn: 'In Ihr eigenes {place}',

    theirs: { cafe: 'Café', home: 'Zuhause', outdoor: 'Garten' },
    yourOwn: { cafe: 'Café', home: 'Zuhause', outdoor: 'Garten' },
  },

  showcase: {
    tapEnter: 'Zum Hineingehen tippen',
    touchLines: [
      'Ziehen zum Umsehen · Stick zum Bewegen',
      '▲▼ fliegen · Setzen / Abbauen zum Bauen',
      'Auf den Blockchip tippen, um den Block zu wechseln',
    ],
    clickEnter: 'Klicken, um in die Lounge zu gehen',
    mouseLines: [
      'WASD bewegen · Space hoch · Ctrl runter · Shift sprinten',
      'Rechtsklick setzen · Linksklick abbauen',
    ],
    chooseLead: '',
    chooseTail: ' für die Blockauswahl · Esc zum Verlassen',
  },

  vr: {
    enter: 'In VR gehen',
    noSession: 'Das Headset hat keine Sitzung gestartet.',
    sticks: 'Linker Stick läuft, rechter Stick dreht.',
    triggers: 'Trigger baut einen Block ab, Griff setzt einen.',
  },
}

export const WORLD_BG: WorldDict = {
  meta: { lounge: 'Лоундж' },

  hud: {
    title: 'Управление',
    close: 'Затвори управлението',
    enter: 'Влез',
    tapEnter: 'Докоснете, за да влезете',
    tapAnywhere: 'Докоснете където и да е, за да влезете',
    clickAnywhere: 'Щракнете където и да е, за да влезете',
    showControls: 'Покажи управлението',
    controlsTitle: 'Управление (H)',
    spoken: '{keys}: {does}',
    or: ' или ',
    leftClick: 'ляв бутон',
    rightClick: 'десен бутон',
    dragAnywhere: 'влачене където и да е по екрана',
    onScreenStick: 'стикът на екрана',
  },

  controls: {
    move: 'Движение',
    dragToLook: 'Влачене за оглеждане',
    jump: 'Скок',
    doubleJump: 'Двоен скок',
    fly: 'Летене',
    up: 'Нагоре',
    down: 'Надолу',
    faster: 'По-бързо',
    sprint: 'Спринт',
    build: 'Строеж',
    mine: 'Копане',
    breakPlace: 'Чупене / поставяне',
    blocks: 'Блокове',
    attack: 'Атака',
    dashAttack: 'Атака със засилване',
    shove: 'Бутане',
    kick: 'Ритник',
    dance: 'Танц',
    view: 'Изглед',
    lookAtYourself: 'Погледнете себе си',
    seeTheRoom: 'Вижте цялата стая',
    mouseLook: 'Поглед с мишката вкл. / изкл.',
    controls: 'Управление',
    leave: 'Излизане',
  },

  softKeys: {
    jump: 'Скок',
    place: 'Постави',
    break: 'Счупи',
    chip: 'Блок',
    dash: 'Засилване',
    kick: 'Ритник',
    dance: 'Танц',
    turbo: 'Турбо',
  },

  lounge: {
    blocks: '{n} блока',
    queued: '{n} на опашка',
    saving: 'запазва се…',
    offline: 'офлайн',
    offlineTitle: 'Каналът за присъствие е недостъпен',
    connecting: 'свързва се…',
    onlyYou: 'само вие',
    othersHere: '+{n} тук',
    readOnly: 'Само за четене',
    walkNotChange: 'Свят, из който се ходи, но не се променя',
    battle: '⚔ Битка',
    creative: '✎ Творчество',
    toCreative: 'Премини към творчество',
    toBattle: 'Премини към битка',
    errorTail: '{error} — презаредете, за да се синхронизирате.',
    shutter: 'Запази снимка на тази стая',
    shutterTitle: 'Запази снимка — светът, без нищо от това',
    saved: 'запазено {name}',
    cameraOn: 'Изключете камерата си',
    cameraOnTitle: 'Камерата ви е включена. Всички в тази стая ви виждат.',
    cameraOff: 'Покажете лицето си',
    cameraOffTitle: 'Сложете камерата си върху тялото си, за хората в тази стая',
    cameraAsking: 'Пита се…',
    cameraDenied: 'Камерата е блокирана',
    cameraDeniedTitle:
      'Браузърът ви отказва камерата за този сайт. Разрешението е в адресната лента.',
    cameraMissing: 'Няма камера',
    cameraMissingTitle: 'Няма камера, до която браузърът да стигне оттук.',
    micOn: 'Изключете микрофона си',
    micOnPush: 'Изключете микрофона си — задръжте T, за да говорите',
    micOnTitle: 'Микрофонът ви е отворен. Хората близо до вас ви чуват.',
    micOnPushTitle:
      'Микрофонът ви е готов. Задръжте T, за да говорите; иначе не се изпраща нищо.',
    micOff: 'Нека ви чуват',
    micOffTitle: 'Нека хората близо до вас ви чуват. Гласът избледнява с разстоянието.',
    micDenied: 'Микрофонът е блокиран',
    micDeniedTitle:
      'Браузърът ви отказва микрофона за този сайт. Разрешението е в адресната лента.',
    micMissing: 'Няма микрофон',
    micMissingTitle: 'Няма микрофон, до който браузърът да стигне оттук.',
    layingFloor: 'Полага се подът…',
    generateFloor: 'Направи тревен под {n}×{n}',
    floorNote: '{blocks} блока като ~16 събития, центрирани в началото.',
  },

  combat: {
    health: 'Здраве',
    dash: 'Засилване',
    kick: 'Ритник',
    charging: 'зарежда се…',
    ready: 'готово',
    wentDown: 'Паднахте',
    lava: 'Изгоряхте в лавата.',
    byPlayer: '{name} ви повали.',
    takenOut: 'Извадени сте.',
    respawn: 'Възраждане',
    respawnNote: 'Обратно в началната точка, недосегаеми за {n}с.',
    outOfThisOne: 'Този път сте вън. Останете и гледайте как свършва.',
    kickoffIn: 'Начало след',
    hostStalled: 'Домакинът не отговаря — топката е замразена',
  },

  image: {
    heading: 'Изображение',
    done: 'Готово',
    move: 'Премести',
    turn: 'Завърти',
    size: 'Размер',
    delete: 'Изтрий',
    working: 'Изпълнява се…',
    refused: 'Тази промяна беше отказана',
    uploadFailed: 'Изображението не можа да се качи',
    networkError: 'Мрежова грешка при качването',
  },

  world: {
    nameArena: 'Наименувайте тази арена',
    layFailed: 'Този свят не можа да бъде положен',
    emptyFailed: 'Този свят не можа да бъде изпразнен',
    stopDancing: 'Спри',
  },

  picker: {
    closePicker: 'Затвори избора на блокове',
    dialog: 'Блокове и светове',
    close: 'Затвори',
    tabs: { blocks: 'Блокове', goals: 'Цели', spawn: 'Пристигане', worlds: 'Светове' },
    groups: { terrain: 'Терен', colour: 'Цвят', props: 'Реквизит' },
    blocks: {
      dirt: 'Пръст',
      dirt_with_grass: 'Пръст с трева',
      dirt_with_snow: 'Пръст със сняг',
      grass: 'Трева',
      grass_with_snow: 'Трева със сняг',
      sand_with_grass: 'Пясък с трева',
      sand_with_snow: 'Пясък със сняг',
      snow: 'Сняг',
      gravel: 'Чакъл',
      gravel_with_grass: 'Чакъл с трева',
      gravel_with_snow: 'Чакъл със сняг',
      stone: 'Камък',
      stone_dark: 'Тъмен камък',
      stone_with_copper: 'Камък с мед',
      stone_with_gold: 'Камък със злато',
      stone_with_silver: 'Камък със сребро',
      wood: 'Дървесина',
      metal: 'Метал',
      metalframe: 'Метална рамка',
      glass: 'Стъкло',
      hay: 'Сено',
      lava: 'Лава',
      water: 'Вода',
      prototype: 'Прототип',
      bricks_A: 'Тухли A',
      bricks_B: 'Тухли B',
      sand_A: 'Пясък A',
      sand_B: 'Пясък B',
      colored_block_blue: 'Цветен блок, син',
      colored_block_green: 'Цветен блок, зелен',
      colored_block_red: 'Цветен блок, червен',
      colored_block_yellow: 'Цветен блок, жълт',
      decorative_block_blue: 'Декоративен блок, син',
      decorative_block_green: 'Декоративен блок, зелен',
      decorative_block_red: 'Декоративен блок, червен',
      decorative_block_yellow: 'Декоративен блок, жълт',
      striped_block_blue: 'Раиран блок, син',
      striped_block_green: 'Раиран блок, зелен',
      striped_block_red: 'Раиран блок, червен',
      striped_block_yellow: 'Раиран блок, жълт',
      anvil: 'Наковалня',
      apple: 'Ябълка',
      barrel: 'Бъчва',
      battery: 'Батерия',
      chest: 'Сандък',
      computer: 'Компютър',
      crate: 'Каса',
      dynamite: 'Динамит',
      gift: 'Подарък',
      hay_bale: 'Бала сено',
      melon: 'Диня',
      pipe: 'Тръба',
      trashcan: 'Кофа за боклук',
      tree: 'Дърво',
      tree_with_snow: 'Дърво със сняг',
      books_A: 'Книги A',
      books_B: 'Книги B',
      vault: 'Трезор',
    },
    searchPlaceholder: 'Търсене на блокове…',
    searchLabel: 'Търсене на блокове',
    tapToChange: 'Докоснете, за да смените',
    pressE: 'Натиснете E',

    templates: {
      pitch: {
        name: 'Футболно игрище',
        blurb: 'Оградено, разчертано, по една врата на всеки край. Готово за начален удар.',
      },
      race: {
        name: 'Състезателна писта',
        blurb: 'Шестнайсет платформи над водата, със стартова и финална врата.',
      },
      cage: { name: 'Клетка за дуели', blurb: 'Кръгла оградена яма. Без врати, няма къде да бягаш.' },
      club: { name: 'Клубът', blurb: 'Тъмна зала, осветен дансинг, кабина и бар.' },
      'living-room': {
        name: 'Всекидневна',
        blurb: 'Диван, килим, телевизор, библиотека. Стая в мащаба на един разговор.',
      },
      'demo-island': {
        name: 'Демо остров',
        blurb: 'Островът от публичното демо: площад, фонтан, сцена и дървета.',
      },
      flats: {
        name: 'Равна земя',
        blurb: 'Гол под {n}×{n}, центриран в началото. Постройте го сами.',
      },
    },
    startWorld: 'Започни свят',
    startWorldNote: 'Всеки от тези първо изчиства каквото е тук. Логът пази историята.',
    default: 'по подразбиране',
    confirmLay: 'Всичко построено тук си отива. Сигурни ли сте?',
    cancel: 'Отказ',
    laying: 'Полага се…',
    layIt: 'Положи го',
    working: 'Изпълнява се…',
    useThis: 'Използвай това',
    empty: 'Празно',
    confirmEmpty: 'Всичко построено тук си отива и нищо не го заменя. Сигурни ли сте?',
    emptyBlurb: 'Гола земя, и тя махната. Няма на какво да стъпите, докато не построите.',
    clearing: 'Изчиства се…',
    emptyIt: 'Изпразни го',

    arenas: 'Запазени арени',
    arenasNote:
      'И в двете посоки са копия — запазването пази лоунджа, зареждането пази арената.',
    findArena: 'Намерете арена по име…',
    findArenaLabel: 'Намерете арена по име',
    replaceTitle: 'Замени този свят с „{name}“',
    load: 'Зареди',
    noMatches: 'Нищо не съвпада с „{query}“.',
    nothingSaved: 'Още нищо не е запазено. Постройте нещо и после го задръжте.',
    saveArena: 'Запази този свят като арена',

    elsewhere: 'Някъде другаде',
    elsewhereNote:
      'Места, построени от други хора — арени, игрища, сборни точки. Каквото вземете, пристига като ваше собствено бойно поле, така че тази стая си остава каквато е.',
    discover: 'Открий светове →',

    marks: 'Знаци',
    marksNote:
      'Поставят се там, където стоите. Червеното брани своето; синьото бележи в него. Едно състезание иска старт, на който да се строите, и финал, през който да минете.',
    kinds: { red: 'червена врата', blue: 'синя врата', start: 'старт', finish: 'финал' },
    noMarks:
      'Още няма знаци — футболът иска врата на всеки край, състезанието — старт и финал.',
    standing: 'Поставят се…',
    standBoth: 'Постави и двете врати',
    standBothNote:
      'Една червена и една синя, една срещу друга през средата на света. Нищо друго не се пипа — игрището в таб Светове е онова, което първо изчиства. Пистата се полага на ръка: идете до линията и поставете старт, после минете пистата и поставете финал.',
    changeMark: 'Смени какъв е този знак',
    turnMark: 'Завърти го на четвърт',
    removeMark: 'Махни го',
    narrower: 'По-тясно {axis}',
    wider: 'По-широко {axis}',

    arrival: 'Пристигане',
    arrivalNote:
      'Където се появяват хората, когато влязат в този свят. Няма нищо общо със стартовата линия на състезание — тя е знак и живее под Цели.',
    arriveAt: 'Пристигат на {x}, {z} — пръстенът на пода.',
    arriveMiddle: 'Пристигат в средата на света.',
    movingDoor: 'Вратата се мести…',
    arriveHere: 'Пристигане там, където стоя',
    backToMiddle: 'Обратно в средата',
    arrivalHint:
      'Първо затворете избора и идете някъде — вратата ляга на клетката под краката ви. Всички, които пристигат наведнъж, се разпръсват около нея, така че място с простор е по-добро от врата.',
    showRing: 'Покажи пръстена на пода',
    forEveryone: '(за всички)',
  },

  dock: {
    emotes: 'Жестове',
    emotesTitle: 'Жестове (Z)',
    openEmotes: 'Отвори жестовете',
    closeEmotes: 'Затвори жестовете',
    chat: 'Чат',
    mirror: 'Погледнете себе си',
    mirrorOn: 'вкл.',
    peep: 'Смяна на пийпа',
    skin: 'Скинове',
    peepLabel: 'Пийпове',
    emoteNumber: 'Жест {n}',
    say: 'Кажете нещо',
    message: 'Съобщение',
    send: 'Изпрати',

    creatures: 'Създания',
    openCreatures: 'Отвори създанията',
    closeCreatures: 'Затвори създанията',
    letGoOf: 'Пусни {name}',
    letGo: 'пусни',
    full: 'Тук няма място за още едно.',
    theyWander: 'Сами ще си намерят пътя наоколо.',
    adopt: 'Осинови създание',

    driftOn: 'Вземи управлението обратно',
    driftOff: 'Остави тялото си да се скита',
    driftOnTitle: 'Скита се — мръднете, за да поемете',
    driftOffTitle: 'Да се скита само',

    someone: 'Някой',
    noEcho: 'без ехо',
    perfTitle:
      'Кадровата честота на тази стая, трафикът и времето за отиване и връщане, измерени във вашия собствен браузър през последните петнайсет секунди. Отиването и връщането е съобщение до друг играч и обратно, засечено по часовника на тази машина.',
  },

  door: {
    open: 'Отворена',
    knock: 'Чука се',
    closed: 'Затворена',
    openHint: 'Всеки в спейса може да влезе.',
    knockHint: 'Те питат, вие отговаряте.',
    closedHint: 'Никой не влиза и никой не може да пита.',
    whoMayComeIn: 'Кой може да влиза',

    walkingUp: 'Върви се по пътеката…',
    walkingUpBody: 'Търси се {place} на {name}.',
    knocking: 'Чука се…',
    knockingBody: '{name} е попитан. Трябва да е на вратата, за да отговори.',
    nobodyHome: 'Няма никого',
    nobodyHomeBody:
      '{name} не е тук в момента, така че няма кой да ви пусне. Може да изчакате - ако се появи, ще почукате отново автоматично.',
    notNow: 'Не сега',
    notNowBody: '{name} ви върна.',
    bolted: 'Вратата е залостена',
    boltedBody: '{name} е затворил дома си, така че няма дори на какво да се почука.',
    shownOut: 'Изпратени навън',
    shownOutBody: '{name} ви помоли да си тръгнете.',
    unreachable: 'Вратата не можа да бъде достигната',
    unreachableBody: 'Връзката с този спейс се провали. Презареждането обикновено оправя нещата.',
    knockAgain: 'Почукайте пак',
    goToYourOwn: 'Идете в собствената си {place}',

    theirs: { cafe: 'кафене', home: 'къща', outdoor: 'градина' },
    yourOwn: { cafe: 'кафене', home: 'къща', outdoor: 'градина' },
  },

  showcase: {
    tapEnter: 'Докоснете, за да влезете',
    touchLines: [
      'Влачене за оглеждане · стик за движение',
      '▲▼ летене · Постави / Счупи за строеж',
      'Докоснете блока горе, за да смените блока',
    ],
    clickEnter: 'Щракнете, за да влезете в лоунджа',
    mouseLines: [
      'WASD движение · Space нагоре · Ctrl надолу · Shift спринт',
      'Десен бутон поставя · ляв бутон чупи',
    ],
    chooseLead: '',
    chooseTail: ' за избор на блок · Esc за излизане',
  },

  vr: {
    enter: 'Влез във VR',
    noSession: 'Очилата не започнаха сесия.',
    sticks: 'Левият стик върви, десният завърта.',
    triggers: 'Спусъкът чупи блок, хватката поставя.',
  },
}

const DICTS: Record<Locale, WorldDict> = { en: WORLD_EN, de: WORLD_DE, bg: WORLD_BG }

export function worldDict(locale: Locale): WorldDict {
  return DICTS[locale]
}
