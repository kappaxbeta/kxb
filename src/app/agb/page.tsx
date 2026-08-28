import { MIN_AGE, TERMS_UPDATED } from '@/app/agb/terms'
import { Bullets, CONTROLLER, LegalShell, Section, Sub } from '@/app/legal/shell'

export const metadata = {
  title: 'Allgemeine Geschäftsbedingungen',
  alternates: {
    canonical: '/agb',
    languages: { de: '/agb', en: '/agb/en' },
  },
}

/**
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE THE FIRST PAID BOOKING GOES THROUGH THE SITE
 * ---------------------------------------------------------------------------
 * This document was drafted against what the code does, not copied from a
 * generator, and it is complete enough to link from the sign-up form. It has
 * not been reviewed by a lawyer. Three clauses are the ones to have checked,
 * and each carries a comment at the point where it is written:
 *
 *   § 7  Widerrufsrecht - whether § 312g Abs. 2 Nr. 9 BGB (Freizeitbetätigung
 *        zu einem spezifischen Termin) takes the event bookings out of the
 *        14-day withdrawal right. Getting this backwards is the expensive one.
 *   § 9  Änderungen dieser Bedingungen - written as announce-and-terminate
 *        rather than as a Zustimmungsfiktion on purpose; see the comment there.
 *   § 11 Haftung - the limitation is the standard three-tier one, which is
 *        where AGB most often fail the § 307 BGB test if it is tightened.
 *
 * Why there is no visible "this is a draft" banner: this page is linked from
 * the sign-up form and is the document a member is asked to accept. A notice
 * telling them it may not be enforceable is worse than either fixing it or not
 * shipping it.
 *
 * ---------------------------------------------------------------------------
 * Why the terms exist at all
 * ---------------------------------------------------------------------------
 * An Impressum and a Datenschutzerklärung are legal duties; AGB are not. What
 * makes them necessary here is that this service hosts user content and
 * moderates it. Removing a message, ending a session, banning a guest - none of
 * those has a contractual basis unless the rules were agreed to first, and Art.
 * 14 Abs. 1 DSA requires any hosting service to state its moderation rules in
 * its terms regardless of size. § 5 and § 6 are that statement.
 *
 * Deutsch is the original, as with the other legal pages. See `legal/shell`.
 */
