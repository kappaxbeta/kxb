import type { Locale } from '@/domain/i18n/locale'
import type { SpaceCapability } from '@/domain/tenants/events'

/**
 * The settings pages, starting with the one that decides what language the
 * others are in.
 *
 * A dictionary per surface, exactly as the public pages do it: a component
 * imports the one it prints and nothing else ships with it. The interface is
 * the contract - a missing string is a type error here rather than an English
 * word appearing in the middle of a translated page, which is the failure mode
 * a bag of loose keys has and the reason this is not a JSON file.
 *
 * `language.names` is the one table in the app that is deliberately *not*
 * translated: each locale is written in its own language, in all three
 * dictionaries, because a picker that says "German" to an English reader and
 * "Deutsch" to a German one is a picker nobody can use to get out of a language
 * they cannot read.
 */
export interface SettingsDict {
  /** The frame both halves share. */
  title: string
  blurb: string
  tabs: { profile: string; space: string }
  /** The two tabs, in a browser tab. The layout puts the space's name after. */
  metaProfile: string
  metaSpace: string

  /** Your handle, which is what everybody else calls you. */
  username: {
    title: string
    body: string
    label: string
    rules: string
    save: string
    /** `{name}` is the free handle the server found instead. */
    takeInstead: string
    /** `{name}` is the handle that was saved. */
    nowCalled: string
  }

  /** Which animal you are. The animal names themselves are ids the pack ships. */
  avatar: {
    title: string
    body: string
    label: string
    saving: string
    /** `{animal}` is the one on screen. */
    youAre: string
  }

  /** A way back in that does not need an inbox. */
  password: {
    change: string
    set: string
    changeBody: string
    setBody: string
    saved: string
    current: string
    new: string
    first: string
    rules: string
    changeCta: string
    setCta: string
    saving: string
  }

  /**
   * The address the account is reachable at, and the only way to change it.
   *
   * Two jobs in one panel because they are two halves of one question - what
   * address is this, and is it really yours.
   */
  email: {
    title: string
    body: string
    /** The state of the current address, as a chip beside it. */
    verified: string
    unverified: string
    /** The nudge, when it has never been confirmed. */
    confirmBody: string
    confirmCta: string
    sending: string
    /** `{email}` is where the link just went. */
    sent: string
    spam: string
    /** A change is in flight; `{email}` is the address being moved to. */
    pending: string
    /** The change form. */
    change: string
    changeBody: string
    newLabel: string
    currentPassword: string
    changeCta: string
    saving: string
    /** An invited account has no password to prove, so it cannot use the form. */
    needsPassword: string
  }

  /** Which thumb the on-screen stick belongs to. */
  controls: { title: string; body: string; footnote: string }

  /** Music and effects. Never reaches the server - see the component. */
  audio: {
    title: string
    body: string
    music: string
    musicHint: string
    musicVolume: string
    musicVolumeHint: string
    sfx: string
    sfxHint: string
    sfxVolume: string
    sfxVolumeHint: string
    preview: string
    hit: string
    arrive: string
    win: string
    build: string
    footnote: string
  }

  /** The space's own switches. Owner and admin only; everyone else reads them. */
  space: {
    showcase: {
      title: string
      body: string
      toggle: string
      urlLabel: string
      open: string
      on: string
      off: string
    }
    chat: {
      title: string
      body: string
      toggle: string
      label: string
      note: string
      on: string
      off: string
    }
    matches: {
      title: string
      body: string
      toggle: string
      label: string
      note: string
      on: string
      off: string
    }
    perf: {
      title: string
      body: string
      toggle: string
      label: string
      note: string
      on: string
      off: string
    }
    rename: { title: string; body: string; save: string; done: string }
    /** What each switch on the event desk is called. */
    capabilities: Record<SpaceCapability, string>
  }

  /** What the space is holding, read back to whoever runs it. */
  storage: {
    title: string
    body: string
    note: string
    files: string
    /** `{cap}` is the space's ceiling, already formatted. */
    ofCap: string
    saves: string
    nothingStored: string
    inOneGame: string
    /** `{n}` games have written something. */
    acrossGames: string
    lastWritten: string
    neverWritten: string
    byAGame: string
    /** `{n}` saves in one scope. */
    oneSave: string
    manySaves: string
    lastWrittenOn: string
    scopes: { player: string; shared: string; space: string }
    clear: string
    clearAgain: string
    clearAll: string
    /** What clearing everything costs, assembled from the two halves below. */
    eraseAgain: string
    and: string
    onePerson: string
    manyPeople: string
    oneEntry: string
    manyEntries: string
  }

  /** The three cards a host fills in on the day. */
  event: {
    desk: string
    /** `{when}` is the date the doors shut, or open. */
    running: string
    upcoming: string
    ended: string
    on: string
    off: string
    notPartOf: string
    perRoom: string

    header: string
    headerBody: string
    headline: string
    headlineExample: string
    underIt: string
    underItHint: string
    linksHint: string
    /** `{name}` is the link, or `thisLink` when it has none yet. */
    removeLink: string
    thisLink: string
    blurbExample: string
    links: string
    noLinks: string
    linkNameExample: string
    linkName: string
    linkAddress: string
    addLink: string
    linkLimit: string
    saveHeader: string
    headerSaved: string

    publicPage: string
    /** Split around the address, which is a link. */
    publicLead: string
    publicTail: string
    banner: string
    bannerHintLead: string
    bannerStudio: string
    noPicture: string
    theButton: string
    theButtonHint: string
    /** A guest link with no name of its own, in the button's dropdown. */
    unnamedLink: string
    linkOpen: string
    /** `{uses}` of `{max}` spent. */
    linkUsed: string
    notUsable: string
    linkWarning: string
    alsoFeatured: string
    /** Follows the link's own complaint. */
    pickAnother: string
    noBanner: string
    noBanners: string
    bannerNoPicture: string
    noButton: string
    noGuestLinks: string
    savePublic: string
    publicSaved: string
    saving: string
  }

  language: {
    title: string
    /** Why this is on the account rather than in the URL. */
    body: string
    /** The name of each locale, always written in that locale. */
    names: Record<Locale, string>
    /** Under the currently-selected one. */
    current: string
    switching: string
    footnote: string
  }

  /**
   * The people you have decided not to hear.
   *
   * On the profile tab rather than under the space, for the same reason the
   * language is: a block follows the account into every space, so putting it
   * beside one space's settings would suggest it only applied there.
   */
  blocked: {
    title: string
    body: string
    /** When nobody is blocked, which is almost everybody, almost always. */
    none: string
    /**
     * `{name}` is the handle, or `user-a1b2c3` when it cannot be resolved.
     * This is the button's *label*, not its text - see the panel for why the
     * two differ.
     */
    unblock: string
    /** What the button actually says, beside a row that already names them. */
    unblockShort: string
    unblocking: string
    /** Read out after an unblock, for anyone not watching the list. */
    unblocked: string
  }

