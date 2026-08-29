import type { Locale } from '@/domain/i18n/locale'
import type { ItemWords } from '@/app/i18n/home'
import type { Interaction } from '@kxb/dream-restaurant/game'
import { ITEMS } from '@kxb/dream-restaurant/recipes'

/**
 * The café: the service HUD, the build sheet, the shop and the menu.
 *
 * Same shape as the house's dictionary, and for the same reason - see the note
 * at the top of `@/app/i18n/home`. English is read off `PROPS` and `ITEMS` in
 * `src/domain/cafe`, because a prop's name lives in the same object as its
 * price and its model; the translations are written here against the same ids,
 * and `cafe-words.test.ts` fails when the lists disagree.
 *
 * The dishes are in here twice over, in a sense: `items` covers everything that
 * can exist as a loose object in the room - a bun, a burnt patty, a dirty plate
 * - and the menu, the order bubbles and the chef's hands all draw from that one
 * list. There is no second table of "dishes", because a dish is only an item
 * somebody happens to want.
 */
export interface CafeDict {
  coins: string
  served: string
  walkedOut: string
  covers: string
  ambience: string
  fromHome: string
  tips: string
  noCovers: string

  open: string
  closed: string
  takingCustomers: string
  noNewCustomers: string
  onTheMenu: string
  nothingCanBeMade: string
  waiting: string

  mouseHint: string
  build: string
  done: string
  yourCafe: string
  settingUp: string

  controls: {
    move: string
    dragToLook: string
    use: string
    cookAndServe: string
    rearrange: string
    place: string
    putItDown: string
    turn: string
    rotate: string
    sell: string
    sellItBack: string
    stopBuilding: string
    run: string
    arrows: string
    look: string
    useWhatYouFace: string
    openOrClose: string
    mouseLook: string
    freeMouse: string
    wheel: string
    changeItem: string
    buyFloor: string
  }

  groups: { kitchen: string; dining: string; decor: string }

  panel: {
    /** `{name}` is what you are holding. */
    carrying: string
    lookAtSquare: string
    /** `{n}` squares of floor, `{cost}` what the strip costs. */
    extends: string
    squares: string
    notEnoughCoins: string
    /** `{name}` is what is standing there. */
    somethingHere: string
    /** `{name}` is what would be placed. */
    emptySquare: string
    something: string
    outOfReach: string
    cancelMove: string
    move: string
    /** `{n}` is the refund. */
    sellFor: string
    sell: string
    /** `{n}` squares for `{cost}`. */
    layStrip: string
    layFloor: string
  }

  /**
   * What pressing E would do, said out loud.
   *
   * The rules answer with the act - see `Interaction` - and these are the
   * sentences. `{item}` is always a name out of `items` below, so a German
   * reader is told to take a Brötchen rather than a bun.
   */
  prompts: {
    serve: string
    take: string
    takeIngredient: string
    binWaste: string
    bin: string
    brew: string
    pull: string
    making: string
    putCakeIn: string
    /** `{n}` is how many slices are left. */
    takeSlice: string
    washUp: string
    clearPlate: string
    putDown: string
    pickUp: string
    cooking: string
    /** The one prompt the room itself offers rather than a station. */
    headToGarden: string
  }

  /** The shop, translated. English is read off `PROPS`. */
  props: Record<string, ItemWords>
  /** Everything that can be held, cooked or served, translated. */
  items: Record<string, string>
}

