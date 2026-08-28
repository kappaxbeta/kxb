import type { EventType } from '@/domain/contact/message'
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'

/**
 * The booking sheet, in one place per language.
 *
 * Same split as the landing dictionary: words here, everything structural -
 * scene filenames, image dimensions, which cue owns which field - in the
 * components. `EventsDict` is declared rather than inferred so German cannot
 * quietly go missing a key.
 *
 * One thing here is not free text. `eventTypes` is keyed by the exact English
 * strings in `EVENT_TYPES`, because those are the values the `<select>` submits
 * and the server stores; only the label a human reads is translated. Translating
 * the value instead would file every German enquiry under a type the backoffice
 * has never heard of.
 */
export interface EventsDict {
  meta: { title: string; description: string }
  back: string
  head: {
    doc: string
    title: string
    /** Split around the emphasised clause. */
    standfirstLead: string
    standfirstStrong: string
    standfirstTail: string
    fees: { fee: string; cues: string; attendees: string }
    feeValue: string
    feeNote: string
    cuesValue: string
    cuesNote: string
    attendeesValue: string
    attendeesNote: string
    asideLead: string
    asideLink: string
    asideTail: string
  }
  seam: { yours: string; ours: string }
  owner: { yours: string; ours: string }
  /** Cues 04-08, the ones we hold. Keyed by the ids in the page. */
  ours: Record<
    'price' | 'build' | 'brand' | 'doors' | 'after',
    { label: string; at: string; body: string; alt?: string }
  >
  foot: {
    lead: string
    contactLink: string
    middle: string
    imprintLink: string
    tail: string
  }
  /** Cues 01-03, the organiser's own. */
  cues: Record<'event' | 'brief' | 'you', { label: string; hint: string }>
  fields: {
    typeLabel: string
    typePlaceholder: string
    whenLabel: string
    whenPlaceholder: string
    sizeLabel: string
    sizePlaceholder: string
    briefLabel: string
    briefPlaceholder: string
    nameLabel: string
    namePlaceholder: string
    emailLabel: string
    emailPlaceholder: string
    phoneLabel: string
    phoneOptional: string
    phonePlaceholder: string
  }
  eventTypes: Record<EventType, string>
  /** The five frames of the room going up. */
  stages: {
    plot: string
    floor: string
    fitout: string
    branded: string
    doors: string
  }
  plate: {
    /** `{caption}` is the current stage, lower-cased by the caller. */
    shotAlt: string
    note: string
    floor: string
    doors: string
    sized: string
    order: string
    walls: string
    /** `{n}` is a word count. */
    words: string
  }
  send: {
    /** `{n}` and `{total}` are cue numbers. */
    progress: string
    lastNote: string
    back: string
    next: string
    sending: string
    submit: string
  }
  sent: { tag: string; line: string; body: string; alt: string }
}

