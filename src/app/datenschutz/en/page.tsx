import {
  Bullets,
  ControllerBlock,
  CONTROLLER,
  LegalShell,
  Section,
  Sub,
  SUPERVISORY_AUTHORITY,
} from '@/app/legal/shell'

export const metadata = {
  title: 'Privacy Policy',
  alternates: {
    canonical: '/datenschutz/en',
    languages: { de: '/datenschutz', en: '/datenschutz/en' },
  },
  // A courtesy translation should not compete with the binding German version
  // in search results, and it has no independent content to offer a crawler.
  robots: { index: false, follow: true },
}

/**
 * The English privacy notice, and it says out loud that it is a translation.
 *
 * The German version is the one that binds. This exists because most of the
 * people who will read this page do not read German - the product is sold to
 * Discord servers and conference organisers - and "we cannot tell you what we
 * do with your data unless you speak German" is a bad answer even where it is
 * a legally sufficient one.
 *
 * Kept structurally identical to `../page.tsx`, section for section and number
 * for number, so the two can be diffed when one changes. If you edit one, edit
 * the other in the same commit.
 */
export default function PrivacyPage() {
  return (
    <LegalShell
      locale="en"
      title="Privacy Policy"
      altHref="/datenschutz"
      notice="This is a courtesy translation. The German version at /datenschutz is the binding one; in case of any discrepancy, the German text prevails."
    >
      <Section heading="1. Controller">
        <p>
          The controller responsible for processing personal data on this website and in this
          service is:
        </p>
        <ControllerBlock />
        <p>
          We have not appointed a data protection officer, as the statutory thresholds for doing so
          are not met. For any privacy matter, please contact us at the address above.
        </p>
      </Section>

      <Section heading="2. The principle this service is built on">
        <p>
          This service is built so that as little personal data as possible comes into existence in
          the first place. That is not a statement of intent — each of the following can be checked:
        </p>
        <Bullets
          items={[
            'There are no advertising, tracking or marketing cookies, and no third-party analytics are embedded (no Google Analytics, no Meta pixel, no consent-management service).',
            'There is no content delivery network in front of the site. Every page is served directly from our own server.',
            'Fonts are served locally from our own server. No connection is made to Google Fonts or any comparable service.',
            'Your IP address is not stored for analytics purposes (see section 6).',
            'No account is needed to enter a room (see section 8).',
            'The only file the site loads from anywhere other than our own server is one script from Telegram, and only if you opened the room inside Telegram (see section 8).',
          ]}
        />
      </Section>

      <Section heading="3. Hosting">
        <p>
          The application and the database run on servers we rent in Germany. No transfer to a third
          country takes place for hosting.
        </p>
        <Bullets
          items={[
            <>
              <strong>Application server:</strong> Hetzner Online GmbH, Industriestr. 25, 91710
              Gunzenhausen, Germany. This runs the website itself and the TLS proxy that encrypts
              your connection.
            </>,
            <>
              <strong>Database, authentication and file server:</strong> STRATO AG,
              Otto-Ostrowski-Straße 7, 10249 Berlin, Germany. This runs our self-hosted Supabase
              installation, which holds accounts, content and files.
            </>,
          ]}
        />
        <p>
          We have a data processing agreement under Art. 28 GDPR with both providers. Neither has
          access to the content of the data; they process it solely in order to operate the servers.
        </p>
        <p>
          TLS certificates for encrypted transport are obtained automatically from Let&rsquo;s
          Encrypt (Internet Security Research Group, USA). Only domain names are transmitted in that
          process — no visitor data.
        </p>
        <p>
          The legal basis is Art. 6(1)(f) GDPR. Our legitimate interest is the technically secure and
          reliable operation of this service.
        </p>
      </Section>

      <Section heading="4. Server log files">
        <p>
          When a page is requested, the web server automatically records log data transmitted by your
          browser:
        </p>
        <Bullets
          items={[
            'IP address',
            'date and time of the request',
            'the address requested and the HTTP status code',
            'volume of data transferred',
            'referrer URL, where one is sent',
            'browser type, browser version and operating system',
          ]}
        />
        <p>
          This data is technically necessary to deliver the page and additionally serves to detect
          and defend against abuse and attacks. It is not combined with other data sources and is not
          evaluated for analytics. The legal basis is Art. 6(1)(f) GDPR. Logs are deleted, or their
          IP addresses anonymised, after 14 days at the latest.
        </p>
      </Section>

      <Section heading="5. Cookies">
        <p>
          We use strictly necessary cookies only. There is therefore no consent banner: under § 25(2)
          no. 2 TDDDG, no consent is required for cookies that are strictly necessary to provide a
          service the user has expressly requested. No cookie is set in order to measure you or to
          advertise to you. The only cookie related to analytics is the objection to it — set only
          when you ask for it, and its effect is that less is stored.
        </p>
        <Bullets
          items={[
            <>
              <strong>sb-…-auth-token</strong> — keeps you signed in. Set only when you sign in.
              Lifetime depends on your &ldquo;keep me signed in&rdquo; choice: until the browser is
              closed, or up to 30 days.
            </>,
            <>
              <strong>kxb.keep</strong> — remembers that choice, so the session gets the right
              lifetime each time it is renewed.
            </>,
            <>
              <strong>unkown_last_space</strong> — remembers which space you opened last, so that
              signing in takes you there rather than to a picker. Lifetime: several weeks.
            </>,
            <>
              <strong>unkown_invite</strong> — holds an open invitation while you create the account
              that accepts it. Not needed afterwards.
            </>,
            <>
              <strong>unkown_dnt</strong> — set only if you expressly ask not to be counted, at{' '}
              <a href="/notme" className="text-accent hover:underline">
                /notme
              </a>
              . It contains that choice and nothing else — no identifier — and its effect is that
              nothing is stored about this browser. Lifetime: five years.
            </>,
          ]}
        />
        <p>
          You can delete or block cookies in your browser at any time. If you do, you will not be
          able to sign in or use the protected areas of the service.
        </p>
      </Section>

      <Section heading="6. Analytics">
        <p>
          We measure how often which pages are opened, in order to understand what is being found and
          what is not. We use no third-party analytics tool and no cookie for this. One record is
          stored per page view, containing:
        </p>
        <Bullets
          items={[
            'the path requested, without the query string — identifiers, invitation tokens and search terms are discarded before the path is stored, so they never reach the database at all;',
            'the host of the referring site, e.g. “discord.com”, not the full address. Referrals from our own pages are not stored;',
            'the country, as a two-letter code;',
            'the preferred language, as a language tag from the Accept-Language header;',
            'the device class, only ever as one of four buckets — “desktop”, “mobile”, “tablet” or “bot”. The user agent string itself is not stored;',
            'a pseudonymous daily value (see below);',
            'your user id, if you are signed in at the time.',
          ]}
        />
        <Sub heading="The daily value">
          <p>
            To group repeat views within a single day, we compute a cryptographic hash from your IP
            address, your user agent, the current date and a secret key known only to us. Only that
            hash is stored.
          </p>
          <p>
            <strong>Your IP address is not stored.</strong> Because the date is part of the
            calculation, the hash changes completely at midnight UTC. The same person receives a
            different value the next day, and the two cannot be linked. Recognition across days, and
            therefore the building of any usage profile, is technically impossible; &ldquo;unique
            visitors&rdquo; here is a daily figure and cannot be anything else.
          </p>
        </Sub>
        <Sub heading="Country lookup without transmission">
          <p>
            The country code is determined offline, from an address-registry allocation table built
            into our application. Your IP address is not transmitted to anyone for this purpose and
            is not passed to any geolocation service. The result is a country and never anything more
            precise.
          </p>
        </Sub>
        <Sub heading="Objecting">
          <p>
            You can object to this measurement at any time, at{' '}
            <a href="/notme" className="text-accent hover:underline">
              /notme
            </a>
            . One click, no account needed. Nothing is stored about your visits from then on. The
            objection applies to the browser you declare it in, because it lives in a cookie — clear
            your cookies and it is gone and has to be declared again.
          </p>
        </Sub>
        <p>
          Views of our administrative area are not counted. The legal basis is Art. 6(1)(f) GDPR; our
          legitimate interest is in designing this service to meet actual demand. Given the design
          described above, the impact on your rights is low.
        </p>
      </Section>

      <Section heading="7. Account and profile">
        <p>
          If you create an account, we process your email address and your password. The password is
          stored only as a hash; we do not know it in plain text. In addition, we process the details
          you enter in your profile, such as a display name and your choice of character, along with
          the spaces you are a member of and your role in them.
        </p>
        <p>
          If you invite others to a space by email, we process the address you provide in order to
          deliver the invitation. Please only invite people who are happy to receive one.
        </p>
        <p>
          The legal basis is Art. 6(1)(b) GDPR, as this processing is necessary to perform the user
          agreement.
        </p>
      </Section>

      <Section heading="8. Taking part without an account (guests)">
        <p>
          Rooms can be entered via a guest link without creating an account. In that case we process
          the name you give yourself, the character you choose, and a technical identifier that
          identifies your session for its duration. We do not ask for an email address.
        </p>
        <p>
          Guest access is time-limited and is deleted automatically once it expires. The legal basis
          is Art. 6(1)(b) GDPR.
        </p>

        <Sub heading="Arriving through Telegram">
          <p>
            A guest link can also be opened as a Telegram Mini App, in which case the room runs
            inside the Telegram app instead of in a browser. This applies only if you open a link
            that way. On every other visit, nothing described in this sub-section happens.
          </p>
          <Bullets
            items={[
              <>
                <strong>Telegram sees the visit.</strong> You are using their app, so the fact that
                you opened the room, and your IP address, are known to Telegram under its own privacy
                policy, over which we have no influence. This is true of any link opened inside a
                messenger and is not specific to the Mini App.
              </>,
              <>
                <strong>One script is loaded from telegram.org.</strong> It is the interface Telegram
                requires for a Mini App to function at all, and it is what allows the room to use the
                full screen and to tell the app that a swipe is a camera movement rather than a
                request to close. It is requested only when you arrive through Telegram; otherwise no
                connection to Telegram is made from the page.
              </>,
            ]}
          />
          <p>
            What we receive in return is the display name held by your Telegram profile. We use it to
            pre-fill the name field at the door and for nothing else &mdash; you can overwrite it
            before you enter, and what is stored is whatever the field says when you walk in, as
            described above. Your Telegram account also transmits an identifier and, depending on your
            settings, a username; we neither evaluate nor store either. We do not receive your
            telephone number, your contacts or your messages, and we do not ask Telegram for them.
          </p>
          <p>
            The legal basis is Art. 6(1)(b) GDPR: this is the route you chose in order to enter.
          </p>
        </Sub>
      </Section>

      <Section heading="9. Content in spaces and rooms">
        <p>
          What you create in the service is stored: pages and their content, rooms you build, chat
          messages, game state and comparable input. This content is visible to the members of the
          space in question and to guests who have been granted access. Please note that chat
          messages and things you build are visible to everyone present.
        </p>
        <Sub heading="Levels you have played">
          <p>
            When you play a level (an &ldquo;XP&rdquo;), we record one entry at the end of the
            session: which level in which version, when the session began, how long it lasted, which
            room or match it took place in, and — if you are signed in — your account. We store
            <strong> nothing about how you played</strong>: no positions, no input, no scores.
          </p>
          <p>
            These entries answer one question: how much a level was played. Whoever created a level
            sees <strong>totals only</strong> — the number of sessions and how long they lasted
            altogether — never the individual entries, and never who played when. The legal basis is
            Art. 6(1)(f) GDPR; our legitimate interest is in giving the authors of a level feedback
            about its use and in shaping the service to what is actually used.
          </p>
          <p>
            If you delete your account, the reference to you is removed from these entries; the
            entry itself remains as an anonymous figure, because removing it would retroactively
            falsify the usage counts of other people&rsquo;s levels. For guest access this happens
            automatically once the guest access expires and is deleted.
          </p>
        </Sub>

        <Sub heading="How our storage works — and what that means for deletion">
          <p>
            The service stores changes as an append-only log (&ldquo;event sourcing&rdquo;). An entry
            is never overwritten; a further entry is appended instead. That is the reason content
            survives a lapsed subscription.
          </p>
          <p>
            This does not affect your right to erasure. If you request deletion, we delete your
            account and overwrite the personal details in the affected log entries so that they can
            no longer be attributed to you. The entry itself remains in anonymised form, because
            removing it would destroy the state of rooms shared with other people. Please contact us
            at the address in section 1.
          </p>
        </Sub>
      </Section>

      <Section heading="10. Contact form and event enquiries">
        <p>
          If you write to us via the contact form or the event enquiry form, we process the details
          you provide there — in particular your name, email address and the content of your message
          — in order to deal with your enquiry.
        </p>
        <p>
          The legal basis is Art. 6(1)(b) GDPR where the enquiry is aimed at entering into a
          contract, and otherwise Art. 6(1)(f) GDPR based on our legitimate interest in answering
          enquiries. We delete enquiries once they have been dealt with, unless statutory retention
          obligations apply.
        </p>
      </Section>

      <Section heading="11. Payments">
        <p>
          For paid subscriptions we use Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower,
          Grand Canal Dock, Dublin, Ireland. You enter payment details — card details in particular —
          directly with Stripe. We neither receive nor store them.
        </p>
        <p>
          In our own database we store only the Stripe customer id, the subscription id and its
          status, so that we know which features are unlocked. Stripe may also transfer personal data
          to the USA; that transfer is based on standard contractual clauses and certification under
          the EU-US Data Privacy Framework.
        </p>
        <p>
          The legal basis is Art. 6(1)(b) GDPR. Invoice-related data is retained under Art. 6(1)(c)
          GDPR for the statutory periods of up to ten years.
        </p>
      </Section>

      <Section heading="12. Email">
        <p>
          System messages such as sign-up confirmations, password resets and invitations are sent via
          a mail server we run ourselves on our own infrastructure. No external mail delivery provider
          is involved. There is no open or click tracking, and we do not send a newsletter.
        </p>
      </Section>

      <Section heading="13. Contests">
        <p>
          Where we run a contest, we process the data its running requires. For the beta launch
          contest that is the entrant’s account name on X, the link to their post and the picture
          published in it; for winners, additionally the email address the voucher is sent to.
        </p>
        <p>
          Entry happens on X rather than with us: a post is published there publicly, and we see it
          as any other reader does. We therefore receive the information from a public source rather
          than from you. What X does with your post and your data follows X’s own terms; X is
          responsible for that, not us.
        </p>
        <p>
          The legal basis is Art. 6(1)(b) GDPR — entering creates an obligation whose performance
          would be impossible without this data. It is used for the contest alone. It is not used
          for advertising, and entering does not result in your receiving messages from us that have
          nothing to do with the contest.
        </p>
        <p>
          We delete the list of entries and the record of the draw three months after the draw; we
          keep them that long so that a question about the result can still be answered. Records of
          a prize actually issued form part of our accounts and are subject to retention periods
          under tax and commercial law of up to ten years (Art. 6(1)(c) GDPR).
        </p>
        <p>
          The full conditions are in the{' '}
          <a href="/gewinnspiel/en" className="text-accent hover:underline">
            contest terms
          </a>
          .
        </p>
      </Section>

      <Section heading="14. Recipients">
        <p>
          Beyond the parties named in sections 3, 8, 11 and 13, we do not pass your data to third parties.
          Disclosure occurs only where we are legally obliged to make it. There is no automated
          decision-making, including profiling, within the meaning of Art. 22 GDPR, and your data is
          not sold.
        </p>
      </Section>

      <Section heading="15. Retention">
        <Bullets
          items={[
            'Server logs: 14 days at most.',
            'Analytics: the daily value ceases to be attributable at the turn of the day; the remaining fields are anonymous and are evaluated in aggregate on an ongoing basis.',
            'Account and content: until the account is deleted.',
            'Levels you have played: kept indefinitely; deleting your account removes the attribution and the entries remain as anonymous figures.',
            'Guest access: until the guest access expires.',
            'Form enquiries: until dealt with, unless a retention obligation applies.',
            'Contests: the list of entries and the record of the draw, three months after the draw; records of prizes actually issued, up to ten years.',
            'Invoice records: up to ten years, under commercial and tax law obligations.',
          ]}
        />
      </Section>

      <Section heading="16. Your rights">
        <p>You have the following rights in relation to us:</p>
        <Bullets
          items={[
            'access to the data we hold about you (Art. 15 GDPR),',
            'rectification of inaccurate data (Art. 16 GDPR),',
            'erasure (Art. 17 GDPR),',
            'restriction of processing (Art. 18 GDPR),',
            'data portability (Art. 20 GDPR),',
            'withdrawal of any consent given, with effect for the future (Art. 7(3) GDPR).',
          ]}
        />
        <Sub heading="Right to object">
          <p>
            Where we process data on the basis of a legitimate interest under Art. 6(1)(f) GDPR —
            which covers the server logs and the analytics — you have the right to object at any
            time on grounds relating to your particular situation (Art. 21 GDPR). An informal message
            to {CONTROLLER.email} is sufficient.
          </p>
        </Sub>
        <Sub heading="Right to lodge a complaint">
          <p>
            You have the right to lodge a complaint with a data protection supervisory authority about
            our processing of your personal data (Art. 77 GDPR). The authority competent for us is:
          </p>
          <p className="rounded-lg border border-line bg-surface-raised p-4">
            {SUPERVISORY_AUTHORITY.name}
            <br />
            {SUPERVISORY_AUTHORITY.street}
            <br />
            {SUPERVISORY_AUTHORITY.city}
            <br />
            <a
              href={SUPERVISORY_AUTHORITY.web}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {SUPERVISORY_AUTHORITY.web}
            </a>
          </p>
        </Sub>
      </Section>

      <Section heading="17. Changes to this policy">
        <p>
          We update this policy when the service or the legal position changes. The version available
          here is the one that applies.
        </p>
        <p className="text-sm">Last updated: August 2026</p>
      </Section>
    </LegalShell>
  )
}
