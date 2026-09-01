import type { Assign, Finish, Mode, Preset, Sides } from '@kxb/xp'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The words the level editor is written in.
 *
 * Its own module rather than a section of `./xp`, and the reason is what a
 * player downloads: the runtime is on `/xp/[id]`, on `/lobby`, in a match room
 * and inside the editor's own try-out, and none of those has any use for the
 * name of a gizmo handle. One dictionary would put every panel's copy in every
 * player's bundle.
 *
 * ---------------------------------------------------------------------------
 * What stays English, and why it is not laziness
 * ---------------------------------------------------------------------------
 * The format's own vocabulary. `backend.needs`, `player.keys`, `freestyle`,
 * `proto/Primitive_Floor`, the name of a `does`, the id of a pack: these are
 * what somebody types into a document, searches a file for, or says to whoever
 * wrote it. A German name for `placements` is a name nothing else in the
 * project answers to - and the editor writes a file that is read by a parser
 * with no locale.
 *
 * What is translated is every sentence *about* those things, which is most of
 * this file: an editor's panels are mostly explanation.
 */
export interface XpEditorDict {
  /** The frame: the rail, the title bar, the toolbar, the model picker. */
  chrome: {
    toolWindows: string
    projectName: string
    rename: string
    /** The one line under the viewport. Keycaps stay as they are. */
    viewportHint: string
    /**
     * Each tool window, as the rail's tooltip and the tab's title.
     *
     * A partial record because both readers index it with a plain `string` -
     * the rail is handed a `ToolWindow[]` and `show` takes whatever panel a
     * link asks for - and a miss falls back to the English the table carries.
     */
    windows: Readonly<Record<string, string | undefined>>
  }

  /**
   * The Tools panel: everything *about* a tool rather than which one is held.
   *
   * `y`, `Q`, `W` and `R` are not in here. They are the axis the format stores
   * and the keys under the reader's own fingers.
   */
  tools: {
    level: string
    levelHint: string
    /** `{y}` is the height the floor sits at. */
    groundAt: string
    groundHint: string
    fallingRestarts: string
    fallingRestartsHint: string
    fallingKills: string
    fallingKillsHint: string

    background: string
    transparent: string
    backgroundHint: string

    snap: string
    snapOff: string
    snapFree: string
    /** `{step}` is a fraction of a cell. */
    snapStep: string
    snapHint: string

    /** `{n}` is the angle in degrees. */
    turn: string
    rotate: string
  }

  /** The two panels that look alike, and the line telling them apart. */
  legend: {
    /** `{scenery}` is drawn in its own span. */
    modelLead: string
    scenery: string
    modelTail: string
    /** The Blueprints panel's own line. `{thing}` is in its own span. */
    blueprintLead: string
    aThing: string
    blueprintTail: string

    /** Under the model picker: how two models become one. `parts` is a span. */
    joinedLead: string
    parts: string
    joinedTail: string
    toBlueprints: string
  }

  /** The model picker, which is a drawer rather than a panel. */
  picker: {
    models: string
    hide: string
    pick: string
    settings: string
    searchPlaceholder: string
    noPacks: string
    nothingMatches: string
    /** `{n}` tiles are being offered. */
    tiles: string
    /** `{n}` more than the first page. */
    showFirst: string
    showAll: string
    /** `{colour}` is a colour name. */
    showInColour: string
    /** `{n}` things in the level are made of this model. */
    usedBy: string
    add: string
    remove: string
    holdThis: string
    /** `{pack}` is a pack's name. */
    addAndHold: string
    /** `{name}`, then its size in cells. */
    tileTitle: string
    inUse: string
    /** `Packs` is the panel's own name and stays as it is. */
    packs: string
    /** `{n}` declared of `{of}` there are. */
    packsCount: string
  }

  /** The Document window: what this level is, and what is in it. */
  document: {
    called: string
    calledLabel: string
    about: string
    aboutLabel: string
    aboutPlaceholder: string

    /** The counts down the left of the panel. Format words, so mostly nouns. */
    counts: Record<
      | 'placements'
      | 'distinctModels'
      | 'entities'
      | 'blueprints'
      | 'marks'
      | 'capabilities'
      | 'packs'
      | 'player',
      string
    >
    /** The line beside `distinct models`, which is the only one that argues. */
    drawCalls: string
    builtInDummy: string

    /** What the panel flags, or that it has nothing to flag. */
    nothingToFlag: string
    noPlacements: string
    noMarks: string
    /** `{n}` entities have no name. */
    unnamedOne: string
    unnamedMany: string
    /** `{n}` spawns are in mid-air. */
    airborneOne: string
    airborneMany: string
  }

  /** The mode block: what game this is, and who is on which side. */
  mode: {
    heading: string
    /**
     * The two axes, each with its own small heading.
     *
     * They were one list and it did not fit - see `MODES` in the format. The
     * headings are what tells an author that the second row is not more of the
     * first: *what this is* above *what you do in it*.
     */
    modeHeading: string
    styleHeading: string
    /**
     * The shelf finish, which is the one control in this panel that changes
     * nothing about how the level plays.
     */
    finishHeading: string
    finishes: Record<Finish, string>
    /** The shell's colour, which is a hue and not a colour picker. */
    colourHeading: string
    colourAuto: string
    /** The three names as the buttons print them, and the line under each. */
    modes: Record<Mode, string>
    modeBlurbs: Record<Mode, string>
    /**
     * The five mode names as the buttons print them.
     *
     * The *sentence* under each is `xpDict.presets`, not here: the battle
     * wizard prints the same five, and one table is what stops the editor and
     * the wizard describing a mode two different ways.
     *
     * The names themselves stay as the format writes them. `freestyle` is what
     * a document says and what an author would search a file for.
     */
    presets: Record<Preset, string>
    /** The short form beside each side, as the mode picker words them. */
    sides: Record<Sides, string>
    /** The line under each, from `describeSides`. */
    sideBlurbs: Record<Sides, string>
    /** And under each way onto a side, from `describeAssign`. */
    assign: Record<Assign, string>

    firstTo: string
    noScoreLimit: string
    seconds: string
    noClock: string
    downFor: string
    straightBackUp: string

    players: string
    needs: string
    anybody: string
    holds: string
    /** The placeholder on `holds`. `{n}` is the format's own ceiling. */
    upTo: string

    sidesHeading: string
    /** Follows the sentence describing the shape, when nothing was declared. */
    readOffTheMarks: string
    /** The four ways onto a side, as the button faces. */
    assignNames: Record<Assign, string>

    /** Why a preset cannot be picked. */
    needsGoals: string
    needsStartFinish: string
    needsSpawns: string
    needsSomething: string
    needsTeamNames: string

    nothingToHandOut: string
    matchNamesTheOne: string
    nobodyOnASide: string

    /** `{min}` and `{max}`, and what the seats do to them. */
    forExactly: string
    forAnybody: string
    forRange: string
    /** `{said}` is one of the three above, `{seats}` the number of seats. */
    seatsSpare: string
    seatsExactly: string
  }

  /**
   * The Properties panel, and the Scene tree beside it.
   *
   * The field names a document stores stay as they are — `x`, `y`, `z`,
   * `collider`, the id of a mark kind. What is translated is every label a
   * person reads and every sentence explaining one.
   */
  inspector: {
    /** The Scene tree's four sections, each with a count beside it. */
    things: string
    thingsEmpty: string
    built: string
    builtEmpty: string
    /** `{n}` distinct models, said under the list. */
    distinctModels: string
    marks: string
    marksEmpty: string
    /** `{n}` models or one. */
    modelOne: string
    modelMany: string

    makeBlueprint: string
    makeBlueprintTitle: string
    /** `{kind}` is a mark kind, which is a format word. */
    putMark: string
    landsUnderPointer: string

    /** The panel itself. */
    heading: string
    nothingSelected: string
    delete: string
    name: string
    unnamed: string
    turn: string
    scale: string
    turnAround: string
    /** The two pivots, and what each does. */
    pivots: Record<'centre' | 'origin', string>
    spinsWhereItStands: string
    spinsAboutOrigin: string

    /** A mark. */
    mark: string
    kind: string
    facing: string
    width: string
    height: string
    team: string
    nobodys: string
    spawnBlurb: string
    goalBlurb: string

    /** The player, and what they arrive as. */
    player: string
    body: string
    noBlueprints: string
    everybodyIs: string
    playerSpawnBlurb: string
    /** `{marks}` names how many spawn marks win instead. */
    playerMarksBlurb: string
    wears: string
    /** The four things a player may wear. */
    looks: Record<'dummy' | 'profile' | 'random' | 'peep' | 'xp' | 'choose', string>
    theBodyAbove: string
    builtInDummy: string
    wearsProfile: string
    wearsRandom: string
    wearsBody: string
    wearsDummy: string
    /** The three that name one of a player's two bodies. */
    wearsPeep: string
    wearsXp: string
    wearsChoose: string

    /** How the level moves underfoot - the six numbers and the warning. */
    movement: string
    moveSpeed: string
    moveSprint: string
    moveJump: string
    moveGravity: string
    moveAcceleration: string
    moveDrag: string
    movementBlurb: string

    holding: string
    nothing: string
    avatarAt: string
    inHand: string
    theHandItFinds: string
    weaponBlurb: string
    notTheAvatar: string
    inTheHand: string
    reset: string
    size: string
    handHintLead: string
    handHintTail: string

    /** The level's own keys. */
    keys: string
    addKey: string
    keysBlurb: string
    pressAKey: string
    pressAKeyToBind: string
    whatItDoes: string
    nameIt: string
    wait: string
    /** `{n}` is the ceiling in seconds. */
    waitTitle: string
    unbind: string

    /** How a thing is built and how it collides. */
    architecture: string
    collidesAs: string
    /** `{n}` boxes are drawn in the document. */
    drawnBoxes: string
    measuredShape: string
    walkThrough: string
    drawnBlurb: string
    measuredBlurb: string
    /** Around a `<code>collider</code>`, which stays as it is. */
    colliderLead: string
    colliderTail: string

    pitch: string
    roll: string
    tiltBlurbLead: string
    itsOwn: string
    tiltBlurbTail: string

    /** The two blueprints with a form of their own. */
    savePoint: string
    order: string
    savePointBlurb: string
    sign: string
    whatItSays: string
    textColour: string
    plate: string
    plateColour: string

    hangsFrom: string
    nothingToHangFrom: string
    nothingTheLevel: string
    itsOrigin: string
    noSockets: string
    hangsBlurbLead: string
    relativeToIt: string
    hangsBlurbTail: string

    dragHint: string
    dragFooter: string
    /** The bar beside the square, which is height. */
    dragHeightHint: string
  }

  /**
   * The Blueprints panel: a kind of thing, rather than a thing.
   *
   * `self.intensity`, `self.speed`, `turn`, `spin`, `swing`, `shake` and every
   * tag stay as they are - a script names them and the format stores them.
   */
  blueprints: {
    heading: string
    cancel: string
    new: string
    blurb: string
    /** `{name}` is the blueprint being made. */
    newName: string
    add: string
    noneYet: string

    /** The four ready-made ones. Their `name` is what the document stores. */
    starters: Record<'checkpoint' | 'player' | 'enemy' | 'peep', { label: string; blurb: string }>

    model: string
    seenAtPlay: string
    skeleton: string
    avatar: string
    peep: string

    pose: string
    howeverItStands: string
    poseBlurb: string
    spin: string
    angle: string
    or: string

    motions: string
    open: string
    addMotion: string
    motionsBlurbLead: string
    play: string
    loop: string
    looping: string
    waitStep: string
    seconds: string
    removeStep: string
    addStep: string
    /** Four verbs in their own spans, then the sentence around them. */
    stepBlurbTurn: string
    stepBlurbSpin: string
    stepBlurbSwing: string
    stepBlurbAnd: string
    stepBlurbShake: string

    light: string
    bright: string
    reach: string
    /** Around three `self.*` names and a count of lights. */
    lightBlurbLead: string
    lightBlurbTail: string

    physics: string
    physicsOn: string
    physicsOff: string
    collidesAs: string

    tags: string
    addATag: string
    orANew: string
    addTag: string

    script: string
    noScript: string
    scriptBlurb: string

    properties: string
    addProperty: string
    rename: string
    delete: string

    parts: string
    addPart: string
    oneModel: string
    addAnother: string
    partsBlurb: string
    on: string
    removePart: string
    name: string
    unnamed: string
    hangsFrom: string
    theBlueprintItself: string
    atSocket: string
    itsOrigin: string
    turn: string
    scale: string
    partModel: string

    alreadyABlueprint: string
    nameRules: string
    drawn: string
    aPlaceOnly: string
    neverDrawnLead: string
    spinPropBlurbLead: string
    spinPropBlurbTail: string
    degreesASecond: string
    degrees: string
    lightBlurbMid: string
    boxMeasured: string
    walkStraightThrough: string
    noScriptsYet: string
  }

  /**
   * The Behaviour panel: when a thing fires, what it asks first, what it does.
   *
   * Every trigger name and every verb - `enter`, `damaged`, `teleport`, `emit`
   * - stays as the format spells it. Those are what a rule matches on and what
   * a script emits, and the vocabulary is the same file in every language.
   */
  behaviour: {
    heading: string
    addRule: string
    /** `{n}` rules on a blueprint. */
    ruleOne: string
    ruleMany: string
    noRules: string
    pickABlueprint: string
    /** A rule that can never fire, because the level has no mode. */
    neverFires: string

    on: string
    when: string
    do: string
    deleteRule: string
    addVerb: string
    /** Around `name` and `finish`, both drawn in their own spans. */
    destinationLead: string
    destinationName: string
    destinationMid: string
    destinationFinish: string
    destinationTail: string

    nothingBound: string
    key: string
    within: string
    cells: string
    anyDistance: string
    compareToNumber: string

    upTo: string
    noMotions: string
    /** When a rule wants to play a cut and the level has none. */
    noCuts: string
    wholeBody: string
    event: string
    untilTold: string
    untilToldTitle: string
    socket: string
    socketTitle: string
    removeVerb: string
    nameItWillHave: string
    pickExisting: string
    list: string

    noBlueprintsYet: string
    /** Suffixes on an option that cannot be picked yet. */
    bindAKeyFirst: string
    addAFieldFirst: string
    noDataToCompare: string
    compareToSomethingKept: string
    aNameNotPlaced: string
    aRoomHere: string
    anotherXp: string
    /** `main` is the format's own name for the root room. */
    theFrontRoom: string
    aRoomInThisLevel: string
    whichRoomTitle: string
    whichXpTitle: string

    /** The table's verbs: roll, advance, sit, meet, pass, raid. */
    sides: string
    by: string
    along: string
    alongTitle: string
    bump: string
    bumpTitle: string
    aSide: string
    aSideTitle: string
    tablesOwn: string
    tablesOwnTitle: string
    passNote: string
    raidNote: string
  }

  /**
   * The animator: a body on a stage, a strip of keys, and a library of clips.
   *
   * The bone *names* are not here. `spine`, `upperarm.l`, `wing-left` are what
   * a clip's channels are keyed by and what a GLB names its nodes - the whole
   * of `rig.ts` is a note about how every lookup in this editor is by name.
   * Their labels are, because a label is only ever read.
   */
  animator: {
    /** The two rigs, and the parts of a body. */
    rigs: Record<'dummy' | 'peepz', string>
    /** By bone name, which stays as the format spells it. */
    bones: Record<string, string>
    groups: Record<'torso' | 'arms' | 'legs' | 'tail' | 'wings' | 'body', string>

    /** The stage. */
    /** The line above the animator when it is docked. `Save to level` is a span. */
    dockLead: string
    dockSaveToLevel: string
    dockTail: string
    /**
     * One button, two words: it fills the dock with the animator, then puts the
     * layout back. Only one is ever on screen - see xp/_editor/shell/fill.
     */
    fill: string
    normalize: string
    stageHint: string
    /** The held-thing panel: the document's player.weapon, edited in view. */
    holdsTitle: string
    holdsHint: string
    holdsWhat: string
    holdsNothing: string
    holdsScale: string
    /** The thumb pad that moves the selected joint on a touch screen. */
    movePad: string
    /**
     * The knob beside it, which is the same gesture held to world up. `{bone}`
     * is a bone's label; `liftLocked` is what it says when the axis lock is on
     * some other axis and the knob can therefore do nothing.
     */
    liftKnob: string
    liftLocked: string
    oneFingerToCamera: string
    look: string
    /** The axis lock. `X`, `Y` and `Z` are axes and stay as they are. */
    lockFree: string
    lockTitle: string
    lockAxisTitle: string
    lockHint: string
    floor: string
    body: string
    model: string
    bones_: string
    /** The one line under each panel's title. */
    bodyHint: string
    clipsHint: string
    movesHint: string
    levelHint: string
    /** `{n}` clips in the collection. */
    saveNToLevel: string
    oneFrame: string
    undoRedoDepth: string
    /** `{bone}` is a bone's label. */
    straighten: string
    /** `{bone}` again, for the pin toggle. */
    pin: string
    unpin: string

    /** The clip being edited. */
    clips: string
    newClip: string
    copyClip: string
    clip: string
    name: string
    fps: string
    lengthSeconds: string
    easeOut: string
    dragItsDot: string
    pickADot: string

    /** The ready-made moves. */
    moves: string
    speed: string
    movesBlurb: string
    /**
     * By rig and then preset id.
     *
     * Two levels because the ids collide on purpose: both rigs have a `walk`,
     * and a dummy's walk is legs and a peep's is legs and a roll. One flat map
     * would have to rename one of them, and the id is what `presetsFor`
     * returns and what an author sees in a file.
     */
    presets: Record<'dummy' | 'peepz', Record<string, { label: string; hint: string }>>

    pose: string
    copyKey: string
    pasteKey: string
    backToRest: string
    poseBlurb: string

    save: string
    saveWork: string
    open: string
    /** Around a `.animation.json`, which is a filename. */
    fileBlurbLead: string
    fileBlurbTail: string
    level: string
    saveToLevel: string
    nothingInLevel: string
    /** `{kb}` is a rough size, `{n}` how many clips. */
    savedAsSamples: string

    shortcuts: string
    playOrPause: string
    keyThePose: string
    removeTheKey: string
    nextOrPrevious: string
    backToStart: string
    copyAndPaste: string
    moveAlongFloor: string

    pasteInstead: string
    apply: string
    undo: string
    redo: string
    previousKey: string
    nextKey: string
    autoKey: string
    loop: string

    /** What it says after a save, an open, or a stamp. */
    notes: {
      /** `{what}` is a clip name or a list of them. */
      nothingToSaveOne: string
      nothingToSaveMany: string
      /** `{n}` clips saved, `{skipped}` a tail or empty. */
      savedOne: string
      savedMany: string
      skippedOne: string
      skippedMany: string
      /** `{name}`, `{many}` (" of 3" or empty), `{keys}`, and the version pair. */
      /** `{n}` other clips are in the same file. */
      openedOld: string
      opened: string
      /** ` of {n}`, appended to a clip's name when a file holds several. */
      ofMany: string
      /** `{preset}` lowercased, `{at}` and `{length}` in seconds. */
      stamped: string
    }
  }

  /** The round a level describes: its phases, and what moves between them. */
  /** The Scenes list in the Document panel: the places this level holds. */
  scenes: {
    heading: string
    lead: string
    /** What the root row says it is, so `main` reads as a place and not a key. */
    theLevelItself: string
    rename: string
    remove: string
    add: string
    namePlaceholder: string
    /** What a name may be, said before the refusal rather than after it. */
    nameRule: string
    /** The gesture that opens a room, on every row that is not already open. */
    openIt: string
    /** And what the row you are standing in says instead. */
    standingHere: string
    /**
     * A way into that room, put down in this one.
     *
     * On the rows you are *not* standing in, because a door is a pair of rooms
     * and the one it leads out of is the one you are in.
     */
    door: string
    doorTitle: string
  }

  /**
   * Movies: the places that are shots, and the cuts made out of them.
   *
   * A section of the Document window rather than a window of its own, for the
   * reason the Places list is there: what is a shot and which cuts exist are
   * facts about the *file*, not about whatever is selected. The two are next to
   * each other because they are one thought - a shot is a place, and the list
   * of places is right above.
   */
  movies: {
    heading: string
    lead: string
    /** A new, empty stage. */
    newMovie: string
    newMovieTitle: string
    noMoviesYet: string
    /** Copying a room's set and cast into a movie. */
    importFrom: string
    importTitle: string
    /** And the button on a place that already is one. */
    openIt: string
    openItTitle: string
    /** How long a shot runs, printed on its row. */
    runsFor: string
    /** Taking a movie away, and the armed second press. */
    stopBeingAMovie: string
    stopSure: string
    /** The cuts. */
    cuts: string
    cutsLead: string
    addACut: string
    /** What a cut with no takes in it says instead of a length. */
    emptyCut: string
    takeCount: string
    takeCountOne: string
    openComposer: string
    openComposerTitle: string
    removeCut: string
    removeCutSure: string
    cutNamePlaceholder: string
    /** What the section says when nothing in the file is a shot yet. */
    nothingIsAShot: string
    /** And why a cut cannot be made yet. */
    needAShotFirst: string
  }

  /** The full-screen movie editor, and the composer beside it. */
  movie: {
    /** The chip in the corner saying which of the two this is. */
    editingAShot: string
    composing: string
    close: string
    closeTitle: string
    /** Transport. */
    play: string
    pause: string
    toStart: string
    /** The view picker: free look, the cut, or one camera. */
    view: string
    freeLook: string
    freeLookTitle: string
    theCut: string
    theCutTitle: string
    /** Cameras. */
    cameras: string
    addCamera: string
    addCameraTitle: string
    keyHere: string
    keyHereTitle: string
    cutHere: string
    cutHereTitle: string
    removeCamera: string
    ease: string
    easeTitle: string
    /** The actor list and what is keyed on the selected one. */
    cast: string
    nobodyNamed: string
    nobodyNamedLead: string
    selectAnActor: string
    key: string
    keyTitle: string
    clearKeys: string
    /** Cues. */
    plays: string
    playsTitle: string
    clip: string
    loop: string
    /** The shot's own numbers. */
    length: string
    rate: string
    backdrop: string
    backdropNone: string
    backdropColour: string
    backdropImage: string
    backdropSky: string
    backdropPath: string
    backdropNoneBlurb: string
    /** Export. */
    exportHeading: string
    saveFrame: string
    saveFrameTitle: string
    record: string
    recording: string
    stopRecording: string
    recordTitle: string
    cannotRecord: string
    droppedFrames: string
    ffmpegHint: string
    /** The composer. */
    shots: string
    addShot: string
    noShots: string
    trim: string
    speed: string
    removeTake: string
    copyTake: string
    copyTakeTitle: string
    /** Which take of how many, on the panel's own heading. */
    takeOf: string
    goToTakeTitle: string
    earlier: string
    later: string
    totalLength: string
    nothingAtThisMoment: string
    /** What a cut across places costs on the way into a file. */
    warmUpFirst: string
    /** Bringing somebody into the shot. */
    addActor: string
    addActorTitle: string
    theAvatar: string
    thePeepz: string
    theProps: string
    findAModel: string
    /** An empty handle, and what a body hangs off. */
    addEmpty: string
    addEmptyTitle: string
    hangsOff: string
    nothing: string
    /** Taking from a pack the level does not carry yet. */
    willAddPack: string
    /** The pack viewer, which takes the viewport. */
    packs: string
    packsTitle: string
    browsePacks: string
    orDragOne: string
    duplicate: string
    duplicateTitle: string
    theCamera: string
    headLooksAt: string
    aim: string
    aimTitle: string
    toolMove: string
    toolTurn: string
    toolSize: string
    sizeIsOne: string
    aMove: string
    aTurn: string
    aJump: string
    addMoveTitle: string
    addTurnTitle: string
    addJumpTitle: string
    nothingYet: string
    atForSeconds: string
    starts: string
    lasts: string
    facing: string
    howHigh: string
    loops: string
    dropActionTitle: string
    actionKinds: Record<'move' | 'turn' | 'jump' | 'play' | 'say', string>
    loopFrom: string
    loopFromTitle: string
    loopTo: string
    loopToTitle: string
    loopingRange: string
    loopOffTitle: string
    leavesAt: string
    easeNames: Record<'hold' | 'linear' | 'smooth', string>
    easeTitles: Record<'hold' | 'linear' | 'smooth', string>
    dropKeyTitle: string
    addToPick: string
    addToPickTitle: string
    showControls: string
    hideControls: string
    seeIt: string
    seeItTitle: string
    markASpan: string
    framings: string
    dropFramingTitle: string
    moments: string
    goToMoment: string
    dropMomentTitle: string
    lock: string
    lockTitle: string
    deleteActor: string
    deleteActorTitle: string
    deleteActorSure: string
    oneModel: string
    someModels: string
    andMore: string
    nothingMatches: string
    setIsBuiltInTheEditor: string
    /** The chips on the collapsed sections. */
    oneCamera: string
    someCameras: string
    oneActor: string
    someActors: string
    keyedCount: string
    shot: string
    /** The lane holding everything the cast does. */
    does: string
    /** The switch that decides what a slider means. */
    autoKey: string
    autoKeyTitle: string
    shownHere: string
    clearKeysSure: string
    /** Posing a body without leaving the frame. */
    pose: string
    cuePose: string
    cuePoseTitle: string
    clearPose: string
    poseIsSaved: string
    /** Out to the animator, for a body with bones. */
    animate: string
    animateTitle: string
    /** And what they say. */
    says: string
    saysTitle: string
    line: string
    forSeconds: string
    /** The two handles on a camera's nearest framing. */
    moveIt: string
    aimIt: string
    /** Its six numbers, and its lens. */
    stands: string
    looksAt: string
    lens: string
    /** The shape it is delivered in. */
    frame: string
  }

