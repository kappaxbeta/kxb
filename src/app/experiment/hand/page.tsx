import type { Metadata } from 'next'

import { readLocale } from '@/app/i18n/preference'
import { worldDict } from '@/app/i18n/world'
import { HandChart } from '@/app/world/_hand'
import { HandPad } from '@/app/world/_hand/hand-pad'

export const metadata: Metadata = {
  title: 'The hand alphabet',
  description: 'A hand you can see, twenty-six shapes it can make, and what they say.',
  // A workbench, like the pen and the water next door. Not something anybody
  // should arrive at from a search result.
  robots: { index: false, follow: false },
}

/**
 * Somewhere to learn the hands, with nothing else on the screen.
 *
 * The pad and the chart, in that order, because that is the order they are
 * used: you try it, you get stuck, you look it up. A page that led with
 * twenty-six diagrams would be a page nobody scrolls past.
 *
 * The whole thing is drawn in the reader's own language, chart included - which
 * is not a nicety here, it is the feature. A German reader learning that `th`
 * is the thank-you hand learns it as Danke, because Danke is what will appear
 * on their screen when somebody across the room signs it.
 */
export default async function HandPage() {
  const locale = await readLocale()
  const dict = worldDict(locale)

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 p-4 py-10">
      <HandPad
        labels={dict.hand}
        locale={locale}
        words={{
          free: 'Free',
          chase: 'Chase',
          idle: 'sign anything',
          signed: 'sign this',
          got: 'signed',
        }}
      />
      <HandChart labels={dict.hand} locale={locale} />
    </main>
  )
}
