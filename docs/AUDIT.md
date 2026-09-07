# Audit — mozolewski.eu

Phase 1 deliverable of `docs/BRIEF.md`. Branch `redesign/2026`. Measured 2026-09-07.

**Method.** Live site probed with `curl` (headers, DNS, path behaviour), Lighthouse CLI 12.x against
`https://mozolewski.eu` (mobile default preset = simulated slow 4G + Moto G Power; and `--preset=desktop`),
Playwright driving the locally installed Chrome for 11 viewports × 2 themes with axe-core 4.x, and a read of
this repository plus a separately-held private content inventory (§8.1). Raw artefacts (Lighthouse JSON,
22 screenshots, `report.json`) are in the session scratchpad, not committed — see §12.

**Not done: the Chrome extension.** `tabs_context_mcp` reports *"Browser extension is not connected"*, so the
interactive Chrome checks the brief asks for in Phase 0/1 could not run. Everything the brief wanted from them
(screenshots at every width, both themes, console errors, third-party request inventory) was obtained instead
from Playwright + Lighthouse, which drive the same Chrome build headlessly. The interactive pass is worth
repeating once `/chrome` connects — mainly to confirm scroll behaviour of the sticky stack, which a
screenshot cannot show.

---

## 1. Executive summary

Ranked by how much they matter.

| # | Finding | Where |
|---|---|---|
| 1 | **The footer claims "No trackers, no cookies". Today that is false.** Cloudflare Web Analytics (`beacon.min.js`) is injected at the edge, and two third-party images set cookies (`__cf_bm` from stackoverflow.com, `zipzn` from the Spotify widget host). | §4, §6 |
| 2 | **380 KB of the 431 KB page is three certification badges.** The `size/110x110/` Credly URLs 302-redirect to full-size originals; the largest is 229 KB for a 46×46 px slot. This alone puts the page ~2.9× over the brief's 150 KB budget and is most of mobile LCP. | §5, §6 |
| 3 | **Rocket Loader defeats the anti-flash theme script.** The edge rewrites the `<head>` script to `type="6dc2c8…-text/javascript"`, so the stored theme is applied *after* Rocket Loader runs, not before first paint. Only on the custom domain — `marcjanek.pages.dev` is clean. | §4 |
| 4 | **Every unknown path returns HTTP 200 with the homepage.** No `404.html`, so Pages falls back to `index.html`. `/robots.txt` and `/favicon.ico` return HTML — which is exactly why Lighthouse SEO scores 92. Soft 404s for anything a crawler guesses. | §4, §7 |
| 5 | **No security headers at all.** No CSP, HSTS, Permissions-Policy or X-Frame-Options. Only the two Pages defaults (`x-content-type-options`, `referrer-policy`). No `_headers` file exists. | §4 |
| 6 | **The site shows 3 of 8 certifications, and one of the 3 expired in January 2022.** Credly's public API lists five 2025 GitHub certifications that the site never mentions. | §8.2 |
| 7 | **No "selected work" at all.** A recruiter learns the tools but not one thing built with them. This is the brief's stated biggest gap and it is confirmed. Source material exists in a private personal repository; how much of it may be published is a Phase 2 decision. | §8, §9 |
| 8 | **Two live copies of the site.** Cloudflare Pages serves `output/index.html` at mozolewski.eu; GitHub Pages *is* enabled and serves the root `index.html` at `marcjanek.github.io/marcjanek/`. The project's `CLAUDE.md` stated Pages was disabled — that check tested the wrong URL. | §3 |

What is already good and should not be lost is in §10.

---

## 2. Repository and stack

```
marcjanek/marcjanek        public, created 2024-03-02, default branch main
├── index.html             18 254 B  hand-written, self-contained (inline CSS + JS)
├── output/index.html      18 254 B  byte-identical copy
├── README.md               3 204 B  GitHub profile page
├── LICENSE                 1 074 B  MIT
└── .gitignore                       .idea/, .DS_Store, CLAUDE.md
```

`CLAUDE.md` used to be tracked here; on this branch it is untracked and gitignored — project guidance is
kept locally, out of the public repo. Its previous content remains in git history from commit `730e747`.

- **No build step, no package manager, no dependencies, no CI, no tests, no linter.** Two HTML files kept in
  sync by hand (`cmp index.html output/index.html` currently passes).
