# Three directions — Phase 3

Deliverable of Phase 3 of `docs/BRIEF.md`. Three prototypes in `prototypes/`, built on real content,
measured in Chrome at 390 and 1440 px in both themes. Nothing here is production code.

| | |
|---|---|
| `prototypes/a-marginalia.html` | Evolution of the current site |
| `prototypes/b-topology.html` | The work drawn, not described |
| `prototypes/c-dossier.html` | A document a recruiter can print |

All three carry the same facts, decided in Phase 2: the title *Senior Cloud Platform Engineer*, three
case studies, the public artefacts, the timeline back to 2019, education, all ten certifications with the
lapsed one marked, and the photo. Zero third-party requests, no web fonts, one HTML file each.

---

## What was measured

Chrome via Playwright, device pixel ratio 2, both themes, axe-core across `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`.

| | A — Marginalia | B — Topology | C — Dossier |
|---|---|---|---|
| Transfer, gzipped | **9.8 KB** | 10.5 KB | 14.0 KB |
| …of which the photo | 3.9 KB | 3.9 KB | 8.7 KB (larger crop) |
| JavaScript | 764 B | 764 B | 764 B |
| Page height at 1440 | 3861 px | 5759 px | **2289 px** |
| Page height at 390 | 5069 px | 6413 px | **4042 px** |
| Horizontal overflow | none | none | none |
| axe violations | **0** | **0** | **0** |
| Console errors | 0 | 0 | 0 |

Budget from the brief is 150 KB first view and 20 KB of JavaScript. All three clear it by an order of
magnitude, so **performance does not decide this** — it is decided by what a reader gets in 30 seconds.

Page height is the closest proxy for that, and C is **40% shorter than A and 60% shorter than B** at
desktop width.

---

## A — Marginalia

*Evolution of what exists. The label hangs in the margin, prose keeps one measure, hairlines make the grid
visible.*

**Personality.** Editorial, understated, a printed notebook. Unmistakably the same site as today.

**Information architecture.** Linear, one section per subject, each introduced by a margin label:
selected work → in the open → stack → experience → certifications → off the clock → colophon. The photo
hangs in the margin column of the masthead, which is the one genuinely new idea in this direction.

**What changed from today.** The sticky scroll-assembled stack is gone. On the live site it spends about
40% of the desktop scroll on empty space to deliver three lines of tool names — a cost the audit measured
and that a 30-second reader pays first.

**Effort.** Lowest. The CSS is a direct descendant of the current file; most of the work is content.

**Risk.** It keeps the typographic habits the audit flagged: tracked-out capitals as labels, meta strings
joined with middle dots, a monospace face for every small label, an arrow glued to outbound links. Those
are exactly the traits that read as generic on a personal engineering site in 2026 — the page is
well-made, and it looks like several thousand other well-made pages.

---

## B — Topology

*The work is systems, so the page draws them. Colour appears only inside the drawings; everything else is
monochrome.*

**Personality.** An engineer showing a whiteboard. Confident, technical, slightly cold.

**Information architecture.** Each piece of work opens with its diagram, then explains it: shape first,
prose second. That inversion is the whole idea — you understand the interconnect before you read a word
about it. Numbers appear in exactly one place, the four provisioning steps, because that is the only
content that is genuinely a sequence.

**What it proves that words cannot.** Diagram 2 is the argument for the strongest piece of work: the
policy decision sits *inside* the proxy, and the alternative — calling out to a policy service — is drawn
greyed out and dashed, off the path. A recruiter skips it; a hiring engineer stops.

**Effort.** Highest. Three hand-drawn SVGs are a day's careful work, and — see below — each needs a second
version.

**Risk, measured.** At 390 px the diagrams scale to the viewport width and their labels become
illegible. Confirmed in the 390 px capture. Production would need a stacked variant of every diagram below
about 40 rem, roughly doubling the drawing work. It is also the longest page of the three, which fights
the 30-second brief.

---

## C — Dossier

*A persistent rail carries identity and contact; the reading column carries the work. The whole thing sits
on one sheet and prints as a one-page CV.*