  /**
   * Closing the account for good.
   *
   * Last on the page and behind two deliberate steps. The copy's whole job is
   * to make what survives and what does not legible *before* the button, not
   * after it - see `closeAccount` for why an event log cannot simply be
   * deleted.
   */
  close: {
    title: string
    body: string
    /** The bullets: what goes, what stays, what it costs. */
    goes: string
    stays: string
    final: string
    /** The way in, and then the confirmation strip it opens. */
    start: string
    confirmTitle: string
    /** `{word}` is the word that has to be typed. */
    confirmHint: string
    /** The word itself. Translated, because it is typed by the reader. */
    confirmWord: string
    confirmLabel: string
    confirm: string
    working: string
    cancel: string
    /** Spaces that have to be dealt with first, listed by name. */
    blockersTitle: string
    blockersBody: string
    /** `{name}` is the space. */
    blockerSpace: string
    /** Shown when it has happened; the redirect follows immediately. */
    done: string
  }
}

export const SETTINGS_EN: SettingsDict = {
  language: {
    title: 'Language',
    body: 'What this app is written in — the rail, the rooms, the buttons in every world. Public pages follow the address you arrived on instead.',
    names: { en: 'English', de: 'Deutsch', bg: 'Български' },
    current: 'In use',
    switching: 'Switching…',
    footnote:
      'Saved on your account as well as in this browser, so the next device you sign in on is already in it. Not everything is translated yet; anything that is not stays in English.',
  },

  blocked: {
    title: 'Blocked people',
    body: 'Anyone here is silent to you. You stop seeing what they say in every space you share, they are not told, and nothing they can do puts them back.',
    none: 'You have not blocked anybody. The button is on any chat line, beside Report.',
    unblock: 'Unblock {name}',
    unblockShort: 'Unblock',
    unblocking: 'Unblocking…',
    unblocked: 'Unblocked. You will see what they say again.',
  },

  close: {
    title: 'Close your account',
    body: 'This ends the account. It cannot be undone and nobody here can undo it for you.',
    goes: 'Your address, your password, your handle and your avatar are erased, and you are signed out of every device.',
    stays: 'What you built stays where it is. A room you furnished, a level you wrote and a message you sent belong to the space around them, and they carry no name of yours afterwards.',
    final: 'The address is released, so you can sign up again with it — as a new person, with nothing of this one.',
    start: 'Close my account',
    confirmTitle: 'This is the last step.',
    confirmHint: 'Type {word} to confirm.',
    confirmWord: 'CLOSE',
    confirmLabel: 'Confirmation word',
    confirm: 'Close it for good',
    working: 'Closing…',
    cancel: 'Keep my account',
    blockersTitle: 'One thing first.',
    blockersBody:
      'You are the last owner of a space other people are in. Make somebody else an owner, or archive it, and then come back here — closing your account cannot leave a space with nobody who can run it.',
    blockerSpace: '{name}',
    done: 'Closed. Signing you out.',
  },

  title: 'Settings',
  blurb: 'Your account on the left, this space on the right.',
  tabs: { profile: 'Your profile', space: 'Space' },
  metaProfile: 'Your profile',
  metaSpace: 'Space settings',

  username: {
    title: 'Your Username',
    body: 'What everyone else sees — in the members list, on the tasks you create, and over your head in the Lounge. Your email address is never shown to anyone else.',
    label: 'Username',
    rules: '2–32 characters: letters, numbers, hyphens and underscores.',
    save: 'Save',
    takeInstead: 'Take {name} instead',
    nowCalled: 'You are now {name}',
  },

  avatar: {
    title: 'Your Avatar',
    body: 'Who you are everywhere — every Lounge you belong to, the Café, and the house. Everyone starts as a penguin.',
    label: 'Avatar',
    saving: 'Saving…',
    youAre: 'You are the {animal}.',
  },

  password: {
    change: 'Change your password',
    set: 'Set a password',
    changeBody:
      'Your password signs you in at any time without waiting for a link. Changing it needs the current one — a live tab on a borrowed laptop should not be enough to lock you out of your own account.',
    setBody:
      'This account has no password yet, so signing back in means waiting for a link in your inbox each time. Setting one now gives you a way straight back.',
    saved: 'Password saved. You stay signed in here.',
    current: 'Current password',
    new: 'New password',
    first: 'Password',
    rules: 'At least 8 characters.',
    changeCta: 'Change password',
    setCta: 'Set password',
    saving: 'Saving…',
  },

  email: {
    title: 'Your email',
    body:
      'Where a sign-in link reaches you, and the address this account is known by. Nobody else in a space ever sees it.',
    verified: 'Confirmed',
    unverified: 'Not confirmed',
    confirmBody:
      'We have never checked that this address reaches you. Send yourself a link and open it — that is what lets you back in if you ever lose your password.',
    confirmCta: 'Send me the link',
    sending: 'Sending…',
    sent: 'Sent to {email}. Open the link in it and this is done.',
    spam:
      'Nothing arrived? Look in spam or promotions — the first mail from a new sender often lands there.',
    pending:
      'Waiting on the link we sent to {email}. Opening it finishes the move — until then, this account keeps the address above.',
    change: 'Change your email',
    changeBody:
      'The new address has to be confirmed before it takes over, and changing it needs your password — an open tab on a borrowed laptop must not be enough to move an account somewhere its owner cannot follow.',
    newLabel: 'New email address',
    currentPassword: 'Current password',
    changeCta: 'Send the confirmation',
    saving: 'Sending…',
    needsPassword:
      'This account has no password yet. Set one above first — it is what proves a change is really you.',
  },

  controls: {
    title: 'Touch controls',
    body: 'Which way round the on-screen stick and buttons go on a phone or tablet, in the lounge, the house, the café and in levels. A right-handed layout steers with the left thumb and acts with the right; left-handed mirrors it.',
    footnote:
      'Saved on this device, not to your account — the tablet you play on and the laptop you work on do not have to agree. You are asked once on your first touch device, and the controls panel in any world has the same switch.',
  },

  audio: {
    title: 'Sound',
    body: 'Music plays while you are anywhere in this space. Effects are the world reacting to you — a hit landing, somebody arriving, a goal, a block going down.',
    music: 'Background music',
    musicHint:
      'A loop that starts after your first click and keeps playing as you move between rooms.',
    musicVolume: 'Music volume',
    musicVolumeHint: 'Mixed low by default so it sits under the game rather than over it.',
    sfx: 'Sound effects',
    sfxHint: 'Hits, arrivals, goals and building, in the lounge, the café, the house and the garden.',
    sfxVolume: 'Effects volume',
    sfxVolumeHint: 'Drag to hear it — each step plays at the level you are setting.',
    preview: 'Preview',
    hit: 'Hit',
    arrive: 'Someone arrives',
    win: 'Goal',
    build: 'Block placed',
    footnote:
      'Saved on this device, not to your account — so the volume you set on a laptop does not follow you onto headphones. The ♪ button in the bottom corner of every page turns the music off without coming back here.',
  },

  space: {
    showcase: {
      title: 'Public Lounge Showcase',
      body: 'Allow anyone with your space link to launch and explore your 3D voxel Lounge without requiring a login.',
      toggle: 'Enable Public Showcase',
      urlLabel: 'Public Showcase URL:',
      open: 'Open Showcase ↗',
      on: 'Lounge showcase enabled publicly!',
      off: 'Lounge showcase set to private.',
    },
    chat: {
      title: 'Lounge Chat',
      body: 'Adds a Chat tab beside the emotes in the lounge. Messages are kept, so people can scroll back through them — and so anyone in the space can report one to us. Guests can read the chat but not post to it.',
      toggle: 'Enable Chat',
      label: 'Enable lounge chat',
      note: 'Turning this off hides the tab and stops new messages. Nothing already said is deleted.',
      on: 'Chat is on. It appears as a tab beside the emotes in the lounge.',
      off: 'Chat is off. What was already said is kept, not deleted.',
    },
    matches: {
      title: 'Matches',
      body: 'The Battle tab, tournaments, and running a level as a fixture from the room you are standing in. Turn it off for a space that is somewhere to be rather than somewhere to compete.',
      toggle: 'Enable Matches',
      label: 'Enable matches',
      note: 'Turning this off hides the Battle tab and refuses new matches. Anything already running plays out, and past results are kept.',
      on: 'Matches are on. The Battle tab is back, and a level can be run as a fixture.',
      off: 'Matches are off. Anything already running finishes; nothing new can be started.',
    },
    perf: {
      title: 'Performance readout',
      body: 'Your own frame rate, how much traffic the room is making, and how long a message takes to reach another player and come back — shown in the corner of the lounge and every room, updated every fifteen seconds. It is measured in your browser, so it answers “is it me or the room” in a way nothing else here can.',
      toggle: 'Show the readout',
      label: 'Show the performance readout',
      note: 'Everybody in this space sees it, and each person sees their own numbers rather than anybody else’s. Turning it off changes what is drawn and nothing else.',
      on: 'The performance readout is on. It appears in the corner of the lounge and every room, and updates every fifteen seconds.',
      off: 'The performance readout is off.',
    },
    rename: {
      title: 'Space Name',
      body: 'Change the display name of this space.',
      save: 'Save Name',
      done: 'Space renamed successfully.',
    },
    capabilities: {
      build: 'Build',
      rooms: 'Create rooms',
      board: 'Pinboard',
      tasks: 'Tasks',
      pages: 'Pages',
      battle: 'Matches',
      agents: 'Creatures',
      perf_display: 'Performance readout',
      stamina: 'Stamina',
    },
  },

  storage: {
    title: 'Storage',
    body: 'What this space is holding — the files its projects were built from, and what those games have written down while people played them.',
    note: 'You can see how much each game has stored and when it last changed. You cannot read what is in it from here.',
    files: 'Files',
    ofCap: 'of {cap} for this space',
    saves: 'Saves',
    nothingStored: 'nothing stored yet',
    inOneGame: 'in one game',
    acrossGames: 'across {n} games',
    lastWritten: 'Last written',
    neverWritten: 'no game has saved anything',
    byAGame: 'by a game, not by you',
    oneSave: '1 save',
    manySaves: '{n} saves',
    lastWrittenOn: 'last written',
    scopes: {
      player: 'Each player, privately',
      shared: 'Each player, visible to the space',
      space: 'The space, together',
    },
    clear: 'Clear the shared world',
    clearAgain: 'Erase the shared world — press again',
    clearAll: 'Clear everything',
    eraseAgain: 'Erase {what} — press again',
    and: ' and ',
    onePerson: "1 person's progress",
    manyPeople: "{n} people's progress",
    oneEntry: '1 board entry',
    manyEntries: '{n} board entries',
  },

  event: {
    desk: 'Event desk',
    running: 'Running until {when}. These take effect immediately.',
    upcoming: 'Opens {when}. Set these before the doors do.',
    ended: 'This event has ended. The room is still here, and visitors can still read it.',
    on: 'On',
    off: 'Off',
    notPartOf: 'Not part of this event',
    perRoom:
      'Per-room settings — who may build where, and how many fit — are on each room, in Rooms.',

    header: 'Event header',
    headerBody:
      'Shown above every page inside this event, over the line saying when it closes. Leave it empty and nothing is shown.',
    headline: 'Headline',
    headlineExample: 'Ludum Dare 58 — 48 hours, one theme',
    underIt: 'Under it',
    underItHint: '— the schedule, the wifi, where the food is',
    linksHint: '— shown as buttons under the text, in this order',
    removeLink: 'Remove {name}',
    thisLink: 'this link',
    blurbExample:
      'Theme drops at 20:00 in Hall 1. Judging Sunday 18:00. Wifi: guest / hackaway.',
    links: 'Links',
    noLinks: 'None yet. The Discord, the schedule, the sponsor — up to eight.',
    linkNameExample: 'Schedule',
    linkName: 'Link name',
    linkAddress: 'Link address',
    addLink: 'Add a link',
    linkLimit: 'Eight is the limit',
    saveHeader: 'Save header',
    headerSaved: 'Saved — it is up in the room now.',

    publicPage: 'Public page',
    publicLead: 'Your event has an address anybody can open, signed in or not: ',
    publicTail: '. This is what it shows.',
    banner: 'Banner',
    bannerHintLead: '— composed in ',
    bannerStudio: 'the banner studio',
    noPicture: ' (no picture yet)',
    theButton: 'The button',
    theButtonHint: '— which guest link it hands out',
    unnamedLink: 'Guest link',
    linkOpen: 'open',
    linkUsed: '{uses}/{max} used',
    notUsable: ' (not usable)',
    linkWarning:
      'Anybody who opens the page can use this link. Give it a use limit or an expiry in the guest panel if that is not what you want — revoking it closes the button immediately.',
    alsoFeatured: ' This event is also on the kxb.team front page.',
    pickAnother: ' The page will say there is no open door until you pick another one.',
    noBanner: 'No banner — just the text',
    noBanners:
      'None saved yet. Compose one in the banner studio and press Save to this space — it turns up here.',
    bannerNoPicture:
      'This one was saved without a picture. Open it in the studio and save it again to bake one.',
    noButton: 'No button — the page just describes the event',
    noGuestLinks:
      'This space has no guest links yet. Make one in the guest panel and it turns up here.',
    savePublic: 'Save public page',
    publicSaved: 'Saved — see the page',
    saving: 'Saving…',
  },
}