export default function AgbPage() {
  return (
    <LegalShell
      locale="de"
      title="Allgemeine Geschäftsbedingungen"
      altHref="/agb/en"
      notice={`Stand: ${TERMS_UPDATED.de}`}
    >
      <Section heading="§ 1 Geltungsbereich und Anbieter">
        <p>
          Diese Allgemeinen Geschäftsbedingungen (nachfolgend &bdquo;Nutzungsbedingungen&ldquo;)
          gelten für die Nutzung des unter unkown.t und kxb.team erreichbaren Dienstes
          (nachfolgend &bdquo;Dienst&ldquo;). Anbieter und Vertragspartner ist:
        </p>
        <p className="rounded-lg border border-line bg-surface-raised p-4">
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
          <br />
          {CONTROLLER.country}
          <br />
          <br />
          {CONTROLLER.email}
        </p>
        <p>
          Sie gelten für alle Personen, die den Dienst nutzen &ndash; für Mitglieder mit einem Konto
          ebenso wie für Gäste, die über einen Einladungslink hereinkommen. Abweichende oder
          ergänzende Bedingungen der Nutzerinnen und Nutzer werden nicht Vertragsbestandteil, es sei
          denn, wir haben ihrer Geltung ausdrücklich in Textform zugestimmt.
        </p>
        <p>
          Wie wir personenbezogene Daten verarbeiten, steht nicht hier, sondern in der{' '}
          <a href="/datenschutz" className="text-accent hover:underline">
            Datenschutzerklärung
          </a>
          . Sie ist nicht Teil dieses Vertrages, sondern eine gesetzliche Information.
        </p>
      </Section>

      <Section heading="§ 2 Was dieser Dienst ist">
        <p>
          Der Dienst stellt gemeinsam genutzte, grafisch dargestellte Räume bereit. Nutzerinnen und
          Nutzer bewegen darin eine Figur, sehen einander in Echtzeit und können miteinander
          schreiben, Gesten austauschen und die angebotenen Aktivitäten nutzen.
        </p>
        <p>
          Der Dienst ist ein Ort für Begegnung und Unterhaltung. Er ist kein
          Telekommunikationsdienst, kein Archiv und kein Speicherort für Daten, auf die Sie sich
          verlassen müssen. Für Inhalte, die Ihnen wichtig sind, bewahren Sie bitte eine eigene
          Kopie auf.
        </p>
        <p>
          Die Nutzung des Dienstes ist in dem hier beschriebenen Umfang unentgeltlich. Entgeltliche
          Leistungen gibt es ausschließlich dort, wo sie ausdrücklich als solche angeboten werden
          (§ 7).
        </p>
      </Section>

      <Section heading="§ 3 Zugang">
        <Sub heading="3.1 Konto">
          <p>
            Ein Konto entsteht, indem Sie das Registrierungsformular absenden und &ndash; sofern wir
            eine Bestätigung verlangen &ndash; den zugesandten Link aufrufen. Mit dem Absenden des
            Formulars kommt der Nutzungsvertrag über den Dienst zwischen Ihnen und uns zustande. Ein
            Anspruch auf Zugang besteht nicht; solange die Registrierung über Einladungen läuft, wird
            ein Konto nur angelegt, wenn eine Einladung für Ihre E-Mail-Adresse vorliegt.
          </p>
          <p>
            {/* &nbsp; rather than a plain space: JSX drops the space between an
                expression and the text after it when that text wraps onto the
                next line, and "16Jahre" is what reaches the page. It is also
                the right character between a number and its unit. */}
            Sie müssen mindestens {MIN_AGE}&nbsp;Jahre alt sein. Die bei der Registrierung
            angegebenen
            Daten müssen zutreffend sein, und eine Änderung Ihrer E-Mail-Adresse sollten Sie im Konto
            nachziehen &ndash; sie ist der Weg, auf dem wir Sie erreichen.
          </p>
          <p>
            Zugangsdaten sind persönlich. Geben Sie Ihr Passwort und die per E-Mail zugesandten
            Anmeldelinks nicht weiter, und teilen Sie uns mit, wenn Sie den Verdacht haben, dass ein
            Dritter Ihr Konto nutzt. Für Handlungen, die über Ihr Konto vorgenommen werden, sind Sie
            verantwortlich, solange Sie den Missbrauch zu vertreten haben.
          </p>
        </Sub>

        <Sub heading="3.2 Gäste ohne Konto">
          <p>
            Räume können auch über einen Einladungslink betreten werden, ohne ein Konto anzulegen.
            Wer einen solchen Link aufruft, einen Namen eingibt und den Raum betritt, nimmt damit
            unser Angebot zur unentgeltlichen Nutzung an; auch dann gelten diese
            Nutzungsbedingungen, insbesondere die Regeln in § 5 und § 6.
          </p>
          <p>
            Ein Gastzugang ist an den jeweiligen Link und Aufenthalt gebunden. Er begründet kein
            Konto, keinen Anspruch auf erneuten Zutritt und keine Speicherung über den Aufenthalt
            hinaus. Wer einen Einladungslink weitergibt, entscheidet damit, wer den Raum betreten
            kann; behandeln Sie den Link entsprechend.
          </p>
          <p>
            Ein Einladungslink lässt sich auch in Telegram öffnen; der Raum läuft dann als Mini App.
            An diesen Nutzungsbedingungen und daran, mit wem Sie den Vertrag schließen, ändert das
            nichts: Der Dienst ist unserer, wir betreiben ihn, und § 5 und § 6 gelten unverändert.
            Telegram ist weder Vertragspartei noch mit uns verbunden; für Ihre Nutzung von Telegram
            gelten neben unseren zusätzlich deren Bedingungen und deren Datenschutzerklärung. Was
            innerhalb der Telegram-App geschieht, können wir weder wiederherstellen noch ändern noch
            verantworten. Fällt dieser Weg weg &ndash; weil Telegram ihn ändert oder einstellt
            &ndash;, bleibt der gewöhnliche Link im Browser der Zugang. Was wir auf diesem Weg
            erhalten und was Telegram dabei erfährt, steht in Ziffer 8 unserer
            Datenschutzerklärung.
          </p>
        </Sub>
      </Section>

      <Section heading="§ 4 Ihre Inhalte">
        <p>
          Alles, was Sie im Dienst erstellen oder übermitteln &ndash; Nachrichten, Namen, Bilder,
          gestaltete Räume und Ähnliches (nachfolgend &bdquo;Inhalte&ldquo;) &ndash; bleibt Ihres.
          Wir erwerben daran kein Eigentum.
        </p>
        <p>
          Damit der Dienst funktionieren kann, räumen Sie uns an Ihren Inhalten ein einfaches,
          räumlich unbeschränktes und unentgeltliches Nutzungsrecht ein, das darauf beschränkt ist,
          die Inhalte im Rahmen des Dienstes zu speichern, technisch zu bearbeiten (etwa
          Formatanpassungen) und den Personen anzuzeigen, für die sie bestimmt sind. Das Recht endet,
          wenn der Inhalt gelöscht wird &ndash; mit Ausnahme von Sicherungskopien, bis diese im
          üblichen Turnus überschrieben sind.
        </p>
        <p>
          Sie sichern zu, dass Sie über die erforderlichen Rechte an den von Ihnen eingestellten
          Inhalten verfügen und dass die Inhalte keine Rechte Dritter verletzen.
        </p>
      </Section>

      <Section heading="§ 5 Regeln für die Nutzung">
        <p>Untersagt ist es insbesondere,</p>
        <Bullets
          items={[
            'rechtswidrige Inhalte zu verbreiten, insbesondere solche, die Straftatbestände erfüllen (z. B. Volksverhetzung, Beleidigung, Bedrohung, Verbreitung kinderpornographischer Inhalte, Verwendung verfassungswidriger Kennzeichen);',
            'andere Personen zu belästigen, zu bedrohen, zu beschimpfen, zu verfolgen oder gezielt aus einem Raum zu vertreiben;',
            'personenbezogene Daten anderer ohne deren Einwilligung offenzulegen;',
            'sich als eine andere Person, als Mitarbeiterin oder Mitarbeiter des Anbieters oder als offizielle Stelle auszugeben;',
            'Werbung, Kettennachrichten oder sonstige unaufgeforderte Massennachrichten zu verbreiten;',
            'Rechte Dritter zu verletzen, insbesondere Urheber-, Marken- und Persönlichkeitsrechte;',
            'den Dienst mit automatisierten Mitteln auszulesen oder zu bedienen, Sicherheitsvorkehrungen zu umgehen, Schadsoftware einzubringen oder die Infrastruktur mutwillig zu überlasten;',
            'gesperrte Zugänge unter neuem Namen oder über einen Gastzugang zu umgehen.',
          ]}
        />
        <p>
          Diese Aufzählung beschreibt die häufigsten Fälle und ist nicht abschließend. Maßstab
          bleibt, dass die Räume für alle Anwesenden benutzbar bleiben.
        </p>
      </Section>

      {/*
        Art. 14 Abs. 1 DSA in prose: what we may restrict, on what basis we
        decide, and that a human decides. The internal complaint-handling system
        of Art. 20 DSA does not apply to a micro or small enterprise (Art. 19
        DSA), so 6.4 is offered as a contractual promise rather than dressed up
        as a statutory procedure - which is also why it names a plain address
        instead of a "Beschwerdesystem".
      */}
      <Section heading="§ 6 Moderation">
        <Sub heading="6.1 Meldung">
          <p>
            Rechtswidrige Inhalte und Verstöße gegen § 5 können jederzeit formlos an{' '}
            {CONTROLLER.email} gemeldet werden. Hilfreich ist eine Angabe dazu, worum es geht, wo im
            Dienst es zu finden war und wann. Wir bestätigen den Eingang und teilen unsere
            Entscheidung mit, sofern uns eine Kontaktmöglichkeit vorliegt.
          </p>
        </Sub>

        <Sub heading="6.2 Maßnahmen">
          <p>
            Bei einem Verstoß gegen diese Nutzungsbedingungen oder gegen geltendes Recht können wir,
            abhängig von Schwere und Wiederholung:
          </p>
          <Bullets
            items={[
              'einen Inhalt entfernen oder seine Sichtbarkeit einschränken,',
              'eine Person aus einem Raum entfernen,',
              'den Zugang zu einzelnen Funktionen vorübergehend einschränken,',
              'ein Konto oder einen Gastzugang vorübergehend oder dauerhaft sperren,',
              'den Nutzungsvertrag außerordentlich kündigen (§ 10).',
            ]}
          />
          <p>
            In der Regel weisen wir zunächst hin oder entfernen den beanstandeten Inhalt. Eine
            Sperre steht am Ende, nicht am Anfang &ndash; außer wenn der Verstoß so schwer wiegt,
            dass ein Zuwarten für die übrigen Anwesenden nicht zumutbar ist.
          </p>
        </Sub>

        <Sub heading="6.3 Wie entschieden wird">
          <p>
            Über Maßnahmen entscheiden Menschen. Es gibt keine automatisierte Inhaltserkennung und
            keine algorithmische Entscheidung darüber, ob ein Inhalt entfernt oder ein Zugang
            gesperrt wird. Technische Vorkehrungen beschränken sich auf Begrenzungen der Anzahl von
            Anfragen und der Länge von Eingaben.
          </p>
        </Sub>

        <Sub heading="6.4 Widerspruch">
          <p>
            Ist von einer Maßnahme jemand betroffen, den wir erreichen können, nennen wir den Grund
            und die betroffenen Inhalte. Gegen die Entscheidung kann innerhalb von sechs Monaten
            formlos an {CONTROLLER.email} widersprochen werden. Wir prüfen den Widerspruch erneut und
            machen die Maßnahme rückgängig, wenn sie unbegründet war. Ihr Recht, gerichtliche Hilfe
            in Anspruch zu nehmen, bleibt davon unberührt.
          </p>
        </Sub>
      </Section>

      <Section heading="§ 7 Entgeltliche Leistungen">
        <p>
          Über den unentgeltlichen Dienst hinaus bieten wir die Ausrichtung von Veranstaltungen in
          eigens eingerichteten Räumen an. Die Darstellung auf unseren Seiten ist kein bindendes
          Angebot, sondern eine Aufforderung, eines einzuholen. Ein Vertrag kommt erst zustande,
          wenn wir Ihnen auf Ihre Anfrage ein Angebot übersenden und Sie es annehmen.
        </p>
        <p>
          Leistungsumfang, Termin, Preis und die umsatzsteuerliche Behandlung ergeben sich aus
          diesem Angebot. Die Vergütung ist, sofern nichts anderes vereinbart ist, innerhalb von 14
          Tagen nach Rechnungsstellung ohne Abzug fällig.
        </p>
        {/*
          The clause a lawyer should look at first.

          A booking arranged entirely by email is a Fernabsatzvertrag, so a
          consumer has the 14-day withdrawal right of § 355 BGB - unless
          § 312g Abs. 2 Nr. 9 BGB applies, which takes out services connected
          with leisure activities where the contract provides a specific date.
          An online party on a fixed evening is a plausible fit and the industry
          treats it as one, but "plausible" is not a basis for withholding a
          consumer right. Until that is settled, this says the right exists and
          the offer says whether the exception applies - which is the safe order
          of the two, because granting a withdrawal right that was not owed
          costs a booking, and denying one that was owed costs the contract.
        */}
        <p>
          Verbraucherinnen und Verbrauchern steht bei einem im Fernabsatz geschlossenen Vertrag ein
          gesetzliches Widerrufsrecht von 14 Tagen zu. Für Leistungen im Zusammenhang mit
          Freizeitbetätigungen, für die ein spezifischer Termin vorgesehen ist, kann das
          Widerrufsrecht nach § 312g Abs. 2 Nr. 9 BGB ausgeschlossen sein. Das Angebot weist aus,
          ob und in welchem Umfang ein Widerrufsrecht besteht, und enthält in diesem Fall eine
          Widerrufsbelehrung.
        </p>
      </Section>

      <Section heading="§ 8 Verfügbarkeit und Weiterentwicklung">
        <p>
          Wir bemühen uns um einen möglichst störungsfreien Betrieb, schulden aber keine bestimmte
          Verfügbarkeit. Unterbrechungen durch Wartung, Störungen bei unseren Dienstleistern oder
          Umstände außerhalb unseres Einflussbereichs sind möglich. Planbare Wartungsarbeiten legen
          wir nach Möglichkeit in Zeiten geringer Nutzung.
        </p>
        <p>
          Der Dienst wird laufend verändert. Funktionen können hinzukommen, sich ändern oder
          entfallen, soweit dies für Sie zumutbar ist &ndash; insbesondere weil die Nutzung
          unentgeltlich ist und Sie den Vertrag jederzeit beenden können (§ 10). Entfällt eine
          Funktion, die für die vereinbarte Nutzung wesentlich ist, weisen wir vorher darauf hin.
        </p>
      </Section>

      {/*
        Deliberately not a Zustimmungsfiktion.

        The clause everybody copies - "silence within six weeks counts as
        consent" - is the one the BGH struck down in XI ZR 26/20 for exactly
        this construction. Announce, and let the person who does not want the
        new terms leave, is both shorter and safe: the contract is free and
        terminable at any moment, so there is nothing to hold anyone to.
      */}
      <Section heading="§ 9 Änderungen dieser Nutzungsbedingungen">
        <p>
          Wir können diese Nutzungsbedingungen ändern, etwa weil sich der Dienst, die Rechtslage
          oder die Rechtsprechung ändert. Die neue Fassung kündigen wir mindestens vier Wochen vor
          dem Wirksamwerden in Textform an &ndash; bei Mitgliedern per E-Mail, im Übrigen durch einen
          deutlichen Hinweis im Dienst &ndash; und machen dabei kenntlich, was sich ändert.
        </p>
        <p>
          Wer die neue Fassung nicht annehmen möchte, kann den Nutzungsvertrag bis zu ihrem
          Wirksamwerden jederzeit beenden. Eine Fortsetzung der Nutzung nach diesem Zeitpunkt gilt
          nicht als Zustimmung zu einer Änderung, die Ihre Rechte und Pflichten wesentlich
          verschiebt; in einem solchen Fall holen wir Ihre ausdrückliche Zustimmung ein.
        </p>
      </Section>

      <Section heading="§ 10 Laufzeit und Beendigung">
        <p>
          Der Nutzungsvertrag läuft auf unbestimmte Zeit. Sie können ihn jederzeit und ohne
          Einhaltung einer Frist beenden, indem Sie Ihr Konto löschen oder uns eine entsprechende
          Nachricht an {CONTROLLER.email} senden. Wir können den Vertrag mit einer Frist von 14 Tagen
          ordentlich kündigen.
        </p>
        <p>
          Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt beiderseits
          unberührt. Ein wichtiger Grund liegt für uns insbesondere bei einem schwerwiegenden oder
          wiederholten Verstoß gegen § 5 vor.
        </p>
        <p>
          Nach Beendigung löschen wir Ihr Konto und die damit verbundenen Inhalte, soweit keine
          gesetzlichen Aufbewahrungspflichten entgegenstehen. Einzelheiten und Fristen stehen in der{' '}
          <a href="/datenschutz" className="text-accent hover:underline">
            Datenschutzerklärung
          </a>
          . Beiträge in gemeinsamen Verläufen können in anonymisierter Form bestehen bleiben, damit
          Gespräche für die übrigen Beteiligten nachvollziehbar bleiben.
        </p>
      </Section>

      {/*
        The standard three tiers, in the order § 307 BGB requires them: no
        limitation for the protected legal interests, none for intent and gross
        negligence, and for simple negligence only where a Kardinalpflicht is
        breached and then capped at the foreseeable damage. Tightening any of
        these is how a liability clause becomes void in its entirety - at which
        point the statutory rules apply unmodified, which is worse than this.
      */}
      <Section heading="§ 11 Haftung">
        <p>
          Für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach dem
          Produkthaftungsgesetz haften wir unbeschränkt. Ebenso haften wir unbeschränkt für Vorsatz
          und grobe Fahrlässigkeit sowie für das Fehlen einer zugesicherten Eigenschaft.
        </p>
        <p>
          Bei einfacher Fahrlässigkeit haften wir nur für die Verletzung einer Pflicht, deren
          Erfüllung die ordnungsgemäße Durchführung des Vertrages überhaupt erst ermöglicht und auf
          deren Einhaltung Sie regelmäßig vertrauen dürfen (wesentliche Vertragspflicht), und der
          Höhe nach begrenzt auf den bei Vertragsschluss vorhersehbaren, vertragstypischen Schaden.
          Im Übrigen ist die Haftung ausgeschlossen.
        </p>
        <p>
          Für Inhalte, die Nutzerinnen und Nutzer einstellen, haften wir nicht; wir machen sie uns
          nicht zu eigen. Unsere Verantwortlichkeit nach §§ 7 ff. DDG und Art. 6 DSA bleibt
          unberührt: Ab Kenntnis einer konkreten Rechtsverletzung werden wir den betreffenden Inhalt
          unverzüglich entfernen.
        </p>
      </Section>

      <Section heading="§ 12 Freistellung">
        <p>
          Nimmt ein Dritter uns wegen eines Inhalts oder einer Handlung in Anspruch, die Sie zu
          vertreten haben, stellen Sie uns von diesen Ansprüchen sowie von den Kosten einer
          angemessenen Rechtsverteidigung frei. Das gilt nicht, soweit Sie die Rechtsverletzung
          nicht zu vertreten haben. Wir werden Sie über eine solche Inanspruchnahme unverzüglich
          informieren und Ihnen Gelegenheit zur Stellungnahme geben.
        </p>
      </Section>

      <Section heading="§ 13 Schlussbestimmungen">
        <p>
          Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Haben
          Sie als Verbraucherin oder Verbraucher Ihren gewöhnlichen Aufenthalt in einem anderen
          Staat, bleiben die zwingenden Verbraucherschutzvorschriften dieses Staates unberührt.
        </p>
        <p>
          Sind Sie Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches
          Sondervermögen, ist Gerichtsstand für alle Streitigkeiten aus diesem Vertrag unser
          Geschäftssitz.
        </p>
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).
        </p>
      </Section>
    </LegalShell>
  )
}
