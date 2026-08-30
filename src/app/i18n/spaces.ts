import type { Locale } from '@/domain/i18n/locale'

/**
 * The picker at `/tenants`: your spaces, your invitations, and the two ways to
 * get another one.
 *
 * This page is the hinge between the public site and the app - it is where
 * somebody lands after signing in, and where a guest who wandered in off a link
 * finds out what a space even is. Left in English it would have been the one
 * screen a German member sees between a German sign-in and a German rail.
 *
 * Formal in German and in Bulgarian, unlike the rail and the rooms. Being the
 * hinge is the reason: whoever is reading may have arrived thirty seconds ago
 * on somebody else's link and does not yet have a space, let alone a peep in
 * one. The switch to second person singular happens on the other side of it.
 *
 * The tier taglines this page prints are `billing`'s rather than this file's.
 * They were written out here once and that was one copy too many: the same
 * three sentences also appear on the billing card, and two dictionaries holding
 * one sentence is how a wording change lands on one page and not the other.
 *
 * The prices are read from `TIER_DETAILS` and never written in a dictionary at
 * all, for the reason the landing one gives at length: a price in a dictionary
 * is a price that gets changed in one language and not the other.
 */
export interface SpacesDict {
  title: string
  /** `{email}` is the account's own address. */
  signedInAs: string
  signOut: string

  invitations: string
  /** `{role}` is the role being offered. */
  asRole: string
  respond: string

  noSpaces: string
  archived: string

  grantForever: string
  /** `{when}` is `describeGrantEnd`'s answer. */
  grantRunning: string

  promoForever: string
  promoLead: string
  promoTail: string

  checkoutDone: string
  checkoutCancelled: string

  /** The create form, which also stands alone at the end of the tour. */
  create: {
    title: string
    body: string
    namePlaceholder: string
    nameLabel: string
    urlLabel: string
    submit: string
    creating: string
  }

  /** What a space costs, for somebody with no seat to spend. */
  plan: {
    waitingTitle: string
    costTitle: string
    /** `{n}` is how many spaces have no plan. */
    waitingOne: string
    waitingMany: string
    waitingTail: string
    costBody: string
    unlimited: string
    /** `{tier}` in brackets when the grant names one, `{when}` the date. */
    grantLine: string
    claim: string
    claiming: string
    claimNote: string
    /** `{when}` is the date the month runs to. */
    claimed: string
  }

  /** The two-step wizard a brand-new account lands in. */
  welcome: {
    step: string
    /** `{name}` is the handle the server suggested instead. */
    takeInstead: string
    nameTitle: string
    nameBody: string
    nameLabel: string
    nameRules: string
    saving: string
    continue: string
    /** `{name}` is the handle they just chose. */
    peepTitle: string
    peepBody: string
    /**
     * Split around the animal, which is not translated: it is an id the pack
     * ships, and the picker beside this sentence is labelled with it.
     */
    youAreLead: string
    youAreTail: string
    enter: string
    back: string
  }

  /**
   * The lobby chrome around the space rail: the one big button, the locker,
   * and the ways out. Everything else the lobby prints is reused from the
   * sections above — `join.*` labels the code field, `guest.back` labels the
   * ✕, `welcome.*` narrates the locker — so these four are only what no other
   * surface says.
   */
  lobby: {
    play: string
    /** The button under the peep that opens the picker. Names the action. */
    locker: string
    lockerTitle: string
    close: string
    /** Filters the list of other spaces. */
    search: string
    /** Summary label the collapsed create form hides behind. */
    newSpace: string
    /** The XP half of the locker. */
    skins: string
    shop: string
    shopClosed: string
    noSkins: string
  }

  /** Arriving on a six-character code somebody read out. */
  join: {
    title: string
    body: string
    label: string
    placeholder: string
    go: string
    looking: string
    /** The tab, which is not the heading: one names the page, the other opens it. */
    metaTitle: string
  }

  /** What a visitor on a guest link is shown instead of a list. */
  guest: {
    body: string
    belong: string
    open: string
    closed: string
    freeNote: string
    startFree: string
    pickPlan: string
    requestInvite: string
    back: string
  }
}

