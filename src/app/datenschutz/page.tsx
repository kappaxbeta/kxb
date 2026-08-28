import {
  Bullets,
  ControllerBlock,
  CONTROLLER,
  LegalShell,
  Section,
  Sub,
  SUPERVISORY_AUTHORITY,
} from '@/app/legal/shell'

export const metadata = {
  title: 'Datenschutzerklärung',
  alternates: {
    canonical: '/datenschutz',
    languages: { de: '/datenschutz', en: '/datenschutz/en' },
  },
}

/**
 * Written against what the code actually does, not against a generator.
 *
 * The version this replaced named Vercel and Supabase Cloud as the hosts, which
 * stopped being true when the app moved to Hetzner and the database to a
 * self-hosted box - a privacy notice that names the wrong processor is worse
 * than a thin one, because it is a statement about where personal data goes and
 * it was wrong. Every claim below is traceable to a file:
 *
 *   Reichweitenmessung  -> domain/analytics/track.ts (hash, salt, rotation)
 *   Ländererkennung     -> domain/analytics/geo.ts   (offline registry table)
 *   Cookies             -> lib/auth-persistence.ts, lib/last-space.ts, proxy.ts
 *   Widerspruch         -> domain/analytics/opt-out.ts, app/notme/
 *   E-Mail              -> scripts/supabase-push-config.ts (local Postfix)
 *   Hosting             -> Caddyfile (Hetzner, two app replicas, Let's Encrypt)
 *
 * If one of those changes, this page is part of the change.
 */
