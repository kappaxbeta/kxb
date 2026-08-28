/**
 * `@kxb/boxing/words` - everything this game says, in the languages it says it.
 *
 * ---------------------------------------------------------------------------
 * The words belong to the game; the language belongs to the host
 * ---------------------------------------------------------------------------
 * Same split as the transport, the clock and the speaker - see the header of
 * `./game.tsx` - and the line falls in a different place than it does for those.
 * A host knows which language its reader wants and has no business knowing that
 * a boxing match has a walkout, a ten-point-must card or a standing eight. So
 * the *locale* is handed in as a two-letter string and the *copy* ships here,
 * beside the game that means it.
 *
 * The alternative - the platform passing in a dictionary - would make every
 * host that mounts this game responsible for translating a sport, and a host
 * that got it wrong would be a host with a blank result card.
 *
 * ---------------------------------------------------------------------------
 * Phrases, not slots
 * ---------------------------------------------------------------------------
 * A slot is only ever a name, a number or a reason - something no language
 * inflects. Everything a language *does* inflect is written out per language,
 * which is why `round` is a whole sentence in each and not `{word} {n}`:
 * German needs "Runde", Bulgarian needs "Рунд", and a template that assembled
 * them from parts would be a template that comes apart the first time somebody
 * adds a language with a case system.
 *
 * ---------------------------------------------------------------------------
 * Anything unknown is English
 * ---------------------------------------------------------------------------
 * `wordsFor` takes a `string` rather than a union on purpose: the locale comes
 * from a host this package has never met, and a game that threw on `fr` would
 * be a game that a correct host can crash by being ahead of it. A missing
 * language is a fight in English, which is the fight everybody could read
 * before this file existed.
 */

export interface BoxingWords {
  /** The big word in the middle. Drawn uppercase - see `Callout`. */
  callout: {
    down: string
    /** `{n}` is the referee's count. */
    count: string
    ko: string
    tko: string
    /** The bell ending the last round, when nobody was stopped. */
    time: string
    /** What the referee says to start it. */
    fight: string
    /** `{n}` is the round number. */
    round: string
    endOfRound: string
    /** `{name}` is a fighter. */
    wins: string
    draw: string
  }

  /** Under the clock, between the two health bars. */
  phase: {
    lobby: string
    rest: string
    walkout: string
    /** `{n}` of `{total}`. */
    round: string
  }

  /** The line above the result, saying how it ended. */
  how: {
    ko: string
    tko: string
    decision: string
    draw: string
  }

  result: {
    draw: string
    youWin: string
    youLose: string
    waiting: string
    again: string
    theyWantAnother: string
  }

  lobby: {
    beforeTheBell: string
    bothHere: string
    waitingSomebody: string
    /** The seat with nobody in it. */
    empty: string
    ready: string
    imReady: string
    invite: string
    copy: string
    copied: string
  }

  /** Words that label a person or a seat rather than an event. */
  seat: {
    you: string
    ready: string
    notReady: string
  }

  /** The other corner has gone quiet. */
  away: {
    reconnecting: string
    paused: string
    /** `{name}` is the other fighter. */
    waitingFor: string
    /** `{n}` is whole seconds of silence. */
    silence: string
  }

  /** This tab is not the one being looked at. */
  hidden: {
    paused: string
    heading: string
    body: string
    comeBack: string
  }

  joining: {
    lacingUp: string
    /** `{reason}` is whatever the host said. */
    failed: string
  }

  /** The keyboard legend under the fight. */
  keys: {
    move: string
    dash: string
    guard: string
    slip: string
    parry: string
    jab: string
    cross: string
    hook: string
    uppercut: string
    overhand: string
  }

  /**
   * The thumb pad. Two strings per button: what is printed on it and what a
   * screen reader is told.
   *
   * The printed one is an abbreviation because the button is a thumb wide, and
   * abbreviations do not survive translation by rule - "HK" is not a shortening
   * of "Кроше". So each language writes its own rather than having one clipped
   * for it.
   */
  pad: {
    controls: string
    jab: readonly [string, string]
    cross: readonly [string, string]
    hook: readonly [string, string]
    uppercut: readonly [string, string]
    overhand: readonly [string, string]
    slip: readonly [string, string]
    parry: readonly [string, string]
    guard: readonly [string, string]
    left: string
    right: string
    dashLeft: string
    dashRight: string
  }

  /** Read aloud, never drawn. */
  aria: {
    /** `{n}` knockdowns this round. */
    downs: string
    /** `{name}`'s health bar. */
    health: string
    /** `{name}`'s stamina bar. */
    stamina: string
  }
}

