import type { Guide } from '../guide'
import type { Text } from '../text'

/** Ireland. */
export const IRELAND: Text<Guide> = {
  en: {
    title: 'Starting a business in Ireland',
    standfirst:
      'A sole trade begins with a Revenue registration, a company costs €50 - the Irish subtleties are the VAT thresholds and what the 12.5% rate does not cover.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Ireland’s founding mechanics are among the lightest in Europe: a sole trader registers for income tax through Revenue’s ROS/myAccount, registers a business name with the CRO only if trading under one (€20), and is in business. A private limited company (LTD) is a €50 online filing at the CRO with no minimum capital.',
          'The famous 12.5% corporation tax deserves its footnote up front: it applies to trading income of a company. It does not apply to sole traders (personal rates up to 40% plus USC and PRSI), nor to a company’s passive income, and taking money out of the company is taxed again as salary or dividend. The rate is real; it is just not a personal tax rate.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole trader or LTD?',
            options: [
              {
                name: 'Sole trader',
                when: 'Starting small and simple.',
                costs: '€0 (plus €20 for a registered business name if used).',
                catch: 'Full personal rates on profit, personal liability, and preliminary tax in year one - the pay-ahead system that catches everyone once.',
              },
              {
                name: 'LTD',
                when: 'Growth, clients that require a company, or profits worth retaining at 12.5%.',
                costs: '€50 CRO filing; no minimum capital.',
                catch: 'A company needs at least one EEA-resident director (or a €25,000 insurance bond), a company secretary, and annual returns whose late-filing penalties escalate fast.',
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
            title: 'Register with Revenue',
            where: 'ros.ie (TR1 form for sole traders, TR2 for companies)',
            cost: '€0',
            body: [
              'This starts income tax (or corporation tax) and optionally VAT and employer registrations in one form. A PPS number is the prerequisite for individuals.',
            ],
          },
          {
            title: 'CRO filings where needed',
            where: 'core.cro.ie',
            body: [
              'Business name registration (€20) if trading under anything but your own name; company incorporation (€50, form A1) for an LTD - typically back within a week.',
            ],
          },
          {
            title: 'Watch the two VAT thresholds',
            body: [
              'Registration is compulsory at €42,500 for services or €85,000 for goods (raised in 2025). Under them you may stay out; over them registration is not optional. Cross-border digital sales to consumers follow the EU €10,000 OSS rules as everywhere.',
            ],
          },
          {
            title: 'Meet preliminary tax before it meets you',
            body: [
              'By 31 October you pay preliminary tax for the current year and the balance for the last - meaning year two contains close to two years of tax. The safe-harbour options (90% of current or 100% of prior liability) are the planning tool.',
            ],
            watch: 'This is the Irish trap. Nothing about registration warns you that October of year two is the expensive month.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole trader', amount: '€0-20' },
          { what: 'LTD incorporation', amount: '€50' },
          { what: 'Accountant for a company', amount: '€1,000-2,500/year', note: 'Annual returns and CT filings make this near-universal.' },
          { what: 'Non-EEA director bond', amount: '~€2,000 for two years', note: 'Only when no EEA-resident director exists.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'CRO', means: 'The Companies Registration Office - names and companies.' },
          { term: 'ROS', means: 'Revenue Online Service - every tax filing.' },
          { term: 'TR1 / TR2', means: 'The registration forms for individuals and companies.' },
          { term: 'PPSN', means: 'The personal identifier everything needs.' },
          { term: 'Preliminary tax', means: 'The pay-ahead instalment due each 31 October.' },
          { term: 'USC / PRSI', means: 'The levies that sit on top of income tax for the self-employed.' },
          { term: 'Form A1', means: 'The company incorporation filing.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'October of year two - preliminary tax plus the balance.',
          'Believing the 12.5% applies to freelance income.',
          'Missing a CRO annual return and losing the audit exemption for two years.',
          'Registering for VAT "to look bigger" while selling to consumers.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Revenue', href: 'https://www.revenue.ie', note: 'Registration, thresholds, preliminary tax.' },
          { label: 'CRO', href: 'https://www.cro.ie', note: 'Companies and business names.' },
          { label: 'Citizens Information', href: 'https://www.citizensinformation.ie', note: 'Plain-language self-employment guides.' },
        ],
      },
    ],
  },
}
