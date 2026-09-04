import type { ContestFacts } from '@/app/gewinnspiel/facts'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import { Bullets, CONTROLLER, ControllerBlock } from '@/app/legal/shell'

/**
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE THE ANNOUNCEMENT POST GOES UP
 * ---------------------------------------------------------------------------
 * The conditions for the beta launch contest, and this file is the binding
 * version of them. Drafted against what the app actually does - the shutter in
 * the lounge, the promo code route, the block editor - rather than copied from
 * a generator, and like the AGB it has not been reviewed by a lawyer. Four
 * things are load-bearing, and each is commented where it is written:
 *
 *   § 6  Kostenlose Teilnahme - the reason this is a Gewinnspiel and not a
 *        Glücksspiel. If entering ever costs money, the whole document changes
 *        character and § 284 StGB is suddenly in the room.
 *   § 10 Ihre Beiträge - the licence that makes the winner thread legal. Every
 *        entry reposted without it is a copyright infringement against the
 *        person who just entered our contest.
 *   § 12 Vorzeitige Beendigung - narrow on purpose. A reservation to cancel
 *        "at any time and without reason" is an unreasonable disadvantage
 *        under § 307 BGB and takes the rest of the clause down with it.
 *   § 14 Keine Verbindung - required by X's promotion rules, and the honest
 *        answer about the voucher issuer regardless of what they require.
 *
 * The other four languages are translations of *this*. If you change a clause
 * here, change it in all five files in the same commit; the § numbers come from
 * `CONTEST_SECTIONS` and move together, but the sentences do not.
 */