export const CAFE_EN: CafeDict = {
  coins: 'coins',
  served: 'served',
  walkedOut: 'walked out',
  covers: 'covers',
  ambience: 'ambience',
  fromHome: 'from home',
  tips: 'tips',
  noCovers:
    'No covers. A chair only seats somebody if it is next to a table — build one of each, side by side.',

  open: 'Open',
  closed: 'Closed',
  takingCustomers: 'taking customers',
  noNewCustomers: 'no new customers',
  onTheMenu: 'On the menu',
  nothingCanBeMade:
    'Nothing can be made. Check you still have the crates and the equipment for a dish.',
  waiting: 'Waiting',

  mouseHint: 'Click the room to capture the mouse, or turn with the arrow keys.',
  build: 'Build',
  done: 'Done',
  yourCafe: 'Your café',
  settingUp: 'Setting up the room…',

  controls: {
    move: 'Move',
    dragToLook: 'Drag to look',
    use: 'Use',
    cookAndServe: 'Cook and serve',
    rearrange: 'Rearrange',
    place: 'Place',
    putItDown: 'Put it down',
    turn: 'Turn',
    rotate: 'Rotate',
    sell: 'Sell',
    sellItBack: 'Sell it back',
    stopBuilding: 'Stop building',
    run: 'Run',
    arrows: 'Arrows',
    look: 'Look',
    useWhatYouFace: 'Use what you face',
    openOrClose: 'Open or close',
    mouseLook: 'Mouse look on / off',
    freeMouse: 'Free the mouse',
    wheel: 'Wheel',
    changeItem: 'Change item',
    buyFloor: 'Buy floor',
  },

  groups: { kitchen: 'Kitchen', dining: 'Dining', decor: 'Decor' },

  panel: {
    carrying:
      'Carrying {name} — click a free square to put it down, R to turn it, right-click to cancel.',
    lookAtSquare: 'Look at a square.',
    extends: 'Extends the room by {n} for {cost}',
    squares: '{n} squares',
    notEnoughCoins: ' — not enough coins.',
    somethingHere: '{name} is here.',
    emptySquare: 'Empty square — click to place {name}.',
    something: 'something',
    outOfReach: 'Out of reach. Floor can only be laid next to floor.',
    cancelMove: 'Cancel move',
    move: 'Move',
    sellFor: 'Sell for {n}',
    sell: 'Sell',
    layStrip: 'Lay {n} · {cost}',
    layFloor: 'Lay floor',
  },

  // Empty on purpose: English is the catalogue's own. See the note at the top.
  props: {},
  items: {},

  prompts: {
    serve: 'Serve {item}',
    take: 'Take {item}',
    takeIngredient: 'Take ingredient',
    binWaste: 'Get rid of it',
    bin: 'Bin it',
    brew: 'Brew a coffee',
    pull: 'Pull a cone',
    making: 'Making…',
    putCakeIn: 'Put the cake in the case',
    takeSlice: 'Take a slice ({n})',
    washUp: 'Wash up',
    clearPlate: 'Clear the plate',
    putDown: 'Put down {item}',
    pickUp: 'Pick up',
    cooking: 'Cooking…',
    headToGarden: 'Head out to the garden',
  },
}

