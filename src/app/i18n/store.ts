import type { Locale } from '@/domain/i18n/locale'

/**
 * The shop front: the public list of games and worlds, and one game's page.
 *
 * Its own dictionary rather than a section of `./browse`, and the distinction
 * is who is reading. `browse` is a space's own shelf — a workbench, behind a
 * login, talking about *your* projects and what you may do with them. This is
 * the page a stranger lands on from a shared link, and it is the only place in
 * the app that has to explain what an XP is before anybody has one.
 *
 * Public, but not part of the public *site*: there is no /de/browse, because
 * this page reads its language off the member's own preference rather than off
 * a path. That is why it has a Bulgarian side while the landing page does not -
 * a language reaches this page by being chosen, not by being routed to.
 *
 * The German and Bulgarian here are formal, unlike the app behind the login.
 * Whoever is reading arrived on a shared link and is being told what an XP is;
 * that is a different conversation from the one the rail is having.
 *
 * A level's own name and blurb are never in here. Those are what an author
 * wrote, and the store shows them as written — the same rule the workbench
 * follows.
 */
export interface StoreDict {
  /** The tab and the one line a crawler gets. */
  metaTitle: string
  metaBody: string

  heading: string
  body: string

  xp: string
  xpBody: string
  misc: string
  miscBody: string
  nothingPublished: string
  /** `{n}` worlds in the whole catalogue, when the page is showing fewer. */
  worldsInCatalogue: string
  seeAllWorlds: string

  /**
   * The tile at the end of the grid, which differs by who is looking.
   *
   * Four destinations and one shape. Each names the *next step* rather than
   * the state it is reporting — a card at the end of a grid of games is not
   * the place to tell somebody they cannot have one.
   */
  makeOne: string
  /** For somebody who can already build. */
  operatorBody: string
  startOne: string
  /** `{space}` is already on the xp plan. */
  buildInBody: string
  seeTheCreator: string
  /** `{space}` is on xo and could move. */
  upgradableBody: string
  comparePlans: string
  /** For everybody else, including nobody at all. */
  strangerBody: string
  seeHowItWorks: string

  /** A card, and the page behind it. */
  noPicture: string
  /**
   * The shelf of cartridges, and the panel one opens.
   *
   * `shelfLabel` names the plain-button list that stands beside the canvas for
   * anybody not using a pointer - see `components/cartridge/shelf.tsx`.
   */
  shelfLabel: string
  openIt: string
  closeSheet: string
  /** `{n}` pieces and `{n}` things it is built from. */
  pieces: string
  pieceOne: string
  things: string
  thingOne: string
  scripted: string

  notFound: string
  back: string
  defaultBlurb: string
  goodFor: string
  builtFrom: string
  /** The four facts across the page, each with a note under it. */
  piecesLabel: string
  architecture: string
  thingsLabel: string
  withRules: string
  kinds: string
  namedBlueprints: string
  scripts: string
  inTheSandbox: string
  rulesOnly: string
  playIt: string
  yoursBecauseTeam: string
  notOpenYet: string
  notOpenBody: string
  seeWhatItDoes: string
}

