import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COUNTRIES, countryBySlug, guideSlug, pick } from '@kxb/community'
import { CommunityDoc } from '@/app/community/handbook'

/**
 * A country's guide, at the address its title earns:
 * /community/de/starting-a-business-in-germany. The hub above links here;
 * a wrong or stale second segment is a 404, not a soft redirect, so one
 * document has exactly one URL per language.
 */
export function generateStaticParams() {
  return COUNTRIES.filter((country) => country.guide).map((country) => ({
    slug: country.slug,
    doc: guideSlug(country.guide!),
  }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/community/[slug]/[doc]'>): Promise<Metadata> {
  const { slug, doc: docSlug } = await params
  const country = countryBySlug(slug)
  if (!country?.guide || guideSlug(country.guide) !== docSlug) notFound()
  const { doc } = pick(country.guide, 'en')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/community/${slug}/${docSlug}`,
      languages: {
        en: `/community/${slug}/${docSlug}`,
        de: `/de/community/${slug}/${docSlug}`,
      },
    },
  }
}

export default async function CommunityCountryDocPage({ params }: PageProps<'/community/[slug]/[doc]'>) {
  const { slug, doc: docSlug } = await params
  const country = countryBySlug(slug)
  if (!country?.guide || guideSlug(country.guide) !== docSlug) notFound()
  return <CommunityDoc lang="en" slug={slug} />
}
