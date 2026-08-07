import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndustryPageView } from "@/components/industries/IndustryPageView";
import { INDUSTRY_SLUGS, industryBySlug } from "@/lib/industries";

// One route for every approved industry slug from the Website IA §1.
// generateStaticParams enumerates exactly the approved five; any other slug
// renders the honest 404.
export function generateStaticParams(): { slug: string }[] {
  return INDUSTRY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const industry = industryBySlug(slug);
  if (!industry) return {};
  return { title: industry.seoTitle, description: industry.seoDescription };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = industryBySlug(slug);
  if (!industry) notFound();
  return <IndustryPageView industry={industry} />;
}