  flow: {
    /**
     * The picker at the top: which of the level's rounds is on screen.
     *
     * At the top because it changes what every other control in the panel
     * means, and a picker for that sitting below the thing it re-labels is a
     * picker people change by accident.
     */
    whichRound: string
    /** The button for the level's own round, and the line under it. */
    roundAny: string
    roundAnyBlurb: string
    /** And the line under a mode's own round. */
    roundModeBlurb: string
    /** The three modes, as this panel prints them. The Mode panel's words. */
    modes: Record<Mode, string>
    noRound: string
    startAFlow: string
    noRoundAtAll: string
    /** The armed second press before the block is thrown away. */
    noRoundSure: string
    /** The phase a round opens in. */
    theOpeningPhase: string
    /** The shapes a round usually has - see FLOW_STARTERS. */
    shapes: string
    shapesLead: string
    /** Keyed on `FlowStarterId`. */
    starters: Record<'live' | 'countdown' | 'match' | 'rounds' | 'board', { name: string; blurb: string }>
    current: string
    use: string
    /** Where a level may be played - the document's `capabilities`. */
    playedAs: string
    playedAsLead: string
    capabilities: Record<'freeplay' | 'match' | 'football' | 'competition', { name: string; blurb: string }>
    /** `{preset}` is the Mode preset that needs the capability. */
    presetLeansOn: string
    atLeastOne: string
    stages: string
    orBlank: string
    startOver: string
    startOverNote: string
    makeStart: string
    start: string
    aNewPhase: string
    add: string
    remove: string
    cancel: string
    unreachable: string

    allow: string
    /** The destinations that are not phases, in the arrow form's dropdown. */
    endsGroup: string
    goNextRound: string
    goEnd: string
    /** How many times the round is played. See `XpFlow.rounds`. */
    rounds: string
    roundsOnce: string
    roundsHint: string
    roundsNeedsSeam: string
    /** Whose phase it is - the label, the checkbox, and the note under it. */
    who: string
    whoTurn: string
    whoNote: string
    whatAPlayerCanDo: string
    everything: string
    noKeys: string
    says: string
    dragBetweenLead: string
    dragBetweenTail: string
    nothingOnEntering: string
    does: string
    addVerb: string
    noWayOut: string
    nothingLeaves: string
    whereThisArrowGoes: string
    anEventARuleEmits: string

    wins: string
    sayWhenItIsWon: string
    nothingStartsOver: string
    anEndingCounts: string
    endingNeedsRunLead: string
    neverEnds: string
    run: string
    /** The one field that needs a clock the room agrees on. */
    clockNote: string
    noData: string
    nothing: string
  }

  /** The scripts a level carries, and the console that runs one. */
  scripts: {
    heading: string
    blurb: string
    newName: string
    add: string
    cancel: string
    new: string
    alreadyAScript: string
    nameRules: string
    noneYet: string
    rename: string
    delete: string

    run: string
    notAttached: string
    /** `{n}` frames, which is one second of `world.time`. */
    frames: string
    ranAndSaidNothing: string
    runsOn: string
    noBlueprints: string
  }

  /** What a level keeps. */
  data: {
    heading: string
    /** Two halves, around a `world` that stays as the format spells it. */
    blurbLead: string
    world: string
    blurbTail: string
    noneYet: string
    newName: string
    add: string
    seenBy: string
    startsAt: string
    pressAgainToRemove: string
    removeThisField: string
    nameRules: string
    alreadyAField: string
    /** `{n}` is the ceiling. */
    full: string
  }

  /** The translation view. */
  words: {
    heading: string
    blurb: string
    noLanguages: string
    /** Ends on a `t('…')`, which is the call itself. */
    nothingToTranslateLead: string
    codeLabel: string
    codePlaceholder: string
    add: string
    /** `{code}` is a language code. */
    removeLanguage: string
    /** `{phrase}` is the English being translated. */
    inThisLanguage: string
    /** The three headings of the panel, and the key row. */
    language: string
    keys: string
    keysHint: string
    keyLabel: string
    keyPlaceholder: string
    addKey: string
    keyColumn: string
  }

  /** The shell: the title bar, the try-out, the log. */
  shell: {
    /** The red light, when the editor has somewhere to go back to. */
    leave: string
    /** The phone's title bar: the workspace menu, and the level's two heights. */
    menu: string
    moreLevel: string
    lessLevel: string
    goBackToDisk: string
    tryIt: string
    tryingIt: string
    asItStands: string
    /**
     * Which room is being tried, when it is not the level's own.
     *
     * Said because Try opens where you are *standing* rather than where the
     * level does, and the two disagree the moment a level has a second room -
     * so "why does this not look like my level" has an answer on screen.
     */
    tryingRoom: string
    stop: string
    undo: string
    redo: string
    saving: string
    save: string
    export: string
    log: string
    /** `{n}` lines were dropped off the front. */
    oldestDropped: string
    draft: string
    saved: string
    placements: string
    entities: string
    tools: string
    onDisk: string
    /** The brush, by tool id. Keycaps beside them stay as they are. */
    toolNames: Record<string, string | undefined>
    /** The three gizmo handles. */
    handles: Record<'translate' | 'rotate' | 'scale', string>
    viewport: string
  }

  /** Where the world is watched from. */
  camera: {
    heading: string
    kinds: Record<'follow' | 'side' | 'fixed', string>
    kindBlurbs: Record<'follow' | 'side' | 'fixed', string>
    /**
     * The field labels.
     *
     * `x`, `y`, `z`, `yaw°` and `pitch°` are absent on purpose: they are the
     * axes and angles the document stores, and every one of them is written the
     * same way in German.
     */
    runsAlong: string
    standOff: string
    cellsTall: string
    behind: string
    above: string
    beside: string
    lens: string
    sees: string
    aimedOneWay: string
    watchesThePlayer: string
    looksAtASpot: string
    staresOneWay: string
    turnsToWatch: string
    staresAtASpot: string
  }

  /** Whether anybody in the level may say anything. */
  talk: {
    heading: string
    chat: string
    emotes: string
    on: string
    off: string
    bothAllowed: string
    noFaces: string
    noChat: string
    quiet: string
    allowedNotPromised: string
  }
}

