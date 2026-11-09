#!/usr/bin/env node
// Load test for the gallery's live features.
//
// Simulates visitors who join, walk around (at the rate the server asks for),
// sit, chat now and then, and watch their room's frame, then reports
// latency, staleness, bandwidth, errors and an estimated cost.
//
//   # against a real Convex deployment (use a dev/staging deployment!)
//   node scripts/loadtest.mjs --url https://<deployment>.convex.cloud --visitors 100 --duration 120
//
//   # also measure frame rate in a real browser while the bots run
//   node scripts/loadtest.mjs --url ... --visitors 500 --browser http://localhost:3000/en/room/art
//
//   # quick functional run against scripts/dev-backend.ts (not a Convex benchmark)
//   node scripts/loadtest.mjs --dev http://localhost:3210 --visitors 10 --duration 30
//
// Big runs: one process comfortably drives a few hundred WebSocket clients.
// For 1,000–5,000, run several copies (on several machines) with --shard i/n
// and add up the reports; each shard prints JSON with --json.
//
// Every bot uses a token starting with "loadtest-" so you can find (and clear)
// their rows afterwards; they are swept automatically 45 s after the run.

import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    url: { type: "string" },
    dev: { type: "string" },
    visitors: { type: "string", default: "10" },
    duration: { type: "string", default: "60" },
    ramp: { type: "string", default: "10" },
    room: { type: "string" },
    "chat-per-min": { type: "string", default: "0.3" },
    observers: { type: "string", default: "1" },
    shard: { type: "string", default: "0/1" },
    browser: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const N = Number(opt.visitors);
const DURATION = Number(opt.duration) * 1000;
const RAMP = Number(opt.ramp) * 1000;
const CHAT_PER_MIN = Number(opt["chat-per-min"]);
const OBSERVER_SHARE = Math.max(0, Math.min(1, Number(opt.observers)));
const [shardIndex, shardCount] = opt.shard.split("/").map(Number);
const ROOMS = ["main", "everyday", "art", "ai", "internet", "files", "media", "behind", "learn"];
if (!opt.url && !opt.dev) {
  console.error("Pass --url <convex deployment url> or --dev <dev-backend url>. See the top of this file.");
  process.exit(1);
}

// ---- Transports ---------------------------------------------------------------------------

