import type { Guide } from '../guide'
import type { Text } from '../text'

/** Netherlands. */
export const NETHERLANDS: Text<Guide> = {
  en: {
    title: 'Starting a business in the Netherlands',
    standfirst:
      'One KVK appointment does most of it - the thinking is in the KOR, the hour criterion, and whether your one big client is legally your employer.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The Dutch founding process is genuinely one appointment: register at the KVK, and the tax office learns of it automatically. What deserves thought happens around it - the VAT small-business scheme, the income-tax deductions that hang on a 1,225-hour criterion, and the schijnzelfstandigheid rules on false self-employment, which the tax office resumed enforcing in 2025.',
          'That last one first: if you work for one client, on their tools, under their direction, Dutch law is increasingly willing to call it employment whatever the contract says - with consequences mainly for the client. A healthy zzp practice has multiple clients and looks like one.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Eenmanszaak or BV?',
            options: [
              {
                name: 'Eenmanszaak (sole trader / zzp)',
                when: 'The default. Income-tax deductions - zelfstandigenaftrek, startersaftrek, the MKB profit exemption - make it fiscally attractive at ordinary profits.',
                costs: 'The one-off KVK fee (~€80) and nothing else.',
                catch: 'The zelfstandigenaftrek is being cut year by year - the advantage shrinks on schedule. Liability is personal.',
              },
              {
                name: 'BV',
                when: 'Liability, partners, investors, or profits high enough (roughly beyond €100k) that the corporate rate plus salary structure beats income tax.',
                costs: 'Notary formation commonly €500-1,000; capital from €0.01.',
                catch: 'The DGA salary rule: as director-shareholder you must pay yourself a customary wage (gebruikelijk loon, ~€56k benchmark) before profits.',
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
            title: 'Register at the KVK',
            where: 'kvk.nl - book the appointment online, finish in person',
            cost: '~€80 one-off',
            takes: 'Half an hour; the number is issued on the spot',
            body: [
              'Bring ID and a Dutch address (or a business address). You leave with the KVK number, and the Belastingdienst issues the VAT identification number (btw-id) by post within about two weeks - a separate, privacy-safe number from the internal omzetbelastingnummer.',
            ],
          },
          {
            title: 'Decide on the KOR',
            where: 'Belastingdienst, online',
            body: [
              'The kleineondernemersregeling exempts you from charging and filing VAT if turnover stays under €20,000. Since 2025 it is joined by the EU-KOR, extending the exemption to other EU countries under the EU-wide rules. The catch mirrors every VAT exemption: no input-VAT reclaim, and B2B clients do not care about your gross price. Opting in binds you for the calendar year at minimum.',
            ],
          },
          {
            title: 'Track the hour criterion from day one',
            body: [
              'The zelfstandigenaftrek and startersaftrek require 1,225 hours of work on the business per year, and the burden of showing it is yours. A simple hours log started in week one is the cheapest tax planning available in the country.',
            ],
          },
          {
            title: 'Arrange what employment used to provide',
            body: [
              'No compulsory occupational disability cover exists yet for zzp-ers (a mandatory scheme has been legislated to arrive late this decade - watch it). An arbeidsongeschiktheidsverzekering is expensive and worth pricing anyway; the broodfonds - a mutual sick-pay circle - is the popular middle way. Pension: the fiscal room (jaarruimte) is there if you use it.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'KVK registration', amount: '~€80', note: 'One-off.' },
          { what: 'btw-id', amount: '€0', note: 'Arrives by post after registration.' },
          { what: 'BV via notary', amount: '€500-1,000', note: 'Only for the company route.' },
          { what: 'Disability insurance', amount: '€100-300/month', note: 'Optional today, the largest gap employment used to cover.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'KVK', means: 'The chamber of commerce and its register - the one appointment.' },
          { term: 'btw-id', means: 'The public VAT number on your invoices.' },
          { term: 'KOR', means: 'The small-business VAT exemption under €20,000.' },
          { term: 'zzp’er', means: 'Independent professional without staff - the working word for freelancer.' },
          { term: 'zelfstandigenaftrek', means: 'The self-employed income-tax deduction, tied to 1,225 hours.' },
          { term: 'gebruikelijk loon', means: 'The customary wage a BV director-shareholder must take.' },
          { term: 'schijnzelfstandigheid', means: 'False self-employment - enforced again since 2025.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'One-client dependence now that enforcement is back - the risk lands on the client, and clients know it.',
          'No hours log, and a deduction worth thousands refused for want of evidence.',
          'Opting into the KOR while your customers are businesses.',
          'Confusing the btw-id (public) with the omzetbelastingnummer (internal) on forms.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'KVK', href: 'https://www.kvk.nl', note: 'Registration and solid English-language guides.' },
          { label: 'Belastingdienst', href: 'https://www.belastingdienst.nl', note: 'KOR, btw, the deductions.' },
          { label: 'Business.gov.nl', href: 'https://business.gov.nl', note: 'The government’s English portal for entrepreneurs.' },
        ],
      },
    ],
  },
}
