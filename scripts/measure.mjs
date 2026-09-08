// Drives headless Chrome over the DevTools Protocol to measure the built page.
// Zero dependencies, like scripts/build.mjs. Node 22 has global WebSocket+fetch.
//
// Why not Playwright: it is not installed and its browsers cannot be driven
// without it. Why not --window-size: headless Chrome clamps its viewport to a
// 500px minimum, so a 390px window silently renders at 500 —
// Emulation.setDeviceMetricsOverride is the only honest way to get a narrow one.
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";

const CHROME = process.env.CHROME
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const ORIGIN = "http://127.0.0.1:8731";
const WIDTHS = [320, 390, 768, 1440];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The renderer wedges without these; occlusion and background throttling both
// stop a headless page from animating or laying out while it is not visible.
const FLAGS = [
    "--headless=new",
    "--remote-debugging-port=" + PORT,
    "--remote-debugging-address=127.0.0.1",
    "--disable-features=CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--no-first-run",
    "--user-data-dir=/tmp/measure-profile-" + process.pid,
    "about:blank",
];

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.waiting = new Map();
        ws.addEventListener("message", (e) => {
            const msg = JSON.parse(e.data);
            const slot = this.waiting.get(msg.id);
            if (!slot) return;
            this.waiting.delete(msg.id);
            if (msg.error) slot.reject(new Error(msg.error.message));
            else slot.resolve(msg.result);
        });
    }

    send(method, params) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.waiting.set(id, {resolve, reject});
            this.ws.send(JSON.stringify({id, method, params: params || {}}));
        });
    }

    // Returns the evaluated value, not the wrapper. Throws on a page exception
    // rather than silently reporting undefined.
    async eval(expr) {
        const r = await this.send("Runtime.evaluate", {
            expression: expr, returnByValue: true, awaitPromise: true,
        });
        if (r.exceptionDetails) {
            throw new Error("page threw: " + r.exceptionDetails.text);
        }
        return r.result.value;
    }
}

async function connect() {
    for (let i = 0; i < 100; i++) {
        try {
            const res = await fetch("http://127.0.0.1:" + PORT + "/json/list");
            const targets = await res.json();
            const page = targets.find((t) => t.type === "page");
            if (page) {
                const ws = new WebSocket(page.webSocketDebuggerUrl);
                await new Promise((ok, no) => {
                    ws.addEventListener("open", ok, {once: true});
                    ws.addEventListener("error", no, {once: true});
                });
                return new CDP(ws);
            }
        } catch {}
        await sleep(100);
    }
    throw new Error("Chrome never answered on port " + PORT);
}

// The page holds an opaque #boot-cover and pauses every intro animation until
// app.js adds boot-go to <html>. Waiting a wall-clock delay instead measures a
// black rectangle. See CLAUDE.md.
async function waitForBoot(cdp) {
    for (let i = 0; i < 120; i++) {
        const ok = await cdp.eval(
            "document.documentElement.classList.contains('boot-go')");
        if (ok) return true;
        await sleep(100);
    }
    return false;
}

const PROBES = {
    body: "body",
    h2: "main h2",
    prompt: "[data-prompt]",
    workTitle: "#work [style*='font-weight: 500']",
    workCopy: "#work [style*='max-width']",
    neofetchName: "#whoami [style*='min-width'] > div:first-child",
    careerGrid: "#career .cgrid",
    okLine: "[data-ok]",
    bar: "#whoami > div:nth-child(2)",
};

