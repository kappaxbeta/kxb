import type { Guide } from '../guide'
import type { Text } from '../text'

/** Canada. */
export const CANADA: Text<Guide> = {
  en: {
    title: 'Starting a business in Canada',
    standfirst:
      'Provincial or federal is the first fork, the CRA business number ties it together, and GST/HST at $30,000 is the line everyone learns.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'A Canadian sole proprietorship under your own name needs no registration at all - a trade name registers provincially for a small fee. The apparatus arrives with the CRA business number (BN), one nine-digit identity carrying program accounts for GST/HST, payroll and corporate tax as you need them.',
          'Incorporation offers a real choice: federal (under the CBCA, ~$200 online, name protected nationwide) or provincial (Ontario, BC and friends, similar cost, simpler when business stays home). Federal corporations still register extra-provincially where they operate - the national name is the prize, not an exemption.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole proprietorship or corporation?',
            options: [
              {
                name: 'Sole proprietorship',
                when: 'Starting simple.',
                costs: '$0-80 (trade-name registration by province).',
                catch: 'Personal liability; business income stacks on your marginal personal rate.',
              },
              {
                name: 'Corporation',
                when: 'Liability, retained earnings, or clients requiring it.',
                costs: '~$200 federal online, ~$300-400 in most provinces.',
                catch: 'The small business deduction (~9% federal on the first $500k of active income) rewards profits left in the company - but paying yourself out re-taxes them, and the accounting is a real annual cost.',
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
            title: 'Register the name or incorporate',
            where: 'Provincial registry, or Corporations Canada online',
            takes: 'Same day online in most cases',
            body: [
              'A NUANS or provincial name search backs a named corporation; numbered corporations skip the fight entirely and add a trade name later.',
            ],
          },
          {
            title: 'Get the business number and the accounts you need',
            where: 'CRA Business Registration Online',
            cost: '$0',
            body: [
              'The BN arrives with incorporation federally, or on first registration otherwise. Add the GST/HST account when required, payroll only when someone is paid.',
            ],
          },
          {
            title: 'GST/HST at $30,000',
            body: [
              'Small-supplier status ends when worldwide taxable revenue passes $30,000 over four rolling quarters; registration is then mandatory. The rate charged is the customer province’s (5% GST to 15% HST) - place-of-supply rules, not your own address. Voluntary early registration reclaims input credits and is normal for B2B.',
            ],
            watch: 'Quebec runs its own QST administration - selling into Quebec is its own checklist.',
          },
          {
            title: 'Instalments and the personal side',
            body: [
              'Sole-proprietor profit files on the T1 with CPP contributions at both halves (~11.9% to the ceiling); tax instalments become due once the bill passes $3,000. Corporations file T2s and manage the salary/dividend mix - the standing task of Canadian small-business accounting.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Trade name', amount: '$0-80' },
          { what: 'Incorporation', amount: '$200-400' },
          { what: 'BN and CRA accounts', amount: '$0' },
          { what: 'Accountant (corporation)', amount: '$1,500-3,000/year' },
          { what: 'CPP (self-employed)', amount: '~11.9% to the ceiling', note: 'Both halves are yours.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'BN', means: 'The CRA business number all program accounts hang off.' },
          { term: 'GST/HST', means: 'The federal/harmonised sales tax; registration mandatory past $30,000.' },
          { term: 'Small supplier', means: 'The under-$30,000 status that spares registration.' },
          { term: 'NUANS', means: 'The name search behind named corporations.' },
          { term: 'Small business deduction', means: 'The ~9% federal rate on the first $500k of active corporate income.' },
          { term: 'T1 / T2', means: 'The personal and corporate returns.' },
          { term: 'QST', means: 'Quebec’s separately administered sales tax.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing the rolling four-quarter $30,000 test after one strong quarter.',
          'Charging your own province’s rate instead of the customer’s.',
          'Incorporating federally and skipping the extra-provincial registration where you actually operate.',
          'Forgetting both halves of CPP in the first self-employed tax estimate.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'CRA - Business Registration', href: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business.html', note: 'BN and program accounts.' },
          { label: 'Corporations Canada', href: 'https://ised-isde.canada.ca/site/corporations-canada/en', note: 'Federal incorporation.' },
          { label: 'GST/HST rules', href: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html', note: 'Thresholds and place of supply.' },
        ],
      },
    ],
  },
}
