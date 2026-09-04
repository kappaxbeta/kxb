import type { Locale } from '@/domain/i18n/locale'

/**
 * What the server says when it says no, in the reader's language.
 *
 * ---------------------------------------------------------------------------
 * The English is the key, and it is looked up where it is *read*
 * ---------------------------------------------------------------------------
 * Every server action in `src/domain/**` answers `{ ok: false, error }` with a
 * sentence in it, and there are around four hundred of them across forty-six
 * files. Two other designs were possible and both are worse:
 *
 *   * **A key per refusal, resolved on the client.** Four hundred call sites
 *     rewritten, and every one of them loses the ability to name the thing that
 *     went wrong — half of these end in a database's own message.
 *   * **`readLocale()` inside each action.** Also four hundred call sites, and
 *     it puts a *presentation* concern inside the layer that decides whether
 *     something may happen at all. A domain module that has to know which
 *     language somebody reads is a domain module doing two jobs.
 *
 * So the sentence is the key, exactly as it is for a level's own words
 * (`@kxb/xp/words`), and the lookup happens at the point of display. Nothing in
 * `src/domain/**` changes, an unlisted refusal reads as the English it always
 * read as, and adding a language is adding rows here - which is what Bulgarian
 * did, and the reason `TABLES` below is a record over `Locale` rather than a
 * check for one language.
 *
 * ---------------------------------------------------------------------------
 * The prefix half
 * ---------------------------------------------------------------------------
 * A good third of these are `Could not close it: ${error.message}` — our
 * sentence, then Postgres's. The tail cannot be translated by anybody and must
 * not be dropped: it is the only part that says *what* failed. So a colon
 * splits them, the head is looked up, and the tail is passed through as it
 * came.
 */

/**
 * The German for each refusal, by the English it replaces.
 *
 * **A space is a `Space` and a room is a `Raum`.** The app keeps the product's
 * own noun for the first - `settings`, `billing` and the rest have always said
 * `dieser Space` - and German already needs `Raum` for the *rooms* inside one.
 * This table said `Raum` for both when it was written, which reads as a level
 * refusing something about itself.
 *
 * Alphabetical, because it is a lookup table rather than a story: the only
 * question anybody asks it is "is this one in here", and grouping by domain
 * would mean knowing which file a sentence came from before you could find it.
 */
