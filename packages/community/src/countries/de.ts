import type { Guide } from '../guide'
import type { Text } from '../text'

/**
 * Germany, in English and in German.
 *
 * ---------------------------------------------------------------------------
 * Two documents, not one document translated
 * ---------------------------------------------------------------------------
 * See the note in `../text.ts`. The German half is the one a reader acts on -
 * it uses the words printed on the forms, because those are the words the
 * offices answer to - and the English half is written for somebody living in
 * Germany who has to deal with those same forms in a language they do not
 * read. So the English one keeps every German term and explains it, rather
 * than translating `Gewerbeanmeldung` into "business registration" and leaving
 * the reader to guess what to search for.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not here
 * ---------------------------------------------------------------------------
 * No amounts that only a tax adviser can compute, and no advice about which
 * option is better for one particular reader. Both are in every other guide on
 * the internet and both are the part that is wrong. What is here is the
 * sequence, the boxes on the forms, and the handful of decisions that are
 * genuinely hard to reverse - which is the part nobody writes down.
 */
export const GERMANY: Text<Guide> = {
  en: {
    title: 'Starting a business in Germany',
    standfirst:
      "What the offices are, in what order, and which three boxes on the tax questionnaire decide how you are taxed for years afterwards.",
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Before anything else',
        body: [
          "This is a map, not advice. It is written by somebody who has been through it, checked against the sources listed at the bottom, and it will go out of date - Germany moved the small-business VAT thresholds in 2025 and renamed the law behind the website imprint in 2024, both of which broke every guide that had not been re-read.",
          "The order below matters more than it looks. Registering the trade automatically starts four other things, and the tax questionnaire that arrives afterwards contains the decisions that are hard to undo. Everything else on this page is recoverable.",
          "One reassurance up front, because it is the thing people put off: registering a business in Germany is cheap and quick. The trade office costs between €10 and €65 and takes about twenty minutes. What takes time is deciding what to tell the tax office, which is why most of this page is about that.",
        ],
      },
      {
        kind: 'choice',
        id: 'kind',
        heading: 'First fork: are you actually a trade?',
        intro: [
          "Germany splits self-employed people in two, and the split decides whether you go to the trade office at all. Getting it wrong in either direction is the single most common mistake, and it is expensive in one direction only.",
        ],
        choices: [
          {
            question: 'Gewerbe or Freiberuf?',
            options: [
              {
                name: 'Freiberufler (liberal profession)',
                when: "You practise one of the professions listed in § 18 EStG or something plainly similar: doctor, lawyer, tax adviser, engineer, architect, journalist, translator, teacher, artist. Software development often qualifies as engineer-like when the work is genuinely engineering rather than trading.",
                costs: 'No trade registration, no trade tax, no chamber of commerce membership, no fee.',
                catch:
                  "You do not get to choose this - the tax office decides, and it can decide years later and bill backwards. If you sell a product, run ads against it, or resell anything, you are a trade whatever your job title says.",
              },
              {
                name: 'Gewerbe (trade)',
                when: 'Everything else, and certainly anything that sells a product, a subscription, advertising space or somebody else’s goods. A studio selling a game is a trade. A platform charging for accounts is a trade.',
                costs: 'A registration fee of €10-65, chamber membership, and trade tax above the allowance.',
                catch:
                  'Trade tax sounds worse than it is for a sole trader: the first €24,500 of profit is exempt, and most of what is charged above that is credited against your income tax.',
              },
            ],
          },
          {
            question: 'Full-time or alongside a job?',
            options: [
              {
                name: 'Nebenerwerb (secondary)',
                when: 'You keep a job and the business is the smaller part of your week and your income.',
                catch:
                  "Read your employment contract first: most German contracts require you to notify your employer, and a side business competing with them is grounds for dismissal. Your health insurance stays as it is, which is the real saving.",
              },
              {
                name: 'Haupterwerb (main occupation)',
                when: 'The business is your work.',
                catch:
                  "Your statutory health insurance changes from a percentage of a salary to a contribution calculated on your income with a minimum floor. Tell your Krankenkasse before you start, not after - this is the bill that surprises people, and it is the largest one on this page.",
              },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'Second fork: what legal shell',
        intro: [
          "You can change this later, and plenty of people do - a sole trader becoming a GmbH is a normal, well-trodden and slightly expensive afternoon. So do not spend a month here.",
        ],
        choices: [
          {
            question: 'Which entity?',
            options: [
              {
                name: 'Einzelunternehmen (sole trader)',
                when: 'One person, starting out, and the work does not put anybody at physical or financial risk.',
                costs: 'The registration fee, and nothing else.',
                catch:
                  'You are personally liable without limit. You must also trade under your own first and last name - a brand name may be added, but the legal name has to appear on invoices and in the imprint.',
              },
              {
                name: 'GbR (partnership)',
                when: 'Two or more people, same conditions as above.',
                costs: 'The registration fee per partner.',
                catch:
                  'Each partner is liable for everything the others do. Write a partnership agreement even though the law does not make you - the default rules split everything equally and are silent about what happens when somebody leaves.',
              },
              {
                name: 'UG (haftungsbeschränkt)',
                when: 'You want limited liability and do not have €25,000. Nominally €1 of capital, in practice put in enough to cover the first year.',
                costs: 'Notary and commercial register, roughly €300-800 to form, plus proper bookkeeping and annual accounts forever after.',
                catch:
                  'You must retain a quarter of each year’s profit until you have accumulated â¬25,000 and can convert to a GmbH. Banks, landlords and some customers read "UG" as "thinly capitalised" and ask for a personal guarantee anyway, which puts your liability back where it started.',
              },
              {
                name: 'GmbH',
                when: 'Real liability exposure, outside investment, or partners who need shares that can be transferred.',
                costs:
                  '€25,000 share capital, of which €12,500 must be paid in before registration; notary and register fees of roughly €600-1,000.',
                catch:
                  "Double-entry bookkeeping and published annual accounts from day one. This is the point at which you stop doing your own books.",
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'The sequence',
        intro: [
          'Six things, of which two are appointments and the rest are forms. Steps 3 to 6 are largely triggered by step 2, so the thing to get right is the order of the first two.',
        ],
        steps: [
          {
            title: 'Sort the things that are hard to undo',
            takes: 'A week, mostly waiting for other people',
            body: [
              'Check the name is free before you print anything: the German trade mark register at DPMA and the EU register at EUIPO, plus a plain web search. A name that collides costs a rebrand and a cease-and-desist letter with a four-figure fee attached.',
              'Check whether your trade needs a permit. Most do not, but hospitality, brokerage, security, personnel leasing, transport and the crafts trades all do, and the trade office will refuse the registration without it.',
              'If you are leaving a job, tell your health insurer that you are about to become self-employed, and ask them in writing what your contribution will be.',
            ],
            watch:
              "If you are a founder in the arts or media - including games, design, writing and music - check whether you qualify for the Künstlersozialkasse before you register anything else. It pays roughly half your health and pension contributions, the way an employer would, and people miss it because it is not mentioned anywhere in the trade registration process.",
          },
          {
            title: 'Register the trade (Gewerbeanmeldung)',
            where: 'The Gewerbeamt, which in most cities is a counter inside the Bürgeramt or Ordnungsamt. Many federal states now take it online.',
            cost: '€10-65 depending on the municipality',
            takes: 'Twenty minutes, and the certificate is handed to you there',
            body: [
              'The form is called GewA 1. Bring photo ID, and proof of address if the office does not already have you registered there. That is the whole appointment.',
              'You come away with the Gewerbeanmeldung certificate, which is what banks, insurers and marketplaces mean when they ask for proof of business.',
              'This one form starts four other processes on its own: the tax office, the chamber of commerce, the statutory accident insurer and the statistical office are all notified. You do not need to contact any of them first.',
            ],
            fields: [
              {
                label: 'Angemeldete Tätigkeit (the activity)',
                means:
                  "Describe what you do broadly, and list more than one thing. This text is what you are registered for, and adding an activity later means another appointment and another fee. Write \"development and distribution of software, online services and digital media, advertising\" rather than \"game studio\".",
              },
              {
                label: 'Beginn der Tätigkeit (start date)',
                means:
                  "The day you started, which may be in the past - back-dating by a few weeks is normal and expected. This is the date your tax year and your obligations start from, so do not put a future date to be tidy.",
              },
              {
                label: 'Haupt- oder Nebenerwerb',
                means: 'The fork from the section above. It is not binding forever, but it is what the chamber and your insurer will read.',
              },
              {
                label: 'Betriebsstätte (place of business)',
                means:
                  'Your home address is fine for most trades. Check your tenancy agreement, and be aware that this address becomes public through the imprint on your website.',
              },
            ],
          },
          {
            title: 'Fill in the tax questionnaire (Fragebogen zur steuerlichen Erfassung)',
            where: 'ELSTER, the tax authority’s online portal. Since 2021 this must be filed electronically - paper is no longer accepted.',
            takes: 'An hour to fill in, two to six weeks for the answer',
            body: [
              'The tax office sends this after the trade registration, or you can start it yourself in ELSTER. It is due within a month. You will need an ELSTER account, and the certificate for one arrives by post, so start that first - it is the slowest thing on this page.',
              "This form is the most consequential piece of paper in the whole process. Four of its boxes are decisions rather than facts, and they are covered one by one below.",
              'The answer is your Steuernummer: the tax number that must appear on every invoice you write.',
            ],
            fields: [
              {
                label: 'Voraussichtlicher Umsatz und Gewinn (expected revenue and profit)',
                means:
                  "Your estimate for this year and next. It is not binding, but the tax office sets quarterly advance payments from it. Estimate honestly and slightly low: too high and you pay tax on money you have not earned yet, too low and you get a large correction plus new advance payments in the same month.",
              },
              {
                label: 'Kleinunternehmerregelung nach § 19 UStG',
                means:
                  'Whether you charge VAT. See the section below - this is the one to think about, and since 2025 it is also the one whose thresholds changed.',
              },
              {
                label: 'Soll- oder Istversteuerung',
                means:
                  'Whether you owe VAT when you send an invoice (Soll) or when the customer actually pays it (Ist). Ask for Istversteuerung if you are eligible. It is free, it is granted on request below a revenue threshold, and it means you are never funding a customer’s late payment out of your own pocket.',
              },
              {
                label: 'Umsatzsteuer-Identifikationsnummer (VAT ID)',
                means:
                  'Tick it. It is free, it takes one box, and you need it the moment you buy anything from another EU country - which includes almost every developer tool, and includes Stripe, whose European entity is Irish. Without it you pay foreign VAT you cannot reclaim.',
              },
              {
                label: 'SEPA-Lastschriftmandat (direct debit mandate)',
                means:
                  'Giving the tax office a direct debit. Worth doing: late payment carries automatic surcharges, and this is one fewer deadline to remember.',
              },
            ],
            watch:
              'Do not treat the estimate boxes as a formality. The most common first-year shock is not the tax bill but the quarterly advance payments the tax office sets on top of it after the first return.',
          },
          {
            title: 'Register with the statutory accident insurer (Berufsgenossenschaft)',
            where: 'The Berufsgenossenschaft for your sector. For office, software, media and design work that is the VBG.',
            takes: 'A form, and one week from starting the business',
            body: [
              'This is compulsory and has a deadline of one week, and almost nobody knows about it because it is buried in the notifications the trade office sends. Registering is free; the contribution for a one-person office business is small.',
              'Whether you personally are insured, as opposed to your future employees, depends on the insurer’s own rules - ask them directly.',
            ],
          },
          {
            title: 'Deal with the chamber (IHK or HWK)',
            where: 'Your regional Industrie- und Handelskammer, or Handwerkskammer for the crafts trades',
            cost: 'Typically €30-70 a year for a small business, and often nothing at all in the first years',
            takes: 'Nothing - they contact you',
            body: [
              'Membership is compulsory for every trade in Germany. There is no opting out, and the letter will arrive whether you want it or not.',
              'There is an exemption worth claiming: a business not entered in the commercial register, whose profit stays under the statutory threshold, pays no contribution for its first years of trading. It is not applied automatically - reply to their letter and ask.',
            ],
          },
          {
            title: 'Open a business account and set up invoicing',
            takes: 'An afternoon',
            body: [
              'A sole trader is not legally required to have a separate account, but mixing private and business money makes the bookkeeping harder than the account fee ever saves. A UG or GmbH needs one before it can be formed at all, because the capital has to be paid into it.',
              'Your invoices need the mandatory fields listed in § 14 UStG, which are covered in the shared invoicing chapter. Since 2025 every German business must be able to *receive* structured electronic invoices from other German businesses; the obligation to *send* them phases in from 2027, so what you need today is an email address that accepts them and software that can read one.',
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: 'vat',
        heading: 'The VAT decision',
        intro: [
          "This is the box people tick without reading, and it is the one that is genuinely a decision. The thresholds below are the ones that took effect in 2025 - guides still quoting €22,000 have not been updated.",
        ],
        choices: [
          {
            question: 'Kleinunternehmer under § 19 UStG, or standard VAT?',
            options: [
              {
                name: 'Kleinunternehmer',
                when: 'Your turnover stayed under €25,000 last calendar year and will stay under €100,000 this one. In your first year there is no previous year, so only the current-year limit applies.',
                costs: 'No VAT on your invoices, no VAT returns, much less bookkeeping.',
                catch:
                  "You cannot reclaim the VAT on anything you buy - which hurts if you are buying hardware, paying for services, or spending more than you earn in year one. Your invoices must state that no VAT is charged and why. And if you cross €100,000 mid-year, the exemption ends immediately on the transaction that crosses it, not at the end of the year.",
              },
              {
                name: 'Standard VAT (Regelbesteuerung)',
                when: 'You sell mainly to other businesses, or you are spending heavily before you earn.',
                costs: 'Monthly or quarterly VAT returns, and 19% on top of your prices.',
                catch:
                  'Business customers do not care - they reclaim it. Consumers do, because to them it is a 19% price rise. If you sell to the public, this choice changes your price list.',
              },
            ],
          },
          {
            question: 'Selling digital products to consumers in other EU countries?',
            options: [
              {
                name: 'Under €10,000 of EU cross-border sales a year',
                when: 'Starting out, most of your customers at home.',
                catch: 'You may keep charging German VAT and ignore the rest. Watch the running total.',
              },
              {
                name: 'Over it',
                when: 'Your customers are spread across the EU.',
                catch:
                  "VAT is owed where the *customer* is, at that country's rate, and you register once for the One-Stop-Shop and file a single quarterly return instead of registering in each country. Stripe Tax and similar services will compute the rates; the registration is still yours to do.",
              },
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'What it costs to start',
        intro: ['Sole trader, one person, no permit needed. The recurring costs are the ones that matter.'],
        costs: [
          { what: 'Gewerbeanmeldung', amount: '€10-65', note: 'Once. Set by your municipality.' },
          { what: 'Tax questionnaire and Steuernummer', amount: '€0', note: 'Free, via ELSTER.' },
          { what: 'VAT ID', amount: '€0', note: 'One box on the same form.' },
          { what: 'Berufsgenossenschaft', amount: 'A low two-digit sum a year', note: 'Compulsory. Free to register.' },
          { what: 'Chamber of commerce', amount: '€0-70 a year', note: 'Exemption available for the first years - you have to ask.' },
          { what: 'Notary and commercial register', amount: '€300-1,000', note: 'Only for a UG or GmbH.' },
          {
            what: 'Health insurance as a full-time self-employed person',
            amount: 'Several hundred a month',
            note: 'By far the largest number on this page, and the one nobody budgets for. Ask your insurer before you start.',
          },
          { what: 'Tax adviser for the first annual return', amount: '€400-1,500', note: 'Optional in year one, and usually worth it.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'The words on the forms',
        intro: ['Kept in German, because these are the words you have to type into a search box or say at a counter.'],
        terms: [
          { term: 'Gewerbeanmeldung', means: 'Registering a trade, at the trade office. The certificate you get is the proof of business everybody asks for.' },
          { term: 'Gewerbeamt', means: 'The trade office. Usually a counter in the Bürgeramt or Ordnungsamt rather than a building of its own.' },
          { term: 'Finanzamt', means: 'The tax office. Which one is yours depends on your address.' },
          { term: 'ELSTER', means: 'The tax authority’s online portal. Every filing goes through it. The account certificate arrives by post, so start it early.' },
          { term: 'Fragebogen zur steuerlichen Erfassung', means: 'The tax questionnaire that follows registration. The most consequential form in the process.' },
          { term: 'Steuernummer', means: 'Your tax number. Must appear on every invoice.' },
          { term: 'Umsatzsteuer-Identifikationsnummer (USt-IdNr)', means: 'The EU VAT ID, a different number from the above. Needed for buying and selling across EU borders.' },
          { term: 'Kleinunternehmerregelung', means: 'The small-business VAT exemption under § 19 UStG.' },
          { term: 'Umsatzsteuervoranmeldung', means: 'The periodic VAT return - monthly at first, then quarterly.' },
          { term: 'Einnahmenüberschussrechnung (EÜR)', means: 'Cash-basis accounts: income minus expenses. What small businesses file instead of a balance sheet.' },
          { term: 'Gewerbesteuer', means: 'Trade tax, charged by your municipality. Sole traders have a €24,500 allowance and most of the rest is credited against income tax.' },
          { term: 'IHK', means: 'The chamber of commerce. Membership is compulsory for trades.' },
          { term: 'Berufsgenossenschaft', means: 'The statutory accident insurer for your sector. Registration is compulsory within a week.' },
          { term: 'Künstlersozialkasse (KSK)', means: 'The social insurance fund for artists and publicists. It pays the employer’s half of your contributions if you qualify.' },
          { term: 'Handelsregister', means: 'The commercial register. Required for a UG or GmbH, optional for a sole trader.' },
          { term: 'Impressum', means: 'The legal disclosure every commercial website must carry. See the shared chapter.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Telling your health insurer late. Going full-time self-employed changes your contribution, and they will bill the difference back to the day you started.',
          'Not checking the Künstlersozialkasse if you work in games, design, writing, music or media. It is worth roughly half your health and pension contributions and there is no reminder anywhere in the process.',
          'Registering a single narrow activity at the trade office. Adding one later is another appointment and another fee.',
          'Treating the expected-profit boxes on the tax questionnaire as guesswork. They set your advance payments.',
          'Missing the one-week deadline for the accident insurer, which is not mentioned at the counter.',
          'Paying the chamber of commerce contribution without asking for the first-years exemption.',
          'Assuming the small-business VAT exemption lasts the year. Since 2025, crossing €100,000 ends it on the spot.',
          'Running ads, a waiting list or a pre-order page before registering. The obligation starts when the activity does, not when you get round to the paperwork - and a page that sells needs a full imprint from its first day.',
          'Losing money for several years with no plan to make any. The tax office can reclassify the whole thing as a hobby and take back the deductions.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to check this yourself',
        sources: [
          { label: 'ELSTER - the tax portal', href: 'https://www.elster.de', note: 'Where the questionnaire and every later filing is filed. Register first; the certificate comes by post.' },
          { label: 'Existenzgründungsportal (Federal Ministry for Economic Affairs)', href: 'https://www.existenzgruender.de', note: 'The government’s own founding portal. Dry, and correct.' },
          { label: 'Your local IHK', href: 'https://www.ihk.de', note: 'Free founding advice, including a first appointment, which your compulsory membership pays for anyway.' },
          { label: 'DPMA - German trade mark register', href: 'https://register.dpma.de', note: 'Check the name before you print it.' },
          { label: 'EUIPO - EU trade mark register', href: 'https://www.euipo.europa.eu', note: 'The same check, EU-wide.' },
          { label: 'Künstlersozialkasse', href: 'https://www.kuenstlersozialkasse.de', note: 'Check whether you qualify before you register anything else.' },
          { label: 'Gesetze im Internet - UStG', href: 'https://www.gesetze-im-internet.de/ustg_1980/', note: '§ 19 is the small-business rule, § 14 the mandatory invoice fields.' },
        ],
      },
    ],
  },
  de: {
    title: 'Ein Gewerbe in Deutschland anmelden',
    standfirst:
      'Welche Ämter, in welcher Reihenfolge – und welche drei Felder im Fragebogen zur steuerlichen Erfassung darüber entscheiden, wie du die nächsten Jahre besteuert wirst.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'who',
        heading: 'Vorweg',
        body: [
          'Das hier ist eine Landkarte, keine Beratung. Geschrieben von jemandem, der es hinter sich hat, gegen die Quellen ganz unten geprüft – und es wird veralten. Zum 1. Januar 2025 wurden die Grenzen der Kleinunternehmerregelung geändert, im Mai 2024 wurde aus § 5 TMG der § 5 DDG. Beides hat jeden Ratgeber falsch gemacht, der seitdem nicht neu gelesen wurde.',
          'Die Reihenfolge unten ist wichtiger, als sie aussieht. Die Gewerbeanmeldung stößt vier weitere Vorgänge von allein an, und der Fragebogen, der danach kommt, enthält die Entscheidungen, die sich schwer zurücknehmen lassen. Alles andere auf dieser Seite ist reparabel.',
          'Eine Beruhigung vorweg, weil genau das der Grund ist, warum es aufgeschoben wird: Ein Gewerbe anzumelden ist in Deutschland billig und schnell. Das Gewerbeamt kostet zwischen 10 und 65 Euro und dauert zwanzig Minuten. Zeit kostet die Frage, was du dem Finanzamt schreibst – deshalb geht es auf dieser Seite überwiegend darum.',
        ],
      },
      {
        kind: 'choice',
        id: 'kind',
        heading: 'Erste Weiche: Gewerbe oder gar nicht?',
        intro: [
          'Deutschland teilt Selbstständige in zwei Gruppen, und diese Teilung entscheidet, ob du überhaupt zum Gewerbeamt musst. Sich hier zu vertun ist der häufigste Fehler – teuer wird es allerdings nur in eine Richtung.',
        ],
        choices: [
          {
            question: 'Gewerbe oder Freiberuf?',
            options: [
              {
                name: 'Freiberufler',
                when: 'Du übst einen der Katalogberufe aus § 18 EStG aus oder etwas erkennbar Ähnliches: Arzt, Rechtsanwalt, Steuerberater, Ingenieur, Architekt, Journalist, Übersetzer, Lehrer, Künstler. Softwareentwicklung gilt häufig als ingenieurähnlich, wenn tatsächlich entwickelt und nicht gehandelt wird.',
                costs: 'Keine Gewerbeanmeldung, keine Gewerbesteuer, keine Kammer, keine Gebühr.',
                catch:
                  'Du kannst dir das nicht aussuchen – das Finanzamt entscheidet, und es kann Jahre später entscheiden und rückwirkend nachfordern. Wer ein Produkt verkauft, Werbung dagegen schaltet oder etwas weiterverkauft, ist Gewerbe, egal was auf der Visitenkarte steht.',
              },
              {
                name: 'Gewerbe',
                when: 'Alles andere, und ganz sicher alles, was ein Produkt, ein Abo, Werbeplätze oder fremde Ware verkauft. Ein Studio, das ein Spiel verkauft, ist Gewerbe. Eine Plattform, die Accounts abrechnet, ist Gewerbe.',
                costs: 'Anmeldegebühr von 10 bis 65 Euro, Kammerbeitrag, Gewerbesteuer oberhalb des Freibetrags.',
                catch:
                  'Die Gewerbesteuer klingt schlimmer, als sie für Einzelunternehmen ist: Die ersten 24.500 Euro Gewinn sind frei, und was darüber anfällt, wird zum größten Teil auf die Einkommensteuer angerechnet.',
              },
            ],
          },
          {
            question: 'Haupt- oder Nebenerwerb?',
            options: [
              {
                name: 'Nebenerwerb',
                when: 'Du behältst deinen Job, und das Gewerbe ist der kleinere Teil deiner Woche und deines Einkommens.',
                catch:
                  'Lies zuerst deinen Arbeitsvertrag: Die meisten verlangen eine Anzeige beim Arbeitgeber, und eine Nebentätigkeit in Konkurrenz zu ihm ist ein Kündigungsgrund. Deine Krankenversicherung bleibt, wie sie ist – das ist die eigentliche Ersparnis.',
              },
              {
                name: 'Haupterwerb',
                when: 'Das Gewerbe ist deine Arbeit.',
                catch:
                  'Deine gesetzliche Krankenversicherung wechselt vom Prozentsatz auf ein Gehalt zu einem Beitrag auf dein Einkommen mit Mindestbemessungsgrundlage. Sag deiner Krankenkasse vorher Bescheid, nicht hinterher – das ist die Rechnung, die Leute überrascht, und die größte auf dieser Seite.',
              },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: 'form',
        heading: 'Zweite Weiche: die Rechtsform',
        intro: [
          'Das lässt sich später ändern, und viele tun das auch – aus einem Einzelunternehmen eine GmbH zu machen ist ein normaler, gut ausgetretener und leicht teurer Nachmittag. Verbring hier also keinen Monat.',
        ],
        choices: [
          {
            question: 'Welche Rechtsform?',
            options: [
              {
                name: 'Einzelunternehmen',
                when: 'Eine Person, Anfang, und die Tätigkeit bringt niemanden körperlich oder finanziell in Gefahr.',
                costs: 'Die Anmeldegebühr, sonst nichts.',
                catch:
                  'Du haftest persönlich und unbeschränkt. Außerdem musst du unter deinem Vor- und Nachnamen auftreten – ein Fantasiename darf dazukommen, der bürgerliche Name muss aber auf Rechnungen und im Impressum stehen.',
              },
              {
                name: 'GbR',
                when: 'Zwei oder mehr Personen, sonst wie oben.',
                costs: 'Die Anmeldegebühr pro Gesellschafter.',
                catch:
                  'Jeder haftet für alles, was die anderen tun. Schreibt einen Gesellschaftsvertrag, auch wenn das Gesetz ihn nicht verlangt – die gesetzlichen Regeln teilen alles gleich auf und schweigen zu der Frage, was passiert, wenn jemand geht.',
              },
              {
                name: 'UG (haftungsbeschränkt)',
                when: 'Du willst Haftungsbeschränkung und hast keine 25.000 Euro. Nominal ein Euro Stammkapital, praktisch so viel, dass das erste Jahr davon lebt.',
                costs: 'Notar und Handelsregister, grob 300 bis 800 Euro Gründung, danach dauerhaft Buchführung und Jahresabschluss.',
                catch:
                  'Du musst ein Viertel des Jahresgewinns zurücklegen, bis 25.000 Euro erreicht sind und du in eine GmbH umwandeln kannst. Banken, Vermieter und manche Kunden lesen „UG“ als „dünn kapitalisiert“ und verlangen trotzdem eine persönliche Bürgschaft – womit die Haftung wieder da ist, wo sie vorher war.',
              },
              {
                name: 'GmbH',
                when: 'Echtes Haftungsrisiko, Kapital von außen, oder Mitgründer, die übertragbare Anteile brauchen.',
                costs:
                  '25.000 Euro Stammkapital, davon 12.500 Euro vor der Eintragung eingezahlt; Notar und Register grob 600 bis 1.000 Euro.',
                catch: 'Doppelte Buchführung und offengelegter Jahresabschluss ab dem ersten Tag. Ab hier machst du deine Buchhaltung nicht mehr selbst.',
              },
            ],
          },
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'Der Ablauf',
        intro: [
          'Sechs Dinge, davon zwei Termine und der Rest Formulare. Die Schritte 3 bis 6 werden größtenteils von Schritt 2 ausgelöst – worauf es also ankommt, ist die Reihenfolge der ersten beiden.',
        ],
        steps: [
          {
            title: 'Erledige zuerst, was sich schwer zurücknehmen lässt',
            takes: 'Eine Woche, überwiegend Warten auf andere',
            body: [
              'Prüfe den Namen, bevor du irgendetwas druckst: Markenregister des DPMA, EU-Register des EUIPO, dazu eine normale Websuche. Ein Name, der kollidiert, kostet einen Rebrand plus eine Abmahnung mit vierstelliger Gebühr.',
              'Prüfe, ob deine Tätigkeit erlaubnispflichtig ist. Die meisten sind es nicht, aber Gastronomie, Vermittlung, Bewachung, Arbeitnehmerüberlassung, Transport und das zulassungspflichtige Handwerk schon – ohne Erlaubnis nimmt das Gewerbeamt die Anmeldung nicht an.',
              'Wenn du einen Job aufgibst: Sag deiner Krankenkasse, dass du dich selbstständig machst, und lass dir schriftlich sagen, was dein Beitrag sein wird.',
            ],
            watch:
              'Wenn du im künstlerischen oder publizistischen Bereich gründest – Games, Design, Text, Musik gehören dazu –, prüfe die Künstlersozialkasse, bevor du sonst etwas anmeldest. Sie zahlt rund die Hälfte deiner Kranken- und Rentenversicherung wie ein Arbeitgeber, und sie wird im gesamten Anmeldeverfahren nirgends erwähnt.',
          },
          {
            title: 'Gewerbe anmelden',
            where: 'Das Gewerbeamt, in den meisten Städten ein Schalter im Bürgeramt oder Ordnungsamt. Viele Bundesländer nehmen die Anmeldung inzwischen online entgegen.',
            cost: '10 bis 65 Euro, je nach Gemeinde',
            takes: 'Zwanzig Minuten, die Bescheinigung bekommst du sofort',
            body: [
              'Das Formular heißt GewA 1. Mitbringen: Personalausweis, und eine Meldebescheinigung, falls das Amt dich nicht ohnehin unter dieser Adresse führt. Das ist der ganze Termin.',
              'Du gehst mit der Gewerbeanmeldung heraus – das ist das Papier, das Banken, Versicherer und Marktplätze meinen, wenn sie einen Nachweis über dein Gewerbe verlangen.',
              'Dieses eine Formular stößt vier weitere Vorgänge von allein an: Finanzamt, IHK, Berufsgenossenschaft und Statistisches Landesamt werden benachrichtigt. Du musst dort vorher nirgends anrufen.',
            ],
            fields: [
              {
                label: 'Angemeldete Tätigkeit',
                means:
                  'Beschreibe breit und nenne mehr als eine Sache. Auf diesen Text bist du angemeldet, und eine Tätigkeit später zu ergänzen heißt: noch ein Termin, noch eine Gebühr. Schreib „Entwicklung und Vertrieb von Software, Online-Diensten und digitalen Medien, Werbung“ statt „Spieleentwicklung“.',
              },
              {
                label: 'Beginn der Tätigkeit',
                means:
                  'Der Tag, an dem du angefangen hast – der darf in der Vergangenheit liegen, ein paar Wochen rückwirkend ist normal und wird erwartet. Ab diesem Datum laufen dein Steuerjahr und deine Pflichten, setz also kein Datum in die Zukunft, nur weil es ordentlicher aussieht.',
              },
              {
                label: 'Haupt- oder Nebenerwerb',
                means: 'Die Weiche von oben. Nicht für immer bindend, aber es ist das, was Kammer und Krankenkasse lesen.',
              },
              {
                label: 'Betriebsstätte',
                means:
                  'Für die meisten Tätigkeiten reicht die Wohnadresse. Sieh in deinen Mietvertrag, und sei dir bewusst: Diese Adresse wird über das Impressum deiner Website öffentlich.',
              },
            ],
          },
          {
            title: 'Fragebogen zur steuerlichen Erfassung ausfüllen',
            where: 'ELSTER, das Portal der Finanzverwaltung. Seit 2021 ist die elektronische Übermittlung Pflicht – Papier wird nicht mehr angenommen.',
            takes: 'Eine Stunde Ausfüllen, zwei bis sechs Wochen bis zur Antwort',
            body: [
              'Das Finanzamt schickt ihn nach der Gewerbeanmeldung, du kannst ihn aber auch selbst in ELSTER starten. Fällig ist er innerhalb eines Monats. Du brauchst ein ELSTER-Konto, und das Zertifikat dafür kommt per Post – fang also damit an, es ist das Langsamste auf dieser Seite.',
              'Dieses Formular ist das folgenreichste Papier im ganzen Verfahren. Vier seiner Felder sind keine Tatsachen, sondern Entscheidungen; sie stehen unten einzeln.',
              'Das Ergebnis ist deine Steuernummer – die Nummer, die auf jeder Rechnung stehen muss, die du schreibst.',
            ],
            fields: [
              {
                label: 'Voraussichtlicher Umsatz und Gewinn',
                means:
                  'Deine Schätzung für dieses und nächstes Jahr. Nicht bindend, aber das Finanzamt setzt daraus die Vorauszahlungen fest. Schätze ehrlich und eher knapp: zu hoch, und du zahlst Steuer auf Geld, das du noch nicht verdient hast; zu niedrig, und du bekommst eine große Nachzahlung plus neue Vorauszahlungen im selben Monat.',
              },
              {
                label: 'Kleinunternehmerregelung nach § 19 UStG',
                means:
                  'Ob du Umsatzsteuer ausweist. Siehe den Abschnitt unten – das ist das Feld, über das man nachdenken sollte, und seit 2025 auch das, dessen Grenzen sich geändert haben.',
              },
              {
                label: 'Soll- oder Istversteuerung',
                means:
                  'Ob du die Umsatzsteuer schuldest, sobald du die Rechnung schreibst (Soll), oder erst, wenn der Kunde zahlt (Ist). Beantrage die Istversteuerung, wenn du darfst. Sie kostet nichts, wird unterhalb einer Umsatzgrenze auf Antrag genehmigt, und sie heißt: Du finanzierst nie den Zahlungsverzug eines Kunden aus eigener Tasche vor.',
              },
              {
                label: 'Umsatzsteuer-Identifikationsnummer',
                means:
                  'Ankreuzen. Kostet nichts, ist ein Feld, und du brauchst sie in dem Moment, in dem du etwas aus einem anderen EU-Land kaufst – das trifft auf fast jedes Entwicklerwerkzeug zu und auf Stripe, dessen europäische Gesellschaft irisch ist. Ohne sie zahlst du ausländische Umsatzsteuer, die du nicht zurückholen kannst.',
              },
              {
                label: 'SEPA-Lastschriftmandat',
                means: 'Dem Finanzamt eine Einzugsermächtigung geben. Lohnt sich: Verspätung kostet automatisch Zuschläge, und es ist eine Frist weniger im Kopf.',
              },
            ],
            watch:
              'Behandle die Schätzfelder nicht als Formsache. Der häufigste Schock im ersten Jahr ist nicht die Steuernachzahlung, sondern die Vorauszahlungen, die das Finanzamt nach der ersten Erklärung obendrauf festsetzt.',
          },
          {
            title: 'Bei der Berufsgenossenschaft anmelden',
            where: 'Die Berufsgenossenschaft deiner Branche. Für Büro, Software, Medien und Design ist das die VBG.',
            takes: 'Ein Formular, Frist: eine Woche nach Beginn',
            body: [
              'Das ist Pflicht, die Frist beträgt eine Woche, und fast niemand weiß davon, weil es in den Benachrichtigungen untergeht, die das Gewerbeamt verschickt. Die Anmeldung ist kostenlos; der Beitrag für ein Ein-Personen-Bürogewerbe ist gering.',
              'Ob du selbst versichert bist – im Unterschied zu späteren Mitarbeitern – richtet sich nach der Satzung der jeweiligen Berufsgenossenschaft. Frag dort direkt nach.',
            ],
          },
          {
            title: 'Die Kammer klären (IHK oder HWK)',
            where: 'Deine regionale Industrie- und Handelskammer, im Handwerk die Handwerkskammer',
            cost: 'Für kleine Betriebe typischerweise 30 bis 70 Euro im Jahr, in den ersten Jahren oft gar nichts',
            takes: 'Nichts – sie melden sich',
            body: [
              'Die Mitgliedschaft ist für jedes Gewerbe in Deutschland Pflicht. Es gibt keinen Austritt, und der Brief kommt, ob du willst oder nicht.',
              'Es gibt eine Befreiung, die sich zu holen lohnt: Wer nicht im Handelsregister eingetragen ist und mit dem Gewinn unter der gesetzlichen Grenze bleibt, zahlt in den ersten Jahren keinen Beitrag. Sie wird nicht automatisch angewandt – antworte auf den Brief und frag danach.',
            ],
          },
          {
            title: 'Geschäftskonto eröffnen und Rechnungen aufsetzen',
            takes: 'Ein Nachmittag',
            body: [
              'Ein Einzelunternehmen braucht rechtlich kein getrenntes Konto, aber privates und geschäftliches Geld zu mischen macht die Buchhaltung teurer, als die Kontoführung je kostet. Eine UG oder GmbH braucht eins schon zur Gründung, weil das Kapital darauf eingezahlt wird.',
              'Deine Rechnungen brauchen die Pflichtangaben aus § 14 UStG – siehe das gemeinsame Kapitel zum Rechnungschreiben. Seit 2025 muss jedes deutsche Unternehmen strukturierte E-Rechnungen von anderen deutschen Unternehmen *empfangen* können; die Pflicht, selbst zu *senden*, kommt ab 2027 stufenweise. Heute brauchst du also eine Adresse, die sie annimmt, und Software, die eine lesen kann.',
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: 'vat',
        heading: 'Die Umsatzsteuer-Entscheidung',
        intro: [
          'Das ist das Feld, das ungelesen angekreuzt wird, und das einzige, das wirklich eine Entscheidung ist. Die Grenzen unten gelten seit 2025 – Ratgeber, die noch 22.000 Euro nennen, sind nicht aktualisiert.',
        ],
        choices: [
          {
            question: 'Kleinunternehmer nach § 19 UStG oder Regelbesteuerung?',
            options: [
              {
                name: 'Kleinunternehmer',
                when: 'Dein Umsatz lag im vorigen Kalenderjahr unter 25.000 Euro und bleibt in diesem unter 100.000 Euro. Im ersten Jahr gibt es kein Vorjahr, also gilt nur die laufende Grenze.',
                costs: 'Keine Umsatzsteuer auf deinen Rechnungen, keine Voranmeldungen, deutlich weniger Buchhaltung.',
                catch:
                  'Du kannst dir die Vorsteuer auf nichts zurückholen – das tut weh, wenn du Hardware kaufst, Dienstleistungen bezahlst oder im ersten Jahr mehr ausgibst als einnimmst. Auf der Rechnung muss stehen, dass und warum keine Umsatzsteuer ausgewiesen wird. Und wenn du die 100.000 Euro unterjährig reißt, endet die Befreiung sofort mit dem Umsatz, der sie reißt – nicht zum Jahresende.',
              },
              {
                name: 'Regelbesteuerung',
                when: 'Du verkaufst überwiegend an andere Unternehmen, oder du gibst viel aus, bevor du einnimmst.',
                costs: 'Monatliche oder vierteljährliche Voranmeldungen und 19 Prozent auf deine Preise.',
                catch:
                  'Geschäftskunden stört das nicht – sie holen es sich zurück. Verbraucher schon, für die sind es 19 Prozent Preiserhöhung. Wenn du an Privatleute verkaufst, ändert diese Entscheidung deine Preisliste.',
              },
            ],
          },
          {
            question: 'Digitale Produkte an Verbraucher in anderen EU-Ländern?',
            options: [
              {
                name: 'Unter 10.000 Euro grenzüberschreitendem EU-Umsatz im Jahr',
                when: 'Am Anfang, die meisten Kunden im Inland.',
                catch: 'Du darfst weiter deutsche Umsatzsteuer berechnen und den Rest ignorieren. Behalte die laufende Summe im Blick.',
              },
              {
                name: 'Darüber',
                when: 'Deine Kunden verteilen sich über die EU.',
                catch:
                  'Die Umsatzsteuer fällt dort an, wo der *Kunde* sitzt, zum dortigen Satz. Du meldest dich einmal beim One-Stop-Shop an und gibst eine einzige Quartalsmeldung ab, statt dich in jedem Land zu registrieren. Stripe Tax und ähnliche Dienste rechnen die Sätze aus; anmelden musst du dich selbst.',
              },
            ],
          },
        ],
      },
      {
        kind: 'costs',
        id: 'costs',
        heading: 'Was der Start kostet',
        intro: ['Einzelunternehmen, eine Person, ohne Erlaubnispflicht. Wichtig sind die laufenden Posten.'],
        costs: [
          { what: 'Gewerbeanmeldung', amount: '10–65 €', note: 'Einmalig. Legt deine Gemeinde fest.' },
          { what: 'Fragebogen und Steuernummer', amount: '0 €', note: 'Kostenlos, über ELSTER.' },
          { what: 'Umsatzsteuer-Identifikationsnummer', amount: '0 €', note: 'Ein Feld im selben Formular.' },
          { what: 'Berufsgenossenschaft', amount: 'Niedriger zweistelliger Betrag im Jahr', note: 'Pflicht. Anmeldung kostenlos.' },
          { what: 'IHK', amount: '0–70 € im Jahr', note: 'Befreiung für die ersten Jahre möglich – du musst danach fragen.' },
          { what: 'Notar und Handelsregister', amount: '300–1.000 €', note: 'Nur für UG oder GmbH.' },
          {
            what: 'Krankenversicherung als hauptberuflich Selbstständiger',
            amount: 'Mehrere hundert Euro im Monat',
            note: 'Mit Abstand die größte Zahl auf dieser Seite und die, die niemand einplant. Frag deine Kasse, bevor du anfängst.',
          },
          { what: 'Steuerberater für die erste Jahreserklärung', amount: '400–1.500 €', note: 'Im ersten Jahr optional und meistens die Sache wert.' },
        ],
      },
      {
        kind: 'terms',
        id: 'terms',
        heading: 'Die Wörter auf den Formularen',
        intro: ['Kurz erklärt – das sind die Begriffe, mit denen die Ämter arbeiten.'],
        terms: [
          { term: 'Gewerbeanmeldung', means: 'Die Anmeldung beim Gewerbeamt. Die Bescheinigung daraus ist der Gewerbenachweis, nach dem alle fragen.' },
          { term: 'Gewerbeamt', means: 'Meist ein Schalter im Bürgeramt oder Ordnungsamt, kein eigenes Haus.' },
          { term: 'Finanzamt', means: 'Zuständig ist das Amt an deiner Adresse.' },
          { term: 'ELSTER', means: 'Das Portal der Finanzverwaltung. Jede Übermittlung läuft darüber. Das Zertifikat kommt per Post – früh anfangen.' },
          { term: 'Fragebogen zur steuerlichen Erfassung', means: 'Der steuerliche Erfassungsbogen nach der Anmeldung. Das folgenreichste Formular des Verfahrens.' },
          { term: 'Steuernummer', means: 'Deine Steuernummer. Muss auf jeder Rechnung stehen.' },
          { term: 'Umsatzsteuer-Identifikationsnummer (USt-IdNr)', means: 'Die EU-Umsatzsteuer-ID – eine andere Nummer als die Steuernummer. Nötig für Ein- und Verkauf über EU-Grenzen.' },
          { term: 'Kleinunternehmerregelung', means: 'Die Umsatzsteuerbefreiung nach § 19 UStG.' },
          { term: 'Umsatzsteuervoranmeldung', means: 'Die laufende Umsatzsteuermeldung – anfangs monatlich, später vierteljährlich.' },
          { term: 'Einnahmenüberschussrechnung (EÜR)', means: 'Einnahmen minus Ausgaben. Was kleine Betriebe statt einer Bilanz abgeben.' },
          { term: 'Gewerbesteuer', means: 'Steuer der Gemeinde. Einzelunternehmen haben 24.500 Euro Freibetrag, der Rest wird weitgehend auf die Einkommensteuer angerechnet.' },
          { term: 'IHK', means: 'Industrie- und Handelskammer. Mitgliedschaft für Gewerbe ist Pflicht.' },
          { term: 'Berufsgenossenschaft', means: 'Die gesetzliche Unfallversicherung deiner Branche. Anmeldung binnen einer Woche ist Pflicht.' },
          { term: 'Künstlersozialkasse (KSK)', means: 'Die Sozialversicherung für Künstler und Publizisten. Sie übernimmt den Arbeitgeberanteil, wenn du dazugehörst.' },
          { term: 'Handelsregister', means: 'Pflicht für UG und GmbH, für Einzelunternehmen freiwillig.' },
          { term: 'Impressum', means: 'Die Pflichtangaben nach § 5 DDG auf jeder geschäftlichen Website. Siehe das gemeinsame Kapitel.' },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'Die Fallen',
        items: [
          'Der Krankenkasse zu spät Bescheid geben. Hauptberuflich selbstständig zu werden ändert den Beitrag, und die Differenz wird bis zum Starttag nachgefordert.',
          'Die Künstlersozialkasse nicht prüfen, wenn du in Games, Design, Text, Musik oder Medien arbeitest. Es geht um rund die Hälfte deiner Kranken- und Rentenbeiträge, und im ganzen Verfahren erinnert dich niemand daran.',
          'Beim Gewerbeamt eine einzige, enge Tätigkeit anmelden. Eine zweite später einzutragen heißt: noch ein Termin, noch eine Gebühr.',
          'Die Gewinnschätzung im Fragebogen als Raterei behandeln. Sie setzt deine Vorauszahlungen fest.',
          'Die Wochenfrist der Berufsgenossenschaft verpassen, von der am Schalter niemand spricht.',
          'Den IHK-Beitrag zahlen, ohne die Befreiung für die ersten Jahre zu beantragen.',
          'Annehmen, die Kleinunternehmerregelung halte das Jahr durch. Seit 2025 endet sie beim Überschreiten der 100.000 Euro sofort.',
          'Werbung, Warteliste oder Vorbestellseite vor der Anmeldung. Die Pflicht beginnt mit der Tätigkeit, nicht mit dem Papierkram – und eine Seite, die verkauft, braucht vom ersten Tag an ein vollständiges Impressum.',
          'Jahrelang Verluste ohne erkennbare Gewinnabsicht. Das Finanzamt kann das Ganze als Liebhaberei einstufen und die Abzüge zurückholen.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Wo du das selbst nachliest',
        sources: [
          { label: 'ELSTER', href: 'https://www.elster.de', note: 'Wo der Fragebogen und jede spätere Meldung eingereicht wird. Zuerst registrieren, das Zertifikat kommt per Post.' },
          { label: 'Existenzgründungsportal des BMWK', href: 'https://www.existenzgruender.de', note: 'Das Gründerportal des Bundes. Trocken und richtig.' },
          { label: 'Deine IHK vor Ort', href: 'https://www.ihk.de', note: 'Kostenlose Gründungsberatung inklusive Erstgespräch – zahlst du über den Pflichtbeitrag ohnehin.' },
          { label: 'DPMA – Markenregister', href: 'https://register.dpma.de', note: 'Namen prüfen, bevor du ihn druckst.' },
          { label: 'EUIPO – EU-Markenregister', href: 'https://www.euipo.europa.eu', note: 'Dieselbe Prüfung, EU-weit.' },
          { label: 'Künstlersozialkasse', href: 'https://www.kuenstlersozialkasse.de', note: 'Prüfen, bevor du sonst etwas anmeldest.' },
          { label: 'Gesetze im Internet – UStG', href: 'https://www.gesetze-im-internet.de/ustg_1980/', note: '§ 19 ist die Kleinunternehmerregelung, § 14 sind die Rechnungspflichtangaben.' },
        ],
      },
    ],
  },
}
