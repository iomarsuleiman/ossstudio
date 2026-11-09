# Performance

How the 3D gallery stays fast, how to measure it, and where each item of the
performance plan stands.

## Measure first

Always profile a **production build**: `next dev` runs React in development
mode and is several times slower.

```bash
npm run build && npm start
npm run bench -- --url http://localhost:3000 --out perf/my-machine.json
```

`scripts/perf-bench.mjs` drives a real browser through what visitors do
(stand, walk, turn, click-to-move, sit, open an artwork, teleport) and
records for each: FPS, median/p95/p99 frame time, freezes (frames over
100 ms), long tasks, draw calls, triangles, live geometries/textures/shader
programs, JS heap, and main-thread time spent painting artworks.

- `--mobile` emulates a Pixel 7; `--width/--height` set the window.
- `--software-gl` is for machines without a GPU (absolute FPS is then very
  low; compare relative numbers only).
- `--compare perf/baseline-software-gl.json` exits non-zero if draw calls,
  triangles, geometries, textures, shader programs or freezes grow more than
  15 % (hardware-independent budgets, safe to run in CI).

`?debug` on any gallery URL shows a live overlay (fps, worst frame, other
visitors, live-update traffic) and exposes `window.__gallery`,
`window.__three` (renderer, scene, camera) and `window.__content`.

For deeper digging, record a Chrome Performance trace during the scenario
you care about, or capture a frame with Spector.js to inspect draw calls and
state changes.

## Before and after

Production build, Art & Design room, 1280×800, same machine. This sandbox
has no GPU, so it uses software WebGL (swiftshader): every number is lower
than on real hardware, but the before/after comparison is fair. Draw calls,
triangles and resource counts are the same on any machine.

| Scenario | FPS before | FPS after | p95 frame before | p95 after | Freezes before | after | Draw calls before | after | Triangles before | after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| standing still | 7.9 | 29.2 | 250 ms | 83 ms | 13 | 2 | 116 | 86 | 110,938 | 61,510 |
| walking | 8.5 | 21.9 | 250 ms | 83 ms | 15 | 1 | 111 | 71 | 105,193 | 54,076 |
| turning | 10 | 29.3 | 217 ms | 67 ms | 61 | 0 | 76 | 50 | 79,459 | 44,146 |
| click-to-move | 15.2 | 25.2 | 133 ms | 67 ms | 94 | 0 | 52 | 32 | 54,635 | 35,352 |
| sitting down and up | 15.6 | 22.8 | 167 ms | 83 ms | 51 | 3 | 35 | 22 | 44,408 | 29,155 |
| opening an artwork | 8.6 | 14.3 | 317 ms | 167 ms | 21 | 16 | 24 | 23 | 36,768 | 30,947 |
| teleporting | 6.1 | 10.7 | 417 ms | 217 ms | 16 | 15 | 92 | 69 | 99,766 | 52,122 |

Also: live geometries 110 → 75, distinct materials 111 → shared, main-thread
artwork painting 48 ms → 0 ms. Raw reports are in `perf/`.

A Chrome trace of opening an artwork and of teleporting shows the remaining
slow frames are GPU/compositor work (which software WebGL runs on the CPU);
JavaScript in those windows is under 100 ms in total.

## What made the difference

