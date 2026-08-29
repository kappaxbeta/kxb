import type { Locale } from '@/domain/i18n/locale'
import type { Theme } from '@kxb/peepz-world/catalog'

/**
 * The house and the garden: the HUD around them, and the catalogue inside it.
 *
 * ---------------------------------------------------------------------------
 * Why the English is not in here
 * ---------------------------------------------------------------------------
 * Every other dictionary in this folder carries both languages. This one
 * carries only German, and reads the English off `HOME_PROPS` itself, because
 * the catalogue is not copy that happens to be in the domain - it is the
 * *shop*, and a sofa's name sits in the same object as its price, its depth and
 * the model it draws. Copying fifty-three names over here to have them in one
 * more place would mean a rename that silently changes only one of the two.
 *
 * So: English comes from the catalogue, every other language is written here
 * against the same ids, and `home-words.test.ts` fails if the lists ever
 * disagree - which is the check a `Record<HomeItemId, …>` would have given us
 * if the catalogue's id were a union rather than a string.
 *
 * Three fields per item, all optional, because the catalogue's are: `name` is
 * always there, `use` only on furniture you get into, `blurb` only where there
 * was something worth saying.
 */
export interface ItemWords {
  name?: string
  use?: string
  blurb?: string
}

export interface HomeDict {
  themes: Record<Theme, string>

  /** The readouts at the top of the screen. */
  coins: string
  comfort: string
  inFurniture: string
  /** `{n}` is the comfort bonus, as a percentage. */
  economy: string

  outside: string
  inside: string
  mouseHint: string
  decorate: string
  done: string
  theGarden: string
  growingGarden: string
  openingHouse: string

  /** The controls, which are the house's own verbs. */
  controls: {
    move: string
    dragToLook: string
    use: string
    sitSleepLeave: string
    rearrange: string
    place: string
    putItDown: string
    turn: string
    rotate: string
    sell: string
    sellItBack: string
    stopDecorating: string
    run: string
    arrows: string
    look: string
    mouseLook: string
    freeMouse: string
    pickUpAndMove: string
    wheel: string
    changeItem: string
  }

  /** The decorate sheet. */
  panel: {
    /** `{n}` is how many things this room's shelf has. */
    things: string
    /** `{name}` is what you are holding. */
    carrying: string
    lookAtSquare: string
    /** `{room}` is the theme, `{cost}` the price of a square. */
    bareGround: string
    /** `{name}` is what is standing there. */
    somethingHere: string
    /** `{name}` is what would be placed. */
    emptySquare: string
    something: string
    /** `{n}` is what the ground would fetch. */
    orSellGround: string
    cancelMove: string
    move: string
    /** `{n}` is the refund. */
    sellFor: string
    sellGroundFor: string
    sell: string
  }

  /** The doorways, which are a plan's rather than a prop's. */
  exits: { outside: string; inside: string; cafe: string }
  /** Getting out of whatever you are sitting in. */
  getUp: string

  /** The catalogue, translated. English is read off `HOME_PROPS` - see above. */
  items: Record<string, ItemWords>

  /** The tab, and the one line a crawler is given, for both homestead pages. */
  meta: {
    house: string
    houseBody: string
    garden: string
    gardenBody: string
  }
}

