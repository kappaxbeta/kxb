import type { Guide } from '../guide'
import type { Text } from '../text'

/** South Africa. */
export const SOUTH_AFRICA: Text<Guide> = {
  en: {
    title: 'Starting a business in South Africa',
    standfirst:
      'CIPC registration in days with SARS attached automatically - the thinking is in the VAT line, turnover tax, and what tenders will ask for.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'A South African sole proprietorship needs no registration at all - trade begins, and profit lands in your personal SARS return with provisional tax twice a year. The Pty Ltd registers at the CIPC (or through the BizPortal front end) for under R200, no minimum capital, and arrives with its SARS income-tax number already issued - the integration that makes the process genuinely painless.',
          'What deserves planning: VAT registration is compulsory only at R1,000,000 of twelve-month turnover (voluntary from R50,000); the turnover-tax regime offers micro businesses under R1M a simple sliding levy instead of the full system; and anyone selling to government or large corporates will meet B-BBEE paperwork - for small businesses mostly a sworn affidavit, not the full scorecard.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole proprietor or Pty Ltd?',
            options: [
              {
                name: 'Sole proprietor',
                when: 'Simple start, low risk.',
                costs: 'R0.',
                catch: 'Personal liability and personal marginal rates to 45%; provisional tax deadlines are yours to remember.',
              },
              {
                name: 'Pty Ltd',
                when: 'Contracts, growth, separation.',
                costs: '~R125-175 via CIPC/BizPortal.',
                catch: '27% corporate rate plus dividends tax on extraction; CIPC annual returns (with fees) keep it alive, and lapsing them deregisters the company with the bank account attached.',
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
            title: 'Register at CIPC / BizPortal',
            where: 'bizportal.gov.za',
            cost: '~R125-175',
            takes: 'Days',
            body: [
              'Name reservation plus incorporation in one flow; the SARS income-tax registration comes bundled, and BizPortal can add a bank account application, domain and B-BBEE affidavit in the same sitting.',
            ],
          },
          {
            title: 'Set up the SARS relationship',
            where: 'eFiling',
            body: [
              'Provisional tax runs twice-yearly for individuals and companies alike. Small business corporations (SBC) get preferential graduated rates if they qualify; the micro turnover tax replaces the lot under R1M for those who elect it.',
            ],
          },
          {
            title: 'VAT when the line demands',
            body: [
              'Compulsory at R1M rolling turnover, voluntary from R50,000. B2B service exports and the usual digital-services rules apply; the 15% rate has been politically contested - check the current figure.',
            ],
          },
          {
            title: 'The employment add-ons',
            body: [
              'PAYE, UIF and SDL register together at SARS with the first employee; COIDA (workers’ compensation) registers at the Department of Employment and Labour. None applies to the solo founder without staff.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole proprietor', amount: 'R0' },
          { what: 'Pty Ltd', amount: '~R125-175' },
          { what: 'CIPC annual return', amount: 'R100-450/year', note: 'By turnover; skipping it deregisters the company.' },
          { what: 'Accountant', amount: 'R500-2,000/month', note: 'Customary for companies.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'CIPC', means: 'The companies commission.' },
          { term: 'BizPortal', means: 'The one-stop front end bundling company, tax, bank and B-BBEE.' },
          { term: 'SARS / eFiling', means: 'The revenue service and its portal.' },
          { term: 'Provisional tax', means: 'The twice-yearly prepayment cycle.' },
          { term: 'Turnover tax', means: 'The micro regime under R1M.' },
          { term: 'SBC', means: 'Small business corporation - the preferential rate table.' },
          { term: 'B-BBEE affidavit', means: 'The empowerment paperwork small businesses satisfy by sworn statement.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing CIPC annual returns and losing the company by deregistration.',
          'Provisional tax deadlines unmarked in the calendar.',
          'Registering for VAT voluntarily while selling to consumers.',
          'Assuming B-BBEE requires a consultant when an affidavit suffices below the threshold.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'BizPortal', href: 'https://www.bizportal.gov.za', note: 'The registration flow.' },
          { label: 'CIPC', href: 'https://www.cipc.co.za', note: 'Companies and annual returns.' },
          { label: 'SARS', href: 'https://www.sars.gov.za', note: 'VAT, turnover tax, SBC rates.' },
        ],
      },
    ],
  },
}
