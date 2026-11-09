# Live features: visitors, chat, private messages, capacity

Everything live runs on Convex and is optional: without
`NEXT_PUBLIC_CONVEX_URL` the gallery works exactly as before, and if Convex
fails or is overloaded the gallery keeps working while live features pause.

## What visitors get

- **Other visitors** walking around as figures in their own colour with name
  tags, smoothly interpolated. Counts in the corner ("3 here · 12 in the
  gallery") and per room on the map.
- **Chat** (button or `T`): *This room*, *Everyone* (gallery-wide), *Private*,
  and *Settings*. Room and gallery messages are kept, so the next visitors
  see them. Typing indicators, “Load earlier messages”.
- **Private messages**: walk up to someone and click the 💬 bubble above
  them (within 3.5 m), or choose *Message privately* on a chat name.
  Conversations belong to your lasting anonymous identity (kept in
  localStorage), so they survive changing rooms, leaving and coming back.
  Unread badges, a toast, a `(n)` in the tab title, online/away and the room
  they're in, *Seen* receipts.
- **Safety**: turn off new private messages (people you already talk with can
  still reach you), mute (hides someone on this device; they aren't told),
  block (server-enforced in both directions; hides their messages and their
  💬 bubble).
- **Shared benches**: three seats per bench; seats are claimed on the server
  so two people can't take the same one.
- **Capacity and a waiting line** (below).

## Architecture

```
browser ──join/move/sit (throttled)──▶ presence rows (one per visitor, nobody subscribes)
                                             │
                     ticker (action, every 0.5–1 s): read changes → fold into
                                             ▼
browser ◀──subscribe frame(room)────── roomFrames (one compact doc per room)
browser ◀──subscribe counts─────────── roomCounts (sharded counters)
browser ◀──subscribe chat/dms───────── messages, conversations, directMessages
```

- **Movement** writes only the visitor's own `presence` row: one mutation, two
  index reads, one write. Clients send only when they moved (≥ 12 cm or
  ~7°), at the interval the server recommends for the room's crowd (200 ms
  alone → 1.2 s in a packed room), never more than one request in flight
  (back-pressure, no stale queue), with exponential back-off on errors and a
  slower rate when round trips exceed 1.5 s. Standing still sends a
  heartbeat every 15 s.
- **Room frames**: a single ticker loop (guarded by a generation number) reads
  changed presence rows with a *query* (snapshot reads never conflict with
  movement writes), then writes one compact frame per changed room. It looks
  250 ms into the past so it never races in-flight writes. A room's traffic
  is frames/s × viewers × frame size, however often people move. Frames carry
  up to 120 people (80 in a packed room), the most recently active first.
- **Smoothing**: clients draw others slightly in the past (snapshot
  interpolation), with the delay following the measured frame cadence, plus
  light final damping. Only the nearest 40 are drawn (24 on phones), capes
  animate only for the nearest 8, and materials are shared.
- **Departures** are explicit (`leave`, `changeRoom`, timeouts), so people
  vanish from frames immediately. A 30 s cron removes tabs that closed
  without saying goodbye (45 s timeout) and a 10 min cron rebuilds the
  counters.
- **Chat** is separate from presence and from the 3D scene: messages never
  re-render the canvas. Server-side limits: 500 characters, control/bidi
  characters stripped, one message per 0.7 s per visitor, pages of 50.
- **Degradation**: an error boundary around everything live; a connection
  watcher shows *Offline: you can keep exploring*; seat requests time out to
  "allowed"; the waiting line lets people in if the backend is down or very
  slow.

## Capacity and the waiting line

`GALLERY_CAPACITY` (Convex environment variable, default 500) caps how many
people are inside. `presence.join` enforces it on the server, so it can't be
bypassed. When full, arriving visitors take a ticket and see “You're number
12 in line”; positions are worked out from ticket numbers, so a long line
costs nothing extra to watch. The ticker admits the next people as others
leave. A tab that stops pinging (60 s) loses its place, and an admitted
visitor who doesn't arrive within 2 minutes frees the slot. While waiting,
visitors can browse the list of all projects.

```bash
npx convex env set GALLERY_CAPACITY 500
```

### Owner skip

Only for you: **⌘⇧O / Ctrl+Shift+O** moves you 5 places forward; add
**⌥/Alt** (⌘⌥⇧O / Ctrl+Alt+Shift+O) to skip the line entirely, even when
the gallery is full. Nothing about it is visible on the page, and it is
checked by the server, so knowing the shortcut is useless without the key.

1. Create a long random key and store it in Convex:
   ```bash
   npx convex env set QUEUE_OWNER_KEY "$(openssl rand -hex 24)"
   npx convex env get QUEUE_OWNER_KEY
   ```
2. On each browser you use, open the site once as
   `https://your-site/en#owner=<the key>`. The part after `#` is never sent
   to any server or log; the key is saved in that browser and immediately
   removed from the address bar.
3. When you're in the line, press the shortcut.

Some browsers reserve ⌘⇧O (Chrome on Mac uses it for the bookmark manager)
and never pass it to the page; if nothing happens, use Ctrl+Shift+O, or
⌘⌥⇧O for the full skip. To revoke a key, set a new `QUEUE_OWNER_KEY`.

## Convex limits that matter here

Without network access to docs.convex.dev from the build environment, these
come from what the code and tests can verify plus prior knowledge; check
them against https://docs.convex.dev/production/state/limits and
https://www.convex.dev/pricing before relying on them.

- **Per transaction** (verified: these are the defaults `convex-test`
  enforces, and our scale tests run with them on): 32,000 documents read,
  16,000 written, 16 MiB read, 16 MiB written, 4,096 index ranges.
  Every multiplayer function stays far inside them with 5,000 visitors.
- **Documents**: up to 1 MiB each; a 120-person room frame is ~12 KB.
- **Subscriptions** re-run when a document or index range they read changes,
  and each subscriber receives the new result. That's why clients subscribe
  to frames and counters, never to the presence rows themselves.
- **Write conflicts (OCC)**: concurrent writes to one document retry. Counters
  are sharded 8 ways; the ticker reads with a query so movement writes never
  conflict with it.
- **Billing** (unverified, see the pricing page): function calls (mutations,
  and query executions including subscription re-runs), database bandwidth
  (bytes read/written), storage, plus a per-seat plan. Placeholder prices
  are at the top of `scripts/capacity-model.mjs`.

## Capacity model

`npm run capacity` turns the real send rates and measured payload sizes
(99 B per person in a frame, from `convex/scale.test.ts`) into load and cost.
Assumptions: 40 % of visitors walking at any time, 25 % in the Main Hall,
4 busy hours a day.

**Batched room frames (current design)**

| Visitors | Busiest room | Send interval | Writes/s | Function calls/s | Sync out (MB/s) | Per visitor (KB/s) | DB reads (MB/s) | Calls/month (M) | Est. $/month* |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 3 | 200 ms | 20 | 47 | 0.00 | 0.4 | 0.02 | 20 | 25 |
| 100 | 25 | 300 ms | 137 | 168 | 0.36 | 3.6 | 0.15 | 72 | 123 |
| 500 | 125 | 800 ms | 383 | 417 | 5.58 | 11.2 | 0.40 | 180 | 360 |
| 1,000 | 250 | 1.2 s | 498 | 555 | 18.4 | 18.4 | 0.55 | 240 | 492 |
| 5,000 | 1,250 | 1.2 s | 1,867 | 2,096 | 276 | 55.1 | 1.60 | 906 | 1,914 |

**First design (every step re-sent the whole room to everyone in it)**, for comparison:
485 KB/s per visitor at 500 visitors and 4.2 MB/s at 5,000, which isn't workable.
Batching cut that by 40–80×.

\* Unverified placeholder prices; the shape (movement writes dominate cost)
matters more than the dollar figures.

What this suggests:
- **Up to ~1,000 concurrent visitors** fits comfortably on Convex with this design.
- **Beyond that**, cost is dominated by movement mutations, not fan-out. The
  next levers are a slower movement rate for distant or idle visitors,
  per-zone frames (subscribe only to nearby parts of long halls), and,
  if dense high-frequency movement is needed, a dedicated ephemeral transport
  (e.g. a WebSocket relay) for positions, keeping Convex for chat, presence
  and everything durable. `GALLERY_CAPACITY` keeps you inside whatever budget
  you choose meanwhile.

## Load testing

`scripts/loadtest.mjs` simulates visitors who join, walk in bursts at the
server-recommended rate, sit, chat now and then, and watch their room's
frame, over real WebSocket connections. It reports mutation latency
(p50/p95/p99), frame staleness (how old the newest position is when it
arrives), frames and KB per second per visitor, errors and, with
`--browser`, the frame rate of a real browser in the crowded room.

```bash
# use a dev or staging deployment, never production
npx convex env set GALLERY_CAPACITY 10000
npm run loadtest -- --url https://<deployment>.convex.cloud --visitors 100 --duration 120
npm run loadtest -- --url ... --visitors 500 --browser http://localhost:3000/en/room/art
# 1,000–5,000: several processes or machines, each with --shard i/n --json, then add up
```

Bots use tokens starting with `loadtest-` and are swept 45 s after the run.

### Results so far

The build environment can't reach Convex's servers, so the Convex-specific
numbers above (latency, real fan-out and cost at 500–5,000) still need a run
against a real deployment. What has been run:

- **Scale tests** (`convex/scale.test.ts`, Convex transaction limits
  enforced): with 5,000 visitors, counts, frames, joins, moves, seats, room
  changes, a mass disconnect (swept in 10 batches) and a 3,000-message chat
  history all stay within limits.
- **Functional load runs** against the local backend (`npm run dev:backend`,
  the real functions in memory; not a Convex benchmark):

| Bots in one room | Mutation p50 / p95 | Frames per visitor | KB/s per visitor | Newest position age (p50 / p95) | Errors |
|---:|---:|---:|---:|---:|---|
| 10 | 2 / 3 ms | 1.1/s | 1.2 | 478 / 783 ms | none |
| 100 | 2 / 4 ms | 2.0/s | 20.3 | 409 / 543 ms | none |

  100 people in a single room is the dense case; it matches the model
  (frames of ~10 KB, twice a second).

## Running it locally

```bash
npm run dev:backend                                   # real functions in memory on :3210
NEXT_PUBLIC_MP_DEV=http://localhost:3210 npm run dev  # gallery talks to it
GALLERY_CAPACITY=2 QUEUE_OWNER_KEY=dev-owner-key-0123456789 npm run dev:backend   # try the waiting line
```

Open two browser windows (or one private) to see each other.

## Tests

`npm test` runs 37 tests: presence, counts, frames and the ticker, seats,
chat (persistence, paging, limits, typing), private messages (privacy,
unread, receipts, blocks, opt-out), the waiting line and owner skip, scale
with 5,000 visitors, and click-to-move pathfinding.
