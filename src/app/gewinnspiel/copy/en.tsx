import type { ContestFacts } from '@/app/gewinnspiel/facts'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import { Bullets, CONTROLLER, ControllerBlock } from '@/app/legal/shell'

/**
 * The English conditions, and they say out loud that they are a translation.
 *
 * Kept clause for clause with `de.tsx`, which is the binding version. The
 * comments explaining *why* a clause reads the way it does live there and are
 * not repeated here - what belongs here is the English of the same promise. If
 * you edit a clause there, edit it here in the same commit.
 */
/**
 * The ordinals, written out rather than computed.
 *
 * The number of prizes is an operator's now, so the clause below is built from
 * however many there are - a contest with two must not print a third line
 * saying "prize: a voucher to the value of &euro;". What cannot be built is the
 * ordinal itself: this language's are irregular, and a rule that produced them
 * arithmetically would be wrong in the first three cases, which are the only
 * ones any contest has ever used.
 */
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']

export function enCopy(f: ContestFacts): ContestCopy {
  return {
    locale: 'en',

    meta: {
      title: 'Contest Terms',
      description:
        'Build a room, post a picture of it on X, win a voucher. What kxb.team is, how to enter, and the full conditions for the beta launch contest.',
      ogTitle: 'Beta launch contest – the conditions',
      ogDescription: 'Build a room, post a picture of it on X, win a voucher. 1–30 September.',
      posterAlt:
        'A voxel dinosaur leaping through a green portal in space, a fox, a panda and floating blocks around it, beside the words “Win a voucher | here to play.” and the prizes 1×€50 and 2×€25.',
    },

    chrome: {
      back: '← Back to the home page',
      title: 'Beta launch contest',
      chooserLabel: 'Language',
      deadline: `Entries close ${f.end} ${f.timezone}`,
      binding:
        'This is a courtesy translation. The German version at /gewinnspiel is the binding one, and in case of any discrepancy the German text prevails.',
      sectionMark: '§',
      hint: 'This page is also available in {language}.',
    },

    intro: {
      kicker: 'Open beta',
      lead: 'Build a room, take a picture of it, post it on X. Three vouchers are drawn among all the entries.',
      game: {
        title: 'What is kxb.team?',
        body: [
          'A room in the browser. You open a link, type a name, pick one of 24 animals and you are standing in it — nothing to install, no account for your guests, no password for anyone to invent.',
          'The room is also the editor. Fifty-eight pieces in the palette, and you place them standing in the world with everyone else still standing in it. Put two goals down and it is a football pitch. Lay a dancefloor, and that is where the evening happens.',
          'And then things get played in it: football, races, scraps, café shifts. None of it counts towards a ranking anywhere. It is the place, not the league table.',
        ],
        shotAlt:
          'The kxb.team window: the rooms in the navigation on the left, a panda in a brick room in the middle, the list of who is here on the right.',
        cta: 'Try it yourself',
      },
      steps: {
        title: 'How to enter',
        items: [
          {
            title: 'Build a room',
            body: 'Your lounge or a new room, whichever you prefer. A café, an arena, a living room, one very long staircase — we pass no judgement on it.',
            alt: 'A room of stone blocks holding six workstations with monitors, a workbench and a red barrel.',
          },
          {
            title: 'Take a picture',
            body: 'The shutter inside the room gives you the picture without the interface — the world only, no names, no chat line. A screenshot of your own making is equally fine.',
            alt: 'Two animals on a brightly lit checkerboard dancefloor in a brick hall, spotlights sweeping the walls.',
          },
          {
            title: `Post it with #${f.hashtag}`,
            body: `A public post on X, in September, carrying the hashtag — and follow @${f.handle} so we can reach you if you win. That is the whole thing.`,
            alt: 'Four voxel animals side by side on a green field, emotes in speech bubbles above them.',
          },
        ],
      },
      prizes: {
        title: 'What there is to win',
        note: 'It is a prize draw, not a competition. No jury, no judging, no ranking — every valid entry has the same chance, however elaborate it is.',
        place: 'Prize {n}',
      },
      cta: { signup: 'Sign up for the beta', github: 'Star it on GitHub' },
      handover:
        'Everything else — who can take part, how the draw works, what happens to your picture — is here:',
    },

    sections: {
      organiser: {
        heading: 'Organiser',
        body: (
          <>
            <p>
              The organiser of this contest, and your point of contact for anything to do with it, is:
            </p>
            <ControllerBlock />
            <p>
              These conditions apply to this contest only. Use of the service itself is additionally
              governed by our{' '}
              <a href="/agb/en" className="text-accent hover:underline">
                terms of use
              </a>
              .
            </p>
          </>
        ),
      },

      what: {
        heading: 'What this is',
        body: (
          <>
            <p>
              kxb.team is entering open beta. To mark it, we are giving away vouchers among everyone
              who builds a room of their own during that time and posts a picture of it on X.
            </p>
            <p>
              It is a prize draw, not a competition: there is no jury, no judging and no ranking by
              quality. Every valid entry has the same chance of winning, no matter how elaborate it is
              or how many people saw it.
            </p>
          </>
        ),
      },

      window: {
        heading: 'Entry period',
        body: (
          <p>
            Entries are counted from {f.start} until {f.end} {f.timezone}. The
            publication time shown by X is what counts. Posts published before the start or after the
            end of that period do not take part.
          </p>
        ),
      },

      eligibility: {
        heading: 'Who can take part',
        body: (
          <>
            <p>Entry is open to natural persons who</p>
            <Bullets
              items={[
                `are ${f.minAge} years of age or older,`,
                'reside in the European Union, the European Economic Area, Switzerland or the United Kingdom — Italy excepted,',
                'have their own, publicly visible account on X, and',
                'have their own account on kxb.team.',
              ]}
            />
            <p>
              Italy is excepted because prize draws aimed at residents there have to be notified to
              the competent authority in advance and secured by a deposit under the Italian rules on{' '}
              <em>manifestazioni a premio</em>. We cannot carry that overhead for a draw of this size.
              The exception is aimed at the formality, not at the people.
            </p>
            <p>
              The organiser, their direct relatives and members of their household are also excluded
              from entry.
            </p>
            <p>
              One entry per person. Anyone posting more than one takes part with the one published
              first; the rest are disregarded. Several accounts belonging to the same person count as
              one person.
            </p>
          </>
        ),
      },

      entry: {
        heading: 'How to enter',
        body: (
          <>
            <p>A valid entry is five things:</p>
            <Bullets
              items={[
                'You build a room in a space on kxb.team – your lounge or another room, whichever you prefer.',
                'You make a picture of it. The shutter inside the room gives you the picture without the interface; a screenshot of your own making is equally fine.',
                <>
                  You publish that picture within the entry period in a public post on X carrying the
                  hashtag <strong>#{f.hashtag}</strong>.
                </>,
                'Your account on X is publicly visible at that time, so that we can see the post at all.',
                <>
                  You follow the account <strong>@{f.handle}</strong> on X.
                </>,
              ]}
            />
            <p>
              We check the follow once, at the draw. Anyone who has unfollowed by then does not take
              part; anyone who follows after posting does.
            </p>
            <p>
              The room in the picture must be one you built yourself. A picture from somebody
              else&rsquo;s space, a picture off the internet, or a post with no recognisable room is
              not a valid entry.
            </p>
            <p>What the picture and the post must not show:</p>
            <Bullets
              items={[
                'hateful, degrading or discriminatory depictions – in particular any directed at people because of their origin, skin colour, religion, beliefs, a disability, their gender or their sexual orientation;',
                'unconstitutional signs and symbols;',
                'glorification of violence, and pornographic or sexualised depictions;',
                'insults, threats or harassment directed at a particular person;',
                'anything breaching § 5 of our terms of use or applicable law.',
              ]}
            />
            <p>
              An entry showing any of that does not take part, and we will not show it either. We pass
              no judgement on how you built your room &ndash; we do on this line.
            </p>
            <p>
              Please make sure the picture shows no other people&rsquo;s data &ndash; names of people
              present, say, or messages from the chat. The shutter inside the room photographs the
              world only and leaves the interface out; anyone screenshotting their whole browser
              window should check this for themselves.
            </p>
          </>
        ),
      },

      free: {
        heading: 'Entering is free',
        body: (
          <>
            <p>
              Taking part costs nothing. Buying anything is neither a condition of entry nor does it
              improve your chance of winning.
            </p>
            <p>
              Any member can build, including on the free plan. If you would like more rooms, more
              seats and pictures on the walls for the duration of the contest, you can redeem the code{' '}
              <strong>{f.code}</strong> at{' '}
              <a href={f.codePath} className="text-accent hover:underline">
                kxb.team{f.codePath}
              </a>{' '}
              and use the xo plan free for a month. That too is optional and has no bearing on the
              draw.
            </p>
            {/* Only when the code actually carries them. What it hands over is set
                in the backoffice, and a clause promising bucks the code does not
                give would be a promise in a binding document. */}
            {f.bucks > 0 ? (
              <p>
                It also carries {f.bucks} bucks to spend on skins — they are in the pocket straight away.
              </p>
            ) : null}
            <p>
              The cost of your internet access and of your use of X is yours to carry; entering adds
              nothing to it.
            </p>
          </>
        ),
      },

      prizes: {
        heading: 'What there is to win',
        body: (
          <>
            <p>The following vouchers are drawn:</p>
            <Bullets
              items={f.prizes.map((amount, i) => (
                <>{ORDINALS[i] ?? `${i + 1}th`} prize: a voucher to the value of &euro;{amount}</>
              ))}
            />
            <p>
              The voucher is sent as a code by email. Winners may name the retailer the voucher should
              be issued for, as far as a voucher of that value from that retailer is available.
              Failing that, we issue a voucher from an equivalent provider.
            </p>
            <p>
              The prize cannot be paid out in cash, exchanged, or transferred to another person. Any
              tax on the prize is borne by the organiser.
            </p>
          </>
        ),
      },

      draw: {
        heading: 'How winners are drawn',
        body: (
          <>
            <p>
              After the entry period closes we record all valid entries in the order they were
              published and number them. On {f.draw} we draw three numbers from that list
              with a random number generator: the first for the 1st prize, the second for the 2nd, the
              third for the 3rd. A number can only be drawn once.
            </p>
            <p>
              We document the draw and publish that documentation along with the result. Chance
              decides alone; there is no claim to any particular prize.
            </p>
          </>
        ),
      },

      notice: {
        heading: 'Notification and delivery',
        body: (
          <>
            <p>
              We notify winners within three days of the draw by direct message on X, to the account
              the entry came from. Anyone who cannot receive direct messages from us will be addressed
              publicly under their own post.
            </p>
            <p>
              We need an email address to send the voucher to. If somebody who has been notified does
              not respond within 14&nbsp;days of the notification, the claim to the prize lapses and
              we draw again for that prize from the remaining valid entries.
            </p>
            <p>We send the voucher within 14&nbsp;days of receiving the email address.</p>
          </>
        ),
      },

      yourEntry: {
        heading: 'Your entries',
        body: (
          <>
            <p>The picture, and the room you built, remain yours. We acquire no ownership of either.</p>
            <p>
              By entering you grant us the simple, free and revocable right to show your entry in
              connection with this contest &ndash; that is, to reproduce it on our own channels and on
              kxb.team, naming your account on X. The right goes no further: no editing beyond what
              sharing technically involves, no passing it on to third parties, and no use in paid
              advertising. Write to {CONTROLLER.email} and we take the entry off our channels.
            </p>
            <p>
              You warrant that the entry is your own and infringes no third-party rights &ndash; in
              particular, that you hold the necessary rights to any pictures you have hung on the
              walls of the room.
            </p>
          </>
        ),
      },

      exclusion: {
        heading: 'Exclusion from entry',
        body: (
          <>
            <p>
              We may exclude entries and people from the contest where there is good cause. Good cause
              exists in particular for
            </p>
            <Bullets
              items={[
                'the use of several accounts, of automated means, or of accounts created specifically to enter,',
                'entries showing unlawful content, or content excluded by § 5 of these conditions,',
                'entries that are not the entrant’s own,',
                'untrue statements about one’s own person.',
              ]}
            />
            <p>
              Where a prize has already been sent, we may reclaim it in these cases. An exclusion is
              communicated to the person concerned by the same route they entered through.
            </p>
          </>
        ),
      },

      ending: {
        heading: 'Early termination or amendment',
        body: (
          <>
            <p>
              We may terminate or amend the contest if, for reasons outside our control, it cannot be
              run properly &ndash; a serious technical fault, outside manipulation, or the run
              becoming legally impermissible.
            </p>
            <p>
              If the entry period has already closed at that point, we hold the draw regardless. We
              announce any termination or amendment on this page and on the account @{f.handle} on X.
            </p>
          </>
        ),
      },

      privacy: {
        heading: 'Data protection',
        body: (
          <>
            <p>
              To run the contest we process your account name on X, the link to your post and the
              picture published in it; for winners, additionally the email address the voucher should
              go to. We use this data for the contest alone and do not pass it on for advertising.
            </p>
            <p>
              The detail &ndash; legal bases, retention and your rights &ndash; is in section 13 of
              our{' '}
              <a href="/datenschutz/en" className="text-accent hover:underline">
                privacy policy
              </a>
              . What X does with your post and your data follows X&rsquo;s own terms and lies outside
              our responsibility.
            </p>
          </>
        ),
      },

      noAffiliation: {
        heading: 'No association with X or with any retailer',
        body: (
          <>
            <p>
              This contest is in no way associated with X. It is not sponsored, endorsed, administered
              by or otherwise connected to X. Any information and any claims are directed solely at
              the organiser named in § 1, not at X.
            </p>
            <p>
              Nor is the contest associated with the retailer whose voucher is issued. That retailer
              is neither organiser nor sponsor and has nothing to do with the running of it; we buy
              the voucher like any other customer.
            </p>
          </>
        ),
      },

      liability: {
        heading: 'Liability',
        body: (
          <>
            <h3 className="mb-2 text-xl font-medium text-ink">For the contest</h3>
            <p>
              We are liable without limitation for damage arising from injury to life, body or health
              and under the Product Liability Act, as well as for intent and gross negligence. For
              ordinary negligence we are liable only for breach of a material contractual obligation,
              and then limited to the foreseeable damage typical of this kind of contract. Liability
              is otherwise excluded.
            </p>
            <h3 className="mb-2 mt-6 text-xl font-medium text-ink">For the voucher</h3>
            <p>
              The prize is delivered once the voucher code has been sent. Redeeming the voucher is
              governed by the conditions of the issuing retailer; we cannot stand behind that retailer
              accepting it.
            </p>
          </>
        ),
      },

      final: {
        heading: 'Final provisions',
        body: (
          <>
            <p>
              German law applies. If you are a consumer habitually resident in another state, the
              mandatory consumer protection provisions of that state remain unaffected.
            </p>
            <p>
              These conditions are available in other languages as well. The German version is the
              binding one; in case of any discrepancy it prevails over the translations.
            </p>
            <p>
              Should any provision of these conditions be invalid, the validity of the remainder is
              unaffected.
            </p>
            <p>Recourse to the courts is excluded.</p>
          </>
        ),
      },
    },
  }
}
