/**
 * Rebuilds the offline IP -> country table that `src/domain/analytics/geo.ts`
 * reads.
 *
 *     bun run scripts/update-geoip.ts
 *
 * ---------------------------------------------------------------------------
 * Why we carry our own table
 * ---------------------------------------------------------------------------
 * The analytics beacon wants a country and has an address to derive it from.
 * The two usual ways to bridge that gap are both worse than this one: calling a
 * geolocation API hands every visitor's address to a third party on every hit,
 * which is precisely the thing `page_views` was designed not to do, and a
 * GeoIP module in the proxy means a custom Caddy image and a MaxMind licence
 * key for a number we only ever use at country resolution.
 *
 * So the lookup happens in-process against a table baked into the build. No
 * request leaves the box, nothing to rotate, and it works identically in tests,
 * in dev and behind any proxy.
 *
 * ---------------------------------------------------------------------------
 * Where the data comes from
 * ---------------------------------------------------------------------------
 * The five regional internet registries each publish the allocations they are
 * responsible for as a "delegated extended" file. Between them that is every
 * routable address on the internet, with the country each block was handed to,
 * updated daily, free, and with no licence to attribute or key to keep secret.
 *
 * It is registration data, not observation: it says which country an ISP
 * registered a block in, not where the person holding the address is standing.
 * For "which countries is our traffic coming from" that is the right
 * resolution; it is not, and must not be sold internally as, a location.
 *
 * ---------------------------------------------------------------------------
 * What it emits
 * ---------------------------------------------------------------------------
 * `src/domain/analytics/geo-table.ts`, generated, base64 inside a TypeScript
 * module. That looks odd next to a hand-written codebase, and it is deliberate:
 * a data *file* would have to survive Next's standalone output tracing, which
 * only copies what it can see being imported. A module is imported, so it is
 * always there - in the Docker image, in `bun test`, everywhere.
 *
 * The table is a sorted list of range starts, so a lookup is a binary search
 * for the last start at or below the address. Gaps between allocations are
 * stored explicitly as "unknown" entries rather than left out, because a
 * missing entry would otherwise inherit the country of the block below it.
 */

const SOURCES = [
  'https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest',
  'https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest',
  'https://ftp.apnic.net/pub/stats/apnic/delegated-apnic-extended-latest',
  'https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest',
  'https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-extended-latest',
]

/**
 * Codes the registries use that are not places.
 *
 * `EU` and `AP` mean "somewhere in this region, we did not record where", and
 * `ZZ` means unknown outright. Storing them would put a row in the report that
 * looks like a country, sorts like a country and has no flag - honest unknown
 * is better than a plausible-looking non-answer.
 */
const NOT_A_COUNTRY = new Set(['ZZ', 'EU', 'AP', 'UK'])

/** Only blocks actually handed out describe anybody's traffic. */
const DELEGATED = new Set(['allocated', 'assigned'])

interface Range {
  /** Inclusive start. IPv4 as a 32-bit number, IPv6 as its top 64 bits. */
  start: bigint
  /** Exclusive end. */
  end: bigint
  country: string
}

