import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * How Mau-Mau was made - the same pattern as boxing, meeting the opposite
 * problem. Written from the package; every claim is checkable against
 * `packages/maumau`.
 */
export const MAKING_MAUMAU: Text<Guide> = {
  en: {
    title: 'How we built Mau-Mau',
    standfirst:
      'A card game where the whole design falls out of one sentence: a hand is a secret. Why the client decides nothing, the deck lives behind a lock, and two card packs share one grid.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'One sentence decides everything',
        body: [
          'Mau-Mau is the second game built as a package on the engine’s host SDK - same five imported interfaces as boxing, same "not an XP, no level, no document" stance. But where boxing hands authority to the clients, this game hands them nothing, and the reason fits in a sentence: a hand is a secret.',
          'A fighting game gives authority to the client because the alternative loses to lag. A card game cannot, because the alternative loses the game: whoever holds the deck can read every hand, and a client trusted not to look is a client that did not need the secret kept. There is no version of this game where the deck lives on somebody’s machine and the game is still worth playing.',
          'Every design in the package follows from that. Boxing has five message types on three schedules; this game’s wire is one nudge carrying a number. Boxing predicts its own punches; this game predicts nothing, because it need not. Boxing uses no randomness; this game uses the platform’s, never a seeded stream a client could replay.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The build, in the order it happened',
        steps: [
          {
            title: 'Cards and table rules, pure',
            body: [
              'What a card is, what a pack is, what a legal move is - values in, values out, no browser, no network, no clock. `bun test packages/maumau` plays whole hands in microseconds. Same argument as boxing, same payoff: the rules are trusted because a test plays faster than a human ever could.',
            ],
          },
          {
            title: 'Decide which Mau-Mau you are building - as data',
            body: [
              'Everybody thinks their Mau-Mau is the only one: do sevens stack, what does the jack do, how does the last card go out. Those are house rules, and they are settings - the thing boxing explicitly refused to have. The difference is symmetry: retuning a punch helps whoever throws it, which is one player; sevens stacking is the same game for everybody. There is no house rule one seat benefits from.',
              'And they are pinned at the deal and refused afterwards - not because changing them mid-hand would be unfair, but because it would be incoherent: turning stacking off with six penalty cards owed is a state the rules have no answer for.',
            ],
            watch: 'Settings that are asymmetric are not settings, they are an unfair match. Sort every option by who it helps.',
          },
          {
            title: 'Run the whole game where no player can reach',
            body: [
              'The entire table logic runs once, at the arbiter, and every client is handed back a redaction: your cards in full, everybody else’s as a number. The client cannot cheat because the client does not know anything worth cheating with.',
            ],
          },
          {
            title: 'Teach the same rules to two authorities',
            body: [
              'The package teaches the whole of Mau-Mau to an in-memory arbiter, so four memory hosts in a test are four players who cannot decide anything for themselves - the same property the real authority has, expressed in a Map and provable in microseconds. The real one is a database function, because the production requirement is a lock: two players pressing a card in the same tick both read the same turn, and only one of them may have it.',
            ],
            watch: 'The test authority and the real authority must implement the same rules against the same state shape - or your tests prove a game you are not shipping.',
          },
          {
            title: 'Two packs, one grid',
            body: [
              'The game ships two card looks: hand-drawn faces that fill a 552x752 frame with smoothing, and 64x64 cards from 1993 that must be drawn pixelated or they are a smudge. They agree about almost nothing - except the grid, because the atlas builder insists on it: rows are the four suits, columns run A, 2…10, J, Q, K. So the cell-lookup is written once and neither finish appears in it.',
              'And a finish is deliberately not a house rule: the authority pins rules because a table must play one game, but two players looking at two different card backs are still playing the same hand. What changes nothing anybody can be refused for does not belong in the pinned settings.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words in the code',
        terms: [
          { term: 'Arbiter', means: 'Here: the whole game. The only thing at the table allowed to see a hand.' },
          { term: 'Seen', means: 'The redaction a client receives - own cards in full, all others as counts.' },
          { term: 'House rules', means: 'Which Mau-Mau: symmetric settings, pinned at the deal, refused afterwards.' },
          { term: 'Finish', means: 'Which card art draws the table - per player, and deliberately not a rule.' },
          { term: 'memoryHost / MemoryArbiter', means: 'The test-side host and authority that make four players out of a Map.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'What we would tell ourselves at the start',
        items: [
          'Name your game’s one deciding sentence early. Ours was "a hand is a secret", and it answered every later argument.',
          'Authority is per-game, not per-platform: the same SDK carries a client-authoritative fighter and a fully authoritative card table.',
          'Randomness a client could reproduce is a hand a client can read.',
          'Concurrent turns need a lock, not a convention - two presses in one tick will happen on the first real evening.',
          'Keep cosmetics out of the rules object, or every skin becomes a rules negotiation.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Read the real thing',
        sources: [
          { label: 'packages/maumau in the repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/packages/maumau', note: 'The arbiter header is the argument in full; the migration beside it is the lock.' },
          { label: 'How we built the boxing game', href: '/community/how-we-built-boxing', note: 'The same five interfaces handing authority the other way.' },
          { label: 'The XP editor guide', href: '/create/xp/docs', note: 'The document-shaped way to build on the engine.' },
        ],
      },
    ],
  },
  de: {
    title: 'Wie wir Mau-Mau gebaut haben',
    standfirst:
      'Ein Kartenspiel, dessen ganzes Design aus einem Satz fällt: Eine Hand ist ein Geheimnis. Warum der Client nichts entscheidet, das Deck hinter einem Lock wohnt und zwei Kartensätze sich ein Raster teilen.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'Ein Satz entscheidet alles',
        body: [
          'Mau-Mau ist das zweite Spiel, das als Paket auf dem Host-SDK der Engine gebaut wurde - dieselben fünf importierten Interfaces wie beim Boxen, dieselbe Haltung „kein XP, kein Level, kein Dokument". Aber wo Boxing den Clients Autorität gibt, gibt dieses Spiel ihnen nichts, und der Grund passt in einen Satz: Eine Hand ist ein Geheimnis.',
          'Ein Kampfspiel gibt dem Client Autorität, weil die Alternative gegen Lag verliert. Ein Kartenspiel kann das nicht, weil die Alternative das Spiel verliert: Wer das Deck hält, kann jede Hand lesen, und ein Client, dem man zutraut, nicht zu schauen, ist ein Client, bei dem das Geheimnis nicht gewahrt werden musste. Es gibt keine Version dieses Spiels, in der das Deck auf irgendjemandes Rechner liegt und das Spiel noch spielenswert ist.',
          'Jede Design-Entscheidung im Paket folgt daraus. Boxing hat fünf Nachrichtentypen auf drei Takten; der Draht dieses Spiels ist ein Anstupsen mit einer Zahl. Boxing sagt die eigenen Schläge voraus; dieses Spiel sagt nichts voraus, weil es nicht muss. Boxing nutzt keinen Zufall; dieses Spiel nutzt den der Plattform - nie einen geseedeten Strom, den ein Client nachspielen könnte.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Der Bau, in der Reihenfolge, in der er passiert ist',
        steps: [
          {
            title: 'Karten und Tischregeln, pur',
            body: [
              'Was eine Karte ist, was ein Paket ist, was ein legaler Zug ist - Werte rein, Werte raus, kein Browser, kein Netzwerk, keine Uhr. `bun test packages/maumau` spielt ganze Hände in Mikrosekunden. Dasselbe Argument wie beim Boxen, derselbe Gewinn: Den Regeln traut man, weil ein Test schneller spielt, als ein Mensch es je könnte.',
            ],
          },
          {
            title: 'Entscheide, welches Mau-Mau du baust - als Daten',
            body: [
              'Alle halten ihr Mau-Mau für das einzige: Stapeln sich Siebenen, was macht der Bube, wie geht die letzte Karte raus. Das sind Hausregeln, und sie sind Settings - genau das, was Boxing ausdrücklich verweigert hat. Der Unterschied ist Symmetrie: Einen Schlag zu retunen hilft dem, der ihn wirft, also einem Spieler; stapelnde Siebenen sind für alle dasselbe Spiel. Es gibt keine Hausregel, von der ein Platz profitiert.',
              'Und sie werden beim Geben festgenagelt und danach verweigert - nicht weil eine Änderung mitten in der Hand unfair wäre, sondern weil sie inkohärent wäre: Stapeln abschalten, während sechs Strafkarten offen sind, ist ein Zustand, auf den die Regeln keine Antwort haben.',
            ],
            watch: 'Asymmetrische Settings sind keine Settings, sondern ein unfaires Match. Sortiere jede Option danach, wem sie hilft.',
          },
          {
            title: 'Das ganze Spiel dort laufen lassen, wo kein Spieler hinkommt',
            body: [
              'Die komplette Tischlogik läuft einmal, beim Arbiter, und jeder Client bekommt eine Schwärzung zurück: die eigenen Karten vollständig, die aller anderen als Zahl. Der Client kann nicht schummeln, weil der Client nichts weiß, womit sich schummeln ließe.',
            ],
          },
          {
            title: 'Dieselben Regeln zwei Autoritäten beibringen',
            body: [
              'Das Paket bringt einem In-Memory-Arbiter das ganze Mau-Mau bei - vier Memory-Hosts in einem Test sind vier Spieler, die nichts selbst entscheiden können: dieselbe Eigenschaft wie bei der echten Autorität, ausgedrückt in einer Map und beweisbar in Mikrosekunden. Die echte ist eine Datenbankfunktion, weil die Produktionsanforderung ein Lock ist: Zwei Spieler, die im selben Tick eine Karte drücken, lesen beide denselben Zug - und nur einer darf ihn haben.',
            ],
            watch: 'Test-Autorität und echte Autorität müssen dieselben Regeln gegen dieselbe Zustandsform implementieren - sonst beweisen deine Tests ein Spiel, das du nicht auslieferst.',
          },
          {
            title: 'Zwei Kartensätze, ein Raster',
            body: [
              'Das Spiel liefert zwei Karten-Looks: handgezeichnete Bilder, die einen 552x752-Rahmen mit Glättung füllen, und 64x64-Karten von 1993, die pixelig gezeichnet werden müssen, sonst sind sie ein Schmier. Sie sind sich über fast nichts einig - außer über das Raster, weil der Atlas-Bauer darauf besteht: Zeilen sind die vier Farben, Spalten laufen A, 2…10, B, D, K. Die Zell-Suche ist also einmal geschrieben, und kein Finish taucht in ihr auf.',
              'Und ein Finish ist absichtlich keine Hausregel: Die Autorität nagelt Regeln fest, weil ein Tisch ein Spiel spielen muss - aber zwei Spieler, die auf zwei verschiedene Kartenrücken schauen, spielen immer noch dieselbe Hand. Was nichts ändert, wofür man verweigert werden könnte, gehört nicht in die festgenagelten Settings.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'Die Wörter im Code',
        terms: [
          { term: 'Arbiter', means: 'Hier: das ganze Spiel. Das Einzige am Tisch, das eine Hand sehen darf.' },
          { term: 'Seen', means: 'Die Schwärzung, die ein Client bekommt - eigene Karten vollständig, alle anderen als Zahlen.' },
          { term: 'Hausregeln', means: 'Welches Mau-Mau: symmetrische Settings, beim Geben festgenagelt, danach verweigert.' },
          { term: 'Finish', means: 'Welche Kartengrafik den Tisch zeichnet - pro Spieler, und absichtlich keine Regel.' },
          { term: 'memoryHost / MemoryArbiter', means: 'Host und Autorität der Testseite, die aus einer Map vier Spieler machen.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Was wir uns am Anfang sagen würden',
        items: [
          'Benenn den einen entscheidenden Satz deines Spiels früh. Unserer war „eine Hand ist ein Geheimnis", und er hat jede spätere Diskussion beantwortet.',
          'Autorität ist pro Spiel, nicht pro Plattform: Dasselbe SDK trägt einen client-autoritativen Kampf und einen voll autoritativen Kartentisch.',
          'Zufall, den ein Client reproduzieren kann, ist eine Hand, die ein Client lesen kann.',
          'Gleichzeitige Züge brauchen ein Lock, keine Konvention - zwei Drücke in einem Tick passieren am ersten echten Abend.',
          'Halt Kosmetik aus dem Regelobjekt raus, sonst wird jeder Skin eine Regelverhandlung.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Lies das Original',
        sources: [
          { label: 'packages/maumau im Repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/packages/maumau', note: 'Der Arbiter-Header ist das Argument in voller Länge; die Migration daneben ist das Lock.' },
          { label: 'Wie wir das Boxspiel gebaut haben', href: '/de/community/how-we-built-boxing', note: 'Dieselben fünf Interfaces, die Autorität andersherum vergeben.' },
          { label: 'Der XP-Editor-Guide', href: '/create/xp/docs', note: 'Der dokumentförmige Weg, auf der Engine zu bauen.' },
        ],
      },
    ],
  },
}
