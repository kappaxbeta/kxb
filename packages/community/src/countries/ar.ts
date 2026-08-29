import type { Guide } from '../guide'
import type { Text } from '../text'

/** Argentina. */
export const ARGENTINA: Text<Guide> = {
  en: {
    title: 'Starting a business in Argentina',
    standfirst:
      'Monotributo folds tax and pension into one monthly category payment - the numbers move with inflation, the mechanism does not.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Argentina’s small-business front door is the monotributo: a unified regime where one monthly payment by category (A upward, set by revenue bands) covers income tax, VAT and pension. Registration happens online with the CUIT (tax ID) and the fiscal key (clave fiscal) at ARCA - the renamed AFIP - and is free.',
          'The permanent context is inflation: every threshold and category amount is re-indexed repeatedly; percentages and mechanisms are stable, absolute numbers are not. Plan against the mechanism, check the numbers the week you need them, and expect provincial taxes (ingresos brutos) as a second, separate layer with its own registrations.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Monotributo or the general regime?',
            options: [
              {
                name: 'Monotributista',
                when: 'Solo services and small trade inside the category ceilings.',
                costs: 'One monthly payment by category - modest at the bottom, scaling with the bands.',
                catch: 'Exceeding your category’s revenue, or tripping the spending indicators the system watches, recategorises or expels you into the general regime.',
              },
              {
                name: 'Responsable inscripto / SAS / SRL',
                when: 'Above the ceilings, or corporate clients wanting full VAT invoices.',
                costs: 'SAS formation online within days; SRL by notary. Both then face 21% IVA, profit tax, and the full filing calendar.',
                catch: 'The administrative jump is the largest in the hemisphere - the general regime is what monotributo exists to postpone.',
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
            title: 'Get the CUIT and clave fiscal',
            where: 'ARCA (ex-AFIP), online with in-person or app-based identity validation',
            cost: '$0',
            body: [
              'The clave fiscal is the login for every later act; raise its security level as prompted or half the services stay locked.',
            ],
          },
          {
            title: 'Enrol in monotributo and pick the category',
            where: 'monotributo.afip.gob.ar',
            body: [
              'Category follows expected revenue (and for some activities, premises data). The obra social election inside enrolment picks your health coverage - part of the same payment.',
            ],
          },
          {
            title: 'Register for ingresos brutos',
            where: 'Your province’s revenue agency (AGIP, ARBA, …)',
            body: [
              'The provincial turnover tax is separate from monotributo (some provinces offer a unified simplified option). Selling across provinces can mean the multilateral convention - a phrase that means "get an accountant this week".',
            ],
          },
          {
            title: 'Invoice electronically and recategorise on schedule',
            body: [
              'Facturas issue through the ARCA portal or its apps; monotributo recategorisation windows run twice a year, and skipping one while revenue grew is the classic expulsion route.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'CUIT + enrolment', amount: '$0' },
          { what: 'Monthly category payment', amount: 'By band, indexed', note: 'Check the current table - it moves.' },
          { what: 'Ingresos brutos', amount: '~1.5-5% of revenue by province and activity' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ARCA', means: 'The federal tax agency (formerly AFIP - both names circulate).' },
          { term: 'CUIT', means: 'The tax ID.' },
          { term: 'Clave fiscal', means: 'The credential every service hangs off.' },
          { term: 'Monotributo', means: 'The unified category regime.' },
          { term: 'Recategorización', means: 'The twice-yearly band adjustment you must do yourself.' },
          { term: 'Ingresos brutos', means: 'The provincial turnover tax layer.' },
          { term: 'Obra social', means: 'The health coverage chosen inside monotributo.' },
          { term: 'SAS', means: 'The fast online company for the general regime.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Skipping recategorisation after a good semester.',
          'Forgetting the provincial layer entirely.',
          'Planning on last quarter’s peso amounts.',
          'Card spending far above declared category revenue - the system cross-checks.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ARCA - monotributo', href: 'https://monotributo.afip.gob.ar', note: 'Categories and enrolment.' },
          { label: 'ARCA', href: 'https://www.arca.gob.ar', note: 'CUIT, clave fiscal, e-invoicing.' },
        ],
      },
    ],
  },
}
