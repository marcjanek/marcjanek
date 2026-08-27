# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`marcjanek/marcjanek` — a GitHub *profile* repository. Because the repo name matches the username, `README.md` is rendered by GitHub on the user's profile page. The same repo is the source for the personal site at **mozolewski.eu**.

There is no application code, no package manager, no test suite, and no linter. It is hand-written HTML and Markdown.

## Two targets, two artifacts, one identity

The profile page and the website cannot be the same file, because **GitHub sanitizes README markup**: it strips `<style>`, `class`, `id`, and `<script>`. Custom CSS is impossible on the profile. So the same content is expressed twice, deliberately:

| File | Consumed by | What it may use |
|---|---|---|
| `index.html` | mozolewski.eu | Anything. Self-contained: inline `<style>`, inline `<script>`, no external CSS/JS |
| `output/index.html` | Cloudflare Pages (see below) | Byte-identical copy of `index.html` |
| `README.md` | GitHub profile page | Markdown plus only `<a>`, `<img>`, `<picture>`, `<source>` — no CSS |

When content changes, change all three and keep the two HTML files identical (`cmp index.html output/index.html`). The shared visual language is carried by restraint and hierarchy, not by shared code.

## Deploy: Cloudflare Pages, not GitHub Pages

Verified from outside: `mozolewski.eu` answers with `Server: cloudflare`, `Access-Control-Allow-Origin: *`, and a `Speculation-Rules: "/cdn-cgi/speculation"` header, and its nameservers are Cloudflare. Meanwhile `https://marcjanek.github.io` returns **404**, so GitHub Pages is disabled for this repo. The in-repo Jekyll Pages workflow was deleted in `9770824`.

**`output/` is probably the Cloudflare Pages *build output directory*.** It received the newest content commit (`bc3c5aa`) while root `index.html` was only ever created (`6464a1b`). Because the two files are byte-identical you cannot tell from the repo alone which one is served — so **edit both** until someone confirms the setting in the Cloudflare dashboard. Once confirmed, delete the duplicate.

`CNAME` was deleted in `a6c286f`, consistent with the move off GitHub Pages — `CNAME` is a GitHub Pages mechanism and does nothing for Cloudflare Pages. Do not restore it to "fix" the custom domain.

## Design system (index.html)

Single-column editorial layout. All decisions live in CSS custom properties on `:root`; change tokens, not rules.

- **Marginalia grid.** Every `.row` is `grid-template-columns: var(--label-col) minmax(0, var(--measure))`. A mono uppercase `.label` hangs in the left margin, prose keeps one measure in column 2. Because each row's `border-top` spans its own grid, the hairlines make the grid visible. Below `52rem` the template collapses to one column and labels become eyebrows.
- **Three type roles, zero webfonts:** `--serif` for the name and lead paragraph, `--sans` for body, `--mono` for labels and meta. All system stacks, so there is no network request and no FOUT.
- **Theme.** Light tokens on bare `:root`; dark tokens duplicated under both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]` so the manual toggle wins in both directions. A tiny script in `<head>` applies the stored choice before first paint to avoid a flash.
- `.name` uses `grid-column: 1 / -1` so it starts at the hairline's left edge instead of overflowing the measure. Do not put `&nbsp;` in it — that blocks wrapping and causes horizontal overflow on phones.

## Third-party images — two are currently broken upstream

Nothing is vendored; every image is hot-linked. Two were already broken before this redesign and are **not repo bugs**:

- **Spotify widget** (`spotify-github-profile.kittinanx.com`) returns `Error: Invalid Spotify access_token or refresh_token`. Fix by re-authorizing at <https://github.com/kittinan/spotify-github-profile>. `index.html` hides the whole "Now playing" row via an `onerror` handler so a failure never shows a broken image; it reappears by itself once the token works.
- **Credly HashiCorp badge**: the old asset id `ed4be915-…/blob` returns **403**. The working id is `0dc62494-dc94-469a-83af-e35309f27356/blob`. If a badge breaks again, fetch the public badge page and read the `images.credly.com` URL out of it.

Others: `komarev.com/ghpvc` (view counter), `stackoverflow.com/users/flair` (re-requested per theme by JS in `index.html`, and via `<picture>` in `README.md`, because it is a raster image with baked-in colours), `images.credly.com`.

## Verifying a change

No test framework. Render locally with headless Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --force-device-scale-factor=2 --window-size=1100,1400 \
  --virtual-time-budget=9000 --screenshot=/tmp/page.png "file://$PWD/index.html"
```

Headless Chrome **clamps its viewport to a 500px minimum**, so `--window-size=390` silently renders at 500 and crops the screenshot — narrow-viewport bugs hide from you. To test phone widths, load the page in an `<iframe width="390">` from a harness page (with `--allow-file-access-from-files`) and read `documentElement.scrollWidth - clientWidth` inside the frame. Note that `getBoundingClientRect()` will not reveal text overflowing a fixed-width box; compare each element's `scrollWidth` against its `clientWidth` instead.

Force a theme for screenshots by injecting `data-theme="light"` / `"dark"` on `<html>` in a temporary copy.

## Facts not to invent

Certification **dates are not recorded anywhere in this repo** — only Credly URLs and names. Do not add years unless the user supplies them. ("2020" in the OCI entry is part of that certification's official name, not an inferred date.)
