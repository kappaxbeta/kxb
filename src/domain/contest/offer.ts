import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What the contest's code actually hands over, asked of the code itself.
 *
 * The conditions say "redeem this and get a month of xo"; since a code can also
 * carry bucks, they can say "and five bucks for skins" as well - and the one
 * thing that must never happen is the document promising something the code
 * does not give. So the number is read off `promo_codes` rather than being set
 * a second time in `contest_settings`: there is one place it can be wrong, and
 * it is the place that is also authoritative.
 *
 * Zero for a code that carries none, and zero for a code that does not exist -
 * the clause is drawn only when this is positive, so both failures come out as
 * silence rather than as a promise. The backoffice's health panel is where "the
 * code does not exist" is supposed to be noticed, loudly.
 */
export async function readContestBucks(code: string): Promise<number> {
  /*
    Silence covers the client that could not be built, too - see the same guard
    in `settings.ts` for the long version. Short: the image build has no
    `SUPABASE_SERVICE_ROLE_KEY`, on purpose, so `createAdminClient` throws there
    rather than returning a client that fails a query. A throw here would take
    down a legal page over a sentence the page draws only when this is positive,
    which is the wrong trade in both directions.
  */
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('promo_codes')
      .select('bucks')
      .eq('code', code)
      .maybeSingle()

    if (error || !data) return 0
    return data.bucks ?? 0
  } catch {
    return 0
  }
}