export const STORE_EN: StoreDict = {
  metaTitle: 'Browse — games and worlds to play in',
  metaBody:
    'Small games built in a browser, and the places they are played in. Open one and look around; nothing here needs an account.',

  heading: 'Browse',
  body: 'Small games built out of pieces, and the places they get played in. Open one and look around — nothing on this page needs an account, and nothing asks you to install anything.',

  xp: 'XP',
  xpBody: 'A game, not a level. Things break, something is counted, and it ends.',
  misc: 'Misc',
  miscBody: 'Places rather than games: arenas, pitches, hangouts, built block by block.',
  nothingPublished:
    'Nothing published yet. The first one here will be a world somebody built in the block builder.',
  worldsInCatalogue: '{n} worlds in the catalogue — ',
  seeAllWorlds: 'see all of them, with the filters',

  makeOne: 'Make one',
  operatorBody:
    'Lay some ground, put things on it, say what happens when they are hit. It opens in the editor.',
  startOne: 'Start one',
  buildInBody: '{space} is on xp, so this is yours the day the editor opens. Here is what it does.',
  seeTheCreator: 'See the creator',
  upgradableBody: 'Building an XP is what the xp plan is for. {space} is on xo today.',
  comparePlans: 'Compare the plans',
  strangerBody:
    'Build a world out of pieces, give the things in it rules, and play it with other people. In a browser.',
  seeHowItWorks: 'See how it works',

  noPicture: 'No picture of this one yet',
  shelfLabel: 'The games in the store',
  openIt: 'Have a look',
  closeSheet: 'Close',
  pieces: '{n} pieces',
  pieceOne: '{n} piece',
  things: '{n} things',
  thingOne: '{n} thing',
  scripted: '· scripted',

  notFound: 'Not found',
  back: '← Browse',
  defaultBlurb: 'A small game built in a browser, out of pieces.',
  goodFor: 'What it is good for',
  piecesLabel: 'Pieces',
  architecture: 'architecture',
  thingsLabel: 'Things',
  withRules: 'with rules on them',
  kinds: 'Kinds',
  namedBlueprints: 'named blueprints',
  scripts: 'Scripts',
  inTheSandbox: 'in the sandbox',
  rulesOnly: 'rules only',
  builtFrom: 'Built from',
  playIt: 'Play it',
  yoursBecauseTeam:
    'Opens in the creator, which is yours because you are on the team. Nobody outside it can open this yet.',
  notOpenYet: 'Not open yet.',
  notOpenBody:
    'XP levels are played inside a space on the xp plan while the creator is still being built.',
  seeWhatItDoes: 'See what the creator does',
}

export const STORE_DE: StoreDict = {
  metaTitle: 'Stöbern — Spiele und Welten zum Mitspielen',
  metaBody:
    'Kleine Spiele, im Browser gebaut, und die Orte, an denen sie gespielt werden. Öffnen Sie eines und sehen Sie sich um; nichts hier braucht ein Konto.',

  heading: 'Stöbern',
  body: 'Kleine Spiele aus Bausteinen und die Orte, an denen sie gespielt werden. Öffnen Sie eines und sehen Sie sich um — nichts auf dieser Seite braucht ein Konto, und nichts verlangt eine Installation.',

  xp: 'XP',
  xpBody: 'Ein Spiel, kein Level. Dinge gehen kaputt, etwas wird gezählt, und es endet.',
  misc: 'Sonstiges',
  miscBody: 'Orte statt Spiele: Arenen, Plätze, Treffpunkte, Block für Block gebaut.',
  nothingPublished:
    'Noch nichts veröffentlicht. Das Erste hier wird eine Welt sein, die jemand im Blockbauer gebaut hat.',
  worldsInCatalogue: '{n} Welten im Katalog — ',
  seeAllWorlds: 'alle ansehen, mit den Filtern',

  makeOne: 'Eines bauen',
  operatorBody:
    'Boden legen, Dinge daraufstellen, sagen, was passiert, wenn sie getroffen werden. Es öffnet sich im Editor.',
  startOne: 'Eines anfangen',
  buildInBody:
    '{space} ist auf xp, das hier gehört Ihnen also ab dem Tag, an dem der Editor aufmacht. Hier steht, was er kann.',
  seeTheCreator: 'Den Creator ansehen',
  upgradableBody: 'Ein XP zu bauen ist genau das, wofür der xp-Tarif da ist. {space} ist heute auf xo.',
  comparePlans: 'Die Tarife vergleichen',
  strangerBody:
    'Bauen Sie eine Welt aus Bausteinen, geben Sie den Dingen darin Regeln, und spielen Sie sie mit anderen. Im Browser.',
  seeHowItWorks: 'Ansehen, wie das geht',

  noPicture: 'Von diesem gibt es noch kein Bild',
  shelfLabel: 'Die Spiele im Store',
  openIt: 'Ansehen',
  closeSheet: 'Schließen',
  pieces: '{n} Teile',
  pieceOne: '{n} Teil',
  things: '{n} Dinge',
  thingOne: '{n} Ding',
  scripted: '· mit Skripten',

  notFound: 'Nicht gefunden',
  back: '← Stöbern',
  defaultBlurb: 'Ein kleines Spiel, im Browser gebaut, aus Bausteinen.',
  goodFor: 'Wofür es gut ist',
  piecesLabel: 'Teile',
  architecture: 'Architektur',
  thingsLabel: 'Dinge',
  withRules: 'mit Regeln darauf',
  kinds: 'Arten',
  namedBlueprints: 'benannte Baupläne',
  scripts: 'Skripte',
  inTheSandbox: 'in der Sandbox',
  rulesOnly: 'nur Regeln',
  builtFrom: 'Gebaut aus',
  playIt: 'Spielen',
  yoursBecauseTeam:
    'Öffnet sich im Creator, der Ihnen gehört, weil Sie im Team sind. Von außerhalb kann das noch niemand öffnen.',
  notOpenYet: 'Noch nicht offen.',
  notOpenBody:
    'XP-Level werden in einem Space auf dem xp-Tarif gespielt, solange der Creator noch gebaut wird.',
  seeWhatItDoes: 'Ansehen, was der Creator kann',
}