- **Everything is hand-written.** Nothing is generated. `README.md` is a manual flattening of `index.html`.
- **One open issue:** #2 "Coursera course network" (2024-03-30, empty body) — a stale personal note, not a
  backlog.
- **`index.html` internals:** one `<style>` block (~330 lines) driven entirely by custom properties on
  `:root`; one 6-line pre-paint theme script in `<head>`; one 30-line theme-toggle script before `</body>`.
  Total JS ≈ 1.5 KB uncompressed. Layout is a two-column marginalia grid (`--label-col` + `--measure`) that
  collapses to one column below `52rem`; the middle of the page is three `position: sticky` layers that
  assemble into a stack on scroll and are switched to `position: static` below `52rem` and under
  `prefers-reduced-motion`.

**Fragile points.**

1. The two HTML files can silently diverge — nothing enforces `cmp`.
2. `README.md` can silently diverge from both — it is a third hand-maintained copy of the same content.
3. Every image is hot-linked to a third party (§6); two are already broken upstream.
4. The `onerror` that hides the Spotify row races `loading="lazy"`: until the image is scrolled into view no
   request is made, so the row renders as an empty bordered box. Visible in the 1440 px capture — the row is
   present and empty; at 390 px the error had landed and the row was gone.

**The baseline any proposed tooling must beat:** zero dependencies, zero build, edit-one-file deploys, and
a 6.8 KB HTML document that scores 100/100 on desktop performance. That is a high bar for a static one-pager,
and it is the reason to be sceptical of a framework here.

---

## 3. Hosting and deploy — resolved

The brief and the project's `CLAUDE.md` both left this open. It is now settled by observation.

| Question | Answer | Evidence |
|---|---|---|
| What serves mozolewski.eu? | **Cloudflare Pages**, project `marcjanek.pages.dev` | `Server: cloudflare`; `marcjanek.pages.dev` returns the same document; both inject the same `data-cf-beacon` token `8861fe9f…` labelled `<!-- Cloudflare Pages Analytics -->` |
| Which directory is the Pages build output? | **`output/`** | `/README.md` and `/LICENSE` are *not* served as assets — they return the HTML fallback with `Content-Type: text/html`. If the repo root were the deploy root they would be served as files. |
| Is GitHub Pages disabled? | **No — it is enabled and building** | `gh api repos/marcjanek/marcjanek/pages` → `"status":"built"`, `"source":{"branch":"main","path":"/"}`, `"cname":null`; `https://marcjanek.github.io/marcjanek/` returns 200 with `Content-Length: 18254`. `CLAUDE.md`'s check hit `marcjanek.github.io`, which is the *user site* URL and does not exist for a repo named `marcjanek`. |
| Where is the DNS? | Cloudflare (`vera`/`damian.ns.cloudflare.com`), A/AAAA proxied | `dig` |
| Is `www` configured? | No — `www.mozolewski.eu` does not resolve | `curl` |

**So both files are live, on two different hosts.** `index.html` → GitHub Pages, `output/index.html` →
Cloudflare Pages. They are identical, so nothing is visibly wrong today; but "edit both" is a load-bearing
rule, not redundancy. `git log` shows `output/index.html` has received every content commit since `6791725`,
and root `index.html` has received all but the first — they have been maintained in parallel by hand.

Related: a second Pages project, `rysinder`, already serves `rysinder.mozolewski.eu` from the same zone by
`wrangler pages deploy` direct upload. So the account already has a working Pages + custom-domain setup, and
Marcin has hands-on experience with it.

**Recommendation (for Phase 4, not now):** keep one artefact. Either delete `output/` and point the Pages
project at the repo root, or delete the root copy and keep `output/` as the build output. Disable GitHub Pages
either way — it is an unmaintained third surface. Both copies already carry
`<link rel="canonical" href="https://mozolewski.eu/">`, so there is no live SEO damage, only drift risk.

---

## 4. Edge configuration (Cloudflare)

Read out of the response, without dashboard access. The delta between `mozolewski.eu` and
`marcjanek.pages.dev` isolates zone settings from project settings.

