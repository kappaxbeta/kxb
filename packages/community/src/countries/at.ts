import type { Guide } from '../guide'
import type { Text } from '../text'

/** Austria. English first; the German half belongs here the day it is written. */
export const AUSTRIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Austria',
    standfirst:
      'The Gewerbeschein, the chamber you cannot leave, and the SVS contributions that arrive whether or not the business earns.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Austria looks like Germany from a distance - a trade registration, a compulsory chamber, a tax questionnaire - but the pieces sit differently: the trade licence is checked against a qualification for many trades, the chamber (WKO) is per-trade rather than flat, and social insurance runs through one body, the SVS, whose bills are the real fixed cost.',
          'The distinction that matters first: freie Gewerbe (free trades - most services, software, consulting under the right wording) need no proof of qualification, while reglementierte Gewerbe (regulated trades - crafts, hospitality, finance) need a certificate of competence. Check the list before planning anything; the registration itself is the easy part.',
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
                name: 'Einzelunternehmen (sole trader)',
                when: 'One person starting out. The default, as everywhere.',
                costs: 'Registration is free of charges for founders under the NeuFöG relief - declare founder status when filing.',
                catch: 'Unlimited personal liability, and SVS contributions on at least the minimum base once you are past the insignificance thresholds.',
              },
              {
                name: 'GmbH',
                when: 'Liability shield or partners. Minimum share capital €10,000 since 2024, half paid in.',
                costs: 'Notary and Firmenbuch, commonly €1,000-2,500 all-in; NeuFöG waives some fees for genuine new founders.',
                catch: 'Minimum corporate tax (Mindest-KöSt) is due even in loss years, and accounts are published.',
              },
              {
                name: 'FlexKap (FlexCo)',
                when: 'The 2024 startup vehicle: same €10,000 floor, employee participation shares, lighter formalities for some resolutions.',
                catch: 'Young enough that some banks and counterparties still ask what it is. If you do not need its features, the GmbH is the boring right answer.',
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
            title: 'Check the trade and claim the founder relief',
            body: [
              'Look your activity up on the list of regulated trades. Most digital work fits a free trade wording - "IT-Dienstleistungen" covers a lot - and the WKO founder service will confirm the wording for nothing.',
              'The NeuFöG declaration (a form the WKO or the authority countersigns) waives most registration charges for a genuinely new business. Do it before filing, not after.',
            ],
          },
          {
            title: 'Register the trade (Gewerbeanmeldung)',
            where: 'The district authority (Bezirkshauptmannschaft or Magistrat), or online via GISA',
            cost: 'Free of federal charges for founders under NeuFöG',
            takes: 'Same day for free trades',
            body: [
              'You need ID and, for regulated trades, the proof of competence. The registration lands in GISA, the central trade register, and the licence is active immediately for free trades.',
              'This automatically makes you a WKO member - there is no opt-out - and triggers notification of the SVS.',
            ],
          },
          {
            title: 'Tell the Finanzamt',
            where: 'FinanzOnline',
            takes: 'A month deadline; the Steuernummer follows',
            body: [
              'The Fragebogen (Verf24 for individuals) asks the same consequential questions as the German one: expected profit, and whether you claim the Kleinunternehmer VAT exemption - in Austria up to €55,000 turnover since 2025.',
              'Advance income tax payments are set from your estimate, quarterly. Estimate honestly and low.',
            ],
          },
          {
            title: 'Settle with the SVS',
            where: 'svs.at',
            body: [
              'Self-employed social insurance - health, pension, accident - in one body. Below the insignificance thresholds you can stay out at first; above them contributions run on your actual profit, provisionally billed on the minimum base and recalculated after each tax return, which produces the infamous Nachzahlung two years later. Put money aside from the first invoice.',
            ],
            watch: 'The retroactive SVS recalculation is the trap everyone in Austria warns each other about. It is not a penalty; it is the design.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Gewerbeanmeldung', amount: '€0', note: 'With the NeuFöG founder declaration.' },
          { what: 'WKO chamber levy', amount: 'From ~€100/year', note: 'Varies by state and trade; the first year is often reduced.' },
          { what: 'SVS contributions', amount: 'From ~€180/month', note: 'On the minimum base; recalculated against real profit later.' },
          { what: 'GmbH formation', amount: '€1,000-2,500', note: 'Only for the company route.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Gewerbeschein / GISA', means: 'The trade licence, and the central register it lives in.' },
          { term: 'Freies / reglementiertes Gewerbe', means: 'Free trade needing no qualification, versus one needing a certificate of competence.' },
          { term: 'WKO', means: 'The economic chamber. Membership is automatic and compulsory.' },
          { term: 'SVS', means: 'The self-employed social insurance body. The big recurring bill.' },
          { term: 'NeuFöG', means: 'The founder relief that waives registration charges. Claim it before filing.' },
          { term: 'FinanzOnline', means: 'The tax portal - Austria’s ELSTER.' },
          { term: 'Kleinunternehmer', means: 'The VAT exemption, up to €55,000 turnover since 2025.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Not saving for the SVS recalculation - the year-two bill on year-one profit.',
          'Registering a regulated trade wording when a free one covers the work.',
          'Missing the NeuFöG declaration and paying charges that were waivable.',
          'Forgetting that the WKO levy arrives per trade licence held, not per person.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'USP - the business service portal', href: 'https://www.usp.gv.at', note: 'The official founding sequence.' },
          { label: 'WKO founder service', href: 'https://www.gruenderservice.at', note: 'Free advice, including the trade wording.' },
          { label: 'SVS', href: 'https://www.svs.at', note: 'Contribution bases and the insignificance thresholds.' },
          { label: 'GISA', href: 'https://www.gisa.gv.at', note: 'The trade register.' },
        ],
      },
    ],
  },
}
