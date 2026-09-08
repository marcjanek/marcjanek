class Component extends DCLogic {
    state = {
        now: "", session: "00:00", line: "", hist: [], cmds: [], histIdx: -1,
        vIp: "—", vCity: "—", vNet: "—", vTz: "reading…", vClient: "reading…",
        vRan: false, vFailed: false, hasGeo: null,
        vNote: "# nothing has been sent yet. this asks ipapi.co (Kloudend, Inc., USA) — or ipwho.is if it does not answer — where your IP is, and loads tiles from openstreetmap.org. all three would see it.",
        certLines: [], certTotal: "", certOk: "", certFill: "", certEmpty: "░░░░░░░░░░", certGauge: "",
        rttLine: "pinging…", colo: "", rttShort: "rtt …", svcLines: [], svcNote: "",
        certsOk: false
    };

    // COMMANDS is both what `help` lists and what Tab completes. ALIASES are
    // answered by run() and completable too, but stay out of help so the listing
    // reads as a menu rather than a changelog. Everything run() answers to sits
    // in one of the two lists, so the shell and its own documentation cannot drift.
    SECTIONS = ["whoami", "work", "career", "expertise", "stack", "certs", "visitor", "contact", "shell"];
    COMMANDS = ["cat", "cd", "clear", "date", "echo", "help", "ls", "mail", "neofetch", "ping", "pwd", "systemctl", "uptime", "whoami", "whois", "xdg-open"];
    ALIASES = ["goto", "contact", "ip", "open", "curl", "sudo", "rm", "exit", "logout"];
    PROBING = "probing…";

    // The argument data lives on the instance so run() and complete() read the
    // same tables. Null prototypes on purpose: `cat constructor` and
    // `xdg-open __proto__` must miss rather than resolve through Object.prototype.
    LINK = Object.assign(Object.create(null), {
        github: "https://github.com/marcjanek",
        linkedin: "https://www.linkedin.com/in/marcin-mozolewski",
        stackoverflow: "https://stackoverflow.com/users/13347227/marcin-mozolewski",
        credly: "https://www.credly.com/users/marcin-mozolewski"
    });
    CAT = Object.assign(Object.create(null), {
        "sys-01": "A network foundation shared by two clouds and a data center.\nRedundant interconnect with geo-redundant failover; spokes attach to it without one-off engineering.\ntags: cloud-interconnect cloud-router vpc terraform",
        "sys-02": "Egress policy that runs inside the request, not beside it.\nPer-consumer allow/deny resolved in-process inside the proxy, fail-closed, no round trip.\ntags: envoy rust-wasm go postgresql kubernetes flux",
        "sys-03": "One path for every new project.\nCreation, labeling, perimeter placement, identity federation, multi-environment support — and the API in front of it.\ntags: terraform terraform-cloud google-cloud open-policy-agent"
    });

    // Which commands have a completable argument. Free-text commands (echo) are
    // absent on purpose — Tab must not guess at prose.
    ARGS = Object.assign(Object.create(null), {
        cd: this.SECTIONS,
        goto: this.SECTIONS,
        cat: Object.keys(this.CAT),
        "xdg-open": Object.keys(this.LINK),
        open: Object.keys(this.LINK),
        curl: Object.keys(this.LINK)
    });

    // Bound once. renderVals() runs on every clock tick, so fresh closures here
    // would make React detach and reattach both refs once a second.
    handlers = {
        runWhois: () => this.runWhois(),
        mapRef: (el) => {
            this._map = el;
        },
        inputRef: (el) => {
            this._input = el;
        },
        focusShell: () => {
            if (this._input) this._input.focus();
        },
        onChange: (e) => this.setState({line: e.target.value}),
        onKey: (e) => this.keyDown(e)
    };

    reduced() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    jump(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        window.scrollTo({
            top: el.getBoundingClientRect().top + window.scrollY - 56,
            behavior: this.reduced() ? "auto" : "smooth"
        });
        return true;
    }

    // What date(1) prints: `Tue Sep  8 14:23:11 CEST 2026`. The zone abbreviation
    // is only in CLDR for some locale/zone pairs, so try two and fall back to the
    // numeric offset — which is exactly what date(1) prints when the zone has no
    // abbreviation of its own (`+0530`).
    dateLine(d) {
        const p = (n) => String(n).padStart(2, "0");
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const named = (loc) => {
            try {
                const part = new Intl.DateTimeFormat(loc, {timeZoneName: "short"})
                    .formatToParts(d).filter((x) => x.type === "timeZoneName")[0];
                const v = part ? part.value : "";
                return /^(GMT|UTC)[+\-−]/.test(v) ? "" : v;
            } catch (e) {
                return "";
            }
        };
        let zone = named("en-GB") || named("en-US");
        if (!zone) {
            const off = -d.getTimezoneOffset();
            const abs = Math.abs(off);
            zone = (off < 0 ? "-" : "+") + p(Math.floor(abs / 60)) + (abs % 60 ? p(abs % 60) : "");
        }
        return days[d.getDay()] + " " + mons[d.getMonth()] + " " + String(d.getDate()).padStart(2, " ") +
            " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) +
            " " + zone + " " + d.getFullYear();
    }

    run(raw) {
        const cmd = raw.trim();
        if (!cmd) return "";
        const parts = cmd.split(/\s+/);
        const c = parts[0].toLowerCase();
        const arg = (parts[1] || "").toLowerCase().replace(/\.md$/, "");
        const rest = parts.slice(1).join(" ");
        const SEC = this.SECTIONS;
        const LINK = this.LINK;
        const CAT = this.CAT;

        if (c === "help") {
            // rendered inside white-space:pre-wrap, so the columns have to be built
            const row = (name, what) => "  " + name.padEnd(20) + what;
            return ["available:",
                row("ls", "list the sections of this page"),
                row("cd <section>", "jump to a section"),
                row("cat sys-01|02|03", "read one of the case studies"),
                row("whoami", "one line about me"),
                row("neofetch", "jump to the profile at the top"),
                row("uptime", "how long I have been doing this"),
                row("pwd", "print the working directory"),
                row("date", "the current date"),
                row("echo <text>", "print <text> back"),
                row("ping", "round-trip time to this page"),
                row("whois", "resolve where you are reading from"),
                row("systemctl", "check my services (contacts github.com from your browser)"),
                row("xdg-open <target>", "github, linkedin, stackoverflow, credly"),
                row("mail", "write to me"),
                row("clear", "this shell"),
                row("help", "this list"),
                "",
                row("up / down", "previous commands"),
                row("tab", "complete a command")].join("\n");
        }
        if (c === "ls") return SEC.join("  ");
        if (c === "pwd") return "/home/guest";
        if (c === "cd" || c === "goto") {
            if (!arg) return "usage: cd <section> — " + SEC.join(", ");
            if (SEC.indexOf(arg) === -1) return "cd: " + arg + ": no such section";
            this.jump(arg);
            return "-> " + arg;
        }
        if (c === "cat") {
            if (CAT[arg]) {
                this.jump("work");
                return CAT[arg];
            }
            if (!arg) return "usage: cat " + Object.keys(CAT).join("|");
            return "cat: " + parts[1] + ": no such file — try " + Object.keys(CAT).join(", ");
        }
        if (c === "whois" || c === "ip") {
            this.jump("visitor");
            return this.state.vRan
                ? "-> visitor: " + this.state.vIp + " · " + this.state.vCity
                : "-> visitor: not resolved. Run it in that section — the request leaves your browser, so the decision is yours.";
        }
        if (c === "whoami") return "you are guest. I am marcin — Senior Cloud Platform Engineer at Procter & Gamble, Warsaw. I build the layer other engineers build on.";
        if (c === "neofetch") {
            this.jump("whoami");
            return "-> whoami";
        }
        if (c === "uptime") return "commercial since 2021 · five years self-taught before that";
        if (c === "ping") return this.state.rttLine + (this.state.colo ? "\nserved from cloudflare edge " + this.state.colo : "");
        if (c === "systemctl") {
            // every run probes for real, and probeServices() rewrites this row in
            // place when the answers land — no "try again in a moment", no stale
            // timings from an earlier run
            this.probeServices();
            return this.PROBING;
        }
        if (c === "date") return this.dateLine(new Date());
        if (c === "echo") return rest;
        if (c === "xdg-open" || c === "open" || c === "curl") {
            if (LINK[arg]) {
                window.open(LINK[arg], "_blank", "noopener,noreferrer");
                return "opening " + LINK[arg];
            }
            return "usage: xdg-open " + Object.keys(LINK).join("|");
        }
        if (c === "mail" || c === "contact") {
            window.location.href = "mailto:contact@mozolewski.eu";
            return "To: contact@mozolewski.eu";
        }
        if (c === "clear") return null;
        if (c === "sudo") {
            if (/hire\s+marcin/i.test(cmd)) return "[sudo] password for recruiter: ********\nAccess granted. contact@mozolewski.eu";
            return "guest is not in the sudoers file. This incident will be reported.";
        }
        if (c === "rm" && /-rf/.test(cmd)) return "nice try.";
        if (c === "exit" || c === "logout") return "there is no exit — this is a business card.";
        return "bash: " + c + ": command not found — try 'help'";
    }

    // Up and down walk previously entered commands. A prompt that ignores the
    // arrow keys is the first thing an engineer notices, and this page is read
    // by engineers.
    recall(step) {
        const cmds = this.state.cmds;
        if (!cmds.length) return;
        const from = this.state.histIdx < 0 ? cmds.length : this.state.histIdx;
        const i = Math.min(cmds.length, Math.max(0, from + step));
        this.setState({histIdx: i, line: i >= cmds.length ? "" : cmds[i]});
    }

    // Tab completes the first word against everything the shell answers to, and
    // an argument against that command's own pool — sections for cd, case study
    // ids for cat, link targets for xdg-open. Several candidates print the list
    // instead of guessing.
    complete() {
        const line = this.state.line.replace(/^\s+/, "");
        const parts = line.split(/\s+/);
        const last = (parts[parts.length - 1] || "").toLowerCase();
        const pool = parts.length > 1
            ? (this.ARGS[parts[0].toLowerCase()] || [])
            : this.COMMANDS.concat(this.ALIASES);
        const hits = pool.filter((name) => name.indexOf(last) === 0);
        if (!hits.length) return;
        if (hits.length === 1) {
            parts[parts.length - 1] = hits[0];
            this.setState({line: parts.join(" ") + " "});
            return;
        }
        // repeated Tab on the same prefix would otherwise push the same listing
        // again and again, evicting real output from the 14-entry window
        const out = hits.join("  ");
        this.setState((st) => {
            const prev = st.hist[st.hist.length - 1];
            if (prev && prev.cmd === line && prev.out === out) return {};
            return {hist: st.hist.concat([{cmd: line, out: out}]).slice(-14)};
        });
    }

    tick() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        const s = Math.floor((Date.now() - this._start) / 1000);
        this.setState({
            now: p(d.getHours()) + ":" + p(d.getMinutes()),
            session: p(Math.floor(s / 60)) + ":" + p(s % 60)
        });
    }

    componentDidMount() {
        this._start = Date.now();
        this._dead = false;
        this._timers = [];
        this._acs = [];
        this._injected = [];
        this.tick();
        this._t = setInterval(() => this.tick(), 1000);
        this._boot = setTimeout(() => this.setupTypers(), 60);
        this.prepareVisitor();
        this.certificates();
        this._timers.push(setTimeout(() => this.probeNetwork(), 600));
        this._timers.push(setTimeout(() => this.watchVisitor(), 60));
    }

    // One AbortController per in-flight request, so componentWillUnmount can
    // cancel them and no handler runs against a torn-down instance. Every
    // request also gets a deadline: a blackholed host must not leave the page
    // waiting on a promise that will never settle.
    deadline(ms) {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), ms);
        this._acs.push(ac);
        return {
            signal: ac.signal,
            done: () => {
                clearTimeout(t);
                const i = this._acs.indexOf(ac);
                if (i > -1) this._acs.splice(i, 1);
            }
        };
    }

    baked() {
        if (this._baked) return this._baked;
        try {
            const el = document.getElementById("mz-baked");
            this._baked = el ? JSON.parse(el.textContent) : {};
        } catch (e) {
            this._baked = {};
        }
        return this._baked;
    }

    // ~/certs renders whatever scripts/build.mjs derived. Nothing here is typed
    // by hand, so a certificate whose expiry date has passed marks itself.
    certificates() {
        const certs = (this.baked().certs || []).filter((c) => c && c.file);
        if (!certs.length) {
            this.setState({certLines: [], certsOk: false, certTotal: "", certOk: "", certFill: "", certEmpty: "░░░░░░░░░░", certGauge: "no certificate data"});
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const lines = certs.map((c) => {
            const dead = c.expires && c.expires < today;
            return {
                issued: c.issued,
                name: c.file + ".cert" + (dead ? ".expired" : ""),
                note: dead ? "# expired " + c.expires : "",
                cls: dead ? "cert-old" : "cert-ok"
            };
        });
        const expired = lines.filter((l) => l.note).length;
        // The ~/whoami gauge reads off the same array, so it cannot disagree
        // with the listing below it, and it re-fills itself as dates pass.
        const valid = lines.length - expired;
        const fill = Math.max(0, Math.min(10, Math.round((valid / lines.length) * 10)));
        this.setState({
            certLines: lines,
            certsOk: true,
            certTotal: "total " + lines.length,
            // nothing is verified at page load — scripts/build.mjs baked this list
            // from credly, plus the two Microsoft Learn entries credly does not carry
            certOk: "Baked " + lines.length + " certificates from credly and microsoft learn, " + expired + " expired",
            certFill: "█".repeat(fill),
            certEmpty: "░".repeat(10 - fill),
            certGauge: valid + " of " + lines.length + " still valid"
        });
    }

    // Leaflet is 44.9 KB and the page's whole budget is 150 KB, so warming it for
    // everyone puts the first view over the ceiling for the majority who never
    // open the map. Warm it only once ~/visitor is about to come into view: by
    // then the visitor is at least reading the panel the button lives in, and the
    // bytes are there if they press it.
    watchVisitor() {
        const el = document.getElementById("visitor");
        if (!el || !window.IntersectionObserver) return;
        const io = new IntersectionObserver((entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            io.disconnect();
            this._vio = null;
            this.prefetchLeaflet();
        }, {rootMargin: "300px 0px", threshold: 0});
        io.observe(el);
        this._vio = io;
    }

    // Leaflet is a first-party file, so warming it changes nothing about the
    // privacy model — ipapi.co and tile.openstreetmap.org are still only reached
    // after the visitor presses the button in ~/visitor. rel=prefetch stores the
    // bytes without parsing or executing them, so this costs bandwidth and no
    // main-thread time.
    prefetchLeaflet() {
        if (this._leafletLoading || this._prefetched) return;
        /** @type {{saveData?: boolean, effectiveType?: string}} */
        const c = navigator.connection || {};
        if (c.saveData || /2g$/.test(c.effectiveType || "")) return;
        this._prefetched = true;
        const warm = () => {
            this._idle = null;
            [["assets/vendor/leaflet.js", "script"], ["assets/leaflet.css", "style"]].forEach(([href, as]) => {
                const l = document.createElement("link");
                l.rel = "prefetch";
                l.as = as;
                l.href = href;
                document.head.appendChild(l);
                this._injected.push(l);
            });
        };
        if (window.requestIdleCallback) this._idle = window.requestIdleCallback(warm, {timeout: 1500});
        else this._timers.push(setTimeout(warm, 0));
    }

    probeNetwork() {
        const url = window.location.href.split("#")[0];
        const samples = [];
        const one = () => {
            const d = this.deadline(4000);
            return fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + "p=" + Math.random(), {method: "HEAD", cache: "no-store", signal: d.signal})
                .then((r) => {
                    d.done();
                    return r.ok ? r : null;
                })
                .catch(() => {
                    d.done();
                    return null;
                });
        };
        const runs = [];
        for (let i = 0; i < 5; i++) {
            runs.push(() => {
                const t0 = performance.now();
                return one().then((r) => {
                    if (r) samples.push(performance.now() - t0);
                });
            });
        }
        runs.reduce((p, fn) => p.then(fn), Promise.resolve()).then(() => {
            if (this._dead) return;
            if (!samples.length) {
                this.setState({rttLine: "ping: blocked by the browser from this context", rttShort: "rtt n/a"});
                return;
            }
            samples.sort((a, b) => a - b);
            const r = (x) => Math.round(x);
            const avg = r(samples.reduce((a, b) => a + b, 0) / samples.length);
            this.setState({
                rttLine: "5 packets transmitted, " + samples.length + " received — rtt min/avg/max = " +
                    r(samples[0]) + "/" + avg + "/" + r(samples[samples.length - 1]) + " ms",
                rttShort: "rtt " + avg + "ms"
            });
        });

        // /cdn-cgi/trace only exists in front of Cloudflare. Asking for it from a
        // local server or from the github.io mirror is a guaranteed 404 in the
        // console, which is the first thing an engineer opening devtools sees.
        if (!/(^|\.)mozolewski\.eu$/.test(location.hostname) && !/\.pages\.dev$/.test(location.hostname)) return;

        // the colo lands in its own key: the ping chain above is five sequential
        // HEADs and always writes rttShort last, so composing the two strings here
        // would lose whichever arrived first. renderVals() joins them instead.
        const trace = this.deadline(4000);
        fetch("/cdn-cgi/trace", {cache: "no-store", signal: trace.signal})
            .then((r) => {
                trace.done();
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.text();
            })
            .then((t) => {
                const colo = (t.match(/colo=(\w+)/) || [])[1];
                if (colo && !this._dead) this.setState({colo: colo});
            })
            .catch(() => {
                trace.done();
            });

    }

    probeServices() {
        if (this._svc) return;
        this._svc = true;
        const svc = [
            ["mozolewski.eu", "https://mozolewski.eu/"],
            ["rysinder.mozolewski.eu", "https://rysinder.mozolewski.eu/"],
            ["github.com/marcjanek", "https://github.com/marcjanek"]
        ];
        // allSettled and a per-host deadline: one host that never answers must not
        // withhold the other two, and the guard has to come back off afterwards or
        // the "run systemctl again in a moment" the empty result prints is a lie.
        Promise.allSettled(svc.map(([name, u]) => {
            const t0 = performance.now();
            const d = this.deadline(4000);
            // no-cors, so the response is opaque: this can see that the host
            // answered, never which status it answered with
            return fetch(u, {mode: "no-cors", cache: "no-store", signal: d.signal})
                .then(() => {
                    d.done();
                    return {badge: "[  OK  ]", name: name, detail: "answered in " + Math.round(performance.now() - t0) + " ms"};
                })
                .catch(() => {
                    d.done();
                    return {badge: "[ FAIL ]", name: name, detail: "no answer in " + Math.round(performance.now() - t0) + " ms"};
                });
        })).then((results) => {
            this._svc = false;
            if (this._dead) return;
            const lines = results.map((r, i) => r.status === "fulfilled"
                ? r.value
                : {badge: "[ FAIL ]", name: svc[i][0], detail: "no answer from this browser"});
            this.setState({
                svcLines: lines,
                svcNote: "# checked from your browser just now, because you asked. cross-origin, so this sees only that the host answered, not its status code"
            });
            // setState is synchronous here, so svcText() already reads the answers:
            // fill them into whichever shell rows are still showing "probing…"
            const text = this.svcText();
            this.setState((st) => ({
                hist: st.hist.map((h) => (h.out === this.PROBING ? {cmd: h.cmd, out: text} : h))
            }));
        });
    }

    svcText() {
        const lines = (this.state.svcLines || []).map((s) => s.badge + " " + s.name + " — " + s.detail);
        if (!lines.length) return this.PROBING;
        return lines.concat([this.state.svcNote]).join("\n");
    }

    clientLine() {
        const s = window.screen || {};
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        return (navigator.language || "?") + " · " + (s.width || "?") + "×" + (s.height || "?") + " · " + dark;
    }

    tzPoint(tz) {
        const T = {
            "Europe/Warsaw": [52.23, 21.01], "Europe/London": [51.51, -0.13], "Europe/Berlin": [52.52, 13.40],
            "Europe/Paris": [48.86, 2.35], "Europe/Madrid": [40.42, -3.70], "Europe/Rome": [41.90, 12.50],
            "Europe/Amsterdam": [52.37, 4.90], "Europe/Brussels": [50.85, 4.35], "Europe/Zurich": [47.37, 8.54],
            "Europe/Vienna": [48.21, 16.37], "Europe/Prague": [50.08, 14.44], "Europe/Stockholm": [59.33, 18.07],
            "Europe/Oslo": [59.91, 10.75], "Europe/Copenhagen": [55.68, 12.57], "Europe/Helsinki": [60.17, 24.94],
            "Europe/Dublin": [53.35, -6.26], "Europe/Lisbon": [38.72, -9.14], "Europe/Kyiv": [50.45, 30.52],
            "Europe/Bucharest": [44.43, 26.10], "Europe/Budapest": [47.50, 19.04], "Europe/Athens": [37.98, 23.73],
            "Europe/Istanbul": [41.01, 28.98], "Europe/Moscow": [55.75, 37.62],
            "America/New_York": [40.71, -74.01], "America/Chicago": [41.88, -87.63], "America/Denver": [39.74, -104.99],
            "America/Los_Angeles": [34.05, -118.24], "America/Toronto": [43.65, -79.38], "America/Vancouver": [49.28, -123.12],
            "America/Sao_Paulo": [-23.55, -46.63], "America/Mexico_City": [19.43, -99.13],
            "Asia/Tokyo": [35.68, 139.69], "Asia/Shanghai": [31.23, 121.47], "Asia/Singapore": [1.35, 103.82],
            "Asia/Hong_Kong": [22.32, 114.17], "Asia/Kolkata": [19.08, 72.88], "Asia/Dubai": [25.20, 55.27],
            "Asia/Seoul": [37.57, 126.98], "Asia/Jerusalem": [31.78, 35.22],
            "Australia/Sydney": [-33.87, 151.21], "Australia/Melbourne": [-37.81, 144.96], "Pacific/Auckland": [-36.85, 174.76],
            "Africa/Johannesburg": [-26.20, 28.05], "Africa/Lagos": [6.52, 3.38], "Africa/Cairo": [30.04, 31.24],
            "Africa/Nairobi": [-1.29, 36.82]
        };
        return T[tz] || null;
    }

    prepareVisitor() {
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "unknown";
        this.setState({vTz: tz, vClient: this.clientLine(), hasGeo: null, vRan: false, vFailed: false});
    }

    runWhois() {
        // vRan means "something left this browser" and never goes back off — the
        // footer's tracking claim reads off it. vFailed is the separate "you may
        // try again" flag, so a retry is possible without unsaying what happened.
        if (this.state.vRan && !this.state.vFailed) return;
        this.setState({
            vRan: true, vFailed: false, vIp: "resolving…", vCity: "resolving…", vNet: "resolving…",
            vNote: "# in flight — your IP is going to ipapi.co, or to ipwho.is if that does not answer, and the map tiles are coming from openstreetmap.org."
        });
        this.lookupVisitor();
    }

    lookupVisitor() {
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "unknown";
        const pt = this.tzPoint(tz);
        this.setState({vTz: tz, vClient: this.clientLine(), hasGeo: !!pt});

        /** @type {{intro?: boolean, visitorLookup?: boolean}} */
        const props = this.props || {};
        if (props.visitorLookup === false) {
            // no map on this build: every tile carries the visitor's IP to
            // openstreetmap.org, and the sentence below promises it did not.
            this.setState({
                vIp: "not requested", vCity: pt ? tz.split("/").pop().replace(/_/g, " ") + " (from timezone)" : "unknown", vNet: "—",
                hasGeo: false,
                vNote: "# the lookup is switched off on this build. the city below is read from your own timezone, on your device — no map is drawn, so nothing left your browser"
            });
            return;
        }

        // only now, past the guard: this draws tiles from openstreetmap.org
        if (pt) this.initMap(pt[0], pt[1], "approx. from your timezone", 7);

        /** @param {{ip?: string, city?: string, region?: string, country_code?: string, country?: string,
         *           org?: string, connection?: {org?: string}, timezone?: string | {id?: string},
         *           latitude?: number, longitude?: number}} d
         *  @param {string} host the endpoint that actually answered — the note has
         *         to name that one, not whichever was tried first */
        const apply = (d, host) => {
            if (this._dead) return;
            const city = [d.city, d.region, d.country_code || d.country].filter(Boolean).join(", ");
            this.setState({
                vIp: d.ip || "unknown",
                vCity: city || "unknown",
                vNet: d.org || d.connection && d.connection.org || "unknown",
                vTz: d.timezone && d.timezone.id || d.timezone || tz,
                vNote: "# you ran this. your IP address went to " + host + ", which logs queries for a limited time; the map tiles came from openstreetmap.org. nothing was written to your device, and nothing reached me."
            });
            const la = d.latitude, lo = d.longitude;
            if (typeof la === "number" && typeof lo === "number") {
                this.setState({hasGeo: true});
                this.initMap(la, lo, d.city || "you", 10);
            }
        };

        const fail = () => {
            if (this._dead) return;
            this.setState({
                vIp: "resolution refused",
                vCity: pt ? tz.split("/").pop().replace(/_/g, " ") + " (from timezone)" : "unknown",
                vNet: "unknown",
                // a second attempt is allowed from here; vRan stays true because the
                // request did leave the browser whether or not anything came back
                vFailed: true,
                vNote: "# the lookup did not answer, so the map falls back to your own timezone. nothing was written to your device either way."
            });
        };

        // a blackholed host neither resolves nor rejects, so every attempt carries
        // its own deadline; without one the panel sticks on "resolving…" forever
        const tryEndpoint = ([url, host]) => {
            const d = this.deadline(4000);
            return fetch(url, {signal: d.signal}).then((r) => {
                d.done();
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            }, (e) => {
                d.done();
                throw e;
            }).then((body) => {
                if (!body || body.error === true || body.error) throw new Error("bad payload");
                return {d: body, host: host};
            });
        };

        tryEndpoint(["https://ipapi.co/json/", "ipapi.co (Kloudend, Inc., USA)"])
            .catch(() => tryEndpoint(["https://ipwho.is/", "ipwho.is"]))
            .then((r) => apply(r.d, r.host), fail);
    }

    loadLeaflet() {
        if (this._leafletLoading) return;
        this._leafletLoading = true;
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "assets/leaflet.css";
        document.head.appendChild(css);
        this._injected.push(css);
        const js = document.createElement("script");
        js.src = "assets/vendor/leaflet.js";
        // without this the boot loop below polls for six seconds and then gives up
        // in silence, leaving an empty box captioned as if it held a map
        js.onerror = () => {
            this._leafletFailed = true;
            this._booting = false;
            if (!this._dead) this.setState({hasGeo: false});
        };
        document.head.appendChild(js);
        this._injected.push(js);
    }

    // The timezone guess and the real ipapi position both come through here, and
    // Leaflet usually loads slower than the lookup, so the second call used to
    // start a second boot loop and lose. The position lives on the instance and
    // one loop reads it, so whichever arrived last is the one that gets drawn.
    initMap(lat, lon, label, zoom) {
        this._want = {lat: lat, lon: lon, label: label, zoom: zoom || 9};
        this.loadLeaflet();
        if (this._leaflet) {
            this.placeMarker();
            return;
        }
        if (this._booting) return;
        this._booting = true;
        let tries = 0;
        const boot = () => {
            if (this._leafletFailed || this._dead) {
                this._booting = false;
                return;
            }
            if (!this._map || !window.L) {
                if (tries++ < 40) this._timers.push(setTimeout(boot, 150));
                else this._booting = false;
                return;
            }
            this._booting = false;
            if (this._leaflet) {
                this.placeMarker();
                return;
            }
            const w = this._want;
            const map = window.L.map(this._map, {zoomControl: false, attributionControl: true, scrollWheelZoom: false}).setView([w.lat, w.lon], w.zoom);
            window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {attribution: "© OpenStreetMap contributors", maxZoom: 14}).addTo(map);
            this._marker = window.L.circleMarker([w.lat, w.lon], {radius: 7, color: "#E0A33C", weight: 2, fillColor: "#E0A33C", fillOpacity: 0.35}).addTo(map).bindTooltip(w.label);
            this._leaflet = map;
            this._timers.push(setTimeout(() => map.invalidateSize(), 400));
        };
        boot();
    }

    placeMarker() {
        const w = this._want;
        if (!this._leaflet || !w) return;
        this._leaflet.setView([w.lat, w.lon], w.zoom);
        if (this._marker) {
            this._marker.setLatLng([w.lat, w.lon]);
            this._marker.bindTooltip(w.label);
        }
    }

    setupTypers() {
        const rows = Array.from(document.querySelectorAll("[data-prompt]"));
        if (!rows.length) return;
        if (this.reduced()) return;

        // opacity:0 alone would leave every link, and the button that sends the
        // visitor's IP to a third party, invisibly focusable and invisibly
        // clickable. visibility:hidden takes them out of the tab order and out of
        // hit testing while keeping the layout — and the transition still animates,
        // because visibility flips discretely at the start of the reveal.
        rows.forEach((row) => {
            const cmd = row.querySelector("[data-cmd]");
            const caret = row.querySelector("[data-caret]");
            if (cmd) cmd.style.clipPath = "inset(0 100% 0 0)";
            if (caret) caret.style.opacity = "0";
            const sec = row.parentElement;
            const kids = Array.from(sec.children);
            kids.slice(kids.indexOf(row) + 1).forEach((el) => {
                el.style.opacity = "0";
                el.style.visibility = "hidden";
                el.style.transition = "opacity .4s ease";
            });
            const ok = sec.querySelector("[data-ok]");
            if (ok) {
                ok.style.opacity = "0";
                ok.style.visibility = "hidden";
                ok.style.transition = "opacity .2s linear";
            }
        });

        this._pending = new Set(rows);
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                io.unobserve(e.target);
                this.typeRow(e.target);
            });
        }, {rootMargin: "-8% 0px -22% 0px", threshold: 0});
        rows.forEach((r) => io.observe(r));
        this._io = io;

        // a fast jump (End, PageDown, scrollbar drag) never intersects the band —
        // sweep on scroll idle so no section can be skipped past and left invisible
        this._sweep = () => {
            clearTimeout(this._sweepT);
            this._sweepT = setTimeout(() => {
                Array.from(this._pending).forEach((row) => {
                    const r = row.getBoundingClientRect();
                    if (r.top > window.innerHeight * 0.9) return;
                    io.unobserve(row);
                    if (r.bottom < 0) this.revealNow(row); else this.typeRow(row);
                });
            }, 140);
        };
        window.addEventListener("scroll", this._sweep, {passive: true});

        // tabbing into a section that has not been typed yet must show it at once,
        // rather than moving focus onto something the reader cannot see
        this._focusIn = (e) => {
            if (!this._pending || !this._pending.size) return;
            const t = e.target;
            const sec = t && t.closest ? t.closest("section") : null;
            if (!sec) return;
            Array.from(this._pending).forEach((row) => {
                if (row.parentElement !== sec) return;
                if (this._io) this._io.unobserve(row);
                this.revealNow(row);
            });
        };
        document.addEventListener("focusin", this._focusIn);
    }

    // Once every row is typed there is nothing left for the observer, the scroll
    // sweep or the focus listener to do.
    settleIfDone() {
        if (!this._pending || this._pending.size) return;
        if (this._io) {
            this._io.disconnect();
            this._io = null;
        }
        if (this._sweep) {
            window.removeEventListener("scroll", this._sweep);
            this._sweep = null;
        }
        if (this._focusIn) {
            document.removeEventListener("focusin", this._focusIn);
            this._focusIn = null;
        }
    }

    // Reveal is opacity + visibility together, always: they were hidden together.
    show(el) {
        el.style.opacity = "1";
        el.style.visibility = "visible";
    }

    revealNow(row) {
        if (this._pending) this._pending.delete(row);
        this.settleIfDone();
        const cmd = row.querySelector("[data-cmd]");
        const caret = row.querySelector("[data-caret]");
        const sec = row.parentElement;
        const ok = sec.querySelector("[data-ok]");
        if (ok) this.show(ok);
        if (cmd) cmd.style.clipPath = "none";
        if (caret) {
            caret.style.opacity = "1";
            caret.style.transform = "none";
        }
        const kids = Array.from(sec.children);
        kids.slice(kids.indexOf(row) + 1).forEach((el) => {
            this.show(el);
        });
    }

    typeRow(row) {
        if (this._pending) {
            if (!this._pending.has(row)) return;
            this._pending.delete(row);
            this.settleIfDone();
        }
        const cmd = row.querySelector("[data-cmd]");
        const caret = row.querySelector("[data-caret]");
        const sec = row.parentElement;
        const ok = sec.querySelector("[data-ok]");
        if (ok) this.show(ok);
        const reveal = () => {
            const kids = Array.from(sec.children);
            kids.slice(kids.indexOf(row) + 1).forEach((el, i) => {
                this._timers.push(setTimeout(() => {
                    this.show(el);
                }, 140 + i * 80));
            });
        };
        if (!cmd) {
            reveal();
            return;
        }

        const n = Math.max(4, (cmd.textContent || "").trim().length);
        const w = cmd.getBoundingClientRect().width;
        const pace = Math.min(32, Math.max(11, 700 / n));
        let k = 0;
        const step = () => {
            k++;
            const p = k / n;
            cmd.style.clipPath = "inset(0 " + (100 - p * 100) + "% 0 0)";
            if (caret) caret.style.transform = "translateX(" + (-(1 - p) * w) + "px)";
            if (k < n) {
                this._timers.push(setTimeout(step, pace + Math.random() * pace * 0.7));
            } else {
                cmd.style.clipPath = "none";
                if (caret) caret.style.transform = "none";
                reveal();
            }
        };
        if (caret) caret.style.opacity = "1";
        this._timers.push(setTimeout(step, 220));
    }

    // The page never unmounts in production, but dc-runtime swaps the logic
    // instance on a hot reload, and a Leaflet map left behind throws
    // "Map container is already initialized" over the whole page.
    componentWillUnmount() {
        this._dead = true;
        clearInterval(this._t);
        clearTimeout(this._boot);
        clearTimeout(this._sweepT);
        (this._timers || []).forEach(clearTimeout);
        if (this._idle && window.cancelIdleCallback) window.cancelIdleCallback(this._idle);
        this._idle = null;
        if (this._io) this._io.disconnect();
        if (this._vio) this._vio.disconnect();
        this._io = null;
        this._vio = null;
        if (this._sweep) window.removeEventListener("scroll", this._sweep);
        if (this._focusIn) document.removeEventListener("focusin", this._focusIn);
        this._sweep = null;
        this._focusIn = null;
        (this._acs || []).forEach((ac) => ac.abort());
        this._acs = [];
        if (this._leaflet) {
            try {
                this._leaflet.remove();
            } catch (e) {
                console.error(e);
            }
            this._leaflet = null;
            this._marker = null;
        }
        (this._injected || []).forEach((el) => el.remove());
        this._injected = [];
        this._leafletLoading = false;
        this._leafletFailed = false;
        this._prefetched = false;
        this._booting = false;
    }

    // The shell input is the last focusable element in <main>, so swallowing every
    // Tab left keyboard users with no way out of it: Tab only completes when there
    // is a word to complete, Shift+Tab is never intercepted, and Escape leaves.
    keyDown(e) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            this.recall(e.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (e.key === "Tab" && !e.shiftKey && this.state.line.trim()) {
            e.preventDefault();
            this.complete();
            return;
        }
        if (e.key === "Escape") {
            if (e.target && e.target.blur) e.target.blur();
            return;
        }
        if (e.key !== "Enter") return;
        const raw = this.state.line;
        if (!raw.trim()) {
            this.setState({line: "", histIdx: -1});
            return;
        }
        const out = this.run(raw);
        this.setState((s) => ({
            line: "",
            histIdx: -1,
            cmds: s.cmds.concat([raw]).slice(-50),
            hist: out === null ? [] : s.hist.concat([{cmd: raw, out: out}]).slice(-14)
        }));
    }

    renderVals() {
        return {
            intro: this.props.intro ?? true,
            clock: this.state.now,
            session: this.state.session,
            vIp: this.state.vIp,
            vCity: this.state.vCity,
            vNet: this.state.vNet,
            vTz: this.state.vTz,
            vClient: this.state.vClient,
            vNote: this.state.vNote,
            certLines: this.state.certLines,
            certTotal: this.state.certTotal,
            certOk: this.state.certOk,
            certFill: this.state.certFill,
            certEmpty: this.state.certEmpty,
            certGauge: this.state.certGauge,
            certsOk: this.state.certsOk,
            rttLine: this.state.rttLine,
            // the ping chain and the trace land in either order, so the two halves
            // of the footer's rtt are joined here rather than overwriting each other
            rttShort: this.state.rttShort + (this.state.colo ? " · " + this.state.colo : ""),
            svcLines: this.state.svcLines,
            svcNote: this.state.svcNote,
            hasGeo: this.state.hasGeo === true,
            vRan: this.state.vRan === true,
            notRan: this.state.vRan !== true,
            // the whois button stays mounted and carries aria-disabled: true only
            // while a lookup stands. A lookup that failed may be run again, so this
            // is the honest binding for that attribute — vRan alone would keep
            // announcing "disabled" over a button that works.
            whoisDisabled: this.state.vRan === true && this.state.vFailed !== true,
            trackNote: this.state.vRan ? "1 lookup, on your command · utf-8" : "no trackers · no cookies · utf-8",
            noGeo: this.state.hasGeo === false,
            line: this.state.line,
            hist: this.state.hist,
            ...this.handlers
        };
    }
}