| Setting | State | How it shows | Verdict |
|---|---|---|---|
| **Web Analytics** | **ON, project-level** | `<!-- Cloudflare Pages Analytics -->` + `beacon.min.js` on *both* hostnames; a `/cdn-cgi/rum?` XHR fires on load | Contradicts the footer's privacy claim. Marcin's call in Phase 2 — but the claim and the beacon cannot both stay. |
| **Rocket Loader** | **ON, zone-level** | `<script type="6dc2c8372f6eaf9b4ab5ea8f-text/javascript">` rewrites; `rocket-loader.min.js` injected twice (4.3 KB) | Must be off. It defers the pre-paint theme script, which is the one script on the page that must *not* be deferred. |
| **Email Address Obfuscation** | **ON, zone-level** | `mailto:` replaced by `/cdn-cgi/l/email-protection#…` + `email-decode.min.js` (0.9 KB) | The address is no longer plain text or copyable without JS. Contradicts brief §4. Decide: off + plain text, or keep and allow it in CSP. |
| **Speed Brain / speculation rules** | ON | `Speculation-Rules: "/cdn-cgi/speculation"` header + a 0.5 KB fetch | Harmless here; note it in the CSP work. |
| **Brotli / HTTP/3** | On | `alt-svc: h3=":443"`; 19 153 B → 5 917 B over the wire | Fine. |
| **HSTS** | **Off** | no `Strict-Transport-Security` | Add. (GitHub Pages sends one; Cloudflare does not.) |
| **CSP / Permissions-Policy / X-Frame-Options** | **Absent** | header grep returns 0 | No `_headers` file exists. Phase 4 work. |
| **404 handling** | **SPA fallback** | `/nonexistent-xyz`, `/robots.txt`, `/favicon.ico`, `/README.md` all → 200 + the homepage | Add a real `404.html`, a `robots.txt` and a `favicon`. |
| Cache | `public, max-age=0, must-revalidate` on HTML | correct for an unhashed document | Needs long-lived immutable headers once there are hashed assets. |

None of these can be changed from the repo except the last three; the first four are dashboard settings.
The brief's "configuration as files" goal only reaches so far — Rocket Loader, email obfuscation and Web
Analytics are zone/project switches.

---

## 5. Measurements — the "before" numbers

### 5.1 Lighthouse (CLI, against the live URL)

| Category | Mobile | Desktop | Budget (§2) |
|---|---|---|---|
| Performance | **99** | **100** | ≥95, target 100 |
| Accessibility | **100** | **100** | ≥95 |
| Best Practices | **73** | **73** | ≥95 ❌ |
| SEO | **92** | **92** | ≥95 ❌ |

| Metric | Mobile | Desktop | Budget |
|---|---|---|---|
| FCP | 1.6 s | 0.5 s | — |
| **LCP** | **1.9 s** | 0.5 s | ≤1.2 s ❌ |
| TBT | 0 ms | 0 ms | — |
| CLS | 0 | 0.006 | <0.05 ✅ |
| Speed Index | 1.6 s | 0.5 s | — |
| **Total transfer** | **422 KiB** | **431 KiB** | ≤150 KB ❌ |
| Requests | 17 | 18 | — |

Best Practices 73 is caused by exactly three audits, all third-party: `third-party-cookies`
(`__cf_bm` from stackoverflow.com, `zipzn` from the Spotify host), `errors-in-console` (the Spotify image
returns **400 Bad Request**), and `inspector-issues` (the same cookies). SEO 92 is the invalid `robots.txt`
— i.e. the SPA fallback returning HTML.

Performance passes only because the document itself is 6.8 KB and there is no blocking CSS or JS. The 380 KB
of badge images are below the fold and lazy, so they miss LCP on desktop but not the byte budget.

### 5.2 Accessibility

**axe-core: 0 violations** at 390 px and 1280 px, light and dark, across `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa`. Lighthouse a11y 100 on both form factors. The current page is genuinely accessible —
landmarks, one `h1`, labelled toggle, visible focus rings, `alt` on every image, `lang="en"`.

One gap against the brief's *stricter-than-WCAG* rule: **touch targets**. 11 links measure 20–26 px high
(the five masthead links at 26 px; the three certification links at 20 px). WCAG 2.2 AA asks for 24×24 CSS px
with a spacing exception, so the 20 px certification links are the ones at real risk; the brief's own
requirement is ≥44 px, which none of them meet.

Missing regardless of axe: **no skip link** (brief §2 requires one).

### 5.3 Responsive matrix

11 viewports × 2 themes, full-page captures, Chrome via Playwright at DPR 2:
320×800, 360×800, 390×844, 412×915, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, 1920×1080, and
844×390 (phone landscape).

