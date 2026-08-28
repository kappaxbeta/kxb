/**
 * The tour: what this place is, in six panels.
 *
 * Localised, unlike everything else behind the login - see the note at the top
 * of locales.ts, which is still true and is the reason this file needs a
 * justification. Two things make the tour the exception. It is the one screen a
 * brand new account sees before it has a space, so it is read by somebody who
 * arrived from the German landing page seconds earlier and has not yet been
 * anywhere the app is English; and the same panels are meant to run on that
 * landing page later, where German is not optional. A dictionary now is cheaper
 * than the same six paragraphs written twice.
 *
 * Typed the way the other dictionaries here are: one explicit interface, every
 * language declared against it, so a missing key is a build error rather than a
 * hole somebody notices in production.
 */

import { DEFAULT_LOCALE, type Locale } from '@/domain/i18n/locale'

/** The panels, in order. Ids rather than indices: the order may change. */
export type TourStepId = 'lounge' | 'build' | 'play' | 'rooms' | 'invite' | 'studio'

export interface TourStepCopy {
  /** The small line above the title. Names the surface. */
  kicker: string
  title: string
  body: string
  /** Describes the picture, rather than repeating the caption. */
  alt: string
}

export interface TourDict {
  /** The launcher: a row in the account menu, a pill anywhere else. */
  launch: string
  dialogTitle: string
  close: string
  /** `{current}` and `{total}` are substituted. */
  stepOf: string
  next: string
  back: string
  skip: string
  /** Leaves the tour at its last panel, when there is nothing to do after it. */
  done: string
  steps: Record<TourStepId, TourStepCopy>
  /** The panel after the last one, on the first-run tour only. */
  finish: {
    kicker: string
    /** While the free space is still going spare. */
    createTitle: string
    createBody: string
    /**
     * Once it is not.
     *
     * This used to be "when there is no seat to spend", which was the old flow:
     * you bought the right to make a space before you made one. Since tiers the
     * fork is `FREE_SPACES_PER_ACCOUNT` - the first space is free and already
     * made, so the panel is about the *next* one.
     */
    payTitle: string
    payBody: string
  }
}

export const TOUR_EN: TourDict = {
  launch: 'How it works',
  dialogTitle: 'How it works',
  close: 'Close',
  stepOf: 'Step {current} of {total}',
  next: 'Next',
  back: 'Back',
  skip: 'Skip the tour',
  done: 'Done',
  steps: {
    lounge: {
      kicker: 'The Lounge',
      title: 'A room that is actually there.',
      body: 'Your space opens into a room you walk around in — arrow keys or a thumb, no install, no headset. Everyone else in it is a peep you can see, wave at and stand next to. Talking happens where you are standing.',
      alt: 'Four peeps standing together in a neon-lit lounge.',
    },
    build: {
      kicker: 'Worlds',
      title: 'Build the place, block by block.',
      body: 'Rooms are yours to make. Drop floors, walls, furniture and props from the block catalogue, put a door where people arrive, and save it as a world. Publish one and anybody can pull it into their own space.',
      alt: 'A room being fitted out, half bare floor and half furniture.',
    },
    play: {
      kicker: 'Games',
      title: 'Something to do with your hands.',
      body: 'Kick a ball around, run a race, or put two peeps in a ring — all against all, in teams, or one against everyone. Matches are scored and logged, so the argument afterwards has an answer. This is the part that makes people stay past the first ten minutes.',
      alt: 'Two peeps going for the same ball on a lit pitch.',
    },
    rooms: {
      kicker: 'The Café and the house',
      title: 'More than one room to be in.',
      body: 'Step out of the lounge into the café, where somebody is behind the counter, or into a house you furnish yourself. Different rooms make different conversations — the same reason an office has a kitchen.',
      alt: 'A peep behind a café counter with coffee and pastries.',
    },
    invite: {
      kicker: 'Guests',
      title: 'One link, and they are in.',
      body: 'Send a guest link and whoever holds it walks straight in — no account, no download, nothing to install. Members you invite by email keep their peep and their name across every space they belong to.',
      alt: 'A peep arriving through a lit doorway from a link.',
    },
    studio: {
      kicker: 'The Studio',
      title: 'Take a picture of it.',
      body: 'Point a camera at any room, pose your peeps, and come back with a still or a short clip. Handy for a poster, an invite, or showing somebody what happened without asking them to be there.',
      alt: 'A crowded room under club lights, framed like a photograph.',
    },
  },
  finish: {
    kicker: 'Your turn',
    createTitle: 'Make your space.',
    createBody:
      'A space is your own copy of all of this — its own rooms, its own members, its own log that nobody outside can read. You are its owner. The URL is permanent, so pick one you can say out loud.',
    payTitle: 'One more space, from €5 a month.',
    payBody:
      'Making a space is free, and yours is made — the next one comes with a plan of its own. xo is €5 and is everything you just saw. xp is €15 and adds the XP suite — your own levels, with your own rules. Each plan carries its own headcount, and being a member of somebody else’s space is always free.',
  },
}