async function measure(cdp, width) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    // A fresh query string defeats the cache without adding a hash — a URL with
    // a hash disables the scroll lock and would not measure what a visitor gets.
    await cdp.send("Page.navigate", {url: ORIGIN + "/?m=" + width});
    await sleep(300);
    if (!await waitForBoot(cdp)) throw new Error("boot-go never arrived at " + width);

    // One key event skips the intro and releases lockScroll() at once, rather
    // than waiting out the 3.9s timer.
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Escape"});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Escape"});
    await sleep(200);

    // Section headings must be legible before anything is typed. setupTypers()
    // hides children from kids.indexOf(row)+1 and h2 is child #1, so a visible
    // heading can never enter the animation. Measured here, before any scroll —
    // after one, everything is revealed and the number would be meaningless.
    const heads = JSON.parse(await cdp.eval(`(() => {
        const hs = Array.from(document.querySelectorAll("main h2"));
        return JSON.stringify({
            total: hs.length,
            visible: hs.filter((h) => {
                const cs = getComputedStyle(h);
                // .sr is 1px wide, so width is what separates hidden from shown
                return cs.visibility !== "hidden" && cs.opacity !== "0"
                    && h.getBoundingClientRect().width > 2;
            }).length,
        });
    })()`));

    // Scroll slowly and pause: a fast sweep reads half-typed sections and looks
    // like a regression. Content is revealed by an IntersectionObserver.
    for (let y = 0; y < 40; y++) {
        const done = await cdp.eval(
            "window.scrollBy(0, innerHeight*0.5),"
            + "(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2");
        await sleep(350);
        if (done) break;
    }
    await sleep(2000);
    await cdp.eval("window.scrollTo(0,0)");
    await sleep(400);

    const probes = JSON.stringify(PROBES);
    const out = JSON.parse(await cdp.eval(`(() => {
        const d = document.documentElement;
        const vw = d.clientWidth;
        const out = {
            width: ${width},
            scrollWidth: d.scrollWidth,
            clientWidth: vw,
            overflow: [],
            clipped: [],
            small: [],
            sizes: {},
        };
        const name = (el) => el.tagName.toLowerCase()
            + (el.id ? "#" + el.id : "")
            + (el.className && typeof el.className === "string"
                ? "." + el.className.trim().split(/\\s+/).join(".") : "");
        for (const el of document.querySelectorAll("main *")) {
            // .sr is the visually-hidden pattern: width:1px, overflow:hidden.
            // It always looks like an overflow and never is one.
            if (el.classList.contains("sr")) continue;
            const r = el.getBoundingClientRect();
            if (!r.width) continue;
            if (r.right > vw + 0.5 || r.left < -0.5) {
                out.overflow.push(name(el) + " " + Math.round(r.left)
                    + ".." + Math.round(r.right));
            }
        }
        // getBoundingClientRect() will not reveal text overflowing a fixed-width
        // box — only scrollWidth does. This is what catches a grid column that
        // is too narrow for what it holds, which the viewport check cannot see.
        for (const el of document.querySelectorAll("main *")) {
            if (el.classList.contains("sr")) continue;
            const cs = getComputedStyle(el);
            // a box that is meant to scroll is not a clipped box
            if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
            if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
                out.clipped.push(name(el) + " " + el.clientWidth
                    + "<" + el.scrollWidth);
            }
        }
        for (const el of document.querySelectorAll("main a, main button, main input")) {
            if (el.classList.contains("sr")) continue;
            const r = el.getBoundingClientRect();
            if (r.height && r.height < 24) {
                out.small.push(name(el) + " h=" + r.height.toFixed(1));
            }
        }
        const probes = ${probes};
        for (const k of Object.keys(probes)) {
            const el = document.querySelector(probes[k]);
            out.sizes[k] = el ? getComputedStyle(el).fontSize : null;
        }
        return JSON.stringify(out);
    })()`));
    out.headings = heads;
    return out;
}

// Times the gap a reader actually feels: from a section entering the viewport
// to its last child being fully shown. 1280px, because the complaint was made
// on a desktop and #work is the densest section.
async function revealTiming(cdp) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send("Page.navigate", {url: ORIGIN + "/?r=1"});
    await sleep(300);
    if (!await waitForBoot(cdp)) throw new Error("boot-go never arrived");
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Escape"});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Escape"});
    await sleep(300);
    return await cdp.eval(`(async () => {
        const sec = document.getElementById("work");
        const last = sec.lastElementChild;
        const t0 = performance.now();
        sec.scrollIntoView({behavior: "instant", block: "start"});
        for (let i = 0; i < 400; i++) {
            const cs = getComputedStyle(last);
            if (cs.opacity === "1" && cs.visibility === "visible") {
                return Math.round(performance.now() - t0);
            }
            await new Promise((r) => setTimeout(r, 25));
        }
        return -1;
    })()`);
}

const outFlag = process.argv.indexOf("--out");
const outFile = outFlag > -1 ? process.argv[outFlag + 1] : null;

const chrome = spawn(CHROME, FLAGS, {stdio: "ignore"});
let cdp;
try {
    cdp = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    if (process.argv.includes("--reveal")) {
        const ms = await revealTiming(cdp);
        console.log(JSON.stringify({revealMs: ms}));
        if (ms < 0) { console.error("FAIL: never fully revealed"); process.exitCode = 1; }
        else console.error("reveal " + ms + "ms");
    } else {
        const results = [];
        for (const w of WIDTHS) results.push(await measure(cdp, w));
        const json = JSON.stringify(results, null, 2);
        if (outFile) writeFileSync(outFile, json + "\n");
        else console.log(json);
        const bad = results.filter((r) => r.scrollWidth !== r.clientWidth
            || r.overflow.length || r.clipped.length || r.small.length
            || Object.values(r.sizes).some((v) => v === null));
        if (bad.length) {
            console.error("FAIL at widths: " + bad.map((r) => r.width).join(", "));
            // A null probe passes the four checks above silently — name it, or a
            // later task goes hunting at the wrong width for the wrong reason.
            for (const r of bad) {
                const nullProbes = Object.keys(r.sizes).filter((k) => r.sizes[k] === null);
                if (nullProbes.length) {
                    console.error("FAIL: probe(s) returned null at " + r.width
                        + ": " + nullProbes.join(", "));
                }
            }
            process.exitCode = 1;
        } else {
            console.error("OK at " + WIDTHS.join(", "));
        }
    }
} finally {
    chrome.kill();
}
