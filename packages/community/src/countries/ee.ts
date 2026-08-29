import type { Guide } from '../guide'
import type { Text } from '../text'

/** Estonia. */
export const ESTONIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Estonia',
    standfirst:
      'The famous fifteen-minute OÜ, the 0%-until-distributed tax, and what e-Residency actually does and does not give a foreign founder.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Estonia earned the reputation: with an Estonian ID card or e-Residency, an OÜ (private limited company) is genuinely registered online in minutes, share capital can be €0.01 per share since the 2023 reform, and corporate profit is taxed only when distributed - retained earnings carry 0%, distributions ~22% since 2025.',
          'The honest footnote for foreigners: e-Residency is a digital signature, not a residence permit, not a tax residency, and not a bank account. A company run from Germany by its only shareholder is, by ordinary international rules, likely taxable in Germany whatever its Estonian registration says. The Estonian setup shines for genuinely location-independent businesses and for Estonians; it is not a tax trick, and the providers selling it as one are the trap.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'OÜ or FIE?',
            options: [
              {
                name: 'OÜ (osaühing)',
                when: 'The default for almost everything - the whole ecosystem is built around it.',
                costs: '€265 state fee online; capital from €0.01/share.',
                catch: 'Paying yourself means board-member fees or salary with Estonian social tax (33%) on top - the 0% headline is about the company, not about you.',
              },
              {
                name: 'FIE (sole trader)',
                when: 'Small local activity. Rare among founders.',
                costs: '€20 registration.',
                catch: 'Social tax on business income with advance payments; the OÜ is usually simpler beyond hobby scale.',
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
            title: 'Get the credential',
            body: [
              'Estonian residents have the ID card. Foreigners apply for e-Residency (€100-120, collected at an embassy) - allow several weeks. This is the signing identity for everything.',
            ],
          },
          {
            title: 'Register the OÜ',
            where: 'The e-Business Register (ariregister.rik.ee)',
            cost: '€265',
            takes: 'Minutes to file, typically a day to be entered',
            body: [
              'Standard articles, board members, and an Estonian legal address plus contact person - non-residents rent both from a service provider (€100-300/year, the real recurring cost of the famous setup).',
            ],
          },
          {
            title: 'Register for VAT when it applies',
            where: 'e-MTA, the tax board portal',
            body: [
              'Compulsory at €40,000 of annual Estonian taxable turnover; the EU OSS and reverse-charge rules govern cross-border sales as everywhere. Estonian VAT is 24% since mid-2025.',
            ],
          },
          {
            title: 'Report even when nothing happens',
            body: [
              'The annual report is due within six months of year end for every OÜ, dormant or not, and the register strikes off non-filers. Monthly TSD declarations apply only once there are payouts.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'e-Residency', amount: '€100-120', note: 'Foreign founders only.' },
          { what: 'OÜ state fee', amount: '€265' },
          { what: 'Legal address + contact person', amount: '€100-300/year', note: 'Non-residents; the quiet recurring cost.' },
          { what: 'Distribution tax', amount: '~22% of dividends', note: '0% while profit stays in the company.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'OÜ', means: 'The private limited company everything here is built around.' },
          { term: 'e-Residency', means: 'A state digital identity for signing - not residency, not tax residency.' },
          { term: 'Äriregister', means: 'The e-Business Register where the fifteen minutes happen.' },
          { term: 'e-MTA', means: 'The tax and customs board portal.' },
          { term: 'TSD', means: 'The monthly declaration for payouts and their taxes.' },
          { term: 'Social tax', means: '33% on salaries and board fees - the number the 0% headline hides.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Running the company from your home country and assuming Estonian tax law is the only one that applies.',
          'Confusing 0% retained-profit tax with 0% tax.',
          'Letting the annual report lapse because the company was quiet - strike-off follows.',
          'Believing an e-Residency marketing site over the tax board.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'e-Business Register', href: 'https://ariregister.rik.ee', note: 'The registration itself.' },
          { label: 'e-Residency', href: 'https://www.e-resident.gov.ee', note: 'The official programme, including its honest limits.' },
          { label: 'Estonian Tax and Customs Board', href: 'https://www.emta.ee', note: 'VAT, TSD, distribution tax.' },
        ],
      },
    ],
  },
}
