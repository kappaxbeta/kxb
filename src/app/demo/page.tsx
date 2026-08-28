import type { Metadata } from 'next'
import { DemoPanel } from '@/app/demo/demo-panel'
import { DEMO_EN } from '@/app/i18n/demo'

export const metadata: Metadata = {
  title: DEMO_EN.meta.title,
  description: DEMO_EN.meta.description,
  alternates: { canonical: '/demo', languages: { en: '/demo', de: '/de/demo' } },
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>
}) {
  return <DemoPanel searchParams={searchParams} locale="en" />
}
