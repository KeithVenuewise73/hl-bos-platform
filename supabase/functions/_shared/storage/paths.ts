// Storage path + upload safety helpers (Checkpoint 3).
//
// Edge/app pre-flight that mirrors the in-DB guarantees of
// storage_meta.register_upload / storage_meta.assert_safe. The DATABASE is the
// authority (these checks are also enforced there); this is a fast client-side
// gate so a signed upload URL is never requested for an unsafe or cross-tenant
// object. Keep the two in sync.

const MAX_BYTES = 52428800; // 50 MiB — matches supabase/config.toml + the DB CHECK
const DANGEROUS_EXT = new Set([
  "exe",
  "sh",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "scr",
  "jar",
  "app",
  "deb",
  "rpm",
  "bin",
  "ps1",
  "vbs",
]);

export class UnsafeUploadError extends Error {
  constructor(reason: string) {
    super(`unsafe_upload:${reason}`);
    this.name = "UnsafeUploadError";
  }
}

/** Force an object path under the caller's tenant prefix, stripping traversal. */
export function normalizeObjectPath(tenantId: string, objectPath: string): string {
  let p = objectPath.replace(/\.\./g, ""); // strip traversal
  p = p.replace(/^\/+/, ""); // strip leading slashes
  if (!p.startsWith(`${tenantId}/`)) p = `${tenantId}/${p}`;
  return p;
}

/** Throw UnsafeUploadError on a dangerous type or oversize file. */
export function assertSafeUpload(
  filename: string,
  mime: string,
  sizeBytes: number,
): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UnsafeUploadError("invalid_size");
  }
  if (sizeBytes > MAX_BYTES) throw new UnsafeUploadError("too_large");
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (DANGEROUS_EXT.has(ext)) throw new UnsafeUploadError(`ext_${ext}`);
  if (
    /^application\/(x-msdownload|x-sh|x-executable|x-msdos-program)$/i.test(mime) ||
    /x-dosexec/i.test(mime)
  ) {
    throw new UnsafeUploadError("executable_mime");
  }
}