export const HOME_EN: HomeDict = {
  meta: {
    house: 'House',
    houseBody: "Your space's house, furnished out of the café's takings.",
    garden: 'Garden',
    gardenBody: "The garden a member's house stands in.",
  },

  themes: {
    bedroom: 'Bedroom',
    living: 'Living room',
    kitchen: 'Kitchen',
    bath: 'Bathroom',
    garden: 'Garden',
  },

  coins: 'coins',
  comfort: 'comfort',
  inFurniture: 'in furniture',
  economy:
    'Earned in the café, spent here. A comfortable house is worth +{n}% on every tip you take behind the counter.',

  outside: 'Outside',
  inside: 'Inside',
  mouseHint: 'Click to capture the mouse, or turn with the arrow keys.',
  decorate: 'Decorate',
  done: 'Done',
  theGarden: 'The garden',
  growingGarden: 'Growing the garden…',
  openingHouse: 'Opening up the house…',

  controls: {
    move: 'Move',
    dragToLook: 'Drag to look',
    use: 'Use',
    sitSleepLeave: 'Sit, sleep, or leave',
    rearrange: 'Rearrange',
    place: 'Place',
    putItDown: 'Put it down',
    turn: 'Turn',
    rotate: 'Rotate',
    sell: 'Sell',
    sellItBack: 'Sell it back',
    stopDecorating: 'Stop decorating',
    run: 'Run',
    arrows: 'Arrows',
    look: 'Look',
    mouseLook: 'Mouse look on / off',
    freeMouse: 'Free the mouse',
    pickUpAndMove: 'Pick up and move',
    wheel: 'Wheel',
    changeItem: 'Change item',
  },

  panel: {
    things: '{n} things',
    carrying:
      'Carrying {name} — click a free square to put it down, R to turn it, right-click to cancel.',
    lookAtSquare: 'Look at a square.',
    bareGround: 'Bare ground — click to add it to the {room} for {cost}.',
    somethingHere: '{name} is here.',
    emptySquare: 'Empty square — click to place {name}.',
    something: 'something',
    orSellGround: 'Or sell the ground back for {n}.',
    cancelMove: 'Cancel move',
    move: 'Move',
    sellFor: 'Sell for {n}',
    sellGroundFor: 'Sell ground for {n}',
    sell: 'Sell',
  },

  exits: { outside: 'Step outside', inside: 'Go inside', cafe: 'Head to the café' },
  getUp: 'Get up',

  // Empty on purpose: English is the catalogue's own. See the note at the top.
  items: {},
}

