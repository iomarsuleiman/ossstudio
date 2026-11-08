import { notFound } from "next/navigation";
import GalleryApp from "@/components/GalleryApp";
import { getContent } from "@/lib/content";
import { isLocale } from "@/lib/i18n";

export const revalidate = 300;

export default async function GalleryPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<{ at?: string }> }) {
  const { locale } = await params;
  const { at } = await searchParams;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  return <GalleryApp key={`${locale}:main`} content={content} locale={locale} initial={{ roomId: "main", at }} />;
}
