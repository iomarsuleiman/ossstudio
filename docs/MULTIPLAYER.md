# Live features: visitors, public chat, and capacity

Live features run on Convex. Without `NEXT_PUBLIC_CONVEX_URL`, the museum uses the bundled catalogue. If the live connection fails, visitors can keep exploring.

## Visitor-facing features

- Other visitors are visible in the same room, with names and smoothly interpolated movement.
- Room and gallery counts appear in the interface, with per-room counts on the map.
- Public room chat stays with the room. Gallery-wide chat reaches everyone.
- Persistent message history includes an option to load earlier messages.
- Typing indicators show who is composing in the current channel.
- Shared benches have server-managed seats.
- A waiting line manages entry when capacity is full.

Press `T` or use the chat button. On mobile, chat opens as a bottom sheet and the joystick hides while it is open. Settings let visitors rename themselves and manage people muted on their device.

## Architecture

```text
browser -- join/move/sit --> presence rows
                               |
                        room-frame ticker
                               |
browser <-- frame(room) --- roomFrames
browser <-- counts -------- roomCounts
browser <-- public chat --- messages
browser <-- queue status -- waiting line
```

Movement updates the visitor's presence row. Clients throttle updates, send heartbeats while still, and back off on errors. The ticker folds changed positions into compact room frames. Clients subscribe to their room's frame rather than each presence row, and interpolate snapshots to smooth movement.

Sharded room counters supply gallery and map counts. Departures and timeout sweeps remove inactive visitors; periodic reconciliation repairs counts. Seat claims run on the server so visitors cannot claim the same seat.

Public chat runs separately from presence and the 3D scene. The server validates channels, limits message length to 500 characters, strips control and bidi characters, and rate-limits sends. History loads in bounded batches. Typing status expires when a visitor stops composing.

## Capacity and the waiting line

`GALLERY_CAPACITY` controls admission, with a default of 500 visitors. When full, arriving visitors receive tickets and can browse the project list while waiting. The server admits visitors as spaces become available. Inactive tickets and unused admissions expire.

```bash
npx convex env set GALLERY_CAPACITY 500
```

An optional `QUEUE_OWNER_KEY` enables the owner's queue shortcuts. Set a long random value in Convex, then open `https://your-site/en#owner=<key>` on your own browser. The client stores the key and removes the fragment. While waiting, Ctrl+Shift+O moves forward five places; Ctrl+Alt+Shift+O skips the line. The server checks the key. Rotate it to revoke access.

## Running locally

Install dependencies with `npm ci`. For a connected deployment, run `npx convex dev` and seed it with `npx convex run seed:run`.

To try live features without a Convex account, run `npm run dev:backend` in one terminal. In a second PowerShell terminal:

```powershell
$env:NEXT_PUBLIC_MP_DEV = "http://localhost:3210"
npm run dev
```

Open two browser sessions to check presence, public chat and shared seats. Set `GALLERY_CAPACITY=2` in the backend process environment to exercise the waiting line.

## Tests and scale tests

```bash
npm run lint
npm test
npm run build
npm run capacity
```

Tests cover presence, counts, frames and the ticker, seats, public chat persistence, paging, limits and typing, queue admission and owner shortcuts, scale, layout and click-to-move pathfinding.

`convex/scale.test.ts` exercises 5,000 visitors with Convex transaction limits enforced. It checks counts, frames, movement, seats, room changes, disconnect sweeps and a large public message history. These in-memory tests do not measure deployed latency or production throughput.

`scripts/capacity-model.mjs` estimates traffic from send rates and payload sizes. Its prices and workload assumptions are placeholders, not a hosting quote or a capacity guarantee.

## Load tests

Use a dedicated development or staging deployment. Load tests create visitors, move them, claim seats, send public chat messages and subscribe to room frames.

```bash
npm run loadtest -- --url https://<staging-deployment>.convex.cloud --visitors 100 --duration 120
```

The runner reports mutation latency, frame staleness, bandwidth and errors. Optional `--browser http://localhost:3000/en/room/art` measures a browser in the crowded room. Large runs can be split with `--shard i/n --json`. Set staging capacity high enough for the run and restore it afterward. Review deployment measurements before raising production capacity.