export const CAFE_DE: CafeDict = {
  coins: 'Münzen',
  served: 'bedient',
  walkedOut: 'gegangen',
  covers: 'Plätze',
  ambience: 'Ambiente',
  fromHome: 'von zu Hause',
  tips: 'Trinkgeld',
  noCovers:
    'Keine Plätze. Ein Stuhl setzt nur jemanden, wenn er neben einem Tisch steht — bauen Sie beides nebeneinander.',

  open: 'Offen',
  closed: 'Geschlossen',
  takingCustomers: 'nimmt Gäste an',
  noNewCustomers: 'keine neuen Gäste',
  onTheMenu: 'Auf der Karte',
  nothingCanBeMade:
    'Es lässt sich nichts machen. Prüfen Sie, ob Sie noch die Kisten und die Geräte für ein Gericht haben.',
  waiting: 'Wartet',

  mouseHint:
    'Klicken Sie in den Raum, um die Maus zu fangen, oder drehen Sie mit den Pfeiltasten.',
  build: 'Bauen',
  done: 'Fertig',
  yourCafe: 'Ihr Café',
  settingUp: 'Der Raum wird hergerichtet …',

  controls: {
    move: 'Bewegen',
    dragToLook: 'Ziehen zum Umsehen',
    use: 'Benutzen',
    cookAndServe: 'Kochen und servieren',
    rearrange: 'Umstellen',
    place: 'Setzen',
    putItDown: 'Hinstellen',
    turn: 'Drehen',
    rotate: 'Drehen',
    sell: 'Verkaufen',
    sellItBack: 'Zurückverkaufen',
    stopBuilding: 'Bauen beenden',
    run: 'Rennen',
    arrows: 'Pfeile',
    look: 'Umsehen',
    useWhatYouFace: 'Benutzen, was vor Ihnen ist',
    openOrClose: 'Auf- oder zumachen',
    mouseLook: 'Mausblick an / aus',
    freeMouse: 'Maus freigeben',
    wheel: 'Rad',
    changeItem: 'Ding wechseln',
    buyFloor: 'Boden kaufen',
  },

  groups: { kitchen: 'Küche', dining: 'Gastraum', decor: 'Deko' },

  panel: {
    carrying:
      'Sie tragen {name} — klicken Sie auf ein freies Feld, um es abzustellen, R zum Drehen, Rechtsklick zum Abbrechen.',
    lookAtSquare: 'Schauen Sie auf ein Feld.',
    extends: 'Erweitert den Raum um {n} für {cost}',
    squares: '{n} Felder',
    notEnoughCoins: ' — nicht genug Münzen.',
    somethingHere: 'Hier steht {name}.',
    emptySquare: 'Freies Feld — klicken, um {name} hinzustellen.',
    something: 'etwas',
    outOfReach: 'Zu weit weg. Boden kann nur neben Boden gelegt werden.',
    cancelMove: 'Umstellen abbrechen',
    move: 'Umstellen',
    sellFor: 'Für {n} verkaufen',
    sell: 'Verkaufen',
    layStrip: '{n} legen · {cost}',
    layFloor: 'Boden legen',
  },

  props: {
    counter: {
      name: 'Arbeitstresen',
      blurb: 'Setzt einen Burger, eine rohe Pizza oder Kuchenteig zusammen.',
    },
    board: {
      name: 'Schneidebrett',
      blurb: 'Schneidet Tomate und Peperoni, reibt Käse, rollt Teig.',
    },
    stove: {
      name: 'Herd',
      blurb: 'Brät Patties. Eines zu lange draufgelassen, und es verbrennt.',
    },
    oven: {
      name: 'Ofen',
      blurb: 'Backt eine rohe Pizza oder einen Kuchen. Erst auf einem Tresen zusammensetzen.',
    },
    coffee: {
      name: 'Kaffeemaschine',
      blurb: 'Einmal drücken, warten, Kaffee nehmen. Keine Zutaten, schnelles Geld.',
    },
    display: {
      name: 'Vitrine',
      blurb: 'Einen ganzen Kuchen hineinstellen. Stücke wieder herausnehmen, eines pro Gast.',
    },
    icecream: {
      name: 'Eismaschine',
      blurb: 'Zieht auf Zuruf eine Waffel. Keine Vorbereitung, kleine Marge.',
    },
    sink: { name: 'Spüle', blurb: 'Wäscht die schmutzigen Teller, die Gäste stehen lassen.' },
    bin: {
      name: 'Abfalleimer',
      blurb: 'Schluckt alles. Das einzige Mittel gegen ein verbranntes Patty.',
    },
    crate_buns: { name: 'Brötchenkiste' },
    crate_steak: { name: 'Pattykiste' },
    crate_tomatoes: { name: 'Tomatenkiste' },
    crate_cheese: { name: 'Käsekiste' },
    crate_dough: { name: 'Teigkiste' },
    crate_pepperoni: { name: 'Peperonikiste' },
    crate_flour: { name: 'Mehlsäcke' },
    crate_eggs: { name: 'Eierkiste' },
    table: { name: 'Tisch', blurb: 'Hier essen die Gäste. Braucht einen Stuhl daneben.' },
    table_round: { name: 'Runder Tisch', blurb: 'Dieselbe Aufgabe, schönerer Raum.' },
    chair: { name: 'Stuhl', blurb: 'Ein Sitzplatz. Zählt nur, wenn er einen Tisch berührt.' },
    chair_b: { name: 'Polsterstuhl' },
    stool: { name: 'Hocker' },
    pillar: { name: 'Säule' },
    menu: { name: 'Kartenständer', blurb: 'Steht auf einem Tisch oder neben der Tür.' },
    jars: { name: 'Dosenregal', blurb: 'Steht auf einem Tresen oder auf dem Boden.' },
    dishrack: { name: 'Abtropfgitter', blurb: 'Steht auf einem Tresen oder auf dem Boden.' },
    pizzaboxes: { name: 'Pizzakartons', blurb: 'Stehen auf einem Tresen oder auf dem Boden.' },
    pastry_stand: { name: 'Gebäckständer', blurb: 'Steht auf der Vitrine oder auf einem Tisch.' },
    register: {
      name: 'Registrierkasse',
      blurb: 'Steht auf dem Tresen neben der Tür. Deko, keine Kasse.',
    },
    plant: { name: 'Topfpflanze', blurb: 'Macht eine Ecke weicher.' },
    towel: { name: 'Handtuchhalter' },
    cabinet: { name: 'Wandregal', blurb: 'Hängt hoch an der Wand. Stellen Sie es an eine.' },
    hood: { name: 'Dunstabzugshaube', blurb: 'Hängt hoch. Sieht über einem Herd richtig aus.' },
    condiments: {
      name: 'Gewürze',
      blurb: 'Stehen auf einem Tisch, wo die Gäste sie erreichen.',
    },
  },

  items: {
    bun: 'Brötchen',
    patty_raw: 'Rohes Patty',
    tomato: 'Tomate',
    cheese: 'Käse',
    dough: 'Teig',
    pepperoni: 'Peperoni',
    flour: 'Mehl',
    egg: 'Ei',
    patty_cooked: 'Gebratenes Patty',
    patty_burnt: 'Verbranntes Patty',
    tomato_slices: 'Tomatenscheiben',
    cheese_grated: 'Geriebener Käse',
    dough_base: 'Pizzaboden',
    pepperoni_slices: 'Peperoniescheiben',
    pizza_cheese_raw: 'Ungebackene Käsepizza',
    pizza_pepperoni_raw: 'Ungebackene Peperonipizza',
    cake_raw: 'Kuchenteig',
    burger: 'Burger',
    pizza_cheese: 'Käsepizza',
    pizza_pepperoni: 'Peperonipizza',
    icecream: 'Eis',
    coffee: 'Kaffee',
    cake: 'Kuchen',
    cake_slice: 'Stück Kuchen',
    plate_dirty: 'Schmutziger Teller',
  },

  prompts: {
    serve: '{item} servieren',
    take: '{item} nehmen',
    takeIngredient: 'Zutat nehmen',
    binWaste: 'Weg damit',
    bin: 'In den Müll',
    brew: 'Kaffee aufbrühen',
    pull: 'Eine Waffel ziehen',
    making: 'Wird gemacht …',
    putCakeIn: 'Den Kuchen in die Vitrine stellen',
    takeSlice: 'Ein Stück nehmen ({n})',
    washUp: 'Abwaschen',
    clearPlate: 'Den Teller abräumen',
    putDown: '{item} hinstellen',
    pickUp: 'Aufnehmen',
    cooking: 'Wird gekocht …',
    headToGarden: 'Hinaus in den Garten',
  },
}

