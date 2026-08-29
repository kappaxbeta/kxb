import type { Guide } from '../guide'
import { langsOf, type Text } from '../text'
import { BULGARIA } from './bg'
import { GERMANY } from './de'
import { NIGERIA } from './ng'

/**
 * Every country the handbook means to cover, written or not.
 *
 * ---------------------------------------------------------------------------
 * Why the unwritten ones are listed at all
 * ---------------------------------------------------------------------------
 * The handbook is being written one country at a time, and the roster *is* the
 * promise: a reader from Austria should find Austria on the page, marked as
 * not written yet, rather than inferring from silence that the site is
 * German-only forever. It is also the contribution surface - when this package
 * becomes its own repository, "pick a country from the list and write it" is
 * the whole onboarding.
 *
 * The list is the whole sovereign roster, shelved by continent. That was a
 * decision, and the opposite one was considered: a short list keeps the
 * written guides visible, but it also tells everybody not on it that they are
 * not expected here. The page keeps the written ones legible instead - full
 * cards on top of each shelf, chips below - so the roster can be complete
 * without burying the three rows that are real.
 *
 * `slug` is the ISO 3166-1 alpha-2 code, lowercased, and is the URL segment.
 * `name` is English here and translated in `dict.ts` with the rest of the
 * page chrome - the roster is data, the page speaks the reader's language.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, lowercase. The URL segment. */
  slug: string
  /** Which shelf of the roster the country sits on. */
  continent: Continent
  /** English name. The page translates it via the dictionary. */
  name: string
  /** The flag, which spells the slug in regional indicators. */
  flag: string
  /** The guide, when it has been written. */
  guide?: Text<Guide>
}

/**
 * The shelves the roster is sorted onto. A closed list like the section kinds,
 * and for the same reason: the page draws one heading per continent, and a
 * typo'd continent would be a heading with one country under it.
 */
export const CONTINENTS = ['europe', 'africa', 'north-america', 'south-america', 'asia', 'oceania'] as const

export type Continent = (typeof CONTINENTS)[number]

