import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CHAPTERS, COUNTRIES, pick, STARTER_SLUG } from '@kxb/community'
import { CommunityDoc, resolveDoc } from '@/app/community/handbook'

/**
 * One handbook document: a chapter or a country, told apart by the slug alone.
 * Static, because every word comes out of the package at build time.
 */
export function generateStaticParams() {
  return [
    { slug: STARTER_SLUG },
    ...CHAPTERS.map((chapter) => ({ slug: chapter.slug })),
    ...COUNTRIES.filter((country) => country.guide).map((country) => ({ slug: country.slug })),
  ]
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/community/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const text = resolveDoc(slug)
  if (!text) notFound()
  const { doc } = pick(text, 'en')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/community/${slug}`,
      languages: { en: `/community/${slug}`, de: `/de/community/${slug}` },
    },
  }
}

export default async function CommunityDocPage({ params }: PageProps<'/community/[slug]'>) {
  const { slug } = await params
  return <CommunityDoc lang="en" slug={slug} />
}