export default function DatenschutzPage() {
  return (
    <LegalShell locale="de" title="Datenschutzerklärung" altHref="/datenschutz/en">
      <Section heading="1. Verantwortlicher">
        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website und in diesem Dienst ist:
        </p>
        <ControllerBlock />
        <p>
          Ein Datenschutzbeauftragter ist nicht bestellt, da die gesetzlichen Voraussetzungen
          hierfür nicht vorliegen. Für alle Anliegen zum Datenschutz erreichen Sie uns unter der
          oben genannten Adresse.
        </p>
      </Section>

      <Section heading="2. Der Grundsatz, nach dem dieser Dienst gebaut ist">
        <p>
          Dieser Dienst ist so gebaut, dass möglichst wenig personenbezogene Daten überhaupt
          entstehen. Das ist keine Absichtserklärung, sondern lässt sich an den folgenden Punkten
          nachprüfen:
        </p>
        <Bullets
          items={[
            'Es gibt keine Werbe-, Tracking- oder Marketing-Cookies, und es sind keine Dienste Dritter zur Reichweitenmessung eingebunden (kein Google Analytics, kein Meta-Pixel, kein Consent-Management-Dienst).',
            'Es ist kein Content Delivery Network vorgeschaltet. Alle Seiten werden direkt von unserem Server ausgeliefert.',
            'Schriftarten werden lokal von unserem Server ausgeliefert. Es wird keine Verbindung zu Google Fonts oder einem vergleichbaren Dienst aufgebaut.',
            'Ihre IP-Adresse wird für die Reichweitenmessung nicht gespeichert (siehe Ziffer 6).',
            'Um einen Raum zu betreten, ist kein Konto erforderlich (siehe Ziffer 8).',
            'Die einzige Datei, die die Seite von einem anderen Server als unserem eigenen lädt, ist ein Skript von Telegram – und das nur dann, wenn Sie den Raum in Telegram geöffnet haben (siehe Ziffer 8).',
          ]}
        />
      </Section>

      <Section heading="3. Hosting">
        <p>
          Die Anwendung und die Datenbank laufen auf von uns angemieteten Servern in Deutschland.
          Eine Übermittlung in ein Drittland findet dabei nicht statt.
        </p>
        <Bullets
          items={[
            <>
              <strong>Anwendungsserver:</strong> Hetzner Online GmbH, Industriestr. 25, 91710
              Gunzenhausen. Hier läuft die Website selbst sowie der TLS-Proxy, der die
              Verschlüsselung Ihrer Verbindung übernimmt.
            </>,
            <>
              <strong>Datenbank-, Authentifizierungs- und Dateiserver:</strong> STRATO AG,
              Otto-Ostrowski-Straße 7, 10249 Berlin. Hier läuft unsere selbst betriebene
              Supabase-Installation, in der Konten, Inhalte und Dateien gespeichert sind.
            </>,
          ]}
        />
        <p>
          Mit beiden Anbietern besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Die
          Anbieter haben keinen inhaltlichen Zugriff auf die Daten und verarbeiten sie
          ausschließlich zum Betrieb der Server.
        </p>
        <p>
          Die TLS-Zertifikate für die verschlüsselte Übertragung beziehen wir automatisiert von
          Let&rsquo;s Encrypt (Internet Security Research Group, USA). Dabei werden ausschließlich
          Domainnamen übermittelt, keine Daten von Besucherinnen und Besuchern.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt im
          technisch sicheren und zuverlässigen Betrieb dieses Angebots.
        </p>
      </Section>

      <Section heading="4. Server-Log-Dateien">
        <p>
          Beim Aufruf einer Seite werden vom Webserver automatisch Protokolldaten erfasst, die Ihr
          Browser übermittelt. Das sind:
        </p>
        <Bullets
          items={[
            'IP-Adresse',
            'Datum und Uhrzeit der Anfrage',
            'aufgerufene Adresse und HTTP-Statuscode',
            'übertragene Datenmenge',
            'Referrer-URL, sofern übermittelt',
            'Browsertyp, Browserversion und Betriebssystem',
          ]}
        />
        <p>
          Diese Daten sind technisch erforderlich, um die Seite auszuliefern, und dienen darüber
          hinaus der Erkennung und Abwehr von Missbrauch und Angriffen. Sie werden nicht mit anderen
          Datenquellen zusammengeführt und nicht zur Reichweitenmessung ausgewertet. Rechtsgrundlage
          ist Art. 6 Abs. 1 lit. f DSGVO. Die Protokolle werden nach spätestens 14 Tagen gelöscht
          oder deren IP-Adressen anonymisiert.
        </p>
      </Section>

      <Section heading="5. Cookies">
        <p>
          Wir setzen ausschließlich technisch notwendige Cookies ein. Ein Einwilligungsbanner
          entfällt deshalb: nach § 25 Abs. 2 Nr. 2 TDDDG ist für Cookies, die für die Erbringung
          eines ausdrücklich gewünschten Dienstes unbedingt erforderlich sind, keine Einwilligung
          erforderlich. Es wird kein Cookie gesetzt, um Sie zu vermessen oder zu bewerben. Das
          einzige Cookie mit Bezug zur Reichweitenmessung ist der Widerspruch dagegen — er wird nur
          gesetzt, wenn Sie ihn anfordern, und sorgt dafür, dass weniger gespeichert wird.
        </p>
        <Bullets
          items={[
            <>
              <strong>sb-…-auth-token</strong> — hält Ihre Anmeldung aufrecht. Wird nur gesetzt,
              wenn Sie sich anmelden. Laufzeit je nach Auswahl unter &bdquo;Angemeldet
              bleiben&ldquo;: bis zum Schließen des Browsers oder bis zu 30 Tage.
            </>,
            <>
              <strong>kxb.keep</strong> — merkt sich genau diese Auswahl, damit die Anmeldung bei
              jeder Erneuerung die richtige Laufzeit bekommt.
            </>,
            <>
              <strong>unkown_last_space</strong> — merkt sich, welchen Space Sie zuletzt geöffnet
              haben, damit Sie nach der Anmeldung dort landen und nicht in einer Auswahlliste.
              Laufzeit: mehrere Wochen.
            </>,
            <>
              <strong>unkown_invite</strong> — hält eine offene Einladung fest, während Sie das
              Konto anlegen, mit dem Sie sie annehmen. Wird danach nicht mehr benötigt.
            </>,
            <>
              <strong>unkown_dnt</strong> — wird nur gesetzt, wenn Sie auf{' '}
              <a href="/notme" className="text-accent hover:underline">
                /notme
              </a>{' '}
              ausdrücklich darum bitten, nicht gezählt zu werden. Er enthält ausschließlich diese
              Entscheidung, keine Kennung, und bewirkt, dass zu diesem Browser nichts gespeichert
              wird. Laufzeit: fünf Jahre.
            </>,
          ]}
        />
        <p>
          Sie können Cookies in Ihrem Browser jederzeit löschen oder blockieren. In diesem Fall
          können Sie sich nicht anmelden und die geschützten Bereiche des Dienstes nicht nutzen.
        </p>
      </Section>

      <Section heading="6. Reichweitenmessung">
        <p>
          Wir messen, wie oft welche Seiten aufgerufen werden, um zu verstehen, was gefunden wird
          und was nicht. Dafür setzen wir kein fremdes Analysewerkzeug und kein Cookie ein. Zu jedem
          Seitenaufruf wird ein Eintrag mit den folgenden Angaben gespeichert:
        </p>
        <Bullets
          items={[
            'der aufgerufene Pfad, ohne Query-String — Kennungen, Einladungstoken und Suchbegriffe werden verworfen, bevor der Pfad gespeichert wird, und gelangen so gar nicht erst in die Datenbank;',
            'der Host der verweisenden Seite, also z. B. „discord.com“, nicht die vollständige Adresse. Verweise von unseren eigenen Seiten werden nicht gespeichert;',
            'das Land, als zweibuchstabiges Länderkürzel;',
            'die bevorzugte Sprache, als Sprachkürzel aus dem Accept-Language-Header;',
            'die Geräteklasse, ausschließlich als eine der vier Kategorien „desktop“, „mobile“, „tablet“ oder „bot“ — der User-Agent selbst wird nicht gespeichert;',
            'ein pseudonymer Tageskennwert (siehe unten);',
            'Ihre Nutzerkennung, sofern Sie zu diesem Zeitpunkt angemeldet sind.',
          ]}
        />
        <Sub heading="Der Tageskennwert">
          <p>
            Um wiederkehrende Aufrufe innerhalb eines Tages zusammenzufassen, bilden wir aus Ihrer
            IP-Adresse, Ihrem User-Agent, dem aktuellen Datum und einem geheimen, nur uns bekannten
            Schlüssel einen kryptografischen Hashwert. Gespeichert wird nur dieser Hashwert.
          </p>
          <p>
            <strong>Ihre IP-Adresse wird dabei nicht gespeichert.</strong> Da das Datum in die
            Berechnung einfließt, ändert sich der Hashwert um Mitternacht (UTC) vollständig.
            Dieselbe Person erhält am Folgetag einen anderen Wert, der sich dem vorherigen nicht
            zuordnen lässt. Eine Wiedererkennung über mehrere Tage hinweg und die Bildung eines
            Nutzungsprofils sind damit technisch ausgeschlossen; „eindeutige Besucher“ ist bei uns
            eine Tageszahl und kann nichts anderes sein.
          </p>
        </Sub>
        <Sub heading="Ländererkennung ohne Übermittlung">
          <p>
            Das Länderkürzel ermitteln wir offline aus einer Zuordnungstabelle der
            Adressvergabestellen, die in unsere Anwendung eingebaut ist. Ihre IP-Adresse wird zu
            diesem Zweck an niemanden übermittelt und nicht an einen Geolokalisierungsdienst
            weitergegeben. Das Ergebnis ist ein Land und nie etwas Genaueres.
          </p>
        </Sub>
        <Sub heading="Widerspruch">
          <p>
            Sie können dieser Messung jederzeit widersprechen:{' '}
            <a href="/notme" className="text-accent hover:underline">
              /notme
            </a>
            . Ein Klick genügt, ein Konto ist nicht nötig. Danach wird zu Ihren Aufrufen nichts mehr
            gespeichert. Der Widerspruch gilt für den Browser, in dem Sie ihn erklären, weil er in
            einem Cookie steckt — löschen Sie Ihre Cookies, ist er weg und muss neu erklärt werden.
          </p>
        </Sub>
        <p>
          Aufrufe unseres Verwaltungsbereichs werden nicht gezählt. Rechtsgrundlage ist Art. 6 Abs.
          1 lit. f DSGVO; unser berechtigtes Interesse liegt in einer bedarfsgerechten Gestaltung
          dieses Angebots. Angesichts der oben beschriebenen Ausgestaltung ist der Eingriff in Ihre
          Rechte gering.
        </p>
      </Section>

      <Section heading="7. Konto und Profil">
        <p>
          Wenn Sie ein Konto anlegen, verarbeiten wir Ihre E-Mail-Adresse und Ihr Passwort. Das
          Passwort wird ausschließlich als Hashwert gespeichert; im Klartext ist es uns nicht
          bekannt. Hinzu kommen die Angaben, die Sie selbst in Ihrem Profil hinterlegen, etwa ein
          Anzeigename und die Wahl einer Spielfigur, sowie die Spaces, in denen Sie Mitglied sind,
          und Ihre dortige Rolle.
        </p>
        <p>
          Laden Sie andere per E-Mail in einen Space ein, verarbeiten wir die von Ihnen angegebene
          E-Mail-Adresse, um die Einladung zuzustellen. Bitte laden Sie nur Personen ein, die damit
          einverstanden sind.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, da diese Verarbeitung zur Erfüllung des
          Nutzungsvertrages erforderlich ist.
        </p>
      </Section>

      <Section heading="8. Teilnahme ohne Konto (Gäste)">
        <p>
          Räume können über einen Gäste-Link betreten werden, ohne dass ein Konto angelegt wird. In
          diesem Fall verarbeiten wir den Namen, den Sie sich selbst geben, die von Ihnen gewählte
          Spielfigur sowie eine technische Kennung, die Ihre Sitzung für deren Dauer identifiziert.
          Eine E-Mail-Adresse verlangen wir dafür nicht.
        </p>
        <p>
          Gastzugänge sind befristet und werden nach Ablauf automatisch gelöscht. Rechtsgrundlage
          ist Art. 6 Abs. 1 lit. b DSGVO.
        </p>

        <Sub heading="Ankunft über Telegram">
          <p>
            Ein Gäste-Link lässt sich auch als Telegram Mini App öffnen. Der Raum läuft dann in der
            Telegram-App statt im Browser. Das gilt nur, wenn Sie einen Link auf diesem Weg öffnen –
            bei jedem anderen Besuch geschieht nichts von dem, was in diesem Abschnitt beschrieben
            ist.
          </p>
          <Bullets
            items={[
              <>
                <strong>Telegram sieht den Besuch.</strong> Sie benutzen deren App, daher sind der
                Umstand, dass Sie den Raum geöffnet haben, sowie Ihre IP-Adresse Telegram nach dessen
                eigener Datenschutzerklärung bekannt, auf die wir keinen Einfluss haben. Das gilt für
                jeden Link, der in einem Messenger geöffnet wird, und ist keine Besonderheit der Mini
                App.
              </>,
              <>
                <strong>Ein Skript wird von telegram.org geladen.</strong> Es ist die Schnittstelle,
                die Telegram für den Betrieb einer Mini App voraussetzt, und es ist das, was dem Raum
                den ganzen Bildschirm gibt und der App mitteilt, dass eine Wischbewegung eine
                Kamerabewegung ist und keine Aufforderung zu schließen. Es wird ausschließlich dann
                angefordert, wenn Sie über Telegram ankommen; andernfalls baut die Seite keine
                Verbindung zu Telegram auf.
              </>,
            ]}
          />
          <p>
            Von Telegram erhalten wir im Gegenzug den Anzeigenamen Ihres Telegram-Profils. Wir
            verwenden ihn, um das Namensfeld an der Tür vorauszufüllen, und für nichts sonst – Sie
            können ihn vor dem Eintreten überschreiben, und gespeichert wird das, was beim Betreten
            im Feld steht (siehe oben). Ihr Telegram-Konto übermittelt außerdem eine Kennung und, je
            nach Ihren Einstellungen, einen Benutzernamen; beides werten wir weder aus noch speichern
            wir es. Ihre Telefonnummer, Ihre Kontakte oder Ihre Nachrichten erhalten wir nicht und
            fragen wir bei Telegram auch nicht ab.
          </p>
          <p>
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO: Es ist der Weg, den Sie zum Eintreten
            gewählt haben.
          </p>
        </Sub>
      </Section>

      <Section heading="9. Inhalte in Spaces und Räumen">
        <p>
          Was Sie im Dienst erstellen, wird gespeichert: Seiten und deren Inhalte, gebaute Räume,
          Chatnachrichten, Spielstände und vergleichbare Eingaben. Diese Inhalte sind für die
          Mitglieder des jeweiligen Space und für Gäste, denen Zugang gewährt wurde, sichtbar.
          Bitte beachten Sie, dass Chatnachrichten und Bauwerke für alle Anwesenden sichtbar sind.
        </p>
        <Sub heading="Gespielte Levels">
          <p>
            Wenn Sie ein Level (&bdquo;XP&ldquo;) spielen, halten wir am Ende der Sitzung einen
            Eintrag fest: welches Level in welcher Fassung, wann die Sitzung begann, wie lange sie
            dauerte, in welchem Raum oder Match sie stattfand und — sofern Sie angemeldet sind —
            Ihr Konto. Wir speichern dabei <strong>nichts über den Spielverlauf</strong>: keine
            Positionen, keine Eingaben, keine Punktzahlen.
          </p>
          <p>
            Diese Einträge dienen der Frage, wie oft ein Level gespielt wurde. Wer ein Level
            erstellt hat, sieht ausschließlich <strong>Summen</strong> — die Anzahl der Sitzungen
            und deren Gesamtdauer — und niemals die einzelnen Einträge oder wer wann gespielt hat.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt
            darin, den Urheberinnen und Urhebern eines Levels eine Rückmeldung über dessen Nutzung
            zu geben und den Dienst bedarfsgerecht zu gestalten.
          </p>
          <p>
            Löschen Sie Ihr Konto, wird der Bezug zu Ihnen aus diesen Einträgen entfernt; der
            Eintrag selbst bleibt als anonyme Angabe bestehen, weil sonst die Nutzungszahlen
            fremder Levels rückwirkend verfälscht würden. Für Gastzugänge geschieht das
            automatisch, sobald der Gastzugang abläuft und gelöscht wird.
          </p>
        </Sub>

        <Sub heading="Wie unsere Speicherung funktioniert — und was das für Löschungen bedeutet">
          <p>
            Der Dienst speichert Änderungen als fortlaufendes, nur anhängbares Protokoll
            (&bdquo;Event Sourcing&ldquo;). Ein Eintrag wird also nicht überschrieben, sondern es
            wird ein weiterer Eintrag angefügt. Das ist der Grund, weshalb Inhalte nach einem
            Auslaufen des Abonnements erhalten bleiben.
          </p>
          <p>
            Ihr Recht auf Löschung bleibt davon unberührt. Verlangen Sie die Löschung, löschen wir
            Ihr Konto und überschreiben die personenbezogenen Angaben in den betroffenen
            Protokolleinträgen, sodass sich diese Ihnen nicht mehr zuordnen lassen. Der Eintrag als
            solcher bleibt in anonymisierter Form bestehen, weil sonst der Zustand der von anderen
            Personen gemeinsam genutzten Räume zerstört würde. Wenden Sie sich dazu bitte an die
            unter Ziffer 1 genannte Adresse.
          </p>
        </Sub>
      </Section>

      <Section heading="10. Kontaktformular und Event-Anfragen">
        <p>
          Wenn Sie uns über das Kontaktformular oder das Formular für Event-Anfragen schreiben,
          verarbeiten wir die dort von Ihnen gemachten Angaben — insbesondere Name, E-Mail-Adresse
          und den Inhalt Ihrer Nachricht — zur Bearbeitung Ihres Anliegens.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Anfrage auf den Abschluss eines
          Vertrages gerichtet ist, im Übrigen Art. 6 Abs. 1 lit. f DSGVO aufgrund unseres
          berechtigten Interesses an der Beantwortung von Anfragen. Wir löschen die Anfragen, sobald
          sie erledigt sind und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </Section>

      <Section heading="11. Zahlungen">
        <p>
          Für kostenpflichtige Abonnements nutzen wir Stripe Payments Europe, Ltd., 1 Grand Canal
          Street Lower, Grand Canal Dock, Dublin, Irland. Die Zahlungsdaten — insbesondere
          Kartendaten — geben Sie unmittelbar bei Stripe ein. Wir erhalten und speichern sie nicht.
        </p>
        <p>
          In unserer Datenbank speichern wir lediglich die Stripe-Kundennummer, die Nummer des
          Abonnements und dessen Status, um zu wissen, welche Funktionen freigeschaltet sind. Stripe
          kann personenbezogene Daten auch in die USA übermitteln; die Übermittlung wird auf
          Standardvertragsklauseln und die Zertifizierung nach dem EU-US Data Privacy Framework
          gestützt.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Rechnungsbezogene Daten bewahren wir nach
          Art. 6 Abs. 1 lit. c DSGVO für die gesetzlichen Fristen von bis zu zehn Jahren auf.
        </p>
      </Section>

      <Section heading="12. E-Mail-Versand">
        <p>
          Systemnachrichten wie Anmeldebestätigungen, Passwort-Zurücksetzungen und Einladungen
          versenden wir über einen Mailserver, den wir selbst auf unserer eigenen Infrastruktur
          betreiben. Ein externer Versanddienstleister ist nicht eingebunden. Es findet keine
          Öffnungs- oder Klickmessung statt, und wir versenden keinen Newsletter.
        </p>
      </Section>

      <Section heading="13. Gewinnspiele">
        <p>
          Führen wir ein Gewinnspiel durch, verarbeiten wir die Daten, die für seine
          Durchführung erforderlich sind. Beim Beta-Gewinnspiel zum Start sind das der Kontoname
          der teilnehmenden Person bei X, der Link zu ihrem Beitrag und das darin veröffentlichte
          Bild; im Gewinnfall zusätzlich die E-Mail-Adresse, an die der Gutschein gesendet wird.
        </p>
        {/*
          Worth saying plainly rather than leaving to inference: this is the one
          processing on the whole page where the data does not come from the
          person it belongs to. Art. 14 DSGVO is the provision for that case,
          and the information it requires - source, purpose, basis, retention -
          is what the rest of this section is.
        */}
        <p>
          Die Teilnahme findet auf X statt und nicht bei uns: Ein Beitrag wird dort öffentlich
          veröffentlicht, und wir sehen ihn wie jede andere Leserin auch. Wir erhalten die Angaben
          also aus einer öffentlichen Quelle und nicht von Ihnen selbst. Was X mit Ihrem Beitrag
          und Ihren Daten macht, richtet sich nach den Bestimmungen von X; dafür ist X
          verantwortlich, nicht wir.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO — mit der Teilnahme entsteht ein
          Schuldverhältnis, dessen Durchführung ohne diese Angaben nicht möglich wäre. Die Daten
          werden ausschließlich für das Gewinnspiel verwendet. Eine Verwendung für Werbung findet
          nicht statt, und eine Teilnahme führt nicht dazu, dass Sie von uns Nachrichten erhalten,
          die nichts mit dem Gewinnspiel zu tun haben.
        </p>
        <p>
          Die Liste der Teilnahmebeiträge und die Dokumentation der Ziehung löschen wir drei Monate
          nach der Ziehung; so lange bewahren wir sie auf, damit eine Rückfrage zum Ergebnis noch
          beantwortet werden kann. Unterlagen zu einem tatsächlich ausgegebenen Gewinn gehören zu
          unserer Buchhaltung und unterliegen den steuer- und handelsrechtlichen
          Aufbewahrungsfristen von bis zu zehn Jahren (Art. 6 Abs. 1 lit. c DSGVO).
        </p>
        <p>
          Die vollständigen Bedingungen stehen in den{' '}
          <a href="/gewinnspiel" className="text-accent hover:underline">
            Teilnahmebedingungen
          </a>
          .
        </p>
      </Section>

      <Section heading="14. Empfänger">
        <p>
          Über die in Ziffer 3, Ziffer 8, Ziffer 11 und Ziffer 13 genannten Stellen hinaus geben wir Ihre Daten nicht an
          Dritte weiter. Eine Weitergabe erfolgt nur, wenn wir gesetzlich dazu verpflichtet sind. Es
          findet keine automatisierte Entscheidungsfindung einschließlich Profiling nach Art. 22
          DSGVO statt, und Ihre Daten werden nicht verkauft.
        </p>
      </Section>

      <Section heading="15. Speicherdauer">
        <Bullets
          items={[
            'Server-Protokolle: höchstens 14 Tage.',
            'Reichweitenmessung: der Tageskennwert verliert seine Zuordenbarkeit mit dem Tageswechsel; die verbleibenden Angaben sind anonym und werden dauerhaft in aggregierter Form ausgewertet.',
            'Konto und Inhalte: bis zur Löschung des Kontos.',
            'Gespielte Levels: dauerhaft; mit der Löschung des Kontos verlieren die Einträge ihre Zuordenbarkeit zu Ihnen und bleiben anonym bestehen.',
            'Gastzugänge: bis zum Ablauf des Gastzugangs.',
            'Anfragen über die Formulare: bis zur Erledigung, sofern keine Aufbewahrungspflicht besteht.',
            'Gewinnspiele: Teilnahmeliste und Dokumentation der Ziehung drei Monate nach der Ziehung; Unterlagen zu ausgegebenen Gewinnen bis zu zehn Jahre.',
            'Rechnungsunterlagen: bis zu zehn Jahre aufgrund handels- und steuerrechtlicher Pflichten.',
          ]}
        />
      </Section>

      <Section heading="16. Ihre Rechte">
        <p>Sie haben uns gegenüber die folgenden Rechte:</p>
        <Bullets
          items={[
            'Auskunft über die zu Ihrer Person gespeicherten Daten (Art. 15 DSGVO),',
            'Berichtigung unrichtiger Daten (Art. 16 DSGVO),',
            'Löschung (Art. 17 DSGVO),',
            'Einschränkung der Verarbeitung (Art. 18 DSGVO),',
            'Datenübertragbarkeit (Art. 20 DSGVO),',
            'Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO).',
          ]}
        />
        <Sub heading="Widerspruchsrecht">
          <p>
            Soweit wir Daten auf Grundlage eines berechtigten Interesses nach Art. 6 Abs. 1 lit. f
            DSGVO verarbeiten — das betrifft die Server-Protokolle und die Reichweitenmessung —,
            haben Sie das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
            jederzeit Widerspruch einzulegen (Art. 21 DSGVO). Eine formlose Nachricht an{' '}
            {CONTROLLER.email} genügt.
          </p>
        </Sub>
        <Sub heading="Beschwerderecht">
          <p>
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung
            Ihrer personenbezogenen Daten zu beschweren (Art. 77 DSGVO). Für uns zuständig ist:
          </p>
          <p className="rounded-lg border border-line bg-surface-raised p-4">
            {SUPERVISORY_AUTHORITY.name}
            <br />
            {SUPERVISORY_AUTHORITY.street}
            <br />
            {SUPERVISORY_AUTHORITY.city}
            <br />
            <a
              href={SUPERVISORY_AUTHORITY.web}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {SUPERVISORY_AUTHORITY.web}
            </a>
          </p>
        </Sub>
      </Section>

      <Section heading="17. Änderungen dieser Erklärung">
        <p>
          Wir passen diese Datenschutzerklärung an, wenn sich der Dienst oder die Rechtslage ändert.
          Es gilt jeweils die hier abrufbare Fassung.
        </p>
        <p className="text-sm">Stand: August 2026</p>
      </Section>
    </LegalShell>
  )
}
