/**
 * The demo's shell: the banner, the two doors and the mode switch.
 *
 * Only the chrome around the world, not the world. The lounge's own HUD is the
 * app rather than the marketing surface, and it is a much bigger job - so it is
 * deliberately out of scope here and still reads in English. What a first-time
 * visitor is handed on arrival is this card, and this card is translated.
 */
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'
export interface DemoDict {
  meta: { title: string; description: string }
  joinOpen: string
  joinClosed: string
  homeAria: string
  whatIsThis: string
  hide: string
  battleOn: string
  battleOff: string
  banner: {
    fightingTitle: string
    creativeTitle: string
    /** Split around the two key glyphs, which are not translated. */
    fightingLead: string
    fightingMid: string
    fightingTail: string
    creativeBody: string
  }
  toggle: { on: string; off: string }
  /** The recording offered in the banner. See `<IntroVideo>`. */
  intro: { watch: string; dialogTitle: string; aiNote: string; close: string }
}

export const DEMO_EN: DemoDict = {
  meta: {
    title: 'Try the lounge',
    description: 'Walk into a room, place a few blocks, say hello. No account, nothing saved.',
  },
  joinOpen: 'Create your space',
  joinClosed: 'Request an invite',
  homeAria: 'What is this? Go to the front page',
  whatIsThis: 'What is this?',
  hide: 'Hide this',
  battleOn: 'Turn battle mode on',
  battleOff: 'Turn battle mode off',
  banner: {
    fightingTitle: 'Battle mode is on.',
    creativeTitle: 'You are standing in a demo.',
    fightingLead: ' charges, ',
    fightingMid: ' kicks. On a phone, the two buttons bottom right. ',
    fightingTail:
      'Have a swing at Mo or Suri; they take it better than most. Building is off while you are fighting, which is how it works in a real space too.',
    creativeBody:
      'Build whatever you like. Nothing here is saved, and nobody else can see it. Your own space keeps everything, and your team is standing in it.',
  },
  toggle: { on: 'Battle mode', off: 'Activate battle mode' },
  intro: {
    watch: 'Watch the tour',
    dialogTitle: 'How it works',
    aiNote:
      'Contains AI-generated content: the voice and the script are AI-made, and the screen footage — recorded from the real app — has been AI-enhanced.',
    close: 'Close the video',
  },
}

export const DEMO_DE: DemoDict = {
  meta: {
    title: 'Die Lounge ausprobieren',
    description:
      'Gehen Sie in einen Raum, setzen Sie ein paar Blöcke, sagen Sie Hallo. Kein Konto, nichts wird gespeichert.',
  },
  joinOpen: 'Eigenen Space anlegen',
  joinClosed: 'Einladung anfragen',
  homeAria: 'Was ist das? Zur Startseite',
  whatIsThis: 'Was ist das?',
  hide: 'Ausblenden',
  battleOn: 'Kampfmodus einschalten',
  battleOff: 'Kampfmodus ausschalten',
  banner: {
    fightingTitle: 'Der Kampfmodus ist an.',
    creativeTitle: 'Sie stehen in einer Demo.',
    fightingLead: ' stürmt, ',
    fightingMid: ' tritt. Auf dem Handy: die zwei Knöpfe unten rechts. ',
    fightingTail:
      'Hauen Sie ruhig mal auf Mo oder Suri; die stecken das besser weg als die meisten. Bauen ist aus, solange Sie kämpfen — genau wie in einem echten Space.',
    creativeBody:
      'Bauen Sie, was Sie möchten. Nichts davon wird gespeichert, und niemand sonst kann es sehen. Ihr eigener Space behält alles, und Ihr Team steht darin.',
  },
  toggle: { on: 'Kampfmodus', off: 'Kampfmodus aktivieren' },
  intro: {
    watch: 'Tour ansehen',
    dialogTitle: 'So funktioniert es',
    aiNote:
      'Enthält KI-generierte Inhalte: Stimme und Text stammen von einer KI, und die Bildschirmaufnahmen der echten App wurden mit KI nachbearbeitet.',
    close: 'Video schließen',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English page. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, DemoDict> = { en: DEMO_EN, de: DEMO_DE }

export function demoDict(locale: Locale): DemoDict {
  return DICTS[publicLocale(locale)]
}
