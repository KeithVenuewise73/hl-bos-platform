// Structured-output validation for the AI gateway (Stage A V0).
//
// When a caller asks the gateway for JSON (request `expectJson: true`), the
// provider's text is validated here BEFORE the run is marked succeeded. Invalid
// or incomplete JSON is a failed run — never a fabricated success (Principle
// 10). This keeps "the model returned something parseable and shaped as asked"
// an enforced fact, not a hope.

export class StructuredOutputError extends Error {
  constructor(message: string) {
    super(`structured_output_invalid:${message}`);
    this.name = "StructuredOutputError";
  }
}

export interface StructuredOptions {
  /** Keys that must be present at the top level of the parsed object. */
  requiredKeys?: string[];
}

/**
 * Parse `text` as JSON and (optionally) assert required top-level keys.
 * Throws StructuredOutputError on any failure. Returns the parsed value.
 */
export function validateStructuredOutput(
  text: string,
  opts: StructuredOptions = {},
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StructuredOutputError("not_json");
  }
  const req = opts.requiredKeys ?? [];
  if (req.length > 0) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new StructuredOutputError("not_an_object");
    }
    const obj = parsed as Record<string, unknown>;
    for (const key of req) {
      if (!(key in obj)) {
        throw new StructuredOutputError(`missing_key:${key}`);
      }
    }
  }
  return parsed;
}
