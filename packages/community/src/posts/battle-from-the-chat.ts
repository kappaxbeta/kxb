import type { BlogPost } from '../blog'
import type { Text } from '../text'

/**
 * The first post: `/battle`, the summons in the chat.
 *
 * A launch post is a claim about what the blog is for, so this one does what
 * the making-of shelf does - it tells the truth about how the thing works,
 * checkable against the code, rather than announcing that we are excited.
 */
export const POST_BATTLE_FROM_THE_CHAT: Text<BlogPost> = {
  en: {
    title: 'Type /battle, and the room follows you into the arena',
    date: '2026-08-30',
    standfirst:
      'The chat learned its first command. /battle opens a summons: pick the people standing in the room with you, pick a level, and everybody chosen gets an interception - confirm, and they are redirected into the match.',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'What shipped',
        body: [
          'Standing in the lounge, you can now type /battle into the chat. Nothing is posted - the sentence is a verb, not a message - and a menu opens instead: the people in the room with you, straight off the same roster the sidebar draws, and the battle levels your space can fight on, off the same shelf the match wizard reads. Tick the people, pick the level, press Summon.',
          'You are walked into the arena immediately, because waiting for people is something you do inside it. Everybody you named gets an interception wherever they are in the space: a card saying who summons them and to what, with two honest buttons. Confirm redirects them to the same door. Deny makes it go away. Enter confirms too, for somebody mid-walk with the pointer locked - the one moment a phone-sized dialog has no cursor to click with.',
          'Guests can be summoned like anybody else. A guest is in the roster because they are in the room, the interception reaches them because an admitted guest is a member of the conversation, and the match room is one of the few doors a guest link opens on purpose - fighting is usually why they were invited.',
        ],
      },
      {
        kind: 'prose',
        id: 'how',
        heading: 'How it works, in one paragraph',
        body: [
          'The summons rides its own Realtime topic, gated by the same membership rule as everything else in a space - not the chat topic, which re-subscribes per conversation and would miss anybody reading another room, and not the lounge topic, which already has one subscriber and a client library that allows exactly one. The payload is deliberately thin: who, whither, and for whom. The summoner’s name is not in it - the receiver resolves it from their own roster, because a name sent over a wire is a second answer to a question the roster already settles, wrong exactly when somebody spoofs it. And a forged summons is an invitation to a door that will not open: the match itself re-checks membership at the boundary, so the worst a forgery puts on a screen is a sentence.',
          'The match is created by the wizard’s own action with the wizard’s own defaults, silly generated name included - a menu in the chat has no room to ask anybody to be funny. One command, one shelf, one door: /battle cannot offer a level the wizard would refuse, because they are the same list asked the same question.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Read the real thing',
        sources: [
          {
            label: 'How we built the boxing game',
            href: '/community/how-we-built-boxing',
            note: 'What a match actually is here, told from the package that fights them.',
          },
          {
            label: 'The XP editor guide',
            href: '/create/xp/docs',
            note: 'Where the levels a summons offers come from.',
          },
        ],
      },
    ],
  },
  de: {
    title: 'Tipp /battle, und der Raum folgt dir in die Arena',
    date: '2026-08-30',
    standfirst:
      'Der Chat hat seinen ersten Befehl gelernt. /battle öffnet eine Einberufung: Wähl die Leute, die mit dir im Raum stehen, wähl ein Level - und alle Gewählten bekommen eine Abfangfrage. Bestätigen, und sie werden ins Match weitergeleitet.',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'Was neu ist',
        body: [
          'Wer in der Lounge steht, kann jetzt /battle in den Chat tippen. Gepostet wird nichts - der Satz ist ein Verb, keine Nachricht - stattdessen öffnet sich ein Menü: die Leute im Raum, direkt aus derselben Liste, die auch die Seitenleiste zeichnet, und die Battle-Level des Space, vom selben Regal, das der Match-Assistent liest. Leute anhaken, Level wählen, Einberufen drücken.',
          'Du selbst landest sofort in der Arena, denn auf Leute wartet man drinnen. Alle Genannten bekommen eine Abfangfrage, wo immer sie im Space gerade sind: eine Karte, die sagt, wer sie ruft und wozu, mit zwei ehrlichen Knöpfen. Bestätigen leitet sie zur selben Tür weiter. Ablehnen lässt sie verschwinden. Enter bestätigt auch - für alle, die gerade mit gesperrtem Zeiger durch die Lounge laufen und keinen Cursor zum Klicken haben.',
          'Gäste lassen sich einberufen wie alle anderen. Ein Gast steht in der Liste, weil er im Raum steht; die Abfangfrage erreicht ihn, weil ein eingelassener Gast Teil des Gesprächs ist; und der Match-Raum ist eine der wenigen Türen, die ein Gastlink mit Absicht öffnet - kämpfen ist meistens der Grund der Einladung.',
        ],
      },
      {
        kind: 'prose',
        id: 'how',
        heading: 'Wie es funktioniert, in einem Absatz',
        body: [
          'Die Einberufung fährt auf ihrem eigenen Realtime-Topic, mit derselben Mitgliedschaftsregel wie alles andere im Space - nicht auf dem Chat-Topic, das pro Gespräch neu abonniert wird und jeden verpassen würde, der gerade einen anderen Raum liest, und nicht auf dem Lounge-Topic, das schon einen Abonnenten hat und dessen Client-Bibliothek genau einen erlaubt. Die Nutzlast ist absichtlich dünn: wer, wohin, für wen. Der Name des Rufenden steht nicht darin - der Empfänger löst ihn aus seiner eigenen Raumliste auf, denn ein Name über die Leitung wäre eine zweite Antwort auf eine Frage, die die Liste längst beantwortet, und falsch genau dann, wenn jemand fälscht. Und eine gefälschte Einberufung ist eine Einladung an eine Tür, die nicht aufgeht: Das Match prüft die Mitgliedschaft an der Grenze selbst nach, also ist das Schlimmste, was eine Fälschung auf einen Bildschirm bringt, ein Satz.',
          'Das Match erstellt die eigene Action des Assistenten mit dessen eigenen Voreinstellungen, alberner generierter Name inklusive - ein Menü im Chat hat keinen Platz, jemanden zu bitten, witzig zu sein. Ein Befehl, ein Regal, eine Tür: /battle kann kein Level anbieten, das der Assistent ablehnen würde, denn es ist dieselbe Liste mit derselben Frage.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Das Echte lesen',
        sources: [
          {
            label: 'Wie wir das Boxspiel gebaut haben',
            href: '/de/community/how-we-built-boxing',
            note: 'Was ein Match hier eigentlich ist, erzählt aus dem Paket, das sie austrägt.',
          },
          {
            label: 'Der XP-Editor-Guide',
            href: '/create/xp/docs',
            note: 'Woher die Level kommen, die eine Einberufung anbietet.',
          },
        ],
      },
    ],
  },
}