export const STORE_BG: StoreDict = {
  metaTitle: 'Разглеждане — игри и светове, в които да играете',
  metaBody:
    'Малки игри, направени в браузър, и местата, на които се играят. Отворете някоя и се огледайте; нищо тук не изисква акаунт.',

  heading: 'Разглеждане',
  body: 'Малки игри, сглобени от части, и местата, на които се играят. Отворете някоя и се огледайте — нищо на тази страница не изисква акаунт и нищо не иска да инсталирате каквото и да било.',

  xp: 'XP',
  xpBody: 'Игра, не ниво. Неща се чупят, нещо се брои, и накрая свършва.',
  misc: 'Разни',
  miscBody: 'Места, а не игри: арени, игрища, сборни точки, построени блок по блок.',
  nothingPublished:
    'Още няма нищо публикувано. Първото тук ще е свят, построен в блоковия строител.',
  worldsInCatalogue: '{n} свята в каталога — ',
  seeAllWorlds: 'вижте всички, с филтрите',

  makeOne: 'Направете една',
  operatorBody:
    'Постелете земя, сложете неща върху нея, кажете какво става, щом ги ударят. Отваря се в редактора.',
  startOne: 'Започнете една',
  buildInBody:
    '{space} е на xp, така че това е ваше от деня, в който редакторът отвори. Ето какво може.',
  seeTheCreator: 'Вижте креатора',
  upgradableBody: 'Планът xp е точно за това — да построите XP. {space} днес е на xo.',
  comparePlans: 'Сравнете плановете',
  strangerBody:
    'Постройте свят от части, дайте правила на нещата в него и го изиграйте с други хора. В браузър.',
  seeHowItWorks: 'Вижте как става',

  noPicture: 'От тази още няма снимка',
  shelfLabel: 'Игрите в магазина',
  openIt: 'Разгледайте',
  closeSheet: 'Затваряне',
  pieces: '{n} части',
  pieceOne: '{n} част',
  things: '{n} неща',
  thingOne: '{n} нещо',
  scripted: '· със скриптове',

  notFound: 'Не е намерено',
  back: '← Разглеждане',
  defaultBlurb: 'Малка игра, направена в браузър, от части.',
  goodFor: 'За какво става',
  piecesLabel: 'Части',
  architecture: 'архитектура',
  thingsLabel: 'Неща',
  withRules: 'с правила върху тях',
  kinds: 'Видове',
  namedBlueprints: 'именувани чертежи',
  scripts: 'Скриптове',
  inTheSandbox: 'в пясъчника',
  rulesOnly: 'само правила',
  builtFrom: 'Построено от',
  playIt: 'Играйте',
  yoursBecauseTeam:
    'Отваря се в креатора, който е ваш, защото сте в екипа. Отвън още никой не може да го отвори.',
  notOpenYet: 'Още не е отворено.',
  notOpenBody:
    'XP нивата се играят в спейс на плана xp, докато креаторът още се строи.',
  seeWhatItDoes: 'Вижте какво може креаторът',
}

/**
 * A table rather than the ternary this was, because the ternary was the bug: it
 * answered English for every locale that was not German, so adding a language
 * compiled cleanly and shipped an untranslated page. A `Record<Locale, …>` makes
 * the next one a build error here instead.
 */
const DICTS: Record<Locale, StoreDict> = { en: STORE_EN, de: STORE_DE, bg: STORE_BG }

export function storeDict(locale: Locale): StoreDict {
  return DICTS[locale]
}
