"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryContent, Locale, Project } from "@/content";
import { UI, dirOf } from "@/lib/i18n";
import { roomFor } from "@/lib/artworks";
import { PRICE, barcodeBars, buildCollectionPack, receiptTimestamp, saveBlob, type PackProgress } from "@/lib/giftShop";

/** The $0.00 checkout: an unrolling paper receipt, print and download. */
export function GiftShop({
  content, locale, slugs, onBack,
}: { content: GalleryContent; locale: Locale; slugs: string[]; onBack: () => void }) {
  const ui = UI[locale];
  const items = useMemo(() => slugs.map((s) => content.projects.find((p) => p.slug === s)).filter((p): p is Project => !!p), [slugs, content]);
  const [when] = useState(() => new Date());
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [status, setStatus] = useState<string>("");
  const abort = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("h2")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !abort.current) onBack(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); abort.current?.abort(); };
  }, [onBack]);

  const download = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("");
    try {
      const blob = await buildCollectionPack(items, content, locale, setProgress, ctl.signal);
      const stamp = when.toISOString().slice(0, 10);
      saveBlob(blob, `open-source-gallery-collection-${stamp}.zip`);
      setStatus(ui.downloadReady);
      setProgress((p) => (p && p.failed.length ? p : null));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setStatus(String((err as Error).message ?? err));
      setProgress(null);
    } finally {
      abort.current = null;
    }
  };

  const bars = useMemo(() => barcodeBars(), []);
  const busy = !!abort.current && !!progress;

  return (
    <div ref={root} className="giftshop" role="dialog" aria-modal="true" aria-labelledby="giftshop-title" dir={dirOf(locale)}>
      <div className="giftshop-inner">
        <div className="giftshop-side">
          <h2 id="giftshop-title" tabIndex={-1}>{ui.giftShop}</h2>
          <p className="muted">{ui.receiptNote}</p>
          <div className="giftshop-actions">
            <button type="button" className="btn btn-primary btn-large" onClick={download} disabled={busy || items.length === 0}>
              {ui.downloadCollection}
            </button>
            <button type="button" className="btn btn-large" onClick={() => window.print()}>{ui.printReceipt}</button>
            <button type="button" className="btn btn-quiet" onClick={onBack} disabled={busy}>{ui.backToShelf}</button>
          </div>
          <div className="giftshop-status" aria-live="polite">
            {progress && progress.done < progress.total && (
              <div className="progress">
                <div className="progress-bar"><span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
                <p className="small">
                  {ui.preparing(progress.done, progress.total)} · {(progress.bytes / 1024 / 1024).toFixed(1)} MB
                  {" "}<button type="button" className="link" onClick={() => abort.current?.abort()}>{ui.cancel}</button>
                </p>
              </div>
            )}
            {progress && progress.failed.length > 0 && <p className="small">{ui.downloadFailed(progress.failed.join(", "))}</p>}
            {status && <p className="small">{status}</p>}
          </div>
        </div>

        <div className="receipt-wrap print-area">
          <div className="receipt" style={{ ["--lines" as string]: items.length }}>
            <p className="receipt-shop">{ui.siteTitle}</p>
            <p className="receipt-sub">{ui.giftShop}</p>
            <p className="receipt-time">{receiptTimestamp(when, locale)}</p>
            <ul className="receipt-items">
              {items.map((p) => (
                <li key={p.slug}>
                  <span><bdi>{p.title}</bdi><small>{roomFor(content, p).t[locale].title}</small></span>
                  <span className="receipt-price">{PRICE}</span>
                </li>
              ))}
            </ul>
            <dl className="receipt-totals">
              <div><dt>{ui.subtotal}</dt><dd>{PRICE}</dd></div>
              <div><dt>{ui.tax}</dt><dd>{PRICE}</dd></div>
              <div className="is-total"><dt>{ui.total}</dt><dd>{PRICE}</dd></div>
            </dl>
            <p className="receipt-thanks">{ui.paidInCuriosity}</p>
            <div className="receipt-bars" aria-hidden="true">{bars.map((w, i) => <span key={i} style={{ width: w }} />)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
