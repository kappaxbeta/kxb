import type { Tier } from '@/domain/billing/tiers'
import type { Locale } from '@/domain/i18n/locale'

/**
 * Money: what a space is on, what an account has, and what has been charged.
 *
 * ---------------------------------------------------------------------------
 * The one thing that is never in here
 * ---------------------------------------------------------------------------
 * A price. Every number on these pages comes from `TIER_DETAILS` by way of
 * `tierPricePerMonth`, and the landing dictionary made the argument first: a
 * price written in a dictionary is a price that gets changed in one language
 * and not the other, and that bug is found by a customer rather than a test.
 *
 * What *is* in here is the tier copy - a tagline and a list of what each plan
 * includes - because those are sentences rather than figures. They live beside
 * the numbers in `TIER_DETAILS` in English, and `tiers.test.ts` fails if the
 * two lists ever stop lining up.
 *
 * A bank's refusal (`lastFailureReason`), an invoice number and a Stripe status
 * word are not translated either. Those come off Stripe and are what somebody
 * would quote when they ring their bank.
 */
export interface BillingDict {
  /**
   * The promo box, which is mounted here and on the way in.
   *
   * `{until}` is a date, already formatted for the reader. The code itself is
   * never translated - it is typed in, in capitals, and `CAFE24` is `CAFE24`
   * in every language.
   */
  redeem: {
    gotACode: string
    heading: string
    placeholder: string
    checking: string
    redeem: string
    note: string
    acceptedLead: string
    acceptedTail: string
  }

  title: string
  goToDashboard: string

  tabs: { status: string; history: string }
  /** `{n}` payments on file. */
  historyCount: string

  checkoutDone: string
  checkoutCancelled: string
  somethingWrong: string

  /** The six states a space's subscription can be in. */
  status: Record<
    'none' | 'pending' | 'active' | 'past_due' | 'suspended' | 'canceled',
    { label: string; detail: string }
  >

  bankSaid: string
  /** `{date}` is the end of the paid period. */
  paidThrough: string
  ownerOnly: string
  stripeNote: string

  /** Picking, changing and stopping a plan. */
  plan: {
    comingSoon: string
    openingStripe: string
    /** `{tier}` is the plan being bought. */
    choose: string
    /** `{tier}` and `{when}` and `{price}`. */
    movingTo: string
    /** `{tier}` is the one being kept. */
    nothingChanges: string
    working: string
    stayOn: string
    manage: string
    /** `{date}` is when it stops. */
    endsOn: string
    endsNote: string
    resuming: string
    resume: string
    /** `{price}` is the xp price. */
    xpSoon: string
    moveUp: string
    moveDown: string
    suiteGoes: string
    /** `{tier}` and `{when}`. */
    switchOn: string
    /** `{date}` is when access stops. */
    keepUntil: string
    cancelling: string
    yesCancel: string
    keepIt: string
    cancel: string
    endOfPeriod: string
  }

  /** Every invoice Stripe has for this address. */
  payments: {
    empty: string
    receipt: string
    pdf: string
  }

  /** The account, as opposed to this one space. */
  account: {
    /** `{status}` is one of `states` below. */
    heading: string
    states: Record<
      'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired',
      string
    >
    /** `{n}` spaces owned. */
    oneSpace: string
    manySpaces: string
    /** `{n}` of them with no plan. */
    withoutPlan: string
    cancelledEnds: string
    renews: string
    wasValid: string
    freeMonth: string
    freeMonthEnded: string
    runsUntil: string
    endedOn: string
    grantedNote: string
    lapsedNote: string
    noAccountPlan: string
    canCreate: string
    atLimit: string
  }

  /** A tagline and what each plan includes. Never a price - see above. */
  tiers: Record<Tier, { tagline: string; includes: readonly string[] }>
}

