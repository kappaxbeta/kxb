import type { Lang } from './text'

/**
 * The page chrome, per language - everything the community pages say that is
 * not inside a document.
 *
 * This half *is* dictionary-shaped, unlike the guides, and the split is the
 * same one the app's landing page describes: chrome is the same claim twice
 * ("Countries" / "Länder") and wants to be checked key-by-key, prose is a
 * document per language. `CommunityDict` is declared rather than inferred so
 * a language cannot quietly go missing a key.
 *
 * Country names live here too: the roster in `countries/` is data with an
 * English name on it, and a German page saying "Deutschland" rather than
 * "Germany" is chrome, not content. Only the countries on the roster need an
 * entry; a missing one falls back to the roster's English name, so a new
 * roster row cannot crash a page that has not learned its translation yet.
 */
export interface CommunityDict {
  meta: { title: string; description: string }
  /** The sidebar. Structure lives in the app; every word lives here. */
  nav: {
    /** The eye-catcher block at the top. */
    important: string
    starter: string
    starterHint: string
    legal: string
    legalHint: string
    guides: string
    /** The making-of shelf: how the games were built. */
    making: string
    countries: string
    blog: string
    resources: string
    editorGuide: string
    repo: string
    backToSite: string
  }
  /** The geo greeting when the browser's locale names a written country. */
  geo: {
    /** Before the country name. */
    lead: string
    /** The link text after the country card. */
    open: string
  }
  blog: {
    title: string
    standfirst: string
    /** Prefix before a post's date on the index. */
    posted: string
    /** The empty state while no post is published. */
    comingSoon: string
  }
  /** The closing word on the index: how to hold yourself while building. */
  motto: {
    title: string
    lines: string[]
  }
  /** The country hub page under /community/<cc>. */
  hub: {
    /** Under the country name. */
    lead: string
    /** Over the guide links. */
    guides: string
    /** Over the official links lifted from the guide's sources. */
    resources: string
    /** The people registry: kxb users who founded here and take questions. */
    people: string
    peopleIntro: string
    /** The empty state, ending in the get-listed link. */
    peopleEmpty: string
    peopleGetListed: string
  }
  /** The index page. */
  index: {
    title: string
    standfirst: string
    /** The small tag over each band - not the heading repeated. */
    chaptersKicker: string
    countriesKicker: string
    chaptersHeading: string
    chaptersIntro: string
    countriesHeading: string
    countriesIntro: string
    plannedHeading: string
    plannedIntro: string
    plannedBadge: string
    /** Shown on a written country's card, before the language badges. */
    inLangs: string
  }
  /** The document pages. */
  doc: {
    back: string
    checked: string
    /** The banner over a document served in its fallback language. */
    untranslated: string
    /** Table headings for costs sections. */
    what: string
    amount: string
    /** Labels on a step. */
    where: string
    cost: string
    takes: string
    watch: string
    /** Heading over the on-page section nav. */
    contents: string
  }
  /** The disclaimer every document page carries. */
  disclaimer: string
  countryNames: Partial<Record<string, string>>
  /** The shelf headings. Keyed by the roster's `Continent` values. */
  continents: Record<string, string>
}

