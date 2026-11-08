import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content";
import { UI, isLocale } from "@/lib/i18n";
import { IndexList } from "@/components/IndexList";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ui = UI[isLocale(locale) ? locale : "en"];
  return { title: ui.indexTitle, description: ui.indexIntro };
}

export default async function IndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  return <IndexList content={content} locale={locale} />;
}