async function fetchSource(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`)
  }
  return response.text()
}

function parseIpv4(text: string): bigint {
  const parts = text.split('.')
  if (parts.length !== 4) throw new Error(`not an IPv4 address: ${text}`)
  return parts.reduce((acc, part) => (acc << 8n) | BigInt(Number(part)), 0n)
}

/**
 * An IPv6 address reduced to its top 64 bits.
 *
 * Registries allocate in /32s down to /48s; nothing in these files is longer
 * than a /64, so the bottom half of the address carries no country information
 * and halving the key halves the table.
 */
function parseIpv6Prefix(text: string): bigint {
  const [head = '', tail = ''] = text.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const missing = 8 - headGroups.length - tailGroups.length
  const groups = [
    ...headGroups,
    ...(text.includes('::') ? Array(missing).fill('0') : []),
    ...tailGroups,
  ]
  if (groups.length !== 8) throw new Error(`not an IPv6 address: ${text}`)
  // Only the first four groups - the top 64 bits - are kept.
  // @†s-ignore
  return groups.slice(0, 4).reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group || '0', 16)), 0n)
}

function collect(text: string, v4: Range[], v6: Range[]): void {
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [, country, type, start, value, , status] = line.split('|')
    if (!country || !type || !start || !value) continue
    if (country === '*' || value === 'summary') continue
    if (!DELEGATED.has(status ?? '')) continue

    const code = country.toUpperCase()
    if (!/^[A-Z]{2}$/.test(code) || NOT_A_COUNTRY.has(code)) continue

    try {
      if (type === 'ipv4') {
        // `value` is a count of addresses here, not a prefix length, and it is
        // not always a power of two - a registry can hand out three /24s as one
        // record of 768.
        const from = parseIpv4(start)
        v4.push({ start: from, end: from + BigInt(Number(value)), country: code })
      } else if (type === 'ipv6') {
        // Here `value` *is* a prefix length. Anything longer than a /64 is
        // clamped, since that is the resolution the key keeps.
        const prefix = Math.min(Number(value), 64)
        const from = parseIpv6Prefix(start)
        v6.push({ start: from, end: from + (1n << BigInt(64 - prefix)), country: code })
      }
    } catch {
      // One malformed line in a 20 MB file is not a reason to fail the build.
      continue
    }
  }
}

/**
 * Sorted, non-overlapping, gap-marked, and with runs of one country collapsed.
 *
 * The output is what the lookup actually needs: a list where entry `i` owns
 * every address from `starts[i]` up to `starts[i + 1]`. Country index 0 is the
 * reserved "unknown" slot, which is what a gap between two allocations gets.
 */
function flatten(ranges: Range[]): { start: bigint; country: string | null }[] {
  ranges.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  const out: { start: bigint; country: string | null }[] = []
  let cursor = 0n

  const push = (start: bigint, country: string | null) => {
    const last = out[out.length - 1]
    // A run of the same country is one entry however many records it came from.
    if (last && last.country === country) return
    out.push({ start, country })
  }

  for (const range of ranges) {
    // Registries occasionally publish blocks that overlap something already
    // seen (a transfer recorded on both sides). First writer wins, because the
    // alternative is a table that is no longer sorted.
    if (range.end <= cursor) continue
    const start = range.start < cursor ? cursor : range.start
    if (start > cursor) push(cursor, null)
    push(start, range.country)
    cursor = range.end
  }
  push(cursor, null)

  return out
}

/**
 * The flattened list as bytes.
 *
 * IPv4: 4 bytes of start, 1 byte of country index. IPv6: 8 bytes, 1 byte.
 * Fixed width rather than varint-compressed, because the lookup is a binary
 * search and a binary search needs to jump to entry `n` without decoding the
 * `n - 1` in front of it.
 */
function pack(
  entries: { start: bigint; country: string | null }[],
  width: 4 | 8,
  index: Map<string, number>,
): Buffer {
  const buffer = Buffer.alloc(entries.length * (width + 1))
  entries.forEach((entry, i) => {
    const at = i * (width + 1)
    if (width === 4) buffer.writeUInt32BE(Number(entry.start), at)
    else buffer.writeBigUInt64BE(entry.start, at)
    buffer.writeUInt8(entry.country ? (index.get(entry.country) ?? 0) : 0, at + width)
  })
  return buffer
}

const OUTPUT = new URL('../src/domain/analytics/geo-table.ts', import.meta.url).pathname
const BUILT_ON_OUTPUT = new URL('../src/domain/analytics/geo-built-on.ts', import.meta.url).pathname

async function main() {
  console.log(`Fetching ${SOURCES.length} registry files...`)
  const texts = await Promise.all(
    SOURCES.map(async (url) => {
      const text = await fetchSource(url)
      console.log(`  ${new URL(url).hostname}: ${(text.length / 1e6).toFixed(1)} MB`)
      return text
    }),
  )

  const v4: Range[] = []
  const v6: Range[] = []
  for (const text of texts) collect(text, v4, v6)
  console.log(`Parsed ${v4.length} IPv4 and ${v6.length} IPv6 allocations.`)

  const flatV4 = flatten(v4)
  const flatV6 = flatten(v6)
  console.log(`Flattened to ${flatV4.length} IPv4 and ${flatV6.length} IPv6 entries.`)

  // Index 0 is reserved for unknown, so the codes start at 1 and a zero byte
  // never has to be distinguished from a missing one.
  const codes = [...new Set([...flatV4, ...flatV6].flatMap((e) => (e.country ? [e.country] : [])))].sort()
  if (codes.length > 254) throw new Error(`${codes.length} countries will not fit in one byte`)
  const index = new Map(codes.map((code, i) => [code, i + 1]))

  const packedV4 = pack(flatV4, 4, index)
  const packedV6 = pack(flatV6, 8, index)
  console.log(
    `Packed ${(packedV4.length / 1e6).toFixed(2)} MB IPv4 + ${(packedV6.length / 1e6).toFixed(2)} MB IPv6.`,
  )

  const today = new Date().toISOString().slice(0, 10)
  const source = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Rebuild with \`bun run scripts/update-geoip.ts\`, which documents where this
 * comes from and why it is checked in. Derived from the five regional internet
 * registries' delegated-extended statistics, ${today}.
 *
 * COUNTRIES is indexed from 1; index 0 means the address falls in a gap between
 * allocations and has no country. V4 is 5 bytes per entry (uint32 start, uint8
 * country), V6 is 9 (uint64 start of the top half, uint8 country). Both are
 * sorted by start, which is what makes the lookup in \`geo.ts\` a binary search.
 */

/** ISO-3166 alpha-2, sorted, 1-indexed. */
export const COUNTRIES = ${JSON.stringify(codes)} as const

export const V4_BASE64 =
  '${packedV4.toString('base64')}'

export const V6_BASE64 =
  '${packedV6.toString('base64')}'
`

  // The date lives in its own file so the backoffice can show how old the table
  // is without importing two megabytes of it to find out.
  const builtOn = `/**
 * GENERATED FILE - DO NOT EDIT. See \`scripts/update-geoip.ts\`.
 *
 * Split out from the table itself deliberately: this is the one fact about it
 * a page wants to render, and importing \`geo-table.ts\` for a date would pull
 * the whole thing into that route's bundle.
 */

/** When the registry table beside this was generated. */
export const BUILT_ON = '${today}'
`

  await Bun.write(OUTPUT, source)
  await Bun.write(BUILT_ON_OUTPUT, builtOn)
  console.log(`Wrote ${OUTPUT} (${(source.length / 1e6).toFixed(2)} MB, ${codes.length} countries).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