const REFUSALS_DE: Readonly<Record<string, string>> = {
  'Battle not found': 'Match nicht gefunden',
  'Battlefield not found': 'Schlachtfeld nicht gefunden',
  'Challenge not found': 'Herausforderung nicht gefunden',
  'Chat is not available on this installation': 'Chat gibt es in dieser Installation nicht',
  'Chat is off in this space': 'Der Chat ist in diesem Space aus',
  'Check the name': 'Prüfen Sie den Namen',
  'Could not copy that version': 'Diese Version konnte nicht kopiert werden',
  'Could not open another room just now. Try again.':
    'Gerade konnte kein weiterer Raum geöffnet werden. Versuchen Sie es noch einmal.',
  'Could not put that level in this space':
    'Dieses Level konnte nicht in diesen Space gelegt werden',
  'Could not write that file': 'Diese Datei konnte nicht geschrieben werden',
  'Enter a valid email address': 'Geben Sie eine gültige E-Mail-Adresse ein',
  'Enter your current password': 'Geben Sie Ihr aktuelles Passwort ein',
  'Floor size must be between 1 and 512': 'Die Bodengröße muss zwischen 1 und 512 liegen',
  'Guest accounts cannot change their email address':
    'Gastkonten können ihre E-Mail-Adresse nicht ändern',
  'Guest accounts have no email address to confirm':
    'Gastkonten haben keine E-Mail-Adresse zum Bestätigen',
  'Invalid application': 'Ungültige Bewerbung',
  'Invalid battle': 'Ungültiges Match',
  'Invalid battlefield': 'Ungültiges Schlachtfeld',
  'Invalid challenge': 'Ungültige Herausforderung',
  'Invalid code': 'Ungültiger Code',
  'Invalid email': 'Ungültige E-Mail-Adresse',
  'Invalid email address': 'Ungültige E-Mail-Adresse',
  'Invalid goal id': 'Ungültige Tor-Kennung',
  'Invalid guest': 'Ungültiger Gast',
  'Invalid image id': 'Ungültige Bild-Kennung',
  'Invalid invitation': 'Ungültige Einladung',
  'Invalid invite': 'Ungültige Einladung',
  'Invalid link': 'Ungültiger Link',
  'Invalid match': 'Ungültiges Match',
  'Invalid member': 'Ungültiges Mitglied',
  'Invalid message': 'Ungültige Nachricht',
  'Invalid notice': 'Ungültige Mitteilung',
  'Invalid override': 'Ungültige Ausnahme',
  'Invalid page id': 'Ungültige Seiten-Kennung',
  'Invalid report': 'Ungültige Meldung',
  'Invalid room': 'Ungültiger Raum',
  'Invalid task id': 'Ungültige Aufgaben-Kennung',
  'Invalid tournament': 'Ungültiges Turnier',
  'Invalid world': 'Ungültige Welt',
  'Matches are switched off for this space': 'Matches sind für diesen Space ausgeschaltet',
  'No space with that address': 'Kein Space unter dieser Adresse',
  'No such announcement': 'Diese Ankündigung gibt es nicht',
  'No such match': 'Dieses Match gibt es nicht',
  'No such room': 'Diesen Raum gibt es nicht',
  'No such scene': 'Diese Szene gibt es nicht',
  'No such world': 'Diese Welt gibt es nicht',
  'No such world template': 'Diese Weltvorlage gibt es nicht',
  'Nobody is signed in': 'Es ist niemand angemeldet',
  'Nothing is on in here': 'Hier läuft nichts',
  'Only a visitor can leave this way': 'Nur ein Gast kann auf diesem Weg gehen',
  'Only admins can post to the board': 'Nur Admins können an die Pinnwand schreiben',
  'Only an owner can change the plan': 'Nur die Inhaberin kann den Tarif ändern',
  'Only an owner can manage billing': 'Nur die Inhaberin kann die Abrechnung verwalten',
  'Only an owner can set up billing': 'Nur die Inhaberin kann die Abrechnung einrichten',
  'Only an owner or admin can add a world to this space':
    'Nur Inhaberin oder Admin können diesem Space eine Welt hinzufügen',
  'Only an owner or admin can create a guest link':
    'Nur Inhaberin oder Admin können einen Gastlink erstellen',
  'Only an owner or admin can empty this world':
    'Nur Inhaberin oder Admin können diese Welt leeren',
  'Only an owner or admin can lift a ban':
    'Nur Inhaberin oder Admin können eine Sperre aufheben',
  'Only an owner or admin can manage battlefields':
    'Nur Inhaberin oder Admin können Schlachtfelder verwalten',
  'Only an owner or admin can manage rooms':
    'Nur Inhaberin oder Admin können Räume verwalten',
  'Only an owner or admin can open a room here':
    'Nur Inhaberin oder Admin können hier einen Raum öffnen',
  'Only an owner or admin can rebuild the lounge':
    'Nur Inhaberin oder Admin können die Lounge neu aufbauen',
  'Only an owner or admin can rebuild this world':
    'Nur Inhaberin oder Admin können diese Welt neu aufbauen',
  'Only an owner or admin can remove a guest':
    'Nur Inhaberin oder Admin können einen Gast entfernen',
  'Only an owner or admin can reset a battlefield':
    'Nur Inhaberin oder Admin können ein Schlachtfeld zurücksetzen',
  'Only an owner or admin can revoke a guest link':
    'Nur Inhaberin oder Admin können einen Gastlink zurückziehen',
  'Only an owner or an admin can work the radio':
    'Nur Inhaberin oder Admin können das Radio bedienen',
  'Only somebody in this space can answer the door':
    'Nur wer in diesem Space ist, kann die Tür öffnen',
  'Only the owner or an admin can save a banner':
    'Nur Inhaberin oder Admin können ein Banner sichern',
  'Only the owner or an admin of a live event can change this':
    'Nur Inhaberin oder Admin einer laufenden Veranstaltung können das ändern',
  'Only whoever set this up can put a match on':
    'Nur wer das aufgesetzt hat, kann ein Match ansetzen',
  'Pick what is wrong with it': 'Wählen Sie, was daran nicht stimmt',
  'Pick xo or xp': 'Wählen Sie xo oder xp',
  'Refusing to save an empty world over one that is not':
    'Eine leere Welt wird nicht über eine nicht leere gesichert',
  'Renders are not enabled for this space': 'Renderings sind für diesen Space nicht freigeschaltet',
  'Renders are switched off': 'Renderings sind ausgeschaltet',
  'Room not found': 'Raum nicht gefunden',
  'Set a password first, then you can change your email':
    'Legen Sie zuerst ein Passwort fest, dann können Sie Ihre E-Mail-Adresse ändern',
  'Sign in to choose a username.': 'Melden Sie sich an, um einen Namen zu wählen.',
  'Sign in to choose an animal.': 'Melden Sie sich an, um ein Tier zu wählen.',
  'Somebody else just changed the radio. Try again.':
    'Jemand anderes hat gerade das Radio geändert. Versuchen Sie es noch einmal.',
  'Somebody else was decorating. Try again.':
    'Jemand anderes hat gerade eingerichtet. Versuchen Sie es noch einmal.',
  'Someone else changed that goal. Try again.':
    'Jemand anderes hat dieses Tor geändert. Versuchen Sie es noch einmal.',
  'Someone else changed that image. Try again.':
    'Jemand anderes hat dieses Bild geändert. Versuchen Sie es noch einmal.',
  'Stripe did not return a checkout URL': 'Stripe hat keine Kassen-URL zurückgegeben',
  'That address already has access': 'Diese Adresse hat bereits Zugang',
  'That application no longer exists': 'Diese Bewerbung gibt es nicht mehr',
  'That banner is not this space’s any more': 'Dieses Banner gehört nicht mehr zu diesem Space',
  'That battle changed underneath you. Try again.':
    'Dieses Match hat sich unter Ihnen geändert. Versuchen Sie es noch einmal.',
  'That battlefield changed elsewhere. Try again.':
    'Dieses Schlachtfeld wurde anderswo geändert. Versuchen Sie es noch einmal.',
  'That battlefield has been archived': 'Dieses Schlachtfeld wurde archiviert',
  'That battlefield has been taken off the platform':
    'Dieses Schlachtfeld wurde von der Plattform genommen',
  'That challenge has already been answered': 'Diese Herausforderung wurde bereits beantwortet',
  'That challenge is not yours to answer':
    'Diese Herausforderung steht Ihnen nicht zu beantworten',
  'That change did not save. Try again.':
    'Diese Änderung wurde nicht gesichert. Versuchen Sie es noch einmal.',
  'That did not go through. Try again.':
    'Das ist nicht durchgegangen. Versuchen Sie es noch einmal.',
  'That did not take. Try again.': 'Das hat nicht gegriffen. Versuchen Sie es noch einmal.',
  'That does not look like a scene': 'Das sieht nicht nach einer Szene aus',
  'That event has no machine': 'Diese Veranstaltung hat keine Maschine',
  'That export is empty': 'Dieser Export ist leer',
  'That export is too large': 'Dieser Export ist zu groß',
  'That has no versions to update': 'Das hat keine Versionen, die zu aktualisieren wären',
  'That invitation is no longer valid': 'Diese Einladung gilt nicht mehr',
  'That is already the newest version': 'Das ist bereits die neueste Version',
  'That is already your email address': 'Das ist bereits Ihre E-Mail-Adresse',
  'That is already your password': 'Das ist bereits Ihr Passwort',
  'That is no longer here': 'Das ist nicht mehr hier',
  'That is not a PNG export': 'Das ist kein PNG-Export',
  'That is not a level': 'Das ist kein Level',
  'That is not a level this space can take': 'Das ist kein Level, das dieser Space nehmen kann',
  'That is not a price.': 'Das ist kein Preis.',
  'That is not an XP this space can take in':
    'Das ist kein XP, das dieser Space aufnehmen kann',
  'That is not in this magazine': 'Das ist nicht in diesem Magazin',
  'That is not your current password': 'Das ist nicht Ihr aktuelles Passwort',
  'That is your own space — use the lounge': 'Das ist Ihr eigener Space — nehmen Sie die Lounge',
  'That link no longer exists': 'Diesen Link gibt es nicht mehr',
  'That machine is already gone': 'Diese Maschine ist bereits weg',
  'That match had a winner — record it instead':
    'Dieses Match hatte eine Siegerin — halten Sie das Ergebnis stattdessen fest',
  'That match has no battle to replay':
    'Zu diesem Match gibt es kein Spiel, das wiederholt werden könnte',
  'That match has not been played': 'Dieses Match wurde nicht gespielt',
  'That match is still being fought': 'Dieses Match wird noch ausgetragen',
  'That match is waiting on an earlier round': 'Dieses Match wartet auf eine frühere Runde',
  'That message is no longer here': 'Diese Nachricht ist nicht mehr hier',
  'That notice is not yours': 'Diese Mitteilung gehört Ihnen nicht',
  'That person is not in this space yet. Invite them first.':
    'Diese Person ist noch nicht in diesem Space. Laden Sie sie zuerst ein.',
  'That picture is not this space’s': 'Dieses Bild gehört nicht zu diesem Space',
  'That project changed elsewhere. Reload and try again.':
    'Dieses Projekt wurde anderswo geändert. Laden Sie neu und versuchen Sie es noch einmal.',
  'That project changed while you were reading it. Reload.':
    'Dieses Projekt hat sich geändert, während Sie es gelesen haben. Laden Sie neu.',
  'That project could not be found': 'Dieses Projekt wurde nicht gefunden',
  'That project is already in this space': 'Dieses Projekt ist bereits in diesem Space',
  'That project is not in this space': 'Dieses Projekt ist nicht in diesem Space',
  'That room changed elsewhere. Try again.':
    'Dieser Raum wurde anderswo geändert. Versuchen Sie es noch einmal.',
  'That room has been closed': 'Dieser Raum wurde geschlossen',
  'That room is not here': 'Diesen Raum gibt es hier nicht',
  'That room is not playing a level': 'In diesem Raum läuft kein Level',
  'That scene is no longer here': 'Diese Szene ist nicht mehr hier',
  'That space already has an event — open it to change the dates':
    'Dieser Space hat bereits eine Veranstaltung — öffnen Sie sie, um die Daten zu ändern',
  'That space does not exist': 'Diesen Space gibt es nicht',
  'That space is archived — unarchive it before giving it an event':
    'Dieser Space ist archiviert — heben Sie das auf, bevor Sie ihm eine Veranstaltung geben',
  'That space is not an event': 'Dieser Space ist keine Veranstaltung',
  'That space no longer exists': 'Diesen Space gibt es nicht mehr',
  'That space was changed elsewhere. Try again.':
    'Dieser Space wurde anderswo geändert. Versuchen Sie es noch einmal.',
  'That tournament changed underneath you. Try again.':
    'Dieses Turnier hat sich unter Ihnen geändert. Versuchen Sie es noch einmal.',
  'That tournament is not running': 'Dieses Turnier läuft nicht',
  'That version could not be read': 'Diese Version konnte nicht gelesen werden',
  'That was just sent. Give it a minute before asking for another one.':
    'Das wurde gerade erst verschickt. Warten Sie eine Minute, bevor Sie eine weitere anfordern.',
  'That world is gone': 'Diese Welt ist weg',
  'That world is not here': 'Diese Welt ist nicht hier',
  'That world is not yours to change': 'Diese Welt können Sie nicht ändern',
  'That world is not yours to delete': 'Diese Welt können Sie nicht löschen',
  'That world was being added elsewhere. Try again.':
    'Diese Welt wurde anderswo gerade hinzugefügt. Versuchen Sie es noch einmal.',
  'The email could not be sent just now. Try again in a moment.':
    'Die E-Mail konnte gerade nicht verschickt werden. Versuchen Sie es gleich noch einmal.',
  'The magazine changed elsewhere. Try again.':
    'Das Magazin wurde anderswo geändert. Versuchen Sie es noch einmal.',
  'The project could not be written to the new space':
    'Das Projekt konnte nicht in den neuen Space geschrieben werden',
  'The radio is not available in this space': 'Das Radio gibt es in diesem Space nicht',
  'There is no door here to change. Place one first.':
    'Hier gibt es keine Tür zu ändern. Setzen Sie zuerst eine.',
  'There is nothing in this world to publish yet':
    'In dieser Welt gibt es noch nichts zu veröffentlichen',
  'There is nothing saved to copy yet': 'Es ist noch nichts gesichert, das kopiert werden könnte',
  'There is nothing saved to move yet':
    'Es ist noch nichts gesichert, das verschoben werden könnte',
  'There must be at least one backoffice admin':
    'Es muss mindestens eine Backoffice-Adminstelle geben',
  'They are not waiting any more': 'Sie warten nicht mehr',
  'This account has no email address': 'Dieses Konto hat keine E-Mail-Adresse',
  'This account has no email address to verify against':
    'Dieses Konto hat keine E-Mail-Adresse, gegen die geprüft werden könnte',
  'This event does not let visitors open rooms':
    'Diese Veranstaltung lässt Gäste keine Räume öffnen',
  'This event does not open extra rooms': 'Diese Veranstaltung öffnet keine zusätzlichen Räume',
  'This space does not overflow rooms': 'Dieser Space lässt keine Überlaufräume zu',
  'This space has no subscription': 'Dieser Space hat kein Abonnement',
  'This space has no subscription to change': 'Dieser Space hat kein Abonnement zu ändern',
  'This space has no subscription yet': 'Dieser Space hat noch kein Abonnement',
  'Too many emails have gone out just now. Try again in a little while.':
    'Gerade sind zu viele E-Mails rausgegangen. Versuchen Sie es in einer Weile noch einmal.',
  'Unknown capability': 'Unbekannte Fähigkeit',
  'Unknown event': 'Unbekannte Veranstaltung',
  'Unknown feature flag': 'Unbekannter Funktionsschalter',
  'Unknown member': 'Unbekanntes Mitglied',
  'Unknown preset': 'Unbekannter Modus',
  'Unknown radio reach': 'Unbekannte Radioreichweite',
  'Unknown scope': 'Unbekannter Bereich',
  'Unknown server type': 'Unbekannter Servertyp',
  'XP is not switched on for this space': 'XP ist für diesen Space nicht eingeschaltet',
  'XP not found': 'XP nicht gefunden',
  'You already have a challenge waiting with that space':
    'Sie haben mit diesem Space bereits eine offene Herausforderung',
  'You are already in this space': 'Sie sind bereits in diesem Space',
  'You are not in that space': 'Sie sind nicht in diesem Space',
  'You can only hand a project to somebody in this space':
    'Sie können ein Projekt nur an jemanden in diesem Space übergeben',
  'You cannot post to this board': 'Sie können an diese Pinnwand nicht schreiben',
  'You cannot publish worlds in this space':
    'Sie können in diesem Space keine Welten veröffentlichen',
  'You cannot remove your own access': 'Sie können sich den eigenen Zugang nicht entziehen',
  'You cannot save scenes in this space': 'Sie können in diesem Space keine Szenen sichern',
  'You have already reported this one — it is in the queue':
    'Das haben Sie bereits gemeldet — es liegt in der Warteschlange',
  'Your account has no email address': 'Ihr Konto hat keine E-Mail-Adresse',
}

