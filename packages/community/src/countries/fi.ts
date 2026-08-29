import type { Guide } from '../guide'
import type { Text } from '../text'

/** Finland. */
export const FINLAND: Text<Guide> = {
  en: {
    title: 'Starting a business in Finland',
    standfirst:
      'A Y-tunnus from one YTJ filing - and YEL, the pension insurance whose self-declared income number quietly sets your whole safety net.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Finland registers a toiminimi (sole trader) through one YTJ filing that covers the trade register and the tax administration together; the Y-tunnus (business ID) arrives promptly and is the identity for everything after.',
          'The institution to understand before founding is YEL: entrepreneur pension insurance, compulsory once your work as an entrepreneur passes a modest income line (~€9,000/year) and lasts more than four months. You declare a "YEL income" figure, and that one number - not your real revenue - sets your pension, your sick pay, your parental allowance and your unemployment cover, along with a contribution around a quarter of it. Setting it artificially low is the classic Finnish founder mistake: cheap now, uninsured later.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Toiminimi or Oy?',
            options: [
              {
                name: 'Toiminimi (yksityinen elinkeinonharjoittaja)',
                when: 'The default start.',
                costs: '€0 filed online without trade-register entry, ~€70 with it.',
                catch: 'Profit is your personal income; liability is personal.',
              },
              {
                name: 'Osakeyhtiö (Oy)',
                when: 'Growth, partners, investors. No minimum capital since 2019.',
                costs: '~€380 online registration.',
                catch: 'Proper accounting and annual filings; the 20% corporate rate only helps once profits stay in the company.',
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
            title: 'Check starttiraha before registering',
            where: 'TE services',
            body: [
              'The startup grant (~€700+/month for up to 12 months) exists for founders coming from unemployment or employment - but only if you apply before the business starts. Registering first forfeits it.',
            ],
            watch: 'Order matters here more than anywhere else in the Finnish process.',
          },
          {
            title: 'File at YTJ',
            where: 'ytj.fi',
            cost: '€0-70',
            takes: 'Days',
            body: [
              'One filing covers the trade register (optional for a plain toiminimi), VAT registration, the prepayment register (ennakkoperintärekisteri - clients check it before paying invoices gross) and advance tax.',
            ],
          },
          {
            title: 'Take YEL seriously',
            where: 'Any pension company (Ilmarinen, Varma, Elo…)',
            body: [
              'Within six months of crossing the threshold. Declare a YEL income that matches what your work is worth - new entrepreneurs get a 22% contribution discount for four years, which softens an honest number.',
            ],
          },
          {
            title: 'Know the VAT threshold',
            body: [
              'The exemption line is €20,000 of annual turnover since 2025 (with the EU small-business scheme layered on for cross-border cases). Below it you may skip VAT; the old relief that tapered above the line was abolished, so the crossing is now clean.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Toiminimi via YTJ', amount: '€0-70' },
          { what: 'Oy registration', amount: '~€380' },
          { what: 'YEL contribution', amount: '~25% of declared YEL income', note: '22% discount for the first four years.' },
          { what: 'Starttiraha', amount: '~€700+/month received', note: 'If applied for before starting.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Y-tunnus', means: 'The business ID from the YTJ filing.' },
          { term: 'YTJ', means: 'The joint business information system of PRH and Vero.' },
          { term: 'YEL', means: 'Entrepreneur pension insurance; its declared income sets the whole safety net.' },
          { term: 'Ennakkoperintärekisteri', means: 'The prepayment register clients check before paying gross.' },
          { term: 'Starttiraha', means: 'The startup grant - apply before founding.' },
          { term: 'ALV', means: 'VAT; exemption under €20,000 since 2025.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Registering before the starttiraha application.',
          'Setting YEL income at the legal minimum and discovering the sick pay it bought.',
          'Not being in the prepayment register and having clients withhold tax from invoices.',
          'Using the abolished VAT-relief taper in a spreadsheet from 2023.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'YTJ', href: 'https://www.ytj.fi', note: 'The single filing.' },
          { label: 'Vero', href: 'https://www.vero.fi', note: 'VAT threshold, advance tax, in English.' },
          { label: 'Suomi.fi company pages', href: 'https://www.suomi.fi', note: 'The official founding guide.' },
        ],
      },
    ],
  },
}
