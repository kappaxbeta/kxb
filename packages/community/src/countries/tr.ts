import type { Guide } from '../guide'
import type { Text } from '../text'

/** Türkiye. */
export const TURKIYE: Text<Guide> = {
  en: {
    title: 'Starting a business in Türkiye',
    standfirst:
      'The şahıs şirketi opens online at the tax office - the young-entrepreneur exemption and the e-invoicing tiers are the parts worth planning.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'A Turkish sole proprietorship (şahıs şirketi) is opened at the tax office - now practically online through the Interactive Tax Office with an e-Devlet login - free of charge, often within days. An accountant (mali müşavir) countersigning the books is a de facto requirement of the system, and their monthly fee is the real fixed cost.',
          'Two structural facts shape planning: KDV (VAT) applies from the first invoice - there is no small-business threshold - and inflation keeps every lira figure moving, so rates survive in guides while amounts do not. The genç girişimci (young entrepreneur) relief is the standout: founders under 29 get a meaningful income-tax exemption for three years plus a year of Bağ-Kur premiums paid by the state.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Şahıs şirketi or Limited Şirket?',
            options: [
              {
                name: 'Şahıs şirketi',
                when: 'Solo start; fast and cheap.',
                costs: 'Free to open; accountant ₺1,000-3,000/month; Bağ-Kur social premiums monthly.',
                catch: 'Personal liability, progressive income tax to 40%, and the books still need the accountant.',
              },
              {
                name: 'Limited Şirket (Ltd. Şti.)',
                when: 'Liability, partners, or scale. Minimum capital ₺50,000 since 2024.',
                costs: 'MERSİS filing, trade registry and notary - commonly ₺15,000-30,000 all-in at current prices.',
                catch: '25% corporate tax plus dividend withholding; minimum capital and fees track inflation upward.',
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
            title: 'Open the activity at the tax office',
            where: 'İnteraktif Vergi Dairesi (ivd.gib.gov.tr), with e-Devlet',
            cost: '₺0',
            takes: 'Days, including the address verification visit',
            body: [
              'Declare the activity (NACE code) and address; the tax office may verify the workplace. The vergi levhası - the tax plate - is generated and must be displayed, even for a home office, in the e-system.',
            ],
          },
          {
            title: 'Claim the young-entrepreneur relief if eligible',
            body: [
              'Under 29 and first registration: an income-tax exemption on a sizeable annual tranche for three years, plus twelve months of Bağ-Kur paid from the treasury. Claim at opening through the accountant - retrofitting is painful.',
            ],
            watch: 'This is the single largest founder subsidy in the system and routinely missed by a few weeks of age or timing.',
          },
          {
            title: 'Enter the e-document world',
            body: [
              'E-invoice (e-Fatura) and e-archive tiers depend on turnover, but most new businesses are pushed into e-documents from early on; the accountant wires the integrations. KDV filings are monthly from month one.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Opening', amount: '₺0' },
          { what: 'Mali müşavir', amount: '₺1,000-3,000/month', note: 'The de facto requirement.' },
          { what: 'Bağ-Kur', amount: 'Minimum-wage-indexed monthly', note: 'A year covered for young entrepreneurs.' },
          { what: 'Ltd. Şti. all-in', amount: '₺15,000-30,000 + ₺50,000 capital' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Şahıs şirketi', means: 'The sole proprietorship.' },
          { term: 'İnteraktif Vergi Dairesi', means: 'The online tax office where it opens.' },
          { term: 'Vergi levhası', means: 'The tax plate every business must display.' },
          { term: 'Bağ-Kur', means: 'Self-employed social security (4B).' },
          { term: 'Genç girişimci', means: 'The under-29 founder relief.' },
          { term: 'KDV', means: 'VAT - from the first invoice, no threshold.' },
          { term: 'MERSİS', means: 'The central registry system for companies.' },
          { term: 'Mali müşavir', means: 'The certified accountant the system assumes.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Missing the genç girişimci window at opening.',
          'Budgeting from last year’s lira amounts.',
          'Skipping months of KDV filings because revenue was zero - filings are due anyway.',
          'Export-of-services VAT exemptions assumed rather than confirmed for foreign clients.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'GİB - Interactive Tax Office', href: 'https://ivd.gib.gov.tr', note: 'The opening and every filing.' },
          { label: 'SGK', href: 'https://www.sgk.gov.tr', note: 'Bağ-Kur premiums.' },
          { label: 'MERSİS', href: 'https://mersis.ticaret.gov.tr', note: 'Company formation.' },
        ],
      },
    ],
  },
}
