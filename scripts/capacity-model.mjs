#!/usr/bin/env node
// Back-of-the-envelope capacity and cost model for the gallery's live
// features on Convex. It turns the client's real send rates (see
// convex/visitorAuth.ts → sendIntervalFor) and measured payload sizes
// (convex/scale.test.ts prints them) into writes, function calls and
// bandwidth for 10 → 5,000 concurrent visitors.
//
//   node scripts/capacity-model.mjs            # markdown table
//   node scripts/capacity-model.mjs --json
//
// It is a model, not a measurement: confirm it with scripts/loadtest.mjs
// against a real deployment, and check PRICES below against
// https://www.convex.dev/pricing before relying on the dollar figures.

// ---- Assumptions you can tune ---------------------------------------------------------

/** Price inputs. UNVERIFIED: written from memory without network access; update from the pricing page. */
const PRICES = {
  planBaseUsdPerMonth: 25, // Professional, per developer seat
  includedFunctionCallsPerMonth: 25_000_000,
  usdPerMillionFunctionCalls: 2,
  includedDbBandwidthGbPerMonth: 50,
  usdPerGbDbBandwidth: 0.2,
};

const VISITOR_COUNTS = [10, 100, 500, 1000, 5000];
/** Share of visitors in the Main Hall; the rest spread evenly over 8 rooms. */
const MAIN_HALL_SHARE = 0.25;
const ROOMS = 8;
/** Fraction of visitors walking at any moment (the rest stand, sit or read). */
const MOVING_SHARE = 0.4;
/** Average visit length and how many hours a day the gallery is this busy. */
const BUSY_HOURS_PER_DAY = 4;
/** Chat: messages per visitor per minute, and how many people read each channel. */
const CHAT_PER_VISITOR_PER_MIN = 0.3;

// Measured (convex/scale.test.ts): bytes per person in a room frame and in
// the old per-row feed, frame caps, and approximate stored document sizes.
const FRAME_BYTES_PER_PERSON = 99;
const ROW_BYTES = 141;
const PRESENCE_DOC_BYTES = 260;
const COUNTS_BYTES = 133;
const HEARTBEAT_S = 15;

// Mirrors convex/visitorAuth.ts.
function sendIntervalMs(n) {
  if (n <= 8) return 200;
  if (n <= 25) return 300;
  if (n <= 60) return 500;
  if (n <= 150) return 800;
  return 1200;
}
const tickIntervalMs = (online) => (online <= 300 ? 500 : 1000);
const frameCap = (n) => (n <= 150 ? 120 : 80);

// ---- Model -------------------------------------------------------------------------------

function roomWrites(n) {
  if (n <= 0) return 0;
  const moving = n * MOVING_SHARE, still = n - moving;
  // A walking visitor sends at most once per interval (only when they moved).
  return moving * (1000 / sendIntervalMs(n)) + still / HEARTBEAT_S;
}

