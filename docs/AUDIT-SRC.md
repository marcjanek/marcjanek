# Audit — the `src/` implementation

Branch `redesign/2026`. Measured 2026-09-08, against the working tree, not the deployed site.

`docs/AUDIT.md` audited **the live site as a visitor meets it**. This document audits **the source that
produces it**: `src/app.js`, `src/index.html`, `scripts/build.mjs`, `assets/`, and the contract between
them. It also records the fixes applied in the same session, and what deliberately was not fixed.

**Method.** Six independent read-only passes, run in parallel, each confined to one domain so no pass
could be led by another's conclusions: outbound requests and storage; JavaScript correctness and
resource lifetime; markup, template contract and accessibility; the build pipeline and whether the
committed output still matches `src/`; content accuracy against `data/baked.json`; and a runtime pass
that was the only one permitted to *execute* the page. Static claims were then re-checked against the
runtime pass, and three of the highest-stakes ones were re-derived by hand. Every finding below carries
a file and line as it stood at audit time; line numbers have since moved.

**Tooling.** `node` for logic extraction and byte measurement, Chrome driven directly over the DevTools
Protocol for everything observational (Playwright is not installed here and nothing was installed for
this audit). The build was exercised in throwaway copies — the working tree was never built until every
fix was in.

---

## 1. Executive summary

102 raw findings across the six passes, deduplicated to 58 actionable items. One was rated CRITICAL.
Ranked by how much they matter:

| # | Finding | Domain | Status |
|---|---|---|---|
| 1 | **An expired certification was presented as current.** `microsoft-az-204` carried `expires: null` — "never expires" — and was counted in "9 of 10 still valid", on the same page as an OCI badge correctly marked expired. Microsoft role-based certifications lapse 12 months after the exam. | content | fixed |
| 2 | **The shell input was a keyboard trap.** `Tab` was swallowed unconditionally. Verified with real key events: 10× Tab, 5× Shift+Tab and Escape all left focus on the input. It is the last focusable element on the page, so a keyboard-only user who entered it could not leave. WCAG 2.1.2, Level A. | a11y | fixed |
| 3 | **The favicon never rendered.** Three unescaped `#` in the inline-SVG data URI truncated it at the first one; what reached the parser was an unterminated attribute inside an unterminated tag. The browser fell back to `/favicon.ico`, which does not exist. | markup | fixed |
| 4 | **A third-party badge name could kill the page, with a green build.** `forScript()` escaped `</` but not `<!--`. A Credly badge containing `<!--<script>` swallowed the whole document; proven in Chrome, `dc-root` 3× → 0×, exit code still 0. | build | fixed |
| 5 | **The site's own privacy claim was invisible on every phone.** The fixed footer is `overflow:hidden` at a constant 626 px intrinsic width, so at 390 px the `no trackers · no cookies` span began at x=383 — off-screen and unreachable. | responsive | fixed |
| 6 | **A missing or malformed `data/baked.json` shipped 2 of 10 certificates and destroyed the cache.** Two safety nets failed open at once, and the truncated result was then written back over the last good data. Exit code 0. | build | fixed |
| 7 | **The visitor's IP could go to an undisclosed third party.** On any ipapi.co failure the code silently fell back to `ipwho.is`, named nowhere, while the post-lookup note asserted the IP "went to ipapi.co". | privacy | fixed |
| 8 | **The shell announced nothing to a screen reader.** No `aria-live` or `role="log"` anywhere in the document. Typing `help` and pressing Enter produced silence. WCAG 4.1.3. | a11y | fixed |
| 9 | **Two panels could stick forever.** `lookupVisitor` and `probeServices` had no timeout and one-shot guards that never reset. A blackholed host left `~/visitor` on "resolving…" with the retry button already unmounted, and made `systemctl` instruct a retry that was a guaranteed no-op. | correctness | fixed |
| 10 | **First view was 19 KB over the brief's ceiling.** Leaflet was `rel=prefetch`ed unconditionally 1.2 s after mount, so every visitor who never opened the map paid 44.9 KB. Measured 168.8 KB against a 150 KB ceiling. | budget | fixed |

Two findings are worth calling out for what they did *not* turn out to be. The `~/visitor` privacy gate
is sound — Leaflet's bytes were being prefetched, but `rel=prefetch` neither parses nor executes, and
`typeof window.L` was verified `undefined` until the click. And the documented "page scrolls
horizontally below ~430 px" defect **no longer exists**: `scrollWidth` is 320 at a 320 px viewport, not
the 516 on record. A `@media (max-width: 560px)` rule in `assets/page.css` fixed it at some point.

---

## 2. Verdict by domain

