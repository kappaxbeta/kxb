import Link from 'next/link'
import { landingHref, type PublicLocale } from '@/app/i18n/locales'

/**
 * The frame the four legal pages share, and nothing else.
 *
 * The prose itself is written per language rather than pulled from a
 * dictionary, which is the opposite of how the landing page is done and
 * deliberately so. Marketing copy is the same claim in two languages and wants
 * to be checked key-by-key; a privacy notice is a legal document whose German
 * version is the binding one, and templating the two together invites a
 * translation to quietly change what was promised. What is shared here is the
 * chrome - the back link, the heading, the language switch - because that part
 * genuinely is the same page twice.
 *
 * Deutsch is the original of both documents. The Impressum is a German legal
 * obligation under § 5 DDG and the Datenschutzerklärung is written against the
 * DSGVO, so the German text lives at the bare path and is the version that
 * counts. English sits at `/…/en` and says so at the top.
 */

/**
 * Two languages and no more. These are documents written under German law and
 * their English side is a courtesy translation of the same text - a third
 * language would be a third legal document, not a third dictionary entry, so
 * the table is keyed by `PublicLocale` rather than `Locale`.
 */
const LABELS = {
  de: { back: '← Zurück zur Startseite', other: 'English', otherLocale: 'en' as PublicLocale },
  en: { back: '← Back to the home page', other: 'Deutsch', otherLocale: 'de' as PublicLocale },
} as const satisfies Record<PublicLocale, { back: string; other: string; otherLocale: PublicLocale }>

export function LegalShell({
  locale,
  title,
  /** Where the other language of *this* document lives. */
  altHref,
  /** Shown under the heading on the English pages only. */
  notice,
  children,
}: {
  locale: PublicLocale
  title: string
  altHref: string
  notice?: string
  children: React.ReactNode
}) {
  const labels = LABELS[locale]
  return (
    <div lang={locale} className="mx-auto min-h-screen max-w-3xl p-8 text-ink">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* Back to the landing page in the language being read, so the German
            Impressum does not hand somebody the English front page. */}
        <Link href={landingHref(locale)} className="text-accent hover:underline">
          {labels.back}
        </Link>
        <Link
          href={altHref}
          hrefLang={labels.otherLocale}
          lang={labels.otherLocale}
          className="text-sm text-ink-muted transition hover:text-ink"
        >
          {labels.other}
        </Link>
      </div>

      <h1 className="mb-2 text-4xl font-bold">{title}</h1>
      {notice ? (
        <p className="mb-8 rounded-lg border border-line bg-surface-raised p-4 text-sm text-ink-muted">
          {notice}
        </p>
      ) : (
        <div className="mb-8" />
      )}

      <div className="space-y-8 leading-relaxed text-ink-muted">{children}</div>
    </div>
  )
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-2xl font-semibold text-ink">{heading}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Sub({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xl font-medium text-ink">{heading}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Bullets({ items }: { items: readonly React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        // Legal copy, fixed at author time: the list never reorders, so the
        // index is a stable key rather than the usual mistake.
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/**
 * The controller's details, in one place for all four legal pages.
 *
 * A sole trader (Einzelunternehmen), which is why there is no "vertreten durch"
 * and no Registereintrag: both describe a legal entity that has an officer or a
 * register entry, and printing either for a natural person states something
 * untrue. The name and the address are the § 5 DDG disclosure and are supposed
 * to be public.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT here
 * ---------------------------------------------------------------------------
 * The Steuernummer (19/105/20435) and the persönliche Steuer-Identifikations-
 * nummer (56640321891) are not on this page and should not be put on it.
 * Neither is required by § 5 DDG. What that provision asks for is the
 * Umsatzsteuer-Identifikationsnummer - the DE + 9 digits one - and only if the
 * operator actually has one. The other two identify a person to the tax office
 * and publishing them invites fraud without discharging any duty.
 *
 * `vatId` is therefore null until a real USt-IdNr exists; the section renders
 * only when it is set. If the business is a Kleinunternehmer under § 19 UStG it
 * may never have one, and no section is the correct output.
 */
/**
 * PLACEHOLDERS. Replace every field before you put this online.
 *
 * These are the details § 5 DDG makes you publish, and shipping a site
 * that names somebody else - or nobody - is worse than shipping no imprint
 * at all. If you are not established in the EU, delete src/app/impressum,
 * src/app/datenschutz and src/app/agb instead, and drop the links to them
 * from src/app/components/marketing-shell.tsx.
 */
export const CONTROLLER = {
  name: 'YOUR NAME OR COMPANY',
  street: 'YOUR STREET ADDRESS',
  city: 'YOUR POSTCODE AND CITY',
  country: 'YOUR COUNTRY',
  /** § 5 DDG requires an address for fast electronic contact. */
  email: 'you@example.com',
  /** Optional under § 5 DDG. Remove the line entirely rather than faking one. */
  phone: null as string | null,
  /** The DE + 9 digits VAT number, or null when there is none. */
  vatId: null as string | null,
} as const

/**
 * The supervisory authority for your controller, which depends on where it is established.
 *
 * Niedersachsen, so it is the LfD in Hannover. Named rather than left as
 * "the competent authority", because Art. 77 is a right somebody has to be able
 * to exercise, and a policy that makes them look the address up first is
 * technically compliant and practically useless.
 */
export const SUPERVISORY_AUTHORITY = {
  name: 'Die Landesbeauftragte für den Datenschutz Niedersachsen',
  street: 'Prinzenstraße 5',
  city: '30159 Hannover',
  web: 'https://www.lfd.niedersachsen.de',
} as const

export function ControllerBlock() {
  return (
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
      {CONTROLLER.phone ? (
        <>
          <br />
          {CONTROLLER.phone}
        </>
      ) : null}
    </p>
  )
}
