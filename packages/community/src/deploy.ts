import type { Guide } from './guide'
import type { Text } from './text'

/**
 * The poor man's stack: kxb on one cheap box.
 *
 * The starter guide ends where hosting decisions begin, on purpose - the
 * community repository ships no deploy scripts because they would describe
 * our servers, not yours. This is the other half: a generic recipe for the
 * cheapest deployment that is actually fine, written so the whole bill stays
 * around a tenner a month. Nothing in here is specific to our infrastructure;
 * all of it is specific to being broke, which is the better constraint.
 */
export const DEPLOY: Text<Guide> = {
  en: {
    title: 'Deploy it: the poor man’s stack',
    standfirst:
      'One small VPS, Docker, Caddy, self-hosted Supabase, and a domain - the whole thing for about the price of two coffees a month, and honest about where it stops scaling.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'What "poor man" buys you',
        body: [
          'Everything on one small server: the app, the database, auth, realtime, TLS. No managed services, no registry, no CI - you build on the box and restart. This is not the compromise it sounds like: a space holds twelve people, realtime is the hungry part, and one honest VPS carries several busy rooms before anything creaks.',
          'What it deliberately is not: highly available. One box means one box - a reboot is a minute of downtime and a dead disk without backups is the end. The backups step below is therefore not optional, and the guide says so again when it gets there.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The recipe',
        steps: [
          {
            title: 'Rent the box and point a domain at it',
            cost: '~€5-8/month for the VPS, ~€10/year for the domain',
            body: [
              'A small cloud server with 4GB RAM - the Supabase stack is the hungry tenant, and 2GB plus swap works until the day it does not. Any of the budget providers do; pick one with a data centre near your players.',
              'Two DNS A records at your registrar: one for the app (app.example.com or the bare domain) and one for the API (api.example.com), both pointing at the box.',
            ],
          },
          {
            title: 'Lock the door before you furnish the room',
            takes: 'Twenty minutes, once',
            body: [
              'SSH keys only (password login off), a firewall allowing exactly 22, 80 and 443, and automatic security updates. Docker and Docker Compose from the official install script.',
            ],
            watch: 'Do this before installing anything with secrets in it. A database that was public for an afternoon stays leaked forever.',
          },
          {
            title: 'Stand up self-hosted Supabase',
            where: 'The official supabase/docker compose setup',
            body: [
              'Clone their docker directory, then change every secret before first start: the Postgres password, the JWT secret, and the anon and service keys generated from it. The defaults are publicly known - a stack started with them is open to anybody who read the same README.',
              'Keep Studio and anything administrative off the public ports - reachable through an SSH tunnel or behind auth in the reverse proxy, never bare. Then apply the migrations from the kxb repository against your database.',
            ],
          },
          {
            title: 'Build and run the app on the box',
            body: [
              'The repository ships a Dockerfile; the poor man’s registry is no registry - build the image on the server. One thing must be right at build time, not at run time: the NEXT_PUBLIC_* variables (your Supabase URL and anon key) are baked into the client bundle during the build. Setting them afterwards changes nothing and fails silently.',
              'Run the container with restart unless-stopped, listening only on localhost - the proxy is the one with the public face.',
            ],
            watch: 'NEXT_PUBLIC_* at build time is the classic trap in this whole recipe. If auth mysteriously talks to the wrong host, you rebuilt with the wrong env.',
          },
          {
            title: 'Put Caddy in front',
            body: [
              'Caddy exists because of setups like this: a few lines mapping your two hostnames to the two local ports, and it fetches and renews the TLS certificates by itself. There is genuinely nothing else to do - no certbot, no cron, no openssl.',
            ],
          },
          {
            title: 'Give GoTrue a way to send mail',
            body: [
              'Signup confirmations need SMTP. A free transactional-mail tier is plenty at this scale - configure its credentials in the Supabase auth service and send a test signup before telling anybody the site exists.',
              'Know the default send limits: self-hosted GoTrue ships conservative rate caps (on the order of tens of mails per hour, with a cooldown per address). Fine for a quiet launch; raise them deliberately when a real crowd arrives, not in a panic while it does.',
            ],
          },
          {
            title: 'Backups, then call it deployed',
            body: [
              'A nightly pg_dump, compressed, copied off the box - a €1 storage box or any object storage does. Test the restore once, on a day you do not need it. Day-two operations are then one loop: pull, rebuild, restart, and the deploy is whatever minute you ran it in.',
              'Before the domain goes anywhere public: the imprint placeholders from the starter guide, and the legal shell chapter. A deployed site is a published site.',
            ],
            watch: 'An untested backup is a hope, not a backup. Restore it once into a scratch database and look at the tables.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'The whole bill',
        costs: [
          { what: 'VPS, 4GB', amount: '€5-8/month' },
          { what: 'Domain', amount: '~€10/year' },
          { what: 'TLS certificates', amount: '€0', note: 'Caddy and Let’s Encrypt.' },
          { what: 'Transactional mail', amount: '€0', note: 'Free tier covers a small launch.' },
          { what: 'Backup storage', amount: '~€1/month' },
          { what: 'Total', amount: 'Under €10/month', note: 'The two-coffees stack.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words in the recipe',
        terms: [
          { term: 'VPS', means: 'The one rented server everything lives on.' },
          { term: 'Caddy', means: 'The reverse proxy that does TLS by itself - the poor man’s load balancer.' },
          { term: 'Self-hosted Supabase', means: 'The official docker compose of Postgres, auth, realtime and storage.' },
          { term: 'GoTrue', means: 'Supabase’s auth service - the part that needs SMTP and has send limits.' },
          { term: 'Anon / service key', means: 'The two API keys derived from your JWT secret - one public, one never.' },
          { term: 'NEXT_PUBLIC_*', means: 'Env vars baked into the client at build time - the trap of the recipe.' },
          { term: 'pg_dump', means: 'The one-command backup that makes the single box survivable.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Starting the Supabase stack with its default secrets.',
          'Setting NEXT_PUBLIC_* at run time and wondering why nothing changed.',
          'Studio or Postgres reachable from the internet.',
          '2GB of RAM and no swap - the OOM killer picks the database at the worst moment.',
          'No backups until the first loss, or backups nobody ever restored.',
          'Going public with the imprint placeholders still in place.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'Run kxb yourself', href: '/community/start-kxb', note: 'The local half this guide continues.' },
          { label: 'Supabase self-hosting docs', href: 'https://supabase.com/docs/guides/self-hosting/docker', note: 'The compose setup and the secrets that must change.' },
          { label: 'Caddy docs', href: 'https://caddyserver.com/docs/', note: 'The whole proxy config is shorter than this sentence list.' },
          { label: 'The kxb repository', href: 'https://github.com/kappaxbeta/kxb', note: 'The Dockerfile and the migrations.' },
        ],
      },
    ],
  },
  de: {
    title: 'Deploy es: der Poor-Man’s-Stack',
    standfirst:
      'Ein kleiner VPS, Docker, Caddy, selbst gehostetes Supabase und eine Domain - das Ganze für ungefähr zwei Kaffee im Monat, und ehrlich darüber, wo es aufhört zu skalieren.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'Was „poor man" dir kauft',
        body: [
          'Alles auf einem kleinen Server: App, Datenbank, Auth, Realtime, TLS. Keine Managed Services, keine Registry, kein CI - gebaut wird auf der Kiste, dann Neustart. Das ist weniger Kompromiss, als es klingt: Ein Space fasst zwölf Leute, Realtime ist der hungrige Teil, und ein ehrlicher VPS trägt mehrere volle Räume, bevor irgendetwas knarzt.',
          'Was es absichtlich nicht ist: hochverfügbar. Eine Kiste heißt eine Kiste - ein Reboot ist eine Minute Downtime, und eine tote Platte ohne Backups ist das Ende. Der Backup-Schritt unten ist deshalb nicht optional, und der Guide sagt es dort noch einmal.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Das Rezept',
        steps: [
          {
            title: 'Kiste mieten und eine Domain draufzeigen lassen',
            cost: '~5-8 €/Monat für den VPS, ~10 €/Jahr für die Domain',
            body: [
              'Ein kleiner Cloud-Server mit 4 GB RAM - der Supabase-Stack ist der hungrige Mieter, und 2 GB plus Swap funktionieren bis zu dem Tag, an dem sie es nicht tun. Jeder Budget-Anbieter taugt; nimm einen mit Rechenzentrum in der Nähe deiner Spieler.',
              'Zwei DNS-A-Records beim Registrar: einer für die App (app.example.com oder die nackte Domain), einer für die API (api.example.com), beide auf die Kiste.',
            ],
          },
          {
            title: 'Erst die Tür abschließen, dann einrichten',
            takes: 'Zwanzig Minuten, einmal',
            body: [
              'Nur SSH-Keys (Passwort-Login aus), eine Firewall, die genau 22, 80 und 443 erlaubt, automatische Sicherheitsupdates. Docker und Docker Compose vom offiziellen Install-Skript.',
            ],
            watch: 'Mach das, bevor irgendetwas mit Secrets installiert wird. Eine Datenbank, die einen Nachmittag offen war, bleibt für immer geleakt.',
          },
          {
            title: 'Selbst gehostetes Supabase hochziehen',
            where: 'Das offizielle supabase/docker Compose-Setup',
            body: [
              'Deren docker-Verzeichnis klonen und vor dem ersten Start jedes Secret ändern: das Postgres-Passwort, das JWT-Secret und die daraus generierten Anon- und Service-Keys. Die Defaults sind öffentlich bekannt - ein Stack mit ihnen gestartet steht jedem offen, der dasselbe README gelesen hat.',
              'Studio und alles Administrative weg von den öffentlichen Ports - per SSH-Tunnel erreichbar oder hinter Auth im Reverse Proxy, nie blank. Danach die Migrationen aus dem kxb-Repository gegen deine Datenbank einspielen.',
            ],
          },
          {
            title: 'Die App auf der Kiste bauen und starten',
            body: [
              'Das Repository liefert ein Dockerfile; die Registry des armen Mannes ist keine Registry - das Image wird auf dem Server gebaut. Eines muss zur Bauzeit stimmen, nicht zur Laufzeit: Die NEXT_PUBLIC_*-Variablen (deine Supabase-URL und der Anon-Key) werden beim Build ins Client-Bundle gebacken. Sie hinterher zu setzen ändert nichts und scheitert lautlos.',
              'Den Container mit restart unless-stopped laufen lassen, nur auf localhost lauschend - das öffentliche Gesicht hat der Proxy.',
            ],
            watch: 'NEXT_PUBLIC_* zur Bauzeit ist die klassische Falle des ganzen Rezepts. Redet Auth mysteriös mit dem falschen Host, hast du mit dem falschen Env gebaut.',
          },
          {
            title: 'Caddy davorstellen',
            body: [
              'Caddy existiert für genau solche Setups: ein paar Zeilen, die deine zwei Hostnamen auf die zwei lokalen Ports abbilden, und die TLS-Zertifikate holt und erneuert es selbst. Es gibt wirklich nichts weiter zu tun - kein certbot, kein Cron, kein openssl.',
            ],
          },
          {
            title: 'GoTrue einen Mailweg geben',
            body: [
              'Signup-Bestätigungen brauchen SMTP. Ein kostenloses Transaktionsmail-Kontingent reicht in dieser Größe locker - die Zugangsdaten im Auth-Service eintragen und einen Test-Signup schicken, bevor irgendwer von der Seite erfährt.',
              'Kenn die Default-Limits: Selbst gehostetes GoTrue kommt mit konservativen Raten (Größenordnung Dutzende Mails pro Stunde, mit Cooldown pro Adresse). Für einen leisen Launch fein; heb sie bewusst an, wenn echte Leute kommen - nicht in Panik, während sie es tun.',
            ],
          },
          {
            title: 'Backups - und dann heißt es deployed',
            body: [
              'Ein nächtlicher pg_dump, komprimiert, weg von der Kiste kopiert - eine 1-€-Storage-Box oder irgendein Object Storage reicht. Den Restore einmal testen, an einem Tag, an dem du ihn nicht brauchst. Day-Two-Betrieb ist dann eine Schleife: pull, rebuild, restart - und das Deploy ist die Minute, in der du sie laufen lässt.',
              'Bevor die Domain irgendwo öffentlich auftaucht: die Impressums-Platzhalter aus dem Starter-Guide, und das Kapitel zum rechtlichen Grundgerüst. Eine deployte Seite ist eine veröffentlichte Seite.',
            ],
            watch: 'Ein ungetestetes Backup ist eine Hoffnung, kein Backup. Einmal in eine Wegwerf-Datenbank zurückspielen und die Tabellen anschauen.',
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'Die ganze Rechnung',
        costs: [
          { what: 'VPS, 4 GB', amount: '5-8 €/Monat' },
          { what: 'Domain', amount: '~10 €/Jahr' },
          { what: 'TLS-Zertifikate', amount: '0 €', note: 'Caddy und Let’s Encrypt.' },
          { what: 'Transaktionsmail', amount: '0 €', note: 'Das Gratis-Kontingent deckt einen kleinen Launch.' },
          { what: 'Backup-Speicher', amount: '~1 €/Monat' },
          { what: 'Summe', amount: 'Unter 10 €/Monat', note: 'Der Zwei-Kaffee-Stack.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'Die Wörter im Rezept',
        terms: [
          { term: 'VPS', means: 'Der eine gemietete Server, auf dem alles wohnt.' },
          { term: 'Caddy', means: 'Der Reverse Proxy, der TLS von allein macht - der Load Balancer des armen Mannes.' },
          { term: 'Selbst gehostetes Supabase', means: 'Das offizielle Docker Compose aus Postgres, Auth, Realtime und Storage.' },
          { term: 'GoTrue', means: 'Supabases Auth-Service - der Teil, der SMTP braucht und Sendelimits hat.' },
          { term: 'Anon-/Service-Key', means: 'Die zwei API-Keys aus deinem JWT-Secret - einer öffentlich, einer niemals.' },
          { term: 'NEXT_PUBLIC_*', means: 'Env-Variablen, die zur Bauzeit ins Bundle gebacken werden - die Falle des Rezepts.' },
          { term: 'pg_dump', means: 'Das Ein-Kommando-Backup, das die einzelne Kiste überlebbar macht.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          'Den Supabase-Stack mit seinen Default-Secrets starten.',
          'NEXT_PUBLIC_* zur Laufzeit setzen und sich wundern, warum nichts passiert.',
          'Studio oder Postgres aus dem Internet erreichbar.',
          '2 GB RAM ohne Swap - der OOM-Killer wählt im schlechtesten Moment die Datenbank.',
          'Keine Backups bis zum ersten Verlust, oder Backups, die nie jemand zurückgespielt hat.',
          'Öffentlich gehen, während die Impressums-Platzhalter noch drinstehen.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo du das selbst nachliest',
        sources: [
          { label: 'Betreib kxb selbst', href: '/de/community/start-kxb', note: 'Die lokale Hälfte, die dieser Guide fortsetzt.' },
          { label: 'Supabase Self-Hosting-Doku', href: 'https://supabase.com/docs/guides/self-hosting/docker', note: 'Das Compose-Setup und die Secrets, die sich ändern müssen.' },
          { label: 'Caddy-Doku', href: 'https://caddyserver.com/docs/', note: 'Die ganze Proxy-Config ist kürzer als diese Satzliste.' },
          { label: 'Das kxb-Repository', href: 'https://github.com/kappaxbeta/kxb', note: 'Das Dockerfile und die Migrationen.' },
        ],
      },
    ],
  },
}

/** The URL segment the deploy guide lives under. */
export const DEPLOY_SLUG = 'poor-mans-stack'
