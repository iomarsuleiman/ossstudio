// Visual quality tiers, chosen from device signals and refined at run time
// by measured frame times (see components/world/FrameDriver.tsx).
//
//   high    desktop-class: up to 1.5× resolution, antialiasing on standard screens
//   medium  laptops/tablets: up to 1.25×, no antialiasing
//   low     phones and small devices: 1×, no antialiasing, no drifting petals
//
// Override with ?quality=high|medium|low (remembered in this browser).

export type Quality = "high" | "medium" | "low";

export interface QualitySettings {
  tier: Quality;
  maxDpr: number;
  minDpr: number;
  antialias: boolean;
}

const KEY = "osg:quality";

export function pickQuality(): QualitySettings {
  let tier: Quality | null = null;
  try {
    const asked = new URLSearchParams(window.location.search).get("quality");
    if (asked === "high" || asked === "medium" || asked === "low") { tier = asked; localStorage.setItem(KEY, asked); }
    else {
      const saved = localStorage.getItem(KEY);
      if (saved === "high" || saved === "medium" || saved === "low") tier = saved;
    }
  } catch { /* storage unavailable */ }
  if (!tier) {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const cores = nav.hardwareConcurrency ?? 4;
    const memory = nav.deviceMemory ?? 8;
    if (nav.connection?.saveData || (coarse && (cores <= 4 || memory <= 4))) tier = "low";
    else if (coarse || cores <= 4 || memory <= 4) tier = "medium";
    else tier = "high";
  }
  const dpr = window.devicePixelRatio || 1;
  const cap = tier === "high" ? 1.5 : tier === "medium" ? 1.25 : 1;
  return {
    tier,
    maxDpr: Math.min(dpr, cap),
    minDpr: tier === "low" ? 0.6 : 0.75,
    // On dense screens extra pixels already smooth edges; MSAA would only cost fill rate.
    antialias: tier === "high" && dpr < 1.5,
  };
}
