import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * What to think about before promoting anything.
 *
 * The chapter exists because promotion is the step people take *first* - a
 * teaser page, a launch thread, a discount code - and it is legally the step
 * that should come last: advertising is what makes a hobby commercial, and a
 * discount code is a contract term. The traps here are the ones that fire
 * before the first euro of revenue.
 */
export const PROMOTION: Text<Guide> = {
  en: {
    title: 'Before you promote',
    standfirst:
      'Promotion feels like the zero-risk first step. Legally it is the moment everything else becomes due - here is what has to be true before the first post, ad or discount code.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'moment',
        heading: 'Promotion is the starting gun, not the warm-up',
        body: [
          'The obligations in the country guides key off the start of commercial activity, and courts read advertising as exactly that. A landing page with a price on it makes the site commercial: imprint due, privacy notice due, registration clock running. Doing the paperwork the week after the launch thread is doing it late.',
          'The practical order is short: register, put the legal shell up, then promote. The first two are an afternoon each; skipping them saves two afternoons and creates a surface a competitor can bill you for.',
        ],
      },
      {
        kind: 'steps',
        id: 'checks',
        heading: 'The checks, in order',
        steps: [
          {
            title: 'The name survives being searched',
            body: [
              'Before the name is in a single post: trade mark registers (DPMA for Germany, EUIPO for the EU), the app stores if you will ever be in them, and a plain web search. Promotion is what makes a name collision visible to the other side - their lawyer finds you through your own launch thread.',
              'The handle set matters as much as the domain: the name you promote should be the name people can find on every channel you will actually use.',
            ],
          },
          {
            title: 'The page you point at is dressed',
            body: [
              'Whatever the ad or post links to needs the full legal shell from the previous chapter - imprint, privacy notice, and if anything can be bought or reserved, terms and the withdrawal notice. This is the page a competitor screenshots.',
              'If the page collects so much as an email address for a waiting list, the privacy notice must cover it and the double-opt-in confirmation must be wired, because that list is the first thing you will ever email.',
            ],
          },
          {
            title: 'Advertising rules for what you are actually saying',
            body: [
              'Prices shown to consumers must be final prices including VAT - "€5" that becomes €5.95 at checkout is a Preisangabenverordnung violation. If you are a Kleinunternehmer showing net prices "plus VAT", that is wrong the other way: your prices carry no VAT and should say so nowhere.',
              'Discounts and launch offers are regulated claims: a struck-through "was" price must have really been charged before, and a countdown that resets is deception. Superlatives ("the best", "Germany’s first") need to be true or clearly puffery.',
              'If other people promote for you - influencers, affiliate links, your own posts on personal accounts - paid or benefited promotion must be labelled as advertising. The label duty is the promoter’s, but the campaigns that get named in the ruling are the brand’s.',
            ],
          },
          {
            title: 'Email and messaging are consent-first',
            body: [
              'In Germany, promotional email without prior express consent is a UWG violation per recipient - there is no cold-outreach carve-out for B2C, and the B2B one is far narrower than the newsletters in your inbox suggest. Double opt-in is the evidentiary standard: you will one day need to prove the consent, and the confirmation click is the proof.',
              'The same applies to messengers and push. A contact form submission is not newsletter consent; a checkout is not either, except for the narrow existing-customer exception with its own opt-out footnote.',
            ],
          },
          {
            title: 'Prize draws and referral codes have their own rules',
            body: [
              'A giveaway needs published conditions: who may enter, when it ends, how the winner is picked and told. Tying entry to a follow or a share is common and mostly tolerated; tying it to a purchase changes its legal nature.',
              'Referral and discount codes are contract terms - decide before launch whether they stack, when they expire and what happens on refund, because the first support email will ask.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Promoting before registering, on the theory that no revenue means no business. Advertising is the activity.',
          'A launch page with a price and no imprint - the single most screenshot-able violation there is.',
          'Net prices shown to consumers, or VAT lines shown by a Kleinunternehmer who charges none.',
          'A "was €X" price that never was, or a countdown that comes back.',
          'Emailing a waiting list that never confirmed via double opt-in.',
          'Unlabelled paid promotion by whoever is posting for you.',
          'A giveaway with no published conditions and no end date.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'UWG - the unfair competition act', href: 'https://www.gesetze-im-internet.de/uwg_2004/', note: '§ 7 is unsolicited advertising; the annex is the blacklist of practices.' },
          { label: 'Preisangabenverordnung', href: 'https://www.gesetze-im-internet.de/pangv_2022/', note: 'Final prices, and § 11 on strike-through reference prices.' },
          { label: 'DPMA / EUIPO registers', href: 'https://register.dpma.de', note: 'The name check, before the first post.' },
        ],
      },
    ],
  },
  de: {
    title: 'Bevor du Werbung machst',
    standfirst:
      'Werbung fühlt sich wie der risikolose erste Schritt an. Rechtlich ist sie der Moment, ab dem alles andere fällig wird - hier steht, was vor dem ersten Post, der ersten Anzeige und dem ersten Rabattcode stimmen muss.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'moment',
        heading: 'Werbung ist der Startschuss, nicht das Aufwärmen',
        body: [
          'Die Pflichten aus den Länderguides knüpfen am Beginn der geschäftlichen Tätigkeit an - und Gerichte lesen Werbung als genau das. Eine Landingpage mit einem Preis darauf macht die Seite geschäftlich: Impressum fällig, Datenschutzerklärung fällig, die Anmeldefrist läuft. Den Papierkram in der Woche nach dem Launch-Thread zu machen heißt, ihn zu spät zu machen.',
          'Die praktische Reihenfolge ist kurz: anmelden, das rechtliche Grundgerüst online stellen, dann werben. Die ersten beiden kosten je einen Nachmittag; sie zu überspringen spart zwei Nachmittage und schafft eine Angriffsfläche, die ein Wettbewerber dir in Rechnung stellen kann.',
        ],
      },
      {
        kind: 'steps',
        id: 'checks',
        heading: 'Die Prüfungen, in dieser Reihenfolge',
        steps: [
          {
            title: 'Der Name übersteht eine Suche',
            body: [
              'Bevor der Name in einem einzigen Post steht: Markenregister (DPMA für Deutschland, EUIPO für die EU), die App-Stores, falls du je dort sein wirst, und eine normale Websuche. Werbung ist das, was eine Namenskollision für die Gegenseite sichtbar macht - deren Anwalt findet dich über deinen eigenen Launch-Thread.',
              'Die Handles zählen so viel wie die Domain: Der Name, den du bewirbst, sollte der sein, unter dem man dich auf jedem Kanal findet, den du wirklich nutzen wirst.',
            ],
          },
          {
            title: 'Die Seite, auf die du zeigst, ist angezogen',
            body: [
              'Wohin auch immer Anzeige oder Post verlinken: Die Seite braucht das komplette Grundgerüst aus dem Nachbarkapitel - Impressum, Datenschutzerklärung, und sobald etwas gekauft oder reserviert werden kann, AGB und Widerrufsbelehrung. Das ist die Seite, die ein Wettbewerber screenshottet.',
              'Sammelt die Seite auch nur eine E-Mail-Adresse für eine Warteliste, muss die Datenschutzerklärung das abdecken und das Double-Opt-in verdrahtet sein - denn diese Liste ist das Erste, was du je anschreiben wirst.',
            ],
          },
          {
            title: 'Werberecht für das, was du tatsächlich sagst',
            body: [
              'Preise gegenüber Verbrauchern müssen Endpreise inklusive Umsatzsteuer sein - „5 €", die an der Kasse 5,95 € werden, sind ein Verstoß gegen die Preisangabenverordnung. Zeigst du als Kleinunternehmer Nettopreise „zzgl. USt.", ist das andersherum falsch: Deine Preise tragen keine Umsatzsteuer und sollten es nirgends behaupten.',
              'Rabatte und Startangebote sind regulierte Behauptungen: Ein durchgestrichener „Statt"-Preis muss vorher wirklich verlangt worden sein, und ein Countdown, der sich zurücksetzt, ist Täuschung. Superlative („das beste", „Deutschlands erstes") müssen stimmen oder erkennbar Übertreibung sein.',
              'Wenn andere für dich werben - Influencer, Affiliate-Links, deine eigenen Posts auf Privataccounts -, muss bezahlte oder begünstigte Werbung als Werbung gekennzeichnet sein. Die Kennzeichnungspflicht liegt beim Werbenden; im Urteil genannt wird die Marke.',
            ],
          },
          {
            title: 'E-Mail und Messenger sind einwilligungspflichtig',
            body: [
              'Werbe-E-Mails ohne vorherige ausdrückliche Einwilligung sind in Deutschland ein UWG-Verstoß pro Empfänger - für B2C gibt es keine Kaltakquise-Ausnahme, und die B2B-Ausnahme ist viel enger, als die Newsletter in deinem Posteingang vermuten lassen. Double-Opt-in ist der Beweisstandard: Du wirst die Einwilligung eines Tages nachweisen müssen, und der Bestätigungsklick ist der Nachweis.',
              'Dasselbe gilt für Messenger und Push. Ein Kontaktformular ist keine Newsletter-Einwilligung; ein Kauf auch nicht - bis auf die enge Bestandskunden-Ausnahme mit ihrer eigenen Abmelde-Fußnote.',
            ],
          },
          {
            title: 'Gewinnspiele und Empfehlungscodes haben eigene Regeln',
            body: [
              'Ein Gewinnspiel braucht veröffentlichte Teilnahmebedingungen: wer mitmachen darf, wann es endet, wie gewinnt und benachrichtigt wird. Teilnahme an ein Follow oder Teilen zu knüpfen ist üblich und meist geduldet; sie an einen Kauf zu knüpfen ändert die rechtliche Natur.',
              'Empfehlungs- und Rabattcodes sind Vertragsbedingungen - entscheide vor dem Launch, ob sie kombinierbar sind, wann sie verfallen und was bei einer Erstattung passiert, denn die erste Support-Mail wird genau das fragen.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          'Werben vor der Anmeldung, nach der Theorie „kein Umsatz, kein Gewerbe". Die Werbung ist die Tätigkeit.',
          'Eine Launch-Seite mit Preis und ohne Impressum - der screenshotbarste Verstoß, den es gibt.',
          'Nettopreise gegenüber Verbrauchern, oder USt.-Zeilen von einem Kleinunternehmer, der keine berechnet.',
          'Ein „Statt X €"-Preis, den es nie gab, oder ein Countdown, der wiederkommt.',
          'Eine Warteliste anschreiben, die nie per Double-Opt-in bestätigt hat.',
          'Ungekennzeichnete bezahlte Werbung durch wen auch immer, der für dich postet.',
          'Ein Gewinnspiel ohne veröffentlichte Bedingungen und ohne Enddatum.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo du das selbst nachliest',
        sources: [
          { label: 'UWG - Gesetz gegen den unlauteren Wettbewerb', href: 'https://www.gesetze-im-internet.de/uwg_2004/', note: '§ 7 ist die unzumutbare Belästigung; der Anhang ist die schwarze Liste.' },
          { label: 'Preisangabenverordnung', href: 'https://www.gesetze-im-internet.de/pangv_2022/', note: 'Endpreise, und § 11 zu durchgestrichenen Referenzpreisen.' },
          { label: 'DPMA / EUIPO Register', href: 'https://register.dpma.de', note: 'Die Namensprüfung, vor dem ersten Post.' },
        ],
      },
    ],
  },
}
