import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * How the boxing game was made - written from the package itself.
 *
 * Every claim below is checkable against `packages/boxing`: the module
 * headers carry the arguments, the tests carry the proof. The guide retells
 * them for a reader who wants to build a game like it, in the order the
 * decisions were actually made.
 */
export const MAKING_BOXING: Text<Guide> = {
  en: {
    title: 'How we built the boxing game',
    standfirst:
      'A fighting game is a pile of seventy-millisecond windows. This is how it became a package: pure rules, one frame-data table, a defender who is always right, and the one thing no client may decide.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'What it is, and what it deliberately is not',
        body: [
          'The boxing game is a package, @kxb/boxing, that integrates the platform’s engine (@kxb/xp) as an SDK. It is not an XP: there is no document, no level, nothing the editor can open. It imports five interfaces - an identity, a transport, a clock, an authority - and in exchange gets multiplayer against our Supabase, against two tabs on a laptop, or against a backend nobody here has seen.',
          'That distinction was the first decision. The engine has a general document format, and a fighting game is very specific rules about very short windows. Expressing those as a level would have bent both; importing five interfaces bends nothing.',
          'The second early decision: the game brings its own pixels. Boxing ships its art and its React scene in the package - which is what makes "lift the folder out into its own repository" a true sentence rather than an aspiration.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The build, in the order it happened',
        steps: [
          {
            title: 'Rules first, and pure',
            body: [
              'Everything except the network layer is numbers in, numbers out - no browser, no canvas, no clock of its own. That purity is not aesthetics: the environment this was built in never fires requestAnimationFrame, so a running fight could not be watched. `bun test packages/boxing` plays whole three-round matches in milliseconds, and that is the only reason the rules can be trusted.',
            ],
            watch: 'If your rules need a browser to run, you cannot test a match faster than you can play one - and then you will not.',
          },
          {
            title: 'All the feel in one table',
            body: [
              'A jab is not "a fast punch". It is 70ms before it can hurt anybody, 50ms during which it can, and 130ms of commitment afterwards where you cannot defend. Those numbers are the entire feel of the game, so they live in one record per move - the frame data - and the simulation reads the table. Balancing the game means editing one file.',
              'The numbers are in seconds, not frames, despite the genre’s vocabulary: the host supplies the clock, a test drives a match in a loop without waiting for one, and a move written in frames changes length on a 144Hz monitor. Only the sprite sheets still think in frames, and exactly one function knows both.',
            ],
          },
          {
            title: 'Give authority to whoever losing to lag would hurt most',
            body: [
              'Damage is decided by the defender, on their own client. A punch landing on me is a fact about my health, and any other arrangement loses to lag in a way players never forgive. The round clock belongs to the red corner’s client. Both are fine because being wrong about them is visible and self-correcting: a fighter a few centimetres out is snapped straight by the next packet, a bell 100ms early is a bell.',
            ],
          },
          {
            title: 'Except the result',
            body: [
              'A result is different from everything else in the game: it is written down, read back by somebody who was not there, and nothing later corrects it. So the result goes to the arbiter - the one tier no client may decide - and the report is idempotent: both clients watch the same fight end, both may report it, the first report wins and the second is handed the stored outcome rather than an error. A client that asked twice because its first ask was lost has done nothing wrong.',
            ],
            watch: 'A score that can be overwritten is a score somebody can overwrite. Sort your game’s facts by that sentence.',
          },
          {
            title: 'The wire, last',
            body: [
              'Five message types on three schedules, and each client predicts only its own punches - because it must, not because prediction is fun to write. The transport is one of the five imported interfaces, which is why the same match runs over Supabase realtime, over two tabs, or over a Map in a test.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words in the code',
        terms: [
          { term: '@kxb/xp/host', means: 'The five ports a game imports: identity, transport, clock, authority, persistence.' },
          { term: 'Frame data', means: 'The one table of what every move costs and how long it takes - the whole feel of the game.' },
          { term: 'Arbiter', means: 'The authority tier for facts no client may decide. Here: only the result.' },
          { term: 'memoryHost', means: 'The in-memory host that lets a test be two players without a network.' },
          { term: 'Wire', means: 'What actually crosses the socket, and how to read it.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'What we would tell ourselves at the start',
        items: [
          'Tune in one file or you will never tune. Eight switch arms holding the same number is a game nobody can balance.',
          'Authority is not a principle, it is a per-fact decision: self-correcting facts to the client the lag would hurt; permanent facts to the arbiter.',
          'Make every authority call idempotent before you need it to be.',
          'Seconds, not frames, anywhere a host supplies the clock.',
          'If the dev environment cannot render the game, make the rules run without it - the constraint turned out to be the architecture.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Read the real thing',
        sources: [
          { label: 'packages/boxing in the repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/packages/boxing', note: 'The module headers carry these arguments in full; the tests carry the proof.' },
          { label: 'How we built Mau-Mau', href: '/community/how-we-built-maumau', note: 'The same pattern meeting the opposite problem: a game where the client may decide nothing.' },
          { label: 'The XP editor guide', href: '/create/xp/docs', note: 'What building on the engine as a document looks like, for games that fit one.' },
        ],
      },
    ],
  },
  de: {
    title: 'Wie wir das Boxspiel gebaut haben',
    standfirst:
      'Ein Kampfspiel ist ein Haufen 70-Millisekunden-Fenster. So wurde ein Paket daraus: pure Regeln, eine Frame-Data-Tabelle, ein Verteidiger, der immer recht hat, und das eine, was kein Client entscheiden darf.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'Was es ist - und was absichtlich nicht',
        body: [
          'Das Boxspiel ist ein Paket, @kxb/boxing, das die Engine der Plattform (@kxb/xp) als SDK integriert. Es ist kein XP: kein Dokument, kein Level, nichts, was der Editor öffnen könnte. Es importiert fünf Schnittstellen - Identität, Transport, Uhr, Autorität - und bekommt dafür Multiplayer gegen unser Supabase, gegen zwei Tabs auf einem Laptop oder gegen ein Backend, das hier niemand je gesehen hat.',
          'Diese Unterscheidung war die erste Entscheidung. Die Engine hat ein allgemeines Dokumentformat, und ein Kampfspiel besteht aus sehr speziellen Regeln über sehr kurze Fenster. Beides als Level auszudrücken hätte beide verbogen; fünf Interfaces zu importieren verbiegt nichts.',
          'Die zweite frühe Entscheidung: Das Spiel bringt seine eigenen Pixel mit. Boxing liefert Grafik und React-Szene im Paket - was aus „den Ordner in ein eigenes Repository heben" einen wahren Satz macht statt eines Vorsatzes.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Der Bau, in der Reihenfolge, in der er passiert ist',
        steps: [
          {
            title: 'Regeln zuerst, und pur',
            body: [
              'Alles außer der Netzwerkschicht ist Zahlen rein, Zahlen raus - kein Browser, kein Canvas, keine eigene Uhr. Diese Reinheit ist keine Ästhetik: Die Umgebung, in der das gebaut wurde, feuert nie requestAnimationFrame, ein laufender Kampf ließ sich also nicht anschauen. `bun test packages/boxing` spielt ganze Drei-Runden-Kämpfe in Millisekunden, und nur deshalb kann man den Regeln trauen.',
            ],
            watch: 'Wenn deine Regeln einen Browser brauchen, kannst du einen Kampf nicht schneller testen, als du ihn spielst - und dann tust du es nicht.',
          },
          {
            title: 'Das ganze Spielgefühl in einer Tabelle',
            body: [
              'Ein Jab ist nicht „ein schneller Schlag". Er ist 70 ms, bevor er jemandem wehtun kann, 50 ms, in denen er es kann, und 130 ms Bindung danach, in denen du dich nicht verteidigen kannst. Diese Zahlen sind das komplette Gefühl des Spiels, also wohnen sie in einem Datensatz pro Move - die Frame Data - und die Simulation liest die Tabelle. Das Spiel zu balancieren heißt, eine Datei zu editieren.',
              'Die Zahlen stehen in Sekunden, nicht in Frames, dem Genre-Vokabular zum Trotz: Der Host liefert die Uhr, ein Test treibt einen Kampf in einer Schleife, ohne auf eine zu warten - und ein Move in Frames ändert auf einem 144-Hz-Monitor seine Länge. Nur die Sprite-Sheets denken noch in Frames, und genau eine Funktion kennt beides.',
            ],
          },
          {
            title: 'Autorität dorthin, wo Lag am meisten wehtäte',
            body: [
              'Schaden entscheidet der Verteidiger, auf seinem eigenen Client. Ein Schlag, der mich trifft, ist eine Tatsache über meine Gesundheit, und jede andere Anordnung verliert gegen Lag auf eine Art, die Spieler nie verzeihen. Die Rundenuhr gehört dem Client der roten Ecke. Beides geht in Ordnung, weil Irrtümer darüber sichtbar und selbstkorrigierend sind: Ein Kämpfer, der ein paar Zentimeter daneben steht, wird vom nächsten Paket geradegerückt, eine Glocke 100 ms zu früh ist eine Glocke.',
            ],
          },
          {
            title: 'Außer dem Ergebnis',
            body: [
              'Ein Ergebnis ist anders als alles andere im Spiel: Es wird aufgeschrieben, von jemandem gelesen, der nicht dabei war, und nichts korrigiert es später. Also geht das Ergebnis an den Arbiter - die eine Ebene, die kein Client entscheiden darf - und der Report ist idempotent: Beide Clients sehen denselben Kampf enden, beide dürfen ihn melden, der erste Report gewinnt und der zweite bekommt das gespeicherte Ergebnis statt eines Fehlers. Ein Client, der zweimal gefragt hat, weil seine erste Frage verloren ging, hat nichts falsch gemacht.',
            ],
            watch: 'Ein Punktestand, der überschrieben werden kann, ist ein Punktestand, den jemand überschreiben kann. Sortiere die Fakten deines Spiels nach diesem Satz.',
          },
          {
            title: 'Der Draht, zuletzt',
            body: [
              'Fünf Nachrichtentypen auf drei Takten, und jeder Client sagt nur die eigenen Schläge voraus - weil er muss, nicht weil Prediction Spaß macht. Der Transport ist eines der fünf importierten Interfaces - deshalb läuft derselbe Kampf über Supabase Realtime, über zwei Tabs oder über eine Map im Test.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'Die Wörter im Code',
        terms: [
          { term: '@kxb/xp/host', means: 'Die fünf Ports, die ein Spiel importiert: Identität, Transport, Uhr, Autorität, Persistenz.' },
          { term: 'Frame Data', means: 'Die eine Tabelle, was jeder Move kostet und wie lange er dauert - das ganze Gefühl des Spiels.' },
          { term: 'Arbiter', means: 'Die Autoritätsebene für Fakten, die kein Client entscheiden darf. Hier: nur das Ergebnis.' },
          { term: 'memoryHost', means: 'Der In-Memory-Host, mit dem ein Test zwei Spieler ist, ohne Netzwerk.' },
          { term: 'Wire', means: 'Was wirklich über den Socket geht, und wie man es liest.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Was wir uns am Anfang sagen würden',
        items: [
          'Tune in einer Datei, oder du wirst nie tunen. Acht switch-Arme mit derselben Zahl sind ein Spiel, das niemand balancieren kann.',
          'Autorität ist kein Prinzip, sondern eine Entscheidung pro Fakt: selbstkorrigierende Fakten an den Client, dem Lag wehtut; dauerhafte Fakten an den Arbiter.',
          'Mach jeden Autoritäts-Call idempotent, bevor du es brauchst.',
          'Sekunden, nicht Frames - überall, wo ein Host die Uhr liefert.',
          'Wenn die Dev-Umgebung das Spiel nicht rendern kann, lass die Regeln ohne sie laufen - die Einschränkung entpuppte sich als die Architektur.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Lies das Original',
        sources: [
          { label: 'packages/boxing im Repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/packages/boxing', note: 'Die Modul-Header tragen diese Argumente in voller Länge; die Tests tragen den Beweis.' },
          { label: 'Wie wir Mau-Mau gebaut haben', href: '/de/community/how-we-built-maumau', note: 'Dasselbe Muster am umgekehrten Problem: ein Spiel, in dem der Client nichts entscheiden darf.' },
          { label: 'Der XP-Editor-Guide', href: '/create/xp/docs', note: 'Wie Bauen auf der Engine als Dokument aussieht - für Spiele, die in eines passen.' },
        ],
      },
    ],
  },
}