export const HOME_DE: HomeDict = {
  meta: {
    house: 'Haus',
    houseBody: 'Das Haus Ihres Raums, eingerichtet aus den Einnahmen des Cafés.',
    garden: 'Garten',
    gardenBody: 'Der Garten, in dem das Haus eines Mitglieds steht.',
  },

  themes: {
    bedroom: 'Schlafzimmer',
    living: 'Wohnzimmer',
    kitchen: 'Küche',
    bath: 'Badezimmer',
    garden: 'Garten',
  },

  coins: 'Münzen',
  comfort: 'Gemütlichkeit',
  inFurniture: 'in Möbeln',
  economy:
    'Im Café verdient, hier ausgegeben. Ein gemütliches Zuhause bringt +{n}% auf jedes Trinkgeld, das Sie hinter dem Tresen bekommen.',

  outside: 'Draußen',
  inside: 'Drinnen',
  mouseHint:
    'Klicken Sie, um die Maus zu fangen, oder drehen Sie mit den Pfeiltasten.',
  decorate: 'Einrichten',
  done: 'Fertig',
  theGarden: 'Der Garten',
  growingGarden: 'Der Garten wächst …',
  openingHouse: 'Das Haus wird aufgeschlossen …',

  controls: {
    move: 'Bewegen',
    dragToLook: 'Ziehen zum Umsehen',
    use: 'Benutzen',
    sitSleepLeave: 'Hinsetzen, schlafen oder gehen',
    rearrange: 'Umstellen',
    place: 'Setzen',
    putItDown: 'Hinstellen',
    turn: 'Drehen',
    rotate: 'Drehen',
    sell: 'Verkaufen',
    sellItBack: 'Zurückverkaufen',
    stopDecorating: 'Einrichten beenden',
    run: 'Rennen',
    arrows: 'Pfeile',
    look: 'Umsehen',
    mouseLook: 'Mausblick an / aus',
    freeMouse: 'Maus freigeben',
    pickUpAndMove: 'Aufnehmen und umstellen',
    wheel: 'Rad',
    changeItem: 'Ding wechseln',
  },

  panel: {
    things: '{n} Dinge',
    carrying:
      'Sie tragen {name} — klicken Sie auf ein freies Feld, um es abzustellen, R zum Drehen, Rechtsklick zum Abbrechen.',
    lookAtSquare: 'Schauen Sie auf ein Feld.',
    bareGround: 'Nackter Boden — klicken, um ihn für {cost} zum {room} zu nehmen.',
    somethingHere: 'Hier steht {name}.',
    emptySquare: 'Freies Feld — klicken, um {name} hinzustellen.',
    something: 'etwas',
    orSellGround: 'Oder den Boden für {n} zurückverkaufen.',
    cancelMove: 'Umstellen abbrechen',
    move: 'Umstellen',
    sellFor: 'Für {n} verkaufen',
    sellGroundFor: 'Boden für {n} verkaufen',
    sell: 'Verkaufen',
  },

  exits: {
    outside: 'Nach draußen gehen',
    inside: 'Hineingehen',
    cafe: 'Zum Café gehen',
  },
  getUp: 'Aufstehen',

  items: {
    bed: {
      name: 'Bett',
      use: 'Hinlegen',
      blurb: 'Zwei Felder lang. Das eine Ding, ohne das ein Schlafzimmer keines ist.',
    },
    bed_pink: { name: 'Bett, rosa', use: 'Hinlegen' },
    closet: { name: 'Kleiderschrank' },
    nightstand: {
      name: 'Nachttisch',
      blurb: 'Kommt mit dem Wecker, der Sie zum Frühstücksgeschäft weckt.',
    },
    desk: { name: 'Schreibtisch' },
    desk_chair: { name: 'Schreibtischstuhl', use: 'Hinsetzen' },
    teddy: { name: 'Teddybär' },
    toys: { name: 'Spielzeughaufen' },
    piggybank: {
      name: 'Sparschwein',
      blurb: 'Rein zur Zierde. Ihre Münzen liegen in der Café-Kasse.',
    },
    couch: {
      name: 'Sofa',
      use: 'Hinsetzen',
      blurb: 'Zwei Felder breit, und es geht bis an die Wand.',
    },
    couch_orange: { name: 'Sofa, orange', use: 'Hinsetzen' },
    armchair: { name: 'Sessel', use: 'Hinsetzen' },
    rocking_chair: { name: 'Schaukelstuhl', use: 'Setzen und schaukeln' },
    coffee_table: { name: 'Couchtisch' },
    tv: { name: 'Fernseher' },
    fireplace: { name: 'Kamin', blurb: 'Das mit Abstand gemütlichste Stück im Katalog.' },
    bookshelf: { name: 'Bücherregal' },
    aquarium: { name: 'Aquarium' },
    rug: {
      name: 'Teppich',
      blurb: 'Flach, Sie können darauf laufen und einen Tisch daraufstellen.',
    },
    standing_lamp: { name: 'Stehlampe' },
    record_player: { name: 'Plattenspieler' },
    clock_standing: { name: 'Standuhr' },
    stool: { name: 'Hocker', use: 'Draufsetzen' },
    counter_home: { name: 'Arbeitsplatte' },
    sink_home: { name: 'Spüle' },
    stove_home: { name: 'Herd' },
    fridge_home: { name: 'Kühlschrank' },
    kitchen_table: { name: 'Küchentisch' },
    kitchen_chair: { name: 'Küchenstuhl', use: 'Hinsetzen' },
    dishrack_home: { name: 'Abtropfgitter' },
    toaster: { name: 'Toaster und Wasserkocher' },
    bath: {
      name: 'Badewanne',
      use: 'Baden',
      blurb: 'Zwei Felder lang. Quietscheente inklusive.',
    },
    shower: { name: 'Dusche' },
    toilet: { name: 'Toilette', use: 'Hinsetzen' },
    bathroom_cabinet: { name: 'Waschbeckenschrank' },
    bathroom_bin: { name: 'Mülleimer' },
    towels: { name: 'Gefaltete Handtücher' },
    bath_mat: { name: 'Badematte' },
    candles: { name: 'Kerzen' },
    monstera: { name: 'Monstera' },
    yucca: { name: 'Yucca' },
    sansevieria: { name: 'Bogenhanf' },
    cactus: { name: 'Kaktus' },
    pothos: { name: 'Efeutute' },
    garden_tree: { name: 'Baum' },
    garden_bush: { name: 'Busch' },
    garden_bench: { name: 'Bank', use: 'Hinsetzen' },
    garden_fountain: {
      name: 'Springbrunnen',
      blurb: 'Vier Einheiten breit — geben Sie ihm ein Feld für sich.',
    },
    garden_lantern: { name: 'Straßenlaterne' },
    garden_flowers: { name: 'Blumenbeet' },
    garden_path: { name: 'Pflaster', blurb: 'Flach. Darauf laufen.' },
    garden_mailbox: { name: 'Briefkasten' },
    garden_trashcan: { name: 'Mülleimer' },
  },
}