**Privacy — the claim holds.** Nothing third-party is requested on page view. Verified twice: by
exhaustive static enumeration of every `fetch`, element injection and URL in `src/`, and by a runtime
pass that logged all 16 requests on a full scroll and found every one first-party. No storage API is
referenced anywhere in `src/` — not a cookie, not a `localStorage` key, and no leftover of the removed
`mz.gh` / `mz.contrib` / `mz.credly` caches. Credly badges are genuinely baked: `data/baked.json` holds
text only, there are no badge images on the page at all, and the sole `<img>` is the local portrait. The
defects found here were about **disclosure**, not transfer: an unnamed fallback recipient, and consent
copy that sat below the button it was consenting to.

**JavaScript — sound, with real gaps.** No XSS (no `innerHTML`, no `eval`, and dc-runtime escapes every
interpolation), correct `recall()` bounds, guarded `JSON.parse`, and `prefers-reduced-motion` handled in
the right order — the common bug of leaving content permanently hidden is *not* present. The gaps were
teardown (six resource classes created and never released), async safety (no timeout anywhere, no
`AbortController`, guards that never reset), and a deterministic state clobber that made the entire
`/cdn-cgi/trace` round trip produce a value nothing rendered.

**Markup — structurally clean.** A tokenizer over all 871 tags found zero duplicate attributes, zero
duplicate ids, zero mis-nested tags and zero dangling fragment targets. All 43 bindings resolved. Every
`<` `>` `&` in text content was correctly escaped. The template dialect is used correctly throughout.
Defects were concentrated in accessibility and metadata.

**Accessibility — one Level A failure, several AA.** The keyboard trap was the serious one. Beyond it:
no live region on the shell, nine unnamed `<section>`s producing zero landmarks, un-typed content that
was `opacity:0` yet still focusable and clickable (including the one button that sends an IP to a third
party), and a text input with every affordance removed. Contrast is genuinely fine — every text pair
clears 4.5:1, with `#8A857D` on `#151513` the thinnest at 4.99:1.

**Build — reproducible, and fragile in the ways that matter.** Offline and online runs both reproduced
the committed output byte-for-byte, markers were intact, and the `$&`-in-replacement hazard was absent
because the script uses function replacements. But two failure modes shipped broken output with exit
code 0, and `rm -rf output/` ran before the copy, so a mid-build error wiped the deploy tree.

**Content — disciplined, with one serious error.** Job title, employer, city, contact address, the
egress and provisioning phrasings and the provider count are identical everywhere they appear; spelling
is consistently American; product names are correctly styled. The certification pipeline derives the
listing, the expiry marks, the header count and the gauge from one array, so they cannot disagree — the
error was in the input, not the logic. The known "four clouds daily" discrepancy is **already resolved**
in the current copy: the page says one daily of eight, everywhere.

---

## 3. Findings register

Severity as assessed at audit time. `fixed` means implemented and verified in this session; `open`
means it needs a decision or work outside this repo; `rejected` means the finding was investigated and
found wrong, with the evidence recorded.

### CRITICAL

| Finding | Where | Status |
|---|---|---|
| `microsoft-az-204` hand-entered with `expires: null`, rendered valid and counted in "9 of 10 still valid" | `scripts/build.mjs:64` | **fixed** — `expires: '2022'`; renders `microsoft-az-204.cert.expired  # expired 2022`, header "2 expired", gauge "8 of 10 still valid" |

### HIGH

| Finding | Where | Status |
|---|---|---|
| `Tab` swallowed unconditionally — keyboard trap, WCAG 2.1.2 Level A | `src/app.js:579` | fixed — Tab intercepted only when there is something to complete; Escape blurs |
| Favicon data URI truncated by three unescaped `#` | `src/index.html:6` | fixed — `%23`; re-parsed, `.hash` empty, body well-formed |
| `forScript()` does not escape `<!--`; a Credly badge name can kill the page with exit 0 | `scripts/build.mjs:19` | fixed — escape widened, JSON payload switched to `<`, plus a post-assembly assertion that throws if any breakout sequence survives |
| Missing/malformed `data/baked.json` ships 2 of 10 certs *and* overwrites the cache | `scripts/build.mjs:49-51,80` | fixed — `ENOENT` vs `SyntaxError` distinguished, build refuses to ship, cache only rewritten on a successful fetch |
| `lookupVisitor` has no timeout; `~/visitor` sticks on "resolving…" with the retry button already gone | `src/app.js:354-369` | fixed — 4 s `AbortController` deadline, honest failure state, retry restored |
| `probeServices` — `Promise.all` + no timeout + a guard that never resets; the page instructs a retry that cannot work | `src/app.js:264-276` | fixed — `allSettled`, per-host deadline, guard reset, and the pending row is now rewritten in place |
| `ipwho.is` receives the visitor's IP and is named nowhere; the post-lookup note asserts otherwise | `src/app.js:359-360` | fixed — both hosts named before the click, answering host interpolated after |
| The shell has no live region; screen readers hear nothing | `src/index.html:324-336` | fixed — `role="log" aria-live="polite"` on the output only |
| `help` columns collapsed; 11 of 16 rows lost their padding | `src/app.js:44` | fixed — rebuilt from a padded row builder; descriptions now all start at column 22 |
| `src/`, `assets/`, `scripts/`, `data/` are untracked; `main` still holds the old page | git | **open** — see §5 |

