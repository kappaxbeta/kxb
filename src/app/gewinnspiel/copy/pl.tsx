import type { ContestFacts } from '@/app/gewinnspiel/facts'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import { Bullets, CONTROLLER, ControllerBlock } from '@/app/legal/shell'

/**
 * Regulamin po polsku - a translation of `de.tsx`, which binds.
 *
 * `§` here, unlike the French and Spanish versions: Polish legal drafting uses
 * the paragraph sign natively, so keeping it is the *less* foreign choice
 * rather than the more.
 *
 * The links to the terms of use and the privacy notice point at their English
 * versions and say so - those two documents exist in German and English only.
 */
export function plCopy(f: ContestFacts): ContestCopy {
  return {
    locale: 'pl',

    meta: {
      title: 'Regulamin konkursu',
      description:
        'Zbuduj pokój, opublikuj jego zdjęcie na X, wygraj bon. Czym jest kxb.team, jak wziąć udział i pełny regulamin losowania.',
      ogTitle: 'Losowanie na start bety – regulamin',
      ogDescription: 'Zbuduj pokój, opublikuj jego zdjęcie na X, wygraj bon. 1–30 września.',
      posterAlt:
        'Wokselowy dinozaur przeskakuje przez zielony portal w kosmosie, wokół lis, panda i unoszące się bloki, obok napis „Win a voucher | here to play.” oraz nagrody 1×50 € i 2×25 €.',
    },

    chrome: {
      back: '← Powrót na stronę główną',
      title: 'Losowanie na start bety',
      chooserLabel: 'Język',
      deadline: `Termin nadsyłania zgłoszeń: ${f.end} ${f.timezone}`,
      binding:
        'To jest tłumaczenie informacyjne. Wiążąca jest wersja niemiecka pod adresem /gewinnspiel; w razie rozbieżności rozstrzyga tekst niemiecki.',
      sectionMark: '§',
      hint: 'Ta strona jest dostępna także w języku: {language}.',
    },

    intro: {
      kicker: 'Otwarta beta',
      lead: 'Zbuduj pokój, zrób mu zdjęcie i opublikuj je na X. Wśród wszystkich zgłoszeń losujemy trzy bony.',
      game: {
        title: 'Czym jest kxb.team?',
        body: [
          'Pokój w przeglądarce. Otwierasz link, wpisujesz imię, wybierasz jedno z 24 zwierząt i już w nim stoisz — nic do instalowania, żadnych kont dla gości, żadnego hasła do wymyślenia.',
          'Pokój jest zarazem edytorem. Pięćdziesiąt osiem elementów w palecie, a stawiasz je, stojąc w świecie, w którym wszyscy inni nadal stoją. Postaw dwie bramki i masz boisko. Połóż parkiet, i to tam odbędzie się wieczór.',
          'I gra się w nim: piłka, wyścigi, bijatyki, zmiany w kawiarni. Nic z tego nie liczy się nigdzie do żadnego rankingu. To jest miejsce, a nie tabela wyników.',
        ],
        shotAlt:
          'Okno kxb.team: po lewej nawigacja z pokojami, pośrodku panda w ceglanym pokoju, po prawej lista obecnych.',
        cta: 'Wypróbuj sam',
      },
      steps: {
        title: 'Jak wziąć udział',
        items: [
          {
            title: 'Zbuduj pokój',
            body: 'Twój salon albo nowy pokój — jak wolisz. Kawiarnia, arena, pokój dzienny, jedne bardzo długie schody: tego nie oceniamy.',
            alt: 'Pokój z kamiennych bloków, w nim sześć stanowisk z monitorami, warsztat i czerwona beczka.',
          },
          {
            title: 'Zrób zdjęcie',
            body: 'Migawka w pokoju daje obraz bez interfejsu — sam świat, żadnych imion, żadnej linijki czatu. Zrzut ekranu zrobiony samodzielnie jest równie dobry.',
            alt: 'Dwa zwierzęta na rozświetlonym parkiecie w kratę w ceglanej hali, reflektory omiatają ściany.',
          },
          {
            title: `Opublikuj z #${f.hashtag}`,
            body: `Publiczny wpis na X, we wrześniu, z hashtagiem — i obserwuj @${f.handle}, żebyśmy mogli się odezwać w razie wygranej. To wszystko.`,
            alt: 'Cztery wokselowe zwierzęta obok siebie na zielonej łące, nad nimi emotki w dymkach.',
          },
        ],
      },
      prizes: {
        title: 'Do wygrania',
        note: 'To losowanie, a nie konkurs. Bez jury, bez oceniania, bez rankingu — każde ważne zgłoszenie ma taką samą szansę, niezależnie od tego, ile w nie włożono pracy.',
        place: 'Nagroda {n}',
      },
      cta: { signup: 'Zapisz się do bety', github: 'Daj gwiazdkę na GitHubie' },
      handover:
        'Cała reszta — kto może wziąć udział, jak wygląda losowanie, co dzieje się z Twoim zdjęciem — jest tutaj:',
    },

    sections: {
      organiser: {
        heading: 'Organizator',
        body: (
          <>
            <p>
              Organizatorem tego losowania i osobą kontaktową we wszystkich sprawach z nim związanych
              jest:
            </p>
            <ControllerBlock />
            <p>
              Niniejszy regulamin dotyczy wyłącznie tego losowania. Korzystanie z samej usługi
              reguluje dodatkowo nasz{' '}
              <a href="/agb/en" className="text-accent hover:underline">
                regulamin serwisu
              </a>{' '}
              (dostępny po niemiecku i po angielsku).
            </p>
          </>
        ),
      },

      what: {
        heading: 'O co chodzi',
        body: (
          <>
            <p>
              kxb.team wchodzi w otwartą betę. Z tej okazji losujemy bony wśród wszystkich, którzy w
              tym czasie zbudują własny pokój i opublikują jego zdjęcie na X.
            </p>
            <p>
              To losowanie, a nie konkurs: nie ma jury, oceniania ani rankingu według jakości. Każde
              ważne zgłoszenie ma taką samą szansę na wygraną, niezależnie od tego, ile w nie włożono
              pracy i ile osób je zobaczyło.
            </p>
          </>
        ),
      },

      window: {
        heading: 'Okres przyjmowania zgłoszeń',
        body: (
          <p>
            Zgłoszenia uwzględniamy od {f.start} do {f.end} {f.timezone}.
            Rozstrzyga czas publikacji wskazany przez X. Wpisy opublikowane przed rozpoczęciem lub po
            upływie tego terminu nie biorą udziału.
          </p>
        ),
      },

      eligibility: {
        heading: 'Kto może wziąć udział',
        body: (
          <>
            <p>Uczestnikami mogą być osoby fizyczne, które</p>
            <Bullets
              items={[
                `ukończyły ${f.minAge} lat,`,
                'mieszkają w Unii Europejskiej, w Europejskim Obszarze Gospodarczym, w Szwajcarii lub w Zjednoczonym Królestwie — z wyjątkiem Włoch,',
                'mają własne, publicznie widoczne konto na X, oraz',
                'mają własne konto w kxb.team.',
              ]}
            />
            <p>
              Włochy są wyłączone, ponieważ zgodnie z włoskimi przepisami o{' '}
              <em>manifestazioni a premio</em> losowania skierowane do tamtejszych mieszkańców trzeba
              wcześniej zgłosić właściwemu organowi i zabezpieczyć kaucją. Przy losowaniu tej wielkości
              nie jesteśmy w stanie tego udźwignąć. Wyłączenie jest wymierzone w formalność, a nie w
              ludzi.
            </p>
            <p>
              Wyłączeni są ponadto sam organizator oraz jego krewni w linii prostej i osoby prowadzące
              z nim wspólne gospodarstwo domowe.
            </p>
            <p>
              Jedno zgłoszenie na osobę. Kto opublikuje kilka, bierze udział z tym opublikowanym
              najwcześniej; pozostałe pomijamy. Kilka kont tej samej osoby liczy się jako jedna osoba.
            </p>
          </>
        ),
      },

      entry: {
        heading: 'Jak wziąć udział',
        body: (
          <>
            <p>Na ważne zgłoszenie składa się pięć rzeczy:</p>
            <Bullets
              items={[
                'Budujesz pokój w przestrzeni na kxb.team – swój salon albo kolejny pokój, jak wolisz.',
                'Robisz mu zdjęcie. Migawka w pokoju daje obraz bez interfejsu; zrzut ekranu zrobiony samodzielnie jest równie dobry.',
                <>
                  Publikujesz to zdjęcie w okresie zgłoszeń w publicznym wpisie na X z hashtagiem{' '}
                  <strong>#{f.hashtag}</strong>.
                </>,
                'Twoje konto na X jest w tym momencie publicznie widoczne, żebyśmy w ogóle mogli zobaczyć wpis.',
                <>
                  Obserwujesz konto <strong>@{f.handle}</strong> na X.
                </>,
              ]}
            />
            <p>
              Obserwowanie sprawdzamy raz, w chwili losowania. Kto do tego czasu przestanie obserwować,
              nie bierze udziału; kto zacznie obserwować dopiero po wpisie, bierze udział.
            </p>
            <p>
              Pokój na zdjęciu musi być zbudowany przez Ciebie. Zdjęcie z cudzej przestrzeni, zdjęcie z
              internetu albo wpis bez rozpoznawalnego pokoju nie jest ważnym zgłoszeniem.
            </p>
            <p>Czego nie może być widać na zdjęciu ani we wpisie:</p>
            <Bullets
              items={[
                'treści nienawistnych, poniżających lub dyskryminujących – w szczególności wymierzonych w ludzi ze względu na pochodzenie, kolor skóry, religię, światopogląd, niepełnosprawność, płeć lub orientację seksualną;',
                'symboli i oznaczeń niezgodnych z konstytucją;',
                'gloryfikacji przemocy oraz treści pornograficznych lub zseksualizowanych;',
                'zniewag, gróźb lub nękania wymierzonych w konkretną osobę;',
                'treści naruszających § 5 naszego regulaminu serwisu lub obowiązujące prawo.',
              ]}
            />
            <p>
              Zgłoszenie, które to pokazuje, nie bierze udziału i my również go nie pokażemy. Nie
              oceniamy tego, jak urządziłeś swój pokój &ndash; tę granicę oceniamy.
            </p>
            <p>
              Zadbaj o to, żeby na zdjęciu nie było danych innych osób &ndash; na przykład imion osób
              obecnych albo wiadomości z czatu. Migawka w pokoju fotografuje wyłącznie świat i pomija
              interfejs; kto robi zrzut całego okna przeglądarki, musi sprawdzić to sam.
            </p>
          </>
        ),
      },

      free: {
        heading: 'Udział jest bezpłatny',
        body: (
          <>
            <p>
              Udział nie wiąże się z żadnymi kosztami. Zakup płatnej usługi nie jest warunkiem udziału
              ani nie zwiększa szansy na wygraną.
            </p>
            <p>
              Budować może każdy członek, także w planie bezpłatnym. Kto na czas losowania chce więcej
              pokoi, więcej miejsc i obrazy na ścianach, może pod adresem{' '}
              <a href={f.codePath} className="text-accent hover:underline">
                kxb.team{f.codePath}
              </a>{' '}
              zrealizować kod <strong>{f.code}</strong> i przez miesiąc bezpłatnie korzystać z
              planu xo. To również jest dobrowolne i nie wpływa na losowanie.
            </p>
            {/* Only when the code actually carries them. What it hands over is set
                in the backoffice, and a clause promising bucks the code does not
                give would be a promise in a binding document. */}
            {f.bucks > 0 ? (
              <p>
                Kod daje też {f.bucks} bucksów na skiny — są dostępne od razu.
              </p>
            ) : null}
            <p>
              Koszty dostępu do internetu i korzystania z X ponosisz sam; udział nie dokłada do nich
              niczego.
            </p>
          </>
        ),
      },

      prizes: {
        heading: 'Co można wygrać',
        body: (
          <>
            <p>Losujemy następujące bony:</p>
            <Bullets
              items={f.prizes.map((amount, i) => (
                <>{`${i + 1}.`} nagroda: bon o wartości {amount}&nbsp;&euro;</>
              ))}
            />
            <p>
              Bon wysyłamy jako kod pocztą elektroniczną. Zwyciężczynie i zwycięzcy mogą wskazać
              sprzedawcę, na którego bon ma zostać wystawiony, o ile bon takiego sprzedawcy o tej
              wartości jest dostępny na rynku. W przeciwnym razie wystawiamy bon równorzędnego
              dostawcy.
            </p>
            <p>
              Wypłata równowartości w gotówce, wymiana ani przeniesienie nagrody na inną osobę są
              wyłączone. Ewentualne podatki od nagrody ponosi organizator.
            </p>
          </>
        ),
      },

      draw: {
        heading: 'Jak wyłaniamy zwycięzców',
        body: (
          <>
            <p>
              Po upływie okresu zgłoszeń spisujemy wszystkie ważne zgłoszenia w kolejności publikacji i
              nadajemy im numery. {f.draw} losujemy z nich trzy numery generatorem losowym:
              pierwszy dla 1. nagrody, drugi dla 2., trzeci dla 3. Każdy numer może zostać wylosowany
              tylko raz.
            </p>
            <p>
              Losowanie dokumentujemy i publikujemy tę dokumentację wraz z wynikiem. Rozstrzyga
              wyłącznie los; roszczenie o określoną nagrodę nie przysługuje.
            </p>
          </>
        ),
      },

      notice: {
        heading: 'Powiadomienie i wydanie nagrody',
        body: (
          <>
            <p>
              Zwyciężczynie i zwycięzców powiadamiamy w ciągu trzech dni od losowania wiadomością
              prywatną na X, na konto, z którego pochodzi zgłoszenie. Do osób, które nie mogą odbierać
              od nas wiadomości prywatnych, zwracamy się publicznie pod ich własnym wpisem.
            </p>
            <p>
              Do wysłania bonu potrzebujemy adresu e-mail. Jeżeli powiadomiona osoba nie odezwie się w
              ciągu 14&nbsp;dni od powiadomienia, prawo do nagrody wygasa, a my losujemy tę nagrodę
              ponownie spośród pozostałych ważnych zgłoszeń.
            </p>
            <p>Bon wysyłamy w ciągu 14&nbsp;dni od otrzymania adresu e-mail.</p>
          </>
        ),
      },

      yourEntry: {
        heading: 'Twoje zgłoszenia',
        body: (
          <>
            <p>
              Zdjęcie i zbudowany przez Ciebie pokój pozostają Twoje. Nie nabywamy do nich żadnej
              własności.
            </p>
            <p>
              Biorąc udział, udzielasz nam niewyłącznego, nieodpłatnego i w każdej chwili odwołalnego
              prawa do pokazywania Twojego zgłoszenia w związku z tym losowaniem &ndash; czyli do
              odtwarzania go na naszych własnych kanałach i na kxb.team, z podaniem nazwy Twojego konta
              na X. Dalej to prawo nie sięga: żadnej obróbki ponad to, co technicznie wiąże się z
              udostępnieniem, żadnego przekazywania osobom trzecim i żadnego wykorzystania w płatnej
              reklamie. Na Twoją wiadomość na adres {CONTROLLER.email} zdejmujemy zgłoszenie z naszych
              kanałów.
            </p>
            <p>
              Zapewniasz, że zgłoszenie pochodzi od Ciebie i nie narusza praw osób trzecich &ndash; w
              szczególności, że masz niezbędne prawa do obrazów, które powiesiłeś w pokoju na ścianach.
            </p>
          </>
        ),
      },

      exclusion: {
        heading: 'Wykluczenie z udziału',
        body: (
          <>
            <p>
              Możemy wykluczyć zgłoszenia i osoby z udziału, jeżeli zachodzi ważny powód. Zachodzi on w
              szczególności przy
            </p>
            <Bullets
              items={[
                'korzystaniu z kilku kont, ze środków zautomatyzowanych lub z kont założonych specjalnie w celu udziału,',
                'zgłoszeniach pokazujących treści bezprawne lub wyłączone przez § 5 niniejszego regulaminu,',
                'zgłoszeniach, które nie pochodzą od samego uczestnika,',
                'nieprawdziwych danych o własnej osobie.',
              ]}
            />
            <p>
              Jeżeli nagroda została już wysłana, w takich przypadkach możemy żądać jej zwrotu.
              Wykluczenie przekazujemy osobie, której dotyczy, tą samą drogą, którą wzięła udział.
            </p>
          </>
        ),
      },

      ending: {
        heading: 'Wcześniejsze zakończenie lub zmiana',
        body: (
          <>
            <p>
              Możemy przerwać lub zmienić losowanie, jeżeli z przyczyn, za które nie odpowiadamy, nie
              da się go przeprowadzić prawidłowo &ndash; na przykład przy poważnej awarii technicznej,
              przy manipulacjach z zewnątrz albo gdy przeprowadzenie przestanie być prawnie
              dopuszczalne.
            </p>
            <p>
              Jeżeli okres zgłoszeń już wtedy upłynął, losowanie przeprowadzamy mimo to. O przerwaniu
              lub zmianie informujemy na tej stronie oraz na koncie @{f.handle} na X.
            </p>
          </>
        ),
      },

      privacy: {
        heading: 'Ochrona danych',
        body: (
          <>
            <p>
              Na potrzeby losowania przetwarzamy nazwę Twojego konta na X, link do Twojego wpisu i
              opublikowane w nim zdjęcie; w razie wygranej dodatkowo adres e-mail, na który ma trafić
              bon. Danych tych używamy wyłącznie do losowania i nie przekazujemy ich w celach
              reklamowych.
            </p>
            <p>
              Szczegóły &ndash; podstawy prawne, okresy przechowywania i Twoje prawa &ndash; znajdują
              się w punkcie 13 naszej{' '}
              <a href="/datenschutz/en" className="text-accent hover:underline">
                polityki prywatności
              </a>{' '}
              (dostępnej po niemiecku i po angielsku). To, co X robi z Twoim wpisem i Twoimi danymi,
              reguluje regulamin X i pozostaje poza naszą odpowiedzialnością.
            </p>
          </>
        ),
      },

      noAffiliation: {
        heading: 'Brak związku z X i ze sprzedawcą',
        body: (
          <>
            <p>
              To losowanie nie ma żadnego związku z X. X go nie sponsoruje, nie wspiera, nie
              organizuje ani nie współodpowiada za nie w jakikolwiek sposób. Wszelkie informacje i
              roszczenia kieruj wyłącznie do organizatora wskazanego w § 1, a nie do X.
            </p>
            <p>
              Losowanie nie ma również związku ze sprzedawcą, na którego wystawiany jest bon. Sprzedawca
              nie jest ani organizatorem, ani sponsorem i nie ma nic wspólnego z jego przeprowadzeniem;
              bon kupujemy jak każdy inny klient.
            </p>
          </>
        ),
      },

      liability: {
        heading: 'Odpowiedzialność',
        body: (
          <>
            <h3 className="mb-2 text-xl font-medium text-ink">Za losowanie</h3>
            <p>
              Za szkody wynikające z naruszenia życia, ciała lub zdrowia oraz na podstawie niemieckiej
              ustawy o odpowiedzialności za produkt odpowiadamy bez ograniczeń, tak samo za działanie
              umyślne i rażące niedbalstwo. Przy zwykłym niedbalstwie odpowiadamy tylko za naruszenie
              istotnego obowiązku umownego, i to w wysokości ograniczonej do przewidywalnej szkody
              typowej dla tego rodzaju umowy. W pozostałym zakresie odpowiedzialność jest wyłączona.
            </p>
            <h3 className="mb-2 mt-6 text-xl font-medium text-ink">Za bon</h3>
            <p>
              Z chwilą wysłania kodu bonu nagroda jest wydana. Realizację bonu regulują warunki
              sprzedawcy, który go wystawił; nie możemy ręczyć za to, że go przyjmie.
            </p>
          </>
        ),
      },

      final: {
        heading: 'Postanowienia końcowe',
        body: (
          <>
            <p>
              Stosuje się prawo Republiki Federalnej Niemiec. Jeżeli jako konsument masz miejsce
              zwykłego pobytu w innym państwie, bezwzględnie obowiązujące przepisy o ochronie
              konsumentów tego państwa pozostają nienaruszone.
            </p>
            <p>
              Niniejszy regulamin jest dostępny także w innych językach. Wiążąca jest wersja
              niemiecka; w razie rozbieżności ma ona pierwszeństwo przed tłumaczeniami.
            </p>
            <p>
              Jeżeli któreś z postanowień niniejszego regulaminu okazałoby się nieskuteczne,
              skuteczność pozostałych pozostaje nienaruszona.
            </p>
            <p>Droga sądowa jest wyłączona.</p>
          </>
        ),
      },
    },
  }
}
