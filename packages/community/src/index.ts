/**
 * `@kxb/community` - the community handbook, as data.
 *
 * Everything the public community pages say lives in this package: the country
 * guides, the shared chapters, and the page chrome in both languages. There is
 * no React in here and no import from the app - the app is one renderer of
 * this content, and the package is written to be lifted out into its own
 * repository without either side changing.
 *
 * The map:
 *   - `text.ts`      - the language primitive: whole documents per language,
 *                      English as the visible fallback.
 *   - `guide.ts`     - what a document is made of: a closed vocabulary of
 *                      section shapes (steps, choices, terms, costs, ...).
 *   - `countries/`   - one guide per country, plus the roster of countries
 *                      that are promised but not written.
 *   - `chapters/`    - what is true everywhere: promotion, the legal shell,
 *                      Stripe.
 *   - `dict.ts`      - the page chrome, key-by-key per language.
 */
export { FALLBACK, isLang, LANGS, langsOf, pick } from './text'
export type { Lang, Text } from './text'
export type { Choice, Cost, Guide, Section, SectionKind, Source, Step, Term } from './guide'
export { CONTINENTS, COUNTRIES, countriesByContinent, countriesByReadiness, countryBySlug, countryLangs } from './countries/index'
export type { Continent, Country } from './countries/index'
export { CHAPTERS, chapterBySlug } from './chapters/index'
export type { Chapter } from './chapters/index'
export { STARTER, STARTER_SLUG } from './starter'
export { BLOG, blogBySlug, blogIndex } from './blog'
export type { BlogEntry, BlogPost } from './blog'
export { COMMUNITY_DE, COMMUNITY_EN, communityDict } from './dict'
export type { CommunityDict } from './dict'
