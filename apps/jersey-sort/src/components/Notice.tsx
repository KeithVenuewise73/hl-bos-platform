/** The one place a page shows the result of the last thing you did. */
export function Notice({
  error,
  notice,
}: {
  error?: string | undefined;
  notice?: string | undefined;
}) {
  if (error) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-md border border-low/50 bg-low/10 px-3 py-2 text-sm text-red-200"
      >
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="mb-4 rounded-md border border-high/40 bg-high/10 px-3 py-2 text-sm text-green-200">
        {notice}
      </p>
    );
  }
  return null;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