/**
 * The head of a refusal that names something afterwards.
 *
 * `Could not close it: whatever Postgres said` is our half and then a half
 * nobody can translate. The colon is the seam, and the tail comes back exactly
 * as it arrived - it is the only part that says which constraint, which row,
 * which file.
 */
const HEADS_DE: Readonly<Record<string, string>> = {
  'Could not ban that guest': 'Dieser Gast konnte nicht gesperrt werden',
  'Could not check admins': 'Die Admins konnten nicht geprüft werden',
  'Could not check pending invitations':
    'Die offenen Einladungen konnten nicht geprüft werden',
  "Could not check the world's size": 'Die Größe der Welt konnte nicht geprüft werden',
  'Could not clear read model': 'Das Lesemodell konnte nicht geleert werden',
  'Could not clear the grants': 'Die Freigaben konnten nicht geleert werden',
  'Could not close it': 'Es konnte nicht geschlossen werden',
  'Could not create the code': 'Der Code konnte nicht erstellt werden',
  'Could not create the grant': 'Die Freigabe konnte nicht erstellt werden',
  'Could not create the invite': 'Die Einladung konnte nicht erstellt werden',
}

/** The Bulgarian for each refusal, by the English it replaces. Same keys. */
const REFUSALS_BG: Readonly<Record<string, string>> = {
  'Battle not found': 'Мачът не е намерен',
  'Battlefield not found': 'Бойното поле не е намерено',
  'Challenge not found': 'Предизвикателството не е намерено',
  'Chat is not available on this installation': 'В тази инсталация няма чат',
  'Chat is off in this space': 'Чатът в този спейс е изключен',
  'Check the name': 'Проверете името',
  'Could not copy that version': 'Тази версия не можа да бъде копирана',
  'Could not open another room just now. Try again.':
    'В момента не можа да се отвори още една стая. Опитайте пак.',
  'Could not put that level in this space':
    'Това ниво не можа да бъде сложено в този спейс',
  'Could not write that file': 'Този файл не можа да бъде записан',
  'Enter a valid email address': 'Въведете валиден имейл адрес',
  'Enter your current password': 'Въведете текущата си парола',
  'Floor size must be between 1 and 512': 'Размерът на пода трябва да е между 1 и 512',
  'Guest accounts cannot change their email address':
    'Гост-акаунтите не могат да сменят имейл адреса си',
  'Guest accounts have no email address to confirm':
    'Гост-акаунтите нямат имейл адрес за потвърждаване',
  'Invalid application': 'Невалидна кандидатура',
  'Invalid battle': 'Невалиден мач',
  'Invalid battlefield': 'Невалидно бойно поле',
  'Invalid challenge': 'Невалидно предизвикателство',
  'Invalid code': 'Невалиден код',
  'Invalid email': 'Невалиден имейл',
  'Invalid email address': 'Невалиден имейл адрес',
  'Invalid goal id': 'Невалиден идентификатор на врата',
  'Invalid guest': 'Невалиден гост',
  'Invalid image id': 'Невалиден идентификатор на изображение',
  'Invalid invitation': 'Невалидна покана',
  'Invalid invite': 'Невалидна покана',
  'Invalid link': 'Невалиден линк',
  'Invalid match': 'Невалиден мач',
  'Invalid member': 'Невалиден член',
  'Invalid message': 'Невалидно съобщение',
  'Invalid notice': 'Невалидно съобщение на таблото',
  'Invalid override': 'Невалидно изключение',
  'Invalid page id': 'Невалиден идентификатор на страница',
  'Invalid report': 'Невалиден доклад',
  'Invalid room': 'Невалидна стая',
  'Invalid task id': 'Невалиден идентификатор на задача',
  'Invalid tournament': 'Невалиден турнир',
  'Invalid world': 'Невалиден свят',
  'Matches are switched off for this space': 'Мачовете за този спейс са изключени',
  'No space with that address': 'Няма спейс на този адрес',
  'No such announcement': 'Такова съобщение няма',
  'No such match': 'Такъв мач няма',
  'No such room': 'Такава стая няма',
  'No such scene': 'Такава сцена няма',
  'No such world': 'Такъв свят няма',
  'No such world template': 'Такъв шаблон за свят няма',
  'Nobody is signed in': 'Никой не е влязъл',
  'Nothing is on in here': 'Тук нищо не върви',
  'Only a visitor can leave this way': 'Само гост може да си тръгне по този начин',
  'Only admins can post to the board': 'Само админи могат да пишат на дъската',
  'Only an owner can change the plan': 'Само собственик може да смени плана',
  'Only an owner can manage billing': 'Само собственик може да управлява плащанията',
  'Only an owner can set up billing': 'Само собственик може да настрои плащанията',
  'Only an owner or admin can add a world to this space':
    'Само собственик или админ може да добави свят в този спейс',
  'Only an owner or admin can create a guest link':
    'Само собственик или админ може да създаде гост-линк',
  'Only an owner or admin can empty this world':
    'Само собственик или админ може да изпразни този свят',
  'Only an owner or admin can lift a ban':
    'Само собственик или админ може да вдигне забрана',
  'Only an owner or admin can manage battlefields':
    'Само собственик или админ може да управлява бойните полета',
  'Only an owner or admin can manage rooms':
    'Само собственик или админ може да управлява стаите',
  'Only an owner or admin can open a room here':
    'Само собственик или админ може да отвори стая тук',
  'Only an owner or admin can rebuild the lounge':
    'Само собственик или админ може да построи лоунджа наново',
  'Only an owner or admin can rebuild this world':
    'Само собственик или админ може да построи този свят наново',
  'Only an owner or admin can remove a guest':
    'Само собственик или админ може да премахне гост',
  'Only an owner or admin can reset a battlefield':
    'Само собственик или админ може да нулира бойно поле',
  'Only an owner or admin can revoke a guest link':
    'Само собственик или админ може да оттегли гост-линк',
  'Only an owner or an admin can work the radio':
    'Само собственик или админ може да работи с радиото',
  'Only somebody in this space can answer the door':
    'Само някой от този спейс може да отвори вратата',
  'Only the owner or an admin can save a banner':
    'Само собственик или админ може да запази банер',
  'Only the owner or an admin of a live event can change this':
    'Само собственик или админ на течащо събитие може да смени това',
  'Only whoever set this up can put a match on':
    'Само този, който го е настроил, може да насрочи мач',
  'Pick what is wrong with it': 'Изберете какво не е наред с него',
  'Pick xo or xp': 'Изберете xo или xp',
  'Refusing to save an empty world over one that is not':
    'Празен свят няма да бъде записан върху непразен',
  'Renders are not enabled for this space': 'Рендерите за този спейс не са включени',
  'Renders are switched off': 'Рендерите са изключени',
  'Room not found': 'Стаята не е намерена',
  'Set a password first, then you can change your email':
    'Първо задайте парола, после може да смените имейла си',
  'Sign in to choose a username.': 'Влезте, за да изберете потребителско име.',
  'Sign in to choose an animal.': 'Влезте, за да изберете животно.',
  'Somebody else just changed the radio. Try again.':
    'Някой друг току-що смени радиото. Опитайте пак.',
  'Somebody else was decorating. Try again.':
    'Някой друг обзавеждаше. Опитайте пак.',
  'Someone else changed that goal. Try again.':
    'Някой друг смени тази врата. Опитайте пак.',
  'Someone else changed that image. Try again.':
    'Някой друг смени това изображение. Опитайте пак.',
  'Stripe did not return a checkout URL': 'Stripe не върна адрес за плащане',
  'That address already has access': 'Този адрес вече има достъп',
  'That application no longer exists': 'Тази кандидатура вече не съществува',
  'That banner is not this space’s any more': 'Този банер вече не е на този спейс',
  'That battle changed underneath you. Try again.':
    'Този мач се промени под вас. Опитайте пак.',
  'That battlefield changed elsewhere. Try again.':
    'Това бойно поле беше променено другаде. Опитайте пак.',
  'That battlefield has been archived': 'Това бойно поле беше архивирано',
  'That battlefield has been taken off the platform':
    'Това бойно поле беше свалено от платформата',
  'That challenge has already been answered': 'На това предизвикателство вече е отговорено',
  'That challenge is not yours to answer':
    'Не вие сте този, който отговаря на това предизвикателство',
  'That change did not save. Try again.':
    'Тази промяна не се запази. Опитайте пак.',
  'That did not go through. Try again.':
    'Това не мина. Опитайте пак.',
  'That did not take. Try again.': 'Това не хвана. Опитайте пак.',
  'That does not look like a scene': 'Това не прилича на сцена',
  'That event has no machine': 'Това събитие няма машина',
  'That export is empty': 'Този експорт е празен',
  'That export is too large': 'Този експорт е твърде голям',
  'That has no versions to update': 'Това няма версии, които да се обновят',
  'That invitation is no longer valid': 'Тази покана вече не е валидна',
  'That is already the newest version': 'Това вече е най-новата версия',
  'That is already your email address': 'Това вече е вашият имейл адрес',
  'That is already your password': 'Това вече е вашата парола',
  'That is no longer here': 'Това вече не е тук',
  'That is not a PNG export': 'Това не е PNG експорт',
  'That is not a level': 'Това не е ниво',
  'That is not a level this space can take': 'Това не е ниво, което този спейс може да вземе',
  'That is not a price.': 'Това не е цена.',
  'That is not an XP this space can take in':
    'Това не е XP, което този спейс може да прибере',
  'That is not in this magazine': 'Това не е в това списание',
  'That is not your current password': 'Това не е текущата ви парола',
  'That is your own space — use the lounge': 'Това е вашият собствен спейс — минете през лоунджа',
  'That link no longer exists': 'Този линк вече не съществува',
  'That machine is already gone': 'Тази машина вече я няма',
  'That match had a winner — record it instead':
    'Този мач имаше победител — запишете резултата вместо това',
  'That match has no battle to replay':
    'Към този мач няма битка, която да се изиграе пак',
  'That match has not been played': 'Този мач не е бил игран',
  'That match is still being fought': 'Този мач още се играе',
  'That match is waiting on an earlier round': 'Този мач чака по-ранен кръг',
  'That message is no longer here': 'Това съобщение вече не е тук',
  'That notice is not yours': 'Това съобщение не е ваше',
  'That person is not in this space yet. Invite them first.':
    'Този човек още не е в този спейс. Първо го поканете.',
  'That picture is not this space’s': 'Тази картина не е на този спейс',
  'That project changed elsewhere. Reload and try again.':
    'Този проект беше променен другаде. Презаредете и опитайте пак.',
  'That project changed while you were reading it. Reload.':
    'Този проект се промени, докато го четяхте. Презаредете.',
  'That project could not be found': 'Този проект не можа да бъде намерен',
  'That project is already in this space': 'Този проект вече е в този спейс',
  'That project is not in this space': 'Този проект не е в този спейс',
  'That room changed elsewhere. Try again.':
    'Тази стая беше променена другаде. Опитайте пак.',
  'That room has been closed': 'Тази стая беше затворена',
  'That room is not here': 'Тази стая не е тук',
  'That room is not playing a level': 'В тази стая не върви ниво',
  'That scene is no longer here': 'Тази сцена вече не е тук',
  'That space already has an event — open it to change the dates':
    'Този спейс вече има събитие — отворете го, за да смените датите',
  'That space does not exist': 'Този спейс не съществува',
  'That space is archived — unarchive it before giving it an event':
    'Този спейс е архивиран — извадете го от архива, преди да му дадете събитие',
  'That space is not an event': 'Този спейс не е събитие',
  'That space no longer exists': 'Този спейс вече не съществува',
  'That space was changed elsewhere. Try again.':
    'Този спейс беше променен другаде. Опитайте пак.',
  'That tournament changed underneath you. Try again.':
    'Този турнир се промени под вас. Опитайте пак.',
  'That tournament is not running': 'Този турнир не върви',
  'That version could not be read': 'Тази версия не можа да бъде прочетена',
  'That was just sent. Give it a minute before asking for another one.':
    'Това току-що беше изпратено. Изчакайте минута, преди да поискате друго.',
  'That world is gone': 'Този свят го няма',
  'That world is not here': 'Този свят не е тук',
  'That world is not yours to change': 'Този свят не е ваш, за да го променяте',
  'That world is not yours to delete': 'Този свят не е ваш, за да го изтривате',
  'That world was being added elsewhere. Try again.':
    'Този свят точно се добавяше другаде. Опитайте пак.',
  'The email could not be sent just now. Try again in a moment.':
    'Имейлът не можа да бъде изпратен в момента. Опитайте пак след малко.',
  'The magazine changed elsewhere. Try again.':
    'Списанието беше променено другаде. Опитайте пак.',
  'The project could not be written to the new space':
    'Проектът не можа да бъде записан в новия спейс',
  'The radio is not available in this space': 'В този спейс няма радио',
  'There is no door here to change. Place one first.':
    'Тук няма врата за променяне. Първо поставете една.',
  'There is nothing in this world to publish yet':
    'В този свят още няма какво да се публикува',
  'There is nothing saved to copy yet': 'Още няма нищо запазено за копиране',
  'There is nothing saved to move yet': 'Още няма нищо запазено за преместване',
  'There must be at least one backoffice admin':
    'Трябва да има поне един админ на бекофиса',
  'They are not waiting any more': 'Те вече не чакат',
  'This account has no email address': 'Този акаунт няма имейл адрес',
  'This account has no email address to verify against':
    'Този акаунт няма имейл адрес, срещу който да се провери',
  'This event does not let visitors open rooms':
    'Това събитие не позволява на посетителите да отварят стаи',
  'This event does not open extra rooms': 'Това събитие не отваря допълнителни стаи',
  'This space does not overflow rooms': 'Този спейс не отваря преливащи стаи',
  'This space has no subscription': 'Този спейс няма абонамент',
  'This space has no subscription to change': 'Този спейс няма абонамент за променяне',
  'This space has no subscription yet': 'Този спейс още няма абонамент',
  'Too many emails have gone out just now. Try again in a little while.':
    'В момента излязоха твърде много имейли. Опитайте пак след малко.',
  'Unknown capability': 'Непозната способност',
  'Unknown event': 'Непознато събитие',
  'Unknown feature flag': 'Непознат функционален ключ',
  'Unknown member': 'Непознат член',
  'Unknown preset': 'Непознат режим',
  'Unknown radio reach': 'Непознат обхват на радиото',
  'Unknown scope': 'Непознат обхват',
  'Unknown server type': 'Непознат вид сървър',
  'XP is not switched on for this space': 'XP не е включено за този спейс',
  'XP not found': 'XP не е намерено',
  'You already have a challenge waiting with that space':
    'Вече имате чакащо предизвикателство с този спейс',
  'You are already in this space': 'Вече сте в този спейс',
  'You are not in that space': 'Не сте в този спейс',
  'You can only hand a project to somebody in this space':
    'Може да предадете проект само на някого в този спейс',
  'You cannot post to this board': 'Не може да пишете на това табло',
  'You cannot publish worlds in this space':
    'Не може да публикувате светове в този спейс',
  'You cannot remove your own access': 'Не може да си отнемете собствения достъп',
  'You cannot save scenes in this space': 'Не може да запазвате сцени в този спейс',
  'You have already reported this one — it is in the queue':
    'Това вече сте го докладвали — в опашката е',
  'Your account has no email address': 'Вашият акаунт няма имейл адрес',
}