### MEDIUM

| Finding | Where | Status |
|---|---|---|
| First view 168.8 KB against a 150 KB ceiling — Leaflet prefetched for everyone | `src/app.js:148` | fixed — IntersectionObserver on `#visitor` replaces the blanket timer |
| The privacy claim clipped off-screen below ~620 px | `src/index.html:340-342` | fixed — `rtt` and `session` collapse first; claim verified fully visible at 320 px |
| Teardown incomplete: map, injected elements, idle callback, in-flight fetches | `src/app.js:523-530` | fixed — all released, plus a `_dead` guard on every async `setState` |
| Cloudflare colo deterministically clobbered; `coloLine` and `svcNote` rendered nowhere | `src/app.js:256` | fixed — composed at render time; `svcNote` surfaced under `systemctl`, colo under `ping` |
| `CAT`/`LINK` resolve arguments through `Object.prototype` (`xdg-open __proto__` opened a 404) | `src/app.js:54,80` | fixed — `Object.create(null)` |
| `initMap` starts two boot loops; the accurate coordinates silently lose to the timezone guess | `src/app.js:384-407` | fixed — single loop reading a stored target, so the later better position wins |
| Un-typed content `opacity:0` but focusable and clickable — including the whois button | `src/app.js:423-426` | fixed — `visibility:hidden` alongside, plus a `focusin` net |
| `visitorLookup:false` claims "nothing left your browser" after OSM tiles were requested | `src/app.js:323` | fixed — the map call moved below the guard |
| Nine `<section>`s unnamed → zero `region` landmarks | `src/index.html` ×9 | fixed — `aria-labelledby` against the existing `h2.sr` |
| Whois button unmounts on click, dropping focus to `<body>`, and announces nothing | `src/index.html:263-265` | fixed — stays mounted with `aria-disabled`; results grid is a live region |
| Shell input: no border, no focus ring, `outline:none` | `src/index.html:334` | **partly reverted** — the caret is the indicator; see the rejected table |
| Focused controls can sit under the fixed nav or footer (SC 2.4.11) | `assets/page.css` | fixed — `scroll-margin-block: 48px 40px` |
| `rm -rf output/` before the copy — a mid-build failure wipes the deploy tree | `scripts/build.mjs:92-95` | fixed — assembles into `output.tmp/` and swaps |
| `og:image` is WebP (LinkedIn renders nothing), no `og:image:alt`, description 171 chars, `og:description` drops the location | `src/index.html:14,21-23` | fixed — JPEG twin added, metadata completed |
| `~/stack` tree indentation claims `linux`/`git` are top-level | `src/index.html:232-234` | fixed — reflowed, verified by column position |
| Gauges misaligned by 16 columns plus a stray blank row | `src/index.html:113-114` | fixed — both `[` now at column 7 |
| `date` prints a JavaScript date string, not `date` output | `src/app.js:77` | fixed — `Tue Sep  8 14:23:11 CEST 2026` |
| `neofetch` and `help` implemented but unlisted, while the copy claims `help` lists everything | `src/app.js:44` | fixed — both listed |
| Terminal identity contradicts itself: `login: marcin`, `guest@` prompts, `pwd` → `/home/marcin` | both files | fixed — unified on a guest session; `/home/marcin` stays as the mounted home |
| Box-drawing glyphs fall back to the OS font — no shipped subset covers U+2500–U+25CF | `assets/fonts.css:8,17` | **fixed** in the follow-up pass — the tree, both gauges and the shell's status dot are CSS; nothing on the page needs the OS fallback any more |
| `#8A857D` on `#151513` at 4.99:1 leaves 0.49 of headroom | palette | noted — passes; do not darken the foreground or lighten the pane |

### LOW and NIT

