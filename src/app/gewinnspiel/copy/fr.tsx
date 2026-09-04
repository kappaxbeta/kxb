import type { ContestFacts } from '@/app/gewinnspiel/facts'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import { Bullets, CONTROLLER, ControllerBlock } from '@/app/legal/shell'

/**
 * Les conditions en français - a translation of `de.tsx`, which binds.
 *
 * Two things differ from the English version and both are deliberate:
 *
 *   `sectionMark` is `Art.` rather than `§`. The paragraph sign is native to
 *   German and Polish legal drafting and is read as one in English; in French
 *   it is a foreign mark that makes a plain document look like a translation
 *   of a statute. The numbering is the same in every language regardless - it
 *   comes from `CONTEST_SECTIONS` - so a cross-reference still lands on the
 *   same clause whichever version somebody is holding.
 *
 *   The links to the terms of use and the privacy notice point at their English
 *   versions and say so, because those two documents exist in German and
 *   English only. A link that silently hands a French reader a German page is
 *   worse than one that warns them first.
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
const ORDINALS = ['1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e', '10e']

export function frCopy(f: ContestFacts): ContestCopy {
  return {
    locale: 'fr',

    meta: {
      title: 'Règlement du jeu-concours',
      description:
        'Construisez une salle, publiez-en une image sur X, gagnez un bon d’achat. Ce qu’est kxb.team, comment participer, et le règlement complet.',
      ogTitle: 'Jeu-concours de lancement – le règlement',
      ogDescription:
        'Construisez une salle, publiez-en une image sur X, gagnez un bon d’achat. Du 1er au 30 septembre.',
      posterAlt:
        'Un dinosaure en voxels bondit à travers un portail vert dans l’espace, entouré d’un renard, d’un panda et de blocs flottants, à côté des mots « Win a voucher | here to play. » et des lots 1×50 € et 2×25 €.',
    },

    chrome: {
      back: '← Retour à l’accueil',
      title: 'Jeu-concours de lancement',
      chooserLabel: 'Langue',
      deadline: `Clôture des participations : ${f.end} ${f.timezone}`,
      binding:
        'Ceci est une traduction de courtoisie. La version allemande, à l’adresse /gewinnspiel, fait foi ; en cas de divergence, c’est le texte allemand qui prévaut.',
      sectionMark: 'Art.',
      hint: 'Cette page existe aussi en {language}.',
    },

    intro: {
      kicker: 'Bêta ouverte',
      lead: 'Construisez une salle, prenez-en une image, publiez-la sur X. Trois bons d’achat sont tirés au sort parmi toutes les participations.',
      game: {
        title: 'kxb.team, c’est quoi ?',
        body: [
          'Une salle dans le navigateur. Vous ouvrez un lien, tapez un nom, choisissez l’un des 24 animaux et vous y êtes — rien à installer, aucun compte à créer pour vos invités, aucun mot de passe à inventer.',
          'La salle est aussi l’éditeur. Cinquante-huit pièces dans la palette, et vous les posez debout dans le monde, pendant que tous les autres y sont encore. Posez deux buts : c’est un terrain de football. Posez une piste de danse, et c’est là que la soirée aura lieu.',
          'Et on y joue : football, courses, bagarres, service au café. Rien de tout cela ne compte pour un classement où que ce soit. C’est le lieu, pas le tableau des scores.',
        ],
        shotAlt:
          'La fenêtre de kxb.team : la navigation et les salles à gauche, un panda dans une salle en briques au centre, la liste des personnes présentes à droite.',
        cta: 'Essayer par vous-même',
      },
      steps: {
        title: 'Comment participer',
        items: [
          {
            title: 'Construisez une salle',
            body: 'Votre salon ou une nouvelle salle, comme vous préférez. Un café, une arène, un séjour, un escalier très long — nous ne jugeons pas.',
            alt: 'Une salle en blocs de pierre avec six postes de travail munis d’écrans, un établi et un bidon rouge.',
          },
          {
            title: 'Prenez une image',
            body: 'Le déclencheur intégré à la salle donne l’image sans l’interface — le monde seul, aucun nom, aucune ligne de discussion. Une capture d’écran faite par vos soins convient tout autant.',
            alt: 'Deux animaux sur une piste de danse en damier éclairée dans une halle en briques, des projecteurs balayant les murs.',
          },
          {
            title: `Publiez-la avec #${f.hashtag}`,
            body: `Une publication publique sur X, en septembre, portant le hashtag — et abonnez-vous à @${f.handle} pour que nous puissions vous joindre en cas de gain. C’est tout.`,
            alt: 'Quatre animaux en voxels côte à côte sur une prairie verte, des émotes en bulles au-dessus d’eux.',
          },
        ],
      },
      prizes: {
        title: 'À gagner',
        note: 'C’est un tirage au sort, pas un concours. Aucun jury, aucune évaluation, aucun classement — chaque participation valable a la même chance, aussi élaborée soit-elle.',
        place: 'Lot n° {n}',
      },
      cta: { signup: 'S’inscrire à la bêta', github: 'Mettre une étoile sur GitHub' },
      handover:
        'Tout le reste — qui peut participer, comment se déroule le tirage, ce qu’il advient de votre image — se trouve ci-dessous :',
    },

    sections: {
      organiser: {
        heading: 'Organisateur',
        body: (
          <>
            <p>
              L’organisateur de ce jeu-concours, et votre interlocuteur pour tout ce qui s’y rapporte,
              est :
            </p>
            <ControllerBlock />
            <p>
              Le présent règlement s’applique exclusivement à ce jeu-concours. L’utilisation du
              service lui-même est en outre régie par nos{' '}
              <a href="/agb/en" className="text-accent hover:underline">
                conditions d’utilisation
              </a>{' '}
              (disponibles en allemand et en anglais).
            </p>
          </>
        ),
      },

      what: {
        heading: 'De quoi il s’agit',
        body: (
          <>
            <p>
              kxb.team entre en bêta ouverte. À cette occasion, nous tirons au sort des bons d’achat
              parmi toutes les personnes qui construisent leur propre salle pendant cette période et
              en publient une image sur X.
            </p>
            <p>
              Il s’agit d’un tirage au sort et non d’un concours : il n’y a ni jury, ni évaluation, ni
              classement par qualité. Chaque participation valable a la même chance de gagner, quels
              que soient le soin qui y a été mis ou le nombre de personnes qui l’ont vue.
            </p>
          </>
        ),
      },

      window: {
        heading: 'Période de participation',
        body: (
          <p>
            Les participations sont prises en compte du {f.start} au {f.end}{' '}
            {f.timezone}. La date et l’heure de publication indiquées par X font foi. Les
            publications parues avant le début ou après la fin de cette période ne participent pas.
          </p>
        ),
      },

      eligibility: {
        heading: 'Qui peut participer',
        body: (
          <>
            <p>Peuvent participer les personnes physiques qui</p>
            <Bullets
              items={[
                `sont âgées de ${f.minAge} ans révolus,`,
                'résident dans l’Union européenne, dans l’Espace économique européen, en Suisse ou au Royaume-Uni — à l’exception de l’Italie,',
                'disposent d’un compte personnel et publiquement visible sur X, et',
                'disposent d’un compte personnel sur kxb.team.',
              ]}
            />
            <p>
              L’Italie est exclue parce que les jeux-concours destinés à ses résidents doivent, selon
              les règles italiennes sur les <em>manifestazioni a premio</em>, être déclarés au
              préalable auprès de l’autorité compétente et garantis par un dépôt. Nous ne pouvons pas
              assumer ces formalités pour un tirage de cette taille. L’exclusion vise la formalité,
              pas les personnes.
            </p>
            <p>
              Sont en outre exclus l’organisateur lui-même ainsi que ses parents en ligne directe et
              les personnes vivant sous son toit.
            </p>
            <p>
              Une seule participation par personne. Qui publie plusieurs contributions participe avec
              la première publiée ; les autres ne sont pas prises en compte. Plusieurs comptes
              appartenant à une même personne comptent pour une seule personne.
            </p>
          </>
        ),
      },

      entry: {
        heading: 'Comment participer',
        body: (
          <>
            <p>Une participation valable, c’est cinq choses :</p>
            <Bullets
              items={[
                'Vous construisez une salle dans un espace sur kxb.team – votre salon ou une autre salle, comme vous préférez.',
                'Vous en faites une image. Le déclencheur intégré à la salle donne l’image sans l’interface ; une capture d’écran faite par vos soins convient tout autant.',
                <>
                  Vous publiez cette image pendant la période de participation, dans une publication
                  publique sur X portant le hashtag <strong>#{f.hashtag}</strong>.
                </>,
                'Votre compte sur X est publiquement visible à ce moment-là, afin que nous puissions voir la publication.',
                <>
                  Vous suivez le compte <strong>@{f.handle}</strong> sur X.
                </>,
              ]}
            />
            <p>
              L’abonnement est vérifié une seule fois, au moment du tirage. Qui s’est désabonné d’ici
              là ne participe pas ; qui s’abonne après avoir publié participe.
            </p>
            <p>
              La salle représentée doit avoir été construite par vous. Une image tirée de l’espace de
              quelqu’un d’autre, une image trouvée en ligne, ou une publication sans salle
              reconnaissable ne constitue pas une participation valable.
            </p>
            <p>Ce que l’image et la publication ne doivent pas montrer :</p>
            <Bullets
              items={[
                'des représentations haineuses, dégradantes ou discriminatoires – en particulier celles visant des personnes en raison de leur origine, de leur couleur de peau, de leur religion, de leurs convictions, d’un handicap, de leur sexe ou de leur orientation sexuelle ;',
                'des signes et symboles anticonstitutionnels ;',
                'l’apologie de la violence ainsi que des représentations pornographiques ou sexualisées ;',
                'des injures, menaces ou actes de harcèlement visant une personne déterminée ;',
                'des contenus contraires à l’article 5 de nos conditions d’utilisation ou au droit applicable.',
              ]}
            />
            <p>
              Une participation montrant l’une de ces choses ne prend pas part au tirage, et nous ne
              la montrons pas non plus. Nous ne jugeons pas la manière dont vous avez aménagé votre
              salle &ndash; cette limite-là, si.
            </p>
            <p>
              Veillez à ce que l’image ne laisse apparaître aucune donnée d’autres personnes &ndash;
              par exemple les noms des personnes présentes ou des messages de la discussion. Le
              déclencheur intégré à la salle photographie uniquement le monde et laisse l’interface de
              côté ; qui réalise une capture de toute sa fenêtre de navigateur doit le vérifier
              lui-même.
            </p>
          </>
        ),
      },

      free: {
        heading: 'La participation est gratuite',
        body: (
          <>
            <p>
              La participation n’entraîne aucun frais. L’achat d’une prestation payante n’est ni une
              condition de participation ni un moyen d’augmenter les chances de gain.
            </p>
            <p>
              Tout membre peut construire, y compris dans la formule gratuite. Si vous souhaitez, pour
              la durée du jeu-concours, davantage de salles, davantage de places et des images aux
              murs, vous pouvez utiliser le code <strong>{f.code}</strong> à l’adresse{' '}
              <a href={f.codePath} className="text-accent hover:underline">
                kxb.team{f.codePath}
              </a>{' '}
              et profiter gratuitement de la formule xo pendant un mois. Cela aussi est facultatif et
              reste sans effet sur le tirage.
            </p>
            {/* Only when the code actually carries them. What it hands over is set
                in the backoffice, and a clause promising bucks the code does not
                give would be a promise in a binding document. */}
            {f.bucks > 0 ? (
              <p>
                Il apporte aussi {f.bucks} bucks à dépenser en skins — ils sont disponibles immédiatement.
              </p>
            ) : null}
            <p>
              Les frais de votre accès à internet et de votre utilisation de X restent à votre charge ;
              la participation n’y ajoute rien.
            </p>
          </>
        ),
      },

      prizes: {
        heading: 'Ce qu’il y a à gagner',
        body: (
          <>
            <p>Les bons d’achat suivants sont tirés au sort :</p>
            <Bullets
              items={f.prizes.map((amount, i) => (
                <>{ORDINALS[i] ?? `${i + 1}e`} lot : un bon d’achat d’une valeur de {amount}&nbsp;&euro;</>
              ))}
            />
            <p>
              Le bon est envoyé sous forme de code par courriel. Les gagnants peuvent désigner le
              commerçant pour lequel le bon doit être émis, dans la mesure où un tel bon de cette
              valeur est disponible sur le marché. À défaut, nous émettons un bon d’un fournisseur
              équivalent.
            </p>
            <p>
              Le lot ne peut être versé en espèces, échangé, ni transféré à une autre personne. Les
              éventuels impôts sur le lot sont pris en charge par l’organisateur.
            </p>
          </>
        ),
      },

      draw: {
        heading: 'Comment les gagnants sont désignés',
        body: (
          <>
            <p>
              À la clôture de la période de participation, nous recensons toutes les participations
              valables dans l’ordre de leur publication et les numérotons. Le {f.draw}, nous
              en tirons trois numéros à l’aide d’un générateur aléatoire : le premier pour le 1er lot,
              le deuxième pour le 2e, le troisième pour le 3e. Un numéro ne peut être tiré qu’une
              fois.
            </p>
            <p>
              Nous documentons le tirage et publions cette documentation avec le résultat. Le hasard
              décide seul ; aucun droit à un lot déterminé n’existe.
            </p>
          </>
        ),
      },

      notice: {
        heading: 'Notification et remise',
        body: (
          <>
            <p>
              Nous informons les gagnants dans les trois jours suivant le tirage par message privé sur
              X, adressé au compte dont provient la participation. Les personnes ne pouvant pas
              recevoir nos messages privés seront interpellées publiquement sous leur propre
              publication.
            </p>
            <p>
              Une adresse électronique nous est nécessaire pour envoyer le bon. Si une personne
              informée ne se manifeste pas dans les 14&nbsp;jours suivant la notification, son droit
              au lot s’éteint et nous procédons, pour ce lot, à un nouveau tirage parmi les
              participations valables restantes.
            </p>
            <p>
              Nous envoyons le bon dans les 14&nbsp;jours suivant la réception de l’adresse
              électronique.
            </p>
          </>
        ),
      },

      yourEntry: {
        heading: 'Vos contributions',
        body: (
          <>
            <p>
              L’image et la salle que vous avez construite restent les vôtres. Nous n’en acquérons
              aucune propriété.
            </p>
            <p>
              En participant, vous nous accordez le droit simple, gratuit et révocable à tout moment
              de montrer votre contribution en lien avec ce jeu-concours &ndash; c’est-à-dire de la
              reproduire sur nos propres canaux et sur kxb.team, en mentionnant le nom de votre compte
              sur X. Le droit ne va pas plus loin : aucune modification au-delà de ce qu’un partage
              implique techniquement, aucune transmission à des tiers et aucune utilisation dans une
              publicité payante. Sur simple message à {CONTROLLER.email}, nous retirons la
              contribution de nos canaux.
            </p>
            <p>
              Vous garantissez que la contribution émane de vous et ne porte atteinte à aucun droit de
              tiers &ndash; en particulier que vous détenez les droits nécessaires sur les images que
              vous avez accrochées aux murs de la salle.
            </p>
          </>
        ),
      },

      exclusion: {
        heading: 'Exclusion de la participation',
        body: (
          <>
            <p>
              Nous pouvons exclure des contributions et des personnes de la participation en présence
              d’un motif sérieux. Un tel motif existe notamment en cas
            </p>
            <Bullets
              items={[
                'd’utilisation de plusieurs comptes, de moyens automatisés ou de comptes créés spécialement pour participer,',
                'de contributions montrant des contenus illicites ou exclus par l’article 5 du présent règlement,',
                'de contributions n’émanant pas du participant lui-même,',
                'd’indications mensongères sur sa propre personne.',
              ]}
            />
            <p>
              Lorsqu’un lot a déjà été envoyé, nous pouvons en exiger la restitution dans ces cas. Une
              exclusion est communiquée à la personne concernée par la même voie que celle de sa
              participation.
            </p>
          </>
        ),
      },

      ending: {
        heading: 'Fin anticipée ou modification',
        body: (
          <>
            <p>
              Nous pouvons interrompre ou modifier le jeu-concours s’il ne peut être mené
              régulièrement pour des raisons qui ne nous sont pas imputables &ndash; par exemple une
              panne technique grave, une manipulation extérieure, ou lorsque sa tenue n’est plus
              juridiquement admissible.
            </p>
            <p>
              Si la période de participation est déjà close à ce moment-là, nous procédons néanmoins
              au tirage. Toute interruption ou modification est annoncée sur cette page et sur le
              compte @{f.handle} sur X.
            </p>
          </>
        ),
      },

      privacy: {
        heading: 'Protection des données',
        body: (
          <>
            <p>
              Pour la tenue du jeu-concours, nous traitons le nom de votre compte sur X, le lien vers
              votre publication et l’image qui y est publiée ; en cas de gain, en outre l’adresse
              électronique à laquelle le bon doit être envoyé. Nous utilisons ces données uniquement
              pour le jeu-concours et ne les transmettons pas à des fins publicitaires.
            </p>
            <p>
              Le détail &ndash; bases légales, durées de conservation et vos droits &ndash; figure au
              point 13 de notre{' '}
              <a href="/datenschutz/en" className="text-accent hover:underline">
                politique de confidentialité
              </a>{' '}
              (disponible en allemand et en anglais). Ce que X fait de votre publication et de vos
              données relève des conditions de X et échappe à notre responsabilité.
            </p>
          </>
        ),
      },

      noAffiliation: {
        heading: 'Aucun lien avec X ni avec un commerçant',
        body: (
          <>
            <p>
              Ce jeu-concours n’a aucun lien avec X. Il n’est ni parrainé, ni soutenu, ni administré
              par X, et X n’en est en aucune manière coresponsable. Toutes les informations et toutes
              les réclamations s’adressent exclusivement à l’organisateur désigné à l’article 1, et
              non à X.
            </p>
            <p>
              Le jeu-concours n’a pas davantage de lien avec le commerçant dont le bon est émis. Ce
              commerçant n’est ni organisateur ni parrain et n’a rien à voir avec la tenue du
              jeu-concours ; nous achetons le bon comme n’importe quel autre client.
            </p>
          </>
        ),
      },

      liability: {
        heading: 'Responsabilité',
        body: (
          <>
            <h3 className="mb-2 text-xl font-medium text-ink">Pour le jeu-concours</h3>
            <p>
              Nous répondons sans limitation des dommages résultant d’une atteinte à la vie, à
              l’intégrité physique ou à la santé, ainsi qu’au titre de la loi allemande sur la
              responsabilité du fait des produits, de même qu’en cas de dol et de négligence grave. En
              cas de négligence simple, nous ne répondons que de la violation d’une obligation
              contractuelle essentielle, et alors dans la limite du dommage prévisible et typique de
              ce type de contrat. La responsabilité est exclue pour le surplus.
            </p>
            <h3 className="mb-2 mt-6 text-xl font-medium text-ink">Pour le bon d’achat</h3>
            <p>
              Le lot est fourni dès l’envoi du code du bon. L’utilisation du bon est régie par les
              conditions du commerçant émetteur ; nous ne pouvons pas garantir que celui-ci
              l’acceptera.
            </p>
          </>
        ),
      },

      final: {
        heading: 'Dispositions finales',
        body: (
          <>
            <p>
              Le droit de la République fédérale d’Allemagne est applicable. Si vous êtes consommateur
              et avez votre résidence habituelle dans un autre État, les dispositions impératives de
              protection des consommateurs de cet État demeurent réservées.
            </p>
            <p>
              Le présent règlement est également disponible dans d’autres langues. La version
              allemande fait foi ; en cas de divergence, elle prévaut sur les traductions.
            </p>
            <p>
              Si une disposition du présent règlement devait être nulle, la validité des autres n’en
              serait pas affectée.
            </p>
            <p>Tout recours judiciaire est exclu.</p>
          </>
        ),
      },
    },
  }
}
