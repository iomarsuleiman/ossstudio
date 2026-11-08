// Projects currently on display. Everything else stays in the catalogue
// (and in Convex as a draft) but is hidden from the gallery, map, search
// and list until added here.
const SHOWN = [
  "7-Zip", "AlterSend", "Anki", "Apache HTTP Server", "AppFlowy", "Arch Linux", "Ardour", "Arduino",
  "ArtCraft Crafting Apps Suite", "Asyar", "Audacity", "Bitwarden", "Blender", "Calibre", "chaos.fail",
  "Chris Titus Tech WinUtil", "Chromium", "Code - OSS (VS Code)", "Convex", "Coolify", "Debian",
  "Docker Engine (Moby)", "draw.io / diagrams.net", "ERPNext", "Excalidraw", "Fedora Linux", "FFmpeg",
  "FileFlight", "Firefox", "Ghostty", "GIMP", "Git", "Godot", "HandBrake", "Handy", "Helium Browser",
  "Immich", "Inkscape", "Input Leap", "Jellyfin", "Joplin", "KDE Connect", "Kdenlive", "KeePassXC", "Kodi",
  "Krita", "LibreOffice", "Linux kernel", "Linux Mint", "LMMS", "LocalSend", "Logseq", "Lutris", "Manim",
  "mpv", "Neovim", "Nextcloud", "Notepad++", "OBS Studio", "ONLYOFFICE", "OpenBoard", "OpenCode",
  "OpenWhispr", "Paperless-ngx", "Phi Browser (open client)", "Pi-hole", "Plane", "PostgreSQL",
  "Proton (Valve)", "Proxmox VE", "RetroArch", "RISC-V architecture", "Rufus", "RustDesk", "Scratch",
  "SearXNG", "SQLite", "Stirling PDF", "Stockfish", "Syncthing", "T3 Code", "Thunderbird",
  "TrueNAS Community Edition", "Ubuntu", "Vicinae", "VLC", "VSCodium", "Wareed", "whisper.cpp", "Wox",
  "Zed", "Zen Browser", "Zotero",
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const SHOWN_SET = new Set(SHOWN.map(norm));

/** True if a project (by catalogue name, display title, or the name before brackets) is on display. */
export function isShown(catalogName: string, title: string) {
  const short = catalogName.replace(/\s*\(.*\)\s*$/, "");
  return SHOWN_SET.has(norm(catalogName)) || SHOWN_SET.has(norm(title)) || SHOWN_SET.has(norm(short));
}

export const SHOWN_NAMES = SHOWN;
