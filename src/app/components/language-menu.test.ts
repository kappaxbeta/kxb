import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LOCALES } from '@/domain/i18n/locale'

/**
 * The language menu's promises.
 *
 * Structural rather than rendered: the component is a server component over a
 * `<details>` with no state in it, so there is nothing to drive - what can
 * actually break is the roster going out of step with `LOCALES`, the control
 * appearing somewhere it was deliberately kept out of, or somebody swapping
 * the disclosure for a client dropdown and quietly hydrating four static
 * marketing pages.
 */

const SOURCE = readFileSync('src/app/components/language-menu.tsx', 'utf8')

describe('the roster', () => {
  test('every locale the build speaks has a flag and an endonym', () => {
    // `Record<Locale, …>` already makes a missing one a type error; this
    // catches the other direction, where the type is satisfied by a stub.
    for (const code of LOCALES) {
      expect(SOURCE).toContain(`${code}: { endonym:`)
    }
  })

  test('names are written the way each language writes them', () => {
    // The one label a reader looking for their own language can always find.
    // "German" and "Bulgarian" in an English list are names for somebody who
    // already reads English.
    expect(SOURCE).toContain("'Deutsch'")
    expect(SOURCE).toContain("'Български'")
  })

  test('every flag is hidden from assistive tech - it decorates the name, it is not the name', () => {
    const flags = SOURCE.match(/flag: '[^']+'/g) ?? []
    expect(flags.length).toBe(LOCALES.length)
    // Two renders of a flag in the component, both wrapped.
    expect(SOURCE.match(/aria-hidden="true">\{(current\.flag|flag)\}/g)?.length).toBe(2)
  })

  test('items carry lang, so a screen reader does not read Cyrillic with an English voice', () => {
    expect(SOURCE).toContain('lang={code}')
    expect(SOURCE).toContain('hrefLang={code}')
  })
})

describe('where it appears', () => {
  const shell = readFileSync('src/app/components/marketing-shell.tsx', 'utf8')
  const landing = readFileSync('src/app/landing.tsx', 'utf8')

  test('on the startpage header and on every page that wears the marketing shell', () => {
    expect(landing).toContain('<LanguageMenu locale={locale} />')
    expect(shell).toContain('<LanguageMenu locale={locale} />')
  })

  test('and not inside a workspace, where the language is a member setting', () => {
    // A second control writing the same cookie is two controls disagreeing
    // about which is authoritative.
    for (const path of ['src/app/t/[slug]/layout.tsx', 'src/app/t/[slug]/sidebar.tsx']) {
      expect(readFileSync(path, 'utf8')).not.toContain('LanguageMenu')
    }
  })

  test('the header follows the reader when a page does not name a language', () => {
    // The bug this pins: `locale` defaulted to 'en', and six of the eight
    // pages wearing this shell pass nothing - so picking Bulgarian in this
    // very menu and clicking through left the header English with an English
    // flag on it. The cookie was right; nothing read it.
    expect(shell).toContain('const locale = given ?? (await readLocale())')
  })

  test('a page that names its language still wins over the cookie', () => {
    // `/de` has to be German for whoever opens it, including a reader whose
    // cookie says Bulgarian. Path first, cookie second.
    expect(shell).toContain('locale: given,')
  })

  test('the sub-page header is sticky, and the landing page\'s is not', () => {
    // The split is about length. The pages wearing this shell are the long
    // ones - a chapter, the contest conditions, the catalogue - where the nav
    // is two thousand words behind you when you want it. The landing page is
    // short sections with its own header, and a bar pinned over the hero
    // would be in the way.
    expect(shell).toContain('sticky top-0')
    expect(landing).not.toContain('sticky top-0')
  })

  test('it stays a server component, so the static marketing pages stay static', () => {
    // `/play`, `/share` and `/coins` ship no client JavaScript. A base-ui menu
    // here would hydrate all three so that three links can sit behind a
    // chevron - see the note in the component.
    expect(SOURCE).not.toContain("'use client'")
    expect(shell).not.toContain("'use client'")
  })
})
