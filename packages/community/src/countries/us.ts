import type { Guide } from '../guide'
import type { Text } from '../text'

/** United States. */
export const UNITED_STATES: Text<Guide> = {
  en: {
    title: 'Starting a business in the United States',
    standfirst:
      'There is no national registration - a sole proprietorship just starts, an LLC is a state filing, and the traps are the annual fees and the state-by-state sales tax.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          'The US has no federal business register. A sole proprietorship exists the moment you sell something; the state may want a DBA ("doing business as") filing if you trade under a name, and everything else - the LLC, the sales tax permit, the annual report - is state law, fifty flavours of it.',
          'The standing advice against the internet’s favourite myth: form the LLC in your home state. Delaware and Wyoming make sense for venture-backed corporations; for an ordinary business they add a second state’s fees and a registered agent while your home state still makes you register as a "foreign" LLC anyway. The cheap version of this mistake costs a few hundred dollars a year forever.',
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'The legal shell',
        choices: [
          {
            question: 'Sole proprietorship, LLC, or corporation?',
            options: [
              {
                name: 'Sole proprietorship',
                when: 'Testing an idea with low risk.',
                costs: '$0-100 (a DBA filing where used).',
                catch: 'No liability shield at all, in the world’s most litigious market.',
              },
              {
                name: 'LLC',
                when: 'The default serious answer: liability shield, pass-through taxes, minimal ceremony.',
                costs: 'State filing $50-500; some states add annual fees (California’s $800 franchise tax is the famous one).',
                catch: 'A single-member LLC is ignored for federal tax - the shield is legal, not fiscal. Respect the formalities (separate bank account above all) or a court pierces it.',
              },
              {
                name: 'C-corporation (usually Delaware)',
                when: 'Venture capital, stock options, US investors.',
                costs: 'Filing plus registered agent plus franchise tax - hundreds a year before revenue.',
                catch: 'Double taxation unless profits stay in; this is the vehicle for equity stories, not for freelance income.',
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        steps: [
          {
            title: 'File the LLC with your state',
            where: 'The Secretary of State’s website',
            cost: '$50-500 by state',
            takes: 'Instant to a few days online',
            body: [
              'Articles of organization, a registered agent (yourself, at a street address, is fine in most states), and the name check. Write or generate an operating agreement even solo - banks ask, and it is the document that proves the LLC is real.',
            ],
          },
          {
            title: 'Get the EIN - free, from the IRS only',
            where: 'irs.gov, the online EIN assistant',
            cost: '$0',
            takes: 'Minutes online for US persons; by fax/mail via form SS-4 for foreigners',
            body: [
              'The employer identification number is the business’s tax identity, needed for the bank account. Every site charging for one is reselling a free form.',
            ],
            watch: 'Only irs.gov. The paid lookalikes are the most-clicked trap in US founding.',
          },
          {
            title: 'Open the account and separate the money',
            body: [
              'The liability shield lives or dies on separation. One business account, no commingling, and bookkeeping from month one - the discipline is the legal structure.',
            ],
          },
          {
            title: 'Sales tax, state by state',
            body: [
              'Since Wayfair (2018), states tax remote sellers past economic nexus thresholds (typically $100,000 of in-state sales). Physical presence creates nexus immediately. Selling software or digital goods multi-state means a tax tool (TaxJar, Avalara, Stripe Tax) earlier than intuition suggests.',
            ],
          },
          {
            title: 'Remember the two federal rhythms',
            body: [
              'Quarterly estimated taxes (self-employment tax is 15.3% on top of income tax - the number that shocks every ex-employee), and the annual return with Schedule C or the partnership/corporate equivalent. State annual reports keep the LLC alive; missing them dissolves it quietly.',
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        costs: [
          { what: 'LLC filing', amount: '$50-500', note: 'By state.' },
          { what: 'EIN', amount: '$0', note: 'From the IRS, always.' },
          { what: 'Registered agent service', amount: '$0-150/year', note: 'Free when you are your own.' },
          { what: 'Annual report / franchise tax', amount: '$0-800/year', note: 'California at the top.' },
          { what: 'Self-employment tax', amount: '15.3% of net earnings', note: 'On top of income tax.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        terms: [
          { term: 'LLC', means: 'The limited liability company - the small-business default.' },
          { term: 'EIN', means: 'The federal tax number, free from the IRS.' },
          { term: 'DBA', means: 'The trade-name filing for unregistered names.' },
          { term: 'Registered agent', means: 'The service address every state entity must keep.' },
          { term: 'Operating agreement', means: 'The internal constitution banks and courts ask for.' },
          { term: 'Economic nexus', means: 'The post-Wayfair sales-tax trigger, ~$100k per state.' },
          { term: 'Schedule C', means: 'Where sole-proprietor and single-member-LLC profit lands.' },
          { term: 'Franchise tax', means: 'The state’s annual fee for existing.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Delaware for a business that lives in Ohio.',
          'Paying for an EIN.',
          'Commingling funds and losing the shield when it matters.',
          'Ignoring quarterly estimates until the April bill arrives with penalties.',
          'Selling into a state past its nexus threshold with no permit.',
          'Letting the annual report lapse and discovering the LLC was administratively dissolved.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'IRS - EIN', href: 'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number', note: 'The only EIN source.' },
          { label: 'SBA', href: 'https://www.sba.gov', note: 'The federal small-business guides.' },
          { label: 'Your Secretary of State', href: 'https://www.sba.gov/business-guide/launch-your-business/register-your-business', note: 'Links to every state filing office.' },
        ],
      },
    ],
  },
}
