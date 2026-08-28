import { NEEDS_EN, type HostCapability } from '@kxb/xp/host'
import { PRESETS_EN, type Preset } from '@kxb/xp'
import type { Ending } from '@/app/xp/_runtime/match/match'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The words drawn over a running level.
 *
 * A second dictionary rather than a section of `./world`, and that is not an
 * oversight. docs/xp/creator.md §1.3 makes the XP runtime a *copy* of the
 * world's HUD kit rather than a caller of it — there is a lint rule saying
 * `src/app/xp/**` may not import `@/app/world/*` — and the reason is that the
 * two are allowed to drift: an XP's panel is generated from a document's own
 * bindings, and the lounge's is six keys it knows by heart. One dictionary
 * across the boundary would quietly re-couple what that rule separates, and
 * the first thing to go would be a key whose German name the lounge changed.
 *
 * Where a row genuinely says the same thing in both — Move, Sprint, Dance —
 * the translation is deliberately word-for-word what `./world` says. Two
 * tables, one vocabulary.
 *
 * ---------------------------------------------------------------------------
 * Keycaps are not words
 * ---------------------------------------------------------------------------
 * `Space`, `Shift`, `Esc`, `G`, `Z`, `V`, `H` and every letter a document binds
 * stay as they are: they are printed on the reader's own hardware. The soft
 * buttons a phone draws are ours, and live in `faces`.
 *
 * One thing more is deliberately *not* here: `does`, the name an author gives
 * an action. `xpControls` prints it raw, the rules match on it exactly, and a
 * panel that translated it would promise a verb the level does not have.
 */
export interface XpDict {
  /**
   * The half of each control row that says what the key does.
   *
   * Rows a document generates are absent — see the note above.
   */
  controls: {
    move: string
    dragToLook: string
    /** Two jumps, because a second one nobody finds is a second one nobody has. */
    doubleJump: string
    sprint: string
    /**
     * The thumb's sprint, which is a place rather than a key.
     *
     * A phone has no Shift, so running is the stick pushed past the ring it is
     * drawn in - see `SPRINT_REACH` in the runtime's `input/touch`. The row
     * exists because the whole of the visible ring is the walk, so nothing on
     * the screen says the extra speed is there until you have found it, and a
     * level laid out against a sprint span is unfinishable until you do.
     */
    pushToRun: string
    fire: string
    dance: string
    emotes: string
    saySomething: string
    thirdPerson: string
    firstPerson: string
    callAVote: string
    controls: string
    leave: string

    /** The faces of the buttons a phone draws, which are ours to name. */
    faces: {
      jump: string
      dance: string
      face: string
      say: string
      fire: string
    }

    /** How a glyph is read out, for somebody who cannot see it. */
    spoken: {
      leftClick: string
      rightClick: string
      dragAnywhere: string
      theStick: string
      /** Joins two glyphs that do the same thing. */
      or: string
    }
  }

  /** The modal the controls are listed in. */
  panel: {
    title: string
    close: string
    /** Back to the level, from a panel that opens over a running one. */
    play: string
  }

  /** Which thumb the stick belongs under. */
  hand: {
    which: string
    controls: string
    groupLabel: string
    rightTitle: string
    rightHint: string
    leftTitle: string
    leftHint: string
    gateBody: string
  }

  /** Whether moving also turns the camera. See `@/lib/controls/camera-mode`. */
  camera: {
    heading: string
    groupLabel: string
    steerTitle: string
    steerHint: string
    freeTitle: string
    freeHint: string
  }

  /** The faces you can pull, and the button that opens them. */
  emotes: {
    open: string
    close: string
    /** The tooltip, which names the key beside the word. */
    title: string
  }

  /** The one line of chat a level gets. */
  chat: {
    placeholder: string
    label: string
    send: string
    didNotSend: string
  }