export const HOME_BG: HomeDict = {
  meta: {
    house: 'Къща',
    houseBody: 'Къщата на вашия спейс, обзаведена с приходите от кафенето.',
    garden: 'Градина',
    gardenBody: 'Градината, в която стои къщата на един член.',
  },

  themes: {
    bedroom: 'Спалня',
    living: 'Всекидневна',
    kitchen: 'Кухня',
    bath: 'Баня',
    garden: 'Градина',
  },

  coins: 'монети',
  comfort: 'уют',
  inFurniture: 'в мебели',
  economy:
    'Печели се в кафенето, харчи се тук. Уютната къща носи +{n}% върху всеки бакшиш, който взимате зад бара.',

  outside: 'Навън',
  inside: 'Вътре',
  mouseHint: 'Щракнете, за да хванете мишката, или се завъртете със стрелките.',
  decorate: 'Обзавеждане',
  done: 'Готово',
  theGarden: 'Градината',
  growingGarden: 'Градината расте…',
  openingHouse: 'Къщата се отключва…',

  controls: {
    move: 'Движение',
    dragToLook: 'Влачене за оглеждане',
    use: 'Използване',
    sitSleepLeave: 'Сядане, спане или ставане',
    rearrange: 'Пренареждане',
    place: 'Поставяне',
    putItDown: 'Оставете го',
    turn: 'Завъртане',
    rotate: 'Завъртане',
    sell: 'Продаване',
    sellItBack: 'Продайте го обратно',
    stopDecorating: 'Спри обзавеждането',
    run: 'Бягане',
    arrows: 'Стрелки',
    look: 'Оглеждане',
    mouseLook: 'Поглед с мишката вкл. / изкл.',
    freeMouse: 'Освободи мишката',
    pickUpAndMove: 'Вземане и преместване',
    wheel: 'Колелце',
    changeItem: 'Смяна на нещото',
  },

  panel: {
    things: '{n} неща',
    carrying:
      'Носите {name} — щракнете на свободно квадратче, за да го оставите, R за завъртане, десен бутон за отказ.',
    lookAtSquare: 'Погледнете към квадратче.',
    bareGround: 'Гола земя — щракнете, за да я вземете към {room} за {cost}.',
    somethingHere: 'Тук е {name}.',
    emptySquare: 'Свободно квадратче — щракнете, за да сложите {name}.',
    something: 'нещо',
    orSellGround: 'Или продайте земята обратно за {n}.',
    cancelMove: 'Откажи преместването',
    move: 'Преместване',
    sellFor: 'Продай за {n}',
    sellGroundFor: 'Продай земята за {n}',
    sell: 'Продай',
  },

  exits: {
    outside: 'Излез навън',
    inside: 'Влез вътре',
    cafe: 'Към кафенето',
  },
  getUp: 'Ставане',

  items: {
    bed: {
      name: 'Легло',
      use: 'Полегнете си',
      blurb: 'Дълго две квадратчета. Нещото, без което спалнята не е спалня.',
    },
    bed_pink: { name: 'Легло, розово', use: 'Полегнете си' },
    closet: { name: 'Гардероб' },
    nightstand: {
      name: 'Нощно шкафче',
      blurb: 'Идва с часовника, който ви буди за сутрешния наплив.',
    },
    desk: { name: 'Бюро' },
    desk_chair: { name: 'Стол за бюро', use: 'Седнете' },
    teddy: { name: 'Плюшено мече' },
    toys: { name: 'Купчина играчки' },
    piggybank: {
      name: 'Касичка',
      blurb: 'Чиста украса. Монетите ви стоят в касата на кафенето.',
    },
    couch: {
      name: 'Диван',
      use: 'Седнете',
      blurb: 'Широк две квадратчета, и опира чак до стената.',
    },
    couch_orange: { name: 'Диван, оранжев', use: 'Седнете' },
    armchair: { name: 'Фотьойл', use: 'Седнете' },
    rocking_chair: { name: 'Люлеещ се стол', use: 'Седнете и се люлейте' },
    coffee_table: { name: 'Холна маса' },
    tv: { name: 'Телевизор' },
    fireplace: { name: 'Камина', blurb: 'Най-уютното нещо в целия каталог.' },
    bookshelf: { name: 'Библиотека' },
    aquarium: { name: 'Аквариум' },
    rug: {
      name: 'Килим',
      blurb: 'Плосък — може да го тъпчете и да сложите маса отгоре.',
    },
    standing_lamp: { name: 'Лампион' },
    record_player: { name: 'Грамофон' },
    clock_standing: { name: 'Стенен часовник с махало' },
    stool: { name: 'Табуретка', use: 'Кацнете отгоре' },
    counter_home: { name: 'Кухненски плот' },
    sink_home: { name: 'Мивка с шкаф' },
    stove_home: { name: 'Печка' },
    fridge_home: { name: 'Хладилник' },
    kitchen_table: { name: 'Кухненска маса' },
    kitchen_chair: { name: 'Кухненски стол', use: 'Седнете' },
    dishrack_home: { name: 'Сушилник за чинии' },
    toaster: { name: 'Тостер и кана' },
    bath: {
      name: 'Вана',
      use: 'Изкъпете се',
      blurb: 'Дълга две квадратчета. Гумено пате включено.',
    },
    shower: { name: 'Душ' },
    toilet: { name: 'Тоалетна', use: 'Седнете' },
    bathroom_cabinet: { name: 'Шкаф с мивка' },
    bathroom_bin: { name: 'Кошче' },
    towels: { name: 'Сгънати кърпи' },
    bath_mat: { name: 'Постелка за баня' },
    candles: { name: 'Свещи' },
    monstera: { name: 'Монстера' },
    yucca: { name: 'Юка' },
    sansevieria: { name: 'Тъщин език' },
    cactus: { name: 'Кактус' },
    pothos: { name: 'Епипремнум' },
    garden_tree: { name: 'Дърво' },
    garden_bush: { name: 'Храст' },
    garden_bench: { name: 'Пейка', use: 'Седнете' },
    garden_fountain: {
      name: 'Фонтан',
      blurb: 'Широк четири единици — дайте му квадратче само за него.',
    },
    garden_lantern: { name: 'Улична лампа' },
    garden_flowers: { name: 'Цветна леха' },
    garden_path: { name: 'Калдъръм', blurb: 'Плосък. Върви се по него.' },
    garden_mailbox: { name: 'Пощенска кутия' },
    garden_trashcan: { name: 'Кошче' },
  },
}

const DICTS: Record<Locale, HomeDict> = { en: HOME_EN, de: HOME_DE, bg: HOME_BG }

export function homeDict(locale: Locale): HomeDict {
  return DICTS[locale]
}

/**
 * What to call one thing in the shop.
 *
 * Falls back to the catalogue for every field, which is what makes English
 * free: `HOME_EN.items` is empty, so an English reader gets the catalogue's own
 * words, and a German reader gets the catalogue's words for anything not yet
 * translated. `home-words.test.ts` is what stops that fallback from quietly
 * becoming the normal case.
 */
export function homeItemWords(
  dict: HomeDict,
  item: { id: string; name: string; blurb?: string; use?: { label: string } },
): { name: string; blurb: string | undefined; use: string | undefined } {
  const words = dict.items[item.id]
  return {
    name: words?.name ?? item.name,
    blurb: words?.blurb ?? item.blurb,
    use: words?.use ?? item.use?.label,
  }
}