export const CAFE_BG: CafeDict = {
  coins: 'монети',
  served: 'обслужени',
  walkedOut: 'излезли',
  covers: 'места',
  ambience: 'атмосфера',
  fromHome: 'от къщи',
  tips: 'бакшиш',
  noCovers:
    'Няма места. Столът настанява някого само ако е до маса — постройте по едно от двете, едно до друго.',

  open: 'Отворено',
  closed: 'Затворено',
  takingCustomers: 'приема гости',
  noNewCustomers: 'без нови гости',
  onTheMenu: 'В менюто',
  nothingCanBeMade:
    'Не може да се направи нищо. Проверете дали още имате касетките и уредите за някое ястие.',
  waiting: 'Чака',

  mouseHint: 'Щракнете в стаята, за да хванете мишката, или се завъртете със стрелките.',
  build: 'Строеж',
  done: 'Готово',
  yourCafe: 'Вашето кафене',
  settingUp: 'Стаята се подрежда…',

  controls: {
    move: 'Движение',
    dragToLook: 'Влачене за оглеждане',
    use: 'Използване',
    cookAndServe: 'Готвене и сервиране',
    rearrange: 'Пренареждане',
    place: 'Поставяне',
    putItDown: 'Оставете го',
    turn: 'Завъртане',
    rotate: 'Завъртане',
    sell: 'Продаване',
    sellItBack: 'Продайте го обратно',
    stopBuilding: 'Спри строежа',
    run: 'Бягане',
    arrows: 'Стрелки',
    look: 'Оглеждане',
    useWhatYouFace: 'Използвайте това пред вас',
    openOrClose: 'Отваряне или затваряне',
    mouseLook: 'Поглед с мишката вкл. / изкл.',
    freeMouse: 'Освободи мишката',
    wheel: 'Колелце',
    changeItem: 'Смяна на нещото',
    buyFloor: 'Купи под',
  },

  groups: { kitchen: 'Кухня', dining: 'Салон', decor: 'Декор' },

  panel: {
    carrying:
      'Носите {name} — щракнете на свободно квадратче, за да го оставите, R за завъртане, десен бутон за отказ.',
    lookAtSquare: 'Погледнете към квадратче.',
    extends: 'Разширява стаята с {n} за {cost}',
    squares: '{n} квадратчета',
    notEnoughCoins: ' — няма достатъчно монети.',
    somethingHere: 'Тук е {name}.',
    emptySquare: 'Свободно квадратче — щракнете, за да сложите {name}.',
    something: 'нещо',
    outOfReach: 'Твърде далече. Под се полага само до друг под.',
    cancelMove: 'Откажи преместването',
    move: 'Преместване',
    sellFor: 'Продай за {n}',
    sell: 'Продай',
    layStrip: 'Положи {n} · {cost}',
    layFloor: 'Положи под',
  },

  props: {
    counter: {
      name: 'Работен плот',
      blurb: 'Сглобява бургер, сурова пица или тесто за кекс.',
    },
    board: {
      name: 'Дъска за рязане',
      blurb: 'Реже домат и пеперони, настъргва сирене, точи тесто.',
    },
    stove: {
      name: 'Печка',
      blurb: 'Пържи кюфтета. Оставите ли едно твърде дълго, изгаря.',
    },
    oven: {
      name: 'Фурна',
      blurb: 'Пече сурова пица или кекс. Първо ги сглобете на плота.',
    },
    coffee: {
      name: 'Кафемашина',
      blurb: 'Натиснете, изчакайте, вземете кафето. Без съставки, бързи пари.',
    },
    display: {
      name: 'Витрина',
      blurb: 'Сложете вътре цял кекс. Вадете парчета, по едно на гост.',
    },
    icecream: {
      name: 'Машина за сладолед',
      blurb: 'Прави фунийка на поискване. Без подготовка, малка печалба.',
    },
    sink: { name: 'Мивка', blurb: 'Мие мръсните чинии, които гостите оставят.' },
    bin: {
      name: 'Кош за боклук',
      blurb: 'Поглъща всичко. Единственият лек за изгоряло кюфте.',
    },
    crate_buns: { name: 'Касетка с хлебчета' },
    crate_steak: { name: 'Касетка с кюфтета' },
    crate_tomatoes: { name: 'Касетка с домати' },
    crate_cheese: { name: 'Касетка със сирене' },
    crate_dough: { name: 'Касетка с тесто' },
    crate_pepperoni: { name: 'Касетка с пеперони' },
    crate_flour: { name: 'Чували с брашно' },
    crate_eggs: { name: 'Касетка с яйца' },
    table: { name: 'Маса', blurb: 'Тук се хранят гостите. Трябва ѝ стол до нея.' },
    table_round: { name: 'Кръгла маса', blurb: 'Същата работа, по-хубава стая.' },
    chair: { name: 'Стол', blurb: 'Едно място. Брои се само ако допира маса.' },
    chair_b: { name: 'Тапициран стол' },
    stool: { name: 'Табуретка' },
    pillar: { name: 'Колона' },
    menu: { name: 'Стойка за меню', blurb: 'Стои на маса или до вратата.' },
    jars: { name: 'Рафт с буркани', blurb: 'Стои на плот или на пода.' },
    dishrack: { name: 'Сушилник за чинии', blurb: 'Стои на плот или на пода.' },
    pizzaboxes: { name: 'Кутии за пица', blurb: 'Стоят на плот или на пода.' },
    pastry_stand: { name: 'Стойка за сладки', blurb: 'Стои на витрината или на маса.' },
    register: {
      name: 'Касов апарат',
      blurb: 'Стои на плота до вратата. Украса, не каса.',
    },
    plant: { name: 'Саксия', blurb: 'Смекчава ъгъла.' },
    towel: { name: 'Закачалка за кърпи' },
    cabinet: { name: 'Стенен рафт', blurb: 'Виси високо на стена. Сложете го до стена.' },
    hood: { name: 'Аспиратор', blurb: 'Виси високо. Изглежда правилно над печка.' },
    condiments: {
      name: 'Подправки',
      blurb: 'Стоят на маса, където гостите ги достигат.',
    },
  },

  items: {
    bun: 'Хлебче',
    patty_raw: 'Сурово кюфте',
    tomato: 'Домат',
    cheese: 'Сирене',
    dough: 'Тесто',
    pepperoni: 'Пеперони',
    flour: 'Брашно',
    egg: 'Яйце',
    patty_cooked: 'Опържено кюфте',
    patty_burnt: 'Изгоряло кюфте',
    tomato_slices: 'Резени домат',
    cheese_grated: 'Настъргано сирене',
    dough_base: 'Основа за пица',
    pepperoni_slices: 'Резени пеперони',
    pizza_cheese_raw: 'Неопечена пица със сирене',
    pizza_pepperoni_raw: 'Неопечена пица с пеперони',
    cake_raw: 'Тесто за кекс',
    burger: 'Бургер',
    pizza_cheese: 'Пица със сирене',
    pizza_pepperoni: 'Пица с пеперони',
    icecream: 'Сладолед',
    coffee: 'Кафе',
    cake: 'Кекс',
    cake_slice: 'Парче кекс',
    plate_dirty: 'Мръсна чиния',
  },

  prompts: {
    serve: 'Сервирай {item}',
    take: 'Вземи {item}',
    takeIngredient: 'Вземи съставка',
    binWaste: 'Изхвърли го',
    bin: 'В кофата',
    brew: 'Направи кафе',
    pull: 'Направи фунийка',
    making: 'Прави се…',
    putCakeIn: 'Сложи кекса във витрината',
    takeSlice: 'Вземи парче ({n})',
    washUp: 'Измий',
    clearPlate: 'Вдигни чинията',
    putDown: 'Остави {item}',
    pickUp: 'Вземи',
    cooking: 'Готви се…',
    headToGarden: 'Излез в градината',
  },
}