export const BILLING_EN: BillingDict = {
  redeem: {
    gotACode: 'Got a code?',
    heading: 'Redeem a code',
    placeholder: 'CAFE24',
    checking: 'Checking…',
    redeem: 'Redeem',
    note: 'A code gives a new account one month free. No card, no charge when it ends.',
    acceptedLead: 'Code accepted — your free month runs until',
    acceptedTail: '. No card needed, and nothing will be charged when it ends.',
  },

  title: 'Billing',
  goToDashboard: 'Go to dashboard to manage billing',

  tabs: { status: 'Status', history: 'Payment history' },
  historyCount: ' ({n})',

  checkoutDone:
    'Mandate accepted. The first debit has been requested — it will take a few business days to clear, and nothing about your space changes while you wait.',
  checkoutCancelled: 'Checkout was cancelled. Nothing was charged.',
  somethingWrong: 'Something went wrong',

  status: {
    none: {
      label: 'No subscription',
      detail:
        'This space is fully usable. Set up billing to keep it that way — unlimited members are included.',
    },
    pending: {
      label: 'Payment on its way',
      detail:
        'Your mandate is set up and the first direct debit has been requested. SEPA takes 2–5 business days to clear; the space works normally in the meantime.',
    },
    active: { label: 'Active', detail: 'Paid and in good standing.' },
    past_due: {
      label: 'Payment failed',
      detail:
        'A direct debit was returned. Stripe will retry automatically. The space still works — this only becomes read-only if the retries are exhausted.',
    },
    suspended: {
      label: 'Read-only',
      detail:
        'Collection failed or a settled payment was reversed, so no new changes can be recorded. Nothing has been deleted: every task and every event is still here, and paying restores writing immediately.',
    },
    canceled: {
      label: 'Canceled',
      detail:
        'The subscription was ended. The space is read-only, and all of its history remains intact.',
    },
  },

  bankSaid: 'Bank said: ',
  paidThrough: 'Paid through {date}.',
  ownerOnly: 'Only an owner can change billing for this space.',
  stripeNote:
    'Payment details are handled entirely by Stripe — your IBAN never reaches this server. What we store is a customer reference, and a log of which invoices succeeded or failed.',

  plan: {
    comingSoon: 'Coming soon',
    openingStripe: 'Opening Stripe…',
    choose: 'Choose {tier}',
    movingTo: 'Moving to {tier} on {when}, at {price}.',
    nothingChanges:
      'Nothing changes until then — you keep {tier} for the month you have already paid for, and the next invoice is the new price with no proration.',
    working: 'Working…',
    stayOn: 'Stay on {tier}',
    manage: 'Manage billing',
    endsOn: 'This subscription ends on {date}.',
    endsNote:
      'The space keeps working until then, and goes read-only afterwards. Nothing is deleted, and resuming brings it straight back.',
    resuming: 'Resuming…',
    resume: 'Resume subscription',
    xpSoon:
      'xp — the XP player, editor, story and VR — opens soon at {price}. Nothing to do now; this space stays on xo until you move it.',
    moveUp: 'Move up to xp',
    moveDown: 'Move down to xo',
    suiteGoes: 'The XP suite goes away when it takes effect.',
    switchOn: 'Switch to {tier} on {when}',
    keepUntil: 'Keep access until {date}, then stop. Nothing is deleted.',
    cancelling: 'Cancelling…',
    yesCancel: 'Yes, cancel',
    keepIt: 'Keep it',
    cancel: 'Cancel subscription',
    endOfPeriod: 'the end of the period',
  },

  payments: {
    empty:
      'No payments yet. Anything charged to your email address shows up here, including subscriptions set up for you directly.',
    receipt: 'Receipt',
    pdf: 'PDF',
  },

  account: {
    heading: 'Your account — {status}',
    states: {
      none: 'No subscription',
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Payment failed',
      canceled: 'Canceled',
      expired: 'Expired',
    },
    oneSpace: '1 space',
    manySpaces: '{n} spaces',
    withoutPlan: ' · {n} without a plan',
    cancelledEnds: 'Cancelled — access ends',
    renews: 'Renews',
    wasValid: 'Was valid until',
    freeMonth: 'Free month',
    freeMonthEnded: 'Free month ended',
    runsUntil: ' — runs until ',
    endedOn: ' on ',
    grantedNote:
      'No card on file, and nothing will be charged when it ends — the space goes read-only until you pick a plan.',
    lapsedNote: 'The space is read-only until you pick a plan. Nothing has been deleted.',
    noAccountPlan:
      'No account-level subscription. Since plans moved onto spaces, that is the normal state — each space pays for itself, below.',
    canCreate:
      'Making a space is free. It stays read-only until you give it xo or xp, and there is no limit on how many paid spaces you can run.',
    atLimit:
      'You have reached the limit of spaces without a plan. Give one of them xo or xp, or archive it, before making another.',
  },

  tiers: {
    free: {
      tagline: 'Your own space, for you and one other.',
      includes: [
        'The lounge, with emotes and chat',
        'Two of you, and one guest at a time',
        'Matches: all against all, teams, one against everyone, football, races',
        'One page',
        'It is yours, and it stays here',
      ],
    },
    xo: {
      tagline: 'Room for the group, and a shelf to build from.',
      includes: [
        'Six of you, and three guests at a time',
        '20 rooms of your own, plus worlds, scenes and radio',
        'An unlimited magazine — shelve any XP there is',
        '4 XP places, and 3 XPs you can edit',
        '15 matches at once',
        'Unlimited pages, and 10 images of your own',
      ],
    },
    xp: {
      tagline: 'Everything in xo, and room to build without counting.',
      includes: [
        'Twelve of you, and eight guests at a time',
        '30 rooms of your own',
        'An unlimited magazine',
        '10 XP places, and unlimited XPs you can edit',
        '30 matches at once',
        'Unlimited pages, and 100 images of your own',
        'XP story, XP in VR, and matches fought inside an XP',
      ],
    },
  },
}

