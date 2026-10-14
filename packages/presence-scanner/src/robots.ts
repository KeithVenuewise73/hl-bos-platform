// robots.txt: the scanner asks before it looks. Only the homepage ("/") is ever
// fetched, so the only question is whether "/" is disallowed for us or for
// every crawler. Longest matching rule wins; Allow wins a tie (RFC 9309).

export const SCANNER_USER_AGENT = "HLG-PresenceScanner/0.1";
const TOKEN = "hlg-presencescanner";

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

function parseGroups(body: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | undefined;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = (m[1] ?? "").toLowerCase();
    const value = (m[2] ?? "").trim();
    if (field === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && cur) {
      // An empty Disallow means "allow everything" -- it adds no rule.
      if (value !== "") cur.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = rulePath
    .replace(/\$$/, "")
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Is fetching `path` allowed for this scanner under this robots.txt? */
export function robotsAllows(
  body: string,
  path = "/",
): { allowed: boolean; rule: string | undefined } {
  const groups = parseGroups(body);
  const ours = groups.filter((g) => g.agents.some((a) => a.split("/")[0] === TOKEN));
  const applicable =
    ours.length > 0 ? ours : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; path: string } | undefined;
  for (const g of applicable)
    for (const r of g.rules) {
      if (!matches(r.path, path)) continue;
      if (
        !best ||
        r.path.length > best.path.length ||
        (r.path.length === best.path.length && r.allow)
      )
        best = r;
    }
  if (!best || best.allow)
    return { allowed: true, rule: best ? `Allow: ${best.path}` : undefined };
  return { allowed: false, rule: `Disallow: ${best.path}` };
}
