import type { Guide } from '../guide'
import type { Text } from '../text'

/** United Arab Emirates. */
export const UAE: Text<Guide> = {
  en: {
    title: 'Starting a business in the UAE',
    standfirst:
      'Mainland or free zone is the whole question - and since 2023 the 9% corporate tax means the zero-tax pitch needs reading glasses.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Every UAE business exists under a licence: mainland (from an emirate’s Department of Economic Development, trading anywhere in the UAE) or one of forty-plus free zones (cheaper bundles, 100% foreign ownership always, but mainland trade requires arrangements). Freelance permits from the free zones are the light entry - a licence plus visa eligibility for a few thousand dirhams a year.',
          'The tax story needs its 2023 update said plainly: corporate tax at 9% now applies above AED 375,000 of profit, with small business relief (electable, revenue under AED 3 million, running through 2026) taking most small operators back to zero for now. Free zone entities keep 0% only on qualifying income under conditions with real accounting requirements behind them. There is still no personal income tax - salaries and dividends land untaxed - but "the UAE has no tax" is no longer a sentence a founder can plan on.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Freelance permit, free zone company, or mainland LLC?',
            options: [
              {
                name: 'Freelance permit',
                when: 'Solo professional services.',
                costs: 'AED 7,500-20,000/year by zone, visa extra.',
                catch: 'Scope limited to the permitted activities; clients occasionally want a "real" company.',
              },
              {
                name: 'Free zone FZE/FZCO',
                when: 'The default startup vehicle - ownership, bundled visas, fast setup.',
                costs: 'AED 12,000-30,000/year for licence + flexi-desk packages.',
                catch: 'Direct mainland trade needs a distributor or branch; the qualifying-income rules decide whether the 0% actually applies.',
              },
              {
                name: 'Mainland LLC',
                when: 'UAE-market business - retail, services to local companies, government work.',
                costs: 'Licence and fees typically AED 15,000-30,000/year; 100% foreign ownership now allowed for most activities.',
                catch: 'Office-space requirements are real, and activity lists gate what a licence may do.',
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
            title: 'Pick the jurisdiction against the actual customer base',
            body: [
              'Selling to the world from a laptop: any reputable free zone. Selling to Dubai companies: mainland, or price the workarounds honestly. The licence cost differences are noise next to getting this wrong.',
            ],
          },
          {
            title: 'Licence, then visa, then bank',
            takes: 'Licence in days; the bank account is the slow step',
            body: [
              'The licence application wants passport, activity choice and the package selection; establishment card and residence visa follow. Corporate bank onboarding runs compliance checks that can take weeks - start it immediately and bring substance (contracts, CV, business plan).',
            ],
            watch: 'The bank account, not the licence, is the gate. Budget weeks and have documents ready.',
          },
          {
            title: 'Register for corporate tax - everyone',
            where: 'EmaraTax, the FTA portal',
            body: [
              'Registration is required regardless of whether relief takes the bill to zero; deadlines by licence date carry AED 10,000 late penalties. Elect small business relief if eligible; keep the books that prove it.',
            ],
          },
          {
            title: 'VAT at AED 375,000',
            body: [
              'Compulsory registration at AED 375,000 of taxable supplies (voluntary at half that); 5% standard rate, quarterly filings on EmaraTax.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Freelance permit', amount: 'AED 7,500-20,000/year' },
          { what: 'Free zone company package', amount: 'AED 12,000-30,000/year' },
          { what: 'Residence visa', amount: 'AED 3,000-6,000', note: 'Per person, plus medical and Emirates ID.' },
          { what: 'Corporate tax', amount: '9% above AED 375,000 profit', note: 'Small business relief to zero through 2026 if elected.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'DED', means: 'The emirate economic department issuing mainland licences.' },
          { term: 'Free zone', means: 'The forty-plus licensing jurisdictions with bundled packages.' },
          { term: 'FZE / FZCO', means: 'Single- and multi-shareholder free zone companies.' },
          { term: 'EmaraTax / FTA', means: 'The federal tax authority and its portal.' },
          { term: 'Small business relief', means: 'The election taking sub-AED 3M revenue back to 0% through 2026.' },
          { term: 'Qualifying income', means: 'What keeps a free zone entity at 0% - conditions attached.' },
          { term: 'Establishment card', means: 'The immigration-side company registration behind visas.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing corporate tax registration because the expected bill is zero - the penalty is not.',
          'A free zone licence sold for a mainland business model.',
          'Bank onboarding assumed instant.',
          'Zone package renewals climbing after a cheap first year - read year two’s price.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'FTA / EmaraTax', href: 'https://tax.gov.ae', note: 'Corporate tax and VAT rules.' },
          { label: 'Ministry of Economy', href: 'https://www.moec.gov.ae', note: 'The mainland framework.' },
        ],
      },
    ],
  },
}
