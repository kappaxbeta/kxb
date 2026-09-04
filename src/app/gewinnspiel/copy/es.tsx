import type { ContestFacts } from '@/app/gewinnspiel/facts'
import type { ContestCopy } from '@/app/gewinnspiel/copy'
import { Bullets, CONTROLLER, ControllerBlock } from '@/app/legal/shell'

/**
 * Las bases en castellano - a translation of `de.tsx`, which binds.
 *
 * `Art.` rather than `§`, for the same reason as the French version: the
 * paragraph sign is not how a Spanish reader expects a clause to be numbered.
 * The numbers themselves come from `CONTEST_SECTIONS` and are the same in every
 * language, so a cross-reference lands on the same clause either way.
 *
 * The links to the terms of use and the privacy notice point at their English
 * versions and say so - those two documents exist in German and English only.
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
const ORDINALS = ['1.er', '2.º', '3.er', '4.º', '5.º', '6.º', '7.º', '8.º', '9.º', '10.º']

export function esCopy(f: ContestFacts): ContestCopy {
  return {
    locale: 'es',

    meta: {
      title: 'Bases del sorteo',
      description:
        'Construye una sala, publica una imagen de ella en X, gana un vale. Qué es kxb.team, cómo participar y las bases completas del sorteo.',
      ogTitle: 'Sorteo de lanzamiento – las bases',
      ogDescription:
        'Construye una sala, publica una imagen de ella en X, gana un vale. Del 1 al 30 de septiembre.',
      posterAlt:
        'Un dinosaurio de vóxeles saltando por un portal verde en el espacio, con un zorro, un panda y bloques flotantes alrededor, junto a las palabras «Win a voucher | here to play.» y los premios 1×50 € y 2×25 €.',
    },

    chrome: {
      back: '← Volver al inicio',
      title: 'Sorteo de lanzamiento',
      chooserLabel: 'Idioma',
      deadline: `Cierre de participación: ${f.end} ${f.timezone}`,
      binding:
        'Esta es una traducción de cortesía. La versión alemana, en /gewinnspiel, es la vinculante; en caso de discrepancia prevalece el texto alemán.',
      sectionMark: 'Art.',
      hint: 'Esta página también está disponible en {language}.',
    },

    intro: {
      kicker: 'Beta abierta',
      lead: 'Construye una sala, hazle una imagen y publícala en X. Se sortean tres vales entre todas las participaciones.',
      game: {
        title: '¿Qué es kxb.team?',
        body: [
          'Una sala en el navegador. Abres un enlace, escribes un nombre, eliges uno de los 24 animales y ya estás dentro: nada que instalar, ninguna cuenta para tus invitados, ninguna contraseña que inventarse.',
          'La sala es también el editor. Cincuenta y ocho piezas en la paleta, y las colocas de pie dentro del mundo, con todos los demás todavía dentro. Pon dos porterías y es un campo de fútbol. Pon una pista de baile, y ahí es donde transcurre la noche.',
          'Y allí se juega: fútbol, carreras, peleas, turnos en la cafetería. Nada de eso cuenta para una clasificación en ningún sitio. Es el lugar, no la tabla de puntos.',
        ],
        shotAlt:
          'La ventana de kxb.team: la navegación con las salas a la izquierda, un panda en una sala de ladrillo en el centro, la lista de quién está presente a la derecha.',
        cta: 'Probarlo tú mismo',
      },
      steps: {
        title: 'Cómo participar',
        items: [
          {
            title: 'Construye una sala',
            body: 'Tu salón o una sala nueva, como prefieras. Una cafetería, una arena, un cuarto de estar, una escalera larguísima: no lo juzgamos.',
            alt: 'Una sala de bloques de piedra con seis puestos de trabajo con monitores, un banco de trabajo y un bidón rojo.',
          },
          {
            title: 'Hazle una imagen',
            body: 'El disparador que hay dentro de la sala entrega la imagen sin la interfaz: solo el mundo, sin nombres, sin la línea del chat. Una captura de pantalla hecha por ti vale igual.',
            alt: 'Dos animales sobre una pista de baile de damero iluminada en una nave de ladrillo, con focos barriendo las paredes.',
          },
          {
            title: `Publícala con #${f.hashtag}`,
            body: `Una publicación pública en X, en septiembre, con el hashtag, y sigue a @${f.handle} para que podamos escribirte si ganas. Eso es todo.`,
            alt: 'Cuatro animales de vóxeles uno al lado del otro sobre un prado verde, con emotes en bocadillos encima.',
          },
        ],
      },
      prizes: {
        title: 'Qué se puede ganar',
        note: 'Es un sorteo, no un concurso. Sin jurado, sin valoración, sin clasificación: cada participación válida tiene la misma probabilidad, por elaborada que sea.',
        place: 'Premio {n}',
      },
      cta: { signup: 'Apuntarse a la beta', github: 'Dar una estrella en GitHub' },
      handover:
        'Todo lo demás —quién puede participar, cómo se sortea, qué ocurre con tu imagen— está aquí:',
    },

    sections: {
      organiser: {
        heading: 'Organizador',
        body: (
          <>
            <p>
              El organizador de este sorteo, y tu punto de contacto para todo lo relacionado con él,
              es:
            </p>
            <ControllerBlock />
            <p>
              Estas bases se aplican exclusivamente a este sorteo. El uso del servicio en sí se rige
              además por nuestras{' '}
              <a href="/agb/en" className="text-accent hover:underline">
                condiciones de uso
              </a>{' '}
              (disponibles en alemán e inglés).
            </p>
          </>
        ),
      },

      what: {
        heading: 'De qué se trata',
        body: (
          <>
            <p>
              kxb.team entra en beta abierta. Con este motivo sorteamos vales entre todas las personas
              que durante ese periodo construyan una sala propia y publiquen una imagen de ella en X.
            </p>
            <p>
              Es un sorteo y no un concurso: no hay jurado, ni valoración, ni clasificación por
              calidad. Toda participación válida tiene la misma probabilidad de ganar, con
              independencia de lo elaborada que sea o de cuánta gente la haya visto.
            </p>
          </>
        ),
      },

      window: {
        heading: 'Periodo de participación',
        body: (
          <p>
            Se tienen en cuenta las participaciones desde el {f.start} hasta el{' '}
            {f.end} {f.timezone}. Es determinante la hora de publicación que indique X. Las
            publicaciones anteriores al inicio o posteriores al fin de ese plazo no participan.
          </p>
        ),
      },

      eligibility: {
        heading: 'Quién puede participar',
        body: (
          <>
            <p>Pueden participar las personas físicas que</p>
            <Bullets
              items={[
                `hayan cumplido ${f.minAge} años,`,
                'residan en la Unión Europea, en el Espacio Económico Europeo, en Suiza o en el Reino Unido — con excepción de Italia,',
                'dispongan de una cuenta propia y públicamente visible en X, y',
                'dispongan de una cuenta propia en kxb.team.',
              ]}
            />
            <p>
              Italia queda excluida porque, conforme a las normas italianas sobre{' '}
              <em>manifestazioni a premio</em>, los sorteos dirigidos a sus residentes deben
              comunicarse previamente a la autoridad competente y garantizarse mediante depósito. No
              podemos asumir ese trámite para un sorteo de este tamaño. La excepción va dirigida
              contra la formalidad, no contra las personas.
            </p>
            <p>
              Quedan excluidos además el propio organizador, sus parientes en línea directa y las
              personas que convivan con él.
            </p>
            <p>
              Se admite una participación por persona. Quien publique varias participa con la primera
              publicada; las demás no se tienen en cuenta. Varias cuentas de una misma persona cuentan
              como una sola persona.
            </p>
          </>
        ),
      },

      entry: {
        heading: 'Cómo participar',
        body: (
          <>
            <p>Una participación válida se compone de cinco cosas:</p>
            <Bullets
              items={[
                'Construyes una sala en un espacio de kxb.team: tu salón u otra sala, como prefieras.',
                'Haces una imagen de ella. El disparador que hay dentro de la sala entrega la imagen sin la interfaz; una captura de pantalla hecha por ti vale igual.',
                <>
                  Publicas esa imagen dentro del periodo de participación en una publicación pública
                  en X con el hashtag <strong>#{f.hashtag}</strong>.
                </>,
                'Tu cuenta en X es públicamente visible en ese momento, para que podamos ver la publicación.',
                <>
                  Sigues a la cuenta <strong>@{f.handle}</strong> en X.
                </>,
              ]}
            />
            <p>
              Comprobamos el seguimiento una sola vez, en el momento del sorteo. Quien haya dejado de
              seguirnos para entonces no participa; quien empiece a seguirnos después de publicar, sí.
            </p>
            <p>
              La sala que aparece en la imagen tiene que estar construida por ti. Una imagen del
              espacio de otra persona, una imagen sacada de internet o una publicación sin una sala
              reconocible no es una participación válida.
            </p>
            <p>Lo que no puede aparecer en la imagen ni en la publicación:</p>
            <Bullets
              items={[
                'representaciones de odio, denigrantes o discriminatorias, en particular las dirigidas contra personas por su origen, su color de piel, su religión, sus convicciones, una discapacidad, su sexo o su orientación sexual;',
                'signos y símbolos anticonstitucionales;',
                'la apología de la violencia, así como representaciones pornográficas o sexualizadas;',
                'injurias, amenazas o acoso dirigidos contra una persona determinada;',
                'contenidos que infrinjan el artículo 5 de nuestras condiciones de uso o el derecho aplicable.',
              ]}
            />
            <p>
              Una participación que muestre algo así no entra en el sorteo, y tampoco la mostramos
              nosotros. No juzgamos cómo hayas decorado tu sala &ndash; este límite sí lo juzgamos.
            </p>
            <p>
              Procura que en la imagen no se vean datos de otras personas &ndash; por ejemplo nombres
              de quienes estén presentes o mensajes del chat. El disparador de la sala fotografía
              únicamente el mundo y deja fuera la interfaz; quien haga una captura de toda su ventana
              del navegador debe comprobarlo por sí mismo.
            </p>
          </>
        ),
      },

      free: {
        heading: 'La participación es gratuita',
        body: (
          <>
            <p>
              Participar no cuesta nada. La contratación de un servicio de pago no es requisito para
              participar ni mejora la probabilidad de ganar.
            </p>
            <p>
              Construir puede hacerlo cualquier miembro, también en el plan gratuito. Quien durante el
              sorteo quiera más salas, más plazas e imágenes en las paredes puede canjear el código{' '}
              <strong>{f.code}</strong> en{' '}
              <a href={f.codePath} className="text-accent hover:underline">
                kxb.team{f.codePath}
              </a>{' '}
              y usar el plan xo gratis durante un mes. También esto es voluntario y no influye en el
              sorteo.
            </p>
            {/* Only when the code actually carries them. What it hands over is set
                in the backoffice, and a clause promising bucks the code does not
                give would be a promise in a binding document. */}
            {f.bucks > 0 ? (
              <p>
                Incluye además {f.bucks} bucks para gastar en skins — están disponibles al instante.
              </p>
            ) : null}
            <p>
              Los costes de tu acceso a internet y de tu uso de X corren de tu cuenta; participar no
              añade ninguno.
            </p>
          </>
        ),
      },

      prizes: {
        heading: 'Qué se puede ganar',
        body: (
          <>
            <p>Se sortean los siguientes vales:</p>
            <Bullets
              items={f.prizes.map((amount, i) => (
                <>{ORDINALS[i] ?? `${i + 1}.º`} premio: un vale por valor de {amount}&nbsp;&euro;</>
              ))}
            />
            <p>
              El vale se envía por correo electrónico en forma de código. Las personas ganadoras pueden
              indicar el comercio a cuyo nombre debe emitirse el vale, siempre que exista en el mercado
              un vale de ese comercio por ese importe. En caso contrario emitimos un vale de un
              proveedor equivalente.
            </p>
            <p>
              Queda excluido el pago en efectivo, el cambio o la transmisión del premio a otra persona.
              Los eventuales impuestos sobre el premio corren a cargo del organizador.
            </p>
          </>
        ),
      },

      draw: {
        heading: 'Cómo se determinan las personas ganadoras',
        body: (
          <>
            <p>
              Una vez cerrado el periodo de participación registramos todas las participaciones
              válidas por orden de publicación y las numeramos. El {f.draw} extraemos de ahí
              tres números con un generador aleatorio: el primero para el 1.er premio, el segundo para
              el 2.º y el tercero para el 3.er. Un número solo puede salir una vez.
            </p>
            <p>
              Documentamos el sorteo y publicamos esa documentación junto con el resultado. Decide
              únicamente el azar; no existe derecho a un premio determinado.
            </p>
          </>
        ),
      },

      notice: {
        heading: 'Notificación y entrega',
        body: (
          <>
            <p>
              Notificamos a las personas ganadoras dentro de los tres días siguientes al sorteo
              mediante un mensaje directo en X a la cuenta desde la que se publicó la participación. A
              quien no pueda recibir mensajes directos nuestros nos dirigiremos públicamente bajo su
              propia publicación.
            </p>
            <p>
              Para enviar el vale necesitamos una dirección de correo electrónico. Si una persona
              notificada no responde dentro de los 14&nbsp;días siguientes a la notificación, decae su
              derecho al premio y volvemos a sortear ese premio entre las participaciones válidas
              restantes.
            </p>
            <p>
              Enviamos el vale dentro de los 14&nbsp;días siguientes a la recepción de la dirección de
              correo electrónico.
            </p>
          </>
        ),
      },

      yourEntry: {
        heading: 'Tus participaciones',
        body: (
          <>
            <p>
              La imagen y la sala que has construido siguen siendo tuyas. No adquirimos ninguna
              propiedad sobre ellas.
            </p>
            <p>
              Al participar nos concedes el derecho simple, gratuito y revocable en todo momento a
              mostrar tu participación en relación con este sorteo &ndash; es decir, a reproducirla en
              nuestros propios canales y en kxb.team, indicando el nombre de tu cuenta en X. El derecho
              no va más allá: ninguna modificación más allá de lo que técnicamente implica compartir,
              ninguna cesión a terceros y ningún uso en publicidad de pago. Basta un mensaje a{' '}
              {CONTROLLER.email} y retiramos la participación de nuestros canales.
            </p>
            <p>
              Garantizas que la participación procede de ti y que no vulnera derechos de terceros
              &ndash; en particular, que dispones de los derechos necesarios sobre las imágenes que
              hayas colgado en las paredes de la sala.
            </p>
          </>
        ),
      },

      exclusion: {
        heading: 'Exclusión de la participación',
        body: (
          <>
            <p>
              Podemos excluir participaciones y personas del sorteo cuando concurra una causa
              justificada. Concurre en particular en caso de
            </p>
            <Bullets
              items={[
                'uso de varias cuentas, de medios automatizados o de cuentas creadas expresamente para participar,',
                'participaciones que muestren contenidos ilícitos o excluidos por el artículo 5 de estas bases,',
                'participaciones que no procedan de la propia persona participante,',
                'datos falsos sobre la propia persona.',
              ]}
            />
            <p>
              Si el premio ya se hubiera enviado, en estos casos podemos reclamar su devolución. La
              exclusión se comunica a la persona afectada por la misma vía por la que participó.
            </p>
          </>
        ),
      },

      ending: {
        heading: 'Terminación anticipada o modificación',
        body: (
          <>
            <p>
              Podemos interrumpir o modificar el sorteo cuando, por motivos que no nos sean
              imputables, no pueda celebrarse debidamente &ndash; por ejemplo ante una avería técnica
              grave, ante manipulaciones externas o cuando su celebración deje de ser jurídicamente
              admisible.
            </p>
            <p>
              Si en ese momento el periodo de participación ya hubiera terminado, celebramos el sorteo
              de todos modos. Informamos de cualquier interrupción o modificación en esta página y en
              la cuenta @{f.handle} de X.
            </p>
          </>
        ),
      },

      privacy: {
        heading: 'Protección de datos',
        body: (
          <>
            <p>
              Para celebrar el sorteo tratamos el nombre de tu cuenta en X, el enlace a tu publicación
              y la imagen publicada en ella; en caso de premio, además la dirección de correo
              electrónico a la que debe enviarse el vale. Usamos estos datos únicamente para el sorteo
              y no los cedemos con fines publicitarios.
            </p>
            <p>
              El detalle &ndash; bases jurídicas, plazos de conservación y tus derechos &ndash; está en
              el punto 13 de nuestra{' '}
              <a href="/datenschutz/en" className="text-accent hover:underline">
                política de privacidad
              </a>{' '}
              (disponible en alemán e inglés). Lo que X haga con tu publicación y tus datos se rige por
              las condiciones de X y queda fuera de nuestra responsabilidad.
            </p>
          </>
        ),
      },

      noAffiliation: {
        heading: 'Sin vinculación con X ni con ningún comercio',
        body: (
          <>
            <p>
              Este sorteo no guarda vinculación alguna con X. X no lo patrocina, ni lo respalda, ni lo
              administra, ni es corresponsable de él en modo alguno. Toda la información y todas las
              reclamaciones se dirigen exclusivamente al organizador indicado en el artículo 1, y no a
              X.
            </p>
            <p>
              Tampoco guarda el sorteo vinculación con el comercio cuyo vale se emita. Ese comercio no
              es organizador ni patrocinador y nada tiene que ver con su celebración; compramos el vale
              como cualquier otro cliente.
            </p>
          </>
        ),
      },

      liability: {
        heading: 'Responsabilidad',
        body: (
          <>
            <h3 className="mb-2 text-xl font-medium text-ink">Por el sorteo</h3>
            <p>
              Respondemos sin limitación por los daños derivados de lesiones a la vida, la integridad
              física o la salud, así como conforme a la ley alemana de responsabilidad por productos
              defectuosos, e igualmente por dolo y culpa grave. En caso de culpa leve respondemos
              únicamente por el incumplimiento de una obligación contractual esencial, y ello limitado
              al daño previsible y típico de este tipo de contrato. En lo demás queda excluida la
              responsabilidad.
            </p>
            <h3 className="mb-2 mt-6 text-xl font-medium text-ink">Por el vale</h3>
            <p>
              Con el envío del código del vale el premio queda entregado. El canje del vale se rige por
              las condiciones del comercio emisor; no podemos responder de que este lo acepte.
            </p>
          </>
        ),
      },

      final: {
        heading: 'Disposiciones finales',
        body: (
          <>
            <p>
              Se aplica el derecho de la República Federal de Alemania. Si eres consumidor y tienes tu
              residencia habitual en otro Estado, quedan a salvo las disposiciones imperativas de
              protección de los consumidores de ese Estado.
            </p>
            <p>
              Estas bases están disponibles también en otros idiomas. La versión alemana es la
              vinculante; en caso de discrepancia prevalece sobre las traducciones.
            </p>
            <p>
              Si alguna disposición de estas bases fuera nula, la validez de las restantes no se verá
              afectada.
            </p>
            <p>Queda excluida la vía judicial.</p>
          </>
        ),
      },
    },
  }
}
