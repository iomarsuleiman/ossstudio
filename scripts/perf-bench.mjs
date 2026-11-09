#!/usr/bin/env node
// Repeatable performance benchmark for the 3D gallery.
//
// Drives a real browser through the things visitors do (stand, walk, turn,
// click-to-move, sit, open an artwork, teleport) and records, per scenario:
// FPS, median/p95/p99 frame time, freezes (frames over 100 ms), long tasks,
// draw calls, triangles, live geometries/textures/shader programs, JS heap,
// and main-thread time spent painting artworks.
//
//   npm run build && npm start                         # profile production, not `next dev`
//   node scripts/perf-bench.mjs --url http://localhost:3000 --out perf/baseline.json
//   node scripts/perf-bench.mjs --compare perf/baseline.json   # fail on regressions
//
// Options: --room art  --width 1280 --height 800  --mobile  --software-gl  --runs 1
// Absolute FPS depends on the machine; draw calls, triangles, resource counts
// and freezes are comparable anywhere. Use --software-gl only where there is no GPU.

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import fs from "node:fs";

const { values: opt } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    room: { type: "string", default: "art" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
    mobile: { type: "boolean", default: false },
    "software-gl": { type: "boolean", default: false },
    out: { type: "string" },
    compare: { type: "string" },
    tolerance: { type: "string", default: "0.15" },
  },
});

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: opt["software-gl"] ? ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-gpu", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(opt.mobile ? { ...devices["Pixel 7"] } : { viewport: { width: Number(opt.width), height: Number(opt.height) } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// Frame and long-task recorders, installed before the app starts.
await page.addInitScript(() => {
  const w = window;
  w.__bench = { frames: [], longTasks: [], recording: false };
  let prev = 0;
  const loop = (t) => {
    if (w.__bench.recording && prev) w.__bench.frames.push(t - prev);
    prev = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((list) => { if (w.__bench.recording) for (const e of list.getEntries()) w.__bench.longTasks.push(e.duration); }).observe({ type: "longtask", buffered: false });
  } catch { /* not supported */ }
});

const t0 = Date.now();
await page.goto(`${opt.url}/en/room/${opt.room}?debug`, { waitUntil: "load" });
await page.locator(".arrival-actions button").nth(1).click();
await page.waitForFunction(() => window.__gallery?.mode === "walk" && window.__three);
const loadMs = Date.now() - t0;
await sleep(1500);

async function measure(name, act) {
  await page.evaluate(() => { const b = window.__bench; b.frames = []; b.longTasks = []; b.recording = true; performance.clearMeasures(); });
  const start = Date.now();
  await act();
  const wall = Date.now() - start;
  return await page.evaluate(({ name, wall }) => {
    const b = window.__bench;
    b.recording = false;
    const f = [...b.frames].sort((a, c) => a - c);
    const q = (p) => (f.length ? f[Math.min(f.length - 1, Math.floor(p * f.length))] : 0);
    const info = window.__three.gl.info;
    const paint = performance.getEntriesByType("measure").filter((m) => m.name.startsWith("paint:"));
    const mem = performance.memory;
    return {
      scenario: name,
      wallMs: wall,
      frames: f.length,
      fps: f.length ? +(1000 / (f.reduce((a, c) => a + c, 0) / f.length)).toFixed(1) : 0,
      frameMs: { p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +(f[f.length - 1] ?? 0).toFixed(1) },
      freezes: f.filter((d) => d > 100).length,
      longTasks: { count: b.longTasks.length, totalMs: Math.round(b.longTasks.reduce((a, c) => a + c, 0)) },
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
      paintingMs: Math.round(paint.reduce((a, m) => a + m.duration, 0)),
      paintedArtworks: paint.length,
    };
  }, { name, wall });
}

const store = (fn, arg) => page.evaluate(fn, arg);
const results = [];

