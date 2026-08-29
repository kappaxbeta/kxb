import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * Bulgaria, in English.
 *
 * English first because the readers who have asked for it so far are running
 * businesses from Bulgaria in English. A Bulgarian version belongs here the
 * day somebody writes it - the shape is ready for a `bg` key, and `pick` will
 * keep answering honestly until then. Deliberately shorter than the German
 * guide: same skeleton, and the shared chapters carry everything that is not
 * Bulgarian.
 */
export const BULGARIA: Text<Guide> = {
  en: {
    title: 'Starting a business in Bulgaria',
    standfirst:
      'Why almost everyone starts with an EOOD, what the Trade Register actually wants, and the 10% headline that comes with footnotes.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'This is a map, not advice - see the German guide for the fuller version of that warning. Bulgaria changes details often enough that the date above matters: check the sources at the bottom before acting on a number.',
          'The headline that brings people here is real: 10% corporate tax, 10% flat personal income tax, 5% on dividends, and EU membership. The footnotes are social contributions on a minimum base whether or not you pay yourself, and an administration that runs in Bulgarian - assume you will pay an accountant from month one, and price that in. Practically every Bulgarian company does; a good one costs less than the mistakes.',
          'Bulgaria joined the euro area on 1 January 2026, so amounts here are in euro. Older sources quote leva - divide by 1.95583 and you have the euro figure.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        intro: [
          'The self-employed route exists, but unlike in Germany it is not the default for founders - contributions and liability push almost everybody straight to a company.',
        ],
        choices: [
          {
            question: 'Which entity?',
            options: [
              {
                name: 'Свободна професия / self-employed',
                when: 'Freelance work under your own name, keeping things minimal.',
                costs: 'Registration with the BULSTAT register, no company to maintain.',
                catch:
                  'Social contributions are due on at least the minimum base every month, profitable or not, and there is no liability shield. Most freelancers who stay on this route are there for the 25% flat expense allowance, which suits services with no costs.',
              },
              {
                name: 'EOOD (ЕООД) - single-owner limited company',
                when: 'One founder, which is most founders. This is the default answer, and the one an accountant will assume.',
                costs: 'Minimum capital is €1 in cents terms (2 leva historically - nominal). Formation all-in with a notary and fees: usually well under €200.',
                catch:
                  'You will almost certainly also be the manager (управител), and a manager owes social contributions on at least the minimum contribution base every month from day one. The 10% tax gets the headlines; this is the actual monthly cost of existing.',
              },
              {
                name: 'OOD (ООД) - multi-owner limited company',
                when: 'The same thing with partners.',
                costs: 'As the EOOD.',
                catch: 'Write the partnership terms into the articles while everybody is still friends. The statutory defaults are thin.',
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        intro: [
          'For an EOOD, which is the path nearly everyone takes. It is front-loaded: the Trade Register filing is the one real step, and the rest hangs off it.',
        ],
        steps: [
          {
            title: 'Pick the name and check it',
            body: [
              'The Trade Register refuses duplicates outright, so search it first. Check the trademark registers too - the Bulgarian Patent Office and EUIPO - for the same reasons as everywhere.',
              'The company name can be in Cyrillic or Latin script; documents will render it in both. Decide the spelling once, because every later mismatch between the two is a small administrative fight.',
            ],
          },
          {
            title: 'Open a capital-deposit account and draft the papers',
            where: 'Any bank, then a notary',
            cost: 'Bank fee for the escrow account, a notary fee of a few tens of euro',
            takes: 'A day or two',
            body: [
              'The founding documents for an EOOD are short: the incorporation act, the manager’s consent and specimen signature (notarised), and the bank’s certificate that the capital is deposited.',
              'The manager’s signature specimen is the one thing that must be notarised in person - or before a Bulgarian consul if founding from abroad. Everything else can be handled by a lawyer with power of attorney, which is how most non-residents do the whole thing.',
            ],
          },
          {
            title: 'File with the Trade Register (Търговски регистър)',
            where: 'registryagency.bg, form A4, online or on paper',
            cost: 'Roughly €25 filed online - half the paper fee',
            takes: 'Typically one to three working days',
            body: [
              'Online filing needs a qualified electronic signature (ÐÐÐ), which a lawyer filing for you will have. The register issues the EIK/BULSTAT number - the single identifier that is your company’s tax number, statistical number and registration number at once. There is no separate tax registration step: the EIK is it.',
              'When the entry appears, the company exists. The capital account converts to an ordinary account, or you open the operating account wherever you like.',
            ],
            watch:
              'Foreign founders: nothing stops a non-resident owning and managing an EOOD, but banks apply their own onboarding rules and are the slowest, most discretionary part of the whole process. Get the bank conversation started before you need the account.',
          },
          {
            title: 'VAT: decide, or be decided for',
            where: 'The National Revenue Agency (НАП)',
            takes: 'Registration, where needed, within 7 days of crossing the threshold',
            body: [
              'Registration is compulsory once taxable turnover over the last 12 months passes €50,000 (the threshold set with euro adoption - older sources say 100,000 leva, same number). Voluntary registration below that is allowed and normal for B2B businesses.',
              'Two triggers catch people early regardless of turnover: buying services from other EU businesses (a €0 threshold - receiving one Stripe invoice technically triggers a limited registration under art. 97a) and cross-border digital sales to consumers, where the EU-wide €10,000 One-Stop-Shop rules apply exactly as described in the Stripe chapter.',
              'Once registered, returns are monthly, by the 14th, filed electronically, in Bulgarian - this is the point where the accountant stops being optional in practice.',
            ],
          },
          {
            title: 'Declare the manager and start the monthly rhythm',
            where: 'НАП, via your accountant',
            body: [
              'Before the company pays anyone - including the manager - it registers as an employer and declares the manager’s insurance status. Social contributions for a self-insured manager run on a base between the statutory minimum and maximum, paid monthly, filed monthly.',
              'The annual rhythm: corporate tax return by 30 June, annual financial statements published to the Trade Register by 30 September, dividend at 5% withholding when you take profit out. An accountant’s monthly fee for a small company - commonly â¬50-150 - covers all of this.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        intro: ['EOOD, one founder, filed online through a lawyer, which is the common case.'],
        costs: [
          { what: 'Trade Register filing, online', amount: '≈ €25', note: 'Doubles on paper.' },
          { what: 'Notary: consent and signature specimen', amount: '€10-30' },
          { what: 'Capital', amount: 'From €1', note: 'Nominal since the minimum was cut. Deposit something workable anyway.' },
          { what: 'Lawyer doing the whole formation', amount: '€100-300', note: 'Optional, and what most non-residents do.' },
          { what: 'Accountant, monthly', amount: '€50-150', note: 'The real recurring cost, and effectively not optional once VAT-registered.' },
          { what: 'Manager’s social contributions, monthly', amount: 'From â â¬150', note: 'On the minimum base, due whether or not the company pays you a salary. The footnote to the 10% headline.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ÐÐÐÐ / EOOD', means: 'Single-owner limited liability company. The default founder’s vehicle.' },
          { term: 'ООД / OOD', means: 'The multi-owner version of the same.' },
          { term: 'Търговски регистър', means: 'The Trade Register at the Registry Agency. Where a company is born, filed and published.' },
          { term: 'ЕИК / EIK (БУЛСТАТ)', means: 'The single company identifier - tax, statistics and registration in one number.' },
          { term: 'НАП / NRA', means: 'The National Revenue Agency: tax and social contributions.' },
          { term: 'ДДС', means: 'VAT, 20% standard. Compulsory registration at €50,000 of rolling annual turnover.' },
          { term: 'КЕП', means: 'Qualified electronic signature, needed for online filings. Your lawyer or accountant has one.' },
          { term: 'Управител', means: 'The manager of an EOOD/OOD - the person whose monthly contributions are the hidden fixed cost.' },
          { term: 'Свободна професия', means: 'The registered self-employed route, via BULSTAT rather than the Trade Register.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Budgeting the 10% tax and not the manager’s monthly contributions, which are due from the first month regardless of revenue.',
          'Treating the bank account as a formality. For non-resident founders it is the slowest step and the only one that can simply refuse.',
          'Missing the art. 97a registration when buying EU services - one foreign B2B invoice is enough to require it, and the fine is per month of delay.',
          'Missing the 7-day window for compulsory VAT registration after crossing the threshold.',
          'Forgetting the 30 September publication of annual statements. The penalty attaches to the company and the manager personally.',
          'Assuming leva figures in older guides are a different number - since 2026 they are euro at 1.95583, not a moving rate.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Registry Agency - Trade Register', href: 'https://portal.registryagency.bg', note: 'Company search and the A4 filing.' },
          { label: 'National Revenue Agency (НАП)', href: 'https://nra.bg', note: 'VAT registration, contribution bases, deadlines.' },
          { label: 'Bulgarian Patent Office', href: 'https://www.bpo.bg', note: 'The trademark check.' },
          { label: 'Invest Bulgaria Agency', href: 'https://www.investbg.government.bg', note: 'The government’s English-language overview of forms and taxes.' },
        ],
      },
    ],
  },
}
