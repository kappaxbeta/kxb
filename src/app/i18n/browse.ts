import type { Finish } from '@kxb/xp'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The shelf: what this space is building, what it has collected, and what it
 * could take in.
 *
 * Its own dictionary rather than a section of `workspace`, because the vocabulary
 * is genuinely different - a project, a magazine, a store, a release - and
 * because these are the pages an author lives on rather than the ones a member
 * passes through. Nothing else in the app talks about handing a thing over or
 * moving it to another space.
 *
 * A project's own name is never in here, and neither is a release note. Those
 * are what somebody wrote.
 */
export interface BrowseDict {
  title: string
  heading: string
  body: string

  tabs: { magazine: string; store: string; projects: string }
  magazineBody: string
  storeBody: string

  elsewhere: string
  elsewhereBody: string

  misc: string
  miscBody: string
  nothingBuilt: string
  openBuilder: string
  allWorlds: string
  publicStore: string

  projects: string
  noneYet: string
  /** `{n}` projects in this space. */
  countHere: string
  newProject: string
  emptyTitle: string
  emptyBody: string
  startOne: string

  /**
   * The words the shelf of projects needs and the card did not.
   *
   * `projectShelf` names the plain-button list that stands beside the canvas
   * for anybody not using a pointer - see `components/cartridge/shelf.tsx`.
   */
  projectShelf: string
  openProject: string
  closeSheet: string
  noPicture: string
  neverSaved: string
  /** `{v}` is the version somebody else can play. */
  liveVersion: string

  /** What a project card says about where a project stands. */
  states: {
    draft: string
    review: string
    live: string
    takenDown: string
    removed: string
    archived: string
  }


  /** Taking a level in, putting one out, following new versions. */
  shelf: {
    follow: string
    /**
     * Why a level from the magazine cannot simply be put out here.
     *
     * `{needs}` is the list of capabilities, joined and printed as `describeNeed`
     * words them — whole phrases, so this sentence puts them after a colon
     * rather than folding them into a clause. It used to lowercase them and
     * stitch them in after "it", which German cannot do: the phrases are
     * sentences of their own there, and a lowercased noun is a spelling mistake.
     */
    remixFirst: string
    inYourPlace: string
    /**
     * Start a match in this one, straight off the shelf.
     *
     * Word for word `./rail`'s `runBattle` in all three, because it is the same
     * act arriving from a different page: a member who pressed *Run a battle*
     * in the Play rail should not have to work out whether a differently-worded
     * button here means something else.
     */
    runBattle: string
    starting: string
    /** Why there is no such button on a cartridge that is a place, not a match. */
    roomOnly: string
    puttingOut: string
    putOut: string
    takingCopy: string
    remix: string
    saveFirst: string
    onShelf: string
    takeOff: string
    putOn: string
    putOnNote: string
  }

  /** Starting one. */
  create: {
    title: string
    name: string
    namePlaceholder: string
    nameNote: string
    startAs: string
    startAsNote: string
    /**
     * What a project is, in one sentence with the space's name inside it.
     *
     * Two halves rather than one string with a slot, because the name is drawn
     * in its own span - it is the one word in the paragraph that is a fact
     * about *this* space rather than about projects.
     */
    blurbLead: string
    blurbTail: string
    emptyRoom: string
    emptyRoomBlurb: string
    /**
     * The cartridge, chosen before the level exists.
     *
     * The nine finish words are here as well as in `xp-editor.ts`, and that is
     * duplication on purpose: that dictionary's own header explains that the
     * editor's copy must not reach a player's bundle, and this form is on the
     * public-ish side of that line. Nine short words in two places is a
     * cheaper mistake than the whole editor dictionary in everybody's download.
     */
    look: string
    lookNote: string
    finishes: Record<Finish, string>
    colourAuto: string
    /**
     * The five starters, by the id `TEMPLATES` gives them.
     *
     * The English stays in `@kxb/xp/templates` beside the documents it
     * describes - the same arrangement `describePreset` and the animator's rigs
     * use, and for the same reason: that file is a description of five levels,
     * and the line under each is part of the description. A starter this has
     * never heard of falls back to what the package calls it.
     */
    templates: Readonly<Record<string, { name: string; blurb: string } | undefined>>
    creating: string
    create: string
  }

