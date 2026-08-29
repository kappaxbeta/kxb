import type { Guide } from '../guide'
import type { Text } from '../text'

/** Croatia. */
export const CROATIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Croatia',
    standfirst:
      'The obrt, the paušalni flat-tax bands that make small service work simple, and the j.d.o.o. for when a company is wanted cheaply.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The Croatian small-business workhorse is the obrt - the craft/trade registration - and specifically the paušalni obrt: a flat-tax variant where income tax is a fixed sum by revenue band and bookkeeping is a single ledger. It is the form half the country’s freelancers and seasonal businesses use.',
          'Since euro adoption and the 2025 tax changes, the paušalni ceiling moved to €60,000 alongside the VAT threshold - the pairing is deliberate, so one crossing changes both regimes at once. Contributions are paid monthly on fixed bases; a first-time obrt owner gets a one-year exemption from income tax advances but not from contributions.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Obrt or d.o.o.?',
            options: [
              {
                name: 'Paušalni obrt',
                when: 'Services under €60,000 with modest costs.',
                costs: 'Registration ~€2 (the fee is symbolic since digitisation); fixed tax by band, from a few hundred euro a year.',
                catch: 'Personal liability, and employment alongside an obrt changes the contribution picture - check before combining.',
              },
              {
                name: 'd.o.o. / j.d.o.o.',
                when: 'Liability, partners, growth. The j.d.o.o. forms with ~€1 capital as a starter that must convert as reserves build; the full d.o.o. wants €2,500.',
                costs: 'Via HITRO.HR or e-osnivanje, roughly €60-400 depending on the variant.',
                catch: 'Corporate accounting from day one, 10/18% profit tax, and director contributions on a prescribed base.',
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
            title: 'Register the obrt',
            where: 'e-Obrt online, or any county office',
            cost: '~€2',
            takes: 'Days',
            body: [
              'You choose the activities (free trades need no qualification; tied trades need certificates), the seat, and the start date. The obrtnica - the licence - follows, and the tax administration is notified.',
            ],
          },
          {
            title: 'Elect paušalni status with the Porezna uprava',
            body: [
              'The flat-tax election is made at the tax office after registration. The bands set a presumed income; tax lands quarterly in small fixed amounts, and the annual PO-SD report is one page.',
            ],
          },
          {
            title: 'Pay the monthly contributions',
            body: [
              'Pension and health contributions on the prescribed obrt base, roughly €250-300 a month at current bases, from the first month.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Obrt registration', amount: '~€2' },
          { what: 'Contributions', amount: '~€250-300/month', note: 'On the fixed base.' },
          { what: 'Paušalni tax', amount: 'A few hundred €/year by band' },
          { what: 'j.d.o.o. formation', amount: '~€60-100', note: 'Plus the conversion duty as it grows.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Obrt / obrtnica', means: 'The trade registration and its licence.' },
          { term: 'Paušalni obrt', means: 'The flat-tax variant to €60,000.' },
          { term: 'Porezna uprava', means: 'The tax administration.' },
          { term: 'PO-SD', means: 'The one-page annual flat-tax report.' },
          { term: 'j.d.o.o.', means: 'The €1 starter company that converts upward.' },
          { term: 'HITRO.HR', means: 'The one-stop company formation service.' },
          { term: 'OIB', means: 'The personal identification number on everything.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Crossing €60,000 and losing paušalni and VAT exemption in the same breath.',
          'Combining employment and obrt without checking the contribution consequences.',
          'Treating the one-year tax-advance holiday as a contributions holiday - it is not.',
          'Tourist-season revenue concentration pushing a band jump late in the year.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'e-Obrt', href: 'https://e-obrt.gov.hr', note: 'The registration.' },
          { label: 'Porezna uprava', href: 'https://www.porezna-uprava.hr', note: 'Bands, thresholds, contributions.' },
          { label: 'HITRO.HR', href: 'https://www.hitro.hr', note: 'Company formation.' },
        ],
      },
    ],
  },
}
