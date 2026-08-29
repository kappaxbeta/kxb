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
  index: {
    title: 'The handbook',
    standfirst:
      'What it actually takes to start something of your own: the offices in order, the boxes on the forms, and the traps nobody writes down. Written by people who did it, one country at a time.',
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
    'This is a map drawn by people who walked the route, not legal or tax advice. Laws change; every guide carries the date it was last checked, and the sources to check it against yourself.',
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
  index: {
    title: 'Das Handbuch',
    standfirst:
      'Was es wirklich braucht, um etwas Eigenes anzufangen: die Ämter in der Reihenfolge, die Felder auf den Formularen und die Fallen, die niemand aufschreibt. Geschrieben von Leuten, die es getan haben - Land für Land.',
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
    'Das hier ist eine Landkarte von Leuten, die den Weg gegangen sind - keine Rechts- oder Steuerberatung. Gesetze ändern sich; jeder Guide trägt das Datum seiner letzten Prüfung und die Quellen, an denen du ihn selbst prüfen kannst.',
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