export const SETTINGS_DE: SettingsDict = {
  language: {
    title: 'Sprache',
    body: 'In welcher Sprache diese App geschrieben ist — die Leiste, die Räume, die Knöpfe in jeder Welt. Öffentliche Seiten richten sich stattdessen nach der Adresse, über die Sie gekommen sind.',
    names: { en: 'English', de: 'Deutsch', bg: 'Български' },
    current: 'Aktiv',
    switching: 'Wird umgestellt …',
    footnote:
      'Wird in Ihrem Konto und in diesem Browser gespeichert — das nächste Gerät, auf dem Sie sich anmelden, ist also schon darin. Es ist noch nicht alles übersetzt; was fehlt, bleibt auf Englisch.',
  },

  blocked: {
    title: 'Blockierte Personen',
    body: 'Wer hier steht, ist für Sie stumm. Sie sehen in keinem gemeinsamen Space mehr, was diese Person sagt, sie erfährt nichts davon, und sie kann nichts daran ändern.',
    none: 'Sie haben niemanden blockiert. Der Knopf steht an jeder Chat-Zeile, neben „Melden“.',
    unblock: '{name} freigeben',
    unblockShort: 'Freigeben',
    unblocking: 'Wird freigegeben …',
    unblocked: 'Freigegeben. Sie sehen wieder, was diese Person schreibt.',
  },

  close: {
    title: 'Konto schließen',
    body: 'Damit endet das Konto. Das lässt sich nicht rückgängig machen, auch nicht von uns.',
    goes: 'Adresse, Passwort, Name und Avatar werden gelöscht, und Sie werden auf allen Geräten abgemeldet.',
    stays: 'Was Sie gebaut haben, bleibt stehen. Ein eingerichteter Raum, ein geschriebenes Level, eine gesendete Nachricht gehören zum Space um sie herum — und tragen danach keinen Namen von Ihnen mehr.',
    final: 'Die Adresse wird wieder frei, Sie können sich also erneut damit anmelden — als neue Person, ohne etwas von dieser.',
    start: 'Mein Konto schließen',
    confirmTitle: 'Das ist der letzte Schritt.',
    confirmHint: 'Tippen Sie {word}, um zu bestätigen.',
    confirmWord: 'SCHLIESSEN',
    confirmLabel: 'Bestätigungswort',
    confirm: 'Endgültig schließen',
    working: 'Wird geschlossen …',
    cancel: 'Konto behalten',
    blockersTitle: 'Vorher noch eins.',
    blockersBody:
      'Sie sind letzte Inhaberin oder letzter Inhaber eines Space, in dem andere sind. Machen Sie jemanden zur Inhaberin oder archivieren Sie ihn, und kommen Sie dann zurück — ein geschlossenes Konto darf keinen Space ohne Verantwortliche zurücklassen.',
    blockerSpace: '{name}',
    done: 'Geschlossen. Sie werden abgemeldet.',
  },

  title: 'Einstellungen',
  blurb: 'Links Ihr Konto, rechts dieser Space.',
  tabs: { profile: 'Ihr Profil', space: 'Space' },
  metaProfile: 'Ihr Profil',
  metaSpace: 'Space-Einstellungen',

  username: {
    title: 'Ihr Benutzername',
    body: 'Das sehen alle anderen — in der Mitgliederliste, an den Aufgaben, die Sie anlegen, und über Ihrem Kopf in der Lounge. Ihre E-Mail-Adresse wird niemandem gezeigt.',
    label: 'Benutzername',
    rules: '2–32 Zeichen: Buchstaben, Ziffern, Bindestriche und Unterstriche.',
    save: 'Speichern',
    takeInstead: 'Stattdessen {name} nehmen',
    nowCalled: 'Sie heißen jetzt {name}',
  },

  avatar: {
    title: 'Ihr Avatar',
    body: 'Wer Sie überall sind — in jeder Lounge, zu der Sie gehören, im Café und im Haus. Alle fangen als Pinguin an.',
    label: 'Avatar',
    saving: 'Wird gespeichert …',
    youAre: 'Sie sind {animal}.',
  },

  password: {
    change: 'Passwort ändern',
    set: 'Ein Passwort festlegen',
    changeBody:
      'Mit einem Passwort melden Sie sich jederzeit an, ohne auf einen Link zu warten. Zum Ändern brauchen Sie das aktuelle — ein offener Tab auf einem geliehenen Laptop darf nicht reichen, um Sie aus Ihrem eigenen Konto auszusperren.',
    setBody:
      'Dieses Konto hat noch kein Passwort, die Anmeldung braucht also jedes Mal einen Link im Postfach. Mit einem Passwort kommen Sie direkt zurück.',
    saved: 'Passwort gespeichert. Sie bleiben hier angemeldet.',
    current: 'Aktuelles Passwort',
    new: 'Neues Passwort',
    first: 'Passwort',
    rules: 'Mindestens 8 Zeichen.',
    changeCta: 'Passwort ändern',
    setCta: 'Passwort festlegen',
    saving: 'Wird gespeichert …',
  },

  email: {
    title: 'Ihre E-Mail-Adresse',
    body:
      'Hierhin geht ein Anmeldelink, und unter dieser Adresse ist Ihr Konto bekannt. Andere im Space sehen sie nie.',
    verified: 'Bestätigt',
    unverified: 'Nicht bestätigt',
    confirmBody:
      'Wir haben nie geprüft, ob diese Adresse Sie erreicht. Schicken Sie sich einen Link und öffnen Sie ihn — genau das bringt Sie zurück ins Konto, falls Sie Ihr Passwort einmal verlieren.',
    confirmCta: 'Link schicken',
    sending: 'Wird gesendet …',
    sent: 'An {email} geschickt. Öffnen Sie den Link darin, dann ist es erledigt.',
    spam:
      'Nichts angekommen? Sehen Sie im Spam- oder Werbeordner nach — die erste Mail von einem neuen Absender landet oft dort.',
    pending:
      'Wir warten auf den Link, den wir an {email} geschickt haben. Ihn zu öffnen schließt den Wechsel ab — bis dahin behält das Konto die Adresse oben.',
    change: 'E-Mail-Adresse ändern',
    changeBody:
      'Die neue Adresse muss bestätigt werden, bevor sie übernimmt, und für die Änderung brauchen Sie Ihr Passwort — ein offener Tab auf einem geliehenen Laptop darf nicht reichen, um ein Konto dorthin zu verschieben, wohin sein Besitzer nicht folgen kann.',
    newLabel: 'Neue E-Mail-Adresse',
    currentPassword: 'Aktuelles Passwort',
    changeCta: 'Bestätigung senden',
    saving: 'Wird gesendet …',
    needsPassword:
      'Dieses Konto hat noch kein Passwort. Legen Sie oben zuerst eines fest — damit weisen Sie nach, dass die Änderung wirklich von Ihnen kommt.',
  },

  controls: {
    title: 'Touch-Steuerung',
    body: 'Wie herum Stick und Knöpfe auf Handy oder Tablet liegen — in der Lounge, im Haus, im Café und in Leveln. Rechtshändig lenkt mit dem linken Daumen und handelt mit dem rechten; linkshändig spiegelt das.',
    footnote:
      'Auf diesem Gerät gespeichert, nicht im Konto — das Tablet zum Spielen und der Laptop zum Arbeiten müssen sich nicht einig sein. Sie werden auf Ihrem ersten Touch-Gerät einmal gefragt, und die Steuerungstafel in jeder Welt hat denselben Schalter.',
  },

  audio: {
    title: 'Ton',
    body: 'Musik läuft, solange Sie irgendwo in diesem Space sind. Effekte sind die Welt, die auf Sie reagiert — ein Treffer, jemand kommt an, ein Tor, ein Block, der gesetzt wird.',
    music: 'Hintergrundmusik',
    musicHint:
      'Eine Schleife, die nach Ihrem ersten Klick beginnt und weiterläuft, während Sie zwischen Räumen wechseln.',
    musicVolume: 'Musiklautstärke',
    musicVolumeHint:
      'Standardmäßig leise abgemischt, damit sie unter dem Spiel liegt und nicht darüber.',
    sfx: 'Soundeffekte',
    sfxHint: 'Treffer, Ankünfte, Tore und Bauen — in der Lounge, im Café, im Haus und im Garten.',
    sfxVolume: 'Effektlautstärke',
    sfxVolumeHint: 'Ziehen und hören — jeder Schritt spielt auf der Stufe, die Sie einstellen.',
    preview: 'Probe',
    hit: 'Treffer',
    arrive: 'Jemand kommt an',
    win: 'Tor',
    build: 'Block gesetzt',
    footnote:
      'Auf diesem Gerät gespeichert, nicht im Konto — die Lautstärke vom Laptop folgt Ihnen also nicht auf die Kopfhörer. Der ♪-Knopf in der unteren Ecke jeder Seite schaltet die Musik aus, ohne dass Sie hierher zurückmüssen.',
  },

  space: {
    showcase: {
      title: 'Öffentliche Lounge-Schau',
      body: 'Erlaubt allen mit Ihrem Space-Link, Ihre 3D-Voxel-Lounge ohne Anmeldung zu starten und zu erkunden.',
      toggle: 'Öffentliche Schau aktivieren',
      urlLabel: 'Adresse der öffentlichen Schau:',
      open: 'Schau öffnen ↗',
      on: 'Die Lounge-Schau ist jetzt öffentlich!',
      off: 'Die Lounge-Schau ist jetzt privat.',
    },
    chat: {
      title: 'Lounge-Chat',
      body: 'Fügt neben den Emotes in der Lounge einen Chat-Tab hinzu. Nachrichten bleiben erhalten, damit man zurückscrollen kann — und damit sie gemeldet werden können. Gäste können mitlesen, aber nichts schreiben.',
      toggle: 'Chat aktivieren',
      label: 'Lounge-Chat aktivieren',
      note: 'Ausschalten blendet den Tab aus und stoppt neue Nachrichten. Nichts bereits Gesagtes wird gelöscht.',
      on: 'Der Chat ist an. Er erscheint als Tab neben den Emotes in der Lounge.',
      off: 'Der Chat ist aus. Was gesagt wurde, bleibt erhalten und wird nicht gelöscht.',
    },
    matches: {
      title: 'Matches',
      body: 'Der Battle-Tab, Turniere, und ein Level als Match aus dem Raum starten, in dem Sie stehen. Schalten Sie es aus für einen Space, in dem man sein und nicht sich messen will.',
      toggle: 'Matches aktivieren',
      label: 'Matches aktivieren',
      note: 'Ausschalten blendet den Battle-Tab aus und lehnt neue Matches ab. Was schon läuft, wird zu Ende gespielt, und frühere Ergebnisse bleiben erhalten.',
      on: 'Matches sind an. Der Battle-Tab ist zurück, und ein Level kann als Match laufen.',
      off: 'Matches sind aus. Was läuft, endet noch; Neues kann nicht gestartet werden.',
    },
    perf: {
      title: 'Leistungsanzeige',
      body: 'Ihre eigene Bildrate, wie viel Verkehr der Raum erzeugt und wie lange eine Nachricht zu einer anderen Person und zurück braucht — in der Ecke der Lounge und jedes Raums, alle fünfzehn Sekunden aktualisiert. Gemessen wird in Ihrem Browser, deshalb beantwortet sie „liegt es an mir oder am Raum“ wie sonst nichts hier.',
      toggle: 'Anzeige einblenden',
      label: 'Leistungsanzeige einblenden',
      note: 'Alle in diesem Space sehen sie, und jede Person sieht ihre eigenen Zahlen statt fremder. Ausschalten ändert nur, was gezeichnet wird.',
      on: 'Die Leistungsanzeige ist an. Sie erscheint in der Ecke der Lounge und jedes Raums und aktualisiert sich alle fünfzehn Sekunden.',
      off: 'Die Leistungsanzeige ist aus.',
    },
    rename: {
      title: 'Name des Space',
      body: 'Den angezeigten Namen dieses Space ändern.',
      save: 'Namen speichern',
      done: 'Der Space wurde umbenannt.',
    },
    capabilities: {
      build: 'Bauen',
      rooms: 'Räume anlegen',
      board: 'Pinnwand',
      tasks: 'Aufgaben',
      pages: 'Seiten',
      battle: 'Matches',
      agents: 'Tiere',
      perf_display: 'Leistungsanzeige',
      stamina: 'Ausdauer',
    },
  },

  storage: {
    title: 'Speicher',
    body: 'Was dieser Space hält — die Dateien, aus denen seine Projekte gebaut sind, und was diese Spiele während des Spielens aufgeschrieben haben.',
    note: 'Sie sehen, wie viel jedes Spiel gespeichert hat und wann es sich zuletzt geändert hat. Was darin steht, können Sie von hier aus nicht lesen.',
    files: 'Dateien',
    ofCap: 'von {cap} für diesen Space',
    saves: 'Spielstände',
    nothingStored: 'noch nichts gespeichert',
    inOneGame: 'in einem Spiel',
    acrossGames: 'in {n} Spielen',
    lastWritten: 'Zuletzt geschrieben',
    neverWritten: 'kein Spiel hat etwas gespeichert',
    byAGame: 'von einem Spiel, nicht von Ihnen',
    oneSave: '1 Spielstand',
    manySaves: '{n} Spielstände',
    lastWrittenOn: 'zuletzt geschrieben',
    scopes: {
      player: 'Jede Person, privat',
      shared: 'Jede Person, für den Space sichtbar',
      space: 'Der Space, gemeinsam',
    },
    clear: 'Die gemeinsame Welt leeren',
    clearAgain: 'Gemeinsame Welt löschen — nochmal drücken',
    clearAll: 'Alles leeren',
    eraseAgain: '{what} löschen — nochmal drücken',
    and: ' und ',
    onePerson: 'den Fortschritt von 1 Person',
    manyPeople: 'den Fortschritt von {n} Personen',
    oneEntry: '1 Eintrag auf der Tafel',
    manyEntries: '{n} Einträge auf der Tafel',
  },

  event: {
    desk: 'Event-Pult',
    running: 'Läuft bis {when}. Das wirkt sofort.',
    upcoming: 'Öffnet {when}. Stellen Sie das ein, bevor die Türen aufgehen.',
    ended: 'Dieses Event ist vorbei. Der Raum steht noch, und Besuchende können weiterlesen.',
    on: 'An',
    off: 'Aus',
    notPartOf: 'Nicht Teil dieses Events',
    perRoom:
      'Einstellungen pro Raum — wer wo bauen darf und wie viele hineinpassen — stehen am jeweiligen Raum, unter Räume.',

    header: 'Event-Kopfzeile',
    headerBody:
      'Steht über jeder Seite in diesem Event, über der Zeile mit dem Ende. Leer lassen, und es wird nichts angezeigt.',
    headline: 'Überschrift',
    headlineExample: 'Ludum Dare 58 — 48 Stunden, ein Thema',
    underIt: 'Darunter',
    underItHint: '— der Zeitplan, das WLAN, wo es Essen gibt',
    linksHint: '— als Knöpfe unter dem Text, in dieser Reihenfolge',
    removeLink: '{name} entfernen',
    thisLink: 'diesen Link',
    blurbExample:
      'Das Thema kommt um 20:00 in Halle 1. Jury am Sonntag um 18:00. WLAN: guest / hackaway.',
    links: 'Links',
    noLinks: 'Noch keine. Der Discord, der Zeitplan, der Sponsor — bis zu acht.',
    linkNameExample: 'Zeitplan',
    linkName: 'Name des Links',
    linkAddress: 'Adresse des Links',
    addLink: 'Link hinzufügen',
    linkLimit: 'Acht ist die Grenze',
    saveHeader: 'Kopfzeile speichern',
    headerSaved: 'Gespeichert — sie steht jetzt im Raum.',

    publicPage: 'Öffentliche Seite',
    publicLead:
      'Ihr Event hat eine Adresse, die jede und jeder öffnen kann, angemeldet oder nicht: ',
    publicTail: '. Das hier ist, was sie zeigt.',
    banner: 'Banner',
    bannerHintLead: '— gebaut im ',
    bannerStudio: 'Banner-Studio',
    noPicture: ' (noch kein Bild)',
    theButton: 'Der Knopf',
    theButtonHint: '— welchen Gastlink er weitergibt',
    unnamedLink: 'Gastlink',
    linkOpen: 'offen',
    linkUsed: '{uses}/{max} genutzt',
    notUsable: ' (nicht nutzbar)',
    linkWarning:
      'Alle, die die Seite öffnen, können diesen Link benutzen. Geben Sie ihm im Gastbereich ein Nutzungslimit oder ein Ablaufdatum, wenn Sie das nicht wollen — Zurückziehen schließt den Knopf sofort.',
    alsoFeatured: ' Dieses Event steht außerdem auf der Startseite von kxb.team.',
    pickAnother:
      ' Die Seite sagt, dass es keine offene Tür gibt, bis Sie einen anderen wählen.',
    noBanner: 'Kein Banner — nur der Text',
    noBanners:
      'Noch keins gespeichert. Bauen Sie eins im Banner-Studio und drücken Sie „In diesem Space speichern“ — dann taucht es hier auf.',
    bannerNoPicture:
      'Dieses wurde ohne Bild gespeichert. Öffnen Sie es im Studio und speichern Sie es erneut, damit eines gebacken wird.',
    noButton: 'Kein Knopf — die Seite beschreibt das Event nur',
    noGuestLinks:
      'Dieser Space hat noch keine Gastlinks. Legen Sie einen im Gastbereich an, dann taucht er hier auf.',
    savePublic: 'Öffentliche Seite speichern',
    publicSaved: 'Gespeichert — zur Seite',
    saving: 'Wird gespeichert …',
  },
}

