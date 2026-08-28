import { MIN_AGE, TERMS_UPDATED } from '@/app/agb/terms'
import { Bullets, CONTROLLER, LegalShell, Section, Sub } from '@/app/legal/shell'

export const metadata = {
  title: 'Terms of Use',
  alternates: {
    canonical: '/agb/en',
    languages: { de: '/agb', en: '/agb/en' },
  },
  // Same reasoning as the English privacy notice: a courtesy translation should
  // not compete with the binding German version in search results.
  robots: { index: false, follow: true },
}

/**
 * The English terms, and they say out loud that they are a translation.
 *
 * Kept structurally identical to `../page.tsx`, section for section and number
 * for number, so the two can be diffed when one changes. If you edit one, edit
 * the other in the same commit. The comments explaining *why* a clause is
 * worded the way it is live in the German file only - they are notes to the
 * next developer, and duplicating them means two places to get out of step.
 */
export default function TermsPage() {
  return (
    <LegalShell
      locale="en"
      title="Terms of Use"
      altHref="/agb"
      notice={`This is a courtesy translation. The German version at /agb is the binding one; in case of any discrepancy, the German text prevails. Last updated: ${TERMS_UPDATED.en}.`}
    >
      <Section heading="§ 1 Scope and provider">
        <p>
          These terms (the &ldquo;Terms&rdquo;) govern the use of the service available at unkown.t
          and kxb.team (the &ldquo;Service&rdquo;). The provider and your contracting party is:
        </p>
        <p className="rounded-lg border border-line bg-surface-raised p-4">
          {CONTROLLER.name}
          <br />
          {CONTROLLER.street}
          <br />
          {CONTROLLER.city}
          <br />
          {CONTROLLER.country}
          <br />
          <br />
          {CONTROLLER.email}
        </p>
        <p>
          They apply to everyone who uses the Service &ndash; members with an account as well as
          guests arriving through an invitation link. Any differing or additional terms of your own
          do not become part of the contract unless we have expressly agreed to them in text form.
        </p>
        <p>
          How we handle personal data is not covered here but in the{' '}
          <a href="/datenschutz/en" className="text-accent hover:underline">
            privacy policy
          </a>
          . That document is statutory information rather than part of this contract.
        </p>
      </Section>

      <Section heading="§ 2 What this Service is">
        <p>
          The Service provides shared, graphically rendered rooms. Users move a character through
          them, see one another in real time, and can write to each other, exchange gestures and use
          the activities on offer.
        </p>
        <p>
          The Service is a place for meeting and entertainment. It is not a telecommunications
          service, not an archive, and not a store for data you need to rely on. Please keep your
          own copy of anything that matters to you.
        </p>
        <p>
          Use of the Service as described here is free of charge. Paid services exist only where
          they are expressly offered as such (§ 7).
        </p>
      </Section>

      <Section heading="§ 3 Access">
        <Sub heading="3.1 Account">
          <p>
            An account is created when you submit the registration form and &ndash; where we require
            confirmation &ndash; follow the link we send you. Submitting the form concludes the
            contract of use between you and us. There is no entitlement to access; while
            registration is by invitation, an account is only created where an invitation exists for
            your email address.
          </p>
          <p>
            {/* See the note on the German page: a plain space here is dropped. */}
            You must be at least {MIN_AGE}&nbsp;years old. The details you give at registration must
            be
            accurate, and you should update your email address in your account if it changes &ndash;
            it is how we reach you.
          </p>
          <p>
            Credentials are personal. Do not pass on your password or the sign-in links we email
            you, and tell us if you suspect someone else is using your account. You are responsible
            for actions taken through your account to the extent the misuse is attributable to you.
          </p>
        </Sub>

        <Sub heading="3.2 Guests without an account">
          <p>
            Rooms can also be entered through an invitation link, without creating an account.
            Following such a link, entering a name and walking in accepts our offer of free use;
            these Terms apply then too, in particular the rules in § 5 and § 6.
          </p>
          <p>
            Guest access is tied to the individual link and visit. It creates no account, no right
            to re-enter, and no storage beyond the visit. Passing an invitation link on is a
            decision about who can enter the room; treat the link accordingly.
          </p>
          <p>
            An invitation link can also be opened inside Telegram, where the room runs as a Mini App.
            Doing so does not change these Terms or who your contract is with: the Service is ours,
            we operate it, and § 5 and § 6 apply in exactly the same way. Telegram is neither a party
            to that contract nor connected to us, and your use of Telegram is governed by their terms
            and their privacy policy alongside ours. We cannot restore, alter or answer for anything
            happening in the Telegram app itself, and if that route stops working &ndash; because
            Telegram changes it or withdraws it &ndash; the ordinary link in a browser remains the way
            in. What we receive through this route, and what Telegram learns from it, is set out in
            section 8 of our privacy policy.
          </p>
        </Sub>
      </Section>

      <Section heading="§ 4 Your content">
        <p>
          Everything you create or transmit within the Service &ndash; messages, names, images,
          rooms you have arranged and the like (&ldquo;Content&rdquo;) &ndash; remains yours. We
          acquire no ownership of it.
        </p>
        <p>
          So that the Service can function, you grant us a non-exclusive, territorially unlimited and
          royalty-free right to use your Content, limited to storing it within the Service,
          processing it technically (such as format conversion) and displaying it to the people it
          is meant for. That right ends when the Content is deleted &ndash; except for backups,
          until those are overwritten in the ordinary rotation.
        </p>
        <p>
          You warrant that you hold the necessary rights to the Content you post and that it
          infringes no third-party rights.
        </p>
      </Section>

      <Section heading="§ 5 Rules of use">
        <p>In particular, it is prohibited to:</p>
        <Bullets
          items={[
            'distribute unlawful content, in particular anything constituting a criminal offence (for example incitement to hatred, insult, threats, distribution of child sexual abuse material, or use of unconstitutional symbols);',
            'harass, threaten, abuse, stalk, or deliberately drive other people out of a room;',
            'disclose other people’s personal data without their consent;',
            'impersonate another person, a member of our staff, or an official body;',
            'distribute advertising, chain messages or other unsolicited bulk messages;',
            'infringe third-party rights, in particular copyright, trade mark and personality rights;',
            'read or operate the Service by automated means, circumvent security measures, introduce malware, or deliberately overload the infrastructure;',
            'circumvent a suspension under a new name or through guest access.',
          ]}
        />
        <p>
          This list describes the most common cases and is not exhaustive. The standard remains that
          the rooms stay usable for everyone present.
        </p>
      </Section>

      <Section heading="§ 6 Moderation">
        <Sub heading="6.1 Reporting">
          <p>
            Unlawful content and breaches of § 5 can be reported informally at any time to{' '}
            {CONTROLLER.email}. It helps to say what the matter is, where in the Service it was
            found, and when. We confirm receipt and communicate our decision where we have a way to
            contact you.
          </p>
        </Sub>

        <Sub heading="6.2 Measures">
          <p>
            Where these Terms or applicable law are breached, we may, depending on severity and
            repetition:
          </p>
          <Bullets
            items={[
              'remove a piece of content or restrict its visibility,',
              'remove a person from a room,',
              'temporarily restrict access to individual features,',
              'suspend an account or guest access temporarily or permanently,',
              'terminate the contract of use for cause (§ 10).',
            ]}
          />
          <p>
            As a rule we first point out the problem or remove the content complained of. A
            suspension comes at the end, not the beginning &ndash; unless the breach is serious
            enough that waiting would be unreasonable for everyone else present.
          </p>
        </Sub>

        <Sub heading="6.3 How decisions are made">
          <p>
            Measures are decided by people. There is no automated content detection and no
            algorithmic decision on whether content is removed or access suspended. Technical
            measures are limited to limits on the number of requests and the length of input.
          </p>
        </Sub>

        <Sub heading="6.4 Objection">
          <p>
            Where a measure affects someone we can reach, we state the reason and the content
            concerned. The decision can be objected to informally within six months at{' '}
            {CONTROLLER.email}. We review the objection afresh and reverse the measure if it was
            unfounded. Your right to seek redress before a court is unaffected.
          </p>
        </Sub>
      </Section>

      <Section heading="§ 7 Paid services">
        <p>
          Beyond the free Service, we offer to host events in rooms set up for the purpose. What is
          shown on our pages is not a binding offer but an invitation to request one. A contract is
          only concluded once we send you an offer in response to your enquiry and you accept it.
        </p>
        <p>
          Scope, date, price and VAT treatment follow from that offer. Unless agreed otherwise,
          payment is due in full within 14 days of invoice.
        </p>
        <p>
          Consumers have a statutory right to withdraw within 14 days from contracts concluded at a
          distance. For services connected with leisure activities where the contract provides for a
          specific date, that right may be excluded under § 312g(2) no. 9 of the German Civil Code.
          The offer states whether and to what extent a right of withdrawal exists and, where it
          does, includes the statutory withdrawal instructions.
        </p>
      </Section>

      <Section heading="§ 8 Availability and further development">
        <p>
          We aim to run the Service with as few interruptions as possible but owe no particular
          level of availability. Interruptions caused by maintenance, faults at our suppliers or
          circumstances beyond our control are possible. Where maintenance can be planned, we
          schedule it for quiet hours as far as possible.
        </p>
        <p>
          The Service changes continuously. Features may be added, altered or dropped where this is
          reasonable for you &ndash; in particular because use is free of charge and you may end the
          contract at any time (§ 10). Where a feature essential to the agreed use is dropped, we
          say so beforehand.
        </p>
      </Section>

      <Section heading="§ 9 Changes to these Terms">
        <p>
          We may change these Terms, for instance because the Service, the law or the case law
          changes. We announce a new version in text form at least four weeks before it takes effect
          &ndash; by email to members, otherwise by a clear notice within the Service &ndash; and
          identify what is changing.
        </p>
        <p>
          Anyone who does not wish to accept the new version may end the contract of use at any time
          before it takes effect. Continuing to use the Service after that date does not count as
          consent to a change that materially shifts your rights and obligations; in such a case we
          obtain your express agreement.
        </p>
      </Section>

      <Section heading="§ 10 Term and termination">
        <p>
          The contract of use runs for an indefinite period. You may end it at any time and without
          notice by deleting your account or sending us a message to that effect at{' '}
          {CONTROLLER.email}. We may terminate on 14 days&rsquo; notice.
        </p>
        <p>
          Each party&rsquo;s right to terminate for cause is unaffected. For us, cause exists in
          particular where § 5 is breached seriously or repeatedly.
        </p>
        <p>
          After termination we delete your account and the Content associated with it, unless
          statutory retention obligations prevent this. Details and periods are set out in the{' '}
          <a href="/datenschutz/en" className="text-accent hover:underline">
            privacy policy
          </a>
          . Contributions to shared histories may remain in anonymised form so that conversations
          stay intelligible for everyone else involved.
        </p>
      </Section>

      <Section heading="§ 11 Liability">
        <p>
          We are liable without limitation for damage arising from injury to life, body or health
          and under the German Product Liability Act. We are likewise liable without limitation for
          intent and gross negligence, and for the absence of a warranted characteristic.
        </p>
        <p>
          In cases of simple negligence we are liable only for breach of an obligation whose
          fulfilment makes proper performance of the contract possible in the first place and on
          whose observance you may regularly rely (a cardinal obligation), and then limited in amount
          to the foreseeable damage typical for this type of contract. Liability is otherwise
          excluded.
        </p>
        <p>
          We are not liable for content posted by users; we do not adopt it as our own. Our
          responsibility under §§ 7 et seq. DDG and Art. 6 DSA is unaffected: once we have knowledge
          of a specific infringement, we will remove the content concerned without undue delay.
        </p>
      </Section>

      <Section heading="§ 12 Indemnity">
        <p>
          Where a third party brings a claim against us over content or conduct attributable to you,
          you will indemnify us against those claims and against the costs of a reasonable legal
          defence. This does not apply where the infringement is not attributable to you. We will
          inform you of any such claim without undue delay and give you an opportunity to comment.
        </p>
      </Section>

      <Section heading="§ 13 Final provisions">
        <p>
          German law applies, excluding the UN Convention on Contracts for the International Sale of
          Goods. If you are a consumer habitually resident in another state, the mandatory consumer
          protection provisions of that state remain unaffected.
        </p>
        <p>
          If you are a merchant, a legal entity under public law or a special fund under public law,
          the place of jurisdiction for all disputes arising from this contract is our place of
          business.
        </p>
        <p>
          We are neither willing nor obliged to take part in dispute resolution proceedings before a
          consumer arbitration board (§ 36 VSBG).
        </p>
      </Section>
    </LegalShell>
  )
}