  /** The project page and everything an owner may do from it. */
  project: {
    notFound: string
    back: string

    /** The five facts across the top, and the note under each. */
    savedLabel: string
    neverSavedNote: string
    editingNote: string
    liveLabel: string
    notPublished: string
    upToDate: string
    storeServes: string
    filesLabel: string
    inFolder: string
    sizeLabel: string
    countsAgainst: string
    playedLabel: string
    /**
     * What the play figure means, under it.
     *
     * `never played` where there is nothing, because on a page about your own
     * work `0` and *nobody has been in here yet* are not the same sentence.
     */
    neverPlayed: string
    sessionOne: string
    sessionMany: string
    /** `{n}` hours, one decimal. */
    sessionHours: string

    editing: string
    /** The cartridge preview, and the one sentence under it. */
    cartridge: string
    cartridgeNote: string
    changeTheFinish: string
    neverSaved: string
    /** `{v}` is the version the editor opens on. */
    opensOn: string
    oneAtATime: string
    openEditor: string
    playNote: string
    magazine: string
    saved: string
    savedNote: string
    oneSave: string
    /** `{n}` saves in one scope. */
    manySaves: string
    lastWritten: string
    review: string
    releases: string
    whoElse: string
    handOver: string
    copy: string
    export: string
    exportNote: string
    download: string
    remove: string
    scopes: { player: string; shared: string; space: string }
  }

  /** The controls under it, which are all one-way doors of some size. */
  controls: {
    waiting: string
    withdrawing: string
    withdraw: string
    anythingToKnow: string
    whatChanged: string
    sending: string
    submit: string
    makeLive: string
    /** The line above the reason box, said before either of the two below. */
    removeBody: string
    staysYours: string
    staysTheirs: string
    why: string
    theyWillRead: string
    removing: string
    remove: string
    copyNote: string
    copying: string
    copy: string
    everybody: string
    /** The three answers to "what may everyone in this space do". */
    policies: { none: string; view: string; edit: string }
    canEdit: string
    canLook: string
    revoke: string
    add: string
    everybodyHas: string
    toShare: string
    saving: string
    apply: string
    andThese: string
    nobodyYet: string
    somebody: string
    whatTheyCanDo: string
    adding: string
    inviteToSpace: string
    handOverNote: string
    whoBecomesOwner: string
    handingOver: string
    handOver: string
    moveNote: string
    whichSpace: string
    moving: string
    move: string
  }
}

