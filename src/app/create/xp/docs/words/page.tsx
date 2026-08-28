import type { Metadata } from 'next'

import { C, Code, DocsShell, DocTitle, Em, P, Section } from '../shell'

/**
 * Words: how a level translates itself.
 *
 * The design fact this page turns on - the English sentence is the key - is
 * what makes the page short: there is no key-naming scheme to teach, no setup
 * step, and the empty state is the level's own words.
 */

export const metadata: Metadata = {
  title: 'XP docs — words & translation',
  description:
    'How an XP translates itself: the words block, an international title and description, and t() for everything a script says.',
}

const SECTIONS = [
  { id: 'the-idea', label: 'The sentence is the key' },
  { id: 'title', label: 'Title and description' },
  { id: 'scripts', label: 'What a script says' },
  { id: 'the-panel', label: 'The Words panel' },
] as const

export default function WordsPage() {
  return (
    <DocsShell current="words" sections={SECTIONS}>
      <DocTitle kicker="The editor">Words &amp; translation</DocTitle>
      <P>
        A level says things — its name, its description, the line a script puts on the HUD. The{' '}
        <Em>Words</Em> panel is where it says them in other languages, and the block it writes
        travels inside the document like everything else: copy the file and you have copied the
        translations.
      </P>

      <Section id="the-idea" title="The sentence is the key">
        <P>
          There is no step where somebody invents <C>gate.locked.message</C>. The level&apos;s own
          sentence <Em>is</Em> the lookup key, and the translation table maps it per language:
        </P>
        <Code lang="data">{`"words": {
  "de": {
    "Shooter": "Schießstand",
    "the gate is locked": "das Tor ist verschlossen"
  }
}`}</Code>
        <P>
          The fallback is the key itself, which means there is no broken state: a language with a
          missing row simply gets the level&apos;s own words, and an empty translation{' '}
          <Em>is</Em> no translation. A document only ever carries what somebody actually said.
        </P>
      </Section>

      <Section id="title" title="An international title and description">
        <P>
          The name and the description are the first two phrases the panel offers — they are
          sentences the level says like any other. Add a language, fill in their two rows, and the
          level introduces itself in the reader&apos;s language wherever it is shown. Nothing else
          to configure: the untranslated title keeps working everywhere the translation is
          missing.
        </P>
        <P>
          The English (or whatever language you wrote the level in) stays the original — it is
          edited where it is written, in the title bar and the Document panel, never in the Words
          table. That keeps one source of truth for what the level says, and the table only ever
          answers &quot;how do I say that in…&quot;.
        </P>
      </Section>

      <Section id="scripts" title="What a script says">
        <P>
          Scripts get <C>t()</C>, which looks the sentence up in the player&apos;s language and
          falls back to what you wrote:
        </P>
        <Code>{`function onTrigger(event, other) {
  if (event !== 'enter') return
  if (!world.get('unlocked')) log(t('the gate is locked'))
}`}</Code>
        <P>
          The panel finds every <C>t(&apos;…&apos;)</C> a plain reading of the scripts can see and
          offers each as a row. What it cannot see is a key a script builds at runtime —{' '}
          <C>t(&apos;door &apos; + n)</C> — so those rows are typed into the table by hand, and
          the panel never deletes a row it did not recognise: the phrase an author worked hardest
          to add is exactly the one a tidy-up would throw away.
        </P>
      </Section>

      <Section id="the-panel" title="The Words panel">
        <P>
          A language chip row on top — add one, pick one, remove one — and under it a table:
          every phrase down the left, that language&apos;s answer beside it. Adding a language
          writes nothing until you type: a language with no rows is not a thing to store, it is a
          column to be typing into. Removing a row is blanking its box, and the block itself
          disappears from the document when its last row goes.
        </P>
      </Section>
    </DocsShell>
  )
}