  /**
   * What is drawn over the world while it is being played.
   *
   * Two things a level supplies are deliberately absent: the role a document
   * deals you (`you are {role}`) and the name of a side. Both are the author's
   * words, drawn in the author's colours, and the same argument applies as to
   * `does` — the level is the thing that is right.
   */
  hud: {
    /** `{n}` other people are here. */
    otherOne: string
    otherMany: string
    /** `{n}` kills, and `{n}` claims the arbiter has not settled. */
    killOne: string
    killMany: string
    pending: string
    /** `{role}` is the author's own word for it. */
    youAre: string
    seenNobody: string
    seenTeam: string

    won: string
    runOver: string
    out: string
    watchSomebodyElse: string
    down: string
    youAreOut: string

    unstick: string
    unstickTitle: string
    /** The `?` chip, which is the only way to the panel on a phone. */
    showControls: string
    enterVr: string
    clickToLook: string

    hp: string
    ammo: string

    /** `{time}` is a clock reading. */
    best: string
    /** `{n}` seconds left to vote. */
    vote: string
    /** `{n}` points scored. */
    pointOne: string
    pointMany: string
    /** The ending of a run that finished with no mode to name one. */
    finished: string
    draw: string
    newBest: string
    playAgain: string

    yourTurn: string
    /** `{name}` is whose go it is. */
    theirTurn: string
    somebody: string

    /**
     * The one-line state of a level's scripts.
     *
     * `{n}` is how many the document declares and `{attached}` how many are
     * actually wired to something. German and Bulgarian both count scripts with
     * a plural noun, so these are whole phrases rather than a word plus a
     * suffix.
     */
    scripts: {
      none: string
      broken: string
      noneAttached: string
      loading: string
      allRunning: string
      someRunning: string
      failureOne: string
      failureMany: string
    }
  }

  /** The screens and notices the scene itself draws. */
  scene: {
    /** The door out to another site. */
    door: {
      label: string
      heading: string
      body: string
      stay: string
      openIt: string
    }

    /**
     * A level the runtime will not open here.
     *
     * `meanings` says what a missing capability costs, from the player's side.
     * `describeNeed` in `@kxb/xp/host` says the same thing from the store's,
     * and the two are deliberately different sentences: one is a warning
     * before you choose, this is the reason you cannot.
     */
    unplayable: {
      heading: string
      /** `{name}` is the level, `{missing}` the list of what it wants. */
      asksFor: string
      /** Precedes the field name, which is code and stays as it is. */
      declaredIn: string
      /** Follows it. */
      declaredTail: string
    }
    meanings: Record<HostCapability, string>

    /**
     * What went wrong while playing, in the corner.
     *
     * Each pair is the same failure said two ways: the first when signing in
     * would fix it, the second when nothing the player can do would.
     */
    troubles: {
      progressNeedsAccount: string
      progressLost: string
      finishNeedsAccount: string
      finishLost: string
      dataNeedsAccount: string
      /** `{name}` is the field the level tried to keep. */
      dataLost: string
      checkpointUnread: string
      interpreter: string
    }
  }

  /**
   * How a match ended.
   *
   * Passed into `describeEnding` rather than read inside it: that function is
   * beside the machine that produces an `Ending`, and a dictionary import there
   * would point the runtime at the app's i18n tree for one record.
   */
  endings: Record<Ending, string>

  /**
   * What a level asks of wherever it is opened, said before somebody opens it.
   *
   * The disclosure half of docs/xp/state.md §7.7. Handed to `describeNeed` in
   * `@kxb/xp/host`, which keeps the English beside the capability because those
   * sentences are part of the contract - this is the same contract translated.
   */
  needs: Record<HostCapability, string>

  /** The line under each mode in a picker. Handed to `describePreset`. */
  presets: Record<Preset, string>
}

