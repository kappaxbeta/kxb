import type { Metadata } from 'next'
import { COMMUNITY_DE } from '@kxb/community'
import { CommunityBlogIndex } from '@/app/community/handbook'

export const metadata: Metadata = {
  title: `${COMMUNITY_DE.blog.title} - kxb Community`,
  description: COMMUNITY_DE.blog.standfirst,
  alternates: { canonical: '/de/community/blog', languages: { en: '/community/blog', de: '/de/community/blog' } },
}

export default function CommunityBlogPageDe() {
  return <CommunityBlogIndex lang="de" />
}
