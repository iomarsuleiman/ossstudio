# Open Source Gallery

A calm, bilingual (English / العربية) 3D art gallery of open-source software and openly available AI models. Visitors walk a small figure through painterly halls, step into artworks to read about each project, and can teleport anywhere with the map.

Built from the Notion plan **"Open Source Gallery — Experience & Architecture Plan v1"** and its **192 Projects & Artworks** database (36 Opening Collection exhibits, 5 Linux distributions, Wareed marked "Coming Soon", FileFlight flagged as unverified).

## What's in it

- **A painted 3D world** (React Three Fiber / Three.js): a Main Hall plus 8 rooms. Each is an open-air walkway over still water under a watercolour sky, in one colour per room. Arches span the path, artworks hang on arched panels, and monuments, hills and drifting petals fade into the mist beyond. Surfaces use unlit gradient "paint" shaders (`components/world/paint.ts`), so nothing looks faceted.
- **First person, with gentle movement**: you ease into a walk and glide to a stop, turns are smoothed, and the view sways and leans slightly. Walking only: no running, jumping or physics engine. Desktop: W A S D to move, drag to look, arrow keys to turn. Touch: a soft joystick to walk and drag anywhere else to look. Tap an artwork to glide up to it, or tap the floor to drift there.
- **Entrance map**: a large painted map on a pedestal in the Main Hall. Touch a glowing orb to travel to that room, or open the full map.
- **Full-screen teleport**: travelling between rooms (map, entrance map or a doorway) sweeps a painted "Travelling to…" veil across the whole screen, animated with React 19's `<ViewTransition>`. Browsers without the View Transitions API get the same motion as plain CSS.
- **Step into an artwork**: look at it and press E (or tap it). The camera moves into the frame, a painterly ink wash covers the screen, and a readable bilingual exhibit page appears. Esc / Back reverses it and you're exactly where you were.
- **192 artworks**, all procedurally painted (original art, no logos). The 36 Opening Collection pieces and several newer entries (the Linux distributions, Wareed, 7-Zip, Scratch, Proxmox…) have bespoke motifs taken from Notion's artwork concepts. The rest are still lifes: a window onto a landscape, a table, and objects chosen by category, arranged differently for each project. 12 pieces also have small animated sculptures.
- **The $0.00 Gift Shop**: "Add to Collection" on every artwork (button, or the C key). It's also on exhibit pages and in the index. My Collection lets you reorder, deselect, remove, clear and teleport back to a piece. **Check out — $0.00** unrolls a printable receipt (Subtotal, Tax and Total all $0.00, "Paid in curiosity"). **Download collection** builds a ZIP in the browser containing `artworks/*.png` (high-resolution framed paintings, transparent outside the frame), `collection.md`, `collection.csv`, `receipt.html` and `licenses-and-credits.txt`. There is no account, payment or server: only item IDs are stored, in versioned localStorage, and the count stays in sync across tabs.
- **Linux Distributions** section in Behind the Scenes, under its own arch (Fedora, Arch, Mint, Debian, Ubuntu).
- **Map + teleport + search** (English and Arabic, diacritic-insensitive) to any room or project.
- **Accessible index** at `/{locale}/list`: every project as a plain list, never 3D-only. It has search with aliases (e.g. "drawio", "winutil", "7zip") and small-typo tolerance, an A–Z jump bar, room filter, All / Opening Collection / Coming soon / My collection views, Clear filters, thumbnails painted only when they scroll into view, and collect buttons.
- **Optional third-person view** (all devices): the camera follows an original cloaked figure from behind and a little above. Controls are the same as first person (W A S D or the joystick to walk, drag to look around the figure, tap to glide). The figure turns to face where it walks. Switch with the "Third person / First person" button or the V key; your choice is remembered.
- **English / Arabic** with proper RTL. Switching language keeps your room, position and open exhibit.
- **Shareable URLs**: `/{en|ar}`, `/{en|ar}/room/{room}`, `/{en|ar}/exhibit/{slug}`, `/{en|ar}?at={slug}`.
- **Sound**: original generative ambience (soft pads, sparse piano, room reverb, footsteps, paper sweeps) made with Web Audio. Silent until you choose "Enter with sound". It fades out when the tab is hidden.
- **Full-site prefetch**: once the entrance is interactive, a queue prepares every artwork and route chunk. It runs 1 connection on phones and 2 elsewhere, retries failures, re-prioritises on teleport, pauses in hidden tabs and respects Save-Data. Progress is shown truthfully ("42 of 192 artworks ready"). Print-size PNGs are never prefetched; they are made only when you download.
- **Performance**: one persistent canvas that renders on demand. It draws every frame while you move, about 12 fps while you stand still, and nothing behind an open exhibit page or in a hidden tab. Pixel ratio is capped (1.5 on phones, 1.75 on desktop) and adapts to measured frame time. Each room frees its textures when you leave, and teleports lift the veil as soon as the destination's artworks are ready instead of waiting a fixed time.
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

## Project layout

```
content/          Catalogue (source of truth for the seed + offline fallback)
  projects.ts     166 projects with English + Arabic copy and curatorial cautions
  opening.ts      Opening Collection: installation ideas, "why it matters", art motifs
  rooms.ts        9 rooms, bilingual signs, palettes, placement overrides
  layout.ts       Deterministic placement of every artwork, door and bench
convex/           schema, seed, read queries, protected editor mutation
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

