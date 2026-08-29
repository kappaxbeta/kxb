import type { Guide } from '../guide'
import type { Text } from '../text'

/** Italy. */
export const ITALY: Text<Guide> = {
  en: {
    title: 'Starting a business in Italy',
    standfirst:
      'Opening the partita IVA is free - the whole game is choosing the forfettario regime well and knowing which INPS box you fall into.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The Italian start is the partita IVA - the VAT number that is also your business identity - opened free at the Agenzia delle Entrate. What deserves the thinking is the tax regime attached to it: the regime forfettario turns the first years of most small businesses into a flat-tax arrangement generous enough that leaving money on the table means choosing wrong, not registering wrong.',
          'Forfettario in one paragraph: up to €85,000 revenue, tax is a flat 15% - and 5% for the first five years of a genuinely new activity - applied to a coefficient of revenue by activity code (78% for most professionals), with no VAT charged and almost no bookkeeping. The trade-off is the usual one: no cost deduction beyond the coefficient, and no VAT reclaim.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Ditta individuale or SRL?',
            options: [
              {
                name: 'Ditta individuale / libero professionista',
                when: 'The default. Professionals open only the partita IVA; trades register with the Registro Imprese too, via the Comunicazione Unica.',
                costs: '€0 to open the partita IVA; artisans and traders pay INPS fixed contributions (~€4,500/year) regardless of profit.',
                catch: 'Which INPS box you land in - gestione separata (~26% of profit, professionals) versus artigiani/commercianti (fixed minimums) - changes the economics more than the tax rate does.',
              },
              {
                name: 'SRL / SRLS',
                when: 'Liability or partners. The SRLS variant has €1 capital and no notary fee, on unmodifiable standard bylaws.',
                costs: 'SRL by notary €1,500-2,500; SRLS state costs only (~€320), but the fixed bylaws bite once you want investors.',
                catch: 'Corporate accounting and a commercialista from day one - €2,000-4,000 a year is a normal quote.',
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
            title: 'Open the partita IVA',
            where: 'Agenzia delle Entrate: form AA9/12, directly or through a commercialista',
            cost: '€0',
            body: [
              'You choose the ATECO activity code and the regime. The code matters twice: it sets the forfettario coefficient and the INPS classification. Most people hand this one form to a commercialista precisely because of those two consequences.',
            ],
          },
          {
            title: 'Register with INPS (and the Registro Imprese if trading)',
            body: [
              'Professionals enrol in the gestione separata (or their profession’s own cassa - lawyers, engineers and the like have separate funds with their own rules). Artisans and traders go through the Comunicazione Unica, which files the chamber of commerce, INPS and INAIL in one act.',
            ],
            watch: 'The artigiani/commercianti fixed minimums (~€4,500/year) are due from enrolment even at zero revenue - a first-year reduction exists on request.',
          },
          {
            title: 'Invoice electronically',
            body: [
              'Fatturazione elettronica through the SdI exchange system is compulsory for essentially everyone now, forfettario included. Your invoicing tool talks to the state; paper is over.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Partita IVA', amount: '€0' },
          { what: 'Forfettario tax', amount: '5-15% of coefficient revenue', note: '5% for the first five years of a new activity.' },
          { what: 'INPS gestione separata', amount: '~26% of taxable income', note: 'Professionals without a cassa.' },
          { what: 'INPS artisans/traders', amount: '~€4,500/year fixed minimum', note: 'Plus a percentage above the minimal income.' },
          { what: 'Commercialista', amount: '€300-1,500/year', note: 'Forfettario keeps it cheap; ordinary regime does not.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Partita IVA', means: 'The VAT number that is the business identity.' },
          { term: 'Regime forfettario', means: 'The flat-tax regime to €85,000: 15%, or 5% for new activities.' },
          { term: 'ATECO', means: 'The activity code that fixes coefficient and INPS box.' },
          { term: 'Gestione separata', means: 'INPS scheme for professionals without their own fund.' },
          { term: 'Comunicazione Unica', means: 'The single filing for trades: register, INPS, INAIL at once.' },
          { term: 'Fatturazione elettronica / SdI', means: 'Compulsory e-invoicing through the state exchange.' },
          { term: 'Commercialista', means: 'The accountant nearly everyone hands the forms to.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Picking an ATECO code casually and inheriting the wrong coefficient and INPS box.',
          'Losing forfettario eligibility mid-year (the €85k ceiling, or invoicing mainly your recent employer) and discovering it at return time.',
          'Artisans’ fixed INPS minimums at zero revenue.',
          'Assuming the 5% rate applies to a relaunched old activity - it requires genuine novelty.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Agenzia delle Entrate', href: 'https://www.agenziaentrate.gov.it', note: 'Partita IVA and the forfettario rules.' },
          { label: 'INPS', href: 'https://www.inps.it', note: 'Gestione separata and the artisan/trader minimums.' },
          { label: 'Registro Imprese', href: 'https://www.registroimprese.it', note: 'The Comunicazione Unica.' },
        ],
      },
    ],
  },
}
