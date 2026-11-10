// Anonymous visitor identity and locally muted names for room and gallery chat.
import { useSyncExternalStore } from "react";

const TOKEN_KEY = "osg:mp:token";
const MUTE_KEY = "osg:mp:muted";

let memoryToken: string | null = null;

export function identityToken() {
  if (memoryToken) return memoryToken;
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && saved.length >= 32) return (memoryToken = saved);
  } catch { /* storage unavailable: a token for this tab only */ }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  memoryToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem(TOKEN_KEY, memoryToken); } catch { /* ignore */ }
  return memoryToken;
}

type Muted = Record<string, string>; // visitorId → name (for the settings list)
let muted: Muted | null = null;
const listeners = new Set<() => void>();

function load(): Muted {
  if (muted) return muted;
  try { muted = JSON.parse(localStorage.getItem(MUTE_KEY) ?? "{}") as Muted; } catch { muted = {}; }
  return muted!;
}

function save(next: Muted) {
  muted = next;
  try { localStorage.setItem(MUTE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const mutes = {
  has: (id: string) => id in load(),
  toggle(id: string, name: string) {
    const next = { ...load() };
    if (id in next) delete next[id]; else next[id] = name;
    save(next);
  },
  all: () => load(),
  subscribe(fn: () => void) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => { if (e.key === MUTE_KEY) { muted = null; fn(); } };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
  },
};

const EMPTY: Muted = {};
export function useMutes(): Muted {
  return useSyncExternalStore(mutes.subscribe, () => load(), () => EMPTY);
}

// --- Owner key (for skipping the waiting line) ----------------------------------
// Opened once as /en#owner=<key>: the fragment never reaches a server or its
// logs. The key is kept in this browser only and the address bar is cleaned.
// The server checks it against QUEUE_OWNER_KEY; without a match nothing happens.
const OWNER_KEY = "osg:owner";

export function ownerKey(): string | null {
  try {
    const m = window.location.hash.match(/owner=([^&]+)/);
    if (m) {
      localStorage.setItem(OWNER_KEY, decodeURIComponent(m[1]));
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
