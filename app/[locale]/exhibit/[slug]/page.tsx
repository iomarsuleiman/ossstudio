import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GalleryApp from "@/components/GalleryApp";
import { getContent } from "@/lib/content";
import { isLocale } from "@/lib/i18n";

export const revalidate = 300;

// 332 exhibit pages are rendered on first visit and then cached (ISR),
// rather than all being pre-built.
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await getContent();
  const p = content.projects.find((x) => x.slug === slug);
  if (!p || !isLocale(locale)) return {};
  return {
    title: p.title,
    description: p.t[locale]?.oneLine,
    alternates: { languages: { en: `/en/exhibit/${slug}`, ar: `/ar/exhibit/${slug}` } },
  };
}

export default async function ExhibitPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  if (!content.projects.some((p) => p.slug === slug)) notFound();
  return <GalleryApp key={`${locale}:exhibit:${slug}`} content={content} locale={locale} initial={{ exhibit: slug }} />;
}
