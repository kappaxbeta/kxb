import type { Metadata } from 'next'
import { COMMUNITY_EN } from '@kxb/community'
import { CommunityBlogIndex } from '@/app/community/handbook'

export const metadata: Metadata = {
  title: `${COMMUNITY_EN.blog.title} - kxb community`,
  description: COMMUNITY_EN.blog.standfirst,
  alternates: { canonical: '/community/blog', languages: { en: '/community/blog', de: '/de/community/blog' } },
}

export default function CommunityBlogPage() {
  return <CommunityBlogIndex lang="en" />
}
