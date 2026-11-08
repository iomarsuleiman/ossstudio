# Open Source Gallery

A calm, bilingual (English / العربية) 3D art gallery of open-source software and openly available AI models. Visitors walk a small figure through painterly halls, step into artworks to read about each project, and can teleport anywhere with the map.

Built from the Notion plan **"Open Source Gallery — Experience & Architecture Plan v1"** and its **166 curated projects** database (36 Opening Collection exhibits).

## What's in it

- **Real-time 3D gallery** (React Three Fiber / Three.js): a Main Hall plus 8 visitor-friendly rooms, arched doorways you walk through, light shafts, benches, cypresses.
- **Walking only**: kinematic controller (≈1.9 m/s, eased start/stop/turn, wall sliding, prop collisions). No running, jumping or physics engine. WASD/arrows on desktop; tap-to-move on touch.
- **Cinematic camera**: high three-quarter follow camera that gently frames an artwork when you pause near it.
- **Step into an artwork**: the camera dollies into the frame, a painterly ink wash covers the screen, and a readable bilingual exhibit page appears. Esc / Back reverses it and you're exactly where you were.
- **166 artworks**, all procedurally painted (original art, no logos). The 36 Opening Collection pieces have bespoke motifs; 12 also have small animated sculptures (chess table, rotating sculpture, floating letters, LED circuit board…).
- **Map + teleport + search** (English and Arabic, diacritic-insensitive) to any room or project.
- **Accessible index** at `/{locale}/index`: every project as a plain list, never 3D-only.
- **English / Arabic** with proper RTL. Switching language keeps your room, position and open exhibit.
- **Shareable URLs**: `/{en|ar}`, `/{en|ar}/room/{room}`, `/{en|ar}/exhibit/{slug}`, `/{en|ar}?at={slug}`.
- **Sound**: original generative ambience (soft pads, sparse piano, room reverb, footsteps, paper sweeps) made with Web Audio. Silent until you choose "Enter with sound". It fades out when the tab is hidden.
- **Full-site prefetch**: once the entrance is interactive, a queue (capped concurrency, retries, re-prioritised on teleport) prepares every artwork and route chunk. It respects Save-Data and slow connections, and progress is shown truthfully ("42 of 166 artworks ready").
- **Reduced motion**: fades instead of sweeps, no camera swings, still sculptures.

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
  world/          RoomScene (architecture), Artwork, Installation, Visitor (movement + camera)
lib/
  painter.ts      Procedural painterly artworks, signs and surfaces
  audio.ts        Generative ambience and sound effects
  prefetch.ts     Whole-site prefetch queue
```

Add `?debug` to any gallery URL to expose `window.__gallery` (world state), which is useful for automated walk-through tests.

## Not done yet (later plan stages)

- Blender-authored GLB scenes and a rigged character. The current world is built from code-generated geometry in the same palette.
- Recorded or licensed music. The current soundtrack is generative.
- A Figma design system and playtest-tuned movement and camera values.
- Native-speaker review of the Arabic copy, plus a final link and licence check.