export const SPACES_EN: SpacesDict = {
  title: 'Spaces',
  signedInAs: 'Signed in as {email}',
  signOut: 'Sign out',

  invitations: 'Invitations',
  asRole: 'as {role}',
  respond: 'Respond',

  noSpaces: 'No spaces yet. Create one below — you will be its first owner.',
  archived: 'Archived',

  grantForever: 'On a plan · no end date',
  grantRunning: 'Free month · {when}',

  promoForever: 'Your plan is on us, with no end date. Create a space below.',
  promoLead: 'Your free month is running — until ',
  promoTail: '. Create a space below. No card needed, and nothing is charged when it ends.',

  checkoutDone: 'Subscription active. You can create a space below.',
  checkoutCancelled: 'Checkout was cancelled. Nothing was charged.',

  create: {
    title: 'New space',
    body: 'You become its owner, and it gets its own event log — a separate slice of the store that nobody outside can read.',
    namePlaceholder: 'Acme Inc',
    nameLabel: 'Space name',
    urlLabel: 'Space URL',
    submit: 'Create space',
    creating: 'Creating…',
  },

  plan: {
    waitingTitle: 'Give your spaces a plan',
    costTitle: 'What a space costs',
    waitingOne: 'One of your spaces has no plan yet, so it is read-only.',
    waitingMany: '{n} of your spaces have no plan yet, so they are read-only.',
    waitingTail:
      'Open a space and pick xo or xp on its billing page. Nothing you have made is lost in the meantime.',
    costBody:
      'Making a space is free. It stays read-only until you give it a plan, and you choose that plan inside the space. Being a member of someone else’s space is always free.',
    unlimited: 'Unlimited members either way, and no limit on how many paid spaces you run.',
    grantLine: 'Your free month{tier} runs until {when}.',
    claim: 'Start your free month of xo',
    claiming: 'Starting it…',
    claimNote: '30 days, no card, nothing charged when it ends. One per account.',
    claimed:
      'Your free month has started — it runs until {when}. Make a space and it is yours to write in.',
  },

  guest: {
    body: 'You are visiting on a guest link, so there is nothing to switch between yet.',
    belong: 'Spaces belong to accounts.',
    open: 'Get your own and it will be listed here.',
    closed: 'Sign-ups are invite-only right now.',
    freeNote:
      'An email and a password is the whole of it — your first space is free, for you and one other. Plans open up more rooms when you want them.',
    startFree: 'Start free — email and password',
    pickPlan: 'Or pick a plan',
    requestInvite: 'Request an invite',
    back: 'Back to the space',
  },

  lobby: {
    play: 'Play',
    locker: 'Change peep',
    lockerTitle: 'Your peep',
    close: 'Close',
    search: 'Search spaces…',
    newSpace: 'New space',
    skins: 'Your skin',
    shop: 'Shop →',
    shopClosed: 'See the shelf →',
    noSkins: 'No skins yet — the shop is where they live.',
  },

  welcome: {
    step: 'Step {n} of 2',
    takeInstead: 'Take {name} instead',
    nameTitle: 'What should we call you?',
    nameBody:
      'This is what everyone else sees — in the members list, on the tasks you create, and over your head in the Lounge. We guessed one from your email address; keep it or pick your own. Your email is never shown to anyone.',
    nameLabel: 'Username',
    nameRules:
      '2–32 characters: letters, numbers, hyphens and underscores. You can change it later in Settings.',
    saving: 'Saving…',
    continue: 'Continue',
    peepTitle: 'Pick your peep, {name}.',
    peepBody:
      'Who you are everywhere — every Lounge you belong to, the Café, and the house. Everyone starts as a penguin.',
    youAreLead: 'You are the ',
    youAreTail: '.',
    enter: 'Enter',
    back: 'Back',
  },

  join: {
    title: 'Join',
    body: 'Type the code somebody gave you. Six characters, and it does not matter whether you use capitals.',
    label: 'Your code',
    placeholder: 'ABC234',
    go: 'Go',
    looking: 'Looking…',
    metaTitle: 'Join with a code',
  },
}

