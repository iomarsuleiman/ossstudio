import type { Project } from "@/content";

/** Lower-case, strip accents and Arabic diacritics, unify alef/ya/ta-marbuta forms. */
export function normalise(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const index = new WeakMap<Project, { title: string; body: string }>();

function fields(p: Project) {
  let f = index.get(p);
  if (!f) {
    f = {
      title: normalise(`${p.title} ${p.catalogName} ${(p.aliases ?? []).join(" ")}`),
      body: normalise([p.t.en?.oneLine, p.t.ar?.oneLine, p.t.en?.why, p.t.ar?.why].filter(Boolean).join(" ")),
    };
    index.set(p, f);
  }
  return f;
}

/** True when a and b differ by at most one edit (typo tolerance). */
function nearMiss(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function searchProjects(projects: Project[], query: string) {
  const terms = normalise(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  return projects
    .map((p) => {
      const f = fields(p);
      let score = 0;
      for (const t of terms) {
        if (f.title.startsWith(t)) score += 6;
        else if (f.title.includes(t)) score += 4;
        else if (f.body.includes(t)) score += 1;
        else if (t.length >= 4 && f.title.split(" ").some((w) => nearMiss(w, t))) score += 2;
        else return { p, score: 0 };
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title))
    .slice(0, 60)
    .map((r) => r.p);
}