export const XP_EN: XpDict = {
  controls: {
    move: 'Move',
    dragToLook: 'Drag to look',
    doubleJump: 'Jump ×2',
    sprint: 'Sprint',
    pushToRun: 'Push past the ring to run',
    fire: 'Fire',
    dance: 'Dance',
    emotes: 'Emotes',
    saySomething: 'Say something',
    thirdPerson: 'Third person',
    firstPerson: 'First person',
    callAVote: 'Call a vote',
    controls: 'Controls',
    leave: 'Leave',

    faces: {
      jump: 'Jump',
      dance: 'Dance',
      face: 'Face',
      say: 'Say',
      fire: 'Fire',
    },

    spoken: {
      leftClick: 'left click',
      rightClick: 'right click',
      dragAnywhere: 'drag anywhere on the screen',
      theStick: 'the on-screen stick',
      or: 'or',
    },
  },

  panel: {
    title: 'Controls',
    close: 'Close controls',
    play: 'Play',
  },

  hand: {
    which: 'Which hand?',
    controls: 'Controls',
    groupLabel: 'Which hand the on-screen controls belong to',
    rightTitle: 'Right-handed',
    rightHint: 'Steer left, act right',
    leftTitle: 'Left-handed',
    leftHint: 'Steer right, act left',
    gateBody:
      'So the stick lands under the right thumb. You can swap it later from the controls panel.',
  },

  camera: {
    heading: 'Camera',
    groupLabel: 'How the camera is driven',
    steerTitle: 'Turn and go',
    steerHint: 'Sideways turns you, forward walks',
    freeTitle: 'On its own',
    freeHint: 'Drag or use the mouse to look',
  },

  emotes: {
    open: 'Open emotes',
    close: 'Close emotes',
    title: 'Emotes (Z)',
  },

  chat: {
    placeholder: 'say something',
    label: 'Say something',
    send: 'send',
    didNotSend: 'That did not send',
  },

  hud: {
    otherOne: '{n} other here',
    otherMany: '{n} others here',
    killOne: '{n} kill',
    killMany: '{n} kills',
    pending: '{n} pending',
    youAre: 'you are {role}',
    seenNobody: 'nobody can see you',
    seenTeam: 'only your own side can see you',

    won: 'won',
    runOver: 'the level says this run is over',
    out: 'out',
    watchSomebodyElse: '← → to watch somebody else',
    down: 'down',
    youAreOut: 'you are out',

    unstick: 'Unstick',
    unstickTitle: 'Put me back at the start',
    showControls: 'Controls',
    enterVr: 'Enter VR',
    clickToLook: 'click to look · H for controls',

    hp: 'hp',
    ammo: 'ammo',

    best: 'best {time}',
    vote: 'vote · {n}s',
    pointOne: '{n} point',
    pointMany: '{n} points',
    finished: 'finished',
    draw: 'draw',
    newBest: 'a new best',
    playAgain: 'R to play again',

    yourTurn: 'your turn',
    theirTurn: "{name}'s turn",
    somebody: 'somebody',

    scripts: {
      none: 'no scripts',
      broken: '{n} scripts · {broken} broken',
      noneAttached: '{n} scripts · none attached',
      loading: '{n} scripts loading',
      allRunning: '{n} scripts running',
      someRunning: '{attached}/{n} scripts running',
      failureOne: '{n} script failure',
      failureMany: '{n} script failures',
    },
  },

  scene: {
    door: {
      label: 'Open a level from somewhere else',
      heading: 'Leave for another site?',
      body: 'This level wants to open one that is not ours. Opening it tells that site you were here.',
      stay: 'Stay',
      openIt: 'Open it',
    },

    unplayable: {
      heading: 'Not here',
      asksFor: 'asks for something this screen does not have: {missing}.',
      declaredIn: 'It is declared in the level’s',
      declaredTail:
        'which is the half that refuses rather than degrades — so the level is not opened at all instead of opening and quietly losing what it does.',
    },
    meanings: {
      identity: 'somebody signed in',
      network: 'other people in the room',
      persistence: 'somewhere to save',
      arbiter: 'a server to decide things neither player may',
      chat: 'somewhere to talk',
    },

    troubles: {
      progressNeedsAccount: 'this level saves your progress — sign in to keep it',
      progressLost: 'that checkpoint was not saved',
      finishNeedsAccount: 'this level records finishes — sign in to keep yours',
      finishLost: 'that time was not recorded',
      dataNeedsAccount: 'this level keeps track of things — sign in to keep yours',
      dataLost: '"{name}" was not saved',
      checkpointUnread: 'could not read where you left off — starting at the spawn',
      interpreter:
        'scripts: the interpreter did not load. Nothing scripted in this level will run - a reload usually fixes it.',
    },
  },

  endings: {
    finish: 'finished',
    score: 'score limit',
    time: 'full time',
  },

  needs: NEEDS_EN,
  presets: PRESETS_EN,
}