- **Horizontal overflow: none.** `documentElement.scrollWidth − clientWidth = 0` everywhere, and no single
  element has `scrollWidth > clientWidth`. The `.name` fix recorded in `CLAUDE.md` holds.
- **Page height** grows from 1903 px (768 px wide) to 2912 px (1920 px wide) — the page gets *taller* as the
  window gets wider, because the sticky stack reserves `min-height: 40vh` per layer plus a `38vh` hold. On a
  1440×900 desktop roughly 40% of the scroll length is deliberate empty space. It reads as intentional
  pacing while scrolling; as raw page length for a reader in a hurry, it is expensive. See §9.
- Both themes render identically in layout; only tokens change.

### 5.4 Screenshots

22 PNGs in the scratchpad (`shots/{light,dark}-{w}x{h}.png`, 7.5 MB total). They are not committed —
Phase 4 should decide whether screenshot artefacts belong in the repo or only in CI. Two are attached to the
Phase 1 report message.

---

## 6. Third-party request inventory

Everything the page loads, from the Lighthouse desktop trace. Nothing is vendored; nothing is same-origin
except the document and Cloudflare's own injections.

| Host | What | Transfer | Blocking | Privacy | Verdict |
|---|---|---|---|---|---|
| `images.credly.com` | 3 badge images | **380 KB** (229.7 + 97.1 + 53.3) | no (lazy) | IP logged | **Self-host.** The `size/110x110/` URLs 302 to full-size originals — the resize parameter does nothing. Three optimised 46 px AVIF/WebP files would be well under 10 KB total. |
| `static.cloudflareinsights.com` | Web Analytics beacon | 20.7 KB (**fetched twice**) | deferred | RUM telemetry | Off, or disclose. It is injected at the edge, not by the repo. |
| `mozolewski.eu/cdn-cgi/*` | rocket-loader, email-decode, speculation, rum | 6.0 KB | **rocket-loader is** | first-party | Remove the first two by turning the zone settings off. |
| `stackoverflow.com` | flair PNG | 18.3 KB (**fetched twice** — once per theme variant) | no | **sets `__cf_bm` cookie** | Replace with text + link. Reputation is 81 with 5 bronze badges — the image advertises a small number in a large box. |
| `komarev.com` | view counter | 1.2 KB | no | third-party counter, **unsized** (only CLS source) | Drop. It is a tracker sitting one line above "No trackers". |
| `spotify-github-profile.kittinanx.com` | now-playing image | — | no | **sets `zipzn` cookie** | **Broken: HTTP 400** (`Invalid Spotify access_token or refresh_token`, per `CLAUDE.md`). Marcin's call in Phase 2. |

Two of the six hosts set cookies. Five of the six can be removed outright or self-hosted. Doing so takes the
page to ~10–20 KB first view, zero third-party requests, and Best Practices 100 — most of the brief's
performance and privacy budget is one afternoon of work on the *content*, independent of any redesign.

---

## 7. SEO and metadata

Present: `<title>`, `description`, `canonical`, `og:type/title/description/url`, two `theme-color` variants,
`lang="en"`, `color-scheme`.

Missing:

- **`og:image`** — no image at all, so every LinkedIn/Slack/WhatsApp share of the domain renders as a bare
  text link. For a page whose job is to be sent to recruiters, this is the highest-value SEO item.
- **Twitter/X card tags** — `summary_large_image` would reuse the same asset.
- **JSON-LD `Person`** with `sameAs` → GitHub, LinkedIn, Stack Overflow, Credly. The brief asks for it; it is
  also what makes a name search render as an entity rather than a blue link.
- **`robots.txt`** and **`sitemap.xml`** — currently `robots.txt` returns HTML (see §4), which is the entire
  SEO score gap.
- **`favicon`** — `/favicon.ico` returns the homepage HTML; browsers show the default glyph.
- **No `404.html`.**

---

## 8. Content inventory

### 8.1 Where the source material lives — and why it is not here

**This repository is public.** The bulk of the material a redesign would draw on sits in a private personal
knowledge repository and cannot be reproduced here in any form, including as summary or citation. The full
content inventory therefore lives outside this repo, in that private repository, under a project of its own.
This section carries only what is verifiable from **public sources**: the current site, the GitHub API,
Credly's public API and the Stack Exchange API.

That split is a standing rule for this project, not a one-off: `docs/` in this repository stays free of
anything sourced privately, and the private inventory is where facts, figures and citations are kept.

### 8.2 Public sources read