results.push(await measure("idle", () => sleep(3000)));
results.push(await measure("walk", async () => { await page.keyboard.down("KeyW"); await sleep(3000); await page.keyboard.up("KeyW"); await sleep(500); }));
results.push(await measure("turn", async () => {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down({ button: "right" });
  for (let i = 0; i < 60; i++) { await page.mouse.move(width / 2 + Math.sin(i / 8) * 300, height / 2); await sleep(40); }
  await page.mouse.up({ button: "right" });
}));
results.push(await measure("click-to-move", async () => {
  await store(() => { const s = window.__gallery; s.navigate({ x: s.pos.x, z: s.pos.z - 12 }); });
  await page.waitForFunction(() => !window.__gallery.target, null, { timeout: 30000 }).catch(() => {});
}));
results.push(await measure("sit", async () => {
  await store(() => window.__gallery.sitOn(0));
  await page.waitForFunction(() => window.__gallery.sitBlend >= 1, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.down("KeyS"); await sleep(300); await page.keyboard.up("KeyS");
  await page.waitForFunction(() => window.__gallery.sitBlend === 0, null, { timeout: 10000 }).catch(() => {});
}));
results.push(await measure("open-artwork", async () => {
  await store(() => {
    const s = window.__gallery;
    // Stand at the first artwork's viewing spot, facing it.
    const e = window.__content.exhibits.find((x) => x.roomId === s.roomId && x.kind === "frame");
    if (e) { s.pos.x = e.spawn.x; s.pos.z = e.spawn.z; s.yaw = s.targetYaw = e.spawn.yaw; s.pitch = s.targetPitch = 0; s.snapCamera = true; }
  });
  await sleep(400);
  await page.keyboard.press("KeyE");
  await page.waitForSelector(".exhibit-layer", { timeout: 15000 }).catch(() => {});
  await sleep(800);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__gallery.mode === "walk", null, { timeout: 15000 }).catch(() => {});
}));
results.push(await measure("teleport", async () => {
  const from = await store(() => window.__gallery.roomId);
  await page.keyboard.press("KeyM");
  await page.waitForSelector(".map-node");
  const nodes = page.locator(".map-node:not(.is-here)");
  await nodes.nth(from === "media" ? 1 : 5).click();
  await page.locator(".dialog .btn-primary").first().click();
  await page.waitForFunction((f) => window.__gallery.roomId !== f && window.__gallery.mode === "walk" && !document.querySelector(".teleport-veil"), from, { timeout: 30000 }).catch(() => {});
}));
// Back to the room you just left: it's still mounted, so this should be near-instant.
results.push(await measure("teleport-back", async () => {
  const from = await store(() => window.__gallery.roomId);
  await page.keyboard.press("KeyM");
  await page.waitForSelector(".map-node");
  const title = await page.evaluate((id) => window.__content.rooms.find((r) => r.id === id).t.en.title, opt.room);
  await page.locator(".map-node", { hasText: title }).first().click();
  await page.locator(".dialog .btn-primary").first().click();
  await page.waitForFunction((f) => window.__gallery.roomId !== f && window.__gallery.mode === "walk" && !document.querySelector(".teleport-veil"), from, { timeout: 30000 }).catch(() => {});
}));
results.push(await measure("idle-after", () => sleep(3000)));

await browser.close();
const report = { when: new Date().toISOString(), url: opt.url, room: opt.room, device: opt.mobile ? "Pixel 7 (emulated)" : `${opt.width}x${opt.height}`, softwareGL: !!opt["software-gl"], loadMs, results, errors };

const cols = ["scenario", "wallMs", "fps", "p50", "p95", "p99", "freezes", "longTasks", "drawCalls", "triangles", "geometries", "textures", "programs", "heapMB", "paintingMs"];
console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|`);
for (const r of results) console.log(`| ${[r.scenario, r.wallMs, r.fps, r.frameMs.p50, r.frameMs.p95, r.frameMs.p99, r.freezes, `${r.longTasks.count} (${r.longTasks.totalMs} ms)`, r.drawCalls, r.triangles, r.geometries, r.textures, r.programs, r.heapMB, r.paintingMs].join(" | ")} |`);
if (errors.length) console.log("page errors:", errors);
if (opt.out) { fs.mkdirSync(opt.out.replace(/\/[^/]+$/, ""), { recursive: true }); fs.writeFileSync(opt.out, JSON.stringify(report, null, 2)); }

// Regression check: hardware-independent budgets must not grow.
if (opt.compare) {
  const base = JSON.parse(fs.readFileSync(opt.compare, "utf8"));
  const tol = Number(opt.tolerance);
  const problems = [];
  for (const r of results) {
    const b = base.results.find((x) => x.scenario === r.scenario);
    if (!b) continue;
    for (const k of ["drawCalls", "triangles", "geometries", "textures", "programs"]) {
      if (r[k] > b[k] * (1 + tol) + 2) problems.push(`${r.scenario}: ${k} ${b[k]} → ${r[k]}`);
    }
    if (r.freezes > b.freezes + 2) problems.push(`${r.scenario}: freezes ${b.freezes} → ${r.freezes}`);
  }
  if (problems.length) { console.error("Performance regressions:\n  " + problems.join("\n  ")); process.exit(1); }
  console.log("No regressions against", opt.compare);
}
