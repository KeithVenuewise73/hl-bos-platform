/**
 * Prospect-list importer: an HLD outreach spreadsheet -> normalized shop rows.
 *
 * Reads the workbook's own header names rather than fixed column positions, so
 * a reordered or extended sheet still imports. Every row carries its source
 * file and 1-based sheet row, because an audit whose subject cannot be traced
 * back to a source row is an audit of something nobody can verify.
 *
 * By default it only EMITS rows, so a spreadsheet can be checked before it
 * touches anything. With `--import` it writes them, through `import_shop()`
 * acting as the tenant owner -- the same permission-checked path the app uses.
 * It never scores anything: the runner is the only thing that does that.
 *
 *   node --experimental-strip-types scripts/import-prospects.mts <file.xlsx>
 *   node --experimental-strip-types scripts/import-prospects.mts <file.xlsx> --import
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  asOwner,
  lit,
  loadContext,
  runnerFromEnv,
  type SqlRunner,
} from "./lib/hlbos-sql.mts";

export interface ProspectRow {
  business_name: string;
  address_line1: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  phone: string | null;
  /** A URL when the cell holds one, else null. */
  website_url: string | null;
  /** The raw cell text when it is a research note rather than a URL. */
  web_presence_note: string | null;
  priority: string | null;
  prospect_type: string | null;
  opportunity_notes: string | null;
  source_file: string;
  source_row: number;
}

/** Header aliases, so the sheet can be renamed without breaking the import. */
const FIELDS: Record<keyof Omit<ProspectRow, "source_file" | "source_row">, RegExp> = {
  business_name: /^(shop\s*name|business\s*name|name)$/i,
  address_line1: /^(address|street|address\s*1)$/i,
  locality: /^(city|town|locality)$/i,
  region: /^(state|region|province)$/i,
  postal_code: /^(zip|zip\s*code|postal\s*code|postcode)$/i,
  phone: /^(phone|telephone|phone\s*number)$/i,
  website_url: /^(website|web\s*presence|website\s*\/\s*web\s*presence|url)$/i,
  web_presence_note: /^$/, // derived from the same cell as website_url
  priority: /^(hld\s*priority|priority)$/i,
  prospect_type: /^(prospect\s*type|type)$/i,
  opportunity_notes: /^(opportunity\s*notes|notes|opportunity)$/i,
};

const clean = (v: unknown): string | null => {
  // Cells arrive from the sheet reader already coerced to string-or-null, but
  // the parameter is `unknown`, so narrow rather than stringify blindly: an
  // object reaching String() would silently become "[object Object]".
  if (v === null || v === undefined) return null;
  const s = (typeof v === "string" ? v : JSON.stringify(v)).trim();
  const lower = s.toLowerCase();
  return s === "" || lower === "none" || lower === "null" ? null : s;
};

/**
 * Read the sheet via Python's openpyxl. Deliberately NOT a new npm dependency:
 * CONTRIBUTING requires a package to earn its place, and a one-off spreadsheet
 * read for an import script does not justify adding one to the workspace.
 */
