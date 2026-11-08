import type { Metadata, Viewport } from "next";
import { Cairo, Cormorant_Garamond } from "next/font/google";
import { notFound } from "next/navigation";
import { LOCALES } from "@/content";
import { UI, dirOf, isLocale } from "@/lib/i18n";
import "../globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display", display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ui = UI[isLocale(locale) ? locale : "en"];
  return {
    title: { default: ui.siteTitle, template: `%s · ${ui.siteTitle}` },
    description: ui.tagline,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    icons: { icon: "/icon.svg" },
    alternates: { languages: { en: "/en", ar: "/ar" } },
    openGraph: { title: ui.siteTitle, description: ui.tagline, type: "website" },
  };
}

export const viewport: Viewport = { themeColor: "#efe2cf", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${cairo.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