export const BILLING_DE: BillingDict = {
  redeem: {
    gotACode: 'Sie haben einen Code?',
    heading: 'Code einlösen',
    placeholder: 'CAFE24',
    checking: 'Wird geprüft …',
    redeem: 'Einlösen',
    note: 'Ein Code schenkt einem neuen Konto einen Monat. Keine Karte, und am Ende wird nichts berechnet.',
    acceptedLead: 'Code angenommen — Ihr Gratismonat läuft bis',
    acceptedTail: '. Keine Karte nötig, und am Ende wird nichts berechnet.',
  },

  title: 'Abrechnung',
  goToDashboard: 'Zur Übersicht, um die Abrechnung zu verwalten',

  tabs: { status: 'Status', history: 'Zahlungsverlauf' },
  historyCount: ' ({n})',

  checkoutDone:
    'Mandat angenommen. Die erste Lastschrift ist beauftragt — sie braucht ein paar Werktage, und an Ihrem Space ändert sich in der Zwischenzeit nichts.',
  checkoutCancelled: 'Der Bezahlvorgang wurde abgebrochen. Es wurde nichts abgebucht.',
  somethingWrong: 'Da ist etwas schiefgegangen',

  status: {
    none: {
      label: 'Kein Abo',
      detail:
        'Dieser Space ist voll nutzbar. Richten Sie die Abrechnung ein, damit das so bleibt — unbegrenzt Mitglieder sind enthalten.',
    },
    pending: {
      label: 'Zahlung unterwegs',
      detail:
        'Ihr Mandat steht, und die erste Lastschrift ist beauftragt. SEPA braucht 2–5 Werktage; der Space arbeitet in der Zwischenzeit ganz normal.',
    },
    active: { label: 'Aktiv', detail: 'Bezahlt und in Ordnung.' },
    past_due: {
      label: 'Zahlung fehlgeschlagen',
      detail:
        'Eine Lastschrift kam zurück. Stripe versucht es automatisch erneut. Der Space funktioniert weiter — nur lesbar wird er erst, wenn die Versuche erschöpft sind.',
    },
    suspended: {
      label: 'Nur lesen',
      detail:
        'Der Einzug ist fehlgeschlagen oder eine abgeschlossene Zahlung wurde zurückgebucht, deshalb können keine neuen Änderungen aufgezeichnet werden. Es wurde nichts gelöscht: jede Aufgabe und jedes Ereignis ist noch da, und eine Zahlung stellt das Schreiben sofort wieder her.',
    },
    canceled: {
      label: 'Gekündigt',
      detail:
        'Das Abo wurde beendet. Der Space ist nur lesbar, und seine gesamte Geschichte bleibt erhalten.',
    },
  },

  bankSaid: 'Die Bank sagt: ',
  paidThrough: 'Bezahlt bis {date}.',
  ownerOnly: 'Nur ein Inhaber kann die Abrechnung dieses Space ändern.',
  stripeNote:
    'Zahlungsdaten werden vollständig von Stripe verarbeitet — Ihre IBAN erreicht diesen Server nie. Wir speichern eine Kundenreferenz und ein Protokoll darüber, welche Rechnungen erfolgreich waren und welche nicht.',

  plan: {
    comingSoon: 'Bald verfügbar',
    openingStripe: 'Stripe wird geöffnet …',
    choose: '{tier} wählen',
    movingTo: 'Wechsel zu {tier} am {when}, zu {price}.',
    nothingChanges:
      'Bis dahin ändert sich nichts — Sie behalten {tier} für den bereits bezahlten Monat, und die nächste Rechnung ist der neue Preis, ohne anteilige Verrechnung.',
    working: 'Wird erledigt …',
    stayOn: 'Bei {tier} bleiben',
    manage: 'Abrechnung verwalten',
    endsOn: 'Dieses Abo endet am {date}.',
    endsNote:
      'Der Space funktioniert bis dahin weiter und ist danach nur lesbar. Es wird nichts gelöscht, und ein Fortsetzen bringt alles sofort zurück.',
    resuming: 'Wird fortgesetzt …',
    resume: 'Abo fortsetzen',
    xpSoon:
      'xp — der XP-Player, der Editor, Story und VR — kommt bald für {price}. Jetzt ist nichts zu tun; dieser Space bleibt auf xo, bis Sie ihn umstellen.',
    moveUp: 'Hoch auf xp',
    moveDown: 'Runter auf xo',
    suiteGoes: 'Die XP-Suite fällt weg, sobald es wirksam wird.',
    switchOn: 'Am {when} auf {tier} wechseln',
    keepUntil: 'Zugang bis {date} behalten, dann Schluss. Es wird nichts gelöscht.',
    cancelling: 'Wird gekündigt …',
    yesCancel: 'Ja, kündigen',
    keepIt: 'Behalten',
    cancel: 'Abo kündigen',
    endOfPeriod: 'zum Ende des Zeitraums',
  },

  payments: {
    empty:
      'Noch keine Zahlungen. Alles, was auf Ihre E-Mail-Adresse abgerechnet wird, taucht hier auf — auch Abos, die für Sie direkt eingerichtet wurden.',
    receipt: 'Beleg',
    pdf: 'PDF',
  },

  account: {
    heading: 'Ihr Konto — {status}',
    states: {
      none: 'Kein Abo',
      active: 'Aktiv',
      trialing: 'Test',
      past_due: 'Zahlung fehlgeschlagen',
      canceled: 'Gekündigt',
      expired: 'Abgelaufen',
    },
    oneSpace: '1 Space',
    manySpaces: '{n} Spaces',
    withoutPlan: ' · {n} ohne Tarif',
    cancelledEnds: 'Gekündigt — Zugang endet',
    renews: 'Verlängert sich',
    wasValid: 'War gültig bis',
    freeMonth: 'Gratismonat',
    freeMonthEnded: 'Gratismonat beendet',
    runsUntil: ' — läuft bis ',
    endedOn: ' am ',
    grantedNote:
      'Keine Karte hinterlegt, und am Ende wird nichts abgebucht — der Space wird nur lesbar, bis Sie einen Tarif wählen.',
    lapsedNote:
      'Der Space ist nur lesbar, bis Sie einen Tarif wählen. Es wurde nichts gelöscht.',
    noAccountPlan:
      'Kein Abo auf Kontoebene. Seit die Tarife an den Spaces hängen, ist das der Normalfall — jeder Space zahlt für sich selbst, siehe unten.',
    canCreate:
      'Einen Space anzulegen ist kostenlos. Er bleibt nur lesbar, bis Sie ihm xo oder xp geben, und es gibt keine Grenze, wie viele bezahlte Spaces Sie führen.',
    atLimit:
      'Sie haben die Grenze für Spaces ohne Tarif erreicht. Geben Sie einem davon xo oder xp, oder archivieren Sie ihn, bevor Sie einen weiteren anlegen.',
  },

  tiers: {
    free: {
      tagline: 'Ihr eigener Space, für Sie und eine weitere Person.',
      includes: [
        'Die Lounge, mit Emotes und Chat',
        'Sie zu zweit, und ein Gast gleichzeitig',
        'Matches: alle gegen alle, Teams, einer gegen alle, Fußball, Rennen',
        'Eine Seite',
        'Er gehört Ihnen und bleibt hier',
      ],
    },
    xo: {
      tagline: 'Platz für die Gruppe, und ein Regal zum Bauen.',
      includes: [
        'Sie zu sechst, und drei Gäste gleichzeitig',
        '20 eigene Räume, dazu Welten, Szenen und Radio',
        'Ein unbegrenztes Magazin — jedes XP, das es gibt, ins Regal',
        '4 XP-Orte, und 3 XPs, die Sie bearbeiten können',
        '15 Matches gleichzeitig',
        'Unbegrenzt Seiten, und 10 eigene Bilder',
      ],
    },
    xp: {
      tagline: 'Alles aus xo, und Platz zum Bauen ohne Zählen.',
      includes: [
        'Sie zu zwölft, und acht Gäste gleichzeitig',
        '30 eigene Räume',
        'Ein unbegrenztes Magazin',
        '10 XP-Orte, und unbegrenzt XPs, die Sie bearbeiten können',
        '30 Matches gleichzeitig',
        'Unbegrenzt Seiten, und 100 eigene Bilder',
        'XP-Story, XP in VR, und Matches, die in einem XP ausgetragen werden',
      ],
    },
  },
}