/** The Bulgarian heads. Same keys as `HEADS_DE`. */
const HEADS_BG: Readonly<Record<string, string>> = {
  'Could not ban that guest': 'Този гост не можа да бъде блокиран',
  'Could not check admins': 'Админите не можаха да бъдат проверени',
  'Could not check pending invitations': 'Чакащите покани не можаха да бъдат проверени',
  "Could not check the world's size": 'Размерът на света не можа да бъде проверен',
  'Could not clear read model': 'Читателският модел не можа да бъде изчистен',
  'Could not clear the grants': 'Разрешенията не можаха да бъдат изчистени',
  'Could not close it': 'Не можа да бъде затворено',
  'Could not create the code': 'Кодът не можа да бъде създаден',
  'Could not create the grant': 'Разрешението не можа да бъде създадено',
  'Could not create the invite': 'Поканата не можа да бъде създадена',
}

/**
 * The two tables per language, looked up by locale.
 *
 * English is absent rather than empty: it is already the answer, and a table
 * for it would be a second copy of four hundred sentences that could disagree
 * with the first. Every other locale must appear, so adding one to `LOCALES`
 * fails here until somebody has decided what it says no in.
 */
const TABLES: Record<
  Exclude<Locale, 'en'>,
  { whole: Readonly<Record<string, string>>; heads: Readonly<Record<string, string>> }
