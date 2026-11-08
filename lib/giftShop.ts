// The $0.00 Gift Shop: receipt text and the downloadable collection pack.
// Entirely local: no payment, no account, no server call.
"use client";

import { OPENNESS_TEXT, type GalleryContent, type Locale, type Project } from "@/content";
import { UI } from "./i18n";
import { framedPng } from "./framedExport";
import { roomFor } from "./artworks";
import { ZipWriter } from "./zip";

export const PRICE = "$0.00";

export function receiptTimestamp(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Decorative barcode bars. Purely ornamental: derived from nothing personal. */
export function barcodeBars(n = 48) {
  const bars: number[] = [];
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    bars.push(1 + Math.floor((seed / 233280) * 3));
  }
  return bars;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function receiptHtml(items: Project[], content: GalleryContent, locale: Locale, when: Date) {
  const ui = UI[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const rows = items
    .map((p) => `<tr><td><bdi>${esc(p.title)}</bdi><div class="room">${esc(roomFor(content, p).t[locale].title)}</div></td><td class="price">${PRICE}</td></tr>`)
    .join("");
  const bars = barcodeBars().map((w) => `<span style="width:${w}px"></span>`).join("");
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ui.receiptTitle)} — ${esc(ui.siteTitle)}</title>
<style>
  body { margin: 0; padding: 24px; background: #efe3cf; font-family: "Courier New", ui-monospace, monospace; color: #2f2a2a; }
  .receipt { max-width: 360px; margin: 0 auto; background: #fbf8f1; padding: 28px 22px; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
  h1 { font: 600 22px Georgia, serif; text-align: center; margin: 0 0 4px; }
  .sub, .time, .thanks { text-align: center; font-size: 12px; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  td { padding: 6px 0; border-bottom: 1px dashed #c9bfae; vertical-align: top; }
  .price { text-align: end; white-space: nowrap; padding-inline-start: 12px; }
  .room { font-size: 11px; color: #776; }
  .totals td { border: 0; padding: 3px 0; }
  .total td { font-weight: 700; font-size: 15px; border-top: 2px solid #2f2a2a; padding-top: 8px; }
  .bars { display: flex; justify-content: center; gap: 2px; height: 46px; margin: 18px 0 8px; }
  .bars span { background: #2f2a2a; display: block; }
  @media print { body { background: none; padding: 0; } .receipt { box-shadow: none; max-width: 80mm; } }
</style>
</head>
<body>
<div class="receipt">
  <h1>${esc(ui.siteTitle)}</h1>
  <p class="sub">${esc(ui.giftShop)}</p>
  <p class="time">${esc(receiptTimestamp(when, locale))}</p>
  <table>${rows}</table>
  <table class="totals">
    <tr><td>${esc(ui.subtotal)}</td><td class="price">${PRICE}</td></tr>
    <tr><td>${esc(ui.tax)}</td><td class="price">${PRICE}</td></tr>
    <tr class="total"><td>${esc(ui.total)}</td><td class="price">${PRICE}</td></tr>
  </table>
  <p class="thanks">${esc(ui.paidInCuriosity)}</p>
  <div class="bars" aria-hidden="true">${bars}</div>
  <p class="sub">${esc(ui.receiptNote)}</p>
</div>
</body>
</html>`;
}

function opennessLabel(p: Project) {
  return OPENNESS_TEXT[p.openness].en.label;
}

export function collectionMarkdown(items: Project[], content: GalleryContent, locale: Locale) {
  const ui = UI[locale];
  const lines = [`# ${ui.myCollection} — ${ui.siteTitle}`, "", `${items.length} ${ui.itemsWord}`, ""];
  for (const p of items) {
    const t = p.t[locale] ?? p.t.en;
    lines.push(`## ${p.title}`, "", t.oneLine, "");
    if (t.why) lines.push(`**${ui.whyItMatters}:** ${t.why}`, "");
    lines.push(`- ${ui.foundIn}: ${roomFor(content, p).t[locale].title}`);
    lines.push(`- ${ui.openness}: ${OPENNESS_TEXT[p.openness][locale].label}`);
    if (p.site) lines.push(`- ${ui.visitWebsite}: ${p.site}`);
    if (p.source && p.source !== p.site) lines.push(`- ${ui.viewSource}: ${p.source}`);
    if (t.caution) lines.push(`- ${ui.goodToKnow}: ${t.caution}`);
    lines.push("");
  }
  return lines.join("\n");
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function collectionCsv(items: Project[], content: GalleryContent) {
  const head = ["id", "name", "room", "openness", "status", "official_site", "source", "description"];
  const rows = items.map((p) => [
    p.slug, p.title, roomFor(content, p).t.en.title, opennessLabel(p), p.comingSoon ? "Coming soon" : "On display",
    p.site, p.source, p.t.en.oneLine,
  ].map(csvCell).join(","));
  // BOM so spreadsheet apps read UTF-8 (Arabic) correctly.
  return "﻿" + [head.join(","), ...rows].join("\r\n");
}

export function creditsText(items: Project[], locale: Locale, when: Date) {
  const ui = UI[locale];
  return [
    `${ui.siteTitle} — ${ui.licensesTitle}`,
    receiptTimestamp(when, locale),
    "",
    ui.licensesBody,
    "",
    ...items.map((p) => `- ${p.title} (${p.slug}.png): ${ui.artCredit} ${p.title} ${ui.trademarkNote}`),
    "",
  ].join("\n");
}

export function fileSafe(s: string) {
  return s.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "artwork";
}

export interface PackProgress {
  done: number;
  total: number;
  bytes: number;
  failed: string[];
}

/** Builds the collection ZIP. Artworks are rendered one at a time to stay light on memory. */
export async function buildCollectionPack(
  items: Project[],
  content: GalleryContent,
  locale: Locale,
  onProgress: (p: PackProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const zip = new ZipWriter();
  const when = new Date();
  const progress: PackProgress = { done: 0, total: items.length, bytes: 0, failed: [] };
  onProgress({ ...progress });
  for (const [i, p] of items.entries()) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    try {
      const png = await framedPng(p, roomFor(content, p));
      await zip.add(`artworks/${String(i + 1).padStart(2, "0")}-${fileSafe(p.slug)}.png`, png);
      progress.bytes += png.size;
    } catch {
      progress.failed.push(p.title);
    }
    progress.done++;
    onProgress({ ...progress, failed: [...progress.failed] });
    await new Promise((r) => setTimeout(r, 0)); // let the page breathe between artworks
  }
  await zip.add("collection.md", collectionMarkdown(items, content, locale));
  await zip.add("collection.csv", collectionCsv(items, content));
  await zip.add("receipt.html", receiptHtml(items, content, locale, when));
  await zip.add("licenses-and-credits.txt", creditsText(items, locale, when));
  return zip.finish();
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