export const COUNTRIES: Country[] = [
  { slug: 'al', continent: 'europe', name: 'Albania', flag: '🇦🇱' },
  { slug: 'ad', continent: 'europe', name: 'Andorra', flag: '🇦🇩' },
  { slug: 'at', continent: 'europe', name: 'Austria', flag: '🇦🇹' },
  { slug: 'by', continent: 'europe', name: 'Belarus', flag: '🇧🇾' },
  { slug: 'be', continent: 'europe', name: 'Belgium', flag: '🇧🇪' },
  { slug: 'ba', continent: 'europe', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { slug: 'bg', continent: 'europe', name: 'Bulgaria', flag: '🇧🇬', guide: BULGARIA },
  { slug: 'hr', continent: 'europe', name: 'Croatia', flag: '🇭🇷' },
  { slug: 'cy', continent: 'europe', name: 'Cyprus', flag: '🇨🇾' },
  { slug: 'cz', continent: 'europe', name: 'Czechia', flag: '🇨🇿' },
  { slug: 'dk', continent: 'europe', name: 'Denmark', flag: '🇩🇰' },
  { slug: 'ee', continent: 'europe', name: 'Estonia', flag: '🇪🇪' },
  { slug: 'fi', continent: 'europe', name: 'Finland', flag: '🇫🇮' },
  { slug: 'fr', continent: 'europe', name: 'France', flag: '🇫🇷' },
  { slug: 'de', continent: 'europe', name: 'Germany', flag: '🇩🇪', guide: GERMANY },
  { slug: 'gr', continent: 'europe', name: 'Greece', flag: '🇬🇷' },
  { slug: 'hu', continent: 'europe', name: 'Hungary', flag: '🇭🇺' },
  { slug: 'is', continent: 'europe', name: 'Iceland', flag: '🇮🇸' },
  { slug: 'ie', continent: 'europe', name: 'Ireland', flag: '🇮🇪' },
  { slug: 'it', continent: 'europe', name: 'Italy', flag: '🇮🇹' },
  { slug: 'lv', continent: 'europe', name: 'Latvia', flag: '🇱🇻' },
  { slug: 'li', continent: 'europe', name: 'Liechtenstein', flag: '🇱🇮' },
  { slug: 'lt', continent: 'europe', name: 'Lithuania', flag: '🇱🇹' },
  { slug: 'lu', continent: 'europe', name: 'Luxembourg', flag: '🇱🇺' },
  { slug: 'mt', continent: 'europe', name: 'Malta', flag: '🇲🇹' },
  { slug: 'md', continent: 'europe', name: 'Moldova', flag: '🇲🇩' },
  { slug: 'mc', continent: 'europe', name: 'Monaco', flag: '🇲🇨' },
  { slug: 'me', continent: 'europe', name: 'Montenegro', flag: '🇲🇪' },
  { slug: 'nl', continent: 'europe', name: 'Netherlands', flag: '🇳🇱' },
  { slug: 'mk', continent: 'europe', name: 'North Macedonia', flag: '🇲🇰' },
  { slug: 'no', continent: 'europe', name: 'Norway', flag: '🇳🇴' },
  { slug: 'pl', continent: 'europe', name: 'Poland', flag: '🇵🇱' },
  { slug: 'pt', continent: 'europe', name: 'Portugal', flag: '🇵🇹' },
  { slug: 'ro', continent: 'europe', name: 'Romania', flag: '🇷🇴' },
  { slug: 'sm', continent: 'europe', name: 'San Marino', flag: '🇸🇲' },
  { slug: 'rs', continent: 'europe', name: 'Serbia', flag: '🇷🇸' },
  { slug: 'sk', continent: 'europe', name: 'Slovakia', flag: '🇸🇰' },
  { slug: 'si', continent: 'europe', name: 'Slovenia', flag: '🇸🇮' },
  { slug: 'es', continent: 'europe', name: 'Spain', flag: '🇪🇸' },
  { slug: 'se', continent: 'europe', name: 'Sweden', flag: '🇸🇪' },
  { slug: 'ch', continent: 'europe', name: 'Switzerland', flag: '🇨🇭' },
  { slug: 'ua', continent: 'europe', name: 'Ukraine', flag: '🇺🇦' },
  { slug: 'gb', continent: 'europe', name: 'United Kingdom', flag: '🇬🇧' },
  { slug: 'va', continent: 'europe', name: 'Vatican City', flag: '🇻🇦' },
  { slug: 'dz', continent: 'africa', name: 'Algeria', flag: '🇩🇿' },
  { slug: 'ao', continent: 'africa', name: 'Angola', flag: '🇦🇴' },
  { slug: 'bj', continent: 'africa', name: 'Benin', flag: '🇧🇯' },
  { slug: 'bw', continent: 'africa', name: 'Botswana', flag: '🇧🇼' },
  { slug: 'bf', continent: 'africa', name: 'Burkina Faso', flag: '🇧🇫' },
  { slug: 'bi', continent: 'africa', name: 'Burundi', flag: '🇧🇮' },
  { slug: 'cv', continent: 'africa', name: 'Cabo Verde', flag: '🇨🇻' },
  { slug: 'cm', continent: 'africa', name: 'Cameroon', flag: '🇨🇲' },
  { slug: 'cf', continent: 'africa', name: 'Central African Republic', flag: '🇨🇫' },
  { slug: 'td', continent: 'africa', name: 'Chad', flag: '🇹🇩' },
  { slug: 'km', continent: 'africa', name: 'Comoros', flag: '🇰🇲' },
  { slug: 'cg', continent: 'africa', name: 'Congo', flag: '🇨🇬' },
  { slug: 'cd', continent: 'africa', name: 'DR Congo', flag: '🇨🇩' },
  { slug: 'ci', continent: 'africa', name: 'Côte d’Ivoire', flag: '🇨🇮' },
  { slug: 'dj', continent: 'africa', name: 'Djibouti', flag: '🇩🇯' },
  { slug: 'eg', continent: 'africa', name: 'Egypt', flag: '🇪🇬' },
  { slug: 'gq', continent: 'africa', name: 'Equatorial Guinea', flag: '🇬🇶' },
  { slug: 'er', continent: 'africa', name: 'Eritrea', flag: '🇪🇷' },
  { slug: 'sz', continent: 'africa', name: 'Eswatini', flag: '🇸🇿' },
  { slug: 'et', continent: 'africa', name: 'Ethiopia', flag: '🇪🇹' },
  { slug: 'ga', continent: 'africa', name: 'Gabon', flag: '🇬🇦' },
  { slug: 'gm', continent: 'africa', name: 'Gambia', flag: '🇬🇲' },
  { slug: 'gh', continent: 'africa', name: 'Ghana', flag: '🇬🇭' },
  { slug: 'gn', continent: 'africa', name: 'Guinea', flag: '🇬🇳' },
  { slug: 'gw', continent: 'africa', name: 'Guinea-Bissau', flag: '🇬🇼' },
  { slug: 'ke', continent: 'africa', name: 'Kenya', flag: '🇰🇪' },
  { slug: 'ls', continent: 'africa', name: 'Lesotho', flag: '🇱🇸' },
  { slug: 'lr', continent: 'africa', name: 'Liberia', flag: '🇱🇷' },
  { slug: 'ly', continent: 'africa', name: 'Libya', flag: '🇱🇾' },
  { slug: 'mg', continent: 'africa', name: 'Madagascar', flag: '🇲🇬' },
  { slug: 'mw', continent: 'africa', name: 'Malawi', flag: '🇲🇼' },
  { slug: 'ml', continent: 'africa', name: 'Mali', flag: '🇲🇱' },
  { slug: 'mr', continent: 'africa', name: 'Mauritania', flag: '🇲🇷' },
  { slug: 'mu', continent: 'africa', name: 'Mauritius', flag: '🇲🇺' },
  { slug: 'ma', continent: 'africa', name: 'Morocco', flag: '🇲🇦' },
  { slug: 'mz', continent: 'africa', name: 'Mozambique', flag: '🇲🇿' },
  { slug: 'na', continent: 'africa', name: 'Namibia', flag: '🇳🇦' },
  { slug: 'ne', continent: 'africa', name: 'Niger', flag: '🇳🇪' },
  { slug: 'ng', continent: 'africa', name: 'Nigeria', flag: '🇳🇬', guide: NIGERIA },
  { slug: 'rw', continent: 'africa', name: 'Rwanda', flag: '🇷🇼' },
  { slug: 'st', continent: 'africa', name: 'São Tomé and Príncipe', flag: '🇸🇹' },
  { slug: 'sn', continent: 'africa', name: 'Senegal', flag: '🇸🇳' },
  { slug: 'sc', continent: 'africa', name: 'Seychelles', flag: '🇸🇨' },
  { slug: 'sl', continent: 'africa', name: 'Sierra Leone', flag: '🇸🇱' },
  { slug: 'so', continent: 'africa', name: 'Somalia', flag: '🇸🇴' },
  { slug: 'za', continent: 'africa', name: 'South Africa', flag: '🇿🇦' },
  { slug: 'ss', continent: 'africa', name: 'South Sudan', flag: '🇸🇸' },
  { slug: 'sd', continent: 'africa', name: 'Sudan', flag: '🇸🇩' },
  { slug: 'tz', continent: 'africa', name: 'Tanzania', flag: '🇹🇿' },
  { slug: 'tg', continent: 'africa', name: 'Togo', flag: '🇹🇬' },
  { slug: 'tn', continent: 'africa', name: 'Tunisia', flag: '🇹🇳' },
  { slug: 'ug', continent: 'africa', name: 'Uganda', flag: '🇺🇬' },
  { slug: 'zm', continent: 'africa', name: 'Zambia', flag: '🇿🇲' },
  { slug: 'zw', continent: 'africa', name: 'Zimbabwe', flag: '🇿🇼' },
  { slug: 'ag', continent: 'north-america', name: 'Antigua and Barbuda', flag: '🇦🇬' },
  { slug: 'bs', continent: 'north-america', name: 'Bahamas', flag: '🇧🇸' },
  { slug: 'bb', continent: 'north-america', name: 'Barbados', flag: '🇧🇧' },
  { slug: 'bz', continent: 'north-america', name: 'Belize', flag: '🇧🇿' },
  { slug: 'ca', continent: 'north-america', name: 'Canada', flag: '🇨🇦' },
  { slug: 'cr', continent: 'north-america', name: 'Costa Rica', flag: '🇨🇷' },
  { slug: 'cu', continent: 'north-america', name: 'Cuba', flag: '🇨🇺' },
  { slug: 'dm', continent: 'north-america', name: 'Dominica', flag: '🇩🇲' },
  { slug: 'do', continent: 'north-america', name: 'Dominican Republic', flag: '🇩🇴' },
  { slug: 'sv', continent: 'north-america', name: 'El Salvador', flag: '🇸🇻' },
  { slug: 'gd', continent: 'north-america', name: 'Grenada', flag: '🇬🇩' },
  { slug: 'gt', continent: 'north-america', name: 'Guatemala', flag: '🇬🇹' },
  { slug: 'ht', continent: 'north-america', name: 'Haiti', flag: '🇭🇹' },
  { slug: 'hn', continent: 'north-america', name: 'Honduras', flag: '🇭🇳' },
  { slug: 'jm', continent: 'north-america', name: 'Jamaica', flag: '🇯🇲' },
  { slug: 'mx', continent: 'north-america', name: 'Mexico', flag: '🇲🇽' },
  { slug: 'ni', continent: 'north-america', name: 'Nicaragua', flag: '🇳🇮' },
  { slug: 'pa', continent: 'north-america', name: 'Panama', flag: '🇵🇦' },
  { slug: 'kn', continent: 'north-america', name: 'St. Kitts and Nevis', flag: '🇰🇳' },
  { slug: 'lc', continent: 'north-america', name: 'St. Lucia', flag: '🇱🇨' },
  { slug: 'vc', continent: 'north-america', name: 'St. Vincent and the Grenadines', flag: '🇻🇨' },
  { slug: 'tt', continent: 'north-america', name: 'Trinidad and Tobago', flag: '🇹🇹' },
  { slug: 'us', continent: 'north-america', name: 'United States', flag: '🇺🇸' },
  { slug: 'ar', continent: 'south-america', name: 'Argentina', flag: '🇦🇷' },
  { slug: 'bo', continent: 'south-america', name: 'Bolivia', flag: '🇧🇴' },
  { slug: 'br', continent: 'south-america', name: 'Brazil', flag: '🇧🇷' },
  { slug: 'cl', continent: 'south-america', name: 'Chile', flag: '🇨🇱' },
  { slug: 'co', continent: 'south-america', name: 'Colombia', flag: '🇨🇴' },
  { slug: 'ec', continent: 'south-america', name: 'Ecuador', flag: '🇪🇨' },
  { slug: 'gy', continent: 'south-america', name: 'Guyana', flag: '🇬🇾' },
  { slug: 'py', continent: 'south-america', name: 'Paraguay', flag: '🇵🇾' },
  { slug: 'pe', continent: 'south-america', name: 'Peru', flag: '🇵🇪' },
  { slug: 'sr', continent: 'south-america', name: 'Suriname', flag: '🇸🇷' },
  { slug: 'uy', continent: 'south-america', name: 'Uruguay', flag: '🇺🇾' },
  { slug: 've', continent: 'south-america', name: 'Venezuela', flag: '🇻🇪' },
  { slug: 'af', continent: 'asia', name: 'Afghanistan', flag: '🇦🇫' },
  { slug: 'am', continent: 'asia', name: 'Armenia', flag: '🇦🇲' },
  { slug: 'az', continent: 'asia', name: 'Azerbaijan', flag: '🇦🇿' },
  { slug: 'bh', continent: 'asia', name: 'Bahrain', flag: '🇧🇭' },
  { slug: 'bd', continent: 'asia', name: 'Bangladesh', flag: '🇧🇩' },
  { slug: 'bt', continent: 'asia', name: 'Bhutan', flag: '🇧🇹' },
  { slug: 'bn', continent: 'asia', name: 'Brunei', flag: '🇧🇳' },
  { slug: 'kh', continent: 'asia', name: 'Cambodia', flag: '🇰🇭' },
  { slug: 'cn', continent: 'asia', name: 'China', flag: '🇨🇳' },
  { slug: 'ge', continent: 'asia', name: 'Georgia', flag: '🇬🇪' },
  { slug: 'in', continent: 'asia', name: 'India', flag: '🇮🇳' },
  { slug: 'id', continent: 'asia', name: 'Indonesia', flag: '🇮🇩' },
  { slug: 'ir', continent: 'asia', name: 'Iran', flag: '🇮🇷' },
  { slug: 'iq', continent: 'asia', name: 'Iraq', flag: '🇮🇶' },
  { slug: 'il', continent: 'asia', name: 'Israel', flag: '🇮🇱' },
  { slug: 'jp', continent: 'asia', name: 'Japan', flag: '🇯🇵' },
  { slug: 'jo', continent: 'asia', name: 'Jordan', flag: '🇯🇴' },
  { slug: 'kz', continent: 'asia', name: 'Kazakhstan', flag: '🇰🇿' },
  { slug: 'kw', continent: 'asia', name: 'Kuwait', flag: '🇰🇼' },
  { slug: 'kg', continent: 'asia', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { slug: 'la', continent: 'asia', name: 'Laos', flag: '🇱🇦' },
  { slug: 'lb', continent: 'asia', name: 'Lebanon', flag: '🇱🇧' },
  { slug: 'my', continent: 'asia', name: 'Malaysia', flag: '🇲🇾' },
  { slug: 'mv', continent: 'asia', name: 'Maldives', flag: '🇲🇻' },
  { slug: 'mn', continent: 'asia', name: 'Mongolia', flag: '🇲🇳' },
  { slug: 'mm', continent: 'asia', name: 'Myanmar', flag: '🇲🇲' },
  { slug: 'np', continent: 'asia', name: 'Nepal', flag: '🇳🇵' },
  { slug: 'kp', continent: 'asia', name: 'North Korea', flag: '🇰🇵' },
  { slug: 'om', continent: 'asia', name: 'Oman', flag: '🇴🇲' },
  { slug: 'pk', continent: 'asia', name: 'Pakistan', flag: '🇵🇰' },
  { slug: 'ps', continent: 'asia', name: 'Palestine', flag: '🇵🇸' },
  { slug: 'ph', continent: 'asia', name: 'Philippines', flag: '🇵🇭' },
  { slug: 'qa', continent: 'asia', name: 'Qatar', flag: '🇶🇦' },
  { slug: 'sa', continent: 'asia', name: 'Saudi Arabia', flag: '🇸🇦' },
  { slug: 'sg', continent: 'asia', name: 'Singapore', flag: '🇸🇬' },
  { slug: 'kr', continent: 'asia', name: 'South Korea', flag: '🇰🇷' },
  { slug: 'lk', continent: 'asia', name: 'Sri Lanka', flag: '🇱🇰' },
  { slug: 'sy', continent: 'asia', name: 'Syria', flag: '🇸🇾' },
  { slug: 'tw', continent: 'asia', name: 'Taiwan', flag: '🇹🇼' },
  { slug: 'tj', continent: 'asia', name: 'Tajikistan', flag: '🇹🇯' },
  { slug: 'th', continent: 'asia', name: 'Thailand', flag: '🇹🇭' },
  { slug: 'tl', continent: 'asia', name: 'Timor-Leste', flag: '🇹🇱' },
  { slug: 'tr', continent: 'asia', name: 'Türkiye', flag: '🇹🇷' },
  { slug: 'tm', continent: 'asia', name: 'Turkmenistan', flag: '🇹🇲' },
  { slug: 'ae', continent: 'asia', name: 'United Arab Emirates', flag: '🇦🇪' },
  { slug: 'uz', continent: 'asia', name: 'Uzbekistan', flag: '🇺🇿' },
  { slug: 'vn', continent: 'asia', name: 'Vietnam', flag: '🇻🇳' },
  { slug: 'ye', continent: 'asia', name: 'Yemen', flag: '🇾🇪' },
  { slug: 'au', continent: 'oceania', name: 'Australia', flag: '🇦🇺' },
  { slug: 'fj', continent: 'oceania', name: 'Fiji', flag: '🇫🇯' },
  { slug: 'ki', continent: 'oceania', name: 'Kiribati', flag: '🇰🇮' },
  { slug: 'mh', continent: 'oceania', name: 'Marshall Islands', flag: '🇲🇭' },
  { slug: 'fm', continent: 'oceania', name: 'Micronesia', flag: '🇫🇲' },
  { slug: 'nr', continent: 'oceania', name: 'Nauru', flag: '🇳🇷' },
  { slug: 'nz', continent: 'oceania', name: 'New Zealand', flag: '🇳🇿' },
  { slug: 'pw', continent: 'oceania', name: 'Palau', flag: '🇵🇼' },
  { slug: 'pg', continent: 'oceania', name: 'Papua New Guinea', flag: '🇵🇬' },
  { slug: 'ws', continent: 'oceania', name: 'Samoa', flag: '🇼🇸' },
  { slug: 'sb', continent: 'oceania', name: 'Solomon Islands', flag: '🇸🇧' },
  { slug: 'to', continent: 'oceania', name: 'Tonga', flag: '🇹🇴' },
  { slug: 'tv', continent: 'oceania', name: 'Tuvalu', flag: '🇹🇻' },
  { slug: 'vu', continent: 'oceania', name: 'Vanuatu', flag: '🇻🇺' },
]

export function countryBySlug(slug: string): Country | undefined {
  return COUNTRIES.find((c) => c.slug === slug)
}

/** The written ones first, then the rest - the order a reader scans in. */
export function countriesByReadiness(): { written: Country[]; planned: Country[] } {
  return {
    written: COUNTRIES.filter((c) => c.guide),
    planned: COUNTRIES.filter((c) => !c.guide),
  }
}

/**
 * The roster shelved by continent, written countries first on each shelf.
 * Continents with nothing on them are simply absent - the page never draws an
 * empty heading, so adding a continent here costs nothing until a country
 * claims it.
 */
export function countriesByContinent(): { continent: Continent; countries: Country[] }[] {
  return CONTINENTS.map((continent) => ({
    continent,
    countries: [
      ...COUNTRIES.filter((c) => c.continent === continent && c.guide),
      ...COUNTRIES.filter((c) => c.continent === continent && !c.guide),
    ],
  })).filter((shelf) => shelf.countries.length > 0)
}

/** Which languages a country's guide exists in, for the roster's badges. */
export function countryLangs(country: Country): string[] {
  return country.guide ? langsOf(country.guide) : []
}
