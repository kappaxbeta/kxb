/**
 * The auth emails, built from one design.
 *
 * GoTrue has no include mechanism: every template is a whole document, fetched
 * by URL at send time, and the filename is the contract (magic_link.html is the
 * magic link because GOTRUE_MAILER_TEMPLATES_MAGIC_LINK names it). So the four
 * mails this app sends would otherwise be four copies of the same chrome, and
 * four copies of chrome drift - one gets the new wordmark, one keeps the old
 * padding, and nobody notices because nobody receives all four.
 *
 * This is the one place the chrome exists. Each mail below is a title, a couple
 * of sentences, a button and a peep; `shell()` is everything around them.
 *
 * The output is committed, because `deploy-mail-templates.sh` rsyncs the .html
 * files and GoTrue fetches them over HTTP - neither of them can run TypeScript.
 * That deploy script runs this first, so a template edited here and shipped
 * without re-running cannot happen.
 *
 *   bun run mail:build
 *
 * ---------------------------------------------------------------------------
 * Why the markup looks like 2004
 * ---------------------------------------------------------------------------
 * Tables, inline styles, `bgcolor` attributes and PNGs. Email clients are not
 * browsers: Outlook on Windows renders through Word, Gmail strips <style> in
 * some contexts, and none of them agree about flexbox. The rules followed here:
 *
 *   * Layout is tables with role="presentation", so screen readers skip them.
 *   * Every colour is inline AND on a bgcolor attribute, because Word ignores
 *     background shorthand.
 *   * Images are PNG, never the .webp the site uses - Outlook cannot decode
 *     webp and would show a broken-image box where the peep should be.
 *   * Nothing important is in an image. Images are off by default in a lot of
 *     inboxes, so the peeps are decoration with empty alt text and the button
 *     is real markup.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'supabase', 'templates')

/**
 * The palette, in hex, from the app's own dark theme.
 *
 * `globals.css` writes these in oklch, which about half of email clients have
 * never heard of - so they are converted once, here, rather than approximated
 * per template. If the app's dark theme moves, these move with it.
 */
const C = {
  /** Deep space, the colour `globals.css` calls the sky. */
  page: '#05030c',
  /** The panel that floats on it. Lighter than the page, never transparent -
   *  see the note on the card in `shell()`. */
  card: '#130d1e',
  tile: '#241733',
  line: '#33244a',
  ink: '#f6f3fe',
  muted: '#b3a6c9',
  faint: '#7d6f95',
  /** The two neons the lockup is drawn in. */
  cyan: '#00ebec',
  magenta: '#e74dff',
  buttonInk: '#16081c',
} as const

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * The peep strip.
 *
 * Five blocks, because the peeps *are* blocks - the same boxy animals the
 * lounge is full of - and a row of them is the fastest way for an inbox to say
 * which product this mail is from. The named one sits in the middle at full
 * size; the other four are quieter tiles either side, so the row reads as a
 * shelf with one thing picked up off it.
 *
 * `{{ .SiteURL }}` rather than a hardcoded host: it is the origin GoTrue was
 * configured with, which is kxb.team in production and 127.0.0.1:3000 in local
 * dev - so these render while a template is being checked in Mailpit.
 */