37 further items were found and 33 were applied: `res.ok` checks, `loadLeaflet` error handling,
per-command tab-completion pools, the `COMMANDS`/`run()` divergence, `noreferrer`, reduced-motion
`scroll-behavior` and `jump()`, the skip link's document-relative positioning, focus styles on the
contact links, `aria-hidden` on the boot overlay, JSON-LD `Person`, provider naming consistency, the
boot line's interconnect topology, the `/cdn-cgi/trace` 404 on non-Cloudflare hosts, a nav scroll
shadow, `.nvmrc`, a `public/_headers` mechanism, badge-truncation and stale-map-key warnings, five dead
`@keyframes`, the Polish editor labels, and a dozen copy corrections.

### Rejected — findings that did not survive investigation

| Claim | What the evidence showed |
|---|---|
| "The `clouds` gauge should be 8 cells, not 10" | `src/app.js` computes `round(valid / total * 10)` — it is a **percentage** bar, and `round(1/8*10) = 1` of 10 is exactly what was rendered. Shortening it would put the two gauges on different scales and misalign their brackets. The finding was mine and it was wrong. |
| "Widen `unicode-range` to cover the box-drawing glyphs" | A woff2 reader written for the check found the glyphs are absent from **both** shipped subsets (`latin` tops out at U+FEFF, `latin-ext` at U+2113). The suggested fix would point at files containing nothing. The subset cannot be cut from what is in the repo. |
| "Use `disabled` on the whois button" | The HTML spec requires blurring a focused element that becomes disabled — the fix would have reproduced the exact focus loss the finding was about. `aria-disabled` was used instead. |
| "`echo` should use `raw.trim().slice(5)`" | bash word-splits, so `echo   a   b` prints `a b`. The existing `join(" ")` reproduces that; the suggestion would not. |
| "Reset `vRan` to false after a failed lookup" | `vRan` also drives the footer's tracking note, so resetting it would restore "no trackers · no cookies" *after* a real request had left the browser. A separate `vFailed` key carries retry-ability instead. |
| "The page scrolls horizontally below 430 px" (on record as known and deferred) | No longer reproduces. `scrollWidth` is 320 at a 320 px viewport, not 516. |
| "Give the shell input a visible border and a focus ring" | Applied, then **reverted on Marcin's objection, and he was right**. A terminal has no rule under its prompt and no box around the typing area; the fix satisfied a checklist by breaking the fiction the whole page exists to sell. The replacement indicator is the native text caret — `caret-color:#7FC8A9` on `#0E0E0D` is 9.87:1, WCAG's Understanding of SC 2.4.7 names the text cursor as the normal focus indicator for a text field, and unlike the decorative `data-caret` blocks it is browser-native, so `prefers-reduced-motion` does not freeze it. The component is identified by the `$` prompt, the `● bash — interactive` header and the hint line above it. This is a deliberate trade of a belt-and-braces AA indicator for design integrity, recorded here so it is not silently re-broken by the next audit. |

---

## 4. What changed

Implemented in this session by three agents, one per file, so no two could touch the same bytes.
Everything was applied to `src/`, `scripts/` and `assets/`; the generated `index.html` and `output/`
were rebuilt once at the end.

| File | Before | After |
|---|---|---|
| `src/app.js` | 600 lines | 953 |
| `src/index.html` | 350 lines | 356 |
| `scripts/build.mjs` | 98 lines | 184 |
| `assets/page.css` | 45 lines | 57 |
| new | — | `.nvmrc`, `public/_headers`, `assets/img/marcin.jpg` |

`src/app.js` grew by more than half. The additions are: per-request `AbortController` deadlines, a
complete teardown path with a `_dead` guard, an IntersectionObserver replacing the prefetch timer, a
`date(1)` formatter, a padded `help` builder, per-command completion pools, prototype-safe lookup
tables, a single-boot map loop with a stored target, and the `visibility` handling around the
typewriter. It is more code doing more; none of it is speculative abstraction.

Three decisions were Marcin's and were applied by hand, because each spans both source files:

- **AZ-204 lapsed and was not renewed** → `expires: '2022'`. Year granularity, matching `issued: '2021'`;
  the exact exam date is not recorded anywhere in the repo, and inventing a month would be a fabricated
  fact on a page whose credibility rests on this section.
- **The terminal is a guest session** → the boot logs in `guest`, `pwd` returns `/home/guest`, and
  `whoami` keeps its joke as "you are guest. I am marcin — …". `[  OK  ] Mounted /home/marcin` stays and
  now reads correctly: guest is logged in, marcin's home is mounted.
- **The `ipwho.is` fallback stays, and both hosts are named** → the note above the button names ipapi.co,
  ipwho.is and openstreetmap.org before the click; the note after the click interpolates whichever host
  actually answered, rather than asserting one.

### Follow-up pass — a second review, applied whole

