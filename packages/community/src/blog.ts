import type { Section } from './guide'
import { pick, type Lang, type Text } from './text'

/**
 * The community blog.
 *
 * Posts are the same section vocabulary the guides use - a post is mostly
 * prose, but nothing stops one carrying a steps or sources section, and the
 * renderer already knows every shape. What a post adds over a guide is a date
 * that means "published" rather than "checked", and an ordering: the blog
 * index lists newest first.
 *
 * Same `Text<>` language rule as everywhere: a whole post per language,
 * English required, and the page admits a fallback rather than hiding it.
 */
export interface BlogPost {
  title: string
  /** ISO date of publication. */
  date: string
  /** One sentence under the title, and the whole preview on the index. */
  standfirst: string
  sections: Section[]
}

export interface BlogEntry {
  /** The URL segment under /community/blog/. */
  slug: string
  post: Text<BlogPost>
}

export const BLOG: BlogEntry[] = [
  {
    slug: 'the-handbook-is-open',
    post: {
      en: {
        title: 'The handbook is open',
        date: '2026-08-30',
        standfirst:
          'A community handbook for people starting something of their own: the offices in order, the boxes on the forms, and the traps nobody writes down.',
        sections: [
          {
            kind: 'prose',
            id: 'why',
            heading: 'Why it exists',
            body: [
              'Everyone who starts a business walks the same corridor of offices, and almost everything written about that corridor is either an advert for a formation service or a forum thread from 2019. What we wanted for ourselves was simpler: the sequence, the actual fields on the actual forms, what each thing costs, and the handful of decisions that are hard to reverse - dated, and checked against the sources.',
              'So that is what the handbook is. Every guide carries the date it was last read against its sources, and the sources themselves, so you can catch it being wrong. It is a map drawn by people who walked the route - not legal advice, and it says so on every page.',
            ],
          },
          {
            kind: 'prose',
            id: 'what',
            heading: 'What is in it today',
            body: [
              'Country guides across every continent - Germany in both languages, and the roster shows exactly which countries are written and which are still promises. Beside them, the chapters that are true everywhere: what to check before you promote anything, the legal shell a commercial website needs, and Stripe from zero to the first real payment.',
              'If your country is still a chip rather than a card and you have been through its process: yours is the guide we want. The whole handbook is data in a public package - one file per country, written to be contributed to.',
            ],
          },
        ],
      },
      de: {
        title: 'Das Handbuch ist offen',
        date: '2026-08-30',
        standfirst:
          'Ein Community-Handbuch für Leute, die etwas Eigenes anfangen: die Ämter in der Reihenfolge, die Felder auf den Formularen und die Fallen, die niemand aufschreibt.',
        sections: [
          {
            kind: 'prose',
            id: 'why',
            heading: 'Warum es das gibt',
            body: [
              'Wer gründet, läuft denselben Flur von Ämtern ab - und fast alles, was darüber geschrieben steht, ist entweder Werbung für einen Gründungsservice oder ein Forumsthread von 2019. Was wir selbst gebraucht hätten, ist einfacher: die Reihenfolge, die tatsächlichen Felder auf den tatsächlichen Formularen, die Kosten und die wenigen Entscheidungen, die sich schwer zurücknehmen lassen - datiert und gegen die Quellen geprüft.',
              'Genau das ist das Handbuch. Jeder Guide trägt das Datum seiner letzten Prüfung und die Quellen dazu, damit man ihn beim Veralten erwischen kann. Eine Landkarte von Leuten, die den Weg gegangen sind - keine Rechtsberatung, und das steht auf jeder Seite.',
            ],
          },
          {
            kind: 'prose',
            id: 'what',
            heading: 'Was heute drin ist',
            body: [
              'Länderguides auf jedem Kontinent - Deutschland in beiden Sprachen, und die Liste zeigt genau, welche Länder geschrieben sind und welche noch Versprechen. Daneben die Kapitel, die überall gelten: was vor der ersten Werbung zu prüfen ist, das rechtliche Grundgerüst einer kommerziellen Website und Stripe von null bis zur ersten echten Zahlung.',
              'Wenn dein Land noch ein Chip statt einer Karte ist und du das Verfahren hinter dir hast: Genau dieser Guide fehlt uns. Das ganze Handbuch ist Daten in einem öffentlichen Paket - eine Datei pro Land, zum Beitragen gebaut.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'forty-two-countries',
    post: {
      en: {
        title: 'Forty-two countries in',
        date: '2026-08-30',
        standfirst:
          'Every continent shelf has written guides now - what we learned reading founding law in thirty-nine jurisdictions in one sitting.',
        sections: [
          {
            kind: 'prose',
            id: 'patterns',
            heading: 'The patterns that repeat',
            body: [
              'Registration is nearly free almost everywhere - the fee is noise. The real first-year cost hides in social insurance, and it hides in the same way in country after country: Austria’s SVS recalculation two years later, Spain’s income-band settlement, Portugal’s month thirteen, the Finnish YEL income that quietly sets your whole safety net. If a guide about your country talks mostly about the registration fee, it was written by someone who has not paid the second-year bill.',
              'The second repeat: every system now has a simplified small-business regime - forfettario, monotributo, MEI, ryczałt, RESICO, paušální daň - and every one of them trades expense deduction away for simplicity. The trap is identical everywhere: heavy real costs inside a regime that deducts nothing.',
              'And the third: the year-two ambush. Preliminary tax in Ireland, payments on account in the UK, provisional tax in New Zealand, Vorauszahlungen in Germany - different names for the same afternoon of shock. It made our traps sections almost write themselves.',
            ],
          },
          {
            kind: 'prose',
            id: 'next',
            heading: 'What is next',
            body: [
              'A hundred and fifty-three countries are still chips. The ones we would most like to see written next: the Balkans, Georgia, and the West African countries beyond Ghana and Nigeria - places people actually found businesses from, underserved by everything except formation-agent ads. One file per country; the pattern is established. If you have walked one of these routes, write what you know and we will check it in.',
            ],
          },
        ],
      },
    },
  },
]

export function blogBySlug(slug: string): BlogEntry | undefined {
  return BLOG.find((entry) => entry.slug === slug)
}

/** Newest first, resolved for one language - what the blog index renders. */
export function blogIndex(lang: Lang) {
  return [...BLOG]
    .map((entry) => ({ slug: entry.slug, ...pick(entry.post, lang) }))
    .sort((a, b) => (a.doc.date < b.doc.date ? 1 : -1))
}
