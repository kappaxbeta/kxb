import type { Metadata } from 'next'
import { DemoPanel } from '@/app/demo/demo-panel'
import { DEMO_DE } from '@/app/i18n/demo'

export const metadata: Metadata = {
  title: DEMO_DE.meta.title,
  description: DEMO_DE.meta.description,
  alternates: { canonical: '/de/demo', languages: { en: '/demo', de: '/de/demo' } },
}

export default async function DemoPageDe({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>
}) {
  return <DemoPanel searchParams={searchParams} locale="de" />
}
