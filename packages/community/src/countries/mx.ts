import type { Guide } from '../guide'
import type { Text } from '../text'

/** Mexico. */
export const MEXICO: Text<Guide> = {
  en: {
    title: 'Starting a business in Mexico',
    standfirst:
      'Everything begins at the SAT - the RFC, the e.firma appointment, and RESICO, the simplified regime that taxes small business at 1-2.5% of revenue.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Mexican formality lives at the SAT, the tax administration. A persona física registers business activity under the RFC (the tax ID), collects the e.firma - the cryptographic identity issued in person, by appointment, that signs everything after - and invoices through CFDI, the national e-invoice format that has no informal alternative: a business that cannot issue facturas barely exists to its customers.',
          'The regime that changed small business is RESICO (Régimen Simplificado de Confianza): individuals with up to MXN 3.5 million of revenue pay income tax at 1% to 2.5% of receipts, withheld and settled with almost no deductions arithmetic. It is genuinely simple - the appointment queue for the e.firma is the hard part.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Persona física or company?',
            options: [
              {
                name: 'Persona física con actividad empresarial',
                when: 'The solo default, ideally inside RESICO.',
                costs: 'Free at the SAT.',
                catch: 'RESICO eligibility has exclusions (certain income mixes, partners in companies) and slips away if requirements lapse - filing discipline is the price of the low rate.',
              },
              {
                name: 'SAS',
                when: 'A one-person company, formed free online through the economy ministry, revenue-capped (a few million pesos, indexed).',
                costs: '$0 formation - the only free company in the hemisphere.',
                catch: 'The cap, and banks treating young SAS accounts warily.',
              },
              {
                name: 'S. de R.L. / S.A. de C.V.',
                when: 'Partners, investors, scale.',
                costs: 'Notary formation commonly MXN 10,000-25,000.',
                catch: '30% corporate rate and full accounting; the notary step makes this days-to-weeks, not minutes.',
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
            title: 'RFC and e.firma at the SAT',
            where: 'sat.gob.mx - preregister online, finish at the office by appointment',
            cost: '$0',
            takes: 'The appointment wait is the bottleneck - book immediately',
            body: [
              'Bring CURP, ID and proof of address. The e.firma files (a certificate and key) leave with you on a USB stick; guard them - reissuing means another appointment.',
            ],
          },
          {
            title: 'Choose the regime - RESICO if it fits',
            body: [
              'Elected at registration or each January. Inside it, monthly declarations are near-automatic from your CFDIs; outside it, the actividad empresarial regime taxes profit at progressive rates with deductions.',
            ],
          },
          {
            title: 'Invoice by CFDI from day one',
            body: [
              'Facturas are stamped through the SAT’s systems (free tools exist; most use a certified provider for pesos a piece). IVA at 16% applies to most sales with monthly returns; clients will not pay without the factura, which keeps the system honest.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'RFC + e.firma', amount: '$0' },
          { what: 'RESICO income tax', amount: '1-2.5% of revenue' },
          { what: 'CFDI stamping', amount: 'A few pesos per invoice', note: 'Via certified providers.' },
          { what: 'Notary company', amount: 'MXN 10,000-25,000', note: 'SAS: free.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'SAT', means: 'The tax administration - the centre of everything.' },
          { term: 'RFC', means: 'The tax ID every person and business carries.' },
          { term: 'e.firma', means: 'The cryptographic signature issued in person.' },
          { term: 'CFDI / factura', means: 'The compulsory e-invoice format.' },
          { term: 'RESICO', means: 'The 1-2.5% simplified trust regime to MXN 3.5M.' },
          { term: 'IVA', means: 'VAT at 16%, monthly.' },
          { term: 'SAS', means: 'The free online single-shareholder company.' },
          { term: 'CURP', means: 'The population ID the RFC builds on.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Waiting weeks for an e.firma appointment because it was booked late.',
          'Losing the e.firma files.',
          'Falling out of RESICO through missed filings and landing in the general regime retroactively.',
          'Selling without CFDI capability and learning clients cannot deduct cash-register goodwill.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'SAT', href: 'https://www.sat.gob.mx', note: 'RFC, e.firma, RESICO, CFDI.' },
          { label: 'gob.mx - Tu empresa', href: 'https://www.gob.mx/tuempresa', note: 'The free SAS formation.' },
        ],
      },
    ],
  },
}
