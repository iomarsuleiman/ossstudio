"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

/** Keyboard-accessible dropdown styled for the gallery: replaces the browser's native select. */
export function RoomFilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const listboxId = useId();

  const openAndFocus = (from: "first" | "current") => {
    setOpen(true);
    requestAnimationFrame(() => {
      const items = pop.current?.querySelectorAll<HTMLElement>('[role="option"]');
      if (!items) return;
      const idx = [...items].findIndex((el) => el.getAttribute("aria-selected") === "true");
      const target = from === "current" && idx >= 0 ? items[idx] : items[0];
      target?.focus();
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (open) pop.current?.focus(); }, [open]);

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAndFocus(e.key === "ArrowDown" ? "first" : "current");
    }
    // Enter/Space are handled by the native <button> click.
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...pop.current!.querySelectorAll<HTMLElement>('[role="option"]')];
    const i = e.target instanceof HTMLElement ? items.indexOf(e.target) : -1;
    if (e.key === "ArrowDown") { e.preventDefault(); items[i + 1]?.focus(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0) { pop.current?.querySelector<HTMLElement>("button")?.focus(); setOpen(false); }
      else items[i - 1]?.focus();
    }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); wrap.current?.querySelector<HTMLElement>("button")?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className="select">
      <div className="menu" ref={wrap}>
        <button
          type="button"
          className="btn menu-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={`${label}: ${current.label}`}
          onClick={() => (open ? setOpen(false) : openAndFocus("current"))}
          onKeyDown={onTriggerKey}
        >
          {current.label}
          <span className="menu-chev" aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="menu-pop" ref={pop} tabIndex={-1} onKeyDown={onMenuKey}>
            <ul role="listbox" id={listboxId} aria-label={label}>
              {options.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    className="menu-opt"
                    onClick={() => { onChange(o.value); setOpen(false); wrap.current?.querySelector<HTMLElement>("button")?.focus(); }}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
