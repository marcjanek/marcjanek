#!/usr/bin/env node
// Assembles src/ into the deployable index.html, twice: once at the repo root
// (GitHub Pages) and once in output/ (the Cloudflare Pages build directory).
//
// Two things cannot be plain files. The dc-runtime reads the component from a
// script element's textContent, so src/app.js has to be inlined; and the Credly
// badges are fetched here, at build time, so that a visitor's browser never
// contacts credly.com. A network failure is not fatal — the last good
// data/baked.json is used instead.
import { readFile, writeFile, mkdir, cp, rm, rename, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, sep } from 'node:path'
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
      .map((b) => ({ issued: String(b.issued_at_date ?? b.issued_at ?? '').slice(0, 10), expires: b.expires_at_date ? String(b.expires_at_date).slice(0, 10) : null, name: (b.badge_template ?? b.template ?? {}).name ?? b.name ?? '', id: typeof b.id === 'string' && /^[0-9a-f-]{36}$/.test(b.id) && b.public !== false ? b.id : null }))
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
// `name` is here for README.md only. The page lists file names, so it is
// stripped back out below rather than inlined into index.html for every visitor.
const MICROSOFT_LEARN = [
  { issued: '2021', expires: '2022', file: 'microsoft-az-204', name: 'Microsoft Certified: Azure Developer Associate (AZ-204)' },
  { issued: '2021', expires: null, file: 'microsoft-az-900', name: 'Microsoft Certified: Azure Fundamentals (AZ-900)' },
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

const certs = [
  ...badges.map((b) => ({
    issued: b.issued,
    expires: b.expires ?? null,
    file: CERT_FILE[b.name] ?? slug(b.name),
    name: b.name,
    // The public badge page, which is what ~/certs links each name to. Null for
    // a badge Credly reports as private and for the two Microsoft Learn entries,
    // which are not on Credly at all — those render as plain text, and the line
    // under the listing is what says why.
    id: b.id ?? null,
  })),
  ...MICROSOFT_LEARN,
].sort((a, b) => issuedKey(b.issued).localeCompare(issuedKey(a.issued)) || a.file.localeCompare(b.file))
baked.certs = certs.map(({ issued, expires, file, id }) => (id ? { issued, expires, file, id } : { issued, expires, file }))
log(`certs: ${certs.length} (${certs.length - MICROSOFT_LEARN.length} from credly)`)

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

// ── stylesheet cache stamps ────────────────────────────────────────────────
// The stylesheets are served from a stable name, and index.html is not cached
// at all, so a deploy put new markup in front of whatever stylesheet the edge
// still had. A change split across the two then ships *broken* rather than
// merely stale — it did: ~/shell lost its old min-height in the markup while
// the new height was still in the un-arrived CSS, and the terminal came out
// 64px tall and growing. Stamping each URL with a hash of the file it points at
// makes the pair inseparable: different CSS is a different URL, so the two can
// never disagree, and _headers can cache them for a year instead of for five
// minutes. The stamp goes on the source, before app.js is inlined, so the
// assertions below count only real references and not the copy in the payload.
const stamped = new Set()
const stamp = async (text, what, href, expected) => {
  const v = createHash('sha256').update(await readFile(p(href))).digest('hex').slice(0, 8)
  const needle = `${href}"`
  const n = text.split(needle).length - 1
  // Every reference to one file has to end up with the same URL. The two in
  // index.html are the preload in <head> and the stylesheet in <helmet>, and a
  // preload whose URL does not match the tag it warms is worse than none: the
  // browser fetches the file twice and logs "preloaded but not used".
  if (n !== expected) throw new Error(`${what}: expected ${expected} references to ${href}, found ${n}`)
  stamped.add(href)
  return text.split(needle).join(`${href}?v=${v}"`)
}

let doc = tpl
for (const href of ['assets/fonts.css', 'assets/page.css']) doc = await stamp(doc, 'src/index.html', href, 2)
// leaflet.css is injected by loadLeaflet() and warmed by warmLeaflet(), which
// have to agree or the warm fetch is thrown away
const src = await stamp(app, 'src/app.js', 'assets/leaflet.css', 2)

// A stylesheet that nothing stamped would be frozen for a year under a name
// that can change — the exact trap the year-long header creates. Adding one and
// forgetting to stamp it stops the build rather than reaching a visitor.
const sheets = (await readdir(p('assets'), { recursive: true }))
  .map((f) => 'assets/' + f.split(sep).join('/'))
  .filter((f) => f.endsWith('.css'))
const missed = sheets.filter((f) => !stamped.has(f))
if (missed.length) {
  throw new Error(`${missed.join(', ')}: served under a year-long cache with no ?v= stamp — add it to the list in scripts/build.mjs, or a returning visitor keeps the old file`)
}
log(`css stamped: ${sheets.length} (${sheets.map((f) => f.split('/').pop()).join(', ')})`)

const payload = { 'src/app.js': forScript(src.trimEnd()), 'data/baked.json': forJson(baked) }
// The badge names come from credly, which is not ours to control. If escaping
// ever fails to neutralise them, stop here — a build that exits 0 and deploys a
// blank page is the one failure nobody would notice.
for (const [what, text] of Object.entries(payload)) {
  const hit = text.match(BREAKS_OUT)
  if (hit) throw new Error(`${what}: ${JSON.stringify(hit[0])} survived escaping and would break out of its <script> element`)
}
const html = doc
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

// ── README.md's certification block ────────────────────────────────────────
// README.md renders at github.com/marcjanek because the repo name matches the
// username, and it showed an expired OCI badge with no qualifier for four
// years because it was written by hand. It is derived from the array above
// now, by the same expiry rule the page uses, so the two cannot disagree and a
// date that passes marks itself. Cloudflare's build does not commit, so what
// is public changes when this runs here and the result is committed.
const [OPEN, CLOSE] = ['<!--BUILD:certs-->', '<!--/BUILD:certs-->']
const today = new Date().toISOString().slice(0, 10)
const lapsed = (c) => Boolean(c.expires) && c.expires < today
// Badge names are credly's to change, and a `|` in one would silently split a
// table cell — markdown offers no other escape for it inside a table.
const cell = (s) => String(s).replace(/\|/g, '\\|')
const current = certs.filter((c) => !lapsed(c)).length
const block = [
  `**${certs.length} certifications, ${current} current.**`,
  '',
  '| Certification | Issued | Status |',
  '|---|---|---|',
  ...certs.map((c) => `| ${cell(c.name)} | ${c.issued} | ${lapsed(c) ? `expired ${c.expires}` : ''} |`),
  '',
  `Verify at [credly.com/users/${CREDLY}](https://www.credly.com/users/${CREDLY}) — everything except the two Microsoft entries, which are held on Microsoft Learn.`,
].join('\n')

const readme = await readFile(p('README.md'), 'utf8')
const from = readme.indexOf(OPEN)
const to = readme.indexOf(CLOSE)
if (from < 0 || to < from) {
  throw new Error(
    `README.md is missing ${from < 0 ? OPEN : CLOSE}. Refusing to leave the profile's ` +
    'certification list frozen at whatever it happens to say — hand-editing it is what ' +
    'put a lapsed credential on the profile in the first place.',
  )
}
const readmeNext = readme.slice(0, from + OPEN.length) + '\n' + block + '\n' + readme.slice(to)
if (readmeNext === readme) {
  log('README.md: certification block already current')
} else {
  await writeFile(p('README.md'), readmeNext)
  log(`README.md: certification block written (${certs.length} certificates, ${certs.length - current} expired)`)
}