| Source | What it gives |
|---|---|
| `index.html`, `README.md` (this repo) | The claims the site makes today |
| GitHub API `users/marcjanek` | 6 public repos, 4 followers, company `@procter-gamble`, location Warsaw, blog mozolewski.eu, account since 2018-03-06 |
| GitHub API `repos/envoyproxy/envoy/pulls/44098` | An upstream pull request: `proxy_protocol: add HEX_STRING format for TLV values`, +336/−10 across 7 files, opened 2026-03-24, **closed without merge** |
| Credly public API | **8 certifications, with issue and expiry dates** — see below |
| Stack Exchange API | reputation 81, 5 bronze badges, account since April 2020 |

Public repositories: `terraform-provider-algorithm` (Go, a Terraform provider, last touched 2025-04-14, no
description); `Naive-Bayes-email-filter` and `discrete-knapsack-problem` (Java, 2019–2020); `MIPS` (assembly,
2019); this repo. A side project, `rysinder`, is live at `rysinder.mozolewski.eu` but its source repository
is private.

### 8.3 Certifications — the authoritative list

| Certification | Issuer | Issued | Expires | On the site? |
|---|---|---|---|---|
| GitHub Actions | GitHub | 2025-06-30 | 2028-06-30 | no |
| GitHub Advanced Security | GitHub | 2025-06-29 | 2028-06-29 | no |
| GitHub Administration | GitHub | 2025-06-24 | 2029-06-24 | no |
| GitHub Copilot | GitHub | 2025-06-21 | 2028-06-21 | no |
| GitHub Foundations | GitHub | 2025-06-19 | 2028-06-19 | no |
| HashiCorp Certified: Terraform Associate (003) | IBM Professional Certification | 2024-12-29 | 2026-12-29 | yes |
| Associate Cloud Engineer | Google Cloud | 2024-09-22 | 2027-09-22 | yes |
| OCI Foundations 2020 Associate | Oracle | 2020-07-17 | **2022-01-17 (expired)** | yes |

This supersedes the note in the old `CLAUDE.md` that certification dates are recorded nowhere: they are
public, dated and machine-readable at `credly.com/users/marcin-mozolewski/badges` (send `Accept:
application/json`). Two consequences — the site shows an expired badge and hides five current ones, and the
Terraform Associate expires 2026-12-29, within four months of this audit.

### 8.4 Claims on the site that need confirmation

Each of these is a factual claim the site makes that cannot be verified from any public source, and that the
private inventory either contradicts or does not support.

| Site says | Problem | Action |
|---|---|---|
| "Cloud engineer" | The job title recruiters will read is a positioning decision, and the current one understates the last two years of work | Marcin picks the title. |
| "three years of it commercially, and five before that teaching myself" | A hard-coded count that goes stale every year and is already drifting | Restate as a start year, or accept an annual edit. |
| "Kubernetes · Docker / Terraform · Ansible / GCP · Azure · AWS · OCI", "Four providers in daily use" | The strongest evidence points at one provider being the daily one; **Ansible has no supporting evidence at all** | The weakest factual claim on the page. Confirm or rewrite. |
| Three certifications | Eight exist; one shown is expired | Refresh from Credly (§8.3). |
| "No trackers, no cookies" | Measurably false today (§4, §6) | Make it true, or delete the sentence. |
| No languages, no projects, no dates, no employer history | The single biggest content gap | §8.5. |

Not available from any source, public or private: education, employment dates, spoken languages, a CV, a
photo, remote/relocation stance, any talk or article. If the redesign needs them, Marcin has to supply them.

### 8.5 The "selected work" problem

The brief's §4 asks for 3–5 pieces as *problem → what I built → outcome/scale*. The material is strong and
almost all of it is employer-internal. Three levels are available, and the choice is Marcin's, not Claude's:

1. **Abstract capability statements.** No system names, no numbers, no employer specifics. Safe; also the
   least differentiated.
2. **Named-technology case studies with order-of-magnitude scale.** Real architecture, real technology
   choices, real trade-offs; quantities generalised. This is what most senior engineers publish and what
   would actually move a recruiter.
3. **Public artefacts only.** The Envoy pull request, `terraform-provider-algorithm`, `rysinder`. Fully
   verifiable — and much smaller than the real work.

A mix of 2 and 3 is the recommendation, subject to Marcin's reading of his employment agreement. Nothing gets
written until he answers.

