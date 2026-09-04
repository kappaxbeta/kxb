/**
 * The twelve panels, in the three languages the store listing is written in.
 *
 * Three of them are overviews - play, create, share - and they carry the whole
 * pitch between them. The other nine each take one sentence out of an overview
 * and give it a page of its own, which is what the `group` says. That split is
 * the reason there are twelve rather than six: an overview has to stay a
 * sentence long per idea to stay readable at thumbnail size, and the ideas it
 * compresses are worth a picture each.
 *
 * Every string is written in its own language rather than translated out of
 * English. The headline is a joke about the picture underneath it, and a joke
 * is the half that does not survive a literal pass - so German and Bulgarian
 * get one that lands on its own terms instead of a rendering of the English.
 *
 * `funny` stays short. It is set in a pixel face at ninety-odd pixels and it
 * shares the line with the stance, so anything past about twenty-five
 * characters starts shrinking the type for every panel that has to match it.
 */
import type { Locale } from '@/domain/i18n/locale'
import type { Panel } from '@/domain/banners/spec'

/** A three-quarter animal render. */
const A = (name: string) => `/xo/shots/${name}-three.webp`
/** A staged scene render. */
const S = (name: string, ext = 'webp') => `/xo/scenes/${name}.${ext}`
/** A block, room or café thumbnail. */
const T = (dir: string, name: string) => `/thumbs/${dir}/${name}.webp`

const CAST_BAND = ['panda', 'fox', 'penguin', 'tiger', 'koala', 'lion', 'bunny', 'cow', 'pig'].map(A)
const BLOCK_BAND = ['bricks_A', 'wood', 'metalframe', 'anvil', 'crate', 'glass', 'pipe', 'metal', 'stone']
  .map((n) => T('blocks', n))
const GARDEN_BAND = ['garden_path', 'garden_lantern', 'garden_flowers', 'garden_bench', 'garden_tree',
  'monstera', 'garden_fountain', 'garden_mailbox', 'cactus'].map((n) => T('home', n))
const ROOM_BAND = ['tv', 'record_player', 'standing_lamp', 'desk_chair', 'couch_orange', 'armchair',
  'candles', 'aquarium', 'clock_standing'].map((n) => T('home', n))
const MONEY_BAND = [T('home', 'piggybank'), T('cafe', 'register'), T('blocks', 'vault'),
  T('blocks', 'chest'), T('blocks', 'stone_with_gold'), T('cafe', 'coffee'), T('cafe', 'jars'),
  T('builder/proto', 'Coin_A'), T('blocks', 'gift')]
const TECH_BAND = ['computer', 'battery', 'prototype', 'vault', 'chest', 'colored_block_blue',
  'dynamite', 'metal', 'glass'].map((n) => T('blocks', n))

/** The half of the stance that is always said, in the accent colour. */
export const TAGLINE: Record<Locale, string> = {
  en: 'here to play',
  de: 'zum Spielen',
  bg: 'тук сме да играем',
}

