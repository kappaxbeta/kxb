import type { Guide } from '../guide'
import type { Text } from '../text'

/** Latvia. */
export const LATVIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Latvia',
    standfirst:
      'Register the activity at the VID, or reach for the micro-enterprise tax - and know why the SIA at €2,800 stays the serious default.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'A Latvian solo start is registration as a performer of economic activity (saimnieciskās darbības veicējs) at the State Revenue Service, free and online via EDS. Ordinary income tax applies with real or documented costs - or the mikrouzņēmumu nodoklis (micro-enterprise tax), a 25% flat levy on turnover to €40,000 that bundles income tax and social contributions into one payment.',
          'The micro tax was once Latvia’s famous cheap regime; reforms narrowed it hard (no employees, no VAT registration compatibility). It still suits genuinely small solo work; anything bigger goes ordinary or straight to an SIA.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Self-employed or SIA?',
            options: [
              {
                name: 'Saimnieciskā darbība',
                when: 'Solo services.',
                costs: 'Free at the VID; ordinary rates, or the 25% micro tax on turnover to €40,000.',
                catch: 'Social contributions have minimum quarterly logic even at low profit; the micro tax forecloses VAT registration.',
              },
              {
                name: 'SIA',
                when: 'The standard company. Full capital is €2,800; the reduced-capital small SIA from €1 exists with profit-retention rules.',
                costs: 'Registration at the Uzņēmumu reģistrs ~€150 with e-signature.',
                catch: 'Corporate tax follows the Estonian model - 0% retained, 20%+ on distribution - but board-member salary rules still bite.',
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
            title: 'Register at the VID via EDS',
            cost: '€0',
            takes: 'Days',
            body: [
              'Declare the activity and, if wanted, elect the micro-enterprise tax for the year. eID or e-signature is the credential.',
            ],
          },
          {
            title: 'Know the contribution floors',
            body: [
              'Above modest income, mandatory social contributions apply on at least the minimum wage basis quarterly; below it, a 10% pension-only levy still catches most profit. The floors move with the minimum wage - check yearly.',
            ],
          },
          {
            title: 'VAT at €50,000',
            body: [
              'PVN registration is compulsory past €50,000 of twelve-month turnover - unavailable inside the micro regime, which is the regime’s sharpest edge for growing businesses.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Self-employed registration', amount: '€0' },
          { what: 'Micro-enterprise tax', amount: '25% of turnover', note: 'To €40,000; bundles tax and contributions.' },
          { what: 'SIA registration', amount: '~€150 + capital' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'VID / EDS', means: 'The revenue service and its e-declaration system.' },
          { term: 'Saimnieciskā darbība', means: 'Economic activity - the self-employed status.' },
          { term: 'Mikrouzņēmumu nodoklis', means: 'The 25% turnover tax to €40,000.' },
          { term: 'SIA', means: 'The limited company; distribution-taxed like Estonia’s.' },
          { term: 'Uzņēmumu reģistrs', means: 'The enterprise register.' },
          { term: 'PVN', means: 'VAT, compulsory at €50,000.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Choosing micro tax and then needing VAT registration for an EU client.',
          'Missing the quarterly contribution floors in thin quarters.',
          'Copying Estonian-guide logic wholesale - the Latvian variant differs in the details that cost money.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'VID', href: 'https://www.vid.gov.lv', note: 'Registration, micro tax, thresholds.' },
          { label: 'Uzņēmumu reģistrs', href: 'https://www.ur.gov.lv', note: 'SIA formation.' },
        ],
      },
    ],
  },
}