export const BROWSE_EN: BrowseDict = {
  title: 'Browse',
  heading: 'Browse',
  body: 'What this space is building, and the places it gets played in.',

  tabs: { magazine: 'Magazine', store: 'Store', projects: 'Projects' },
  magazineBody:
    'What this space collected. Taking one in is free and there is no limit on it — the wall is on putting one out into a place.',
  storeBody:
    'Everything this space could take in — the levels we ship, and anything published to the store. Free, as many as you like.',

  elsewhere: 'Yours, in other spaces',
  elsewhereBody:
    'You own these wherever they live. Opening one takes you to the space it is in.',

  misc: 'Misc',
  miscBody:
    'Places rather than games. Built block by block, and where a project gets played with other people in it.',
  nothingBuilt: 'Nothing built here yet. ',
  openBuilder: 'Open the builder',
  allWorlds: 'All of this space’s worlds',
  publicStore: 'The public store',

  projects: 'Projects',
  noneYet: 'none yet',
  countHere: '{n} here',
  newProject: 'New project',
  emptyTitle: 'Nothing here yet.',
  emptyBody:
    'A project is a small game — a place, things in it that break or count, and rules that say what happens. It stays yours wherever it ends up, and this space is where it lives while you build it.',
  startOne: 'Start one',

  projectShelf: 'The projects in this space',
  openProject: 'Open it',
  closeSheet: 'Close',
  noPicture: 'Nobody has photographed this one yet.',
  neverSaved: 'never saved',
  liveVersion: 'v{v} live',

  states: {
    draft: 'Draft',
    review: 'In review',
    live: 'Live',
    takenDown: 'Taken down',
    removed: 'Removed',
    archived: 'Archived',
  },

  shelf: {
    follow: 'Take new versions without asking',
    remixFirst: 'Remix it first — {needs}. Only a project in this space can do that.',
    inYourPlace: 'In your place — it has a room now.',
    runBattle: 'Run a battle',
    starting: 'Starting…',
    roomOnly: 'A place, not a match.',
    puttingOut: 'Putting it out…',
    putOut: 'Put it in our place',
    takingCopy: 'Taking a copy…',
    remix: 'Remix',
    saveFirst:
      'Save it once in the editor and it can go on this space’s shelf, ready to load into a place.',
    onShelf:
      'On this space’s shelf. It is in the Play tab and in the picker on Browse, ready to load into a place.',
    takeOff: 'Take it off the shelf',
    putOn: 'Put it in our magazine',
    putOnNote:
      'Put it on this space’s shelf, and it turns up wherever this space picks something to play. Free, and there is no limit on it.',
  },

  create: {
    title: 'New project',
    look: 'How it looks',
    lookNote:
      'The shell of the cartridge it will sit in. You can change your mind in the editor, and a level with no opinion gets a colour of its own anyway.',
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
    colourAuto: 'auto',
    name: 'Name',
    namePlaceholder: 'Minigolf, at night',
    nameNote: 'Renameable later. Nothing is published until you ask for it.',
    startAs: 'Start it as',
    startAsNote:
      'Each one is finished rather than a skeleton — you can walk around in it before you change a thing.',
    blurbLead:
      'A place, things in it that break or count, and rules that say what happens. It belongs to you wherever it ends up, and it lives in',
    blurbTail: 'while you build it.',
    emptyRoom: 'Empty room',
    emptyRoomBlurb: 'A floor and somewhere to stand, and nothing else in your way.',
    templates: {},
    creating: 'Creating…',
    create: 'Create it',
  },

  project: {
    notFound: 'Not found',
    back: '← Browse',

    savedLabel: 'Saved',
    neverSavedNote: 'never saved',
    editingNote: 'what you are editing',
    liveLabel: 'Live',
    notPublished: 'not published',
    upToDate: 'up to date',
    storeServes: 'the store still serves this',
    filesLabel: 'Files',
    inFolder: 'in the folder',
    sizeLabel: 'Size',
    countsAgainst: 'counts against this space',
    playedLabel: 'Played',
    neverPlayed: 'never played',
    sessionOne: 'session, all told',
    sessionMany: 'sessions, all told',
    sessionHours: 'sessions · {n}h',

    editing: 'Editing',
    cartridge: 'On a shelf',
    cartridgeNote:
      'This is what your level looks like wherever somebody picks it up — in the store, in a space’s magazine, in the battle wizard. The picture is whatever the level was last photographed as; what the shell is made of is set in the editor, beside the mode.',
    changeTheFinish: 'Change what it is made of',
    neverSaved: 'Nothing saved yet — the editor opens on whatever this was started from.',
    opensOn: 'Opens on v{v}, which is the draft rather than what the store serves.',
    oneAtATime: 'One person at a time; it frees up on its own if a tab is closed.',
    openEditor: 'Open the editor',
    playNote:
      'To play it with other people, load it into a place or start a battle on it. There is nothing to install.',
    magazine: 'Magazine',
    saved: 'What players have saved',
    savedNote:
      'You can see how much is stored and when it last changed. You cannot read what is in a player’s own save — that is theirs, in your game.',
    oneSave: '1 save',
    manySaves: '{n} saves',
    lastWritten: 'last written',
    review: 'Review',
    releases: 'Releases',
    whoElse: 'Who else',
    handOver: 'Hand it over',
    copy: 'Copy',
    export: 'Export',
    exportNote:
      'The whole folder as a zip — the document, the pictures, the models, the sound. It opens again anywhere this runs.',
    download: 'Download it',
    remove: 'Remove from this space',
    scopes: {
      player: 'Each player, privately',
      shared: 'Each player, visible to the space',
      space: 'The space, together',
    },
  },

  controls: {
    waiting:
      'Waiting for review. You can go on saving — what gets read is the version that was current when you submitted.',
    withdrawing: 'Withdrawing…',
    withdraw: 'Take it back',
    anythingToKnow: 'Anything we should know?',
    whatChanged: 'What changed since last time, or what to try first.',
    sending: 'Sending…',
    submit: 'Put it forward',
    makeLive: 'Make this live',
    removeBody: 'Takes it out of this space and stops it costing you storage.',
    staysYours: 'It stays yours — you keep it and can export it.',
    staysTheirs:
      'It stays with whoever owns it; they keep it and can export it. You are not deleting their work.',
    why: 'Why',
    theyWillRead: 'They will read this.',
    removing: 'Removing…',
    remove: 'Remove from this space',
    copyNote:
      'A fresh draft with the same contents, owned by you. It costs no extra storage — the copy points at the files that are already here.',
    copying: 'Copying…',
    copy: 'Make a copy',
    everybody: 'Everybody in this space',
    policies: { none: 'cannot open it', view: 'can look at it', edit: 'can edit it' },
    canEdit: 'can edit',
    canLook: 'can look',
    revoke: 'remove',
    add: 'Add',
    everybodyHas: 'Everybody here already has it. ',
    toShare: ' to share it with them.',
    saving: 'Saving…',
    apply: 'Apply',
    andThese: 'And these people',
    nobodyYet: 'Nobody yet.',
    somebody: 'Somebody in this space',
    whatTheyCanDo: 'What they can do',
    adding: 'Adding…',
    inviteToSpace: 'Invite somebody to the space',
    handOverNote:
      'Give it to somebody else in this space. They become the owner and you do not — only they can hand it back.',
    whoBecomesOwner: 'Who becomes the owner',
    handingOver: 'Handing over…',
    handOver: 'Hand it over',
    moveNote:
      'Move it to another of your spaces. It stays yours; the files are copied across and this space’s copy is closed.',
    whichSpace: 'Which space',
    moving: 'Moving…',
    move: 'Move it',
  },
}