A later review of the deployed page came back with five changes, all of them taken. They touch
`src/app.js`, `src/index.html` and `assets/page.css` only; no new host, no storage, no change to the
CSP or to `scripts/build.mjs`.

| Change | Why |
|---|---|
| `~/stack`'s tree and both gauges redrawn in CSS | closes §5.3 — no glyph the font subset lacks is positioning anything any more |
| The boot overlay skips on any key, click or tap | it ran 3.8 s whether or not the visitor wanted it; the overlay now says so from 0.8 s |
| The tmux bar gets a visible scrollbar and a `›` below 1040 px | the bar has always scrolled — its `scrollWidth` is 1040 — and nothing said so on a phone |
| `~/career` prints short dates below 560 px | the `max-content` date column was taking two thirds of a 320 px row |
| Two inline links padded to 24 px | WCAG 2.5.8; padding rather than a larger font, so the neofetch grid keeps its rhythm |

`~/shell`'s `●` was finished off in the same commit — the one character the review left behind, and
with it gone the page asks the OS fallback for nothing.

One thing the pass surfaced only on production: **the Leaflet warming had never worked there.**
Cloudflare answers any request carrying `Sec-Purpose: prefetch` with 503 — measured against
`/assets/vendor/leaflet.js` and against `/` itself, while a plain GET and the legacy
`Purpose: prefetch` both return 200 — so the two `<link rel=prefetch>` failed on every visit that
scrolled to `~/visitor`, leaving two console errors and a cold click. The "console clean" result in
§6 was measured against localhost, where prefetch works, which is how it survived. `warmLeaflet()`
fetches both files instead and reads the body; a `Response` dropped unread is cancelled before it
reaches the cache the click depends on. Nothing is parsed or executed — `window.L` stays `undefined`
until `loadLeaflet()` injects the real tags — so the privacy model is untouched.

Cost: 2.4 KB gzipped of the 20.1 KB headroom. Re-verified in headless Chrome at 320, 390, 768 and
1440 px: `scrollWidth` equals `clientWidth` at every width, nothing inside `main` overflows, both
gauges measure identically, no link or button has a target under 24 px, the shell's status dot is a
6.9 px CSS circle, and the build still exits 0.

### Third pass — what only a phone could show

Four defects came back from Safari on an iPhone, none of which any check here could see, and one
answer to "can the first screen come up faster".

| Reported | What it was |
|---|---|
| Every boot line appears at once, then the sequence restarts | `assets/page.css` is a `<link>` inside `<x-dc>`, so the browser paints the log before the `@keyframes` that stagger it arrive. An inline `<style>` in `<head>` now covers the intro and pauses it until `startBoot()` has the stylesheet and the font |
| The boot log's last line lands on "press any key or tap to skip" | The note is a separate fixed element on the same bottom inset; `#boot` reserves 2.4em of padding for it |
| Tapping `0:whoami` rings the whole section | It is the only section with `tabindex="-1"`, because it is where the skip link lands, and Safari rings a focused `tabindex="-1"` element. `:not(:focus-visible)` keeps the ring for the keyboard |
| A strip beside the home indicator is not the footer's colour | `viewport-fit=cover` plus `env(safe-area-inset-*)` on every fixed edge, so the footer's own box reaches the bottom of the display |

Giving `html` the bar colour was tried first for that last one and put a lighter band across the
middle of the page — a reminder that a colour fix aimed at a browser nobody here can drive is a guess,
and has to be verified on the device before it is trusted.

On speed: the first screen is not waiting on bytes. Measured on production, TTFB is 47 ms, the first
paint 110 ms and the intro starts at 191 ms; content appears at about 4.0 s, so **95% of the wait is
the intro itself**, which is a deliberate design and stays. What was recovered underneath it: react
and react-dom were serialized behind dc-runtime, which loads them itself, and now preload alongside
everything else; and `/assets/*` was served `max-age=0, must-revalidate`, which cost nine
revalidations on a returning visit *and* defeated those preloads — `page.css` and `fonts.css` were
being fetched three times in a single load. With both fixed, every asset is requested once, a
returning visit crosses the wire only for the HTML, and the four "preloaded but not used" console
warnings are gone.

### Second pass — the boot sequence, and three things it exposed

A further round, taken whole. The intro was rebuilt: twenty-one log lines at a 0.06 s cadence instead
of thirteen at 0.25 s, the log wiping at 1.72 s, and a full-screen `mozolewski.eu` typing at 2 s from
`z-index` 59 — behind the log, so the wipe uncovers a wordmark already running rather than cutting to
one — before dissolving from 2.95 s. Every added log line restates something the page already claims:
`cloud-router` and `envoy`/`rust-wasm`/two regions come from `~/work`'s sys-01 and sys-02, the eight
providers from `~/whoami`, the `certs` line from the baked list, `sailing.timer` from Off-clock.

