import type { CategoryCode } from "./projects";

export type RoomId =
  | "main"
  | "everyday"
  | "art"
  | "ai"
  | "internet"
  | "files"
  | "media"
  | "behind"
  | "learn";

export interface RawRoom {
  id: RoomId;
  order: number;
  en: { title: string; subtitle: string };
  ar: { title: string; subtitle: string };
  /** Atmosphere colours: fog/sky, wall, floor, accent. */
  palette: { fog: string; wall: string; floor: string; accent: string; trim: string };
  /** Schematic map position (0–100 grid). */
  map: { x: number; y: number };
}

export const RAW_ROOMS: RawRoom[] = [
  {
    id: "main", order: 0,
    en: { title: "The Main Hall", subtitle: "Welcome. Start here, see a few highlights, and pick a door." },
    ar: { title: "القاعة الرئيسية", subtitle: "أهلًا بك. ابدأ من هنا، شاهد بعض الأعمال المميزة، واختر بابًا." },
    palette: { fog: "#efe2cf", wall: "#e6d2bb", floor: "#c9ad92", accent: "#9b4a52", trim: "#7d5a52" },
    map: { x: 50, y: 50 },
  },
  {
    id: "everyday", order: 1,
    en: { title: "Everyday Tools", subtitle: "Helpful programs that make ordinary tasks easier." },
    ar: { title: "أدوات يومية", subtitle: "برامج مفيدة بتسهّل المهام العادية." },
    palette: { fog: "#ece3cc", wall: "#e2d6b8", floor: "#c4b28c", accent: "#8a9a6e", trim: "#6f6a4f" },
    map: { x: 18, y: 20 },
  },
  {
    id: "art", order: 2,
    en: { title: "Art & Design", subtitle: "Create your next picture, song, video or game." },
    ar: { title: "الفن والتصميم", subtitle: "اصنع رسمتك أو أغنيتك أو فيديوك أو لعبتك الجاية." },
    palette: { fog: "#f0dcd2", wall: "#e8c9bd", floor: "#c99f8e", accent: "#b25d63", trim: "#7f4a4c" },
    map: { x: 50, y: 12 },
  },
  {
    id: "ai", order: 3,
    en: { title: "AI", subtitle: "Tools and models that work with language, sound, pictures and code." },
    ar: { title: "الذكاء الاصطناعي", subtitle: "أدوات ونماذج بتتعامل مع اللغة والصوت والصور والكود." },
    palette: { fog: "#e4e1d6", wall: "#d6d3c4", floor: "#aaa58f", accent: "#6f8a86", trim: "#4f5f5c" },
    map: { x: 82, y: 20 },
  },
  {
    id: "internet", order: 4,
    en: { title: "The Internet & Privacy", subtitle: "Browsers, search engines, privacy and safer browsing." },
    ar: { title: "الإنترنت والخصوصية", subtitle: "متصفحات ومحركات بحث وخصوصية وتصفح أأمن." },
    palette: { fog: "#e6dcd8", wall: "#d9c8c3", floor: "#ae958c", accent: "#7c5a6e", trim: "#5b4250" },
    map: { x: 88, y: 50 },
  },
  {
    id: "files", order: 5,
    en: { title: "Files & Storage", subtitle: "Keep your photos, files and backups in your hands." },
    ar: { title: "الملفات والتخزين", subtitle: "خلّي صورك وملفاتك ونسخك الاحتياطية تحت سيطرتك." },
    palette: { fog: "#e9e2d2", wall: "#dcd2bc", floor: "#b8a688", accent: "#a07b4f", trim: "#6e5a3e" },
    map: { x: 82, y: 80 },
  },
  {
    id: "media", order: 6,
    en: { title: "Movies, Music & Games", subtitle: "Watching, listening, playing and enjoying media." },
    ar: { title: "الأفلام والموسيقى والألعاب", subtitle: "مشاهدة واستماع ولعب واستمتاع." },
    palette: { fog: "#eddad5", wall: "#dfc4be", floor: "#b8948c", accent: "#8d3f4b", trim: "#5f2f37" },
    map: { x: 50, y: 88 },
  },
  {
    id: "behind", order: 7,
    en: { title: "Behind the Scenes", subtitle: "The technology making the internet and your devices work." },
    ar: { title: "خلف الكواليس", subtitle: "التكنولوجيا اللي بتشغّل الإنترنت وأجهزتك." },
    palette: { fog: "#e1ddd6", wall: "#cfc8bf", floor: "#9f958a", accent: "#6a6f7e", trim: "#44474f" },
    map: { x: 18, y: 80 },
  },
  {
    id: "learn", order: 8,
    en: { title: "Learn & Discover", subtitle: "Tools for studying, reading, writing and exploring new ideas." },
    ar: { title: "التعلّم والاكتشاف", subtitle: "أدوات للمذاكرة والقراءة والكتابة واستكشاف أفكار جديدة." },
    palette: { fog: "#ece4d3", wall: "#e0d4bc", floor: "#bda98a", accent: "#7f8f5c", trim: "#5c6440" },
    map: { x: 12, y: 50 },
  },
];

export const CATEGORY_ROOM: Record<CategoryCode, RoomId> = {
  EU: "everyday",
  PS: "internet",
  CT: "art",
  ME: "media",
  PL: "learn",
  AT: "ai",
  AM: "ai",
  DI: "behind",
  SH: "files",
};

/** Placement decisions from the plan that differ from the catalogue category. */
export const ROOM_OVERRIDES: Record<string, RoomId> = {
  stockfish: "media",
  syncthing: "files",
  proton: "media",
  rclone: "files",
  cryptomator: "files",
  "paperless-ngx": "files",
  "home-assistant": "everyday",
  frigate: "everyday",
  ntfy: "behind",
  "uptime-kuma": "behind",
  forgejo: "behind",
};

/** Main Hall highlights: these link to the real exhibits elsewhere. */
export const MAIN_HALL_HIGHLIGHTS = ["stockfish", "handy", "localsend", "blender"];

/** Projects shown in the visually distinct "physical inventions" alcove. */
export const PHYSICAL_INVENTIONS = ["arduino", "risc-v"];
