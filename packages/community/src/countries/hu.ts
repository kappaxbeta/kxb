import type { Guide } from '../guide'
import type { Text } from '../text'

/** Hungary. */
export const HUNGARY: Text<Guide> = {
  en: {
    title: 'Starting a business in Hungary',
    standfirst:
      'Egyéni vállalkozó in a day for free - the thinking is in the tax regimes, and in what happened to KATA.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Registering as a Hungarian sole proprietor (egyéni vállalkozó) is free, online via the government portal, and active within a day. The interesting decisions are all tax regimes - and the cautionary tale is KATA, the beloved flat tax that was restricted overnight in 2022 to businesses selling only to private individuals, stranding a hundred thousand B2B freelancers mid-year. Regimes here can change fast; structure accordingly.',
          'The current staple for small business is the alanyi adómentesség - the subjective VAT exemption up to HUF 18 million (raised from 12M in 2025) - combined with either the itemised flat-rate costing (átalányadó) or ordinary bookkeeping.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell and the regime',
        choices: [
          {
            question: 'Egyéni vállalkozó or Kft.?',
            options: [
              {
                name: 'Egyéni vállalkozó',
                when: 'The solo default.',
                costs: 'Free to register; contributions at least on the minimum wage monthly.',
                catch: 'Personal liability, and the regime choice (átalányadó bands, KATA only for B2C) decides the economics more than the status does.',
              },
              {
                name: 'Kft.',
                when: 'Liability or partners. HUF 3,000,000 capital, not all cash up front.',
                costs: 'Lawyer-drafted formation, commonly HUF 50,000-150,000 plus duty.',
                catch: '9% corporate tax is Europe’s lowest, but salaries carry heavy social charges, and dividends their own tax - the blended rate is ordinary.',
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
            title: 'Register via the Webes Ügysegéd',
            where: 'magyarorszag.hu, with Client Gate (Ügyfélkapu) credentials',
            cost: 'HUF 0',
            takes: 'Usually same day',
            body: [
              'You pick ÖVTJ activity codes and the tax elections - the VAT exemption and átalányadó are chosen here. The tax number arrives with the confirmation.',
            ],
          },
          {
            title: 'Understand átalányadó before electing it',
            body: [
              'The flat-rate regime assumes costs at 40/80/90% by activity and taxes the rest as income, with generous exemptions at the bottom. For most service freelancers under the caps it is the good deal KATA used to be - legitimately, and B2B included.',
            ],
          },
          {
            title: 'Invoice through NAV-connected software',
            body: [
              'Every invoice reports to NAV in real time - online számla is not optional. Any mainstream Hungarian invoicing tool handles it; a foreign template does not.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Registration', amount: 'HUF 0' },
          { what: 'Monthly contributions', amount: 'At least on the minimum wage', note: 'Unless also employed full-time elsewhere.' },
          { what: 'Kft. formation', amount: 'HUF 50,000-150,000 + duty' },
          { what: 'Accountant', amount: 'HUF 15,000-40,000/month', note: 'Standard practice.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Egyéni vállalkozó', means: 'The sole proprietor.' },
          { term: 'Ügyfélkapu', means: 'The Client Gate login for everything official.' },
          { term: 'NAV', means: 'The tax authority, receiving every invoice in real time.' },
          { term: 'Alanyi adómentesség', means: 'The VAT exemption to HUF 18 million.' },
          { term: 'Átalányadó', means: 'The flat-rate costing regime that replaced KATA for B2B.' },
          { term: 'KATA', means: 'The old flat tax - now B2C-only, and the reason Hungarians diversify regimes.' },
          { term: 'Kft.', means: 'The HUF 3M limited company under the 9% corporate rate.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Building on any single regime as if it were permanent - KATA is the proof.',
          'Issuing an invoice outside the NAV-connected system.',
          'Forgetting minimum-wage-based contributions run monthly even in quiet months.',
          'Electing átalányadó with the wrong cost band for the activity.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'NAV', href: 'https://nav.gov.hu', note: 'Regimes, thresholds, online számla.' },
          { label: 'Magyarország.hu', href: 'https://magyarorszag.hu', note: 'The registration itself.' },
        ],
      },
    ],
  },
}
