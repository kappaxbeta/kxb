import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * Stripe, from zero to the first real payment.
 *
 * English only so far. A German version is worth writing - the activation
 * questions are asked in German for a German account - but the dashboard
 * itself is the same product everywhere, so English is not wrong here the way
 * it would be for a form the Finanzamt prints.
 */
export const STRIPE: Text<Guide> = {
  en: {
    title: 'Setting up Stripe',
    standfirst:
      'What Stripe actually asks for at activation, the order that avoids doing anything twice, and the tax settings that are easy to skip and expensive to skip.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'before',
        heading: 'Before you open the dashboard',
        body: [
          'Stripe activation is a know-your-customer check. It goes through in a day when you have the paperwork in hand and stalls for weeks when you improvise, so the fast path is to finish the business registration first and only then start here.',
          'You will be asked for: what your business legally is and its registered address; your VAT ID if you have one; a bank account in the name of the business (for a sole trader, your own name - that is the same name); a website that says what you sell; and the identity document of whoever owns or represents the business.',
          'The website matters more than people expect. Stripe reviews it, and so does the card network behind it. It needs to say what you sell and at what price, name the legal entity, and link to terms, a privacy notice and a refund policy. A landing page with a waiting list and no imprint fails this review.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        steps: [
          {
            title: 'Create the account and answer the activation questions',
            where: 'dashboard.stripe.com',
            takes: 'Half an hour of forms, then usually a day of review',
            body: [
              'Answer as the business, not as yourself - except as a sole trader, where you are the business and pick "individual / sole trader" rather than "company". Choosing "company" as a sole trader is the classic stall: Stripe then asks for a register extract that does not exist.',
              'The bank account you add is where payouts land. It does not have to be at a German bank, but the account holder name must match the business.',
            ],
            watch:
              'The activation form asks for a business description. Write what you actually sell, in plain words. Vague descriptions ("various digital services") get routed to manual review.',
          },
          {
            title: 'Decide how you charge before you build anything',
            body: [
              'Stripe is several products wearing one logo, and picking the wrong one costs a rebuild. Payment Links need no code at all - a URL per product, fine for a launch. Checkout is a Stripe-hosted payment page your site redirects to, and is the right default for almost everyone: it handles SCA, wallets, and tax display. Elements embeds the form in your own page and makes you responsible for everything Checkout was doing for you. Billing adds subscriptions, invoices, dunning and the customer portal on top of either.',
              'For a subscription product: Products and Prices in the dashboard, Checkout in subscription mode, plus the customer portal so people can cancel themselves. A cancellation flow you have to hand-build is a support queue.',
            ],
          },
          {
            title: 'Turn on Stripe Tax',
            takes: 'Ten minutes, and it is the ten minutes people skip',
            body: [
              'Stripe Tax computes the VAT per sale - which, for digital products sold to consumers across the EU, is the customer country’s rate once you are past the €10,000 threshold described in the country guides. It charges a small fee per transaction and replaces a spreadsheet you do not want to own.',
              'It computes and collects, but it does not register you anywhere and it does not file. The One-Stop-Shop registration and the quarterly return stay yours; Stripe Tax gives you the report to file from.',
              'Set your tax registration status in the dashboard first - including, for a German Kleinunternehmer, the fact that you charge no VAT at all. Stripe cannot know that unless told.',
            ],
          },
          {
            title: 'Webhooks, receipts and the customer-facing details',
            body: [
              'If anything in your product switches on when somebody pays, it must be switched on by a webhook - checkout.session.completed and the subscription lifecycle events - never by the browser landing back on your success page. The redirect is lost whenever a tab closes early, and payment without product is the worst bug a paid product can have.',
              'Fill in the public details: statement descriptor (what appears on the card statement - an unrecognised one is a chargeback), support email, and receipts switched on. Test the whole path in test mode with the documented test cards, including a failed payment and a 3D-Secure challenge, before flipping live.',
            ],
            watch:
              'Verify webhook signatures and handle retries idempotently - Stripe re-sends until you answer 200, and a handler that grants a month of access per delivery grants three months on a flaky day.',
          },
          {
            title: 'Payouts and the money side',
            body: [
              'Payouts run on a rolling schedule with a delay of a few days for a new account, shortening as the account ages. Money in Stripe is not money in the bank; do not spend it twice.',
              'For bookkeeping, the number that matters is that Stripe pays out net of its fees. Book the gross sale and the fee separately - your accountant will ask, and the year-end Stripe report has both.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Activating before the website has an imprint, terms and a refund policy. The review fails and you start over.',
          'Choosing "company" as a sole trader and being asked for a commercial register extract that does not exist.',
          'Granting access on the success-page redirect instead of the webhook.',
          'Pasting the publishable key (pk_live_...) where the webhook signing secret (whsec_...) belongs. Every delivery then fails signature verification, Stripe mails you that the endpoint is broken, and nothing anyone paid for switches on. The two live on different dashboard pages and both look like credentials; the signing secret is per-endpoint, under Developers → Webhooks.',
          'Skipping Stripe Tax settings as a Kleinunternehmer, and charging 19% VAT you then owe to nobody and must refund.',
          'Forgetting that Stripe Tax reports but does not register or file. The OSS registration is still your job.',
          'A statement descriptor that does not match your brand. Customers who do not recognise the charge dispute it, and disputes cost a fee win or lose.',
          'Building on Elements because it looks more professional, and inheriting SCA, wallet support and tax display that Checkout had already solved.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Stripe Docs - Checkout', href: 'https://docs.stripe.com/payments/checkout', note: 'The default integration.' },
          { label: 'Stripe Docs - Tax', href: 'https://docs.stripe.com/tax', note: 'What it does and does not do.' },
          { label: 'Stripe Docs - Webhooks', href: 'https://docs.stripe.com/webhooks', note: 'Signatures, retries, event types.' },
          { label: 'Your country guide on this site', href: '/community', note: 'The VAT decision that Stripe Tax has to be told about.' },
        ],
      },
    ],
  },
  de: {
    title: 'Stripe einrichten',
    standfirst:
      'Was Stripe bei der Aktivierung wirklich sehen will, die Reihenfolge, die Doppelarbeit vermeidet, und die Steuereinstellungen, die man leicht überspringt und teuer nachholt.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'before',
        heading: 'Bevor du das Dashboard öffnest',
        body: [
          'Die Stripe-Aktivierung ist eine Know-your-customer-Prüfung. Sie geht in einem Tag durch, wenn die Unterlagen bereitliegen, und hängt wochenlang, wenn improvisiert wird - der schnelle Weg ist also: erst die Gewerbeanmeldung fertig machen, dann hier anfangen.',
          'Gefragt wird nach: was dein Unternehmen rechtlich ist und seiner Anschrift; deiner USt-IdNr., falls vorhanden; einem Bankkonto auf den Namen des Unternehmens (als Einzelunternehmer: dein eigener Name - das ist derselbe Name); einer Website, die sagt, was du verkaufst; und dem Ausweis der Person, die das Unternehmen besitzt oder vertritt.',
          'Die Website zählt mehr, als man erwartet. Stripe prüft sie, und das Kartennetzwerk dahinter auch. Sie muss sagen, was du zu welchem Preis verkaufst, die juristische Person nennen, und auf AGB, Datenschutzerklärung und Erstattungsregeln verlinken. Eine Landingpage mit Warteliste und ohne Impressum fällt durch.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Der Ablauf',
        steps: [
          {
            title: 'Konto anlegen und die Aktivierungsfragen beantworten',
            where: 'dashboard.stripe.com',
            takes: 'Eine halbe Stunde Formulare, dann meist ein Tag Prüfung',
            body: [
              'Antworte als das Unternehmen, nicht als du selbst - außer als Einzelunternehmer, wo du das Unternehmen bist und „Einzelunternehmer" wählst statt „Kapitalgesellschaft". „Company" als Einzelunternehmer anzuklicken ist der klassische Hänger: Stripe verlangt dann einen Registerauszug, den es nicht gibt.',
              'Das hinterlegte Bankkonto ist das Auszahlungskonto. Es muss nicht bei einer deutschen Bank liegen, aber der Kontoinhaber muss zum Unternehmen passen.',
            ],
            watch:
              'Das Aktivierungsformular fragt nach einer Geschäftsbeschreibung. Schreib in einfachen Worten, was du wirklich verkaufst. Vage Beschreibungen („diverse digitale Dienstleistungen") landen in der manuellen Prüfung.',
          },
          {
            title: 'Entscheide, wie du abrechnest, bevor du etwas baust',
            body: [
              'Stripe ist mehrere Produkte unter einem Logo, und das falsche zu wählen kostet einen Umbau. Payment Links brauchen gar keinen Code - eine URL pro Produkt, gut für einen Launch. Checkout ist eine von Stripe gehostete Bezahlseite, zu der deine Seite weiterleitet - der richtige Default für fast alle: SCA, Wallets und Steueranzeige sind erledigt. Elements bettet das Formular in deine eigene Seite ein und macht dich für alles verantwortlich, was Checkout dir abgenommen hätte. Billing legt Abos, Rechnungen, Mahnwesen und das Kundenportal auf beides obendrauf.',
              'Für ein Abo-Produkt: Products und Prices im Dashboard, Checkout im Subscription-Modus, dazu das Kundenportal, damit Leute selbst kündigen können. Ein handgebauter Kündigungsprozess ist eine Support-Warteschlange.',
            ],
          },
          {
            title: 'Stripe Tax einschalten',
            takes: 'Zehn Minuten - und zwar die zehn Minuten, die alle überspringen',
            body: [
              'Stripe Tax berechnet die Umsatzsteuer pro Verkauf - für digitale Produkte an Verbraucher in der EU ab der 10.000-Euro-Schwelle aus den Länderguides zum Satz des Kundenlands. Es kostet eine kleine Gebühr pro Transaktion und ersetzt eine Tabelle, die du nicht pflegen willst.',
              'Es berechnet und zieht ein, aber es registriert dich nirgends und meldet nichts an. Die One-Stop-Shop-Registrierung und die Quartalsmeldung bleiben deine; Stripe Tax liefert den Report, aus dem du meldest.',
              'Stell zuerst deinen Registrierungsstatus im Dashboard ein - als deutscher Kleinunternehmer auch die Tatsache, dass du gar keine Umsatzsteuer berechnest. Von allein weiß Stripe das nicht.',
            ],
          },
          {
            title: 'Webhooks, Belege und die Kundenseite',
            body: [
              'Wenn in deinem Produkt irgendetwas angeht, weil jemand bezahlt hat, muss es ein Webhook anschalten - checkout.session.completed und die Abo-Lifecycle-Events - niemals der Browser, der auf deiner Erfolgsseite landet. Der Redirect geht verloren, sobald ein Tab zu früh schließt, und Zahlung ohne Produkt ist der schlimmste Fehler, den ein bezahltes Produkt haben kann.',
              'Füll die öffentlichen Angaben aus: Statement Descriptor (was auf dem Kontoauszug steht - ein unbekannter ist eine Rückbuchung), Support-Adresse, Belege an. Teste den ganzen Weg im Testmodus mit den dokumentierten Testkarten, inklusive fehlgeschlagener Zahlung und 3D-Secure, bevor du live schaltest.',
            ],
            watch:
              'Prüfe Webhook-Signaturen und verarbeite Wiederholungen idempotent - Stripe sendet erneut, bis du 200 antwortest, und ein Handler, der pro Zustellung einen Monat Zugang gewährt, gewährt an einem wackligen Tag drei.',
          },
          {
            title: 'Auszahlungen und die Geldseite',
            body: [
              'Auszahlungen laufen rollierend, bei neuen Konten mit ein paar Tagen Verzögerung, die mit dem Kontoalter schrumpft. Geld bei Stripe ist kein Geld auf der Bank; gib es nicht doppelt aus.',
              'Für die Buchhaltung zählt: Stripe zahlt netto nach Gebühren aus. Buche Bruttoumsatz und Gebühr getrennt - die Steuerberatung wird fragen, und der Jahresreport von Stripe hat beides.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          'Aktivieren, bevor die Website Impressum, AGB und Erstattungsregeln hat. Die Prüfung scheitert, und du fängst von vorn an.',
          'Als Einzelunternehmer „Company" wählen und nach einem Handelsregisterauszug gefragt werden, den es nicht gibt.',
          'Zugang über den Erfolgsseiten-Redirect freischalten statt über den Webhook.',
          'Den Publishable Key (pk_live_...) dort eintragen, wo das Webhook-Signing-Secret (whsec_...) hingehört. Jede Zustellung scheitert dann an der Signaturprüfung, Stripe mailt dir, dass der Endpoint kaputt ist, und nichts, wofür jemand bezahlt hat, schaltet sich frei. Beide sehen aus wie Zugangsdaten und stehen auf verschiedenen Dashboard-Seiten; das Signing-Secret ist pro Endpoint, unter Developers → Webhooks.',
          'Als Kleinunternehmer die Stripe-Tax-Einstellungen überspringen und 19 % berechnen, die du niemandem schuldest und erstatten musst.',
          'Vergessen, dass Stripe Tax berichtet, aber weder registriert noch meldet. Die OSS-Anmeldung bleibt dein Job.',
          'Ein Statement Descriptor, der nicht zur Marke passt. Wer die Abbuchung nicht erkennt, widerspricht - und ein Dispute kostet Gebühr, egal wie er ausgeht.',
          'Auf Elements bauen, weil es professioneller aussieht, und SCA, Wallets und Steueranzeige erben, die Checkout schon gelöst hatte.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo du das selbst nachliest',
        sources: [
          { label: 'Stripe Docs - Checkout', href: 'https://docs.stripe.com/payments/checkout', note: 'Die Standard-Integration.' },
          { label: 'Stripe Docs - Tax', href: 'https://docs.stripe.com/tax', note: 'Was es tut und was nicht.' },
          { label: 'Stripe Docs - Webhooks', href: 'https://docs.stripe.com/webhooks', note: 'Signaturen, Wiederholungen, Event-Typen.' },
          { label: 'Dein Länderguide auf dieser Seite', href: '/community', note: 'Die Umsatzsteuer-Entscheidung, die Stripe Tax gesagt bekommen muss.' },
        ],
      },
    ],
  },
}
