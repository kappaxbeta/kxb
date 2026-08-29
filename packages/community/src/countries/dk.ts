import type { Guide } from '../guide'
import type { Text } from '../text'

/** Denmark. */
export const DENMARK: Text<Guide> = {
  en: {
    title: 'Starting a business in Denmark',
    standfirst:
      'A CVR number from virk.dk in minutes - the Danish work is all in MitID, moms and knowing that no registration fee was ever the point.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Denmark makes the registration trivial and puts the friction where Denmark puts everything: digital identity. With MitID and access to virk.dk, an enkeltmandsvirksomhed (sole proprietorship) registers free in minutes and the CVR number arrives immediately. Without MitID nothing moves, so a newcomer’s first business step is at the citizen service centre, not the business portal.',
          'There is no separate tax registration for a sole trader - profit lands in your personal return, advance tax adjusts through your forskudsopgørelse, and the whole apparatus assumes you check skat.dk yourself. Danish authorities do not send bills; they expect you to look.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Enkeltmandsvirksomhed or ApS?',
            options: [
              {
                name: 'Enkeltmandsvirksomhed',
                when: 'The default one-person start.',
                costs: 'Free to register.',
                catch: 'Personal liability, and banks increasingly want to see activity before opening an erhvervskonto - the account hunt can outlast the registration by weeks.',
              },
              {
                name: 'ApS',
                when: 'Liability shield, partners, or investors.',
                costs: 'DKK 20,000 minimum capital (lowered from 40,000) plus a ~DKK 670 registration fee; formation documents are standard enough to do without a lawyer in simple cases.',
                catch: 'Annual reports are filed and public, and the capital must genuinely exist at formation.',
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
            title: 'Register on virk.dk',
            where: 'virk.dk, with MitID',
            cost: 'DKK 0 for a sole proprietorship',
            takes: 'Minutes; the CVR number is immediate',
            body: [
              'You choose the activity code and whether to register for moms (VAT) at once. The CVR number is the business identity for everything after - bank, invoices, contracts.',
            ],
          },
          {
            title: 'Moms: register at DKK 50,000',
            body: [
              'VAT registration is compulsory once turnover passes DKK 50,000 over twelve months - low by European standards, so most real businesses register from the start. Filing is quarterly (or half-yearly for small ones) on skat.dk, and the 25% rate has essentially no reduced bands to worry about.',
            ],
            watch: 'Certain services (some education, health, financial services) are moms-exempt but pay lønsumsafgift instead - check before assuming exemption is a win.',
          },
          {
            title: 'Set the advance tax and the pension habit',
            where: 'skat.dk',
            body: [
              'Update the forskudsopgørelse with expected profit so B-skat instalments match reality. Nothing forces pension savings or insurance on you; arbejdsskadeforsikring becomes compulsory only with employees. The safety net you had as an employee is now a to-do list.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole proprietorship registration', amount: 'DKK 0' },
          { what: 'ApS registration', amount: '~DKK 670 + DKK 20,000 capital' },
          { what: 'Accounting software', amount: 'DKK 100-300/month', note: 'Digital bookkeeping is required by the bookkeeping act for most businesses.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'CVR', means: 'The central business register and the number it issues.' },
          { term: 'virk.dk', means: 'The business portal where registration happens.' },
          { term: 'MitID', means: 'The national digital identity - the true prerequisite.' },
          { term: 'Moms', means: 'VAT, 25%, compulsory registration at DKK 50,000.' },
          { term: 'Forskudsopgørelse', means: 'The advance tax assessment you adjust yourself.' },
          { term: 'B-skat', means: 'The instalments self-employed income is taxed through.' },
          { term: 'Erhvervskonto', means: 'The business bank account - often the slowest step.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Waiting for a bill: skat.dk expects you to adjust advance tax yourself.',
          'Underestimating the bank-account hunt for a fresh CVR with no history.',
          'The DKK 50,000 moms line being crossed casually - it is one good project.',
          'Skipping the digital bookkeeping requirement because the business is small.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'virk.dk', href: 'https://virk.dk', note: 'Registration and every later filing.' },
          { label: 'skat.dk', href: 'https://skat.dk', note: 'Moms, B-skat and the advance assessment.' },
          { label: 'Erhvervsstyrelsen', href: 'https://erhvervsstyrelsen.dk', note: 'Company law and the bookkeeping act.' },
        ],
      },
    ],
  },
}