Three defects the longer intro made visible, all fixed in the same pass:

| Defect | Fix |
|---|---|
| A scroll behind the overlay swept sections past the reveal band, so the visitor landed mid-page with the typewriter already spent | `lockScroll()` freezes the page while the intro is up and releases on the skip, on a 3.9 s timer and on unmount — never engaging under `prefers-reduced-motion`, on a hashed URL, or with `intro:false` |
| Twenty-one lines do not fit a short viewport | `bootScroll()` measures the overflow and steps the log up a line at a time: 2 steps at 1280×560, 4 at 390×640, none at 1280×900 |
| The portrait's `decode` and the bar under it ran to completion behind the boot screen, so the photo simply appeared | `restartDecode()` replays them once when the row is uncovered |

`~/visitor`'s note also reserves the tallest text it can hold, so the button above it stops jumping a
line under the cursor that just pressed it; checked against all six note variants at four widths.

Verified at 320, 390, 768 and 1280 px: no horizontal scroll, nothing inside `main` overflowing, all
nine sections reaching full length after a complete scroll, the console clean, and the scroll lock
releasing on all three paths.

**One thing the longer intro made obvious, and one it hid.** `assets/page.css` is a `<link>` inside
`<x-dc>`, so the browser paints the boot log before the `@keyframes` that stagger it arrive — the
twenty-one lines appear at once, and the sequence then restarts underneath the visitor. Glaring on a
slow connection, a flicker on a fast one. An inline `<style>` in `<head>` now holds an opaque cover
over the intro and pauses every one of its animations until `startBoot()` confirms `page.css` applied
and the font loaded, then releases all of it with one class so the sequence starts from zero together.
Both waits are bounded by timers, and the gate is scoped to `html.js`, so a browser without JavaScript
is never left on a black page.

The thing it hid: `bootScroll()` ran at mount, where on a real connection the boot box is not laid out
yet. It read a `clientHeight` of 0, concluded the log fit, and returned — so the log never scrolled in
production and a short screen lost its last lines. It could not be seen locally, where layout finishes
before mount, and a probe that read the DOM early forced the layout that made it look fine. Measuring
at the gate is what fixes it. Measured on a throttled connection: black at 756 ms, the gate opening at
2.3 s, then the lines staggering in one at a time.

The skip note is a separate fixed element sharing the boot box's bottom inset, so the log scrolled its
last line straight onto it — measured at 5 px of overlap at 390×640, 8 px at 320×568 and 15 px at
1280×560. `#boot` now reserves 2.4em of bottom padding for it, which `bootScroll()` reads as less room
and scrolls further into: every size from 320×480 to 1280×900 clears the note, the tightest by 13 px.

Cost: 4.0 KB gzipped for the boot work, which takes the first view to 136.2 KB and the headroom to
13.8 KB.

---

## 5. Open — needs a decision or work outside this repo

**1. RESOLVED — deployed 2026-09-08.** The terminal page is live on mozolewski.eu (`781a6a2`, then
`6db8b6f`), GitHub Pages is disabled, and the Cloudflare build command is now `node scripts/build.mjs`
instead of `exit 0`. Verified on production in headless Chrome: no third-party request except the
Cloudflare beacon, no cookie, no storage, zero CSP violations, nine sections rendering, the status bar
inside a 320 px viewport. The original finding read:

> **Nothing audited here is deployed yet.** `src/`, `assets/`, `scripts/` and `data/` are untracked;
`main` still carries the previous 18 KB single-file page, which loads `komarev.com`, `images.credly.com`
and a Spotify widget host at view time — so the "no trackers" claim is currently false *in production*
while being true in this tree. The fix is one changeset, and the ordering matters: **committing
`index.html` without `assets/` would 404 every script and blank the site.** Commit `src/`, `scripts/`,
`data/`, `assets/`, `output/` and the root `index.html` together.

**2. SUPERSEDED — Web Analytics stays on, by decision.** The Pages project's own analytics tag was
cleared, but a zone-level injection remains and Marcin chose to keep it. The CSP now allows
`static.cloudflareinsights.com` and `cloudflareinsights.com` rather than blocking them, because
blocking a feature that is switched on is the worst of both — a console error on every load and no data
collected. Two claims were corrected in the same change, since they stopped being true: the status line
now reads `no cookies · cf analytics`, and the post-lookup note no longer says "nothing reached me".
The narrow justification is that Cloudflare already terminates every request as the site's CDN, so the
beacon adds no new recipient; it remains a third-party request and a page-view tracker, and the copy
says so. Rocket Loader and Email Obfuscation were also settled — see `CLAUDE.md`. The original finding
read:

> **Turn off Cloudflare Web Analytics at the Pages project.** The new `public/_headers` ships a
Content-Security-Policy that was verified end to end in Chrome — zero violations, all gated features
still work. It necessarily blocks `static.cloudflareinsights.com`, the beacon the Pages project injects
at the edge. That beacon is already on record as the one thing making "no trackers" arguable, so
blocking it is deliberate — but left enabled it will now fail loudly in every visitor's console.
Two other zone settings from `docs/AUDIT.md` remain outstanding: **Rocket Loader is on** and rewrites
script types, which would break dc-runtime; **Email Obfuscation is on** and rewrites the `mailto:`.

**3. RESOLVED — the box characters are gone, replaced by CSS.** The second of the two ways out was
taken in the follow-up pass. `~/stack`'s tree is a `<ul class="tree">` drawn with `border-left` and
`border-top`, and the two gauges are ten `<span>`s each; nothing is positioned by a glyph the font
does not carry, and `~/shell`'s `●` status dot became a CSS circle in the same pass. Scanning the
built `index.html` for codepoints outside the subset's `unicode-range` now returns **nothing**. That
also removed the need to test on Windows: there is no fallback glyph left to measure. The original
finding read:

> **The box-drawing glyphs still come from the OS fallback font.** Neither shipped woff2 contains
U+2500–U+25CF, and the subset cannot be produced from what is in the repo — the source is upstream
JetBrains Mono, which is not on disk. Measured impact on macOS is 0.03 px per character, a hairline.
On Windows the next family in the stack is Consolas at roughly 8% narrower per glyph, which would
visibly break the ASCII columns. Two ways out, both recorded in a comment at the top of
`assets/fonts.css`: commit a real subset built from upstream (a one-off human step, not a build
dependency), or replace the box characters with CSS borders. **Untested on Windows** — that is the
gap worth closing first.

**4. Content questions only Marcin can answer.**
- `rysinder.mozolewski.eu` is probed by `systemctl` and printed verbatim, and nothing on the page says
  what it is. It reads as a leak rather than a feature.
- "commercial since 2021 · five years self-taught before that" sits on the same page as a 2019
  commercial internship at eService. His wording, and not verifiable from the repo — but a reader
  scrolling from `~/whoami` to `~/career` sees paid work before 2021.
- `~/certs` offers `verify: credly.com/users/marcin-mozolewski` for ten certificates, two of which live
  on Microsoft Learn. The line now says so; a Microsoft Learn transcript URL would close it properly.
- "hundreds of applications" is the page's largest unqualified number, in four places.

**5. RESOLVED — and the safety net it assumed is gone.** The Cloudflare Pages build command is
`node scripts/build.mjs` with output directory `output/`, set and verified in CI: `.nvmrc` honoured
(Node 22.22.0), the Credly fetch succeeding, `_headers` picked up. What has changed since the finding
was written is that **`output/` and the root `index.html` are no longer committed** (`d99cb30`) — they
used to mean every asset lived in the repo twice. So the build command is now load-bearing rather than
a nicety: without it there is nothing to serve. The trade is deliberate — the build exits non-zero
rather than ship a truncated page, and Cloudflare keeps serving the previous deployment when it does.
The original finding read:

> **Deploy configuration.** The Cloudflare Pages build command should be `node scripts/build.mjs` with
output directory `output/`. `output/` is committed as well, so the site still deploys if the command is
unset — it just stops refreshing the baked certification data, and `public/_headers` would never reach
the output root.

---

## 6. Verification

Every fix was re-tested against the built page in headless Chrome driven over the DevTools Protocol —
not against the source, and not by re-reading the diff. 14 checks, all passing.