export function deCopy(f: ContestFacts): ContestCopy {
  return {
    locale: 'de',

    meta: {
      title: 'Teilnahmebedingungen – Beta-Gewinnspiel',
      description:
        'Bau einen Raum, poste ein Bild davon auf X, gewinne einen Gutschein. Was kxb.team ist, wie du mitmachst, und die vollständigen Teilnahmebedingungen.',
      ogTitle: 'Beta-Gewinnspiel – Teilnahmebedingungen',
      ogDescription:
        'Bau einen Raum, poste ein Bild davon auf X, gewinne einen Gutschein. 1.–30. September.',
      posterAlt:
        'Ein Voxel-Dinosaurier springt durch ein grünes Portal im Weltraum, um ihn herum ein Fuchs, ein Panda und schwebende Bauklötze; daneben der Schriftzug „Win a voucher | here to play.“ und die Preise 1×50 € und 2×25 €.',
    },

    chrome: {
      back: '← Zurück zur Startseite',
      title: 'Beta-Gewinnspiel',
      chooserLabel: 'Sprache',
      deadline: `Teilnahmeschluss: ${f.end} ${f.timezone}`,
      // Null, and that is the point: this is the version everything else defers
      // to, and a document that claims to be a translation of itself is nonsense.
      binding: null,
      sectionMark: '§',
      hint: 'Diese Seite gibt es auch auf {language}.',
    },

    intro: {
      kicker: 'Offene Beta',
      lead: 'Bau einen Raum, mach ein Bild davon, poste es auf X. Drei Gutscheine werden unter allen Beiträgen verlost.',
      game: {
        title: 'Was ist kxb.team?',
        body: [
          'Ein Raum im Browser. Du öffnest einen Link, tippst einen Namen ein, suchst dir eines von 24 Tieren aus und stehst drin – nichts zu installieren, kein Konto für die Gäste, kein Passwort, das sich jemand ausdenken muss.',
          'Der Raum ist gleichzeitig der Editor. 58 Bauteile liegen in der Palette, und du setzt sie, während alle anderen noch im Raum stehen. Stell zwei Tore hin, und es ist ein Fußballplatz. Leg eine Tanzfläche, und der nächste Abend findet dort statt.',
          'Und darin wird gespielt: Fußball, Rennen, Prügeleien, Café-Schichten. Nichts davon zählt irgendwo eine Rangliste mit. Es ist der Ort, nicht die Punktetabelle.',
        ],
        shotAlt:
          'Das Fenster von kxb.team: links die Navigation mit den Räumen, in der Mitte ein Panda in einem Ziegelraum, rechts die Liste, wer gerade da ist.',
        cta: 'Selbst ausprobieren',
      },
      steps: {
        title: 'So machst du mit',
        items: [
          {
            title: 'Bau einen Raum',
            body: 'Deine Lounge oder ein neuer Raum, das bleibt dir überlassen. Ein Café, eine Arena, ein Wohnzimmer, eine einzige sehr lange Treppe – wir urteilen darüber nicht.',
            alt: 'Ein Raum aus Steinblöcken, darin sechs Arbeitsplätze mit Monitoren, eine Werkbank und ein rotes Fass.',
          },
          {
            title: 'Mach ein Bild',
            body: 'Der Auslöser im Raum liefert das Bild ohne die Bedienelemente – nur die Welt, keine Namen, keine Chatzeile. Ein selbst gemachtes Bildschirmfoto geht aber genauso.',
            alt: 'Zwei Tiere auf einer bunt leuchtenden Tanzfläche in einer Ziegelhalle, Scheinwerfer streichen über die Wände.',
          },
          {
            title: `Poste es mit #${f.hashtag}`,
            body: `Öffentlicher Beitrag auf X, im September, mit dem Hashtag – und folge @${f.handle}, damit wir dir im Gewinnfall schreiben können. Das war alles.`,
            alt: 'Vier Voxel-Tiere nebeneinander auf einer grünen Wiese, über ihnen Emotes in Sprechblasen.',
          },
        ],
      },
      prizes: {
        title: 'Zu gewinnen',
        note: 'Es ist eine Verlosung, kein Wettbewerb. Keine Jury, keine Bewertung, keine Rangfolge – jeder gültige Beitrag hat dieselbe Chance, egal wie aufwendig er ist.',
        place: '{n}. Preis',
      },
      cta: { signup: 'Für die Beta anmelden', github: 'Auf GitHub folgen' },
      handover:
        'Alles Weitere – wer teilnehmen kann, wie gezogen wird, was mit deinem Bild passiert – steht hier:',
    },

    sections: {
      organiser: {
        heading: 'Veranstalter',
        body: (
          <>
            <p>
              Veranstalter dieses Gewinnspiels und Ihr Ansprechpartner für alles, was damit zu tun
              hat, ist:
            </p>
            <ControllerBlock />
            <p>
              Diese Teilnahmebedingungen gelten ausschließlich für dieses Gewinnspiel. Für die Nutzung
              des Dienstes selbst gelten daneben unsere{' '}
              <a href="/agb" className="text-accent hover:underline">
                Nutzungsbedingungen
              </a>
              .
            </p>
          </>
        ),
      },

      what: {
        heading: 'Worum es geht',
        body: (
          <>
            <p>
              kxb.team geht in die offene Beta. Aus diesem Anlass verlosen wir Gutscheine unter allen,
              die in dieser Zeit einen eigenen Raum bauen und ein Bild davon auf X veröffentlichen.
            </p>
            <p>
              Es ist eine Verlosung und kein Wettbewerb: Es gibt keine Jury, keine Bewertung und keine
              Rangfolge nach Qualität. Jeder gültige Beitrag hat dieselbe Gewinnchance, unabhängig
              davon, wie aufwendig er ist oder wie viele Menschen ihn gesehen haben.
            </p>
          </>
        ),
      },

      window: {
        heading: 'Teilnahmezeitraum',
        body: (
          <p>
            Teilnahmebeiträge werden vom {f.start} bis zum {f.end} {f.timezone}{' '}
            berücksichtigt. Maßgeblich ist der von X ausgewiesene Veröffentlichungszeitpunkt des
            Beitrags. Beiträge, die vor Beginn oder nach Ablauf dieser Frist veröffentlicht werden,
            nehmen nicht teil.
          </p>
        ),
      },

      eligibility: {
        heading: 'Wer teilnehmen kann',
        body: (
          <>
            <p>Teilnahmeberechtigt sind natürliche Personen, die</p>
            <Bullets
              items={[
                `das ${f.minAge}. Lebensjahr vollendet haben,`,
                'ihren Wohnsitz in der Europäischen Union, im Europäischen Wirtschaftsraum, in der Schweiz oder im Vereinigten Königreich haben — mit Ausnahme Italiens,',
                'über ein eigenes, öffentlich sichtbares Konto bei X verfügen und',
                'über ein eigenes Konto bei kxb.team verfügen.',
              ]}
            />
            {/*
              The one country in Europe where this document is not enough.

              A pure prize draw aimed at Italian residents is a concorso a premi
              under DPR 430/2001: it has to be notified to the ministry before it
              starts, secured by a deposit, and run through a representative
              established there. None of that scales down to a hundred euros, and
              the honest options were to carry the formality or to say plainly
              that we are not. A bare exclusion with no reason given reads as
              arbitrary, which is why the reason is on the page rather than only
              in here.
            */}
            <p>
              Italien ist ausgenommen, weil Gewinnspiele dort nach den italienischen Vorschriften
              über <em>manifestazioni a premio</em> vorab bei der zuständigen Behörde anzumelden und
              abzusichern sind. Diesen Aufwand können wir für eine Verlosung dieser Größe nicht
              leisten. Die Ausnahme richtet sich gegen die Formalität, nicht gegen die Personen.
            </p>
            <p>
              Ausgeschlossen sind außerdem der Veranstalter selbst sowie die mit ihm in gerader Linie
              verwandten oder in häuslicher Gemeinschaft lebenden Personen.
            </p>
            <p>
              Pro Person ist ein Beitrag zugelassen. Wer mehrere Beiträge veröffentlicht, nimmt mit
              dem zuerst veröffentlichten teil; die übrigen bleiben unberücksichtigt. Mehrere Konten
              derselben Person zählen als eine Person.
            </p>
          </>
        ),
      },

      entry: {
        heading: 'So nehmen Sie teil',
        body: (
          <>
            <p>Ein gültiger Beitrag besteht aus fünf Dingen:</p>
            <Bullets
              items={[
                'Sie bauen in einem Space bei kxb.team einen Raum – Ihre Lounge oder einen weiteren Raum, das bleibt Ihnen überlassen.',
                'Sie erstellen davon ein Bild. Der Auslöser im Raum liefert das Bild ohne die Bedienelemente; ein selbst angefertigtes Bildschirmfoto genügt aber ebenso.',
                <>
                  Sie veröffentlichen dieses Bild innerhalb des Teilnahmezeitraums in einem
                  öffentlichen Beitrag auf X mit dem Hashtag <strong>#{f.hashtag}</strong>.
                </>,
                'Ihr Konto bei X ist zu diesem Zeitpunkt öffentlich sichtbar, damit wir den Beitrag überhaupt sehen können.',
                <>
                  Sie folgen dem Konto <strong>@{f.handle}</strong> auf X.
                </>,
              ]}
            />
            {/*
              A follow is the one condition that can be undone after the entry is
              made, so it needs a moment attached to it or it means nothing. The
              draw is the moment: it is the one time the list gets read, it is
              announced in advance, and it makes the condition checkable in a
              single pass instead of asking somebody to prove what was true three
              weeks ago. Said plainly here rather than left to be discovered by
              whoever loses a prize over it.
            */}
            <p>
              Ob Sie uns folgen, prüfen wir einmal, und zwar bei der Ziehung. Wer bis dahin wieder
              entfolgt, nimmt nicht teil; wer erst nach dem Beitrag folgt, nimmt teil.
            </p>
            <p>
              Der abgebildete Raum muss von Ihnen selbst gebaut sein. Ein Bild aus einem fremden
              Space, ein Bild aus dem Netz oder ein Beitrag ohne erkennbaren Raum ist kein gültiger
              Beitrag.
            </p>
            {/*
              The content limits are on this page rather than only behind a link
              to § 5 of the Nutzungsbedingungen, even though that section already
              covers every case here.

              A participant is being asked to make something and put it in public
              under our hashtag. Telling them where the line is *before* they
              spend twenty minutes building is a different act from being able to
              point at a rule afterwards, and the second one is what a link does.
              It also means an exclusion under § 11 is never a surprise: the
              ground for it was on the same page as the invitation.
            */}
            <p>Was auf dem Bild und im Beitrag nicht zu sehen sein darf:</p>
            <Bullets
              items={[
                'hasserfüllte, herabwürdigende oder diskriminierende Darstellungen – insbesondere solche, die sich gegen Menschen wegen ihrer Herkunft, ihrer Hautfarbe, ihrer Religion, ihrer Weltanschauung, einer Behinderung, ihres Geschlechts oder ihrer sexuellen Orientierung richten;',
                'verfassungswidrige Kennzeichen und Symbole;',
                'Gewaltverherrlichung sowie pornografische oder sexualisierte Darstellungen;',
                'Beleidigungen, Bedrohungen oder Belästigungen, die sich gegen eine bestimmte Person richten;',
                'Inhalte, die gegen § 5 unserer Nutzungsbedingungen oder gegen geltendes Recht verstoßen.',
              ]}
            />
            <p>
              Ein Beitrag, der so etwas zeigt, nimmt nicht teil, und wir zeigen ihn auch nicht. Über
              die Gestaltung Ihres Raumes urteilen wir nicht &ndash; über diese Grenze schon.
            </p>
            {/*
              A quiet promise the shutter already keeps, said out loud because a
              participant cannot be expected to know it: the canvas is read back
              without the interface, so no chat line, no member chip and no name
              of anybody else standing in the room ends up in the picture.
              Somebody using their operating system's own screenshot key has no
              such protection, which is exactly why this sentence names the risk
              instead of forbidding the method.
            */}
            <p>
              Achten Sie darauf, dass auf dem Bild keine Daten anderer Personen zu sehen sind &ndash;
              etwa Namen von Anwesenden oder Nachrichten aus dem Chat. Der Auslöser im Raum
              fotografiert nur die Welt und lässt die Bedienoberfläche weg; wer ein Bildschirmfoto
              seines gesamten Browserfensters macht, prüft das bitte selbst.
            </p>
          </>
        ),
      },

      /*
        The clause the rest of the document stands on.

        A prize draw that costs money to enter is not a Gewinnspiel but a
        Glücksspiel, and organising one without a licence is § 284 StGB. What
        keeps this on the right side of that line is not the wording here but the
        promo code actually being live: see the note in ../contest.ts. The
        paragraph is written to be true, not to be reassuring.
      */
      free: {
        heading: 'Die Teilnahme ist kostenlos',
        body: (
          <>
            <p>
              Für die Teilnahme entstehen keine Kosten. Der Erwerb einer kostenpflichtigen Leistung
              ist weder Voraussetzung noch verbessert er die Gewinnchance.
            </p>
            <p>
              Bauen kann jedes Mitglied, auch im kostenlosen Tarif. Wer für die Dauer des Gewinnspiels
              mehr Räume, mehr Plätze und Bilder an den Wänden möchte, kann unter{' '}
              <a href={f.codePath} className="text-accent hover:underline">
                kxb.team{f.codePath}
              </a>{' '}
              den Code <strong>{f.code}</strong> einlösen und den Tarif xo einen Monat lang
              kostenlos nutzen. Auch das ist freiwillig und wirkt sich auf die Verlosung nicht aus.
            </p>
            {/* Only when the code actually carries them. What it hands over is set
                in the backoffice, and a clause promising bucks the code does not
                give would be a promise in a binding document. */}
            {f.bucks > 0 ? (
              <p>
                Dazu gehören {f.bucks} Bucks für Skins — sie liegen sofort in der Tasche und lassen sich im Shop ausgeben.
              </p>
            ) : null}
            <p>
              Kosten Ihres Internetzugangs und Ihrer Nutzung von X tragen Sie selbst; sie fallen für
              die Teilnahme nicht zusätzlich an.
            </p>
          </>
        ),
      },

      prizes: {
        heading: 'Was es zu gewinnen gibt',
        body: (
          <>
            {/*
              "die folgenden" statt "drei": wie viele es sind, steht in der
              Liste darunter und wird im Backoffice gesetzt. Ein Satz, der drei
              verspricht, wäre bei zwei Preisen schlicht falsch - und zwar in
              dem Dokument, das bindend ist.
            */}
            <p>Verlost werden die folgenden Gutscheine:</p>
            <Bullets
              items={f.prizes.map((amount, i) => (
                <>{`${i + 1}.`} Preis: ein Gutschein im Wert von {amount}&nbsp;&euro;</>
              ))}
            />
            {/*
              Not "Amazon-Gutschein", anywhere. Amazon's gift card conditions
              restrict use in promotions and forbid any impression that Amazon is
              involved in one; naming them in the prize itself is the impression.
              Letting the winner choose the shop also removes the case where the
              prize is worthless to somebody who does not shop there.
            */}
            <p>
              Der Gutschein wird als Code per E-Mail zugesandt. Die Gewinnerinnen und Gewinner können
              den Händler benennen, für den der Gutschein ausgestellt werden soll, soweit ein solcher
              Gutschein am Markt in diesem Wert erhältlich ist. Andernfalls stellen wir einen
              Gutschein eines gleichwertigen Anbieters aus.
            </p>
            <p>
              Eine Barauszahlung, ein Umtausch oder eine Übertragung des Gewinns auf eine andere
              Person ist ausgeschlossen. Etwaige Steuern auf den Gewinn trägt der Veranstalter.
            </p>
          </>
        ),
      },

      draw: {
        heading: 'Wie die Gewinner ermittelt werden',
        body: (
          <>
            <p>
              Nach Ablauf des Teilnahmezeitraums erfassen wir alle gültigen Beiträge in der
              Reihenfolge ihrer Veröffentlichung und nummerieren sie. Am {f.draw} ziehen wir
              daraus drei Nummern mit einem Zufallsgenerator, die erste für den 1. Preis, die zweite
              für den 2. Preis und die dritte für den 3. Preis. Eine Nummer kann nur einmal gezogen
              werden.
            </p>
            <p>
              Die Ziehung dokumentieren wir und veröffentlichen die Dokumentation zusammen mit dem
              Ergebnis. Der Zufall entscheidet allein; ein Anspruch auf einen bestimmten Preis besteht
              nicht.
            </p>
          </>
        ),
      },

      notice: {
        heading: 'Benachrichtigung und Übergabe',
        body: (
          <>
            <p>
              Wir benachrichtigen die Gewinnerinnen und Gewinner innerhalb von drei Tagen nach der
              Ziehung über eine Direktnachricht auf X an das Konto, von dem der Beitrag stammt. Wer
              Direktnachrichten von uns nicht empfangen kann, wird öffentlich unter dem eigenen
              Beitrag angesprochen.
            </p>
            <p>
              Für die Zusendung des Gutscheins benötigen wir eine E-Mail-Adresse. Meldet sich eine
              benachrichtigte Person nicht innerhalb von 14&nbsp;Tagen nach der Benachrichtigung,
              verfällt der Anspruch auf den Gewinn und wir ziehen für diesen Preis aus den übrigen
              gültigen Beiträgen erneut.
            </p>
            <p>
              Den Gutschein versenden wir innerhalb von 14&nbsp;Tagen, nachdem uns die E-Mail-Adresse
              vorliegt.
            </p>
          </>
        ),
      },

      /*
        Without this, the announcement thread showing every entry is a copyright
        infringement against each participant - the picture is their work, and
        entering a contest is not by itself a licence to republish it. Written as
        narrowly as it can be while still permitting the thread: showing the
        entry, saying who made it, for as long as the contest is being documented.
        No sublicensing, no editing beyond what a repost does, no use in paid
        advertising, and it dies when they ask.
      */
      yourEntry: {
        heading: 'Ihre Beiträge',
        body: (
          <>
            <p>
              Das Bild und der Raum, den Sie gebaut haben, bleiben Ihres. Wir erwerben daran kein
              Eigentum.
            </p>
            <p>
              Mit der Teilnahme räumen Sie uns das einfache, unentgeltliche und jederzeit
              widerrufliche Recht ein, Ihren Beitrag im Zusammenhang mit diesem Gewinnspiel zu zeigen
              &ndash; also ihn auf unseren eigenen Kanälen und auf kxb.team wiederzugeben, unter
              Nennung Ihres Kontonamens auf X. Weiter geht das Recht nicht: keine Bearbeitung über das
              hinaus, was ein Teilen technisch mit sich bringt, keine Weitergabe an Dritte und keine
              Verwendung in bezahlter Werbung. Auf Ihre Nachricht an {CONTROLLER.email} nehmen wir den
              Beitrag von unseren Kanälen.
            </p>
            <p>
              Sie sichern zu, dass der Beitrag von Ihnen stammt und keine Rechte Dritter verletzt
              &ndash; insbesondere, dass Sie an Bildern, die Sie im Raum an die Wände gehängt haben,
              die erforderlichen Rechte besitzen.
            </p>
          </>
        ),
      },

      exclusion: {
        heading: 'Ausschluss von der Teilnahme',
        body: (
          <>
            <p>
              Wir können Beiträge und Personen von der Teilnahme ausschließen, wenn ein wichtiger
              Grund vorliegt. Ein solcher liegt insbesondere vor bei
            </p>
            <Bullets
              items={[
                'der Verwendung mehrerer Konten, automatisierter Mittel oder eigens zur Teilnahme angelegter Konten,',
                'Beiträgen, die rechtswidrige oder in § 5 dieser Teilnahmebedingungen ausgeschlossene Inhalte zeigen,',
                'Beiträgen, die nicht vom Teilnehmenden selbst stammen,',
                'unwahren Angaben zur eigenen Person.',
              ]}
            />
            <p>
              Wurde ein Gewinn bereits zugesandt, können wir ihn in diesen Fällen zurückfordern. Ein
              Ausschluss wird der betroffenen Person auf demselben Weg mitgeteilt, auf dem sie
              teilgenommen hat.
            </p>
          </>
        ),
      },

      /*
        Narrow on purpose. "Wir behalten uns vor, das Gewinnspiel jederzeit
        abzubrechen" is the sentence every template carries and it is an
        unangemessene Benachteiligung under § 307 BGB: it lets the organiser walk
        away from a promise people have already relied on. Tying the right to
        reasons outside our control, and promising the draw happens anyway
        wherever it still can, is both fairer and far likelier to hold.
      */
      ending: {
        heading: 'Vorzeitige Beendigung oder Änderung',
        body: (
          <>
            <p>
              Wir können das Gewinnspiel abbrechen oder ändern, wenn es aus Gründen, die wir nicht zu
              vertreten haben, nicht ordnungsgemäß durchgeführt werden kann &ndash; etwa bei einer
              schwerwiegenden technischen Störung, bei Manipulationen von außen oder wenn eine
              Durchführung rechtlich nicht mehr zulässig ist.
            </p>
            <p>
              Ist der Teilnahmezeitraum zu diesem Zeitpunkt bereits abgelaufen, führen wir die
              Ziehung gleichwohl durch. Über einen Abbruch oder eine Änderung informieren wir auf
              dieser Seite und auf dem Konto @{f.handle} bei X.
            </p>
          </>
        ),
      },

      privacy: {
        heading: 'Datenschutz',
        body: (
          <>
            <p>
              Für die Durchführung des Gewinnspiels verarbeiten wir Ihren Kontonamen bei X, den Link
              zu Ihrem Beitrag und das darin veröffentlichte Bild; im Gewinnfall zusätzlich die
              E-Mail-Adresse, an die der Gutschein gehen soll. Wir verwenden diese Daten
              ausschließlich für das Gewinnspiel und geben sie nicht für Werbung weiter.
            </p>
            <p>
              Einzelheiten &ndash; Rechtsgrundlagen, Speicherdauer und Ihre Rechte &ndash; stehen in
              Ziffer 13 unserer{' '}
              <a href="/datenschutz" className="text-accent hover:underline">
                Datenschutzerklärung
              </a>
              . Was X mit Ihrem Beitrag und Ihren Daten macht, richtet sich nach den Bestimmungen von
              X und liegt außerhalb unserer Verantwortung.
            </p>
          </>
        ),
      },

      /*
        The first paragraph is X's own promotion rules, near enough verbatim
        because that is what they ask for. The second is not required by anybody -
        it is simply true, and a participant who assumes a large shop is standing
        behind the prize has been misled by our silence.
      */
      noAffiliation: {
        heading: 'Keine Verbindung zu X oder zu einem Händler',
        body: (
          <>
            <p>
              Dieses Gewinnspiel steht in keiner Verbindung zu X. Es wird von X weder gesponsert noch
              unterstützt, organisiert oder in irgendeiner Weise mitverantwortet. Sämtliche Angaben
              und Ansprüche richten sich ausschließlich an den in § 1 genannten Veranstalter, nicht an
              X.
            </p>
            <p>
              Ebenso wenig steht das Gewinnspiel in Verbindung zu dem Händler, dessen Gutschein
              ausgestellt wird. Der Händler ist weder Veranstalter noch Sponsor und hat mit der
              Durchführung nichts zu tun; wir erwerben den Gutschein wie jede andere Kundin auch.
            </p>
          </>
        ),
      },

      liability: {
        heading: 'Haftung',
        body: (
          <>
            <h3 className="mb-2 text-xl font-medium text-ink">Für das Gewinnspiel</h3>
            <p>
              Für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach
              dem Produkthaftungsgesetz haften wir unbeschränkt, ebenso für Vorsatz und grobe
              Fahrlässigkeit. Bei einfacher Fahrlässigkeit haften wir nur für die Verletzung einer
              wesentlichen Vertragspflicht und der Höhe nach begrenzt auf den vorhersehbaren,
              vertragstypischen Schaden. Im Übrigen ist die Haftung ausgeschlossen.
            </p>
            <h3 className="mb-2 mt-6 text-xl font-medium text-ink">Für den Gutschein</h3>
            <p>
              Mit der Zusendung des Gutscheincodes ist der Gewinn erbracht. Für die Einlösung des
              Gutscheins gelten die Bedingungen des ausstellenden Händlers; dafür, dass dieser den
              Gutschein annimmt, können wir nicht einstehen.
            </p>
          </>
        ),
      },

      final: {
        heading: 'Schlussbestimmungen',
        body: (
          <>
            <p>
              Es gilt das Recht der Bundesrepublik Deutschland. Haben Sie als Verbraucherin oder
              Verbraucher Ihren gewöhnlichen Aufenthalt in einem anderen Staat, bleiben die zwingenden
              Verbraucherschutzvorschriften dieses Staates unberührt.
            </p>
            {/*
              The sentence that makes four translations safe to publish. Without
              it, five texts of one document are five documents, and a translation
              that says something slightly different is a promise we made.
            */}
            <p>
              Diese Teilnahmebedingungen sind auch in anderen Sprachen abrufbar. Die deutsche Fassung
              ist verbindlich; bei Abweichungen geht sie den Übersetzungen vor.
            </p>
            <p>
              Sollte eine Bestimmung dieser Teilnahmebedingungen unwirksam sein, bleibt die
              Wirksamkeit der übrigen unberührt.
            </p>
            <p>Der Rechtsweg ist ausgeschlossen.</p>
          </>
        ),
      },
    },
  }
}