## 9. Recruiter lens — 30 seconds on the current site

**What lands.** The name, in a serif at 4.5 rem — confident and legible. Role, employer, country in one mono
line. A four-line bio in the first person that says something specific ("more providers than any one job
needs") instead of "passionate about cloud". Five contact links immediately under it. Nothing to dismiss, no
buzzwords, no photo-and-hero-gradient template. A recruiter can tell within two seconds that the person
built this themselves.

**What they cannot learn.** What he has actually built. There is not one project, one system, one outcome,
one number, one date, one employer other than the current one, and not one programming language. The middle
of the page is a taxonomy of tools — true, well-designed, and interchangeable with several thousand other
cloud engineers. "Terraform · Ansible" tells a recruiter what to type into a keyword filter; it does not tell
a hiring manager what to talk to him about.

**What would make them close the tab.** Nothing outright — but three things cost credibility on inspection:
an expired 2020 certification displayed as current; a Stack Overflow flair advertising reputation 81; and a
page-view counter directly above the sentence "No trackers, no cookies". Each is small; together they read as
"assembled from GitHub-profile widgets", which is at odds with the rest of the craft on the page.

**On the scroll-assembled stack.** It is the most distinctive thing on the site and the thing a recruiter is
least likely to see. It only exists above 52 rem, it needs deliberate scrolling to read, and it makes the
desktop page ~40% empty space to deliver three lines of tool names. Judged as an interaction it is
well-executed; judged as 30 seconds of a hiring manager's attention it spends the most screen real estate on
the least differentiating content. This is the central tension the Phase 3 visions have to resolve.

---

## 10. Keep list

Things the redesign must not throw away, with reasons.

1. **The voice.** First person, plain, no adjectives. `README.md` and `index.html` both have it. This is the
   hardest thing to rebuild and the easiest to lose.
2. **The privacy stance** — but made true rather than asserted. Once the six third parties are gone, the
   footer line is a verifiable claim and a differentiator for a platform engineer.
3. **System fonts, no webfonts.** Three roles (serif/sans/mono), zero network requests, zero FOUT. Nothing to
   improve here.
4. **The token-driven theme.** Light on bare `:root`, dark duplicated under both the media query and
   `[data-theme]`, applied pre-paint. The pattern is right; only Rocket Loader breaks it.
5. **One page, one scroll.** Brevity is a feature for this audience. Resist the multi-page portfolio.
6. **The marginalia grid** — mono labels hanging in the left margin, hairlines making the grid visible,
   one measure of prose. It is the page's identity and it degrades cleanly to eyebrows on phones.
7. **The layered stack *model*** (Workload → Platform → Providers → Constants) as an *idea*. It says more than
   a tag cloud. Whether it keeps its current sticky-scroll *implementation* is an open question (§9).
8. **Self-contained single file.** Inline CSS and JS, no external assets, no build. Whatever replaces it
   should have to justify every dependency against this.

---

## 11. What Phase 2 will have to ask

Listed so the STOP gate is a decision point, not a surprise. Full list with recommended defaults comes next.

1. NDA boundary for "selected work": which of the three levels in §8.5?
2. Does `docs/BRIEF.md` belong in this repo, or with the private inventory?
3. The Spotify widget, the view counter, the Stack Overflow flair — keep, self-host, or drop?
4. Web Analytics beacon: turn it off, or keep it and rewrite the footer line?
5. Job title and the "three years / four providers" claims — confirm or restate.
6. Certifications: show all 8? drop the expired one? group the five GitHub ones?
7. Availability / open-to-work / relocation stance — state or omit?
8. CV as a PDF — existing file, generated, or none?
9. Photo — yes or no?
10. Who owns the Cloudflare settings changes (Rocket Loader, email obfuscation, analytics) — Marcin by hand,
    or a read-only token plus a written list?

---

## 12. Artefacts

In the session scratchpad (`…/scratchpad/audit/`), not committed:

- `lh-mobile.json`, `lh-desktop.json` — full Lighthouse reports, the "before" numbers of §5.1.
- `shots/` — 22 full-page PNGs, 11 widths × 2 themes.
- `shots/report.json` — per-viewport overflow, page height, touch-target and axe data.
- `probe.mjs` — the Playwright + axe script that produced them. A cleaned-up version becomes
  `scripts/screenshots.mjs` in Phase 4/5.
The private content inventory (§8.1) is held outside this repository.
