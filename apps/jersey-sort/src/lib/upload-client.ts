/**
 * Send photos to an event, a few at a time in parallel: the one upload path,
 * used by the event page's uploader and by Check a folder's import.
 *
 * The server COPIES each file into JerseySort's own storage, byte for byte,
 * and refuses a file it already has (same SHA-256), naming the first copy.
 * Nothing here can touch the file on the person's computer: a browser hands
 * the page a read-only File.
 */

export interface UploadResult {
  name: string;
  ok: boolean;
  reason?: string;
  status?: string;
  dateSource?: "exif" | "upload";
}

export const PER_REQUEST = 3;
export const PARALLEL = 3;

/** The server's refusal of a file it already has. */
export function isDuplicate(r: UploadResult): boolean {
  return !r.ok && (r.reason ?? "").startsWith("Already uploaded");
}

export async function uploadPhotos(
  eventId: string,
  photos: readonly File[],
  onProgress: (batch: UploadResult[], sent: number) => void,
): Promise<UploadResult[]> {
  const batches: File[][] = [];
  for (let i = 0; i < photos.length; i += PER_REQUEST)
    batches.push(photos.slice(i, i + PER_REQUEST));
  const all: UploadResult[] = [];
  let next = 0;
  let sent = 0;
  const worker = async () => {
    for (;;) {
      const batch = batches[next++];
      if (batch === undefined) return;
      const body = new FormData();
      for (const f of batch) body.append("file", f, f.name);
      let out: UploadResult[];
      try {
        const res = await fetch(`/api/events/${eventId}/photos`, {
          method: "POST",
          body,
        });
        const json = (await res.json()) as { results?: UploadResult[]; error?: string };
        out =
          json.results ??
          batch.map((f) => ({
            name: f.name,
            ok: false,
            reason: json.error ?? "Upload failed.",
          }));
      } catch {
        out = batch.map((f) => ({
          name: f.name,
          ok: false,
          reason: "The connection dropped. Try these again.",
        }));
      }
      all.push(...out);
      sent += batch.length;
      onProgress(out, sent);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return all;
}