| Change | Why it mattered |
|---|---|
| Watercolour noise from one precomputed texture | Every painted pixel used to run two 4-octave noise functions (~32 `sin` calls). Now it's two texture reads. |
| Sky drawn after the scenery | The depth test skips sky pixels already covered by hills, arches and the walkway. |
| Shared materials and geometry | Identical paint materials, artwork panels and frames are created once and kept across room visits. |
| Merged scenery | A room's trees, distant arches/spires/ring and each layer of hills are a few meshes instead of dozens. |
| Lighter geometry | Arch tubes 160×12 → 96×8 segments, lighter sky and spheres, fewer bevel/curve segments. Indistinguishable at walking distance. |
| GPU petals | Drifting motes move in the vertex shader; no per-frame buffer upload. |
| Quality tiers | `high` (desktop): up to 1.5× resolution, MSAA on standard screens only; `medium`: 1.25×, no MSAA; `low` (phones): 1×, no petals. Override with `?quality=high|medium|low`. |
| Adaptive resolution with hysteresis | Drops at once when frames run long, recovers only after two good windows and a 4 s cooldown, so it never flickers. |
| Idle stops drawing | After 3 s with nothing moving, the canvas stops rendering entirely (no GPU or battery use) until input, a visitor nearby, or a loading texture. |
| Composited transitions | The ink wash was a clip-path under an SVG turbulence filter, re-rasterised on the CPU every frame. It's now a pre-rasterised mask grown with `transform`. The teleport veil no longer animates a full-screen blur. |
| Faded halos skipped | Invisible artwork halos no longer draw (no transparent overdraw). |
| Artworks painted in a Web Worker | `OffscreenCanvas` in `lib/paint.worker.ts`, through a priority queue (the room you're in before prefetch). Browsers without it paint on the main thread one at a time with a yield in between. |
| Only nearby rooms prepared | The room you're in plus the rooms you can walk to (the two nearest doors in the Main Hall, plus any door you approach). Everything else is released. |
| Room switch as a React transition | Mounting a room can be spread over frames; the veil waits for the new room to be committed and painted (1.1 s ceiling). |
| Avatars share resources | Remote figures share geometry and materials; cloth animation only for the nearest 8; at most 40 drawn (24 on phones). |

## Budgets

Targets per room. The `high` column is what the benchmark measures today
(Art & Design: 86 draw calls, 62k triangles at most); `medium` and `low` are
targets to confirm on real devices of those classes:

| Budget | high | medium | low |
|---|---:|---:|---:|
| Draw calls | ≤ 120 | ≤ 100 | ≤ 80 |
| Triangles | ≤ 80k | ≤ 70k | ≤ 60k |
| Render resolution | ≤ 1.5× | ≤ 1.25× | 1× |
| Other visitors drawn | 40 (8 animated capes) | 40 | 24 |
| Freezes (>100 ms) while walking | 0 | 0 | 0 |

`npm run bench -- --compare perf/baseline-software-gl.json` enforces the
hardware-independent ones.

## Status of the performance plan

**Done**
- Profiled a production build; repeatable benchmark with FPS, p95/p99, freezes, long tasks, draw calls, triangles, geometry/texture/program counts and JS heap, per scenario (walking, turning, entering rooms, teleporting, opening artwork, sitting).
- Regression check against a stored baseline (`--compare`).
- Camera and movement live outside React state; transforms update in the render loop; frame-delta-based, frame-rate-independent damping; temporary vectors reused in the movement loop.
- Movement, mouse look and click-to-move are entirely local; joystick on the left in LTR and RTL; shorter transitions.
- On-demand rendering that stops when idle; no frame work in hidden tabs.
- Shared geometry and materials; merged static scenery; fewer segments; fewer material variants.
- Quality tiers from device signals, refined by measured frame time with hysteresis; manual override via URL.
- Artwork painting in a worker with a priority queue; only the current and reachable rooms are prepared; stale prefetch dropped when you move on.
- Canvas and renderer kept alive across room changes; WebGL context loss handled without a reload.
- Map teleport loads the destination directly.
- Simple invisible hit areas for sculptures; artwork details in DOM overlays, closed until clicked; proximity chat only for nearby visitors.
- Convex: movement throttled and batched into room frames, interpolated locally, back-pressure instead of queues, chat isolated from the 3D scene (see `docs/MULTIPLAYER.md`).

**Partly done**
- *Never rebuild the scene tree on room change*: the room subtree still remounts, but its materials and panel/frame geometry now come from caches, and it mounts as a transition under the veil. Keeping recently visited rooms mounted but hidden is the next step if teleports still feel heavy on real devices.
- *React rerenders vs Three.js*: chat, presence and HUD updates don't touch the canvas tree (they live in separate components and the world reads mutable stores), but there's no automated rerender counter yet.
- *Spatial index for interactables*: rooms have ~20 artworks and ≤ 4 benches, so a linear scan per frame costs microseconds; revisit if rooms grow.

**Not applicable to this scene**
- Lightmaps, baked AO, shadow maps, SSR/SSAO, postprocessing passes: the world is unlit, painted with gradient shaders, and has no shadows or postprocessing at all.
- KTX2/Basis, glTF/Meshopt, CDN asset pipeline: there are no model or texture files; geometry is generated in code and artworks are painted at runtime. (Print-quality PNGs for collection downloads are generated separately, only on download.)

**Not done yet**
- Runs on real high-end, mid-range, low-end and mobile hardware: this sandbox has no GPU. Run `npm run bench` on each device class and keep the reports in `perf/`.
- A CI workflow running the benchmark (needs Playwright in CI; the `--compare` command is ready).
- Real-user telemetry (FPS distribution, long tasks, memory growth), 20-minute soak tests, service-worker caching, InstancedMesh/BatchedMesh for artworks, LOD for distant scenery, and the experimental items (impostors, OffscreenCanvas rendering, WebGPU).
