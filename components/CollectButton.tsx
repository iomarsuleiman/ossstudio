"use client";

import { useState } from "react";
import type { Locale } from "@/content";
import { UI } from "@/lib/i18n";
import { collection, useCollection } from "@/lib/collection";

/** Add/remove an artwork from the visitor's free collection. */
export function CollectButton({ slug, locale, small }: { slug: string; locale: Locale; small?: boolean }) {
  const ui = UI[locale];
  const items = useCollection();
  const saved = items.includes(slug);
  const [pulse, setPulse] = useState(0);
  return (
    <button
      type="button"
      className={`btn collect${saved ? " is-saved" : ""}${small ? " btn-small" : ""}`}
      aria-pressed={saved}
      onClick={() => {
        collection.toggle(slug);
        setPulse((n) => n + 1);
      }}
      title={saved ? ui.removeFromCollection : ui.addToCollection}
    >
      <span className="collect-icon" key={pulse} aria-hidden="true">{saved ? "✓" : "+"}</span>
      {saved ? ui.inCollection : ui.addToCollection}
    </button>
  );
}