export const COMMUNITY_EN: CommunityDict = {
  meta: {
    title: 'Community handbook - starting and running an independent business',
    description:
      'How to register a business, country by country: the offices, the forms, the boxes on the forms - plus Stripe, the legal shell of a website, and what to check before you promote.',
  },
  nav: {
    important: 'Start here',
    starter: 'KXB Starter Guide',
    starterHint: 'Run the whole thing yourself',
    legal: 'Basic Legal',
    legalHint: 'The four documents before you take money',
    guides: 'Guides',
    making: 'How it was made',
    countries: 'Countries',
    blog: 'Blog',
    resources: 'Resources',
    editorGuide: 'XP editor guide',
    repo: 'The kxb repository',
    backToSite: '← kxb.team',
  },
  geo: {
    lead: 'Looks like you are in',
    open: 'Open your guide',
  },
  blog: {
    title: 'Blog',
    standfirst: 'Notes from building the handbook and the world it belongs to.',
    posted: 'Posted',
    comingSoon: 'Nothing here yet - the first post is coming soon.',
  },
  motto: {
    title: 'A word before you go',
    lines: [
      'Every start is slow. That is not a verdict, it is the terrain.',
      'Work confident, stay playful - the two are not opposites, they are the trick.',
      'Respect the people you build with, and the ones you build for.',
      'Don’t do evil. Not even the profitable kind.',
      'And have fun. It shows in the work, and it is the whole point of the arcade.',
    ],
  },
  hub: {
    lead: 'Guides, official addresses and the chapters that apply everywhere - one page per country, growing into a web.',
    guides: 'Guides',
    resources: 'Official resources',
    people: 'People who did it',
    peopleIntro: 'kxb users who founded here and are happy to be asked.',
    peopleEmpty: 'Nobody is listed here yet. If you run something in this country and would answer a question or two,',
    peopleGetListed: 'get yourself listed',
  },
  index: {
    title: 'The Hitchhiker’s Guide through kxb',
    standfirst:
      'What it actually takes to start something of your own: the offices in order, the boxes on the forms, and the traps nobody writes down. Checked against the sources, dated, and open to corrections from people who walked it.',
    chaptersKicker: 'Read these once',
    countriesKicker: 'Where you are',
    chaptersHeading: 'True everywhere',
    chaptersIntro: 'The chapters every country guide points into instead of repeating.',
    countriesHeading: 'Countries',
    countriesIntro: 'Written, checked against the sources, and dated.',
    plannedHeading: 'Not written yet',
    plannedIntro: 'On the list. If you have been through one of these, yours is the guide we want.',
    plannedBadge: 'planned',
    inLangs: 'in',
  },
  doc: {
    back: '← Handbook',
    checked: 'Checked against the sources on',
    untranslated: 'This guide has not been translated yet - you are reading the English original.',
    what: 'What',
    amount: 'Amount',
    where: 'Where',
    cost: 'Cost',
    takes: 'Takes',
    watch: 'Watch out',
    contents: 'On this page',
  },
  disclaimer:
    'This is a map, not legal or tax advice - and an honest one about how it was drawn: the Germany guide was written by a person who walked the route; most other countries were drafted with AI against the official sources and have not yet been walked by someone who did it. Laws change. Every guide carries the date it was last checked and the sources to check it yourself - and if you have been through one of these routes, your corrections are exactly what this handbook wants.',
  countryNames: {},
  continents: {
    europe: 'Europe',
    africa: 'Africa',
    'north-america': 'North America',
    'south-america': 'South America',
    asia: 'Asia',
    oceania: 'Oceania',
  },
}

