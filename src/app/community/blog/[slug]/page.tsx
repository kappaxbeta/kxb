import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BLOG, blogBySlug, pick } from '@kxb/community'
import { CommunityBlogPost } from '@/app/community/handbook'

export function generateStaticParams() {
  return BLOG.map((entry) => ({ slug: entry.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/community/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const entry = blogBySlug(slug)
  if (!entry) notFound()
  const { doc } = pick(entry.post, 'en')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/community/blog/${slug}`,
      languages: { en: `/community/blog/${slug}`, de: `/de/community/blog/${slug}` },
    },
  }
}

export default async function CommunityBlogPostPage({ params }: PageProps<'/community/blog/[slug]'>) {
  const { slug } = await params
  return <CommunityBlogPost lang="en" slug={slug} />
}
