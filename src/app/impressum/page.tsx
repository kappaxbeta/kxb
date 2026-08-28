import { CONTROLLER, LegalShell, Section } from '@/app/legal/shell'

export const metadata = {
  title: 'Impressum',
  alternates: {
    canonical: '/impressum',
    languages: { de: '/impressum', en: '/impressum/en' },
  },
}

/**
 * Two things in here were out of date and are worth naming, so they are not
 * "corrected" back by the next person working from an old template:
 *
 * § 5 TMG -> § 5 DDG. The Telemediengesetz was replaced by the
 * Digitale-Dienste-Gesetz in May 2024; the duty is the same, the citation is
 * not.
 *
 * The link to the EU Online Dispute Resolution platform is gone. That platform
 * ceased operating in July 2025, and pointing consumers at a dead service is
 * worse than saying nothing. What remains is the § 36 VSBG declaration, which
 * is the part still required.
 *
 * The details themselves are placeholders and live in `legal/shell.ts` - see
 * the warning on CONTROLLER.
 */
export default function ImpressumPage() {
  return (
    <LegalShell locale="de" title="Impressum" altHref="/impressum/en">
      <Section heading="Angaben gemäß § 5 DDG">
        <p>
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
          <br />
          {CONTROLLER.country}
        </p>
      </Section>

      <Section heading="Kontakt">
        <p>
          E-Mail: {CONTROLLER.email}
          {CONTROLLER.phone ? (
            <>
              <br />
              Telefon: {CONTROLLER.phone}
            </>
          ) : null}
        </p>
      </Section>

      {/* Rendered only when there is a real USt-IdNr. A Kleinunternehmer under
          § 19 UStG has none, and an empty or invented section is worse than no
          section. See the note on CONTROLLER. */}
      {CONTROLLER.vatId ? (
        <Section heading="Umsatzsteuer-ID">
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:
            <br />
            {CONTROLLER.vatId}
          </p>
        </Section>
      ) : null}

      <Section heading="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
        </p>
      </Section>

      <Section heading="Streitschlichtung">
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).
        </p>
      </Section>

      <Section heading="Haftung für Links">
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
          Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
          Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
          Seiten verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links
          umgehend entfernen.
        </p>
      </Section>

      <Section heading="Nutzergenerierte Inhalte">
        <p>
          Nutzerinnen und Nutzer können in diesem Dienst eigene Inhalte erstellen und mit anderen
          teilen. Für diese Inhalte ist die jeweils einstellende Person verantwortlich. Wir machen
          uns fremde Inhalte nicht zu eigen. Sollten Ihnen rechtswidrige Inhalte auffallen, teilen
          Sie uns dies bitte unter {CONTROLLER.email} mit; wir werden sie unverzüglich prüfen und
          gegebenenfalls entfernen.
        </p>
      </Section>
    </LegalShell>
  )
}
