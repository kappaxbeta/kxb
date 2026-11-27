import type { Metadata } from 'next'

import { Capabilities, PromptBox, TranslateBox } from '@/app/experiment/nano/_nano'

export const metadata: Metadata = {
  title: 'Nano',
  // A workbench, like the pen and the water next door. Not something anybody
  // should arrive at from a search result.
  description: "What Chrome's on-device model will do, on this machine, right now.",
  robots: { index: false, follow: false },
}

/**
 * A bench for Chrome's built-in AI.
 *
 * Everything about these APIs is conditional - on the Chrome build, on flags
 * somebody set months ago, on whether a multi-gigabyte model finished
 * downloading, on whether this laptop is one Chrome thinks can run it. Reading
 * about them tells you what is possible; this page tells you what is *true
 * here*, which is the only version worth designing against.
 *
 * It opens with the answer. The verdict is a sentence, the evidence is under
 * it, and the remedy is one level below that and only when there is something
 * to remedy - the order a person actually wants, rather than the order the
 * browser happens to answer in.
 *
 * Then the two boxes, in the order the questions arrive. What does the chat
 * model cost me - said in seconds, because that number is what rules it out of
 * every hot path. And then the pair that could ship: detect plus translate,
 * small and fast enough to sit inside a room where five languages are being
 * typed at once.
 *
 * Nothing here is wired to the product. It is a place to find out, before any
 * of it is.
 */
export default function NanoPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-16 sm:gap-12 sm:py-24">
      <Capabilities />
      <PromptBox />
      <TranslateBox />
    </main>
  )
}
