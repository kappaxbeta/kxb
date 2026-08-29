import type { Guide } from '../guide'
import type { Text } from '../text'

/** United Kingdom. */
export const UNITED_KINGDOM: Text<Guide> = {
  en: {
    title: 'Starting a business in the United Kingdom',
    standfirst:
      'A sole trade needs one HMRC registration by a deadline most people learn too late - a limited company costs £50 and creates duties the price does not suggest.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The UK has no business register for sole traders at all: you start trading, and your one obligation is to register for Self Assessment with HMRC by 5 October after the end of the tax year you started in. There is a £1,000 trading allowance below which even that is unnecessary.',
          'A limited company is the opposite temperament: £50 and ten minutes at Companies House creates it, and with it public filings, a confirmation statement, accounts, corporation tax registration, and director duties - the cheapest incorporation in Europe attached to a full compliance calendar. Identity verification for directors was added in 2025, so the ten minutes now includes proving who you are.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole trader or limited company?',
            options: [
              {
                name: 'Sole trader',
                when: 'The default start. Simple, private, cheap.',
                costs: '£0. Class 4 NI and income tax on profits via Self Assessment.',
                catch: 'Personal liability, and some corporate clients (especially via agencies) will not engage sole traders because of IR35-adjacent caution.',
              },
              {
                name: 'Limited company',
                when: 'Liability, contracting through a company, or profits worth the salary-plus-dividend structure.',
                costs: '£50 incorporation; accountant £600-1,500/year in practice.',
                catch: 'Public accounts, the confirmation statement, corporation tax at 19-25%, and the dividend/salary planning that changes with every budget. If you contract for one client, read up on IR35 before choosing this for tax reasons.',
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
            title: 'Sole trader: register for Self Assessment',
            where: 'gov.uk, online',
            cost: '£0',
            takes: 'The UTR arrives by post in days to weeks',
            body: [
              'Deadline: 5 October after the end of the first tax year of trading (tax years end 5 April). The UTR number that arrives is your filing identity. Returns are due 31 January online, along with payment - and payments on account for the next year once your bill passes £1,000, which is the UK’s version of the year-two surprise.',
            ],
          },
          {
            title: 'Company: incorporate, then meet the calendar',
            where: 'Companies House, online',
            cost: '£50',
            body: [
              'Incorporation registers corporation tax with HMRC in the same flow. The calendar that follows: accounts nine months after year end, confirmation statement annually, CT600 return, and PAYE registration the day the company pays you a salary.',
            ],
          },
          {
            title: 'VAT at £90,000 - or by choice',
            body: [
              'Registration is compulsory when rolling twelve-month taxable turnover passes £90,000. Making Tax Digital applies: filing happens through compatible software. The flat-rate scheme can simplify small service businesses; the limited-cost-trader rate makes it pointless for many. B2B services to the EU are now exports in both directions - the post-Brexit simplification nobody expected.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole trader', amount: '£0' },
          { what: 'Company incorporation', amount: '£50' },
          { what: 'Accountant (company)', amount: '£600-1,500/year' },
          { what: 'Class 4 NI', amount: '6% above ~£12,570', note: 'Class 2 became effectively voluntary in 2024.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Self Assessment / UTR', means: 'The tax return system and your reference number in it.' },
          { term: 'Companies House', means: 'The company register - filings there are public.' },
          { term: 'Confirmation statement', means: 'The annual "still true" filing companies owe.' },
          { term: 'Payments on account', means: 'The advance instalments once your bill passes £1,000.' },
          { term: 'IR35 / off-payroll', means: 'The rules deciding whether your company contract is disguised employment.' },
          { term: 'MTD', means: 'Making Tax Digital - software-only filing, VAT now, income tax phasing in.' },
          { term: 'Trading allowance', means: 'The £1,000 of trading income needing no registration at all.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing the 5 October registration deadline because nothing announces it.',
          'The first 31 January that includes payments on account.',
          'Incorporating for tax and landing inside IR35 anyway.',
          'Letting the registered office be your home and finding it on every data-broker site - it is public.',
          'Crossing £90,000 mid-year without watching the rolling total.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'gov.uk - set up as sole trader', href: 'https://www.gov.uk/set-up-sole-trader', note: 'The canonical short version.' },
          { label: 'Companies House', href: 'https://www.gov.uk/government/organisations/companies-house', note: 'Incorporation and filings.' },
          { label: 'HMRC VAT registration', href: 'https://www.gov.uk/vat-registration', note: 'The £90,000 rules.' },
        ],
      },
    ],
  },
}
