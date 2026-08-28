import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderMarkdown, slugify } from '@/lib/markdown'

describe('escaping, which is the whole safety argument', () => {
  it('keeps a placeholder in prose visible instead of eating it as a tag', () => {
    // ~515 of these across the docs - `<uuid>`, `<roomId>/<scene>`. A renderer
    // that passed raw HTML through would leave a hole in the sentence.
    const { html } = renderMarkdown('A room names `p-<uuid>-v3`, and <roomId>/<scene> is the topic.')
    expect(html).toContain('p-&lt;uuid&gt;-v3')
    expect(html).toContain('&lt;roomId&gt;/&lt;scene&gt;')
  })

  it('does not double-escape an ampersand', () => {
    const { html } = renderMarkdown('a & b, and `&lt;` typed out')
    expect(html).toContain('a &amp; b')
    expect(html).not.toContain('&amp;amp;')
  })

  it('refuses a href that is not an ordinary link, and shows the text instead', () => {
    // No anchor is built. The source stays on the page as literal text, which
    // is the right failure: a link that quietly vanished would hide the fact
    // that somebody wrote something odd into a doc.
    const { html } = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('<a href')
    expect(html).toBe('<p>[click](javascript:alert(1))</p>')
  })

  it('marks an external link but not an internal one', () => {
    const { html } = renderMarkdown('[a](https://example.com) and [b](../../task.md)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toContain('<a href="../../task.md">b</a>')
  })
})

describe('inline', () => {
  it('does not format inside a code span', () => {
    // 3946 code spans against 1622 bolds - the overlap is constant.
    const { html } = renderMarkdown('`**not bold**` but **this is**')
    expect(html).toContain('<code>**not bold**</code>')
    expect(html).toContain('<strong>this is</strong>')
  })

  it('reads bold and italic apart', () => {
    const { html } = renderMarkdown('**bold** and *italic* and ~~gone~~')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<del>gone</del>')
  })

  it('does not let an unmatched bold marker italicise the rest of the line', () => {
    const { html } = renderMarkdown('**a** then b * c')
    expect(html).not.toContain('<em>')
  })
})

describe('blocks', () => {
  it('renders a fence verbatim, without inline markup', () => {
    const { html } = renderMarkdown('```json\n{ "a": "**b**", "c": "<d>" }\n```')
    expect(html).toContain('class="lang-json"')
    expect(html).toContain('**b**')
    expect(html).toContain('&lt;d&gt;')
    expect(html).not.toContain('<strong>')
  })

  it('closes a fence that the document never closed', () => {
    const { html } = renderMarkdown('```\nstuck')
    expect(html).toContain('</code></pre>')
  })

  it('renders a table, and drops an all-empty header row', () => {
    // The docs use `| | |` as a plain key/value layout, 628 rows of it.
    const { html } = renderMarkdown('| | |\n|---|---|\n| **A** | one |\n| **B** | two |')
    expect(html).not.toContain('<thead>')
    expect(html).toContain('<strong>A</strong>')
    expect(html).toContain('<td>two</td>')
  })

  it('keeps a header row that says something', () => {
    const { html } = renderMarkdown('| Where | What |\n|---|---|\n| a | b |')
    expect(html).toContain('<th>Where</th>')
  })

  it('puts a table in its own scroller so the page never scrolls sideways', () => {
    const { html } = renderMarkdown('| a |\n|---|\n| b |')
    expect(html).toContain('class="table-scroll"')
  })

  it('gives every heading an id, and repeats get their own', () => {
    // Four sections in these docs are called "Order".
    const { headings, html } = renderMarkdown('## Order\n\n## Order\n')
    expect(headings.map((h) => h.id)).toEqual(['order', 'order-2'])
    expect(html).toContain('id="order-2"')
  })

  it('carries a two-paragraph item under one number', () => {
    const { html } = renderMarkdown('1. first line\n\n   second paragraph\n2. next')
    expect(html).toContain('<ol>')
    expect(html).toContain('second paragraph')
  })

  it('does not swallow the paragraph after a list', () => {
    const { html } = renderMarkdown('- one\n- two\n\nAfter the list.')
    expect(html).toContain('<p>After the list.</p>')
  })
})

describe('slugify', () => {
  it('survives punctuation and backticks', () => {
    expect(slugify('§0.5 `player.jump`, and why')).toBe('05-playerjump-and-why')
  })
})

describe('the real corpus, which is what it was built for', () => {
  const files = ['docs/xp/manual.md', 'docs/xp/editor-guide.md', 'docs/xp/round.md']

  for (const file of files) {
    it(`renders ${file} with no tag leaking through`, () => {
      const { html, headings } = renderMarkdown(readFileSync(file, 'utf8'))
      expect(headings.length).toBeGreaterThan(0)
      expect(html.length).toBeGreaterThan(1000)

      // Nothing outside the tag set this file writes may appear. A `<script`
      // or a stray `<div` in the output would mean source text reached the
      // page as markup.
      const tags = new Set([...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase()))
      const allowed = new Set([
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr', 'a',
        'strong', 'em', 'del', 'div',
      ])
      expect([...tags].filter((t) => !allowed.has(t))).toEqual([])
    })
  }

  it('every heading id in a document is unique', () => {
    const { headings } = renderMarkdown(readFileSync('docs/xp/manual.md', 'utf8'))
    expect(new Set(headings.map((h) => h.id)).size).toBe(headings.length)
  })
})