function peepStrip(hero: string): string {
  const flank = ['bunny', 'fox', 'parrot', 'koala', 'cat', 'deer', 'panda', 'penguin'].filter(
    (name) => name !== hero,
  )
  const [a, b, c, d] = flank

  /**
   * One block. `tile` is the rounded square, `size` the peep inside it.
   *
   * The height is set on the cell as an attribute *and* inline, and the peep is
   * padded rather than vertically aligned, because `valign` on a cell with a
   * background is the one thing Word and Gmail reliably disagree about.
   */
  const tile = (
    name: string,
    tileSize: number,
    size: number,
    opts: { border: string; small?: boolean } = { border: C.line },
  ) => {
    const pad = Math.round((tileSize - size) / 2)
    // The two outermost blocks fold away on a narrow screen - five tiles at
    // full size overflow a phone, and the row is decoration, so it loses its
    // edges rather than shrinking everything.
    const klass = opts.small ? ' class="peep-sm"' : ''
    return `
              <td${klass} align="center" valign="middle" width="${tileSize + 12}" style="padding:0 6px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${tileSize}">
                  <tr>
                    <td align="center" valign="middle" bgcolor="${C.tile}" height="${tileSize}" style="background-color:${C.tile};border:1px solid ${opts.border};border-radius:18px;height:${tileSize}px;padding:${pad}px 0;">
                      <img src="{{ .SiteURL }}/email/peep-${name}.png" width="${size}" height="${size}" alt="" style="display:block;margin:0 auto;border:0;outline:none;width:${size}px;height:${size}px;" />
                    </td>
                  </tr>
                </table>
              </td>`
  }

  // The named peep sits in the middle, bigger and ringed in the lockup's cyan,
  // so the row reads as a shelf with one animal picked up off it.
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>${tile(a, 54, 38, { border: C.line, small: true })}${tile(b, 64, 46, { border: C.line })}${tile(hero, 86, 66, { border: C.cyan })}${tile(c, 64, 46, { border: C.line })}${tile(d, 54, 38, { border: C.line, small: true })}
            </tr>
          </table>`
}

type Mail = {
  /** The file GoTrue will fetch. The name is the contract - see the header. */
  file: string
  /** Which animal is holding this one. One per mail, so they are tellable apart. */
  peep: string
  /** The line inbox lists show after the subject. Never repeat the title here. */
  preheader: string
  title: string
  /** Sentences above the button. Each becomes its own paragraph. */
  body: string[]
  cta: { label: string; href: string }
  /** The small print under the button. The last line is usually the disclaimer. */
  fine: string[]
}

function shell(mail: Mail): string {
  const paragraphs = mail.body
    .map(
      (line) => `
              <p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.muted};">${line}</p>`,
    )
    .join('')

  const fine = mail.fine
    .map(
      (line) => `
              <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};">${line}</p>`,
    )
    .join('')

  const sky = `background-color:${C.page};background-image:url('{{ .SiteURL }}/email/sky.png');background-repeat:repeat;`

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${mail.title}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  /* Progressive only. Everything that matters is inline below, because a client
     that drops this block must still render a complete email - and several
     drop it. */
  @media only screen and (max-width:620px) {
    .card { padding:26px 20px !important; }
    .title { font-size:22px !important; }
    .peep-sm { display:none !important; }
  }
  a { color:${C.ink}; }
</style>
</head>
<body style="margin:0;padding:0;${sky}">
  <!-- The inbox preview line. Hidden in the mail itself: zero height, zero
       opacity and pushed off-screen, which is the combination that survives
       Gmail, Outlook and Apple Mail alike. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${mail.preheader}</div>

  <!-- The sky. On the 'background' attribute as well as in CSS: Word reads the
       attribute and ignores the shorthand, and a mail that loses it falls back
       to the same deep-space colour rather than to white. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.page}" background="{{ .SiteURL }}/email/sky.png" style="${sky}margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 12px 44px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">

          <!--
            The lockup, on the sky's two blooms, as a single image.

            The alt text is the wordmark itself, so an inbox with images off
            shows "kxb.team" where the logo would be rather than an empty box -
            which is the whole reason this is one picture and not a logo laid
            over a background. See render-email-art.ts.
          -->
          <tr>
            <td align="center" style="padding:0;">
              <a href="{{ .SiteURL }}" style="text-decoration:none;">
                <img src="{{ .SiteURL }}/email/header.png" width="600" height="165" alt="kxb.team" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;border-radius:20px 20px 0 0;" />
              </a>
            </td>
          </tr>

          <!--
            The card. Solid, never translucent.

            The design on the site is glass over the starfield, and there is no
            honest way to do that here: 'rgba' backgrounds composite against
            white in Word, and 'backdrop-filter' exists in no email client at
            all. A solid panel a few shades off the sky reads as the same
            object and renders identically everywhere.
          -->
          <tr>
            <td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 20px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card" align="left" style="padding:30px 34px 30px;">

                    <div style="text-align:center;padding:0 0 24px;">${peepStrip(mail.peep)}
                    </div>

                    <!-- The neon rule: the lockup's cyan running into its
                         magenta, as an image because no client can be trusted
                         with a gradient. -->
                    <img src="{{ .SiteURL }}/email/rule.png" width="120" height="3" alt="" style="display:block;width:120px;height:3px;border:0;outline:none;margin:0 0 16px;" />

                    <h1 class="title" style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:1.24;font-weight:700;letter-spacing:-0.01em;color:${C.ink};">${mail.title}</h1>