const DICTS: Record<Locale, CafeDict> = { en: CAFE_EN, de: CAFE_DE, bg: CAFE_BG }

export function cafeDict(locale: Locale): CafeDict {
  return DICTS[locale]
}

/** What to call one thing in the shop. Falls back to the catalogue - see `home`. */
export function cafePropWords(
  dict: CafeDict,
  prop: { id: string; name: string; blurb?: string },
): { name: string; blurb: string | undefined } {
  const words = dict.props[prop.id]
  return { name: words?.name ?? prop.name, blurb: words?.blurb ?? prop.blurb }
}

/** What to call one thing that can be held, cooked or served. */
export function cafeItemName(
  dict: CafeDict,
  item: { id: string; name: string } | undefined,
): string {
  if (!item) return ''
  return dict.items[item.id] ?? item.name
}

/**
 * The sentence for one act, in the reader's language.
 *
 * The other half of `describeInteraction`, which answers with the act rather
 * than with words - see the note there. Kept beside the dictionary rather than
 * in the scene, because it is where the item names are, and because the switch
 * has to stay exhaustive: a new station that the rules can offer and the HUD
 * cannot word is a square that silently stops prompting.
 */
export function interactionWords(dict: CafeDict, act: Interaction): string {
  const named = (id: string) => cafeItemName(dict, ITEMS[id])
  const t = dict.prompts

  switch (act.kind) {
    case 'serve':
      return t.serve.replace('{item}', named(act.item))
    case 'take':
      return act.item ? t.take.replace('{item}', named(act.item)) : t.takeIngredient
    case 'binWaste':
      return t.binWaste
    case 'bin':
      return t.bin
    case 'brew':
      return t.brew
    case 'pull':
      return t.pull
    case 'takeMade':
      return t.take.replace('{item}', named(act.item))
    case 'making':
      return t.making
    case 'putCakeIn':
      return t.putCakeIn
    case 'takeSlice':
      return t.takeSlice.replace('{n}', String(act.left))
    case 'washUp':
      return t.washUp
    case 'clearPlate':
      return t.clearPlate
    case 'putDown':
      return t.putDown.replace('{item}', named(act.item))
    case 'pickUp':
      return t.pickUp
    case 'cooking':
      return t.cooking
  }
}
