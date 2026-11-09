// Local stand-in for a Convex deployment, for trying multiplayer without an
// account or network: runs the real functions in convex/ in memory (via
// convex-test) behind a tiny HTTP API that the gallery's dev client talks to.
//
//   npx tsx scripts/dev-backend.ts          # listens on http://localhost:3210
//   NEXT_PUBLIC_MP_DEV=http://localhost:3210 npm run dev
//
// Data lives only in memory. Not for production; not a performance model of
// Convex (use scripts/loadtest.mjs against a real deployment for that).
import http from "node:http";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";

const modules: Record<string, () => Promise<unknown>> = {
  "/convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "/convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "/convex/presence.ts": () => import("../convex/presence"),
  "/convex/chat.ts": () => import("../convex/chat"),
  "/convex/dms.ts": () => import("../convex/dms"),
  "/convex/visitorAuth.ts": () => import("../convex/visitorAuth"),
  "/convex/crons.ts": () => import("../convex/crons"),
};

const t = convexTest(schema, modules);
const port = Number(process.env.PORT ?? 3210);
// The ticker writes frames on its own schedule, so the version is just the
// clock: clients re-read their queries every poll and are only notified when
// a result actually changed.
const version = () => Math.floor(Date.now() / 200);

async function body(req: http.IncomingMessage) {
  let s = "";
  for await (const chunk of req) s += chunk;
  return JSON.parse(s || "{}");
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  try {
    if (req.url === "/version") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ version: version() })); return; }
    const { name, args } = await body(req);
    if (typeof name !== "string" || !/^(presence|chat|dms):[a-zA-Z]+$/.test(name)) throw new Error("Unknown function");
    let value: unknown;
    if (req.url === "/query") value = await t.query(makeFunctionReference<"query">(name), args ?? {});
    else if (req.url === "/mutation") value = await t.mutation(makeFunctionReference<"mutation">(name), args ?? {});
    else { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ value: value ?? null, version: version() }));
  } catch (err) {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

// The real deployment runs these on crons and the scheduler; do the same here.
setInterval(() => { void t.mutation(makeFunctionReference<"mutation">("presence:sweep"), {}).catch(() => {}); }, 30_000);
setInterval(() => { void t.mutation(makeFunctionReference<"mutation">("presence:ensureTicker"), {}).catch(() => {}); }, 2_000);

server.listen(port, () => console.log(`[dev-backend] multiplayer functions on http://localhost:${port}`));
