import type { Guide } from '../guide'
import type { Text } from '../text'

/** Sweden. */
export const SWEDEN: Text<Guide> = {
  en: {
    title: 'Starting a business in Sweden',
    standfirst:
      'F-skatt is the credential that makes you a business - the registration is a tax approval, not a registry entry.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The Swedish system pivots on one credential: F-skatt (F-tax) approval from Skatteverket. It is what tells a client they can pay your invoice without withholding tax and employer contributions - which is why Swedish clients ask "do you have F-skatt?" before anything else. The approval, VAT registration and (for a company) employer registration all happen in one filing on verksamt.se.',
          'An enskild näringsidkare (sole trader) does not even need to register with Bolagsverket unless the name should be protected - the F-skatt approval is the founding act. The aktiebolag (AB) at SEK 25,000 capital is the standard upgrade, common early in Sweden because the corporate-tax-plus-dividend rules (3:12) treat small AB owners comparatively well.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Enskild firma or AB?',
            options: [
              {
                name: 'Enskild näringsverksamhet',
                when: 'Starting out, testing, staying small.',
                costs: 'Free (Bolagsverket name registration optional, ~SEK 1,400).',
                catch: 'Egenavgifter (~29% social contributions on profit) plus municipal income tax - the marginal rate climbs fast.',
              },
              {
                name: 'Aktiebolag (AB)',
                when: 'Anything serious, and earlier than in most countries.',
                costs: 'SEK 25,000 capital (usable as working capital) + ~SEK 1,900 registration.',
                catch: 'The 3:12 rules governing how much you can take as lower-taxed dividend are famously intricate - this is where Swedish accountants earn their fee.',
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
            title: 'Apply for F-skatt, VAT and the rest in one filing',
            where: 'verksamt.se, with BankID',
            cost: 'SEK 0 for the approvals themselves',
            takes: 'Days to a few weeks',
            body: [
              'One application covers F-skatt approval, moms (VAT) registration and employer registration if needed. You estimate the first year’s profit; Skatteverket sets monthly preliminary tax from it.',
            ],
          },
          {
            title: 'For an AB: form it at Bolagsverket first',
            body: [
              'Deposit the SEK 25,000, file the formation online, then run the same verksamt.se tax filing for the company. Off-the-shelf lagerbolag exist for people who want the org number today.',
            ],
          },
          {
            title: 'Know your moms position',
            body: [
              'VAT registration is compulsory above SEK 120,000 of annual turnover (the threshold was raised in 2025); below it you may stay outside. Rates are 25/12/6%, filing monthly, quarterly or yearly by size.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'F-skatt + moms registration', amount: 'SEK 0' },
          { what: 'AB registration', amount: '~SEK 1,900 + SEK 25,000 capital' },
          { what: 'Egenavgifter (sole trader)', amount: '~29% of profit' },
          { what: 'Accountant for an AB', amount: 'SEK 10,000-25,000/year', note: 'The 3:12 arithmetic alone pays for it.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'F-skatt', means: 'The approval that lets clients pay your invoices gross - the true founding act.' },
          { term: 'verksamt.se', means: 'The joint portal of Skatteverket and Bolagsverket.' },
          { term: 'Enskild näringsverksamhet', means: 'The sole-trader form.' },
          { term: 'Aktiebolag (AB)', means: 'The SEK 25,000 limited company.' },
          { term: 'Egenavgifter', means: 'Self-employed social contributions, ~29%.' },
          { term: '3:12-reglerna', means: 'The rules splitting AB owner income between salary and dividend.' },
          { term: 'Moms', means: 'VAT; compulsory registration above SEK 120,000.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Invoicing without F-skatt approval and having the client forced to treat you as an employee.',
          'Setting the preliminary tax estimate carelessly - too low means a lump sum plus adjusted instalments later.',
          'Taking AB dividends without checking the 3:12 space first.',
          'Assuming the old SEK 80,000 moms threshold - it is 120,000 now.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'verksamt.se', href: 'https://www.verksamt.se', note: 'The one filing, with English guidance.' },
          { label: 'Skatteverket', href: 'https://www.skatteverket.se', note: 'F-skatt, moms, egenavgifter.' },
          { label: 'Bolagsverket', href: 'https://www.bolagsverket.se', note: 'AB formation and name protection.' },
        ],
      },
    ],
  },
}