export const SETTINGS_BG: SettingsDict = {
  language: {
    title: 'Език',
    body: 'На какъв език е написано това приложение — лентата, стаите, бутоните във всеки свят. Публичните страници вместо това следват адреса, през който сте дошли.',
    names: { en: 'English', de: 'Deutsch', bg: 'Български' },
    current: 'Активен',
    switching: 'Превключва се…',
    footnote:
      'Запазва се и в акаунта ви, и в този браузър, така че следващото устройство, на което влезете, вече е на него. Още не всичко е преведено; каквото не е, остава на английски.',
  },

  blocked: {
    title: 'Блокирани хора',
    body: 'Който е тук, за вас мълчи. Спирате да виждате какво пише във всеки общ спейс, човекът не разбира и не може да го върне.',
    none: 'Не сте блокирали никого. Бутонът е на всеки ред в чата, до „Докладвай“.',
    unblock: 'Отблокирай {name}',
    unblockShort: 'Отблокирай',
    unblocking: 'Отблокира се…',
    unblocked: 'Отблокиран. Пак ще виждате какво пише.',
  },

  close: {
    title: 'Закриване на акаунта',
    body: 'Това слага край на акаунта. Не може да се върне — нито от вас, нито от нас.',
    goes: 'Адресът, паролата, името и аватарът се изтриват, и излизате от всички устройства.',
    stays: 'Каквото сте построили, остава. Обзаведена стая, написано ниво, изпратено съобщение принадлежат на спейса около тях — и след това не носят ваше име.',
    final: 'Адресът се освобождава, така че може да се регистрирате пак с него — като нов човек, без нищо от този.',
    start: 'Закрий акаунта ми',
    confirmTitle: 'Това е последната стъпка.',
    confirmHint: 'Напишете {word}, за да потвърдите.',
    confirmWord: 'ЗАКРИЙ',
    confirmLabel: 'Дума за потвърждение',
    confirm: 'Закрий окончателно',
    working: 'Закрива се…',
    cancel: 'Запази акаунта ми',
    blockersTitle: 'Първо едно нещо.',
    blockersBody:
      'Вие сте последният собственик на спейс, в който има други хора. Направете някого собственик или архивирайте спейса и се върнете тук — закрит акаунт не бива да оставя спейс без кой да го води.',
    blockerSpace: '{name}',
    done: 'Закрит. Излизате от профила.',
  },

  title: 'Настройки',
  blurb: 'Вляво акаунтът ви, вдясно този спейс.',
  tabs: { profile: 'Вашият профил', space: 'Спейс' },
  metaProfile: 'Вашият профил',
  metaSpace: 'Настройки на спейса',

  username: {
    title: 'Вашето потребителско име',
    body: 'Това виждат всички останали — в списъка с членове, върху задачите, които създавате, и над главата ви в лоунджа. Имейлът ви не се показва на никого другиго.',
    label: 'Потребителско име',
    rules: '2–32 знака: букви, цифри, тирета и долни черти.',
    save: 'Запази',
    takeInstead: 'Вземете {name} вместо това',
    nowCalled: 'Вече сте {name}',
  },

  avatar: {
    title: 'Вашият аватар',
    body: 'Кой сте навсякъде — във всеки лоундж, към който принадлежите, в кафенето и в къщата. Всички започват като пингвин.',
    label: 'Аватар',
    saving: 'Запазва се…',
    youAre: 'Вие сте {animal}.',
  },

  password: {
    change: 'Смяна на паролата',
    set: 'Задайте парола',
    changeBody:
      'С парола влизате по всяко време, без да чакате линк. За смяната трябва текущата — отворен таб на зает лаптоп не бива да стига, за да ви заключи вън от собствения ви акаунт.',
    setBody:
      'Този акаунт още няма парола, така че всяко влизане чака линк в пощата. Задайте една сега и си имате пряк път обратно.',
    saved: 'Паролата е запазена. Оставате влезли тук.',
    current: 'Текуща парола',
    new: 'Нова парола',
    first: 'Парола',
    rules: 'Поне 8 знака.',
    changeCta: 'Смени паролата',
    setCta: 'Задай парола',
    saving: 'Запазва се…',
  },

  email: {
    title: 'Вашият имейл',
    body:
      'Там ви стига линкът за влизане, и под този адрес е познат акаунтът ви. Никой друг в спейса не го вижда.',
    verified: 'Потвърден',
    unverified: 'Непотвърден',
    confirmBody:
      'Никога не сме проверявали дали този адрес стига до вас. Пратете си линк и го отворете — точно това ви връща обратно, ако някога загубите паролата си.',
    confirmCta: 'Прати ми линка',
    sending: 'Изпраща се…',
    sent: 'Изпратено до {email}. Отворете линка вътре и това е готово.',
    spam:
      'Нищо не дойде? Погледнете в спам или в промоции — първото писмо от нов подател често пада там.',
    pending:
      'Чакаме линка, който изпратихме до {email}. Отворите ли го, смяната приключва — дотогава акаунтът пази адреса отгоре.',
    change: 'Смяна на имейла',
    changeBody:
      'Новият адрес трябва да бъде потвърден, преди да поеме, а за смяната трябва паролата ви — отворен таб на зает лаптоп не бива да стига, за да премести акаунт там, където собственикът му не може да го последва.',
    newLabel: 'Нов имейл адрес',
    currentPassword: 'Текуща парола',
    changeCta: 'Прати потвърждението',
    saving: 'Изпраща се…',
    needsPassword:
      'Този акаунт още няма парола. Задайте една по-горе — тя е доказателството, че смяната наистина е от вас.',
  },

  controls: {
    title: 'Управление с докосване',
    body: 'Как са разположени стикът и бутоните на телефон или таблет — в лоунджа, в къщата, в кафенето и в нивата. Дясната подредба управлява с левия палец и действа с десния; лявата я огледално обръща.',
    footnote:
      'Запазва се на това устройство, не в акаунта ви — таблетът, на който играете, и лаптопът, на който работите, не са длъжни да са съгласни. Питаме ви веднъж на първото ви устройство с докосване, а панелът с управлението във всеки свят има същия ключ.',
  },

  audio: {
    title: 'Звук',
    body: 'Музиката свири, докато сте където и да е в този спейс. Ефектите са светът, който ви отговаря — попадение, някой пристига, гол, положен блок.',
    music: 'Фонова музика',
    musicHint:
      'Примка, която тръгва след първото ви щракване и продължава, докато се движите между стаите.',
    musicVolume: 'Сила на музиката',
    musicVolumeHint: 'По подразбиране е смесена тихо, за да стои под играта, а не над нея.',
    sfx: 'Звукови ефекти',
    sfxHint: 'Попадения, пристигания, голове и строеж — в лоунджа, кафенето, къщата и градината.',
    sfxVolume: 'Сила на ефектите',
    sfxVolumeHint: 'Влачете и слушайте — всяка стъпка свири на нивото, което задавате.',
    preview: 'Проба',
    hit: 'Попадение',
    arrive: 'Някой пристига',
    win: 'Гол',
    build: 'Положен блок',
    footnote:
      'Запазва се на това устройство, не в акаунта ви — така силата, зададена на лаптоп, не ви следва в слушалките. Бутонът ♪ в долния ъгъл на всяка страница спира музиката, без да се връщате тук.',
  },

  space: {
    showcase: {
      title: 'Публична витрина на лоунджа',
      body: 'Позволява на всеки с линка към спейса ви да пусне и разгледа вашия 3D воксел лоундж, без да влиза с акаунт.',
      toggle: 'Включи публичната витрина',
      urlLabel: 'Адрес на публичната витрина:',
      open: 'Отвори витрината ↗',
      on: 'Витрината на лоунджа вече е публична!',
      off: 'Витрината на лоунджа вече е частна.',
    },
    chat: {
      title: 'Чат в лоунджа',
      body: 'Добавя таб Чат до жестовете в лоунджа. Съобщенията се пазят, за да може да се превърта назад през тях — и за да може всеки в спейса да ни докладва някое. Гостите могат да четат чата, но не и да пишат в него.',
      toggle: 'Включи чата',
      label: 'Включи чата в лоунджа',
      note: 'Изключването скрива таба и спира новите съобщения. Нищо вече казано не се изтрива.',
      on: 'Чатът е включен. Появява се като таб до жестовете в лоунджа.',
      off: 'Чатът е изключен. Казаното се пази, не се изтрива.',
    },
    matches: {
      title: 'Мачове',
      body: 'Табът Битка, турнирите, и пускането на ниво като мач от стаята, в която стоите. Изключете го за спейс, който е място, където да си, а не където да се мериш.',
      toggle: 'Включи мачовете',
      label: 'Включи мачовете',
      note: 'Изключването скрива таба Битка и отказва нови мачове. Каквото вече върви, се доиграва, а миналите резултати се пазят.',
      on: 'Мачовете са включени. Табът Битка се върна и нивото може да върви като мач.',
      off: 'Мачовете са изключени. Каквото върви, свършва; ново не може да се започне.',
    },
    perf: {
      title: 'Показател за производителност',
      body: 'Собствената ви кадрова честота, колко трафик прави стаята и колко време отнема на съобщение да стигне до друг играч и да се върне — показва се в ъгъла на лоунджа и на всяка стая, обновявано на всеки петнайсет секунди. Мери се във вашия браузър, затова отговаря на „аз ли съм или стаята“ както нищо друго тук.',
      toggle: 'Покажи показателя',
      label: 'Покажи показателя за производителност',
      note: 'Всички в този спейс го виждат, а всеки вижда своите числа, не чуждите. Изключването променя само какво се рисува.',
      on: 'Показателят за производителност е включен. Появява се в ъгъла на лоунджа и на всяка стая и се обновява на всеки петнайсет секунди.',
      off: 'Показателят за производителност е изключен.',
    },
    rename: {
      title: 'Име на спейса',
      body: 'Смяна на показваното име на този спейс.',
      save: 'Запази името',
      done: 'Спейсът беше преименуван.',
    },
    capabilities: {
      build: 'Строеж',
      rooms: 'Създаване на стаи',
      board: 'Табло',
      tasks: 'Задачи',
      pages: 'Страници',
      battle: 'Мачове',
      agents: 'Животни',
      perf_display: 'Показател за производителност',
      stamina: 'Издръжливост',
    },
  },

  storage: {
    title: 'Хранилище',
    body: 'Какво държи този спейс — файловете, от които са построени проектите му, и какво тези игри са записали, докато хората са ги играли.',
    note: 'Виждате колко е запазила всяка игра и кога се е променило за последно. Какво пише вътре не може да прочетете оттук.',
    files: 'Файлове',
    ofCap: 'от {cap} за този спейс',
    saves: 'Записи',
    nothingStored: 'още нищо не е запазено',
    inOneGame: 'в една игра',
    acrossGames: 'в {n} игри',
    lastWritten: 'Последно писано',
    neverWritten: 'нито една игра не е запазила нищо',
    byAGame: 'от игра, не от вас',
    oneSave: '1 запис',
    manySaves: '{n} записа',
    lastWrittenOn: 'последно писано',
    scopes: {
      player: 'Всеки играч, лично',
      shared: 'Всеки играч, видимо за спейса',
      space: 'Спейсът, заедно',
    },
    clear: 'Изчисти общия свят',
    clearAgain: 'Изтрий общия свят — натиснете пак',
    clearAll: 'Изчисти всичко',
    eraseAgain: 'Изтрий {what} — натиснете пак',
    and: ' и ',
    onePerson: 'напредъка на 1 човек',
    manyPeople: 'напредъка на {n} души',
    oneEntry: '1 запис на таблото',
    manyEntries: '{n} записа на таблото',
  },

  event: {
    desk: 'Гише на събитието',
    running: 'Тече до {when}. Това влиза в сила веднага.',
    upcoming: 'Отваря {when}. Задайте това, преди вратите да отворят.',
    ended: 'Това събитие приключи. Стаята още стои и посетителите още могат да четат.',
    on: 'Вкл.',
    off: 'Изкл.',
    notPartOf: 'Не е част от това събитие',
    perRoom:
      'Настройките по стаи — кой къде може да строи и колко души събира — са при самата стая, под Стаи.',

    header: 'Заглавка на събитието',
    headerBody:
      'Стои над всяка страница в това събитие, над реда, който казва кога затваря. Оставите ли я празна, не се показва нищо.',
    headline: 'Заглавие',
    headlineExample: 'Ludum Dare 58 — 48 часа, една тема',
    underIt: 'Под него',
    underItHint: '— програмата, wifi-то, къде е храната',
    linksHint: '— показани като бутони под текста, в този ред',
    removeLink: 'Премахни {name}',
    thisLink: 'този линк',
    blurbExample:
      'Темата пада в 20:00 в Зала 1. Оценяване в неделя от 18:00. Wifi: guest / hackaway.',
    links: 'Линкове',
    noLinks: 'Още няма. Дискордът, програмата, спонсорът — до осем.',
    linkNameExample: 'Програма',
    linkName: 'Име на линка',
    linkAddress: 'Адрес на линка',
    addLink: 'Добави линк',
    linkLimit: 'Осем е границата',
    saveHeader: 'Запази заглавката',
    headerSaved: 'Запазено — вече стои в стаята.',

    publicPage: 'Публична страница',
    publicLead: 'Събитието ви има адрес, който всеки може да отвори, влязъл или не: ',
    publicTail: '. Ето какво показва.',
    banner: 'Банер',
    bannerHintLead: '— съставен в ',
    bannerStudio: 'банер студиото',
    noPicture: ' (още няма картинка)',
    theButton: 'Бутонът',
    theButtonHint: '— кой гост-линк раздава',
    unnamedLink: 'Гост-линк',
    linkOpen: 'отворен',
    linkUsed: '{uses}/{max} използвани',
    notUsable: ' (не може да се ползва)',
    linkWarning:
      'Всеки, който отвори страницата, може да ползва този линк. Дайте му лимит на употребите или срок в панела за гости, ако не искате това — оттеглянето затваря бутона веднага.',
    alsoFeatured: ' Това събитие стои и на началната страница на kxb.team.',
    pickAnother: ' Страницата ще казва, че няма отворена врата, докато не изберете друг.',
    noBanner: 'Без банер — само текстът',
    noBanners:
      'Още няма запазен. Съставете един в банер студиото и натиснете „Запази в този спейс“ — ще се появи тук.',
    bannerNoPicture:
      'Този беше запазен без картинка. Отворете го в студиото и го запазете пак, за да се изпече една.',
    noButton: 'Без бутон — страницата само описва събитието',
    noGuestLinks:
      'Този спейс още няма гост-линкове. Направете един в панела за гости и ще се появи тук.',
    savePublic: 'Запази публичната страница',
    publicSaved: 'Запазено — към страницата',
    saving: 'Запазва се…',
  },
}

const DICTS: Record<Locale, SettingsDict> = {
  en: SETTINGS_EN,
  de: SETTINGS_DE,
  bg: SETTINGS_BG,
}

export function settingsDict(locale: Locale): SettingsDict {
  return DICTS[locale]
}