export const BROWSE_DE: BrowseDict = {
  title: 'Stöbern',
  heading: 'Stöbern',
  body: 'Was dieser Space baut, und die Orte, an denen es gespielt wird.',

  tabs: { magazine: 'Magazin', store: 'Laden', projects: 'Projekte' },
  magazineBody:
    'Was dieser Space gesammelt hat. Etwas aufzunehmen ist kostenlos und unbegrenzt — die Grenze liegt beim Aufstellen an einem Ort.',
  storeBody:
    'Alles, was dieser Space aufnehmen könnte — die Level, die wir mitliefern, und alles, was im Laden veröffentlicht wurde. Kostenlos, so viel Sie wollen.',

  elsewhere: 'Ihre, in anderen Spaces',
  elsewhereBody:
    'Diese gehören Ihnen, wo sie auch liegen. Eines zu öffnen bringt Sie in den Space, in dem es liegt.',

  misc: 'Sonstiges',
  miscBody:
    'Orte statt Spiele. Block für Block gebaut, und dort wird ein Projekt mit anderen zusammen gespielt.',
  nothingBuilt: 'Hier wurde noch nichts gebaut. ',
  openBuilder: 'Baukasten öffnen',
  allWorlds: 'Alle Welten dieses Space',
  publicStore: 'Der öffentliche Laden',

  projects: 'Projekte',
  noneYet: 'noch keine',
  countHere: '{n} hier',
  newProject: 'Neues Projekt',
  emptyTitle: 'Hier ist noch nichts.',
  emptyBody:
    'Ein Projekt ist ein kleines Spiel — ein Ort, Dinge darin, die kaputtgehen oder zählen, und Regeln, die sagen, was passiert. Es bleibt Ihres, wo es auch landet, und dieser Space ist der Ort, an dem es wohnt, während Sie daran bauen.',
  startOne: 'Eines anfangen',

  projectShelf: 'Die Projekte in diesem Space',
  openProject: 'Öffnen',
  closeSheet: 'Schließen',
  noPicture: 'Dieses Level hat noch niemand fotografiert.',
  neverSaved: 'nie gespeichert',
  liveVersion: 'v{v} live',

  states: {
    draft: 'Entwurf',
    review: 'In Prüfung',
    live: 'Live',
    takenDown: 'Zurückgezogen',
    removed: 'Entfernt',
    archived: 'Archiviert',
  },

  shelf: {
    follow: 'Neue Versionen ohne Nachfragen übernehmen',
    remixFirst:
      'Erst remixen — {needs}. Das kann nur ein Projekt in diesem Raum.',
    inYourPlace: 'An Ihrem Ort — es hat jetzt einen Raum.',
    runBattle: 'Battle starten',
    starting: 'Wird gestartet …',
    roomOnly: 'Ein Ort, kein Match.',
    puttingOut: 'Wird aufgestellt …',
    putOut: 'Bei uns aufstellen',
    takingCopy: 'Kopie wird genommen …',
    remix: 'Remixen',
    saveFirst:
      'Speichern Sie es einmal im Editor, dann kann es ins Regal dieses Space, bereit zum Laden in einen Raum.',
    onShelf:
      'Im Regal dieses Space. Es steht im Spielen-Tab und in der Auswahl unter Stöbern, bereit zum Laden in einen Raum.',
    takeOff: 'Aus dem Regal nehmen',
    putOn: 'In unser Magazin legen',
    putOnNote:
      'Legen Sie es ins Regal dieses Space, dann taucht es überall auf, wo dieser Space etwas zum Spielen auswählt. Kostenlos und unbegrenzt.',
  },

  create: {
    title: 'Neues Projekt',
    look: 'Wie es aussieht',
    lookNote:
      'Die Hülle der Kassette, in der es stehen wird. Sie können es im Editor noch ändern, und ein Level ohne Meinung bekommt ohnehin eine eigene Farbe.',
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
    colourAuto: 'automatisch',
    name: 'Name',
    namePlaceholder: 'Minigolf, bei Nacht',
    nameNote: 'Später umbenennbar. Nichts wird veröffentlicht, bis Sie darum bitten.',
    startAs: 'Anfangen als',
    startAsNote:
      'Jedes davon ist fertig statt ein Gerüst — Sie können darin herumlaufen, bevor Sie irgendetwas ändern.',
    blurbLead:
      'Ein Ort, Dinge darin, die kaputtgehen oder zählen, und Regeln, die sagen, was passiert. Es gehört Ihnen, wo immer es landet, und es lebt in',
    blurbTail: ', während Sie daran bauen.',
    emptyRoom: 'Leerer Raum',
    emptyRoomBlurb: 'Ein Boden und ein Platz zum Stehen, und sonst nichts im Weg.',
    templates: {
      room: {
        name: 'Ein Raum',
        blurb:
          'Boden, vier Wände und ein Platz zum Stehen. Das Kleinste, worin man herumlaufen kann.',
      },
      race: {
        name: 'Ein Rennen',
        blurb:
          'Ein Start, ein Ziel und der Boden dazwischen. Erklärt competition, kann also gestoppt werden.',
      },
      match: {
        name: 'Ein Match',
        blurb:
          'Zwei Seiten, zwei Startpunkte und ein Boden, um den gekämpft wird. Erklärt match, kann also angesetzt werden.',
      },
      capture: {
        name: 'Flaggen erobern',
        blurb:
          'Zwei Basen, zwei Flaggen, zwei Seiten. Laufen Sie zu einer Flagge und drücken Sie, um sie zu nehmen; wer sie trägt, verliert seine Waffe, und getroffen zu werden lässt sie fallen.',
      },
      peepz: {
        name: 'Ein Park',
        blurb:
          'Sie sind ein Tier, mit Sprint und Tritt. Ein Ball, eine Rampe und Platz zum Herumlaufen.',
      },
    },
    creating: 'Wird angelegt …',
    create: 'Anlegen',
  },

  project: {
    notFound: 'Nicht gefunden',
    back: '← Stöbern',

    savedLabel: 'Gespeichert',
    neverSavedNote: 'nie gespeichert',
    editingNote: 'was Sie bearbeiten',
    liveLabel: 'Live',
    notPublished: 'nicht veröffentlicht',
    upToDate: 'aktuell',
    storeServes: 'das liefert der Laden noch aus',
    filesLabel: 'Dateien',
    inFolder: 'im Ordner',
    sizeLabel: 'Größe',
    countsAgainst: 'zählt gegen diesen Space',
    playedLabel: 'Gespielt',
    neverPlayed: 'nie gespielt',
    sessionOne: 'Sitzung insgesamt',
    sessionMany: 'Sitzungen insgesamt',
    sessionHours: 'Sitzungen · {n} Std.',

    editing: 'Bearbeiten',
    cartridge: 'Im Regal',
    cartridgeNote:
      'So sieht Ihr Level überall aus, wo jemand es in die Hand nimmt — im Store, im Magazin eines Space, im Kampf-Assistenten. Das Bild ist die letzte Aufnahme des Levels; woraus die Hülle ist, stellen Sie im Editor ein, neben dem Modus.',
    changeTheFinish: 'Material ändern',
    neverSaved:
      'Noch nichts gespeichert — der Editor öffnet das, womit dies begonnen wurde.',
    opensOn: 'Öffnet v{v} — den Entwurf, nicht das, was der Laden ausliefert.',
    oneAtATime:
      'Eine Person zur Zeit; es wird von allein wieder frei, wenn ein Tab geschlossen wird.',
    openEditor: 'Editor öffnen',
    playNote:
      'Um es mit anderen zu spielen, laden Sie es an einen Ort oder starten Sie ein Battle darauf. Es muss nichts installiert werden.',
    magazine: 'Magazin',
    saved: 'Was Spielende gespeichert haben',
    savedNote:
      'Sie sehen, wie viel gespeichert ist und wann es sich zuletzt geändert hat. Was im eigenen Spielstand einer Person steht, können Sie nicht lesen — das gehört ihr, in Ihrem Spiel.',
    oneSave: '1 Spielstand',
    manySaves: '{n} Spielstände',
    lastWritten: 'zuletzt geschrieben',
    review: 'Prüfung',
    releases: 'Veröffentlichungen',
    whoElse: 'Wer noch',
    handOver: 'Übergeben',
    copy: 'Kopieren',
    export: 'Exportieren',
    exportNote:
      'Der ganze Ordner als ZIP — das Dokument, die Bilder, die Modelle, der Ton. Es lässt sich überall wieder öffnen, wo dies läuft.',
    download: 'Herunterladen',
    remove: 'Aus diesem Space entfernen',
    scopes: {
      player: 'Jede Person, privat',
      shared: 'Jede Person, für den Space sichtbar',
      space: 'Der Space, gemeinsam',
    },
  },

  controls: {
    waiting:
      'Wartet auf die Prüfung. Sie können weiter speichern — gelesen wird die Version, die beim Einreichen aktuell war.',
    withdrawing: 'Wird zurückgezogen …',
    withdraw: 'Zurückziehen',
    anythingToKnow: 'Sollten wir etwas wissen?',
    whatChanged: 'Was sich seit letztem Mal geändert hat, oder was man zuerst probieren sollte.',
    sending: 'Wird gesendet …',
    submit: 'Einreichen',
    makeLive: 'Diese live schalten',
    removeBody: 'Nimmt es aus diesem Raum und beendet die Speicherkosten dafür.',
    staysYours: 'Es bleibt Ihres — Sie behalten es und können es exportieren.',
    staysTheirs:
      'Es bleibt bei der Person, der es gehört; sie behält es und kann es exportieren. Sie löschen ihre Arbeit nicht.',
    why: 'Warum',
    theyWillRead: 'Das wird gelesen.',
    removing: 'Wird entfernt …',
    remove: 'Aus diesem Space entfernen',
    copyNote:
      'Ein neuer Entwurf mit demselben Inhalt, der Ihnen gehört. Er kostet keinen zusätzlichen Speicher — die Kopie zeigt auf die Dateien, die schon hier liegen.',
    copying: 'Wird kopiert …',
    copy: 'Kopie anlegen',
    everybody: 'Alle in diesem Space',
    policies: {
      none: 'können es nicht öffnen',
      view: 'dürfen es ansehen',
      edit: 'dürfen es bearbeiten',
    },
    canEdit: 'darf bearbeiten',
    canLook: 'darf ansehen',
    revoke: 'entfernen',
    add: 'Hinzufügen',
    everybodyHas: 'Alle hier haben es schon. ',
    toShare: ', um es mit ihnen zu teilen.',
    saving: 'Wird gespeichert …',
    apply: 'Übernehmen',
    andThese: 'Und diese Leute',
    nobodyYet: 'Noch niemand.',
    somebody: 'Jemand in diesem Space',
    whatTheyCanDo: 'Was sie dürfen',
    adding: 'Wird hinzugefügt …',
    inviteToSpace: 'Jemanden in den Space einladen',
    handOverNote:
      'Geben Sie es jemand anderem in diesem Space. Diese Person wird Inhaber und Sie nicht mehr — nur sie kann es zurückgeben.',
    whoBecomesOwner: 'Wer Inhaber wird',
    handingOver: 'Wird übergeben …',
    handOver: 'Übergeben',
    moveNote:
      'Verschieben Sie es in einen anderen Ihrer Spaces. Es bleibt Ihres; die Dateien werden mitkopiert und die Kopie in diesem Space wird geschlossen.',
    whichSpace: 'Welcher Space',
    moving: 'Wird verschoben …',
    move: 'Verschieben',
  },
}