**Personality.** Prepared. It reads like a document that already exists rather than a page that was
designed.

**Information architecture.** Two columns on desktop. The rail — photo, name, title, location, contact,
certifications, languages — stays on screen while the work scrolls past it, so the reader never has to
scroll back to find the email address. Below 60 rem the rail becomes a header block.

**Typography.** A serif for the reading column and a sans for the rail — the inverse of A, which sets its
display in serif and its prose in sans. Serif body at a 36 rem measure is unusual on an engineer's site and
is what makes it read as a document rather than a portfolio.

**Print is a first-class output.** `@media print` collapses the sheet to a 14 mm-margin page, drops the
chrome, forces black on white and keeps sections off page breaks. Recruiters print and attach; this
direction plans for it instead of tolerating it.

**Effort.** Middle. No drawings, but the print sheet, the rail behaviour and the two-column collapse each
need real testing.

**Risk.** The rail leaves a large empty area on the left below 1200 px of content — visible in the 1440 px
capture. And a document-shaped page is a quieter thing: it does not have a single memorable image the way
B does.

---

## Recommendation

**C as the spine, with B's drawings grafted into the case studies.**

The brief's job is 30 seconds of a recruiter's attention plus enough substance to survive a hiring
engineer's second look. C wins the first — measurably: identity is permanently on screen, the page is 40%
shorter than A, and it prints. B wins the second, and it wins it with one asset: the drawings say *this
person designs systems* faster than any paragraph can.

Concretely: C's rail, sheet, serif reading column and print sheet, and one drawing above each of the three
case studies, with a stacked variant below 40 rem. That is C's effort plus B's drawing work, and it drops
nothing that either direction does well.

**A is the fallback** if the drawings turn out not to be worth their cost. It is the cheapest path to a
truthful, complete site — but it buys no distinctiveness, and the current page is already the thing it
would become.

What survives from the Keep list either way: the voice, one page, system fonts, the token-driven theme,
no trackers. What does not survive: the sticky scroll-assembled stack, in any direction. It is the most
distinctive thing on the current site and the least likely to be seen.

---

## Stack — evolve, with one small build step

**Do not adopt a framework.** The baseline is a 6.8 KB hand-written document that scores 100 on desktop
performance with zero dependencies. Astro or Eleventy would each pull in a few hundred transitive packages
to render one page that has no routing, no components worth reusing and no content collection. That is not
a trade that pays here.

**But zero build no longer holds either**, for three reasons the audit found:

1. `index.html`, `output/index.html` and `README.md` are three hand-maintained copies of the same content.
   Nothing enforces that they agree.
2. The photo needs AVIF, WebP and JPEG at two sizes, plus an Open Graph image. That is a build.
3. Certification data has an authoritative machine-readable source (Credly's public API) and is currently
   transcribed by hand — which is how an expired badge stayed on the site for four years.

**Proposal:** one `content.json` as the single source of truth, one `build.mjs` of roughly 150 lines that
renders `dist/index.html` and `README.md` from it and generates the image variants with `sharp`. One
runtime dependency. Cloudflare Pages build command `node build.mjs`, output directory `dist/` — which also
retires the `output/` duplicate.

If even that is too much, the fallback is honest: stay hand-written, accept that README and page drift,
and add a CI check that fails when they do.

---

## Content wording that needs Marcin's sign-off before this branch is pushed

The case studies are written at the NDA level agreed in Phase 2 — real architecture and technology, scale
generalised to orders of magnitude. Nothing internal is named. Specifically:

| Written as | Instead of |
|---|---|
| "hundreds of applications" | the exact application count |
| "a two-region Kubernetes deployment" | the cluster count and its share of the estate |
| "a measurable latency improvement" | the measured percentage |
| "geo-redundant failover" | the availability target |
| "the second public cloud" | the provider's name |
| "one other engineer, whom I mentored" | names |

Dropped entirely: pull request and ticket counts, every currency figure, perimeter and workspace counts,
policy counts, and every internal system name.

**These are prototypes in a public repository.** They are committed but not pushed until Marcin has read
the three case studies word by word.