export const COMMUNITY_DE: CommunityDict = {
  meta: {
    title: 'Community-Handbuch - selbstständig gründen und bleiben',
    description:
      'Gewerbe anmelden, Land für Land: die Ämter in der richtigen Reihenfolge, die Felder auf den Formularen - dazu Stripe, das rechtliche Grundgerüst einer Website und was vor der ersten Werbung zu prüfen ist.',
  },
  nav: {
    important: 'Fang hier an',
    starter: 'KXB Starter-Guide',
    starterHint: 'Betreib das Ganze selbst',
    legal: 'Recht kompakt',
    legalHint: 'Die vier Dokumente, bevor Geld fließt',
    guides: 'Guides',
    making: 'Wie es gebaut wurde',
    countries: 'Länder',
    blog: 'Blog',
    resources: 'Ressourcen',
    editorGuide: 'XP-Editor-Guide',
    repo: 'Das kxb-Repository',
    backToSite: '← kxb.team',
  },
  geo: {
    lead: 'Sieht aus, als wärst du in',
    open: 'Deinen Guide öffnen',
  },
  blog: {
    title: 'Blog',
    standfirst: 'Notizen vom Bau des Handbuchs und der Welt, zu der es gehört.',
    posted: 'Veröffentlicht',
    comingSoon: 'Hier ist noch nichts - der erste Beitrag kommt bald.',
  },
  motto: {
    title: 'Ein Wort noch',
    lines: [
      'Jeder Anfang ist langsam. Das ist kein Urteil, das ist das Gelände.',
      'Arbeite selbstbewusst, bleib verspielt - das ist kein Widerspruch, das ist der Trick.',
      'Respektiere die, mit denen du baust, und die, für die du baust.',
      'Tu nichts Böses. Auch nicht das profitable.',
      'Und hab Spaß. Man sieht es der Arbeit an, und es ist der ganze Sinn der Arcade.',
    ],
  },
  hub: {
    lead: 'Guides, offizielle Adressen und die Kapitel, die überall gelten - eine Seite pro Land, die zu einem Netz zusammenwächst.',
    guides: 'Guides',
    resources: 'Offizielle Quellen',
    people: 'Leute, die es getan haben',
    peopleIntro: 'kxb-Nutzer, die hier gegründet haben und sich fragen lassen.',
    peopleEmpty: 'Hier steht noch niemand. Wenn du in diesem Land etwas betreibst und die eine oder andere Frage beantworten würdest,',
    peopleGetListed: 'lass dich eintragen',
  },
  index: {
    title: 'Per Anhalter durch kxb',
    standfirst:
      'Was es wirklich braucht, um etwas Eigenes anzufangen: die Ämter in der Reihenfolge, die Felder auf den Formularen und die Fallen, die niemand aufschreibt. Gegen die Quellen geprüft, datiert - und offen für Korrekturen von Leuten, die den Weg gegangen sind.',
    chaptersKicker: 'Einmal lesen',
    countriesKicker: 'Wo du bist',
    chaptersHeading: 'Gilt überall',
    chaptersIntro: 'Die Kapitel, auf die jeder Länderteil verweist, statt sie zu wiederholen.',
    countriesHeading: 'Länder',
    countriesIntro: 'Geschrieben, gegen die Quellen geprüft und datiert.',
    plannedHeading: 'Noch nicht geschrieben',
    plannedIntro: 'Stehen auf der Liste. Wer eines davon hinter sich hat: Genau dieser Guide fehlt uns.',
    plannedBadge: 'geplant',
    inLangs: 'auf',
  },
  doc: {
    back: '← Handbuch',
    checked: 'Gegen die Quellen geprüft am',
    untranslated: 'Dieser Guide ist noch nicht übersetzt - du liest das englische Original.',
    what: 'Was',
    amount: 'Betrag',
    where: 'Wo',
    cost: 'Kosten',
    takes: 'Dauer',
    watch: 'Achtung',
    contents: 'Auf dieser Seite',
  },
  disclaimer:
    'Das hier ist eine Landkarte, keine Rechts- oder Steuerberatung - und eine ehrliche darüber, wie sie entstanden ist: Der Deutschland-Guide stammt von jemandem, der den Weg gegangen ist; die meisten anderen Länder wurden mit KI aus den offiziellen Quellen erstellt und noch von niemandem abgelaufen, der es getan hat. Gesetze ändern sich. Jeder Guide trägt das Datum seiner letzten Prüfung und die Quellen zum Selbst-Nachlesen - und wer einen dieser Wege hinter sich hat: Genau diese Korrekturen wünscht sich das Handbuch.',
  countryNames: {
    al: 'Albanien',
    ad: 'Andorra',
    at: 'Österreich',
    by: 'Belarus',
    be: 'Belgien',
    ba: 'Bosnien und Herzegowina',
    bg: 'Bulgarien',
    hr: 'Kroatien',
    cy: 'Zypern',
    cz: 'Tschechien',
    dk: 'Dänemark',
    ee: 'Estland',
    fi: 'Finnland',
    fr: 'Frankreich',
    de: 'Deutschland',
    gr: 'Griechenland',
    hu: 'Ungarn',
    'is': 'Island',
    ie: 'Irland',
    it: 'Italien',
    lv: 'Lettland',
    li: 'Liechtenstein',
    lt: 'Litauen',
    lu: 'Luxemburg',
    mt: 'Malta',
    md: 'Moldau',
    mc: 'Monaco',
    me: 'Montenegro',
    nl: 'Niederlande',
    mk: 'Nordmazedonien',
    no: 'Norwegen',
    pl: 'Polen',
    pt: 'Portugal',
    ro: 'Rumänien',
    sm: 'San Marino',
    rs: 'Serbien',
    sk: 'Slowakei',
    si: 'Slowenien',
    es: 'Spanien',
    se: 'Schweden',
    ch: 'Schweiz',
    ua: 'Ukraine',
    gb: 'Vereinigtes Königreich',
    va: 'Vatikanstadt',
    dz: 'Algerien',
    ao: 'Angola',
    bj: 'Benin',
    bw: 'Botsuana',
    bf: 'Burkina Faso',
    bi: 'Burundi',
    cv: 'Cabo Verde',
    cm: 'Kamerun',
    cf: 'Zentralafrikanische Republik',
    td: 'Tschad',
    km: 'Komoren',
    cg: 'Republik Kongo',
    cd: 'Demokratische Republik Kongo',
    ci: 'Elfenbeinküste',
    dj: 'Dschibuti',
    eg: 'Ägypten',
    gq: 'Äquatorialguinea',
    er: 'Eritrea',
    sz: 'Eswatini',
    et: 'Äthiopien',
    ga: 'Gabun',
    gm: 'Gambia',
    gh: 'Ghana',
    gn: 'Guinea',
    gw: 'Guinea-Bissau',
    ke: 'Kenia',
    ls: 'Lesotho',
    lr: 'Liberia',
    ly: 'Libyen',
    mg: 'Madagaskar',
    mw: 'Malawi',
    ml: 'Mali',
    mr: 'Mauretanien',
    mu: 'Mauritius',
    ma: 'Marokko',
    mz: 'Mosambik',
    na: 'Namibia',
    ne: 'Niger',
    ng: 'Nigeria',
    rw: 'Ruanda',
    st: 'São Tomé und Príncipe',
    sn: 'Senegal',
    sc: 'Seychellen',
    sl: 'Sierra Leone',
    so: 'Somalia',
    za: 'Südafrika',
    ss: 'Südsudan',
    sd: 'Sudan',
    tz: 'Tansania',
    tg: 'Togo',
    tn: 'Tunesien',
    ug: 'Uganda',
    zm: 'Sambia',
    zw: 'Simbabwe',
    ag: 'Antigua und Barbuda',
    bs: 'Bahamas',
    bb: 'Barbados',
    bz: 'Belize',
    ca: 'Kanada',
    cr: 'Costa Rica',
    cu: 'Kuba',
    dm: 'Dominica',
    'do': 'Dominikanische Republik',
    sv: 'El Salvador',
    gd: 'Grenada',
    gt: 'Guatemala',
    ht: 'Haiti',
    hn: 'Honduras',
    jm: 'Jamaika',
    mx: 'Mexiko',
    ni: 'Nicaragua',
    pa: 'Panama',
    kn: 'St. Kitts und Nevis',
    lc: 'St. Lucia',
    vc: 'St. Vincent und die Grenadinen',
    tt: 'Trinidad und Tobago',
    us: 'USA',
    ar: 'Argentinien',
    bo: 'Bolivien',
    br: 'Brasilien',
    cl: 'Chile',
    co: 'Kolumbien',
    ec: 'Ecuador',
    gy: 'Guyana',
    py: 'Paraguay',
    pe: 'Peru',
    sr: 'Suriname',
    uy: 'Uruguay',
    ve: 'Venezuela',
    af: 'Afghanistan',
    am: 'Armenien',
    az: 'Aserbaidschan',
    bh: 'Bahrain',
    bd: 'Bangladesch',
    bt: 'Bhutan',
    bn: 'Brunei',
    kh: 'Kambodscha',
    cn: 'China',
    ge: 'Georgien',
    'in': 'Indien',
    id: 'Indonesien',
    ir: 'Iran',
    iq: 'Irak',
    il: 'Israel',
    jp: 'Japan',
    jo: 'Jordanien',
    kz: 'Kasachstan',
    kw: 'Kuwait',
    kg: 'Kirgisistan',
    la: 'Laos',
    lb: 'Libanon',
    my: 'Malaysia',
    mv: 'Malediven',
    mn: 'Mongolei',
    mm: 'Myanmar',
    np: 'Nepal',
    kp: 'Nordkorea',
    om: 'Oman',
    pk: 'Pakistan',
    ps: 'Palästina',
    ph: 'Philippinen',
    qa: 'Katar',
    sa: 'Saudi-Arabien',
    sg: 'Singapur',
    kr: 'Südkorea',
    lk: 'Sri Lanka',
    sy: 'Syrien',
    tw: 'Taiwan',
    tj: 'Tadschikistan',
    th: 'Thailand',
    tl: 'Timor-Leste',
    tr: 'Türkei',
    tm: 'Turkmenistan',
    ae: 'Vereinigte Arabische Emirate',
    uz: 'Usbekistan',
    vn: 'Vietnam',
    ye: 'Jemen',
    au: 'Australien',
    fj: 'Fidschi',
    ki: 'Kiribati',
    mh: 'Marshallinseln',
    fm: 'Mikronesien',
    nr: 'Nauru',
    nz: 'Neuseeland',
    pw: 'Palau',
    pg: 'Papua-Neuguinea',
    ws: 'Samoa',
    sb: 'Salomonen',
    to: 'Tonga',
    tv: 'Tuvalu',
    vu: 'Vanuatu',
  },
  continents: {
    europe: 'Europa',
    africa: 'Afrika',
    'north-america': 'Nordamerika',
    'south-america': 'Südamerika',
    asia: 'Asien',
    oceania: 'Ozeanien',
  },
}

export function communityDict(lang: Lang): CommunityDict {
  return lang === 'de' ? COMMUNITY_DE : COMMUNITY_EN
}