export const TOUR_DE: TourDict = {
  launch: 'So funktioniert’s',
  dialogTitle: 'So funktioniert’s',
  close: 'Schließen',
  stepOf: 'Schritt {current} von {total}',
  next: 'Weiter',
  back: 'Zurück',
  skip: 'Tour überspringen',
  done: 'Fertig',
  steps: {
    lounge: {
      kicker: 'Die Lounge',
      title: 'Ein Raum, der wirklich da ist.',
      body: 'Dein Space öffnet sich in einen Raum, durch den du läufst — Pfeiltasten oder Daumen, ohne Installation, ohne Headset. Alle anderen darin sind Peeps, die du siehst, grüßt und neben die du dich stellst. Geredet wird da, wo du stehst.',
      alt: 'Vier Peeps stehen zusammen in einer neonbeleuchteten Lounge.',
    },
    build: {
      kicker: 'Welten',
      title: 'Baue den Ort, Block für Block.',
      body: 'Die Räume gehören dir. Setze Böden, Wände, Möbel und Requisiten aus dem Katalog, stell eine Tür dorthin, wo Leute ankommen, und speichere das Ganze als Welt. Veröffentlicht kann sie jeder in seinen eigenen Space holen.',
      alt: 'Ein Raum im Aufbau, halb nackter Boden, halb Möbel.',
    },
    play: {
      kicker: 'Spiele',
      title: 'Etwas für die Hände.',
      body: 'Kickt einen Ball, laufe ein Rennen oder stell zwei Peeps in den Ring — alle gegen alle, in Teams oder einer gegen alle. Matches werden gezählt und protokolliert, damit die Diskussion danach eine Antwort hat. Das ist der Teil, der Leute länger als zehn Minuten bleiben lässt.',
      alt: 'Zwei Peeps gehen auf einem beleuchteten Platz zum selben Ball.',
    },
    rooms: {
      kicker: 'Café und Haus',
      title: 'Mehr als ein Raum zum Sein.',
      body: 'Geh aus der Lounge ins Café, wo jemand hinter der Theke steht, oder in ein Haus, das du selbst einrichtest. Andere Räume führen zu anderen Gesprächen — aus demselben Grund, aus dem ein Büro eine Küche hat.',
      alt: 'Ein Peep hinter einer Café-Theke mit Kaffee und Gebäck.',
    },
    invite: {
      kicker: 'Gäste',
      title: 'Ein Link, und sie sind drin.',
      body: 'Schick einen Gastlink, und wer ihn hat, kommt direkt herein — kein Konto, kein Download, nichts zu installieren. Mitglieder, die du per E-Mail einlädst, behalten ihren Peep und ihren Namen in jedem Space, zu dem sie gehören.',
      alt: 'Ein Peep kommt durch eine beleuchtete Tür aus einem Link herein.',
    },
    studio: {
      kicker: 'Das Studio',
      title: 'Mach ein Bild davon.',
      body: 'Richte eine Kamera auf jeden Raum, stell deine Peeps hin und komm mit einem Standbild oder kurzen Clip zurück. Gut für ein Plakat, eine Einladung oder um zu zeigen, was passiert ist, ohne dass jemand dabei sein musste.',
      alt: 'Ein voller Raum unter Clublicht, gerahmt wie ein Foto.',
    },
  },
  finish: {
    kicker: 'Du bist dran',
    createTitle: 'Erstelle deinen Space.',
    createBody:
      'Ein Space ist deine eigene Ausgabe von allem hier — eigene Räume, eigene Mitglieder, ein eigenes Log, das von außen niemand lesen kann. Du bist Inhaber. Die URL ist dauerhaft, wähl also eine, die du aussprechen kannst.',
    payTitle: 'Noch ein Space, ab 5 € pro Monat.',
    payBody:
      'Einen Space zu erstellen ist kostenlos, und deiner steht schon — der nächste bekommt seinen eigenen Plan. xo kostet 5 € und ist alles, was du gerade gesehen hast. xp kostet 15 € und bringt die XP-Suite dazu — eigene Level mit eigenen Regeln. Jeder Plan hat seine eigene Personenzahl, und Mitglied im Space von jemand anderem zu sein, ist immer kostenlos.',
  },
}

