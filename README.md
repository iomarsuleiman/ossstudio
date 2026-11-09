# Open Source Gallery

A calm, bilingual (English / العربية) 3D art gallery of open-source software and openly available AI models. Visitors walk a small figure through painterly halls, step into artworks to read about each project, and can teleport anywhere with the map.

Built from the Notion plan **"Open Source Gallery — Experience & Architecture Plan v1"** and its **192 Projects & Artworks** database (36 Opening Collection exhibits, 5 Linux distributions, Wareed marked "Coming Soon", FileFlight flagged as unverified).

## What's in it

- **A painted 3D world** (React Three Fiber / Three.js): a Main Hall plus 8 rooms. Each is an open-air walkway over still water under a watercolour sky, in one colour per room. Arches span the path, artworks hang on arched panels, and monuments, hills and drifting petals fade into the mist beyond. Surfaces use unlit gradient "paint" shaders (`components/world/paint.ts`), so nothing looks faceted.
- **First person, with gentle movement**: you ease into a walk and glide to a stop, turns are smoothed, and the view sways and leans slightly. Walking only: no running, jumping or physics engine. Desktop: W A S D to move (the arrow keys are left alone), drag with any mouse button to look, or press L for mouse look (pointer lock, click what's under the dot; Esc releases). Touch: a soft joystick, always bottom-left (in Arabic too), and drag anywhere else to look. Click or tap the floor to walk there along a path around benches and sculptures (a soft ring marks the spot).
- **Benches**: along the walls, each facing a painting. Click one to walk over and sit (three seats, shared with other visitors); look around freely while seated; W A S D or the joystick stands you up.
- **Entrance map**: a large painted map on a pedestal in the Main Hall. Touch a glowing orb to travel to that room, or open the full map.
- **Full-screen teleport**: travelling between rooms (map, entrance map or a doorway) sweeps a painted "Travelling to…" veil across the whole screen, animated with React 19's `<ViewTransition>`. Browsers without the View Transitions API get the same motion as plain CSS.
- **Artwork details only when you ask**: walking up to a piece only makes it glow softly. Click it (from afar you walk there first) to see its card, with "Step into the artwork" and "Add to Collection".
- **Step into an artwork**: press E while looking at it, or use the card's button. The camera moves into the frame, a painterly ink wash covers the screen, and a readable bilingual exhibit page appears. Esc / Back reverses it and you're exactly where you were.
- **192 artworks**, all procedurally painted (original art, no logos). The 36 Opening Collection pieces and several newer entries (the Linux distributions, Wareed, 7-Zip, Scratch, Proxmox…) have bespoke motifs taken from Notion's artwork concepts. The rest are still lifes: a window onto a landscape, a table, and objects chosen by category, arranged differently for each project. 12 pieces also have small animated sculptures.
- **The $0.00 Gift Shop**: "Add to Collection" on every artwork (button, or the C key). It's also on exhibit pages and in the index. My Collection lets you reorder, deselect, remove, clear and teleport back to a piece. **Check out — $0.00** unrolls a printable receipt (Subtotal, Tax and Total all $0.00, "Paid in curiosity"). **Download collection** builds a ZIP in the browser containing `artworks/*.png` (high-resolution framed paintings, transparent outside the frame), `collection.md`, `collection.csv`, `receipt.html` and `licenses-and-credits.txt`. There is no account, payment or server: only item IDs are stored, in versioned localStorage, and the count stays in sync across tabs.
- **Linux Distributions** section in Behind the Scenes, under its own arch (Fedora, Arch, Mint, Debian, Ubuntu).
- **Map + teleport + search** (English and Arabic, diacritic-insensitive) to any room or project.
- **Accessible index** at `/{locale}/list`: every project as a plain list, never 3D-only. It has search with aliases (e.g. "drawio", "winutil", "7zip") and small-typo tolerance, an A–Z jump bar, room filter, All / Opening Collection / Coming soon / My collection views, Clear filters, thumbnails painted only when they scroll into view, and collect buttons.
- **Optional third-person view** (all devices): the camera follows an original cloaked figure from behind and a little above. Controls are the same as first person (W A S D or the joystick to walk, drag to look around the figure, tap to glide). The figure turns to face where it walks. Switch with the "Third person / First person" button or the V key; your choice is remembered.
- **English / Arabic** with proper RTL. Switching language keeps your room, position and open exhibit.
- **Shareable URLs**: `/{en|ar}`, `/{en|ar}/room/{room}`, `/{en|ar}/exhibit/{slug}`, `/{en|ar}?at={slug}`.
- **Sound**: original generative ambience (soft pads, sparse piano, room reverb, footsteps, paper sweeps) made with Web Audio. Silent until you choose "Enter with sound". It fades out when the tab is hidden.
- **Only where you are, and where you can go**: the room you're in and the rooms its doors lead to are prepared in the background (in the Main Hall, the two nearest doors plus any door you walk toward); everything else is released and painted again on demand. Artworks are painted in a Web Worker, the current room first. Progress shows as "12 of 30 nearby artworks ready". Print-size PNGs are made only when you download.
- **Live visitors, chat and private messages** (optional, with Convex): see other visitors walking around, talk in the room or with everyone (T opens the chat), click the 💬 above someone nearby to message them privately, with typing indicators, unread badges, read receipts, mute and block. A visitor limit with a fair waiting line keeps it calm. See [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).
- **Performance**: one persistent canvas that renders on demand and stops drawing entirely a few seconds after everything is still. Quality tiers by device (resolution cap, antialiasing only where it helps) with adaptive resolution; shared materials, merged scenery, cheap texture-based paint shaders; composited transitions. Room changes take about half a second. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for measurements and the benchmark.
- **Reduced motion**: fades instead of sweeps, no sway or lean, still sculptures and petals.

## Which projects are shown

`content/visible.ts` lists the 93 projects currently on display. The other catalogued projects stay in the code and are seeded into Convex as drafts, hidden from the gallery, map, search and list. To show one, add its name to that list. Then, if you use Convex, run `npx convex run seed:run --prod` again.

## Stack

| Part | Tech |
| --- | --- |
| App, routes, metadata | Next.js 16 (App Router) + React 19 + TypeScript |
| 3D | three + @react-three/fiber (no other 3D libraries) |
| Content database | Convex (`convex/`) |
| Fonts | Cairo (UI, Arabic) + Cormorant Garamond (English display) via `next/font` |

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without a Convex URL the site uses the bundled catalogue in `content/`, so it works immediately.

### Connect Convex

```bash
npx convex dev            # log in, create the project, writes NEXT_PUBLIC_CONVEX_URL to .env.local
npx convex run seed:run   # loads all 166 projects, rooms, translations and placements
npm run dev
```

If `npx convex dev` fails with **Could not resolve "convex/server"**, the project's packages aren't installed yet in that folder. Run `npm install` first, then `npx convex dev` again.

`convex/_generated` is committed so the app type-checks before you run `convex dev`; the CLI regenerates it.

Optional editorial access (for `admin:updateProjectText`):

```bash
npx convex env set EDITOR_TOKEN <long-random-string>
```

## Deploy

### Convex (production)

```bash
npx convex deploy
npx convex run seed:run --prod
```

### Vercel

1. Import this repository in Vercel (framework: Next.js).
2. Add environment variables:
   - `NEXT_PUBLIC_CONVEX_URL`: your production Convex URL (from the Convex dashboard).
   - `NEXT_PUBLIC_SITE_URL`: your site URL, e.g. `https://gallery.example.com` (used for the sitemap and metadata).
3. Deploy.

To have Vercel deploy Convex functions on every build as well, set the Build Command to `npx convex deploy --cmd 'npm run build'` and add `CONVEX_DEPLOY_KEY` (from Convex → Settings → Deploy keys).

If Convex is missing, empty or unreachable, pages fall back to the bundled catalogue and log a warning, so a deploy never shows an empty gallery.

## Live features (optional)

With a Convex deployment (above), visitors see each other, chat and message privately. Optional Convex environment variables:

```bash
npx convex env set GALLERY_CAPACITY 500                          # visitors inside at once (default 500)
npx convex env set QUEUE_OWNER_KEY "$(openssl rand -hex 24)"     # your private waiting-line skip
```

Try it without a Convex account: `npm run dev:backend` runs the real functions in memory, then `NEXT_PUBLIC_MP_DEV=http://localhost:3210 npm run dev`. Details, the owner shortcut, the capacity model and load testing are in [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

## Tests and benchmarks

```bash
npm test                 # backend functions (with Convex limits enforced) and pathfinding
npm run bench -- --url http://localhost:3000   # performance benchmark against `npm start`
npm run capacity         # live-features capacity and cost model
npm run loadtest -- --url https://<dev-deployment>.convex.cloud --visitors 100
```

## Project layout

```
content/          Catalogue (source of truth for the seed + offline fallback)
  projects.ts     166 projects with English + Arabic copy and curatorial cautions
  opening.ts      Opening Collection: installation ideas, "why it matters", art motifs
  rooms.ts        9 rooms, bilingual signs, palettes, placement overrides
  layout.ts       Deterministic placement of every artwork, door and bench
convex/           schema, seed, read queries, protected editor mutation,
                  presence (+ room-frame ticker), chat, dms, queue, crons, tests
app/[locale]/     gallery, room, exhibit and index routes
components/
  GalleryApp.tsx  Orchestrates world, transitions, exhibit overlay, map, audio, prefetch
  world/          RoomScene (painted world), EntranceMap, Artwork, Installation,
                  FirstPerson (movement + camera), paint.ts (shaders), shapes.ts (soft geometry)
lib/
  painter.ts      Procedural painterly artworks, signs and surfaces
  audio.ts        Generative ambience and sound effects
  prefetch.ts     Whole-site prefetch queue
```

Add `?debug` to any gallery URL to expose `window.__gallery` (world state), which is useful for automated walk-through tests.

## Not done yet (later plan stages)

- **Final artwork masters.** The paintings are generated in code from each project's concept. They are original and printable, but they are not the hand-finished art Notion tracks as "Final artwork ready".
- No service worker / installable PWA yet (optional in the plan).

- Blender-authored GLB scenes. The current world is built from code-generated geometry and shaders.
- Movement feel tuned with real playtests. The current values are first guesses.
- Recorded or licensed music. The current soundtrack is generative.
- A Figma design system and playtest-tuned movement and camera values.
- Native-speaker review of the Arabic copy, plus a final link and licence check.

