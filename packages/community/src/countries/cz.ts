import type { Guide } from '../guide'
import type { Text } from '../text'

/** Czechia. */
export const CZECHIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Czechia',
    standfirst:
      'The živnost licence, the 60/40 expense fiction, and a flat-tax regime that folds everything into one monthly payment.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Czech self-employment runs on the živnostenské oprávnění - the trade licence. One visit (or data-box filing) at any trade office registers the licence and, through the single registration form, the tax office, social security and health insurance at once. Most services and IT fall under the free trade ("volná živnost"), which needs no qualification and covers eighty listed activities under one licence.',
          'The tax landscape is friendlier than the paperwork: OSVČ can deduct flat percentage expenses without receipts - 60% of revenue for trades, 40% for independent professions - or opt into paušální daň, a single monthly payment (from roughly CZK 8,700 in the lowest band) that settles income tax, social and health in one transfer with no annual return at all.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'OSVČ or s.r.o.?',
            options: [
              {
                name: 'OSVČ (self-employed with a živnost)',
                when: 'The default. The flat expense percentages make modest service businesses nearly bookkeeping-free.',
                costs: 'CZK 1,000 licence fee, once.',
                catch: 'Minimum social and health advances are due monthly from the start (reduced in the first years), profit or not.',
              },
              {
                name: 's.r.o.',
                when: 'Liability or partners. Minimum capital is CZK 1.',
                costs: 'Notary and registrations, commonly CZK 8,000-15,000 all-in.',
                catch: 'Real accounting from day one, and profit extraction is taxed twice (19% corporate + 15% dividend withholding).',
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        steps: [
          {
            title: 'File the single registration at a trade office',
            where: 'Any živnostenský úřad, or via the JRF form and a data box',
            cost: 'CZK 1,000',
            takes: 'The licence is usually active within days',
            body: [
              'Pick the free trade and tick the activity fields you might ever use - they cost nothing extra. The same form registers you for income tax and starts social (ČSSZ) and health insurance advances.',
            ],
          },
          {
            title: 'Consider paušální daň before the year starts',
            where: 'The tax office, by the 10th of January (or on registration)',
            body: [
              'One monthly payment, no tax return, no insurance overviews - available up to CZK 2,000,000 revenue, in three bands. The catch: no expense deduction, no tax credits, and VAT registration disqualifies you.',
            ],
          },
          {
            title: 'Watch the VAT line',
            body: [
              'Registration becomes compulsory at CZK 2,000,000 of turnover in a calendar year. B2B services to other EU countries trigger the lighter "identified person" status instead - a common surprise for freelancers invoicing abroad.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Živnost licence', amount: 'CZK 1,000', note: 'Once, covering all free-trade activities.' },
          { what: 'Social + health minimum advances', amount: '~CZK 8,000/month combined at full rate', note: 'Lower in the first years of activity.' },
          { what: 'Paušální daň, band one', amount: '~CZK 8,700/month', note: 'Everything in one payment, if it fits.' },
          { what: 's.r.o. all-in', amount: 'CZK 8,000-15,000' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Živnostenské oprávnění', means: 'The trade licence; volná živnost is the free variant.' },
          { term: 'OSVČ', means: 'The self-employed person - the status itself.' },
          { term: 'JRF', means: 'The single registration form covering tax, social and health at once.' },
          { term: 'Paušální výdaje', means: 'The 60%/40% no-receipt expense deduction.' },
          { term: 'Paušální daň', means: 'The all-in-one monthly flat tax.' },
          { term: 'Datová schránka', means: 'The mandatory data box every business communicates through.' },
          { term: 'Identifikovaná osoba', means: 'The light VAT status triggered by EU cross-border services.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing the January window for paušální daň and paying a year of ordinary admin for nothing.',
          'Invoicing an EU client without the identified-person registration.',
          'Ignoring the data box - official mail delivered there counts as read.',
          'The švarcsystém rules: full-time contractor for one company is illegal employment disguised, and both sides are fined.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Živnostenský rejstřík', href: 'https://www.rzp.cz', note: 'The trade register and the JRF.' },
          { label: 'Finanční správa', href: 'https://www.financnisprava.cz', note: 'Paušální daň bands and VAT rules.' },
          { label: 'BusinessInfo', href: 'https://www.businessinfo.cz', note: 'The official business portal.' },
        ],
      },
    ],
  },
}
