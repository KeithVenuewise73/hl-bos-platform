import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicePageView } from "@/components/services/ServicePageView";
import { SERVICE_SLUGS, serviceBySlug } from "@/lib/services";

// One route for every approved service slug from the Website IA. generateStaticParams
// enumerates exactly the approved set; any other slug renders the honest 404.
export function generateStaticParams(): { slug: string }[] {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) return {};
  return { title: service.seoTitle, description: service.seoDescription };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return <ServicePageView service={service} />;
}