export const SPACES_DE: SpacesDict = {
  title: 'Spaces',
  signedInAs: 'Angemeldet als {email}',
  signOut: 'Abmelden',

  invitations: 'Einladungen',
  asRole: 'als {role}',
  respond: 'Antworten',

  noSpaces: 'Noch keine Spaces. Legen Sie unten einen an — Sie sind dann der erste Inhaber.',
  archived: 'Archiviert',

  grantForever: 'Im Tarif · ohne Enddatum',
  grantRunning: 'Gratismonat · {when}',

  promoForever: 'Ihr Tarif geht auf uns, ohne Enddatum. Legen Sie unten einen Space an.',
  promoLead: 'Ihr Gratismonat läuft — bis ',
  promoTail:
    '. Legen Sie unten einen Space an. Keine Karte nötig, und am Ende wird nichts abgebucht.',

  checkoutDone: 'Abo aktiv. Sie können unten einen Space anlegen.',
  checkoutCancelled: 'Der Bezahlvorgang wurde abgebrochen. Es wurde nichts abgebucht.',

  create: {
    title: 'Neuer Space',
    body: 'Sie werden sein Inhaber, und er bekommt sein eigenes Ereignisprotokoll — einen eigenen Teil des Speichers, den von außen niemand lesen kann.',
    namePlaceholder: 'Acme GmbH',
    nameLabel: 'Name des Space',
    urlLabel: 'Adresse des Space',
    submit: 'Space anlegen',
    creating: 'Wird angelegt …',
  },

  plan: {
    waitingTitle: 'Geben Sie Ihren Spaces einen Tarif',
    costTitle: 'Was ein Space kostet',
    waitingOne: 'Einer Ihrer Spaces hat noch keinen Tarif und ist deshalb nur lesbar.',
    waitingMany: '{n} Ihrer Spaces haben noch keinen Tarif und sind deshalb nur lesbar.',
    waitingTail:
      'Öffnen Sie einen Space und wählen Sie auf seiner Abrechnungsseite xo oder xp. In der Zwischenzeit geht nichts verloren, was Sie gemacht haben.',
    costBody:
      'Einen Space anzulegen ist kostenlos. Er bleibt nur lesbar, bis Sie ihm einen Tarif geben, und den wählen Sie im Space selbst. Mitglied im Space von jemand anderem zu sein, ist immer kostenlos.',
    unlimited:
      'Unbegrenzt Mitglieder in beiden Tarifen, und keine Grenze, wie viele bezahlte Spaces Sie führen.',
    grantLine: 'Ihr Gratismonat{tier} läuft bis {when}.',
    claim: 'Gratismonat von xo starten',
    claiming: 'Wird gestartet …',
    claimNote:
      '30 Tage, keine Karte, am Ende wird nichts abgebucht. Einer pro Konto.',
    claimed:
      'Ihr Gratismonat hat begonnen — er läuft bis {when}. Legen Sie einen Space an, dann gehört er Ihnen zum Schreiben.',
  },

  guest: {
    body: 'Sie sind über einen Gastlink zu Besuch, es gibt also noch nichts zum Wechseln.',
    belong: 'Spaces gehören zu Konten.',
    open: 'Holen Sie sich einen eigenen, dann steht er hier.',
    closed: 'Anmeldungen sind derzeit nur auf Einladung.',
    freeNote:
      'Eine E-Mail-Adresse und ein Passwort, mehr ist es nicht — Ihr erster Space ist kostenlos, für Sie und eine weitere Person. Tarife öffnen mehr Räume, wenn Sie sie brauchen.',
    startFree: 'Kostenlos starten — E-Mail und Passwort',
    pickPlan: 'Oder einen Tarif wählen',
    requestInvite: 'Einladung anfragen',
    back: 'Zurück in den Space',
  },

  lobby: {
    play: 'Spielen',
    locker: 'Peep wechseln',
    lockerTitle: 'Ihr Peep',
    close: 'Schließen',
    search: 'Spaces durchsuchen …',
    newSpace: 'Neuer Space',
    skins: 'Ihr Skin',
    shop: 'Shop →',
    shopClosed: 'Zum Regal →',
    noSkins: 'Noch keine Skins — im Shop wohnen sie.',
  },

  welcome: {
    step: 'Schritt {n} von 2',
    takeInstead: 'Stattdessen {name} nehmen',
    nameTitle: 'Wie sollen wir Sie nennen?',
    nameBody:
      'Das sehen alle anderen — in der Mitgliederliste, an den Aufgaben, die Sie anlegen, und über Ihrem Kopf in der Lounge. Wir haben einen Namen aus Ihrer E-Mail-Adresse geraten; behalten Sie ihn oder wählen Sie einen eigenen. Ihre E-Mail-Adresse wird niemandem gezeigt.',
    nameLabel: 'Benutzername',
    nameRules:
      '2–32 Zeichen: Buchstaben, Ziffern, Bindestriche und Unterstriche. Sie können ihn später in den Einstellungen ändern.',
    saving: 'Wird gespeichert …',
    continue: 'Weiter',
    peepTitle: 'Wählen Sie Ihren Peep, {name}.',
    peepBody:
      'Wer Sie überall sind — in jeder Lounge, zu der Sie gehören, im Café und im Haus. Alle fangen als Pinguin an.',
    youAreLead: 'Sie sind ',
    youAreTail: '.',
    enter: 'Hinein',
    back: 'Zurück',
  },

  join: {
    title: 'Beitreten',
    body: 'Tippen Sie den Code ein, den Ihnen jemand gegeben hat. Sechs Zeichen, und Groß- oder Kleinschreibung ist egal.',
    label: 'Ihr Code',
    placeholder: 'ABC234',
    go: 'Los',
    looking: 'Wird gesucht …',
    metaTitle: 'Mit einem Code beitreten',
  },
}

