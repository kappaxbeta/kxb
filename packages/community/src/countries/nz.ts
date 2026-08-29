import type { Guide } from '../guide'
import type { Text } from '../text'

/** New Zealand. */
export const NEW_ZEALAND: Text<Guide> = {
  en: {
    title: 'Starting a business in New Zealand',
    standfirst:
      'The world’s easiest incorporation statistics are real - an IRD number, a same-day company, GST at $60,000, and provisional tax as the one ambush.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'New Zealand tops the ease-of-starting rankings honestly: a sole trader needs no registration beyond the IRD number they already have, and a company incorporates online at the Companies Office for around NZ$150 in a day, name reservation included. The NZBN - the business number - comes automatically for companies and free on request for sole traders.',
          'The system trusts you to self-manage: income tax through the annual IR3, GST self-assessed, and provisional tax arriving once your residual bill passes $5,000 - the one genuinely surprising mechanism, since year two brings instalments for the current year on top of year one’s bill.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole trader or company?',
            options: [
              {
                name: 'Sole trader',
                when: 'The simple start.',
                costs: '$0.',
                catch: 'Personal liability; personal rates to 39%.',
              },
              {
                name: 'Company',
                when: 'Liability, contracts, growth.',
                costs: '~NZ$150 incorporation; annual return small.',
                catch: '28% company rate, imputation credits on dividends, and at least one director living in NZ (or Australia, with conditions) - the residency rule remote founders meet first.',
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
            title: 'Sole trader: just start (and tell IRD)',
            body: [
              'Use your IRD number, keep records, file the IR3 after year end. Register the NZBN free if you want the business identity.',
            ],
          },
          {
            title: 'Company: incorporate at the Companies Office',
            where: 'companiesoffice.govt.nz, with RealMe',
            cost: '~NZ$150 including name reservation',
            takes: 'Same day routinely',
            body: [
              'Name search, directors and shareholders, registered office - the filing walks through it. IRD number for the company and GST registration can ride along in the same flow.',
            ],
          },
          {
            title: 'GST at $60,000',
            body: [
              'Compulsory once turnover passes NZ$60,000 in twelve months; 15% on essentially everything with few exemptions - the cleanest GST design anywhere, which makes compliance genuinely simple.',
            ],
          },
          {
            title: 'Meet provisional tax on purpose',
            body: [
              'Once residual income tax passes $5,000, instalments for the current year begin - the standard uplift method assumes last year plus 5%. The accounting-software AIM method pays as profit actually accrues, which suits lumpy first years.',
            ],
            watch: 'Year two: last year’s bill plus this year’s instalments. The NZ version of the universal trap.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole trader', amount: '$0' },
          { what: 'Company', amount: '~NZ$150' },
          { what: 'GST', amount: '15% above NZ$60,000 turnover' },
          { what: 'ACC levies', amount: 'Invoiced annually', note: 'The accident-cover levy every earner pays - the bill people forget is coming.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'IRD number', means: 'The tax identity - personal and, separately, the company’s.' },
          { term: 'NZBN', means: 'The business number, automatic for companies.' },
          { term: 'IR3', means: 'The individual return self-employed income files on.' },
          { term: 'Provisional tax', means: 'The instalment system from year two.' },
          { term: 'AIM', means: 'The pay-as-profit-accrues provisional method inside accounting software.' },
          { term: 'ACC', means: 'The universal accident scheme and its annual levy.' },
          { term: 'RealMe', means: 'The government login.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'The year-two provisional tax stack.',
          'The ACC invoice nobody mentioned.',
          'The resident-director rule met at the end of an offshore plan.',
          'Not registering for GST while charging prices that assumed its margin.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Companies Office', href: 'https://companiesoffice.govt.nz', note: 'Incorporation.' },
          { label: 'IRD', href: 'https://www.ird.govt.nz', note: 'GST, provisional tax, IR3.' },
          { label: 'business.govt.nz', href: 'https://www.business.govt.nz', note: 'The plain-language official guide.' },
        ],
      },
    ],
  },
}
