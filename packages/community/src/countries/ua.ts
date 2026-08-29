import type { Guide } from '../guide'
import type { Text } from '../text'

/** Ukraine. */
export const UKRAINE: Text<Guide> = {
  en: {
    title: 'Starting a business in Ukraine',
    standfirst:
      'The FOP through Diia in a day, the single-tax groups that price most freelance work at 5%, and the wartime footnotes that belong on everything.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Ukraine made the solo start one of the world’s fastest: the FOP (ФОП - individual entrepreneur) registers free through the Diia portal or app, usually within a day, with the simplified single-tax election made in the same flow. Group 3 - the freelancer staple - pays 5% of turnover (or 3% plus VAT) up to a generous ceiling, plus the unified social contribution.',
          'The permanent footnote since 2022: martial law adjusts rules repeatedly - contribution holidays came and went, thresholds moved with the minimum wage, and banking under wartime constraints has its own texture. The sequence below is stable; every number deserves a same-week check against official sources.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'FOP or TOV?',
            options: [
              {
                name: 'FOP',
                when: 'Solo work of any digital kind - the overwhelming default.',
                costs: 'Free; single tax 5% of turnover in group 3 plus the unified social contribution (~22% of minimum wage monthly).',
                catch: 'Personal liability, and the single-tax groups have activity and turnover boundaries that matter when clients or revenue change.',
              },
              {
                name: 'TOV (ТОВ)',
                when: 'Partners, employees at scale, investors.',
                costs: 'No minimum capital; registration free through Diia or a notary.',
                catch: 'Ordinary profit tax (18%) unless the company itself elects simplified status; corporate banking and reporting overhead.',
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
            title: 'Register via Diia',
            where: 'diia.gov.ua, with a qualified e-signature (Diia.Signature works)',
            cost: '₴0',
            takes: 'Often within hours',
            body: [
              'Choose KVED activity codes generously and elect the single-tax group and, in group 3, the 5% no-VAT variant unless VAT is specifically wanted. Confirmation lands in the state register and the tax office follows automatically.',
            ],
          },
          {
            title: 'Open the FOP bank account',
            body: [
              'A dedicated entrepreneur account, at any bank - the fintechs onboard FOPs in a day. Foreign-currency earnings arrive through it with the bank handling conversion rules.',
            ],
          },
          {
            title: 'Pay the two recurring amounts',
            body: [
              'The single tax (quarterly in group 3) and the unified social contribution (ESV, monthly/quarterly on at least the minimum-wage base). Reporting is a simple declaration; most FOPs run it themselves from the bank’s own tools.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'FOP registration', amount: '₴0' },
          { what: 'Single tax, group 3', amount: '5% of turnover' },
          { what: 'ESV', amount: '~22% of minimum wage', note: 'Monthly base; wartime holidays have applied at times.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ФОП (FOP)', means: 'The individual entrepreneur.' },
          { term: 'Дія (Diia)', means: 'The state portal and app where registration happens.' },
          { term: 'Єдиний податок', means: 'The single tax; group 3 is the freelancer standard.' },
          { term: 'ЄСВ (ESV)', means: 'The unified social contribution.' },
          { term: 'КВЕД (KVED)', means: 'The activity codes.' },
          { term: 'ТОВ (TOV)', means: 'The limited liability company.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Working outside the registered KVED codes - single-tax status can be stripped retroactively.',
          'Group boundaries crossed by one good contract.',
          'Assuming last year’s wartime relief still applies.',
          'Foreign clients paying to a personal account instead of the FOP account.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Diia', href: 'https://diia.gov.ua', note: 'Registration and the business section.' },
          { label: 'State Tax Service', href: 'https://tax.gov.ua', note: 'Groups, rates, ESV.' },
        ],
      },
    ],
  },
}
