#!/usr/bin/env node
// Assembles src/ into the deployable index.html, twice: once at the repo root
// (GitHub Pages) and once in output/ (the Cloudflare Pages build directory).
//
// Two things cannot be plain files. The dc-runtime reads the component from a
// script element's textContent, so src/app.js has to be inlined; and the Credly
// badges are fetched here, at build time, so that a visitor's browser never
// contacts credly.com. A network failure is not fatal — the last good
// data/baked.json is used instead.
import { readFile, writeFile, mkdir, cp, rm, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...s) => join(ROOT, ...s)
const log = (...a) => console.log('[build]', ...a)

/**
 * Text going inside a <script> element. Two sequences take the document away
 * from us: a literal </script>, which closes the element, and the pair
 * `<!--` … `<script`, which puts the HTML tokeniser into script-data-double-
 * escaped state — from there the real </script> stops closing anything and the
 * whole rest of the page is swallowed into the script's text. That second one
 * is the dangerous one, because it produces a blank page from a build that
 * exits 0. `<\/` and `\x3C` both read back as the original character in every
 * JS string, template and regular-expression literal.
 */
const forScript = (s) => s
  .replace(/<\//g, '<\\/')
  .replace(/<!--/g, '\\x3C!--')
  .replace(/<(script)/gi, (_, tag) => '\\x3C' + tag)

/**
 * JSON going inside <script type="application/json">. Escaping every `<` is
 * both simpler and stricter than the above: < is valid JSON, JSON.parse
 * gives back a plain `<`, and no `<`-led sequence can survive to be parsed as
 * markup at all.
 */
const forJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c')

/** Nothing that reaches a script element may still look like markup. */
const BREAKS_OUT = /<\/script|<!--|<script/i

// ── data baked in at build time ────────────────────────────────────────────
const USER = 'marcjanek'
const CREDLY = 'marcin-mozolewski'

const grab = async (label, url, shape) => {
  try {
    const res = await fetch(url, { headers: { 'user-agent': `${USER}.build`, accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const out = shape(await res.json())
    log(`${label}: ok`)
    return out
  } catch (e) {
    log(`${label}: ${e.message} — keeping what data/baked.json already has`)
    return null
  }
}

const fresh = {
  credly: await grab('credly badges', `https://www.credly.com/users/${CREDLY}/badges.json`, (d) => {
    const items = d?.data ?? d?.badges ?? []
    if (items.length > 12) log(`WARNING: credly returned ${items.length} badges — only the first 12 are kept, ${items.length - 12} dropped`)
    const badges = items.slice(0, 12)
      .map((b) => ({ issued: String(b.issued_at_date ?? b.issued_at ?? '').slice(0, 10), expires: b.expires_at_date ? String(b.expires_at_date).slice(0, 10) : null, name: (b.badge_template ?? b.template ?? {}).name ?? b.name ?? '' }))
      .filter((x) => x.name)
    if (!badges.length) throw new Error('empty')
    return { badges }
  }),
}

// data/baked.json is the fallback for a failed fetch, so a problem reading it
// has to be told apart from a problem fetching: if both go wrong there is
// nothing left to build a truthful page from, and continuing would ship a
// ~/certs listing missing most of its entries under a green build.
let baked = {}
let disk = 'ok'
try {
  baked = JSON.parse(await readFile(p('data/baked.json'), 'utf8'))
} catch (e) {
  disk = e.code === 'ENOENT' ? 'absent' : e instanceof SyntaxError ? `malformed (${e.message})` : `unreadable (${e.message})`
  log(`data/baked.json: ${disk}`)
  baked = {}
}

const fetched = Object.entries(fresh).filter(([, v]) => v)
for (const [k, v] of fetched) baked[k] = v
const fetchOk = fetched.length === Object.keys(fresh).length

// ── ~/certs is one list ────────────────────────────────────────────────────
// Eight of the ten are on Credly. AZ-900 and AZ-204 are not — they live in
// Microsoft Learn, so they are the only entries typed by hand. Everything is
// derived here rather than in the page, so the listing cannot drift from the
// badges, and an expiry date that passes marks itself.
const CERT_FILE = {
  'HashiCorp Certified: Terraform Associate (003)': 'hashicorp-terraform-associate-003',
  'Associate Cloud Engineer Certification': 'google-associate-cloud-engineer',
  'Oracle Cloud Infrastructure Foundations 2020 Certified Associate': 'oracle-oci-foundations',
}
const MICROSOFT_LEARN = [
  { issued: '2021', expires: '2022', file: 'microsoft-az-204' },
  { issued: '2021', expires: null, file: 'microsoft-az-900' },
]
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** "2021" and "2021-06-30" both occur. Pad so the order is a date comparison
 *  and not an accident of string length; a year alone means end of that year. */
const issuedKey = (d) => (String(d) + '-99-99').slice(0, 10)

const badges = ((baked.credly ?? {}).badges ?? [])
if (!badges.length) {
  throw new Error(
    `no credly badges to build from — the fetch ${fetchOk ? 'returned none' : 'failed'} and data/baked.json ` +
    `${disk === 'ok' ? 'has no credly.badges either' : `is ${disk}`}. ` +
    `Refusing to ship ~/certs with only the ${MICROSOFT_LEARN.length} hand-typed Microsoft Learn entries.`,
  )
}
// A renamed badge silently falls back to slug(name); the map key is what goes
// stale, so warn on keys nothing matches rather than on badges nothing maps.
const names = new Set(badges.map((b) => b.name))
for (const name of Object.keys(CERT_FILE)) {
  if (!names.has(name)) log(`WARNING: CERT_FILE key ${JSON.stringify(name)} matches no badge — renamed or removed on credly; that cert's file name is now derived from the badge name`)
}

baked.certs = [
  ...badges.map((b) => ({
    issued: b.issued,
    expires: b.expires ?? null,
    file: CERT_FILE[b.name] ?? slug(b.name),
  })),
  ...MICROSOFT_LEARN,
].sort((a, b) => issuedKey(b.issued).localeCompare(issuedKey(a.issued)) || a.file.localeCompare(b.file))
log(`certs: ${baked.certs.length} (${baked.certs.length - MICROSOFT_LEARN.length} from credly)`)

// Only a successful fetch may rewrite the cache. Writing after a failed fetch
// would overwrite the last good data with a copy of itself at best, and with a
// truncated reconstruction of a malformed file at worst.
if (fetchOk) {
  await mkdir(p('data'), { recursive: true })
  await writeFile(p('data/baked.json'), JSON.stringify(baked, null, 1) + '\n')
} else {
  log('data/baked.json: left as it is — nothing fresh was fetched')
}

// ── assemble ───────────────────────────────────────────────────────────────
const [tpl, app] = await Promise.all([readFile(p('src/index.html'), 'utf8'), readFile(p('src/app.js'), 'utf8')])
for (const marker of ['<!--BUILD:app.js-->', '"BUILD:baked"']) {
  if (!tpl.includes(marker)) throw new Error(`src/index.html is missing ${marker}`)
}
const payload = { 'src/app.js': forScript(app.trimEnd()), 'data/baked.json': forJson(baked) }
// The badge names come from credly, which is not ours to control. If escaping
// ever fails to neutralise them, stop here — a build that exits 0 and deploys a
// blank page is the one failure nobody would notice.
for (const [what, text] of Object.entries(payload)) {
  const hit = text.match(BREAKS_OUT)
  if (hit) throw new Error(`${what}: ${JSON.stringify(hit[0])} survived escaping and would break out of its <script> element`)
}
const html = tpl
  .replace('<!--BUILD:app.js-->', () => payload['src/app.js'])
  .replace('"BUILD:baked"', () => payload['data/baked.json'])

// output/ is a committed deploy artefact, so it is assembled complete in a
// scratch directory and only then swapped in. Removing it first — as this did
// until a copy failed halfway — leaves a half-built tree deployed.
const STAGE = p('output.tmp')
await rm(STAGE, { recursive: true, force: true })
try {
  await mkdir(STAGE, { recursive: true })
  await writeFile(join(STAGE, 'index.html'), html)
  await cp(p('assets'), join(STAGE, 'assets'), { recursive: true })
  // public/ holds the files Cloudflare wants at the root of the output
  // directory — _headers, and anything like robots.txt later. They cannot live
  // in output/ itself because every build replaces it.
  await cp(p('public'), STAGE, { recursive: true })
} catch (e) {
  await rm(STAGE, { recursive: true, force: true })
  throw e
}
await rm(p('output'), { recursive: true, force: true })
await rename(STAGE, p('output'))

await writeFile(p('index.html'), html)

log(`index.html ${(html.length / 1024).toFixed(1)} KB · output/ mirrored`)
