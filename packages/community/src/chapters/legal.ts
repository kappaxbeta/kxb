import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * The legal shell a commercial website wears: imprint, privacy, terms, refunds.
 *
 * Written from the German/EU end because that is where the obligations are
 * strictest - a site that satisfies § 5 DDG and the DSGVO is dressed for
 * almost anywhere. The country guides carry what is national; this chapter is
 * what every one of them points at.
 */
export const LEGAL: Text<Guide> = {
  en: {
    title: 'The legal shell of a website',
    standfirst:
      'The four documents a commercial site needs before it takes money - or runs ads - and what belongs in each. Germany-strict, which means safe almost everywhere.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'why',
        heading: 'Why this is not optional in Germany',
        body: [
          'Germany enforces website law in a way most countries do not: through competitors. A missing imprint or a defective cancellation notice can be served with an Abmahnung - a formal cease-and-desist from a competitor’s lawyer with a bill attached - without any authority being involved. The documents below are cheap to get right and four-figure expensive to get wrong.',
          'The moment this applies is the moment the site becomes commercial - which is the first ad, the first price, the first waiting list for a paid thing. Not the first sale.',
        ],
      },
      {
        kind: 'steps',
        id: 'docs',
        heading: 'The four documents',
        steps: [
          {
            title: 'Impressum (imprint)',
            body: [
              'Required by § 5 DDG on every commercial site reachable from Germany - the paragraph moved from the TMG to the DDG in May 2024, so a template citing § 5 TMG is announcing its own age.',
              'It must name the legal person: full name (for a sole trader, your real first and last name - a brand alone is not enough), a street address where papers can be served (no PO box), an email address, and if you have them the VAT ID and the commercial register entry. It must be reachable from every page in two clicks, under a link a reader would recognise.',
            ],
            watch:
              'Your home address becoming public is the real cost of a home-registered business. If that is unacceptable, solutions exist (an office address you can legally be served at) - but a mailbox service that will not accept court papers does not count.',
          },
          {
            title: 'Datenschutzerklärung (privacy notice)',
            body: [
              'Required by the GDPR the moment you process anybody’s data, which a signup form, an analytics script or a server log already is. It lists what is collected, on what legal basis, for how long, and who else sees it - which means every third-party service in the chain: hosting, analytics, payment, email.',
              'It has to reflect what the site actually does, and it has to be updated when the stack changes. Adding Stripe adds a paragraph. A copied notice describing tools you do not run is its own violation.',
              'Consent banners: only needed for what actually needs consent (tracking cookies, third-party embeds). A site that sets no tracking cookies needs no banner, and adding one anyway is pure friction.',
            ],
          },
          {
            title: 'AGB (terms of service)',
            body: [
              'Not legally mandatory - the default rules of contract law apply without them - but in practice the place where you set the things you care about: what exactly is being bought, when access starts and ends, what happens on non-payment, which law applies.',
              'For consumers, terms are only binding if presented before purchase and only where they do not undercut consumer protection law, which cannot be contracted away. Terms translated from a US template ("as is, no warranty, arbitration in Delaware") are partly void in the EU and read as such.',
            ],
          },
          {
            title: 'Widerrufsbelehrung (cancellation policy) and refunds',
            body: [
              'EU consumers have a 14-day right of withdrawal on online purchases. For digital products and subscriptions there is a well-worn exception: the right lapses when the consumer expressly agrees to immediate delivery and acknowledges losing the withdrawal right - which is why every checkout for digital goods carries exactly that checkbox. Without it, the withdrawal window runs and the customer can reclaim payment after a month of use.',
              'The policy must state the mechanics: how to withdraw, the model form the law prescribes, and what is refunded when. A defective cancellation notice extends the window to a year and is a favourite Abmahnung target.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Citing § 5 TMG. The law is § 5 DDG since May 2024, and the old citation flags the whole document as unmaintained.',
          'An imprint naming a brand but no natural or legal person.',
          'A privacy notice copied from a site with a different stack.',
          'US-template terms with warranty disclaimers and arbitration clauses that are void against EU consumers.',
          'Selling digital goods without the immediate-delivery checkbox, leaving the 14-day withdrawal right alive.',
          'Running ads or a paid waiting list on a page that has none of these yet - commercial starts before the first sale.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'DDG - § 5', href: 'https://www.gesetze-im-internet.de/ddg/__5.html', note: 'The imprint obligation, at its current home.' },
          { label: 'GDPR, official text', href: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', note: 'Articles 12-14 are the notice; 6 is the legal bases.' },
          { label: 'BGB § 312g and Art. 246a EGBGB', href: 'https://www.gesetze-im-internet.de/bgb/__312g.html', note: 'Withdrawal right and its digital-content exception.' },
        ],
      },
    ],
  },
  de: {
    title: 'Das rechtliche Grundgerüst einer Website',
    standfirst:
      'Die vier Dokumente, die eine kommerzielle Seite braucht, bevor Geld fließt - oder Werbung läuft - und was in jedes gehört. Nach deutschem Maßstab, also fast überall auf der sicheren Seite.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'why',
        heading: 'Warum das in Deutschland nicht optional ist',
        body: [
          'Deutschland setzt Website-Recht auf eine Art durch, die es in den meisten Ländern nicht gibt: über Wettbewerber. Ein fehlendes Impressum oder eine fehlerhafte Widerrufsbelehrung kann per Abmahnung kommen - ein förmliches Schreiben vom Anwalt eines Konkurrenten mit Rechnung dran, ganz ohne Behörde. Die Dokumente unten sind billig richtig zu machen und vierstellig teuer falsch.',
          'Der Moment, ab dem das gilt, ist der Moment, in dem die Seite kommerziell wird - also die erste Anzeige, der erste Preis, die erste Warteliste für etwas Bezahltes. Nicht der erste Verkauf.',
        ],
      },
      {
        kind: 'steps',
        id: 'docs',
        heading: 'Die vier Dokumente',
        steps: [
          {
            title: 'Impressum',
            body: [
              'Pflicht nach § 5 DDG auf jeder geschäftlichen Seite, die von Deutschland aus erreichbar ist - der Paragraf ist im Mai 2024 vom TMG ins DDG umgezogen, eine Vorlage mit „§ 5 TMG" verrät also ihr Alter selbst.',
              'Es muss die Person nennen: vollständiger Name (als Einzelunternehmer dein echter Vor- und Nachname - eine Marke allein reicht nicht), eine ladungsfähige Anschrift (kein Postfach), eine E-Mail-Adresse, und falls vorhanden USt-IdNr. und Handelsregistereintrag. Erreichbar von jeder Seite in zwei Klicks, unter einem Link, den man als solchen erkennt.',
            ],
            watch:
              'Dass deine Wohnadresse öffentlich wird, ist der wahre Preis eines Home-Office-Gewerbes. Wenn das nicht geht, gibt es Lösungen (eine Büroadresse, an der du ladungsfähig bist) - ein Briefkastenservice, der keine Gerichtspost annimmt, zählt nicht.',
          },
          {
            title: 'Datenschutzerklärung',
            body: [
              'Pflicht nach DSGVO, sobald du Daten verarbeitest - und ein Anmeldeformular, ein Analytics-Skript oder ein Server-Log ist das schon. Sie listet, was erhoben wird, auf welcher Rechtsgrundlage, wie lange, und wer es noch sieht - also jeden Drittdienst in der Kette: Hosting, Analytics, Zahlung, E-Mail.',
              'Sie muss beschreiben, was die Seite wirklich tut, und mitwachsen, wenn sich der Stack ändert. Stripe einbauen heißt einen Absatz ergänzen. Eine kopierte Erklärung über Tools, die du nicht einsetzt, ist ihr eigener Verstoß.',
              'Consent-Banner: nur nötig für das, was wirklich Einwilligung braucht (Tracking-Cookies, Dritt-Embeds). Eine Seite ohne Tracking-Cookies braucht kein Banner, und eines trotzdem einzubauen ist reine Reibung.',
            ],
          },
          {
            title: 'AGB',
            body: [
              'Nicht gesetzlich vorgeschrieben - ohne sie gilt schlicht das Gesetz - aber praktisch der Ort, an dem du regelst, was dir wichtig ist: was genau gekauft wird, wann Zugang beginnt und endet, was bei Nichtzahlung passiert, welches Recht gilt.',
              'Gegenüber Verbrauchern binden AGB nur, wenn sie vor dem Kauf einbezogen werden, und nur, soweit sie das Verbraucherschutzrecht nicht unterlaufen - das lässt sich nicht wegvereinbaren. Aus US-Vorlagen übersetzte Klauseln („as is, keine Gewährleistung, Schiedsgericht in Delaware") sind in der EU teilweise nichtig und lesen sich auch so.',
            ],
          },
          {
            title: 'Widerrufsbelehrung und Erstattungen',
            body: [
              'EU-Verbraucher haben bei Online-Käufen ein 14-tägiges Widerrufsrecht. Für digitale Produkte und Abos gibt es die eingespielte Ausnahme: Das Recht erlischt, wenn der Verbraucher der sofortigen Bereitstellung ausdrücklich zustimmt und den Verlust des Widerrufsrechts bestätigt - deshalb trägt jeder Checkout für digitale Güter genau diese Checkbox. Ohne sie läuft die Frist, und der Kunde kann nach einem Monat Nutzung das Geld zurückverlangen.',
              'Die Belehrung muss die Mechanik nennen: wie widerrufen wird, das gesetzliche Muster-Widerrufsformular, und was wann erstattet wird. Eine fehlerhafte Belehrung verlängert die Frist auf ein Jahr und ist ein Lieblingsziel von Abmahnungen.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          '„§ 5 TMG" zitieren. Seit Mai 2024 ist es § 5 DDG, und das alte Zitat markiert das ganze Dokument als ungepflegt.',
          'Ein Impressum, das eine Marke nennt, aber keine natürliche oder juristische Person.',
          'Eine Datenschutzerklärung, kopiert von einer Seite mit anderem Stack.',
          'US-Vorlagen-AGB mit Gewährleistungsausschlüssen und Schiedsklauseln, die gegenüber EU-Verbrauchern nichtig sind.',
          'Digitale Güter ohne die Sofort-Bereitstellungs-Checkbox verkaufen und das 14-tägige Widerrufsrecht am Leben lassen.',
          'Anzeigen oder eine bezahlte Warteliste auf einer Seite, die von alledem noch nichts hat - kommerziell beginnt vor dem ersten Verkauf.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo du das selbst nachliest',
        sources: [
          { label: 'DDG - § 5', href: 'https://www.gesetze-im-internet.de/ddg/__5.html', note: 'Die Impressumspflicht, an ihrer aktuellen Adresse.' },
          { label: 'DSGVO, amtlicher Text', href: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', note: 'Art. 12-14 sind die Information; Art. 6 die Rechtsgrundlagen.' },
          { label: 'BGB § 312g und Art. 246a EGBGB', href: 'https://www.gesetze-im-internet.de/bgb/__312g.html', note: 'Widerrufsrecht und seine Ausnahme für digitale Inhalte.' },
        ],
      },
    ],
  },
}