export const PANELS: readonly Panel[] = [
  // ---------------------------------------------------------------- overview
  {
    id: 'play',
    group: 'overview',
    character: S('crew'),
    hero: '/thumbs/builder/bedroom/soccer_ball.webp',
    band: CAST_BAND,
    slots: 1,
    copy: {
      en: { funny: 'NO LOBBY, NO WAIT',
        title: 'Play XO online, together',
        body: 'Walk into a world where other people already are, then pull an XP off the store and play it. Coins you win are yours to spend in game. Start on the skins everybody gets, and open up more as you play.' },
      de: { funny: 'KEINE LOBBY, KEIN WARTEN',
        title: 'Spiel XO online, zusammen',
        body: 'Geh in eine Welt, in der schon andere stehen, und zieh dir ein XP aus dem Store. Gewonnene Coins gibst du im Spiel wieder aus. Fang mit den Skins an, die jeder hat, und schalt beim Spielen neue frei.' },
      bg: { funny: 'БЕЗ ЛОБИ, БЕЗ ЧАКАНЕ',
        title: 'Играй XO онлайн, заедно',
        body: 'Влизаш в свят, в който вече има други, и издърпваш XP от магазина. Спечелените монети харчиш в играта. Започваш със скиновете, които всеки има, и отключваш нови, докато играеш.' },
    },
  },
  {
    id: 'create',
    group: 'overview',
    character: S('summon'),
    hero: T('blocks', 'computer'),
    band: BLOCK_BAND,
    slots: 3,
    slotLabels: {
      en: ['XO STUDIO', 'XP EDITOR', 'P5 SKETCH'],
      de: ['XO STUDIO', 'XP EDITOR', 'P5 SKETCH'],
      bg: ['XO STUDIO', 'XP РЕДАКТОР', 'P5 СКЕЧ'],
    },
    copy: {
      en: { funny: 'MADE IT? SHIP IT.',
        title: 'Three editors, one place',
        body: 'Blueprint a world and cut a clip in the XO studio. Script a level in the XP editor. Write a p5.js sketch and the multiplayer is already wired — the roster, the shared state and the messaging come with it.' },
      de: { funny: 'GEBAUT? RAUS DAMIT.',
        title: 'Drei Editoren, ein Ort',
        body: 'Entwirf eine Welt und schneide einen Clip im XO Studio. Skripte ein Level im XP-Editor. Schreib einen p5.js-Sketch — der Multiplayer ist schon verdrahtet: Roster, geteilter Zustand und Nachrichten kommen mit.' },
      bg: { funny: 'НАПРАВИ ГО? ПУСНИ ГО.',
        title: 'Три редактора, едно място',
        body: 'Проектирай свят и монтирай клип в XO студиото. Напиши ниво в XP редактора. Пиши p5.js скеч — мултиплеърът вече е свързан: съставът, споделеното състояние и съобщенията идват с него.' },
    },
  },
  {
    id: 'share',
    group: 'overview',
    character: S('instant-link'),
    hero: T('home', 'garden_mailbox'),
    band: GARDEN_BAND,
    slots: 1,
    copy: {
      en: { funny: 'ONE LINK, THEY’RE IN',
        title: 'Hand it over and they walk in',
        body: 'A link, a QR code somebody points a phone at, or an invite into the space. Work on projects together, put what you made into a channel, and tell the story around it.' },
      de: { funny: 'EIN LINK, SIE SIND DRIN',
        title: 'Weitergeben, und sie sind da',
        body: 'Ein Link, ein QR-Code fürs Handy oder eine Einladung in den Space. Arbeitet zusammen an Projekten, stellt Gebautes in einen Kanal und erzählt die Geschichte dazu.' },
      bg: { funny: 'ЕДИН ЛИНК И СА ВЪТРЕ',
        title: 'Подаваш го и те влизат',
        body: 'Линк, QR код за телефон или покана в пространството. Работете заедно по проекти, сложете направеното в канал и разкажете историята около него.' },
    },
  },
  // -------------------------------------------------------------------- play
  {
    id: 'cube',
    group: 'play',
    character: A('fox'),
    hero: T('blocks', 'vault'),
    band: TECH_BAND,
    slots: 1,
    copy: {
      en: { funny: 'THE SPACE IS THE CONSOLE',
        title: 'XO is the cube you plug games into',
        body: 'A space is the console, an XP is the cartridge, and taking one out is ejecting it. The shelf holds what you own — slot one in, and everybody standing in the room is playing it.' },
      de: { funny: 'DER SPACE IST DIE KONSOLE',
        title: 'XO ist der Würfel für deine Spiele',
        body: 'Ein Space ist die Konsole, ein XP die Cartridge, und Rausnehmen heißt Auswerfen. Das Regal hält, was dir gehört — steck eins rein, und alle im Raum spielen es.' },
      bg: { funny: 'ПРОСТРАНСТВОТО Е КОНЗОЛАТА',
        title: 'XO е кубът, в който слагаш игри',
        body: 'Пространството е конзолата, XP е касетата, а изваждането е изхвърляне. Рафтът пази твоето — слагаш една и всички в стаята я играят.' },
    },
  },
  {
    id: 'bank',
    group: 'play',
    character: S('coin-runner', 'png'),
    hero: T('builder/proto', 'Coin_A'),
    band: MONEY_BAND,
    slots: 1,
    copy: {
      en: { funny: 'THE CAFÉ PRINTS THE MONEY',
        title: 'A purse, a bank, and a wallet',
        body: 'Work a shift in the café and you are minting coins. The purse is yours inside one space, the bank belongs to the space, and the wallet is what you keep when you leave. No coin is ever bought with real money.' },
      de: { funny: 'DAS CAFÉ DRUCKT DAS GELD',
        title: 'Ein Beutel, eine Bank, eine Brieftasche',
        body: 'Eine Schicht im Café prägt Münzen. Der Beutel gehört dir in einem Space, die Bank gehört dem Space, und die Brieftasche bleibt dir, wenn du gehst. Keine Münze ist je für echtes Geld zu haben.' },
      bg: { funny: 'КАФЕТО ПЕЧАТА ПАРИТЕ',
        title: 'Кесия, банка и портфейл',
        body: 'Смяна в кафето сече монети. Кесията е твоя в едно пространство, банката е на пространството, а портфейлът остава с теб, когато си тръгнеш. Монета никога не се купува с истински пари.' },
    },
  },
  {
    id: 'skins',
    group: 'play',
    character: A('tiger'),
    hero: T('home', 'teddy'),
    band: CAST_BAND,
    slots: 1,
    copy: {
      en: { funny: 'PICK A FACE, ANY FACE',
        title: 'Twenty-four animals to start with',
        body: 'Choose from the skins everybody gets — nothing to buy and nothing to earn first. Play, and more open up. You keep two bodies either way: your peep, and your XP.' },
      de: { funny: 'SUCH DIR EIN GESICHT AUS',
        title: 'Vierundzwanzig Tiere zum Anfangen',
        body: 'Wähl aus den Skins, die jeder bekommt — nichts zu kaufen, nichts vorher zu verdienen. Spiel, und es kommen mehr dazu. Zwei Körper behältst du sowieso: deinen Peep und dein XP.' },
      bg: { funny: 'ИЗБЕРИ СИ ЛИЦЕ',
        title: 'Двадесет и четири животни за начало',
        body: 'Избираш от скиновете, които всеки има — нищо за купуване, нищо за печелене първо. Играеш и се отключват още. Пазиш две тела така или иначе: своя peep и своето XP.' },
    },
  },
  // ------------------------------------------------------------------ create
  {
    id: 'studio',
    group: 'create',
    character: S('desk-duo'),
    hero: T('home', 'tv'),
    band: ROOM_BAND,
    slots: 1,
    copy: {
      en: { funny: 'LIGHTS. CAMERA. PANDA.',
        title: 'Make a film of your own space',
        body: 'One row per animal, one for the camera, one for every block on the set. Scrub to a second and walk somebody across the floor — it writes the walk that arrives exactly there. Hand them a line and they say it.' },
      de: { funny: 'LICHT. KAMERA. PANDA.',
        title: 'Dreh einen Film in deinem Raum',
        body: 'Eine Spur pro Tier, eine für die Kamera, eine für jeden Block im Set. Zu einer Sekunde springen und jemanden über den Boden laufen lassen — es schreibt den Weg, der genau dort ankommt. Gib ihm einen Satz, und er sagt ihn.' },
      bg: { funny: 'СВЕТЛИНА. КАМЕРА. ПАНДА.',
        title: 'Направи филм в своето място',
        body: 'По една пътека за всяко животно, една за камерата и по една за всеки блок. Спираш на секунда и разхождаш някого — записва се вървенето, което стига точно там. Даваш му реплика и той я казва.' },
    },
  },
  {
    id: 'xp-editor',
    group: 'create',
    character: S('football-duel'),
    hero: T('blocks', 'anvil'),
    band: BLOCK_BAND,
    slots: 1,
    copy: {
      en: { funny: 'A ROOM WITH A CLOCK',
        title: 'Build the level, then script it',
        body: 'Lay a world out of blocks, give the things in it rules and states, and wire up the triggers. Two people at the line is enough to start, and nothing eliminates you — last place still finishes.' },
      de: { funny: 'EIN RAUM MIT EINER UHR',
        title: 'Bau das Level, dann skripte es',
        body: 'Leg eine Welt aus Blöcken an, gib den Dingen darin Regeln und Zustände, und verdrahte die Trigger. Zwei an der Linie reichen zum Start, und nichts scheidet dich aus — der letzte Platz kommt auch an.' },
      bg: { funny: 'СТАЯ С ЧАСОВНИК',
        title: 'Построй нивото и го напиши',
        body: 'Разположи свят от блокове, дай на нещата правила и състояния и свържи тригерите. Двама на линията стигат за старт, и нищо не те елиминира — последният също финишира.' },
    },
  },
  {
    id: 'sketch',
    group: 'create',
    character: S('heap-create'),
    hero: T('blocks', 'computer'),
    band: TECH_BAND,
    slots: 1,
    copy: {
      en: { funny: 'IT’S JUST P5.JS',
        title: 'Write a sketch, get multiplayer free',
        body: 'Ordinary p5.js in the editor, and the platform hands it the roster, the shared state and the messaging. It runs sandboxed on an origin of its own, so a sketch can never phone home.' },
      de: { funny: 'ES IST EINFACH P5.JS',
        title: 'Sketch schreiben, Multiplayer gratis',
        body: 'Ganz normales p5.js im Editor, und die Plattform reicht ihm Roster, geteilten Zustand und Nachrichten. Es läuft gesandboxed auf einer eigenen Origin — ein Sketch kann nie nach Hause telefonieren.' },
      bg: { funny: 'ПРОСТО P5.JS Е',
        title: 'Пишеш скеч, мултиплеърът е даден',
        body: 'Обикновен p5.js в редактора, а платформата му подава състава, споделеното състояние и съобщенията. Върви в пясъчник на собствен origin — скеч никога не може да се обади навън.' },
    },
  },
  // ------------------------------------------------------------------- share
  {
    id: 'guests',
    group: 'share',
    character: S('venue-5-doors'),
    hero: T('home', 'garden_mailbox'),
    band: GARDEN_BAND,
    slots: 1,
    copy: {
      en: { funny: 'NO PASSWORD TO INVENT',
        title: 'A link, a code, or an invite',
        body: 'Put the door in the group chat, or let somebody point a phone at a QR code. They type a name, pick an animal and walk in. Set it to knock first if you would rather be asked.' },
      de: { funny: 'KEIN PASSWORT AUSDENKEN',
        title: 'Ein Link, ein Code oder eine Einladung',
        body: 'Stell die Tür in den Gruppenchat, oder lass jemanden das Handy auf einen QR-Code halten. Namen eintippen, Tier wählen, reingehen. Stell auf Anklopfen, wenn du lieber gefragt wirst.' },
      bg: { funny: 'БЕЗ ИЗМИСЛЯНЕ НА ПАРОЛА',
        title: 'Линк, код или покана',
        body: 'Сложи вратата в групата или остави някой да насочи телефон към QR код. Пише име, избира животно и влиза. Настрой на почукване, ако предпочиташ да те питат.' },
    },
  },
  {
    id: 'channels',
    group: 'share',
    character: S('heap-share'),
    hero: T('blocks', 'books_A'),
    band: ROOM_BAND,
    slots: 1,
    copy: {
      en: { funny: 'PUT IT ON THE BOARD',
        title: 'Publish it, and tell the story',
        body: 'Work on projects together, then put what you made into a channel — a clip of the goal, a world somebody should try, a chapter of the story you are writing around it.' },
      de: { funny: 'STELL ES AUFS BRETT',
        title: 'Veröffentliche es, und erzähl die Geschichte',
        body: 'Arbeitet zusammen an Projekten, und stellt Gebautes dann in einen Kanal — den Clip vom Tor, eine Welt zum Ausprobieren, ein Kapitel der Geschichte, die ihr drumherum schreibt.' },
      bg: { funny: 'СЛОЖИ ГО НА ТАБЛОТО',
        title: 'Публикувай го и разкажи историята',
        body: 'Работете заедно по проекти, а после сложете направеното в канал — клипа на гола, свят за пробване, глава от историята, която пишете около него.' },
    },
  },
  {
    id: 'universe',
    group: 'share',
    character: S('house'),
    hero: T('blocks', 'gift'),
    band: MONEY_BAND,
    slots: 1,
    copy: {
      en: { funny: 'SOMEBODY ELSE BUILT THIS',
        title: 'The XO universe, and everything in it',
        body: 'Go through what other spaces on kxb.team have made — worlds, levels, sketches and clips. Play it, remix it, or follow the story the worlds come out of, a chapter at a time.' },
      de: { funny: 'DAS HAT WER ANDERS GEBAUT',
        title: 'Das XO-Universum, und alles darin',
        body: 'Stöber durch das, was andere Spaces auf kxb.team gebaut haben — Welten, Level, Sketches und Clips. Spiel es, remixe es, oder folge der Geschichte, aus der die Welten kommen, Kapitel für Kapitel.' },
      bg: { funny: 'НЯКОЙ ДРУГ ГО Е ПОСТРОИЛ',
        title: 'XO вселената и всичко в нея',
        body: 'Разгледай какво са направили други пространства в kxb.team — светове, нива, скечове и клипове. Играй го, ремиксирай го или следвай историята, от която идват световете, глава по глава.' },
    },
  },
]

const BY_ID = new Map(PANELS.map((p) => [p.id, p]))

export function panel(id: string): Panel | undefined {
  return BY_ID.get(id)
}