export const EVENTS_EN: EventsDict = {
  meta: {
    title: 'Plan an event',
    description:
      'A room built for your jam, hackathon, conference or class, and one link that puts everyone in it. Quoted per event from €200.',
  },
  back: '← Back',
  head: {
    doc: 'Run of show',
    title: 'Tell us the date and we build the room',
    standfirstLead:
      'A game jam, a hackathon, a conference track, a community night, a class. One room built for the day it happens, and one link that puts everyone inside it, with ',
    standfirstStrong: 'no account, no install, nothing to download',
    standfirstTail: '.',
    fees: { fee: 'Fee', cues: 'Cues', attendees: 'Attendees' },
    feeValue: 'from €200',
    feeNote: 'quoted per event',
    cuesValue: '8',
    cuesNote: 'three of them yours',
    attendeesValue: 'no accounts',
    attendeesNote: 'one link, they walk in',
    asideLead: 'Running something every week instead? ',
    asideLink: 'That starts at €5 a month',
    asideTail: ', self-serve, and this sheet is not the way in.',
  },
  seam: { yours: 'Above, yours', ours: 'Below, ours' },
  owner: { yours: 'Yours', ours: 'Ours' },
  ours: {
    price: {
      label: 'We price it',
      at: 'dated ones first',
      body: 'A price and a couple of questions about the running order, from a person who has read your brief. Enquiries with a date on them get answered first.',
    },
    build: {
      label: 'We build the room',
      at: 'before the doors',
      body: 'You describe the day; we build the floor to it. Tables for teams, a stage to talk from, a pitch, a club, all laid out and standing before anybody arrives, so the first thing your people see is a place rather than an empty grid.',
      alt: 'A stone floor with a team table on each side and a low wooden stage at the front',
    },
    brand: {
      label: 'Your name goes up',
      at: 'before the doors',
      body: 'Logos, posters and sponsor boards go up as images inside the world, and the lights take your colours. It looks like your event, not like our demo with your people in it. You walk the room before anybody else does.',
      alt: 'The same room with a brick back wall and a coloured banner across it',
    },
    doors: {
      label: 'You send one link',
      at: 'on the day',
      body: 'It goes in the calendar invite, the Discord announcement or the conference app. Whoever opens it picks a name and an animal and walks in. No accounts, no installs, nothing for your attendees to be talked through, and no list of addresses for you to collect.',
      alt: 'The finished room with five animals walking in across the floor, emotes above them',
    },
    after: {
      label: 'It stays standing',
      at: 'and after',
      body: 'For the hours it is on there is a person on the other end of an address who knows the room you are standing in. Afterwards it stays up and stays readable, with the screenshots, the club, the pitch with your logo still on it. Nothing is deleted when the day is over.',
    },
  },
  foot: {
    lead: 'Not planning anything, and something is broken? ',
    contactLink: 'The contact form',
    middle: ' is the one you want. Postal address and the legal details are in the ',
    imprintLink: 'Impressum',
    tail: '.',
  },
  cues: {
    event: {
      label: 'The event',
      hint: 'The three answers a price is built from. Rough is fine, so “spring” and “60–80” are real answers.',
    },
    brief: {
      label: 'The brief',
      hint: 'As much or as little as you have. A half-formed idea is a fine enquiry, and most of them are.',
    },
    you: {
      label: 'Where to send the price',
      hint: 'Nothing here is published and nothing is passed on.',
    },
  },
  fields: {
    typeLabel: 'What is it',
    typePlaceholder: 'Pick one…',
    whenLabel: 'When',
    whenPlaceholder: '14 March, or “spring”',
    sizeLabel: 'How many people',
    sizePlaceholder: '60–80',
    briefLabel: 'What are you planning?',
    briefPlaceholder:
      'The running order, what the room needs in it, whether there is a talk, a jam, a party at the end. As much or as little as you have.',
    nameLabel: 'Your name',
    namePlaceholder: 'Who is organising it?',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    phoneLabel: 'Phone',
    phoneOptional: '(optional)',
    phonePlaceholder: '+49 …',
  },
  eventTypes: {
    'Game jam': 'Game jam',
    Hackathon: 'Hackathon',
    Conference: 'Conference',
    Meetup: 'Meetup',
    'Community night': 'Community night',
    'Class or course': 'Class or course',
    'Something else': 'Something else',
  },
  stages: {
    plot: 'An empty plot',
    floor: 'Floor laid',
    fitout: 'Tables in, stage up',
    branded: 'Your name on the walls',
    doors: 'Doors open',
  },
  plate: {
    shotAlt: 'The room so far: {caption}',
    note: 'This is the room going up. Answer cue 01 and it starts following you.',
    floor: 'Floor',
    doors: 'Doors',
    sized: 'Sized',
    order: 'Order',
    walls: 'Walls',
    words: '{n} words',
  },
  send: {
    progress: 'Cue {n} of {total}. Nothing is sent until the last one.',
    lastNote: 'No subject line to invent, we build one from the three answers above.',
    back: 'Back',
    next: 'Next cue',
    sending: 'Sending…',
    submit: 'Send the sheet',
  },
  sent: {
    tag: 'Sheet with us',
    line: 'That is with us.',
    body: 'We answer enquiries with a date on them first. Expect a price and a couple of questions about the running order, at the address you gave us. Every cue below this line is ours now.',
    alt: 'The finished room with animals walking in, a stage at the front and a banner on the back wall',
  },
}

