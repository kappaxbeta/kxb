import type { Guide } from '../guide'
import type { Text } from '../text'

/** Ghana. */
export const GHANA: Text<Guide> = {
  en: {
    title: 'Starting a business in Ghana',
    standfirst:
      'The ORC registers it, the Ghana Card is the TIN, and the choice between business name and company decides most of what follows.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Ghanaian registration runs through the Office of the Registrar of Companies (ORC, the successor to the old RGD), online via its portal or in person. The identity layer simplified recently: for individuals the Ghana Card PIN now serves as the TIN, so the separate tax-number hunt has largely disappeared.',
          'The first fork mirrors Nigeria’s: a business name (sole proprietorship) is fast and personal; a limited company is a separate person with the compliance calendar that implies. Companies also carry a stated capital requirement that rises steeply for foreign participation - wholly Ghanaian companies face only nominal figures.',
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
                name: 'Business name',
                when: 'Solo trade under a name.',
                costs: 'Roughly GHS 160-250 in official fees, renewable annually.',
                catch: 'No liability shield, and the annual renewal is easy to forget.',
              },
              {
                name: 'Company limited by shares',
                when: 'Growth, contracts, or any foreign shareholding.',
                costs: 'Incorporation fees plus 1% stamp duty on stated capital; agents commonly GHS 1,500-3,000 all-in for locals.',
                catch: 'Foreign participation triggers GIPC minimum-capital rules (from US$200,000 for joint ventures upward) - the number that decides structure for foreign founders.',
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
            title: 'Search and reserve the name',
            where: 'The ORC portal (egovonline / orc.gov.gh)',
            body: ['A name search first; reservations hold while the filing completes.'],
          },
          {
            title: 'Register with the ORC',
            takes: 'Days to a couple of weeks',
            body: [
              'Business names file a simple form; companies file the constitution details, directors (with Ghana Card), secretary and auditor particulars. The certificate carries the registration number the bank will ask for.',
            ],
          },
          {
            title: 'Confirm the GRA side',
            where: 'The Ghana Revenue Authority',
            body: [
              'The Ghana Card PIN is the TIN for individuals; companies get their TIN through registration. VAT registration is compulsory past GHS 200,000 of taxable turnover over twelve months; below it, presumptive and simplified schemes exist for small operators.',
            ],
          },
          {
            title: 'SSNIT and the operating layer',
            body: [
              'Employer registration with SSNIT arrives with the first hire. A district assembly business operating permit is the municipal layer most guides forget - the fee is local, the requirement is general.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Business name', amount: '~GHS 160-250', note: 'Plus annual renewal.' },
          { what: 'Company incorporation', amount: 'GHS fees + 1% stamp duty on capital' },
          { what: 'District assembly permit', amount: 'Local, by category' },
          { what: 'GIPC minimum capital', amount: 'From US$200,000', note: 'Foreign participation only.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ORC', means: 'The Office of the Registrar of Companies.' },
          { term: 'Ghana Card / TIN', means: 'The national ID whose PIN now serves as the individual tax number.' },
          { term: 'GRA', means: 'The Ghana Revenue Authority.' },
          { term: 'GIPC', means: 'The investment centre whose capital floors bind foreign founders.' },
          { term: 'SSNIT', means: 'The pension scheme employers register with.' },
          { term: 'Stated capital', means: 'The declared company capital that stamp duty prices.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Letting the business-name renewal lapse.',
          'Foreign shareholding entered casually and the GIPC floor discovered at the bank.',
          'Skipping the district assembly permit.',
          'Assuming an old RGD-era guide describes the current ORC portal.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ORC', href: 'https://orc.gov.gh', note: 'Registration and fees.' },
          { label: 'GRA', href: 'https://gra.gov.gh', note: 'TIN, VAT threshold, schemes.' },
          { label: 'GIPC', href: 'https://www.gipc.gov.gh', note: 'Foreign-participation rules.' },
        ],
      },
    ],
  },
}