> = {
  de: { whole: REFUSALS_DE, heads: HEADS_DE },
  bg: { whole: REFUSALS_BG, heads: HEADS_BG },
}

/**
 * Every English sentence these tables claim to translate.
 *
 * Exported for one reader: the test that checks each one is still said by an
 * action somewhere. See `refusals.test.ts` - the sentence is the key, so a
 * reworded refusal silently stops matching and a translation turns back into
 * English without anything failing.
 *
 * Taken from the German because it is the older table and the tests hold the
 * others to it key for key; which one is the reference does not matter as long
 * as one is.
 */
export const REFUSAL_KEYS: readonly string[] = Object.keys(REFUSALS_DE)
export const REFUSAL_HEAD_KEYS: readonly string[] = Object.keys(HEADS_DE)

/** The tables themselves, for the test that holds them to the same keys. */
export function refusalTables(locale: Exclude<Locale, 'en'>) {
  return TABLES[locale]
}

/**
 * A refusal, in the reader's language.
 *
 * Built once per reader rather than per call, like `translator` in
 * `@kxb/xp/words`, and for the same reason: it is called from a render.
 *
 * English comes back untouched, and so does anything no table has a row for -
 * which is the promise the note at the top makes: nothing ever comes back worse
 * than it went in.
 */
export function refusalIn(locale: Locale): (text: string) => string {
  if (locale === 'en') return (text) => text
  const { whole, heads } = TABLES[locale]

  return (text) => {
    const said = whole[text]
    if (said) return said

    const colon = text.indexOf(': ')
    if (colon < 0) return text
    const head = heads[text.slice(0, colon)]
    return head ? `${head}${text.slice(colon)}` : text
  }
}
