import type { Guide } from '../guide'
import type { Text } from '../text'

/** Portugal. */
export const PORTUGAL: Text<Guide> = {
  en: {
    title: 'Starting a business in Portugal',
    standfirst:
      'Abertura de atividade in an afternoon, recibos verdes for invoicing, and a first year social security does not charge for.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The Portuguese sole-trader start is one online act: abertura de atividade on the Portal das Finanças, free, effective immediately. Social security follows automatically - and, unusually generously, new freelancers are exempt from contributions for their first twelve months.',
          'Invoicing is the part that surprises people: invoices are issued inside the tax authority’s own system (or certified software that reports to it) as recibos verdes. The state sees every invoice as it happens, which also means the quarterly declarations mostly prefill.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Trabalhador independente or LDA?',
            options: [
              {
                name: 'Trabalhador independente',
                when: 'The default. The simplified regime taxes a coefficient of revenue (75% for most services) rather than audited profit.',
                costs: 'Free to open. Contributions ~21.4% on 70% of revenue after the first exempt year.',
                catch: 'The coefficient logic means real costs above 25% of revenue go unrecognised unless you leave the simplified regime.',
              },
              {
                name: 'LDA (sociedade por quotas)',
                when: 'Liability, partners, or scale. Capital from €1 per quota.',
                costs: '~€360 via Empresa na Hora, done in a day with a name from the approved list (or your own pre-approved one).',
                catch: 'Corporate accounting requires a certified accountant (contabilista certificado) - a fixed monthly cost from day one.',
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
            title: 'Have a NIF and portal access',
            body: [
              'The NIF (tax number) is the key to everything; foreigners get one at a Finanças desk (non-EU residents via a fiscal representative). Portal das Finanças credentials arrive by post.',
            ],
          },
          {
            title: 'Abertura de atividade',
            where: 'Portal das Finanças, online',
            cost: '€0',
            body: [
              'You pick the activity code (CAE or the professional CIRS list), estimate first-year revenue, and choose the VAT position. The estimate decides whether you start inside the article 53 VAT exemption - available while turnover stays under €15,000.',
            ],
          },
          {
            title: 'Invoice through the system',
            body: [
              'Recibos verdes are issued on the portal itself; each B2B service invoice may carry IRS withholding at source depending on your regime and the client. VAT-registered freelancers file quarterly; everyone files the annual IRS return where the simplified coefficients are applied.',
            ],
          },
          {
            title: 'Let social security start on schedule',
            where: 'Segurança Social Direta',
            body: [
              'The first twelve months are exempt. After that you file quarterly income declarations and pay ~21.4% on 70% of the declared services revenue - effectively ~15% of turnover. The first contributions bill arriving in month thirteen is the one to have planned for.',
            ],
            watch: 'The exemption ends by calendar, not by success. Month thirteen comes either way.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Abertura de atividade', amount: '€0' },
          { what: 'Social security, year one', amount: '€0', note: 'The twelve-month exemption.' },
          { what: 'Social security after', amount: '~15% of services turnover', note: '21.4% on a 70% base.' },
          { what: 'Empresa na Hora (LDA)', amount: '~€360', note: 'Plus the monthly contabilista.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'NIF', means: 'The tax number everything hangs on.' },
          { term: 'Abertura de atividade', means: 'The free online act that starts self-employment.' },
          { term: 'Recibos verdes', means: 'The invoice-receipts issued inside the tax system.' },
          { term: 'Artigo 53', means: 'The VAT exemption under ~€15,000 turnover.' },
          { term: 'Regime simplificado', means: 'Taxation on a coefficient of revenue rather than audited profit.' },
          { term: 'Empresa na Hora', means: 'The same-day company formation counter.' },
          { term: 'Segurança Social Direta', means: 'The social security portal for the quarterly declarations.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Spending the exempt first year without reserving for month thirteen.',
          'Crossing €15,000 and continuing to invoice without VAT.',
          'Choosing the simplified regime with a high-cost business model.',
          'Assuming the many expat-visa guides describe the founding rules correctly - check the Finanças source.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Portal das Finanças', href: 'https://www.portaldasfinancas.gov.pt', note: 'The abertura and the invoicing system.' },
          { label: 'Segurança Social', href: 'https://www.seg-social.pt', note: 'The independent-worker regime and the exemption.' },
          { label: 'Empresa na Hora', href: 'https://justica.gov.pt/Servicos/Empresa-na-Hora', note: 'The same-day LDA.' },
        ],
      },
    ],
  },
}
