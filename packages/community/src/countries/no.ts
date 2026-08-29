import type { Guide } from '../guide'
import type { Text } from '../text'

/** Norway. */
export const NORWAY: Text<Guide> = {
  en: {
    title: 'Starting a business in Norway',
    standfirst:
      'An ENK from Brønnøysund in a day, MVA at the NOK 50,000 line, and the trygdeavgift arithmetic that makes the AS attractive early.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Norwegian registration runs through Altinn into the Brønnøysund registers. An enkeltpersonforetak (ENK) is registered online, free in most cases, and exists within days. The AS (aksjeselskap) at NOK 30,000 capital is the standard company, and Norwegians reach for it earlier than the capital suggests - partly because an ENK’s profit carries a higher social security rate with fewer rights, while an AS owner can be their own employee.',
          'That is the piece worth understanding first: ENK profit pays trygdeavgift at the self-employed rate with no sick-pay from day one and no unemployment cover, while a salary from your own AS buys the full employee package. The maths of "ENK until it earns, AS when it does" is the standing local advice.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'ENK or AS?',
            options: [
              {
                name: 'Enkeltpersonforetak (ENK)',
                when: 'Testing, side income, low risk.',
                costs: 'Free in the Enhetsregisteret; a fee (~NOK 2,250) only if the optional Foretaksregisteret entry is needed.',
                catch: 'Higher trygdeavgift on profit, minimal sick-pay, no unemployment rights, personal liability.',
              },
              {
                name: 'Aksjeselskap (AS)',
                when: 'Real revenue, risk, or the wish to be your own employee.',
                costs: 'NOK 30,000 capital + ~NOK 5,570 registration.',
                catch: 'Employer duties the moment you pay yourself: a-melding every month, employer contributions ~14.1%.',
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
            title: 'Register via Altinn',
            where: 'altinn.no → Brønnøysundregistrene',
            cost: 'Free for a plain ENK',
            takes: 'Days',
            body: [
              'The organisation number that comes back is the identity for bank, invoices and every filing. An ENK name must include your surname; an AS name is free within the usual rules.',
            ],
          },
          {
            title: 'MVA: register when you cross NOK 50,000',
            where: 'Skatteetaten, via Altinn',
            body: [
              'VAT registration is compulsory once turnover passes NOK 50,000 in twelve months - and not permitted before, except by special grounds. You invoice without MVA until the crossing invoice, register, then add 25% from there. Returns are bi-monthly by default.',
            ],
            watch: 'The forced sequence - no VAT, cross the line, register, switch - confuses first-timers; the crossing invoice itself is the one to handle carefully.',
          },
          {
            title: 'Pay tax as forskuddsskatt',
            body: [
              'You report expected profit; Skatteetaten bills advance tax in four instalments. Adjust the estimate on skatteetaten.no when reality moves - nobody adjusts it for you.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'ENK registration', amount: 'NOK 0', note: 'Enhetsregisteret; the Foretaksregisteret entry costs extra if required.' },
          { what: 'AS registration', amount: '~NOK 5,570 + NOK 30,000 capital' },
          { what: 'Trygdeavgift on ENK profit', amount: '~11%', note: 'Versus 7.8% employee rate - the structural nudge toward the AS.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Brønnøysundregistrene', means: 'The national registers; Enhetsregisteret issues the organisation number.' },
          { term: 'Altinn', means: 'The portal every filing goes through.' },
          { term: 'ENK', means: 'The sole proprietorship, surname in the name.' },
          { term: 'AS', means: 'The NOK 30,000 limited company.' },
          { term: 'MVA', means: 'VAT - compulsory at NOK 50,000, not before.' },
          { term: 'Forskuddsskatt', means: 'Advance tax in four self-adjusted instalments.' },
          { term: 'A-melding', means: 'The monthly employment report an AS files for its own owner-employee.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Charging MVA before registration is allowed - the pre-threshold invoices must be net.',
          'Staying ENK long past the point where the AS employee package would pay for itself.',
          'Forgetting the a-melding rhythm the first month the AS pays a salary.',
          'Not adjusting forskuddsskatt in a good year and meeting the settlement in the next.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Brønnøysundregistrene', href: 'https://www.brreg.no', note: 'Registration and the registers.' },
          { label: 'Skatteetaten', href: 'https://www.skatteetaten.no', note: 'MVA, advance tax, rates.' },
          { label: 'Altinn starte og drive', href: 'https://info.altinn.no/en/start-and-run-business/', note: 'The official English-language guide.' },
        ],
      },
    ],
  },
}