/**
 * German.
 *
 * "Run of show" stays as "Ablaufplan" rather than being borrowed: the whole
 * page is built on the metaphor of a cue sheet, and a German organiser knows
 * the document as an Ablaufplan. "Cue" becomes "Punkt" for the same reason -
 * "Cue 01" reads as jargon in German where it reads as theatre in English.
 *
 * Formal "Sie", matching the landing page.
 */
export const EVENTS_DE: EventsDict = {
  meta: {
    title: 'Event planen',
    description:
      'Ein Raum, gebaut für Ihren Jam, Hackathon, Ihre Konferenz oder Ihren Kurs – und ein Link, der alle hineinbringt. Angebot pro Event ab 200 €.',
  },
  back: '← Zurück',
  head: {
    doc: 'Ablaufplan',
    title: 'Sagen Sie uns das Datum, wir bauen den Raum',
    standfirstLead:
      'Ein Game Jam, ein Hackathon, ein Konferenz-Track, ein Community-Abend, ein Kurs. Ein Raum, gebaut für den Tag, an dem er stattfindet, und ein Link, der alle hineinbringt – ',
    standfirstStrong: 'ohne Konto, ohne Installation, ohne Download',
    standfirstTail: '.',
    fees: { fee: 'Preis', cues: 'Punkte', attendees: 'Teilnehmende' },
    feeValue: 'ab 200 €',
    feeNote: 'Angebot pro Event',
    cuesValue: '8',
    cuesNote: 'drei davon Ihre',
    attendeesValue: 'ohne Konto',
    attendeesNote: 'ein Link, sie gehen hinein',
    asideLead: 'Stattdessen jede Woche etwas? ',
    asideLink: 'Das beginnt bei 5 € im Monat',
    asideTail: ', selbst einzurichten – dieser Plan ist dann nicht der richtige Weg.',
  },
  seam: { yours: 'Oben: Ihres', ours: 'Unten: unseres' },
  owner: { yours: 'Ihres', ours: 'Unseres' },
  ours: {
    price: {
      label: 'Wir machen den Preis',
      at: 'mit Datum zuerst',
      body: 'Ein Preis und ein paar Rückfragen zum Ablauf, von einem Menschen, der Ihr Briefing gelesen hat. Anfragen mit einem Datum werden zuerst beantwortet.',
    },
    build: {
      label: 'Wir bauen den Raum',
      at: 'vor Türöffnung',
      body: 'Sie beschreiben den Tag, wir bauen den Boden dazu. Tische für Teams, eine Bühne zum Sprechen, ein Spielfeld, ein Club – alles ausgelegt und aufgebaut, bevor jemand ankommt. Das Erste, was Ihre Leute sehen, ist ein Ort und kein leeres Raster.',
      alt: 'Ein Steinboden mit je einem Teamtisch an beiden Seiten und einer niedrigen Holzbühne vorn',
    },
    brand: {
      label: 'Ihr Name kommt an die Wand',
      at: 'vor Türöffnung',
      body: 'Logos, Poster und Sponsorentafeln hängen als Bilder in der Welt, und das Licht nimmt Ihre Farben an. Es sieht aus wie Ihr Event und nicht wie unsere Demo mit Ihren Leuten darin. Sie gehen als Erste durch den Raum.',
      alt: 'Derselbe Raum mit einer Backsteinrückwand und einem farbigen Banner darüber',
    },
    doors: {
      label: 'Sie verschicken einen Link',
      at: 'am Tag selbst',
      body: 'Er kommt in die Kalendereinladung, die Discord-Ankündigung oder die Konferenz-App. Wer ihn öffnet, wählt einen Namen und ein Tier und geht hinein. Keine Konten, keine Installationen, nichts, was Sie Ihren Teilnehmenden erklären müssten, und keine Adressliste, die Sie einsammeln.',
      alt: 'Der fertige Raum, fünf Tiere kommen über den Boden herein, Emotes über ihren Köpfen',
    },
    after: {
      label: 'Er bleibt stehen',
      at: 'und danach',
      body: 'Solange es läuft, ist am anderen Ende einer Adresse ein Mensch, der den Raum kennt, in dem Sie stehen. Danach bleibt er stehen und lesbar – mit den Screenshots, dem Club, dem Spielfeld mit Ihrem Logo darauf. Nichts wird gelöscht, wenn der Tag vorbei ist.',
    },
  },
  foot: {
    lead: 'Sie planen nichts und etwas funktioniert nicht? ',
    contactLink: 'Das Kontaktformular',
    middle: ' ist dann das richtige. Postanschrift und rechtliche Angaben stehen im ',
    imprintLink: 'Impressum',
    tail: '.',
  },
  cues: {
    event: {
      label: 'Das Event',
      hint: 'Die drei Antworten, aus denen ein Preis entsteht. Ungefähr genügt – „Frühjahr“ und „60–80“ sind echte Antworten.',
    },
    brief: {
      label: 'Das Briefing',
      hint: 'So viel oder so wenig, wie Sie haben. Eine halbfertige Idee ist eine gute Anfrage, und die meisten sind genau das.',
    },
    you: {
      label: 'Wohin mit dem Preis',
      hint: 'Nichts davon wird veröffentlicht und nichts weitergegeben.',
    },
  },
  fields: {
    typeLabel: 'Worum geht es',
    typePlaceholder: 'Bitte wählen…',
    whenLabel: 'Wann',
    whenPlaceholder: '14. März, oder „Frühjahr“',
    sizeLabel: 'Wie viele Personen',
    sizePlaceholder: '60–80',
    briefLabel: 'Was haben Sie vor?',
    briefPlaceholder:
      'Der Ablauf, was im Raum stehen soll, ob es einen Vortrag gibt, einen Jam, eine Party am Ende. So viel oder so wenig, wie Sie haben.',
    nameLabel: 'Ihr Name',
    namePlaceholder: 'Wer organisiert es?',
    emailLabel: 'E-Mail',
    emailPlaceholder: 'sie@beispiel.de',
    phoneLabel: 'Telefon',
    phoneOptional: '(optional)',
    phonePlaceholder: '+49 …',
  },
  eventTypes: {
    'Game jam': 'Game Jam',
    Hackathon: 'Hackathon',
    Conference: 'Konferenz',
    Meetup: 'Meetup',
    'Community night': 'Community-Abend',
    'Class or course': 'Unterricht oder Kurs',
    'Something else': 'Etwas anderes',
  },
  stages: {
    plot: 'Ein leeres Grundstück',
    floor: 'Boden verlegt',
    fitout: 'Tische drin, Bühne steht',
    branded: 'Ihr Name an den Wänden',
    doors: 'Türen offen',
  },
  plate: {
    shotAlt: 'Der Raum bisher: {caption}',
    note: 'So entsteht der Raum. Beantworten Sie Punkt 01, und er richtet sich nach Ihnen.',
    floor: 'Boden',
    doors: 'Türen',
    sized: 'Größe',
    order: 'Ablauf',
    walls: 'Wände',
    words: '{n} Wörter',
  },
  send: {
    progress: 'Punkt {n} von {total}. Es wird nichts gesendet, bis der letzte ausgefüllt ist.',
    lastNote:
      'Kein Betreff auszudenken – wir bauen ihn aus den drei Antworten oben.',
    back: 'Zurück',
    next: 'Nächster Punkt',
    sending: 'Wird gesendet…',
    submit: 'Plan senden',
  },
  sent: {
    tag: 'Plan ist bei uns',
    line: 'Das ist bei uns.',
    body: 'Anfragen mit einem Datum beantworten wir zuerst. Sie bekommen einen Preis und ein paar Rückfragen zum Ablauf an die Adresse, die Sie uns gegeben haben. Jeder Punkt unterhalb dieser Linie gehört jetzt uns.',
    alt: 'Der fertige Raum mit hereinkommenden Tieren, einer Bühne vorn und einem Banner an der Rückwand',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English page. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, EventsDict> = { en: EVENTS_EN, de: EVENTS_DE }

export function eventsDict(locale: Locale): EventsDict {
  return DICTS[publicLocale(locale)]
}
