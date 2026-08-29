import type { Guide } from '../guide'
import type { Text } from '../text'

/** India. */
export const INDIA: Text<Guide> = {
  en: {
    title: 'Starting a business in India',
    standfirst:
      'A proprietorship is a bank account and a GST decision - the company is a SPICe+ filing - and Udyam registration is the free step everyone should take.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'An Indian sole proprietorship has no registration of its own: PAN, a current account, and whatever sectoral licences apply. The two questions that shape the start are GST - registration is compulsory at ₹20 lakh of annual turnover for services (₹40 lakh for goods, lower in special-category states), and effectively earlier for interstate or marketplace sales - and whether clients demand a company.',
          'Two free registrations punch far above their cost: Udyam (the MSME registration, minutes online against Aadhaar) unlocks the delayed-payment protections and scheme access built for small business; and on the tax side, presumptive taxation under 44ADA lets professionals declare 50% of gross receipts as profit with no books to speak of, up to ₹75 lakh - the quiet engine of Indian freelancing.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Proprietorship, LLP, or private limited?',
            options: [
              {
                name: 'Proprietorship',
                when: 'Solo start.',
                costs: '₹0 beyond incidentals.',
                catch: 'No shield; banks want some registration (GST or Udyam serves) to open the current account.',
              },
              {
                name: 'LLP',
                when: 'Partners without the full company apparatus.',
                costs: 'MCA filing, modest fees; audit only above thresholds.',
                catch: 'Startup investors overwhelmingly prefer the private limited - the LLP is for services firms, not funding stories.',
              },
              {
                name: 'Private limited',
                when: 'Funding, ESOPs, corporate clients.',
                costs: 'SPICe+ on the MCA portal, all-in with DSCs commonly ₹7,000-15,000; no minimum capital.',
                catch: 'The compliance calendar (board meetings, ROC filings, audit regardless of size) makes a CA/CS retainer a fixed cost from day one.',
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
            title: 'Foundations: PAN, bank, Udyam',
            body: [
              'PAN exists for most adults; open the current account and file Udyam free at the official portal - beware lookalike paid sites.',
            ],
            watch: 'The Udyam portal is udyamregistration.gov.in. Every other domain selling it is a middleman.',
          },
          {
            title: 'Decide GST deliberately',
            where: 'gst.gov.in',
            body: [
              'Below the thresholds and selling intra-state, staying out is legal and simpler. Interstate services, exports (for refunds), or marketplace selling push registration regardless of turnover. Once in: monthly/quarterly returns for as long as the registration lives, including nil months.',
            ],
          },
          {
            title: 'For a company: SPICe+ end to end',
            where: 'mca.gov.in',
            takes: 'Days once DSCs exist',
            body: [
              'The integrated form issues name, incorporation, DIN, PAN, TAN, EPFO/ESIC and a bank account in one flow. Two directors, one resident in India, digital signatures for each.',
            ],
          },
          {
            title: 'Use the presumptive regimes while they fit',
            body: [
              '44ADA (professionals, 50% presumed profit to ₹75 lakh) and 44AD (businesses, 6-8% to ₹3 crore) trade deductions for near-zero bookkeeping. Advance tax still applies quarterly once liability passes ₹10,000.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Proprietorship', amount: '₹0' },
          { what: 'Udyam', amount: '₹0', note: 'Official portal only.' },
          { what: 'Private limited via SPICe+', amount: '₹7,000-15,000 all-in' },
          { what: 'CA retainer (company)', amount: '₹3,000-10,000/month', note: 'The real recurring cost.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'PAN / TAN', means: 'The tax identities for the person and for withholding.' },
          { term: 'GST / GSTIN', means: 'The unified indirect tax and its registration number.' },
          { term: 'Udyam', means: 'The free MSME registration with real protections attached.' },
          { term: 'SPICe+', means: 'The MCA’s integrated incorporation filing.' },
          { term: 'DSC / DIN', means: 'Digital signatures and director identification numbers.' },
          { term: '44ADA / 44AD', means: 'The presumptive-profit regimes for professionals and businesses.' },
          { term: 'ROC', means: 'The Registrar of Companies the annual filings go to.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Registering for GST casually and inheriting the return treadmill forever.',
          'Paying an agent site for Udyam.',
          'Interstate or marketplace sales below threshold without registration - the exemption does not cover them.',
          'A private limited formed for prestige and a compliance calendar nobody budgeted.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'MCA', href: 'https://www.mca.gov.in', note: 'SPICe+ and company filings.' },
          { label: 'GST portal', href: 'https://www.gst.gov.in', note: 'Thresholds and registration.' },
          { label: 'Udyam', href: 'https://udyamregistration.gov.in', note: 'The one real MSME portal.' },
        ],
      },
    ],
  },
}
