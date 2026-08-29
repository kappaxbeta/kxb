import type { Guide } from '../guide'
import type { Text } from '../text'

/** France. */
export const FRANCE: Text<Guide> = {
  en: {
    title: 'Starting a business in France',
    standfirst:
      'The micro-entrepreneur regime does the first years for almost everyone - one portal, percentage contributions, and thresholds worth knowing by heart.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'France consolidated every business formality onto one portal in 2023: the guichet unique at formalites.entreprises.gouv.fr, run by the INPI. Whatever you found - micro-entreprise, SASU, EURL - the filing goes through there, and guides describing the old CFE counters are out of date.',
          'For a first business the micro-entrepreneur regime is the honest default: registration is free, bookkeeping is a revenue ledger, and social contributions are a fixed percentage of what you actually invoice - no revenue, no charges. The whole question is whether its ceilings and its no-expense-deduction logic fit your business.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Micro, or a real company?',
            options: [
              {
                name: 'Micro-entrepreneur',
                when: 'Services under ~€77,700 or sales under ~€188,700 a year, and costs that are a small share of revenue.',
                costs: 'Free to register. Contributions ~21-22% of service revenue, less for sales; an optional flat income-tax rate (versement libératoire) on top.',
                catch: 'No expense deduction at all - the regime taxes revenue, not profit. Heavy costs make it a bad deal fast. VAT exemption ends at its own, lower thresholds.',
              },
              {
                name: 'EURL / SASU',
                when: 'Past the ceilings, deducting real costs, or building something investable. SASU pays the president through payroll; EURL puts the gérant in the self-employed scheme - cheaper contributions, more paperwork.',
                costs: 'Publication and filing ~€200-400 plus whatever drafting help you buy.',
                catch: 'Real accounting from day one - budget for an expert-comptable, roughly €1,000-2,000 a year.',
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
            title: 'File on the guichet unique',
            where: 'formalites.entreprises.gouv.fr',
            cost: '€0 for a micro-entreprise',
            takes: 'An online form; SIREN/SIRET arrive within days',
            body: [
              'You declare the activity, the regime, and the options - notably the declaration frequency (monthly or quarterly) and the versement libératoire if your household income allows it. The SIRET number that comes back goes on every invoice.',
            ],
          },
          {
            title: 'Claim ACRE if it applies',
            body: [
              'ACRE halves social contributions for roughly the first year for eligible founders (job-seekers, under-26s, and others). For micro-entrepreneurs it must be requested at registration or within 45 days - it is not automatic, and missing the window costs real money.',
            ],
            watch: 'The 45-day window. This is the single most-missed cheap win in the French system.',
          },
          {
            title: 'Declare and pay as you go',
            where: 'autoentrepreneur.urssaf.fr',
            body: [
              'Every month or quarter you declare revenue - including zero - and pay the percentage. Late or missing declarations carry small fixed penalties that add up, and repeated zeros for two years close the regime.',
            ],
          },
          {
            title: 'Watch the VAT franchise separately',
            body: [
              'The franchise en base keeps you VAT-free up to roughly €36,800 (services) / €91,900 (sales) - lower than the regime ceilings, so you can owe VAT while still comfortably micro. A 2025 reform to cut the franchise to €25,000 was suspended after protest; check the current figure before relying on it.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Micro registration', amount: '€0' },
          { what: 'Social contributions', amount: '~21-22% of service revenue', note: 'Roughly halved in year one with ACRE.' },
          { what: 'CFE (local business tax)', amount: '€150-800/year', note: 'Exempt in the first calendar year; varies by commune.' },
          { what: 'Company route with accountant', amount: '€1,500-3,000/year', note: 'Formation plus the expert-comptable.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Guichet unique / INPI', means: 'The single formalities portal since 2023.' },
          { term: 'SIREN / SIRET', means: 'The business identifier, and the per-establishment version that goes on invoices.' },
          { term: 'Micro-entrepreneur', means: 'The simplified regime (ex auto-entrepreneur): percentage contributions on revenue.' },
          { term: 'URSSAF', means: 'The contributions agency, and the portal where declarations happen.' },
          { term: 'ACRE', means: 'The first-year contribution reduction - request it within 45 days.' },
          { term: 'Franchise en base de TVA', means: 'The VAT exemption with its own thresholds below the regime ceilings.' },
          { term: 'CFE', means: 'The local business property tax, arriving from year two.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing the ACRE window at registration.',
          'Crossing the VAT franchise while watching only the micro ceiling.',
          'Heavy real costs inside a regime that deducts nothing.',
          'Forgetting the CFE exists because year one was exempt.',
          'Client dependence: France also polices salariat déguisé, and one-client micros are the target profile.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Guichet unique', href: 'https://formalites.entreprises.gouv.fr', note: 'Every filing, every form.' },
          { label: 'URSSAF auto-entrepreneur', href: 'https://www.autoentrepreneur.urssaf.fr', note: 'Rates, thresholds, declarations.' },
          { label: 'Bpifrance Création', href: 'https://bpifrance-creation.fr', note: 'The best plain-language reference on regimes.' },
        ],
      },
    ],
  },
}