${paragraphs}

                    <!-- The button. A table with bgcolor rather than a styled
                         anchor alone: Word drops border-radius and background
                         on an <a>, and the cell is what keeps it a button
                         there instead of blue underlined text.

                         Dark ink on the magenta, not white. White on this
                         neon is about 2:1 and unreadable on a phone in
                         daylight; the near-black is over 8:1. -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
                      <tr>
                        <td align="center" bgcolor="${C.magenta}" style="background-color:${C.magenta};border-radius:999px;">
                          <a href="${mail.cta.href}" style="display:inline-block;padding:15px 32px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${C.buttonInk};text-decoration:none;border-radius:999px;">${mail.cta.label}</a>
                        </td>
                      </tr>
                    </table>

                    <div style="padding:18px 0 0;border-top:1px solid ${C.line};margin-top:22px;">
${fine}
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 8px 0;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};">
                <a href="{{ .SiteURL }}" style="color:${C.faint};text-decoration:none;">kxb.team</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/**
 * The link every one of these carries.
 *
 * `{{ .TokenHash }}` and our own /auth/confirm, never `{{ .ConfirmationURL }}`.
 * The default spends the token at GoTrue's own /verify and redirects onward
 * carrying nothing, so our route has nothing left to verify and bounces the
 * recipient to /login?error=invalid_link - a link that looks fine and lands on
 * an error page. See the notes in supabase/config.toml.
 */
function confirmUrl(type: string, next?: string): string {
  const tail = next ? `&next=${next}` : ''
  return `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}${tail}`
}

const MAILS: Mail[] = [
  {
    file: 'magic_link.html',
    peep: 'fox',
    preheader: 'One tap and you are in - the link works once and lasts an hour.',
    title: 'Your link is ready',
    body: [
      'Tap the button to sign in. No password needed.',
      'Opening it also confirms this address is yours, which is the thing the app keeps asking about.',
    ],
    cta: { label: 'Sign in', href: confirmUrl('magiclink') },
    fine: [
      'The link expires in one hour and can only be used once.',
      "If you didn't ask for this, you can ignore this email - nothing has changed on your account.",
    ],
  },
  {
    file: 'confirmation.html',
    peep: 'penguin',
    preheader: 'Confirm your address and your space is ready to walk into.',
    title: 'Confirm your email',
    body: [
      'Welcome. One tap on the button below confirms this address and finishes setting up your account.',
      'Then you can pick an animal, name your space, and go and stand in it.',
    ],
    cta: { label: 'Confirm my email', href: confirmUrl('signup') },
    fine: [
      'The link expires in one hour and can only be used once.',
      "If you didn't sign up, you can ignore this email and no account will be created.",
    ],
  },
  {
    file: 'invite.html',
    peep: 'panda',
    preheader: 'Someone saved you a spot. Pick a password and walk in.',
    title: 'You have been invited',
    body: [
      'Somebody made you an account. The button below takes you in and lets you pick a password on the way.',
      'After that it is yours - your own animal, and every space you get invited to.',
    ],
    cta: { label: 'Accept the invite', href: confirmUrl('invite', '/welcome/password') },
    fine: [
      'The link expires in one hour and can only be used once.',
      "If you weren't expecting this, you can ignore this email.",
    ],
  },
  {
    file: 'email_change.html',
    peep: 'parrot',
    /**
     * This one goes to *both* addresses when double confirmation is on, and the
     * copy has to be true read from either end - so it names the new address
     * rather than saying "your address", which would be wrong in the mail sent
     * to the old one.
     */
    preheader: 'Confirm the new address before the change takes effect.',
    title: 'Confirm your new email',
    body: [
      'Someone asked to move this account to <strong style="color:' +
        C.ink +
        ';">{{ .NewEmail }}</strong>. Tap below to confirm it.',
      'You may have two copies of this - it goes to the old address and the new one, so a move can never happen quietly behind somebody\'s back. Opening either one finishes it; you do not need both.',
    ],
    cta: { label: 'Confirm the change', href: confirmUrl('email_change') },
    fine: [
      'The link expires in one hour and can only be used once.',
      "If you didn't ask to change your email, ignore this message and tell us - your address stays as it is, but somebody knows your password.",
    ],
  },
]

mkdirSync(OUT, { recursive: true })

for (const mail of MAILS) {
  writeFileSync(join(OUT, mail.file), shell(mail), 'utf8')
  console.log(`  ${mail.file}  (${mail.peep})`)
}

console.log(`\n${MAILS.length} templates written to supabase/templates/.`)
console.log('Ship them with ./scripts/deploy-mail-templates.sh')
