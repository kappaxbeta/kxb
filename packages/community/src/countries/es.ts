import type { Guide } from '../guide'
import type { Text } from '../text'

/** Spain. */
export const SPAIN: Text<Guide> = {
  en: {
    title: 'Starting a business in Spain',
    standfirst:
      'Alta at two offices makes you an autónomo - the tarifa plana softens the landing, and the income-based contribution tramos are the number to plan around.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'Becoming self-employed in Spain is two registrations in the right order on the same day: the tax office (alta censal at the AEAT) and social security (alta in RETA). Both are free; both are online with a digital certificate or Cl@ve, and getting that credential first is the real step one.',
          'Since 2023 autónomo contributions are income-based: you forecast your net monthly income, land in a tramo, and pay accordingly (roughly €200-590 a month across the ordinary bands), with a settlement against reality the following year. New autónomos instead get the tarifa plana - a flat ~€80 a month for the first twelve months, extendable to twenty-four below the minimum wage.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Autónomo or SL?',
            options: [
              {
                name: 'Autónomo',
                when: 'The default start. Fast, free, and the tarifa plana applies to people, not companies.',
                costs: '~€80/month year one; income-based tramos after.',
                catch: 'Contributions are due monthly regardless of results once registered, and liability is personal.',
              },
              {
                name: 'SL (sociedad limitada)',
                when: 'Liability, partners, or an employer who insists on invoicing a company.',
                costs: 'Capital from €1 since 2022 (with personal liability top-up rules until €3,000 is reached); notary and registry roughly €400-800, or the CIRCE fast track online.',
                catch: 'A working administrador usually still registers as autónomo societario - at a higher minimum tramo and with no tarifa plana.',
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
            title: 'Get the digital certificate',
            where: 'FNMT, or Cl@ve at any registration office',
            takes: 'Days - do it first',
            body: [
              'Nearly every filing after this point assumes you can sign online. The certificado digital from the FNMT is the durable option.',
            ],
          },
          {
            title: 'Alta censal at the AEAT',
            where: 'Modelo 036 (or the simplified 037), online',
            body: [
              'You declare the activity under an IAE heading, the start date, and your VAT position. Spain has historically had no small-business VAT exemption - IVA applies from the first invoice - though the EU franchise regime may change this; check the current state.',
              'Certain professional services to businesses invoice with IRPF withholding (retención, 15%, or 7% for new professionals) - your client pays part of your income tax for you.',
            ],
          },
          {
            title: 'Alta in RETA',
            where: 'Import@ss, the social security portal',
            takes: 'Must be done before or on the AEAT start date',
            body: [
              'You pick the forecast income band; the tarifa plana is claimed here. You can adjust the band several times a year as reality diverges from the forecast.',
            ],
            watch: 'Order matters: RETA alta after the activity has visibly started can void the tarifa plana and draw a back-charge.',
          },
          {
            title: 'Invoice and file the quarterly cycle',
            body: [
              'Quarterly IVA (modelo 303) and IRPF payments on account (modelo 130, unless enough of your income carries retención), plus annual summaries. A gestoría handles the lot for €50-100 a month, and nearly every autónomo uses one.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'Registrations', amount: '€0', note: 'Both altas are free.' },
          { what: 'Tarifa plana', amount: '~€80/month', note: 'First 12 months; extendable below minimum wage.' },
          { what: 'Ordinary tramos after', amount: '~€200-590/month', note: 'By forecast income, settled against reality.' },
          { what: 'Gestoría', amount: '€50-100/month', note: 'The customary way to survive the quarterly cycle.' },
          { what: 'SL formation', amount: '€400-800', note: 'Less via CIRCE; capital from €1.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'Autónomo', means: 'The self-employed worker; also the name of the whole regime.' },
          { term: 'RETA', means: 'The special social-security scheme for the self-employed.' },
          { term: 'Modelo 036/037', means: 'The tax census form that opens the activity.' },
          { term: 'Tarifa plana', means: 'The ~€80 flat contribution for new autónomos.' },
          { term: 'Tramos', means: 'The income bands that set contributions since 2023.' },
          { term: 'Retención / IRPF', means: 'Income-tax withholding your business clients apply to professional invoices.' },
          { term: 'Gestoría', means: 'The admin/accounting service most autónomos pay monthly.' },
          { term: 'IAE', means: 'The activity classification you register under.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Doing the RETA alta late and losing the tarifa plana.',
          'Forgetting IVA applies from the first invoice - there is no comfortable threshold to hide under.',
          'Setting the income forecast carelessly and meeting a settlement bill a year later.',
          'Ignoring the falso autónomo rules when one client supplies desk, hours and direction.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'AEAT', href: 'https://sede.agenciatributaria.gob.es', note: 'The alta censal and the quarterly models.' },
          { label: 'Import@ss', href: 'https://portal.seg-social.gob.es', note: 'RETA alta, tramos, tarifa plana.' },
          { label: 'CIRCE', href: 'https://www.circe.es', note: 'The online SL fast track.' },
        ],
      },
    ],
  },
}
