import type { Guide } from '../guide'
import type { Text } from '../text'

/** Romania. */
export const ROMANIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Romania',
    standfirst:
      'PFA or SRL through the ONRC - and a micro-enterprise regime that keeps shrinking, so check the thresholds before building on them.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Romanian founders choose between the PFA (persoană fizică autorizată - an authorised natural person) and the SRL, both registered at the trade register, the ONRC. The PFA is quicker and taxed as personal income; the SRL rides the micro-enterprise regime - a percentage tax on revenue instead of profit - which has been Romania’s draw for a decade and has been tightened almost every year since 2022.',
          'That instability is the first fact to plan around: the micro regime’s ceiling has fallen from €1,000,000 to €500,000 to €250,000, with a further step to €100,000 legislated, and an employee requirement was added along the way. A structure chosen for the micro tax needs an exit plan for the year the rules move again.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'PFA or SRL?',
            options: [
              {
                name: 'PFA',
                when: 'Solo services within your documented qualification.',
                costs: 'ONRC registration, small fees; taxed at 10% on net income (real or a norm), plus health and pension contributions above thresholds tied to the minimum wage.',
                catch: 'The activity must match your studies or certificates, and CAEN codes are limited in number.',
              },
              {
                name: 'SRL',
                when: 'Anything larger, or anything wanting the micro regime.',
                costs: 'RON 1 capital minimum; registration a week or two through the ONRC.',
                catch: 'Micro status needs at least one employee (or the founder employed), and dividends out carry their own tax (raised to 10%). The regime arithmetic changes with the calendar.',
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
            title: 'Reserve the name and file at the ONRC',
            where: 'portal.onrc.ro, or the county office',
            takes: 'Days for a PFA, one-two weeks for an SRL',
            body: [
              'The filing wants the CAEN activity codes, a registered office (proof of right to use the space - a comodat loan agreement on your own home is the standard trick), and for a PFA the qualification documents.',
            ],
          },
          {
            title: 'Register with ANAF and pick the tax vehicle',
            body: [
              'The fiscal registration follows the ONRC; the choices - micro versus profit tax for an SRL, real system versus income norms for a PFA - are declared here. VAT registration is separate and compulsory at RON 300,000 of turnover.',
            ],
          },
          {
            title: 'Set up e-Factura',
            body: [
              'Romania made structured e-invoicing through the national system compulsory for B2B - invoices go through e-Factura, not merely to the customer. Accounting software that speaks it is effectively mandatory equipment.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'ONRC registration', amount: 'RON 100-250 in fees' },
          { what: 'SRL capital', amount: 'RON 1 minimum' },
          { what: 'Accountant', amount: 'RON 200-500/month', note: 'Effectively required for an SRL.' },
          { what: 'Micro tax', amount: '1-3% of revenue', note: 'Plus dividend tax on the way out; thresholds move yearly.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ONRC', means: 'The trade register where both PFA and SRL are born.' },
          { term: 'PFA', means: 'The authorised natural person - qualification-bound solo work.' },
          { term: 'CAEN', means: 'The activity codes on every registration.' },
          { term: 'ANAF', means: 'The tax agency.' },
          { term: 'Micro-întreprindere', means: 'The revenue-taxed SRL regime with the moving ceiling.' },
          { term: 'e-Factura', means: 'The compulsory national e-invoicing system.' },
          { term: 'Comodat', means: 'The free-loan agreement that turns a flat into a registered office.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Building a pricing model on this year’s micro thresholds.',
          'A PFA activity outside the documented qualification.',
          'Ignoring e-Factura and having invoices that legally do not exist.',
          'Forgetting PFA health and pension contributions kick in at multiples of the minimum wage.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ONRC', href: 'https://www.onrc.ro', note: 'Registration and name search.' },
          { label: 'ANAF', href: 'https://www.anaf.ro', note: 'The current micro thresholds and e-Factura.' },
        ],
      },
    ],
  },
}