export const BILLING_BG: BillingDict = {
  redeem: {
    gotACode: 'Имате код?',
    heading: 'Активиране на код',
    placeholder: 'CAFE24',
    checking: 'Проверява се…',
    redeem: 'Активирай',
    note: 'Кодът дава на нов акаунт един безплатен месец. Без карта и без такса в края.',
    acceptedLead: 'Кодът е приет — безплатният ви месец тече до',
    acceptedTail: '. Не е нужна карта, и в края нищо няма да бъде таксувано.',
  },

  title: 'Плащания',
  goToDashboard: 'Към таблото, за да управлявате плащанията',

  tabs: { status: 'Състояние', history: 'История на плащанията' },
  historyCount: ' ({n})',

  checkoutDone:
    'Мандатът е приет. Първото директно плащане е заявено — ще му трябват няколко работни дни, а дотогава в спейса ви нищо не се променя.',
  checkoutCancelled: 'Плащането беше прекратено. Нищо не беше таксувано.',
  somethingWrong: 'Нещо се обърка',

  status: {
    none: {
      label: 'Без абонамент',
      detail:
        'Този спейс е напълно използваем. Настройте плащанията, за да остане така — неограничен брой членове са включени.',
    },
    pending: {
      label: 'Плащането пътува',
      detail:
        'Мандатът ви е готов и първото директно плащане е заявено. SEPA отнема 2–5 работни дни; дотогава спейсът работи както обикновено.',
    },
    active: { label: 'Активен', detail: 'Платен и в изправност.' },
    past_due: {
      label: 'Плащането не мина',
      detail:
        'Едно директно плащане беше върнато. Stripe ще опита пак автоматично. Спейсът продължава да работи — само за четене става чак ако опитите свършат.',
    },
    suspended: {
      label: 'Само за четене',
      detail:
        'Събирането се провали или приключило плащане беше сторнирано, така че нови промени не могат да се записват. Нищо не е изтрито: всяка задача и всяко събитие са тук, а плащането връща писането веднага.',
    },
    canceled: {
      label: 'Прекратен',
      detail:
        'Абонаментът беше приключен. Спейсът е само за четене, а цялата му история остава непокътната.',
    },
  },

  bankSaid: 'Банката каза: ',
  paidThrough: 'Платено до {date}.',
  ownerOnly: 'Само собственик може да променя плащанията на този спейс.',
  stripeNote:
    'Данните за плащане се обработват изцяло от Stripe — вашият IBAN никога не стига до този сървър. Ние пазим клиентска референция и запис кои фактури са минали и кои не.',

  plan: {
    comingSoon: 'Очаквайте скоро',
    openingStripe: 'Stripe се отваря…',
    choose: 'Изберете {tier}',
    movingTo: 'Преминаване към {tier} на {when}, за {price}.',
    nothingChanges:
      'Дотогава нищо не се променя — задържате {tier} за месеца, който вече сте платили, а следващата фактура е новата цена, без преизчисляване.',
    working: 'Изпълнява се…',
    stayOn: 'Останете на {tier}',
    manage: 'Управление на плащанията',
    endsOn: 'Този абонамент приключва на {date}.',
    endsNote:
      'Дотогава спейсът работи, а след това става само за четене. Нищо не се изтрива, а възобновяването го връща веднага.',
    resuming: 'Възобновява се…',
    resume: 'Възобнови абонамента',
    xpSoon:
      'xp — плейърът за XP, редакторът, историята и VR — отваря скоро за {price}. Сега няма какво да се прави; този спейс остава на xo, докато не го преместите.',
    moveUp: 'Нагоре към xp',
    moveDown: 'Надолу към xo',
    suiteGoes: 'XP пакетът отпада в момента, в който това влезе в сила.',
    switchOn: 'Премини към {tier} на {when}',
    keepUntil: 'Задръжте достъпа до {date}, после спира. Нищо не се изтрива.',
    cancelling: 'Прекратява се…',
    yesCancel: 'Да, прекрати',
    keepIt: 'Задръж го',
    cancel: 'Прекрати абонамента',
    endOfPeriod: 'края на периода',
  },

  payments: {
    empty:
      'Още няма плащания. Всичко, таксувано на вашия имейл, се появява тук — включително абонаменти, направени за вас директно.',
    receipt: 'Разписка',
    pdf: 'PDF',
  },

  account: {
    heading: 'Вашият акаунт — {status}',
    states: {
      none: 'Без абонамент',
      active: 'Активен',
      trialing: 'Пробен',
      past_due: 'Плащането не мина',
      canceled: 'Прекратен',
      expired: 'Изтекъл',
    },
    oneSpace: '1 спейс',
    manySpaces: '{n} спейса',
    withoutPlan: ' · {n} без план',
    cancelledEnds: 'Прекратен — достъпът свършва',
    renews: 'Подновява се',
    wasValid: 'Важеше до',
    freeMonth: 'Безплатен месец',
    freeMonthEnded: 'Безплатният месец свърши',
    runsUntil: ' — тече до ',
    endedOn: ' на ',
    grantedNote:
      'Няма запазена карта и в края нищо няма да бъде таксувано — спейсът става само за четене, докато не изберете план.',
    lapsedNote:
      'Спейсът е само за четене, докато не изберете план. Нищо не е изтрито.',
    noAccountPlan:
      'Няма абонамент на ниво акаунт. Откакто плановете се закачат за спейсовете, това е нормалното състояние — всеки спейс плаща за себе си, по-долу.',
    canCreate:
      'Създаването на спейс е безплатно. Той остава само за четене, докато не му дадете xo или xp, и няма ограничение колко платени спейса водите.',
    atLimit:
      'Достигнахте границата за спейсове без план. Дайте на някой от тях xo или xp, или го архивирайте, преди да направите нов.',
  },

  tiers: {
    free: {
      tagline: 'Ваш собствен спейс, за вас и още един човек.',
      includes: [
        'Лоунджът, с емотикони и чат',
        'Двамата, и по един гост наведнъж',
        'Мачове: всеки срещу всеки, отбори, един срещу всички, футбол, състезания',
        'Една страница',
        'Ваш е и си остава тук',
      ],
    },
    xo: {
      tagline: 'Място за групата, и рафт, от който да строите.',
      includes: [
        'Шестима, и по трима гости наведнъж',
        '20 собствени стаи, плюс светове, сцени и радио',
        'Неограничено списание — сложете на рафта всяко XP, което съществува',
        '4 XP места, и 3 XP-та, които може да редактирате',
        '15 мача едновременно',
        'Неограничени страници, и 10 собствени изображения',
      ],
    },
    xp: {
      tagline: 'Всичко от xo, и място да строите, без да броите.',
      includes: [
        'Дванайсет души, и по осем гости наведнъж',
        '30 собствени стаи',
        'Неограничено списание',
        '10 XP места, и неограничено XP-та, които може да редактирате',
        '30 мача едновременно',
        'Неограничени страници, и 100 собствени изображения',
        'XP история, XP във VR, и мачове, изиграни вътре в едно XP',
      ],
    },
  },
}

const DICTS: Record<Locale, BillingDict> = {
  en: BILLING_EN,
  de: BILLING_DE,
  bg: BILLING_BG,
}

export function billingDict(locale: Locale): BillingDict {
  return DICTS[locale]
}