export const XP_DE: XpDict = {
  controls: {
    move: 'Bewegen',
    dragToLook: 'Ziehen zum Umsehen',
    doubleJump: 'Doppelsprung',
    sprint: 'Sprinten',
    pushToRun: 'Über den Ring hinaus: rennen',
    fire: 'Feuern',
    dance: 'Tanzen',
    emotes: 'Gesten',
    saySomething: 'Etwas sagen',
    thirdPerson: 'Dritte Person',
    firstPerson: 'Erste Person',
    callAVote: 'Abstimmung starten',
    controls: 'Steuerung',
    leave: 'Verlassen',

    faces: {
      jump: 'Sprung',
      dance: 'Tanz',
      face: 'Geste',
      say: 'Sagen',
      fire: 'Feuer',
    },

    spoken: {
      leftClick: 'Linksklick',
      rightClick: 'Rechtsklick',
      dragAnywhere: 'irgendwo über den Bildschirm ziehen',
      theStick: 'der Stick auf dem Bildschirm',
      or: 'oder',
    },
  },

  panel: {
    title: 'Steuerung',
    close: 'Steuerung schließen',
    play: 'Spielen',
  },

  hand: {
    which: 'Welche Hand?',
    controls: 'Steuerung',
    groupLabel: 'Zu welcher Hand die Bildschirmsteuerung gehört',
    rightTitle: 'Rechtshändig',
    rightHint: 'Links lenken, rechts handeln',
    leftTitle: 'Linkshändig',
    leftHint: 'Rechts lenken, links handeln',
    gateBody:
      'Damit der Stick unter dem richtigen Daumen liegt. Sie können das später in der Steuerung tauschen.',
  },

  camera: {
    heading: 'Kamera',
    groupLabel: 'Wie die Kamera gesteuert wird',
    steerTitle: 'Drehen und los',
    steerHint: 'Seitwärts dreht, vorwärts geht',
    freeTitle: 'Eigene Steuerung',
    freeHint: 'Ziehen oder Maus zum Umsehen',
  },

  emotes: {
    open: 'Gesten öffnen',
    close: 'Gesten schließen',
    title: 'Gesten (Z)',
  },

  chat: {
    placeholder: 'etwas sagen',
    label: 'Etwas sagen',
    send: 'senden',
    didNotSend: 'Das wurde nicht gesendet',
  },

  hud: {
    otherOne: '{n} weitere Person hier',
    otherMany: '{n} weitere Personen hier',
    killOne: '{n} Abschuss',
    killMany: '{n} Abschüsse',
    pending: '{n} ausstehend',
    youAre: 'Sie sind {role}',
    seenNobody: 'niemand sieht Sie',
    seenTeam: 'nur Ihre eigene Seite sieht Sie',

    won: 'gewonnen',
    runOver: 'das Level sagt, dieser Lauf ist vorbei',
    out: 'raus',
    watchSomebodyElse: '← → um jemand anderem zuzusehen',
    down: 'am Boden',
    youAreOut: 'Sie sind raus',

    unstick: 'Befreien',
    unstickTitle: 'Setzen Sie mich zurück an den Start',
    showControls: 'Steuerung',
    enterVr: 'VR starten',
    clickToLook: 'klicken zum Umsehen · H für die Steuerung',

    hp: 'hp',
    ammo: 'Muni',

    best: 'Bestzeit {time}',
    vote: 'Abstimmung · {n}s',
    pointOne: '{n} Punkt',
    pointMany: '{n} Punkte',
    finished: 'beendet',
    draw: 'unentschieden',
    newBest: 'eine neue Bestzeit',
    playAgain: 'R für noch mal',

    yourTurn: 'Sie sind am Zug',
    theirTurn: '{name} ist am Zug',
    somebody: 'jemand',

    scripts: {
      none: 'keine Skripte',
      broken: '{n} Skripte · {broken} defekt',
      noneAttached: '{n} Skripte · keines verknüpft',
      loading: '{n} Skripte werden geladen',
      allRunning: '{n} Skripte laufen',
      someRunning: '{attached}/{n} Skripte laufen',
      failureOne: '{n} Skriptfehler',
      failureMany: '{n} Skriptfehler',
    },
  },

  scene: {
    door: {
      label: 'Ein Level von woanders öffnen',
      heading: 'Zu einer anderen Seite wechseln?',
      body: 'Dieses Level möchte eines öffnen, das nicht von uns ist. Wer es öffnet, verrät jener Seite, dass er hier war.',
      stay: 'Hierbleiben',
      openIt: 'Öffnen',
    },

    unplayable: {
      heading: 'Nicht hier',
      asksFor: 'verlangt etwas, das dieser Bildschirm nicht hat: {missing}.',
      declaredIn: 'Deklariert ist das im',
      declaredTail:
        'des Levels — der Hälfte, die ablehnt statt nachzugeben. Das Level wird also gar nicht erst geöffnet, statt zu öffnen und still zu verlieren, was es tut.',
    },
    meanings: {
      identity: 'jemanden, der angemeldet ist',
      network: 'andere Leute im Raum',
      persistence: 'einen Ort zum Speichern',
      arbiter: 'einen Server, der entscheidet, was keiner der Spielenden darf',
      chat: 'einen Ort zum Reden',
    },

    troubles: {
      progressNeedsAccount:
        'dieses Level speichert Ihren Fortschritt — melden Sie sich an, um ihn zu behalten',
      progressLost: 'dieser Zwischenstand wurde nicht gespeichert',
      finishNeedsAccount:
        'dieses Level hält Zieleinläufe fest — melden Sie sich an, um Ihre zu behalten',
      finishLost: 'diese Zeit wurde nicht festgehalten',
      dataNeedsAccount:
        'dieses Level merkt sich Dinge — melden Sie sich an, um Ihre zu behalten',
      dataLost: '„{name}“ wurde nicht gespeichert',
      checkpointUnread:
        'konnte nicht lesen, wo Sie aufgehört haben — Start am Startpunkt',
      interpreter:
        'Skripte: der Interpreter wurde nicht geladen. Nichts Skriptgesteuertes in diesem Level läuft - ein Neuladen behebt das meistens.',
    },
  },

  endings: {
    finish: 'beendet',
    score: 'Punktgrenze',
    time: 'Spielende',
  },

  needs: {
    identity: 'Sie müssen angemeldet sein',
    network: 'Wird mit anderen gespielt',
    persistence: 'Merkt sich, was Sie tun',
    arbiter: 'Zählt die Punkte auf dem Server',
    chat: 'Man kann darin reden',
  },
  presets: {
    freestyle: 'Keine Punkte und kein Ende - eine Welt zum Dasein',
    deathmatch: 'Keine Teams; Abschüsse zählen, und die meisten gewinnen',
    football: 'Zwei Seiten, ein Ball und ein Tor an jedem Ende',
    parkour: 'Ein Start, ein Ziel und die Uhr dazwischen',
    shooter: 'Waffen und Ziele, gewertet nach dem, was Sie treffen',
  },
}

