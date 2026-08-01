import { ContentPage } from "@/components/ui";
import { PAGES } from "@/lib/content";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return <ContentPage copy={PAGES["about"]!} />;
}
