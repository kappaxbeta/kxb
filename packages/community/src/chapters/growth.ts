import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * The growth playbook: experiments, codes, prices, one giveaway recipe, and
 * the posting habit.
 *
 * The most kxb-specific of the chapters - it names the backoffice pages where
 * the buttons are - but the practices are portable: tag a channel, read one
 * number, mint a code you can trace, price from data, run a giveaway with
 * published conditions, post once a week and make it original. An operator of
 * any product could follow it with different button names.
 */
export const GROWTH: Text<Guide> = {
  en: {
    title: 'The growth playbook',
    standfirst:
      'How to run a marketing experiment and where to read its result, how codes and prices are minted, the giveaway recipe, and the once-a-week posting rule.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'idea',
        heading: 'Growth is a weekly practice, not a launch event',
        body: [
          'Everything in this chapter compounds weekly and none of it works as a one-off. One experiment per week, one post per week, one look at the numbers - that cadence beats a launch spike every time, because the spike teaches you nothing you can repeat.',
          'The other rule this chapter keeps repeating: never ship a growth mechanic you cannot measure. A code nobody can trace, a post on a channel without a tag, a price changed on a feeling - each is effort spent buying no information.',
        ],
      },
      {
        kind: 'steps',
        id: 'experiment',
        heading: 'Set up an experiment',
        intro: [
          'An experiment is one question, one channel, one week, one number. In kxb the machinery is the ?src tag and the Sources report - every link you put anywhere carries ?src=<channel>, and the backoffice counts who walked in and who clicked join, per tag.',
        ],
        steps: [
          {
            title: 'Write the question down first',
            body: [
              '"Does the Discord communities angle beat the game-jam angle?" is an experiment. "Let’s post more" is not. If you cannot say which number answers the question, the experiment is not ready to run.',
            ],
          },
          {
            title: 'Tag every link with ?src',
            body: [
              'One tag per channel or per angle - ?src=discord-post, ?src=jam-thread. The tag is the whole tracking system: no pixel, no cookie banner, nothing to consent to. A link without a tag is a visitor you will wrongly credit to "direct".',
            ],
            watch: 'Decide the tag names once and keep a list. Three spellings of the same channel read as three channels forever.',
          },
          {
            title: 'Read the result where it lands',
            where: 'The backoffice: the Sources report, next to Analytics',
            body: [
              'The number that matters pre-launch is walk-ins versus join-clicks per source - the demo visits against the moment somebody wanted an account. Read it after a week, not after an hour; small channels need the days.',
            ],
          },
          {
            title: 'Keep or kill, then write it down',
            body: [
              'A channel that brought walk-ins gets next week too. One that brought nothing twice is dead - stop, and note why in a running log. The log is the actual asset: six months of kept-or-killed is a marketing strategy nobody can argue with.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'codes',
        heading: 'Create codes',
        intro: [
          'A promo code in kxb grants a new account one month free - no card, nothing charged when it ends, the space simply goes read-only until they subscribe. One redemption per account, ever.',
        ],
        steps: [
          {
            title: 'Mint the code',
            where: 'Backoffice → Promos',
            body: [
              'One code per campaign, never one code for everything - the code name is the ?src tag of the offline world. KXB50 on a conference slide and JAMFREE in a jam Discord tell you, in the redemption log, which room was listening.',
            ],
          },
          {
            title: 'Watch the redemption log on the same page',
            body: [
              'Codes and redemptions live on one page on purpose: minting the next code, you see whether the last one worked. A code with zero redemptions after two weeks is a channel that did not care - that is a result, not a failure.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'prices',
        heading: 'Create prices',
        intro: [
          'Tiers and their prices live in the database, not in the code - the backoffice edits them and the landing page quotes them, so a price change is an edit, not a deploy.',
        ],
        steps: [
          {
            title: 'Edit the tier and its price',
            where: 'Backoffice → Pricing',
            body: [
              'Two things live there and they are not the same thing: the quoted price the landing page prints, and the charged price behind the checkout. Change both together or the page advertises a number the card is not charged.',
            ],
            watch: 'The quote is cosmetic until the charge matches it. Always verify the pair.',
          },
          {
            title: 'Change prices like experiments',
            body: [
              'One change, one reason, one date in the log, and then leave it alone long enough to read. A price that moves monthly teaches customers to wait and you nothing.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'gewinnspiel',
        heading: 'The Gewinnspiel recipe',
        intro: [
          'A giveaway is five ingredients, and skipping any one of them is what turns a nice gesture into an Abmahnung or a dud. The legal half lives in the promotion chapter; this is the operational half.',
        ],
        steps: [
          {
            title: 'A prize people in your audience actually want',
            body: [
              'Months of the product beat merchandise: they cost you margin, not cash, and every winner becomes a user. A prize unrelated to the product recruits people who wanted the prize, not the product.',
            ],
          },
          {
            title: 'A page of its own, with the conditions on it',
            body: [
              'Who may enter, when it ends, how the winner is drawn and told, and the odds logic if entries are unlimited. Published before the first announcement - the conditions page is what makes it a Gewinnspiel rather than a vague promise.',
            ],
          },
          {
            title: 'A code, so the campaign is traceable',
            body: [
              'The giveaway gets its own promo code and its own ?src tag. When it is over, the redemption log and the Sources report tell you what it was worth - which is the difference between "that was fun" and "we do that again every quarter".',
            ],
          },
          {
            title: 'A hard deadline and a drawn winner',
            body: [
              'Draw on the announced date, tell the winner in private first, announce with their consent. A giveaway that quietly never concludes is remembered, and not fondly.',
            ],
          },
          {
            title: 'The announcement thread, once, on the channel that fits',
            body: [
              'One thread, pinned for the duration, entry tied to something that costs the entrant nothing. Purchase-tied entry changes the legal nature - the promotion chapter says why.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'posting',
        heading: 'Posting: once a week, original',
        steps: [
          {
            title: 'Once a week, on a fixed day',
            body: [
              'Weekly is the honest cadence a small team sustains for a year. Daily burns out in three weeks and the silence afterwards reads worse than a steady weekly ever did. Pick the day, put it in the calendar, treat it as shipped software.',
            ],
          },
          {
            title: 'Original beats reposted, every time',
            body: [
              'One real thing from the week: a feature that shipped, a number that surprised you, a thing a user did, a mistake and its fix. Screenshots and clips of the actual product outperform any stock graphic - and in kxb every marketing image can be a real frame of the real product, which is a advantage most products do not have. Use the studio; never post an illustration of a thing the product cannot do.',
            ],
          },
          {
            title: 'Every post carries its tag',
            body: [
              'The link in the post gets its ?src like every other link, so twelve months later the Sources report can rank your own channels. Posts without links are brand work; that is fine too, but know which one you are writing.',
            ],
            watch: 'Write posts in batches when the energy is there, schedule them weekly. The rule is the cadence, not the writing day.',
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Untagged links - the experiment that cannot be read afterwards.',
          'One code for every campaign, and a redemption log that answers no question.',
          'Changing the quoted price and forgetting the charged one, or the reverse.',
          'A giveaway announced before its conditions page exists.',
          'Posting daily for three weeks and then nothing for two months.',
          'Reposting other people’s content into a feed that is supposed to prove yours is alive.',
          'Running three experiments in one week and being unable to say which one moved the number.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where the pieces live',
        sources: [
          { label: 'Before you promote - the legal half', href: '/community/promotion', note: 'Giveaway law, price display, consent - read it before the first campaign.' },
          { label: 'The backoffice', href: '/ovaloffice', note: 'Promos, Pricing, Analytics and Sources - operator sign-in required.' },
          { label: 'Run kxb yourself', href: '/community/start-kxb', note: 'If you are reading this as a community-edition operator, start here.' },
        ],
      },
    ],
  },
  de: {
    title: 'Das Growth-Playbook',
    standfirst:
      'Wie man ein Marketing-Experiment aufsetzt und wo man sein Ergebnis liest, wie Codes und Preise entstehen, das Gewinnspiel-Rezept und die Einmal-die-Woche-Regel fürs Posten.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'idea',
        heading: 'Growth ist eine Wochenroutine, kein Launch-Ereignis',
        body: [
          'Alles in diesem Kapitel wirkt wöchentlich und nichts davon als Einmalaktion. Ein Experiment pro Woche, ein Post pro Woche, ein Blick auf die Zahlen - dieser Takt schlägt jeden Launch-Ausschlag, weil der Ausschlag dich nichts lehrt, was du wiederholen kannst.',
          'Die zweite Regel, die dieses Kapitel dauernd wiederholt: Bau nie einen Growth-Mechanismus, den du nicht messen kannst. Ein Code, den niemand zuordnen kann, ein Post auf einem Kanal ohne Tag, ein Preis nach Gefühl geändert - jedes davon ist Aufwand, der keine Information kauft.',
        ],
      },
      {
        kind: 'steps',
        id: 'experiment',
        heading: 'Ein Experiment aufsetzen',
        intro: [
          'Ein Experiment ist eine Frage, ein Kanal, eine Woche, eine Zahl. In kxb ist die Maschinerie der ?src-Tag und der Sources-Report - jeder Link, den du irgendwo hinlegst, trägt ?src=<kanal>, und das Backoffice zählt pro Tag, wer hereingelaufen ist und wer auf Beitreten geklickt hat.',
        ],
        steps: [
          {
            title: 'Schreib die Frage zuerst auf',
            body: [
              '„Zieht der Discord-Communities-Winkel besser als der Game-Jam-Winkel?" ist ein Experiment. „Lass uns mehr posten" ist keins. Wenn du nicht sagen kannst, welche Zahl die Frage beantwortet, ist das Experiment nicht startklar.',
            ],
          },
          {
            title: 'Jeden Link mit ?src taggen',
            body: [
              'Ein Tag pro Kanal oder pro Winkel - ?src=discord-post, ?src=jam-thread. Der Tag ist das ganze Tracking: kein Pixel, kein Cookie-Banner, nichts zum Einwilligen. Ein Link ohne Tag ist ein Besucher, den du fälschlich „direkt" zuschreibst.',
            ],
            watch: 'Leg die Tag-Namen einmal fest und führ eine Liste. Drei Schreibweisen desselben Kanals lesen sich für immer als drei Kanäle.',
          },
          {
            title: 'Das Ergebnis dort lesen, wo es landet',
            where: 'Das Backoffice: der Sources-Report, neben Analytics',
            body: [
              'Die Zahl, die vor dem Launch zählt, ist Walk-ins gegen Join-Klicks pro Quelle - die Demo-Besuche gegen den Moment, in dem jemand einen Account wollte. Lies sie nach einer Woche, nicht nach einer Stunde; kleine Kanäle brauchen die Tage.',
            ],
          },
          {
            title: 'Behalten oder beerdigen, dann aufschreiben',
            body: [
              'Ein Kanal, der Walk-ins brachte, bekommt auch nächste Woche. Einer, der zweimal nichts brachte, ist tot - aufhören, und das Warum in ein laufendes Log. Das Log ist der eigentliche Schatz: Sechs Monate Behalten-oder-Beerdigen sind eine Marketingstrategie, gegen die niemand argumentieren kann.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'codes',
        heading: 'Codes erstellen',
        intro: [
          'Ein Promo-Code in kxb schenkt einem neuen Account einen Monat frei - keine Karte, nichts wird abgebucht, wenn er endet, der Space wird einfach read-only, bis abonniert wird. Eine Einlösung pro Account, für immer.',
        ],
        steps: [
          {
            title: 'Den Code prägen',
            where: 'Backoffice → Promos',
            body: [
              'Ein Code pro Kampagne, nie einer für alles - der Code-Name ist der ?src-Tag der Offline-Welt. KXB50 auf einer Konferenzfolie und JAMFREE in einem Jam-Discord sagen dir im Einlösungs-Log, welcher Raum zugehört hat.',
            ],
          },
          {
            title: 'Das Einlösungs-Log auf derselben Seite beobachten',
            body: [
              'Codes und Einlösungen wohnen absichtlich auf einer Seite: Beim Prägen des nächsten Codes siehst du, ob der letzte funktioniert hat. Ein Code mit null Einlösungen nach zwei Wochen ist ein Kanal, den es nicht interessiert hat - das ist ein Ergebnis, kein Versagen.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'prices',
        heading: 'Preise erstellen',
        intro: [
          'Tiers und ihre Preise wohnen in der Datenbank, nicht im Code - das Backoffice editiert sie und die Landingpage zitiert sie, eine Preisänderung ist also ein Edit, kein Deploy.',
        ],
        steps: [
          {
            title: 'Tier und Preis editieren',
            where: 'Backoffice → Pricing',
            body: [
              'Dort wohnen zwei Dinge, und sie sind nicht dasselbe: der zitierte Preis, den die Landingpage druckt, und der berechnete Preis hinter dem Checkout. Ändere beide zusammen, sonst bewirbt die Seite eine Zahl, die der Karte nicht berechnet wird.',
            ],
            watch: 'Das Zitat ist Kosmetik, bis die Abbuchung dazu passt. Immer das Paar prüfen.',
          },
          {
            title: 'Preise wie Experimente ändern',
            body: [
              'Eine Änderung, ein Grund, ein Datum im Log - und dann lange genug in Ruhe lassen, um sie zu lesen. Ein Preis, der monatlich wandert, lehrt Kunden das Warten und dich nichts.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'gewinnspiel',
        heading: 'Das Gewinnspiel-Rezept',
        intro: [
          'Ein Gewinnspiel sind fünf Zutaten, und jede ausgelassene macht aus der netten Geste eine Abmahnung oder einen Rohrkrepierer. Die juristische Hälfte steht im Werbe-Kapitel; das hier ist die operative.',
        ],
        steps: [
          {
            title: 'Ein Preis, den deine Zielgruppe wirklich will',
            body: [
              'Monate des Produkts schlagen Merchandise: Sie kosten dich Marge statt Geld, und jeder Gewinner wird Nutzer. Ein Preis ohne Bezug zum Produkt rekrutiert Leute, die den Preis wollten, nicht das Produkt.',
            ],
          },
          {
            title: 'Eine eigene Seite, mit den Bedingungen darauf',
            body: [
              'Wer teilnehmen darf, wann es endet, wie gezogen und benachrichtigt wird. Veröffentlicht vor der ersten Ankündigung - die Bedingungsseite ist, was ein Gewinnspiel von einem vagen Versprechen unterscheidet.',
            ],
          },
          {
            title: 'Ein Code, damit die Kampagne zuordenbar ist',
            body: [
              'Das Gewinnspiel bekommt seinen eigenen Promo-Code und seinen eigenen ?src-Tag. Hinterher sagen dir Einlösungs-Log und Sources-Report, was es wert war - der Unterschied zwischen „war nett" und „machen wir jedes Quartal wieder".',
            ],
          },
          {
            title: 'Eine harte Deadline und ein gezogener Gewinner',
            body: [
              'Am angekündigten Tag ziehen, den Gewinner zuerst privat informieren, mit Einverständnis verkünden. Ein Gewinnspiel, das leise nie endet, bleibt in Erinnerung - und nicht gut.',
            ],
          },
          {
            title: 'Der Ankündigungs-Thread, einmal, auf dem Kanal, der passt',
            body: [
              'Ein Thread, für die Laufzeit angepinnt, Teilnahme an etwas geknüpft, das den Teilnehmer nichts kostet. Kaufgebundene Teilnahme ändert die rechtliche Natur - das Werbe-Kapitel sagt warum.',
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'posting',
        heading: 'Posten: einmal die Woche, original',
        steps: [
          {
            title: 'Einmal die Woche, an einem festen Tag',
            body: [
              'Wöchentlich ist der ehrliche Takt, den ein kleines Team ein Jahr durchhält. Täglich brennt nach drei Wochen aus, und die Stille danach liest sich schlechter, als ein stetiges Wöchentlich es je tat. Tag festlegen, in den Kalender, wie ausgelieferte Software behandeln.',
            ],
          },
          {
            title: 'Original schlägt repostet, jedes Mal',
            body: [
              'Eine echte Sache aus der Woche: ein Feature, das rausging, eine Zahl, die dich überrascht hat, etwas, das ein Nutzer getan hat, ein Fehler und sein Fix. Screenshots und Clips des echten Produkts schlagen jede Stock-Grafik - und bei kxb kann jedes Marketingbild ein echter Frame des echten Produkts sein, ein Vorteil, den die meisten Produkte nicht haben. Nutz das Studio; poste nie eine Illustration von etwas, das das Produkt nicht kann.',
            ],
          },
          {
            title: 'Jeder Post trägt seinen Tag',
            body: [
              'Der Link im Post bekommt sein ?src wie jeder andere Link, damit der Sources-Report zwölf Monate später deine eigenen Kanäle sortieren kann. Posts ohne Link sind Markenarbeit; auch gut - aber wisse, welchen von beiden du gerade schreibst.',
            ],
            watch: 'Schreib Posts im Schwung auf Vorrat, plan sie wöchentlich ein. Die Regel ist der Takt, nicht der Schreibtag.',
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          'Ungetaggte Links - das Experiment, das sich hinterher nicht lesen lässt.',
          'Ein Code für alle Kampagnen, und ein Einlösungs-Log, das keine Frage beantwortet.',
          'Den zitierten Preis ändern und den berechneten vergessen, oder andersherum.',
          'Ein Gewinnspiel ankündigen, bevor die Bedingungsseite existiert.',
          'Drei Wochen täglich posten und dann zwei Monate nichts.',
          'Fremde Inhalte in einen Feed reposten, der beweisen soll, dass deiner lebt.',
          'Drei Experimente in einer Woche fahren und nicht sagen können, welches die Zahl bewegt hat.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo die Teile wohnen',
        sources: [
          { label: 'Bevor du Werbung machst - die juristische Hälfte', href: '/de/community/promotion', note: 'Gewinnspielrecht, Preisangaben, Einwilligung - vor der ersten Kampagne lesen.' },
          { label: 'Das Backoffice', href: '/ovaloffice', note: 'Promos, Pricing, Analytics und Sources - Operator-Anmeldung nötig.' },
          { label: 'Betreib kxb selbst', href: '/de/community/start-kxb', note: 'Wenn du das als Community-Edition-Betreiber liest: fang hier an.' },
        ],
      },
    ],
  },
}