function model(total, design) {
  const main = Math.round(total * MAIN_HALL_SHARE);
  const per = (total - main) / ROOMS;
  const sizes = [main, ...Array.from({ length: ROOMS }, () => per)];
  const writes = sizes.reduce((s, n) => s + roomWrites(n), 0);
  const ticksPerS = 1000 / tickIntervalMs(total);
  let pushBytes = 0, queryReruns = 0, dbRead = writes * PRESENCE_DOC_BYTES * 2; // each move reads visitor + presence
  for (const n of sizes) {
    if (n <= 0) continue;
    if (design === "naive") {
      // Old design: every write re-runs the room query and pushes it to all n viewers.
      const w = roomWrites(n), shown = Math.min(n, 120);
      pushBytes += w * n * shown * ROW_BYTES;
      queryReruns += w;
      dbRead += w * shown * PRESENCE_DOC_BYTES;
    } else {
      // Batched frames: one frame per room per tick, pushed to its n viewers.
      const frame = Math.min(n, frameCap(n)) * FRAME_BYTES_PER_PERSON;
      pushBytes += ticksPerS * n * frame;
      queryReruns += ticksPerS;
      dbRead += ticksPerS * frame * 2; // the ticker reads it, the frame query re-reads it
    }
  }
  if (design !== "naive") dbRead += writes * PRESENCE_DOC_BYTES; // the ticker reads each changed row once
  const tickerCalls = design === "naive" ? 0 : ticksPerS * 4; // action + 2 internal queries + 1 mutation
  // Room changes are rare: the counts feed changes about once a minute per visitor.
  const countChangesPerS = total / 60;
  pushBytes += countChangesPerS * total * COUNTS_BYTES;
  const chatPerS = (total * CHAT_PER_VISITOR_PER_MIN) / 60;
  pushBytes += chatPerS * (total / (ROOMS + 1)) * 13_000; // a 50-message page to the channel's readers
  const callsPerS = writes + queryReruns + tickerCalls + chatPerS * 2 + countChangesPerS * 2;
  const busySecondsPerMonth = BUSY_HOURS_PER_DAY * 3600 * 30;
  const callsMonth = callsPerS * busySecondsPerMonth;
  const dbGbMonth = (dbRead * busySecondsPerMonth) / 1e9;
  const usd = PRICES.planBaseUsdPerMonth
    + Math.max(0, callsMonth - PRICES.includedFunctionCallsPerMonth) / 1e6 * PRICES.usdPerMillionFunctionCalls
    + Math.max(0, dbGbMonth - PRICES.includedDbBandwidthGbPerMonth) * PRICES.usdPerGbDbBandwidth;
  const biggest = Math.max(main, per);
  return {
    design,
    visitors: total,
    busiestRoom: Math.round(biggest),
    sendIntervalMs: sendIntervalMs(biggest),
    writesPerS: writes,
    functionCallsPerS: callsPerS,
    pushMBps: pushBytes / 1e6,
    perClientKBps: pushBytes / total / 1e3,
    dbMBps: dbRead / 1e6,
    functionCallsPerMonthM: callsMonth / 1e6,
    dbGbPerMonth: dbGbMonth,
    usdPerMonth: usd,
  };
}

const designs = ["frames", "naive"];
const rows = designs.flatMap((d) => VISITOR_COUNTS.map((n) => model(n, d)));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ assumptions: { PRICES, MAIN_HALL_SHARE, MOVING_SHARE, BUSY_HOURS_PER_DAY, CHAT_PER_VISITOR_PER_MIN, FRAME_BYTES_PER_PERSON }, rows }, null, 2));
} else {
  const f = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  for (const d of designs) {
    console.log(d === "frames" ? "\n### Batched room frames (current design)\n" : "\n### Per-step fan-out (first design, for comparison)\n");
    console.log("| Visitors | Busiest room | Send interval | Writes/s | Function calls/s | Sync out (MB/s) | Per visitor (KB/s) | DB reads (MB/s) | Calls/month (M) | DB GB/month | Est. $/month |");
    console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of rows.filter((x) => x.design === d)) {
      console.log(`| ${f(r.visitors)} | ${f(r.busiestRoom)} | ${r.sendIntervalMs} ms | ${f(r.writesPerS)} | ${f(r.functionCallsPerS)} | ${f(r.pushMBps, 2)} | ${f(r.perClientKBps, 1)} | ${f(r.dbMBps, 2)} | ${f(r.functionCallsPerMonthM, 1)} | ${f(r.dbGbPerMonth)} | ${f(r.usdPerMonth)} |`);
    }
  }
  console.log(`\nAssumes ${BUSY_HOURS_PER_DAY} busy hours/day at this load, ${MOVING_SHARE * 100}% walking, ${MAIN_HALL_SHARE * 100}% in the Main Hall. Prices are unverified placeholders; see the top of this file.`);
}