export const TOUR_BG: TourDict = {
  launch: 'Как работи',
  dialogTitle: 'Как работи',
  close: 'Затвори',
  stepOf: 'Стъпка {current} от {total}',
  next: 'Напред',
  back: 'Назад',
  skip: 'Пропусни обиколката',
  done: 'Готово',
  steps: {
    lounge: {
      kicker: 'Лоунджът',
      title: 'Стая, която наистина я има.',
      body: 'Твоят спейс се отваря в стая, из която се движиш — със стрелките или с палец, без инсталация и без очила. Всички останали вътре са пийпове, които виждаш, поздравяваш и до които заставаш. Говори се там, където стоиш.',
      alt: 'Четирима пийпове стоят заедно в неоново осветен лоундж.',
    },
    build: {
      kicker: 'Светове',
      title: 'Построй мястото, блок по блок.',
      body: 'Стаите са твои. Слагай подове, стени, мебели и реквизит от каталога с блокове, постави врата там, откъдето влизат хората, и запази всичко като свят. Публикуваш ли го, всеки може да го вземе в своя спейс.',
      alt: 'Стая по време на обзавеждане — наполовина гол под, наполовина мебели.',
    },
    play: {
      kicker: 'Игри',
      title: 'Нещо за ръцете.',
      body: 'Ритайте топка, бягайте състезание или пуснете двама пийпа на ринга — всеки срещу всеки, отбор срещу отбор или един срещу всички. Мачовете се точкуват и се записват, така че спорът след тях има отговор. Това е частта, заради която хората остават след първите десет минути.',
      alt: 'Двама пийпа тръгват към една и съща топка на осветено игрище.',
    },
    rooms: {
      kicker: 'Кафенето и къщата',
      title: 'Повече от една стая, в която да си.',
      body: 'Излез от лоунджа в кафенето, където някой стои зад бара, или в къща, която обзавеждаш сам. Различните стаи водят до различни разговори — по същата причина, по която в един офис има кухня.',
      alt: 'Пийп зад бара в кафене, с кафе и сладкиши.',
    },
    invite: {
      kicker: 'Гости',
      title: 'Един линк, и са вътре.',
      body: 'Прати гост-линк и който го получи, влиза направо — без акаунт, без сваляне, без нищо за инсталиране. Членовете, които каниш по имейл, запазват своя пийп и името си във всеки спейс, към който принадлежат.',
      alt: 'Пийп влиза през осветена врата, дошъл от линк.',
    },
    studio: {
      kicker: 'Студиото',
      title: 'Направи снимка.',
      body: 'Насочи камера към която и да е стая, нареди пийповете си и се върни със снимка или кратък клип. Удобно за плакат, за покана или за да покажеш какво се е случило, без да караш някого да е бил там.',
      alt: 'Пълна стая под клубни светлини, кадрирана като фотография.',
    },
  },
  finish: {
    kicker: 'Твой ред',
    createTitle: 'Създай своя спейс.',
    createBody:
      'Спейсът е твое собствено копие на всичко това — свои стаи, свои членове, свой лог, който отвън никой не може да чете. Ти си собственикът. Адресът е постоянен, така че избери такъв, който можеш да кажеш на глас.',
    payTitle: 'Още един спейс, от 5 € на месец.',
    payBody:
      'Създаването на спейс е безплатно и твоят вече е готов — следващият идва със свой план. xo е 5 € и е всичко, което току-що видя. xp е 15 € и добавя XP пакета — собствени нива със собствени правила. Всеки план носи свой брой хора, а да си член в чужд спейс винаги е безплатно.',
  },
}

const DICTS: Record<Locale, TourDict> = { en: TOUR_EN, de: TOUR_DE, bg: TOUR_BG }

export function tourDict(locale: Locale = DEFAULT_LOCALE): TourDict {
  return DICTS[locale] ?? TOUR_EN
}

/** `Step 2 of 6`, in either language. */
export function stepLabel(dict: TourDict, current: number, total: number): string {
  return dict.stepOf
    .replace('{current}', String(current))
    .replace('{total}', String(total))
}