export const SPACES_BG: SpacesDict = {
  title: 'Спейсове',
  signedInAs: 'Влезли сте като {email}',
  signOut: 'Изход',

  invitations: 'Покани',
  asRole: 'като {role}',
  respond: 'Отговорете',

  noSpaces: 'Още няма спейсове. Създайте един по-долу — ще сте неговият първи собственик.',
  archived: 'Архивиран',

  grantForever: 'В план · без крайна дата',
  grantRunning: 'Безплатен месец · {when}',

  promoForever: 'Планът ви е от нас, без крайна дата. Създайте спейс по-долу.',
  promoLead: 'Безплатният ви месец тече — до ',
  promoTail: '. Създайте спейс по-долу. Не е нужна карта, и в края нищо не се таксува.',

  checkoutDone: 'Абонаментът е активен. Може да създадете спейс по-долу.',
  checkoutCancelled: 'Плащането беше прекратено. Нищо не беше таксувано.',

  create: {
    title: 'Нов спейс',
    body: 'Ставате негов собственик, а той получава свой дневник със събития — отделен дял от хранилището, който отвън никой не може да чете.',
    namePlaceholder: 'Акме ООД',
    nameLabel: 'Име на спейса',
    urlLabel: 'Адрес на спейса',
    submit: 'Създай спейс',
    creating: 'Създава се…',
  },

  plan: {
    waitingTitle: 'Дайте план на спейсовете си',
    costTitle: 'Колко струва един спейс',
    waitingOne: 'Един от спейсовете ви още няма план и затова е само за четене.',
    waitingMany: '{n} от спейсовете ви още нямат план и затова са само за четене.',
    waitingTail:
      'Отворете спейс и изберете xo или xp на страницата му за плащания. Дотогава нищо направено не се губи.',
    costBody:
      'Създаването на спейс е безплатно. Той остава само за четене, докато не му дадете план, а планът се избира в самия спейс. Да сте член в чужд спейс винаги е безплатно.',
    unlimited:
      'Неограничен брой членове и в двата плана, и без ограничение колко платени спейса водите.',
    grantLine: 'Безплатният ви месец{tier} тече до {when}.',
    claim: 'Започнете безплатния си месец xo',
    claiming: 'Започва…',
    claimNote: '30 дни, без карта, в края нищо не се таксува. По един на акаунт.',
    claimed:
      'Безплатният ви месец започна — тече до {when}. Създайте спейс и е ваш, за да пишете в него.',
  },

  guest: {
    body: 'На гости сте през гост-линк, така че още няма между какво да превключвате.',
    belong: 'Спейсовете принадлежат на акаунти.',
    open: 'Вземете си свой и той ще стои тук.',
    closed: 'Регистрациите в момента са само с покана.',
    freeNote:
      'Имейл и парола, това е всичко — първият ви спейс е безплатен, за вас и още един човек. Плановете отварят повече стаи, когато ви потрябват.',
    startFree: 'Започнете безплатно — имейл и парола',
    pickPlan: 'Или изберете план',
    requestInvite: 'Поискайте покана',
    back: 'Обратно в спейса',
  },

  lobby: {
    play: 'Играй',
    locker: 'Смяна на пийпа',
    lockerTitle: 'Вашият пийп',
    close: 'Затвори',
    search: 'Търсене на спейсове…',
    newSpace: 'Нов спейс',
    skins: 'Вашият скин',
    shop: 'Магазин →',
    shopClosed: 'Към рафта →',
    noSkins: 'Още няма скинове — живеят в магазина.',
  },

  welcome: {
    step: 'Стъпка {n} от 2',
    takeInstead: 'Вземете {name} вместо това',
    nameTitle: 'Как да ви наричаме?',
    nameBody:
      'Това виждат всички останали — в списъка с членове, върху задачите, които създавате, и над главата ви в лоунджа. Отгатнахме едно име от имейла ви; задръжте го или изберете свое. Имейлът ви не се показва на никого.',
    nameLabel: 'Потребителско име',
    nameRules:
      '2–32 знака: букви, цифри, тирета и долни черти. Може да го смените по-късно в Настройки.',
    saving: 'Запазва се…',
    continue: 'Напред',
    peepTitle: 'Изберете своя пийп, {name}.',
    peepBody:
      'Кой сте навсякъде — във всеки лоундж, към който принадлежите, в кафенето и в къщата. Всички започват като пингвин.',
    youAreLead: 'Вие сте ',
    youAreTail: '.',
    enter: 'Влизане',
    back: 'Назад',
  },

  join: {
    title: 'Присъединяване',
    body: 'Въведете кода, който някой ви е дал. Шест знака, и няма значение дали пишете с главни букви.',
    label: 'Вашият код',
    placeholder: 'ABC234',
    go: 'Давай',
    looking: 'Търси се…',
    metaTitle: 'Присъединяване с код',
  },
}

const DICTS: Record<Locale, SpacesDict> = {
  en: SPACES_EN,
  de: SPACES_DE,
  bg: SPACES_BG,
}

export function spacesDict(locale: Locale): SpacesDict {
  return DICTS[locale]
}
