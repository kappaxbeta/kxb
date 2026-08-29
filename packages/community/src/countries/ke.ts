import type { Guide } from '../guide'
import type { Text } from '../text'

/** Kenya. */
export const KENYA: Text<Guide> = {
  en: {
    title: 'Starting a business in Kenya',
    standfirst:
      'eCitizen registers it, the KRA PIN runs it, eTIMS invoices it - the platforms are the process.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Kenya digitised founding onto eCitizen, the single government portal: a business name registers for about KES 950 in a day or two, a private limited company for roughly KES 10,650, both through the Business Registration Service with no lawyer needed for the ordinary case.',
          'The operational spine is the KRA PIN - the tax identity every bank account, tender and land transaction demands - and, since 2023-24, eTIMS: electronic tax invoicing through which effectively every business invoice must flow, VAT-registered or not. A Kenyan business plan that ignores eTIMS is describing a business that cannot legally bill.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Business name or limited company?',
            options: [
              {
                name: 'Business name',
                when: 'Solo trade, quick start.',
                costs: '~KES 950.',
                catch: 'No shield; renewals and the county permit still apply.',
              },
              {
                name: 'Private limited company',
                when: 'Contracts, growth, shared ownership. Single-director companies are allowed.',
                costs: '~KES 10,650 all-in via eCitizen; no minimum capital in practice.',
                catch: 'Annual returns to the registrar and the beneficial-ownership register must stay current - strike-off sweeps happen.',
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
            title: 'Register on eCitizen',
            where: 'brs.ecitizen.go.ke',
            cost: 'KES 950-10,650',
            takes: 'Days',
            body: [
              'Name search and registration in one flow; the certificate downloads from the portal. Directors need their national ID or passport and KRA PINs.',
            ],
          },
          {
            title: 'KRA PIN and the tax obligations',
            where: 'iTax (itax.kra.go.ke)',
            body: [
              'Individuals usually have a PIN already; companies get one after registration. Obligations are switched on per tax: income tax always; VAT only when required - compulsory at KES 5,000,000 of annual taxable turnover. Below the VAT line, turnover tax (~1.5-3% of gross by current rules) covers small business simply.',
            ],
          },
          {
            title: 'Onboard to eTIMS before the first invoice',
            body: [
              'Register the business on eTIMS and issue invoices through it (apps, portal or integrations). Customers increasingly cannot deduct expenses not backed by an eTIMS invoice, which enforces the system commercially as well as legally.',
            ],
            watch: 'This is the step new founders discover late. Do it the same week as registration.',
          },
          {
            title: 'County permit and the employment layer',
            body: [
              'The single business permit from your county prices by activity and size. NSSF and SHIF registrations arrive with the first employee - and for the owner-operator, contributions structures have been in flux; check the current state.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Business name', amount: '~KES 950' },
          { what: 'Limited company', amount: '~KES 10,650' },
          { what: 'County single business permit', amount: 'KES 5,000-15,000+/year', note: 'By county and category.' },
          { what: 'Turnover tax', amount: '~1.5-3% of gross', note: 'Below the VAT threshold.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'eCitizen / BRS', means: 'The portal and the Business Registration Service behind it.' },
          { term: 'KRA PIN', means: 'The tax identity everything demands.' },
          { term: 'iTax', means: 'The filing portal.' },
          { term: 'eTIMS', means: 'The compulsory e-invoicing system.' },
          { term: 'Turnover tax', means: 'The simplified small-business levy under the VAT line.' },
          { term: 'Single business permit', means: 'The county operating licence.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Invoicing outside eTIMS and finding customers refuse the paper.',
          'Ignoring county permits because national registration felt complete.',
          'VAT registration assumed optional after crossing KES 5M.',
          'Annual returns skipped until the strike-off list publishes.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'BRS on eCitizen', href: 'https://brs.ecitizen.go.ke', note: 'Registration.' },
          { label: 'KRA', href: 'https://www.kra.go.ke', note: 'PIN, iTax, eTIMS, thresholds.' },
        ],
      },
    ],
  },
}