export const XP_EDITOR_EN: XpEditorDict = {
  chrome: {
    toolWindows: 'Tool windows',
    projectName: 'The name of this project',
    rename: 'Rename',
    viewportHint: 'drag to draw · right-drag to pan · R turn',
    windows: {
      scene: 'Scene',
      properties: 'Properties',
      model: 'Models',
      blueprints: 'Blueprints',
      tools: 'Tools',
      output: 'Document',
      words: 'Words',
      behaviour: 'Behaviour',
      data: 'Data',
      flow: 'Flow',
      scripts: 'Scripts',
      animator: 'Animator',
      movie: 'Movie',
    },
  },

  tools: {
    level: 'Level',
    levelHint: 'Q and W. Pointing at something uses its height instead.',
    groundAt: 'Ground at y = {y}',
    groundHint:
      'Somewhere to stand while a level is half built. Off, the bottom of the world is a catch forty cells down.',
    fallingRestarts: 'Falling starts you over',
    fallingRestartsHint:
      'What makes a platformer one. Off, a miss costs the walk back; on, it costs the run.',
    fallingKills: 'Falling kills you',
    fallingKillsHint:
      'A hole costs what the spikes cost - a life, and the respawn wait. Otherwise a level teaches two rules for one mistake.',

    background: 'Background',
    transparent: 'transparent',
    backgroundHint:
      'Empty shows the page behind the level. A name, a hex or an rgb() — whatever three.js reads.',

    snap: 'Snap',
    snapOff: 'off',
    snapFree: 'Free. The document still rounds to a tenth on the way in.',
    snapStep: '{step} of a cell',
    snapHint:
      'How far a gizmo handle moves between stops. A mark is always whole cells — that is what the format stores.',

    turn: 'Turn {n}°',
    rotate: 'Rotate — R',
  },

  legend: {
    modelLead: 'Drag one in and it is',
    scenery: 'scenery',
    modelTail: '— cells in the level, no name, nothing happens to it.',
    blueprintLead: 'Drag one in and it is',
    aThing: 'a thing',
    blueprintTail:
      '— named, with properties, and something can happen to it. Made of one model or several.',

    joinedLead: 'Several models joined — a base and a barrel — is one blueprint with',
    parts: 'parts',
    joinedTail: '. So is anything that has a name or has something happen to it.',
    toBlueprints: 'Blueprints →',
  },

  picker: {
    models: 'Models',
    hide: 'hide',
    pick: 'pick',
    settings: 'Picker settings',
    searchPlaceholder: 'wall, slope, stairs…',
    noPacks: 'no packs yet — open Packs',
    nothingMatches: 'nothing matches',
    tiles: '{n} tiles',
    showFirst: 'show the first {n}',
    showAll: '+{n} more — show them all',
    showInColour: 'Show platformer pieces in {colour}',
    usedBy: '{n} things in this level are made of it',
    add: 'add',
    remove: 'remove',
    holdThis: 'Hold this one',
    addAndHold: 'Add {pack} and hold this one',
    tileTitle: '{name} — {size} · drag into the level',
    inUse: 'in use ·',
    packs: 'Packs',
    packsCount: '{n} of {of}',
  },

  document: {
    called: 'Called',
    calledLabel: 'What this level is called',
    about: 'About',
    aboutLabel: 'What this level is, in a sentence',
    aboutPlaceholder: 'One sentence, for somebody deciding whether to open it.',

    counts: {
      placements: 'placements',
      distinctModels: 'distinct models',
      entities: 'entities',
      blueprints: 'blueprints',
      marks: 'marks',
      capabilities: 'capabilities',
      packs: 'packs',
      player: 'player',
    },
    drawCalls: 'draw calls follow this, not the count above',
    builtInDummy: 'the built-in dummy',

    nothingToFlag: 'Nothing to flag.',
    noPlacements: 'No placements - nothing to stand on.',
    noMarks: 'No marks. A match needs two spawns; a competition needs a start and a finish.',
    unnamedOne: '{n} unnamed entity - a rule cannot address them.',
    unnamedMany: '{n} unnamed entities - a rule cannot address them.',
    airborneOne: '{n} spawn has nothing underneath - somebody arrives in mid-air. Nudge it to land.',
    airborneMany:
      '{n} spawns have nothing underneath - somebody arrives in mid-air. Nudge them to land.',
  },

  mode: {
    heading: 'Mode',
    modeHeading: 'What this is',
    styleHeading: 'What you do in it',
    finishHeading: 'What its cartridge is made of',
    finishes: {
      plastic: 'plastic',
      shiny: 'shiny',
      metal: 'metal',
      rust: 'rust',
      glass: 'glass',
      rainbow: 'rainbow',
      galaxy: 'galaxy',
      neon: 'neon',
      hologram: 'hologram',
    },
    colourHeading: 'What colour it is',
    colourAuto: 'auto',
    modes: {
      space: 'Space',
      lobby: 'Lobby',
      battle: 'Battle',
    },
    modeBlurbs: {
      space: 'A place that is simply there. No round, nothing to win, and what happens in it stays.',
      lobby: 'Where people gather between rounds — and it can still keep score.',
      battle: 'A run: it starts, it ends, and what it counted goes with it.',
    },
    presets: {
      freestyle: 'freestyle',
      deathmatch: 'deathmatch',
      football: 'football',
      parkour: 'parkour',
      shooter: 'shooter',
    },
    sides: {
      ffa: 'all vs all',
      team: 'teams',
      'one-vs-all': '1 vs all',
    },
    sideBlurbs: {
      ffa: 'All against all - everybody for themselves, and no team spawns are read',
      team: 'Teams - the sides the spawn marks name, split by the setting below',
      'one-vs-all': 'One against everyone - a match names the one; on your own, nobody has a side',
    },
    assign: {
      spread:
        'Split the room across the sides, so a public room works with nobody organising it',
      order: 'Seat people in the order the room agrees on: the first side to the first player',
      host: 'Only a match may put somebody on a side; on their own, a player has none',
      claim: 'Everybody picks their own side, one person to each, and nobody may be moved',
    },

    firstTo: 'first to',
    noScoreLimit: 'no score limit',
    seconds: 'seconds',
    noClock: 'no clock',
    downFor: 'down for',
    straightBackUp: 'straight back up',

    players: 'Players',
    needs: 'needs',
    anybody: 'anybody',
    holds: 'holds',
    upTo: 'up to {n}',

    sidesHeading: 'Sides',
    readOffTheMarks: ' — read off the marks, because nothing was set',
    assignNames: { spread: 'spread', order: 'order', host: 'host', claim: 'claim' },

    needsGoals: 'needs a goal at each end',
    needsStartFinish: 'needs a start and a finish',
    needsSpawns: 'needs a spawn for each side',
    needsSomething: 'needs something this level does not have',
    needsTeamNames: 'needs two spawn marks with different team names',

    nothingToHandOut:
      'Nothing to hand out. Give two spawn marks different team names and this decides who gets which.',
    matchNamesTheOne:
      'A match names the one. Nothing here can pick them - that needs the roster, and the roster is not there on the shelf.',
    nobodyOnASide: 'Nobody is on a side, so the team spawns in this level are not read.',

    forExactly: 'For exactly {min}.',
    forAnybody: 'For anybody.',
    forRange: 'For {min} to {max}.',
    seatsSpare:
      '{said} There are {seats} seats and one player each, so {spare} of them would have nowhere to stand.',
    seatsExactly: '{said} {seats} seats, one player each.',
  },

  inspector: {
    things: 'Things ·',
    thingsEmpty:
      'Nothing yet. Entities are the things with names and rules — crates, pickups, karts. Walls are placements below.',
    built: 'Built ·',
    builtEmpty: 'Nothing built yet. Drag on the grid to lay a floor.',
    distinctModels: 'distinct models. Draw calls follow this number, not the piece count.',
    marks: 'Marks ·',
    marksEmpty:
      'None. A match needs a spawn for each side, football needs a goal at each end, and a run needs a start and a finish.',
    modelOne: 'model',
    modelMany: 'models',

    makeBlueprint: '→ make it a blueprint',
    makeBlueprintTitle: 'Make a kind of thing out of this piece, in its place',
    putMark: 'Put a {kind} mark where the pointer is',
    landsUnderPointer: 'Lands under the pointer, not at the origin.',

    heading: 'Properties',
    nothingSelected:
      'Nothing selected. Click something in the level, or a row in the Scene panel, and its numbers appear here.',
    delete: 'Delete',
    name: 'Name',
    unnamed: 'unnamed',
    turn: 'turn',
    scale: 'scale',
    turnAround: 'Turn around',
    pivots: { centre: 'Centre', origin: 'Origin' },
    spinsWhereItStands: 'Spins where it stands.',
    spinsAboutOrigin: 'Spins about the model’s own point — a door on its hinge.',

    mark: 'mark',
    kind: 'Kind',
    facing: 'facing',
    width: 'width',
    height: 'height',
    team: 'team',
    nobodys: "nobody's",
    spawnBlurb:
      'Where a side arrives. Two of these is what a match needs. y is whatever is underneath — a spawn stands on the ground.',
    goalBlurb: 'A frame, scorable from the side it faces. One scorable from both is not a goal.',

    player: 'Player',
    body: 'body',
    noBlueprints: 'No blueprints yet, so there is nothing to be but the dummy.',
    everybodyIs: 'everybody is',
    playerSpawnBlurb:
      'Where a person arrives, and which way they are looking. y is whatever is underneath — a spawn stands on the ground.',
    playerMarksBlurb:
      'Where a person arrives when no spawn mark says otherwise — this level has {marks}, so they win. Click the body to select the first of them.',
    wears: 'wears',
    looks: {
      dummy: 'dummy',
      profile: 'their own animal',
      random: 'a random animal',
      peep: 'their peep',
      xp: 'their XP body',
      choose: 'whichever they chose',
    },
    theBodyAbove: 'the body above',
    builtInDummy: 'the built-in dummy',
    wearsProfile:
      'Whichever animal each player picked in their profile. Anybody who has not picked one gets a random one rather than nothing.',
    wearsRandom:
      'An animal each, from their own id - so it is the same one on every screen and the same one tomorrow.',
    wearsBody: 'The body above, exactly as it is drawn.',
    wearsDummy: 'The prototype dummy, which is what a level that says nothing gets.',
    wearsPeep:
      'Their animal, whatever else they own - so a room full of animals stays one when somebody buys a body.',
    wearsXp:
      'The body they take into the games. Anybody without one is the dummy, which is what a player already is before they are anybody.',
    wearsChoose:
      'Neither: whichever of their two bodies they picked for themselves. The right answer for most levels.',

    movement: 'Movement',
    moveSpeed: 'walk',
    moveSprint: 'sprint',
    moveJump: 'jump',
    moveGravity: 'gravity',
    moveAcceleration: 'acceleration',
    moveDrag: 'drag',
    movementBlurb:
      'Walk and sprint in cells a second, jump in cells cleared, gravity in cells a second squared. Acceleration ramps the pace up and drag lets go of it — zero means instantly, which is the usual feel. A changed number wants its course driven, not measured.',

    holding: 'holding',
    nothing: 'nothing',
    avatarAt: 'avatar at',
    inHand: 'in hand',
    theHandItFinds: 'the hand it finds',
    weaponBlurb: 'A weapon reads its own damage and range as properties. Click to fire.',
    notTheAvatar: 'The body is not the avatar — whoever plays brings that.',
    inTheHand: 'In the hand',
    reset: 'Reset',
    size: 'size',
    /** `Try` is the button's own name and stays as it is. */
    handHintLead: 'Cells and degrees, from wherever the model’s own origin is. Press',
    handHintTail: 'to see it in the hand.',

    keys: 'Keys ·',
    addKey: '+ key',
    keysBlurb:
      'Moving, jumping and dancing work in every XP and cost nothing here. These are the level’s own — each one emits its name, and a rule decides what that means.',
    pressAKey: 'press a key',
    pressAKeyToBind: 'Press a key to bind it',
    whatItDoes: 'what it does',
    nameIt: 'name it',
    wait: 'wait',
    waitTitle: 'Seconds before this key works again, up to {n}. Blank for none.',
    unbind: 'Unbind',

    architecture:
      'Architecture, on the one-metre lattice — it rasterises into cells once and never moves. A thing that needs a name or a rule is an entity.',
    collidesAs: 'collides as',
    drawnBoxes: 'drawn · {n} boxes',
    measuredShape: 'measured shape',
    walkThrough: 'walk through',
    drawnBlurb:
      'Boxes drawn in the document, in the model’s own frame — they turn with it. Leaving this setting throws them away.',
    measuredBlurb:
      'The measured shape is the model voxelised at build time. Openings narrower than a metre do not survive it,',
    colliderLead: 'plus a',
    colliderTail: 'list in the JSON is the way to give one its doorway back.',

    pitch: 'pitch',
    roll: 'roll',
    tiltBlurbLead: 'Tilt in degrees, then how many times its own size along each of',
    itsOwn: 'its own',
    tiltBlurbTail:
      'axes. A tilted thing collides as the box around the tilt — bigger than it looks, never smaller.',

    savePoint: 'Save point',
    order: 'order',
    savePointBlurb:
      'Numbered as you place them. The highest reached wins, so crossing an earlier pad on a loop never sends you backwards — and two pads sharing a number leaves the second one unreachable.',
    sign: 'Sign',
    whatItSays: 'what it says',
    textColour: 'text colour',
    plate: 'plate',
    plateColour: 'plate colour',

    hangsFrom: 'Hangs from',
    nothingToHangFrom:
      'Nothing to hang from yet. Give another entity a name — a door hangs from a cabinet, and the cabinet has to be callable something first.',
    nothingTheLevel: 'nothing — the level',
    itsOrigin: 'its origin',
    noSockets: 'no sockets on it',
    hangsBlurbLead: 'x, y, z and turn are',
    relativeToIt: 'relative to it',
    hangsBlurbTail: 'now — and it carries this along when it moves.',

    dragHint: 'Drag to move it about the floor — Shift for finer',
    dragFooter: 'drag the floor · the bar is height · shift is finer',
    dragHeightHint: 'drag up and down for height',
  },

  blueprints: {
    heading: 'Blueprints ·',
    cancel: 'Cancel',
    new: 'New',
    blurb:
      'A blueprint is a kind of thing rather than a thing: every crate breaks the same way, so what breaks is written once here and each crate in the level is one of these. Drag a row into the viewport to put one down.',
    newName: 'crate',
    add: 'Add',
    noneYet: 'None yet. A level of nothing but walls needs none.',

    starters: {
      checkpoint: {
        label: '+ save point',
        blurb: 'Cross it and dying sends you back here rather than to the start.',
      },
      player: {
        label: '+ player',
        blurb: 'The body you arrive as — and the one thing a script can go on.',
      },
      peep: {
        label: '+ peep',
        blurb: 'Arrive as an animal instead. Same body, a different skeleton.',
      },
      enemy: {
        label: '+ enemy',
        blurb: 'Somebody to shoot: a body with health that scores when it goes down.',
      },
    },

    model: 'Model',
    seenAtPlay: 'Seen at play',
    skeleton: 'Skeleton',
    avatar: 'avatar',
    peep: 'peep',

    pose: 'Pose',
    howeverItStands: 'however it stands',
    poseBlurb:
      'Held while it is still. Walking, falling and being shot still look like themselves — this is the pose it comes back to.',
    spin: 'Spin',
    angle: 'angle',
    or: 'or',

    motions: 'Motions ·',
    open: 'open',
    addMotion: 'add',
    /** Ends on `play`, which is a verb the format spells and so stays put. */
    motionsBlurbLead:
      'A named sequence this thing can be told to run — a lid opening, a blade turning, a crate shaking. A rule plays one with',
    play: 'play',
    loop: 'loop',
    looping: ', looping',
    waitStep: '— wait —',
    seconds: 'seconds',
    removeStep: 'Remove step',
    addStep: '+ step',
    stepBlurbTurn: 'turn',
    stepBlurbSpin: 'goes to that angle and stays,',
    stepBlurbSwing: 'is degrees a second,',
    stepBlurbAnd: 'and',
    stepBlurbShake: 'come back.',

    light: 'Light',
    bright: 'bright',
    reach: 'reach',
    lightBlurbLead:
      'Reach is in cells; 0 is no limit. A script can change all three while the level runs —',
    lightBlurbTail: 'nearest are drawn.',

    physics: 'Physics',
    physicsOn: 'It falls, walking into it shoves it, and it fires',
    physicsOff: 'Scenery: it stays exactly where you put it until a rule moves it.',
    collidesAs: 'Collides as',

    tags: 'Tags',
    addATag: 'add a tag…',
    orANew: 'or a new one',
    addTag: 'add',

    script: 'Script',
    noScript: 'no script',
    scriptBlurb:
      'Every one of these gets its own run of it — its own counters, its own cooldown. Rules stay the better answer for anything that fits them.',

    properties: 'Properties',
    addProperty: 'Add',
    rename: 'Rename',
    delete: 'Delete',

    parts: 'Parts ·',
    addPart: 'Add',
    oneModel: 'One model.',
    addAnother: 'Add',
    partsBlurb:
      'another to compose this out of several — a base and a barrel, a post and a lamp — each hanging off the one before it, at a socket if the model has one.',
    on: 'on',
    removePart: 'Remove this part',
    name: 'name',
    unnamed: 'unnamed',
    hangsFrom: 'hangs from',
    theBlueprintItself: 'the blueprint itself',
    atSocket: 'at socket',
    itsOrigin: 'its origin',
    turn: 'turn',
    scale: 'scale',
    partModel: 'model',

    alreadyABlueprint: 'Already a blueprint',
    nameRules: 'Letters, digits, dash and underscore',
    drawn: 'drawn',
    aPlaceOnly: 'a place only',
    neverDrawnLead: 'Never drawn at play — a teleport destination, a waypoint. Still named,',
    spinPropBlurbLead: 'Degrees on its own axis, read from a prop of this name. A script turns it with',
    spinPropBlurbTail:
      ', or a rule’s Set/Add on target self. Nothing turns it on its own.',
    degreesASecond: 'degrees a second',
    degrees: 'degrees',
    lightBlurbMid: '. Only the',
    boxMeasured: 'A box measured from the model. Right for nearly everything.',
    walkStraightThrough: 'Walk straight through it — a coin, a pickup, a trigger volume.',
    noScriptsYet:
      'No scripts in this level yet. The Scripts panel writes one, and it can be attached here or from there.',
  },

  behaviour: {
    heading: 'Blueprints ·',
    addRule: '+ rule',
    ruleOne: '{n} rule',
    ruleMany: '{n} rules',
    noRules:
      'Nothing happens when you touch this. A new rule starts as “on enter, emit” — which does nothing to the level and says so on the HUD, so you can see it fire before deciding what it should do.',
    pickABlueprint: 'Pick a blueprint to see what it does.',
    neverFires:
      'This never fires — the level has no mode, so nothing ends it. Set one under Document to give it an ending.',

    on: 'on',
    when: 'when',
    do: 'do',
    deleteRule: 'Delete this rule',
    addVerb: '+ verb',
    destinationLead: 'A destination is a',
    destinationName: 'name',
    destinationMid:
      '— an empty node, a checkpoint pad, or a mark you have named. A kind on its own works while there is one of it:',
    destinationFinish: 'finish',
    destinationTail: 'in a course with one finish, and nothing once there are two.',

    nothingBound:
      'Nothing is bound — a press needs a key. Add one under Document, then pick it here.',
    key: 'key',
    within: 'within',
    cells: 'cells',
    anyDistance: 'any distance',
    compareToNumber: 'Compare against a number instead',

    upTo: 'up to',
    noMotions: 'nothing in this level has a motion yet — a blueprint builds one',
    noCuts: 'this level has no cuts yet — the Document panel makes one',
    wholeBody: 'whole body',
    event: 'event',
    untilTold: 'until told',
    untilToldTitle:
      'Seconds until it comes back. Empty means it stays off until something turns it on.',
    socket: 'socket',
    socketTitle: 'Which socket on the carrier to hang it from. Empty is their origin.',
    removeVerb: 'Take this verb out',
    nameItWillHave: 'name it will have',
    pickExisting: 'Pick one that exists',
    list: 'list',

    noBlueprintsYet:
      'No blueprints yet. A rule hangs off a kind of thing rather than off one crate — every crate made from a blueprint gets the same rules, which is what makes forty of them one edit.',
    bindAKeyFirst: 'pressed — bind a key first',
    addAFieldFirst: 'world — add a field first',
    noDataToCompare: 'This level declares no data to compare against',
    compareToSomethingKept: 'Compare against something the level is keeping',
    aNameNotPlaced: 'a name not placed yet…',
    aRoomHere: 'a room here',
    anotherXp: 'another xp',
    theFrontRoom: 'main — the front room',
    aRoomInThisLevel: 'a room in this level',
    whichRoomTitle:
      'Which room of this level to walk into - the level does not change, only which room of it everybody is standing in.',
    whichXpTitle: 'The id of the XP to open - everybody in the room comes along.',

    sides: 'sides',
    by: 'by',
    along: 'along',
    alongTitle:
      'The marks the piece moves between - track-0, track-1, … - and the property on the piece that remembers which one it stands on. One name for both, so they cannot drift apart.',
    bump: 'bump',
    bumpTitle: 'Optional: a tag. A piece landed on that carries it is sent back to its start.',
    aSide: 'a side',
    aSideTitle: 'A side this level names - red, blue, or any spawn mark’s team.',
    tablesOwn: "table's own",
    tablesOwnTitle: 'How long the room has to vote, in seconds. Empty is the arbiter’s default.',
    passNote: 'hands the turn to the next seat',
    raidNote: 'takes from somebody else’s save, at random - see the visit block',
  },

  animator: {
    rigs: { dummy: 'Dummy', peepz: 'Peep' },
    bones: {
      hips: 'Hips',
      spine: 'Spine',
      chest: 'Chest',
      head: 'Head',
      upperarml: 'Shoulder L',
      lowerarml: 'Elbow L',
      wristl: 'Wrist L',
      handl: 'Hand L',
      upperarmr: 'Shoulder R',
      lowerarmr: 'Elbow R',
      wristr: 'Wrist R',
      handr: 'Hand R',
      upperlegl: 'Hip L',
      lowerlegl: 'Knee L',
      footl: 'Foot L',
      toesl: 'Toes L',
      upperlegr: 'Hip R',
      lowerlegr: 'Knee R',
      footr: 'Foot R',
      toesr: 'Toes R',
      body: 'Body',
      tail: 'Tail',
      'wing-left': 'Wing L',
      'wing-right': 'Wing R',
      'leg-front-left': 'Front L',
      'leg-front-right': 'Front R',
      'leg-back-left': 'Back L',
      'leg-back-right': 'Back R',
    },
    groups: {
      torso: 'torso',
      arms: 'arms',
      legs: 'legs',
      tail: 'tail',
      wings: 'wings',
      body: 'body',
    },

    dockLead: 'Drag the dots to pose the body, key the pose on the strip.',
    dockSaveToLevel: 'Save to level',
    dockTail:
      'puts every clip in the collection into this document, where a pose, a rule or a script can name one.',
    fill: 'Fill',
    normalize: 'Normalize',
    stageHint: 'drag a dot to pose · shift-drag slides along the floor · wheel or pinch to zoom',
    holdsTitle: 'In the hand',
    holdsHint:
      'What the player is holding, and how it sits. The same field the Properties panel edits, here because a grip is dialled in by looking at it.',
    holdsWhat: 'holding',
    holdsNothing: 'nothing',
    holdsScale: 'size',
    movePad: 'Move {bone}',
    liftKnob: 'Raise and lower {bone}',
    liftLocked: 'Locked to {axis}. Press the lit letter, or Escape, to lift again.',
    oneFingerToCamera: 'Give one finger to the camera',
    look: 'Look',
    lockFree: 'free',
    lockTitle: 'Drag in any direction',
    lockAxisTitle: 'Drag along {axis} only',
    lockHint: 'X, Y and Z lock a drag to one axis. Press it again, or Escape, for free.',
    floor: 'Floor',
    body: 'Body',
    model: 'Model',
    bones_: 'Bones',
    bodyHint: 'Which skeleton you are animating. Each keeps its own working file.',
    clipsHint: 'All of them live in one file. The timeline shows the lit one.',
    movesHint: 'Stamped from the playhead, over whatever is already there.',
    levelHint: 'The clips this document carries, and what a pose or a rule can name.',
    saveNToLevel: 'Save {n} to level',
    oneFrame: 'One frame',
    undoRedoDepth: 'Undo and redo, {n} deep',
    straighten: 'Straighten {bone}',
    pin: 'Pin {bone}',
    unpin: 'Unpin {bone}',

    clips: 'Clips',
    newClip: 'New',
    copyClip: 'Copy',
    clip: 'Clip',
    name: 'Name',
    fps: 'Frames per second',
    lengthSeconds: 'Length (s)',
    easeOut: 'Ease out of the key under the playhead',
    dragItsDot: 'Drag its dot in the viewport, or turn it exactly here.',
    pickADot: 'Pick a dot in the viewport, or a name below.',

    moves: 'Moves',
    speed: 'Speed',
    movesBlurb:
      'Each one writes only the bones it names, so Walk and then Arm swing at the same spot is a whole walk — and neither has touched the head you posed.',
    presets: {
      dummy: {
        walk: { label: 'Walk', hint: 'Legs only. Stamp the arm swing over it.' },
        run: { label: 'Run', hint: 'Legs only, longer stride and more knee.' },
        armswing: {
          label: 'Arm swing',
          hint: 'Arms only. Opposite to the leg on the same side.',
        },
        wave: {
          label: 'Wave',
          hint: 'Right arm up, forearm waving. Leaves everything else alone.',
        },
        dance: {
          label: 'Dance',
          hint: 'The lot: bounce, arms up, and a head that is enjoying itself.',
        },
        idle: {
          label: 'Idle',
          hint: 'Standing, breathing, arms down. What a figure does when nothing does.',
        },
        jump: {
          label: 'Jump',
          hint: 'Crouch, launch, tuck, land. Moves the root, so it leaves the floor.',
        },
      },
      peepz: {
        walk: { label: 'Walk', hint: 'Legs and a roll. Four keys where the clip has fifteen.' },
        run: {
          label: 'Run',
          hint: 'The bound: both fronts, both backs, and the body pitching with it.',
        },
        idle: {
          label: 'Idle',
          hint: 'A slow sway, legs left alone. The thing to sit under everything else.',
        },
        dance: {
          label: 'Dance',
          hint: 'Body and tail, twice as far as the idle. Legs stay put.',
        },
        wag: { label: 'Wag', hint: 'The tail and nothing else, so it layers over a walk.' },
        flap: {
          label: 'Flap',
          hint: 'Wings only. The four animals that have them; nothing on the rest.',
        },
      },
    },

    pose: 'Pose',
    copyKey: 'Copy key',
    pasteKey: 'Paste key',
    backToRest: 'Back to the rest pose',
    poseBlurb:
      'Copy takes the whole key — the pose and its easing. Closing a loop is copy frame one, scrub to the end, paste.',

    save: 'Save',
    saveWork: 'Save work',
    open: 'Open',
    fileBlurbLead: 'The',
    fileBlurbTail:
      ': keys, easing, timing, which rig it is for, and the format version. It is the only file this tool writes, and the only one it can reopen.',
    level: 'Level',
    saveToLevel: 'to level',
    nothingInLevel: 'Nothing from this collection is in the level yet.',
    savedAsSamples:
      'Saved as samples, one a frame — about {kb}KB for these {n}. The working file stays the editable one; a saved clip cannot be opened back into this timeline.',

    shortcuts: 'Shortcuts',
    playOrPause: 'Play or pause',
    keyThePose: 'Key the pose here',
    removeTheKey: 'Remove the key here',
    nextOrPrevious: 'Next or previous key',
    backToStart: 'Back to the start',
    copyAndPaste: 'Copy and paste the key',
    moveAlongFloor: 'Move along the floor',

    pasteInstead: 'Paste an animation instead…',
    apply: 'Apply',
    undo: 'Undo',
    redo: 'Redo',
    previousKey: 'Previous key',
    nextKey: 'Next key',
    autoKey: 'Auto-key',
    loop: 'Loop',

    notes: {
      nothingToSaveOne:
        'Nothing to save: that clip has no posed bones yet, so there is no animation in it.',
      nothingToSaveMany:
        'Nothing to save: those clips have no posed bones yet, so there is no animation in them.',
      savedOne:
        'Saved {n} clip into the level. A pose, a rule or a script can name any of them.{skipped}',
      savedMany:
        'Saved {n} clips into the level. A pose, a rule or a script can name any of them.{skipped}',
      skippedOne: ' {names} was skipped — nothing posed in it yet.',
      skippedMany: ' {names} were skipped — nothing posed in them yet.',
      openedOld:
        'Opened “{name}”{many} — {keys} keys. It says version {declared} and this editor knows version {known}, so anything newer than that has been dropped.',
      opened: 'Opened “{name}”{many} — {keys} keys, {seconds}s at {fps}fps.',
      ofMany: ' of {n}',
      stamped:
        'Stamped {preset} from {at}s — {length}s of it. It only touched the bones it names, so anything else you posed is still there.',
    },
  },

  scenes: {
    heading: 'Places',
    lead: 'The rooms this level holds. A load verb sends somebody to one, and a round can name one as where it is played.',
    theLevelItself: 'the level itself',
    rename: 'rename',
    remove: 'remove',
    add: 'add',
    namePlaceholder: 'a name for the room',
    nameRule: 'Lowercase letters, digits and dashes. “main” is the level’s own world.',
    openIt: 'double-click to work in this room',
    standingHere: 'you are in here',
    door: '+ door',
    doorTitle: 'put a way into this room down in the one you are working in',
  },

  movies: {
    heading: 'Movies',
    lead: 'A movie is an empty stage with a time axis: put bodies in it, or import a room you have built. Cut shots together and export.',
    newMovie: '+ new movie',
    newMovieTitle: 'an empty stage with a timeline — put models in it',
    noMoviesYet: 'No movies yet. A movie is an empty stage: make one, put bodies in it, and point a camera.',
    importFrom: 'import…',
    importTitle: 'copy another room’s set and cast into this movie',
    openIt: 'open',
    openItTitle: 'open this shot in the movie editor',
    runsFor: '{seconds}s at {fps}fps',
    stopBeingAMovie: 'not a movie',
    stopSure: 'press again - the keys go',
    cuts: 'Cuts',
    cutsLead: 'Shots in order, trimmed and retimed. The same shot may be used more than once.',
    addACut: '+ cut',
    emptyCut: 'no shots in it yet',
    takeCount: '{n} shots, {seconds}s',
    takeCountOne: '1 shot, {seconds}s',
    openComposer: 'compose',
    openComposerTitle: 'open this cut in the composer',
    removeCut: 'remove',
    removeCutSure: 'press again',
    cutNamePlaceholder: 'a name for the cut',
    nothingIsAShot: 'Nothing here is a shot yet. Make a movie above.',
    needAShotFirst: 'Make a movie first — a cut is made out of them.',
  },

  movie: {
    editingAShot: 'Shot',
    composing: 'Cut',
    close: 'close',
    closeTitle: 'back to the editor (Escape)',
    play: 'play',
    pause: 'pause',
    toStart: 'to the start',
    view: 'Looking',
    freeLook: 'free',
    freeLookTitle: 'fly around to find a view. The mouse moves this one.',
    theCut: 'the cut',
    theCutTitle: 'watch it the way it will be exported',
    cameras: 'Cameras',
    addCamera: '+ camera here',
    addCameraTitle: 'put a camera where you are looking from',
    keyHere: 'move it here',
    keyHereTitle: 'make this camera pass through the view you are looking from, at this moment',
    cutHere: 'cut to it',
    cutHereTitle: 'the picture is on this camera from this moment',
    removeCamera: 'remove',
    ease: 'settle',
    easeTitle: 'arrive at each framing and settle, rather than passing through at speed',
    cast: 'Cast',
    nobodyNamed: 'Nothing in this place has a name.',
    nobodyNamedLead: 'A timeline moves things by name. Name an actor in the Properties panel and it will be here.',
    selectAnActor: 'Pick somebody to key.',
    key: 'key',
    keyTitle: 'pin this value at this moment',
    clearKeys: 'clear all keys',
    plays: 'Plays',
    playsTitle: 'this body plays a clip from this moment',
    clip: 'clip',
    loop: 'loop',
    length: 'Length',
    rate: 'Rate',
    backdrop: 'Behind',
    backdropNone: 'nothing',
    backdropColour: 'a colour',
    backdropImage: 'a picture',
    backdropSky: 'a sky',
    backdropPath: '/a-file-in-public.png',
    backdropNoneBlurb: 'Nothing behind it means a saved frame is a cut-out. Video has no transparency, so a recording of this comes out black — give it a colour or a picture before you record.',
    exportHeading: 'Export',
    saveFrame: 'save this frame',
    saveFrameTitle: 'this moment, as a PNG',
    record: 'record',
    recording: 'recording…',
    stopRecording: 'stop',
    recordTitle: 'play it and record what you see, as a WebM',
    cannotRecord: 'This browser cannot record a canvas.',
    droppedFrames: 'Dropped {dropped} of {wanted} frames — the scene is heavier than the frame budget. Shoot it smaller, or simplify it.',
    ffmpegHint: 'To make an mp4 out of it:',
    shots: 'Shots',
    addShot: '+ shot',
    noShots: 'Nothing in this cut yet. Add a shot.',
    trim: 'Trim',
    speed: 'Speed',
    removeTake: 'remove',
    copyTake: 'copy',
    copyTakeTitle: 'the same shot again, right after this one',
    takeOf: 'take {n} of {of}',
    goToTakeTitle: 'put the playhead on this take',
    earlier: 'earlier',
    later: 'later',
    totalLength: '{seconds}s in total',
    nothingAtThisMoment: 'Nothing at this moment.',
    warmUpFirst: 'This cut crosses places. Play it through once before recording — the first frame after a cut to a place whose models have not loaded yet is an empty one, and in a file that is a black frame.',
    addActor: '+ actor',
    addActorTitle: 'put somebody in front of the camera',
    theAvatar: 'Avatar',
    thePeepz: 'Peepz',
    theProps: 'Props',
    findAModel: 'find…',
    addEmpty: '+ empty',
    addEmptyTitle: 'a handle that draws nothing — hang things off it and move them together',
    hangsOff: 'on',
    nothing: 'nothing',
    willAddPack: 'This level does not carry that pack yet — taking a model from it adds it.',
    packs: 'Packs',
    packsTitle: 'Look through every pack, full screen.',
    browsePacks: 'browse…',
    orDragOne: 'Click to put one in the shot, or drag one onto the stage.',
    duplicate: 'duplicate',
    duplicateTitle: 'One more of her, a cell aside, with her children and her keys.',
    theCamera: 'camera',
    headLooksAt: 'looks at',
    aim: 'aim head',
    aimTitle: 'Turn the head towards it, as far as a neck goes. Adjust from there.',
    toolMove: 'move',
    toolTurn: 'turn',
    toolSize: 'size',
    sizeIsOne: 'One number: a body scales evenly.',
    aMove: 'move',
    aTurn: 'turn',
    aJump: 'jump',
    addMoveTitle: 'Walk somewhere. Starts where she already is.',
    addTurnTitle: 'Turn on the spot. Starts at her own facing.',
    addJumpTitle: 'Leave the floor and come back.',
    nothingYet: 'Nothing yet. A block appears on the strip.',
    atForSeconds: '{t}s for {n}s',
    starts: 'starts',
    lasts: 'lasts',
    facing: 'facing',
    howHigh: 'how high',
    loops: 'loops',
    dropActionTitle: 'Take this action out of the shot.',
    actionKinds: { move: 'Move', turn: 'Turn', jump: 'Jump', play: 'Play', say: 'Say' },
    loopFrom: 'in',
    loopFromTitle: 'Cycle from here. Play will run this stretch over and over.',
    loopTo: 'out',
    loopToTitle: 'Cycle up to here.',
    loopingRange: '↻ {a}–{b}s',
    loopOffTitle: 'Stop cycling and play the whole shot again.',
    leavesAt: 'from {t}s',
    easeNames: { hold: 'hold', linear: 'straight', smooth: 'ease' },
    easeTitles: {
      hold: 'Stay here, then jump. The only way to get a cut rather than a glide.',
      linear: 'Go straight there, at one speed.',
      smooth: 'Set off slowly and arrive slowly.',
    },
    dropKeyTitle: 'Take this key out.',
    addToPick: '+ pick',
    addToPickTitle: 'Keep picking to add to the selection, instead of replacing it. Shift does the same on a keyboard.',
    showControls: 'controls',
    hideControls: 'hide',
    seeIt: 'see it',
    seeItTitle: 'Show this clip on the body without putting it in the shot.',
    markASpan: 'Drag to mark a stretch for play to cycle. A tap clears it.',
    framings: 'framed at',
    dropFramingTitle: 'Take this framing off the camera. It keeps the others.',
    moments: 'moments',
    goToMoment: 'Put the playhead here and show this pose.',
    dropMomentTitle: 'Take this moment out of the animation.',
    lock: 'lock',
    lockTitle: 'Pin an axis so the pad cannot move it. The sliders still can.',
    deleteActor: 'delete',
    deleteActorTitle: 'Take this one off the stage, with anything hanging off it.',
    deleteActorSure: 'delete for good?',
    oneModel: '1 model',
    someModels: '{n} models',
    andMore: 'Showing the first {n}. Type to narrow it down.',
    nothingMatches: 'Nothing in this pack matches that.',
    setIsBuiltInTheEditor: 'Only bodies here. Scenery is built in the editor, where the brush is.',
    oneCamera: '1 camera',
    someCameras: '{n} cameras',
    oneActor: '1 body',
    someActors: '{n} bodies',
    keyedCount: '{n} keyed',
    shot: 'Shot',
    does: 'Does',
    autoKey: 'auto-key',
    autoKeyTitle: 'On, a slider writes a key at the playhead. Off, it moves where the body starts.',
    shownHere: 'shown from here',
    clearKeysSure: 'press again',
    pose: 'Pose',
    cuePose: 'hold it from here',
    cuePoseTitle: 'play this pose from the playhead, for as long as you drag the block',
    clearPose: 'straighten up',
    poseIsSaved: 'Turning a bone saves it into the level and puts it on the body — there is nothing to press. Drag the block on the strip to hold it for longer.',
    animate: 'animate this body',
    animateTitle: 'pose it in the animator, save the clip into the level, then cue it here',
    says: 'says',
    saysTitle: 'a speech bubble over their head, from this moment',
    line: 'what they say',
    forSeconds: 'for',
    moveIt: 'drag',
    aimIt: 'aim',
    stands: 'at',
    looksAt: 'sees',
    lens: 'Lens',
    frame: 'Frame',
  },

  flow: {
    whichRound: 'Which round',
    roundAny: 'This level',
    roundAnyBlurb: 'The round this level plays when nothing more specific is said.',
    roundModeBlurb: 'A round of its own for this mode. Without one, it plays the level’s.',
    modes: {
      space: 'Space',
      lobby: 'Lobby',
      battle: 'Battle',
    },
    noRound: 'This level describes no round.',
    startAFlow: 'start a flow',
    noRoundAtAll: 'no round at all',
    noRoundSure: 'press again - every phase goes',
    theOpeningPhase: 'the phase a round opens in',
    shapes: 'What kind of game is this?',
    shapesLead:
      'A level is a live world, or it plays a run. A run has stages — kick-off, play, full time; roll, move, next seat — and the stages are what you are drawing here. Pick the shape closest to yours and move its pieces.',
    starters: {
      live: {
        name: 'A live world',
        blurb:
          'No start and no end. People come and go, and what the level keeps in its space and shared fields is still there tomorrow. Most levels are this.',
      },
      countdown: {
        name: 'Countdown, then play',
        blurb:
          'A held breath and then everything at once. Nobody can move for the first seconds, which is how a race or a scramble starts fair.',
      },
      match: {
        name: 'Kick-off, play, full time',
        blurb:
          'A match with a clock. Three seconds to get set, three minutes of play, and a whistle nobody can argue with. Score and time limits are in Mode.',
      },
      rounds: {
        name: 'Best of three',
        blurb:
          'The same fight three times with a breather between. A round counter the level keeps, and the match is over when it reaches three.',
      },
      board: {
        name: 'Roll, move, next seat',
        blurb:
          'A turn that goes round the table. Roll the die, move while it is yours, hand it on. Comes with the die and the keys, so it plays before you add a single piece.',
      },
    },
    current: 'this level now',
    use: 'use this shape',
    playedAs: 'Where it can be played',
    playedAsLead:
      'Every level can be kept standing as a room people just walk into. A level that is only a game - a table for four, a pitch - can say so here, and the room option goes away.',
    capabilities: {
      freeplay: {
        name: 'As a room',
        blurb: 'Anybody in the space can keep it standing and walk in. Things work, nothing ends.',
      },
      match: {
        name: 'As a battle',
        blurb: 'The battle lobby can run a match here: sides, a score, an end. Needs a spawn for each side.',
      },
      football: {
        name: 'As a ball game',
        blurb: 'A goal at each end, so a ball can be scored.',
      },
      competition: {
        name: 'As a race',
        blurb: 'A start and a finish, so two runs can be ranked.',
      },
    },
    presetLeansOn: 'the {preset} mode needs this - change the mode first',
    atLeastOne: 'a level is playable as at least one thing',
    stages: 'stages',
    orBlank: 'Or name the opening phase and draw the rest yourself:',
    startOver: 'start over from a shape',
    startOverNote: 'Replaces the phases above. Undo brings them back.',
    makeStart: 'make start',
    start: 'start',
    aNewPhase: 'a new phase',
    add: 'add',
    remove: 'remove',
    cancel: 'cancel',
    unreachable: 'unreachable',

    allow: 'allow',
    endsGroup: 'the run itself',
    goNextRound: 'the next round',
    goEnd: 'the end of the run',
    rounds: 'rounds',
    roundsOnce: 'played once',
    roundsHint:
      'How many times the round is played before the run is over. An arrow to "the next round" is what counts one and opens the next.',
    roundsNeedsSeam: 'No arrow goes to the next round yet, so this would be played once.',
    who: 'who',
    whoTurn: 'only whoever is on turn',
    whoNote:
      'The keys above are live for the player the table says is up, and drawn for nobody else. Until turns start - or played alone - everybody keeps them.',
    whatAPlayerCanDo: 'what a player can do here',
    everything: 'everything',
    noKeys: 'this level binds no keys',
    says: 'says',
    /** Around a `does`, which is the field a phase spells. */
    dragBetweenLead: 'Drag between two nodes above to point an arrow. A phase’s',
    dragBetweenTail: 'runs once on entering it — not every frame, which is what a rule is for.',
    nothingOnEntering: 'nothing on entering — the phase only waits',
    does: 'does',
    addVerb: '+ verb',
    noWayOut: 'no way out',
    nothingLeaves: 'nothing leaves here — a run that arrives stays, which is what an ending is',
    whereThisArrowGoes: 'Where this arrow goes',
    anEventARuleEmits: 'an event a rule emits',

    wins: 'wins',
    sayWhenItIsWon: 'say when it is won',
    nothingStartsOver: 'nothing here starts over',
    anEndingCounts:
      'An ending counts something that starts over — declare a field with scope "run" in the Data panel',
    /** The same thing said longer, around a `run` in its own span. */
    endingNeedsRunLead:
      'An ending counts something that starts over. A field kept in the space or per player still holds last game’s number, so the next run would be won before anybody moved — declare one with scope',
    neverEnds: 'never ends',
    run: 'run',
    clockNote:
      'The only field here that needs a clock everybody agrees on. A round-based flow does not want one.',
    noData: 'this level declares no data',
    nothing: 'nothing',
  },

  scripts: {
    heading: 'Scripts ·',
    blurb:
      'A script is what a rule cannot be: a position that depends on the last frame, a count of how long since something happened, a question about another entity. Triggers and verbs stay the better answer for anything that fits them — they read as three rows rather than as thirty lines.',
    newName: 'turret',
    add: 'Add',
    cancel: 'Cancel',
    new: 'New',
    alreadyAScript: 'Already a script',
    nameRules: 'Letters, digits, dash and underscore',
    noneYet: 'None yet.',
    rename: 'Rename',
    delete: 'Delete',

    run: 'Run',
    notAttached:
      'Not on anything yet, so a run would have nothing to run it for. Attach it below first.',
    frames: '{n} frames · one second of world.time',
    ranAndSaidNothing:
      'It ran and said nothing, which is what a script with no `log` does. Add one to see where it got to.',
    runsOn: 'Runs on',
    noBlueprints: 'No blueprints yet. A script runs on a kind of thing, not on the level.',
  },

  data: {
    heading: 'What this level keeps',
    blurbLead: 'A number that survives the tab closing. Rules read and write these with',
    world: 'world',
    blurbTail: 'as their target, under Behaviour.',
    noneYet:
      'Nothing yet, which is right for most levels — a room that remembers nothing costs nothing and needs no account behind it. Add a field when something should still be true tomorrow: coins collected, a door somebody opened, a best time.',
    newName: 'coins',
    add: 'add',
    seenBy: 'seen by',
    startsAt: 'starts at',
    pressAgainToRemove: 'Press again to remove this field',
    removeThisField: 'Remove this field',
    nameRules:
      'Lowercase letters, digits and dashes, starting with a letter — the same as an entity name.',
    /** `{name}` is the field that already exists. */
    alreadyAField: 'There is already a field called {name}.',
    full:
      '{n} fields is the most a level may declare. A model bigger than this is usually one thing pretending to be thirty — a single number naming a state, rather than a flag for each.',
  },

  words: {
    heading: 'What this level says',
    blurb:
      'The English is the key. Anything a language has no line for is printed as written, so a half-finished translation reads as English rather than as a blank.',
    noLanguages:
      'No other languages, which is right for most levels — one is a whole game. Add one when somebody has actually asked to read this in it.',
    nothingToTranslateLead:
      'Nothing to translate yet. A level says something once it has a description, or once a script calls',
    codeLabel: 'A language code to add, like de or pt-BR',
    codePlaceholder: 'de',
    add: 'add',
    removeLanguage: 'Remove {code} and everything written in it',
    inThisLanguage: 'In this language: {phrase}',
    language: 'Language',
    keys: 'Keys',
    keysHint:
      'A key is the English sentence the level prints - the title, the description, anything a script says with t(\'…\'). Those are listed on their own; add one here for a line a script will print later.',
    keyLabel: 'A new key - the English sentence',
    keyPlaceholder: 'Press E to open the gate',
    addKey: 'add key',
    keyColumn: 'key',
  },

  shell: {
    leave: 'Leave the editor',
    menu: 'Menu',
    moreLevel: 'More of the level',
    lessLevel: 'More of the panel',
    goBackToDisk: 'Go back to what is on disk',
    tryIt: 'Try it — play the level as it stands',
    tryingIt: 'Trying it',
    asItStands: '· as it stands, saved or not · nobody else is here',
    tryingRoom: 'starting in {room}',
    stop: 'Stop — Esc',
    undo: 'Undo',
    redo: 'Redo',
    saving: 'Saving…',
    save: 'Save',
    export: 'Export',
    log: 'Log',
    oldestDropped: 'oldest dropped past {n}',
    draft: 'draft',
    saved: 'saved',
    placements: 'placements',
    entities: 'entities',
    tools: 'Tools',
    onDisk: 'on disk',
    toolNames: {
      select: 'Select',
      hand: 'Hand',
      place: 'Place',
      draw: 'Draw',
      erase: 'Erase',
      line: 'Line',
      rect: 'Fill',
      room: 'Room',
    },
    handles: { translate: 'Move', rotate: 'Turn', scale: 'Size' },
    viewport: 'Viewport',
  },

  camera: {
    heading: 'Camera',
    kinds: { follow: 'follow', side: 'side-on', fixed: 'fixed' },
    kindBlurbs: {
      follow: 'Behind the body, looking where you look - first or third person',
      side: 'Flat on, from the side, along one axis - a platformer',
      fixed: 'Nailed to one spot in the world, watching the player or staring one way',
    },
    runsAlong: 'runs along',
    standOff: 'stand off',
    cellsTall: 'cells tall',
    behind: 'behind',
    above: 'above',
    beside: 'beside',
    lens: 'lens°',
    sees: 'sees',
    aimedOneWay: 'one way',
    watchesThePlayer: 'watches you',
    looksAtASpot: 'at a spot',
    staresOneWay: 'Stares one way. Yaw 0 looks along +z, the way a mark faces.',
    turnsToWatch: 'Turns to watch whoever is playing, from where it stands.',
    staresAtASpot:
      'Stares at one place, whoever is playing and wherever they walk. What a table wants: every chair looks at the middle.',
  },

  talk: {
    heading: 'Talking',
    chat: 'chat',
    emotes: 'emotes',
    on: 'on',
    off: 'off',
    bothAllowed:
      'Both allowed, which is what a level that says nothing means. Nothing is written to the file.',
    noFaces: 'No faces. People can still type.',
    noChat: 'Nobody can type. The faces are still there.',
    quiet: 'A quiet level. Nobody can type and there are no faces.',
    allowedNotPromised:
      'Allowed, not promised — a space with its own chat switched off has none in here either.',
  },
}