export const BOXING_EN: BoxingWords = {
  callout: {
    down: 'Down',
    count: 'count {n}',
    ko: 'K.O.',
    tko: 'T.K.O.',
    time: 'Time',
    fight: 'Fight',
    round: 'Round {n}',
    endOfRound: 'End of round',
    wins: '{name} wins',
    draw: 'A draw',
  },
  phase: {
    lobby: 'the lobby',
    rest: 'rest',
    walkout: 'seconds out',
    round: 'round {n} / {total}',
  },
  how: {
    ko: 'by knockout',
    tko: 'by technical knockout',
    decision: 'on the cards',
    draw: 'a draw',
  },
  result: {
    draw: 'Draw',
    youWin: 'You win',
    youLose: 'You lose',
    waiting: 'Waiting for the other corner…',
    again: 'Fight again',
    theyWantAnother: 'They want another one.',
  },
  lobby: {
    beforeTheBell: 'before the bell',
    bothHere: 'Both corners are here',
    waitingSomebody: 'Waiting for somebody',
    empty: 'Empty',
    ready: 'Ready — waiting for the other corner',
    imReady: "I'm ready",
    invite: 'invite somebody',
    copy: 'copy',
    copied: 'copied',
  },
  seat: { you: 'you', ready: 'ready', notReady: 'not ready' },
  away: {
    reconnecting: 'reconnecting…',
    paused: 'paused',
    waitingFor: 'Waiting for {name}',
    silence:
      'Nothing has arrived from the other corner for {n} seconds. The fight carries on by itself as soon as it does.',
  },
  hidden: {
    paused: 'paused',
    heading: 'This tab is in the background',
    body: 'Browsers stop drawing a hidden tab, so this fighter cannot move or defend — and cannot be hit either.',
    comeBack: 'Come back to this tab and the fight carries on.',
  },
  joining: { lacingUp: 'Lacing up…', failed: 'Could not join the ring: {reason}' },
  keys: {
    move: 'left / right',
    dash: 'dash',
    guard: 'guard',
    slip: 'slip',
    parry: 'parry',
    jab: 'jab',
    cross: 'cross',
    hook: 'hook',
    uppercut: 'uppercut',
    overhand: 'overhand',
  },
  pad: {
    controls: 'Fight controls',
    jab: ['JAB', 'Jab'],
    cross: ['CRS', 'Cross'],
    hook: ['HK', 'Hook'],
    uppercut: ['UPP', 'Uppercut'],
    overhand: ['OVR', 'Overhand'],
    slip: ['SLIP', 'Slip'],
    parry: ['PRY', 'Parry'],
    guard: ['GUARD', 'Guard'],
    left: 'Move left',
    right: 'Move right',
    dashLeft: 'Dash left',
    dashRight: 'Dash right',
  },
  aria: {
    downs: '{n} down this round',
    health: '{name} health',
    stamina: '{name} stamina',
  },
}

export const BOXING_DE: BoxingWords = {
  callout: {
    down: 'Nieder',
    count: 'Anzählen {n}',
    ko: 'K.o.',
    tko: 'T.K.o.',
    time: 'Zeit',
    // What a German referee actually says to start a round.
    fight: 'Box',
    round: 'Runde {n}',
    endOfRound: 'Rundenende',
    wins: '{name} gewinnt',
    draw: 'Unentschieden',
  },
  phase: {
    lobby: 'die Lobby',
    rest: 'Pause',
    walkout: 'Sekunden raus',
    round: 'Runde {n} / {total}',
  },
  how: {
    ko: 'durch K.o.',
    tko: 'durch technischen K.o.',
    decision: 'nach Punkten',
    draw: 'unentschieden',
  },
  result: {
    draw: 'Unentschieden',
    youWin: 'Du gewinnst',
    youLose: 'Du verlierst',
    waiting: 'Warte auf die andere Ecke…',
    again: 'Nochmal kämpfen',
    theyWantAnother: 'Die andere Ecke will noch einen.',
  },
  lobby: {
    beforeTheBell: 'vor dem Gong',
    bothHere: 'Beide Ecken sind da',
    waitingSomebody: 'Warte auf jemanden',
    empty: 'Leer',
    ready: 'Bereit — warte auf die andere Ecke',
    imReady: 'Ich bin bereit',
    invite: 'jemanden einladen',
    copy: 'kopieren',
    copied: 'kopiert',
  },
  seat: { you: 'du', ready: 'bereit', notReady: 'nicht bereit' },
  away: {
    reconnecting: 'verbinde neu…',
    paused: 'pausiert',
    waitingFor: 'Warte auf {name}',
    silence:
      'Seit {n} Sekunden kommt nichts mehr aus der anderen Ecke. Sobald wieder etwas ankommt, läuft der Kampf von allein weiter.',
  },
  hidden: {
    paused: 'pausiert',
    heading: 'Dieser Tab ist im Hintergrund',
    body: 'Browser zeichnen einen versteckten Tab nicht mehr. Dieser Boxer kann sich also weder bewegen noch verteidigen — und getroffen werden kann er auch nicht.',
    comeBack: 'Zurück in diesen Tab, und der Kampf geht weiter.',
  },
  joining: {
    lacingUp: 'Handschuhe an…',
    failed: 'Konnte den Ring nicht betreten: {reason}',
  },
  keys: {
    move: 'links / rechts',
    dash: 'Ausfallschritt',
    guard: 'Deckung',
    slip: 'Abtauchen',
    parry: 'Parade',
    jab: 'Jab',
    cross: 'Cross',
    hook: 'Haken',
    uppercut: 'Uppercut',
    overhand: 'Overhand',
  },
  pad: {
    controls: 'Kampfsteuerung',
    jab: ['JAB', 'Jab'],
    cross: ['CRS', 'Cross'],
    hook: ['HKN', 'Haken'],
    uppercut: ['UPP', 'Uppercut'],
    overhand: ['OVR', 'Overhand'],
    slip: ['DUCK', 'Abtauchen'],
    parry: ['PAR', 'Parade'],
    guard: ['DECK', 'Deckung'],
    left: 'Nach links',
    right: 'Nach rechts',
    dashLeft: 'Ausfallschritt links',
    dashRight: 'Ausfallschritt rechts',
  },
  aria: {
    downs: '{n} Niederschläge in dieser Runde',
    health: 'Gesundheit von {name}',
    stamina: 'Ausdauer von {name}',
  },
}

