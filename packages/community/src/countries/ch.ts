import type { Guide } from '../guide'
import type { Text } from '../text'

/** Switzerland. */
export const SWITZERLAND: Text<Guide> = {
  en: {
    title: 'Starting a business in Switzerland',
    standfirst:
      'Why the AHV, not a registry, decides whether you are self-employed - and the CHF 100,000 lines that trigger the register and VAT.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Switzerland has no single founding act for a sole proprietor. You start working, and three thresholds decide what follows: the AHV compensation office must accept you as self-employed, the commercial register becomes compulsory at CHF 100,000 of revenue, and VAT registration becomes compulsory at CHF 100,000 of worldwide turnover.',
          'The AHV decision is the unusual one. Being self-employed is a status the Ausgleichskasse grants on evidence - several clients, own invoices, own risk. One client paying your invoices looks like employment, and the office will say so, which makes your client retroactively an employer. Line up two or three clients before you apply.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Which entity?',
            options: [
              {
                name: 'Einzelfirma (sole proprietorship)',
                when: 'One person, service work, starting out.',
                costs: 'Nothing to form; register entry (compulsory over CHF 100k revenue) costs ~CHF 120.',
                catch: 'Unlimited liability, and the firm name must contain your family name.',
              },
              {
                name: 'GmbH',
                when: 'Liability shield with modest capital: CHF 20,000, fully paid in.',
                costs: 'Notary and register, commonly CHF 700-1,500 all-in.',
                catch: 'Shareholders are public in the register, unlike the AG.',
              },
              {
                name: 'AG',
                when: 'The prestige vehicle: CHF 100,000 capital, at least CHF 50,000 paid in.',
                catch: 'Costs more to run than a young business usually justifies. The GmbH converts later.',
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
            title: 'Get accepted as self-employed by the AHV',
            where: 'The cantonal Ausgleichskasse (compensation office)',
            takes: 'A form plus evidence; a few weeks',
            body: [
              'Submit invoices, contracts or offers showing several clients and own risk. Once accepted you pay AHV/IV/EO contributions on your income - roughly 10% at full rate, on a sliding scale lower down.',
              'Pension beyond the AHV is your own problem as a sole proprietor: pillar 2 is voluntary, pillar 3a has a higher cap for people without one. Decide deliberately; nobody will chase you.',
            ],
            watch: 'One-client setups get refused. That refusal is the system working, not paperwork failing.',
          },
          {
            title: 'Register in the commercial register - when required or useful',
            where: 'The cantonal Handelsregisteramt; searchable via Zefix',
            cost: '~CHF 120 for a sole proprietorship',
            body: [
              'Compulsory above CHF 100,000 revenue, optional below. Registering early costs little and makes banks and clients take the firm name seriously.',
            ],
          },
          {
            title: 'VAT: watch the CHF 100,000 line',
            where: 'The Federal Tax Administration (ESTV), online',
            body: [
              'Registration is compulsory once worldwide turnover passes CHF 100,000; below it you may register voluntarily to reclaim input VAT. The standard rate is 8.1%, and the flat-rate scheme (Saldosteuersatz) trades reclaim rights for one simple rate on turnover - worth it for service businesses with few costs.',
            ],
          },
          {
            title: 'Sort what nobody mandates',
            body: [
              'No chamber membership, no compulsory accident insurance for yourself (but compulsory for employees from the first franc), no publication duties as a sole proprietor. The flip side: nothing arrives automatically. Health insurance stays your private policy; loss-of-earnings and liability insurance are choices worth making on purpose.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole proprietorship', amount: 'CHF 0', note: 'Plus ~CHF 120 if or when the register entry happens.' },
          { what: 'GmbH all-in', amount: 'CHF 700-1,500', note: 'Plus the CHF 20,000 capital, which stays yours.' },
          { what: 'AHV contributions', amount: '~10% of profit', note: 'Sliding scale below ~CHF 60k.' },
          { what: 'Health insurance', amount: 'Your existing premium', note: 'Unchanged by self-employment - the Swiss difference.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Ausgleichskasse', means: 'The cantonal compensation office that grants self-employed status.' },
          { term: 'AHV/IV/EO', means: 'The first-pillar social insurance your contributions feed.' },
          { term: 'Handelsregister / Zefix', means: 'The commercial register and its public search.' },
          { term: 'MWST', means: 'VAT: 8.1%, compulsory at CHF 100,000 turnover.' },
          { term: 'Saldosteuersatz', means: 'The flat-rate VAT scheme for simple businesses.' },
          { term: 'Säule 3a', means: 'The private pension pillar with the raised cap for the uninsured self-employed.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Applying to the AHV with a single client and getting refused - or worse, not applying and having the status unwound later.',
          'Missing the VAT line because foreign revenue counts toward the CHF 100,000.',
          'Skipping pension planning entirely because nothing forces it.',
          'Assuming cantonal practice is uniform - fees and speed differ canton by canton.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'EasyGov', href: 'https://www.easygov.swiss', note: 'The federal one-stop founding portal.' },
          { label: 'Zefix', href: 'https://www.zefix.ch', note: 'The register search - check your name here.' },
          { label: 'ESTV - VAT', href: 'https://www.estv.admin.ch', note: 'Registration and the flat-rate scheme.' },
          { label: 'AHV/IV information centre', href: 'https://www.ahv-iv.ch', note: 'The self-employment criteria, in plain language.' },
        ],
      },
    ],
  },
}
