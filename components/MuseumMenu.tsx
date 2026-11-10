"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Locale } from "@/content";
import { UI, dirOf } from "@/lib/i18n";

interface Props {
  locale: Locale;
  count: number;
  sound: boolean;
  volume: number;
  view: "first" | "third";
  touch: boolean;
  mouseLook: boolean;
  onClose: () => void;
  onMap: () => void;
  onCollection: () => void;
  onSound: () => void;
  onVolume: (value: number) => void;
  onLanguage: () => void;
  onView: () => void;
  onMouseLook: () => void;
}

export function MuseumMenu(p: Props) {
  const ui = UI[p.locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  const choose = (action: () => void) => {
    dialog.current?.close();
    p.onClose();
    action();
  };

  return (
    <dialog
      ref={dialog} id="museum-menu" className="museum-menu" dir={dirOf(p.locale)}
      aria-labelledby="museum-menu-title"
      onCancel={(e) => { e.preventDefault(); p.onClose(); }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) p.onClose();
      }}
    >
      <div className="museum-menu-head">
        <div><span className="hud-site">{ui.siteTitle}</span><h2 id="museum-menu-title">{ui.menu}</h2></div>
        <button type="button" className="btn btn-quiet menu-close" onClick={p.onClose} aria-label={ui.close}>×</button>
      </div>
      <div className="museum-menu-body">
        <section className="museum-menu-section" aria-labelledby="menu-explore">
          <h3 id="menu-explore">{ui.explore}</h3>
          <button type="button" className="museum-menu-row" onClick={() => choose(p.onMap)}>
            <span>{ui.map}</span><span className="menu-key" aria-hidden="true">M</span>
          </button>
          <button type="button" className="museum-menu-row" onClick={() => choose(p.onCollection)}>
            <span>{ui.myCollection}</span><span className="menu-count">{new Intl.NumberFormat(p.locale).format(p.count)}</span>
          </button>
          <Link className="museum-menu-row" href={`/${p.locale}/list`}>{ui.index}<span aria-hidden="true">↗</span></Link>
        </section>
        <section className="museum-menu-section" aria-labelledby="menu-preferences">
          <h3 id="menu-preferences">{ui.preferences}</h3>
          <button type="button" className="museum-menu-row" onClick={p.onSound} aria-pressed={p.sound}>
            <span>{ui.sound}</span><span className="menu-value">{p.sound ? ui.on : ui.off}</span>
          </button>
          {p.sound && <label className="museum-menu-volume">
            <span>{ui.volume}</span>
            <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => p.onVolume(Number(e.target.value))} />
          </label>}
          <button type="button" className="museum-menu-row" onClick={p.onView}>
            <span>{ui.camera}</span><span className="menu-value">{p.view === "third" ? ui.viewSide : ui.viewFirst}</span>
          </button>
          {!p.touch && <button type="button" className="museum-menu-row" onClick={() => choose(p.onMouseLook)} aria-pressed={p.mouseLook}>
            <span>{ui.mouseLook}</span><span className="menu-key" aria-hidden="true">L</span>
          </button>}
          <button type="button" className="museum-menu-row" onClick={() => choose(p.onLanguage)} aria-label={ui.languageLabel}>
            <span>{ui.languageSetting}</span><span className="menu-value" lang={p.locale === "en" ? "ar" : "en"}>{ui.language}</span>
          </button>
        </section>
        <details className="museum-menu-help">
          <summary>{ui.controlsTitle}</summary>
          <p>{p.touch ? ui.controlsTouch : p.view === "third" ? ui.controlsSide : ui.controlsDesktop}</p>
        </details>
      </div>
    </dialog>
  );
}