| Check | Result | Evidence |
|---|---|---|
| Keyboard trap gone | pass | Tab on an empty line → skip link; Shift+Tab → the contact link before it; Escape → `BODY`; Tab on `sy` still completes to `systemctl ` and stays |
| Favicon parses | pass | `new URL(href).hash` is `""`, DOMParser reports no `parsererror`, decoded body is a well-formed 403-char SVG |
| Nothing third-party on view | pass | 15 requests, every one first-party. Cookie `""`, localStorage `[]`, sessionStorage `[]`, IndexedDB `[]`, caches `[]`, service workers `0` |
| Leaflet deferred | pass | zero leaflet requests before scrolling; both files requested only once `#visitor` approaches |
| Privacy claim visible on a phone | pass | `fullyInViewport: true` at all nine widths. At 320 px the span is x=78…308 inside a 320 px viewport; the footer stays one 30 px line everywhere |
| Certificates honest | pass | `microsoft-az-204.cert.expired  # expired 2022`, header "2 expired", gauge `[████████░░] 8 of 10 still valid`, AZ-900 still valid |
| Terminal identity | pass | boot `login: guest`, all eight prompts `guest@mozolewski.eu`, `pwd` → `/home/guest`, `whoami` → "you are guest. I am marcin — …", `Mounted /home/marcin` intact |
| Both IP hosts disclosed | pass | the pre-click note names ipapi.co, ipwho.is and openstreetmap.org, and its bottom edge (3919.97) is above the button's top (3936.36) |
| Button survives its click | pass | focus stays on the button before, immediately after, and after the lookup settles; `aria-disabled` flips false → true while `disabled` stays false |
| `systemctl` needs one run | pass | `probing…` is rewritten in place with real timings; a second run refreshes them (158/146/729 ms → 38/26/199 ms) |
| Console clean | pass | zero messages across load, 10 s idle, a full scroll, 20 shell commands, the whois lookup and nine widths. The `/cdn-cgi/trace` 404 is gone |
| No regressions | pass | nine sections render (803/1911/641/652/580/902/614/460/179 chars); no `undefined`, `[object Object]`, `NaN` or crash in any command; history clamps at both ends; no horizontal scroll at any of nine widths |
| Reduced motion | pass | all nine sections full length **without scrolling**; the only hidden elements are the boot overlay and its descendants; all eight decorative carets end visible |
| Focus visible and ordered | pass | the skip link is Tab #1 and lands at `left:8px`, rect (8,42); all 18 other focusable elements show a ring |

**Re-checked after the last edit.** The verification run measured build `003076c6`; the shell input's
`outline:none` was restored afterwards, producing `ef3c767e`. That delta was re-driven end to end: zero
third-party requests, clean console, no error overlay, `window.L` undefined, and section lengths
identical to the character. Root and `output/index.html` are byte-identical, `output/_headers` is
present, and `data-dc-script` appears exactly once.

**One thing could not be measured, and it is worth recording why.** The shell input's only focus
indicator is now the native text caret. Headless Chrome does not composite the caret into
`Page.captureScreenshot` — proven with a minimal control page that also yielded zero caret-coloured
pixels — so the pixel evidence is inconclusive *by construction*, not negative. What could be measured
passed: under `prefers-reduced-motion: reduce` the focused input reports `caret-color: rgb(127,200,169)`,
`animationName: none`, `visibility: visible`, `opacity: 1`, confirming that the reduced-motion rule
which freezes the decorative `data-caret` blocks does not touch the native caret. The remaining gap was
closed by eye in a headed browser: the caret is visible.

### Byte budget

**137.4 KB gzipped on first view against a 150 KB ceiling — 12.6 KB of headroom**, measured from the
eight resources requested before any scroll. The review passes cost 7.5 KB of the headroom.

| Resource | raw | gz | |
|---|---|---|---|
| `index.html` | 110,287 | 27,587 | +6,153 |
| `react-dom.js` | 131,835 | 42,897 | |
| `jetbrains-mono-latin.woff2` | 31,340 | 31,395 (raw counted) | |
| `dc-runtime.js` | 69,150 | 19,017 | |
| `marcin.webp` | 11,592 | 11,627 (raw counted) | |
| `react.js` | 10,751 | 4,272 | |
| `page.css` | 7,787 | 3,229 | +1,772 |
| `fonts.css` | 2,061 | 809 | −134 |

Leaflet's 45,961 B is what moved: deferring it is what brings 168.8 KB back under the ceiling.
`index.html` itself grew 16.1 → 21.4 KB gz, from the larger `app.js`, the JSON-LD block and the ARIA
attributes.

### Known and accepted

- ~~**A 5 px internal overflow inside `~/career` at 320 px.**~~ Gone. It was contained anyway, but the
  follow-up pass — short dates below 560 px and an 8 px column gap — removed it: the section and the
  grid both report `scrollWidth 292` against `clientWidth 292` at a 320 px viewport.
- **Forward Tab does not leave the shell input while it holds text.** `keyDown` intercepts Tab whenever
  the line is non-empty, which is what a real shell does. WCAG 2.1.2 is satisfied by three other exits:
  Shift+Tab, Escape, and Tab on an empty line. Deliberate.
- **`mail` produces one browser-generated log line** (`Launched external handler for 'mailto:…'`). Chrome
  emits it, not the page.
- **On one cold load with an empty cache, the five self-directed HEAD probes aborted** and were handled
  silently by the existing `.catch()`. Every subsequent load reported `5 packets transmitted, 5 received`.