export const BOXING_BG: BoxingWords = {
  callout: {
    down: 'Нокдаун',
    count: 'броене {n}',
    ko: 'К.О.',
    tko: 'Т.К.О.',
    time: 'Време',
    fight: 'Бокс',
    round: 'Рунд {n}',
    endOfRound: 'Край на рунда',
    wins: '{name} печели',
    draw: 'Равенство',
  },
  phase: {
    lobby: 'лобито',
    rest: 'почивка',
    walkout: 'секунданти вън',
    round: 'рунд {n} / {total}',
  },
  how: {
    ko: 'с нокаут',
    tko: 'с технически нокаут',
    decision: 'по точки',
    draw: 'равенство',
  },
  result: {
    draw: 'Равенство',
    youWin: 'Ти печелиш',
    youLose: 'Ти губиш',
    waiting: 'Чака се другият ъгъл…',
    again: 'Още един мач',
    theyWantAnother: 'Другият ъгъл иска още един.',
  },
  lobby: {
    beforeTheBell: 'преди гонга',
    bothHere: 'И двата ъгъла са тук',
    waitingSomebody: 'Чака се някой',
    empty: 'Празно',
    ready: 'Готов — чака се другият ъгъл',
    imReady: 'Готов съм',
    invite: 'покани някого',
    copy: 'копирай',
    copied: 'копирано',
  },
  seat: { you: 'ти', ready: 'готов', notReady: 'не е готов' },
  away: {
    reconnecting: 'свързване…',
    paused: 'на пауза',
    waitingFor: 'Чака се {name}',
    silence:
      'От {n} секунди не идва нищо от другия ъгъл. Мачът продължава сам, щом пристигне нещо.',
  },
  hidden: {
    paused: 'на пауза',
    heading: 'Този раздел е на заден план',
    body: 'Браузърите спират да рисуват скрит раздел, затова този боксьор не може нито да се движи, нито да се защитава — и не може да бъде уцелен.',
    comeBack: 'Върни се в този раздел и мачът продължава.',
  },
  joining: {
    lacingUp: 'Слагане на ръкавиците…',
    failed: 'Влизането в ринга не стана: {reason}',
  },
  keys: {
    move: 'ляво / дясно',
    dash: 'спринт',
    guard: 'защита',
    slip: 'измъкване',
    parry: 'париране',
    jab: 'джаб',
    cross: 'крос',
    hook: 'кроше',
    uppercut: 'ъперкът',
    overhand: 'овърхенд',
  },
  pad: {
    controls: 'Управление на боя',
    jab: ['ДЖБ', 'Джаб'],
    cross: ['КРС', 'Крос'],
    hook: ['КРШ', 'Кроше'],
    uppercut: ['ЪПР', 'Ъперкът'],
    overhand: ['ОВР', 'Овърхенд'],
    slip: ['ИЗМ', 'Измъкване'],
    parry: ['ПАР', 'Париране'],
    guard: ['ЗАЩ', 'Защита'],
    left: 'Наляво',
    right: 'Надясно',
    dashLeft: 'Спринт наляво',
    dashRight: 'Спринт надясно',
  },
  aria: {
    downs: '{n} нокдауна в този рунд',
    health: 'здраве на {name}',
    stamina: 'издръжливост на {name}',
  },
}

const DICTS: Record<string, BoxingWords> = {
  en: BOXING_EN,
  de: BOXING_DE,
  bg: BOXING_BG,
}

/**
 * The words for a locale, or English.
 *
 * Matched on the primary subtag, so `de-AT` and `de-CH` are German. We ship no
 * regional copy and refusing a Swiss reader their language over a suffix would
 * be a bug they cannot do anything about.
 */
export function wordsFor(locale: string | null | undefined): BoxingWords {
  if (!locale) return BOXING_EN
  return DICTS[locale.toLowerCase().split('-')[0]!] ?? BOXING_EN
}

/**
 * Put the names and numbers into a phrase.
 *
 * Deliberately tiny and deliberately not a formatter: a slot here is only ever
 * a fighter's name, a count or a host's error string, and none of those is a
 * date, a plural or a currency. The moment one is, this should become the
 * platform's `Intl` rather than grow a second implementation of it.
 */
export function say(phrase: string, values: Record<string, string | number> = {}): string {
  return phrase.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
