import { describe, expect, test } from 'bun:test'
import { campaignFrom, campaignSlug, campaignSource } from '@/domain/analytics/campaign'

describe('campaignSource', () => {
  test('prefixes the tag so it cannot be read as a hostname', () => {
    expect(campaignSource('tiktok')).toBe('src:tiktok')
    expect(campaignSource('reddit-webgames')).toBe('src:reddit-webgames')
  })

  test('normalises case, because a link is typed by a person', () => {
    expect(campaignSource(' TikTok ')).toBe('src:tiktok')
  })

  test('refuses anything that is not a short slug', () => {
    // The query string is attacker-controlled and this value is stored and then
    // rendered in a report, so the answer to a hostile one is nothing at all -
    // not a trimmed version of it that looks legitimate in the table.
    expect(campaignSource('<script>')).toBeNull()
    expect(campaignSource('tik tok')).toBeNull()
    expect(campaignSource('-leading-dash')).toBeNull()
    expect(campaignSource('a'.repeat(33))).toBeNull()
    expect(campaignSource('')).toBeNull()
    expect(campaignSource(null)).toBeNull()
  })
})

describe('campaignFrom', () => {
  test('reads a bare search string, as the beacon has it', () => {
    expect(campaignFrom('?src=tiktok')).toBe('src:tiktok')
  })

  test('reads a whole URL, as the join route has it', () => {
    expect(campaignFrom('https://kxb.team/demo?utm_medium=x&src=reddit')).toBe('src:reddit')
  })

  test('is nothing when the link carried no tag', () => {
    expect(campaignFrom('?utm_source=tiktok')).toBeNull()
    expect(campaignFrom('')).toBeNull()
    expect(campaignFrom(null)).toBeNull()
  })
})

describe('campaignSlug', () => {
  test('takes the tag back out, so a tagged link can be rebuilt', () => {
    expect(campaignSlug('src:tiktok')).toBe('tiktok')
  })

  test('leaves a real referrer alone', () => {
    // The column holds both. A hostname is not a campaign, and reading one as
    // if it were would rebuild the demo's join link pointing at a website.
    expect(campaignSlug('news.ycombinator.com')).toBeNull()
    expect(campaignSlug(null)).toBeNull()
  })
})