export const XP_BG: XpDict = {
  controls: {
    move: 'Движение',
    dragToLook: 'Влачене за оглеждане',
    doubleJump: 'Двоен скок',
    sprint: 'Спринт',
    pushToRun: 'Отвъд пръстена: бягане',
    fire: 'Стрелба',
    dance: 'Танц',
    emotes: 'Жестове',
    saySomething: 'Кажете нещо',
    thirdPerson: 'Трето лице',
    firstPerson: 'Първо лице',
    callAVote: 'Свикай гласуване',
    controls: 'Управление',
    leave: 'Излизане',

    faces: {
      jump: 'Скок',
      dance: 'Танц',
      face: 'Жест',
      say: 'Кажи',
      fire: 'Огън',
    },

    spoken: {
      leftClick: 'ляв бутон',
      rightClick: 'десен бутон',
      dragAnywhere: 'влачене където и да е по екрана',
      theStick: 'стикът на екрана',
      or: 'или',
    },
  },

  panel: {
    title: 'Управление',
    close: 'Затвори управлението',
    play: 'Играй',
  },

  hand: {
    which: 'Коя ръка?',
    controls: 'Управление',
    groupLabel: 'На коя ръка принадлежат екранните бутони',
    rightTitle: 'Дясна ръка',
    rightHint: 'Управление вляво, действие вдясно',
    leftTitle: 'Лява ръка',
    leftHint: 'Управление вдясно, действие вляво',
    gateBody:
      'За да падне стикът под правилния палец. Може да го смените по-късно от панела с управлението.',
  },

  camera: {
    heading: 'Камера',
    groupLabel: 'Как се управлява камерата',
    steerTitle: 'Завърти и тръгни',
    steerHint: 'Настрани завърта, напред върви',
    freeTitle: 'Сама за себе си',
    freeHint: 'Влачене или мишка за оглеждане',
  },

  emotes: {
    open: 'Отвори жестовете',
    close: 'Затвори жестовете',
    title: 'Жестове (Z)',
  },

  chat: {
    placeholder: 'кажете нещо',
    label: 'Кажете нещо',
    send: 'изпрати',
    didNotSend: 'Това не беше изпратено',
  },

  hud: {
    otherOne: 'още {n} човек тук',
    otherMany: 'още {n} души тук',
    killOne: '{n} убийство',
    killMany: '{n} убийства',
    pending: '{n} в изчакване',
    youAre: 'вие сте {role}',
    seenNobody: 'никой не ви вижда',
    seenTeam: 'вижда ви само вашата страна',

    won: 'спечели',
    runOver: 'нивото казва, че този опит свърши',
    out: 'вън',
    watchSomebodyElse: '← → за да гледате някой друг',
    down: 'паднал',
    youAreOut: 'вие сте вън',

    unstick: 'Отлепи',
    unstickTitle: 'Върнете ме в началото',
    showControls: 'Управление',
    enterVr: 'Влез във VR',
    clickToLook: 'щракнете за оглеждане · H за управлението',

    hp: 'hp',
    ammo: 'патрони',

    best: 'най-добро {time}',
    vote: 'гласуване · {n}с',
    pointOne: '{n} точка',
    pointMany: '{n} точки',
    finished: 'завършено',
    draw: 'равен',
    newBest: 'ново най-добро',
    playAgain: 'R за още веднъж',

    yourTurn: 'ваш ред',
    theirTurn: 'ред на {name}',
    somebody: 'някой',

    scripts: {
      none: 'няма скриптове',
      broken: '{n} скрипта · {broken} счупени',
      noneAttached: '{n} скрипта · нито един закачен',
      loading: '{n} скрипта се зареждат',
      allRunning: '{n} скрипта работят',
      someRunning: '{attached}/{n} скрипта работят',
      failureOne: '{n} грешка в скрипт',
      failureMany: '{n} грешки в скриптове',
    },
  },

  scene: {
    door: {
      label: 'Отвори ниво от другаде',
      heading: 'Да минем ли към друг сайт?',
      body: 'Това ниво иска да отвори друго, което не е наше. Отворите ли го, онзи сайт разбира, че сте били тук.',
      stay: 'Остани',
      openIt: 'Отвори го',
    },

    unplayable: {
      heading: 'Не тук',
      asksFor: 'иска нещо, което този екран няма: {missing}.',
      declaredIn: 'Заявено е в',
      declaredTail:
        'на нивото — половината, която отказва, вместо да отстъпи. Затова нивото изобщо не се отваря, вместо да се отвори и тихо да загуби това, което прави.',
    },
    meanings: {
      identity: 'някой, който е влязъл',
      network: 'други хора в стаята',
      persistence: 'място за запазване',
      arbiter: 'сървър, който решава каквото никой от играчите не бива',
      chat: 'място за говорене',
    },

    troubles: {
      progressNeedsAccount:
        'това ниво пази напредъка ви — влезте, за да го запазите',
      progressLost: 'тази точка на запис не беше запазена',
      finishNeedsAccount:
        'това ниво записва финиширания — влезте, за да запазите вашите',
      finishLost: 'това време не беше записано',
      dataNeedsAccount:
        'това ниво помни разни неща — влезте, за да запазите вашите',
      dataLost: '„{name}“ не беше запазено',
      checkpointUnread:
        'не можах да прочета докъде сте стигнали — започваме от началната точка',
      interpreter:
        'скриптове: интерпретаторът не се зареди. Нищо скриптирано в това ниво няма да работи - презареждане обикновено помага.',
    },
  },

  endings: {
    finish: 'завършено',
    score: 'граница на точките',
    time: 'край на времето',
  },

  needs: {
    identity: 'Трябва да сте влезли',
    network: 'Играе се с други',
    persistence: 'Помни какво правите',
    arbiter: 'Брои точките на сървъра',
    chat: 'Може да се говори',
  },
  presets: {
    freestyle: 'Без точки и без край - свят, в който просто да сте',
    deathmatch: 'Без отбори; убийствата се броят, а най-многото печели',
    football: 'Две страни, една топка и по една врата на всеки край',
    parkour: 'Един старт, един финал и часовникът между тях',
    shooter: 'Оръжия и мишени, точкувано по това, което улучите',
  },
}

/**
 * A table rather than a ternary, for the reason `./store` gives: the ternary
 * answered English for everything that was not German, so a new language was
 * not a build error anywhere - it was an English HUD over a translated game.
 */
const DICTS: Record<Locale, XpDict> = { en: XP_EN, de: XP_DE, bg: XP_BG }

export function xpDict(locale: Locale): XpDict {
  return DICTS[locale]
}
