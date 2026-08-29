import type { Guide } from '../guide'
import type { Text } from '../text'

/** Poland. */
export const POLAND: Text<Guide> = {
  en: {
    title: 'Starting a business in Poland',
    standfirst:
      'CEIDG in an afternoon, six months of ZUS relief, and a three-way tax choice that actually changes the outcome.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Registering a Polish sole proprietorship (jednoosobowa działalność gospodarcza) is free and online through CEIDG, with a trusted profile (profil zaufany) or e-ID as the signature. The state then staggers you into social insurance gently: six months of "ulga na start" with no social contributions at all (health only), then twenty-four months at a reduced base.',
          'The real decision is the income-tax form, chosen at registration and changeable each January: the progressive scale (12/32%), the 19% flat rate (podatek liniowy), or ryczałt - a lump-sum percentage of revenue that varies by activity (12% for most IT work, 8.5% for many services). Ryczałt plus low costs is why Poland is full of well-paid IT contractors on B2B contracts.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The tax form - the choice that matters',
        choices: [
          {
            question: 'Scale, flat, or ryczałt?',
            options: [
              {
                name: 'Skala (12/32%)',
                when: 'Modest profits, or you want the joint-filing and allowance mechanics of the general system.',
                catch: 'The 32% band arrives at ~PLN 120,000.',
              },
              {
                name: 'Liniowy (19%)',
                when: 'High profit with real deductible costs.',
                catch: 'Health contribution is 4.9% of income on this form - part of the arithmetic, not a footnote.',
              },
              {
                name: 'Ryczałt (2-17% of revenue)',
                when: 'Low costs relative to revenue. 12% for most programming, 8.5% for many services.',
                catch: 'No cost deduction at all, and the correct rate for your exact activity is worth a written confirmation.',
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
            title: 'Get the profil zaufany, then file CEIDG-1',
            where: 'biznes.gov.pl / ceidg.gov.pl',
            cost: '€0',
            takes: 'Active within a day or two',
            body: [
              'One form registers the business, the tax office, statistics (REGON) and ZUS at once. You pick PKD activity codes - list several, they are free - and the tax form.',
            ],
          },
          {
            title: 'Choose the ZUS path deliberately',
            where: 'ZUS, via the same filing',
            body: [
              'Ulga na start: six months, health contribution only (~PLN 400-700 by tax form). Then preferential ZUS for 24 months on a reduced base, then full ZUS (~PLN 1,600+ monthly, all-in). The reliefs are opt-in declarations - take them.',
            ],
            watch: 'The health contribution is no longer flat: it scales with income and tax form since the Polski Ład reforms. Budget it per form, not from an old table.',
          },
          {
            title: 'VAT: exempt or registered',
            body: [
              'The subjective exemption runs to PLN 200,000 of annual sales; many B2B service businesses register voluntarily anyway. Registered or not, JPK electronic reporting and the KSeF national e-invoicing system (mandatory rollout from 2026) mean the bookkeeping is software from day one - a biuro rachunkowe (accounting office) at PLN 200-500 a month is the norm.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'CEIDG registration', amount: 'PLN 0' },
          { what: 'Months 1-6', amount: 'Health contribution only', note: 'Ulga na start.' },
          { what: 'Months 7-30', amount: 'Reduced ZUS', note: 'Preferential base.' },
          { what: 'Full ZUS after', amount: '~PLN 1,600+/month', note: 'The number to plan the ramp against.' },
          { what: 'Biuro rachunkowe', amount: 'PLN 200-500/month', note: 'Standard practice.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'CEIDG', means: 'The central register of sole proprietors - the one free filing.' },
          { term: 'Profil zaufany', means: 'The trusted profile that signs everything online.' },
          { term: 'Ulga na start', means: 'Six months without social contributions.' },
          { term: 'ZUS', means: 'Social insurance - the dominant fixed cost once reliefs end.' },
          { term: 'Ryczałt', means: 'Lump-sum tax on revenue at activity-specific rates.' },
          { term: 'PKD', means: 'The activity codes; list generously.' },
          { term: 'KSeF', means: 'The national e-invoicing system, mandatory from 2026.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Sliding off the reliefs into full ZUS without having repriced.',
          'Choosing ryczałt with the wrong rate for the actual activity.',
          'B2B contracting for your former employer - reliefs and ryczałt both have same-employer exclusions.',
          'Ignoring KSeF until the mandate lands mid-business.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Biznes.gov.pl', href: 'https://www.biznes.gov.pl', note: 'The official founding portal, good English pages.' },
          { label: 'CEIDG', href: 'https://www.ceidg.gov.pl', note: 'The register itself.' },
          { label: 'ZUS', href: 'https://www.zus.pl', note: 'Reliefs and current contribution amounts.' },
        ],
      },
    ],
  },
}
