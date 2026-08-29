import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * Nigeria, in English - which here is not a fallback but the language the
 * paperwork is actually in.
 *
 * Checked against the CAC and FIRS material listed at the bottom, with the
 * 2020 CAMA reforms and the 2023 single-window changes in. The honest caveat
 * is a different one than in the EU guides: practice varies by state and by
 * officer more than the statute suggests, so treat the sequence as firm and
 * the durations as optimistic.
 */
export const NIGERIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Nigeria',
    standfirst:
      'Business name or limited company, what the CAC portal actually does, and the two tax registrations that follow whether you ask for them or not.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'This is a map, not advice. Nigerian company law was rewritten in 2020 (CAMA 2020) and the registration machinery has been consolidated onto the CAC’s online portal since - guides describing an in-person CAC office visit with paper forms are describing the old world.',
          'The choice that shapes everything is the first one: registering a business name is cheap, fast and personal; incorporating a company creates a separate legal person with limited liability. Nigerian platforms, banks and payment processors increasingly distinguish hard between the two - a registered business name gets you a business bank account, but investors, many contracts and payment-gateway tiers want the LTD.',
          'One person is enough for either since CAMA 2020: single-shareholder private companies are allowed, which removed the last structural reason to put a second name on the papers.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Business name or limited company?',
            options: [
              {
                name: 'Business name (enterprise)',
                when: 'Trading under a name, small scale, keeping cost and filings minimal.',
                costs: 'Registration commonly around ₦10,000-25,000 all-in. Renewal-free; annual returns are a small flat filing.',
                catch:
                  'It is you, trading under another name - no liability shield, and the business dies with its owner. Some gateways and most investors treat it as a sole trader, because that is what it is.',
              },
              {
                name: 'Private limited company (LTD)',
                when: 'Anything meant to grow, raise money, take on contracts, or hold assets apart from you.',
                costs:
                  'CAC fees scale with authorised share capital; at the common â¦1,000,000 the state’s take is modest, and agents do the whole thing for â¦50,000-100,000. Stamp duty on the capital comes on top.',
                catch:
                  'Annual returns and audited-or-exempted financial statements every year, filed to the CAC, on pain of the company being struck off. Small companies under CAMA 2020 thresholds are exempt from audit - claim it rather than paying for one out of habit.',
              },
            ],
          },
          {
            question: 'How much authorised share capital?',
            options: [
              {
                name: 'The ₦1,000,000 default',
                when: 'A normal services or products company with Nigerian founders.',
                catch: 'CAMA 2020 replaced "authorised share capital" with minimum issued capital of ₦100,000 - but ₦1m stays the practical floor banks and platforms expect to see.',
              },
              {
                name: 'Higher, because a rule says so',
                when: 'Foreign participation (₦100,000,000 minimum since the 2023 handbook revision), or a licensed sector - fintech, lending, insurance - each with its own floor.',
                catch:
                  'Foreign-owned companies also need registration with the NIPC and a business permit before operating. This is the point where you hire counsel rather than an agent.',
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        intro: ['For a private LTD with Nigerian founders, done through the portal.'],
        steps: [
          {
            title: 'Reserve the name',
            where: 'pre.cac.gov.ng - the CAC company registration portal',
            cost: '₦500-1,000',
            takes: 'Usually within a day; the reservation holds for 60 days',
            body: [
              'Search first, then reserve two options - rejections for similarity are common and cost a round trip. The reserved name is a code you carry into the incorporation filing.',
            ],
          },
          {
            title: 'File the incorporation',
            where: 'The same portal, as one consolidated filing',
            cost: 'CAC fee by capital plus stamp duty; agent all-in commonly ₦50,000-100,000',
            takes: 'A few days when the documents are clean',
            body: [
              'The portal took over what used to be separate forms: details of the company, directors and shareholders, the registered address, and the constitution - CAMA’s model articles serve unless you upload your own.',
              'Everyone named needs a means of identity, and directors need their NIN. The filing is signed electronically; no commissioner for oaths, no physical stamping - stamp duty is paid within the same flow.',
              'What comes back is the certificate of incorporation carrying the RC number, and - since the FIRS integration - the company’s Tax Identification Number issued alongside it. Check the certificate for the TIN before assuming you must apply separately.',
            ],
            watch:
              'The registered address must be a real Nigerian street address that receives correspondence. CAC and FIRS letters that bounce are how companies discover they have been marked inactive.',
          },
          {
            title: 'Complete the tax registrations',
            where: 'FIRS (federal) and your state’s internal revenue service',
            takes: 'Days to weeks, varying by office',
            body: [
              'Even with the TIN auto-issued, the company registers with FIRS for its tax types: companies income tax, and VAT (7.5%) - registration for VAT is compulsory on starting business, with monthly returns due by the 21st once you cross the small-company threshold of ₦25,000,000 turnover; below it you are exempt from charging VAT but still file.',
              'The state revenue service is where PAYE for any employees lives, along with personal income tax if you also pay yourself a salary. Which state: the one where the office actually is.',
              'Small companies (turnover under ₦25m) pay 0% companies income tax under the Finance Act regime; the 2025 tax reform acts consolidated and largely preserved this - check the current thresholds at the source, because this is the number politics moves.',
            ],
          },
          {
            title: 'Open the corporate account',
            where: 'Any commercial bank',
            takes: 'Days, mostly KYC',
            body: [
              'The bank wants the certificate, the status report naming directors and shareholders (the portal issues it), the TIN, BVN and NIN of the signatories, and a board resolution. Fintech banks take the same documents with less queueing.',
              'SCUML certification - the anti-money-laundering registration - is demanded by banks for "designated non-financial businesses", a list wide enough to catch consultancies and real estate. If the bank asks, it is a free registration with the EFCC, done online.',
            ],
          },
          {
            title: 'Keep it alive',
            body: [
              'Annual returns to the CAC every year from the second year, small flat fee, struck off if ignored long enough. FIRS filings run on their own calendar regardless of activity - a dormant company that files nothing accumulates penalties that outgrow the company.',
              'If the product handles other people’s money or data at scale, check the licence question early: CBN for payments and lending, NDPC registration for data controllers above the thresholds. Cheaper as a design input than as a retrofit.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        intro: ['Private LTD, ₦1m capital, through an agent - the common founder path. Naira, because that is what everything is priced in.'],
        costs: [
          { what: 'Name reservation', amount: '₦500-1,000' },
          { what: 'CAC incorporation fee + stamp duty', amount: '₦25,000-50,000', note: 'Scales with capital.' },
          { what: 'Agent or lawyer, all-in', amount: '₦50,000-100,000', note: 'Optional; most first-timers use one.' },
          { what: 'TIN and FIRS registration', amount: '₦0', note: 'Free. Anyone charging for the TIN itself is charging for the queue.' },
          { what: 'SCUML certificate', amount: '₦0', note: 'Free, online, when the bank demands it.' },
          { what: 'Annual returns from year two', amount: 'Small flat fee', note: 'The cheap filing whose absence gets companies struck off.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'CAC', means: 'Corporate Affairs Commission - the company register. The portal at pre.cac.gov.ng is the whole front door.' },
          { term: 'CAMA 2020', means: 'The Companies and Allied Matters Act as rewritten in 2020: single-shareholder companies, minimum issued capital, statements of compliance.' },
          { term: 'RC number', means: 'The registration number on the certificate of incorporation.' },
          { term: 'BN number', means: 'The equivalent for a registered business name.' },
          { term: 'TIN', means: 'Tax Identification Number, issued with incorporation via the FIRS integration.' },
          { term: 'FIRS', means: 'Federal Inland Revenue Service - companies income tax and VAT.' },
          { term: 'State IRS', means: 'The state internal revenue service - PAYE and personal income tax.' },
          { term: 'NIN / BVN', means: 'National Identification Number and Bank Verification Number - the identity pair every filing and every bank form asks for.' },
          { term: 'SCUML', means: 'The EFCC’s anti-money-laundering registration that banks require of designated businesses.' },
          { term: 'NIPC', means: 'Nigerian Investment Promotion Commission - where foreign-owned companies register.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Paying an agent for the TIN as if it were a service - it is issued free with incorporation.',
          'A registered address that receives no mail. Bounced CAC correspondence is the quiet route to being marked inactive.',
          'Skipping annual returns because the company "did nothing". Strike-off and FIRS penalties both run on the calendar, not on activity.',
          'Charging VAT while under the exemption threshold, or not registering while over it - both happen, and both are findable in an audit.',
          'A licensed activity discovered late: lending, payments and crypto each have their own regulator, and "we are just an app" has not worked on any of them.',
          'Foreign participation without the NIPC registration and the ₦100m capital floor - it surfaces at the bank, months in.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'CAC registration portal', href: 'https://pre.cac.gov.ng', note: 'Name search, reservation and the whole filing.' },
          { label: 'CAC main site', href: 'https://www.cac.gov.ng', note: 'Fees schedule and the operations checklists.' },
          { label: 'FIRS', href: 'https://www.firs.gov.ng', note: 'Tax types, thresholds and the current reform-act rates.' },
          { label: 'SCUML', href: 'https://www.scuml.org', note: 'Whether your business is on the designated list, and the free registration.' },
          { label: 'NIPC', href: 'https://www.nipc.gov.ng', note: 'The foreign-participation track.' },
        ],
      },
    ],
  },
}
