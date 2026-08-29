import type { Guide } from '../guide'
import type { Text } from '../text'

/** Australia. */
export const AUSTRALIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Australia',
    standfirst:
      'An ABN in minutes for free, GST at $75,000, and a company only when the ASIC annual fee buys something you need.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Australia’s sole-trader start is the ABN - the Australian Business Number, applied for free at the Australian Business Register in minutes. With it you invoice; without it, clients must withhold tax at the top rate from your payments, which is the system’s way of making registration universal.',
          'Business income lands in your personal return; there is no separate registration for that. The decisions worth making early are GST (compulsory at $75,000 of annual turnover), a registered business name if trading under one ($45-ish a year via ASIC), and whether the Pty Ltd’s asset protection and 25% small-company rate justify its costs.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole trader or Pty Ltd?',
            options: [
              {
                name: 'Sole trader',
                when: 'The default start.',
                costs: '$0 for the ABN; ~$45/year for a business name if used.',
                catch: 'Personal liability, and personal marginal rates to 45%.',
              },
              {
                name: 'Pty Ltd',
                when: 'Liability, contracts, retained profits.',
                costs: '~$600 ASIC registration plus ~$320/year review fee.',
                catch: 'The company pays 25% (base rate entities), but personal services income rules can attribute one-client contracting income straight back to you - the structure does not launder PSI.',
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
            title: 'Apply for the ABN',
            where: 'abr.gov.au',
            cost: '$0',
            takes: 'Usually instant',
            body: [
              'Free at the official register - the paid lookalike sites are the local trap. myGovID (now myID) is the credential.',
            ],
          },
          {
            title: 'Register GST when the line approaches',
            where: 'Through the ATO via myGov or a BAS agent',
            body: [
              'Compulsory at $75,000 of rolling annual turnover ($150,000 for non-profits; immediately for ride-share). Once in, the Business Activity Statement cycle runs quarterly - GST collected, credits claimed, PAYG instalments alongside.',
            ],
          },
          {
            title: 'Plan for tax and super yourself',
            body: [
              'No employer withholds for you: the ATO moves you onto PAYG instalments after the first bill. Superannuation is voluntary for sole traders - contributing anyway is deductible and is the retirement plan employment used to provide.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'ABN', amount: '$0' },
          { what: 'Business name', amount: '~$45/year' },
          { what: 'Pty Ltd', amount: '~$600 + ~$320/year' },
          { what: 'GST', amount: '10% collected above $75,000 turnover' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ABN', means: 'The business number that makes invoicing possible.' },
          { term: 'ABR', means: 'The register that issues it, free.' },
          { term: 'GST / BAS', means: 'The 10% tax and the activity statement cycle it brings.' },
          { term: 'PAYG instalments', means: 'The prepaid income tax rhythm after year one.' },
          { term: 'ASIC', means: 'The company regulator collecting the annual review fee.' },
          { term: 'PSI', means: 'Personal services income - the rules that see through one-client companies.' },
          { term: 'Super', means: 'Superannuation - voluntary and deductible for sole traders.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Paying an ABN mill for a free registration.',
          'Crossing $75,000 mid-year without registering - the GST owed does not wait for you.',
          'A Pty Ltd built to split one-client income the PSI rules attribute back.',
          'No super contributions for years because nothing forced them.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ABR', href: 'https://www.abr.gov.au', note: 'The free ABN.' },
          { label: 'ATO', href: 'https://www.ato.gov.au', note: 'GST, BAS, PSI, PAYG.' },
          { label: 'business.gov.au', href: 'https://business.gov.au', note: 'The whole-of-government guide.' },
        ],
      },
    ],
  },
}
