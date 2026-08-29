import type { Guide } from '../guide'
import type { Text } from '../text'

/** Singapore. */
export const SINGAPORE: Text<Guide> = {
  en: {
    title: 'Starting a business in Singapore',
    standfirst:
      'BizFile registers a Pte Ltd in a day - the one hard requirement for foreigners is the local resident director, and the tax exemptions do the rest of the selling.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Singapore’s process is as clean as the reputation: ACRA’s BizFile portal registers a sole proprietorship for S$115 or a private limited company for S$315, usually within the day. The company is the default choice at almost any seriousness - the startup tax exemptions (75% off the first S$100k of chargeable income for three years, then partial exemptions) and the flat 17% rate make it cheap to run profitably.',
          'The one structural hurdle for foreign founders: every company needs at least one director who is ordinarily resident in Singapore (citizen, PR, or holder of the right pass). Nominee-director services exist at a price; the requirement is where every remote-founding plan meets reality.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole proprietorship or Pte Ltd?',
            options: [
              {
                name: 'Sole proprietorship',
                when: 'Local individuals with small, low-risk trade.',
                costs: 'S$115 (S$15 name + S$100 registration), renewable annually.',
                catch: 'No shield, personal rates, annual renewal - locals outgrow it fast.',
              },
              {
                name: 'Private limited (Pte Ltd)',
                when: 'Nearly everything else.',
                costs: 'S$315; no minimum capital beyond S$1.',
                catch: 'The resident-director requirement, a company secretary within six months, and annual filings with ACRA and IRAS.',
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
            title: 'Register on BizFile',
            where: 'bizfile.gov.sg, with Singpass (or through a filing agent for foreigners)',
            cost: 'S$115-315',
            takes: 'Usually same day',
            body: [
              'Name approval and incorporation in one flow; foreigners without Singpass must file through a registered agent, which in practice bundles the nominee director and secretary.',
            ],
          },
          {
            title: 'Meet the officers requirements',
            body: [
              'Resident director from day one, company secretary within six months, a registered office address, and an auditor unless small-company exempt (most startups are).',
            ],
          },
          {
            title: 'Corporate tax and the exemptions',
            where: 'IRAS via myTax portal',
            body: [
              'Estimated chargeable income files within three months of year end; the startup exemption and partial exemption apply automatically when claimed. No tax on capital gains or dividends paid out - the reason holding structures live here.',
            ],
          },
          {
            title: 'GST only at scale',
            body: [
              'Registration is compulsory at S$1 million of annual taxable turnover - high enough that most services startups defer it for years. Voluntary registration to reclaim input GST carries a two-year commitment.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Pte Ltd registration', amount: 'S$315' },
          { what: 'Nominee director (foreigners)', amount: 'S$1,500-3,000/year', note: 'Plus a deposit commonly.' },
          { what: 'Secretary + address bundle', amount: 'S$300-800/year' },
          { what: 'Corporate tax', amount: '17% with startup exemptions', note: 'Effective single digits early.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ACRA / BizFile', means: 'The registrar and its portal.' },
          { term: 'Singpass', means: 'The digital identity locals file with.' },
          { term: 'UEN', means: 'The unique entity number every business carries.' },
          { term: 'Resident director', means: 'The one hard requirement for foreign founders.' },
          { term: 'IRAS', means: 'The tax authority.' },
          { term: 'ECI', means: 'The estimated chargeable income filing after year end.' },
          { term: 'GST', means: 'Compulsory only at S$1M turnover.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Underpricing the nominee-director cost in the remote-founding budget.',
          'Missing the secretary deadline at month six.',
          'Assuming Singapore incorporation moves personal tax residency - it does not.',
          'Voluntary GST registration for the look of it, with the two-year lock-in.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ACRA', href: 'https://www.acra.gov.sg', note: 'BizFile and the requirements.' },
          { label: 'IRAS', href: 'https://www.iras.gov.sg', note: 'Exemptions, ECI, GST.' },
        ],
      },
    ],
  },
}