async function convexTransport(url) {
  const { ConvexClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  return () => {
    const client = new ConvexClient(url, { unsavedChangesWarning: false });
    return {
      mutation: (name, args) => client.mutation(makeFunctionReference(name), args),
      subscribe: (name, args, cb, onErr) => client.onUpdate(makeFunctionReference(name), args, cb, onErr),
      close: () => client.close(),
    };
  };
}

function devTransport(base) {
  // Polls like the in-browser dev client; fine for functional runs only.
  const call = async (path, name, args) => {
    const r = await fetch(base + path, { method: "POST", body: JSON.stringify({ name, args }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return d.value;
  };
  return () => {
    const subs = new Set();
    return {
      mutation: (name, args) => call("/mutation", name, args),
      subscribe: (name, args, cb, onErr) => {
        let last = "", alive = true;
        const tick = async () => {
          if (!alive) return;
          try { const v = await call("/query", name, args); const s = JSON.stringify(v); if (s !== last) { last = s; cb(v); } } catch (e) { onErr?.(e); }
          if (alive) setTimeout(tick, 250);
        };
        void tick();
        const stop = () => { alive = false; };
        subs.add(stop);
        return stop;
      },
      close: () => subs.forEach((s) => s()),
    };
  };
}

// ---- Metrics ------------------------------------------------------------------------------

const lat = { join: [], move: [], sit: [], chat: [] };
const staleness = [];
const errors = new Map();
let framesReceived = 0, bytesReceived = 0, mutations = 0, observers = 0;
const err = (e) => { const k = String(e?.message ?? e).slice(0, 80); errors.set(k, (errors.get(k) ?? 0) + 1); };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
async function timed(kind, fn) {
  const t0 = performance.now();
  try { const r = await fn(); lat[kind].push(performance.now() - t0); mutations++; return r; } catch (e) { err(e); return null; }
}

// ---- A simulated visitor --------------------------------------------------------------------

function bot(i, connect) {
  const c = connect();
  const token = `loadtest-${shardIndex}-${i}-${Math.random().toString(36).slice(2)}${"x".repeat(12)}`;
  const roomId = opt.room ?? (i % 4 === 0 ? "main" : ROOMS[1 + (i % 8)]);
  let x = (Math.random() - 0.5) * 6, z = (Math.random() - 0.5) * 20, yaw = Math.random() * 6.28;
  let interval = 300, stopped = false, unsub = null, seated = false;
  const run = async () => {
    const me = await timed("join", () => c.mutation("presence:join", { token, roomId, x, z, yaw }));
    if (!me) return;
    interval = me.interval;
    if (Math.random() < OBSERVER_SHARE) {
      observers++;
      unsub = c.subscribe("presence:frame", { roomId }, (f) => {
        framesReceived++;
        bytesReceived += f.data.length + 40;
        try {
          const rows = JSON.parse(f.data);
          const newest = rows.reduce((m, r) => Math.max(m, r[8]), 0);
          if (newest) staleness.push(Date.now() - newest);
        } catch (e) { err(e); }
      }, err);
    }
    // Walk in bursts with pauses, like a visitor looking at paintings.
    let walking = Math.random() < 0.5, phaseEnds = Date.now() + 2000 + Math.random() * 6000, lastSent = 0;
    while (!stopped) {
      const now = Date.now();
      if (now > phaseEnds) { walking = !walking; phaseEnds = now + 2000 + Math.random() * 6000; if (walking) yaw += (Math.random() - 0.5) * 2; }
      if (walking) {
        x = Math.max(-4, Math.min(4, x + Math.sin(yaw) * 2 * (interval / 1000)));
        z = Math.max(-20, Math.min(20, z + Math.cos(yaw) * 2 * (interval / 1000)));
        if (Math.abs(x) >= 4 || Math.abs(z) >= 20) yaw += Math.PI / 2;
      }
      if (walking || now - lastSent > 15000) {
        const r = await timed("move", () => c.mutation("presence:move", { token, x, z, yaw, moving: walking }));
        lastSent = now;
        if (r?.rejoin) await timed("join", () => c.mutation("presence:join", { token, roomId, x, z, yaw }));
      }
      if (!walking && !seated && Math.random() < 0.02) { const r = await timed("sit", () => c.mutation("presence:sit", { token, seat: `${i % 3}:${i % 3}` })); seated = !!r?.ok; }
      if (walking && seated) { seated = false; await timed("sit", () => c.mutation("presence:sit", { token, seat: null })); }
      if (Math.random() < (CHAT_PER_MIN / 60) * (interval / 1000)) {
        await timed("chat", () => c.mutation("chat:send", { token, channel: Math.random() < 0.7 ? `room:${roomId}` : "gallery", body: `load test ${i}: ${new Date().toISOString()}` }));
      }
      await new Promise((r) => setTimeout(r, interval));
    }
  };
  const done = run().catch(err);
  return {
    stop: async () => {
      stopped = true;
      await done;
      unsub?.();
      await c.mutation("presence:leave", { token }).catch(() => {});
      c.close();
    },
  };
}

// ---- Optional: frame rate in a real browser ---------------------------------------------------

async function measureBrowser(url, ms) {
  let chromium;
  try {
    const { createRequire } = await import("node:module");
    ({ chromium } = createRequire(import.meta.url)("playwright"));
  } catch { console.warn("playwright not available; skipping --browser"); return null; }
  // LOADTEST_SOFTWARE_GL=1 for machines without a GPU (numbers are then much lower).
  const browser = await chromium.launch({ args: process.env.LOADTEST_SOFTWARE_GL ? ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url + (url.includes("?") ? "&" : "?") + "debug", { waitUntil: "load" });
  await page.getByRole("button").filter({ hasText: /Enter quietly|ادخل بهدوء/ }).click();
  const samples = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.waitForTimeout(1000);
    const p = await page.evaluate(() => window.__perf).catch(() => null);
    if (p) samples.push(p);
  }
  await browser.close();
  return samples;
}

// ---- Run --------------------------------------------------------------------------------------

const connect = opt.dev ? devTransport(opt.dev) : await convexTransport(opt.url);
const mine = Array.from({ length: N }, (_, i) => i).filter((i) => i % shardCount === shardIndex);
const bots = [];
const t0 = Date.now();
console.error(`[loadtest] starting ${mine.length} visitors (shard ${shardIndex}/${shardCount}) over ${RAMP / 1000}s, running ${DURATION / 1000}s…`);
for (const [k, i] of mine.entries()) {
  bots.push(bot(i, connect));
  const wait = RAMP / Math.max(1, mine.length);
  if (k < mine.length - 1) await new Promise((r) => setTimeout(r, wait));
}
const browserRun = opt.browser ? measureBrowser(opt.browser, Math.max(10_000, DURATION - (Date.now() - t0) - 5000)) : Promise.resolve(null);
const statsStart = Date.now();
const bytesAtStart = bytesReceived, framesAtStart = framesReceived;
await new Promise((r) => setTimeout(r, Math.max(0, DURATION - (Date.now() - t0))));
const elapsed = (Date.now() - statsStart) / 1000;
const fps = await browserRun;
await Promise.all(bots.map((b) => b.stop()));

const report = {
  visitors: mine.length,
  observers,
  seconds: Math.round(elapsed),
  latencyMs: Object.fromEntries(Object.entries(lat).map(([k, a]) => [k, { n: a.length, p50: Math.round(pct(a, 50)), p95: Math.round(pct(a, 95)), p99: Math.round(pct(a, 99)) }])),
  mutationsPerS: Math.round(mutations / Math.max(1, (Date.now() - t0) / 1000)),
  frameStalenessMs: { p50: Math.round(pct(staleness, 50)), p95: Math.round(pct(staleness, 95)) },
  framesPerObserverPerS: observers ? +((framesReceived - framesAtStart) / observers / Math.max(1, elapsed)).toFixed(2) : 0,
  kbPerObserverPerS: observers ? +((bytesReceived - bytesAtStart) / observers / Math.max(1, elapsed) / 1024).toFixed(2) : 0,
  errors: Object.fromEntries(errors),
  browser: fps && fps.length ? {
    fpsP50: pct(fps.map((s) => s.fps), 50), fpsMin: Math.min(...fps.map((s) => s.fps)),
    worstFrameMs: Math.max(...fps.map((s) => s.worst)), othersInRoom: Math.max(...fps.map((s) => s.remotes)),
  } : null,
};

if (opt.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`\nLoad test: ${report.visitors} visitors (${report.observers} watching their room) for ${report.seconds}s via ${opt.dev ? "dev backend" : "Convex"}`);
  console.log("latency (ms)     n      p50   p95   p99");
  for (const [k, v] of Object.entries(report.latencyMs)) console.log(`  ${k.padEnd(6)} ${String(v.n).padStart(8)} ${String(v.p50).padStart(6)} ${String(v.p95).padStart(5)} ${String(v.p99).padStart(5)}`);
  console.log(`mutations/s: ${report.mutationsPerS}`);
  console.log(`room frames: ${report.framesPerObserverPerS}/s per visitor, ${report.kbPerObserverPerS} KB/s per visitor; newest position is ${report.frameStalenessMs.p50} ms old (p95 ${report.frameStalenessMs.p95} ms)`);
  if (report.browser) console.log(`browser: ${report.browser.fpsP50} fps median (min ${report.browser.fpsMin}, worst frame ${report.browser.worstFrameMs} ms) with ${report.browser.othersInRoom} others in the room`);
  console.log(`errors: ${errors.size ? JSON.stringify(report.errors) : "none"}`);
}
process.exit(0);
