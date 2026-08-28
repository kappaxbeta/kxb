/**
 * Environment access with a readable failure mode.
 *
 * A missing Supabase URL otherwise surfaces as an opaque `fetch failed` deep
 * inside supabase-js, which is a miserable first-run experience.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in - ` +
        `\`bun run db:start\` prints the local values.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: () =>
    required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  /**
   * Where Supabase Studio lives, derived from the API URL.
   *
   * The two do not share a shape. Locally the CLI serves the API on 54321 and
   * Studio on its own 54323, so the port has to be swapped. In production the
   * self-hosted stack puts both behind one Caddy on `backend.kxb.team`: the API
   * paths go to Kong and *everything else* to Studio behind HTTP basic auth
   * (see the backend box notes), so the Studio URL there is simply the API
   * origin. Detect local by host rather than by NODE_ENV, which is `production`
   * in a preview build against a local stack too.
   */
  studioUrl: () => {
    const base = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
    try {
      const url = new URL(base)
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        return `${url.protocol}//${url.hostname}:54323`
      }
      return url.origin
    } catch {
      return base
    }
  },
  supabaseAnonKey: () =>
    required(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),

  /**
   * Everything below is server-only and must never gain a NEXT_PUBLIC_ prefix.
   *
   * That prefix is not a naming convention - it is an instruction to inline the
   * value into the JavaScript sent to every browser. A NEXT_PUBLIC_ service
   * role key would hand every visitor unrestricted read/write on every tenant's
   * data, and no amount of RLS would help, because the service role is exactly
   * the thing RLS does not apply to.
   */
  supabaseServiceRoleKey: () =>
    required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  stripeSecretKey: () => required('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: () =>
    required('STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET),
  /**
   * The two recurring prices created in the Stripe dashboard: EUR 5/month for
   * xo and EUR 10/month for xp. See `domain/billing/prices.ts` for which sells
   * what, and for what happens to the legacy price below.
   */
  stripePriceXo: () => required('STRIPE_PRICE_XO', process.env.STRIPE_PRICE_XO),
  stripePriceXp: () => required('STRIPE_PRICE_XP', process.env.STRIPE_PRICE_XP),
  /**
   * The old single EUR 20/month price.
   *
   * No longer sold. Kept because subscriptions on it are still being collected
   * and still have to be recognised as entitling a space - see the note on
   * grandfathering in `domain/billing/prices.ts`. Optional, so a fresh
   * deployment that never had one does not have to invent it: callers read
   * `process.env.STRIPE_PRICE_ID` directly rather than through a `required`
   * accessor, which is why there is no `stripePriceId()` here any more.
   */
  hasLegacyPrice: () => Boolean(process.env.STRIPE_PRICE_ID),
  /**
   * Shared secret for the daily entitlement sync endpoint.
   *
   * That route runs as the service role and can read every account, so it needs
   * an authenticator. There is no user behind a cron job, so a bearer token is
   * the honest mechanism.
   */
  cronSecret: () => required('CRON_SECRET', process.env.CRON_SECRET),

  /** Absolute origin, used to build Stripe's success and cancel return URLs. */
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000',

  /*
   * NEXT_PUBLIC_TELEGRAM_APP is deliberately *not* here. It is read by
   * `lib/telegram/deep-link`, which runs in the browser, and this module is
   * imported by routes that hold the service role - so an accessor here would
   * be an invitation to import all of it into a client component. See the note
   * there.
   */
}
