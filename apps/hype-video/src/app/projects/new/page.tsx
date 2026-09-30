import { TEMPLATE_KEYS, findTemplate, type TemplateKey } from "@hl-bos/hype-video";

import { CreateProjectForm } from "@/components/CreateProjectForm.tsx";
import { param } from "@/lib/load.ts";

export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = param((await searchParams)["template"]) ?? "";
  const template: TemplateKey = (TEMPLATE_KEYS as readonly string[]).includes(requested)
    ? (requested as TemplateKey)
    : "game_day";
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="kicker">New project</div>
      <h1>Create a hype project</h1>
      <p className="lede">
        {findTemplate(template)?.tagline} You can change the style later.
      </p>
      <section className="card">
        <CreateProjectForm initialTemplate={template} />
      </section>
    </div>
  );
}
