import type { Guide } from '../guide'
import type { Text } from '../text'

/** Greece. */
export const GREECE: Text<Guide> = {
  en: {
    title: 'Starting a business in Greece',
    standfirst:
      'The atomiki epicheirisi through myAADE, EFKA from month one, and the IKE - the €1 company that modernised Greek founding.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Greek founding digitised hard in the last few years: the sole trader (ατομική επιχείρηση) starts at the tax office through myAADE, and the IKE - the private company introduced to replace the heavyweight EPE - forms online through the e-YMS one-stop in a day with €1 of capital.',
          'The recurring reality to plan for is EFKA, the unified social insurance fund: self-employed contributions are chosen from fixed monthly classes (from roughly €250) and are due from the first month, profit or not. New freelancers get a reduced class for the first years - take it.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Atomiki or IKE?',
            options: [
              {
                name: 'Ατομική επιχείρηση (sole trader)',
                when: 'Solo services and freelancing.',
                costs: 'Effectively free to open at the tax office.',
                catch: 'Personal liability, EFKA from month one, and the presumptive minimum-income rules (τεκμήρια) that tax the self-employed as if they earned at least a computed floor - controversial, litigated, and real.',
              },
              {
                name: 'IKE',
                when: 'Partners, liability, or clients who want a company.',
                costs: '€1 capital; e-YMS formation ~€60-70 in fees, a day online.',
                catch: 'Corporate accounting, 22% corporate tax plus 5% dividend withholding, and the managing partner still pays EFKA.',
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
            title: 'Have the AFM and TAXISnet access',
            body: [
              'The AFM (tax number) and TAXISnet credentials are the keys to everything; foreigners get the AFM at a tax office first.',
            ],
          },
          {
            title: 'Open the activity',
            where: 'myAADE (έναρξη εργασιών), or e-YMS for an IKE',
            takes: 'Same day to a few days',
            body: [
              'You declare the activity codes (ΚΑΔ), the seat, and the VAT position. Books are electronic by default: myDATA, the national e-books platform, receives every invoice - issued through compliant software or the free timologio app.',
            ],
          },
          {
            title: 'Choose the EFKA class and check the VAT small-business option',
            body: [
              'EFKA classes are picked annually; the new-freelancer class is the cheap start. VAT exemption exists for turnover under €10,000 - narrow, and worthless for B2B - so most register normally (24% standard rate, quarterly returns for simple books).',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Sole trader opening', amount: '€0' },
          { what: 'IKE via e-YMS', amount: '~€60-70' },
          { what: 'EFKA, new-freelancer class', amount: '~€130-250/month', note: 'Rising with the chosen class.' },
          { what: 'Accountant', amount: '€40-100/month', note: 'myDATA made this near-universal.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'ΑΦΜ (AFM)', means: 'The tax number.' },
          { term: 'myAADE / TAXISnet', means: 'The tax administration portals.' },
          { term: 'ΚΑΔ', means: 'The activity codes.' },
          { term: 'ΕΦΚΑ (EFKA)', means: 'The unified social insurance fund and its monthly classes.' },
          { term: 'IKE (ΙΚΕ)', means: 'The €1 private company formed through e-YMS.' },
          { term: 'myDATA', means: 'The national electronic books every invoice reports into.' },
          { term: 'Τεκμήρια', means: 'The presumptive minimum income rules on the self-employed.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Ignoring the presumptive income rules when modelling a lean first year.',
          'Invoicing outside myDATA-compliant software.',
          'Missing the reduced EFKA class election.',
          'Assuming the €10,000 VAT exemption behaves like Germany’s - it is far narrower.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'AADE / myAADE', href: 'https://www.aade.gr', note: 'Activity opening and myDATA.' },
          { label: 'e-YMS (ΓΕΜΗ)', href: 'https://eyms.businessportal.gr', note: 'The one-stop IKE formation.' },
          { label: 'EFKA', href: 'https://www.efka.gov.gr', note: 'The contribution classes.' },
        ],
      },
    ],
  },
}
