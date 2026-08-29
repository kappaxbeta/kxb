import type { Guide } from '../guide'
import type { Text } from '../text'

/** Egypt. */
export const EGYPT: Text<Guide> = {
  en: {
    title: 'Starting a business in Egypt',
    standfirst:
      'GAFI’s one-stop handles the company, the tax card follows, and the e-invoice mandate now reaches everyone - the sequence is firm even where the details shift.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Egyptian founding runs through two authorities: GAFI (the investment authority) for companies via its one-stop shops and electronic platform, and the Egyptian Tax Authority for the tax card and registrations that make the business real to the state. A sole establishment (منشأة فردية) registers more simply through the commercial registry with a tax card attached.',
          'Two modernisations matter to a new founder: the e-invoicing mandate has been extended in waves until it now effectively covers all registered businesses - onboarding to the e-invoice portal is part of founding, not an afterthought - and the micro/small enterprise law (152/2020) offers simplified flat taxes for small turnover, worth checking before defaulting to the general regime.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole establishment or LLC?',
            options: [
              {
                name: 'Sole establishment',
                when: 'Solo local trade and services.',
                costs: 'Commercial registry and chamber fees - modest, in the low thousands of EGP with help.',
                catch: 'No liability shield; the owner and the establishment are one taxpayer.',
              },
              {
                name: 'LLC (ذ.م.م)',
                when: 'Partners, contracts, foreign shareholding (permitted in most sectors).',
                costs: 'GAFI one-stop incorporation; no meaningful statutory minimum capital for most activities; professional help commonly EGP 15,000-40,000 all-in.',
                catch: 'A local auditor and legal address are required; some sectors (importation for trading) still carry Egyptian-ownership quotas.',
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
            title: 'Clear the name and file at GAFI',
            where: 'GAFI one-stop or its e-incorporation portal',
            takes: 'Days for a standard LLC',
            body: [
              'Articles from the standard forms, a bank certificate where capital is deposited, and the security clearance for foreign shareholders (a background step that sets the real timeline).',
            ],
          },
          {
            title: 'Tax card and registrations',
            where: 'The Egyptian Tax Authority',
            body: [
              'The tax card is the operating identity. VAT registration is compulsory past EGP 500,000 of annual turnover (14% standard rate); the simplified small-enterprise regimes price turnover below thresholds at flat amounts or low percentages.',
            ],
          },
          {
            title: 'Onboard to e-invoicing / e-receipts',
            body: [
              'Register on the ETA’s electronic invoicing platform and issue through it - B2B by e-invoice, B2C progressively by e-receipt. Deductibility on the customer side enforces it commercially.',
            ],
          },
          {
            title: 'Social insurance and the operating layer',
            body: [
              'Employer registration with the National Organisation for Social Insurance accompanies the first hire; commercial premises meet the usual municipal licensing by activity.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole establishment', amount: 'Low thousands EGP with help' },
          { what: 'LLC via GAFI', amount: 'EGP 15,000-40,000 all-in typical' },
          { what: 'VAT threshold', amount: 'EGP 500,000', note: 'Compulsory registration above.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'GAFI', means: 'The investment authority and its one-stop shops.' },
          { term: 'Tax card (البطاقة الضريبية)', means: 'The tax identity every business shows.' },
          { term: 'ETA', means: 'The Egyptian Tax Authority and its e-invoice platform.' },
          { term: 'Law 152/2020', means: 'The MSME law with the simplified small-business taxes.' },
          { term: 'Commercial registry (السجل التجاري)', means: 'Where establishments and companies are recorded.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Treating e-invoicing as optional because the business is small - the waves have reached everyone registered.',
          'Foreign-shareholder security clearance not budgeted into the timeline.',
          'Importation-for-trade ownership quotas discovered after structuring.',
          'Numbers from guides older than the last currency move.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'GAFI', href: 'https://www.gafi.gov.eg', note: 'Incorporation and the one-stop.' },
          { label: 'Egyptian Tax Authority', href: 'https://www.eta.gov.eg', note: 'Tax card, VAT, e-invoicing.' },
        ],
      },
    ],
  },
}
