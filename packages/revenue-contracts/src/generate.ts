// Regenerates the committed JSON Schema and CSV template from the zod source of truth.
// Run: pnpm --filter @hl-bos/revenue-contracts generate
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { importReportV1 } from "./import-v1.ts";
import { templateCsv } from "./csv.ts";

const schema = z.toJSONSchema(importReportV1, { target: "draft-2020-12", io: "input" });
writeFileSync(
  new URL("../schemas/prospect-import.v1.schema.json", import.meta.url),
  JSON.stringify(schema, null, 2) + "\n",
);
writeFileSync(
  new URL("../templates/prospect-import.v1.template.csv", import.meta.url),
  templateCsv(),
);
console.log(
  "wrote schemas/prospect-import.v1.schema.json and templates/prospect-import.v1.template.csv",
);