export const BROWSE_BG: BrowseDict = {
  title: 'Разглеждане',
  heading: 'Разглеждане',
  body: 'Какво строи този спейс и местата, на които се играе.',

  tabs: { magazine: 'Списание', store: 'Магазин', projects: 'Проекти' },
  magazineBody:
    'Каквото този спейс е събрал. Прибирането е безплатно и без ограничение — стената е при изнасянето на едно място.',
  storeBody:
    'Всичко, което този спейс може да прибере — нивата, които доставяме, и всичко публикувано в магазина. Безплатно, колкото поискате.',

  elsewhere: 'Ваши, в други спейсове',
  elsewhereBody:
    'Тези са ваши, където и да лежат. Отворите ли едно, отивате в спейса, в който е.',

  misc: 'Разни',
  miscBody:
    'Места, а не игри. Построени блок по блок, и там един проект се играе с други хора вътре.',
  nothingBuilt: 'Тук още нищо не е построено. ',
  openBuilder: 'Отвори строителя',
  allWorlds: 'Всички светове на този спейс',
  publicStore: 'Публичният магазин',

  projects: 'Проекти',
  noneYet: 'още няма',
  countHere: '{n} тук',
  newProject: 'Нов проект',
  emptyTitle: 'Тук още няма нищо.',
  emptyBody:
    'Проектът е малка игра — място, неща в него, които се чупят или се броят, и правила, които казват какво става. Остава ваш, където и да се озове, а този спейс е мястото, където живее, докато го строите.',
  startOne: 'Започнете един',

  projectShelf: 'Проектите в този спейс',
  openProject: 'Отвори',
  closeSheet: 'Затвори',
  noPicture: 'Това още никой не го е снимал.',
  neverSaved: 'никога не е запазвано',
  liveVersion: 'v{v} на живо',

  states: {
    draft: 'Чернова',
    review: 'В проверка',
    live: 'На живо',
    takenDown: 'Свалено',
    removed: 'Премахнато',
    archived: 'Архивирано',
  },

  shelf: {
    follow: 'Приемай нови версии, без да питаш',
    remixFirst:
      'Първо го ремиксирайте — {needs}. Това може само проект в този спейс.',
    inYourPlace: 'На вашето място — вече има стая.',
    runBattle: 'Пусни битка',
    starting: 'Стартиране …',
    roomOnly: 'Място, не мач.',
    puttingOut: 'Изнася се…',
    putOut: 'Изнеси го при нас',
    takingCopy: 'Взима се копие…',
    remix: 'Ремикс',
    saveFirst:
      'Запазете го веднъж в редактора и може да отиде на рафта на този спейс, готово за зареждане на място.',
    onShelf:
      'На рафта на този спейс. Стои в таб Игра и в избора под Разглеждане, готово за зареждане на място.',
    takeOff: 'Свали го от рафта',
    putOn: 'Сложи го в нашето списание',
    putOnNote:
      'Сложете го на рафта на този спейс и ще се появява навсякъде, където този спейс избира какво да играе. Безплатно и без ограничение.',
  },

  create: {
    title: 'Нов проект',
    look: 'Как изглежда',
    lookNote:
      'Корпусът на касетата, в която ще стои. Може да размислите в редактора, а ниво без мнение и без това получава свой цвят.',
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
    colourAuto: 'автоматично',
    name: 'Име',
    namePlaceholder: 'Миниголф, нощем',
    nameNote: 'Може да се преименува после. Нищо не се публикува, докато не поискате.',
    startAs: 'Започни като',
    startAsNote:
      'Всяко от тях е завършено, а не скелет — може да се разходите вътре, преди да промените каквото и да е.',
    blurbLead:
      'Място, неща в него, които се чупят или се броят, и правила, които казват какво става. Ваше е, където и да се озове, и живее в',
    blurbTail: ', докато го строите.',
    emptyRoom: 'Празна стая',
    emptyRoomBlurb: 'Под и място, на което да стоите, и нищо друго на пътя ви.',
    templates: {
      room: {
        name: 'Една стая',
        blurb:
          'Под, четири стени и място за стоене. Най-малкото, в което може да се разхождате.',
      },
      race: {
        name: 'Едно състезание',
        blurb:
          'Старт, финал и земята между тях. Обявява competition, така че може да се засича.',
      },
      match: {
        name: 'Един мач',
        blurb:
          'Две страни, две начални точки и земя, за която се води бой. Обявява match, така че може да се насрочва.',
      },
      capture: {
        name: 'Улови знамето',
        blurb:
          'Две бази, две знамена, две страни. Тичайте до знаме и натиснете, за да го вземете; който го носи, губи оръжието си, а удар го изпуска.',
      },
      peepz: {
        name: 'Един парк',
        blurb:
          'Вие сте животно, със спринт и ритник. Топка, рампа и място за тичане.',
      },
    },
    creating: 'Създава се…',
    create: 'Създай',
  },

  project: {
    notFound: 'Не е намерено',
    back: '← Разглеждане',

    savedLabel: 'Запазено',
    neverSavedNote: 'никога не е запазвано',
    editingNote: 'това, което редактирате',
    liveLabel: 'На живо',
    notPublished: 'не е публикувано',
    upToDate: 'актуално',
    storeServes: 'това още се раздава от магазина',
    filesLabel: 'Файлове',
    inFolder: 'в папката',
    sizeLabel: 'Размер',
    countsAgainst: 'брои се срещу този спейс',
    playedLabel: 'Играно',
    neverPlayed: 'никога не е играно',
    sessionOne: 'сесия общо',
    sessionMany: 'сесии общо',
    sessionHours: 'сесии · {n} ч.',

    editing: 'Редактиране',
    cartridge: 'На рафта',
    cartridgeNote:
      'Така изглежда нивото ви навсякъде, където някой го взима в ръка — в магазина, в списанието на един спейс, в помощника за битки. Картинката е последната снимка на нивото; от какво е корпусът се задава в редактора, до режима.',
    changeTheFinish: 'Смени материала',
    neverSaved:
      'Още нищо не е запазено — редакторът отваря това, от което е започнато.',
    opensOn: 'Отваря v{v}, което е черновата, а не това, което раздава магазинът.',
    oneAtATime: 'По един човек наведнъж; освобождава се само, ако някой затвори таба.',
    openEditor: 'Отвори редактора',
    playNote:
      'За да го играете с други хора, заредете го на място или започнете битка върху него. Няма какво да се инсталира.',
    magazine: 'Списание',
    saved: 'Какво са запазили играчите',
    savedNote:
      'Виждате колко е запазено и кога се е променило за последно. Какво пише в собствения запис на един играч не може да прочетете — това е негово, във вашата игра.',
    oneSave: '1 запис',
    manySaves: '{n} записа',
    lastWritten: 'последно писано',
    review: 'Проверка',
    releases: 'Издания',
    whoElse: 'Кой още',
    handOver: 'Предай го',
    copy: 'Копирай',
    export: 'Експорт',
    exportNote:
      'Цялата папка като zip — документът, картинките, моделите, звукът. Отваря се пак навсякъде, където това работи.',
    download: 'Изтегли',
    remove: 'Премахни от този спейс',
    scopes: {
      player: 'Всеки играч, лично',
      shared: 'Всеки играч, видимо за спейса',
      space: 'Спейсът, заедно',
    },
  },

  controls: {
    waiting:
      'Чака проверка. Може да продължите да запазвате — чете се версията, която е била текуща при подаването.',
    withdrawing: 'Оттегля се…',
    withdraw: 'Вземи го обратно',
    anythingToKnow: 'Има ли нещо, което да знаем?',
    whatChanged: 'Какво се е променило от последния път, или какво да пробваме първо.',
    sending: 'Изпраща се…',
    submit: 'Подай го',
    makeLive: 'Пусни това на живо',
    removeBody: 'Изважда го от този спейс и спира да ви струва място.',
    staysYours: 'Остава ваше — задържате го и може да го експортирате.',
    staysTheirs:
      'Остава при този, на когото принадлежи; той го задържа и може да го експортира. Не изтривате неговата работа.',
    why: 'Защо',
    theyWillRead: 'Това ще бъде прочетено.',
    removing: 'Премахва се…',
    remove: 'Премахни от този спейс',
    copyNote:
      'Нова чернова със същото съдържание, ваша. Не струва допълнително място — копието сочи към файловете, които вече са тук.',
    copying: 'Копира се…',
    copy: 'Направи копие',
    everybody: 'Всички в този спейс',
    policies: {
      none: 'не могат да го отворят',
      view: 'могат да го гледат',
      edit: 'могат да го редактират',
    },
    canEdit: 'може да редактира',
    canLook: 'може да гледа',
    revoke: 'премахни',
    add: 'Добави',
    everybodyHas: 'Всички тук вече го имат. ',
    toShare: ', за да го споделите с тях.',
    saving: 'Запазва се…',
    apply: 'Приложи',
    andThese: 'И тези хора',
    nobodyYet: 'Още никой.',
    somebody: 'Някой в този спейс',
    whatTheyCanDo: 'Какво им е позволено',
    adding: 'Добавя се…',
    inviteToSpace: 'Поканете някого в спейса',
    handOverNote:
      'Дайте го на някой друг в този спейс. Той става собственик, а вие вече не — само той може да го върне.',
    whoBecomesOwner: 'Кой става собственик',
    handingOver: 'Предава се…',
    handOver: 'Предай го',
    moveNote:
      'Преместете го в друг ваш спейс. Остава ваше; файловете се копират, а копието в този спейс се затваря.',
    whichSpace: 'Кой спейс',
    moving: 'Премества се…',
    move: 'Премести го',
  },
}

const DICTS: Record<Locale, BrowseDict> = {
  en: BROWSE_EN,
  de: BROWSE_DE,
  bg: BROWSE_BG,
}

export function browseDict(locale: Locale): BrowseDict {
  return DICTS[locale]
}
