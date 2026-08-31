import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * How the p5.js cartridge was made - written from the code itself.
 *
 * Every claim below is checkable against `src/app/xp/_sketch` and
 * `packages/xp/src/document/sketch.ts`: the module headers carry the
 * arguments, the tests and the two-browser probe carry the proof. The guide
 * retells them for a reader who wants to ship a game that is code on a
 * platform that must not trust it.
 */
export const MAKING_P5: Text<Guide> = {
  en: {
    title: 'How we built the p5.js cartridge',
    standfirst:
      'A stranger’s JavaScript, running on your origin, is a security incident. This is how it became a feature instead: an opaque-origin container, a wrapper that makes a hundred lines of p5 multiplayer, and the two bugs only a real second browser could find.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'What it is, and the rule it refused to break',
        body: [
          'A sketch XP is the third kind of document. A level describes a world the engine draws; a framed cartridge names a game the platform already ships; a sketch carries its game as source - p5.js files inside the JSON - and the platform runs code it has every reason to distrust.',
          'The backend’s folder rules refuse .js files outright, and that refusal was made deliberately: a script served from the product’s own origin is stored XSS with the reader’s session. The sketch does not reopen that argument. The sources are strings inside a document, never files on disk; they only become executable inside an iframe with an opaque origin - sandbox without allow-same-origin - and a content policy of default-src none, opened just wide enough for the platform’s own art. A sketch cannot read a cookie, cannot touch the page around it, and cannot phone home.',
          'What the author gets for accepting all that is everything the engine’s script sandbox deliberately lacks: a real canvas, requestAnimationFrame, WebGL, the whole of p5.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The build, in the order it happened',
        steps: [
          {
            title: 'One fork, not one route',
            body: [
              'The runtime asks one question before any of its machinery spins up: is this document a sketch? If so it mounts the container instead of a 3D scene. Because that is the whole integration, every existing surface - the store, the battle wizard, the rooms, the editor preview - opens sketches without having changed. The framed cartridge made this argument first; the sketch inherited it for free.',
            ],
            watch: 'If a new kind of thing needs its own route, it will also need its own listing, its own picker and its own share link. A fork at the end of the old route needs none of them.',
          },
          {
            title: 'The wrapper is the game half',
            body: [
              'A sketch wakes up with window.xp already there: a roster with join and leave, an avatar that broadcasts itself ten times a second and arrives smoothed on every other screen, one input axis fed by arrows, WASD or a thumbstick, named buttons that fire as triggers for every player, shared objects with a claim - the ball rule - and the document’s flow driven by the platform with a round strip drawn over the canvas.',
              'The point of the surface is what an author never writes: netcode. Setting xp.avatar.x in draw() is the whole of multiplayer movement. A live scoreboard is one line, because the avatar carries a free data object that syncs with it.',
            ],
          },
          {
            title: 'Validate on the trusted side of the membrane',
            body: [
              'The container talks to the platform through postMessage and nothing else. Every message crossing outward is read through one narrow protocol - shapes checked, strings cut to length, payloads size-capped, sends rate-limited - and all of it on the platform’s side, because the other side is the code being limited. A hacked sketch can lie about its own game; it cannot spend the room’s bandwidth or another player’s trust.',
            ],
            watch: 'Rate limits enforced inside the sandbox are advice. The same limits outside it are rules.',
          },
          {
            title: 'Let a second browser call you a liar',
            body: [
              'The unit tests all passed and the first real two-browser run failed four checks of seven. The wire’s envelope carries the sender inside the payload - that is also how a client drops its own echo - and the stage sent bare payloads, so ball claims travelled while avatars and button presses arrived from nobody. The fix was one field; finding it required two actual signed-in browsers in one actual room.',
              'The same probe caught the editor’s code pane editing text three screens below the caret, because its two stacked layers wrapped long lines differently. The cure was to stop wrapping entirely, like every code editor.',
            ],
            watch: 'A protocol test proves the shapes agree. Only a second client proves the meanings do.',
          },
          {
            title: 'Give the sketch the platform’s own art',
            body: [
              'The container’s content policy allows exactly three asset directories, so the wrapper turns them into loaders: pack pictures as stable handles, shipped sounds as take-cycling players, and pack models through a small glTF reader - mesh, transform, base-colour texture - because p5 reads OBJ and STL and the packs ship glTF. A player’s own peep can stand in a sketch, textured, from one call.',
              'One measured surprise is worth writing down: p5 2.x returns Promises from its loaders where 1.x returned images. Everything the wrapper hands out is therefore a handle - check ready, draw image - so no sketch ever has to know which p5 is underneath.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words in the code',
        terms: [
          { term: 'sketch block', means: 'The document’s carried project: files, entry, stick, timeline. Parsed and capped like everything else in the format.' },
          { term: 'Opaque origin', means: 'What a sandboxed iframe without allow-same-origin runs as: an origin that matches nothing, holds nothing, and can reach nothing of yours.' },
          { term: 'window.xp', means: 'The wrapper a sketch wakes up inside - roster, avatar, input, objects, flow, packs, translation.' },
          { term: 'The ball rule', means: 'One writer per shared object, everybody watching; claim() takes it. The engine’s elected tier, spoken in p5.' },
          { term: 'The stage', means: 'The platform side of the membrane: socket relay, validation, rate limits, the flow driver, the touch controls.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'What we would tell ourselves at the start',
        items: [
          'Containment is a place, not a habit: put every layer of it in one file, because the layer a refactor loses is the one you stopped seeing.',
          'The wrapper’s worth is measured in netcode nobody writes. If an author must think about packets, the wrapper is not done.',
          'Enforce limits where the limited code cannot reach them.',
          'Run two real clients before believing any of it. Twice.',
          'Wrap nothing in a two-layer code pane. Wrapping is where the layers learn to disagree.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Read the real thing',
        sources: [
          { label: 'The p5 reference in the creator docs', href: '/create/xp/docs/p5', note: 'The whole window.xp surface, with the recipes.' },
          { label: 'src/app/xp/_sketch in the repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/src/app/xp/_sketch', note: 'The container, the protocol, the stage and the wrapper - the headers carry these arguments in full.' },
          { label: 'How we built boxing', href: '/community/how-we-built-boxing', note: 'The other way to be a game here: a trusted package importing five interfaces, instead of untrusted source in a container.' },
        ],
      },
    ],
  },
  de: {
    title: 'Wie wir die p5.js-Cartridge gebaut haben',
    standfirst:
      'Fremdes JavaScript auf der eigenen Origin ist ein Sicherheitsvorfall. So wurde ein Feature daraus: ein Container mit opaker Origin, ein Wrapper, der hundert Zeilen p5 multiplayerfähig macht, und die zwei Bugs, die nur ein echter zweiter Browser finden konnte.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'Was es ist - und welche Regel es nicht gebrochen hat',
        body: [
          'Ein Sketch-XP ist die dritte Art von Dokument. Ein Level beschreibt eine Welt, die die Engine zeichnet; eine gerahmte Cartridge benennt ein Spiel, das die Plattform ohnehin mitbringt; ein Sketch trägt sein Spiel als Quelltext - p5.js-Dateien im JSON - und die Plattform führt Code aus, dem sie aus gutem Grund misstraut.',
          'Die Ordnerregeln des Backends verweigern .js-Dateien rundheraus, und diese Weigerung war eine bewusste Entscheidung: ein Script, das von der Origin des Produkts ausgeliefert wird, ist gespeichertes XSS mit der Session des Lesers. Der Sketch eröffnet dieses Argument nicht neu. Die Quellen sind Strings in einem Dokument, nie Dateien auf der Platte; ausführbar werden sie nur in einem iframe mit opaker Origin - sandbox ohne allow-same-origin - und einer Content Policy von default-src none, gerade weit genug geöffnet für die Kunst der Plattform. Ein Sketch kann kein Cookie lesen, die Seite um sich herum nicht anfassen und nicht nach Hause telefonieren.',
          'Was der Autor dafür bekommt, ist alles, was der Script-Sandbox der Engine bewusst fehlt: eine echte Canvas, requestAnimationFrame, WebGL, das ganze p5.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Der Bau, in der Reihenfolge, in der er geschah',
        steps: [
          {
            title: 'Eine Verzweigung, keine eigene Route',
            body: [
              'Die Runtime stellt eine Frage, bevor irgendetwas anläuft: Ist dieses Dokument ein Sketch? Dann montiert sie den Container statt einer 3D-Szene. Weil das die ganze Integration ist, öffnet jede bestehende Oberfläche - der Laden, der Battle-Assistent, die Räume, die Editor-Vorschau - Sketches, ohne sich geändert zu haben. Die gerahmte Cartridge hat dieses Argument zuerst geführt; der Sketch hat es geerbt.',
            ],
            watch: 'Wenn eine neue Art von Ding eine eigene Route braucht, braucht sie auch eine eigene Liste, einen eigenen Picker und einen eigenen Share-Link. Eine Verzweigung am Ende der alten Route braucht nichts davon.',
          },
          {
            title: 'Der Wrapper ist die Spielhälfte',
            body: [
              'Ein Sketch wacht auf, und window.xp ist schon da: ein Roster mit join und leave, ein Avatar, der sich zehnmal pro Sekunde sendet und auf jedem anderen Bildschirm geglättet ankommt, eine Eingabeachse aus Pfeiltasten, WASD oder Thumbstick, benannte Tasten, die bei jedem Spieler als Trigger feuern, geteilte Objekte mit claim - die Ballregel - und der Flow des Dokuments, von der Plattform gefahren, mit einem Rundenstreifen über der Canvas.',
              'Der Sinn dieser Oberfläche ist das, was ein Autor nie schreibt: Netcode. xp.avatar.x in draw() zu setzen ist die ganze Multiplayer-Bewegung. Ein Live-Scoreboard ist eine Zeile, weil der Avatar ein freies data-Objekt trägt, das mitsynchronisiert.',
            ],
          },
          {
            title: 'Validieren auf der vertrauten Seite der Membran',
            body: [
              'Der Container spricht mit der Plattform über postMessage und sonst nichts. Jede Nachricht nach außen läuft durch ein schmales Protokoll - Formen geprüft, Strings gekürzt, Payloads gedeckelt, Sendungen ratenbegrenzt - und all das auf der Seite der Plattform, denn die andere Seite ist der Code, der begrenzt wird. Ein gehackter Sketch kann über sein eigenes Spiel lügen; die Bandbreite des Raums und das Vertrauen der anderen kann er nicht ausgeben.',
            ],
            watch: 'Ratenbegrenzungen innerhalb der Sandbox sind Ratschläge. Dieselben Grenzen außerhalb sind Regeln.',
          },
          {
            title: 'Einen zweiten Browser Lügner sagen lassen',
            body: [
              'Alle Unit-Tests waren grün, und der erste echte Lauf mit zwei Browsern scheiterte an vier von sieben Prüfungen. Der Umschlag der Leitung trägt den Absender im Payload - so verwirft ein Client auch sein eigenes Echo - und die Stage schickte nackte Payloads: Ballansprüche kamen an, Avatare und Tastendrücke kamen von niemandem. Der Fix war ein Feld; ihn zu finden brauchte zwei tatsächlich angemeldete Browser in einem tatsächlichen Raum.',
              'Dieselbe Probe fing den Code-Editor dabei, wie er Text drei Bildschirme unter dem Cursor bearbeitete, weil seine zwei gestapelten Ebenen lange Zeilen unterschiedlich umbrachen. Die Kur: gar nicht mehr umbrechen, wie jeder Code-Editor.',
            ],
            watch: 'Ein Protokolltest beweist, dass die Formen übereinstimmen. Erst ein zweiter Client beweist, dass es die Bedeutungen tun.',
          },
          {
            title: 'Dem Sketch die Kunst der Plattform geben',
            body: [
              'Die Content Policy des Containers erlaubt genau drei Asset-Verzeichnisse, also macht der Wrapper Loader daraus: Pack-Bilder als stabile Handles, mitgelieferte Sounds als Player, die ihre Takes durchwechseln, und Pack-Modelle durch einen kleinen glTF-Leser - Mesh, Transform, Grundfarbtextur -, denn p5 liest OBJ und STL, und die Packs liefern glTF. Der eigene Peep eines Spielers kann in einem Sketch stehen, texturiert, mit einem Aufruf.',
              'Eine gemessene Überraschung ist es wert, aufgeschrieben zu werden: p5 2.x gibt aus seinen Loadern Promises zurück, wo 1.x Bilder zurückgab. Alles, was der Wrapper herausgibt, ist deshalb ein Handle - ready prüfen, image zeichnen -, damit kein Sketch je wissen muss, welches p5 darunter liegt.',
            ],
          },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'Die Wörter im Code',
        terms: [
          { term: 'sketch-Block', means: 'Das mitgetragene Projekt des Dokuments: Dateien, Entry, Stick, Timeline. Geparst und gedeckelt wie alles andere im Format.' },
          { term: 'Opake Origin', means: 'Als was ein sandboxed iframe ohne allow-same-origin läuft: eine Origin, die nichts matcht, nichts hält und nichts von Ihnen erreicht.' },
          { term: 'window.xp', means: 'Der Wrapper, in dem ein Sketch aufwacht - Roster, Avatar, Input, Objekte, Flow, Packs, Übersetzung.' },
          { term: 'Die Ballregel', means: 'Ein Schreiber pro geteiltem Objekt, alle anderen schauen zu; claim() übernimmt. Die elected-Stufe der Engine, in p5 gesprochen.' },
          { term: 'Die Stage', means: 'Die Plattformseite der Membran: Socket-Relay, Validierung, Ratengrenzen, der Flow-Treiber, die Touch-Steuerung.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Was wir uns am Anfang sagen würden',
        items: [
          'Containment ist ein Ort, keine Gewohnheit: alle Schichten in eine Datei, denn die Schicht, die ein Refactoring verliert, ist die, die man nicht mehr sah.',
          'Der Wert des Wrappers bemisst sich in Netcode, den niemand schreibt. Muss ein Autor an Pakete denken, ist der Wrapper nicht fertig.',
          'Grenzen dort durchsetzen, wo der begrenzte Code sie nicht erreicht.',
          'Zwei echte Clients laufen lassen, bevor man irgendetwas glaubt. Zweimal.',
          'In einem zweischichtigen Code-Editor nichts umbrechen. Beim Umbrechen lernen die Schichten, sich zu widersprechen.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Das Original lesen',
        sources: [
          { label: 'Die p5-Referenz in den Creator-Docs', href: '/create/xp/docs/p5', note: 'Die ganze window.xp-Oberfläche, mit den Rezepten.' },
          { label: 'src/app/xp/_sketch im Repository', href: 'https://github.com/kappaxbeta/kxb/tree/main/src/app/xp/_sketch', note: 'Container, Protokoll, Stage und Wrapper - die Header tragen diese Argumente vollständig.' },
          { label: 'Wie wir Boxing gebaut haben', href: '/community/how-we-built-boxing', note: 'Der andere Weg, hier ein Spiel zu sein: ein vertrautes Paket mit fünf Interfaces statt fremder Quelltext im Container.' },
        ],
      },
    ],
  },
}
