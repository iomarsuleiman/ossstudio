import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GalleryApp from "@/components/GalleryApp";
import { getContent } from "@/lib/content";
import { buildBundledContent, LOCALES, type RoomId } from "@/content";
import { isLocale } from "@/lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  const { rooms } = buildBundledContent();
  return LOCALES.flatMap((locale) => rooms.filter((r) => r.id !== "main").map((r) => ({ locale, room: r.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; room: string }> }): Promise<Metadata> {
  const { locale, room } = await params;
  const content = await getContent();
  const r = content.rooms.find((x) => x.id === room);
  if (!r || !isLocale(locale)) return {};
  return { title: r.t[locale].title, description: r.t[locale].subtitle };
}

export default async function RoomPage({ params }: { params: Promise<{ locale: string; room: string }> }) {
  const { locale, room } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  if (!content.rooms.some((r) => r.id === room)) notFound();
  return <GalleryApp key={`${locale}:room`} content={content} locale={locale} initial={{ roomId: room as RoomId }} />;
}