export const XP_EDITOR_DE: XpEditorDict = {
  chrome: {
    toolWindows: 'Werkzeugfenster',
    projectName: 'Der Name dieses Projekts',
    rename: 'Umbenennen',
    viewportHint: 'ziehen zum Zeichnen · rechts ziehen zum Schwenken · R dreht',
    windows: {
      scene: 'Szene',
      properties: 'Eigenschaften',
      model: 'Modelle',
      blueprints: 'Baupläne',
      tools: 'Werkzeuge',
      output: 'Dokument',
      words: 'Wörter',
      behaviour: 'Verhalten',
      data: 'Daten',
      flow: 'Ablauf',
      scripts: 'Skripte',
      animator: 'Animator',
      movie: 'Film',
    },
  },

  tools: {
    level: 'Ebene',
    levelHint: 'Q und W. Auf etwas zeigen nimmt stattdessen dessen Höhe.',
    groundAt: 'Boden bei y = {y}',
    groundHint:
      'Etwas zum Draufstehen, solange ein Level halb gebaut ist. Aus ist der Boden der Welt ein Fangnetz vierzig Zellen tiefer.',
    fallingRestarts: 'Fallen setzt zurück',
    fallingRestartsHint:
      'Das macht ein Jump ’n’ Run aus. Aus kostet ein Fehltritt den Rückweg; an kostet er den Lauf.',
    fallingKills: 'Fallen tötet',
    fallingKillsHint:
      'Ein Loch kostet, was die Stacheln kosten - ein Leben und die Wartezeit. Sonst lehrt ein Level zwei Regeln für einen Fehler.',

    background: 'Hintergrund',
    transparent: 'transparent',
    backgroundHint:
      'Leer zeigt die Seite hinter dem Level. Ein Name, ein Hex-Wert oder ein rgb() — was three.js eben liest.',

    snap: 'Raster',
    snapOff: 'aus',
    snapFree: 'Frei. Das Dokument rundet beim Einlesen trotzdem auf ein Zehntel.',
    snapStep: '{step} einer Zelle',
    snapHint:
      'Wie weit ein Griff zwischen zwei Stufen wandert. Eine Markierung ist immer ganze Zellen — so speichert es das Format.',

    turn: 'Drehung {n}°',
    rotate: 'Drehen — R',
  },

  legend: {
    modelLead: 'Ziehen Sie eines herein, und es ist',
    scenery: 'Kulisse',
    modelTail: '— Zellen im Level, ohne Namen, und es passiert nichts damit.',
    blueprintLead: 'Ziehen Sie einen herein, und es ist',
    aThing: 'ein Ding',
    blueprintTail:
      '— benannt, mit Eigenschaften, und es kann ihm etwas zustoßen. Aus einem Modell oder mehreren.',

    joinedLead: 'Mehrere Modelle zusammen — ein Sockel und ein Lauf — sind ein Bauplan mit',
    parts: 'Teilen',
    joinedTail: '. Ebenso alles, was einen Namen hat oder dem etwas zustößt.',
    toBlueprints: 'Baupläne →',
  },

  picker: {
    models: 'Modelle',
    hide: 'zu',
    pick: 'wählen',
    settings: 'Einstellungen der Auswahl',
    searchPlaceholder: 'Wand, Rampe, Treppe …',
    noPacks: 'noch keine Pakete — Pakete öffnen',
    nothingMatches: 'nichts passt',
    tiles: '{n} Kacheln',
    showFirst: 'die ersten {n} zeigen',
    showAll: '+{n} weitere — alle zeigen',
    showInColour: 'Plattformteile in {colour} zeigen',
    usedBy: '{n} Dinge in diesem Level bestehen daraus',
    add: 'hinzu',
    remove: 'weg',
    holdThis: 'Dieses halten',
    addAndHold: '{pack} hinzufügen und dieses halten',
    tileTitle: '{name} — {size} · ins Level ziehen',
    inUse: 'in Gebrauch ·',
    packs: 'Packs',
    packsCount: '{n} von {of}',
  },

  document: {
    called: 'Heißt',
    calledLabel: 'Wie dieses Level heißt',
    about: 'Worum',
    aboutLabel: 'Was dieses Level ist, in einem Satz',
    aboutPlaceholder: 'Ein Satz, für jemanden, der entscheidet, ob er es öffnet.',

    counts: {
      placements: 'Platzierungen',
      distinctModels: 'verschiedene Modelle',
      entities: 'Objekte',
      blueprints: 'Baupläne',
      marks: 'Markierungen',
      capabilities: 'Fähigkeiten',
      packs: 'Pakete',
      player: 'Spielfigur',
    },
    drawCalls: 'die Zeichenaufrufe folgen dieser Zahl, nicht der darüber',
    builtInDummy: 'die eingebaute Puppe',

    nothingToFlag: 'Nichts anzumerken.',
    noPlacements: 'Keine Platzierungen - nichts zum Draufstehen.',
    noMarks:
      'Keine Markierungen. Ein Match braucht zwei Startpunkte; ein Wettbewerb braucht Start und Ziel.',
    unnamedOne: '{n} Objekt ohne Namen - eine Regel kann es nicht ansprechen.',
    unnamedMany: '{n} Objekte ohne Namen - eine Regel kann sie nicht ansprechen.',
    airborneOne:
      '{n} Startpunkt hat nichts darunter - jemand kommt in der Luft an. Schieben Sie ihn, damit er landet.',
    airborneMany:
      '{n} Startpunkte haben nichts darunter - jemand kommt in der Luft an. Schieben Sie sie, damit sie landen.',
  },

  mode: {
    heading: 'Modus',
    modeHeading: 'Was das hier ist',
    styleHeading: 'Was man darin tut',
    finishHeading: 'Woraus die Kassette ist',
    finishes: {
      plastic: 'Kunststoff',
      shiny: 'glänzend',
      metal: 'Metall',
      rust: 'Rost',
      glass: 'Glas',
      rainbow: 'Regenbogen',
      galaxy: 'Galaxie',
      neon: 'Neon',
      hologram: 'Hologramm',
    },
    colourHeading: 'Welche Farbe sie hat',
    colourAuto: 'automatisch',
    modes: {
      space: 'Ort',
      lobby: 'Lobby',
      battle: 'Partie',
    },
    modeBlurbs: {
      space: 'Ein Ort, der einfach da ist. Keine Runde, nichts zu gewinnen, und was darin passiert, bleibt.',
      lobby: 'Wo man sich zwischen den Runden trifft — und es kann trotzdem zählen.',
      battle: 'Ein Durchgang: Er beginnt, er endet, und was gezählt wurde, geht mit.',
    },
    presets: {
      freestyle: 'freestyle',
      deathmatch: 'deathmatch',
      football: 'football',
      parkour: 'parkour',
      shooter: 'shooter',
    },
    sides: {
      ffa: 'alle gegen alle',
      team: 'Teams',
      'one-vs-all': '1 gegen alle',
    },
    sideBlurbs: {
      ffa: 'Alle gegen alle - jeder für sich, und Team-Startpunkte werden nicht gelesen',
      team: 'Teams - die Seiten, die die Startmarkierungen benennen, aufgeteilt nach der Einstellung darunter',
      'one-vs-all':
        'Einer gegen alle - ein Match benennt den einen; allein hat niemand eine Seite',
    },
    assign: {
      spread:
        'Den Raum auf die Seiten verteilen, damit ein offener Raum ohne Organisation funktioniert',
      order:
        'Die Leute in der Reihenfolge setzen, auf die sich der Raum einigt: die erste Seite an die erste Person',
      host: 'Nur ein Match darf jemanden auf eine Seite setzen; allein hat man keine',
      claim: 'Jeder wählt seine eigene Seite, eine Person je Seite, und niemand wird verschoben',
    },

    firstTo: 'erster bei',
    noScoreLimit: 'keine Punktgrenze',
    seconds: 'Sekunden',
    noClock: 'keine Uhr',
    downFor: 'am Boden für',
    straightBackUp: 'sofort wieder auf',

    players: 'Spielende',
    needs: 'braucht',
    anybody: 'beliebig',
    holds: 'fasst',
    upTo: 'bis zu {n}',

    sidesHeading: 'Seiten',
    readOffTheMarks: ' — von den Markierungen abgelesen, weil nichts gesetzt wurde',
    assignNames: {
      spread: 'verteilen',
      order: 'Reihenfolge',
      host: 'Gastgeber',
      claim: 'selbst wählen',
    },

    needsGoals: 'braucht an jedem Ende ein Tor',
    needsStartFinish: 'braucht Start und Ziel',
    needsSpawns: 'braucht einen Startpunkt je Seite',
    needsSomething: 'braucht etwas, das dieses Level nicht hat',
    needsTeamNames: 'braucht zwei Startmarkierungen mit verschiedenen Teamnamen',

    nothingToHandOut:
      'Nichts zu verteilen. Geben Sie zwei Startmarkierungen verschiedene Teamnamen, dann entscheidet das hier, wer welche bekommt.',
    matchNamesTheOne:
      'Ein Match benennt den einen. Hier kann ihn nichts wählen - dafür braucht es die Aufstellung, und die gibt es im Regal nicht.',
    nobodyOnASide:
      'Niemand ist auf einer Seite, also werden die Team-Startpunkte in diesem Level nicht gelesen.',

    forExactly: 'Für genau {min}.',
    forAnybody: 'Für beliebig viele.',
    forRange: 'Für {min} bis {max}.',
    seatsSpare:
      '{said} Es gibt {seats} Plätze und je eine Person, also hätten {spare} davon keinen Platz.',
    seatsExactly: '{said} {seats} Plätze, je eine Person.',
  },

  inspector: {
    things: 'Dinge ·',
    thingsEmpty:
      'Noch nichts. Objekte sind die Dinge mit Namen und Regeln — Kisten, Sammelstücke, Karts. Wände sind Platzierungen weiter unten.',
    built: 'Gebaut ·',
    builtEmpty: 'Noch nichts gebaut. Ziehen Sie über das Raster, um einen Boden zu legen.',
    distinctModels:
      'verschiedene Modelle. Die Zeichenaufrufe folgen dieser Zahl, nicht der Anzahl der Teile.',
    marks: 'Markierungen ·',
    marksEmpty:
      'Keine. Ein Match braucht je Seite einen Startpunkt, Fußball braucht an jedem Ende ein Tor, und ein Lauf braucht Start und Ziel.',
    modelOne: 'Modell',
    modelMany: 'Modelle',

    makeBlueprint: '→ zum Bauplan machen',
    makeBlueprintTitle: 'Aus diesem Teil eine Art Ding machen, an seinem Platz',
    putMark: 'Eine {kind}-Markierung dort setzen, wo der Zeiger ist',
    landsUnderPointer: 'Landet unter dem Zeiger, nicht im Ursprung.',

    heading: 'Eigenschaften',
    nothingSelected:
      'Nichts ausgewählt. Klicken Sie etwas im Level an oder eine Zeile im Szenenbaum, dann erscheinen hier seine Zahlen.',
    delete: 'Löschen',
    name: 'Name',
    unnamed: 'ohne Namen',
    turn: 'Drehung',
    scale: 'Größe',
    turnAround: 'Umdrehen',
    pivots: { centre: 'Mitte', origin: 'Ursprung' },
    spinsWhereItStands: 'Dreht sich, wo es steht.',
    spinsAboutOrigin: 'Dreht sich um den eigenen Punkt des Modells — eine Tür an ihrem Scharnier.',

    mark: 'Markierung',
    kind: 'Art',
    facing: 'Blickrichtung',
    width: 'Breite',
    height: 'Höhe',
    team: 'Team',
    nobodys: 'niemandes',
    spawnBlurb:
      'Wo eine Seite ankommt. Zwei davon braucht ein Match. y ist, was darunter liegt — ein Startpunkt steht auf dem Boden.',
    goalBlurb:
      'Ein Rahmen, von der Seite aus zählbar, in die er schaut. Einer, der von beiden Seiten zählt, ist kein Tor.',

    player: 'Spielfigur',
    body: 'Körper',
    noBlueprints: 'Noch keine Baupläne, also gibt es nichts zu sein außer der Puppe.',
    everybodyIs: 'alle sind',
    playerSpawnBlurb:
      'Wo eine Person ankommt und wohin sie schaut. y ist, was darunter liegt — ein Startpunkt steht auf dem Boden.',
    playerMarksBlurb:
      'Wo eine Person ankommt, wenn keine Startmarkierung etwas anderes sagt — dieses Level hat {marks}, also gewinnen die. Klicken Sie den Körper an, um den ersten davon auszuwählen.',
    wears: 'trägt',
    looks: {
      dummy: 'Puppe',
      profile: 'das eigene Tier',
      random: 'ein zufälliges Tier',
      peep: 'der eigene Peep',
      xp: 'der eigene XP-Körper',
      choose: 'was sie gewählt haben',
    },
    theBodyAbove: 'den Körper oben',
    builtInDummy: 'die eingebaute Puppe',
    wearsProfile:
      'Das Tier, das jede Person im Profil gewählt hat. Wer keines gewählt hat, bekommt ein zufälliges statt gar keines.',
    wearsRandom:
      'Je ein Tier, aus der eigenen Kennung - also auf jedem Bildschirm dasselbe und morgen wieder dasselbe.',
    wearsBody: 'Den Körper oben, genau so, wie er gezeichnet ist.',
    wearsDummy: 'Die Prototyp-Puppe, die ein Level bekommt, das nichts sagt.',
    wearsPeep:
      'Das eigene Tier, egal was sonst noch gekauft wurde - ein Raum voller Tiere bleibt einer.',
    wearsXp:
      'Der Körper, den sie in die Spiele mitnehmen. Wer keinen hat, ist die Puppe - das, was man vorher ohnehin ist.',
    wearsChoose:
      'Keins von beiden: der Körper, den sie selbst gewählt haben. Für die meisten Level die richtige Antwort.',

    movement: 'Bewegung',
    moveSpeed: 'Gehen',
    moveSprint: 'Sprint',
    moveJump: 'Sprung',
    moveGravity: 'Schwerkraft',
    moveAcceleration: 'Anlauf',
    moveDrag: 'Ausrollen',
    movementBlurb:
      'Gehen und Sprint in Zellen pro Sekunde, Sprung in überwundenen Zellen, Schwerkraft in Zellen pro Sekunde im Quadrat. Anlauf steigert das Tempo, Ausrollen lässt es los — null heißt sofort, und das ist das übliche Gefühl. Ein geänderter Wert will gefahren werden, nicht gemessen.',

    holding: 'hält',
    nothing: 'nichts',
    avatarAt: 'Avatar bei',
    inHand: 'in der Hand',
    theHandItFinds: 'die Hand, die es findet',
    weaponBlurb:
      'Eine Waffe liest ihren Schaden und ihre Reichweite als Eigenschaften. Klicken zum Feuern.',
    notTheAvatar: 'Der Körper ist nicht der Avatar — den bringt mit, wer spielt.',
    inTheHand: 'In der Hand',
    reset: 'Zurücksetzen',
    size: 'Größe',
    handHintLead: 'Zellen und Grad, ausgehend vom eigenen Ursprung des Modells. Drücken Sie',
    handHintTail: ', um es in der Hand zu sehen.',

    keys: 'Tasten ·',
    addKey: '+ Taste',
    keysBlurb:
      'Bewegen, Springen und Tanzen funktionieren in jedem XP und kosten hier nichts. Dies sind die eigenen des Levels — jede sendet ihren Namen, und eine Regel entscheidet, was das bedeutet.',
    pressAKey: 'Taste drücken',
    pressAKeyToBind: 'Drücken Sie eine Taste, um sie zu belegen',
    whatItDoes: 'was sie tut',
    nameIt: 'benennen',
    wait: 'Pause',
    waitTitle: 'Sekunden, bis diese Taste wieder wirkt, bis zu {n}. Leer für keine.',
    unbind: 'Lösen',

    architecture:
      'Architektur, auf dem Ein-Meter-Gitter — es wird einmal in Zellen gerastert und bewegt sich nie. Was einen Namen oder eine Regel braucht, ist ein Objekt.',
    collidesAs: 'kollidiert als',
    drawnBoxes: 'gezeichnet · {n} Kästen',
    measuredShape: 'gemessene Form',
    walkThrough: 'durchgehen',
    drawnBlurb:
      'Kästen, die im Dokument gezeichnet sind, im eigenen Rahmen des Modells — sie drehen sich mit. Diese Einstellung zu verlassen wirft sie weg.',
    measuredBlurb:
      'Die gemessene Form ist das Modell, zur Bauzeit in Voxel zerlegt. Öffnungen schmaler als ein Meter überstehen das nicht,',
    colliderLead: 'und eine',
    colliderTail: 'Liste im JSON ist der Weg, einem seinen Durchgang zurückzugeben.',

    pitch: 'Neigung',
    roll: 'Rollen',
    tiltBlurbLead: 'Neigung in Grad, dann wie oft die eigene Größe entlang jeder der',
    itsOwn: 'eigenen',
    tiltBlurbTail:
      'Achsen. Ein gekipptes Ding kollidiert als der Kasten um die Kippung herum — größer, als es aussieht, nie kleiner.',

    savePoint: 'Speicherpunkt',
    order: 'Reihenfolge',
    savePointBlurb:
      'Nummeriert, wie Sie sie setzen. Der höchste erreichte gewinnt, also schickt ein früheres Feld auf einer Runde nie zurück — und zwei Felder mit derselben Nummer machen das zweite unerreichbar.',
    sign: 'Schild',
    whatItSays: 'was darauf steht',
    textColour: 'Textfarbe',
    plate: 'Platte',
    plateColour: 'Plattenfarbe',

    hangsFrom: 'Hängt an',
    nothingToHangFrom:
      'Noch nichts zum Anhängen. Geben Sie einem anderen Objekt einen Namen — eine Tür hängt an einem Schrank, und der Schrank muss einen haben.',
    nothingTheLevel: 'nichts — dem Level',
    itsOrigin: 'seinem Ursprung',
    noSockets: 'keine Anschlüsse daran',
    hangsBlurbLead: 'x, y, z und Drehung sind jetzt',
    relativeToIt: 'relativ dazu',
    hangsBlurbTail: '— und es nimmt dies mit, wenn es sich bewegt.',

    dragHint: 'Ziehen, um es über den Boden zu schieben — Umschalt für feiner',
    dragFooter: 'den Boden ziehen · der Balken ist die Höhe · Umschalt ist feiner',
    dragHeightHint: 'für die Höhe hoch und runter ziehen',
  },

  blueprints: {
    heading: 'Baupläne ·',
    cancel: 'Abbrechen',
    new: 'Neu',
    blurb:
      'Ein Bauplan ist eine Art Ding und nicht ein Ding: Jede Kiste geht auf dieselbe Weise kaputt, also wird das Kaputtgehen hier einmal geschrieben, und jede Kiste im Level ist eine davon. Ziehen Sie eine Zeile in die Ansicht, um eine hinzustellen.',
    newName: 'Kiste',
    add: 'Hinzufügen',
    noneYet: 'Noch keine. Ein Level aus lauter Wänden braucht keine.',

    starters: {
      checkpoint: {
        label: '+ Speicherpunkt',
        blurb: 'Wer darüber läuft, kommt beim Sterben hierher zurück statt an den Start.',
      },
      player: {
        label: '+ Spielfigur',
        blurb: 'Der Körper, als der Sie ankommen — und das Einzige, worauf ein Skript kann.',
      },
      peep: {
        label: '+ Peep',
        blurb: 'Stattdessen als Tier ankommen. Derselbe Körper, ein anderes Skelett.',
      },
      enemy: {
        label: '+ Gegner',
        blurb:
          'Jemand zum Abschießen: ein Körper mit Leben, der Punkte gibt, wenn er zu Boden geht.',
      },
    },

    model: 'Modell',
    seenAtPlay: 'Im Spiel sichtbar',
    skeleton: 'Skelett',
    avatar: 'Avatar',
    peep: 'Peep',

    pose: 'Haltung',
    howeverItStands: 'wie es eben steht',
    poseBlurb:
      'Gehalten, solange es still ist. Gehen, Fallen und Getroffenwerden sehen weiterhin so aus wie sie selbst — dies ist die Haltung, zu der es zurückkehrt.',
    spin: 'Drehen',
    angle: 'Winkel',
    or: 'oder',

    motions: 'Bewegungen ·',
    open: 'offen',
    addMotion: 'hinzu',
    motionsBlurbLead:
      'Eine benannte Folge, die dieses Ding ausführen kann — ein Deckel, der aufgeht, eine Klinge, die sich dreht, eine Kiste, die wackelt. Eine Regel spielt eine mit',
    play: 'abspielen',
    loop: 'Schleife',
    looping: ', in Schleife',
    waitStep: '— warten —',
    seconds: 'Sekunden',
    removeStep: 'Schritt entfernen',
    addStep: '+ Schritt',
    stepBlurbTurn: 'turn',
    stepBlurbSpin: 'geht auf diesen Winkel und bleibt,',
    stepBlurbSwing: 'ist Grad pro Sekunde,',
    stepBlurbAnd: 'und',
    stepBlurbShake: 'kommen zurück.',

    light: 'Licht',
    bright: 'hell',
    reach: 'Reichweite',
    lightBlurbLead:
      'Die Reichweite ist in Zellen; 0 ist ohne Grenze. Ein Skript kann alle drei ändern, während das Level läuft —',
    lightBlurbTail: 'nächstgelegenen werden gezeichnet.',

    physics: 'Physik',
    physicsOn: 'Es fällt, wer hineinläuft, stößt es an, und es löst aus',
    physicsOff: 'Kulisse: Es bleibt genau dort, wo Sie es hinstellen, bis eine Regel es bewegt.',
    collidesAs: 'Kollidiert als',

    tags: 'Marken',
    addATag: 'eine Marke hinzufügen …',
    orANew: 'oder eine neue',
    addTag: 'hinzu',

    script: 'Skript',
    noScript: 'kein Skript',
    scriptBlurb:
      'Jedes davon bekommt seinen eigenen Durchlauf — eigene Zähler, eigene Wartezeit. Regeln bleiben die bessere Antwort für alles, was zu ihnen passt.',

    properties: 'Eigenschaften',
    addProperty: 'Hinzufügen',
    rename: 'Umbenennen',
    delete: 'Löschen',

    parts: 'Teile ·',
    addPart: 'Hinzufügen',
    oneModel: 'Ein Modell.',
    addAnother: 'Fügen Sie',
    partsBlurb:
      'ein weiteres hinzu, um dies aus mehreren zusammenzusetzen — ein Sockel und ein Lauf, ein Pfosten und eine Lampe — jedes hängt am vorherigen, an einem Anschluss, wenn das Modell einen hat.',
    on: 'auf',
    removePart: 'Dieses Teil entfernen',
    name: 'Name',
    unnamed: 'ohne Namen',
    hangsFrom: 'hängt an',
    theBlueprintItself: 'dem Bauplan selbst',
    atSocket: 'am Anschluss',
    itsOrigin: 'seinem Ursprung',
    turn: 'Drehung',
    scale: 'Größe',
    partModel: 'Modell',

    alreadyABlueprint: 'Schon ein Bauplan',
    nameRules: 'Buchstaben, Ziffern, Bindestrich und Unterstrich',
    drawn: 'gezeichnet',
    aPlaceOnly: 'nur ein Ort',
    neverDrawnLead:
      'Wird im Spiel nie gezeichnet — ein Teleportziel, ein Wegpunkt. Trotzdem benannt,',
    spinPropBlurbLead:
      'Grad um die eigene Achse, gelesen aus einer Eigenschaft dieses Namens. Ein Skript dreht es mit',
    spinPropBlurbTail:
      ', oder mit Set/Add einer Regel auf Ziel self. Von allein dreht sich nichts.',
    degreesASecond: 'Grad pro Sekunde',
    degrees: 'Grad',
    lightBlurbMid: '. Nur die',
    boxMeasured: 'Ein Kasten, am Modell gemessen. Für fast alles richtig.',
    walkStraightThrough:
      'Direkt hindurchgehen — eine Münze, ein Sammelstück, ein Auslösebereich.',
    noScriptsYet:
      'Noch keine Skripte in diesem Level. Der Skripte-Bereich schreibt eines, und es kann hier oder dort angehängt werden.',
  },

  behaviour: {
    heading: 'Baupläne ·',
    addRule: '+ Regel',
    ruleOne: '{n} Regel',
    ruleMany: '{n} Regeln',
    noRules:
      'Nichts passiert, wenn Sie dies berühren. Eine neue Regel beginnt als „on enter, emit“ — was am Level nichts ändert und es auf dem HUD sagt, damit Sie sie feuern sehen, bevor Sie entscheiden, was sie tun soll.',
    pickABlueprint: 'Wählen Sie einen Bauplan, um zu sehen, was er tut.',
    neverFires:
      'Das feuert nie — das Level hat keinen Modus, also beendet es nichts. Setzen Sie einen unter Dokument, um ihm ein Ende zu geben.',

    on: 'bei',
    when: 'wenn',
    do: 'tue',
    deleteRule: 'Diese Regel löschen',
    addVerb: '+ Verb',
    destinationLead: 'Ein Ziel ist ein',
    destinationName: 'Name',
    destinationMid:
      '— ein leerer Knoten, ein Speicherfeld oder eine Markierung, die Sie benannt haben. Eine Art für sich funktioniert, solange es nur eine davon gibt:',
    destinationFinish: 'finish',
    destinationTail: 'in einem Lauf mit einem Ziel, und nichts mehr, sobald es zwei gibt.',

    nothingBound:
      'Nichts ist belegt — ein Druck braucht eine Taste. Fügen Sie unter Dokument eine hinzu und wählen Sie sie dann hier.',
    key: 'Taste',
    within: 'innerhalb',
    cells: 'Zellen',
    anyDistance: 'beliebig weit',
    compareToNumber: 'Stattdessen mit einer Zahl vergleichen',

    upTo: 'bis zu',
    noMotions: 'nichts in diesem Level hat bisher eine Bewegung — ein Bauplan baut eine',
    noCuts: 'dieses Level hat noch keine Schnitte — im Dokument-Panel entsteht einer',
    wholeBody: 'ganzer Körper',
    event: 'Ereignis',
    untilTold: 'bis gesagt wird',
    untilToldTitle:
      'Sekunden, bis es zurückkommt. Leer heißt, es bleibt aus, bis etwas es einschaltet.',
    socket: 'Anschluss',
    socketTitle:
      'An welchem Anschluss des Trägers es hängen soll. Leer ist dessen Ursprung.',
    removeVerb: 'Dieses Verb herausnehmen',
    nameItWillHave: 'Name, den es haben wird',
    pickExisting: 'Eines wählen, das es gibt',
    list: 'Liste',

    noBlueprintsYet:
      'Noch keine Baupläne. Eine Regel hängt an einer Art Ding und nicht an einer einzelnen Kiste — jede Kiste aus einem Bauplan bekommt dieselben Regeln, und das macht aus vierzig davon eine Bearbeitung.',
    bindAKeyFirst: 'pressed — erst eine Taste belegen',
    addAFieldFirst: 'world — erst ein Feld anlegen',
    noDataToCompare: 'Dieses Level erklärt keine Daten zum Vergleichen',
    compareToSomethingKept: 'Mit etwas vergleichen, das das Level behält',
    aNameNotPlaced: 'ein Name, der noch nicht gesetzt ist …',
    aRoomHere: 'ein Raum hier',
    anotherXp: 'ein anderes XP',
    theFrontRoom: 'main — der vordere Raum',
    aRoomInThisLevel: 'ein Raum in diesem Level',
    whichRoomTitle:
      'In welchen Raum dieses Levels man geht - das Level ändert sich nicht, nur in welchem Raum davon alle stehen.',
    whichXpTitle: 'Die Kennung des XP, das geöffnet wird - alle im Raum kommen mit.',

    sides: 'Seiten',
    by: 'um',
    along: 'entlang',
    alongTitle:
      'Die Marken, zwischen denen die Figur zieht - track-0, track-1, … - und die Eigenschaft auf der Figur, die sich merkt, auf welcher sie steht. Ein Name für beides, damit sie nicht auseinanderlaufen.',
    bump: 'schlagen',
    bumpTitle: 'Optional: ein Tag. Eine Figur, auf der man landet und die ihn trägt, wird an ihren Start zurückgeschickt.',
    aSide: 'eine Seite',
    aSideTitle: 'Eine Seite, die dieses Level nennt - rot, blau oder das Team einer Spawn-Marke.',
    tablesOwn: 'Vorgabe des Tischs',
    tablesOwnTitle: 'Wie lange der Raum abstimmen darf, in Sekunden. Leer ist die Vorgabe des Schiedsrichters.',
    passNote: 'gibt den Zug an den nächsten Platz weiter',
    raidNote: 'nimmt zufällig aus dem Spielstand von jemand anderem - siehe den visit-Block',
  },

  animator: {
    rigs: { dummy: 'Puppe', peepz: 'Peep' },
    bones: {
      hips: 'Hüfte',
      spine: 'Wirbelsäule',
      chest: 'Brust',
      head: 'Kopf',
      upperarml: 'Schulter L',
      lowerarml: 'Ellbogen L',
      wristl: 'Handgelenk L',
      handl: 'Hand L',
      upperarmr: 'Schulter R',
      lowerarmr: 'Ellbogen R',
      wristr: 'Handgelenk R',
      handr: 'Hand R',
      upperlegl: 'Hüfte L',
      lowerlegl: 'Knie L',
      footl: 'Fuß L',
      toesl: 'Zehen L',
      upperlegr: 'Hüfte R',
      lowerlegr: 'Knie R',
      footr: 'Fuß R',
      toesr: 'Zehen R',
      body: 'Körper',
      tail: 'Schwanz',
      'wing-left': 'Flügel L',
      'wing-right': 'Flügel R',
      'leg-front-left': 'Vorne L',
      'leg-front-right': 'Vorne R',
      'leg-back-left': 'Hinten L',
      'leg-back-right': 'Hinten R',
    },
    groups: {
      torso: 'Rumpf',
      arms: 'Arme',
      legs: 'Beine',
      tail: 'Schwanz',
      wings: 'Flügel',
      body: 'Körper',
    },

    dockLead:
      'Ziehen Sie die Punkte, um den Körper zu posieren, und halten Sie die Haltung auf dem Streifen fest.',
    dockSaveToLevel: 'Ins Level sichern',
    dockTail:
      'legt jeden Clip der Sammlung in dieses Dokument, wo eine Haltung, eine Regel oder ein Skript ihn benennen kann.',
    fill: 'Ganz',
    normalize: 'Zurück',
    stageHint:
      'einen Punkt ziehen zum Posieren · mit Umschalt über den Boden schieben · Rad oder Pinch zum Zoomen',
    holdsTitle: 'In der Hand',
    holdsHint:
      'Was die Spielfigur hält, und wie es sitzt. Dasselbe Feld wie im Eigenschaften-Panel, hier, weil ein Griff nach Augenmaß eingestellt wird.',
    holdsWhat: 'hält',
    holdsNothing: 'nichts',
    holdsScale: 'Größe',
    movePad: '{bone} bewegen',
    liftKnob: '{bone} heben und senken',
    liftLocked: 'Auf {axis} gesperrt. Den leuchtenden Buchstaben oder Escape drücken, um wieder zu heben.',
    oneFingerToCamera: 'Einen Finger der Kamera überlassen',
    look: 'Blick',
    lockFree: 'frei',
    lockTitle: 'In jede Richtung ziehen',
    lockAxisTitle: 'Nur entlang {axis} ziehen',
    lockHint:
      'X, Y und Z sperren ein Ziehen auf eine Achse. Noch einmal drücken oder Escape für frei.',
    floor: 'Boden',
    body: 'Körper',
    model: 'Modell',
    bones_: 'Knochen',
    bodyHint: 'Welches Skelett Sie animieren. Jedes hat seine eigene Arbeitsdatei.',
    clipsHint: 'Alle liegen in einer Datei. Die Zeitleiste zeigt den hellen.',
    movesHint: 'Ab dem Abspielkopf gestempelt, über das, was schon da ist.',
    levelHint: 'Die Clips, die dieses Dokument trägt, und was eine Haltung oder eine Regel benennen kann.',
    saveNToLevel: '{n} ins Level sichern',
    oneFrame: 'Ein Bild',
    undoRedoDepth: 'Rückgängig und Wiederholen, {n} tief',
    straighten: '{bone} geradestellen',
    pin: '{bone} feststecken',
    unpin: '{bone} lösen',

    clips: 'Clips',
    newClip: 'Neu',
    copyClip: 'Kopie',
    clip: 'Clip',
    name: 'Name',
    fps: 'Bilder pro Sekunde',
    lengthSeconds: 'Länge (s)',
    easeOut: 'Aus dem Schlüssel unter dem Abspielkopf ausblenden',
    dragItsDot: 'Ziehen Sie seinen Punkt in der Ansicht, oder drehen Sie ihn hier genau.',
    pickADot: 'Wählen Sie einen Punkt in der Ansicht oder einen Namen darunter.',

    moves: 'Bewegungen',
    speed: 'Tempo',
    movesBlurb:
      'Jede schreibt nur die Knochen, die sie benennt, also ergeben Walk und dann Arm swing an derselben Stelle einen ganzen Gang — und keine hat den Kopf angerührt, den Sie posiert haben.',
    presets: {
      dummy: {
        walk: { label: 'Gehen', hint: 'Nur Beine. Stempeln Sie den Armschwung darüber.' },
        run: { label: 'Laufen', hint: 'Nur Beine, längerer Schritt und mehr Knie.' },
        armswing: {
          label: 'Armschwung',
          hint: 'Nur Arme. Gegengleich zum Bein derselben Seite.',
        },
        wave: {
          label: 'Winken',
          hint: 'Rechter Arm hoch, Unterarm winkt. Lässt alles andere in Ruhe.',
        },
        dance: {
          label: 'Tanzen',
          hint: 'Das ganze Programm: Wippen, Arme hoch und ein Kopf, dem es gefällt.',
        },
        idle: {
          label: 'Ruhe',
          hint: 'Stehen, atmen, Arme unten. Was eine Figur tut, wenn nichts passiert.',
        },
        jump: {
          label: 'Springen',
          hint: 'Ducken, abstoßen, anziehen, landen. Bewegt die Wurzel, hebt also vom Boden ab.',
        },
      },
      peepz: {
        walk: {
          label: 'Gehen',
          hint: 'Beine und ein Rollen. Vier Schlüssel, wo der Clip fünfzehn hat.',
        },
        run: {
          label: 'Laufen',
          hint: 'Der Sprunglauf: beide vorn, beide hinten, und der Körper neigt sich mit.',
        },
        idle: {
          label: 'Ruhe',
          hint: 'Ein langsames Wiegen, Beine bleiben in Ruhe. Das Ding, das unter alles andere gehört.',
        },
        dance: {
          label: 'Tanzen',
          hint: 'Körper und Schwanz, doppelt so weit wie in der Ruhe. Die Beine bleiben stehen.',
        },
        wag: {
          label: 'Wedeln',
          hint: 'Nur der Schwanz, damit es sich über einen Gang legt.',
        },
        flap: {
          label: 'Flattern',
          hint: 'Nur Flügel. Die vier Tiere, die welche haben; beim Rest nichts.',
        },
      },
    },

    pose: 'Haltung',
    copyKey: 'Schlüssel kopieren',
    pasteKey: 'Schlüssel einfügen',
    backToRest: 'Zurück zur Ruhehaltung',
    poseBlurb:
      'Kopieren nimmt den ganzen Schlüssel — die Haltung und ihre Abfederung. Eine Schleife schließen heißt: Bild eins kopieren, ans Ende spulen, einfügen.',

    save: 'Sichern',
    saveWork: 'Arbeit sichern',
    open: 'Öffnen',
    fileBlurbLead: 'Die',
    fileBlurbTail:
      ': Schlüssel, Abfederung, Timing, für welches Rig sie ist, und die Formatversion. Es ist die einzige Datei, die dieses Werkzeug schreibt, und die einzige, die es öffnet.',
    level: 'Level',
    saveToLevel: 'ins Level',
    nothingInLevel: 'Aus dieser Sammlung ist noch nichts im Level.',
    savedAsSamples:
      'Als Abtastwerte gesichert, einer je Bild — etwa {kb} KB für diese {n}. Die Arbeitsdatei bleibt die bearbeitbare; ein gesicherter Clip lässt sich nicht wieder in diese Zeitleiste öffnen.',

    shortcuts: 'Tastenkürzel',
    playOrPause: 'Abspielen oder anhalten',
    keyThePose: 'Die Haltung hier festhalten',
    removeTheKey: 'Den Schlüssel hier entfernen',
    nextOrPrevious: 'Nächster oder voriger Schlüssel',
    backToStart: 'Zurück zum Anfang',
    copyAndPaste: 'Schlüssel kopieren und einfügen',
    moveAlongFloor: 'Über den Boden bewegen',

    pasteInstead: 'Stattdessen eine Animation einfügen …',
    apply: 'Übernehmen',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    previousKey: 'Voriger Schlüssel',
    nextKey: 'Nächster Schlüssel',
    autoKey: 'Auto-Schlüssel',
    loop: 'Schleife',

    notes: {
      nothingToSaveOne:
        'Nichts zu sichern: Dieser Clip hat noch keine posierten Knochen, also steckt keine Animation darin.',
      nothingToSaveMany:
        'Nichts zu sichern: Diese Clips haben noch keine posierten Knochen, also steckt keine Animation darin.',
      savedOne:
        '{n} Clip ins Level gesichert. Eine Haltung, eine Regel oder ein Skript kann jeden davon benennen.{skipped}',
      savedMany:
        '{n} Clips ins Level gesichert. Eine Haltung, eine Regel oder ein Skript kann jeden davon benennen.{skipped}',
      skippedOne: ' {names} wurde übersprungen — darin ist noch nichts posiert.',
      skippedMany: ' {names} wurden übersprungen — darin ist noch nichts posiert.',
      openedOld:
        '„{name}“{many} geöffnet — {keys} Schlüssel. Sie sagt Version {declared}, und dieser Editor kennt Version {known}, also wurde alles Neuere verworfen.',
      opened: '„{name}“{many} geöffnet — {keys} Schlüssel, {seconds}s bei {fps} fps.',
      ofMany: ' von {n}',
      stamped:
        '{preset} ab {at}s gestempelt — {length}s davon. Es hat nur die Knochen berührt, die es benennt, alles andere, was Sie posiert haben, ist noch da.',
    },
  },

  scenes: {
    heading: 'Orte',
    lead: 'Die Räume, die dieses Level hat. Ein load-Verb schickt jemanden in einen, und eine Runde kann einen als Spielort nennen.',
    theLevelItself: 'das Level selbst',
    rename: 'umbenennen',
    remove: 'entfernen',
    add: 'hinzufügen',
    namePlaceholder: 'ein Name für den Raum',
    nameRule: 'Kleinbuchstaben, Ziffern und Bindestriche. „main“ ist die eigene Welt des Levels.',
    openIt: 'Doppelklick, um in diesem Raum zu arbeiten',
    standingHere: 'du bist hier drin',
    door: '+ Tür',
    doorTitle: 'legt einen Weg in diesen Raum in den, in dem du gerade arbeitest',
  },

  movies: {
    heading: 'Filme',
    lead: 'Ein Film ist eine leere Bühne mit Zeitachse: stell Körper hinein oder importiere einen fertigen Raum. Schneide zusammen und exportiere.',
    newMovie: '+ neuer Film',
    newMovieTitle: 'eine leere Bühne mit Zeitleiste — stell Modelle hinein',
    noMoviesYet: 'Noch keine Filme. Ein Film ist eine leere Bühne: leg einen an, stell Körper hinein und richte eine Kamera aus.',
    importFrom: 'import…',
    importTitle: 'kopiert Kulisse und Besetzung eines anderen Raums in diesen Film',
    openIt: 'öffnen',
    openItTitle: 'öffnet diese Einstellung im Film-Editor',
    runsFor: '{seconds}s mit {fps}fps',
    stopBeingAMovie: 'kein Film mehr',
    stopSure: 'nochmal drücken - die Keys gehen verloren',
    cuts: 'Schnitte',
    cutsLead: 'Einstellungen der Reihe nach, beschnitten und im Tempo geändert. Dieselbe Einstellung darf mehrfach vorkommen.',
    addACut: '+ Schnitt',
    emptyCut: 'noch keine Einstellungen darin',
    takeCount: '{n} Einstellungen, {seconds}s',
    takeCountOne: '1 Einstellung, {seconds}s',
    openComposer: 'schneiden',
    openComposerTitle: 'öffnet diesen Schnitt im Schnittfenster',
    removeCut: 'entfernen',
    removeCutSure: 'nochmal drücken',
    cutNamePlaceholder: 'ein Name für den Schnitt',
    nothingIsAShot: 'Hier ist noch nichts eine Einstellung. Leg oben einen Film an.',
    needAShotFirst: 'Leg zuerst einen Film an — ein Schnitt entsteht aus ihnen.',
  },

  movie: {
    editingAShot: 'Einstellung',
    composing: 'Schnitt',
    close: 'schließen',
    closeTitle: 'zurück zum Editor (Escape)',
    play: 'abspielen',
    pause: 'pausieren',
    toStart: 'an den Anfang',
    view: 'Blick',
    freeLook: 'frei',
    freeLookTitle: 'flieg herum, um einen Blickwinkel zu finden. Die Maus bewegt diesen hier.',
    theCut: 'der Schnitt',
    theCutTitle: 'so ansehen, wie es exportiert wird',
    cameras: 'Kameras',
    addCamera: '+ Kamera hier',
    addCameraTitle: 'setzt eine Kamera dorthin, von wo du gerade schaust',
    keyHere: 'hierher bewegen',
    keyHereTitle: 'lässt diese Kamera zu diesem Zeitpunkt durch deinen jetzigen Blickwinkel gehen',
    cutHere: 'hierhin schneiden',
    cutHereTitle: 'ab diesem Moment ist das Bild auf dieser Kamera',
    removeCamera: 'entfernen',
    ease: 'ankommen',
    easeTitle: 'an jedem Bildausschnitt ankommen und verweilen, statt durchzufahren',
    cast: 'Besetzung',
    nobodyNamed: 'Nichts an diesem Ort hat einen Namen.',
    nobodyNamedLead: 'Eine Zeitleiste bewegt Dinge über ihren Namen. Gib einem Darsteller im Eigenschaften-Panel einen Namen, dann steht er hier.',
    selectAnActor: 'Wähl jemanden aus, um Keys zu setzen.',
    key: 'Key',
    keyTitle: 'hält diesen Wert zu diesem Zeitpunkt fest',
    clearKeys: 'alle Keys löschen',
    plays: 'Spielt',
    playsTitle: 'dieser Körper spielt ab diesem Moment einen Clip',
    clip: 'Clip',
    loop: 'Schleife',
    length: 'Länge',
    rate: 'Rate',
    backdrop: 'Dahinter',
    backdropNone: 'nichts',
    backdropColour: 'eine Farbe',
    backdropImage: 'ein Bild',
    backdropSky: 'ein Himmel',
    backdropPath: '/eine-datei-in-public.png',
    backdropNoneBlurb: 'Nichts dahinter heißt: ein gespeichertes Bild ist freigestellt. Video kennt keine Transparenz, eine Aufnahme davon wird also schwarz — gib ihr vorher eine Farbe oder ein Bild.',
    exportHeading: 'Export',
    saveFrame: 'dieses Bild speichern',
    saveFrameTitle: 'dieser Moment, als PNG',
    record: 'aufnehmen',
    recording: 'nimmt auf…',
    stopRecording: 'stopp',
    recordTitle: 'spielt es ab und nimmt auf, was du siehst, als WebM',
    cannotRecord: 'Dieser Browser kann kein Canvas aufnehmen.',
    droppedFrames: '{dropped} von {wanted} Bildern verloren — die Szene ist schwerer als das Frame-Budget. Nimm sie kleiner auf oder vereinfache sie.',
    ffmpegHint: 'So wird ein mp4 daraus:',
    shots: 'Einstellungen',
    addShot: '+ Einstellung',
    noShots: 'Noch nichts in diesem Schnitt. Füg eine Einstellung hinzu.',
    trim: 'Beschnitt',
    speed: 'Tempo',
    removeTake: 'entfernen',
    copyTake: 'kopieren',
    copyTakeTitle: 'dieselbe Einstellung gleich noch einmal danach',
    takeOf: 'Take {n} von {of}',
    goToTakeTitle: 'setzt den Abspielkopf auf diesen Take',
    earlier: 'früher',
    later: 'später',
    totalLength: '{seconds}s insgesamt',
    nothingAtThisMoment: 'Nichts zu diesem Zeitpunkt.',
    warmUpFirst: 'Dieser Schnitt wechselt den Ort. Spiel ihn einmal ganz durch, bevor du aufnimmst — das erste Bild nach einem Wechsel zu einem Ort, dessen Modelle noch nicht geladen sind, ist leer, und in einer Datei ist das ein schwarzes Bild.',
    addActor: '+ Darsteller',
    addActorTitle: 'stellt jemanden vor die Kamera',
    theAvatar: 'Avatar',
    thePeepz: 'Peepz',
    theProps: 'Requisiten',
    findAModel: 'suchen…',
    addEmpty: '+ leer',
    addEmptyTitle: 'ein Griff, der nichts zeichnet — häng Dinge daran und beweg sie zusammen',
    hangsOff: 'an',
    nothing: 'nichts',
    willAddPack: 'Dieses Level hat das Pack noch nicht — ein Modell daraus fügt es hinzu.',
    packs: 'Packs',
    packsTitle: 'Alle Packs ansehen, im Vollbild.',
    browsePacks: 'durchsehen…',
    orDragOne: 'Klicken stellt es ins Bild, Ziehen stellt es auf die Bühne.',
    duplicate: 'duplizieren',
    duplicateTitle: 'Noch eine, eine Zelle daneben, mit Kindern und Keys.',
    theCamera: 'Kamera',
    headLooksAt: 'schaut auf',
    aim: 'Kopf ausrichten',
    aimTitle: 'Dreht den Kopf dorthin, so weit ein Hals reicht. Danach nachjustieren.',
    toolMove: 'bewegen',
    toolTurn: 'drehen',
    toolSize: 'größe',
    sizeIsOne: 'Eine Zahl: ein Körper skaliert gleichmäßig.',
    aMove: 'gehen',
    aTurn: 'drehen',
    aJump: 'springen',
    addMoveTitle: 'Geht irgendwohin. Beginnt dort, wo sie schon steht.',
    addTurnTitle: 'Dreht sich auf der Stelle. Beginnt bei ihrer eigenen Blickrichtung.',
    addJumpTitle: 'Verlässt den Boden und kommt zurück.',
    nothingYet: 'Noch nichts. Ein Block erscheint auf dem Streifen.',
    atForSeconds: '{t}s für {n}s',
    starts: 'beginnt',
    lasts: 'dauert',
    facing: 'Richtung',
    howHigh: 'wie hoch',
    loops: 'wiederholt',
    dropActionTitle: 'Nimmt diese Aktion aus der Szene.',
    actionKinds: { move: 'Gehen', turn: 'Drehen', jump: 'Springen', play: 'Abspielen', say: 'Sagen' },
    loopFrom: 'ab',
    loopFromTitle: 'Ab hier wiederholen. Play läuft diesen Abschnitt immer wieder.',
    loopTo: 'bis',
    loopToTitle: 'Bis hierhin wiederholen.',
    loopingRange: '↻ {a}–{b}s',
    loopOffTitle: 'Wiederholung beenden und wieder die ganze Szene spielen.',
    leavesAt: 'ab {t}s',
    easeNames: { hold: 'halten', linear: 'gerade', smooth: 'weich' },
    easeTitles: {
      hold: 'Bleibt hier und springt dann. Der einzige Weg zu einem Schnitt statt eines Übergangs.',
      linear: 'Geht geradewegs dorthin, mit gleicher Geschwindigkeit.',
      smooth: 'Läuft langsam an und kommt langsam an.',
    },
    dropKeyTitle: 'Nimmt diesen Key heraus.',
    addToPick: '+ wählen',
    addToPickTitle: 'Weiter wählen fügt zur Auswahl hinzu, statt sie zu ersetzen. Umschalt macht dasselbe auf einer Tastatur.',
    showControls: 'regler',
    hideControls: 'ausblenden',
    seeIt: 'ansehen',
    seeItTitle: 'Zeigt den Clip am Körper, ohne ihn in die Szene zu setzen.',
    markASpan: 'Ziehen markiert einen Abschnitt zum Wiederholen. Ein Tipp löscht ihn.',
    framings: 'gerahmt bei',
    dropFramingTitle: 'Nimmt diese Einstellung von der Kamera. Die anderen bleiben.',
    moments: 'momente',
    goToMoment: 'Setzt den Abspielkopf hierher und zeigt diese Pose.',
    dropMomentTitle: 'Nimmt diesen Moment aus der Animation.',
    lock: 'sperre',
    lockTitle: 'Hält eine Achse fest, damit das Pad sie nicht bewegt. Die Regler schon.',
    deleteActor: 'löschen',
    deleteActorTitle: 'Nimmt diese hier von der Bühne, samt allem, was daran hängt.',
    deleteActorSure: 'wirklich löschen?',
    oneModel: '1 Modell',
    someModels: '{n} Modelle',
    andMore: 'Zeigt die ersten {n}. Tipp etwas, um einzugrenzen.',
    nothingMatches: 'Nichts in diesem Pack passt dazu.',
    setIsBuiltInTheEditor: 'Hier nur Körper. Kulisse baust du im Editor, da ist der Pinsel.',
    oneCamera: '1 Kamera',
    someCameras: '{n} Kameras',
    oneActor: '1 Körper',
    someActors: '{n} Körper',
    keyedCount: '{n} mit Keys',
    shot: 'Einstellung',
    does: 'Tut',
    autoKey: 'Auto-Key',
    autoKeyTitle: 'An: ein Regler setzt einen Key an der Abspielposition. Aus: er verschiebt, wo der Körper startet.',
    shownHere: 'ab hier sichtbar',
    clearKeysSure: 'nochmal drücken',
    pose: 'Pose',
    cuePose: 'ab hier halten',
    cuePoseTitle: 'spielt diese Pose ab der Abspielposition, so lang du den Block ziehst',
    clearPose: 'aufrichten',
    poseIsSaved: 'Einen Knochen zu drehen speichert die Pose ins Level und legt sie auf den Körper — es gibt nichts zu drücken. Zieh den Block auf der Leiste, um sie länger zu halten.',
    animate: 'Körper animieren',
    animateTitle: 'im Animator posen, den Clip ins Level speichern und hier einsetzen',
    says: 'sagt',
    saysTitle: 'eine Sprechblase über dem Kopf, ab diesem Moment',
    line: 'was sie sagen',
    forSeconds: 'für',
    moveIt: 'ziehen',
    aimIt: 'zielen',
    stands: 'bei',
    looksAt: 'sieht',
    lens: 'Objektiv',
    frame: 'Format',
  },

  flow: {
    whichRound: 'Welche Runde',
    roundAny: 'Dieses Level',
    roundAnyBlurb: 'Die Runde, die dieses Level spielt, wenn nichts Genaueres gesagt ist.',
    roundModeBlurb: 'Eine eigene Runde für diesen Modus. Ohne sie spielt er die des Levels.',
    modes: {
      space: 'Ort',
      lobby: 'Lobby',
      battle: 'Partie',
    },
    noRound: 'Dieses Level beschreibt keine Runde.',
    startAFlow: 'einen Ablauf starten',
    noRoundAtAll: 'gar keine Runde',
    noRoundSure: 'nochmal drücken - alle Phasen gehen verloren',
    theOpeningPhase: 'die Phase, in der eine Runde beginnt',
    shapes: 'Was für ein Spiel ist das?',
    shapesLead:
      'Ein Level ist eine lebendige Welt, oder es spielt einen Lauf. Ein Lauf hat Stationen — Anstoß, Spiel, Abpfiff; würfeln, ziehen, nächster Platz — und diese Stationen zeichnen Sie hier. Wählen Sie die Form, die Ihrer am nächsten kommt, und verschieben Sie ihre Teile.',
    starters: {
      live: {
        name: 'Eine lebendige Welt',
        blurb:
          'Kein Anfang und kein Ende. Leute kommen und gehen, und was das Level in seinen Raum- und geteilten Feldern hält, ist morgen noch da. Die meisten Level sind das.',
      },
      countdown: {
        name: 'Countdown, dann los',
        blurb:
          'Ein angehaltener Atem und dann alles auf einmal. In den ersten Sekunden kann sich niemand bewegen — so startet ein Rennen oder ein Gerangel fair.',
      },
      match: {
        name: 'Anstoß, Spiel, Abpfiff',
        blurb:
          'Ein Match mit Uhr. Drei Sekunden zum Aufstellen, drei Minuten Spiel, und ein Pfiff, über den niemand streitet. Punkte- und Zeitlimit stehen unter Modus.',
      },
      rounds: {
        name: 'Best of three',
        blurb:
          'Derselbe Kampf dreimal, mit Verschnaufpause dazwischen. Ein Rundenzähler, den das Level führt, und bei drei ist das Match vorbei.',
      },
      board: {
        name: 'Würfeln, ziehen, nächster Platz',
        blurb:
          'Ein Zug, der um den Tisch geht. Würfeln, ziehen solange Sie dran sind, weitergeben. Kommt mit Würfel und Tasten — es spielt, bevor Sie eine einzige Figur gesetzt haben.',
      },
    },
    current: 'dieses Level jetzt',
    use: 'diese Form nehmen',
    playedAs: 'Wo es gespielt werden kann',
    playedAsLead:
      'Jedes Level kann als Raum stehen bleiben, in den man einfach hineingeht. Ein Level, das nur ein Spiel ist - ein Tisch für vier, ein Spielfeld - kann das hier sagen, und die Raum-Option verschwindet.',
    capabilities: {
      freeplay: {
        name: 'Als Raum',
        blurb: 'Jeder im Space kann es stehen lassen und hineingehen. Die Dinge funktionieren, nichts endet.',
      },
      match: {
        name: 'Als Battle',
        blurb: 'Die Battle-Lobby kann hier ein Match starten: Seiten, Punkte, ein Ende. Braucht einen Spawn je Seite.',
      },
      football: {
        name: 'Als Ballspiel',
        blurb: 'Ein Tor an jedem Ende, damit ein Ball Punkte bringt.',
      },
      competition: {
        name: 'Als Rennen',
        blurb: 'Ein Start und ein Ziel, damit zwei Läufe verglichen werden können.',
      },
    },
    presetLeansOn: 'der Modus {preset} braucht das - ändern Sie zuerst den Modus',
    atLeastOne: 'ein Level ist als mindestens eines spielbar',
    stages: 'Stationen',
    orBlank: 'Oder benennen Sie die erste Phase und zeichnen den Rest selbst:',
    startOver: 'mit einer Form neu anfangen',
    startOverNote: 'Ersetzt die Phasen oben. Rückgängig bringt sie zurück.',
    makeStart: 'zum Start machen',
    start: 'Start',
    aNewPhase: 'eine neue Phase',
    add: 'hinzu',
    remove: 'weg',
    cancel: 'abbrechen',
    unreachable: 'unerreichbar',

    allow: 'erlaube',
    endsGroup: 'der Lauf selbst',
    goNextRound: 'die nächste Runde',
    goEnd: 'das Ende des Laufs',
    rounds: 'Runden',
    roundsOnce: 'einmal gespielt',
    roundsHint:
      'Wie oft die Runde gespielt wird, bevor der Lauf vorbei ist. Ein Pfeil auf „die nächste Runde“ zählt eine und öffnet die nächste.',
    roundsNeedsSeam: 'Noch kein Pfeil auf die nächste Runde, also würde dies einmal gespielt.',
    who: 'wer',
    whoTurn: 'nur wer am Zug ist',
    whoNote:
      'Die Tasten oben sind für die Person am Zug aktiv und werden sonst niemandem gezeichnet. Bevor Züge beginnen - oder allein gespielt - behalten sie alle.',
    whatAPlayerCanDo: 'was eine Spielfigur hier darf',
    everything: 'alles',
    noKeys: 'dieses Level belegt keine Tasten',
    says: 'sagt',
    dragBetweenLead:
      'Ziehen Sie zwischen zwei Knoten oben, um einen Pfeil zu setzen. Das',
    dragBetweenTail:
      'einer Phase läuft einmal beim Betreten — nicht jedes Bild, dafür ist eine Regel da.',
    nothingOnEntering: 'nichts beim Betreten — die Phase wartet nur',
    does: 'tut',
    addVerb: '+ Verb',
    noWayOut: 'kein Ausgang',
    nothingLeaves:
      'hier geht nichts weiter — ein Lauf, der ankommt, bleibt, und genau das ist ein Ende',
    whereThisArrowGoes: 'Wohin dieser Pfeil führt',
    anEventARuleEmits: 'ein Ereignis, das eine Regel sendet',

    wins: 'gewinnt',
    sayWhenItIsWon: 'sagen, wann es gewonnen ist',
    nothingStartsOver: 'hier fängt nichts von vorn an',
    anEndingCounts:
      'Ein Ende zählt etwas, das von vorn anfängt — legen Sie im Datenbereich ein Feld mit dem Bereich „run“ an',
    endingNeedsRunLead:
      'Ein Ende zählt etwas, das von vorn anfängt. Ein Feld, das im Raum oder je Person liegt, trägt noch die Zahl vom letzten Spiel — der nächste Lauf wäre gewonnen, bevor sich jemand bewegt hat. Legen Sie eines mit dem Bereich',
    neverEnds: 'endet nie',
    // `run` is the value somebody types into `scope`, not a word - the sentence
    // around it reads "declare one with scope `run`". It said 'Lauf' here,
    // which named a scope the parser has never heard of.
    run: 'run',
    clockNote:
      'Das einzige Feld hier, das eine Uhr braucht, auf die sich alle einigen. Ein rundenbasierter Ablauf will keine.',
    noData: 'dieses Level erklärt keine Daten',
    nothing: 'nichts',
  },

  scripts: {
    heading: 'Skripte ·',
    blurb:
      'Ein Skript ist, was eine Regel nicht sein kann: eine Position, die vom letzten Bild abhängt, ein Zähler, wie lange etwas her ist, eine Frage über ein anderes Objekt. Trigger und Verben bleiben die bessere Antwort für alles, was zu ihnen passt — sie lesen sich als drei Zeilen statt als dreißig.',
    newName: 'Geschütz',
    add: 'Hinzufügen',
    cancel: 'Abbrechen',
    new: 'Neu',
    alreadyAScript: 'Schon ein Skript',
    nameRules: 'Buchstaben, Ziffern, Bindestrich und Unterstrich',
    noneYet: 'Noch keine.',
    rename: 'Umbenennen',
    delete: 'Löschen',

    run: 'Laufen lassen',
    notAttached:
      'Noch an nichts angehängt, ein Lauf hätte also nichts, wofür er laufen könnte. Hängen Sie es zuerst unten an.',
    frames: '{n} Bilder · eine Sekunde world.time',
    ranAndSaidNothing:
      'Es lief und sagte nichts, und genau das tut ein Skript ohne `log`. Fügen Sie eines hinzu, um zu sehen, wie weit es kam.',
    runsOn: 'Läuft auf',
    noBlueprints:
      'Noch keine Baupläne. Ein Skript läuft auf einer Art Ding, nicht auf dem Level.',
  },

  data: {
    heading: 'Was dieses Level behält',
    blurbLead:
      'Eine Zahl, die das Schließen des Tabs überlebt. Regeln lesen und schreiben sie mit',
    world: 'world',
    blurbTail: 'als Ziel, unter Verhalten.',
    noneYet:
      'Noch nichts, und das ist für die meisten Level richtig — ein Raum, der sich nichts merkt, kostet nichts und braucht kein Konto dahinter. Legen Sie ein Feld an, wenn etwas morgen noch stimmen soll: gesammelte Münzen, eine Tür, die jemand geöffnet hat, eine Bestzeit.',
    newName: 'muenzen',
    add: 'hinzu',
    seenBy: 'gesehen von',
    startsAt: 'beginnt bei',
    pressAgainToRemove: 'Noch einmal drücken, um dieses Feld zu entfernen',
    removeThisField: 'Dieses Feld entfernen',
    nameRules:
      'Kleinbuchstaben, Ziffern und Bindestriche, beginnend mit einem Buchstaben — wie bei einem Objektnamen.',
    alreadyAField: 'Es gibt bereits ein Feld namens {name}.',
    full:
      '{n} Felder sind das Höchste, was ein Level erklären darf. Ein größeres Modell ist meist ein Ding, das sich als dreißig ausgibt — eine einzelne Zahl, die einen Zustand benennt, statt einer Markierung je Fall.',
  },

  words: {
    heading: 'Was dieses Level sagt',
    blurb:
      'Das Englische ist der Schlüssel. Alles, wofür eine Sprache keine Zeile hat, wird so gedruckt, wie es geschrieben steht — eine halbfertige Übersetzung liest sich also als Englisch und nicht als Lücke.',
    noLanguages:
      'Keine weiteren Sprachen, und das ist für die meisten Level richtig — eine ist ein ganzes Spiel. Fügen Sie eine hinzu, wenn tatsächlich jemand darum gebeten hat, das darin zu lesen.',
    nothingToTranslateLead:
      'Noch nichts zu übersetzen. Ein Level sagt etwas, sobald es eine Beschreibung hat oder sobald ein Skript aufruft',
    codeLabel: 'Ein Sprachcode zum Hinzufügen, etwa de oder pt-BR',
    codePlaceholder: 'de',
    add: 'hinzu',
    language: 'Sprache',
    keys: 'Schlüssel',
    keysHint:
      'Ein Schlüssel ist der englische Satz, den das Level ausgibt - der Titel, die Beschreibung, alles, was ein Skript mit t(\'…\') sagt. Die stehen von selbst hier; fügen Sie einen hinzu für eine Zeile, die ein Skript später ausgeben wird.',
    keyLabel: 'Ein neuer Schlüssel - der englische Satz',
    keyPlaceholder: 'Drücke E, um das Tor zu öffnen',
    addKey: 'Schlüssel hinzu',
    keyColumn: 'Schlüssel',
    removeLanguage: '{code} und alles darin Geschriebene entfernen',
    inThisLanguage: 'In dieser Sprache: {phrase}',
  },

  shell: {
    leave: 'Den Editor verlassen',
    menu: 'Menü',
    moreLevel: 'Mehr vom Level',
    lessLevel: 'Mehr vom Panel',
    goBackToDisk: 'Zurück zu dem, was auf der Platte liegt',
    tryIt: 'Ausprobieren — das Level spielen, wie es dasteht',
    tryingIt: 'Wird ausprobiert',
    asItStands: '· wie es dasteht, gesichert oder nicht · sonst ist niemand hier',
    tryingRoom: 'Start in {room}',
    stop: 'Stopp — Esc',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    saving: 'Wird gesichert …',
    save: 'Sichern',
    export: 'Exportieren',
    log: 'Protokoll',
    oldestDropped: 'ältere ab {n} verworfen',
    draft: 'Entwurf',
    saved: 'gesichert',
    placements: 'Platzierungen',
    entities: 'Objekte',
    tools: 'Werkzeuge',
    onDisk: 'auf der Platte',
    toolNames: {
      select: 'Auswählen',
      hand: 'Hand',
      place: 'Setzen',
      draw: 'Zeichnen',
      erase: 'Radieren',
      line: 'Linie',
      rect: 'Füllen',
      room: 'Raum',
    },
    handles: { translate: 'Verschieben', rotate: 'Drehen', scale: 'Größe' },
    viewport: 'Ansicht',
  },

  camera: {
    heading: 'Kamera',
    kinds: { follow: 'folgend', side: 'seitlich', fixed: 'fest' },
    kindBlurbs: {
      follow: 'Hinter dem Körper, blickt, wohin Sie blicken - erste oder dritte Person',
      side: 'Flach von der Seite, entlang einer Achse - ein Jump ’n’ Run',
      fixed: 'An einem Punkt der Welt festgenagelt, beobachtet die Spielfigur oder starrt in eine Richtung',
    },
    runsAlong: 'verläuft entlang',
    standOff: 'Abstand',
    cellsTall: 'Zellen hoch',
    behind: 'dahinter',
    above: 'darüber',
    beside: 'daneben',
    lens: 'Linse°',
    sees: 'sieht',
    aimedOneWay: 'Richtung',
    watchesThePlayer: 'folgt dir',
    looksAtASpot: 'auf einen Punkt',
    staresOneWay:
      'Starrt in eine Richtung. Gierwinkel 0 blickt entlang +z, so wie eine Markierung schaut.',
    turnsToWatch: 'Dreht sich zu der Person, die spielt, von ihrem Standort aus.',
    staresAtASpot:
      'Starrt auf eine Stelle, egal wer spielt und wohin diese Person läuft. Genau das braucht ein Spieltisch: Jeder Stuhl blickt auf die Mitte.',
  },

  talk: {
    heading: 'Reden',
    chat: 'Chat',
    emotes: 'Gesten',
    on: 'an',
    off: 'aus',
    bothAllowed:
      'Beides erlaubt, und genau das bedeutet ein Level, das nichts sagt. In die Datei wird nichts geschrieben.',
    noFaces: 'Keine Gesten. Tippen geht weiterhin.',
    noChat: 'Niemand kann tippen. Die Gesten gibt es weiterhin.',
    quiet: 'Ein stilles Level. Niemand kann tippen, und es gibt keine Gesten.',
    allowedNotPromised:
      'Erlaubt, nicht zugesichert — ein Raum, dessen eigener Chat aus ist, hat auch hier keinen.',
  },
}

