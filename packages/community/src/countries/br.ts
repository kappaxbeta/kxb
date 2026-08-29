import type { Guide } from '../guide'
import type { Text } from '../text'

/** Brazil. */
export const BRAZIL: Text<Guide> = {
  en: {
    title: 'Starting a business in Brazil',
    standfirst:
      'MEI made a business a ten-minute website visit with one fixed monthly bill - and above its cap, Simples Nacional keeps the famous complexity at bay.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Brazil built the world’s most successful micro-business regime: MEI (microempreendedor individual) - free registration on gov.br, a CNPJ (company tax number) in minutes, and everything - tax, pension - folded into one fixed monthly payment of roughly R$70-80. The cap is R$81,000 of annual revenue, and a long list of professions (many regulated liberal professions excluded) defines who may use it.',
          'Above MEI, the Simples Nacional regime unifies federal, state and municipal taxes into one monthly payment on revenue (starting ~6% for services, by table) up to R$4.8 million - still simple by Brazilian standards, which is the only standard that matters here. Beyond that lies the full system whose complexity is internationally proverbial; a first business plans to stay inside the simplified tiers.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'MEI, or a Simples company?',
            options: [
              {
                name: 'MEI',
                when: 'Solo, under R$81,000/year, activity on the permitted list.',
                costs: 'Free to open; ~R$70-80 fixed monthly (the DAS).',
                catch: 'One employee maximum, the activity list, and crossing the cap mid-year forces migration with back-charges if ignored.',
              },
              {
                name: 'ME/LTDA under Simples Nacional',
                when: 'Above the MEI cap, excluded professions, or partners.',
                costs: 'Formation through a contador, commonly R$500-1,500; no minimum capital for an LTDA.',
                catch: 'A contador (accountant) is legally required for companies - budget the monthly fee as a fixed cost.',
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
            title: 'For MEI: register on gov.br',
            where: 'gov.br/mei',
            cost: 'R$0',
            takes: 'Minutes; the CNPJ is immediate',
            body: [
              'A gov.br account, the activity choice from the permitted list, and the address. The certificate (CCMEI) prints at the end; city hall permits are handled through the same integrated flow in most municipalities.',
            ],
          },
          {
            title: 'Pay the DAS every month',
            body: [
              'The single monthly document covers INSS pension and the token taxes. Miss it and the pension coverage lapses - the point of MEI for many. The annual declaration (DASN-SIMEI) is one revenue number, once a year.',
            ],
          },
          {
            title: 'Invoice as required',
            body: [
              'Service invoices (NFS-e) issue through the new national portal or the municipality’s system; B2B customers need them. The e-invoice world is universal in Brazil - assume every sale wants a nota fiscal.',
            ],
          },
          {
            title: 'Watch the cap and plan the migration',
            body: [
              'Approaching R$81,000, engage a contador and migrate to Simples before the crossing, not after. The reform rolling out through 2026-2033 (IBS/CBS replacing several taxes) will reshape rates; simplified-regime businesses are the most insulated, which is one more argument for staying inside.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'MEI registration', amount: 'R$0' },
          { what: 'DAS', amount: '~R$70-80/month', note: 'Everything included.' },
          { what: 'LTDA via contador', amount: 'R$500-1,500' },
          { what: 'Contador monthly', amount: 'R$300-800', note: 'Mandatory for companies.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'MEI', means: 'The micro-entrepreneur regime to R$81,000.' },
          { term: 'CNPJ', means: 'The business tax number.' },
          { term: 'DAS', means: 'The single monthly payment slip.' },
          { term: 'Simples Nacional', means: 'The unified regime to R$4.8M.' },
          { term: 'Contador', means: 'The accountant companies must retain.' },
          { term: 'NFS-e / nota fiscal', means: 'The e-invoices every sale expects.' },
          { term: 'INSS', means: 'The pension system the DAS keeps you inside.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'An activity outside the MEI list registered anyway - unwound painfully at fiscalisation.',
          'Blowing the cap and ignoring it - the retroactive recalculation treats the whole year as Simples.',
          'Missing DAS payments and losing pension coverage silently.',
          'Treating the contador as optional for an LTDA - it is not.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'gov.br - MEI', href: 'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor', note: 'Registration and the rules.' },
          { label: 'Receita Federal - Simples', href: 'https://www8.receita.fazenda.gov.br/simplesnacional/', note: 'The regime above MEI.' },
        ],
      },
    ],
  },
}