function readSheet(file: string): { headers: string[]; rows: unknown[][] } {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb[wb.sheetnames[0]]
rows = [list(r) for r in ws.iter_rows(values_only=True)]
hdr = [str(h).strip() if h is not None else "" for h in rows[0]]
body = [[None if c is None else str(c) for c in r] for r in rows[1:]]
json.dump({"headers": hdr, "rows": body}, sys.stdout)
`;
  const out = execFileSync("python3", ["-c", py, file], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(out.toString()) as {
    headers?: unknown;
    rows?: unknown;
  };
  if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
    throw new Error("sheet reader returned an unexpected shape");
  }
  return {
    headers: parsed.headers.map((h) => (typeof h === "string" ? h : "")),
    rows: parsed.rows as unknown[][],
  };
}

export function toProspectRows(
  headers: string[],
  rows: unknown[][],
  sourceFile: string,
): ProspectRow[] {
  const idx: Partial<Record<keyof ProspectRow, number>> = {};
  headers.forEach((h, i) => {
    for (const [field, re] of Object.entries(FIELDS)) {
      if (re.source !== "^$" && re.test(h)) {
        idx[field as keyof ProspectRow] ??= i;
      }
    }
  });
  if (idx.business_name === undefined) {
    throw new Error(
      `no business-name column found; headers were: ${headers.join(", ")}`,
    );
  }

  const at = (r: unknown[], f: keyof ProspectRow): string | null => {
    const i = idx[f];
    return i === undefined ? null : clean(r[i]);
  };

  const out: ProspectRow[] = [];
  rows.forEach((r, i) => {
    const name = at(r, "business_name");
    if (!name) return; // blank spacer row
    const web = at(r, "website_url");
    const isUrl = web !== null && /^https?:\/\//i.test(web);
    out.push({
      business_name: name,
      address_line1: at(r, "address_line1"),
      locality: at(r, "locality"),
      region: at(r, "region"),
      postal_code: at(r, "postal_code"),
      phone: at(r, "phone"),
      website_url: isUrl ? web : null,
      // The cell text is kept whenever it is NOT a URL: it distinguishes
      // "nothing found" from "bookable on a platform it does not own".
      web_presence_note: isUrl ? null : web,
      priority: at(r, "priority"),
      prospect_type: at(r, "prospect_type"),
      opportunity_notes: at(r, "opportunity_notes"),
      source_file: sourceFile.split("/").pop() ?? sourceFile,
      source_row: i + 2, // +1 for the header, +1 for 1-based sheet rows
    });
  });
  return out;
}

/**
 * Write the parsed rows into HL-BOS Core.
 *
 * One statement, acting as the tenant owner, calling `import_shop()` per row --
 * the same permission-checked path the app uses. Idempotent: `import_shop`
 * dedupes on the shop's normalized name and postcode, so re-importing a
 * corrected spreadsheet updates rather than duplicating.
 *
 * A cell that is NOT a URL never becomes a website_url. It stays a research
 * note, because it is not a website.
 */
export function importSql(
  ownerId: string,
  tenantId: string,
  rows: readonly ProspectRow[],
): string {
  const payload = JSON.stringify(
    rows.map((r) => ({
      business_name: r.business_name,
      address_line1: r.address_line1,
      locality: r.locality,
      region: r.region,
      postal_code: r.postal_code,
      phone: r.phone,
      website_url: r.website_url,
      source_file: r.source_file,
      source_row: r.source_row,
    })),
  );
  return asOwner(
    ownerId,
    `declare v_rows jsonb := ${lit(payload)}::jsonb; r jsonb;
     begin
       for r in select * from jsonb_array_elements(v_rows) loop
         perform transform_audit.import_shop(${lit(tenantId)}::uuid, r);
       end loop;
     end;`,
  );
}

export async function importRows(
  run: SqlRunner,
  rows: readonly ProspectRow[],
  tenantSlug: string,
  campaignKey: string,
): Promise<number> {
  const ctx = await loadContext(run, tenantSlug, campaignKey);
  await run(importSql(ctx.ownerId, ctx.tenantId, rows));
  return rows.length;
}

const invokedAs = process.argv[1] ?? "";
if (invokedAs.endsWith("import-prospects.mts")) {
  const arg = (name: string): string | null => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : (process.argv[i + 1] ?? null);
  };
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error(
      "usage: import-prospects.mts <file.xlsx> [--json out.json] [--import]",
    );
    process.exit(1);
  }
  readFileSync(file); // fail early and clearly if it is not readable
  const { headers, rows } = readSheet(file);
  const parsed = toProspectRows(headers, rows, file);
  const withUrl = parsed.filter((p) => p.website_url).length;
  const withNote = parsed.filter((p) => !p.website_url && p.web_presence_note).length;
  console.error(
    `${parsed.length} shops: ${withUrl} with a URL, ${withNote} with a web-presence note, ` +
      `${parsed.length - withUrl - withNote} with neither`,
  );

  const writing = process.argv.includes("--import");
  if (writing) {
    const conn = runnerFromEnv();
    if (!conn.ok) {
      console.error(conn.reason);
      process.exit(1);
    }
    const n = await importRows(
      conn.run,
      parsed,
      arg("tenant") ?? "herman-legacy-digital",
      arg("campaign") ?? "wny_barbers_50",
    );
    console.error(`imported ${n} shops into HL-BOS Core`);
  }

  const target = arg("json");
  if (target) {
    writeFileSync(target, JSON.stringify(parsed, null, 1));
    console.error(`wrote ${target}`);
  } else if (!writing) {
    console.log(JSON.stringify(parsed, null, 1));
  }
}
