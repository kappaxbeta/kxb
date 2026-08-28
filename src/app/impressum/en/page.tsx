import { CONTROLLER, LegalShell, Section } from '@/app/legal/shell'

export const metadata = {
  title: 'Imprint',
  alternates: {
    canonical: '/impressum/en',
    languages: { de: '/impressum', en: '/impressum/en' },
  },
  // The Impressum that satisfies § 5 DDG is the German one. This is a reading
  // aid, and it should not be the version a search engine surfaces instead.
  robots: { index: false, follow: true },
}

/**
 * The Impressum, in English, and clearly marked as not being the document.
 *
 * An Impressum is a German legal obligation and is discharged by the German
 * page. This one exists for the same reason the English privacy notice does -
 * most of the audience does not read German - and it is careful to say that
 * the German version is the one that counts, so it cannot be read as an
 * attempt to satisfy § 5 DDG in the wrong language.
 */
export default function ImprintPage() {
  return (
    <LegalShell
      locale="en"
      title="Imprint"
      altHref="/impressum"
      notice="This is a courtesy translation of the legally required German Impressum. The German version at /impressum is the binding one; in case of any discrepancy, the German text prevails."
    >
      <Section heading="Information pursuant to § 5 DDG">
        <p>
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
          <br />
          Germany
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Email: {CONTROLLER.email}
          {CONTROLLER.phone ? (
            <>
              <br />
              Telephone: {CONTROLLER.phone}
            </>
          ) : null}
        </p>
      </Section>

      {/* Only when there is a real VAT number - see the German page. */}
      {CONTROLLER.vatId ? (
        <Section heading="VAT identification number">
          <p>
            VAT identification number pursuant to § 27 a of the German VAT Act:
            <br />
            {CONTROLLER.vatId}
          </p>
        </Section>
      ) : null}

      <Section heading="Responsible for the content pursuant to § 18(2) MStV">
        <p>
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
        </p>
      </Section>

      <Section heading="Consumer dispute resolution">
        <p>
          We are neither willing nor obliged to take part in dispute resolution proceedings before a
          consumer arbitration body (§ 36 VSBG).
        </p>
      </Section>

      <Section heading="Liability for links">
        <p>
          Our service contains links to external websites operated by third parties, over whose
          content we have no influence. We therefore cannot accept any liability for that external
          content. The respective provider or operator of the linked pages is always responsible for
          their content. We will remove such links promptly if we become aware of any legal
          infringement.
        </p>
      </Section>

      <Section heading="User-generated content">
        <p>
          Users of this service can create their own content and share it with others. The person
          posting such content is responsible for it. We do not adopt third-party content as our own.
          If you come across unlawful content, please tell us at {CONTROLLER.email}; we will review
          it without delay and remove it where appropriate.
        </p>
      </Section>
    </LegalShell>
  )
}
