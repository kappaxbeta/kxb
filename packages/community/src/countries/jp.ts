import type { Guide } from '../guide'
import type { Text } from '../text'

/** Japan. */
export const JAPAN: Text<Guide> = {
  en: {
    title: 'Starting a business in Japan',
    standfirst:
      'The kojin jigyō opens with one free form - the blue return election beside it is worth real money, and the invoice system changed the old consumption-tax holiday.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'A Japanese sole proprietorship (個人事業 kojin jigyō) starts with the kaigyō todoke - a one-page notification to the tax office within a month of starting, free, no approval involved. File the aoiro shinkoku (blue return) election alongside it: it buys a deduction of up to ¥650,000, loss carry-forwards and family-salary deductions for the price of proper books, and it must be elected within two months of opening - the classic missed deadline.',
          'The consumption-tax picture changed in 2023: the old comfortable rule (exempt for two years, then only above ¥10 million of base-period sales) still exists, but the qualified invoice system means B2B customers can only deduct tax on invoices from registered issuers - so businesses selling to companies face commercial pressure to register and charge the 10% even while legally exempt. B2C freelancers keep the holiday; B2B ones should model both ways.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Kojin jigyō, GK, or KK?',
            options: [
              {
                name: 'Kojin jigyō',
                when: 'The solo default.',
                costs: '¥0.',
                catch: 'Progressive personal rates plus local taxes; credibility with large clients is lower than a company’s.',
              },
              {
                name: 'GK (合同会社)',
                when: 'A cheap company: ~¥60,000 registration tax, no notarised articles.',
                costs: '~¥60,000-100,000 all-in.',
                catch: 'Slightly lower prestige than a KK in conservative industries; conversion later is possible but is a project.',
              },
              {
                name: 'KK (株式会社)',
                when: 'The classic corporation clients and investors expect.',
                costs: '~¥200,000-250,000 all-in (¥150,000 minimum registration tax plus notarisation).',
                catch: 'Cost and ceremony; director terms and announcements are real obligations.',
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
            title: 'File the opening notification - and the blue return election',
            where: 'The tax office for your address, or online via e-Tax',
            cost: '¥0',
            takes: 'Minutes; no approval step',
            body: [
              'The kaigyō todoke within one month; the blue-return election within two months of opening (or by 15 March for an existing business). Freee and Money Forward generate both correctly - most founders never see the paper forms.',
            ],
            watch: 'Miss the blue-return window and the first year runs on the white return - the ¥650,000 deduction gone for a year.',
          },
          {
            title: 'Sort the personal insurances',
            body: [
              'Leaving employment means National Health Insurance and National Pension at city hall within two weeks. Both are unavoidable; NHI premiums scale with last year’s income, which surprises well-paid leavers.',
            ],
          },
          {
            title: 'Decide the invoice-system question',
            body: [
              'B2B sellers: registering as a qualified invoice issuer means charging and remitting consumption tax from day one, with transitional simplified calculations (the 2-wari measure and simplified taxation) softening the first years. B2C sellers keep the exemption until the ¥10M base-period test says otherwise.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Kojin jigyō', amount: '¥0' },
          { what: 'GK formation', amount: '~¥60,000-100,000' },
          { what: 'KK formation', amount: '~¥200,000-250,000' },
          { what: 'Accounting software', amount: '~¥1,000-3,000/month', note: 'Freee / Money Forward - effectively standard equipment.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: '開業届 (kaigyō todoke)', means: 'The opening notification to the tax office.' },
          { term: '青色申告 (aoiro shinkoku)', means: 'The blue return - the deduction-rich election with its two-month window.' },
          { term: '消費税', means: 'Consumption tax, 10%, with the exemption and invoice-system interplay.' },
          { term: 'インボイス制度', means: 'The qualified invoice system pressuring B2B registration.' },
          { term: '合同会社 / 株式会社', means: 'The GK and KK company forms.' },
          { term: 'e-Tax', means: 'The online filing system.' },
          { term: '国民健康保険', means: 'National Health Insurance - the post-employment must-do.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'The blue-return election missed by weeks.',
          'NHI premiums calculated on the last employed year’s salary.',
          'B2B clients quietly dropping unregistered invoice issuers.',
          'A KK formed for prestige where a GK plus good work would have done.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'NTA', href: 'https://www.nta.go.jp', note: 'The forms, the elections, the invoice system.' },
          { label: 'JETRO', href: 'https://www.jetro.go.jp/en/invest/', note: 'English-language company-formation guides.' },
        ],
      },
    ],
  },
}
