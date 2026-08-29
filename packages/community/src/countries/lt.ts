import type { Guide } from '../guide'
import type { Text } from '../text'

/** Lithuania. */
export const LITHUANIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Lithuania',
    standfirst:
      'Individual activity by certificate is a same-day start - the MB and the €1,000 UAB wait for when a company earns its keep.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Lithuania’s lightest start is individuali veikla pagal pažymą - individual activity under certificate - registered free at the tax inspectorate (VMI) online and active the same day. Income tax works on a sliding effective rate (5% rising toward 15% as annual profit passes ~€20,000, via a credit mechanism), with 30% presumed costs if you skip receipts.',
          'For fixed small trades there is also the verslo liudijimas (business certificate) - a lump-sum licence bought per month for listed activities - but the certificate route above fits most modern service work better.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Individual activity, MB, or UAB?',
            options: [
              {
                name: 'Individuali veikla',
                when: 'Solo services, the default start.',
                costs: 'Free; VSD/PSD contributions on 90% of profit with ceilings.',
                catch: 'Personal liability, and the effective tax climbs with profit.',
              },
              {
                name: 'MB (mažoji bendrija)',
                when: 'The small partnership: no minimum capital, up to 10 members, lighter than a UAB.',
                costs: '~€100 in registration costs, no notary in the standard e-path.',
                catch: 'Members cannot also be employees of it; payouts have their own contribution logic - the flexibility has rules.',
              },
              {
                name: 'UAB',
                when: 'The standard limited company for growth and investors.',
                costs: '€1,000 minimum capital (lowered from €2,500), registration via the Registrų centras e-system.',
                catch: 'Full accounting, 16% corporate tax (since 2025), and a director payroll expected by practice.',
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
            title: 'Register the activity at VMI',
            where: 'Mano VMI, online',
            cost: '€0',
            takes: 'Same day',
            body: [
              'Pick the activity (EVRK codes), and you may invoice immediately. Sodra - social insurance - learns automatically; contributions follow the annual declaration rather than fixed monthly bills, with the option to pay as you go.',
            ],
          },
          {
            title: 'Choose real or presumed costs',
            body: [
              'Deduct documented expenses, or a flat 30% of income with no receipts at all. The 30% route plus the low starting rate is what makes the first years nearly administration-free.',
            ],
          },
          {
            title: 'Watch VAT at €45,000',
            body: [
              'PVM registration is compulsory once twelve-month turnover passes €45,000, with the usual EU cross-border triggers arriving earlier for B2B services abroad.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Individual activity', amount: '€0' },
          { what: 'MB registration', amount: '~€100' },
          { what: 'UAB', amount: '€1,000 capital + ~€100 fees' },
          { what: 'VSD/PSD contributions', amount: '~20% on 90% of profit', note: 'With annual ceilings.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Individuali veikla', means: 'Individual activity under certificate - the free same-day start.' },
          { term: 'Verslo liudijimas', means: 'The per-month lump-sum licence for listed trades.' },
          { term: 'VMI / Mano VMI', means: 'The tax inspectorate and its portal.' },
          { term: 'Sodra', means: 'Social insurance.' },
          { term: 'MB', means: 'The small partnership without capital requirements.' },
          { term: 'UAB', means: 'The €1,000 limited company.' },
          { term: 'PVM', means: 'VAT, compulsory at €45,000.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Forgetting Sodra because nothing bills monthly - the annual settlement arrives regardless.',
          'Missing the point where the sliding rate makes a UAB comparison worth running.',
          'MB member/employee confusion - the flexibility has hard edges.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'VMI', href: 'https://www.vmi.lt', note: 'Individual activity and the rate mechanics.' },
          { label: 'Registrų centras', href: 'https://www.registrucentras.lt', note: 'MB and UAB formation.' },
          { label: 'Sodra', href: 'https://www.sodra.lt', note: 'Contribution rules.' },
        ],
      },
    ],
  },
}
