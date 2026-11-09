import { RAW_PROJECTS, type CategoryCode, type OpennessCode } from "./projects";
import { RAW_ROOMS, CATEGORY_ROOM, ROOM_OVERRIDES, type RoomId } from "./rooms";
import { OPENING, type Motif } from "./opening";
import { ALIASES, EXTRA_MOTIFS, NEW_PROJECTS, curatedRoom } from "./catalogue-2";
import { isShown } from "./visible";
import { layoutGallery, type ExhibitPlacement, type DoorPlacement, type RoomShape } from "./layout";

export type Locale = "en" | "ar";
export const LOCALES: Locale[] = ["en", "ar"];
export type { RoomId, Motif, CategoryCode, OpennessCode, ExhibitPlacement, DoorPlacement, RoomShape };
export type { BenchPlacement } from "./layout";


export interface ProjectText {
  oneLine: string;
  why?: string;
  installation?: string;
  caution?: string;
}

export interface Project {
  slug: string;
  title: string;
  catalogName: string;
  roomId: RoomId;
  category: CategoryCode;
  openness: OpennessCode;
  site: string;
  source: string;
  openingOrder?: number;
  motif?: Motif;
  /** Extra search words (aliases, synonyms) in any language. */
  aliases: string[];
  /** Shown with a Coming Soon placard. */
  comingSoon?: boolean;
  t: Record<Locale, ProjectText>;
}

export interface Room {
  id: RoomId;
  order: number;
  palette: { fog: string; wall: string; floor: string; accent: string; trim: string };
  map: { x: number; y: number };
  t: Record<Locale, { title: string; subtitle: string }>;
}

export interface GalleryContent {
  revision: string;
  source: "convex" | "bundled";
  rooms: Room[];
  projects: Project[];
  exhibits: ExhibitPlacement[];
  doors: DoorPlacement[];
  shapes: RoomShape[];
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\+\+/g, "pp")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const CONTENT_REVISION = "2026-11-09.2";

/** Every catalogued project, including those not currently on display. */
export function allProjects(): Project[] {
  return [...RAW_PROJECTS, ...NEW_PROJECTS].map((r) => {
    const slug = r.slug ?? slugify(r.title);
    const extra = OPENING[slug];
    const catalogName = r.catalogName ?? r.title;
    return {
      slug,
      title: r.title,
      catalogName,
      roomId: curatedRoom(catalogName) ?? ROOM_OVERRIDES[slug] ?? CATEGORY_ROOM[r.cat],
      aliases: ALIASES[catalogName] ?? [],
      comingSoon: r.comingSoon,
      category: r.cat,
      openness: r.open,
      site: r.site,
      source: r.source,
      openingOrder: r.order,
      motif: extra?.motif ?? EXTRA_MOTIFS[slug],
      t: {
        en: { oneLine: r.en, why: extra?.why.en, installation: extra?.installation.en, caution: r.cautionEn },
        ar: { oneLine: r.ar, why: extra?.why.ar, installation: extra?.installation.ar, caution: r.cautionAr },
      },
    };
  });
}

/** True when the project is currently on display (see content/visible.ts). */
export function projectShown(p: Project) {
  return isShown(p.catalogName, p.title);
}

/** Assemble the catalogue of projects on display (also what Convex publishes). */
export function buildBundledContent(): GalleryContent {
  const projects = allProjects().filter(projectShown);
  const rooms: Room[] = RAW_ROOMS.map((r) => ({
    id: r.id, order: r.order, palette: r.palette, map: r.map, t: { en: r.en, ar: r.ar },
  }));
  const { exhibits, doors, shapes } = layoutGallery(rooms, projects);
  return { revision: CONTENT_REVISION, source: "bundled", rooms, projects, exhibits, doors, shapes };
}

export const OPENNESS_TEXT: Record<OpennessCode, Record<Locale, { label: string; explain: string }>> = {
  oss: {
    en: { label: "Open-source software", explain: "Anyone can read, change and share the code." },
    ar: { label: "برمجيات مفتوحة المصدر", explain: "أي شخص يستطيع قراءة الشيفرة وتعديلها ومشاركتها." },
  },
  fullyOpenModel: {
    en: { label: "Fully open AI model", explain: "The model, the code that trained it and the recipe for its data are all published." },
    ar: { label: "نموذج ذكاء اصطناعي مفتوح بالكامل", explain: "النموذج وشيفرة تدريبه ووصفة بياناته كلها منشورة." },
  },
  openWeights: {
    en: { label: "Open-weight model", explain: "You can download and run the trained model, but not everything used to make it is public." },
    ar: { label: "نموذج بأوزان مفتوحة", explain: "يمكنك تنزيل النموذج المدرَّب وتشغيله، لكن ليس كل ما استُخدم لصنعه منشورًا." },
  },
  openCore: {
    en: { label: "Partly open", explain: "Some important parts are open source, and some are not." },
    ar: { label: "مفتوح جزئيًا", explain: "بعض الأجزاء المهمة مفتوحة المصدر وبعضها ليس كذلك." },
  },
  planned: {
    en: { label: "Not open source yet", explain: "The makers plan to open the source code in the future. Today it is not open source." },
    ar: { label: "ليس مفتوح المصدر بعد", explain: "يخطط صانعوه لفتح الشيفرة المصدرية مستقبلًا. اليوم ليس مفتوح المصدر." },
  },
  unverified: {
    en: { label: "Being verified", explain: "We are still confirming exactly which project this is and how it is licensed." },
    ar: { label: "قيد التحقق", explain: "ما زلنا نتأكد من هوية المشروع بالضبط ومن ترخيصه." },
  },
  openStandard: {
    en: { label: "Open standard", explain: "A shared, published specification anyone can build on. It is not a program itself." },
    ar: { label: "معيار مفتوح", explain: "مواصفات منشورة يستطيع أي أحد البناء عليها. ليست برنامجًا بحد ذاتها." },
  },
};