export const XP_EDITOR_BG: XpEditorDict = {
  chrome: {
    toolWindows: 'Работни панели',
    projectName: 'Името на този проект',
    rename: 'Преименувай',
    viewportHint: 'влачене за рисуване · десен бутон за местене · R завърта',
    windows: {
      scene: 'Сцена',
      properties: 'Свойства',
      model: 'Модели',
      blueprints: 'Чертежи',
      tools: 'Инструменти',
      output: 'Документ',
      words: 'Думи',
      behaviour: 'Поведение',
      data: 'Данни',
      flow: 'Ход',
      scripts: 'Скриптове',
      animator: 'Аниматор',
      movie: 'Филм',
    },
  },

  tools: {
    level: 'Ниво',
    levelHint: 'Q и W. Посочването на нещо взима неговата височина вместо това.',
    groundAt: 'Земя при y = {y}',
    groundHint:
      'Нещо, на което да стоите, докато нивото е полупостроено. Изключено, дъното на света е мрежа четирийсет клетки по-надолу.',
    fallingRestarts: 'Падането връща в началото',
    fallingRestartsHint:
      'Това прави платформъра платформър. Изключено, пропускът струва връщането пеша; включено — струва целия опит.',
    fallingKills: 'Падането убива',
    fallingKillsHint:
      'Дупката струва колкото шиповете - живот и чакането до възраждането. Иначе нивото учи на две правила за една грешка.',

    background: 'Фон',
    transparent: 'прозрачен',
    backgroundHint:
      'Празно показва страницата зад нивото. Име, шестнайсетичен код или rgb() — каквото three.js чете.',

    snap: 'Прилепване',
    snapOff: 'изкл.',
    snapFree: 'Свободно. Документът пак закръгля до десета при влизане.',
    snapStep: '{step} от клетка',
    snapHint:
      'Колко се мести дръжката между две стъпки. Знакът е винаги цели клетки — така го пази форматът.',

    turn: 'Завъртане {n}°',
    rotate: 'Завърти — R',
  },

  legend: {
    modelLead: 'Довлачете един и той е',
    scenery: 'декор',
    modelTail: '— клетки в нивото, без име, и нищо не му се случва.',
    blueprintLead: 'Довлачете един и той е',
    aThing: 'нещо',
    blueprintTail:
      '— именувано, със свойства, и може да му се случи нещо. Направено от един модел или от няколко.',

    joinedLead: 'Няколко модела заедно — основа и цев — са един чертеж с',
    parts: 'части',
    joinedTail: '. Такова е и всичко, което има име или на което се случва нещо.',
    toBlueprints: 'Чертежи →',
  },

  picker: {
    models: 'Модели',
    hide: 'скрий',
    pick: 'избери',
    settings: 'Настройки на избора',
    searchPlaceholder: 'стена, наклон, стълби…',
    noPacks: 'още няма пакети — отворете Пакети',
    nothingMatches: 'нищо не съвпада',
    tiles: '{n} плочки',
    showFirst: 'покажи първите {n}',
    showAll: '+{n} още — покажи всички',
    showInColour: 'Показвай платформените части в {colour}',
    usedBy: '{n} неща в това ниво са направени от него',
    add: 'добави',
    remove: 'премахни',
    holdThis: 'Дръж това',
    addAndHold: 'Добави {pack} и дръж това',
    tileTitle: '{name} — {size} · довлачете в нивото',
    inUse: 'в употреба ·',
    packs: 'Пакети',
    packsCount: '{n} от {of}',
  },

  document: {
    called: 'Казва се',
    calledLabel: 'Как се казва това ниво',
    about: 'Описание',
    aboutLabel: 'Какво е това ниво, в едно изречение',
    aboutPlaceholder: 'Едно изречение, за някой, който решава дали да го отвори.',

    counts: {
      placements: 'поставяния',
      distinctModels: 'различни модела',
      entities: 'обекта',
      blueprints: 'чертежа',
      marks: 'знака',
      capabilities: 'способности',
      packs: 'пакета',
      player: 'играч',
    },
    drawCalls: 'извикванията за рисуване следват това, а не броя отгоре',
    builtInDummy: 'вграденият манекен',

    nothingToFlag: 'Няма какво да се отбележи.',
    noPlacements: 'Няма поставяния - няма на какво да се стъпи.',
    noMarks: 'Няма знаци. На мача му трябват две начални точки; на състезанието — старт и финал.',
    unnamedOne: '{n} безименен обект - правило не може да се обърне към него.',
    unnamedMany: '{n} безименни обекта - правило не може да се обърне към тях.',
    airborneOne: '{n} начална точка няма нищо отдолу - някой пристига във въздуха. Побутнете я да легне.',
    airborneMany:
      '{n} начални точки нямат нищо отдолу - някой пристига във въздуха. Побутнете ги да легнат.',
  },

  mode: {
    heading: 'Режим',
    modeHeading: 'Какво е това',
    styleHeading: 'Какво се прави в него',
    finishHeading: 'От какво е касетата му',
    finishes: {
      plastic: 'пластмаса',
      shiny: 'лъскаво',
      metal: 'метал',
      rust: 'ръжда',
      glass: 'стъкло',
      rainbow: 'дъга',
      galaxy: 'галактика',
      neon: 'неон',
      hologram: 'холограма',
    },
    colourHeading: 'Какъв цвят е',
    colourAuto: 'автоматично',
    modes: {
      space: 'Място',
      lobby: 'Фоайе',
      battle: 'Битка',
    },
    modeBlurbs: {
      space: 'Място, което просто съществува. Няма рунд, няма какво да се печели, а каквото стане в него, остава.',
      lobby: 'Където хората се събират между рундовете — и пак може да води резултат.',
      battle: 'Опит: започва, свършва, и каквото е броил, си отива с него.',
    },
    presets: {
      freestyle: 'freestyle',
      deathmatch: 'deathmatch',
      football: 'football',
      parkour: 'parkour',
      shooter: 'shooter',
    },
    sides: {
      ffa: 'всеки срещу всеки',
      team: 'отбори',
      'one-vs-all': '1 срещу всички',
    },
    sideBlurbs: {
      ffa: 'Всеки срещу всеки - всеки за себе си, и отборните начални точки не се четат',
      team: 'Отбори - страните, които началните знаци назовават, разделени по настройката отдолу',
      'one-vs-all': 'Един срещу всички - мачът назовава единия; сам, никой няма страна',
    },
    assign: {
      spread:
        'Разпределете стаята по страните, за да работи публична стая, без някой да я организира',
      order: 'Настанявайте хората в реда, за който стаята се разбира: първата страна на първия играч',
      host: 'Само мач може да сложи някого на страна; сам, играчът няма такава',
      claim: 'Всеки си избира страна, по един на всяка, и никой не може да бъде местен',
    },

    firstTo: 'първи до',
    noScoreLimit: 'без граница на точките',
    seconds: 'секунди',
    noClock: 'без часовник',
    downFor: 'долу за',
    straightBackUp: 'веднага обратно на крака',

    players: 'Играчи',
    needs: 'трябват',
    anybody: 'всеки',
    holds: 'събира',
    upTo: 'до {n}',

    sidesHeading: 'Страни',
    readOffTheMarks: ' — прочетени от знаците, защото нищо не беше зададено',
    assignNames: { spread: 'разпределение', order: 'ред', host: 'домакин', claim: 'заявка' },

    needsGoals: 'трябва по една врата на всеки край',
    needsStartFinish: 'трябват старт и финал',
    needsSpawns: 'трябва по една начална точка за всяка страна',
    needsSomething: 'трябва нещо, което това ниво няма',
    needsTeamNames: 'трябват два начални знака с различни отборни имена',

    nothingToHandOut:
      'Няма какво да се раздаде. Дайте на два начални знака различни отборни имена и това решава кой кой получава.',
    matchNamesTheOne:
      'Мачът назовава единия. Нищо тук не може да го избере - за това трябва съставът, а съставът го няма на рафта.',
    nobodyOnASide: 'Никой не е на страна, така че отборните начални точки в това ниво не се четат.',

    forExactly: 'За точно {min}.',
    forAnybody: 'За всекиго.',
    forRange: 'За {min} до {max}.',
    seatsSpare:
      '{said} Има {seats} места и по един играч на всяко, така че {spare} от тях няма къде да застанат.',
    seatsExactly: '{said} {seats} места, по един играч на всяко.',
  },

  inspector: {
    things: 'Неща ·',
    thingsEmpty:
      'Още нищо. Обектите са нещата с имена и правила — щайги, предмети за вземане, колички. Стените са поставяния по-долу.',
    built: 'Построено ·',
    builtEmpty: 'Още нищо не е построено. Влачете по мрежата, за да положите под.',
    distinctModels: 'различни модела. Извикванията за рисуване следват това число, а не броя части.',
    marks: 'Знаци ·',
    marksEmpty:
      'Няма. На мача му трябва начална точка за всяка страна, на футбола — врата на всеки край, а на един опит — старт и финал.',
    modelOne: 'модел',
    modelMany: 'модела',

    makeBlueprint: '→ направи го чертеж',
    makeBlueprintTitle: 'Направи вид нещо от тази част, на нейното място',
    putMark: 'Постави знак {kind} там, където е показалецът',
    landsUnderPointer: 'Ляга под показалеца, а не в началото.',

    heading: 'Свойства',
    nothingSelected:
      'Нищо не е избрано. Щракнете нещо в нивото или ред в панела Сцена и числата му се появяват тук.',
    delete: 'Изтрий',
    name: 'Име',
    unnamed: 'безименно',
    turn: 'завъртане',
    scale: 'мащаб',
    turnAround: 'Обърни',
    pivots: { centre: 'Център', origin: 'Начало' },
    spinsWhereItStands: 'Върти се там, където стои.',
    spinsAboutOrigin: 'Върти се около собствената точка на модела — врата на пантата си.',

    mark: 'знак',
    kind: 'Вид',
    facing: 'посока',
    width: 'ширина',
    height: 'височина',
    team: 'отбор',
    nobodys: 'ничий',
    spawnBlurb:
      'Където пристига една страна. Две от тези са това, което трябва на мача. y е каквото има отдолу — началната точка стои на земята.',
    goalBlurb: 'Рамка, в която се бележи от страната, към която гледа. Врата, в която се бележи и от двете, не е врата.',

    player: 'Играч',
    body: 'тяло',
    noBlueprints: 'Още няма чертежи, така че няма какво да сте освен манекена.',
    everybodyIs: 'всички са',
    playerSpawnBlurb:
      'Където пристига човек и накъде гледа. y е каквото има отдолу — началната точка стои на земята.',
    playerMarksBlurb:
      'Където пристига човек, когато никой начален знак не казва друго — това ниво има {marks}, така че те печелят. Щракнете тялото, за да изберете първия от тях.',
    wears: 'носи',
    looks: {
      dummy: 'манекен',
      profile: 'своето собствено животно',
      random: 'случайно животно',
      peep: 'своя пийп',
      xp: 'своето XP тяло',
      choose: 'каквото са избрали',
    },
    theBodyAbove: 'тялото отгоре',
    builtInDummy: 'вграденият манекен',
    wearsProfile:
      'Животното, което всеки играч си е избрал в профила. Който не си е избрал, получава случайно, а не нищо.',
    wearsRandom:
      'По едно животно на човек, от собственото му id - така е същото на всеки екран и същото утре.',
    wearsBody: 'Тялото отгоре, точно както е нарисувано.',
    wearsDummy: 'Прототипният манекен, което получава ниво, което не казва нищо.',
    wearsPeep:
      'Своето животно, каквото и друго да притежават - стая, пълна с животни, си остава такава.',
    wearsXp:
      'Тялото, с което влизат в игрите. Който няма, е манекенът - това, което играчът вече е.',
    wearsChoose:
      'Нито едното: тялото, което сами са избрали. За повечето нива това е верният отговор.',

    movement: 'Движение',
    moveSpeed: 'ходене',
    moveSprint: 'спринт',
    moveJump: 'скок',
    moveGravity: 'гравитация',
    moveAcceleration: 'ускорение',
    moveDrag: 'съпротивление',
    movementBlurb:
      'Ходенето и спринтът са в клетки за секунда, скокът — в преодолени клетки, гравитацията — в клетки за секунда на квадрат. Ускорението вдига темпото, а съпротивлението го пуска — нулата значи мигновено, което е обичайното усещане. Променено число иска пистата му да се измине, а не да се измери.',

    holding: 'държи',
    nothing: 'нищо',
    avatarAt: 'аватар при',
    inHand: 'в ръката',
    theHandItFinds: 'ръката, която намери',
    weaponBlurb: 'Оръжието чете собствените си щета и обхват като свойства. Щракнете, за да стреляте.',
    notTheAvatar: 'Тялото не е аватарът — който играе, си носи своя.',
    inTheHand: 'В ръката',
    reset: 'Нулирай',
    size: 'размер',
    handHintLead: 'Клетки и градуси, от собственото начало на модела. Натиснете',
    handHintTail: ', за да го видите в ръката.',

    keys: 'Клавиши ·',
    addKey: '+ клавиш',
    keysBlurb:
      'Движението, скачането и танцуването работят във всяко XP и не струват нищо тук. Тези са собствените на нивото — всеки излъчва името си, а правило решава какво значи то.',
    pressAKey: 'натиснете клавиш',
    pressAKeyToBind: 'Натиснете клавиш, за да го обвържете',
    whatItDoes: 'какво прави',
    nameIt: 'наименувайте го',
    wait: 'изчакване',
    waitTitle: 'Секунди, преди този клавиш да работи пак, до {n}. Празно значи без.',
    unbind: 'Освободи',

    architecture:
      'Архитектура, върху метровата решетка — растеризира се в клетки веднъж и повече не мърда. Нещо, на което трябва име или правило, е обект.',
    collidesAs: 'сблъсква се като',
    drawnBoxes: 'начертано · {n} кутии',
    measuredShape: 'измерена форма',
    walkThrough: 'минава се през него',
    drawnBlurb:
      'Кутии, начертани в документа, в собствената рамка на модела — те се въртят с него. Напускането на тази настройка ги изхвърля.',
    measuredBlurb:
      'Измерената форма е моделът, вокселизиран при построяването. Отвори, по-тесни от метър, не я преживяват,',
    colliderLead: 'а',
    colliderTail: 'списък в JSON-а е начинът да ѝ върнете вратата.',

    pitch: 'наклон',
    roll: 'въртене',
    tiltBlurbLead: 'Наклон в градуси, после колко пъти собствения си размер по всяка от',
    itsOwn: 'своите',
    tiltBlurbTail:
      'оси. Наклоненото нещо се сблъсква като кутията около наклона — по-голяма, отколкото изглежда, никога по-малка.',

    savePoint: 'Точка на запис',
    order: 'ред',
    savePointBlurb:
      'Номерират се, докато ги поставяте. Най-високата достигната печели, така че минаването през по-ранна площадка в кръг никога не ви връща назад — а две площадки с един номер оставят втората недостижима.',
    sign: 'Табела',
    whatItSays: 'какво пише',
    textColour: 'цвят на текста',
    plate: 'плоча',
    plateColour: 'цвят на плочата',

    hangsFrom: 'Виси на',
    nothingToHangFrom:
      'Още няма на какво да виси. Дайте име на друг обект — вратата виси на шкафа, а шкафът първо трябва да може да се назове някак.',
    nothingTheLevel: 'нищо — нивото',
    itsOrigin: 'своето начало',
    noSockets: 'няма гнезда по него',
    hangsBlurbLead: 'x, y, z и завъртането са',
    relativeToIt: 'спрямо него',
    hangsBlurbTail: 'вече — и то ги носи със себе си, когато се мести.',

    dragHint: 'Влачете, за да го местите по пода — Shift за по-фино',
    dragFooter: 'влачете пода · лентата е височина · shift е по-фино',
    dragHeightHint: 'влачете нагоре и надолу за височина',
  },

  blueprints: {
    heading: 'Чертежи ·',
    cancel: 'Отказ',
    new: 'Нов',
    blurb:
      'Чертежът е вид нещо, а не самото нещо: всяка щайга се чупи по един и същи начин, затова какво се чупи се пише веднъж тук, а всяка щайга в нивото е една от тези. Довлачете ред във viewport-а, за да поставите една.',
    newName: 'щайга',
    add: 'Добави',
    noneYet: 'Още няма. На ниво само от стени не му трябват.',

    starters: {
      checkpoint: {
        label: '+ точка на запис',
        blurb: 'Минете през нея и смъртта ви връща тук, а не в началото.',
      },
      player: {
        label: '+ играч',
        blurb: 'Тялото, като което пристигате — и единственото нещо, на което скрипт може да върви.',
      },
      peep: {
        label: '+ пийп',
        blurb: 'Пристигайте като животно вместо това. Същото тяло, друг скелет.',
      },
      enemy: {
        label: '+ враг',
        blurb: 'Някой, по когото да се стреля: тяло със здраве, което носи точки, когато падне.',
      },
    },

    model: 'Модел',
    seenAtPlay: 'Вижда се при игра',
    skeleton: 'Скелет',
    avatar: 'аватар',
    peep: 'пийп',

    pose: 'Поза',
    howeverItStands: 'както стои',
    poseBlurb:
      'Държи се, докато е неподвижно. Ходенето, падането и получаването на изстрел пак изглеждат както си знаят — това е позата, към която се връща.',
    spin: 'Въртене',
    angle: 'ъгъл',
    or: 'или',

    motions: 'Движения ·',
    open: 'отвори',
    addMotion: 'добави',
    motionsBlurbLead:
      'Именувана последователност, която на това нещо може да се каже да изпълни — отваряне на капак, въртене на острие, разтърсване на щайга. Правило пуска една с',
    play: 'пусни',
    loop: 'цикъл',
    looping: ', в цикъл',
    waitStep: '— изчакай —',
    seconds: 'секунди',
    removeStep: 'Премахни стъпката',
    addStep: '+ стъпка',
    stepBlurbTurn: 'завърти',
    stepBlurbSpin: 'отива на този ъгъл и остава,',
    stepBlurbSwing: 'е градуси в секунда,',
    stepBlurbAnd: 'и',
    stepBlurbShake: 'се връщат.',

    light: 'Светлина',
    bright: 'яркост',
    reach: 'обхват',
    lightBlurbLead:
      'Обхватът е в клетки; 0 е без граница. Скрипт може да сменя и трите, докато нивото върви —',
    lightBlurbTail: 'най-близките се рисуват.',

    physics: 'Физика',
    physicsOn: 'Пада, влизането в него го бута и то изстрелва',
    physicsOff: 'Декор: стои точно там, където сте го сложили, докато правило не го премести.',
    collidesAs: 'Сблъсква се като',

    tags: 'Етикети',
    addATag: 'добавете етикет…',
    orANew: 'или нов',
    addTag: 'добави',

    script: 'Скрипт',
    noScript: 'без скрипт',
    scriptBlurb:
      'Всяко от тези получава свое собствено изпълнение — свои броячи, свое изчакване. Правилата остават по-добрият отговор за всичко, което им пасва.',

    properties: 'Свойства',
    addProperty: 'Добави',
    rename: 'Преименувай',
    delete: 'Изтрий',

    parts: 'Части ·',
    addPart: 'Добави',
    oneModel: 'Един модел.',
    addAnother: 'Добавете',
    partsBlurb:
      'още един, за да го съставите от няколко — основа и цев, стълб и лампа — всеки висящ на предишния, на гнездо, ако моделът има такова.',
    on: 'на',
    removePart: 'Премахни тази част',
    name: 'име',
    unnamed: 'безименна',
    hangsFrom: 'виси на',
    theBlueprintItself: 'самия чертеж',
    atSocket: 'на гнездо',
    itsOrigin: 'своето начало',
    turn: 'завъртане',
    scale: 'мащаб',
    partModel: 'модел',

    alreadyABlueprint: 'Вече е чертеж',
    nameRules: 'Букви, цифри, тире и долна черта',
    drawn: 'рисува се',
    aPlaceOnly: 'само място',
    neverDrawnLead: 'Никога не се рисува при игра — цел за телепорт, пътна точка. Пак именувано,',
    spinPropBlurbLead: 'Градуси по собствената му ос, четени от свойство с това име. Скрипт го върти с',
    spinPropBlurbTail:
      ', или със Set/Add на правило върху цел self. Нищо не го върти само.',
    degreesASecond: 'градуса в секунда',
    degrees: 'градуса',
    lightBlurbMid: '. Само',
    boxMeasured: 'Кутия, измерена от модела. Правилна за почти всичко.',
    walkStraightThrough: 'Минава се право през него — монета, предмет за вземане, обем-спусък.',
    noScriptsYet:
      'В това ниво още няма скриптове. Панелът Скриптове пише един, а той може да се закачи тук или оттам.',
  },

  behaviour: {
    heading: 'Чертежи ·',
    addRule: '+ правило',
    ruleOne: '{n} правило',
    ruleMany: '{n} правила',
    noRules:
      'Нищо не става, когато го докоснете. Новото правило започва като „при влизане, излъчи“ — което не прави нищо на нивото и го казва на HUD-а, така че може да го видите как се задейства, преди да решите какво да прави.',
    pickABlueprint: 'Изберете чертеж, за да видите какво прави.',
    neverFires:
      'Това никога не се задейства — нивото няма режим, така че нищо не го приключва. Задайте един под Документ, за да му дадете край.',

    on: 'при',
    when: 'когато',
    do: 'направи',
    deleteRule: 'Изтрий това правило',
    addVerb: '+ глагол',
    destinationLead: 'Целта е',
    destinationName: 'име',
    destinationMid:
      '— празен възел, площадка за запис или знак, който сте наименували. Видът сам по себе си работи, докато има само един от него:',
    destinationFinish: 'finish',
    destinationTail: 'в писта с един финал, и нищо, щом станат два.',

    nothingBound:
      'Нищо не е обвързано — на натискането му трябва клавиш. Добавете един под Документ, после го изберете тук.',
    key: 'клавиш',
    within: 'в рамките на',
    cells: 'клетки',
    anyDistance: 'всяко разстояние',
    compareToNumber: 'Сравни с число вместо това',

    upTo: 'до',
    noMotions: 'нищо в това ниво още няма движение — чертежът строи такова',
    noCuts: 'това ниво още няма монтажи — панелът Документ прави един',
    wholeBody: 'цялото тяло',
    event: 'събитие',
    untilTold: 'докато не му се каже',
    untilToldTitle:
      'Секунди, докато се върне. Празно значи, че остава изключено, докато нещо не го включи.',
    socket: 'гнездо',
    socketTitle: 'На кое гнездо на носача да виси. Празно е тяхното начало.',
    removeVerb: 'Извади този глагол',
    nameItWillHave: 'име, което ще има',
    pickExisting: 'Изберете съществуващо',
    list: 'списък',

    noBlueprintsYet:
      'Още няма чертежи. Правилото виси на вид нещо, а не на една щайга — всяка щайга, направена от чертеж, получава същите правила, което прави четирийсет от тях една редакция.',
    bindAKeyFirst: 'натиснат — първо обвържете клавиш',
    addAFieldFirst: 'world — първо добавете поле',
    noDataToCompare: 'Това ниво не обявява данни, с които да се сравнява',
    compareToSomethingKept: 'Сравни с нещо, което нивото пази',
    aNameNotPlaced: 'име, което още не е поставено…',
    aRoomHere: 'стая тук',
    anotherXp: 'друго xp',
    theFrontRoom: 'main — предната стая',
    aRoomInThisLevel: 'стая в това ниво',
    whichRoomTitle:
      'В коя стая на това ниво да се влезе - нивото не се сменя, а само в коя негова стая стоят всички.',
    whichXpTitle: 'Идентификаторът на XP-то, което да се отвори - всички в стаята идват с вас.',

    sides: 'страни',
    by: 'с',
    along: 'по',
    alongTitle:
      'Знаците, между които се движи частта - track-0, track-1, … - и свойството върху частта, което помни на кой от тях стои. Едно име за двете, за да не могат да се разминат.',
    bump: 'блъскане',
    bumpTitle: 'По избор: етикет. Част, върху която е кацнало нещо с този етикет, се връща в началото си.',
    aSide: 'страна',
    aSideTitle: 'Страна, която това ниво назовава - червена, синя или отбора на който и да е начален знак.',
    tablesOwn: 'собственото на масата',
    tablesOwnTitle: 'Колко време има стаята да гласува, в секунди. Празно е по подразбиране на арбитъра.',
    passNote: 'подава хода на следващото място',
    raidNote: 'взима от чужд запис, на случаен принцип - вижте блока visit',
  },

  animator: {
    rigs: { dummy: 'Манекен', peepz: 'Пийп' },
    bones: {
      hips: 'Таз',
      spine: 'Гръбнак',
      chest: 'Гръден кош',
      head: 'Глава',
      upperarml: 'Рамо Л',
      lowerarml: 'Лакът Л',
      wristl: 'Китка Л',
      handl: 'Ръка Л',
      upperarmr: 'Рамо Д',
      lowerarmr: 'Лакът Д',
      wristr: 'Китка Д',
      handr: 'Ръка Д',
      upperlegl: 'Бедро Л',
      lowerlegl: 'Коляно Л',
      footl: 'Стъпало Л',
      toesl: 'Пръсти Л',
      upperlegr: 'Бедро Д',
      lowerlegr: 'Коляно Д',
      footr: 'Стъпало Д',
      toesr: 'Пръсти Д',
      body: 'Тяло',
      tail: 'Опашка',
      'wing-left': 'Крило Л',
      'wing-right': 'Крило Д',
      'leg-front-left': 'Предно Л',
      'leg-front-right': 'Предно Д',
      'leg-back-left': 'Задно Л',
      'leg-back-right': 'Задно Д',
    },
    groups: {
      torso: 'торс',
      arms: 'ръце',
      legs: 'крака',
      tail: 'опашка',
      wings: 'крила',
      body: 'тяло',
    },

    dockLead: 'Влачете точките, за да позирате тялото, и запишете позата на лентата.',
    dockSaveToLevel: 'Запази в нивото',
    dockTail:
      'слага всеки клип от колекцията в този документ, където поза, правило или скрипт може да назове един.',
    fill: 'Запълни',
    normalize: 'Нормализирай',
    stageHint: 'влачете точка, за да позирате · shift-влачене плъзга по пода · колелце или щипка за мащаб',
    holdsTitle: 'В ръката',
    holdsHint:
      'Какво държи играчът и как стои. Същото поле, което редактира панелът Свойства, тук, защото хватката се наглася с гледане.',
    holdsWhat: 'държи',
    holdsNothing: 'нищо',
    holdsScale: 'размер',
    movePad: 'Премести {bone}',
    liftKnob: 'Вдигни и спусни {bone}',
    liftLocked: 'Заключено към {axis}. Натиснете светналата буква или Escape, за да вдигате пак.',
    oneFingerToCamera: 'Дайте един пръст на камерата',
    look: 'Поглед',
    lockFree: 'свободно',
    lockTitle: 'Влачете в която и да е посока',
    lockAxisTitle: 'Влачете само по {axis}',
    lockHint: 'X, Y и Z заключват влаченето към една ос. Натиснете пак или Escape за свободно.',
    floor: 'Под',
    body: 'Тяло',
    model: 'Модел',
    bones_: 'Кости',
    bodyHint: 'Кой скелет анимирате. Всеки пази свой работен файл.',
    clipsHint: 'Всички живеят в един файл. Времевата линия показва светналия.',
    movesHint: 'Отпечатва се от главата, върху каквото вече е там.',
    levelHint: 'Клиповете, които този документ носи, и това, което поза или правило може да назове.',
    saveNToLevel: 'Запази {n} в нивото',
    oneFrame: 'Един кадър',
    undoRedoDepth: 'Отмяна и повторение, {n} дълбоко',
    straighten: 'Изправи {bone}',
    pin: 'Закачи {bone}',
    unpin: 'Откачи {bone}',

    clips: 'Клипове',
    newClip: 'Нов',
    copyClip: 'Копирай',
    clip: 'Клип',
    name: 'Име',
    fps: 'Кадри в секунда',
    lengthSeconds: 'Дължина (с)',
    easeOut: 'Плавно излизане от ключа под главата',
    dragItsDot: 'Влачете точката ѝ във viewport-а или я завъртете точно тук.',
    pickADot: 'Изберете точка във viewport-а или име по-долу.',

    moves: 'Движения',
    speed: 'Скорост',
    movesBlurb:
      'Всяко пише само костите, които назовава, така че Ходене и после Замах на ръцете на същото място е цяло ходене — и нито едното не е пипало главата, която сте позирали.',
    presets: {
      dummy: {
        walk: { label: 'Ходене', hint: 'Само крака. Отпечатайте замаха на ръцете отгоре.' },
        run: { label: 'Бягане', hint: 'Само крака, по-дълга крачка и повече коляно.' },
        armswing: {
          label: 'Замах на ръцете',
          hint: 'Само ръце. Противоположно на крака от същата страна.',
        },
        wave: {
          label: 'Махане',
          hint: 'Дясната ръка нагоре, предмишницата маха. Оставя всичко останало на мира.',
        },
        dance: {
          label: 'Танц',
          hint: 'Всичко: подскок, ръце нагоре и глава, която се забавлява.',
        },
        idle: {
          label: 'Покой',
          hint: 'Изправено, диша, ръце надолу. Каквото прави една фигура, когато нищо не прави.',
        },
        jump: {
          label: 'Скок',
          hint: 'Клек, изстрелване, свиване, приземяване. Мести корена, така че напуска пода.',
        },
      },
      peepz: {
        walk: { label: 'Ходене', hint: 'Крака и полюшване. Четири ключа там, където клипът има петнайсет.' },
        run: {
          label: 'Бягане',
          hint: 'Скокът: и двете предни, и двете задни, и тялото, което се клати с тях.',
        },
        idle: {
          label: 'Покой',
          hint: 'Бавно полюшване, краката са оставени на мира. Нещото, което да стои под всичко останало.',
        },
        dance: {
          label: 'Танц',
          hint: 'Тяло и опашка, два пъти по-надалеч от покоя. Краката си стоят.',
        },
        wag: { label: 'Махане с опашка', hint: 'Само опашката, така че се наслагва върху ходене.' },
        flap: {
          label: 'Пляскане',
          hint: 'Само крила. Четирите животни, които имат; върху останалите нищо.',
        },
      },
    },

    pose: 'Поза',
    copyKey: 'Копирай ключа',
    pasteKey: 'Постави ключа',
    backToRest: 'Обратно към позата в покой',
    poseBlurb:
      'Копирането взима целия ключ — позата и нейното забавяне. Затварянето на цикъл е копирай кадър едно, превърти до края, постави.',

    save: 'Запази',
    saveWork: 'Запази работата',
    open: 'Отвори',
    fileBlurbLead: 'Този',
    fileBlurbTail:
      ': ключове, забавяне, тайминг, за кой скелет е и версията на формата. Това е единственият файл, който този инструмент пише, и единственият, който може да отвори пак.',
    level: 'Ниво',
    saveToLevel: 'в нивото',
    nothingInLevel: 'Още нищо от тази колекция не е в нивото.',
    savedAsSamples:
      'Запазено като отчети, по един на кадър — около {kb}КБ за тези {n}. Работният файл остава редактируемият; запазен клип не може да се отвори обратно в тази времева линия.',

    shortcuts: 'Клавишни комбинации',
    playOrPause: 'Пусни или спри',
    keyThePose: 'Запиши позата тук',
    removeTheKey: 'Премахни ключа тук',
    nextOrPrevious: 'Следващ или предишен ключ',
    backToStart: 'Обратно в началото',
    copyAndPaste: 'Копирай и постави ключа',
    moveAlongFloor: 'Движи по пода',

    pasteInstead: 'Вместо това поставете анимация…',
    apply: 'Приложи',
    undo: 'Отмени',
    redo: 'Повтори',
    previousKey: 'Предишен ключ',
    nextKey: 'Следващ ключ',
    autoKey: 'Автоключ',
    loop: 'Цикъл',

    notes: {
      nothingToSaveOne:
        'Няма какво да се запази: този клип още няма позирани кости, така че в него няма анимация.',
      nothingToSaveMany:
        'Няма какво да се запази: тези клипове още нямат позирани кости, така че в тях няма анимация.',
      savedOne:
        'Запазен {n} клип в нивото. Поза, правило или скрипт може да назове който и да е от тях.{skipped}',
      savedMany:
        'Запазени {n} клипа в нивото. Поза, правило или скрипт може да назове който и да е от тях.{skipped}',
      skippedOne: ' {names} беше прескочен — в него още нищо не е позирано.',
      skippedMany: ' {names} бяха прескочени — в тях още нищо не е позирано.',
      openedOld:
        'Отворено „{name}“{many} — {keys} ключа. Пише версия {declared}, а този редактор познава версия {known}, така че всичко по-ново от нея е отпаднало.',
      opened: 'Отворено „{name}“{many} — {keys} ключа, {seconds}с при {fps}fps.',
      ofMany: ' от {n}',
      stamped:
        'Отпечатано {preset} от {at}с — {length}с от него. Пипна само костите, които назовава, така че всичко друго, което сте позирали, още е там.',
    },
  },

  scenes: {
    heading: 'Места',
    lead: 'Стаите, които това ниво съдържа. Глаголът load праща някого в една, а рунд може да назове една като мястото, на което се играе.',
    theLevelItself: 'самото ниво',
    rename: 'преименувай',
    remove: 'премахни',
    add: 'добави',
    namePlaceholder: 'име за стаята',
    nameRule: 'Малки букви, цифри и тирета. „main“ е собственият свят на нивото.',
    openIt: 'двойно щракване, за да работите в тази стая',
    standingHere: 'вие сте тук вътре',
    door: '+ врата',
    doorTitle: 'поставете вход към тази стая в онази, в която работите',
  },

  movies: {
    heading: 'Филми',
    lead: 'Филмът е празна сцена с времева ос: сложете тела в нея или внесете стая, която сте построили. Монтирайте кадри и изнесете.',
    newMovie: '+ нов филм',
    newMovieTitle: 'празна сцена с времева линия — сложете модели в нея',
    noMoviesYet: 'Още няма филми. Филмът е празна сцена: направете един, сложете тела в него и насочете камера.',
    importFrom: 'внеси…',
    importTitle: 'копирай декора и състава на друга стая в този филм',
    openIt: 'отвори',
    openItTitle: 'отвори този кадър в редактора на филми',
    runsFor: '{seconds}с при {fps}fps',
    stopBeingAMovie: 'не е филм',
    stopSure: 'натиснете пак - ключовете си отиват',
    cuts: 'Монтажи',
    cutsLead: 'Кадри по ред, изрязани и претактувани. Един и същи кадър може да се използва повече от веднъж.',
    addACut: '+ монтаж',
    emptyCut: 'още няма кадри в него',
    takeCount: '{n} кадъра, {seconds}с',
    takeCountOne: '1 кадър, {seconds}с',
    openComposer: 'композирай',
    openComposerTitle: 'отвори този монтаж в композитора',
    removeCut: 'премахни',
    removeCutSure: 'натиснете пак',
    cutNamePlaceholder: 'име за монтажа',
    nothingIsAShot: 'Тук още нищо не е кадър. Направете филм отгоре.',
    needAShotFirst: 'Първо направете филм — монтажът се прави от тях.',
  },

  movie: {
    editingAShot: 'Кадър',
    composing: 'Монтаж',
    close: 'затвори',
    closeTitle: 'обратно в редактора (Escape)',
    play: 'пусни',
    pause: 'спри',
    toStart: 'в началото',
    view: 'Гледна точка',
    freeLook: 'свободна',
    freeLookTitle: 'летете наоколо, за да намерите изглед. Мишката движи този.',
    theCut: 'монтажът',
    theCutTitle: 'гледайте го така, както ще бъде изнесен',
    cameras: 'Камери',
    addCamera: '+ камера тук',
    addCameraTitle: 'поставете камера там, откъдето гледате',
    keyHere: 'премести я тук',
    keyHereTitle: 'накарайте тази камера да мине през изгледа, от който гледате, в този момент',
    cutHere: 'изрежи към нея',
    cutHereTitle: 'картината е на тази камера от този момент',
    removeCamera: 'премахни',
    ease: 'улягане',
    easeTitle: 'пристигайте във всяко кадриране и улягайте, вместо да минавате през него с пълна скорост',
    cast: 'Състав',
    nobodyNamed: 'Нищо на това място няма име.',
    nobodyNamedLead: 'Времевата линия мести нещата по име. Наименувайте актьор в панела Свойства и той ще е тук.',
    selectAnActor: 'Изберете кого да записвате.',
    key: 'ключ',
    keyTitle: 'закачи тази стойност в този момент',
    clearKeys: 'изчисти всички ключове',
    plays: 'Изпълнява',
    playsTitle: 'това тяло изпълнява клип от този момент',
    clip: 'клип',
    loop: 'цикъл',
    length: 'Дължина',
    rate: 'Темп',
    backdrop: 'Отзад',
    backdropNone: 'нищо',
    backdropColour: 'цвят',
    backdropImage: 'картина',
    backdropSky: 'небе',
    backdropPath: '/файл-в-public.png',
    backdropNoneBlurb: 'Нищо отзад значи, че запазеният кадър е изрезка. Видеото няма прозрачност, така че запис на това излиза черен — дайте му цвят или картина, преди да записвате.',
    exportHeading: 'Изнасяне',
    saveFrame: 'запази този кадър',
    saveFrameTitle: 'този момент, като PNG',
    record: 'запиши',
    recording: 'записва се…',
    stopRecording: 'спри',
    recordTitle: 'пуснете го и запишете каквото виждате, като WebM',
    cannotRecord: 'Този браузър не може да записва платно.',
    droppedFrames: 'Изпуснати {dropped} от {wanted} кадъра — сцената е по-тежка от бюджета за кадър. Снимайте я по-малка или я опростете.',
    ffmpegHint: 'За да направите mp4 от него:',
    shots: 'Кадри',
    addShot: '+ кадър',
    noShots: 'В този монтаж още няма нищо. Добавете кадър.',
    trim: 'Изрежи',
    speed: 'Скорост',
    removeTake: 'премахни',
    copyTake: 'копирай',
    copyTakeTitle: 'същият кадър пак, точно след този',
    takeOf: 'дубъл {n} от {of}',
    goToTakeTitle: 'сложи главата на този дубъл',
    earlier: 'по-рано',
    later: 'по-късно',
    totalLength: '{seconds}с общо',
    nothingAtThisMoment: 'Нищо в този момент.',
    warmUpFirst: 'Този монтаж минава през места. Пуснете го веднъж, преди да записвате — първият кадър след рязане към място, чиито модели още не са се заредили, е празен, а във файл това е черен кадър.',
    addActor: '+ актьор',
    addActorTitle: 'поставете някого пред камерата',
    theAvatar: 'Аватар',
    thePeepz: 'Пийпове',
    theProps: 'Реквизит',
    findAModel: 'намери…',
    addEmpty: '+ празен',
    addEmptyTitle: 'дръжка, която не рисува нищо — закачете неща на нея и ги местете заедно',
    hangsOff: 'на',
    nothing: 'нищо',
    willAddPack: 'Това ниво още не носи този пакет — взимането на модел от него го добавя.',
    packs: 'Пакети',
    packsTitle: 'Прегледайте всеки пакет, на цял екран.',
    browsePacks: 'разгледай…',
    orDragOne: 'Щракнете, за да сложите един в кадъра, или довлачете един на сцената.',
    duplicate: 'дублирай',
    duplicateTitle: 'Още един като нея, клетка встрани, с децата и ключовете ѝ.',
    theCamera: 'камера',
    headLooksAt: 'гледа към',
    aim: 'насочи главата',
    aimTitle: 'Обърнете главата към него, докъдето стига врат. Наглася се оттам.',
    toolMove: 'мести',
    toolTurn: 'завърти',
    toolSize: 'размер',
    sizeIsOne: 'Едно число: тялото се мащабира равномерно.',
    aMove: 'преместване',
    aTurn: 'завъртане',
    aJump: 'скок',
    addMoveTitle: 'Отидете някъде пеша. Започва там, където вече е.',
    addTurnTitle: 'Завъртане на място. Започва от собствената ѝ посока.',
    addJumpTitle: 'Напуснете пода и се върнете.',
    nothingYet: 'Още нищо. На лентата се появява блок.',
    atForSeconds: '{t}с за {n}с',
    starts: 'започва',
    lasts: 'трае',
    facing: 'посока',
    howHigh: 'колко високо',
    loops: 'цикли',
    dropActionTitle: 'Извадете това действие от кадъра.',
    actionKinds: { move: 'Преместване', turn: 'Завъртане', jump: 'Скок', play: 'Изпълнение', say: 'Реплика' },
    loopFrom: 'от',
    loopFromTitle: 'Въртете оттук. Пускането ще върти този отрязък отново и отново.',
    loopTo: 'до',
    loopToTitle: 'Въртете дотук.',
    loopingRange: '↻ {a}–{b}с',
    loopOffTitle: 'Спрете въртенето и пуснете целия кадър пак.',
    leavesAt: 'от {t}с',
    easeNames: { hold: 'задръж', linear: 'право', smooth: 'плавно' },
    easeTitles: {
      hold: 'Стойте тук, после скочете. Единственият начин да получите рязане, а не плъзгане.',
      linear: 'Отидете право там, с една скорост.',
      smooth: 'Тръгнете бавно и пристигнете бавно.',
    },
    dropKeyTitle: 'Извадете този ключ.',
    addToPick: '+ избор',
    addToPickTitle: 'Продължавайте да избирате, за да добавяте към селекцията, вместо да я заменяте. Shift прави същото на клавиатура.',
    showControls: 'управление',
    hideControls: 'скрий',
    seeIt: 'виж го',
    seeItTitle: 'Покажете този клип върху тялото, без да го слагате в кадъра.',
    markASpan: 'Влачете, за да отбележите отрязък, който пускането да върти. Едно докосване го изчиства.',
    framings: 'кадрирано на',
    dropFramingTitle: 'Свалете това кадриране от камерата. Останалите се пазят.',
    moments: 'моменти',
    goToMoment: 'Сложете главата тук и покажете тази поза.',
    dropMomentTitle: 'Извадете този момент от анимацията.',
    lock: 'заключи',
    lockTitle: 'Закачете ос, за да не може подложката да я мести. Плъзгачите пак могат.',
    deleteActor: 'изтрий',
    deleteActorTitle: 'Свалете този от сцената, заедно с всичко, което виси на него.',
    deleteActorSure: 'да изтрия ли завинаги?',
    oneModel: '1 модел',
    someModels: '{n} модела',
    andMore: 'Показани са първите {n}. Пишете, за да стесните.',
    nothingMatches: 'Нищо в този пакет не съвпада с това.',
    setIsBuiltInTheEditor: 'Само тела тук. Декорът се строи в редактора, където е четката.',
    oneCamera: '1 камера',
    someCameras: '{n} камери',
    oneActor: '1 тяло',
    someActors: '{n} тела',
    keyedCount: '{n} с ключове',
    shot: 'Кадър',
    does: 'Прави',
    autoKey: 'автоключ',
    autoKeyTitle: 'Включено, плъзгачът пише ключ при главата. Изключено, мести мястото, откъдето тялото започва.',
    shownHere: 'показано оттук',
    clearKeysSure: 'натиснете пак',
    pose: 'Поза',
    cuePose: 'задръж я оттук',
    cuePoseTitle: 'изпълнявайте тази поза от главата, докато влачите блока',
    clearPose: 'изправи се',
    poseIsSaved: 'Завъртането на кост я запазва в нивото и я слага върху тялото — няма какво да се натиска. Влачете блока на лентата, за да я задържите по-дълго.',
    animate: 'анимирай това тяло',
    animateTitle: 'позирайте го в аниматора, запазете клипа в нивото, после го подайте тук',
    says: 'казва',
    saysTitle: 'балонче с реплика над главата му, от този момент',
    line: 'какво казва',
    forSeconds: 'за',
    moveIt: 'влачи',
    aimIt: 'насочи',
    stands: 'на',
    looksAt: 'вижда',
    lens: 'Обектив',
    frame: 'Кадър',
  },

  flow: {
    whichRound: 'Кой рунд',
    roundAny: 'Това ниво',
    roundAnyBlurb: 'Рундът, който това ниво играе, когато не е казано нищо по-конкретно.',
    roundModeBlurb: 'Собствен рунд за този режим. Без такъв се играе този на нивото.',
    modes: {
      space: 'Място',
      lobby: 'Фоайе',
      battle: 'Битка',
    },
    noRound: 'Това ниво не описва рунд.',
    startAFlow: 'започни ход',
    noRoundAtAll: 'изобщо без рунд',
    noRoundSure: 'натиснете пак - всяка фаза си отива',
    theOpeningPhase: 'фазата, с която рундът започва',
    shapes: 'Каква игра е това?',
    shapesLead:
      'Нивото е жив свят или изиграва опит. Опитът има етапи — начален удар, игра, край; хвърляне, ход, следващо място — и етапите са това, което чертаете тук. Изберете формата, най-близка до вашата, и разместете частите ѝ.',
    starters: {
      live: {
        name: 'Жив свят',
        blurb:
          'Без начало и без край. Хората идват и си отиват, а каквото нивото пази в своето място и в общите си полета, още е там утре. Повечето нива са това.',
      },
      countdown: {
        name: 'Отброяване, после игра',
        blurb:
          'Затаен дъх, а после всичко наведнъж. Никой не може да мърда през първите секунди, което е начинът състезание или блъсканица да започне честно.',
      },
      match: {
        name: 'Начален удар, игра, край',
        blurb:
          'Мач с часовник. Три секунди за нареждане, три минути игра и свирка, с която никой не може да спори. Границите за резултат и време са в Режим.',
      },
      rounds: {
        name: 'Три гейма',
        blurb:
          'Един и същи бой три пъти, с почивка между тях. Брояч на рундовете, който нивото пази, и мачът свършва, щом стигне три.',
      },
      board: {
        name: 'Хвърляне, ход, следващо място',
        blurb:
          'Ход, който обикаля масата. Хвърлете зара, движете се, докато е ваш, подайте нататък. Идва със зара и клавишите, така че се играе, преди да сте добавили и една част.',
      },
    },
    current: 'това ниво сега',
    use: 'използвай тази форма',
    playedAs: 'Къде може да се играе',
    playedAsLead:
      'Всяко ниво може да се държи изправено като стая, в която хората просто влизат. Ниво, което е само игра - маса за четирима, игрище - може да го каже тук, и възможността за стая изчезва.',
    capabilities: {
      freeplay: {
        name: 'Като стая',
        blurb: 'Всеки в спейса може да го държи изправено и да влиза. Нещата работят, нищо не свършва.',
      },
      match: {
        name: 'Като битка',
        blurb: 'Фоайето за битки може да пусне мач тук: страни, резултат, край. Трябва начална точка за всяка страна.',
      },
      football: {
        name: 'Като игра с топка',
        blurb: 'Врата на всеки край, за да може топка да бъде вкарана.',
      },
      competition: {
        name: 'Като състезание',
        blurb: 'Старт и финал, за да могат два опита да бъдат класирани.',
      },
    },
    presetLeansOn: 'режимът {preset} има нужда от това - първо сменете режима',
    atLeastOne: 'нивото може да се играе поне като едно нещо',
    stages: 'етапи',
    orBlank: 'Или наименувайте началната фаза и начертайте останалото сами:',
    startOver: 'започни отново от форма',
    startOverNote: 'Заменя фазите отгоре. Отмяната ги връща.',
    makeStart: 'направи начало',
    start: 'начало',
    aNewPhase: 'нова фаза',
    add: 'добави',
    remove: 'премахни',
    cancel: 'отказ',
    unreachable: 'недостижима',

    allow: 'позволи',
    endsGroup: 'самият опит',
    goNextRound: 'следващият рунд',
    goEnd: 'краят на опита',
    rounds: 'рундове',
    roundsOnce: 'играе се веднъж',
    roundsHint:
      'Колко пъти се играе рундът, преди опитът да свърши. Стрелка към „следващият рунд“ е това, което брои един и отваря следващия.',
    roundsNeedsSeam: 'Още никоя стрелка не води към следващия рунд, така че това би се изиграло веднъж.',
    who: 'кой',
    whoTurn: 'само този, който е на ход',
    whoNote:
      'Клавишите отгоре са живи за играча, за когото масата казва, че е на ход, и не са нарисувани за никой друг. Докато ходовете не започнат - или в игра сам - всички ги имат.',
    whatAPlayerCanDo: 'какво може да прави играч тук',
    everything: 'всичко',
    noKeys: 'това ниво не обвързва клавиши',
    says: 'казва',
    dragBetweenLead: 'Влачете между два възела отгоре, за да насочите стрелка. Полето',
    dragBetweenTail: 'на една фаза се изпълнява веднъж при влизане в нея — не всеки кадър, за което служи правилото.',
    nothingOnEntering: 'нищо при влизане — фазата само чака',
    does: 'does',
    addVerb: '+ глагол',
    noWayOut: 'няма изход',
    nothingLeaves: 'нищо не излиза оттук — опит, който пристигне, остава, което е и същността на един край',
    whereThisArrowGoes: 'Накъде води тази стрелка',
    anEventARuleEmits: 'събитие, което правило излъчва',

    wins: 'печели',
    sayWhenItIsWon: 'кажете кога е спечелено',
    nothingStartsOver: 'нищо тук не започва отначало',
    anEndingCounts:
      'Краят брои нещо, което започва отначало — обявете поле с обхват „run“ в панела Данни',
    endingNeedsRunLead:
      'Краят брои нещо, което започва отначало. Поле, което се пази в мястото или на играч, още носи числото от миналата игра, така че следващият опит би бил спечелен, преди някой да е мръднал — обявете едно с обхват',
    neverEnds: 'никога не свършва',
    run: 'run',
    clockNote:
      'Единственото поле тук, на което трябва часовник, за който всички са съгласни. Ход по рундове не иска такъв.',
    noData: 'това ниво не обявява данни',
    nothing: 'нищо',
  },

  scripts: {
    heading: 'Скриптове ·',
    blurb:
      'Скриптът е това, което правилото не може да бъде: позиция, която зависи от миналия кадър, брой на времето, откакто нещо се е случило, въпрос за друг обект. Спусъците и глаголите остават по-добрият отговор за всичко, което им пасва — те се четат като три реда, а не като трийсет.',
    newName: 'кула',
    add: 'Добави',
    cancel: 'Отказ',
    new: 'Нов',
    alreadyAScript: 'Вече е скрипт',
    nameRules: 'Букви, цифри, тире и долна черта',
    noneYet: 'Още няма.',
    rename: 'Преименувай',
    delete: 'Изтрий',

    run: 'Пусни',
    notAttached:
      'Още не е на нищо, така че едно пускане няма за какво да го изпълни. Първо го закачете по-долу.',
    frames: '{n} кадъра · една секунда world.time',
    ranAndSaidNothing:
      'Изпълни се и не каза нищо, което прави скрипт без `log`. Добавете един, за да видите докъде е стигнал.',
    runsOn: 'Върви върху',
    noBlueprints: 'Още няма чертежи. Скриптът върви върху вид нещо, а не върху нивото.',
  },

  data: {
    heading: 'Какво пази това ниво',
    blurbLead: 'Число, което преживява затварянето на таба. Правилата четат и пишат в тях с',
    world: 'world',
    blurbTail: 'като цел, под Поведение.',
    noneYet:
      'Още нищо, което е правилно за повечето нива — стая, която не помни нищо, не струва нищо и не иска акаунт зад себе си. Добавете поле, когато нещо трябва да е вярно и утре: събрани монети, врата, която някой е отворил, най-добро време.',
    newName: 'moneti',
    add: 'добави',
    seenBy: 'вижда се от',
    startsAt: 'започва от',
    pressAgainToRemove: 'Натиснете пак, за да премахнете това поле',
    removeThisField: 'Премахни това поле',
    nameRules:
      'Малки букви, цифри и тирета, започващи с буква — същото като име на обект.',
    alreadyAField: 'Вече има поле на име {name}.',
    full:
      '{n} полета е най-многото, което едно ниво може да обяви. Модел, по-голям от това, обикновено е едно нещо, което се прави на трийсет — едно число, назоваващо състояние, вместо флаг за всяко.',
  },

  words: {
    heading: 'Какво казва това ниво',
    blurb:
      'Английското е ключът. Всичко, за което един език няма ред, се отпечатва както е написано, така че полузавършеният превод се чете като английски, а не като празно.',
    noLanguages:
      'Няма други езици, което е правилно за повечето нива — един е цяла игра. Добавете, когато някой наистина е поискал да чете това на него.',
    nothingToTranslateLead:
      'Още няма какво да се превежда. Нивото казва нещо, щом има описание или щом скрипт извика',
    codeLabel: 'Код на език за добавяне, например de или pt-BR',
    codePlaceholder: 'de',
    add: 'добави',
    removeLanguage: 'Премахни {code} и всичко написано на него',
    inThisLanguage: 'На този език: {phrase}',
    language: 'Език',
    keys: 'Ключове',
    keysHint:
      'Ключът е английското изречение, което нивото отпечатва - заглавието, описанието, всичко, което скрипт казва с t(\'…\'). Те се изброяват сами; добавете тук ред, който скрипт ще отпечата по-късно.',
    keyLabel: 'Нов ключ - английското изречение',
    keyPlaceholder: 'Press E to open the gate',
    addKey: 'добави ключ',
    keyColumn: 'ключ',
  },

  shell: {
    leave: 'Напусни редактора',
    menu: 'Меню',
    moreLevel: 'Повече от нивото',
    lessLevel: 'Повече от панела',
    goBackToDisk: 'Върни се към това, което е на диска',
    tryIt: 'Пробвай — изиграй нивото както е',
    tryingIt: 'Пробва се',
    asItStands: '· както е, запазено или не · никой друг не е тук',
    tryingRoom: 'започва се в {room}',
    stop: 'Спри — Esc',
    undo: 'Отмени',
    redo: 'Повтори',
    saving: 'Запазва се…',
    save: 'Запази',
    export: 'Изнеси',
    log: 'Дневник',
    oldestDropped: 'най-старите отпадат след {n}',
    draft: 'чернова',
    saved: 'запазено',
    placements: 'поставяния',
    entities: 'обекти',
    tools: 'Инструменти',
    onDisk: 'на диска',
    toolNames: {
      select: 'Избор',
      hand: 'Ръка',
      place: 'Поставяне',
      draw: 'Рисуване',
      erase: 'Триене',
      line: 'Линия',
      rect: 'Запълване',
      room: 'Стая',
    },
    handles: { translate: 'Местене', rotate: 'Завъртане', scale: 'Размер' },
    viewport: 'Изглед',
  },

  camera: {
    heading: 'Камера',
    kinds: { follow: 'следваща', side: 'странична', fixed: 'неподвижна' },
    kindBlurbs: {
      follow: 'Зад тялото, гледа накъдето гледате вие - първо или трето лице',
      side: 'Плоско, отстрани, по една ос - платформър',
      fixed: 'Закована на едно място в света, гледа играча или се взира в една посока',
    },
    runsAlong: 'върви по',
    standOff: 'отстояние',
    cellsTall: 'клетки височина',
    behind: 'отзад',
    above: 'отгоре',
    beside: 'встрани',
    lens: 'обектив°',
    sees: 'вижда',
    aimedOneWay: 'в една посока',
    watchesThePlayer: 'гледа вас',
    looksAtASpot: 'към точка',
    staresOneWay: 'Взира се в една посока. Yaw 0 гледа по +z, накъдето гледа знакът.',
    turnsToWatch: 'Обръща се да следи този, който играе, от мястото си.',
    staresAtASpot:
      'Взира се в едно място, който и да играе и където и да ходи. Каквото иска една маса: всеки стол гледа средата.',
  },

  talk: {
    heading: 'Говорене',
    chat: 'чат',
    emotes: 'жестове',
    on: 'вкл.',
    off: 'изкл.',
    bothAllowed:
      'И двете са позволени, което значи ниво, което не казва нищо. Във файла не се пише нищо.',
    noFaces: 'Без жестове. Хората пак могат да пишат.',
    noChat: 'Никой не може да пише. Жестовете си остават.',
    quiet: 'Тихо ниво. Никой не може да пише и няма жестове.',
    allowedNotPromised:
      'Позволено, не обещано — спейс със свой изключен чат няма чат и тук.',
  },
}

/**
 * A table rather than the ternary this was - the same fix `./store` and `./xp`
 * needed, and the same reason: a ternary answers English for every locale that
 * is not German, so a language added to the app got a fully English editor with
 * nothing anywhere failing to say so.
 */
const DICTS: Record<Locale, XpEditorDict> = {
  en: XP_EDITOR_EN,
  de: XP_EDITOR_DE,
  bg: XP_EDITOR_BG,
}

export function xpEditorDict(locale: Locale): XpEditorDict {
  return DICTS[locale]
}
