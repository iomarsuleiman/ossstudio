// "My Collection": the visitor's saved artworks. Local-first and private:
// only stable exhibit IDs (project slugs) and their order are stored, in
// versioned localStorage. No account, no server, no images in storage.
"use client";

import { useSyncExternalStore } from "react";

const KEY = "osg:collection";
const VERSION = 1;

interface Stored {
  v: number;
  items: string[];
}

let items: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Stored;
    if (data.v !== VERSION || !Array.isArray(data.items)) return [];
    return [...new Set(data.items.filter((x) => typeof x === "string"))];
  } catch {
    return [];
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, items } satisfies Stored));
  } catch {
    /* storage full or blocked: the collection still works for this visit */
  }
}

function ensure() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  items = read();
  // Keep the count in sync across tabs.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    items = read();
    emit();
  });
}

function emit() {
  listeners.forEach((l) => l());
}

export const collection = {
  get(): string[] {
    ensure();
    return items;
  },
  has(slug: string) {
    ensure();
    return items.includes(slug);
  },
  /** Adding twice keeps a single entry. */
  add(slug: string) {
    ensure();
    if (items.includes(slug)) return;
    items = [...items, slug];
    write();
    emit();
  },
  remove(slug: string) {
    ensure();
    items = items.filter((s) => s !== slug);
    write();
    emit();
  },
  toggle(slug: string) {
    if (collection.has(slug)) collection.remove(slug);
    else collection.add(slug);
  },
  clear() {
    items = [];
    write();
    emit();
  },
  move(slug: string, delta: number) {
    const i = items.indexOf(slug);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    items = next;
    write();
    emit();
  },
  subscribe(fn: () => void) {
    ensure();
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

const EMPTY: string[] = [];

/** React hook: the current collection (empty during server rendering). */
export function useCollection(): string[] {
  return useSyncExternalStore(collection.subscribe, collection.get, () => EMPTY);
}
